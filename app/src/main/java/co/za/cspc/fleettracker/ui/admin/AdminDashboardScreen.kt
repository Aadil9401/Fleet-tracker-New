package co.za.cspc.fleettracker.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.SA_PROVINCES
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import co.za.cspc.fleettracker.data.repository.NewEmployeeCredentials
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFormat = SimpleDateFormat("HH:mm", Locale.US)
private val tabs = listOf("Today", "Employees", "Vehicles", "Logs", "Settings")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onLogout: () -> Unit,
    viewModel: AdminViewModel = viewModel()
) {
    val state = viewModel.uiState
    var selectedTab by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Dashboard") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                ),
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Filled.Logout, contentDescription = "Log out")
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            ScrollableTabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(title) })
                }
            }

            if (state.loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                when (selectedTab) {
                    0 -> TodayTab(state, viewModel)
                    1 -> EmployeesTab(state, viewModel)
                    2 -> VehiclesTab(state, viewModel)
                    3 -> LogsTab(state)
                    4 -> SettingsTab(state, viewModel)
                }
            }
        }
    }
}

@Composable
private fun TodayTab(state: AdminUiState, viewModel: AdminViewModel) {
    val notStarted = viewModel.notStartedToday()
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("${state.todaysLogs.count { it.hasStarted }} of ${state.employees.count { it.active }} started today",
                style = MaterialTheme.typography.titleMedium)
        }
        if (notStarted.isNotEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Not started yet:", fontWeight = FontWeight.Bold)
                        notStarted.forEach { Text("• ${it.fullName}") }
                    }
                }
            }
        }
        items(state.todaysLogs) { log ->
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text(log.employeeName, fontWeight = FontWeight.Bold)
                    val started = if (log.hasStarted) timeFormat.format(Date(log.startTimeMillis)) else "-"
                    val ended = if (log.hasEnded) timeFormat.format(Date(log.endTimeMillis)) else "still working"
                    Text("Start: $started   Knock off: $ended")
                    if (log.hasEnded) Text("Distance: ${log.kmTravelled} km")
                    if (log.mainAreasWorked.isNotBlank()) {
                        Text(
                            "Areas: ${log.mainAreasWorked}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmployeesTab(state: AdminUiState, viewModel: AdminViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    var credentialToShow by remember { mutableStateOf<NewEmployeeCredentials?>(null) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = { showAddDialog = true }, modifier = Modifier.fillMaxWidth()) {
            Text("+ Add employee")
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.employees) { emp ->
                Card {
                    Column(Modifier.padding(12.dp)) {
                        Text(emp.fullName, fontWeight = FontWeight.Bold)
                        if (emp.employeeNumber.isNotBlank()) {
                            Text("Employee no: ${emp.employeeNumber}", style = MaterialTheme.typography.bodySmall)
                        }
                        val teamAndProvince = listOf(emp.teamName, emp.province)
                            .filter { it.isNotBlank() }
                            .joinToString(" • ")
                        if (teamAndProvince.isNotBlank()) {
                            Text(teamAndProvince, style = MaterialTheme.typography.bodySmall)
                        }
                        if (emp.vehicleRegistration.isNotBlank()) {
                            Text(
                                "Vehicle: ${emp.vehicleRegistration}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Text("Login: ${emp.email}", style = MaterialTheme.typography.bodySmall)
                        if (emp.contactEmail.isNotBlank()) {
                            Text(emp.contactEmail, style = MaterialTheme.typography.bodySmall)
                        }
                        Text(if (emp.active) "Active" else "Deactivated")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { viewModel.setEmployeeActive(emp.uid, !emp.active) }) {
                                Text(if (emp.active) "Deactivate" else "Reactivate")
                            }
                            var expanded by remember { mutableStateOf(false) }
                            Box {
                                TextButton(onClick = { expanded = true }) {
                                    Text(
                                        state.vehicles.find { it.id == emp.assignedVehicleId }?.name
                                            ?: "Assign vehicle"
                                    )
                                }
                                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                    state.vehicles.forEach { v ->
                                        DropdownMenuItem(
                                            text = { Text(v.name.ifBlank { v.registrationNumber }) },
                                            onClick = {
                                                expanded = false
                                                viewModel.assignVehicle(emp.uid, v.id)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddEmployeeDialog(
            busy = state.busy,
            onConfirm = { name, surname, employeeNumber, province, teamName, contactEmail ->
                viewModel.addEmployee(
                    name = name,
                    surname = surname,
                    employeeNumber = employeeNumber,
                    province = province,
                    teamName = teamName,
                    contactEmail = contactEmail
                ) { credentials -> credentialToShow = credentials }
                showAddDialog = false
            },
            onDismiss = { showAddDialog = false }
        )
    }

    credentialToShow?.let { credentials ->
        AlertDialog(
            onDismissRequest = { credentialToShow = null },
            title = { Text("Login details created") },
            text = {
                Column {
                    Text("Username: ${credentials.username}", fontWeight = FontWeight.Bold)
                    Text("Password: ${credentials.password}", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    if (credentials.emailSent) {
                        Text("Emailed to ${credentials.contactEmail}.")
                    } else {
                        // The account exists regardless, so make it obvious the admin
                        // must hand these over by hand.
                        Text(
                            "The email could not be sent — write these down and give them " +
                                "to the employee yourself.",
                            color = MaterialTheme.colorScheme.error
                        )
                        if (credentials.emailError.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(credentials.emailError, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { credentialToShow = null }) { Text("Done") } }
        )
    }
}

@Composable
private fun AddEmployeeDialog(
    busy: Boolean,
    onConfirm: (
        name: String,
        surname: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        contactEmail: String
    ) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var surname by remember { mutableStateOf("") }
    var employeeNumber by remember { mutableStateOf("") }
    var province by remember { mutableStateOf("") }
    var teamName by remember { mutableStateOf("") }
    var contactEmail by remember { mutableStateOf("") }
    var provinceMenuOpen by remember { mutableStateOf(false) }

    // Mirrors the Cloud Function's check, so an obviously bad address is caught
    // before we bother creating the account.
    val emailLooksValid = contactEmail.contains("@") &&
        contactEmail.substringAfterLast("@").contains(".")
    val canCreate = !busy && name.isNotBlank() && surname.isNotBlank() && emailLooksValid

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add employee") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = surname,
                    onValueChange = { surname = it },
                    label = { Text("Surname") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = employeeNumber,
                    onValueChange = { employeeNumber = it },
                    label = { Text("Employee number") },
                    singleLine = true
                )

                Box {
                    OutlinedTextField(
                        value = province,
                        onValueChange = { },
                        readOnly = true,
                        label = { Text("Province") },
                        singleLine = true,
                        trailingIcon = {
                            IconButton(onClick = { provinceMenuOpen = true }) {
                                Icon(Icons.Filled.ArrowDropDown, contentDescription = "Choose province")
                            }
                        }
                    )
                    DropdownMenu(
                        expanded = provinceMenuOpen,
                        onDismissRequest = { provinceMenuOpen = false }
                    ) {
                        SA_PROVINCES.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    province = option
                                    provinceMenuOpen = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = teamName,
                    onValueChange = { teamName = it },
                    label = { Text("Team name") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = contactEmail,
                    onValueChange = { contactEmail = it },
                    label = { Text("Email address") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                Text(
                    "A username and temporary password will be generated and emailed to " +
                        "this address.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = canCreate,
                onClick = {
                    onConfirm(name, surname, employeeNumber, province, teamName, contactEmail)
                }
            ) {
                Text("Create")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun VehiclesTab(state: AdminUiState, viewModel: AdminViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    var showBulkDialog by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = { showAddDialog = true }, modifier = Modifier.fillMaxWidth()) {
            Text("+ Add vehicle")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = { showBulkDialog = true },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Bulk upload vehicles")
        }
        // Bulk upload reports its result here — without this the count/error would
        // only be visible on the Settings tab.
        state.message?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    msg,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(10.dp)
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.vehicles) { v ->
                val due = v.isServiceDue(System.currentTimeMillis())
                Card(colors = CardDefaults.cardColors(
                    containerColor = if (due) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surface
                )) {
                    Column(Modifier.padding(12.dp)) {
                        Text(v.name.ifBlank { v.registrationNumber }, fontWeight = FontWeight.Bold)
                        Text("Reg: ${v.registrationNumber}")
                        Text("Odometer: ${v.currentOdometerKm} km")
                        Text("Since service: ${v.kmSinceService()} km / ${v.serviceIntervalKm} km limit")
                        if (due) Text("SERVICE DUE", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { viewModel.markServiced(v.id, v.currentOdometerKm) }) {
                            Text("Mark as serviced today")
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddVehicleDialog(
            busy = state.busy,
            onConfirm = { name, reg, odo, ikm, imonths ->
                viewModel.addVehicle(name, reg, odo, ikm, imonths)
                showAddDialog = false
            },
            onDismiss = { showAddDialog = false }
        )
    }

    if (showBulkDialog) {
        BulkVehicleDialog(
            busy = state.busy,
            onConfirm = { pasted ->
                viewModel.bulkAddVehicles(pasted)
                showBulkDialog = false
            },
            onDismiss = { showBulkDialog = false }
        )
    }
}

@Composable
private fun BulkVehicleDialog(
    busy: Boolean,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var pasted by remember { mutableStateOf("") }
    val lineCount = pasted.lines().count { it.isNotBlank() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Bulk upload vehicles") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Paste your list — one vehicle per line, separated by commas:",
                    style = MaterialTheme.typography.bodyMedium
                )
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        "registration, name, odometer, service km, service months\n\n" +
                            "CA123456, Bakkie 1, 85000, 10000, 6\n" +
                            "ND987654, Hilux, 120000",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Text(
                    "Only the registration is required. Leave the rest off and it uses " +
                        "0 km, 10 000 km and 6 months. A heading row is ignored.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = pasted,
                    onValueChange = { pasted = it },
                    label = { Text("Your list") },
                    minLines = 5,
                    maxLines = 10,
                    modifier = Modifier.fillMaxWidth()
                )
                if (lineCount > 0) {
                    Text(
                        "$lineCount line(s) ready to add",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && lineCount > 0,
                onClick = { onConfirm(pasted) }
            ) { Text("Upload") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddVehicleDialog(
    busy: Boolean,
    onConfirm: (name: String, reg: String, odometer: Long, intervalKm: Long, intervalMonths: Long) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var reg by remember { mutableStateOf("") }
    var odo by remember { mutableStateOf("") }
    var intervalKm by remember { mutableStateOf("10000") }
    var intervalMonths by remember { mutableStateOf("6") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add vehicle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Vehicle name") }, singleLine = true)
                OutlinedTextField(value = reg, onValueChange = { reg = it }, label = { Text("Registration number") }, singleLine = true)
                OutlinedTextField(value = odo, onValueChange = { odo = it.filter { c -> c.isDigit() } }, label = { Text("Current odometer (km)") }, singleLine = true)
                OutlinedTextField(value = intervalKm, onValueChange = { intervalKm = it.filter { c -> c.isDigit() } }, label = { Text("Service every (km)") }, singleLine = true)
                OutlinedTextField(value = intervalMonths, onValueChange = { intervalMonths = it.filter { c -> c.isDigit() } }, label = { Text("Service every (months)") }, singleLine = true)
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && (name.isNotBlank() || reg.isNotBlank()),
                onClick = {
                    onConfirm(
                        name, reg,
                        odo.toLongOrNull() ?: 0L,
                        intervalKm.toLongOrNull() ?: 10000L,
                        intervalMonths.toLongOrNull() ?: 6L
                    )
                }
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun LogsTab(state: AdminUiState) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Recent fuel logs", style = MaterialTheme.typography.titleMedium) }
        items(state.recentFuelLogs) { f ->
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text("${f.employeeName} — R${"%.2f".format(f.amountSpentRands)}", fontWeight = FontWeight.Bold)
                    Text("${f.date}  •  ${f.odometerKm} km" + if (f.litres > 0) "  •  ${f.litres} L" else "")
                    if (f.receiptPhotoUrl.isNotBlank()) Text("Receipt photo attached", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (state.recentFuelLogs.isEmpty()) {
            item { Text("No fuel logs yet.") }
        }
    }
}

@Composable
private fun SettingsTab(state: AdminUiState, viewModel: AdminViewModel) {
    var email by remember(state.settings.adminEmail) { mutableStateOf(state.settings.adminEmail) }
    var hour by remember(state.settings.notifyIfNotStartedByHour) { mutableStateOf(state.settings.notifyIfNotStartedByHour.toString()) }
    var enabled by remember(state.settings.notificationsEnabled) { mutableStateOf(state.settings.notificationsEnabled) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Notification settings", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Your email address") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = hour,
            onValueChange = { hour = it.filter { c -> c.isDigit() } },
            label = { Text("Alert me if a team member hasn't started by this hour (24h)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Checkbox(checked = enabled, onCheckedChange = { enabled = it })
            Text("Send me email alerts")
        }
        Button(
            onClick = {
                viewModel.saveSettings(
                    AppSettings(
                        adminEmail = email,
                        notifyIfNotStartedByHour = hour.toIntOrNull() ?: 9,
                        notificationsEnabled = enabled
                    )
                )
            },
            enabled = !state.busy
        ) { Text("Save") }

        state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
    }
}
