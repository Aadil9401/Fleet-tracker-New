package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What [FuelSlip] reads off a slip, against the layouts South African forecourts
 * actually print.
 *
 * The cases are the specification here — there is only one implementation, so unlike
 * the service rules and the parking curfew there is nothing to hold to a shared table.
 * What there is instead is a long list of ways a slip can be misread, most of which
 * were found by running the algorithm rather than by thinking about it.
 *
 * A plain JVM test: [FuelSlip] takes a string and touches neither ML Kit nor a camera.
 */
class FuelSlipTest {

    private fun read(slip: String) = FuelSlip.read(slip.trimIndent())

    /** Doubles from parsing are exact here — every expected value is a printed figure. */
    private fun check(slip: String, amount: Double?, litres: Double?, price: Double? = null) {
        val got = read(slip)
        assertEquals("amount", amount, got.amountRands)
        assertEquals("litres", litres, got.litres)
        assertEquals("price per litre", price, got.pricePerLitre)
    }

    // ---------- the ordinary cases ----------

    @Test
    fun readsALabelledSlipWithTheFiguresOnTheSameLines() = check(
        """
        ENGEN GARDEN CITY
        VAT REG NO 4123456789
        PUMP 4  ATTENDANT 12
        DIESEL 50PPM
        LITRES        45.67
        PRICE/L       23.45
        TOTAL       R1070.96
        VAT 15%       139.69
        CARD  ****1234
        2026/08/31 14:32
        """,
        amount = 1070.96, litres = 45.67, price = 23.45
    )

    @Test
    fun readsAmountDueAndAVolumeCarryingItsUnit() = check(
        """
        SHELL ULTRA CITY
        UNLEADED 95
        VOLUME  32.00 L
        UNIT PRICE  22.13
        AMOUNT DUE  R708.16
        """,
        amount = 708.16, litres = 32.0, price = 22.13
    )

    @Test
    fun readsCommaDecimals() = check(
        """
        BP EXPRESS
        LITRES 50,00
        PRICE/L 21,50
        TOTAL R1075,00
        """,
        amount = 1075.0, litres = 50.0, price = 21.5
    )

    @Test
    fun readsAThousandsSeparatorPrintedAsASpace() = check(
        """
        SASOL
        QUANTITY 62.500
        UNIT PRICE 24.10
        TOTAL DUE R1 506.25
        """,
        amount = 1506.25, litres = 62.5, price = 24.1
    )

    @Test
    fun readsAThousandsSeparatorPrintedAsAComma() = check(
        """
        TOTAL GARAGE
        VOLUME 55.00
        PRICE 23.00
        GRAND TOTAL R1,265.00
        """,
        amount = 1265.0, litres = 55.0, price = 23.0
    )

    @Test
    fun readsATwoColumnLayoutWithTheFigureOnTheFollowingLine() = check(
        """
        ASTRON ENERGY
        LITRES
        40.00
        PRICE/L
        22.50
        TOTAL
        900.00
        """,
        amount = 900.0, litres = 40.0, price = 22.5
    )

    @Test
    fun readsLitresPrintedToThreeDecimalsAsPumpsDo() = check(
        """
        SASOL
        LITRES 62,500
        TOTAL 1506,25
        """,
        amount = 1506.25, litres = 62.5
    )

    @Test
    fun readsATinyPurchaseAndAHugeOne() {
        check("ENGEN\nLITRES 0.87\nTOTAL 20.00", amount = 20.0, litres = 0.87)
        check(
            "ENGEN\nLITRES 600.00\nPRICE/L 23.00\nTOTAL 13800.00",
            amount = 13800.0, litres = 600.0, price = 23.0
        )
    }

    @Test
    fun readsAnAmountRunTogetherWithItsLabelOrItsRandSign() {
        check("ENGEN\nTOTAL:R1070.96", amount = 1070.96, litres = null)
        check("ENGEN\nTOTAL1070.96", amount = 1070.96, litres = null)
    }

    // ---------- the figures that must NOT be taken ----------

    @Test
    fun theVatLineIsNotTheTotal() = check(
        """
        ENGEN
        LITRES 30.00
        TOTAL 690.00
        VAT 15% 90.00
        """,
        amount = 690.0, litres = 30.0
    )

    @Test
    fun butTotalInclVatIsStillTheTotal() = check(
        """
        SHELL
        LITRES 30.00
        TOTAL INCL VAT 690.00
        """,
        amount = 690.0, litres = 30.0
    )

    @Test
    fun cashTenderedAndChangeAreNotTheTotal() = check(
        """
        SHELL
        LITRES 20.00
        TOTAL 460.00
        CASH TENDERED 500.00
        CHANGE 40.00
        """,
        amount = 460.0, litres = 20.0
    )

