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
    versionCode = 2
    versionName = "0.2.0"
    }

    // Base URLs: debug -> local; release -> public HTTPS (overridable)
    val baseUrlDebug = (project.findProperty("APP_BASE_URL") as String?) ?: "http://10.0.2.2:3002"
    val baseUrlRelease = (project.findProperty("APP_BASE_URL_RELEASE") as String?) ?: "https://be.terminal.beticket.net"
    val terminalLocationId = (project.findProperty("TERMINAL_LOCATION_ID") as String?) ?: ""

    signingConfigs {
        // Debug provided by Android Gradle Plugin
        getByName("debug") {}
        // Release signing from env or gradle.properties; falls back to debug if not provided
        create("release") {
            val storeFilePath = System.getenv("RELEASE_STORE_FILE") ?: (project.findProperty("RELEASE_STORE_FILE") as String?)
            val storePasswordProp = System.getenv("RELEASE_STORE_PASSWORD") ?: (project.findProperty("RELEASE_STORE_PASSWORD") as String?)
            val keyAliasProp = System.getenv("RELEASE_KEY_ALIAS") ?: (project.findProperty("RELEASE_KEY_ALIAS") as String?)
            val keyPasswordProp = System.getenv("RELEASE_KEY_PASSWORD") ?: (project.findProperty("RELEASE_KEY_PASSWORD") as String?)
            if (!storeFilePath.isNullOrBlank() && !keyAliasProp.isNullOrBlank() && !storePasswordProp.isNullOrBlank()) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordProp
                keyAlias = keyAliasProp
                keyPassword = keyPasswordProp ?: storePasswordProp
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "BASE_URL", "\"$baseUrlDebug\"")
            buildConfigField("String", "TERMINAL_LOCATION_ID", "\"$terminalLocationId\"")
            buildConfigField("boolean", "SIMULATED", "true")
            manifestPlaceholders["usesCleartextTraffic"] = true
        }
        release {
            isMinifyEnabled = true
            buildConfigField("String", "BASE_URL", "\"$baseUrlRelease\"")
            buildConfigField("String", "TERMINAL_LOCATION_ID", "\"$terminalLocationId\"")
            buildConfigField("boolean", "SIMULATED", "false")
            // Disable cleartext in release
            manifestPlaceholders["usesCleartextTraffic"] = false
            // Use provided release keystore when available, otherwise fallback to debug (for local sideload only)
            signingConfig = signingConfigs.findByName("release")?.let { cfg ->
                if (cfg.storeFile != null && cfg.keyAlias != null) cfg else signingConfigs.getByName("debug")
            } ?: signingConfigs.getByName("debug")
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

    // Stripe Terminal SDK 4.x with LocalMobile support
    implementation("com.stripe:stripeterminal:4.6.0")
}

configurations.all {
    resolutionStrategy {
        force("com.stripe:stripeterminal:4.6.0")
    }
}
