package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the PHONE APP's service rules against the shared specification.
 *
 * The same table is run against the admin portal by web/service-schedule-test.mjs and
 * against the reminder job by functions/service-schedule-test.mjs. Three
 * implementations, one specification — which is the only thing that stops them drifting
 * apart, as they had.
 *
 * A plain JVM test: [ServiceSchedule] deliberately has no Firebase import, so this
 * needs no Android framework and no emulator.
 */
class ServiceScheduleTest {

    private data class Case(
        val name: String,
        val intervalKm: Long,
        val lastServiceOdoKm: Long,
        val currentOdoKm: Long,
        val intervalMonths: Long,
        val lastServiceDaysAgo: Long,
        val nextAtKm: Long,
        val percent: Int?,
        val dueByKm: Boolean,
        val dueByDate: Boolean
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
            .map { it.removePrefix("﻿").trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }

        assertEquals("unexpected columns in $SPEC_NAME", COLUMNS, lines.first().split(","))

        return lines.drop(1).map { line ->
            val f = line.split(",").map { it.trim() }
            Case(
                name = f[0],
                intervalKm = f[1].toLong(),
                lastServiceOdoKm = f[2].toLong(),
                currentOdoKm = f[3].toLong(),
                intervalMonths = f[4].toLong(),
                lastServiceDaysAgo = f[5].toLong(),
                nextAtKm = f[6].toLong(),
                percent = if (f[7] == "none") null else f[7].toInt(),
                dueByKm = f[8] == "true",
                dueByDate = f[9] == "true"
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
            val lastServiceDateMillis =
                if (c.lastServiceDaysAgo < 0L) 0L else NOW - c.lastServiceDaysAgo * DAY_MILLIS

            fun record(field: String, got: Any?, want: Any?) {
                if (got != want) failures += "${c.name}  $field: got $got, want $want"
            }

            record(
                "nextAtKm",
                ServiceSchedule.nextServiceAtKm(c.intervalKm, c.lastServiceOdoKm, c.currentOdoKm),
                c.nextAtKm
            )
            record(
                "percent",
                ServiceSchedule.percentToNextService(c.intervalKm, c.lastServiceOdoKm, c.currentOdoKm),
                c.percent
            )
            record(
                "dueByKm",
                ServiceSchedule.isServiceDueByKm(c.intervalKm, c.lastServiceOdoKm, c.currentOdoKm),
                c.dueByKm
            )
            record(
                "dueByDate",
                ServiceSchedule.isServiceDueByDate(lastServiceDateMillis, c.intervalMonths, NOW),
                c.dueByDate
            )
        }

        assertEquals(
            "the phone app does not match $SPEC_NAME:\n  " + failures.joinToString("\n  "),
            emptyList<String>(),
            failures.toList()
        )
    }

    /** Vehicle should read the same as the rules it delegates to. */
    @Test
    fun vehicleDelegatesToTheSameRules() {
        val v = Vehicle(
            serviceIntervalKm = 15000L,
            lastServiceOdometerKm = 149000L,
            currentOdometerKm = 152000L,
            serviceIntervalMonths = 0L
        )
        assertEquals(165000L, v.nextServiceAtKm())
        assertEquals(18, v.percentToNextService())
        assertEquals(13000L, v.kmUntilService())
        assertEquals(false, v.isServiceDueByKm())

        val untracked = v.copy(serviceIntervalKm = 0L)
        assertEquals(0L, untracked.nextServiceAtKm())
        assertEquals(null, untracked.percentToNextService())
        assertEquals(false, untracked.isServiceDueByKm())
    }

    private companion object {
        const val SPEC_NAME = "service-schedule-cases.csv"
        const val NOW = 1_760_000_000_000L
        const val DAY_MILLIS = 24L * 60L * 60L * 1000L

        val COLUMNS = listOf(
            "name", "intervalKm", "lastServiceOdoKm", "currentOdoKm", "intervalMonths",
            "lastServiceDaysAgo", "nextAtKm", "percent", "dueByKm", "dueByDate"
        )
    }
}
