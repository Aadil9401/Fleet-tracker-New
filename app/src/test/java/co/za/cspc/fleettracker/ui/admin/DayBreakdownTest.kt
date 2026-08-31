package co.za.cspc.fleettracker.ui.admin

import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.ParkingCurfew
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The day view's figures and the rows behind each one.
 *
 * [DayBreakdown] deliberately takes plain lists and touches no Firebase and no
 * Compose, so the reasoning an admin acts on is checked here on a plain JVM rather
 * than only by looking at the screen. The admin portal's web/render-test.mjs makes the
 * same checks against its own copy.
 */
class DayBreakdownTest {

    // ---------- the fleet these tests are about ----------

    private val sarah = employee("u1", "Sarah", "Dube", "Gauteng", "Sandton", "ND 111-111")
    private val lerato = employee("u2", "Lerato", "Mokoena", "KwaZulu-Natal", "Durban", "ND222222")
    private val thabo = employee("u3", "Thabo", "Nkosi", "Limpopo", "Polokwane", "")
    private val naledi = employee("u4", "Naledi", "Khumalo", "Free State", "", "")
    private val retired = employee("u5", "Retired", "Person", "", "", "").copy(active = false)

    private val employees = listOf(sarah, lerato, thabo, naledi, retired)

    /** Sarah: 08:00 to 18:00, parked in time. 80 km. */
    private val sarahsDay = TimeLog(
        uid = "u1", employeeName = "Sarah Dube", date = DAY,
        startTimeMillis = curfew(-630), endTimeMillis = curfew(-30),
        startOdometerKm = 100L, endOdometerKm = 180L
    )

    /** Lerato: 08:30 to 19:15, three quarters of an hour past the curfew. 60 km. */
    private val leratosDay = TimeLog(
        uid = "u2", employeeName = "Lerato Mokoena", date = DAY,
        startTimeMillis = curfew(-600), endTimeMillis = curfew(45),
        startOdometerKm = 200L, endOdometerKm = 260L
    )

    /** Naledi is off. Thabo has no entry at all. */
    private val naledisAbsence = TimeLog(
        uid = "u4", employeeName = "Naledi Khumalo", date = DAY,
        notWorking = true, notWorkingReason = "Sick leave"
    )

    private val logs = listOf(sarahsDay, leratosDay, naledisAbsence)

    /** Sarah filled up twice in one day; Lerato once. */
    private val fuelLogs = listOf(
        FuelLog(uid = "u1", employeeName = "Sarah Dube", date = DAY, amountSpentRands = 300.00),
        FuelLog(uid = "u1", employeeName = "Sarah Dube", date = DAY, amountSpentRands = 150.50),
        FuelLog(uid = "u2", employeeName = "Lerato Mokoena", date = DAY, amountSpentRands = 100.00)
    )

    private val vehicles = listOf(
        // Due, and Sarah drives it — she is the one who has to take it in.
        vehicle("Suzuki Magnite", "ND 111-111", lastServiceKm = 15000L, currentKm = 30000L),
        // Due, and nobody has claimed it.
        vehicle("Bakkie 2", "XY 999-999", lastServiceKm = 45000L, currentKm = 60000L),
        // Not due: 20 000 on the clock against a 30 000 milestone.
        vehicle("Toyota Hilux", "GP 777-777", lastServiceKm = 15000L, currentKm = 20000L)
    )

    private fun figures() = DayBreakdown.figures(employees, logs, fuelLogs, vehicles, NOW)

    private fun opened(key: String): Breakdown =
        DayBreakdown.of(key, employees, logs, fuelLogs, vehicles, NOW)
            ?: throw AssertionError("no rows behind the \"$key\" figure")

    // ---------- the set of figures ----------

    @Test
    fun everyFigureIsShownAndOpensOntoItsRows() {
        assertEquals("eight figures, in the order they are shown",
            DayBreakdown.FIGURE_KEYS, figures().map { it.key })

        // A figure whose key has no branch behind it would open nothing at all,
        // silently, which is exactly the fault this pins.
        DayBreakdown.FIGURE_KEYS.forEach { key ->
            assertNotNull("the \"$key\" figure opens onto nothing", DayBreakdown.of(
                key, employees, logs, fuelLogs, vehicles, NOW))
        }
    }

