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
    fun kmSinceService(): Long = (currentOdometerKm - lastServiceOdometerKm).coerceAtLeast(0)

    /**
     * The odometer reading the next service falls due at — worked out automatically
     * by stepping the interval on from the last recorded service. With a 15 000 km
     * interval and a last service at 80 000, that's 95 000, then 110 000, and so on.
     */
    fun nextServiceAtKm(): Long =
        if (serviceIntervalKm <= 0) 0 else lastServiceOdometerKm + serviceIntervalKm

    /** Positive: km still to run. Negative: how far past due it already is. */
    fun kmUntilService(): Long = nextServiceAtKm() - currentOdometerKm

    /**
     * How many whole service intervals have gone by without one being recorded.
     * 2 or more means a service was missed entirely, not just left a bit late.
     */
    fun intervalsOverdue(): Int =
        if (serviceIntervalKm <= 0) 0 else (kmSinceService() / serviceIntervalKm).toInt()

    fun isServiceDueByKm(): Boolean = kmSinceService() >= serviceIntervalKm

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
    val notWorking: Boolean = false
) {
    val hasStarted: Boolean get() = startTimeMillis > 0L
    val hasEnded: Boolean get() = endTimeMillis > 0L
    val kmTravelled: Long get() = (endOdometerKm - startOdometerKm).coerceAtLeast(0)
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
