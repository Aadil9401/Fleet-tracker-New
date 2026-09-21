package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.Leave
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

data class LeaveUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val from: String = "",
    val to: String = "",
    /** Days already on the books from today onwards, soonest first. */
    val booked: List<String> = emptyList(),
    val message: String? = null
) {
    /** What the run being entered comes to, for the button to say before it is pressed. */
    fun summaryOf(today: String): String =
        when (val verdict = Leave.days(from, to, today)) {
            is Leave.Verdict.Ready -> Leave.summary(verdict.dates)
            is Leave.Verdict.Refused -> ""
        }
}

/**
 * Booking leave, and seeing what is already booked.
 *
 * THE DAYS ARE WRITTEN, NOT A REQUEST. Aadil asked for this so that somebody on leave is
 * not recorded as absent, which means the day view has to know about it the moment it is
 * booked — an approval step would leave exactly the gap the feature exists to close. An
 * admin can see every booked day on the portal and clear one like any other day.
 */
class LeaveViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var state by mutableStateOf(LeaveUiState())
        private set

    fun load(profile: UserProfile) {
        state = state.copy(loading = true, message = null)
        viewModelScope.launch {
            state = state.copy(loading = false, booked = repo.upcomingLeave(profile.uid))
        }
    }

    fun fromChosen(date: String) {
        // The second date follows the first where it has not been set, or is now before
        // it — a run that ends before it starts is never what somebody meant.
        val to = if (state.to.isEmpty() || state.to < date) date else state.to
        state = state.copy(from = date, to = to, message = null)
    }

    fun toChosen(date: String) {
        state = state.copy(to = date, message = null)
    }

    fun book(profile: UserProfile) {
        val today = FleetRepository.todayString()
        when (val verdict = Leave.days(state.from, state.to, today)) {
            is Leave.Verdict.Refused -> state = state.copy(message = verdict.why)
            is Leave.Verdict.Ready -> {
                state = state.copy(saving = true, message = null)
                viewModelScope.launch {
                    runCatching { repo.bookLeave(profile.uid, profile.fullName, verdict.dates) }
                        .onSuccess { (booked, skipped) ->
                            /*
                             * THE SKIPPED DAYS ARE NAMED. A day already worked is left
                             * alone, and somebody who is not told which days did not take
                             * will believe the whole run is booked and be marked absent on
                             * the one that was not.
                             */
                            val said = when {
                                booked.isEmpty() ->
                                    "Nothing booked — you had already worked those days."
                                skipped.isEmpty() ->
                                    "Booked ${booked.size} day(s) of leave."
                                else ->
                                    "Booked ${booked.size} day(s). " +
                                        "${skipped.size} left alone because you worked " +
                                        "them: ${skipped.joinToString(", ")}"
                            }
                            state = state.copy(
                                saving = false,
                                message = said,
                                from = "",
                                to = "",
                                booked = repo.upcomingLeave(profile.uid)
                            )
                        }
                        .onFailure { err ->
                            state = state.copy(
                                saving = false,
                                message = "Could not book: ${err.message ?: "no connection"}"
                            )
                        }
                }
            }
        }
    }

    fun cancel(profile: UserProfile, date: String) {
        state = state.copy(saving = true, message = null)
        viewModelScope.launch {
            runCatching { repo.cancelLeaveDay(profile.uid, date) }
                .onSuccess {
                    state = state.copy(
                        saving = false,
                        message = "$date is no longer leave.",
                        booked = repo.upcomingLeave(profile.uid)
                    )
                }
                .onFailure { err ->
                    state = state.copy(
                        saving = false,
                        message = "Could not cancel: ${err.message ?: "no connection"}"
                    )
                }
        }
    }
}
