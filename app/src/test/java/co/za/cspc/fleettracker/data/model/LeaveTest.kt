package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The dates a run of leave covers.
 *
 * Plain JVM tests: [Leave] touches nothing Android and nothing Firebase, which is why the
 * date arithmetic lives there rather than in the screen.
 */
class LeaveTest {

    private val today = "2026-09-21"

    private fun days(from: String?, to: String?) = Leave.days(from, to, today)
    private fun readyDays(from: String, to: String) =
        (days(from, to) as Leave.Verdict.Ready).dates

    /**
     * BOTH ENDS INCLUDED. "Off from Monday to Friday" is five days, and that is what
     * anybody entering it will say — excluding the last would take a day of leave off
     * them silently, in the direction that makes them look absent.
     */
    @Test
    fun `a run includes both the first day and the last`() {
        assertEquals(
            listOf("2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"),
            readyDays("2026-09-21", "2026-09-25")
        )
    }

    @Test
    fun `one day is one day`() {
        assertEquals(listOf("2026-10-01"), readyDays("2026-10-01", "2026-10-01"))
    }

    /** Somebody setting a range moves one picker at a time, so this is a state the
        screen passes through on the way to what was meant. */
    @Test
    fun `back to front is the same run`() {
        assertEquals(readyDays("2026-09-21", "2026-09-25"),
            readyDays("2026-09-25", "2026-09-21"))
    }

    @Test
    fun `a run crosses the end of a month`() {
        assertEquals(listOf("2026-09-29", "2026-09-30", "2026-10-01"),
            readyDays("2026-09-29", "2026-10-01"))
    }

    @Test
    fun `and the end of a year`() {
        assertEquals(listOf("2026-12-30", "2026-12-31", "2027-01-01"),
            readyDays("2026-12-30", "2027-01-01"))
    }

    /** February is where a wrong day count shows up first. */
    @Test
    fun `february has twenty-eight days in an ordinary year`() {
        assertEquals(listOf("2026-02-27", "2026-02-28", "2026-03-01"),
            readyDays("2026-02-27", "2026-03-01"))
    }

    @Test
    fun `and twenty-nine in a leap year`() {
        assertEquals(listOf("2028-02-28", "2028-02-29", "2028-03-01"),
            Leave.days("2028-02-28", "2028-03-01", "2028-02-01")
                .let { (it as Leave.Verdict.Ready).dates })
    }

    /**
     * The full leap rule, not "divisible by four". A phone still running this in 2100
     * should not book somebody an extra day of leave.
     */
    @Test
    fun `a century is not a leap year unless it divides by four hundred`() {
        assertEquals(28, Leave.daysInMonth(2100, 2))
        assertEquals(29, Leave.daysInMonth(2000, 2))
        assertEquals(29, Leave.daysInMonth(2024, 2))
    }

    /** Leave taken last week, recorded after the fact, is ordinary. */
    @Test
    fun `leave already taken can still be booked`() {
        assertEquals(listOf("2026-09-14", "2026-09-15"),
            readyDays("2026-09-14", "2026-09-15"))
    }

    /**
     * A guard against a mistyped year, not a policy about anybody's balance — 365 days of
     * absence written by accident takes an admin an afternoon to undo.
     */
    @Test
    fun `a run longer than the cap is refused`() {
        val verdict = days("2026-01-01", "2026-12-31")
        assertTrue(verdict is Leave.Verdict.Refused)
        assertTrue((verdict as Leave.Verdict.Refused).why.contains("shorter runs"))
    }

    @Test
    fun `exactly the cap is allowed`() {
        val verdict = days("2026-09-21", Leave.let {
            var d = "2026-09-21"
            repeat(Leave.MOST_DAYS - 1) { d = Leave.nextDay(d) }
            d
        })
        assertTrue(verdict is Leave.Verdict.Ready)
        assertEquals(Leave.MOST_DAYS, (verdict as Leave.Verdict.Ready).dates.size)
    }

    @Test
    fun `more than a year away is refused as a mistyped year`() {
        assertTrue(days("2028-01-01", "2028-01-05") is Leave.Verdict.Refused)
        assertTrue(days("2024-01-01", "2024-01-05") is Leave.Verdict.Refused)
    }

    @Test
    fun `a missing date is refused`() {
        assertTrue(days("", "2026-09-25") is Leave.Verdict.Refused)
        assertTrue(days("2026-09-21", null) is Leave.Verdict.Refused)
    }

    @Test
    fun `a date in the wrong shape is refused`() {
        assertTrue(days("21/09/2026", "2026-09-25") is Leave.Verdict.Refused)
    }

    /** The number is what somebody checks against their own leave balance. */
    @Test
    fun `a run reads back with both ends and a count`() {
        assertEquals("2026-09-21 to 2026-09-25 — 5 days",
            Leave.summary(readyDays("2026-09-21", "2026-09-25")))
        assertEquals("2026-10-01", Leave.summary(listOf("2026-10-01")))
    }

    /** One word, so the portal and the phone agree on what the reason column says. */
    @Test
    fun `the reason is the same word everywhere`() {
        assertEquals("Annual leave", Leave.REASON)
    }
}
