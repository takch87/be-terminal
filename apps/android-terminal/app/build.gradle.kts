plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.datafono.terminal"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.datafono.terminal"
        minSdk = 26
        // Stripe Terminal requiere targetSdk <= 30 actualmente
        targetSdk = 30
        versionCode = 1
        versionName = "0.1.0"
    }

    val baseUrl = (project.findProperty("APP_BASE_URL") as String?) ?: "http://10.0.2.2:4000"
    val terminalLocationId = (project.findProperty("TERMINAL_LOCATION_ID") as String?) ?: ""

    signingConfigs {
        // For early production tests we sign release with the debug key (sideload only, not for Play)
        getByName("debug") {}
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
            buildConfigField("String", "TERMINAL_LOCATION_ID", "\"$terminalLocationId\"")
            buildConfigField("boolean", "SIMULATED", "true")
            manifestPlaceholders["usesCleartextTraffic"] = true
        }
        release {
            isMinifyEnabled = true
            buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
            buildConfigField("String", "TERMINAL_LOCATION_ID", "\"$terminalLocationId\"")
            buildConfigField("boolean", "SIMULATED", "false")
            // Disable cleartext in release
            manifestPlaceholders["usesCleartextTraffic"] = false
            // Quick signing for device installs; replace with your real release keystore later
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        // Allow release APK for sideload testing even with targetSdk 30.
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Stripe Terminal SDK 4.x
    implementation("com.stripe:stripeterminal:4.6.0")
}

configurations.all {
    resolutionStrategy {
        force("com.stripe:stripeterminal:4.6.0")
    }
}
