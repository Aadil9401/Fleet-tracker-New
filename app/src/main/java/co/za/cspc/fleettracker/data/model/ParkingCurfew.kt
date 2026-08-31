package co.za.cspc.fleettracker.data.model

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * The parking curfew: vehicles are meant to be parked by [PARK_BY], and a later
 * knock-off is flagged, never blocked — the day still counts in full, it just carries
 * a mark.
 *
 * Kept out of [TimeLog], and taking a date and a timestamp rather than a TimeLog, for
 * the same two reasons as [ServiceSchedule]: nothing here touches Firebase, so it can
 * be unit tested on a plain JVM; and this is then the single place the rule is written
 * on the phone side.
 *
 * The same rule exists once more, in the admin portal's index.html, because a
 * self-contained HTML file with no build step cannot reach Kotlin. The specification
 * both answer to is `parking-curfew-cases.csv` at the repo root, and
 * `ParkingCurfewTest` runs this copy against it. Change the rule there and you must
 * change it in both; CI will tell you which one you missed.
 */
object ParkingCurfew {

    /**
     * A constant rather than a setting in config/settings: a parking curfew is a
     * company rule, not a per-admin preference. Moving it is a one-line change here and
     * a one-line change in the portal, and no case in the specification needs touching
     * because they are all written as offsets from whatever this says.
     */
    const val PARK_BY = "18:30"

    /**
     * Pinned to SAST for the same reason [co.za.cspc.fleettracker.data.repository.FleetRepository]
     * pins the date it stores: the day being judged is a South African working day, and
     * a phone set to another zone would otherwise measure that day against a curfew
     * hours out of place.
     */
    private val ZONE: TimeZone = TimeZone.getTimeZone("Africa/Johannesburg")

    /** When the curfew falls on a given yyyy-MM-dd day, or 0 if that date is unusable. */
    fun curfewMillis(date: String): Long {
        val day = date.split("-").mapNotNull { it.toIntOrNull() }
        val time = PARK_BY.split(":").mapNotNull { it.toIntOrNull() }
        if (day.size != 3 || time.size != 2) return 0L
        val calendar = Calendar.getInstance(ZONE, Locale.US).apply {
            clear()
            set(day[0], day[1] - 1, day[2], time[0], time[1], 0)
        }
        return calendar.timeInMillis
    }

    /**
     * Minutes past the curfew that someone knocked off — 0 when on time, and 0 when
     * they never knocked off at all (that is a different fault, already flagged on its
     * own, and counting it here would put one person on two lists).
     *
     * Measured against that day's own curfew rather than the hour on the timestamp: a
     * knock-off after midnight reads as hour 0, so an hour check would score the very
     * latest case as the earliest of all.
     */
    fun minutesParkedLate(date: String, endTimeMillis: Long): Long {
        if (endTimeMillis <= 0L) return 0L
        val curfew = curfewMillis(date)
        if (curfew <= 0L || endTimeMillis <= curfew) return 0L
        return Math.round((endTimeMillis - curfew) / 60_000.0)
    }

    fun isParkedLate(date: String, endTimeMillis: Long): Boolean =
        minutesParkedLate(date, endTimeMillis) > 0L

    /**
     * "45 min", "1h 05m". The hours-and-minutes label used for a day's work would
     * render three quarters of an hour as "0h 45m", and the minutes are padded so a
     * column of these lines up.
     */
    fun lateLabel(minutes: Long): String = when {
        minutes <= 0L -> "—"
        minutes < 60L -> "$minutes min"
        else -> "${minutes / 60}h ${String.format(Locale.US, "%02d", minutes % 60)}m"
    }
}
