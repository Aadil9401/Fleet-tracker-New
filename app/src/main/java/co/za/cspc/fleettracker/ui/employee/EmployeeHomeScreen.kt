package co.za.cspc.fleettracker.ui.employee

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.UserProfile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFormat = SimpleDateFormat("HH:mm", Locale.US)

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

    LaunchedEffect(profile.uid) { viewModel.load(profile) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Hi, ${profile.name}") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
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

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = { showClockInDialog = true },
                        enabled = !state.busy && state.todaysLog?.hasStarted != true,
                        modifier = Modifier.weight(1f)
                    ) { Text("Start time") }

                    Button(
                        onClick = { showClockOutDialog = true },
                        enabled = !state.busy && state.todaysLog?.hasStarted == true && state.todaysLog?.hasEnded != true,
                        modifier = Modifier.weight(1f)
                    ) { Text("Knock off") }
                }
            }

            item {
                OutlinedButton(
                    onClick = { showFuelDialog = true },
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Log fuel spent") }
            }

            item { Divider() }

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
                            Text(vehicle.name.ifBlank { vehicle.registrationNumber })
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
            onConfirm = { km ->
                showClockInDialog = false
                viewModel.clockIn(km)
            },
            onDismiss = { showClockInDialog = false }
        )
    }

    if (showClockOutDialog) {
        OdometerDialog(
            title = "Knock off",
            confirmLabel = "Clock out",
            initialValue = state.vehicle?.currentOdometerKm ?: 0L,
            onConfirm = { km ->
                showClockOutDialog = false
                viewModel.clockOut(km)
            },
            onDismiss = { showClockOutDialog = false }
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
                log == null || !log.hasStarted -> Text("You haven't started yet.")
                log.hasStarted && !log.hasEnded -> Text("Started at ${timeFormat.format(Date(log.startTimeMillis))}")
                else -> Text(
                    "Started ${timeFormat.format(Date(log.startTimeMillis))}  →  Knocked off ${timeFormat.format(Date(log.endTimeMillis))}\n" +
                        "Distance travelled: ${log.kmTravelled} km"
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
    onConfirm: (Long) -> Unit,
    onDismiss: () -> Unit
) {
    var text by remember { mutableStateOf(if (initialValue > 0) initialValue.toString() else "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text("Enter the vehicle's current odometer reading (km)")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it.filter { c -> c.isDigit() } },
                    label = { Text("Odometer (km)") },
                    singleLine = true
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(text.toLongOrNull() ?: 0L) },
                enabled = text.toLongOrNull() != null
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
                        amount.toDoubleOrNull() ?: 0.0,
                        litres.toDoubleOrNull() ?: 0.0,
                        odometer.toLongOrNull() ?: 0L,
                        photoBytes
                    )
                },
                enabled = amount.toDoubleOrNull() != null
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
