package co.za.cspc.fleettracker.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// A soft pastel scheme: sage green leads, with blush and lavender as accents.
//
// The pastels live in the *container* and surface roles — cards, chips, tiles and
// badges. The `primary`/`secondary` roles stay a few shades deeper than the pastel
// they pair with, because those carry white text on buttons; a genuinely pastel
// button would leave its label barely readable in daylight, which is the usual way
// this kind of palette goes wrong.

private val LightColors = lightColorScheme(
    primary = Color(0xFF44786B),          // muted sage — deep enough for white text
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFCFE8DF),  // soft mint
    onPrimaryContainer = Color(0xFF14342C),

    secondary = Color(0xFFB06E4E),         // warm terracotta
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFF9E0CE), // blush peach
    onSecondaryContainer = Color(0xFF44230F),

    tertiary = Color(0xFF6C6193),          // dusty lavender
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFE6E0F6),
    onTertiaryContainer = Color(0xFF241C42),

    background = Color(0xFFF7FAF8),        // barely-there mint wash
    onBackground = Color(0xFF1E2A26),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1E2A26),         // soft charcoal, never pure black
    surfaceVariant = Color(0xFFE8EFEB),
    onSurfaceVariant = Color(0xFF54605B),
    outline = Color(0xFFB7C5BF),
    outlineVariant = Color(0xFFDCE5E1),

    error = Color(0xFFB0564B),             // muted clay rather than a harsh red
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFADED9),
    onErrorContainer = Color(0xFF44150F)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA9D6C8),
    onPrimary = Color(0xFF10332A),
    primaryContainer = Color(0xFF2F5349),
    onPrimaryContainer = Color(0xFFC6EADE),

    secondary = Color(0xFFF0BC9A),
    onSecondary = Color(0xFF44230F),
    secondaryContainer = Color(0xFF6A4429),
    onSecondaryContainer = Color(0xFFFBDDC7),

    tertiary = Color(0xFFC5B9E9),
    onTertiary = Color(0xFF2A2150),
    tertiaryContainer = Color(0xFF493F72),
    onTertiaryContainer = Color(0xFFE6E0F6),

    background = Color(0xFF141A18),
    onBackground = Color(0xFFE3E9E6),
    surface = Color(0xFF1C2321),
    onSurface = Color(0xFFE3E9E6),
    surfaceVariant = Color(0xFF2F3936),
    onSurfaceVariant = Color(0xFFBAC7C1),
    outline = Color(0xFF7E8C87),
    outlineVariant = Color(0xFF2F3936),

    error = Color(0xFFF0B3AA),
    onError = Color(0xFF57201A),
    errorContainer = Color(0xFF78332B),
    onErrorContainer = Color(0xFFFADED9)
)

// Generously rounded corners throughout — the single cheapest thing that makes a
// utilitarian form-heavy app feel considered rather than stock.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun FleetTrackerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        shapes = AppShapes,
        content = content
    )
}
