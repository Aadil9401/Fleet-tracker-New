package co.za.cspc.fleettracker.data.model

/**
 * Whether today is somebody's birthday, and what to say to them.
 *
 * Aadil asked for a greeting on every employee's main screen. It is a small thing that
 * has to be exactly right: a birthday message on the wrong day, or to somebody whose
 * date of birth was never captured, is worse than no message at all. So everything here
 * FAILS QUIET — a date that cannot be read means no greeting, never a guess.
 *
 * No Firebase import, so it can be unit tested. The date it compares against is passed
 * in rather than read from the clock, for the same reason: a test that depends on what
 * day it is when CI happens to run is a test that breaks on its own.
 */
object Birthday {

    /**
     * Only yyyy-MM-dd is read, which is the one shape the portal stores.
     *
     * Deliberately strict. Guessing at "01/09" would eventually greet somebody on the
     * ninth of January because a spreadsheet wrote the day first, and the portal already
     * normalises a date on the way in — so anything else reaching here is a record that
     * was never captured properly, and the honest answer is silence.
     */
    private val STORED = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

    private fun isLeapYear(year: Int): Boolean =
        year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)

    private fun daysInMonth(year: Int, month: Int): Int = when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if (isLeapYear(year)) 29 else 28
        else -> 0
    }

    /** year, month, day — or null if that is not a real date. */
    private fun parse(date: String): Triple<Int, Int, Int>? {
        val match = STORED.matchEntire(date.trim()) ?: return null
        val (y, m, d) = match.destructured
        val year = y.toInt()
        val month = m.toInt()
        val day = d.toInt()
        if (month < 1 || month > 12) return null
        if (day < 1 || day > daysInMonth(year, month)) return null
        return Triple(year, month, day)
    }

    /**
     * Is [today] their birthday?
     *
     * The YEAR of birth is ignored on purpose. It is the one part of a date of birth
     * that gets typed wrong — a 2026 where 1986 was meant — and none of it matters to
     * the question being asked. A record with a nonsense year still gets its greeting on
     * the right day.
     *
     * SOMEBODY BORN ON 29 FEBRUARY is greeted on the 28th in the three years out of four
     * that have no 29th. They have a birthday every year even when the calendar does not,
     * and being skipped three times running is exactly the sort of thing this feature is
     * meant to avoid.
     */
    fun isToday(dateOfBirth: String, today: String): Boolean {
        val born = parse(dateOfBirth) ?: return false
        val now = parse(today) ?: return false
        if (born.second == now.second && born.third == now.third) return true
        return born.second == 2 && born.third == 29 &&
            now.second == 2 && now.third == 28 && !isLeapYear(now.first)
    }

    /**
     * Aadil's wording, with their first name in it.
     *
     * Takes the name already in whatever case it should be shown in — the capitals rule
     * lives in the UI layer, and reaching into it from here would invert the layering to
     * save one call. Somebody with no first name on their record still gets greeted,
     * because "Happy birthday , have a blessed day" would be worse than no name at all.
     */
    fun greeting(name: String): String {
        val first = name.trim().split(Regex("\\s+")).firstOrNull().orEmpty()
        return if (first.isEmpty()) "Happy birthday, have a blessed day"
        else "Happy birthday $first, have a blessed day"
    }
}
