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
    val message: String? = null,
    val busy: Boolean = false
)

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
                uiState = uiState.copy(loading = false, vehicle = vehicle, todaysLog = log)
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
                    message = "Clocked in. Have a safe day!"
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
                    message = "Knocked off. See you tomorrow!"
                )
            } catch (e: Exception) {
                uiState = uiState.copy(busy = false, message = "Could not knock off: ${e.message}")
            }
        }
    }

    fun logFuel(amountRands: Double, litres: Double, odometerKm: Long, photoBytes: ByteArray?) {
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
                    ),
                    photoBytes
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
