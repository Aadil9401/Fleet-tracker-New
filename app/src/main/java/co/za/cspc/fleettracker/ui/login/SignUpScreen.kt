package co.za.cspc.fleettracker.ui.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.SA_PROVINCES
import co.za.cspc.fleettracker.data.model.UserProfile

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignUpScreen(
    onSignedUp: (UserProfile) -> Unit,
    onBackToLogin: () -> Unit,
    viewModel: SignUpViewModel = viewModel()
) {
    val state = viewModel.uiState

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create your account") },
                navigationIcon = {
                    IconButton(onClick = onBackToLogin, enabled = !state.loading) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back to sign in")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            FormSection("Your details") {
                OutlinedTextField(
                    value = state.name,
                    onValueChange = viewModel::onNameChange,
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.surname,
                    onValueChange = viewModel::onSurnameChange,
                    label = { Text("Surname") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.email,
                    onValueChange = viewModel::onEmailChange,
                    label = { Text("Email address") },
                    supportingText = { Text("You'll use this to sign in") },
                    isError = state.email.isNotEmpty() && !state.emailLooksValid,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            FormSection("Work details") {
                OutlinedTextField(
                    value = state.employeeNumber,
                    onValueChange = viewModel::onEmployeeNumberChange,
                    label = { Text("Employee number") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Box(Modifier.fillMaxWidth()) {
                    var provinceMenuOpen by remember { mutableStateOf(false) }
                    OutlinedTextField(
                        value = state.province,
                        onValueChange = { },
                        readOnly = true,
                        label = { Text("Province") },
                        singleLine = true,
                        trailingIcon = {
                            IconButton(onClick = { provinceMenuOpen = true }) {
                                Icon(Icons.Filled.ArrowDropDown, contentDescription = "Choose province")
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    DropdownMenu(
                        expanded = provinceMenuOpen,
                        onDismissRequest = { provinceMenuOpen = false }
                    ) {
                        SA_PROVINCES.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    viewModel.onProvinceChange(option)
                                    provinceMenuOpen = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = state.teamName,
                    onValueChange = viewModel::onTeamNameChange,
                    label = { Text("Team name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.vehicleRegistration,
                    onValueChange = viewModel::onVehicleRegistrationChange,
                    label = { Text("Vehicle registration") },
                    supportingText = { Text("The vehicle you drive, e.g. CA 123-456") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Characters),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            FormSection("Choose a password") {
                OutlinedTextField(
                    value = state.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = { Text("Password") },
                    supportingText = { Text("At least 6 characters") },
                    isError = state.password.isNotEmpty() && !state.passwordLongEnough,
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.confirmPassword,
                    onValueChange = viewModel::onConfirmPasswordChange,
                    label = { Text("Confirm password") },
                    isError = state.confirmPassword.isNotEmpty() && !state.passwordsMatch,
                    supportingText = {
                        if (state.confirmPassword.isNotEmpty() && !state.passwordsMatch) {
                            Text("Passwords don't match")
                        }
                    },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            if (state.error != null) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        state.error,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            Button(
                onClick = { viewModel.signUp(onSignedUp) },
                enabled = state.canSubmit,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                if (state.loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Create account", style = MaterialTheme.typography.titleMedium)
                }
            }

            TextButton(
                onClick = onBackToLogin,
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("I already have an account")
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

/** A titled card that groups related fields, so the form reads as three short steps. */
@Composable
private fun FormSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            content()
        }
    }
}
