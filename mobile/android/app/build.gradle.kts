import java.time.Duration
import java.time.Instant
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Push needs the Firebase project's file (android/app/google-services.json of project campusstay-fpt-7e4f4, never
// committed); without it the app builds and simply does not register for push.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Release signing (MOB-13, N4): the upload key is read from android/key.properties (storeFile, storePassword, keyAlias,
// keyPassword; see key.properties.example). Neither that file nor the keystore is ever committed (android/.gitignore).
// Without it a release build is signed with the debug key, as before, and Gradle says so.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "vn.fpt.campusstay.student"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "vn.fpt.campusstay.student"
        // Android 8.0 (API 26) or later, like the native app it replaces.
        minSdk = maxOf(26, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        // Every build gets a higher versionCode, so an installed app always updates (N4): `--build-number` when it is
        // higher, otherwise the minutes since 1 Jan 2026.
        versionCode = maxOf(
            flutter.versionCode,
            Duration.between(Instant.parse("2026-01-01T00:00:00Z"), Instant.now()).toMinutes().toInt(),
        )
        versionName = flutter.versionName
    }

    signingConfigs {
        if (!keyProperties.isEmpty) {
            create("release") {
                storeFile = rootProject.file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keyProperties.isEmpty) {
                logger.warn("android/key.properties not found: the release build is signed with the debug key.")
                signingConfigs.getByName("debug")
            } else {
                signingConfigs.getByName("release")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
