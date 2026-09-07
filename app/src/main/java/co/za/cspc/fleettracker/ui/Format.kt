package co.za.cspc.fleettracker.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import java.util.Locale

/**
 * Renders a captured detail in capitals, so lists line up no matter how each person
 * typed it — "eastern cape", "Eastern Cape" and "EASTERN CAPE" all read the same.
 *
 * Display only: the stored value keeps the original casing, so this can be changed
 * or removed later without touching any data.
 *
 * Deliberately NOT applied to email addresses — an uppercased address is hard to
 * read back to someone and looks like a mistake.
 */
fun String.asCaptured(): String = uppercase(Locale.ROOT)

/**
 * Draws what is being TYPED in capitals - the phone's answer to the text-transform the
 * portal puts on its own input boxes, so a team name looks the same while it is being
 * entered as it will once it is saved.
 *
 * Display only, exactly like [asCaptured]: the value handed to onValueChange, and so the
 * value stored, keeps whatever was typed. Nothing about matching or about the data itself
 * changes, and this can be removed later without touching a record.
 *
 * NOT for email addresses or passwords - an uppercased address is hard to read back to
 * somebody, and a password is not display text at all.
 */
val CAPITALS_WHILE_TYPING: VisualTransformation = object : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val shouted = text.text.uppercase(Locale.ROOT)
        // uppercase() is one character for one across Latin, but not across every
        // script - "ß" becomes "SS" - and the identity mapping below assumes the
        // two strings line up. Left as typed when they do not: a caret that lands in
        // the wrong place is worse than a lower-case letter.
        if (shouted.length != text.text.length) {
            return TransformedText(text, OffsetMapping.Identity)
        }
        return TransformedText(AnnotatedString(shouted), OffsetMapping.Identity)
    }
}

/**
 * Grouped thousands with a space, the South African convention: 85000 becomes
 * "85 000". Long odometer figures are hard to read as an unbroken run of digits.
 */
fun Long.grouped(): String = String.format(Locale.US, "%,d", this).replace(',', ' ')

/** "85 000 km" — the same grouping, with the unit. */
fun Long.km(): String = "${grouped()} km"

/**
 * "R1 234,50" — the South African convention, space thousands and a comma decimal,
 * matching what the admin portal prints for the same figure. Money is always shown to
 * the cent: a fuel total that rounds to the rand looks like an estimate.
 */
fun Double.rand(): String {
    val formatted = String.format(Locale.US, "%,.2f", this)
    return "R" + buildString(formatted.length) {
        formatted.forEach { append(if (it == ',') ' ' else if (it == '.') ',' else it) }
    }
}

/** "9h 25m", or a dash for a day with nothing on the clock yet. */
fun Long.hoursLabel(): String = if (this > 0L) "${this / 60}h ${this % 60}m" else "—"
