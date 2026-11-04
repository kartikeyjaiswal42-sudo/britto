package app.britto;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Ride fares read from a ride site's page while the shopper looks at it ({@link StoreActivity}):
 * Rapido's trip is typed on Rapido's own page (its address holds none), so Britto cannot open it
 * with the trip the way it opens Uber. The shopper opens Rapido from Britto's ride compare, enters
 * the trip there, and the newest reading of each site is kept here, in memory only, for the
 * Britto page to put beside Uber's. A reading older than {@link #FRESH_MS} is not handed out:
 * ride fares change by the minute.
 */
final class RideReadings {
    static final long FRESH_MS = 15 * 60_000L;

    private final Map<String, JSONObject> bySite = new HashMap<>();

    /** The one the app uses (StoreActivity writes, MainActivity's bridge reads). */
    static final RideReadings SHARED = new RideReadings();

    /** Keeps a reading with fares in it; anything else (log in, enter the trip, loading) is not kept. */
    synchronized boolean put(String site, JSONObject reading, long now) {
        if (site == null || reading == null || !"fares".equals(reading.optString("status"))) return false;
        if (reading.optJSONArray("rows") == null || reading.optJSONArray("rows").length() == 0) return false;
        try {
            JSONObject kept = new JSONObject(reading.toString()).put("at", now);
            bySite.put(site, kept);
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    /** The site's newest reading with its time ("at", ms), or null when none or too old. */
    synchronized JSONObject get(String site, long now) {
        JSONObject r = bySite.get(site);
        if (r == null) return null;
        long at = r.optLong("at", 0);
        if (now - at > FRESH_MS || at > now) {
            bySite.remove(site);
            return null;
        }
        return r;
    }

    synchronized void clear() {
        bySite.clear();
    }
}
