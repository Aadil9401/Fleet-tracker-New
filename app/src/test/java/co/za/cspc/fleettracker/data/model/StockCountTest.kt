package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a rep types into the stock count, and what becomes of it.
 *
 * Plain JVM tests: [StockCount] touches nothing Android and nothing Firebase, which is
 * the whole reason the rules live there rather than in the screen.
 */
class StockCountTest {

    private val today = "2026-09-21"

    private fun typed(mtn: String? = null, vodacom: String? = null,
                      cellc: String? = null, telkom: String? = null) =
        mapOf("MTN" to mtn, "VODACOM" to vodacom, "CELLC" to cellc, "TELKOM" to telkom)

    /** The ordinary case: counted today, which is what the screen starts on. */
    private fun verdictOf(boxes: Map<String, String?>, date: String = today) =
        StockCount.verdict(boxes, date, today)

    @Test
    fun `a blank box is a network this rep does not carry`() {
        assertEquals(StockCount.Typed.Absent, StockCount.read("MTN", ""))
        assertEquals(StockCount.Typed.Absent, StockCount.read("MTN", "   "))
        assertEquals(StockCount.Typed.Absent, StockCount.read("MTN", null))
    }

    /**
     * A TYPED NOUGHT IS A REAL STOCKOUT and is kept. Reading the blank as nought instead
     * would put every rep at zero on every network they have never sold, and bury the
     * genuine stockouts among them.
     */
    @Test
    fun `a typed nought is a stockout and is stored`() {
        assertEquals(StockCount.Typed.Held(0), StockCount.read("MTN", "0"))
    }

    @Test
    fun `an ordinary figure reads as itself`() {
        assertEquals(StockCount.Typed.Held(12000), StockCount.read("MTN", "12000"))
    }

    /** A rep types the number the way they say it, spaces and all. */
    @Test
    fun `spaces and thousands separators are tolerated`() {
        assertEquals(StockCount.Typed.Held(12000), StockCount.read("MTN", "12 000"))
        assertEquals(StockCount.Typed.Held(12000), StockCount.read("MTN", "12,000"))
    }

    /** Half a SIM is a mistyped figure, not a holding. */
    @Test
    fun `a decimal is refused by name`() {
        val verdict = StockCount.read("Vodacom", "12.5")
        assertTrue(verdict is StockCount.Typed.Rejected)
        assertTrue((verdict as StockCount.Typed.Rejected).why.contains("Vodacom"))
    }

    @Test
    fun `letters are refused`() {
        assertTrue(StockCount.read("MTN", "lots") is StockCount.Typed.Rejected)
    }

    @Test
    fun `less than nothing is refused`() {
        assertTrue(StockCount.read("MTN", "-5") is StockCount.Typed.Rejected)
    }

    @Test
    fun `the boxes that were filled become rows, and no others`() {
        val verdict = verdictOf(typed(mtn = "12000", cellc = "0"))
        assertTrue(verdict is StockCount.Verdict.Ready)
        assertEquals(
            listOf(StockCount.Row("MTN", 12000), StockCount.Row("CELLC", 0)),
            (verdict as StockCount.Verdict.Ready).rows
        )
    }

    /**
     * EVERY BOX EMPTY IS REFUSED. Somebody opened the screen meaning to count something,
     * and an empty submission is a form left half filled rather than a fact about the
     * week — saving it would also replace a real count from earlier with silence.
     */
    @Test
    fun `a count with nothing in it is refused`() {
        val verdict = verdictOf(typed())
        assertTrue(verdict is StockCount.Verdict.Refused)
        assertTrue((verdict as StockCount.Verdict.Refused).why.contains("at least one"))
    }

    /** One thing at a time: "three fields are wrong" is not something anybody can act on. */
    @Test
    fun `the first bad box is the one named`() {
        val verdict = verdictOf(typed(mtn = "12000", vodacom = "many", cellc = "also bad"))
        assertTrue(verdict is StockCount.Verdict.Refused)
        assertTrue((verdict as StockCount.Verdict.Refused).why.startsWith("VODACOM"))
    }

