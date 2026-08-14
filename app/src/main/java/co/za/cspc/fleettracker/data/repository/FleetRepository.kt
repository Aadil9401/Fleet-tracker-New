package co.za.cspc.fleettracker.data.repository

import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.Role
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Result of creating an employee: the generated login details, plus whether they
 * were successfully emailed to the employee's own address.
 */
data class NewEmployeeCredentials(
    val username: String,
    val password: String,
    val contactEmail: String,
    val emailSent: Boolean,
    val emailError: String
)

/**
 * Single access point for Firebase Auth / Firestore / Storage / Functions.
 * Keeps the rest of the app free of direct Firebase SDK calls.
 */
class FleetRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val storage: FirebaseStorage = FirebaseStorage.getInstance(),
    private val functions: FirebaseFunctions = FirebaseFunctions.getInstance()
) {
    companion object {
        private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        fun todayString(): String = dayFormat.format(Date())
    }

    val currentUid: String? get() = auth.currentUser?.uid

    // ---------- Auth ----------

    suspend fun login(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    fun logout() = auth.signOut()

    /**
     * Sends Firebase's password-reset email. Only useful for accounts whose login is
     * a real mailbox — i.e. people who signed themselves up. Admin-created logins use
     * the generated "@cspc.local" address, which can't receive mail.
     */
    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordResetEmail(email.trim()).await()
    }

    /**
     * Self-registration from the sign-up screen. Creates the Auth account and its
     * matching profile document; the person's own email address is their login.
     * Always an employee — the security rules reject any other role.
     */
    suspend fun signUp(
        name: String,
        surname: String,
        email: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        vehicleRegistration: String,
        password: String
    ): UserProfile {
        val cleanEmail = email.trim()
        val result = auth.createUserWithEmailAndPassword(cleanEmail, password).await()
        val uid = result.user?.uid ?: throw IllegalStateException("Sign up did not return a user.")

        val profile = UserProfile(
            uid = uid,
            name = name.trim(),
            surname = surname.trim(),
            email = cleanEmail,
            contactEmail = cleanEmail,
            employeeNumber = employeeNumber.trim(),
            province = province.trim(),
            teamName = teamName.trim(),
            vehicleRegistration = vehicleRegistration.trim().uppercase(),
            role = Role.EMPLOYEE,
            assignedVehicleId = "",
            active = true,
            createdAt = System.currentTimeMillis()
        )

        try {
            db.collection("users").document(uid).set(
                mapOf(
                    "name" to profile.name,
                    "surname" to profile.surname,
                    "email" to profile.email,
                    "contactEmail" to profile.contactEmail,
                    "employeeNumber" to profile.employeeNumber,
                    "province" to profile.province,
                    "teamName" to profile.teamName,
                    "vehicleRegistration" to profile.vehicleRegistration,
                    "role" to profile.role,
                    "assignedVehicleId" to profile.assignedVehicleId,
                    "active" to profile.active,
                    "createdAt" to profile.createdAt
                )
            ).await()
        } catch (e: Exception) {
            // Undo the half-made account. Without this the person is left with a
            // login that has no profile, which fails as "Account not set up
            // correctly" on every future attempt and can't be retried.
            runCatching { result.user?.delete()?.await() }
            throw e
        }

        return profile
    }

    suspend fun currentUserProfile(): UserProfile? {
        val uid = currentUid ?: return null
        val snap = db.collection("users").document(uid).get().await()
        return snap.toObject(UserProfile::class.java)
    }

    // ---------- Employees (admin) ----------

    suspend fun listEmployees(): List<UserProfile> {
        val snap = db.collection("users")
            .whereEqualTo("role", Role.EMPLOYEE)
            .get().await()
        return snap.toObjects(UserProfile::class.java)
    }

    /**
     * Calls the "createEmployee" Cloud Function (admin-only) which uses the
     * Firebase Admin SDK to create the account without disturbing the admin's
     * own signed-in session, and emails the login details to [contactEmail].
     */
    suspend fun createEmployee(
        name: String,
        surname: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        contactEmail: String
    ): NewEmployeeCredentials {
        val data = hashMapOf(
            "name" to name.trim(),
            "surname" to surname.trim(),
            "employeeNumber" to employeeNumber.trim(),
            "province" to province.trim(),
            "teamName" to teamName.trim(),
            "contactEmail" to contactEmail.trim()
        )
        val result = functions.getHttpsCallable("createEmployee").call(data).await()
        @Suppress("UNCHECKED_CAST")
        val map = result.data as Map<String, Any?>
        return NewEmployeeCredentials(
            username = map["email"] as? String ?: "",
            password = map["password"] as? String ?: "",
            contactEmail = map["contactEmail"] as? String ?: contactEmail.trim(),
            emailSent = map["emailSent"] as? Boolean ?: false,
            emailError = map["emailError"] as? String ?: ""
        )
    }

    suspend fun setEmployeeActive(uid: String, active: Boolean) {
        db.collection("users").document(uid).update("active", active).await()
    }

    /** Assigns vehicles to many employees at once. Keyed by employee uid. */
    suspend fun assignVehicles(assignments: Map<String, String>) {
        if (assignments.isEmpty()) return
        assignments.entries.chunked(400).forEach { chunk ->
            val batch = db.batch()
            chunk.forEach { (uid, vehicleId) ->
                batch.update(
                    db.collection("users").document(uid),
                    "assignedVehicleId",
                    vehicleId
                )
            }
            batch.commit().await()
        }
    }

    suspend fun assignVehicle(uid: String, vehicleId: String) {
        db.collection("users").document(uid).update("assignedVehicleId", vehicleId).await()
    }

    // ---------- Vehicles ----------

    suspend fun listVehicles(): List<Vehicle> =
        db.collection("vehicles").get().await().toObjects(Vehicle::class.java)

    suspend fun getVehicle(vehicleId: String): Vehicle? =
        db.collection("vehicles").document(vehicleId).get().await().toObject(Vehicle::class.java)

    suspend fun addVehicle(vehicle: Vehicle) {
        db.collection("vehicles").add(
            mapOf(
                "registrationNumber" to vehicle.registrationNumber,
                "name" to vehicle.name,
                "currentOdometerKm" to vehicle.currentOdometerKm,
                "lastServiceOdometerKm" to vehicle.lastServiceOdometerKm,
                "lastServiceDateMillis" to vehicle.lastServiceDateMillis,
                "serviceIntervalKm" to vehicle.serviceIntervalKm,
                "serviceIntervalMonths" to vehicle.serviceIntervalMonths
            )
        ).await()
    }

    /**
     * Writes many vehicles at once. Chunked because a Firestore batch caps out at
     * 500 writes. Returns how many were added.
     */
    suspend fun addVehicles(vehicles: List<Vehicle>): Int {
        if (vehicles.isEmpty()) return 0
        vehicles.chunked(400).forEach { chunk ->
            val batch = db.batch()
            chunk.forEach { v ->
                batch.set(
                    db.collection("vehicles").document(),
                    mapOf(
                        "registrationNumber" to v.registrationNumber,
                        "name" to v.name,
                        "currentOdometerKm" to v.currentOdometerKm,
                        "lastServiceOdometerKm" to v.lastServiceOdometerKm,
                        "lastServiceDateMillis" to v.lastServiceDateMillis,
                        "serviceIntervalKm" to v.serviceIntervalKm,
                        "serviceIntervalMonths" to v.serviceIntervalMonths
                    )
                )
            }
            batch.commit().await()
        }
        return vehicles.size
    }

    suspend fun deleteVehicle(vehicleId: String) {
        db.collection("vehicles").document(vehicleId).delete().await()
    }

    /**
     * Deletes every vehicle — for starting over after a bad bulk upload. Chunked
     * for the 500-write batch cap. Returns how many were removed.
     *
     * Employees assigned to a deleted vehicle keep a stale assignedVehicleId; the
     * app treats that as "no vehicle assigned", so nothing breaks.
     */
    suspend fun deleteAllVehicles(): Int {
        val ids = db.collection("vehicles").get().await().documents.map { it.id }
        ids.chunked(400).forEach { chunk ->
            val batch = db.batch()
            chunk.forEach { batch.delete(db.collection("vehicles").document(it)) }
            batch.commit().await()
        }
        return ids.size
    }

    suspend fun markVehicleServiced(vehicleId: String, odometerKm: Long) {
        db.collection("vehicles").document(vehicleId).update(
            mapOf(
                "lastServiceOdometerKm" to odometerKm,
                "lastServiceDateMillis" to System.currentTimeMillis(),
                "lastReminderNotifiedDate" to ""
            )
        ).await()
    }

    private suspend fun updateVehicleOdometer(vehicleId: String, odometerKm: Long) {
        if (vehicleId.isBlank()) return
        db.collection("vehicles").document(vehicleId)
            .update("currentOdometerKm", odometerKm).await()
    }

    // ---------- Time logs ----------

    suspend fun todaysTimeLog(uid: String): TimeLog? {
        val docId = "${uid}_${todayString()}"
        val snap = db.collection("timeLogs").document(docId).get().await()
        return if (snap.exists()) snap.toObject(TimeLog::class.java) else null
    }

    suspend fun clockIn(
        uid: String,
        employeeName: String,
        vehicleId: String,
        startOdometerKm: Long,
        mainAreasWorked: String
    ) {
        val docId = "${uid}_${todayString()}"
        db.collection("timeLogs").document(docId).set(
            mapOf(
                "uid" to uid,
                "employeeName" to employeeName,
                "date" to todayString(),
                "startTimeMillis" to System.currentTimeMillis(),
                "startOdometerKm" to startOdometerKm,
                "vehicleId" to vehicleId,
                "mainAreasWorked" to mainAreasWorked.trim()
            )
        ).await()
        updateVehicleOdometer(vehicleId, startOdometerKm)
    }

    suspend fun clockOut(
        uid: String,
        vehicleId: String,
        endOdometerKm: Long,
        mainAreasWorked: String
    ) {
        val docId = "${uid}_${todayString()}"
        val updates = mutableMapOf<String, Any>(
            "endTimeMillis" to System.currentTimeMillis(),
            "endOdometerKm" to endOdometerKm
        )
        // Blank means "leave it alone", so knocking off never wipes what was typed
        // at the start of the day.
        if (mainAreasWorked.isNotBlank()) {
            updates["mainAreasWorked"] = mainAreasWorked.trim()
        }
        db.collection("timeLogs").document(docId).update(updates).await()
        updateVehicleOdometer(vehicleId, endOdometerKm)
    }

    suspend fun listTodaysTimeLogs(): List<TimeLog> {
        val snap = db.collection("timeLogs").whereEqualTo("date", todayString()).get().await()
        return snap.toObjects(TimeLog::class.java)
    }

    suspend fun listRecentTimeLogs(limit: Long = 50): List<TimeLog> {
        val snap = db.collection("timeLogs")
            .orderBy("startTimeMillis")
            .limitToLast(limit)
            .get().await()
        return snap.toObjects(TimeLog::class.java).asReversed()
    }

    // ---------- Fuel logs ----------

    suspend fun addFuelLog(log: FuelLog, receiptBytes: ByteArray?): String {
        var photoUrl = ""
        if (receiptBytes != null) {
            val ref = storage.reference.child("receipts/${log.uid}/${System.currentTimeMillis()}.jpg")
            ref.putBytes(receiptBytes).await()
            photoUrl = ref.downloadUrl.await().toString()
        }
        db.collection("fuelLogs").add(
            mapOf(
                "uid" to log.uid,
                "employeeName" to log.employeeName,
                "date" to todayString(),
                "timestampMillis" to System.currentTimeMillis(),
                "amountSpentRands" to log.amountSpentRands,
                "litres" to log.litres,
                "odometerKm" to log.odometerKm,
                "vehicleId" to log.vehicleId,
                "receiptPhotoUrl" to photoUrl
            )
        ).await()
        return photoUrl
    }

    suspend fun listRecentFuelLogs(limit: Long = 50): List<FuelLog> {
        val snap = db.collection("fuelLogs")
            .orderBy("timestampMillis")
            .limitToLast(limit)
            .get().await()
        return snap.toObjects(FuelLog::class.java).asReversed()
    }

    // ---------- Settings ----------

    suspend fun getSettings(): AppSettings {
        val snap = db.collection("config").document("settings").get().await()
        return snap.toObject(AppSettings::class.java) ?: AppSettings()
    }

    suspend fun saveSettings(settings: AppSettings) {
        db.collection("config").document("settings").set(
            mapOf(
                "adminEmail" to settings.adminEmail,
                "notifyIfNotStartedByHour" to settings.notifyIfNotStartedByHour,
                "notificationsEnabled" to settings.notificationsEnabled
            )
        ).await()
    }
}
