package co.za.cspc.fleettracker.ui

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
