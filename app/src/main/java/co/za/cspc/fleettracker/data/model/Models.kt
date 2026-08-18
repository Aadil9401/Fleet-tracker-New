package co.za.cspc.fleettracker.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

/** Roles a user account can have. */
object Role {
    const val ADMIN = "admin"
    const val EMPLOYEE = "employee"
}

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
    val serviceIntervalKm: Long = 15000L,
    /** Months between services. Zero or less turns the date-based check off. */
    val serviceIntervalMonths: Long = 6L,
    @get:PropertyName("lastReminderNotifiedDate") @set:PropertyName("lastReminderNotifiedDate")
    var lastReminderNotifiedDate: String = ""
) {
    /** The earliest milestone with no service logged against it. */
    fun firstUnloggedServiceKm(): Long =
        if (serviceIntervalKm <= 0) 0
        else ((lastServiceOdometerKm / serviceIntervalKm) + 1) * serviceIntervalKm

    /**
     * Services fall on absolute odometer milestones — every 15 000 km on the clock,
     * so 15 000 / 30 000 / … / 150 000. This is the next milestone ABOVE the current
     * reading: 149 000 gives 150 000, and a vehicle sitting exactly on 150 000 (just
     * serviced) gives 165 000.
     */
    fun nextServiceAtKm(): Long =
        if (serviceIntervalKm <= 0) 0
        else ((currentOdometerKm / serviceIntervalKm) + 1) * serviceIntervalKm

    /** How far still to run before the next milestone. */
    fun kmUntilService(): Long = nextServiceAtKm() - currentOdometerKm

    /**
     * Milestones the vehicle has driven past without a service being recorded.
     * At 151 000 with the last service logged at 135 000, the 150 000 service was
     * missed, so this is 1. Zero means nothing is outstanding.
     */
    fun milestonesMissed(): Int {
        if (serviceIntervalKm <= 0) return 0
        val reached = currentOdometerKm / serviceIntervalKm
        val servicedUpTo = lastServiceOdometerKm / serviceIntervalKm
        return (reached - servicedUpTo).coerceAtLeast(0L).toInt()
    }

    fun isServiceDueByKm(): Boolean = milestonesMissed() > 0

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
