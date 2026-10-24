plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

android {
    namespace = "co.za.cspc.fleettracker"
    compileSdk = 34

    defaultConfig {
        applicationId = "co.za.cspc.fleettracker"
        minSdk = 24
        targetSdk = 34
        /*
         * A BUILD NUMBER THAT ACTUALLY MOVES.
         *
         * These sat at 1 and "1.0" through twenty rebuilds, so nobody on a phone could
         * tell whether they had installed the new app — and with sixty phones to update,
         * "have you got the latest?" was a question with no answer.
         *
         * CI passes its run number in. A local build has none and says so, rather than
         * pretending to be a numbered release.
         */
        val buildNumber = (System.getenv("BUILD_NUMBER") ?: "0").toIntOrNull() ?: 0
        versionCode = 1 + buildNumber
        versionName = if (buildNumber == 0) "1.0-local" else "1.0.$buildNumber"

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    /*
     * ONE SIGNING KEY, SO AN UPDATE INSTALLS OVER THE LAST ONE.
     *
     * Android refuses to replace an installed app with one signed by a different key, and
     * there is no flag that overrides it. Without this block every build was signed by
     * whatever debug key the CI runner generated for itself that morning, so each APK was
     * a different app as far as a phone was concerned: "App not installed", every time,
     * and the only way on was to uninstall first and lose the rep's session.
     *
     * The key is NOT in this repository and must never be — the repository is public, and
     * anyone holding it could sign an APK that a phone would accept as an update to the
     * real app. CI decodes it from a secret, exactly the way google-services.json arrives.
     *
     * ABSENT IS NOT AN ERROR. A build with no keystore — a local one, or a pull request
     * from a fork, which gets no secrets — falls back to Gradle's own debug signing and
     * still compiles. It just produces an APK that will not install over a CI build, which
     * is correct: it is not the same app.
     */
    val keystore = rootProject.file("app/debug.keystore")
    val keystoreReady = keystore.exists()

    signingConfigs {
        if (keystoreReady) {
            create("shared") {
                storeFile = keystore
                // The standard debug credentials. These are not a secret and are the same
                // on every Android install in the world — the FILE is the secret, and it
                // is the file that is kept out of the repository.
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
            if (keystoreReady) {
                signingConfig = signingConfigs.getByName("shared")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.9.24"))

    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.core:core-ktx:1.13.1")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("com.google.firebase:firebase-functions-ktx")

    // Coroutines interop with Firebase Tasks
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Plain JVM unit tests. ServiceSchedule, ParkingCurfew and DayBreakdown have no
    // Firebase and no Android dependency, so the service rules, the parking curfew and
    // the day view's figures are all checked without an emulator.
    testImplementation("junit:junit:4.13.2")
}
