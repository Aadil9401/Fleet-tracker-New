package co.za.cspc.fleettracker.data.model

import java.util.Locale

/**
 * How a registration plate is written out.
 *
 * Registrations are typed by hand in three places — the vehicle upload, the admin's
 * vehicle form and the employee's own sign-up — so the same car arrives as "BC45DFGP",
 * "bc 45 df gp" and "BC-45-DF-GP". A column of those does not read as a column of the
 * same kind of thing. Every Gauteng plate is shown as XX 77 XX GP.
 *
 * DISPLAY ONLY, exactly like [String.asCaptured] for names: the stored value keeps
 * whatever was typed, so this can be changed or dropped later without touching any
 * data. Matching a plate to a vehicle still goes through [key], which strips everything
 * that is not a letter or a digit — spacing has never been part of identity here and
 * must not become part of it.
 *
 * The same rule exists once more, in the admin portal's index.html, because a
 * self-contained HTML file with no build step cannot reach Kotlin. The specification
 * both answer to is `plate-format-cases.csv` at the repo root, and `PlateFormatTest`
 * runs this copy against it.
 */
object PlateFormat {

    /**
     * A plate reduced to letters and digits, uppercased — what two registrations are
     * compared on. "ND 123-456", "nd123456" and "ND123456" are one vehicle.
     */
    fun key(registration: String): String =
        registration.uppercase(Locale.ROOT).filter { it.isLetterOrDigit() }

    /** The current shape: two letters, two or three digits, two letters, province. */
    private val CURRENT = Regex("""^([A-Z]{2})(\d{2,3})([A-Z]{2})([A-Z]{2})$""")

    /** The one before it: three letters, three digits, province. */
    private val OLDER = Regex("""^([A-Z]{3})(\d{3})([A-Z]{2})$""")

    /** Older still, and with no province code: two letters and six digits. */
    private val OLDEST = Regex("""^([A-Z]{2})(\d{3})(\d{3})$""")

    /**
     * The plate as it should be shown.
     *
     * An unrecognised shape is uppercased, has its spacing collapsed, and is otherwise
     * handed back untouched. Guessing at a shape this does not know would turn a plate
     * that was merely untidy into one that is wrong, with nothing to show the admin that
     * it had happened.
     */
    fun display(registration: String): String {
        val stripped = key(registration)
        CURRENT.find(stripped)?.let { m ->
            val (a, digits, b, province) = m.destructured
            return "$a $digits $b $province"
        }
        OLDER.find(stripped)?.let { m ->
            val (letters, digits, province) = m.destructured
            return "$letters $digits $province"
        }
        OLDEST.find(stripped)?.let { m ->
            val (letters, first, second) = m.destructured
            return "$letters $first $second"
        }
        return registration.uppercase(Locale.ROOT).trim().replace(Regex("""\s+"""), " ")
    }

    /**
     * Whether a plate matches what someone typed into a search box, ignoring spacing and
     * punctuation on both sides — so "xx77" and "XX 77" both find "XX 77 XX GP". Typing
     * the plate as it is displayed has to work, and so does typing it as it was stored.
     */
    fun matches(registration: String, query: String): Boolean {
        val needle = key(query)
        return needle.isNotEmpty() && key(registration).contains(needle)
    }
}
