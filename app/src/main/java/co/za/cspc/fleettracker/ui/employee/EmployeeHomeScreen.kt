package co.za.cspc.fleettracker.ui.employee

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.ABSENCE_REASONS
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.VEHICLE_IN_SERVICE
import co.za.cspc.fleettracker.ui.asCaptured
import co.za.cspc.fleettracker.ui.km
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
    val context = LocalContext.current
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
                            Text("Odometer: ${vehicle.currentOdometerKm.km()}")
                            Text("Next service at ${vehicle.nextServiceAtKm().km()} (${vehicle.kmUntilService().km()} to go)")
                            if (due) {
                                Text(
                                    "Service is due — please tell your admin",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                            // Only offered in the last 5% of the window, so it isn't
                            // sitting there for months before it's any use.
                            if (vehicle.isNearingService()) {
                                Spacer(Modifier.height(8.dp))
                                Button(
                                    onClick = { findDealership(context, vehicle.dealershipSearchQuery()) },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(
                                        Icons.Filled.Place,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text("Find nearest dealership")
                                }
                                Text(
                                    "Opens your maps app. Confirm the booking with your " +
                                        "admin before taking the vehicle in.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            if (state.myRecentDays.isNotEmpty()) {
                item { HorizontalDivider() }
                item {
                    Text("My recent days", style = MaterialTheme.typography.titleMedium)
                }
                items(state.myRecentDays) { day ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(day.date, fontWeight = FontWeight.Bold)
                            when {
                                day.notWorking -> Text(
                                    "Not working" +
                                        if (day.notWorkingReason.isNotBlank()) {
                                            " — ${day.notWorkingReason}"
                                        } else "",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                day.hasEnded -> Text(
                                    "${timeFormat.format(Date(day.startTimeMillis))} → " +
                                        "${timeFormat.format(Date(day.endTimeMillis))}  •  " +
                                        "${day.durationLabel}  •  ${day.kmTravelled.km()}"
                                )
                                day.hasStarted -> Text(
                                    "Started ${timeFormat.format(Date(day.startTimeMillis))} " +
                                        "— never knocked off",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                            if (day.mainAreasWorked.isNotBlank()) {
                                Text(
                                    day.mainAreasWorked.asCaptured(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
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
        var category by remember { mutableStateOf("") }
        var detail by remember { mutableStateOf("") }
        var reasonMenuOpen by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { showNotWorkingConfirm = false },
            title = { Text("Not working today?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "You'll be recorded as absent for today and won't be able to " +
                            "clock in or out. You can undo this if you change your mind."
                    )
                    Box(Modifier.fillMaxWidth()) {
                        OutlinedTextField(
                            value = category,
                            onValueChange = { },
                            readOnly = true,
                            label = { Text("Reason") },
                            singleLine = true,
                            trailingIcon = {
                                IconButton(onClick = { reasonMenuOpen = true }) {
                                    Icon(
                                        Icons.Filled.ArrowDropDown,
                                        contentDescription = "Choose a reason"
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                        DropdownMenu(
                            expanded = reasonMenuOpen,
                            onDismissRequest = { reasonMenuOpen = false }
                        ) {
                            ABSENCE_REASONS.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option) },
                                    onClick = {
                                        category = option
                                        reasonMenuOpen = false
                                    }
                                )
                            }
                        }
                    }
                    // For a service the dealership is the useful detail, so ask for it
                    // by name and require it rather than leaving it to free text.
                    val isService = category == VEHICLE_IN_SERVICE
                    OutlinedTextField(
                        value = detail,
                        onValueChange = { detail = it },
                        label = {
                            Text(
                                if (isService) "Service centre or dealership"
                                else "Anything to add (optional)"
                            )
                        },
                        supportingText = {
                            if (isService) Text("e.g. Suzuki Umhlanga")
                        },
                        isError = isService && detail.isBlank(),
                        minLines = if (isService) 1 else 2,
                        maxLines = 3,
                        singleLine = isService,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    // A category is always required; the detail is only required when
                    // it's the dealership we're after.
                    enabled = category.isNotBlank() &&
                        (category != VEHICLE_IN_SERVICE || detail.isNotBlank()),
                    onClick = {
                        showNotWorkingConfirm = false
                        val reason = if (detail.isBlank()) category
                        else "$category — ${detail.trim()}"
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
                    Text("Distance travelled: ${log.kmTravelled.km()}")
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
    // Areas are required on both clock in and knock off — a day with no areas is of
    // no use in the reports, and chasing it up afterwards never works.
    val areasMissing = areas.isBlank()
    val canConfirm = entered != null && !tooLow && !areasMissing
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
                    label = { Text("$areasLabel *") },
                    isError = areasMissing,
                    supportingText = {
                        Text(
                            if (areasMissing) {
                                "Required — e.g. Umhlanga, Ballito, Verulam"
                            } else {
                                "e.g. Umhlanga, Ballito, Verulam"
                            }
                        )
                    },
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

/**
 * Hands the search to whatever maps app is installed, which does the locating itself.
 * That keeps this free of any location permission and of any paid places API — we
 * never see or store the person's position.
 */
private fun findDealership(context: Context, query: String) {
    val geo = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(query)}"))
    val web = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("https://www.google.com/maps/search/?api=1&query=${Uri.encode(query)}")
    )
    // geo: is the better experience but not every device handles it; fall back to the
    // browser rather than crashing on ActivityNotFoundException.
    runCatching { context.startActivity(geo) }
        .recoverCatching { context.startActivity(web) }
}
