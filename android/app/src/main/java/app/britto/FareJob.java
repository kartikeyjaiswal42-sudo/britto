package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * One fare compare (core/fares.ts): the travel sites the Britto site asked for, each opened on
 * this phone in a hidden in-app browser ({@link FareRunner}) and read with its recipe. This class
 * holds only the rules, so they are tested without a browser:
 * at most {@link #PARALLEL} sites load at once; a site is done when its reading has stayed the
 * same for two reads in a row after {@link #SETTLE_MS} (fares keep arriving while a results page
 * loads), or at {@link #TIMEOUT_MS} with whatever it last showed. A site that asks "are you a
 * person?" ends as {@code check}: the shopper opens it and answers it themselves.
 */
final class FareJob {
    static final int PARALLEL = 2;
    static final int MAX_SITES = 10;
    /** Results pages keep adding fares for a while (ixigo: 6 flights at 15 s, 40 at 30 s, measured). */
    static final long SETTLE_MS = 15_000;
    /** Readings in a row that must agree before a site is done (1.5 s apart). */
    static final int SAME_READS = 3;
    static final long TIMEOUT_MS = 45_000;
    static final Pattern SITE_ID = Pattern.compile("^[a-z]{2,20}$");
    /** The searched day, which dates the site's fares-by-date strip (core/fares.ts readStrip). */
    static final Pattern DAY = Pattern.compile("^20\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$");

    static final class Site {
        final String id;
        final String url;
        final String recipe;
        /** The searched day 'YYYY-MM-DD', or null (no strip). */
        final String date;
        String state = "queued"; // queued | loading | done
        long startedAt;
        String status = "queued"; // the last reading's status, or queued / loading / failed
        JSONObject read; // the last reading (core/fares.ts FareRead)
        String lastKey;
        int same;

        Site(String id, String url, String recipe, String date) {
            this.id = id;
            this.url = url;
            this.recipe = recipe;
            this.date = date;
        }

        /** The reader's second argument: {"date": …} or {}. */
        String when() {
            try {
                return date == null ? "{}" : new JSONObject().put("date", date).toString();
            } catch (JSONException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    final String id;
    private final Map<String, Site> sites = new LinkedHashMap<>();

    private FareJob(String id) {
        this.id = id;
    }

    /**
     * The sites from the Britto site's message, or null when any is not acceptable: an id, an
     * https address the app opens in its own browser ({@code opensHere}: a known travel site),
     * and a recipe object. Nothing partial is started.
     */
    static FareJob of(String jobId, JSONArray list, Predicate<String> opensHere) {
        if (list == null || list.length() == 0 || list.length() > MAX_SITES) return null;
        FareJob job = new FareJob(jobId);
        for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i);
            if (s == null) return null;
            String id = s.optString("id", "");
            String url = s.optString("url", "");
            JSONObject recipe = s.optJSONObject("recipe");
            String date = s.isNull("date") ? null : s.optString("date", "");
            if (!SITE_ID.matcher(id).matches() || !url.startsWith("https://") || !opensHere.test(url) || recipe == null || job.sites.containsKey(id)) return null;
            if (date != null && !DAY.matcher(date).matches()) return null;
            job.sites.put(id, new Site(id, url, recipe.toString(), date));
        }
        return job;
    }

    /** Sites to open now (marked loading). */
    List<Site> toStart(long now) {
        int loading = 0;
        for (Site s : sites.values()) if (s.state.equals("loading")) loading++;
        List<Site> out = new ArrayList<>();
        for (Site s : sites.values()) {
            if (loading >= PARALLEL) break;
            if (!s.state.equals("queued")) continue;
            s.state = "loading";
            s.status = "loading";
            s.startedAt = now;
            loading++;
            out.add(s);
        }
        return out;
    }

    Site site(String id) {
        return sites.get(id);
    }

    /**
     * A reading of the site's page (the JSON the recipe gave, or null when the page did not answer).
     * True when the site is now done (its browser can go).
     */
    boolean onRead(String siteId, String readJson, long now) {
        Site s = sites.get(siteId);
        if (s == null || !s.state.equals("loading")) return false;
        JSONObject read = null;
        if (readJson != null) {
            try {
                read = new JSONObject(readJson);
            } catch (JSONException e) {
                read = null;
            }
        }
        String status = read == null ? null : read.optString("status", null);
        if (status != null && !status.equals("other_page")) {
            String key = status + ":" + (read.optJSONArray("rows") == null ? 0 : read.optJSONArray("rows").length()) + ":" + read.optLong("cheapest", 0)
                    + ":" + (read.optJSONArray("strip") == null ? 0 : read.optJSONArray("strip").length());
            s.same = key.equals(s.lastKey) ? s.same + 1 : 0;
            s.lastKey = key;
            s.read = read;
            s.status = status;
        }
        boolean settled = s.same >= SAME_READS - 1 && now - s.startedAt >= SETTLE_MS && !"waiting".equals(s.status) && !"loading".equals(s.status);
        if (settled || now - s.startedAt >= TIMEOUT_MS) {
            s.state = "done";
            if (s.status.equals("loading")) s.status = "failed";
            return true;
        }
        return false;
    }

    /**
     * The browser reported that the page did not load. Only a site that has shown nothing yet is
     * given up: results pages raise such errors for their own redirects and still show fares.
     * True when the site is now done.
     */
    boolean failed(String siteId) {
        Site s = sites.get(siteId);
        if (s == null || !s.state.equals("loading") || s.read != null) return false;
        s.state = "done";
        s.status = "failed";
        return true;
    }

    boolean done() {
        for (Site s : sites.values()) if (!s.state.equals("done")) return false;
        return true;
    }

    /** {"job", "done", "sites": [{"id", "state", "status", "rows", "cheapest", "strip"}]} for the site's page. */
    JSONObject toJson() {
        try {
            JSONArray list = new JSONArray();
            for (Site s : sites.values()) {
                JSONObject o = new JSONObject().put("id", s.id).put("state", s.state).put("status", s.status);
                if (s.read != null && "fares".equals(s.status)) {
                    o.put("rows", s.read.optJSONArray("rows")).put("cheapest", s.read.optLong("cheapest"));
                    if (s.read.optJSONArray("strip") != null) o.put("strip", s.read.optJSONArray("strip"));
                }
                list.put(o);
            }
            return new JSONObject().put("job", id).put("done", done()).put("sites", list);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }
}
