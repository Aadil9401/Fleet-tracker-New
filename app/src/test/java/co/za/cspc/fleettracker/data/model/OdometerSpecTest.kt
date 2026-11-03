package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Runs the PHONE's odometer rule against the shared specification.
 *
 * The companion is web/odometer-test.mjs for the admin portal. Both read
 * odometer-cases.csv, which is the only thing keeping the two implementations honest —
 * a ceiling held on one side only is a ceiling the other side does not have, and the
 * side without it is the way a bad reading gets in.
 */
class OdometerSpecTest {

    private data class Case(val name: String, val typed: String, val ok: Boolean, val value: Long?)

    private fun cases(): List<Case> {
        // Walks up from the module directory, so the test does not care whether gradle
        // runs it from the repo root or from app/.
        var dir: File? = File(".").absoluteFile
        var file: File? = null
        while (dir != null && file == null) {
            val candidate = File(dir, "odometer-cases.csv")
            if (candidate.isFile) file = candidate
            dir = dir.parentFile
        }
        requireNotNull(file) { "odometer-cases.csv not found above ${File(".").absolutePath}" }

        return file.readLines()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .drop(1) // the header
            .map { line ->
                // The typed column is wrapped in pipes so leading and trailing spaces
                // survive a spreadsheet and are visible to anyone reading the table.
                val cols = line.split(",")
                val typed = line.substringAfter("|").substringBeforeLast("|")
                val rest = line.substringAfterLast("|").trim(',').split(",")
                Case(
                    name = cols[0],
                    typed = typed,
                    ok = rest[0].trim() == "yes",
                    value = rest.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }?.toLong()
                )
            }
    }

    @Test
    fun `the phone matches the odometer specification`() {
        val cases = cases()
        assertTrue("the specification is empty", cases.isNotEmpty())

        for (case in cases) {
            when (val verdict = Odometer.read(case.typed)) {
                is Odometer.Verdict.Ready -> {
                    assertTrue("${case.name}: expected a refusal for \"${case.typed}\"", case.ok)
                    assertEquals("${case.name}: wrong value", case.value, verdict.km)
                }
                is Odometer.Verdict.Refused -> {
                    assertTrue(
                        "${case.name}: expected \"${case.typed}\" to be accepted, " +
                            "refused with: ${verdict.why}",
                        !case.ok
                    )
                }
            }
        }
    }

    /* The ceiling is the thing Aadil asked for, so it is asserted directly as well as
       through the table — a table can be edited, and this says what the number is. */
    @Test
    fun `the ceiling is six digits`() {
        assertEquals(999_999L, Odometer.MOST_KM)
        assertEquals(6, Odometer.MOST_DIGITS)
        assertEquals(6, Odometer.MOST_KM.toString().length)
    }

    @Test
    fun `isAllowed agrees with read`() {
        listOf(0L, 1L, 85_000L, 999_999L).forEach {
            assertTrue("$it should be allowed", Odometer.isAllowed(it))
        }
        listOf(-1L, 1_000_000L, 354_898_355_008L).forEach {
            assertTrue("$it should not be allowed", !Odometer.isAllowed(it))
        }
    }

    /* The refusal has to say what is wrong, because the person reading it is a rep at
       knock off who believes the number they typed is correct. */
    @Test
    fun `the refusal for too many digits names the limit`() {
        val why = (Odometer.read("1234567") as Odometer.Verdict.Refused).why
        assertTrue(why, why.contains("6 digits"))
        assertTrue(why, why.contains("999 999"))
    }

    @Test
    fun `readings are grouped the way South Africa writes them`() {
        assertEquals("999 999", Odometer.format(999_999L))
        assertEquals("85 000", Odometer.format(85_000L))
        assertEquals("0", Odometer.format(0L))
        assertEquals("1 000", Odometer.format(1_000L))
    }

    /*
     * AN ENTRY BOX IS NOT PRE-FILLED WITH A READING THE APP WOULD REFUSE.
     *
     * Six vehicles carry a figure above a million from before the ceiling existed, and
     * both the clock-in dialog and the fuel dialog start from the vehicle's stored
     * reading. Pre-filled from one of those, the clock-in box opened already red over a
     * number the driver had not typed, and the fuel box — which never checked the
     * reading at Save — sent it to Firestore, where the rules refused it and the fill
     * was lost.
     */
    @Test
    fun `a sane stored reading is offered back`() {
        assertEquals("85000", Odometer.prefill(85_000L))
        assertEquals("999999", Odometer.prefill(Odometer.MOST_KM))
    }

    @Test
    fun `an impossible stored reading opens the box empty`() {
        listOf(1_000_000L, 3_665_559L, 354_898_355_008L).forEach {
            assertEquals("a box must not open holding $it", "", Odometer.prefill(it))
        }
    }

    /* Nothing recorded is nothing to offer, which is what the box already did. */
    @Test
    fun `nothing stored opens the box empty`() {
        assertEquals("", Odometer.prefill(0L))
        assertEquals("", Odometer.prefill(-1L))
    }

    /* Whatever is offered back must itself be acceptable — the property that was
       broken, stated as a property rather than as three examples. */
    @Test
    fun `whatever is pre-filled is a reading this app would accept`() {
        listOf(0L, 1L, 85_000L, 999_999L, 1_000_000L, 3_665_559L, Long.MAX_VALUE)
            .forEach { stored ->
                val offered = Odometer.prefill(stored)
                if (offered.isNotEmpty()) {
                    assertTrue(
                        "prefill($stored) offered $offered, which read() refuses",
                        Odometer.read(offered) is Odometer.Verdict.Ready
                    )
                }
            }
    }
}
