package co.za.cspc.fleettracker.ui.employee

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.za.cspc.fleettracker.data.model.Performance
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.repository.FleetRepository
import kotlinx.coroutines.launch

/**
 * How a team stands on one metric, without the figure.
 *
 * The figure is dropped on purpose, exactly as the portal's leaderboard drops it: an
 * employee sees where their team came, not what anybody scored. Nothing downstream can
 * show what the board is meant to hide, because nothing downstream is given it.
 */
data class Standing(
    val position: Int?,
    val teamsRanked: Int,
    /** Teams with nothing uploaded for the month, which are unranked rather than last. */
    val teamsUnranked: Int
)

data class PerformanceUiState(
    val loading: Boolean = true,
    val month: String = "",
    /** Blank means every network added together. */
    val network: String = "",
    val teamName: String = "",
    val figures: Performance.Figures? = null,
    val basicSalaryRands: Double? = null,
    val commissionRands: Double? = null,
    /** One row per network FY was paid on, in a fixed order. Empty when none was. */
    val fy: List<Performance.Fy> = emptyList(),
    val connectionsStanding: Standing? = null,
    val activationsStanding: Standing? = null,
    val message: String? = null
) {
    /**
     * Nothing has been uploaded for this month at all. Said in a sentence rather than
     * drawn as a row of dashes, which reads like a fault in the app.
     */
    /** Every network's FY added up, or null when none arrived. */
    val fyTotalRands: Double? get() = Performance.fyTotal(fy)

    /**
     * What this person is owed for the month.
     *
     * Basic and commission are paid every month, so their absence means the file has not
     * arrived and the total cannot be stated — it stays a dash. FY is an OCCASIONAL
     * incentive, so its absence is the normal case and must not blank the total; it is
     * added when it is there.
     */
    val totalPayRands: Double?
        get() = Performance.totalPay(basicSalaryRands, commissionRands, fyTotalRands)

    val nothingYet: Boolean
        get() = figures?.hasAnything != true
            && commissionRands == null && basicSalaryRands == null && fy.isEmpty()
}

/**
 * An employee's own performance: their team's figures, their own commission, and where
 * their team came.
 *
 * The month's rows for EVERY team are what a position costs — there is no cheaper way to
 * know where a team stands than to read what every team did. So they are fetched once
 * and held for as long as this view model lives, and re-reading a month already seen
 * costs nothing. Switching network does not re-read at all: the rows are already here
 * and the split is arithmetic.
 */
class PerformanceViewModel(
    private val repo: FleetRepository = FleetRepository()
) : ViewModel() {

    var uiState by mutableStateOf(PerformanceUiState())
        private set

    private var profile: UserProfile? = null

    /** Months already fetched, keyed by month, so paging back and forth reads once. */
    private val monthCache = mutableMapOf<String, List<Performance.TeamRow>>()
    private val payCache = mutableMapOf<String, FleetRepository.MyPay>()
    private val fyCache = mutableMapOf<String, List<Performance.Fy>>()

    fun load(profile: UserProfile, month: String = FleetRepository.thisMonthString()) {
        this.profile = profile
        uiState = uiState.copy(
            loading = true,
            month = month,
            teamName = profile.teamName,
            message = null
        )
        viewModelScope.launch {
            // Anything here can fail — no signal, rules not deployed, an employee with no
            // team. Without this catch the exception escapes the coroutine and takes the
            // app down, which is a poor way to say "we could not load your figures".
            try {
                val rows = monthCache.getOrPut(month) { repo.allTeamFigures(month) }
                // Their own pay is a nice-to-have next to the team's figures: if this
                // one query fails, the rest of the screen should still draw.
                val pay = payCache.getOrPut(month) {
                    runCatching { repo.myPay(profile.uid, month) }
                        .getOrDefault(FleetRepository.MyPay(null, null))
                }
                // FY is a nice-to-have beside the team's figures, like their pay: if
                // this one query fails the rest of the screen should still draw.
                val fy = fyCache.getOrPut(month) {
                    Performance.fyInOrder(
                        runCatching { repo.myFy(profile.uid, month) }.getOrDefault(emptyList())
                    )
                }
                uiState = uiState.copy(
                    loading = false,
                    basicSalaryRands = pay.basicSalaryRands,
                    commissionRands = pay.commissionRands,
                    fy = fy
                )
                recompute(rows)
            } catch (e: Exception) {
                uiState = uiState.copy(
                    loading = false,
                    message = "Could not load your figures: ${e.message}"
                )
            }
        }
    }

    /** Switching network is arithmetic on rows already fetched, so it reads nothing. */
    fun setNetwork(network: String) {
        uiState = uiState.copy(network = network)
        monthCache[uiState.month]?.let { recompute(it) }
    }

    fun setMonth(month: String) {
        profile?.let { load(it, month) }
    }

    fun clearMessage() {
        uiState = uiState.copy(message = null)
    }

    private fun recompute(rows: List<Performance.TeamRow>) {
        val myKey = Performance.teamKey(uiState.teamName)
        val network = uiState.network

        val mine = rows.filter { it.teamKey == myKey }
        val figures = if (myKey.isEmpty()) null else Performance.figuresFor(mine, network)

        uiState = uiState.copy(
            figures = figures,
            connectionsStanding = standing(rows, myKey, network) { it.connections },
            activationsStanding = standing(rows, myKey, network) { it.activations }
        )
    }

    /**
     * Where this team came on one metric, among every team with a figure for the month.
     *
     * Built from the same rows and the same rule the portal's board uses, so the two
     * cannot disagree — which matters more here than usual, because the figures are
     * hidden and nobody looking at a position can check it.
     */
    private fun standing(
        rows: List<Performance.TeamRow>,
        myKey: String,
        network: String,
        pick: (Performance.Figures) -> Long?
    ): Standing? {
        if (myKey.isEmpty()) return null

        // One entry per team, its figures already summed across the chosen networks.
        val byTeam = rows.groupBy { it.teamKey }
        val keys = byTeam.keys.toList()
        val figures = keys.map { key ->
            Performance.figuresFor(byTeam.getValue(key), network)?.let(pick)
        }

        val positions = Performance.positions(figures)
        val index = keys.indexOf(myKey)
        return Standing(
            position = if (index < 0) null else positions[index],
            teamsRanked = positions.count { it != null },
            teamsUnranked = positions.count { it == null }
        )
    }
}
