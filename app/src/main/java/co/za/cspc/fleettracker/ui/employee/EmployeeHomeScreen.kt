package co.za.cspc.fleettracker.ui.employee

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.ui.asCaptured
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private val timeFormat = SimpleDateFormat("HH:mm", Locale.US)

// SAST-pinned like the rest of the app, so the date shown always matches the date
// the day was actually recorded against.
private val dayLabelFormat = SimpleDateFormat("EEE d MMM yyyy", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmployeeHomeScreen(
    profile: UserProfile,
    onLogout: () -> Unit,
    viewModel: EmployeeViewModel = viewModel()
) {
    val state = viewModel.uiState
    var showClockInDialog by remember { mutableStateOf(false) }
    var showClockOutDialog by remember { mutableStateOf(false) }
    var showFuelDialog by remember { mutableStateOf(false) }
    var showNotWorkingConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(profile.uid) { viewModel.load(profile) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Hi, ${profile.name.asCaptured()}") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                ),
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Filled.Logout, contentDescription = "Log out")
                    }
                }
            )
        }
    ) { padding ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { StatusCard(state) }

            val absent = state.todaysLog?.notWorking == true

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = { showClockInDialog = true },
                        enabled = !state.busy && !absent && state.todaysLog?.hasStarted != true,
                        modifier = Modifier.weight(1f)
                    ) { Text("Start time") }

                    Button(
                        onClick = { showClockOutDialog = true },
                        enabled = !state.busy && !absent &&
                            state.todaysLog?.hasStarted == true &&
                            state.todaysLog?.hasEnded != true,
                        modifier = Modifier.weight(1f)
                    ) { Text("Knock off") }
                }
            }

            item {
                if (absent) {
                    OutlinedButton(
                        onClick = { viewModel.undoNotWorking() },
                        enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("I am working after all") }
                } else {
                    OutlinedButton(
                        onClick = { showNotWorkingConfirm = true },
                        // Only offered before the day starts; once you've clocked in
                        // the day has clearly happened.
                        enabled = !state.busy && state.todaysLog?.hasStarted != true,
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.secondary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Not working today") }
                }
            }

            item {
                OutlinedButton(
                    onClick = { showFuelDialog = true },
                    enabled = !state.busy && !absent,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Log fuel spent") }
            }

            item { HorizontalDivider() }

            item { Text("Service reminders", style = MaterialTheme.typography.titleMedium) }

            item {
                val vehicle = state.vehicle
                if (vehicle == null) {
                    Text("No vehicle assigned to you yet. Ask your admin.")
                } else {
                    val due = vehicle.isServiceDue(System.currentTimeMillis())
                    Card(colors = CardDefaults.cardColors(
                        containerColor = if (due) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant
                    )) {
                        Column(Modifier.padding(12.dp)) {
                            Text(vehicle.name.ifBlank { vehicle.registrationNumber }.asCaptured())
                            Text("Odometer: ${vehicle.currentOdometerKm} km")
                            Text("Since last service: ${vehicle.kmSinceService()} km (limit ${vehicle.serviceIntervalKm} km)")
                            if (due) {
                                Text(
                                    "Service is due — please tell your admin",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            }

            state.message?.let { msg ->
                item {
                    LaunchedEffect(msg) {
                        // auto shown via Snackbar-less simple text; cleared on next action
                    }
                    Text(msg, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }

    if (showClockInDialog) {
        OdometerDialog(
            title = "Start time",
            confirmLabel = "Clock in",
            initialValue = state.vehicle?.currentOdometerKm ?: 0L,
            initialAreas = "",
            areasLabel = "Areas going to work today",
            // The vehicle's stored reading is where it was left at the last knock off,
            // so today can't start below it.
            minimumKm = state.vehicle?.currentOdometerKm,
            onConfirm = { km, areas ->
                showClockInDialog = false
                viewModel.clockIn(km, areas)
            },
            onDismiss = { showClockInDialog = false }
        )
    }

    if (showClockOutDialog) {
        OdometerDialog(
            title = "Knock off",
            confirmLabel = "Clock out",
            initialValue = state.vehicle?.currentOdometerKm ?: 0L,
            // Pre-filled with what was typed at start, so they can amend rather
            // than retype the day's areas.
            initialAreas = state.todaysLog?.mainAreasWorked ?: "",
            areasLabel = "Areas worked today",
            minimumKm = state.todaysLog?.startOdometerKm,
            onConfirm = { km, areas ->
                showClockOutDialog = false
                viewModel.clockOut(km, areas)
            },
            onDismiss = { showClockOutDialog = false }
        )
    }

    if (showNotWorkingConfirm) {
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showNotWorkingConfirm = false },
            title = { Text("Not working today?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "You'll be recorded as absent for today and won't be able to " +
                            "clock in or out. You can undo this if you change your mind."
                    )
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("Reason") },
                        supportingText = { Text("e.g. Sick leave, annual leave, family responsibility") },
                        minLines = 2,
                        maxLines = 4,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    // A reason is the whole point of the record, so it's required.
                    enabled = reason.isNotBlank(),
                    onClick = {
                        showNotWorkingConfirm = false
                        viewModel.markNotWorking(reason)
                    }
                ) { Text("Confirm") }
            },
            dismissButton = {
                TextButton(onClick = { showNotWorkingConfirm = false }) { Text("Cancel") }
            }
        )
    }

    if (showFuelDialog) {
        FuelDialog(
            defaultOdometer = state.vehicle?.currentOdometerKm ?: 0L,
            onConfirm = { amount, litres, km, bytes ->
                showFuelDialog = false
                viewModel.logFuel(amount, litres, km, bytes)
            },
            onDismiss = { showFuelDialog = false }
        )
    }
}

@Composable
private fun StatusCard(state: EmployeeUiState) {
    val log = state.todaysLog
    Card {
        Column(Modifier.padding(16.dp)) {
            Text("Today", style = MaterialTheme.typography.titleMedium)
            when {
                log?.notWorking == true -> Column {
                    Text(
                        "Marked as not working today.",
                        color = MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.Bold
                    )
                    if (log.notWorkingReason.isNotBlank()) {
                        Text(
                            "Reason: ${log.notWorkingReason}".asCaptured(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                log == null || !log.hasStarted -> Text("You haven't started yet.")
                log.hasStarted && !log.hasEnded -> Column {
                    Text(dayLabelFormat.format(Date(log.startTimeMillis)), fontWeight = FontWeight.Bold)
                    Text("Started at ${timeFormat.format(Date(log.startTimeMillis))}")
                }
                else -> Column {
                    Text(dayLabelFormat.format(Date(log.startTimeMillis)), fontWeight = FontWeight.Bold)
                    Text(
                        "Started ${timeFormat.format(Date(log.startTimeMillis))}  →  " +
                            "Knocked off ${timeFormat.format(Date(log.endTimeMillis))}"
                    )
                    Text("Distance travelled: ${log.kmTravelled} km")
                }
            }
            if (log != null && log.mainAreasWorked.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Areas: ${log.mainAreasWorked}".asCaptured(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun OdometerDialog(
    title: String,
    confirmLabel: String,
    initialValue: Long,
    initialAreas: String,
    areasLabel: String,
    minimumKm: Long?,
    onConfirm: (odometerKm: Long, mainAreasWorked: String) -> Unit,
    onDismiss: () -> Unit
) {
    var text by remember { mutableStateOf(if (initialValue > 0) initialValue.toString() else "") }
    var areas by remember { mutableStateOf(initialAreas) }

    // Catches the classic slip of dropping a digit at knock off, which would
    // otherwise record a day of 0 km.
    val entered = text.toLongOrNull()
    val tooLow = entered != null && minimumKm != null && entered < minimumKm
    val canConfirm = entered != null && !tooLow
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Enter the vehicle's current odometer reading (km)")
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it.filter { c -> c.isDigit() } },
                    label = { Text("Odometer (km)") },
                    isError = tooLow,
                    supportingText = {
                        if (tooLow) {
                            Text("Can't be less than $minimumKm km — the last reading recorded for this vehicle.")
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = areas,
                    onValueChange = { areas = it },
                    label = { Text(areasLabel) },
                    supportingText = { Text("e.g. Umhlanga, Ballito, Verulam") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(entered ?: 0L, areas) },
                enabled = canConfirm
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun FuelDialog(
    defaultOdometer: Long,
    onConfirm: (amount: Double, litres: Double, odometerKm: Long, photoBytes: ByteArray?) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var amount by remember { mutableStateOf("") }
    var litres by remember { mutableStateOf("") }
    var odometer by remember { mutableStateOf(if (defaultOdometer > 0) defaultOdometer.toString() else "") }
    var photoBytes by remember { mutableStateOf<ByteArray?>(null) }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            context.contentResolver.openInputStream(uri)?.use { photoBytes = it.readBytes() }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log fuel spent") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Amount spent (R)") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = litres,
                    onValueChange = { litres = it },
                    label = { Text("Litres (optional)") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = odometer,
                    onValueChange = { odometer = it.filter { c -> c.isDigit() } },
                    label = { Text("Odometer (km)") },
                    singleLine = true
                )
                OutlinedButton(onClick = { pickImage.launch("image/*") }) {
                    Text(if (photoBytes == null) "Attach receipt photo" else "Photo attached ✓")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onConfirm(
                        amount.toAmountOrNull() ?: 0.0,
                        litres.toAmountOrNull() ?: 0.0,
                        odometer.toLongOrNull() ?: 0L,
                        photoBytes
                    )
                },
                enabled = amount.toAmountOrNull() != null
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

/**
 * Accepts "150.50" and "150,50". South African keyboards commonly produce the comma,
 * which plain toDoubleOrNull() rejects — leaving Save greyed out with no explanation.
 */
private fun String.toAmountOrNull(): Double? = trim().replace(',', '.').toDoubleOrNull()
