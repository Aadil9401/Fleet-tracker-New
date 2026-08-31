package co.za.cspc.fleettracker.data.model

/**
 * What was read off a fuel slip. Any field may be null: a slip that scanned badly
 * gives up some figures and not others, and a null means "type it in yourself"
 * rather than zero.
 */
data class ScannedSlip(
    val amountRands: Double? = null,
    val litres: Double? = null,
    val pricePerLitre: Double? = null
) {
    /** Whether the scan was worth anything at all. */
    val readAnything: Boolean get() = amountRands != null || litres != null
}

/**
 * Reads the figures off the text of a fuel slip.
 *
 * Separate from anything that touches a camera or ML Kit, and taking a plain string,
 * so the part that can actually be wrong — which number on the slip is the total — is
 * unit tested against real slip layouts on a JVM. See FuelSlipTest.
 *
 * Everything here only ever *prefills* the form. The employee sees what was read and
 * can overwrite any of it, so a misread costs a correction, never a wrong record. That
 * is the whole reason this is allowed to guess at all.
 */
object FuelSlip {

    /**
     * Longest first, so "AMOUNT DUE" is matched before the bare "AMOUNT" and
     * "TOTAL INCL VAT" before "TOTAL". A shorter label matching first would take the
     * number off the wrong line.
     */
    private val AMOUNT_LABELS = listOf(
        "TOTAL INCL VAT", "TOTAL AMOUNT", "AMOUNT DUE", "TOTAL DUE", "SALE TOTAL",
        "GRAND TOTAL", "TOTAL", "AMOUNT", "TOT"
    )

    private val LITRE_LABELS = listOf(
        "QUANTITY", "LITRES", "LITERS", "VOLUME", "LTRS", "LTR", "VOL", "QTY"
    )

    private val PRICE_LABELS = listOf(
        "PRICE PER LITRE", "PRICE/LITRE", "UNIT PRICE", "PRICE/L", "R/LITRE",
        "PER LITRE", "RATE", "R/L", "PRICE"
    )

    /**
     * Lines that carry a rand figure which is emphatically not the total. VAT is the
     * dangerous one: it sits right beside the total, in the same shape, and picking it
     * would under-report the spend by about seven eighths.
     */
    private val NOT_THE_TOTAL = listOf(
        "VAT", "CHANGE", "TENDER", "ROUNDING", "BALANCE", "SUBTOTAL", "SUB TOTAL",
        "DISCOUNT", "TIP", "LOYALTY", "POINTS"
    )

    /**
     * What a fill can plausibly be. Bounds, not validation: they exist to throw out OCR
     * noise — a VAT number read as an amount, a pump number read as litres — before it
     * reaches the form. Wide enough for a long-haul diesel bakkie and a R20 jerry can.
     */
    private val PLAUSIBLE_AMOUNT = 5.0..50_000.0
    private val PLAUSIBLE_LITRES = 0.5..2_000.0
    private val PLAUSIBLE_PRICE = 5.0..100.0

    fun read(text: String): ScannedSlip {
        val lines = text.uppercase()
            .split('\n')
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        var amount = labelled(lines, AMOUNT_LABELS, PLAUSIBLE_AMOUNT, skipLinesMatching = NOT_THE_TOTAL)
        var litres = labelled(lines, LITRE_LABELS, PLAUSIBLE_LITRES) ?: bareLitres(lines)
        val price = labelled(lines, PRICE_LABELS, PLAUSIBLE_PRICE)

        // A slip that names two of the three has told us the third. Worth doing: plenty
        // of slips print the volume and the price per litre clearly and the total in a
        // logo-heavy footer that scans badly.
        if (amount == null && litres != null && price != null) {
            amount = (litres * price).roundedToCents().takeIf { it in PLAUSIBLE_AMOUNT }
        }
        if (litres == null && amount != null && price != null && price > 0.0) {
            litres = (amount / price).roundedToCents().takeIf { it in PLAUSIBLE_LITRES }
        }

        return ScannedSlip(amountRands = amount, litres = litres, pricePerLitre = price)
    }

