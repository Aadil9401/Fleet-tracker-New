package co.za.cspc.fleettracker.ui.admin

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.Role
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
    val admins: List<UserProfile> = emptyList(),
    val vehicles: List<Vehicle> = emptyList(),
    /** The day being viewed on the first tab — not necessarily today. */
    val selectedDate: String = FleetRepository.todayString(),
    /** Logs for [selectedDate]. */
    val todaysLogs: List<TimeLog> = emptyList(),
    /** Fuel bought on [selectedDate] — what the day view's fuel figure is made of. */
    val dayFuelLogs: List<FuelLog> = emptyList(),
    val recentTimeLogs: List<TimeLog> = emptyList(),
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
                val admins = repo.listAdmins()
                val vehicles = repo.listVehicles()
                val todaysLogs = repo.listTimeLogsForDate(uiState.selectedDate)
                val dayFuelLogs = repo.listFuelLogsForDate(uiState.selectedDate)
                val recentTimeLogs = repo.listRecentTimeLogs()
                val fuelLogs = repo.listRecentFuelLogs()
                val settings = repo.getSettings()
                uiState = uiState.copy(
                    loading = false,
                    employees = employees,
                    admins = admins,
                    vehicles = vehicles,
                    todaysLogs = todaysLogs,
                    dayFuelLogs = dayFuelLogs,
                    recentTimeLogs = recentTimeLogs,
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

    /** Steps the viewed day backwards or forwards and reloads just that day's logs. */
    fun shiftSelectedDate(days: Int) {
        val next = FleetRepository.shiftDate(uiState.selectedDate, days)
        // Don't let the admin page forward into days that haven't happened.
        if (next > FleetRepository.todayString()) return
        uiState = uiState.copy(selectedDate = next, busy = true, message = null)
        viewModelScope.launch {
            try {
                // Both, or the day view would show one day's hours against another
                // day's fuel.
                uiState = uiState.copy(
                    busy = false,
                    todaysLogs = repo.listTimeLogsForDate(next),
                    dayFuelLogs = repo.listFuelLogsForDate(next)
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not load that day: ${e.message}")
            }
        }
    }

    fun jumpToToday() {
        if (uiState.selectedDate == FleetRepository.todayString()) return
        uiState = uiState.copy(selectedDate = FleetRepository.todayString())
        refresh()
    }

    val viewingToday: Boolean get() = uiState.selectedDate == FleetRepository.todayString()

    /**
     * Who is unaccounted for on the day being viewed. The rule itself lives in
     * [DayBreakdown] so the figure and the list behind it cannot disagree.
     */
    fun notStartedToday(): List<UserProfile> =
        DayBreakdown.notStartedEmployees(uiState.employees, uiState.todaysLogs)

    /** Active employees who marked themselves absent today. */
    fun notWorkingToday(): List<UserProfile> {
        val absentUids = uiState.todaysLogs.filter { it.notWorking }.map { it.uid }.toSet()
        return uiState.employees.filter { it.uid in absentUids }
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

    fun saveEmployeeDetails(
        uid: String,
        name: String,
        surname: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        vehicleRegistration: String,
        contactEmail: String,
        cellNumber: String
    ) {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.updateEmployeeDetails(
                    uid = uid,
                    cellNumber = cellNumber,
                    name = name,
                    surname = surname,
                    employeeNumber = employeeNumber,
                    province = province,
                    teamName = teamName,
                    vehicleRegistration = vehicleRegistration,
                    contactEmail = contactEmail
                )
                uiState = uiState.copy(
                    busy = false,
                    employees = repo.listEmployees(),
                    message = "Employee details updated."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not save: ${e.message}")
            }
        }
    }

    fun saveVehicleDetails(
        vehicleId: String,
        name: String,
        registration: String,
        currentOdometerKm: Long,
        lastServiceOdometerKm: Long,
        serviceIntervalKm: Long
    ) {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.updateVehicle(
                    vehicleId = vehicleId,
                    name = name,
                    registrationNumber = registration,
                    currentOdometerKm = currentOdometerKm,
                    lastServiceOdometerKm = lastServiceOdometerKm,
                    serviceIntervalKm = serviceIntervalKm
                )
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = "Vehicle updated."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not save: ${e.message}")
            }
        }
    }

    fun deleteEmployee(uid: String, employeeNumber: String) {
        if (uid == repo.currentUid) {
            uiState = uiState.copy(message = "You can't delete your own account.")
            return
        }
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.deleteEmployee(uid, employeeNumber)
                uiState = uiState.copy(
                    busy = false,
                    employees = repo.listEmployees(),
                    message = "Employee removed."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not remove: ${e.message}")
            }
        }
    }

    /**
     * Employees who look like duplicates of someone else — same employee number, or
     * the same full name. Returns the set of uids so the list can flag them.
     */
    fun duplicateUids(): Set<String> {
        val employees = uiState.employees
        val byNumber = employees
            .filter { it.employeeNumber.isNotBlank() }
            .groupBy { it.employeeNumber.trim().lowercase() }
        val byName = employees
            .filter { it.fullName.isNotBlank() }
            .groupBy { it.fullName.trim().lowercase() }
        return (byNumber.values + byName.values)
            .filter { it.size > 1 }
            .flatten()
            .map { it.uid }
            .toSet()
    }

    fun makeAdmin(uid: String) = changeRole(uid, Role.ADMIN)

    fun removeAdmin(uid: String) {
        // Without this you could demote yourself and lose access to the very screen
        // you'd need to undo it — recoverable only via the Firebase console.
        if (uid == repo.currentUid) {
            uiState = uiState.copy(message = "You can't remove your own admin access.")
            return
        }
        changeRole(uid, Role.EMPLOYEE)
    }

    private fun changeRole(uid: String, role: String) {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.setUserRole(uid, role)
                uiState = uiState.copy(
                    busy = false,
                    employees = repo.listEmployees(),
                    admins = repo.listAdmins(),
                    message = if (role == Role.ADMIN) {
                        "Now an admin. They'll see the dashboard next time they sign in."
                    } else {
                        "Admin access removed."
                    }
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not change role: ${e.message}")
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
        val parsed = parseVehicleLines(pastedText)
        if (parsed.isEmpty()) {
            uiState = uiState.copy(message = "Nothing to add — check the format and try again.")
            return
        }
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                // Skip registrations already in the fleet, and repeats within the
                // pasted list, so uploading the same file twice can't create
                // duplicates — which would also break vehicle auto-assignment.
                val existing = repo.listVehicles()
                    .map { normaliseRegistration(it.registrationNumber) }
                    .toSet()
                val seen = mutableSetOf<String>()
                val toAdd = mutableListOf<Vehicle>()
                var skipped = 0
                parsed.forEach { vehicle ->
                    val key = normaliseRegistration(vehicle.registrationNumber)
                    if (key in existing || !seen.add(key)) skipped++ else toAdd += vehicle
                }

                val added = repo.addVehicles(toAdd)
                val report = buildString {
                    append("Added $added vehicle(s).")
                    if (skipped > 0) append(" Skipped $skipped already on the list.")
                }
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = report
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
                // Blank means "unknown", not "serviced just now" — see the note on
                // Vehicle.percentToNextService().
                val lastServiceOdometer = parts.getOrNull(4).digitsToLongOrNull() ?: 0L

                Vehicle(
                    registrationNumber = registration,
                    name = parts.getOrNull(1).orEmpty().ifBlank { registration },
                    currentOdometerKm = odometer,
                    lastServiceOdometerKm = lastServiceOdometer,
                    lastServiceDateMillis = lastServiceDate,
                    // Optional 6th column for models on a different schedule
                    // (Magnites run 10 000 km); blank uses the fleet standard.
                    serviceIntervalKm = parts.getOrNull(5).digitsToLongOrNull() ?: SERVICE_INTERVAL_KM,
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

    fun markServiced(vehicleId: String, odometerKm: Long, provider: String) {
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.markVehicleServiced(vehicleId, odometerKm, provider)
                uiState = uiState.copy(
                    busy = false,
                    vehicles = repo.listVehicles(),
                    message = "Service recorded."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not save: ${e.message}")
            }
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