    @Test
    fun theFuelGradeOnTheLineIsNotTheLitres() = check(
        """
        ENGEN
        DIESEL 50PPM
        LITRES 45.67
        TOTAL 1070.96
        """,
        amount = 1070.96, litres = 45.67
    )

    @Test
    fun aDateAndATimeAreNotFigures() = check(
        """
        ENGEN
        2026/08/31 14:32
        TOTAL 500.00
        """,
        amount = 500.0, litres = null
    )

    @Test
    fun aMaskedCardNumberIsNotAnAmount() = check(
        """
        SHELL
        CARD 1234567890123456
        LITRES 30.00
        TOTAL 690.00
        """,
        amount = 690.0, litres = 30.0
    )

    /**
     * Total is a real forecourt brand. Its name at the top of the slip used to match the
     * TOTAL label, find no figure on that line, borrow the line below — and report a
     * R12 fill off "PUMP 12".
     */
    @Test
    fun aBrandNameContainingALabelIsNotALabel() {
        check(
            """
            TOTAL GARAGE MIDRAND
            PUMP 12
            LITRES 20.00
            AMOUNT 460.00
            """,
            amount = 460.0, litres = 20.0
        )
        check(
            """
            TOTAL SERVICE STATION
            PUMP 12 ATTENDANT 7
            AMOUNT DUE 460.00
            """,
            amount = 460.0, litres = null
        )
    }

    /**
     * A label alone on its line may borrow the figure below it, but only bare digits —
     * this used to reach past a blank line and report the price per litre as the volume.
     */
    @Test
    fun anEmptyLabelDoesNotBorrowAnotherLabelsFigure() = check(
        """
        SASOL
        LITRES

        PRICE/L 22.50
        TOTAL 900.00
        """,
        amount = 900.0, litres = 40.0, price = 22.5
    )

    @Test
    fun aShopItemQuantityIsNotTheVolume() = check(
        """
        ENGEN QUICKSHOP
        QTY 2 PIE 30.00
        LITRES 20.00
        TOTAL 460.00
        """,
        amount = 460.0, litres = 20.0
    )

    /** A fuel-only total is preferred over one that has a pie in it. */
    @Test
    fun theFuelTotalWinsOverACombinedTotal() = check(
        """
        ENGEN
        FUEL TOTAL 690.00
        SHOP TOTAL 45.00
        TOTAL 735.00
        """,
        amount = 690.0, litres = null
    )

    // ---------- filling in the third figure ----------

    @Test
    fun derivesTheAmountFromTheVolumeAndThePrice() = check(
        """
        PUMA ENERGY
        LITRES 40.00
        PRICE/L 22.50
        T0TA1 ###
        """,
        amount = 900.0, litres = 40.0, price = 22.5
    )

    @Test
    fun derivesTheVolumeFromTheAmountAndThePrice() = check(
        """
        ENGEN
        L1TRES ###
        PRICE/L 22.50
        TOTAL 900.00
        """,
        amount = 900.0, litres = 40.0, price = 22.5
    )

    // ---------- when it cannot read the slip ----------

    @Test
    fun givesUpRatherThanGuessingWhenThereIsNothingToRead() {
        val got = read(
            """
            SOME GARAGE
            THANK YOU FOR YOUR SUPPORT
            DRIVE SAFELY
            """
        )
        assertNull(got.amountRands)
        assertNull(got.litres)
        assertFalse("an unreadable slip must not claim it read something", got.readAnything)
    }

    @Test
    fun givesUpOnARandFigureWithNoLabelAtAll() {
        // Deliberate: a lone number on a slip could be anything, and a wrong prefill is
        // worse than an empty field the employee has to fill in anyway.
        val got = read("ENGEN\nR1070.96")
        assertNull(got.amountRands)
        assertFalse(got.readAnything)
    }

    @Test
    fun emptyTextIsNotACrash() {
        val got = read("")
        assertNull(got.amountRands)
        assertNull(got.litres)
        assertNull(got.pricePerLitre)
        assertFalse(got.readAnything)
    }

    @Test
    fun readingTheAmountAloneCountsAsHavingReadSomething() {
        check("ENGEN\nTOTAL 500.00", amount = 500.0, litres = null)
        assertTrue(read("ENGEN\nTOTAL 500.00").readAnything)
    }

    @Test
    fun aLowercaseSlipReadsTheSameAsAnUppercaseOne() {
        val upper = read("ENGEN\nLITRES 30.00\nTOTAL 690.00")
        val lower = read("Engen\nLitres 30.00\nTotal 690.00")
        assertEquals(upper, lower)
    }
}
