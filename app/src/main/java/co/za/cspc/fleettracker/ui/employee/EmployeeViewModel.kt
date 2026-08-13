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
            val vehicle = if (profile.assignedVehicleId.isNotBlank()) {
                repo.getVehicle(profile.assignedVehicleId)
            } else null
            val log = repo.todaysTimeLog(profile.uid)
            uiState = uiState.copy(loading = false, vehicle = vehicle, todaysLog = log)
        }
    }

    fun clockIn(odometerKm: Long) {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.clockIn(profile.uid, profile.fullName, profile.assignedVehicleId, odometerKm)
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

    fun clockOut(odometerKm: Long) {
        val profile = uiState.profile ?: return
        uiState = uiState.copy(busy = true, message = null)
        viewModelScope.launch {
            try {
                repo.clockOut(profile.uid, profile.assignedVehicleId, odometerKm)
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
