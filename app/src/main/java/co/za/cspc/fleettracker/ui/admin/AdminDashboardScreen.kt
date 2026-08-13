package co.za.cspc.fleettracker.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFormat = SimpleDateFormat("HH:mm", Locale.US)
private val tabs = listOf("Today", "Employees", "Vehicles", "Logs", "Settings")

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
                }
            }
        }
    }
}

@Composable
private fun EmployeesTab(state: AdminUiState, viewModel: AdminViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    var credentialToShow by remember { mutableStateOf<Pair<String, String>?>(null) }

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
                        Text(emp.email, style = MaterialTheme.typography.bodySmall)
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
            onConfirm = { name, surname ->
                viewModel.addEmployee(name, surname) { email, password ->
                    credentialToShow = email to password
                }
                showAddDialog = false
            },
            onDismiss = { showAddDialog = false }
        )
    }

    credentialToShow?.let { (email, password) ->
        AlertDialog(
            onDismissRequest = { credentialToShow = null },
            title = { Text("Login details created") },
            text = {
                Column {
                    Text("Give these to the employee:")
                    Spacer(Modifier.height(8.dp))
                    Text("Username: $email", fontWeight = FontWeight.Bold)
                    Text("Password: $password", fontWeight = FontWeight.Bold)
                }
            },
            confirmButton = { TextButton(onClick = { credentialToShow = null }) { Text("Done") } }
        )
    }
}

@Composable
private fun AddEmployeeDialog(
    busy: Boolean,
    onConfirm: (name: String, surname: String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var surname by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add employee") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true)
                OutlinedTextField(value = surname, onValueChange = { surname = it }, label = { Text("Surname") }, singleLine = true)
                Text(
                    "A username and temporary password will be generated automatically.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && name.isNotBlank() && surname.isNotBlank(), onClick = { onConfirm(name, surname) }) {
                Text("Create")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun VehiclesTab(state: AdminUiState, viewModel: AdminViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = { showAddDialog = true }, modifier = Modifier.fillMaxWidth()) {
            Text("+ Add vehicle")
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
