package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

data class EmployeeUiState(
    val loading: Boolean = true,
    val profile: UserProfile? = null,
    val vehicle: Vehicle? = null,
    val todaysLog: TimeLog? = null,
    /** The person's own recent days, so they can check their own hours. */
    val myRecentDays: List<TimeLog> = emptyList(),
    val message: String? = null,
    val busy: Boolean = false
)

/**
 * What an employee sees the moment they start their day. Kept as a named constant
 * rather than buried in clockIn(), because it is the one string in this file that
 * someone will want to reword without reading the rest of the class.
 */
const val CLOCKED_IN_GREETING = "Have a lovely day, stay blessed, be safe, do your BEST"

/** And what they see when the day is done. Same reasoning as the greeting above. */
const val KNOCKED_OFF_MESSAGE =
    "Thank you for being part of a great team, tomorrow we push again"

class EmployeeViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(EmployeeUiState())
        private set

    fun load(profile: UserProfile) {
        uiState = uiState.copy(loading = true, profile = profile)
        viewModelScope.launch {
            // Anything here can fail (no signal, rules not deployed). Without this
            // catch the exception escapes the coroutine and takes the app down.
            try {
                val vehicle = if (profile.assignedVehicleId.isNotBlank()) {
                    repo.getVehicle(profile.assignedVehicleId)
                } else null
                val log = repo.todaysTimeLog(profile.uid)
                // Their own history is a nice-to-have: if the query fails, the rest of
                // the screen should still work.
                val recent = runCatching { repo.listMyRecentTimeLogs(profile.uid) }
                    .getOrDefault(emptyList())
                uiState = uiState.copy(
                    loading = false,
                    vehicle = vehicle,
                    todaysLog = log,
                    myRecentDays = recent
                )
            } catch (e: Exception) {
                uiState = uiState.copy(
                    loading = false,
                    message = "Could not load your details: ${e.message}"
                )
            }
        }
    }

    fun markNotWorking(reason: String) {
        val profile = uiState.profile ?: return
        if (reason.isBlank()) return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.markNotWorking(profile.uid, profile.fullName, reason)
                uiState = uiState.copy(
                    busy = false,
                    todaysLog = repo.todaysTimeLog(profile.uid),
                    message = "Marked as not working today."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not save: ${e.message}")
            }
        }
    }

    fun undoNotWorking() {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.clearNotWorking(profile.uid)
                uiState = uiState.copy(
                    busy = false,
                    todaysLog = repo.todaysTimeLog(profile.uid),
                    message = "You can clock in again."
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not undo: ${e.message}")
            }
        }
    }

    fun clockIn(odometerKm: Long, mainAreasWorked: String) {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.clockIn(
                    profile.uid,
                    profile.fullName,
                    profile.assignedVehicleId,
                    odometerKm,
                    mainAreasWorked
                )
                uiState = uiState.copy(
                    busy = false,
                    todaysLog = repo.todaysTimeLog(profile.uid),
                    vehicle = if (profile.assignedVehicleId.isNotBlank()) repo.getVehicle(profile.assignedVehicleId) else null,
                    message = CLOCKED_IN_GREETING
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not clock in: ${e.message}")
            }
        }
    }

    fun clockOut(odometerKm: Long, mainAreasWorked: String) {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.clockOut(profile.uid, profile.assignedVehicleId, odometerKm, mainAreasWorked)
                uiState = uiState.copy(
                    busy = false,
                    todaysLog = repo.todaysTimeLog(profile.uid),
                    vehicle = if (profile.assignedVehicleId.isNotBlank()) repo.getVehicle(profile.assignedVehicleId) else null,
                    message = KNOCKED_OFF_MESSAGE
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not knock off: ${e.message}")
            }
        }
    }

    fun logFuel(amountRands: Double, litres: Double, odometerKm: Long) {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.addFuelLog(
                    co.za.cspc.fleettracker.data.model.FuelLog(
                        uid = profile.uid,
                        employeeName = profile.fullName,
                        amountSpentRands = amountRands,
                        litres = litres,
                        odometerKm = odometerKm,
                        vehicleId = profile.assignedVehicleId
                    )
                )
                uiState = uiState.copy(busy = false, message = "Fuel logged. Thanks!")
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not save fuel log: ${e.message}")
            }
        }
    }

    fun clearMessage() {
        uiState = uiState.copy(message = null)
    }
}
