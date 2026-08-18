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
