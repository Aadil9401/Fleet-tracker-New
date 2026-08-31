package co.za.cspc.fleettracker.data.model

import java.io.File
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the PHONE APP's parking curfew against the shared specification.
 *
 * The same table is run against the admin portal by web/parking-curfew-test.mjs. Two
 * implementations, one specification — which is the only thing that stops them drifting
 * apart, as the service rules had before they were pinned the same way.
 *
 * A plain JVM test: [ParkingCurfew] deliberately has no Firebase import, so this needs
 * no Android framework and no emulator.
 */
class ParkingCurfewTest {

    private data class Case(
        val name: String,
        /** Minutes after the curfew they knocked off, or null for never knocked off. */
        val offsetMinutes: Long?,
        val minutesLate: Long,
        val label: String
    )

    /**
     * Found by walking up from wherever the test happens to be run, rather than by a
     * relative path — Gradle's working directory for unit tests is not somewhere to
     * stake a test on.
     */
    private fun specFile(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, SPEC_NAME)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw IllegalStateException("$SPEC_NAME not found in or above ${File("").absoluteFile}")
    }

    private fun cases(): List<Case> {
        val lines = specFile().readLines()
            .map { it.removePrefix("\uFEFF").trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }

        assertEquals("unexpected columns in $SPEC_NAME", COLUMNS, lines.first().split(","))

        return lines.drop(1).map { line ->
            val f = line.split(",").map { it.trim() }
            Case(
                name = f[0],
                offsetMinutes = if (f[1] == "none") null else f[1].toLong(),
                minutesLate = f[2].toLong(),
                label = f[3]
            )
        }
    }

    @Test
    fun matchesTheSharedSpecification() {
        val all = cases()
        assertTrue("$SPEC_NAME has no cases in it", all.isNotEmpty())

        // Every mismatch is collected rather than failing on the first, so one run tells
        // you everything that drifted.
        val failures = mutableListOf<String>()

        for (c in all) {
            // "Never knocked off" is an unset timestamp, not an offset from anything.
            val endTimeMillis = c.offsetMinutes
                ?.let { ParkingCurfew.curfewMillis(DAY) + it * 60_000L }
                ?: 0L

            fun record(field: String, got: Any?, want: Any?) {
                if (got != want) failures += "${c.name}  $field: got $got, want $want"
            }

            val minutes = ParkingCurfew.minutesParkedLate(DAY, endTimeMillis)
            record("minutesLate", minutes, c.minutesLate)
            record("isParkedLate", ParkingCurfew.isParkedLate(DAY, endTimeMillis), c.minutesLate > 0L)
            record("label", ParkingCurfew.lateLabel(minutes), c.label)
        }

        assertEquals(
            "the phone app does not match $SPEC_NAME:\n  " + failures.joinToString("\n  "),
            emptyList<String>(),
            failures.toList()
        )
    }

    /** TimeLog should read the same as the rule it delegates to. */
    @Test
    fun timeLogDelegatesToTheSameRule() {
        val log = TimeLog(
            date = DAY,
            startTimeMillis = ParkingCurfew.curfewMillis(DAY) - 10 * 60 * 60_000L,
            endTimeMillis = ParkingCurfew.curfewMillis(DAY) + 65 * 60_000L
        )
        assertEquals(65L, log.minutesParkedLate)
        assertTrue(log.isParkedLate)
        assertEquals("1h 05m", log.lateLabel)
    }

    /** The curfew lands on the day it names, at the time it names, in SAST. */
    @Test
    fun theCurfewFallsOnThatDayInSouthAfricanTime() {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("Africa/Johannesburg"), Locale.US)
        calendar.timeInMillis = ParkingCurfew.curfewMillis(DAY)

        val (hour, minute) = ParkingCurfew.PARK_BY.split(":").map { it.toInt() }
        assertEquals(2026, calendar.get(Calendar.YEAR))
        assertEquals(Calendar.MARCH, calendar.get(Calendar.MONTH))
        assertEquals(16, calendar.get(Calendar.DAY_OF_MONTH))
        assertEquals(hour, calendar.get(Calendar.HOUR_OF_DAY))
        assertEquals(minute, calendar.get(Calendar.MINUTE))
    }

    /**
     * A date the app could never have written. Better a figure of zero than one measured
     * against a curfew at the epoch, which would report everybody as decades late.
     */
    @Test
    fun anUnusableDateIsNotLate() {
        assertEquals(0L, ParkingCurfew.curfewMillis(""))
        assertEquals(0L, ParkingCurfew.minutesParkedLate("not-a-date", System.currentTimeMillis()))
    }

    private companion object {
        const val SPEC_NAME = "parking-curfew-cases.csv"
        val COLUMNS = listOf("name", "offsetMinutes", "minutesLate", "label")

        /** Any ordinary working day. South Africa has no daylight saving to trip over. */
        const val DAY = "2026-03-16"
    }
}
