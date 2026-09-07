package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The birthday greeting's WORDING, and nothing else.
 *
 * When is it somebody's birthday, and how old are they? Those live in
 * birthday-cases.csv and are run against this app by BirthdaySpecTest and against the
 * admin portal by web/birthday-spec-test.mjs. A second copy of them here would make this
 * a third place the same rules are written down, which is the problem that file exists to
 * solve — and the 29 February case is exactly where two copies would quietly disagree.
 *
 * What is left is the sentence itself, which only this side has.
 */
class BirthdayTest {

    @Test
    fun theGreetingIsAadilsWording() {
        assertEquals("Happy birthday AADIL, have a blessed day", Birthday.greeting("AADIL"))
    }

    @Test
    fun itUsesTheFirstNameOnly() {
        // "Happy birthday AADIL MOOLLA" reads like a payslip, not a greeting.
        assertEquals(
            "Happy birthday AADIL, have a blessed day",
            Birthday.greeting("AADIL MOOLLA")
        )
        // Extra spacing on a hand-typed record does not change the sentence.
        assertEquals(
            "Happy birthday AADIL, have a blessed day",
            Birthday.greeting("  AADIL   MOOLLA  ")
        )
    }

    @Test
    fun theNameIsTakenInTheCaseItIsGiven() {
        // The capitals rule lives in the UI layer; this is the sentence around the name,
        // and uppercasing it there would be shouting.
        assertEquals("Happy birthday Aadil, have a blessed day", Birthday.greeting("Aadil"))
    }

    @Test
    fun somebodyWithNoNameIsStillGreeted() {
        // Rather than greeted badly: "Happy birthday , have a blessed day" is worse than
        // no name at all, and a record with no first name is a real thing on this list.
        assertEquals("Happy birthday, have a blessed day", Birthday.greeting(""))
        assertEquals("Happy birthday, have a blessed day", Birthday.greeting("   "))
    }
}
