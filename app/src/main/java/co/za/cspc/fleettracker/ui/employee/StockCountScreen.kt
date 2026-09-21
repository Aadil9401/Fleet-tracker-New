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

/**
 * What is said above the boxes.
 *
 * Kept as a constant like the other sentences in this app that a rep is expected to act
 * on, so it can be reworded without reading a Compose tree.
 */
const val STOCK_COUNT_NOTE =
    "Count what you physically have with you right now. Leave a network empty if you " +
        "do not carry it. Type 0 if you carry it and have run out."

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
