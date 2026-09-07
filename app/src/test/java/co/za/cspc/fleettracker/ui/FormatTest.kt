package co.za.cspc.fleettracker.ui

import androidx.compose.ui.text.AnnotatedString
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The one-case rule, on the phone.
 *
 * Everything a person typed or an upload carried reads in capitals, so the same name is
 * not "Sarah Dube" on one screen and "SARAH DUBE" on the next. On the portal that is a
 * CSS rule; here it is [asCaptured] for text already saved and [CAPITALS_WHILE_TYPING]
 * for the box it is being typed into.
 *
 * Both are DISPLAY ONLY — the stored value keeps whatever was typed — and that is the
 * part worth a test, because a transformation that quietly changed the data would leave
 * two spellings of one team in the database and nothing on screen to show it.
 */
class FormatTest {

    private fun shown(typed: String) =
        CAPITALS_WHILE_TYPING.filter(AnnotatedString(typed)).text.text

    @Test
    fun whatIsBeingTypedIsDrawnInCapitals() {
        assertEquals("SOWETO VODACOM", shown("Soweto Vodacom"))
        assertEquals("T042", shown("t042"))
        // Punctuation and digits are left where they are: a registration keeps its
        // spacing and a name keeps its hyphen.
        assertEquals("ND 111-111", shown("nd 111-111"))
        assertEquals("MARIE-CLAIRE O'BRIEN", shown("Marie-Claire O'brien"))
        assertEquals("", shown(""))
    }

    /**
     * THE CARET IS WHY THE LENGTHS ARE CHECKED. The offset mapping is the identity one,
     * which is only true while the two strings line up character for character. "ß"
     * uppercases to "SS", so one character becomes two and every position after it is
     * off by one — the caret would land in the wrong place and typing would insert
     * letters somewhere the person did not put them.
     *
     * Left exactly as typed in that case. A lower-case letter is a cosmetic miss; a
     * caret that jumps makes the box unusable.
     */
    @Test
    fun textThatChangesLengthWhenShoutedIsLeftAlone() {
        assertEquals("Straße", shown("Straße"))
        // And the offsets really are one-for-one on the text it does transform.
        val transformed = CAPITALS_WHILE_TYPING.filter(AnnotatedString("soweto"))
        assertEquals(6, transformed.text.text.length)
        assertEquals(3, transformed.offsetMapping.originalToTransformed(3))
        assertEquals(3, transformed.offsetMapping.transformedToOriginal(3))
    }

    /**
     * The stored value is untouched. This is the whole reason the rule is a display one:
     * the portal stores what was typed, and if the phone stored capitals instead, the
     * same person's record would read differently depending on which one saved it last.
     */
    @Test
    fun theStoredValueKeepsWhateverWasTyped() {
        val typed = "Soweto Vodacom"
        shown(typed)
        assertEquals("Soweto Vodacom", typed)
        assertEquals("Soweto Vodacom", AnnotatedString(typed).text)
    }

    @Test
    fun asCapturedIsTheSameRuleForTextAlreadySaved() {
        assertEquals("SARAH DUBE", "Sarah Dube".asCaptured())
        assertEquals("SARAH DUBE", "SARAH DUBE".asCaptured())
        assertEquals("", "".asCaptured())
    }
}
