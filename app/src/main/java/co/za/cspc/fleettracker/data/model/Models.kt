package co.za.cspc.fleettracker.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

/** Roles a user account can have. */
object Role {
    const val ADMIN = "admin"
    const val EMPLOYEE = "employee"
}

/**
 * Mirrors a document in the top-level "users" collection.
 * Document ID == Firebase Auth UID.
 */
data class UserProfile(
    @DocumentId val uid: String = "",
    val name: String = "",
    val surname: String = "",
    val email: String = "",
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
    val serviceIntervalKm: Long = 10000L,
    val serviceIntervalMonths: Long = 6L,
    @get:PropertyName("lastReminderNotifiedDate") @set:PropertyName("lastReminderNotifiedDate")
    var lastReminderNotifiedDate: String = ""
) {
    fun kmSinceService(): Long = (currentOdometerKm - lastServiceOdometerKm).coerceAtLeast(0)

    fun isServiceDueByKm(): Boolean = kmSinceService() >= serviceIntervalKm

    fun isServiceDueByDate(nowMillis: Long): Boolean {
        if (lastServiceDateMillis <= 0L) return false
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
    val vehicleId: String = ""
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
