package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Runs the PHONE APP's birthday and age rules against the shared specification.
 *
 * The same file is run against the admin portal by web/birthday-spec-test.mjs. Two
 * implementations, one specification — the fifth rule held that way in this project,
 * after the service schedule, the parking curfew, the plate format and the performance
 * figures.
 *
 * Worth a spec file because Aadil sees the same person's age on both surfaces, and asked
 * for the phone to show the age and never the date of birth. On the phone the age is
 * therefore the only thing anybody can check: if the two sides drift, one screen says
 * somebody is 39 while the other says 40, and there is nothing on either to say which is
 * right.
 *
 * This side asserts BOTH columns. The portal greets nobody, so it reads is_birthday and
 * skips it — but the two facts belong in one file, because the 29 February rule has to be
 * one rule: somebody born on the 29th ages on the 28th in a common year, which is the
 * same day they are greeted, and taking those from different places is how they come
 * apart.
 */
class BirthdaySpecTest {

    private data class Case(
        val dob: String,
        val today: String,
        val isBirthday: Boolean,
        val age: Int?
    )

    private companion object {
        const val SPEC_NAME = "birthday-cases.csv"
        val COLUMNS = listOf("dob", "today", "is_birthday", "age")
    }

    /**
     * Walks up from the working directory to find the spec, rather than trusting a
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
            // NOT trimmed away to nothing: one case is a blank date of birth, which is
            // the commonest state of all since most records have never had one.
            val f = line.split(",").map { it.trim() }
            Case(
                dob = f[0],
                today = f[1],
                isBirthday = f[2] == "yes",
                age = if (f[3] == "none") null else f[3].toInt()
            )
        }
    }

    @Test
    fun everyCaseIsRead() {
        // A spec file that silently reads as empty would make this whole class pass while
        // proving nothing.
        assert(cases().size >= 30) { "only ${cases().size} cases read from $SPEC_NAME" }
    }

    @Test
    fun theAppMatchesTheSpecification() {
        cases().forEach { c ->
            val where = "${c.dob.ifEmpty { "(blank)" }} on ${c.today.ifEmpty { "(blank)" }}"
            assertEquals(
                "$where: is it their birthday",
                c.isBirthday,
                Birthday.isToday(c.dob, c.today)
            )
            assertEquals("$where: age", c.age, Birthday.age(c.dob, c.today))
        }
    }
}
