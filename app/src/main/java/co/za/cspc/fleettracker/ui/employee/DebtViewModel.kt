package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.Debt
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

data class DebtUiState(
    val loading: Boolean = true,
    val invoices: List<Debt.Invoice> = emptyList(),
    val today: String = "",
    val message: String? = null
) {
    /** What they owe right now, or null when they owe nothing. */
    val outstanding: Double? get() = Debt.totalOutstanding(invoices)

    /** Everything they have ever paid, or null when they have paid nothing. */
    val paid: Double? get() = Debt.totalPaid(invoices)

    /** The age of their longest-standing unpaid invoice. */
    val oldestDays: Long? get() = Debt.oldestUnpaidDays(invoices, today)

    val owesNothing: Boolean get() = invoices.none { !it.settled }
    val nothingAtAll: Boolean get() = invoices.isEmpty()
}

/**
 * What one employee owes for stock taken.
 *
 * Their own invoices and their own payments, nothing else — the rules would refuse a
 * query for anybody else's, and a colleague's balance is none of their business.
 */
class DebtViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(DebtUiState())
        private set

    fun load(profile: UserProfile) {
        uiState = uiState.copy(loading = true, today = FleetRepository.todayString(), message = null)
        viewModelScope.launch {
            // Anything here can fail — no signal, rules not deployed. Without this catch
            // the exception escapes the coroutine and takes the app down, which is a poor
            // way to say "we could not load what you owe".
            try {
                val invoices = Debt.invoicesInOrder(repo.myDebt(profile.uid))
                uiState = uiState.copy(loading = false, invoices = invoices)
            } catch (e: Exception) {
                uiState = uiState.copy(
                    loading = false,
                    message = "Could not load what you owe: ${e.message}"
                )
            }
        }
    }

    fun clearMessage() {
        uiState = uiState.copy(message = null)
    }
}
