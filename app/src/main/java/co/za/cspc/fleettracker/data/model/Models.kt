package co.za.cspc.fleettracker.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

/** Roles a user account can have. */
object Role {
    const val ADMIN = "admin"
    const val EMPLOYEE = "employee"
}

/**
 * Absence categories. Kept as a fixed list so leave can actually be counted — free
 * text alone can't answer "how much sick leave did we have this month".
 */
/**
 * Named separately because the dialog asks for the dealership when this is the
 * reason — knowing which vehicle is sitting at which service centre is worth having.
 */
const val VEHICLE_IN_SERVICE = "Vehicle in for service"

val ABSENCE_REASONS = listOf(
    "Sick leave",
    "Annual leave",
    "Family responsibility",
    "Unpaid leave",
    "Public holiday",
    "No work allocated",
    VEHICLE_IN_SERVICE,
    "Other"
)

/** The nine South African provinces, offered as a picker on the add-employee form. */
val SA_PROVINCES = listOf(
    "Eastern Cape",
    "Free State",
    "Gauteng",
    "KwaZulu-Natal",
    "Limpopo",
    "Mpumalanga",
    "North West",
    "Northern Cape",
    "Western Cape"
)

/**
 * Mirrors a document in the top-level "users" collection.
 * Document ID == Firebase Auth UID.
 */
data class UserProfile(
    @DocumentId val uid: String = "",
    val name: String = "",
    val surname: String = "",
    /** Generated login username, e.g. "aadil.moolla@cspc.local". Not a real mailbox. */
    val email: String = "",
    /** The employee's real email address; where their login details were sent. */
    val contactEmail: String = "",
    val employeeNumber: String = "",
    val province: String = "",
    val teamName: String = "",
    /**
     * Registration the employee typed for the vehicle they drive. Free text, so it
     * works even before that vehicle exists in the fleet. The admin still assigns
     * the real [Vehicle] record via [assignedVehicleId] — employees can't do that
     * themselves, by design.
     */
    val vehicleRegistration: String = "",
    val role: String = Role.EMPLOYEE,
    val assignedVehicleId: String = "",
    val active: Boolean = true,
    val createdAt: Long = 0L
) {
    val fullName: String get() = "$name $surname".trim()
    val isAdmin: Boolean get() = role == Role.ADMIN
}

