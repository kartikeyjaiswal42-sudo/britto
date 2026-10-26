// Britto for Android. Build: ./gradlew assembleRelease (APK in app/build/outputs/apk/release/).
// Needs Node.js (the page reader is bundled from the repository's TypeScript by
// scripts/build-app-assets.mjs) and an Android SDK (ANDROID_HOME or local.properties).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "britto-android"
include(":app")
