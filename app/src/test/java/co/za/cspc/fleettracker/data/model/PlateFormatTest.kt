package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the PHONE APP's plate formatting against the shared specification.
 *
 * The same table is run against the admin portal by web/plate-format-test.mjs. Two
 * implementations, one specification — the third rule in this project to be held that
 * way, after the service schedule and the parking curfew.
 *
 * A plain JVM test: [PlateFormat] takes a string and touches nothing Android.
 */
class PlateFormatTest {

    private data class Case(val name: String, val input: String, val display: String)

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
        // Deliberately NOT trimming the lines: the spacing inside a case is the whole
        // point of this table, so only blank lines and comments are dropped.
        val lines = specFile().readLines()
            .map { it.removePrefix("﻿") }
            .filter { it.isNotBlank() && !it.trimStart().startsWith("#") }

        assertEquals("unexpected columns in $SPEC_NAME", COLUMNS, lines.first().split(","))

        return lines.drop(1).map { line ->
            val f = line.split(",")
            Case(name = f[0], input = f.getOrElse(1) { "" }, display = f.getOrElse(2) { "" })
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
            val got = PlateFormat.display(c.input)
            if (got != c.display) failures += "${c.name}: got \"$got\", want \"${c.display}\""
        }

        assertEquals(
            "the phone app does not match $SPEC_NAME:\n  " + failures.joinToString("\n  "),
            emptyList<String>(),
            failures.toList()
        )
    }

    /**
     * Formatting is for reading, not for identity. If it changed what a plate reduces
     * to, a vehicle would stop matching the employee who typed its registration, and
     * the day view would start reporting vehicles as having no driver.
     */
    @Test
    fun formattingNeverChangesWhatAPlateIs() {
        for (c in cases()) {
            assertEquals(
                "${c.name} changed identity",
                PlateFormat.key(c.input),
                PlateFormat.key(PlateFormat.display(c.input))
            )
        }
    }

    @Test
    fun aSearchIgnoresSpacingOnBothSides() {
        assertTrue(PlateFormat.matches("BC 45 DF GP", "bc45"))
        assertTrue(PlateFormat.matches("BC45DFGP", "BC 45"))
        assertTrue(PlateFormat.matches("BC 45 DF GP", "DFGP"))
        assertFalse(PlateFormat.matches("BC 45 DF GP", "ZZ"))
    }

    /**
     * An empty box must not match through this path — the caller decides not to filter
     * at all, rather than filtering with something that matches everything.
     */
    @Test
    fun anEmptySearchMatchesNothingHere() {
        assertFalse(PlateFormat.matches("BC 45 DF GP", ""))
        assertFalse(PlateFormat.matches("BC 45 DF GP", "   "))
    }

    private companion object {
        const val SPEC_NAME = "plate-format-cases.csv"
        val COLUMNS = listOf("name", "input", "display")
    }
}