    /** One bad box refuses the lot rather than saving the good ones around it. */
    @Test
    fun `a bad box refuses the whole count`() {
        assertTrue(verdictOf(typed(mtn = "12000", telkom = "x"))
            is StockCount.Verdict.Refused)
    }

    /**
     * ADDRESSED BY PERSON AND DAY, so counting again on the same day CORRECTS it rather
     * than adding to it — and the screen says so, which is the difference between a rep
     * fixing a typo confidently and a rep afraid of doubling their own figure.
     */
    @Test
    fun `the document is addressed by person, day and network`() {
        assertEquals("abc123_2026-09-21_MTN",
            StockCount.documentId("abc123", "2026-09-21", "MTN"))
    }

    @Test
    fun `counting again on the same day is said to replace, not add`() {
        val said = StockCount.alreadyCountedMessage("2026-09-21", 12000)
        assertTrue(said.contains("replaces"))
        assertTrue(said.contains("12000"))
    }

    /*
     * THE DAY COUNTED, which is not always the day it is typed in. A rep counts on Friday
     * afternoon and gets to it on Monday; forcing today's date on that would file Friday's
     * shelf under Monday and make the gap to the next count read as three days when it was
     * six.
     */
    @Test
    fun `today is a day like any other`() {
        assertEquals(StockCount.Typed2.Accepted(today), StockCount.readDate(today, today))
    }

    @Test
    fun `a day last week is accepted`() {
        assertEquals(StockCount.Typed2.Accepted("2026-09-14"),
            StockCount.readDate("2026-09-14", today))
    }

    /**
     * NOT THE FUTURE. A count is a statement about a shelf somebody has looked at, and
     * there is no shelf to look at tomorrow — a future date is a mistyped one, and it
     * would sit at the top of every "latest count" list until the day caught up.
     */
    @Test
    fun `tomorrow is refused`() {
        val verdict = StockCount.readDate("2026-09-22", today)
        assertTrue(verdict is StockCount.Typed2.Rejected)
        assertTrue((verdict as StockCount.Typed2.Rejected).why.contains("not happened"))
    }

    /** A date that old is a typo in the year, not a count somebody means to enter. */
    @Test
    fun `more than a year ago is refused`() {
        assertTrue(StockCount.readDate("2025-09-20", today) is StockCount.Typed2.Rejected)
        assertTrue(StockCount.readDate("2025-09-21", today) is StockCount.Typed2.Accepted)
    }

    @Test
    fun `a day in the wrong shape is refused`() {
        assertTrue(StockCount.readDate("21/09/2026", today) is StockCount.Typed2.Rejected)
        assertTrue(StockCount.readDate("sometime", today) is StockCount.Typed2.Rejected)
        assertTrue(StockCount.readDate("", today) is StockCount.Typed2.Rejected)
    }

    /** Stepping back a year over a year end still lands on a real date. */
    @Test
    fun `a year before new year is the year before`() {
        assertEquals("2025-01-03", StockCount.aYearBefore("2026-01-03"))
    }

    /**
     * THE DAY IS CHECKED BEFORE THE FIGURES. A count on the wrong day is wrong however
     * good the figures are, and it is the field somebody is least likely to look at twice.
     */
    @Test
    fun `a bad day refuses the count before the figures are read`() {
        val verdict = StockCount.verdict(typed(mtn = "12000"), "2026-12-25", today)
        assertTrue(verdict is StockCount.Verdict.Refused)
        assertTrue((verdict as StockCount.Verdict.Refused).why.contains("not happened"))
    }

    @Test
    fun `the day chosen is the day returned`() {
        val verdict = verdictOf(typed(mtn = "900"), date = "2026-09-18")
        assertTrue(verdict is StockCount.Verdict.Ready)
        assertEquals("2026-09-18", (verdict as StockCount.Verdict.Ready).countedOn)
    }

    /** The same closed list the portal and the performance figures use. */
    @Test
    fun `the four networks are the ones everything else uses`() {
        assertEquals(Performance.NETWORKS, StockCount.NETWORKS)
    }
}
