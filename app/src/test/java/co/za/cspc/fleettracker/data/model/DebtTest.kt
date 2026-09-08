package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The debt totals that only this side has.
 *
 * What an invoice is billed, what is paid off it, what is left, whether it is settled,
 * how old it is and the order they are listed in all live in debt-cases.csv, and are run
 * against this app by DebtSpecTest and against the admin portal by
 * web/debt-spec-test.mjs. A second copy of them here would make this a third place the
 * same rules are written down — the problem that file exists to solve, and the reason
 * the two sides were quietly disagreeing about ordering until it was written.
 *
 * What is left is the three ROLLUPS the phone screen needs and the portal computes its
 * own way: a balance, what has been paid to date, and the age of the oldest unpaid.
 * Each returns null rather than nought, and that distinction is the whole point of them
 * — "paid up" and "R0,00 owing" are different sentences.
 *
 * A plain JVM test: [Debt] touches nothing Android and nothing Firebase.
 */
class DebtTest {

    private fun line(product: String, quantity: Long, amount: Double) =
        Debt.Line(product, quantity, amount)

    private val threeProducts = Debt.Invoice(
        invoiceNumber = "INV-1001",
        invoiceDate = "2026-03-14",
        lines = listOf(
            line("Airtime", 50, 12500.0),
            line("SIM packs", 20, 4000.0),
            line("Devices", 2, 9000.0)
        ),
        payments = emptyList()
    )

    private val partPaid = Debt.Invoice(
        invoiceNumber = "INV-1042",
        invoiceDate = "2026-08-20",
        lines = listOf(line("Airtime", 30, 7500.0)),
        payments = listOf(Debt.Payment("INV-1042", 2500.0, "2026-09-01"))
    )

    private val settled = Debt.Invoice(
        invoiceNumber = "INV-1050",
        invoiceDate = "2026-08-28",
        lines = listOf(line("Devices", 1, 4500.0)),
        payments = listOf(Debt.Payment("INV-1050", 4500.0, "2026-09-02"))
    )

    /** The balance, and null when there is nothing owed rather than a zero. */
    @Test
    fun theBalanceIsWhatIsStillOwed() {
        assertEquals(30500.0,
            Debt.totalOutstanding(listOf(threeProducts, partPaid, settled))!!, 0.001)
        // Everything paid: null, so the screen can say "paid up" rather than show R0,00
        // as though it were a debt.
        assertNull(Debt.totalOutstanding(listOf(settled)))
        assertNull(Debt.totalOutstanding(emptyList()))
    }

    /** What they have paid, and null when they have paid nothing at all. */
    @Test
    fun paidToDateCountsOnlyRealPayments() {
        assertEquals(7000.0, Debt.totalPaid(listOf(threeProducts, partPaid, settled))!!, 0.001)
        // An invoice with no payments against it has nothing to report, and a line
        // reading R0,00 paid would be noise on the screen.
        assertNull(Debt.totalPaid(listOf(threeProducts)))
        assertNull(Debt.totalPaid(emptyList()))
    }

    /**
     * The age of the longest-standing UNPAID invoice.
     *
     * The number worth acting on: a big balance built this week is not the same problem
     * as a small one from March. A settled invoice has no age, however old it is.
     */
    @Test
    fun theOldestUnpaidIsWhatAges() {
        val today = "2026-09-04"
        assertEquals(174L,
            Debt.oldestUnpaidDays(listOf(threeProducts, partPaid, settled), today))
        // Only the settled one left: nothing to age.
        assertNull(Debt.oldestUnpaidDays(listOf(settled), today))
        assertNull(Debt.oldestUnpaidDays(emptyList(), today))
    }
}
