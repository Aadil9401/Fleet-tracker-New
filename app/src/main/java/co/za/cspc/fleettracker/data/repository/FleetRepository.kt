package co.za.cspc.fleettracker.data.repository

import co.za.cspc.fleettracker.data.model.AppSettings
import co.za.cspc.fleettracker.data.model.FuelLog
import co.za.cspc.fleettracker.data.model.Role
import co.za.cspc.fleettracker.data.model.TimeLog
import co.za.cspc.fleettracker.data.model.UserProfile
import co.za.cspc.fleettracker.data.model.Vehicle
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

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
        // Pinned to SAST rather than the phone's timezone. The date forms part of the
        // time-log document id, and the attendance Cloud Function works in
        // Africa/Johannesburg — a phone set to another zone would write a log the
        // server then looks for under a different date.
        private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("Africa/Johannesburg")
        }

        fun todayString(): String = dayFormat.format(Date())

        /** Shifts a yyyy-MM-dd date by whole days, staying in SAST. */
        fun shiftDate(date: String, days: Int): String {
            val parsed = runCatching { dayFormat.parse(date) }.getOrNull() ?: return date
            val calendar = Calendar.getInstance(TimeZone.getTimeZone("Africa/Johannesburg"))
            calendar.time = parsed
            calendar.add(Calendar.DAY_OF_MONTH, days)
            return dayFormat.format(calendar.time)
        }

        /**
         * Employee number reduced to a safe, comparable document id: letters and
         * digits only, uppercased. Keeps "emp-001", "EMP 001" and "EMP001" as one
         * number, and avoids the "/" characters Firestore won't accept in an id.
         */
        fun employeeNumberKey(employeeNumber: String): String =
            employeeNumber.uppercase().filter { it.isLetterOrDigit() }
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
        val numberKey = employeeNumberKey(employeeNumber)
        if (numberKey.isBlank()) {
            throw IllegalArgumentException("Please enter your employee number.")
        }

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

        var reservedKey: String? = null
        try {
            // Claim the employee number first. This write is rejected if someone has
            // already registered it, so it doubles as the duplicate check.
            try {
                db.collection("employeeNumbers").document(numberKey)
                    .set(mapOf("uid" to uid)).await()
                reservedKey = numberKey
            } catch (e: Exception) {
                throw IllegalStateException(
                    "Employee number ${employeeNumber.trim()} is already registered. " +
                        "If that's you, sign in instead — or ask your admin for help."
                )
            }

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
            // Release the number BEFORE deleting the account. The rule that permits
            // this checks the caller owns the claim, so once the account is gone the
            // release would be denied and the number burnt for good.
            reservedKey?.let { key ->
                runCatching { db.collection("employeeNumbers").document(key).delete().await() }
            }
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

    /**
     * Admin correction of the details someone entered when they signed up.
     * Deliberately excludes role, login email and password: role is a security
     * boundary, and the other two live in Firebase Auth rather than this document.
     */
    suspend fun updateEmployeeDetails(
        uid: String,
        name: String,
        surname: String,
        employeeNumber: String,
        province: String,
        teamName: String,
        vehicleRegistration: String,
        contactEmail: String
    ) {
        val ref = db.collection("users").document(uid)
        val oldKey = employeeNumberKey(ref.get().await().getString("employeeNumber").orEmpty())
        val newKey = employeeNumberKey(employeeNumber)

        // Claim the new number BEFORE touching the profile, so a clash leaves
        // everything untouched rather than half-changed.
        if (newKey != oldKey && newKey.isNotBlank()) {
            try {
                db.collection("employeeNumbers").document(newKey)
                    .set(mapOf("uid" to uid)).await()
            } catch (e: Exception) {
                throw IllegalStateException(
                    "Employee number ${employeeNumber.trim()} is already registered " +
                        "to someone else."
                )
            }
        }

        ref.update(
            mapOf(
                "name" to name.trim(),
                "surname" to surname.trim(),
                "employeeNumber" to employeeNumber.trim(),
                "province" to province.trim(),
                "teamName" to teamName.trim(),
                "vehicleRegistration" to vehicleRegistration.trim().uppercase(),
                "contactEmail" to contactEmail.trim()
            )
        ).await()

        // Release the old number only once the profile actually moved off it.
        if (newKey != oldKey && oldKey.isNotBlank()) {
            runCatching { db.collection("employeeNumbers").document(oldKey).delete().await() }
        }
    }

    /**
     * Admin correction of a vehicle. This is the only route that can lower an
     * odometer — clock-in/out deliberately can't, so a mistyped reading would
     * otherwise be stuck permanently high.
     */
    suspend fun updateVehicle(
        vehicleId: String,
        name: String,
        registrationNumber: String,
        currentOdometerKm: Long,
        lastServiceOdometerKm: Long,
        serviceIntervalKm: Long
    ) {
        db.collection("vehicles").document(vehicleId).update(
            mapOf(
                "name" to name.trim(),
                "registrationNumber" to registrationNumber.trim().uppercase(),
                "currentOdometerKm" to currentOdometerKm,
                "lastServiceOdometerKm" to lastServiceOdometerKm,
                "serviceIntervalKm" to serviceIntervalKm
            )
        ).await()
    }

    /**
     * Deletes an employee's profile — for clearing duplicate sign-ups.
     *
     * Their Firebase Auth login is not removed (that needs the Admin SDK), but it
     * becomes unusable: login checks for a profile and refuses without one. Their
     * existing time and fuel logs are left intact.
     */
    suspend fun deleteEmployee(uid: String, employeeNumber: String) {
        db.collection("users").document(uid).delete().await()
        // Release the number so the right person can register it later.
        val key = employeeNumberKey(employeeNumber)
        if (key.isNotBlank()) {
            runCatching { db.collection("employeeNumbers").document(key).delete().await() }
        }
    }

    suspend fun listAdmins(): List<UserProfile> {
        val snap = db.collection("users")
            .whereEqualTo("role", Role.ADMIN)
            .get().await()
        return snap.toObjects(UserProfile::class.java)
    }

    /**
     * Promotes or demotes an account. This is how a second admin gets made: the
     * person signs up normally, then an existing admin promotes them — no Cloud
     * Function, so it works on the free plan.
     */
    suspend fun setUserRole(uid: String, role: String) {
        db.collection("users").document(uid).update("role", role).await()
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

    /**
     * Moves a vehicle's odometer FORWARD only.
     *
     * Previously this wrote whatever was typed. A slip like 8500 instead of 85000
     * would permanently lower the reading, and because service is measured as
     * (current - lastService), that silently reset the vehicle's service countdown
     * — the reminder would just never fire.
     */
    private suspend fun updateVehicleOdometer(vehicleId: String, odometerKm: Long) {
        if (vehicleId.isBlank()) return
        val ref = db.collection("vehicles").document(vehicleId)
        val current = ref.get().await().getLong("currentOdometerKm") ?: 0L
        if (odometerKm > current) {
            ref.update("currentOdometerKm", odometerKm).await()
        }
    }

    // ---------- Time logs ----------

    suspend fun todaysTimeLog(uid: String): TimeLog? {
        val docId = "${uid}_${todayString()}"
        val snap = db.collection("timeLogs").document(docId).get().await()
        return if (snap.exists()) snap.toObject(TimeLog::class.java) else null
    }

    /**
     * Marks today as a non-working day. Writes the same per-day document a clock-in
     * would, which is also what keeps this person out of the "hasn't started yet"
     * attendance alert.
     */
    suspend fun markNotWorking(uid: String, employeeName: String, reason: String) {
        val docId = "${uid}_${todayString()}"
        db.collection("timeLogs").document(docId).set(
            mapOf(
                "uid" to uid,
                "employeeName" to employeeName,
                "date" to todayString(),
                "notWorking" to true,
                "notWorkingReason" to reason.trim(),
                "startTimeMillis" to 0L,
                "startOdometerKm" to 0L,
                "endTimeMillis" to 0L,
                "endOdometerKm" to 0L,
                "vehicleId" to "",
                "mainAreasWorked" to ""
            )
        ).await()
    }

    /** Undo of [markNotWorking], for when it's tapped by mistake. */
    suspend fun clearNotWorking(uid: String) {
        val docId = "${uid}_${todayString()}"
        db.collection("timeLogs").document(docId).update("notWorking", false).await()
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

    suspend fun listTodaysTimeLogs(): List<TimeLog> = listTimeLogsForDate(todayString())

    suspend fun listTimeLogsForDate(date: String): List<TimeLog> {
        val snap = db.collection("timeLogs").whereEqualTo("date", date).get().await()
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
        // merge() matters: the attendance Cloud Function stores lastAttendanceAlertDate
        // in this same document. A plain set() would wipe it, and the "already alerted
        // today" guard would break — sending duplicate emails every hour.
        db.collection("config").document("settings").set(
            mapOf(
                "adminEmail" to settings.adminEmail,
                "notifyIfNotStartedByHour" to settings.notifyIfNotStartedByHour,
                "notificationsEnabled" to settings.notificationsEnabled
            ),
            SetOptions.merge()
        ).await()
    }
}
