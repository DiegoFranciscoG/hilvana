plugins {
    id("com.android.application")
    // El plugin de Flutter va después de los de Android y Kotlin.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firma de publicación solo por variables de entorno (nunca en el repositorio): almacén de llaves,
// alias y contraseñas. Sin ellas se firma con la llave de depuración, que Google Play rechaza, así
// que un paquete mal firmado no puede subirse por error.
val releaseKeystore: String? = System.getenv("HILVANA_ANDROID_KEYSTORE")

android {
    namespace = "io.github.diegofranciscog.hilvana"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "io.github.diegofranciscog.hilvana"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // versionCode y versionName salen de `version` en pubspec.yaml.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("HILVANA_ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HILVANA_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("HILVANA_ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
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
