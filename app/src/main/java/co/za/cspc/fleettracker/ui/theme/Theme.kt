package co.za.cspc.fleettracker.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Primary = Color(0xFF1B5E20)
private val PrimaryDark = Color(0xFF4C8C4A)
private val Secondary = Color(0xFFEF6C00)

private val LightColors = lightColorScheme(
    primary = Primary,
    secondary = Secondary
)

private val DarkColors = darkColorScheme(
    primary = PrimaryDark,
    secondary = Secondary
)

@Composable
fun FleetTrackerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        content = content
    )
}
