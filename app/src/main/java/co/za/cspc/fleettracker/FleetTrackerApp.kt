package co.za.cspc.fleettracker

import android.app.Application
import com.google.firebase.FirebaseApp

class FleetTrackerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
