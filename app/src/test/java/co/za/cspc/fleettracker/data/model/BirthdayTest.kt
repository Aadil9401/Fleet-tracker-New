package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The birthday greeting.
 *
 * A small feature where being wrong is worse than being absent: a message on the wrong
 * day, or one addressed to somebody whose date of birth was never captured, is noticed
 * by the person it happens to. So most of what is below is about staying quiet.
 *
 * Today's date is passed in rather than read from the clock — a test that only passes on
 * one day of the year is not a test.
 */
class BirthdayTest {

    @Test
    fun greetsThemOnTheDay() {
        assertTrue(Birthday.isToday("1986-09-07", "2026-09-07"))
        // The YEAR is ignored. It is the part that gets typed wrong, and none of it
        // matters to the question — somebody with a nonsense year still gets their day.
        assertTrue(Birthday.isToday("2026-09-07", "2026-09-07"))
        assertTrue(Birthday.isToday("1901-01-01", "2026-01-01"))
    }

    @Test
    fun andSaysNothingOnEveryOtherDay() {
        assertFalse(Birthday.isToday("1986-09-07", "2026-09-06"))
        assertFalse(Birthday.isToday("1986-09-07", "2026-09-08"))
        // The same day of a different month is not their birthday, and neither is the
        // same month on a different day.
        assertFalse(Birthday.isToday("1986-09-07", "2026-07-09"))
        assertFalse(Birthday.isToday("1986-09-07", "2026-10-07"))
    }

    /**
     * BLANK IS THE NORMAL STATE. Most of the staff list has no date of birth on it, and
     * every one of those people opens this screen every working day.
     */
    @Test
    fun nobodyWithoutADateOfBirthIsGreeted() {
        assertFalse(Birthday.isToday("", "2026-09-07"))
        assertFalse(Birthday.isToday("   ", "2026-09-07"))
    }

    /**
     * A date that cannot be read means silence, never a guess.
     *
     * "07/09/1986" is refused on purpose even though a person could read it: guessing
     * would eventually greet somebody on the ninth of July because a spreadsheet wrote
     * the day first. The portal normalises a date on the way in, so anything else
     * arriving here is a record that was never captured properly.
     */
    @Test
    fun anythingUnreadableIsSilence() {
        listOf(
            "07/09/1986", "1986/09/07", "1986-9-7", "7 September 1986", "September",
            "1986-09-07T00:00:00", "not a date", "0000-00-00"
        ).forEach { assertFalse(it, Birthday.isToday(it, "2026-09-07")) }
        // A date that is the right shape but not a real day is refused too.
        assertFalse(Birthday.isToday("1986-13-01", "2026-13-01"))
        assertFalse(Birthday.isToday("1986-02-30", "2026-02-30"))
        assertFalse(Birthday.isToday("1986-04-31", "2026-04-31"))
        // And a today that cannot be read greets nobody rather than everybody.
        assertFalse(Birthday.isToday("1986-09-07", "tomorrow"))
    }

    /**
     * SOMEBODY BORN ON 29 FEBRUARY has a birthday every year even when the calendar does
     * not. Greeted on the 28th in the three years out of four that have no 29th — being
     * skipped three times running is the exact thing this feature is meant to avoid.
     */
    @Test
    fun theTwentyNinthOfFebruaryIsNotSkipped() {
        // 2028 has a 29th, so that is the day.
        assertTrue(Birthday.isToday("1988-02-29", "2028-02-29"))
        assertFalse(Birthday.isToday("1988-02-29", "2028-02-28"))
        // 2026 has not, so the 28th is.
        assertTrue(Birthday.isToday("1988-02-29", "2026-02-28"))
        assertFalse(Birthday.isToday("1988-02-29", "2026-03-01"))
        // 1900 was not a leap year and 2000 was — the century rule, in case a date of
        // birth or a phone's clock ever lands on one.
        assertTrue(Birthday.isToday("1988-02-29", "2100-02-28"))
        assertTrue(Birthday.isToday("1988-02-29", "2000-02-29"))
        assertFalse(Birthday.isToday("1988-02-29", "2000-02-28"))
        // And somebody born on the 28th is greeted on the 28th, both kinds of year,
        // rather than being caught up in the rule above.
        assertTrue(Birthday.isToday("1990-02-28", "2026-02-28"))
        assertTrue(Birthday.isToday("1990-02-28", "2028-02-28"))
        assertFalse(Birthday.isToday("1990-02-28", "2028-02-29"))
    }

    @Test
    fun theGreetingIsAadilsWording() {
        assertEquals("Happy birthday AADIL, have a blessed day", Birthday.greeting("AADIL"))
        // The FIRST name only. "Happy birthday AADIL MOOLLA" reads like a payslip.
        assertEquals("Happy birthday AADIL, have a blessed day",
            Birthday.greeting("AADIL MOOLLA"))
        // Taken in the case it is given: the capitals rule lives in the UI layer, and
        // this is the sentence around the name rather than the name itself.
        assertEquals("Happy birthday Aadil, have a blessed day", Birthday.greeting("Aadil"))
        // Somebody with no first name still gets greeted, rather than greeted badly.
        assertEquals("Happy birthday, have a blessed day", Birthday.greeting(""))
        assertEquals("Happy birthday, have a blessed day", Birthday.greeting("  "))
    }
}
