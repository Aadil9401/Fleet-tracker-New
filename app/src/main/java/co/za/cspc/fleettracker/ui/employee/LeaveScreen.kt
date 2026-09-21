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
import co.za.cspc.fleettracker.data.model.Leave
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * What is said above the two dates.
 *
 * Kept as a constant like the other sentences a rep is expected to act on, so it can be
 * reworded without reading a Compose tree.
 */
const val LEAVE_NOTE =
    "Book the days you will be away and you will not be counted as absent on them. " +
        "A day you have already clocked in on is left alone."

/** The picker hands back UTC midnight of the day tapped; read it in the same zone. */
private fun leaveIsoDate(utcMillis: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(utcMillis))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaveScreen(
    profile: UserProfile,
    onBack: () -> Unit,
    viewModel: LeaveViewModel = viewModel()
) {
    val state = viewModel.state
    val snackbarHost = remember { SnackbarHostState() }
    var picking by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(profile.uid) { viewModel.load(profile) }
    LaunchedEffect(state.message) {
        state.message?.let { snackbarHost.showSnackbar(it) }
    }

    picking?.let { which ->
        val pickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        val date = leaveIsoDate(millis)
                        if (which == "from") viewModel.fromChosen(date)
                        else viewModel.toChosen(date)
                    }
                    picking = null
                }) { Text("Use this day") }
            },
            dismissButton = {
                TextButton(onClick = { picking = null }) { Text("Cancel") }
            }
        ) {
            DatePicker(state = pickerState)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHost) },
        topBar = {
            TopAppBar(
                title = { Text("My leave") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(padding)) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
            return@Scaffold
        }

        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(LEAVE_NOTE, style = MaterialTheme.typography.bodySmall)

            OutlinedTextField(
                value = state.from,
                onValueChange = { },
                readOnly = true,
                label = { Text("First day away") },
                trailingIcon = {
                    TextButton(onClick = { picking = "from" }) { Text("Choose") }
                },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = state.to,
                onValueChange = { },
                readOnly = true,
                label = { Text("Last day away") },
                trailingIcon = {
                    TextButton(onClick = { picking = "to" }) { Text("Choose") }
                },
                modifier = Modifier.fillMaxWidth()
            )

            // The count, before the button is pressed: that is the number somebody is
            // checking against their own leave balance.
            val summary = state.summaryOf(FleetRepository.todayString())
            if (summary.isNotEmpty()) {
                Text(summary, style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold)
            }

            Button(
                onClick = { viewModel.book(profile) },
                enabled = !state.saving && state.from.isNotEmpty() && state.to.isNotEmpty(),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.saving) "Booking…" else "Book this leave")
            }

            HorizontalDivider()

            Text("Leave you have booked", style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold)
            if (state.booked.isEmpty()) {
                Text("Nothing booked from today onwards.",
                    style = MaterialTheme.typography.bodySmall)
            } else {
                // One row per day rather than a run, so a single day in the middle can be
                // handed back without cancelling the whole thing around it.
                state.booked.forEach { date ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(date)
                        TextButton(
                            onClick = { viewModel.cancel(profile, date) },
                            enabled = !state.saving
                        ) { Text("Cancel") }
                    }
                }
            }
        }
    }
}
