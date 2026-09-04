package co.za.cspc.fleettracker.data.model

import java.util.Locale

/**
 * What an employee owes for stock taken, and what they have paid against it.
 *
 * Free of any Firebase import so it can be unit tested — the fifth rule in this project
 * held that way, after the service schedule, the parking curfew, the plate format and the
 * performance figures.
 *
 * The rules here match the portal's, because the two read the same documents: an invoice
 * is the unit that has a balance, its lines are what it is made of, and payments come off
 * the invoice rather than off one product on it. A person seeing a different balance on
 * their phone from the one their admin is looking at is the failure this exists to
 * prevent, and it would be a very loud one.
 */
object Debt {

    /**
     * An invoice number reduced to something comparable: uppercased, punctuation dropped,
     * runs of space collapsed. "INV-1042" and "INV 1042" are one invoice.
     *
     * Matches the portal's productKey, which is what its document ids are built from.
     * Grouping on the number as typed made a stray space into a second invoice, with the
     * payment sitting on only one of them.
     */
    fun invoiceKey(value: String?): String = (value ?: "")
        .uppercase(Locale.ROOT)
        .map { if (it in 'A'..'Z' || it in '0'..'9') it else ' ' }
        .joinToString("")
        .split(" ")
        .filter { it.isNotEmpty() }
        .joinToString(" ")

    /** One product on an invoice. */
    data class Line(
        val product: String,
        val quantity: Long = 0L,
        val amountRands: Double = 0.0
    )

    /** One payment made against an invoice. */
    data class Payment(
        val invoiceNumber: String,
        val amountRands: Double = 0.0,
        val paidDate: String = "",
        val note: String = ""
    )

    /**
     * One invoice, its lines, and what is left on it.
     *
     * [outstanding] is rounded to the cent before it is judged settled: 0.1 + 0.2 is not
     * 0.3 in binary, and an invoice paid to the last cent must read as settled rather
     * than as owing R0,00 — a balance that will not clear is the kind of thing somebody
     * argues about.
     */
    data class Invoice(
        val invoiceNumber: String,
        val invoiceDate: String,
        val lines: List<Line>,
        val payments: List<Payment>
    ) {
        val billed: Double get() = lines.sumOf { it.amountRands }
        val paid: Double get() = payments.sumOf { it.amountRands }
        val outstanding: Double get() = Math.round((billed - paid) * 100.0) / 100.0
        val settled: Boolean get() = outstanding <= 0.0
    }

    /**
     * Whole days from a yyyy-MM-dd date until [today], or null if it will not parse.
     *
     * Today is passed in rather than read from the clock, so the age of a debt can be
     * tested without the test being true for one day only.
     */
    fun daysSince(date: String?, today: String): Long? {
        val then = parseDate(date) ?: return null
        val now = parseDate(today) ?: return null
        return (now - then) / 86_400_000L
    }

    /** yyyy-MM-dd as UTC millis at midnight, or null. Deliberately calendar-free. */
    private fun parseDate(date: String?): Long? {
        val text = date ?: return null
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(text)) return null
        val (y, m, d) = text.split("-").map { it.toInt() }
        // Days since the epoch by the proleptic Gregorian calendar, so no timezone and
        // no Calendar instance can shift a date across a boundary.
        val a = (14 - m) / 12
        val yy = y + 4800 - a
        val mm = m + 12 * a - 3
        val julian = d + (153 * mm + 2) / 5 + 365L * yy + yy / 4 - yy / 100 + yy / 400 - 32045
        return (julian - 2440588L) * 86_400_000L
    }

    /**
     * The invoices, oldest first — because the oldest is the one being chased.
     *
     * Unsettled ones come first whatever their date: somebody opening this wants to know
     * what they owe, and a wall of paid invoices above it is in the way.
     */
    fun invoicesInOrder(invoices: List<Invoice>): List<Invoice> = invoices
        .sortedWith(compareBy({ it.settled }, { it.invoiceDate }, { it.invoiceNumber }))

    /** Everything still owed across every invoice. Null when nothing is owed at all. */
    fun totalOutstanding(invoices: List<Invoice>): Double? {
        val owing = invoices.filter { !it.settled }
        return if (owing.isEmpty()) null else owing.sumOf { it.outstanding }
    }

    /** Everything ever paid. Null when nothing has been. */
    fun totalPaid(invoices: List<Invoice>): Double? {
        val paid = invoices.sumOf { it.paid }
        return if (invoices.none { it.payments.isNotEmpty() }) null else paid
    }

    /**
     * The age of the longest-standing unpaid invoice, which is the number worth acting
     * on — a big balance built this week is not the same problem as a small one from
     * March.
     */
    fun oldestUnpaidDays(invoices: List<Invoice>, today: String): Long? =
        invoices.filter { !it.settled }
            .mapNotNull { daysSince(it.invoiceDate, today) }
            .maxOrNull()

    /** "45 days", or a dash where there is nothing outstanding to age. */
    fun daysLabel(days: Long?): String = when (days) {
        null -> "—"
        1L -> "1 day"
        else -> String.format(Locale.US, "%d days", days)
    }
}
