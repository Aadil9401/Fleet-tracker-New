package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The board every employee reads, and the sentence it produces.
 *
 * Aadil: "i want every single person signed up on the app to see whose birthday it is,
 * that would create team spirit, eg, everyone to see happy birthday george".
 *
 * A phone may read its own user record and no other, so it cannot work out whose birthday
 * it is — the admin portal publishes a small document and this reads it. What is tested
 * here is the LOOKUP: which keys of that document belong to today.
 *
 * The keys must agree with [Birthday.isToday], or the board greets on a different day
 * from the card on the same screen. That is asserted against birthday-cases.csv itself
 * rather than against a second copy of the rule.
 */
class BirthdayBoardTest {

    private companion object {
        const val SPEC_NAME = "birthday-cases.csv"
    }

    private fun specFile(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, SPEC_NAME)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw IllegalStateException("$SPEC_NAME not found in or above ${File("").absoluteFile}")
    }

    /**
     * THE TIE BETWEEN THE BOARD AND THE CARD.
     *
     * The board files a person under their own month and day. So for every case in the
     * specification, "is it their birthday" must equal "is their day one of today's
     * keys" — if those ever disagree, one employee sees a greeting for somebody who is
     * not being greeted on their own screen, and there is nothing on either to explain
     * which is right.
     */
    @Test
    fun theBoardLooksUpTheSameDaysTheGreetingUses() {
        val cases = specFile().readLines()
            .map { it.removePrefix("﻿").trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .drop(1)
            .map { it.split(",").map(String::trim) }

        assert(cases.size >= 30) { "only ${cases.size} cases read from $SPEC_NAME" }

        cases.forEach { f ->
            val dob = f[0]
            val today = f[1]
            val greeted = f[2] == "yes"

            // The key the board would file this person under. Blank when the date is not
            // a date, which is the case that must never be found under any key.
            val theirKey = if (Regex("""^\d{4}-\d{2}-\d{2}$""").matches(dob)) {
                dob.substring(5)
            } else ""

            val onTheBoard = theirKey.isNotEmpty()
                && Birthday.keysForToday(today).contains(theirKey)
                // A date that is the right shape but not a real day — "1986-13-01" — is
                // refused by the greeting, so it must not be published to the board
                // either. The portal builds the board through the same reader.
                && Birthday.age(dob, today) != null

            assertEquals(
                "$dob on $today: the board and the greeting disagree",
                greeted,
                onTheBoard
            )
        }
    }

    @Test
    fun aLeapDayBirthdayIsReadOnTheTwentyEighthOfACommonYear() {
        // Filed under its own day, so it has to be looked for under both.
        assertEquals(listOf("02-28", "02-29"), Birthday.keysForToday("2026-02-28"))
        // A leap year has a 29th of its own, so the 28th is only the 28th.
        assertEquals(listOf("02-28"), Birthday.keysForToday("2028-02-28"))
        assertEquals(listOf("02-29"), Birthday.keysForToday("2028-02-29"))
    }

    @Test
    fun anOrdinaryDayIsOneKey() {
        assertEquals(listOf("09-08"), Birthday.keysForToday("2026-09-08"))
        assertEquals(listOf("12-31"), Birthday.keysForToday("2026-12-31"))
        assertEquals(listOf("01-01"), Birthday.keysForToday("2026-01-01"))
    }

    @Test
    fun aTodayThatCannotBeReadFindsNobody() {
        // Rather than everybody: an unreadable clock must not greet the whole company.
        listOf("", "   ", "tomorrow", "08/09/2026", "2026-13-01", "2026-02-30")
            .forEach { assertEquals(it, emptyList<String>(), Birthday.keysForToday(it)) }
    }

    @Test
    fun oneBirthdayReadsAsOneSentence() {
        assertEquals(
            "Happy birthday GEORGE, have a blessed day",
            Birthday.greetingFor(listOf("GEORGE"))
        )
    }

    @Test
    fun severalBirthdaysReadOutLoudRatherThanAsAList() {
        // "GEORGE, THABO, SARAH" reads like a roll call; this is a greeting.
        assertEquals(
            "Happy birthday GEORGE and THABO, have a blessed day",
            Birthday.greetingFor(listOf("GEORGE", "THABO"))
        )
        assertEquals(
            "Happy birthday GEORGE, THABO and SARAH, have a blessed day",
            Birthday.greetingFor(listOf("GEORGE", "THABO", "SARAH"))
        )
    }

    @Test
    fun nobodyToGreetIsNoSentenceAtAll() {
        // The card is hidden on an empty string rather than showing an empty greeting.
        assertEquals("", Birthday.greetingFor(emptyList()))
        assertEquals("", Birthday.greetingFor(listOf("", "   ")))
        // And a blank among real names is dropped rather than leaving a gap in the list.
        assertEquals(
            "Happy birthday GEORGE, have a blessed day",
            Birthday.greetingFor(listOf("GEORGE", "  "))
        )
    }
}
