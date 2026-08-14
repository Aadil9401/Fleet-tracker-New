package co.za.cspc.fleettracker.ui.admin

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import co.za.cspc.fleettracker.data.repository.FleetRepository
import co.za.cspc.fleettracker.data.repository.NewEmployeeCredentials
import kotlinx.coroutines.launch

data class AdminUiState(
    val loading: Boolean = true,
    val employees: List<UserProfile> = emptyList(),
    val vehicles: List<Vehicle> = emptyList(),
    val todaysLogs: List<TimeLog> = emptyList(),
    val recentFuelLogs: List<FuelLog> = emptyList(),
    val settings: AppSettings = AppSettings(),
    val busy: Boolean = false,
    val message: String? = null,
    val lastCreatedCredential: NewEmployeeCredentials? = null
)

class AdminViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(AdminUiState())
        private set

    init {
        refresh()
    }

    fun refresh() {
        uiState = uiState.copy(loading = true)
        viewModelScope.launch {
            // Same reasoning as EmployeeViewModel.load(): an uncaught Firebase error
            // here would crash the dashboard rather than show a message.
            try {
                val employees = repo.listEmployees()
                val vehicles = repo.listVehicles()
                val todaysLogs = repo.listTodaysTimeLogs()
                val fuelLogs = repo.listRecentFuelLogs()
                val settings = repo.getSettings()
                uiState = uiState.copy(
                    loading = false,
                    employees = employees,
                    vehicles = vehicles,
                    todaysLogs = todaysLogs,
                    recentFuelLogs = fuelLogs,
                    settings = settings
                )
            } catch (e: Exception) {
                uiState = uiState.copy(
                    loading = false,
                    message = "Could not load the dashboard: ${e.message}"
                )
            }
        }
    }

    /** Who has NOT started work yet today, among active employees. */
    fun notStartedToday(): List<UserProfile> {
        val startedUids = uiState.todaysLogs.filter { it.hasStarted }.map { it.uid }.toSet()
        return uiState.employees.filter { it.active && it.uid !in startedUids }
    }

    fun addEmployee(
        name: String,
        surname: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        contactEmail: String,
        onDone: (NewEmployeeCredentials) -> Unit
    ) {
        if (name.isBlank() || surname.isBlank() || contactEmail.isBlank()) return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                val credentials = repo.createEmployee(
                    name = name,
                    surname = surname,
                    employeeNumber = employeeNumber,
                    province = province,
                    teamName = teamName,
                    contactEmail = contactEmail
                )
                uiState = uiState.copy(
                    busy = false,
                    lastCreatedCredential = credentials,
                    employees = repo.listEmployees()
                )
                onDone(credentials)
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not create employee: ${e.message}")
            }
        }
    }

    fun setEmployeeActive(uid: String, active: Boolean) {
        viewModelScope.launch {
            repo.setEmployeeActive(uid, active)
            uiState = uiState.copy(employees = repo.listEmployees())
        }
    }

    fun assignVehicle(uid: String, vehicleId: String) {
        viewModelScope.launch {
            repo.assignVehicle(uid, vehicleId)
            uiState = uiState.copy(employees = repo.listEmployees())
        }
    }

    fun addVehicle(name: String, registration: String, odometer: Long, intervalKm: Long, intervalMonths: Long) {
        if (name.isBlank() && registration.isBlank()) return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.addVehicle(
                    Vehicle(
                        name = name,
                        registrationNumber = registration,
                        currentOdometerKm = odometer,
                        lastServiceOdometerKm = odometer,
                        lastServiceDateMillis = System.currentTimeMillis(),
                        serviceIntervalKm = intervalKm,
                        serviceIntervalMonths = intervalMonths
                    )
                )
                uiState = uiState.copy(busy = false, vehicles = repo.listVehicles())
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not add vehicle: ${e.message}")
            }
        }
    }

    /**
     * Bulk-adds vehicles from pasted text — one per line, comma separated:
     * `registration, name, odometer, service interval km, service interval months`.
     * Only the registration is required; anything missing falls back to a default.
     * A header row is detected and skipped, so pasting straight out of a
     * spreadsheet works.
     */
    fun bulkAddVehicles(pastedText: String) {
        val vehicles = parseVehicleLines(pastedText)
        if (vehicles.isEmpty()) {
            uiState = uiState.copy(message = "Nothing to add — check the format and try again.")
            return
        }
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                val added = repo.addVehicles(vehicles)
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = "Added $added vehicle(s)."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Bulk upload failed: ${e.message}")
            }
        }
    }

    private fun parseVehicleLines(text: String): List<Vehicle> =
        text.lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .filterNot { line ->
                // Skip a spreadsheet header row like "Registration, Name, Odometer".
                val first = line.substringBefore(",").trim().lowercase()
                first == "registration" || first == "reg" || first == "registrationnumber" ||
                    first == "registration number"
            }
            .mapNotNull { line ->
                val parts = line.split(",").map { it.trim() }
                val registration = parts.getOrNull(0)?.uppercase().orEmpty()
                if (registration.isBlank()) return@mapNotNull null

                val odometer = parts.getOrNull(2)?.filter { it.isDigit() }?.toLongOrNull() ?: 0L
                Vehicle(
                    registrationNumber = registration,
                    name = parts.getOrNull(1).orEmpty().ifBlank { registration },
                    currentOdometerKm = odometer,
                    // Treat today's reading as the service baseline, same as adding
                    // a vehicle by hand does.
                    lastServiceOdometerKm = odometer,
                    lastServiceDateMillis = System.currentTimeMillis(),
                    serviceIntervalKm = parts.getOrNull(3)?.filter { it.isDigit() }?.toLongOrNull() ?: 10000L,
                    serviceIntervalMonths = parts.getOrNull(4)?.filter { it.isDigit() }?.toLongOrNull() ?: 6L
                )
            }

    fun markServiced(vehicleId: String, odometerKm: Long) {
        viewModelScope.launch {
            repo.markVehicleServiced(vehicleId, odometerKm)
            uiState = uiState.copy(vehicles = repo.listVehicles())
        }
    }

    fun saveSettings(settings: AppSettings) {
        uiState = uiState.copy(busy = true)
        viewModelScope.launch {
            repo.saveSettings(settings)
            uiState = uiState.copy(busy = false, settings = settings, message = "Settings saved")
        }
    }

    fun clearMessage() {
        uiState = uiState.copy(message = null)
    }

    fun clearLastCredential() {
        uiState = uiState.copy(lastCreatedCredential = null)
    }
}
