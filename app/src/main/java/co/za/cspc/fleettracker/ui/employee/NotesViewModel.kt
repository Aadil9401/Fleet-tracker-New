package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.Note
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

data class NotesUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val draft: String = "",
    val notes: List<Note.Entry> = emptyList(),
    val message: String? = null
) {
    /** What is left before the limit, shown only once it is worth knowing. */
    val remaining: Int get() = Note.MOST_CHARACTERS - draft.trim().length
    val nearLimit: Boolean get() = remaining <= 300
    val canSave: Boolean get() = draft.isNotBlank() && !saving
}

/**
 * Notes of a discussion, written by the person who had it.
 *
 * THE DRAFT IS NOT CLEARED UNTIL THE WRITE HAS COME BACK. Somebody types this in a
 * branch on a phone signal, and clearing the box the moment Save is pressed would lose
 * the whole note the one time it mattered — the time it did not save. On a failure the
 * text is still there to try again.
 *
 * A SAVED NOTE CANNOT BE EDITED, here or in the rules. Both sides rely on it, so a
 * correction is a new note rather than a quiet rewrite of the old one.
 */
class NotesViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var state by mutableStateOf(NotesUiState())
        private set

    fun load(profile: UserProfile) {
        state = state.copy(loading = true)
        viewModelScope.launch {
            runCatching { repo.listMyNotes(profile.uid) }
                .onSuccess { state = state.copy(loading = false, notes = it) }
                .onFailure { err ->
                    state = state.copy(
                        loading = false,
                        message = "Could not load your notes: ${err.message ?: "no connection"}"
                    )
                }
        }
    }

    fun draftChanged(text: String) {
        state = state.copy(draft = text, message = null)
    }

    fun save(profile: UserProfile) {
        when (val verdict = Note.check(state.draft)) {
            is Note.Verdict.Refused -> state = state.copy(message = verdict.why)
            is Note.Verdict.Ready -> {
                state = state.copy(saving = true, message = null)
                viewModelScope.launch {
                    runCatching {
                        repo.addNote(
                            uid = profile.uid,
                            employeeName = profile.fullName,
                            employeeNumber = profile.employeeNumber,
                            teamName = profile.teamName,
                            province = profile.province,
                            text = verdict.text
                        )
                        repo.listMyNotes(profile.uid)
                    }
                        .onSuccess { saved ->
                            state = state.copy(
                                saving = false,
                                draft = "",
                                notes = saved,
                                message = "Note saved."
                            )
                        }
                        .onFailure { err ->
                            // Draft deliberately left alone — see the note on this class.
                            state = state.copy(
                                saving = false,
                                message = "Could not save: ${err.message ?: "no connection"}. "
                                    + "Your note is still here, try again."
                            )
                        }
                }
            }
        }
    }

    fun clearMessage() {
        state = state.copy(message = null)
    }
}
