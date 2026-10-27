import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Push needs the Firebase project's file (app/google-services.json, never committed); without it the app builds
// and simply does not register for push.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// The API the app talks to; production by default. For a local backend on the emulator:
// ./gradlew installDebug -PcampusstayApi=http://10.0.2.2:8080/api
val apiBaseUrl = (findProperty("campusstayApi") as String?)
    ?: "https://campusstay-api.eastasia.cloudapp.azure.com/api"

// Google sign-in asks for an ID token of the web's OAuth client (the API's GOOGLE_CLIENT_ID), from local.properties
// (campusstay.googleClientId=…) or -PcampusstayGoogleClientId; blank = no Google button.
val localProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val googleClientId = (findProperty("campusstayGoogleClientId") as String?)
    ?: localProperties.getProperty("campusstay.googleClientId", "")

android {
    namespace = "vn.fpt.campusstay.student"
    compileSdk = 35
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "vn.fpt.campusstay.student"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"$googleClientId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    val compose = platform("androidx.compose:compose-bom:2025.01.01")
    implementation(compose)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