/** Mirrors a document in "vehicles". */
data class Vehicle(
    @DocumentId val id: String = "",
    val registrationNumber: String = "",
    val name: String = "",
    val currentOdometerKm: Long = 0L,
    val lastServiceOdometerKm: Long = 0L,
    val lastServiceDateMillis: Long = 0L,
    /** Where it was last serviced, e.g. "Suzuki Umhlanga". */
    val lastServiceProvider: String = "",
    val serviceIntervalKm: Long = 15000L,
    /** Months between services. Zero or less turns the date-based check off. */
    val serviceIntervalMonths: Long = 6L,
    @get:PropertyName("lastReminderNotifiedDate") @set:PropertyName("lastReminderNotifiedDate")
    var lastReminderNotifiedDate: String = ""
) {
    /**
     * The milestone the last recorded service satisfied. Servicing at 149 000 counts
     * as having done the 150 000 service, so the schedule steps on from there.
     */
    private fun servicedThroughKm(): Long =
        if (lastServiceOdometerKm <= 0L || serviceIntervalKm <= 0L) 0L
        else ((lastServiceOdometerKm + serviceIntervalKm - 1) / serviceIntervalKm) * serviceIntervalKm

    /**
     * 0 immediately after a service, 100 when the next one falls due — or null when
     * no service has ever been recorded, since there is then nothing to measure from.
     * A fabricated 0% for an unknown history reads as "just serviced", which is worse
     * than showing nothing.
     */
    fun percentToNextService(): Int? {
        if (serviceIntervalKm <= 0L || lastServiceOdometerKm <= 0L) return null
        val next = nextServiceAtKm()
        if (next <= lastServiceOdometerKm) return 100
        val pct = ((currentOdometerKm - lastServiceOdometerKm).toDouble() /
            (next - lastServiceOdometerKm) * 100).toInt()
        return pct.coerceIn(0, 100)
    }

    /**
     * Services fall on absolute odometer milestones — every 15 000 km on the clock,
     * so 15 000 / 30 000 / … / 150 000.
     *
     * With a service on record the schedule steps on from the milestone that service
     * satisfied, which is what makes the countdown restart when a vehicle is marked
     * serviced. With no service history at all, it falls back to the next milestone
     * above the current reading.
     */
    fun nextServiceAtKm(): Long = when {
        serviceIntervalKm <= 0L -> 0L
        lastServiceOdometerKm > 0L -> servicedThroughKm() + serviceIntervalKm
        else -> ((currentOdometerKm / serviceIntervalKm) + 1) * serviceIntervalKm
    }

    /** Positive: km still to run. Negative: how far past due it already is. */
    fun kmUntilService(): Long = nextServiceAtKm() - currentOdometerKm

    fun isServiceDueByKm(): Boolean =
        serviceIntervalKm > 0L && currentOdometerKm >= nextServiceAtKm()

    fun isServiceDueByDate(nowMillis: Long): Boolean {
        if (lastServiceDateMillis <= 0L) return false
        // Zero months means "judge by kilometres only". Without this guard a zero
        // interval would make every vehicle permanently overdue.
        if (serviceIntervalMonths <= 0L) return false
        val monthsMillis = serviceIntervalMonths * 30L * 24L * 60L * 60L * 1000L
        return nowMillis - lastServiceDateMillis >= monthsMillis
    }

    fun isServiceDue(nowMillis: Long): Boolean = isServiceDueByKm() || isServiceDueByDate(nowMillis)
}

/** One work day's clock-in / clock-out record. Doc id format: {uid}_{yyyy-MM-dd}. */
data class TimeLog(
    @DocumentId val id: String = "",
    val uid: String = "",
    val employeeName: String = "",
    val date: String = "", // yyyy-MM-dd
    val startTimeMillis: Long = 0L,
    val startOdometerKm: Long = 0L,
    val endTimeMillis: Long = 0L,
    val endOdometerKm: Long = 0L,
    val vehicleId: String = "",
    /** Free text: the main areas this person worked in that day. */
    val mainAreasWorked: String = "",
    /** Marked absent for the day — no clocking in or out, and no attendance alert. */
    val notWorking: Boolean = false,
    /** Why they're not working, e.g. "Sick leave", "Annual leave". */
    val notWorkingReason: String = ""
) {
    val hasStarted: Boolean get() = startTimeMillis > 0L
    val hasEnded: Boolean get() = endTimeMillis > 0L
    val kmTravelled: Long get() = (endOdometerKm - startOdometerKm).coerceAtLeast(0)

    /** Minutes between clocking in and knocking off. Zero until the day is finished. */
    val minutesWorked: Long
        get() = if (hasStarted && hasEnded && endTimeMillis > startTimeMillis) {
            (endTimeMillis - startTimeMillis) / 60_000L
        } else 0L

    /** "9h 25m", or a dash while the day is still open. */
    val durationLabel: String
        get() = if (minutesWorked <= 0L) "—" else "${minutesWorked / 60}h ${minutesWorked % 60}m"
}

/** A fuel purchase logged by an employee. */
data class FuelLog(
    @DocumentId val id: String = "",
    val uid: String = "",
    val employeeName: String = "",
    val date: String = "",
    val timestampMillis: Long = 0L,
    val amountSpentRands: Double = 0.0,
    val litres: Double = 0.0,
    val odometerKm: Long = 0L,
    val vehicleId: String = "",
    val receiptPhotoUrl: String = ""
)

/** App-wide settings, single doc at config/settings. */
data class AppSettings(
    val adminEmail: String = "",
    val notifyIfNotStartedByHour: Int = 9,
    val notificationsEnabled: Boolean = true
)
