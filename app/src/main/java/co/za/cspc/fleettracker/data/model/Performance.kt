package co.za.cspc.fleettracker.data.model

import java.util.Locale

/**
 * The performance rules, free of any Firebase import so they can be unit tested against
 * the shared specifications — the fourth rule in this project held that way, after the
 * service schedule, the parking curfew and the plate format.
 *
 * Two specifications sit at the repo root and are run against BOTH this file and the
 * admin portal:
 *
 *   performance-network-cases.csv — how a team's month adds up across networks
 *   performance-rank-cases.csv    — how teams are placed on the leaderboard
 *
 * Both matter more than they look. The portal and the app read the same documents, so a
 * drift between them shows the same team the same month as two different numbers with
 * nothing on either screen to say which is right. And the leaderboard hides the figures
 * on purpose, so a drift in the ranking is invisible to everyone except whoever gets
 * told they came fourth.
 */
object Performance {

    /**
     * The networks figures arrive for.
     *
     * A CLOSED list, matching the portal's NETWORKS. An unrecognised name is not a fifth
     * network: it cannot be filtered to, so a figure filed under one would appear to
     * have saved while being invisible on every screen that reads it.
     */
    val NETWORKS = listOf("MTN", "VODACOM", "CELLC", "TELKOM")

    /** How a network is written on screen, which is not how it is stored. */
    fun networkLabel(network: String): String = when (networkKey(network)) {
        "MTN" -> "MTN"
        "VODACOM" -> "Vodacom"
        "CELLC" -> "Cell C"
        "TELKOM" -> "Telkom"
        else -> "All networks"
    }

    /** Alternate names for the same network. Not misspellings — see the portal's note. */
    private val ALIASES = mapOf("CC" to "CELLC", "VODA" to "VODACOM", "VOD" to "VODACOM")

    /**
     * A network reduced to one of the four, or "" when it is none of them.
     *
     * Case, spaces and punctuation are dropped, so "Cell C", "CELLC" and "cell-c" are one
     * network. Commission carries no network — it is a person's pay, not a figure against
     * a product — and a blank here is what says so.
     */
    fun networkKey(value: String?): String {
        // Strictly A-Z0-9, for the same reason teamKey is — see the note there.
        val cleaned = (value ?: "").uppercase(Locale.ROOT)
            .filter { it in 'A'..'Z' || it in '0'..'9' }
        if (cleaned in NETWORKS) return cleaned
        return ALIASES[cleaned] ?: ""
    }

    /**
     * A team name reduced to something comparable: uppercased, punctuation dropped, runs
     * of space collapsed. Matches the portal's teamKey character for character.
     *
     * Team names are typed by hand in the staff list and again in the figures file, so
     * they will not match on the nose. Single spaces are KEPT on purpose, so SOWETO and
     * SOWETO EAST stay two teams rather than collapsing into one.
     */
    fun teamKey(value: String?): String = (value ?: "")
        .uppercase(Locale.ROOT)
        // Strictly A-Z0-9, matching the portal's [^A-Z0-9 ] rather than Kotlin's
        // Unicode-aware isLetterOrDigit(): an accented letter is a letter to Kotlin and
        // not to the regex, so the two would key the same name differently.
        .map { if (it in 'A'..'Z' || it in '0'..'9') it else ' ' }
        .joinToString("")
        .split(" ")
        .filter { it.isNotEmpty() }
        .joinToString(" ")

    /**
     * One team's three figures. Null means never uploaded, which is NOT zero: a missing
     * upload is not a month with no sales, and showing 0 would make an incomplete upload
     * look like a bad month.
     */
    data class Figures(
        val stock: Long? = null,
        val connections: Long? = null,
        val activations: Long? = null
    ) {
        val hasAnything: Boolean get() = stock != null || connections != null || activations != null
    }

