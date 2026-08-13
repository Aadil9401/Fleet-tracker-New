package co.za.cspc.fleettracker.ui.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import co.za.cspc.fleettracker.data.model.SA_PROVINCES
import co.za.cspc.fleettracker.data.model.UserProfile

@Composable
fun SignUpScreen(
    onSignedUp: (UserProfile) -> Unit,
    onBackToLogin: () -> Unit,
    viewModel: SignUpViewModel = viewModel()
) {
    val state = viewModel.uiState
    var provinceMenuOpen by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Create your account", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = state.name,
            onValueChange = viewModel::onNameChange,
            label = { Text("Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.surname,
            onValueChange = viewModel::onSurnameChange,
            label = { Text("Surname") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text("Email address") },
            supportingText = { Text("You'll use this to sign in") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.employeeNumber,
            onValueChange = viewModel::onEmployeeNumberChange,
            label = { Text("Employee number") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        Box(Modifier.fillMaxWidth()) {
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

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.teamName,
            onValueChange = viewModel::onTeamNameChange,
            label = { Text("Team name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
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
        Spacer(Modifier.height(12.dp))
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

        if (state.error != null) {
            Spacer(Modifier.height(8.dp))
            Text(state.error, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { viewModel.signUp(onSignedUp) },
            enabled = state.canSubmit,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (state.loading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("Create account")
            }
        }
        TextButton(onClick = onBackToLogin, enabled = !state.loading) {
            Text("I already have an account")
        }
    }
}
