package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.StockCount
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

data class StockCountUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    /** What is in each of the four boxes, keyed on the network. */
    val typed: Map<String, String> = emptyMap(),
    /** The day of their last count, or blank if they have never taken one. */
    val lastCountedOn: String = "",
    /** What they held on that day, per network. */
    val lastHeld: Map<String, Long> = emptyMap(),
    val message: String? = null,
    val saved: Boolean = false
) {
    val neverCounted: Boolean get() = lastCountedOn.isEmpty()
}

/**
 * The stock count screen's state.
 *
 * THE BOXES START EMPTY, not pre-filled with the last count. A screen that opens showing
 * last week's figures is a screen somebody presses Save on without counting anything, and
 * the portal would then show a fortnight-old number wearing today's date. The last count
 * is shown BESIDE the boxes instead, where it informs without being submitted.
 */
class StockCountViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var state by mutableStateOf(StockCountUiState())
        private set

    fun load(profile: UserProfile) {
        state = state.copy(loading = true, message = null)
        viewModelScope.launch {
            val on = repo.lastStockCountDate(profile.uid)
            val held = if (on.isEmpty()) emptyMap() else repo.lastStockCount(profile.uid)
            state = state.copy(
                loading = false,
                lastCountedOn = on,
                lastHeld = held,
                typed = StockCount.NETWORKS.associateWith { "" }
            )
        }
    }

    fun typed(network: String, text: String) {
        // Cleared as soon as they start fixing it: a complaint that outlives the mistake
        // reads as a second, different problem.
        state = state.copy(
            typed = state.typed + (network to text),
            message = null,
            saved = false
        )
    }

    fun save(profile: UserProfile) {
        when (val verdict = StockCount.verdict(state.typed)) {
            is StockCount.Verdict.Refused ->
                state = state.copy(message = verdict.why, saved = false)

            is StockCount.Verdict.Ready -> {
                state = state.copy(saving = true, message = null)
                viewModelScope.launch {
                    runCatching {
                        repo.saveStockCount(
                            uid = profile.uid,
                            employeeName = profile.fullName,
                            teamName = profile.teamName,
                            rows = verdict.rows
                        )
                    }.onSuccess {
                        val total = verdict.rows.sumOf { it.held }
                        state = state.copy(
                            saving = false,
                            saved = true,
                            message = "Counted $total units. Thank you.",
                            typed = StockCount.NETWORKS.associateWith { "" },
                            lastCountedOn = FleetRepository.todayString(),
                            lastHeld = verdict.rows.associate { it.network to it.held }
                        )
                    }.onFailure { err ->
                        // Named rather than swallowed: a rep who thinks a count saved and
                        // finds it did not will not take the next one seriously.
                        state = state.copy(
                            saving = false,
                            saved = false,
                            message = "Could not save: ${err.message ?: "no connection"}"
                        )
                    }
                }
            }
        }
    }
}
