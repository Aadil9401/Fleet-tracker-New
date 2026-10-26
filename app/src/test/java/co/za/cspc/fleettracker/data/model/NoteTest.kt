package co.za.cspc.fleettracker.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rules for a note of a discussion.
 *
 * Small, but worth holding: a note is a record both sides rely on, and the two ways it
 * can quietly fail are losing what somebody typed and letting two notes collide on one
 * document id.
 */
class NoteTest {

    private fun refusal(raw: String?): String =
        (Note.check(raw) as Note.Verdict.Refused).why

    private fun ready(raw: String?): String =
        (Note.check(raw) as Note.Verdict.Ready).text

    @Test
    fun `an empty note is refused rather than stored`() {
        assertTrue(Note.check("") is Note.Verdict.Refused)
        assertTrue(Note.check(null) is Note.Verdict.Refused)
        assertTrue(Note.check("   \n  ") is Note.Verdict.Refused)
    }

    @Test
    fun `the refusal says what to do about it`() {
        assertTrue(refusal("").contains("Write the note"))
    }

    /* THE LINE BREAKS SOMEBODY TYPED ARE PART OF WHAT THEY WROTE. A note entered as
       three points must not come back as one paragraph. */
    @Test
    fun `line breaks inside the note are kept`() {
        val typed = "Spoke to the office.\n\n- new stock Monday\n- leave approved"
        assertEquals(typed, ready(typed))
    }

    @Test
    fun `blank space around the note is trimmed off`() {
        assertEquals("Spoke to the office.", ready("\n  Spoke to the office.  \n\n"))
    }

    @Test
    fun `a note at the limit is accepted`() {
        val text = "x".repeat(Note.MOST_CHARACTERS)
        assertEquals(text, ready(text))
    }

    @Test
    fun `one character past the limit is refused, and says by how much`() {
        val text = "x".repeat(Note.MOST_CHARACTERS + 1)
        val why = refusal(text)
        assertTrue(why.contains("${Note.MOST_CHARACTERS + 1} characters"))
        assertTrue(why.contains("Split it"))
    }

    /* THE LIMIT IS MEASURED ON WHAT GETS STORED, not on what was typed. A note padded
       with blank lines is not over the limit once those are trimmed. */
    @Test
    fun `padding does not push a note over the limit`() {
        val text = "   " + "x".repeat(Note.MOST_CHARACTERS) + "\n\n  "
        assertTrue(Note.check(text) is Note.Verdict.Ready)
    }

    /* THE ID STARTS WITH THE UID because the security rule reads the id itself to decide
       whether the note belongs to whoever is writing it. */
    @Test
    fun `the id starts with the writer's uid`() {
        assertTrue(Note.documentId("abc123", 1_700_000_000_000L).startsWith("abc123_"))
    }

    /* TWO NOTES IN ONE SESSION MUST NOT COLLIDE. An id built from the day alone would
       let the second note of an afternoon overwrite the first — and the rules refuse an
       update, so it would not overwrite, it would simply fail to save. */
    @Test
    fun `two notes a millisecond apart get different ids`() {
        assertTrue(
            Note.documentId("u", 1_700_000_000_000L) != Note.documentId("u", 1_700_000_000_001L)
        )
    }

    /* ZERO-PADDED so the ids sort in the order they were written when read raw, which is
       how an admin looking at the collection sees them. */
    @Test
    fun `ids sort in the order the notes were written`() {
        val early = Note.documentId("u", 999_999_999_999L)
        val late = Note.documentId("u", 1_700_000_000_000L)
        assertTrue("$early should sort before $late", early < late)
    }

    @Test
    fun `notes come back newest first`() {
        val entries = listOf(
            Note.Entry("a", "oldest", "2026-01-01", 100L),
            Note.Entry("c", "newest", "2026-03-01", 300L),
            Note.Entry("b", "middle", "2026-02-01", 200L)
        )
        assertEquals(listOf("newest", "middle", "oldest"), Note.inOrder(entries).map { it.text })
    }

    /* Two notes on one afternoon are still in the order they happened, because the sort
       is on the millisecond rather than on the day. */
    @Test
    fun `two notes on the same day keep their order`() {
        val entries = listOf(
            Note.Entry("a", "first", "2026-01-01", 1_000L),
            Note.Entry("b", "second", "2026-01-01", 2_000L)
        )
        assertEquals(listOf("second", "first"), Note.inOrder(entries).map { it.text })
    }
}