    /**
     * The number belonging to the first label that appears, in label order.
     *
     * Takes the LAST number on the line: slips print the label first and the figure
     * last, and a line like "DIESEL 50PPM 45.67" would otherwise hand back the grade.
     * Falls through to the following line for the two-column layouts that put the label
     * and its figure on separate rows — but only when the label is alone on its line and
     * the line below is bare digits, which is what keeps a brand name out of it.
     */
    private fun labelled(
        lines: List<String>,
        labels: List<String>,
        plausible: ClosedFloatingPointRange<Double>,
        skipLinesMatching: List<String> = emptyList()
    ): Double? {
        for (label in labels) {
            for ((index, line) in lines.withIndex()) {
                if (!line.contains(label)) continue
                // A label wins over the exclusions — "TOTAL INCL VAT" is still the total.
                if (skipLinesMatching.any { line.contains(it) } && !line.startsWith(label)) continue

                val at = line.indexOf(label)
                val onThisLine = numbersIn(line.substring(at + label.length))
                    .lastOrNull { it in plausible }
                if (onThisLine != null) return onThisLine

                // Only a line that is nothing BUT the label may borrow the number from
                // the line below it. "TOTAL GARAGE MIDRAND" is a brand name, not a label
                // with its figure underneath — and borrowing there took the pump number
                // off "PUMP 12" and reported a R12 fill.
                if (line.removeRange(at, at + label.length).any { it in 'A'..'Z' }) continue
                val next = lines.getOrNull(index + 1) ?: continue
                // And the line below must be nothing but a number, or it belongs to some
                // other label: borrowing across a blank line took a price as the litres.
                if (next.any { it in 'A'..'Z' }) continue
                val onNextLine = numbersIn(next).lastOrNull { it in plausible }
                if (onNextLine != null) return onNextLine
            }
        }
        return null
    }

    /** "45.67 L" or "45,67L" with no label in front of it, which some pumps print. */
    private fun bareLitres(lines: List<String>): Double? {
        val pattern = Regex("""(\d{1,4}(?:[ .,]\d{1,3})*)\s*(?:L|LT)(?![A-Z])""")
        for (line in lines) {
            if (NOT_THE_TOTAL.any { line.contains(it) }) continue
            for (match in pattern.findAll(line)) {
                val value = parseNumber(match.groupValues[1]) ?: continue
                if (value in PLAUSIBLE_LITRES) return value
            }
        }
        return null
    }

    /**
     * Every number on a line, in the order printed. Deliberately blind to anything
     * carrying a slash or a colon, so dates and times cannot be mistaken for figures.
     */
    private fun numbersIn(line: String): List<Double> =
        Regex("""(?<![\d/:.,])\d{1,6}(?:[ .,]\d{1,3})*(?![\d/:])""")
            .findAll(line)
            .mapNotNull { parseNumber(it.value) }
            .toList()

    /**
     * "1 070.96", "1,070.96", "1070,96" and "45.67" all mean what they look like.
     *
     * South African slips are inconsistent: the decimal is a comma on some and a full
     * stop on others, and OCR turns thousands separators into spaces. So the LAST
     * separator followed by one or two digits is the decimal point and every other
     * separator is thousands. Three digits after the last separator means it was a
     * thousands separator and the number is whole — except for litres, where three
     * decimals are normal, which is why a lone comma or stop is read as a decimal.
     */
    private fun parseNumber(raw: String): Double? {
        val cleaned = raw.trim().replace(" ", "")
        if (cleaned.isEmpty()) return null

        val lastSeparator = cleaned.lastIndexOfAny(charArrayOf('.', ','))
        if (lastSeparator < 0) return cleaned.toDoubleOrNull()

        val afterLast = cleaned.length - lastSeparator - 1
        val separatorCount = cleaned.count { it == '.' || it == ',' }

        // 1,070 / 1.070 — one separator, three digits after it, so thousands unless the
        // whole number is short enough that three decimals were plainly meant (45,678 L).
        val decimalHere = afterLast <= 2 || (separatorCount == 1 && lastSeparator <= 2)

        return if (decimalHere) {
            val whole = cleaned.substring(0, lastSeparator).filter { it.isDigit() }
            val fraction = cleaned.substring(lastSeparator + 1)
            "$whole.$fraction".toDoubleOrNull()
        } else {
            cleaned.filter { it.isDigit() }.toDoubleOrNull()
        }
    }

    private fun Double.roundedToCents(): Double = Math.round(this * 100.0) / 100.0
}
