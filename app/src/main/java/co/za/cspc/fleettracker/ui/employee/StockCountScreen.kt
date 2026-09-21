package co.za.cspc.fleettracker.ui.employee

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.StockCount
import co.za.cspc.fleettracker.data.model.UserProfile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * What is said above the boxes.
 *
 * Kept as a constant like the other sentences in this app that a rep is expected to act
 * on, so it can be reworded without reading a Compose tree.
 */
const val STOCK_COUNT_NOTE =
    "Count what you physically have with you right now. Leave a network empty if you " +
        "do not carry it. Type 0 if you carry it and have run out."

/**
 * The picker's millis as yyyy-MM-dd.
 *
 * UTC, because that is what the picker hands back — it reports the midnight of the day
 * the user tapped, in UTC. Reading it in Africa/Johannesburg would land two hours into
 * the same day, which is harmless, but reading it anywhere west of Greenwich would land
 * on the day before. Formatting in the same zone the number was made in is the only
 * reading that cannot slip.
 */
private fun isoDate(utcMillis: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(utcMillis))

/** How the four networks are labelled on the phone, matching the portal. */
private val NETWORK_LABELS = mapOf(
    "MTN" to "MTN",
    "VODACOM" to "Vodacom",
    "CELLC" to "Cell C",
    "TELKOM" to "Telkom"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockCountScreen(
    profile: UserProfile,
    onBack: () -> Unit,
    viewModel: StockCountViewModel = viewModel()
) {
    val state = viewModel.state
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(profile.uid) { viewModel.load(profile) }
    LaunchedEffect(state.message) {
        state.message?.let { snackbarHost.showSnackbar(it) }
    }

    var pickingDate by remember { mutableStateOf(false) }

    if (pickingDate) {
        // Nothing after today can be selected: a count is a statement about a shelf
        // somebody has looked at, and there is no shelf to look at tomorrow.
        val pickerState = rememberDatePickerState(
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    utcTimeMillis <= System.currentTimeMillis()
            }
        )
        DatePickerDialog(
            onDismissRequest = { pickingDate = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        viewModel.dateChosen(isoDate(millis))
                    }
                    pickingDate = false
                }) { Text("Use this day") }
            },
            dismissButton = {
                TextButton(onClick = { pickingDate = false }) { Text("Cancel") }
            }
        ) {
            DatePicker(state = pickerState)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHost) },
        topBar = {
            TopAppBar(
                title = { Text("Stock on hand") },
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
                CircularProgressIndicator(Modifier.align(androidx.compose.ui.Alignment.Center))
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
            Text(profile.teamName.ifBlank { "No branch on your record" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold)
            Text(STOCK_COUNT_NOTE, style = MaterialTheme.typography.bodySmall)

            /*
             * THE LAST COUNT IS SHOWN BESIDE THE BOXES, never inside them. A screen that
             * opens pre-filled is one somebody presses Save on without counting, and the
             * portal would then show a fortnight-old figure wearing today's date.
             */
            if (!state.neverCounted) {
                Card {
                    Column(Modifier.padding(12.dp)) {
                        Text("Your last count — ${state.lastCountedOn}",
                            style = MaterialTheme.typography.labelLarge)
                        StockCount.NETWORKS.forEach { network ->
                            val held = state.lastHeld[network]
                            if (held != null) {
                                Text("${NETWORK_LABELS[network] ?: network}: $held",
                                    style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            } else {
                Text("You have not counted before.",
                    style = MaterialTheme.typography.bodySmall)
            }

            /*
             * THE DAY, above the figures, because it frames them. It starts on today,
             * which is the answer nearly every time — a rep who counted on Friday and is
             * typing it on Monday changes it, and nobody else has to think about it.
             *
             * Picked rather than typed. A date typed on a phone keyboard is a date
             * somebody gets wrong, and the picker cannot produce a day that does not
             * exist or a format the parser refuses.
             */
            OutlinedTextField(
                value = state.countedOn,
                onValueChange = { },
                readOnly = true,
                label = { Text("Day counted") },
                trailingIcon = {
                    TextButton(onClick = { pickingDate = true }) { Text("Change") }
                },
                modifier = Modifier.fillMaxWidth()
            )

            StockCount.NETWORKS.forEach { network ->
                OutlinedTextField(
                    value = state.typed[network] ?: "",
                    onValueChange = { viewModel.typed(network, it) },
                    label = { Text(NETWORK_LABELS[network] ?: network) },
                    placeholder = { Text("leave empty if you do not carry it") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Button(
                onClick = { viewModel.save(profile) },
                enabled = !state.saving,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.saving) "Saving…" else "Save my count")
            }

            // Counting again on the same day CORRECTS it. Saying so is the difference
            // between a rep fixing a typo and a rep afraid of doubling their own figure.
            Text(
                "Counting again today replaces today's count rather than adding to it.",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
