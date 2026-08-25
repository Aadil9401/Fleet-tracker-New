package co.za.cspc.fleettracker.data.model

/**
 * The service schedule rules.
 *
 * Kept out of [Vehicle], and taking plain numbers rather than a Vehicle, for two
 * reasons: nothing here touches Firebase, so it can be unit tested on a plain JVM; and
 * this is then the single place the rules are written on the phone side.
 *
 * The same rules exist twice more — in the admin portal's index.html and in the Cloud
 * Functions reminder job — because the three cannot share code across two languages and
 * three deploy roots. The specification all three answer to is
 * `service-schedule-cases.csv` at the repo root, and `ServiceScheduleTest` runs this
 * copy against it. Change a rule there and you must change it in all three; CI will
 * tell you which one you missed.
 */
object ServiceSchedule {

    /**
     * The interval as stored, with 0 meaning the vehicle has none — "not tracked by
     * kilometres", never a licence to substitute the fleet standard. The portal and the
     * reminder job both used to substitute it, which is why the same vehicle could show
     * a percentage to the admin and nothing at all to the driver.
     */
    fun intervalKm(serviceIntervalKm: Long): Long =
        if (serviceIntervalKm > 0L) serviceIntervalKm else 0L

    /**
     * The milestone the last recorded service satisfied. Servicing at 149 000 counts as
     * having done the 150 000 service, so the schedule steps on from there.
     */
    fun servicedThroughKm(serviceIntervalKm: Long, lastServiceOdometerKm: Long): Long {
        val interval = intervalKm(serviceIntervalKm)
        return if (lastServiceOdometerKm <= 0L || interval <= 0L) 0L
        else ((lastServiceOdometerKm + interval - 1) / interval) * interval
    }

    /**
     * Services fall on absolute odometer milestones — every 15 000 km on the clock by
     * default, so 15 000 / 30 000 / … / 150 000. With a service on record the schedule
     * steps on from the milestone that service satisfied, which is what restarts the
     * countdown when a vehicle is marked serviced. With no history at all it falls back
     * to the next milestone above the current reading.
     *
     * Returns 0 for a vehicle with no interval. That means "not tracked", not "due
     * now" — see [isServiceDueByKm].
     */
    fun nextServiceAtKm(
        serviceIntervalKm: Long,
        lastServiceOdometerKm: Long,
        currentOdometerKm: Long
    ): Long {
        val interval = intervalKm(serviceIntervalKm)
        return when {
            interval <= 0L -> 0L
            lastServiceOdometerKm > 0L ->
                servicedThroughKm(interval, lastServiceOdometerKm) + interval
            else -> ((currentOdometerKm / interval) + 1) * interval
        }
    }

    /**
     * 0 immediately after a service, 100 when the next falls due — or null when no
     * service has ever been recorded, since there is then nothing to measure from. A
     * fabricated 0% for an unknown history reads as "just serviced", which is worse
     * than showing nothing.
     *
     * Truncated rather than rounded. The portal used to round, so a vehicle 18.75%
     * through its window read 19% to the admin and 18% to the driver; the portal was
     * brought into line with this, on the grounds that a progress reading should not
     * overstate itself and the driver's figure is the one that gets quoted.
     */
    fun percentToNextService(
        serviceIntervalKm: Long,
        lastServiceOdometerKm: Long,
        currentOdometerKm: Long
    ): Int? {
        val interval = intervalKm(serviceIntervalKm)
        if (interval <= 0L || lastServiceOdometerKm <= 0L) return null
        val next = nextServiceAtKm(interval, lastServiceOdometerKm, currentOdometerKm)
        if (next <= lastServiceOdometerKm) return 100
        val pct = ((currentOdometerKm - lastServiceOdometerKm).toDouble() /
            (next - lastServiceOdometerKm) * 100).toInt()
        return pct.coerceIn(0, 100)
    }

    /**
     * The interval guard is not decoration: an untracked vehicle's next milestone is 0,
     * and every odometer reading is at or above 0 — so without it, every untracked
     * vehicle reports as due. Both JS copies were missing this, hidden only by their
     * habit of substituting the fleet standard.
     */
    fun isServiceDueByKm(
        serviceIntervalKm: Long,
        lastServiceOdometerKm: Long,
        currentOdometerKm: Long
    ): Boolean {
        val interval = intervalKm(serviceIntervalKm)
        return interval > 0L && currentOdometerKm >=
            nextServiceAtKm(interval, lastServiceOdometerKm, currentOdometerKm)
    }

    /**
     * Zero months means "judge by kilometres only". Without that guard a zero interval
     * would make every vehicle permanently overdue.
     */
    fun isServiceDueByDate(
        lastServiceDateMillis: Long,
        serviceIntervalMonths: Long,
        nowMillis: Long
    ): Boolean {
        if (lastServiceDateMillis <= 0L || serviceIntervalMonths <= 0L) return false
        val monthsMillis = serviceIntervalMonths * 30L * 24L * 60L * 60L * 1000L
        return nowMillis - lastServiceDateMillis >= monthsMillis
    }
}
