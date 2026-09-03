package co.za.cspc.fleettracker.ui.employee

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.Performance
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import co.za.cspc.fleettracker.ui.asCaptured
import co.za.cspc.fleettracker.ui.grouped
import co.za.cspc.fleettracker.ui.rand
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// SAST-pinned like the rest of the app, so the month shown is the month the figures are
// filed under rather than whatever the phone's timezone makes of it.
private val monthKeyFormat = SimpleDateFormat("yyyy-MM", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
}
private val monthLabelFormat = SimpleDateFormat("MMMM yyyy", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
}

/**
 * What is said under a person's pay.
 *
 * Named rather than buried in the layout, for the same reason the clock-in greeting is:
 * it is a sentence about somebody's money, and whoever wants to reword it should not
 * have to read a Compose tree to find it.
 */
const PAY_DISCLAIMER = "Please note these amounts are before tax deductions"

/** "2026-09" as "September 2026", falling back to the key if it will not parse. */
private fun monthLabel(month: String): String =
    runCatching { monthLabelFormat.format(monthKeyFormat.parse(month)!!) }.getOrDefault(month)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerformanceScreen(
    profile: UserProfile,
    onBack: () -> Unit,
    viewModel: PerformanceViewModel = viewModel()
) {
    val state = viewModel.uiState
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
                title = { Text("My performance") },
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
            MonthPicker(
                month = state.month,
                onChange = { viewModel.setMonth(it) }
            )

            if (state.teamName.isBlank()) {
                // Not an error and not an empty state — a specific thing an admin fixes,
                // said plainly so the person knows who to ask rather than assuming the
                // app is broken.
                Card(colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                )) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("No team on your record", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Stock, connections and activations belong to a team, so there "
                                + "is nothing to show until your team name is set. Ask your "
                                + "admin to add it on the Employees tab.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                return@Column
            }

            Text(
                state.teamName.asCaptured(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            NetworkPicker(
                selected = state.network,
                onChange = { viewModel.setNetwork(it) }
            )

            if (state.loading) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            if (state.nothingYet) {
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Nothing uploaded for ${monthLabel(state.month)} yet",
                            fontWeight = FontWeight.SemiBold)
                        Text(
                            "Figures are loaded by the office once the month's numbers come "
                                + "in. Check an earlier month with the arrows above.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                return@Column
            }

            val f = state.figures
            FigureRow("Stock", f?.stock)
            FigureRow("Connections", f?.connections)
            FigureRow("Activations", f?.activations)

            HorizontalDivider()

            // Named the way round they are calculated: "from to", showing to divided by
            // from. A percentage is shown only where BOTH its figures were uploaded.
            PercentRow("Stock to connections",
                Performance.ratioPercent(f?.connections, f?.stock))
            PercentRow("Connections to activations",
                Performance.ratioPercent(f?.activations, f?.connections))
            PercentRow("Stock to activations",
                Performance.ratioPercent(f?.activations, f?.stock))

            HorizontalDivider()

            // Basic and commission are this person's own pay, not the team's, and carry
            // no network — so neither changes when the network above does.
            Text("My pay", style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold)
            MoneyRow("Basic salary", state.basicSalaryRands)
            MoneyRow("Commission", state.commissionRands)
            // Only added up when BOTH are in. Adding a known figure to an absent one
            // would show a total that is really just half the story.
            if (state.basicSalaryRands != null && state.commissionRands != null) {
                MoneyRow("Total", state.basicSalaryRands + state.commissionRands, strong = true)
            }
            // Stated where the amounts are, not in a footnote at the bottom of the
            // screen: somebody reading their own commission stops at the number.
            Text(
                PAY_DISCLAIMER,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text("Yours, not the team's. The same on every network.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)

            HorizontalDivider()

            Text("Where the team came", style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold)
            StandingCard("Connections", state.connectionsStanding)
            StandingCard("Activations", state.activationsStanding)

            Text(
                "Positions only — no team's figures are shown to anybody but the office. "
                    + "A team with nothing uploaded has no position rather than coming last.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun MonthPicker(month: String, onChange: (String) -> Unit) {
    // Arrows rather than a date picker: there is one figure a month, and stepping is
    // what somebody actually does with it.
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = { onChange(FleetRepository.shiftMonth(month, -1)) }) {
            Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous month")
        }
        Text(
            monthLabel(month),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f)
        )
        // Never past the current month: a future month has no figures by definition, and
        // offering it would show "nothing uploaded yet" for a month nobody has worked.
        val atCurrent = month >= FleetRepository.thisMonthString()
        IconButton(
            onClick = { onChange(FleetRepository.shiftMonth(month, 1)) },
            enabled = !atCurrent
        ) {
            Icon(Icons.Filled.ChevronRight, contentDescription = "Next month")
        }
    }
}

@Composable
private fun NetworkPicker(selected: String, onChange: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        FilterChip(
            selected = selected.isEmpty(),
            onClick = { onChange("") },
            label = { Text("All networks") }
        )
        Performance.NETWORKS.forEach { network ->
            FilterChip(
                selected = Performance.networkKey(selected) == network,
                onClick = { onChange(network) },
                label = { Text(Performance.networkLabel(network)) }
            )
        }
    }
}

/**
 * A dash, never a zero. Nothing uploaded is not the same as a month with no sales, and
 * showing 0 would make a missing upload look like a bad month to the person whose month
 * it is.
 */
@Composable
private fun FigureRow(label: String, value: Long?) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label)
        Text(
            value?.grouped() ?: "—",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun MoneyRow(label: String, value: Double?, strong: Boolean = false) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal)
        Text(
            value?.rand() ?: "—",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun PercentRow(label: String, value: Double?) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(Performance.percentLabel(value), fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StandingCard(metric: String, standing: Standing?) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(14.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(metric, fontWeight = FontWeight.SemiBold)
                Text(
                    when {
                        standing == null -> "No position"
                        standing.position == null -> "Nothing uploaded for this month"
                        else -> "of ${standing.teamsRanked} team" +
                            (if (standing.teamsRanked == 1) "" else "s")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                standing?.position?.let { "#$it" } ?: "—",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
