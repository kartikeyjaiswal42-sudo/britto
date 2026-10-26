package app.britto;

/** BuildConfig for the desktop bridge harness (scripts/app.mjs passes the values). */
final class BuildConfig {
    static final String SITE = System.getProperty("britto.site");
    static final String VERSION_NAME = System.getProperty("britto.version");

    private BuildConfig() {}
}