    /** One stored row: a team's figures for one month on one network. */
    data class TeamRow(
        val teamKey: String,
        val team: String,
        val month: String,
        val network: String,
        val figures: Figures
    )

    /**
     * A team's month for one network, or for all of them when [network] is blank.
     *
     * Summed only over the networks that HAVE the figure, so a team with MTN stock and no
     * Vodacom stock keeps its MTN number.
     *
     * Rows carrying no recognised network are figures from before networks existed. They
     * are used only while the team has nothing networked for that month, and dropped the
     * moment a networked figure arrives — counting both would double the team's stock,
     * and a doubled total reads as a good month rather than as a fault.
     *
     * Returns null when the team has nothing to show for that request at all, which the
     * caller shows as absent rather than as dashes.
     */
    fun figuresFor(rows: List<TeamRow>, network: String): Figures? {
        if (rows.isEmpty()) return null
        val wanted = networkKey(network)

        val networked = rows.filter { networkKey(it.network).isNotEmpty() }
        val usable = if (networked.isNotEmpty()) networked else rows
        val chosen =
            if (wanted.isEmpty()) usable
            else usable.filter { networkKey(it.network) == wanted }
        if (chosen.isEmpty()) return null

        fun total(pick: (Figures) -> Long?): Long? {
            val present = chosen.mapNotNull { pick(it.figures) }
            return if (present.isEmpty()) null else present.sum()
        }

        return Figures(
            stock = total { it.stock },
            connections = total { it.connections },
            activations = total { it.activations }
        )
    }

    /**
     * One figure as a percentage of the earlier one it came from.
     *
     * Null when it cannot be worked out, never 0%. A missing denominator means the file
     * has not been uploaded, and 0% would read as "converted nothing" instead of "we do
     * not know" — the difference between a bad month and no data.
     *
     * A zero NUMERATOR against a real denominator is a real 0%: stock was issued and
     * nothing came of it. That is information, and it is shown.
     *
     * Deliberately not capped at 100%. More connections than stock means the stock figure
     * is understated or carried over, and hiding that behind a neat 100% would bury the
     * one thing worth asking about.
     */
    fun ratioPercent(numerator: Long?, denominator: Long?): Double? {
        if (denominator == null || denominator <= 0L) return null
        if (numerator == null) return null
        return numerator.toDouble() / denominator.toDouble() * 100.0
    }

    /** "63,3%", or a dash when there is nothing to divide. Comma decimal, as SA writes it. */
    fun percentLabel(value: Double?): String =
        if (value == null) "—" else String.format(Locale.US, "%.1f", value).replace('.', ',') + "%"

    /**
     * Competition positions for a list of figures, in the order given.
     *
     * Teams on equal figures share a position and the next position skips, so a tie for
     * first is followed by third. Dense ranking would say second, which reads as though
     * somebody came second when nobody did.
     *
     * A team with nothing uploaded gets null — NOT last place. Ranking it last would be a
     * judgement the data does not support: a missing file is not a bad month, and a
     * network a team does not sell is not a bad month either. Zero IS ranked, because
     * stock going out and nothing coming of it is a real result.
     */
    fun positions(figures: List<Long?>): List<Int?> {
        // Descending, keeping each figure's place in the caller's list so the answer can
        // be handed back in the order it arrived. Unwrapped to a non-null Long here
        // rather than sorted as a nullable, so the comparison is a total order.
        val placed: List<Pair<Int, Long>> = figures
            .mapIndexedNotNull { index, value -> value?.let { index to it } }
            .sortedByDescending { it.second }

        val result = MutableList<Int?>(figures.size) { null }
        var position = 0
        var previous: Long? = null
        placed.forEachIndexed { rank, (index, value) ->
            if (previous == null || value != previous) {
                // rank + 1, not position + 1: equal figures SHARE a position and the
                // next one skips, so a tie for first is followed by third.
                position = rank + 1
                previous = value
            }
            result[index] = position
        }
        return result
    }
}
