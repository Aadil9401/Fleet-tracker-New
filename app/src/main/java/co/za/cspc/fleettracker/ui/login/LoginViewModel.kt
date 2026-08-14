package co.za.cspc.fleettracker.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    /** Confirmation text, e.g. after a password-reset email goes out. */
    val info: String? = null
)

class LoginViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(LoginUiState())
        private set

    fun onEmailChange(value: String) {
        uiState = uiState.copy(email = value, error = null, info = null)
    }

    fun onPasswordChange(value: String) {
        uiState = uiState.copy(password = value, error = null, info = null)
    }

    /**
     * Emails a reset link to whatever address is in the email box. Deliberately
     * reports success even if the address isn't registered — telling a stranger
     * which emails have accounts would leak who works here.
     */
    fun sendPasswordReset() {
        val email = uiState.email.trim()
        if (email.isBlank()) {
            uiState = uiState.copy(error = "Type your email address first, then tap this again.")
            return
        }
        uiState = uiState.copy(loading = true, error = null, info = null)
        viewModelScope.launch {
            try {
                repo.sendPasswordReset(email)
            } catch (e: Exception) {
                // Swallowed on purpose — see the note above.
            }
            uiState = uiState.copy(
                loading = false,
                info = "If $email has an account, a reset link is on its way. " +
                    "Check your inbox and spam folder."
            )
        }
    }

    fun login(onSuccess: (UserProfile) -> Unit) {
        uiState = uiState.copy(loading = true, error = null, info = null)
        viewModelScope.launch {
            try {
                repo.login(uiState.email, uiState.password)
                val profile = repo.currentUserProfile()
                if (profile == null) {
                    uiState = uiState.copy(loading = false, error = "Account not set up correctly. Ask your admin.")
                } else if (!profile.active) {
                    uiState = uiState.copy(loading = false, error = "This account has been deactivated.")
                } else {
                    uiState = uiState.copy(loading = false)
                    onSuccess(profile)
                }
            } catch (e: Exception) {
                uiState = uiState.copy(loading = false, error = signInErrorMessage(e))
            }
        }
    }

    /**
     * Previously every failure here said "Incorrect email or password", which sent
     * you hunting for a password problem when the real cause was no signal or a
     * permissions issue.
     */
    private fun signInErrorMessage(e: Exception): String = when (e) {
        is FirebaseAuthInvalidUserException,
        is FirebaseAuthInvalidCredentialsException -> "Incorrect email or password."
        is FirebaseNetworkException -> "No internet connection. Check your signal and try again."
        else -> e.message ?: "Could not sign in. Please try again."
    }
}