    @Test
    fun anUnknownKeyOpensNothingRatherThanAnEmptyTable() {
        assertNull(DayBreakdown.of("notafigure", employees, logs, fuelLogs, vehicles, NOW))
    }

    @Test
    fun everyBreakdownHasAsManyCellsAsItHasColumns() {
        DayBreakdown.FIGURE_KEYS.forEach { key ->
            val breakdown = opened(key)
            breakdown.rows.forEach { row ->
                assertEquals(
                    "the \"$key\" figure's columns and its rows disagree",
                    breakdown.columns.size, row.cells.size + 1
                )
            }
        }
    }

    @Test
    fun theFiguresAddUp() {
        val byKey = figures().associate { it.key to it.value }
        assertEquals("2/4", byKey["started"])      // Thabo and Naledi have not clocked in
        assertEquals("1", byKey["notstarted"])     // but Naledi is accounted for
        assertEquals("2", byKey["knockedoff"])
        assertEquals("20h 45m", byKey["hours"])    // 10h 00m + 10h 45m
        assertEquals("140 km", byKey["distance"])  // 80 + 60
        assertEquals("R550,50", byKey["fuel"])     // 300,00 + 150,50 + 100,00
        assertEquals("1", byKey["late"])
        assertEquals("2", byKey["service"])
    }

    /** Nothing to act on must read as settled, and a shortfall must not. */
    @Test
    fun aFigureThatNeedsActingOnIsFlagged() {
        val byKey = figures().associate { it.key to it.tone }
        assertEquals(FigureTone.BAD, byKey["notstarted"])
        assertEquals(FigureTone.WARN, byKey["late"])
        assertEquals(FigureTone.BAD, byKey["service"])
        assertEquals(FigureTone.WARN, byKey["started"])

        // On a settled day the same figures rest rather than turning green.
        val settled = DayBreakdown.figures(
            listOf(sarah), listOf(sarahsDay), emptyList(), emptyList(), NOW
        ).associate { it.key to it.tone }
        assertEquals(FigureTone.CALM, settled["notstarted"])
        assertEquals(FigureTone.CALM, settled["late"])
        assertEquals(FigureTone.CALM, settled["service"])
        assertEquals(FigureTone.NEUTRAL, settled["started"])
    }

    // ---------- what is behind each one ----------

    @Test
    fun theLateFigureOpensOnTheCurfewAndNamesOnlyWhoWasLate() {
        val late = opened("late")
        assertEquals("Parked after ${ParkingCurfew.PARK_BY}", late.title)
        assertEquals(listOf("Lerato Mokoena"), late.rows.map { it.heading })
        assertEquals("with how late they were, and when they knocked off",
            listOf("19:15", "45 min"), late.rows.single().cells)
        assertEquals("KwaZulu-Natal · Durban", late.rows.single().meta)
    }

    @Test
    fun noEntryOpensOnThePersonWithNoEntry() {
        val missing = opened("notstarted")
        // Naledi is off, which is accounted for; the retired account is not active.
        assertEquals(listOf("Thabo Nkosi"), missing.rows.map { it.heading })
        assertEquals("1 person", missing.countLabel)
    }

    @Test
    fun startedNamesEveryoneWhoClockedInEarliestFirst() {
        val started = opened("started")
        assertEquals(listOf("Sarah Dube", "Lerato Mokoena"), started.rows.map { it.heading })
        assertEquals(listOf("08:00"), started.rows.first().cells)
        assertEquals("2 people", started.countLabel)
    }

    @Test
    fun knockedOffPutsTheLatestFirst() {
        val knockedOff = opened("knockedoff")
        assertEquals(listOf("Lerato Mokoena", "Sarah Dube"), knockedOff.rows.map { it.heading })
        assertEquals(listOf("19:15", "10h 45m"), knockedOff.rows.first().cells)
    }

