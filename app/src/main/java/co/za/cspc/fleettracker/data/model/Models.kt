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

/**
 * Makes common on South African fleets. Used only to turn a vehicle name into a
 * sensible dealership search — "Suzuki Magnite" becomes "Suzuki dealership".
 */
val VEHICLE_MAKES = listOf(
    "Nissan", "Toyota", "Suzuki", "Ford", "Volkswagen", "VW", "Isuzu", "Hyundai",
    "Kia", "Mahindra", "Renault", "Mazda", "Chevrolet", "Haval", "Chery", "GWM",
    "Mercedes", "BMW", "Peugeot", "Opel", "Datsun"
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
    val cellNumber: String = "",
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
    // The service rules themselves live in ServiceSchedule, free of any Firebase
    // import so they can be unit tested against the shared specification. What is left
    // here is the mapping from this document's fields onto them.

    fun percentToNextService(): Int? = ServiceSchedule.percentToNextService(
        serviceIntervalKm, lastServiceOdometerKm, currentOdometerKm)

    fun nextServiceAtKm(): Long = ServiceSchedule.nextServiceAtKm(
        serviceIntervalKm, lastServiceOdometerKm, currentOdometerKm)

    /** Positive: km still to run. Negative: how far past due it already is. */
    fun kmUntilService(): Long = nextServiceAtKm() - currentOdometerKm

    fun isServiceDueByKm(): Boolean = ServiceSchedule.isServiceDueByKm(
        serviceIntervalKm, lastServiceOdometerKm, currentOdometerKm)

    /**
     * True once the vehicle is within the last 5% of its service window, which is
     * when offering to find a dealership becomes useful rather than clutter.
     * Vehicles with no service history return false — readiness is unknown, so
     * prompting would be guesswork.
     */
    fun isNearingService(): Boolean = (percentToNextService() ?: 0) >= 95

    /**
     * What to search for when looking for somewhere to service this vehicle. If the
     * name carries a recognisable make we search for that make's dealerships;
     * otherwise a generic search, since names like "Bakkie 1" tell us nothing.
     */
    fun dealershipSearchQuery(): String {
        val haystack = "$name $registrationNumber".uppercase()
        val make = VEHICLE_MAKES.firstOrNull { haystack.contains(it.uppercase()) }
        return if (make != null) "$make dealership" else "car service centre"
    }

    fun isServiceDueByDate(nowMillis: Long): Boolean = ServiceSchedule.isServiceDueByDate(
        lastServiceDateMillis, serviceIntervalMonths, nowMillis)

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

    // The curfew rule itself lives in ParkingCurfew, free of any Firebase import so it
    // can be unit tested against the shared specification. What is left here is the
    // mapping from this document's fields onto it.

    /** Minutes past the parking curfew. Zero when on time, and zero for an open day. */
    val minutesParkedLate: Long get() = ParkingCurfew.minutesParkedLate(date, endTimeMillis)

    val isParkedLate: Boolean get() = minutesParkedLate > 0L

    /** "45 min", "1h 05m", or a dash when they were parked in time. */
    val lateLabel: String get() = ParkingCurfew.lateLabel(minutesParkedLate)
}

/**
 * A fuel purchase logged by an employee.
 *
 * Carried a receiptPhotoUrl until the upload was removed — there is nowhere to keep the
 * images, so the figures are typed in and the paper slip is handed in. Documents written
 * before then still have the field; nothing reads it, and Firestore ignores fields
 * absent from this class.
 */
data class FuelLog(
    @DocumentId val id: String = "",
    val uid: String = "",
    val employeeName: String = "",
    val date: String = "",
    val timestampMillis: Long = 0L,
    val amountSpentRands: Double = 0.0,
    val litres: Double = 0.0,
    val odometerKm: Long = 0L,
    val vehicleId: String = ""
)

/** App-wide settings, single doc at config/settings. */
data class AppSettings(
    val adminEmail: String = "",
    val notifyIfNotStartedByHour: Int = 9,
    val notificationsEnabled: Boolean = true
)
