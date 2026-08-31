package co.za.cspc.fleettracker.ui.admin

import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.ParkingCurfew
import co.za.cspc.fleettracker.data.model.PlateFormat
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import co.za.cspc.fleettracker.ui.hoursLabel
import co.za.cspc.fleettracker.ui.km
import co.za.cspc.fleettracker.ui.rand
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** How a figure reads at a glance. */
enum class FigureTone { NEUTRAL, BAD, WARN, CALM }

/** One figure on the day view, and the key its rows are looked up by. */
data class DayFigure(
    val key: String,
    val caption: String,
    val value: String,
    val tone: FigureTone
)

/** One line behind a figure: who or what, then a cell per trailing column. */
data class BreakdownRow(
    val heading: String,
    /** Their posting, or the vehicle's registration. Blank when there is none. */
    val meta: String,
    val cells: List<String>
)

/**
 * The rows behind one figure. [columns] includes the heading column, so
 * `columns.size == rows.first().cells.size + 1`.
 */
data class Breakdown(
    val title: String,
    val columns: List<String>,
    val rows: List<BreakdownRow>,
    /** What to say instead of an empty table. A figure of zero should explain itself. */
    val empty: String,
    /** What one row is, singular, so the count above the table reads as English. */
    val noun: String = "person"
) {
    /** "1 person", "4 people", "3 vehicles". */
    val countLabel: String
        get() = when {
            rows.size == 1 -> "1 $noun"
            noun == "person" -> "${rows.size} people"
            else -> "${rows.size} ${noun}s"
        }
}

/**
 * What one province's day adds up to.
 *
 * Counted three ways rather than as one headcount, because "12 people" hides the
 * difference between a province where everyone worked and one where half of them never
 * logged in — which is the thing an admin is scanning these for.
 */
data class DayTotals(
    val people: Int,
    val worked: Int,
    val notWorking: Int,
    val noEntry: Int,
    val minutes: Long,
    val km: Long,
    val fuelRands: Double,
    /** When the first of them started, and when the last knocked off. 0 for neither. */
    val firstStartMillis: Long,
    val lastEndMillis: Long
)

/**
 * What is behind each figure on the day view.
 *
 * A figure on its own says something needs attention without saying who, which meant
 * reading the number and then hunting for names in the list underneath. Service due in
 * particular named no driver anywhere — and somebody has to be told to take the vehicle
 * in.
 *
 * A plain object taking lists rather than a ViewModel or a Composable, so the same
 * reasoning the admin acts on can be unit tested on a JVM. The admin portal shows the
 * same eight figures under the same rules; [FIGURE_KEYS] is the set both sides use, and
 * the portal's render test pins its own copy of it.
 */
object DayBreakdown {

