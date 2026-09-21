package co.za.cspc.fleettracker.data.model

/**
 * ANNUAL LEAVE, BOOKED BY THE PERSON TAKING IT.
 *
 * Aadil: "if an employee takes annual leave, they should be able to select their leave
 * dates on the app, this will help for daily tracking and employee not being recorded for
 * days on leave."
 *
 * A DAY OF LEAVE IS A DAY NOT WORKING, which this app already has a shape for: a timeLog
 * carrying notWorking and a reason. The day view counts those as "off" rather than "not
 * started", the reports show the reason, and the attendance count already leaves them out.
 * So leave writes the thing that already exists, one day at a time, rather than inventing
 * a second kind of absence the rest of the app would have to learn about.
 *
 * That also means leave needs NO new collection and NO rules change: an employee may
 * already create their own time log for any date.
 */
object Leave {

    /** What the reason column says, so the portal and the phone agree on the word. */
    const val REASON = "Annual leave"

    /**
     * The longest run that can be booked at once.
     *
     * Not a policy about how much leave anybody has — it is a guard against a mistyped
     * year, which would otherwise write three hundred and sixty-five days of absence and
     * take an admin an afternoon to undo.
     */
    const val MOST_DAYS = 60

    sealed interface Verdict {
        /** The days to write, in order, first to last. */
        data class Ready(val dates: List<String>) : Verdict
        data class Refused(val why: String) : Verdict
    }

    private val ISO = Regex("""\d{4}-\d{2}-\d{2}""")

    /**
     * Every day from one date to another, inclusive.
     *
     * BOTH ENDS INCLUDED, because "I am off from Monday to Friday" means five days and
     * anybody entering it will say those two dates. Excluding the last would take a day
     * of leave off them, silently, in the direction that makes them look absent.
     *
     * GIVEN THE WRONG WAY ROUND THEY ARE SWAPPED rather than refused: somebody setting a
     * range moves one picker at a time, so "from Friday to Monday" is a state the screen
     * passes through on the way to what was meant.
     *
     * The date arithmetic is done on the string rather than with a calendar so this stays
     * a plain JVM object with no Android in it — and so a day is exactly a day, with no
     * daylight saving to lose one in. South Africa has none, but nothing here should
     * depend on that.
     */
    fun days(from: String?, to: String?, today: String): Verdict {
        val a = (from ?: "").trim()
        val b = (to ?: "").trim()
        if (a.isEmpty() || b.isEmpty()) return Verdict.Refused("Choose both dates")
        if (!ISO.matches(a) || !ISO.matches(b)) {
            return Verdict.Refused("The dates must look like 2026-09-21")
        }
        val (first, last) = if (a <= b) a to b else b to a

        // A year either side of today. Further than that is a mistyped year, not a plan.
        if (first < yearsFrom(today, -1) || last > yearsFrom(today, 1)) {
            return Verdict.Refused("That is more than a year away — check the year")
        }

        val dates = mutableListOf<String>()
        var day = first
        while (day <= last) {
            dates.add(day)
            if (dates.size > MOST_DAYS) {
                return Verdict.Refused(
                    "That is more than $MOST_DAYS days — book it in shorter runs"
                )
            }
            day = nextDay(day)
        }
        return Verdict.Ready(dates)
    }

    /** The day after, on the string. */
    internal fun nextDay(date: String): String {
        val year = date.take(4).toInt()
        val month = date.substring(5, 7).toInt()
        val day = date.takeLast(2).toInt()
        val last = daysInMonth(year, month)
        return when {
            day < last -> iso(year, month, day + 1)
            month < 12 -> iso(year, month + 1, 1)
            else -> iso(year + 1, 1, 1)
        }
    }

    internal fun daysInMonth(year: Int, month: Int): Int = when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        // The full rule, not "divisible by four": 2100 is not a leap year, and a phone
        // still running this in 2100 should not book somebody an extra day of leave.
        else -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
    }

    private fun iso(year: Int, month: Int, day: Int): String =
        "%04d-%02d-%02d".format(year, month, day)

    /** The same day a year on or back, for the bounds above. */
    internal fun yearsFrom(date: String, years: Int): String =
        (date.take(4).toInt() + years).toString() + date.drop(4)

    /**
     * How the run reads back to the person booking it.
     *
     * One day says the day; a run says both ends and how many, because "5 days" is the
     * number they are checking against their own leave balance.
     */
    fun summary(dates: List<String>): String = when (dates.size) {
        0 -> "No days"
        1 -> dates.first()
        else -> "${dates.first()} to ${dates.last()} — ${dates.size} days"
    }
}
