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
     * Firebase Admin SDK to create the account without disturbing the
     * admin's own signed-in session. Returns the generated login email + password.
     */
    suspend fun createEmployee(name: String, surname: String): Pair<String, String> {
        val data = hashMapOf("name" to name.trim(), "surname" to surname.trim())
        val result = functions.getHttpsCallable("createEmployee").call(data).await()
        @Suppress("UNCHECKED_CAST")
        val map = result.data as Map<String, Any>
        return (map["email"] as String) to (map["password"] as String)
    }

    suspend fun setEmployeeActive(uid: String, active: Boolean) {
        db.collection("users").document(uid).update("active", active).await()
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

    suspend fun clockIn(uid: String, employeeName: String, vehicleId: String, startOdometerKm: Long) {
        val docId = "${uid}_${todayString()}"
        db.collection("timeLogs").document(docId).set(
            mapOf(
                "uid" to uid,
                "employeeName" to employeeName,
                "date" to todayString(),
                "startTimeMillis" to System.currentTimeMillis(),
                "startOdometerKm" to startOdometerKm,
                "vehicleId" to vehicleId
            )
        ).await()
        updateVehicleOdometer(vehicleId, startOdometerKm)
    }

    suspend fun clockOut(uid: String, vehicleId: String, endOdometerKm: Long) {
        val docId = "${uid}_${todayString()}"
        db.collection("timeLogs").document(docId).update(
            mapOf(
                "endTimeMillis" to System.currentTimeMillis(),
                "endOdometerKm" to endOdometerKm
            )
        ).await()
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
