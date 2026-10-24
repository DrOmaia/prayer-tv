plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dromaia.prayertv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dromaia.prayertv"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // unsigned here: CI signs it with the private key from the repository secrets (see .github/workflows/build.yml)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
