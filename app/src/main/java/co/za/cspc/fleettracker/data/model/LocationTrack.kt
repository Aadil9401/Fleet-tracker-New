package co.za.cspc.fleettracker.data.model

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * One recorded position, as it is stored and as it is drawn.
 *
 * Deliberately four small fields. Everything else a phone can report about a fix —
 * bearing, speed, altitude, the provider that produced it — answers no question anybody
 * has asked, and every one of them is another field of somebody's movements sitting in
 * a database. [accuracyMetres] earns its place because the rule below cannot work
 * without it: a fix has to be believable before it can be believed.
 */
data class TrackPoint(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    /** When the fix was taken, not when it was uploaded. Those differ by up to a flush. */
    val timeMillis: Long = 0L,
    val accuracyMetres: Double = 0.0
)

/**
 * What a recorded route means: how far apart two points are, and which points are worth
 * keeping at all.
 *
 * Kept out of the service that records it, and free of any Android import, for the same
 * reason as [ServiceSchedule] and [ParkingCurfew]: nothing here touches the framework,
 * so it can be unit tested on a plain JVM, and it is then the single place the rule is
 * written on the phone side.
 *
 * The same two rules exist once more in the admin portal's index.html, because a
 * self-contained HTML file with no build step cannot reach Kotlin. The specifications
 * both answer to are `location-distance-cases.csv` and `location-filter-cases.csv` at
 * the repo root, and `LocationTrackTest` runs this copy against them. Change a rule
 * there and you must change it in both; CI will tell you which one you missed.
 */
object LocationTrack {

    /**
     * Mean Earth radius. A sphere, not the ellipsoid the Earth actually is: the
     * difference is under half a percent anywhere in South Africa, and a figure both
     * sides compute identically is worth more here than a figure marginally truer on
     * one side and unreproducible on the other.
     */
    const val EARTH_RADIUS_M = 6_371_000.0

    /**
     * How far the phone must have moved from the last KEPT point before another one is
     * worth recording.
     *
     * A phone standing still reports a slow drift of positions, metres apart, for as
     * long as it is on. Summed naively that is kilometres of travel by somebody who
     * never left the depot — which is how a tracking feature comes to accuse an honest
     * driver, with a map that looks perfectly convincing.
     */
    const val MIN_MOVE_M = 15.0

    /**
     * The worst fix worth storing. A phone reports how sure it is; indoors and between
     * buildings that can run to hundreds of metres, and a point that vague is not a
     * position, it is a suburb.
     */
    const val MAX_ACCURACY_M = 50.0

    /**
     * The great-circle distance in metres.
     *
     * Haversine rather than the law of cosines, which loses its precision at exactly the
     * short distances this spends most of its time on — two points a few metres apart on
     * the same street.
     *
     * The longitude difference is taken inside the sine, so a route that crosses from
     * +179.9 to -179.9 reads as 22 km rather than most of the way around the world.
     * Nothing in this fleet will ever cross it; the case is in the specification because
     * a distance function that is wrong there is usually wrong for a subtler reason that
     * shows up somewhere that matters.
     */
    fun metresBetween(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLng / 2) * sin(dLng / 2)
        // min(1.0, ...) guards the rounding that can push a into fractionally over 1 for
        // two points at opposite ends of the Earth, where asin would then be NaN.
        return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
    }

    fun metresBetween(from: TrackPoint, to: TrackPoint): Double =
        metresBetween(from.lat, from.lng, to.lat, to.lng)

    /**
     * Whether a fix is worth keeping.
     *
     * BOTH THRESHOLDS ARE INCLUSIVE. "Moved at least this far" and "accurate to within
     * this much" are the readings, so a point exactly on the boundary is kept: where the
     * two are indistinguishable, the side that keeps the data is the recoverable one.
     *
     * The first fix of the day has no previous kept point to have moved away from, so
     * distance does not apply to it — but accuracy still does. A day that opens on a
     * fix good to half a kilometre opens in the wrong place.
     */
    fun shouldKeep(isFirst: Boolean, metresFromLastKept: Double, accuracyMetres: Double): Boolean {
        if (accuracyMetres > MAX_ACCURACY_M) return false
        return isFirst || metresFromLastKept >= MIN_MOVE_M
    }

    /**
     * The points worth keeping, in order, applied the way the phone applies it live:
     * each point measured against the last one KEPT, never against the last one seen.
     *
     * Measuring against the last one seen is the bug that makes the whole filter useless
     * — a phone creeping a metre at a time would drop every point for ever and record a
     * driver as having never moved.
     */
    fun keptPoints(points: List<TrackPoint>): List<TrackPoint> {
        val kept = mutableListOf<TrackPoint>()
        for (p in points) {
            val last = kept.lastOrNull()
            val moved = if (last == null) 0.0 else metresBetween(last, p)
            if (shouldKeep(last == null, moved, p.accuracyMetres)) kept.add(p)
        }
        return kept
    }

    /**
     * How far a route ran, in metres, over the points worth keeping.
     *
     * Filtered first rather than summed raw, which is the whole point: the raw sum of a
     * day's fixes is the drift plus the driving, and the drift is the larger of the two
     * on a day spent mostly parked.
     */
    fun routeMetres(points: List<TrackPoint>): Double {
        val kept = keptPoints(points)
        var total = 0.0
        for (i in 1 until kept.size) total += metresBetween(kept[i - 1], kept[i])
        return total
    }

    /** Metres as the kilometres everything else in this app is stated in. */
    fun routeKm(points: List<TrackPoint>): Double = routeMetres(points) / 1000.0
}
