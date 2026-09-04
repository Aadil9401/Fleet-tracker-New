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
import co.za.cspc.fleettracker.data.model.Debt
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.ui.grouped
import co.za.cspc.fleettracker.ui.rand

/**
 * What is said above the balance.
 *
 * Named like the other sentences in this app that are about somebody's money, so it can
 * be reworded without reading a Compose tree.
 */
const val DEBT_NOTE =
    "This is stock taken on account. Speak to the office about anything that looks wrong."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebtScreen(
    profile: UserProfile,
    onBack: () -> Unit,
    viewModel: DebtViewModel = viewModel()
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
                title = { Text("What I owe") },
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
            if (state.loading) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            if (state.nothingAtAll) {
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Nothing on your account", fontWeight = FontWeight.SemiBold)
                        Text(
                            "No stock has been recorded against you. Anything you take on "
                                + "account will show here.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                return@Column
            }

            // The balance first and large, because it is the only figure most people
            // open this for.
            Card(colors = CardDefaults.cardColors(
                containerColor = if (state.owesNothing) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.errorContainer
            )) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        state.outstanding?.rand() ?: "R0,00",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        if (state.owesNothing) "Nothing outstanding — you are paid up."
                        else "Outstanding",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    // The age of the oldest unpaid invoice, which is what turns a balance
                    // into something to act on.
                    state.oldestDays?.let {
                        Text(
                            "Oldest invoice: ${Debt.daysLabel(it)}",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            state.paid?.let { MoneyLine("Paid to date", it) }

            HorizontalDivider()

            Text("Invoices", style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold)
            state.invoices.forEach { invoice -> InvoiceCard(invoice, state.today) }

            Text(
                DEBT_NOTE,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * One invoice: its products, what it came to, what has been paid off it, and what is
 * left.
 *
 * The payments are listed rather than netted away. A balance somebody cannot reconcile
 * against their own record of what they paid is a balance they will argue about, and the
 * dates are what settles it.
 */
@Composable
private fun InvoiceCard(invoice: Debt.Invoice, today: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(invoice.invoiceNumber, fontWeight = FontWeight.Bold)
                    Text(
                        if (invoice.settled) invoice.invoiceDate
                        else "${invoice.invoiceDate} · ${
                            Debt.daysLabel(Debt.daysSince(invoice.invoiceDate, today))}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    if (invoice.settled) "Paid" else invoice.outstanding.rand(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            invoice.lines.forEach { line ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "${line.product} × ${line.quantity.grouped()}",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(line.amountRands.rand(), style = MaterialTheme.typography.bodySmall)
                }
            }

            if (invoice.payments.isNotEmpty()) {
                HorizontalDivider()
                invoice.payments.forEach { payment ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "Paid ${payment.paidDate}"
                                + if (payment.note.isNotBlank()) " · ${payment.note}" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            "− ${payment.amountRands.rand()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MoneyLine(label: String, value: Double) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label)
        Text(value.rand(), fontWeight = FontWeight.Bold)
    }
}
