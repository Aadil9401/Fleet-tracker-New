package co.za.cspc.fleettracker.data.model

/**
 * WHAT COUNTS AS AN ODOMETER READING.
 *
 * Aadil, 2 Nov 2026: "WRITE ME A RULE FOR VEHICLE MILEAGE TO NOT ALLOW MORE THAN 6
 * DIGITS". So 0 to 999 999 km, and no further.
 *
 * WHY A CEILING MATTERS ON A NUMBER THAT ONLY GOES UP. Every path that writes a reading
 * clamps UPWARD: the phone refuses one lower than the last reading, and recording a
 * service takes the higher of the two. Each is right on its own — a driver's clock-in
 * must never drag a reading backwards — but together they make a mistyped extra digit
 * permanent. One stray keypress at knock off turns 85 000 into 850 000, and from then on
 * the vehicle reads as wildly overdue, sends a reminder every day, and no driver can
 * bring it back. Only an admin can, through Correct the odometer, and only once somebody
 * works out why the reminders will not stop.
 *
 * Six digits is also what the instrument shows. A vehicle at 999 999 km has rolled over,
 * so a reading above that is a typo rather than a long life.
 *
 * Free of any Firebase import so it can be unit tested against the shared specification
 * — the sixth rule in this project held that way, after the service schedule, the
 * parking curfew, the plate format, the performance figures and the debt.
 *
 * The specification is odometer-cases.csv at the repo root, and the admin portal's
 * odometerVerdict is run against the same table. A ceiling held on one side only is a
 * ceiling the other side does not have, and the side without it is the way a bad reading
 * gets in.
 */
object Odometer {

    /** The highest reading there is: six digits, all nines. */
    const val MOST_KM = 999_999L

    /** How many digits that is, for anything that wants to say so on screen. */
    const val MOST_DIGITS = 6

    sealed interface Verdict {
        data class Ready(val km: Long) : Verdict
        data class Refused(val why: String) : Verdict
    }

    /**
     * A typed reading, or why it is not one.
     *
     * JUDGED ON ITS VALUE, NOT ON ITS LENGTH. "0085000" is 85 000 km written with two
     * stray zeros in front, and counting characters would refuse a correct reading
     * because a keyboard repeated a key. What is being stopped is a number too big, not
     * a string too long.
     *
     * Grouping spaces and commas are allowed because a person reading 85 000 off a dial
     * types it the way they see it, and a spreadsheet writes it that way too. Everything
     * else is refused rather than salvaged: a decimal point, a sign, an exponent or a
     * stray letter all mean the entry was not a reading, and guessing which part of it
     * was meant is how the wrong number gets stored with nobody the wiser.
     */
    fun read(typed: String?): Verdict {
        val text = (typed ?: "").trim()
        if (text.isEmpty()) {
            return Verdict.Refused("Enter the odometer reading.")
        }
        // Grouping only, and only between digits — so "85 000" and "85,000" are a
        // number while "8 5 0 0 0 km" and "-1" are not.
        val bare = text.replace(" ", "").replace(",", "")
        if (!bare.all { it in '0'..'9' }) {
            return Verdict.Refused(
                "Enter the reading as a whole number of kilometres, digits only."
            )
        }
        val km = bare.toLongOrNull()
            ?: return Verdict.Refused("That is not a reading this app can store.")
        if (km > MOST_KM) {
            return Verdict.Refused(
                "An odometer reading is at most $MOST_DIGITS digits — "
                    + "${format(MOST_KM)} km. Check for an extra digit."
            )
        }
        return Verdict.Ready(km)
    }

    /** True when the value is one this app will store. For callers holding a number. */
    fun isAllowed(km: Long): Boolean = km in 0L..MOST_KM

    /** "999 999", grouped the way South Africa writes it. */
    fun format(km: Long): String =
        km.toString().reversed().chunked(3).joinToString(" ").reversed()
}
