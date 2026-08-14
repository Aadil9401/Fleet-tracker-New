package co.za.cspc.fleettracker.ui.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
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

/** Sentinel for "don't filter by province". */
private const val ALL_PROVINCES = "All provinces"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onLogout: () -> Unit,
    viewModel: AdminViewModel = viewModel()
) {
    val state = viewModel.uiState
    var selectedTab by remember { mutableStateOf(0) }

    // uiState.message is shared across tabs, so without this a result from one tab
    // (e.g. "Added 12 vehicles") keeps showing on another, looking like it belongs there.
    LaunchedEffect(selectedTab) { viewModel.clearMessage() }

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
    val started = state.todaysLogs.count { it.hasStarted }
    val activeCount = state.employees.count { it.active }
    val knockedOff = state.todaysLogs.count { it.hasEnded }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile("Started", "$started/$activeCount", Modifier.weight(1f))
                StatTile("Knocked off", knockedOff.toString(), Modifier.weight(1f))
                StatTile("Vehicles", state.vehicles.size.toString(), Modifier.weight(1f))
            }
        }
        if (notStarted.isNotEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            "Not started yet (${notStarted.size})",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(Modifier.height(4.dp))
                        notStarted.forEach {
                            Text(
                                "• ${it.fullName}",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }
        if (state.todaysLogs.isNotEmpty()) {
            item {
                Text(
                    "Today's activity",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
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
    var query by remember { mutableStateOf("") }
    var provinceFilter by remember { mutableStateOf(ALL_PROVINCES) }

    val filtered = remember(state.employees, query, provinceFilter) {
        val trimmed = query.trim()
        state.employees.filter { employee ->
            val matchesProvince =
                provinceFilter == ALL_PROVINCES || employee.province == provinceFilter
            val matchesQuery = trimmed.isBlank() ||
                employee.fullName.contains(trimmed, ignoreCase = true) ||
                employee.employeeNumber.contains(trimmed, ignoreCase = true) ||
                employee.teamName.contains(trimmed, ignoreCase = true) ||
                employee.vehicleRegistration.contains(trimmed, ignoreCase = true)
            matchesProvince && matchesQuery
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = { showAddDialog = true }, modifier = Modifier.fillMaxWidth()) {
            Text("+ Add employee")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = { viewModel.autoAssignVehiclesByRegistration() },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Auto-assign vehicles by registration")
        }
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
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(10.dp)
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search") },
            placeholder = { Text("Name, employee no, team or registration") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = "" }) {
                        Icon(Icons.Filled.Close, contentDescription = "Clear search")
                    }
                }
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(8.dp))
        ProvincePicker(
            employees = state.employees,
            selected = provinceFilter,
            onSelect = { provinceFilter = it }
        )

        Spacer(Modifier.height(10.dp))
        Text(
            if (filtered.size == state.employees.size) {
                "${state.employees.size} employee(s)"
            } else {
                "Showing ${filtered.size} of ${state.employees.size}"
            },
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(8.dp))
        if (filtered.isEmpty()) {
            Box(Modifier.fillMaxWidth().padding(top = 32.dp), contentAlignment = Alignment.Center) {
                Text(
                    if (state.employees.isEmpty()) {
                        "No employees yet. They can sign up on the app themselves."
                    } else {
                        "Nobody matches that search."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(filtered, key = { it.uid }) { emp ->
                EmployeeCard(
                    employee = emp,
                    assignedVehicle = state.vehicles.find { it.id == emp.assignedVehicleId },
                    vehicles = state.vehicles,
                    onToggleActive = { viewModel.setEmployeeActive(emp.uid, !emp.active) },
                    onAssignVehicle = { vehicleId -> viewModel.assignVehicle(emp.uid, vehicleId) }
                )
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

/** Headline number with a caption, used for the at-a-glance row on Today. */
@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        ),
        modifier = modifier
    ) {
        Column(
            Modifier.padding(vertical = 14.dp, horizontal = 10.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Province filter. Each option carries a live count so you can see where your people
 * are before choosing — more useful than a plain list of nine names.
 */
@Composable
private fun ProvincePicker(
    employees: List<UserProfile>,
    selected: String,
    onSelect: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val counts = remember(employees) { employees.groupingBy { it.province }.eachCount() }

    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { open = true },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.Place, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(selected, modifier = Modifier.weight(1f), textAlign = TextAlign.Start)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text("$ALL_PROVINCES (${employees.size})") },
                onClick = {
                    onSelect(ALL_PROVINCES)
                    open = false
                }
            )
            HorizontalDivider()
            SA_PROVINCES.forEach { province ->
                val count = counts[province] ?: 0
                DropdownMenuItem(
                    text = { Text("$province ($count)") },
                    onClick = {
                        onSelect(province)
                        open = false
                    }
                )
            }
        }
    }
}

@Composable
private fun EmployeeCard(
    employee: UserProfile,
    assignedVehicle: Vehicle?,
    vehicles: List<Vehicle>,
    onToggleActive: () -> Unit,
    onAssignVehicle: (String) -> Unit
) {
    Card(
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialsAvatar(employee.name, employee.surname, dimmed = !employee.active)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        employee.fullName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    val subtitle = listOfNotNull(
                        employee.employeeNumber.takeIf { it.isNotBlank() }?.let { "No. $it" },
                        employee.teamName.takeIf { it.isNotBlank() }
                    ).joinToString(" • ")
                    if (subtitle.isNotBlank()) {
                        Text(
                            subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                StatusBadge(active = employee.active)
            }

            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (employee.province.isNotBlank()) {
                    InfoChip(employee.province, Icons.Filled.Place)
                }
                if (employee.vehicleRegistration.isNotBlank()) {
                    InfoChip(employee.vehicleRegistration, Icons.Filled.DirectionsCar)
                }
            }

            Spacer(Modifier.height(8.dp))
            Text(
                employee.contactEmail.ifBlank { employee.email },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider(Modifier.padding(vertical = 10.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                var menuOpen by remember { mutableStateOf(false) }
                Box {
                    TextButton(onClick = { menuOpen = true }) {
                        Icon(
                            Icons.Filled.DirectionsCar,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            assignedVehicle?.let { it.name.ifBlank { it.registrationNumber } }
                                ?: "Assign vehicle"
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (vehicles.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text("No vehicles added yet") },
                                enabled = false,
                                onClick = { }
                            )
                        }
                        vehicles.forEach { vehicle ->
                            DropdownMenuItem(
                                text = { Text(vehicle.name.ifBlank { vehicle.registrationNumber }) },
                                onClick = {
                                    menuOpen = false
                                    onAssignVehicle(vehicle.id)
                                }
                            )
                        }
                    }
                }
                TextButton(
                    onClick = onToggleActive,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = if (employee.active) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        }
                    )
                ) {
                    Text(if (employee.active) "Deactivate" else "Reactivate")
                }
            }
        }
    }
}

@Composable
private fun InitialsAvatar(name: String, surname: String, dimmed: Boolean) {
    val initials = buildString {
        name.firstOrNull()?.let { append(it.uppercaseChar()) }
        surname.firstOrNull()?.let { append(it.uppercaseChar()) }
    }.ifBlank { "?" }

    Surface(
        color = if (dimmed) {
            MaterialTheme.colorScheme.surfaceVariant
        } else {
            MaterialTheme.colorScheme.primaryContainer
        },
        shape = CircleShape,
        modifier = Modifier.size(44.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                initials,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (dimmed) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onPrimaryContainer
                }
            )
        }
    }
}

@Composable
private fun StatusBadge(active: Boolean) {
    Surface(
        color = if (active) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.errorContainer
        },
        shape = MaterialTheme.shapes.extraSmall
    ) {
        Text(
            if (active) "Active" else "Inactive",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = if (active) {
                MaterialTheme.colorScheme.onPrimaryContainer
            } else {
                MaterialTheme.colorScheme.onErrorContainer
            },
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

/** Small pill of supporting detail. Hand-rolled so it stays on stable Material APIs. */
@Composable
private fun InfoChip(label: String, icon: ImageVector) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.extraSmall
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
        ) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(5.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
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
    var vehicleToDelete by remember { mutableStateOf<Vehicle?>(null) }
    var confirmDeleteAll by remember { mutableStateOf(false) }
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
        if (state.vehicles.isNotEmpty()) {
            TextButton(
                onClick = { confirmDeleteAll = true },
                enabled = !state.busy,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.error
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Delete all ${state.vehicles.size} vehicles")
            }
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
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    v.name.ifBlank { v.registrationNumber },
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    v.registrationNumber,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            if (due) {
                                Surface(
                                    color = MaterialTheme.colorScheme.error,
                                    shape = MaterialTheme.shapes.extraSmall
                                ) {
                                    Text(
                                        "SERVICE DUE",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onError,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("Odometer: ${v.currentOdometerKm} km")
                        Text(
                            "${v.kmSinceService()} km since service of ${v.serviceIntervalKm} km",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(6.dp))
                        // Visual read on how close this vehicle is to its next service.
                        val progress = if (v.serviceIntervalKm > 0) {
                            (v.kmSinceService().toFloat() / v.serviceIntervalKm).coerceIn(0f, 1f)
                        } else 0f
                        LinearProgressIndicator(
                            progress = { progress },
                            color = if (due) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.primary
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { viewModel.markServiced(v.id, v.currentOdometerKm) }) {
                                Text("Mark serviced")
                            }
                            TextButton(
                                onClick = { vehicleToDelete = v },
                                colors = ButtonDefaults.textButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error
                                )
                            ) {
                                Text("Delete")
                            }
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

    vehicleToDelete?.let { v ->
        AlertDialog(
            onDismissRequest = { vehicleToDelete = null },
            title = { Text("Delete this vehicle?") },
            text = {
                Text(
                    "${v.name.ifBlank { v.registrationNumber }} (${v.registrationNumber}) " +
                        "will be removed. Fuel and time logs already recorded against it " +
                        "are kept."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteVehicle(v.id)
                        vehicleToDelete = null
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { vehicleToDelete = null }) { Text("Cancel") }
            }
        )
    }

    if (confirmDeleteAll) {
        AlertDialog(
            onDismissRequest = { confirmDeleteAll = false },
            title = { Text("Delete all vehicles?") },
            text = {
                Text(
                    "This removes all ${state.vehicles.size} vehicles and cannot be " +
                        "undone. Use this to clear an incorrect upload before loading " +
                        "the correct list. Employees, logs and settings are untouched."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteAllVehicles()
                        confirmDeleteAll = false
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) { Text("Delete all") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteAll = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun BulkVehicleDialog(
    busy: Boolean,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var pasted by remember { mutableStateOf("") }
    var readError by remember { mutableStateOf<String?>(null) }
    val lineCount = pasted.lines().count { it.isNotBlank() }

    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val text = context.contentResolver.openInputStream(uri)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            when {
                text.isBlank() ->
                    readError = "That file looks empty."
                // .xlsx files are zip archives; they start with "PK" and would
                // otherwise come through as unreadable binary.
                text.startsWith("PK") ->
                    readError = "That's an Excel .xlsx file. In Excel use " +
                        "File → Save As → CSV, then pick the .csv file."
                else -> {
                    pasted = text
                    readError = null
                }
            }
        } catch (e: Exception) {
            readError = "Could not read that file: ${e.message}"
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Bulk upload vehicles") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = { filePicker.launch(arrayOf("*/*")) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Choose CSV file")
                }
                readError?.let { err ->
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            err,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }
                Text(
                    "…or paste your list below — one vehicle per line:",
                    style = MaterialTheme.typography.bodyMedium
                )
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        "registration, name, current odometer, " +
                            "last service date, last service odometer\n\n" +
                            "CA123456, Bakkie 1, 85000, 2026-03-15, 80000\n" +
                            "ND987654, Hilux, 120000, 20/01/2026, 112000",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Text(
                    "Only the registration is required. Dates can be yyyy-mm-dd or " +
                        "dd/mm/yyyy. Every vehicle is set to service every " +
                        "15 000 km. A heading row is ignored, and you can paste " +
                        "cells straight from Excel.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = pasted,
                    onValueChange = { pasted = it },
                    label = { Text("Your list") },
                    supportingText = { Text("Check this before uploading — you can edit it here") },
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
    var intervalKm by remember { mutableStateOf(SERVICE_INTERVAL_KM.toString()) }
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
        items(state.recentFuelLogs, key = { it.id }) { f ->
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text("${f.employeeName} — R${"%.2f".format(f.amountSpentRands)}", fontWeight = FontWeight.Bold)
                    Text("${f.date}  •  ${f.odometerKm} km" + if (f.litres > 0) "  •  ${f.litres} L" else "")
                    if (f.receiptPhotoUrl.isNotBlank()) Text("Receipt photo attached", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (state.recentFuelLogs.isEmpty()) {
            item { Text("No fuel logs yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }

        // Time logs were being fetched but never displayed anywhere — this is the
        // work history the Logs tab implied it already had.
        item {
            HorizontalDivider(Modifier.padding(vertical = 4.dp))
            Text("Recent work days", style = MaterialTheme.typography.titleMedium)
        }
        items(state.recentTimeLogs, key = { it.id }) { log ->
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text(log.employeeName, fontWeight = FontWeight.Bold)
                    val startText = if (log.hasStarted) timeFormat.format(Date(log.startTimeMillis)) else "-"
                    val endText = if (log.hasEnded) timeFormat.format(Date(log.endTimeMillis)) else "still working"
                    Text("${log.date}  •  $startText → $endText")
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
        if (state.recentTimeLogs.isEmpty()) {
            item { Text("No work days recorded yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
