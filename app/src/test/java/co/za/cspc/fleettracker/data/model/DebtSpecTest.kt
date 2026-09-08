package co.za.cspc.fleettracker.data.model

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Runs the PHONE APP's debt rules against the shared specification.
 *
 * The same file is run against the admin portal by web/debt-spec-test.mjs. Two
 * implementations, one specification — the sixth rule held that way here, after the
 * service schedule, the parking curfew, the plate format, the performance figures and
 * the birthdays.
 *
 * It was the last rule implemented twice with nothing tying the two together. The
 * employee sees their own balance here and Aadil sees the same balance on the portal, so
 * a drift is an argument about money with nothing on either screen to settle it — and
 * writing the file found the two already disagreeing about the order invoices are
 * listed in.
 */
class DebtSpecTest {

    private data class Case(
        val written: String,
        val key: String,
        val lines: List<Double>,
        val payments: List<Double>,
        val invoiceDate: String,
        val today: String,
        val billed: Double,
        val paid: Double,
        val outstanding: Double,
        val settled: Boolean,
        val days: Long?
    )

    private companion object {
        const val SPEC_NAME = "debt-cases.csv"
        val COLUMNS = listOf("written", "key", "lines", "payments", "invoice_date", "today",
            "billed", "paid", "outstanding", "settled", "days")
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

    private fun cases(): List<Case> {
        val rows = specFile().readLines()
            .map { it.removePrefix("﻿") }
            .filter { it.isNotBlank() && !it.trim().startsWith("#") }

        assertEquals("unexpected columns in $SPEC_NAME", COLUMNS, rows.first().split(",")
            .map { it.trim() })

        // Fields are NOT trimmed. One case is an invoice written "INV - 1042", and the
        // whole point of that case is the spacing.
        fun amounts(s: String) =
            if (s.isBlank()) emptyList() else s.split("|").map { it.trim().toDouble() }

        return rows.drop(1).map { line ->
            val f = line.split(",")
            Case(
                written = f[0],
                key = f[1],
                lines = amounts(f[2]),
                payments = amounts(f[3]),
                invoiceDate = f[4].trim(),
                today = f[5].trim(),
                billed = f[6].trim().toDouble(),
                paid = f[7].trim().toDouble(),
                outstanding = f[8].trim().toDouble(),
                settled = f[9].trim() == "yes",
                days = if (f[10].trim() == "none") null else f[10].trim().toLong()
            )
        }
    }

    @Test
    fun everyCaseIsRead() {
        // A spec file that silently reads as empty would make this class pass while
        // proving nothing.
        assert(cases().size >= 25) { "only ${cases().size} cases read from $SPEC_NAME" }
    }

    @Test
    fun theAppMatchesTheSpecification() {
        cases().forEach { c ->
            val where = "${c.written.trim().ifEmpty { "(blank)" }} on ${c.today}"

            assertEquals("$where: key", c.key, Debt.invoiceKey(c.written))

            val invoice = Debt.Invoice(
                invoiceNumber = c.written,
                invoiceDate = c.invoiceDate,
                lines = c.lines.mapIndexed { i, a -> Debt.Line("p$i", 1L, a) },
                payments = c.payments.map { Debt.Payment(c.written, it) }
            )

            assertEquals("$where: billed", c.billed, invoice.billed, 0.005)
            assertEquals("$where: paid", c.paid, invoice.paid, 0.005)
            // Outstanding is compared EXACTLY, not within a tolerance: the rounding to
            // the cent is the rule under test, so a tolerance would hide it failing.
            assertEquals("$where: outstanding", c.outstanding, invoice.outstanding, 0.0)
            assertEquals("$where: settled", c.settled, invoice.settled)

            // The age, which only exists while something is owed.
            val age = if (invoice.settled) null else Debt.daysSince(c.invoiceDate, c.today)
            assertEquals("$where: days", c.days, age)
        }
    }

    /**
     * THE ORDER THEY ARE LISTED IN, which is not in the table because it is about a list
     * rather than an invoice. From the specification: unsettled first, then oldest, then
     * by number.
     *
     * This is the one the two sides already disagreed about — the portal sorted purely by
     * date and buried what was owed among what was paid.
     */
    @Test
    fun unsettledComeFirstThenOldestThenByNumber() {
        val owing = { number: String, date: String ->
            Debt.Invoice(number, date, listOf(Debt.Line("x", 1L, 100.0)), emptyList())
        }
        // INV-2 is the OLDEST and is settled, so it drops below the two still owing.
        val settled = Debt.Invoice("INV-2", "2026-03-01",
            listOf(Debt.Line("x", 1L, 100.0)), listOf(Debt.Payment("INV-2", 100.0)))

        val ordered = Debt.invoicesInOrder(
            listOf(owing("INV-1", "2026-04-01"), settled, owing("INV-3", "2026-05-01")))
        assertEquals(listOf("INV-1", "INV-3", "INV-2"), ordered.map { it.invoiceNumber })
    }

    @Test
    fun anAgeIsWrittenOutTheSameWayOnBothSides() {
        assertEquals("1 day", Debt.daysLabel(1L))
        assertEquals("0 days", Debt.daysLabel(0L))
        assertEquals("2 days", Debt.daysLabel(2L))
        assertEquals("178 days", Debt.daysLabel(178L))
        assertEquals("—", Debt.daysLabel(null))
    }
}
