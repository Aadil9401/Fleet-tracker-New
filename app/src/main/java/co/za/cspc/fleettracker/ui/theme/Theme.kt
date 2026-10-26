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

// A restrained, neutral-led scheme: slate blue leads, steel and amber support.
//
// This replaced a sage/peach/lavender pastel set. Pastels read as friendly on a
// designer's screen and as unserious on a rep's phone in a branch, which is where this
// is actually used — and three soft hues competing meant nothing on screen looked more
// important than anything else.
//
// The rules here:
//
//   Colour carries MEANING, not decoration. Slate is the app's own chrome and its
//   primary actions. Amber means attention — a service due, a disc expiring. Red means
//   refused. Nothing else is tinted, so the things that are tinted get noticed.
//
//   Surfaces are NEUTRAL grey, never tinted. A background with a wash of the brand
//   colour in it reads as a colour cast across the whole screen rather than as a
//   surface, and it drags every figure sitting on it towards the same hue.
//
//   Text is near-black on near-white, not grey on tinted. The old scheme's body text
//   sat at about 7:1; this sits past 12:1, which is the difference between readable in
//   a car park and readable at a desk.

private val LightColors = lightColorScheme(
    primary = Color(0xFF1F3A5F),           // deep slate blue — the app's own colour
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFDCE4EF),  // a quiet tint, for selected states only
    onPrimaryContainer = Color(0xFF13263F),

    secondary = Color(0xFF4A5A6A),         // steel — secondary actions, never competing
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE2E6EA),
    onSecondaryContainer = Color(0xFF1E262E),

    // ATTENTION, and nothing else. A service coming due, a disc about to expire. If this
    // colour is on screen something wants doing, which is only true while it is rare.
    tertiary = Color(0xFF8A5A00),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFCE9C8),
    onTertiaryContainer = Color(0xFF2E1D00),

    background = Color(0xFFF4F5F7),        // neutral grey, no tint
    onBackground = Color(0xFF14171A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF14171A),         // near-black: this is a working document
    surfaceVariant = Color(0xFFECEEF1),
    onSurfaceVariant = Color(0xFF4C535A),
    outline = Color(0xFFC3C8CE),
    outlineVariant = Color(0xFFE3E6E9),

    error = Color(0xFFB3261E),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA8C4E8),
    onPrimary = Color(0xFF10243E),
    primaryContainer = Color(0xFF2B4466),
    onPrimaryContainer = Color(0xFFD6E3F7),

    secondary = Color(0xFFB4C1CE),
    onSecondary = Color(0xFF1E262E),
    secondaryContainer = Color(0xFF353E47),
    onSecondaryContainer = Color(0xFFD6DEE6),

    tertiary = Color(0xFFF2C06B),
    onTertiary = Color(0xFF442B00),
    tertiaryContainer = Color(0xFF5E4100),
    onTertiaryContainer = Color(0xFFFCE9C8),

    // Neutral here too, for the same reason as in daylight.
    background = Color(0xFF111315),
    onBackground = Color(0xFFE4E7EA),
    surface = Color(0xFF191C1F),
    onSurface = Color(0xFFE4E7EA),
    surfaceVariant = Color(0xFF2A2E33),
    onSurfaceVariant = Color(0xFFB6BDC4),
    outline = Color(0xFF8A9298),
    outlineVariant = Color(0xFF2A2E33),

    error = Color(0xFFF2B8B5),
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC)
)

// Restrained corners. The old set went up to 28dp, which on a phone reads as a
// consumer app rather than a tool — and a 22dp card next to a 28dp dialog next to a
// 16dp tile is three different languages on one screen.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp)
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