    /**
     * In the order they are shown. A figure whose key has no branch in [of] would open
     * nothing at all, silently, so the set is pinned by DayBreakdownTest.
     */
    val FIGURE_KEYS = listOf(
        "started", "notstarted", "knockedoff", "hours",
        "distance", "fuel", "late", "service"
    )

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.US).apply {
        // The curfew is judged in SAST, so the times shown beside it are read in SAST
        // too. A phone in another zone would otherwise print 17:45 next to "15 min late".
        timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
    }

    /** The eight tiles, with the figure each one shows. */
    fun figures(
        employees: List<UserProfile>,
        logs: List<TimeLog>,
        fuelLogs: List<FuelLog>,
        vehicles: List<Vehicle>,
        nowMillis: Long
    ): List<DayFigure> {
        val activeCount = employees.count { it.active }
        val notStarted = notStartedEmployees(employees, logs).size
        val parkedLate = logs.count { it.isParkedLate }
        val servicesDue = vehicles.count { it.isServiceDue(nowMillis) }

        return listOf(
            // "Not started" gets its own tile because it is the number that needs acting
            // on, and reading it off "12/40" meant doing arithmetic to find it.
            DayFigure(
                "started", "Started", "${logs.count { it.hasStarted }}/$activeCount",
                if (notStarted > 0) FigureTone.WARN else FigureTone.NEUTRAL
            ),
            DayFigure(
                "notstarted", "Not started", notStarted.toString(),
                if (notStarted > 0) FigureTone.BAD else FigureTone.CALM
            ),
            DayFigure(
                "knockedoff", "Knocked off", logs.count { it.hasEnded }.toString(),
                FigureTone.NEUTRAL
            ),
            DayFigure(
                "hours", "Hours", logs.sumOf { it.minutesWorked }.hoursLabel(),
                FigureTone.NEUTRAL
            ),
            DayFigure(
                "distance", "Distance", logs.sumOf { it.kmTravelled }.km(),
                FigureTone.NEUTRAL
            ),
            DayFigure(
                "fuel", "Fuel", fuelLogs.sumOf { it.amountSpentRands }.rand(),
                FigureTone.NEUTRAL
            ),
            DayFigure(
                "late", "Parked late", parkedLate.toString(),
                if (parkedLate > 0) FigureTone.WARN else FigureTone.CALM
            ),
            DayFigure(
                "service", "Service due", servicesDue.toString(),
                if (servicesDue > 0) FigureTone.BAD else FigureTone.CALM
            )
        )
    }

    /**
     * The rows behind one figure, or null for a key that has none — which would be a
     * programming error, not something an admin can reach.
     */
    fun of(
        key: String,
        employees: List<UserProfile>,
        logs: List<TimeLog>,
        fuelLogs: List<FuelLog>,
        vehicles: List<Vehicle>,
        nowMillis: Long
    ): Breakdown? {

        /** Name and posting from a uid, falling back to the name stored on the log. */
        fun posting(uid: String): String {
            val found = employees.firstOrNull { it.uid == uid } ?: return ""
            return listOf(found.province, found.teamName)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
        }

        fun row(uid: String, fallbackName: String, vararg cells: String): BreakdownRow {
            val found = employees.firstOrNull { it.uid == uid }
            val name = found?.fullName?.takeIf { it.isNotBlank() }
                ?: fallbackName.takeIf { it.isNotBlank() }
                ?: "Unknown"
            return BreakdownRow(name, posting(uid), cells.toList())
        }

        fun at(millis: Long): String = if (millis > 0L) timeFormat.format(Date(millis)) else "—"

        return when (key) {
            "started" -> Breakdown(
                title = "Started",
                columns = listOf("Employee", "Start"),
                empty = "Nobody has started yet.",
                rows = logs.filter { it.hasStarted }
                    .sortedBy { it.startTimeMillis }
                    .map { row(it.uid, it.employeeName, at(it.startTimeMillis)) }
            )

            "notstarted" -> Breakdown(
                title = "No entry yet",
                columns = listOf("Employee"),
                empty = "Everyone is accounted for.",
                rows = notStartedEmployees(employees, logs)
                    .map { BreakdownRow(it.fullName, posting(it.uid), emptyList()) }
            )

            "knockedoff" -> Breakdown(
                title = "Knocked off",
                columns = listOf("Employee", "Knock off", "Hours"),
                empty = "Nobody has knocked off yet.",
                rows = logs.filter { it.hasEnded }
                    .sortedByDescending { it.endTimeMillis }
                    .map {
                        row(
                            it.uid, it.employeeName, at(it.endTimeMillis),
                            it.minutesWorked.hoursLabel()
                        )
                    }
            )

            "hours" -> Breakdown(
                title = "Hours worked",
                columns = listOf("Employee", "Hours"),
                empty = "No completed days yet.",
                rows = logs.filter { it.minutesWorked > 0L }
                    .sortedByDescending { it.minutesWorked }
                    .map { row(it.uid, it.employeeName, it.minutesWorked.hoursLabel()) }
            )

            "distance" -> Breakdown(
                title = "Distance travelled",
                columns = listOf("Employee", "Distance"),
                empty = "No distance recorded yet.",
                rows = logs.filter { it.hasEnded && it.kmTravelled > 0L }
                    .sortedByDescending { it.kmTravelled }
                    .map { row(it.uid, it.employeeName, it.kmTravelled.km()) }
            )

            "fuel" -> {
                // Totalled per person, not per receipt: two fills in one day are one
                // person's spend, and the tile above adds them up that way.
                val spentBy = fuelLogs.groupBy { it.uid }
                    .mapValues { (_, fills) -> fills.sumOf { it.amountSpentRands } }
                    .filter { it.value > 0.0 }
                Breakdown(
                    title = "Fuel spent",
                    columns = listOf("Employee", "Fuel"),
                    empty = "No fuel logged yet.",
                    rows = spentBy.entries.sortedByDescending { it.value }.map { (uid, spent) ->
                        val onTheReceipt = fuelLogs.firstOrNull { it.uid == uid }?.employeeName ?: ""
                        row(uid, onTheReceipt, spent.rand())
                    }
                )
            }

            "late" -> Breakdown(
                title = "Parked after ${ParkingCurfew.PARK_BY}",
                columns = listOf("Employee", "Knocked off", "Late by"),
                empty = "Everyone was parked by ${ParkingCurfew.PARK_BY}.",
                rows = logs.filter { it.isParkedLate }
                    .sortedByDescending { it.minutesParkedLate }
                    .map { row(it.uid, it.employeeName, at(it.endTimeMillis), it.lateLabel) }
            )

            "service" -> {
                // Who is driving it matters more than the vehicle on its own — somebody
                // has to be told to take it in.
                val holderByReg = employees
                    .filter { PlateFormat.key(it.vehicleRegistration).isNotEmpty() }
                    .associateBy { PlateFormat.key(it.vehicleRegistration) }
                Breakdown(
                    title = "Due for a service",
                    columns = listOf("Vehicle", "Next service", "Assigned to"),
                    empty = "Nothing due.",
                    noun = "vehicle",
                    rows = vehicles.filter { it.isServiceDue(nowMillis) }
                        .sortedBy { it.nextServiceAtKm() }
                        .map { vehicle ->
                            val holder = holderByReg[PlateFormat.key(vehicle.registrationNumber)]
                            val nextAt = vehicle.nextServiceAtKm()
                            BreakdownRow(
                                heading = vehicle.name
                                    .ifBlank { PlateFormat.display(vehicle.registrationNumber) },
                                meta = PlateFormat.display(vehicle.registrationNumber),
                                cells = listOf(
                                    if (nextAt > 0L) nextAt.km() else "—",
                                    holder?.fullName ?: "nobody"
                                )
                            )
                        }
                )
            }

            else -> null
        }
    }

    /**
     * The totals for one group of the day's rows — a province, or the whole day.
     *
     * Plain summation with no judgement in it, so unlike the service rules and the
     * curfew this does not get a shared table of its own; the portal computes the same
     * figures from the same fields, and DayBreakdownTest pins these.
     *
     * [employees] is needed because someone with no log at all is still one of the
     * province's people — they are the no-entry count, and leaving them out would make a
     * province look smaller on a bad day than on a good one.
     */
    fun totalsFor(
        employees: List<UserProfile>,
        logs: List<TimeLog>,
        fuelLogs: List<FuelLog>
    ): DayTotals {
        val withEntries = logs.map { it.uid }.toSet()
        val noEntry = employees.count { it.active && it.uid !in withEntries }
        val started = logs.filter { it.hasStarted }
        val ended = logs.filter { it.hasEnded }
        // The group's people, not just those with a log. Someone can have a fuel log and
        // no time log — a day recorded then removed, or fuel entered before clocking in —
        // and filtering on logs alone would drop that spend out of every province total,
        // so the totals would not add up to the day view's own Fuel figure.
        val uids = (logs.map { it.uid } + employees.map { it.uid }).toSet()
        return DayTotals(
            people = logs.size + noEntry,
            worked = logs.count { !it.notWorking },
            notWorking = logs.count { it.notWorking },
            noEntry = noEntry,
            minutes = logs.sumOf { it.minutesWorked },
            km = logs.sumOf { it.kmTravelled },
            fuelRands = fuelLogs.filter { it.uid in uids }.sumOf { it.amountSpentRands },
            firstStartMillis = started.minOfOrNull { it.startTimeMillis } ?: 0L,
            lastEndMillis = ended.maxOfOrNull { it.endTimeMillis } ?: 0L
        )
    }

    /**
     * Who is unaccounted for: active employees who have neither clocked in nor marked
     * themselves as not working. Someone who is off is accounted for, so they don't
     * belong on a chase-up list.
     */
    fun notStartedEmployees(
        employees: List<UserProfile>,
        logs: List<TimeLog>
    ): List<UserProfile> {
        val accountedFor = logs.filter { it.hasStarted || it.notWorking }.map { it.uid }.toSet()
        return employees.filter { it.active && it.uid !in accountedFor }
            .sortedBy { it.fullName.lowercase(Locale.ROOT) }
    }

}