    @Test
    fun hoursRanksTheLongestDayFirst() {
        val hours = opened("hours")
        assertEquals(listOf("Lerato Mokoena", "Sarah Dube"), hours.rows.map { it.heading })
    }

    @Test
    fun distanceRanksTheFurthestFirst() {
        val distance = opened("distance")
        assertEquals(listOf("Sarah Dube", "Lerato Mokoena"), distance.rows.map { it.heading })
        assertEquals(listOf("80 km"), distance.rows.first().cells)
    }

    /** An absence is neither a start, a day worked, nor a distance. */
    @Test
    fun anAbsenceIsNotCountedAsADayWorked() {
        listOf("started", "hours", "distance", "knockedoff", "late").forEach { key ->
            assertFalse(
                "an absence turned up behind the \"$key\" figure",
                opened(key).rows.any { it.heading == "Naledi Khumalo" }
            )
        }
    }

    @Test
    fun fuelTotalsThePersonRatherThanTheReceipt() {
        val fuel = opened("fuel")
        // Sarah's two fills are one line, and the bigger spender is first.
        assertEquals(listOf("Sarah Dube", "Lerato Mokoena"), fuel.rows.map { it.heading })
        assertEquals(listOf("R450,50"), fuel.rows.first().cells)
    }

    @Test
    fun serviceDueNamesWhoeverIsDrivingIt() {
        val service = opened("service")
        assertEquals(listOf("Suzuki Magnite", "Bakkie 2"), service.rows.map { it.heading })
        // The registration typed by the employee is free text: "ND 111-111" is the
        // same vehicle as "ND111111".
        assertEquals(listOf("30 000 km", "Sarah Dube"), service.rows.first().cells)
        assertEquals(listOf("60 000 km", "nobody"), service.rows.last().cells)
        assertEquals("ND 111-111", service.rows.first().meta)
        assertEquals("2 vehicles", service.countLabel)
    }

    /** A figure of zero should explain itself rather than open an empty table. */
    @Test
    fun aFigureOfZeroExplainsItself() {
        val quiet = DayBreakdown.of(
            "late", listOf(sarah), listOf(sarahsDay), emptyList(), emptyList(), NOW
        )!!
        assertTrue(quiet.rows.isEmpty())
        assertEquals("Everyone was parked by ${ParkingCurfew.PARK_BY}.", quiet.empty)
    }

    /** A log for someone no longer on the books still has to name somebody. */
    @Test
    fun aLogWithNoEmployeeRecordFallsBackToTheNameOnIt() {
        val orphan = sarahsDay.copy(uid = "gone", employeeName = "Former Driver")
        val started = DayBreakdown.of(
            "started", emptyList(), listOf(orphan), emptyList(), emptyList(), NOW)!!
        assertEquals(listOf("Former Driver"), started.rows.map { it.heading })
        assertEquals("", started.rows.single().meta)
    }

    // ---------- fixtures ----------

    private fun employee(
        uid: String, name: String, surname: String,
        province: String, team: String, registration: String
    ) = UserProfile(
        uid = uid, name = name, surname = surname,
        province = province, teamName = team,
        vehicleRegistration = registration, active = true
    )

    private fun vehicle(name: String, registration: String, lastServiceKm: Long, currentKm: Long) =
        Vehicle(
            registrationNumber = registration, name = name,
            currentOdometerKm = currentKm, lastServiceOdometerKm = lastServiceKm,
            serviceIntervalKm = 15000L,
            // Judged by kilometres alone, so NOW cannot change the answer.
            serviceIntervalMonths = 0L
        )

    private companion object {
        /** Any ordinary working day. South Africa has no daylight saving to trip over. */
        const val DAY = "2026-03-16"

        val NOW = ParkingCurfew.curfewMillis(DAY)

        /** A timestamp that many minutes either side of that day's curfew. */
        fun curfew(offsetMinutes: Long): Long =
            ParkingCurfew.curfewMillis(DAY) + offsetMinutes * 60_000L
    }
}
