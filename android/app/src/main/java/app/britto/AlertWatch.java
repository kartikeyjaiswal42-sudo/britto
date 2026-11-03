package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Price alerts as phone notifications, without a push service: the Britto site hands this app its
 * device token (the same one its alerts belong to), and the app asks the server, now and then,
 * which of them fired. Nothing is decided here: the server judges every alert (api/alerts.ts) and
 * records when it fired; this only notices firings it has not shown yet.
 *
 * The state, kept in the app's private storage: the token, when watching began (an alert that
 * fired before that is history, not news), and the last firing shown per alert.
 */
final class AlertWatch {
    /** api/alerts.ts randomToken(32): 43 URL-safe base64 characters. Anything else is refused. */
    static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{32,128}$");

    static final class Fired {
        final String id;
        final String key;
        final String title;
        final String message;
        final long at;

        Fired(String id, String key, String title, String message, long at) {
            this.id = id;
            this.key = key;
            this.title = title;
            this.message = message;
            this.at = at;
        }
    }

    private final SpendStore.Disk disk;

    AlertWatch(SpendStore.Disk disk) {
        this.disk = disk;
    }

    static AlertWatch inDirectory(java.io.File dir) {
        return new AlertWatch(SpendStore.Disk.file(new java.io.File(dir, "alert-watch.json")));
    }

    private JSONObject state() {
        String text = disk.read();
        if (text == null || text.isEmpty()) return new JSONObject();
        try {
            return new JSONObject(text);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** Start (or keep) watching for this token. A new token starts afresh from {@code now}. False = refused. */
    synchronized boolean watch(String token, long now) {
        if (token == null || !TOKEN.matcher(token).matches()) return false;
        JSONObject s = state();
        if (token.equals(s.optString("token"))) return true;
        try {
            disk.write(new JSONObject().put("token", token).put("since", now).put("seen", new JSONObject()).toString());
        } catch (JSONException e) {
            return false;
        }
        return true;
    }

    synchronized String token() {
        String t = state().optString("token", "");
        return t.isEmpty() ? null : t;
    }

    /** The server no longer knows the token (its owner was removed): stop asking. */
    synchronized void forget() {
        disk.write("{}");
    }

    /**
     * The alerts in {@code meJson} (GET /api/me) that fired after watching began and after the
     * last firing shown for that alert. Oldest first. A body that is not the expected shape
     * yields nothing.
     */
    synchronized List<Fired> newlyFired(String meJson) {
        JSONObject s = state();
        long since = s.optLong("since", Long.MAX_VALUE);
        JSONObject seen = s.optJSONObject("seen");
        List<Fired> out = new ArrayList<>();
        try {
            JSONObject me = new JSONObject(meJson).optJSONObject("me");
            JSONArray alerts = me == null ? null : me.optJSONArray("alerts");
            if (alerts == null) return out;
            for (int i = 0; i < alerts.length(); i++) {
                JSONObject a = alerts.optJSONObject(i);
                if (a == null || a.isNull("lastFiredAt")) continue;
                String id = a.optString("id", "");
                long at = a.optLong("lastFiredAt", 0);
                if (id.isEmpty() || at <= since) continue;
                if (seen != null && at <= seen.optLong(id, 0)) continue;
                String title = a.isNull("title") ? null : a.optString("title", null);
                String message = a.isNull("lastMessage") ? null : a.optString("lastMessage", null);
                out.add(new Fired(id, a.optString("key", ""), title, message, at));
            }
        } catch (JSONException e) {
            return new ArrayList<>();
        }
        out.sort((x, y) -> Long.compare(x.at, y.at));
        return out;
    }

    /** These were shown: never show the same firing twice. */
    synchronized void shown(List<Fired> fired) {
        if (fired.isEmpty()) return;
        JSONObject s = state();
        try {
            JSONObject seen = s.optJSONObject("seen");
            if (seen == null) seen = new JSONObject();
            for (Fired f : fired) seen.put(f.id, Math.max(f.at, seen.optLong(f.id, 0)));
            s.put("seen", seen);
            disk.write(s.toString());
        } catch (JSONException e) {
            // Not kept: the next check may show it again, which beats never showing it.
        }
    }

    /** For tests and the site's status line. */
    synchronized Map<String, Long> seen() {
        JSONObject seen = state().optJSONObject("seen");
        if (seen == null) return Collections.emptyMap();
        Map<String, Long> out = new HashMap<>();
        for (java.util.Iterator<String> it = seen.keys(); it.hasNext(); ) {
            String k = it.next();
            out.put(k, seen.optLong(k));
        }
        return out;
    }
}
