package co.za.cspc.fleettracker.data.model

import java.util.Locale

/**
 * A NOTE OF A DISCUSSION, written by the person who had it.
 *
 * Aadil: "when an employee discusses something with me, they can use their apps to make
 * notes of the discussion and if ever needed we can both trace it back".
 *
 * Free text on purpose. Every other thing this app records has a shape — a figure, a
 * date, an odometer reading — and the point of this one is that a conversation does not.
 * A form with fields would decide in advance what was worth writing down.
 *
 * A NOTE CANNOT BE CHANGED once it is written, in the rules and here. Both sides rely on
 * it, and a record either side can quietly edit afterwards is worth nothing: the first
 * argument about what was agreed becomes an argument about whether the note still says
 * what it said. A correction is a new note, which is why each one carries the moment it
 * was written.
 *
 * Free of any Firebase import so the rules below can be unit tested.
 */
object Note {

    /**
     * The longest a note may be, matching the rule in firestore.rules.
     *
     * Not a view about how much anybody should write — it is what stops a pasted
     * document becoming a document stored in a field nobody can read on a phone.
     */
    const val MOST_CHARACTERS = 4000

    sealed interface Verdict {
        data class Ready(val text: String) : Verdict
        data class Refused(val why: String) : Verdict
    }

    /**
     * A note as it will be stored, or why it will not be.
     *
     * Trailing blank lines are trimmed off the ends and nothing else is touched: the
     * line breaks somebody typed are part of what they wrote, and collapsing them would
     * turn a list of three points into a paragraph.
     */
    fun check(raw: String?): Verdict {
        val text = (raw ?: "").trim()
        if (text.isEmpty()) {
            return Verdict.Refused("Write the note first — an empty note records nothing.")
        }
        if (text.length > MOST_CHARACTERS) {
            return Verdict.Refused(
                "That is ${text.length} characters, and a note holds $MOST_CHARACTERS. "
                    + "Split it into two notes."
            )
        }
        return Verdict.Ready(text)
    }

    /**
     * The document id for a note.
     *
     * Starts with the writer's uid because the security rule reads the id itself to
     * decide whether this note is theirs — the same arrangement a stock count uses. The
     * millisecond keeps two notes on one day apart, and sorts them in the order they
     * were written when read raw.
     */
    fun documentId(uid: String, writtenAtMillis: Long): String =
        "${uid}_${String.format(Locale.US, "%013d", writtenAtMillis)}"

    /** One stored note, as the phone shows it back. */
    data class Entry(
        val id: String,
        val text: String,
        val writtenOn: String,
        val writtenAtMillis: Long
    )

    /**
     * Newest first — somebody opening their notes is looking for the last conversation,
     * not the first one. Ordered on the millisecond rather than the day, so two notes
     * written on one afternoon are still in the order they happened.
     */
    fun inOrder(entries: List<Entry>): List<Entry> =
        entries.sortedByDescending { it.writtenAtMillis }
}
