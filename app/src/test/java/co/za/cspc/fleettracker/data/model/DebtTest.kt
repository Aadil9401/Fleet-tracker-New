package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The debt rules on the phone.
 *
 * Deliberately the SAME fixture the portal's render test uses — one invoice of three
 * products at R25 500, one part-paid at R7 500 with R2 500 against it, one settled at
 * R4 500. The two implementations read the same documents, so an employee seeing a
 * different balance from the one their admin is looking at is the failure worth guarding
 * against, and it would be a very loud one.
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

    /** An invoice is billed the sum of its lines, whatever they are. */
    @Test
    fun anInvoiceIsTheSumOfItsProducts() {
        assertEquals(25500.0, threeProducts.billed, 0.001)
        assertEquals(0.0, threeProducts.paid, 0.001)
        assertEquals(25500.0, threeProducts.outstanding, 0.001)
        assertFalse(threeProducts.settled)
    }

    /**
     * A PART payment comes off the invoice's balance and leaves the rest owing.
     *
     * The case an all-or-nothing "mark paid" could not express, and the reason payments
     * are recorded against the invoice rather than against one product on it.
     */
    @Test
    fun aPartPaymentLeavesTheRestOwing() {
        assertEquals(7500.0, partPaid.billed, 0.001)
        assertEquals(2500.0, partPaid.paid, 0.001)
        assertEquals(5000.0, partPaid.outstanding, 0.001)
        assertFalse(partPaid.settled)
    }

    /** Several part payments add up. Three payments are three records, not one. */
    @Test
    fun severalPartPaymentsAddUp() {
        val thrice = partPaid.copy(payments = listOf(
            Debt.Payment("INV-1042", 2500.0, "2026-09-01"),
            Debt.Payment("INV-1042", 2000.0, "2026-09-10"),
            Debt.Payment("INV-1042", 1000.0, "2026-09-20")
        ))
        assertEquals(5500.0, thrice.paid, 0.001)
        assertEquals(2000.0, thrice.outstanding, 0.001)
        assertFalse(thrice.settled)
    }

    @Test
    fun paidInFullIsSettled() {
        assertTrue(settled.settled)
        assertEquals(0.0, settled.outstanding, 0.001)
    }

    /**
     * An invoice paid to the last cent must read as SETTLED rather than owing R0,00.
     *
     * 0.1 + 0.2 is not 0.3 in binary, so without rounding to the cent this leaves a
     * balance of about four ten-thousandths of a cent that will never clear — and a
     * balance that will not clear is precisely the kind of thing somebody argues about.
     */
    @Test
    fun payingToTheLastCentSettlesIt() {
        val cents = Debt.Invoice(
            invoiceNumber = "INV-CENTS",
            invoiceDate = "2026-08-01",
            lines = listOf(line("Airtime", 1, 0.30)),
            payments = listOf(
                Debt.Payment("INV-CENTS", 0.10, "2026-08-02"),
                Debt.Payment("INV-CENTS", 0.20, "2026-08-03")
            )
        )
        assertTrue(cents.settled)
        assertEquals(0.0, cents.outstanding, 0.0001)
    }

    /**
     * Unsettled first, then oldest first.
     *
     * Somebody opening this wants to know what they owe; a wall of paid invoices above it
     * is in the way. Within what is owed, the oldest is the one being chased.
     */
    @Test
    fun whatIsOwedComesFirstAndOldestFirstWithinIt() {
        val ordered = Debt.invoicesInOrder(listOf(settled, partPaid, threeProducts))
        assertEquals(
            listOf("INV-1001", "INV-1042", "INV-1050"),
            ordered.map { it.invoiceNumber }
        )
        // The settled one is last despite sitting between the other two by date.
        assertTrue(ordered.last().settled)
    }

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

    /**
     * The calendar arithmetic, which is deliberately timezone-free.
     *
     * Leap years and the century rules are checked because a fleet in one country still
     * has to count days across February, and getting it wrong by one would misstate how
     * long every debt has been outstanding.
     */
    @Test
    fun daysAreCountedByTheCalendar() {
        assertEquals(0L, Debt.daysSince("2026-09-04", "2026-09-04"))
        assertEquals(1L, Debt.daysSince("2026-09-03", "2026-09-04"))
        assertEquals(174L, Debt.daysSince("2026-03-14", "2026-09-04"))
        assertEquals(365L, Debt.daysSince("2025-09-04", "2026-09-04"))
        // 2026 is not a leap year; 2024 and 2000 are; 1900 is not.
        assertEquals(1L, Debt.daysSince("2026-02-28", "2026-03-01"))
        assertEquals(2L, Debt.daysSince("2024-02-28", "2024-03-01"))
        assertEquals(2L, Debt.daysSince("2000-02-28", "2000-03-01"))
        assertEquals(1L, Debt.daysSince("1900-02-28", "1900-03-01"))
        assertEquals(1L, Debt.daysSince("2026-12-31", "2027-01-01"))
    }

    /** A date that will not parse ages to nothing, never to a wild number. */
    @Test
    fun anUnparseableDateAgesToNothing() {
        val today = "2026-09-04"
        assertNull(Debt.daysSince("", today))
        assertNull(Debt.daysSince(null, today))
        assertNull(Debt.daysSince("01/09/2026", today))
        assertNull(Debt.daysSince("2026-9-4", today))
        assertNull(Debt.daysSince("2026-09-04", "not a date"))
    }

    @Test
    fun daysAreLabelledForReading() {
        assertEquals("—", Debt.daysLabel(null))
        assertEquals("1 day", Debt.daysLabel(1))
        assertEquals("174 days", Debt.daysLabel(174))
        assertEquals("0 days", Debt.daysLabel(0))
    }
}
