package co.za.cspc.fleettracker.ui.employee

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.Note
import co.za.cspc.fleettracker.data.model.UserProfile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * What is said above the box, so it can be reworded without reading a Compose tree.
 *
 * It says the note cannot be changed BEFORE anything is typed, not after it is saved.
 * Somebody who finds that out afterwards has already written the thing they would have
 * worded differently.
 */
const val NOTES_INTRO =
    "Write down what was discussed. Both you and the office can look it up later, " +
        "so write it while it is fresh. A saved note cannot be edited or deleted — " +
        "if something changes, add another note."

private val stampFormat = SimpleDateFormat("d MMM yyyy 'at' HH:mm", Locale.UK).apply {
    timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
}

/** "14 Sep 2026 at 09:35", in SAST like every other time in this app. */
private fun stamp(millis: Long, fallback: String): String =
    if (millis <= 0L) fallback else stampFormat.format(Date(millis))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    profile: UserProfile,
    onBack: () -> Unit,
    viewModel: NotesViewModel = viewModel()
) {
    val state = viewModel.state
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(profile.uid) { viewModel.load(profile) }
    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHost.showSnackbar(it)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHost) },
        topBar = {
            TopAppBar(
                title = { Text("My notes") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                NOTES_INTRO,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            OutlinedTextField(
                value = state.draft,
                onValueChange = { viewModel.draftChanged(it) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("What was discussed") },
                placeholder = { Text("Spoke to the office about…") },
                // Tall and multi-line: this is the one place in the app where somebody
                // writes prose, and three lines would make them feel they should stop.
                minLines = 6,
                singleLine = false,
                supportingText = {
                    if (state.nearLimit) {
                        Text(
                            if (state.remaining >= 0) "${state.remaining} characters left"
                            else "${-state.remaining} characters too many",
                            color = if (state.remaining >= 0) MaterialTheme.colorScheme.onSurfaceVariant
                            else MaterialTheme.colorScheme.error
                        )
                    }
                }
            )

            Button(
                onClick = { viewModel.save(profile) },
                enabled = state.canSave,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.saving) "Saving…" else "Save note")
            }

            HorizontalDivider()

            Text(
                if (state.notes.isEmpty()) "Your notes" else "Your notes (${state.notes.size})",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )

            if (state.loading) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (state.notes.isEmpty()) {
                Text(
                    "Nothing yet. The first note you save will show here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                state.notes.forEach { note -> NoteCard(note) }
            }
        }
    }
}

@Composable
private fun NoteCard(note: Note.Entry) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stamp(note.writtenAtMillis, note.writtenOn),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            // The text exactly as it was typed, line breaks and all — a note written as
            // three points should still read as three points.
            Text(note.text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
