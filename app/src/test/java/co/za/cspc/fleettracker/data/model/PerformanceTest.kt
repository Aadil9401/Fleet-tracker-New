package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the PHONE APP's performance rules against the shared specifications.
 *
 * The same two tables are run against the admin portal by web/performance-spec-test.mjs.
 * Two implementations, one specification — the fourth rule in this project held that way,
 * after the service schedule, the parking curfew and the plate format.
 *
 * Plain JVM tests: [Performance] touches nothing Android and nothing Firebase.
 */
class PerformanceTest {

    /** Walks up from wherever Gradle chose to run, rather than trusting a relative path. */
    private fun specFile(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, name)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw IllegalStateException("$name not found in or above ${File("").absoluteFile}")
    }

    private fun rowsOf(name: String, expectedColumns: List<String>): List<List<String>> {
        val lines = specFile(name).readLines()
            .map { it.removePrefix("﻿").trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
        assertEquals("unexpected columns in $name", expectedColumns, lines.first().split(","))
        return lines.drop(1).map { it.split(",") }
    }

    /** "-" in the table means "never uploaded", which is null and not zero. */
    private fun figure(cell: String): Long? = if (cell == "-") null else cell.toLong()

    /** "MTN:100:60:30|VODACOM:300:-:-" into stored rows for one team and month. */
    private fun parseRows(encoded: String): List<Performance.TeamRow> =
        encoded.split("|").filter { it.isNotBlank() }.map { part ->
            val f = part.split(":")
            Performance.TeamRow(
                teamKey = "SOWETO",
                team = "Soweto",
                month = "2026-09",
                // A network of "-" is a row from before networks existed.
                network = if (f[0] == "-") "" else f[0],
                figures = Performance.Figures(
                    stock = figure(f[1]),
                    connections = figure(f[2]),
                    activations = figure(f[3])
                )
            )
        }

    @Test
    fun matchesTheNetworkSpecification() {
        val cases = rowsOf(NETWORK_SPEC, NETWORK_COLUMNS)
        assertTrue("$NETWORK_SPEC has no cases in it", cases.isNotEmpty())

        // Every mismatch is collected rather than failing on the first, so one run says
        // everything that drifted instead of only the earliest thing.
        val failures = mutableListOf<String>()
        for (c in cases) {
            val (name, encoded, network) = Triple(c[0], c[1], c[2])
            val absent = c[3] == "ABSENT"
            val got = Performance.figuresFor(parseRows(encoded), if (network == "-") "" else network)

            if (absent) {
                if (got != null) failures += "$name: expected the team to be absent, got $got"
                continue
            }
            if (got == null) {
                failures += "$name: expected figures, got nothing at all"
                continue
            }
            val want = Performance.Figures(figure(c[3]), figure(c[4]), figure(c[5]))
            if (got != want) failures += "$name: got $got, want $want"
        }

        assertEquals(
            "the phone app does not match $NETWORK_SPEC:\n  " + failures.joinToString("\n  "),
            emptyList<String>(),
            failures.toList()
        )
    }

    @Test
    fun matchesTheRankingSpecification() {
        val cases = rowsOf(RANK_SPEC, RANK_COLUMNS)
        assertTrue("$RANK_SPEC has no cases in it", cases.isNotEmpty())

        val failures = mutableListOf<String>()
        for (c in cases) {
            val name = c[0]
            val figures = c[1].split("|").map { figure(it) }
            val want = c[2].split("|").map { if (it == "-") null else it.toInt() }
            val got = Performance.positions(figures)
            if (got != want) failures += "$name: got $got, want $want"
        }

        assertEquals(
            "the phone app does not match $RANK_SPEC:\n  " + failures.joinToString("\n  "),
            emptyList<String>(),
            failures.toList()
        )
    }

    /**
     * The keys are identity, not display. If either stopped agreeing with the portal's,
     * a team's figures would attach to a different team, or to none.
     */
    @Test
    fun teamKeyKeepsSingleSpacesAndDropsEverythingElse() {
        assertEquals("SOWETO EAST", Performance.teamKey("Soweto East"))
        assertEquals("SOWETO EAST", Performance.teamKey("SOWETO  EAST"))
        assertEquals("SOWETO EAST", Performance.teamKey("soweto-east"))
        assertEquals("SOWETO EAST", Performance.teamKey("  soweto   east  "))
        // A real space still separates two teams, or SOWETO would swallow SOWETO EAST.
        assertTrue(Performance.teamKey("SOWETO") != Performance.teamKey("SOWETO EAST"))
        assertEquals("", Performance.teamKey("  -- "))
        assertEquals("", Performance.teamKey(null))
        // The eight names corrected on the staff list must key to the figures file's.
        assertEquals(Performance.teamKey("CENTURION VODACOM"), Performance.teamKey("centurion vodacom"))
        assertTrue(Performance.teamKey("CENTURION") != Performance.teamKey("CENTURION VODACOM"))
    }

    @Test
    fun onlyTheFourNetworksAreNetworks() {
        assertEquals("CELLC", Performance.networkKey("Cell C"))
        assertEquals("CELLC", Performance.networkKey("cell-c"))
        assertEquals("VODACOM", Performance.networkKey("VOD"))
        assertEquals("MTN", Performance.networkKey("mtn"))
        assertEquals("TELKOM", Performance.networkKey("Telkom"))
        // Not a fifth network — and neither is a typo of a real one.
        assertEquals("", Performance.networkKey("Rain"))
        assertEquals("", Performance.networkKey("VODAOCM"))
        assertEquals("", Performance.networkKey(""))
        assertEquals("", Performance.networkKey(null))
        // A figure read into the network column must never look like a network.
        assertEquals("", Performance.networkKey("600"))
    }

    /**
     * A dash, never a zero. This is the difference between "we have not counted it yet"
     * and "they converted nothing", and it is shown to the person whose month it is.
     */
    @Test
    fun aRatioIsUnknownRatherThanZeroWhenAFigureIsMissing() {
        assertNull(Performance.ratioPercent(60, null))
        assertNull(Performance.ratioPercent(null, 100))
        assertNull(Performance.ratioPercent(60, 0))
        assertEquals("—", Performance.percentLabel(Performance.ratioPercent(60, null)))
        // But a zero numerator against real stock is a real 0%.
        assertNotNull(Performance.ratioPercent(0, 100))
        assertEquals("0,0%", Performance.percentLabel(Performance.ratioPercent(0, 100)))
        assertEquals("75,0%", Performance.percentLabel(Performance.ratioPercent(300, 400)))
        assertEquals("63,3%", Performance.percentLabel(Performance.ratioPercent(380, 600)))
        // Not capped: more connections than stock is the thing worth asking about.
        assertEquals("120,0%", Performance.percentLabel(Performance.ratioPercent(120, 100)))
    }

    /**
     * The ratios must divide WITHIN the network being shown. Soweto on Vodacom converted
     * 240 of 300; across all networks it converted 300 of 400. Dividing one network's
     * connections by every network's stock would report 60%, which is nobody's number.
     */
    @Test
    fun ratiosDivideWithinTheNetworkShown() {
        val rows = parseRows("MTN:100:60:30|VODACOM:300:240:120")
        val vodacom = Performance.figuresFor(rows, "VODACOM")!!
        assertEquals("80,0%", Performance.percentLabel(
            Performance.ratioPercent(vodacom.connections, vodacom.stock)))
        val all = Performance.figuresFor(rows, "")!!
        assertEquals("75,0%", Performance.percentLabel(
            Performance.ratioPercent(all.connections, all.stock)))
    }

    /* ---------------- FY, the incentive paid per person per network ---------------- */

    /**
     * FY runs on two of the four networks. Held here as well as in the portal because a
     * third network appearing on one side and not the other would show an employee an
     * amount their admin cannot see, or the reverse.
     */
    @Test
    fun fyRunsOnTwoNetworks() {
        assertEquals(listOf("MTN", "TELKOM"), Performance.FY_NETWORKS)
        // A narrower list than the team figures, which take all four.
        assertEquals(4, Performance.NETWORKS.size)
    }

    /**
     * Order comes from FY_NETWORKS, not from whatever order the rows arrived in, so the
     * screen does not reshuffle itself between loads.
     */
    @Test
    fun fyRowsComeBackInAFixedOrder() {
        val telkom = Performance.Fy("TELKOM", 600, 210, 2940.0)
        val mtn = Performance.Fy("MTN", 1000, 400, 5600.0)
        assertEquals(
            listOf("MTN", "TELKOM"),
            Performance.fyInOrder(listOf(telkom, mtn)).map { it.network }
        )
        // However the network was written.
        assertEquals(
            listOf("MTN"),
            Performance.fyInOrder(listOf(Performance.Fy("mtn", 1, 1, 1.0))).map { it.network }
        )
        // One network alone is one row, not a padded pair of two.
        assertEquals(1, Performance.fyInOrder(listOf(mtn)).size)
        assertTrue(Performance.fyInOrder(emptyList()).isEmpty())
        // A network FY does not run on is dropped rather than shown with no home.
        assertTrue(Performance.fyInOrder(listOf(Performance.Fy("VODACOM", 1, 1, 1.0))).isEmpty())
    }

    /** The conversion divides within one network, never across two. */
    @Test
    fun fyConversionIsPerNetwork() {
        assertEquals("40,0%", Performance.percentLabel(
            Performance.Fy("MTN", 1000, 400, 5600.0).conversion))
        assertEquals("35,0%", Performance.percentLabel(
            Performance.Fy("TELKOM", 600, 210, 2940.0).conversion))
        // Stock allocated and nothing connected is a real 0%, not a dash.
        assertEquals("0,0%", Performance.percentLabel(
            Performance.Fy("MTN", 1000, 0, 0.0).conversion))
        // No stock means the conversion cannot be worked out at all.
        assertEquals("—", Performance.percentLabel(
            Performance.Fy("MTN", null, 400, 5600.0).conversion))
    }

    /**
     * The FY line under My pay is every network added together. Null when none arrived,
     * so it reads as a dash rather than R0,00 — the difference between "no incentive this
     * month" and "nobody has uploaded it".
     */
    @Test
    fun fyTotalAddsTheNetworksThatArrived() {
        val both = listOf(
            Performance.Fy("MTN", 1000, 400, 5600.0),
            Performance.Fy("TELKOM", 600, 210, 2940.0)
        )
        assertEquals(8540.0, Performance.fyTotal(both)!!, 0.001)
        assertEquals(5600.0, Performance.fyTotal(both.take(1))!!, 0.001)
        assertNull(Performance.fyTotal(emptyList()))
        // A row with figures but no amount contributes nothing and does not invent a zero.
        assertNull(Performance.fyTotal(listOf(Performance.Fy("MTN", 1000, 400, null))))
        // A real nought paid is a real nought.
        assertEquals(0.0, Performance.fyTotal(listOf(Performance.Fy("MTN", 1000, 0, 0.0)))!!, 0.001)
    }

    /**
     * Each network's FY payable on its own.
     *
     * The combined figure is what gets paid; this is what gets queried, because an
     * argument about FY is always about one network and nobody should have to subtract
     * one amount from a total to find the other.
     */
    @Test
    fun fyAmountIsReadablePerNetwork() {
        val both = listOf(
            Performance.Fy("MTN", 1000, 400, 5600.0),
            Performance.Fy("TELKOM", 600, 210, 2940.0)
        )
        assertEquals(5600.0, Performance.fyAmountOn(both, "MTN")!!, 0.001)
        assertEquals(2940.0, Performance.fyAmountOn(both, "TELKOM")!!, 0.001)
        // The two add up to the combined figure, which is the thing that gets paid.
        assertEquals(
            Performance.fyTotal(both)!!,
            Performance.fyAmountOn(both, "MTN")!! + Performance.fyAmountOn(both, "TELKOM")!!,
            0.001
        )
        // However the network was written.
        assertEquals(5600.0, Performance.fyAmountOn(both, "mtn")!!, 0.001)
        // A network with nothing on it is null, so it shows as a dash rather than R0,00.
        assertNull(Performance.fyAmountOn(both.take(1), "TELKOM"))
        assertNull(Performance.fyAmountOn(emptyList(), "MTN"))
        // And a network FY does not even run on has nothing either.
        assertNull(Performance.fyAmountOn(both, "VODACOM"))
    }

    /**
     * The total a person is owed: whichever of the three arrived, added.
     *
     * Aadil's call, and he was asked: if one is missing the other two should still total.
     * What keeps it honest is the three lines above the total, each showing a dash when
     * its own figure has not been uploaded — the total is the sum of what is on screen.
     */
    @Test
    fun totalPayAddsWhicheverArrived() {
        assertEquals(11800.0, Performance.totalPay(6200.0, 5600.0, null)!!, 0.001)
        assertEquals(20340.0, Performance.totalPay(6200.0, 5600.0, 8540.0)!!, 0.001)
        // Any one of them missing: the rest still total.
        assertEquals(14140.0, Performance.totalPay(null, 5600.0, 8540.0)!!, 0.001)
        assertEquals(14740.0, Performance.totalPay(6200.0, null, 8540.0)!!, 0.001)
        assertEquals(8540.0, Performance.totalPay(null, null, 8540.0)!!, 0.001)
        assertEquals(6200.0, Performance.totalPay(6200.0, null, null)!!, 0.001)
        // NONE of them is still nothing at all, and shows a dash rather than R0,00.
        assertNull(Performance.totalPay(null, null, null))
        // Real noughts still add to a real nought.
        assertEquals(0.0, Performance.totalPay(0.0, 0.0, null)!!, 0.001)
    }

    private companion object {
        const val NETWORK_SPEC = "performance-network-cases.csv"
        const val RANK_SPEC = "performance-rank-cases.csv"
        val NETWORK_COLUMNS =
            listOf("name", "rows", "network", "stock", "connections", "activations")
        val RANK_COLUMNS = listOf("name", "figures", "expected")
    }
}
