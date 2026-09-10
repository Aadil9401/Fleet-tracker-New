package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the PHONE APP's location rules against the shared specifications.
 *
 * The same two tables are run against the admin portal by web/location-spec-test.mjs.
 * Two implementations, one pair of specifications — which is the only thing that stops
 * them drifting apart, as the service rules had before they were pinned the same way.
 *
 * A plain JVM test: [LocationTrack] deliberately has no Android import, so this needs no
 * emulator and runs in `gradle testDebugUnitTest` with everything else.
 */
class LocationTrackTest {

    /**
     * Found by walking up from wherever the test happens to be run, rather than by a
     * relative path — Gradle's working directory for unit tests is not somewhere to
     * stake a test on. The same walk ParkingCurfewTest does.
     */
    private fun specFile(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, name)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw IllegalStateException("$name not found in or above ${File("").absoluteFile}")
    }

    private fun rows(name: String, columns: List<String>): List<List<String>> {
        val lines = specFile(name).readLines()
            .map { it.removePrefix("\uFEFF").trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }

        assertEquals("unexpected columns in $name", columns, lines.first().split(","))
        return lines.drop(1).map { line -> line.split(",").map { it.trim() } }
    }

    /* ---------------- how far apart two points are ---------------- */

    @Test
    fun `distance matches the specification`() {
        val cases = rows(DISTANCE_SPEC,
            listOf("name", "lat1", "lng1", "lat2", "lng2", "metres"))
        assertTrue("$DISTANCE_SPEC has no cases", cases.isNotEmpty())

        for (c in cases) {
            val got = LocationTrack.metresBetween(
                c[1].toDouble(), c[2].toDouble(), c[3].toDouble(), c[4].toDouble())
            assertEquals(
                "${c[0]}: distance",
                c[5].toLong(),
                Math.round(got)
            )
        }
    }

    /** Distance cannot depend on which point you started from. */
    @Test
    fun `distance is the same in both directions`() {
        val cases = rows(DISTANCE_SPEC,
            listOf("name", "lat1", "lng1", "lat2", "lng2", "metres"))
        for (c in cases) {
            val there = LocationTrack.metresBetween(
                c[1].toDouble(), c[2].toDouble(), c[3].toDouble(), c[4].toDouble())
            val back = LocationTrack.metresBetween(
                c[3].toDouble(), c[4].toDouble(), c[1].toDouble(), c[2].toDouble())
            assertEquals("${c[0]}: reversed", Math.round(there), Math.round(back))
        }
    }

    /* ---------------- which points are kept ---------------- */

    @Test
    fun `the filter matches the specification`() {
        val cases = rows(FILTER_SPEC,
            listOf("name", "first", "moveOffset", "accuracyOffset", "keep"))
        assertTrue("$FILTER_SPEC has no cases", cases.isNotEmpty())

        for (c in cases) {
            // Offsets from the thresholds, not metres — see the head of the CSV.
            val moved = LocationTrack.MIN_MOVE_M + c[2].toDouble()
            val accuracy = LocationTrack.MAX_ACCURACY_M + c[3].toDouble()
            assertEquals(
                "${c[0]}: keep",
                c[4] == "yes",
                LocationTrack.shouldKeep(c[1] == "yes", moved, accuracy)
            )
        }
    }

    /* ---------------- what the filter does over a whole route ---------------- */

    /**
     * THE RULE THAT MAKES THE FILTER WORK AT ALL: each point is measured against the
     * last one KEPT, never the last one seen. Measured against the last one seen, a
     * phone creeping a metre at a time drops every point for ever and records a driver
     * as having never moved.
     */
    @Test
    fun `creeping a metre at a time still adds up to a journey`() {
        // Twenty fixes, each a metre or so north of the one before. Not one of them is
        // far enough from its immediate predecessor to be kept on its own.
        val points = (0 until 20).map {
            TrackPoint(lat = -26.2041 + it * 0.00001, lng = 28.0473,
                timeMillis = it * 30_000L, accuracyMetres = 10.0)
        }
        val kept = LocationTrack.keptPoints(points)
        assertTrue("a creeping phone should still register movement", kept.size > 1)
        assertTrue("and should cover most of the ground walked",
            LocationTrack.routeMetres(points) > 10.0)
    }

    /** A phone that never moves records a start and nothing else. */
    @Test
    fun `standing still is not a journey`() {
        val points = (0 until 50).map {
            // Under a metre of drift each way, which is what a stationary fix looks like.
            TrackPoint(lat = -26.2041 + (it % 3) * 0.000004, lng = 28.0473,
                timeMillis = it * 30_000L, accuracyMetres = 8.0)
        }
        assertEquals("only the opening fix is kept", 1, LocationTrack.keptPoints(points).size)
        assertEquals("and the day covers no ground", 0L,
            Math.round(LocationTrack.routeMetres(points)))
    }

    /** A day with nothing in it is a day of no distance, not a crash. */
    @Test
    fun `an empty day is zero, not an error`() {
        assertEquals(0, LocationTrack.keptPoints(emptyList()).size)
        assertEquals(0L, Math.round(LocationTrack.routeMetres(emptyList())))
        assertEquals(0L, Math.round(LocationTrack.routeKm(emptyList()) * 1000))
    }

    /** A vague fix is dropped however far it claims to have travelled. */
    @Test
    fun `a hopeless fix cannot open a day`() {
        val points = listOf(
            TrackPoint(-26.2041, 28.0473, 0L, accuracyMetres = 900.0),
            TrackPoint(-26.1076, 28.0567, 30_000L, accuracyMetres = 9.0)
        )
        val kept = LocationTrack.keptPoints(points)
        assertEquals("the vague opening fix is not the start of the day", 1, kept.size)
        assertEquals("and the day starts where the first believable fix is",
            -26.1076, kept.first().lat, 0.00001)
    }

    private companion object {
        const val DISTANCE_SPEC = "location-distance-cases.csv"
        const val FILTER_SPEC = "location-filter-cases.csv"
    }
}
