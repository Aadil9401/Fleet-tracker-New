package co.za.cspc.fleettracker.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import co.za.cspc.fleettracker.ui.admin.AdminDashboardScreen
import co.za.cspc.fleettracker.ui.employee.EmployeeHomeScreen
import co.za.cspc.fleettracker.ui.login.LoginScreen

private object Routes {
    const val LOGIN = "login"
    const val EMPLOYEE = "employee"
    const val ADMIN = "admin"
}

@Composable
fun AppNavHost(repo: FleetRepository = FleetRepository()) {
    val navController: NavHostController = rememberNavController()
    var profile by remember { mutableStateOf<UserProfile?>(null) }
    var checkingSession by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        if (repo.currentUid != null) {
            val existing = repo.currentUserProfile()
            if (existing != null && existing.active) {
                profile = existing
            } else {
                repo.logout()
            }
        }
        checkingSession = false
    }

    if (checkingSession) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val startDestination = when {
        profile?.isAdmin == true -> Routes.ADMIN
        profile != null -> Routes.EMPLOYEE
        else -> Routes.LOGIN
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.LOGIN) {
            LoginScreen(onLoggedIn = { loggedInProfile ->
                profile = loggedInProfile
                val destination = if (loggedInProfile.isAdmin) Routes.ADMIN else Routes.EMPLOYEE
                navController.navigate(destination) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            })
        }
        composable(Routes.EMPLOYEE) {
            profile?.let { p ->
                EmployeeHomeScreen(
                    profile = p,
                    onLogout = {
                        repo.logout()
                        profile = null
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }
        }
        composable(Routes.ADMIN) {
            AdminDashboardScreen(
                onLogout = {
                    repo.logout()
                    profile = null
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
