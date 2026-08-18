package co.za.cspc.fleettracker.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import kotlinx.coroutines.launch

/** Minimum Firebase Auth will accept. */
private const val MIN_PASSWORD_LENGTH = 6

data class SignUpUiState(
    val name: String = "",
    val surname: String = "",
    val email: String = "",
    val employeeNumber: String = "",
    val province: String = "",
    val teamName: String = "",
    val vehicleRegistration: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val loading: Boolean = false,
    val error: String? = null
) {
    val emailLooksValid: Boolean
        get() = email.contains("@") && email.substringAfterLast("@").contains(".")

    val passwordLongEnough: Boolean get() = password.length >= MIN_PASSWORD_LENGTH

    val passwordsMatch: Boolean get() = password == confirmPassword

    val canSubmit: Boolean
        get() = !loading && name.isNotBlank() && surname.isNotBlank() &&
            // Required because it's what stops the same person registering twice.
            employeeNumber.isNotBlank() &&
            emailLooksValid && passwordLongEnough && passwordsMatch
}

class SignUpViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(SignUpUiState())
        private set

    fun onNameChange(value: String) { uiState = uiState.copy(name = value, error = null) }
    fun onSurnameChange(value: String) { uiState = uiState.copy(surname = value, error = null) }
    fun onEmailChange(value: String) { uiState = uiState.copy(email = value, error = null) }
    fun onEmployeeNumberChange(value: String) { uiState = uiState.copy(employeeNumber = value, error = null) }
    fun onProvinceChange(value: String) { uiState = uiState.copy(province = value, error = null) }
    fun onTeamNameChange(value: String) { uiState = uiState.copy(teamName = value, error = null) }
    fun onVehicleRegistrationChange(value: String) { uiState = uiState.copy(vehicleRegistration = value, error = null) }
    fun onPasswordChange(value: String) { uiState = uiState.copy(password = value, error = null) }
    fun onConfirmPasswordChange(value: String) { uiState = uiState.copy(confirmPassword = value, error = null) }

    fun signUp(onDone: (UserProfile) -> Unit) {
        if (!uiState.canSubmit) return
        uiState = uiState.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val profile = repo.signUp(
                    name = uiState.name,
                    surname = uiState.surname,
                    email = uiState.email,
                    employeeNumber = uiState.employeeNumber,
                    province = uiState.province,
                    teamName = uiState.teamName,
                    vehicleRegistration = uiState.vehicleRegistration,
                    password = uiState.password
                )
                uiState = uiState.copy(loading = false)
                onDone(profile)
            } catch (e: Exception) {
                uiState = uiState.copy(loading = false, error = friendlyMessage(e))
            }
        }
    }

    private fun friendlyMessage(e: Exception): String = when (e) {
        is FirebaseAuthUserCollisionException ->
            "That email address already has an account. Try signing in instead."
        is FirebaseAuthWeakPasswordException ->
            "That password is too weak. Use at least $MIN_PASSWORD_LENGTH characters."
        is FirebaseAuthInvalidCredentialsException ->
            "That email address doesn't look valid."
        else -> e.message ?: "Could not create your account. Please try again."
    }
}
