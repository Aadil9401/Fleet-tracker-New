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
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale

/** Standard service interval for the whole fleet. */
const val SERVICE_INTERVAL_KM = 15000L

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

    /**
     * Matches each employee's signed-up vehicle registration against the fleet and
     * assigns the vehicle where it matches. Once assigned, the employee's clock-in
     * screen picks up that vehicle's odometer reading automatically.
     *
     * Comparison ignores case, spaces and dashes, so "CA 123-456" typed at sign-up
     * still matches "CA123456" from the upload.
     */
    fun autoAssignVehiclesByRegistration() {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                val vehicles = repo.listVehicles()
                val employees = repo.listEmployees()
                val byRegistration = vehicles.associateBy { normaliseRegistration(it.registrationNumber) }

                val assignments = mutableMapOf<String, String>()
                val unmatched = mutableListOf<String>()
                var alreadyCorrect = 0

                employees.forEach { employee ->
                    val registration = normaliseRegistration(employee.vehicleRegistration)
                    if (registration.isBlank()) return@forEach
                    val match = byRegistration[registration]
                    when {
                        match == null -> unmatched += "${employee.fullName} (${employee.vehicleRegistration})"
                        match.id == employee.assignedVehicleId -> alreadyCorrect++
                        else -> assignments[employee.uid] = match.id
                    }
                }

                repo.assignVehicles(assignments)

                val report = buildString {
                    append("Assigned ${assignments.size} employee(s).")
                    if (alreadyCorrect > 0) append(" $alreadyCorrect already correct.")
                    if (unmatched.isNotEmpty()) {
                        append(" No matching vehicle for: ${unmatched.joinToString("; ")}.")
                    }
                }

                uiState = uiState.copy(
                    busy = false,
                    employees = repo.listEmployees(),
                    vehicles = vehicles,
                    message = report
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Auto-assign failed: ${e.message}")
            }
        }
    }

    private fun normaliseRegistration(value: String): String =
        value.uppercase().filter { it.isLetterOrDigit() }

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
     * Bulk-adds vehicles from pasted text — one per line:
     * `registration, name, current odometer, last service date, last service odometer`.
     *
     * Only the registration is required. Separators can be commas OR tabs, so
     * copying cells straight out of Excel works as well as a saved CSV. A header
     * row is detected and skipped. Every vehicle gets the standard 15 000 km
     * service interval, and months is set to 0 so reminders are judged on
     * kilometres alone.
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
                val first = line.split(',', '\t').first().trim().lowercase()
                first.startsWith("registration") || first == "reg"
            }
            .mapNotNull { line ->
                val parts = line.split(',', '\t').map { it.trim() }
                val registration = parts.getOrNull(0)?.uppercase().orEmpty()
                if (registration.isBlank()) return@mapNotNull null

                val odometer = parts.getOrNull(2).digitsToLongOrNull() ?: 0L
                val lastServiceDate = parseServiceDate(parts.getOrNull(3))
                // Falling back to the current reading means "no distance travelled
                // since the last service" rather than a bogus 0 km baseline, which
                // would otherwise show the vehicle as instantly overdue.
                val lastServiceOdometer = parts.getOrNull(4).digitsToLongOrNull() ?: odometer

                Vehicle(
                    registrationNumber = registration,
                    name = parts.getOrNull(1).orEmpty().ifBlank { registration },
                    currentOdometerKm = odometer,
                    lastServiceOdometerKm = lastServiceOdometer,
                    lastServiceDateMillis = lastServiceDate,
                    serviceIntervalKm = SERVICE_INTERVAL_KM,
                    // 0 = judge by kilometres only, as agreed.
                    serviceIntervalMonths = 0L
                )
            }

    private fun String?.digitsToLongOrNull(): Long? =
        this?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }?.toLongOrNull()

    /** Accepts `yyyy-MM-dd` or `dd/MM/yyyy`. Returns 0 if blank or unrecognised. */
    private fun parseServiceDate(value: String?): Long {
        val raw = value?.trim().orEmpty()
        if (raw.isBlank()) return 0L
        for (pattern in listOf("yyyy-MM-dd", "dd/MM/yyyy", "yyyy/MM/dd", "dd-MM-yyyy")) {
            try {
                val format = SimpleDateFormat(pattern, Locale.US).apply { isLenient = false }
                return format.parse(raw)?.time ?: continue
            } catch (e: ParseException) {
                // Try the next pattern.
            }
        }
        return 0L
    }

    fun deleteVehicle(vehicleId: String) {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.deleteVehicle(vehicleId)
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = "Vehicle deleted."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not delete: ${e.message}")
            }
        }
    }

    fun deleteAllVehicles() {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                val removed = repo.deleteAllVehicles()
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = "Deleted $removed vehicle(s)."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not delete: ${e.message}")
            }
        }
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
