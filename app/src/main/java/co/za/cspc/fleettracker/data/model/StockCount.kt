package co.za.cspc.fleettracker.data.model

/**
 * WHAT A REP PHYSICALLY HAS WITH THEM, which nothing else in this app knows.
 *
 * The figures record what was ALLOCATED to a branch and what eventually ACTIVATED — 12.8
 * million against 4.2 million over nine months. If a SIM left a rep only when it
 * activated, every branch would be holding about 118 000 of them, six months of its own
 * allocation. It is not: a SIM goes to a shop long before anybody activates it, so the
 * gap is stock in the channel rather than stock in a boot, and a holding cannot be
 * derived from either figure at any confidence.
 *
 * So it is counted, and this is the counting.
 *
 * KEYED ON THE PERSON, not on the branch. The portal's own uploads are per branch, and a
 * rep's count is a claim about what THEY are carrying — filing it under their uid is the
 * only way a security rule can say "you may write this row and no other" without the
 * rule having to normalise a team name, which it cannot do. The portal resolves the
 * branch from the person when it reads them back, so a rep cannot write a count onto
 * somebody else's branch by typing a different team.
 */
object StockCount {

    /** The four networks, matching Performance.NETWORKS and the portal's own list. */
    val NETWORKS = Performance.NETWORKS

    /** How the document is addressed: one per person, per count date, per network. */
    fun documentId(uid: String, countedOn: String, network: String): String =
        "${uid}_${countedOn}_${network}"

    /**
     * One network's figure as typed on the phone.
     *
     * A BLANK IS NOT A NOUGHT. A branch that does not carry Cell C leaves the box empty
     * and no row is stored for it; one that carries it and has run out types 0, which is
     * a real stockout and IS stored. Reading the blank as nought would put every rep at
     * zero on every network they have never sold and bury the genuine stockouts among
     * them.
     */
    sealed interface Typed {
        /** Left empty — this rep does not carry that network. Nothing is written. */
        data object Absent : Typed

        /** A real count, zero included. */
        data class Held(val units: Long) : Typed

        /** Typed, but not a whole number of units. */
        data class Rejected(val why: String) : Typed
    }

    /**
     * Reads one box.
     *
     * Whole units only, and never negative. A decimal is a mistyped figure rather than a
     * half a SIM, and refusing it is better than storing a number nobody meant.
     */
    fun read(network: String, typed: String?): Typed {
        val text = (typed ?: "").trim()
        if (text.isEmpty()) return Typed.Absent
        val cleaned = text.replace(" ", "").replace(",", "")
        val value = cleaned.toLongOrNull()
        if (value == null || !cleaned.all { it.isDigit() }) {
            return Typed.Rejected("$network must be a whole number of units")
        }
        if (value < 0) return Typed.Rejected("$network cannot be less than nothing")
        return Typed.Held(value)
    }

    /** One row ready to be written. */
    data class Row(val network: String, val held: Long)

    /** Everything a submission can be. */
    sealed interface Verdict {
        data class Ready(val rows: List<Row>) : Verdict
        data class Refused(val why: String) : Verdict
    }

    /**
     * Turns the four boxes into rows, or says why it cannot.
     *
     * EVERY BOX EMPTY IS REFUSED. Somebody opened the screen meaning to count something,
     * and a submission that says nothing at all is a form left half filled rather than a
     * fact about the week. Saving it would also overwrite a real count from earlier with
     * silence.
     *
     * The first bad box is named rather than the count of them: a rep fixes one thing at
     * a time, and "three fields are wrong" is not a thing anybody can act on.
     */
    fun verdict(typed: Map<String, String?>): Verdict {
        val rows = mutableListOf<Row>()
        for (network in NETWORKS) {
            when (val one = read(network, typed[network])) {
                is Typed.Rejected -> return Verdict.Refused(one.why)
                is Typed.Held -> rows.add(Row(network, one.units))
                Typed.Absent -> Unit
            }
        }
        if (rows.isEmpty()) {
            return Verdict.Refused("Type at least one figure — an empty count says nothing.")
        }
        return Verdict.Ready(rows)
    }

    /**
     * What the screen says about a count already taken today.
     *
     * Counting again on the same day CORRECTS it rather than adding to it, because the
     * document is addressed by the day. Saying so is the difference between a rep fixing
     * a typo confidently and a rep afraid of doubling their own figure.
     */
    fun alreadyCountedMessage(countedOn: String, units: Long): String =
        "You counted $units on $countedOn. Saving again replaces that count."
}
