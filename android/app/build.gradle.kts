import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
}

/**
 * The app's assets come from the repository's own sources, never a copy: britto-reader.js is
 * the extension's page reader on the app's bridge, stores.json is core/stores.ts. Built by
 * scripts/build-app-assets.mjs (Node.js + esbuild, from the repository's node_modules).
 */
abstract class BrittoAssets : DefaultTask() {
    @get:OutputDirectory abstract val outputDir: DirectoryProperty
    @get:Input abstract val site: Property<String>
    @get:InputFiles @get:PathSensitive(PathSensitivity.RELATIVE) abstract val sources: ConfigurableFileCollection
    @get:Internal abstract val repoRoot: DirectoryProperty
    @get:Inject abstract val execOps: ExecOperations

    @TaskAction
    fun build() {
        execOps.exec {
            workingDir = repoRoot.get().asFile
            commandLine("node", "scripts/build-app-assets.mjs", "--out", outputDir.get().asFile.absolutePath, "--site", site.get())
        }
    }
}

val repo = rootProject.layout.projectDirectory.dir("..")
val brittoSite = providers.gradleProperty("britto.site")
val brittoAssets = tasks.register<BrittoAssets>("brittoAssets") {
    site.set(brittoSite)
    repoRoot.set(repo)
    sources.from(
        repo.dir("core"), repo.dir("extension/src"), repo.dir("android/js"),
        repo.file("web/api.js"), repo.file("web/chart.js"), repo.file("scripts/build-app-assets.mjs"),
    )
}

android {
    namespace = "app.britto"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "app.britto"
        minSdk = 29 // Android 10: saving to Downloads needs no storage permission
        targetSdk = 36
        versionCode = 10
        versionName = "0.8.0"
        buildConfigField("String", "SITE", "\"${brittoSite.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    // A release key from the environment when the owner has made one (HISTORY.md, "Waiting for
    // the owner"); otherwise the machine's debug key. An APK signed with another key cannot
    // update an installed one, so the same key must sign every version shared with friends.
    val keystore = providers.environmentVariable("BRITTO_KEYSTORE").orNull
    signingConfigs {
        if (keystore != null) {
            create("britto") {
                storeFile = file(keystore)
                storePassword = providers.environmentVariable("BRITTO_KEYSTORE_PASS").get()
                keyAlias = providers.environmentVariable("BRITTO_KEY_ALIAS").orElse("britto").get()
                keyPassword = providers.environmentVariable("BRITTO_KEY_PASS").orElse(providers.environmentVariable("BRITTO_KEYSTORE_PASS")).get()
            }
        }
    }

    buildTypes {
        // A debug build is its own app (app.britto.dev), so it installs beside the signed one
        // without replacing it or its logins; it is debuggable, so its WebViews can be driven
        // over DevTools (scripts/android-cdp.mjs) to measure sites inside the app.
        debug {
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        release {
            // R8 drops the unused parts of the libraries (measured: 5.8 MB unshrunk). Nothing
            // here is reached by reflection: activities are kept through the manifest, and the
            // bridge is a WebMessageListener object, not an @JavascriptInterface.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName(if (keystore != null) "britto" else "debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(brittoAssets, BrittoAssets::outputDir)
    }
}

// Robolectric's Android 16 runtime, fetched by Gradle (like every other dependency) and handed
// to Robolectric offline: its own downloader does not get through every network (the cloud
// session's proxy, measured 2026-10-26).
val robolectricRuntime: Configuration by configurations.creating
// Robolectric's native-runtime loader turns this directory into a URL and back without decoding
// it, so a space in the checkout path ("New project") failed the first test of every run
// (measured: NoSuchFileException …/New%20project/…). A space-free directory avoids it.
val robolectricJarDir: File = layout.buildDirectory.dir("robolectric-jars").get().asFile.let {
    if (' ' in it.absolutePath) File(System.getProperty("java.io.tmpdir"), "britto-robolectric-jars") else it
}
val robolectricJars = tasks.register<Sync>("robolectricJars") {
    from(robolectricRuntime)
    into(robolectricJarDir)
}
tasks.withType<Test>().configureEach {
    dependsOn(robolectricJars)
    systemProperty("robolectric.offline", "true")
    systemProperty("robolectric.dependency.dir", robolectricJarDir.absolutePath)
    // Robolectric reaches into FileDescriptor internals, which Java 17+ closes by default
    // (measured: "module java.base does not export jdk.internal.access").
    jvmArgs("--add-opens=java.base/java.io=ALL-UNNAMED", "--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
}

// The bridge harness: the app's REAL BridgeCore + SpendStore + Api, compiled for a computer against org.json
// (Android's own JSON API), so scripts/app.mjs can drive the page reader in Chromium through the
// exact Java code the app runs. Only the WebView/Activity glue is left for a phone.
val harnessDeps: Configuration by configurations.creating
val bridgeHarness = tasks.register<JavaCompile>("bridgeHarness") {
    source(file("src/main/java/app/britto/BridgeCore.java"), file("src/main/java/app/britto/SpendStore.java"), file("src/main/java/app/britto/Api.java"), fileTree("src/harness/java"))
    classpath = harnessDeps
    destinationDirectory.set(layout.buildDirectory.dir("bridge-harness/classes"))
    options.release.set(17)
}
tasks.register<Sync>("bridgeHarnessLibs") {
    dependsOn(bridgeHarness)
    from(harnessDeps)
    into(layout.buildDirectory.dir("bridge-harness/libs"))
}

dependencies {
    harnessDeps(libs.orgjson)
    robolectricRuntime(libs.robolectric.android.all)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.activity)
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
}
