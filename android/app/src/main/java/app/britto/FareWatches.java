package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.Locale;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Flight price alerts, kept on this phone only (BuyHatke's fare alerts): a one-way route and day
 * the shopper asked to watch, the travel sites to read for it (the same list a fare compare
 * sends, {@link FareJob}), and the lowest fare seen so far. The Britto server never sees it.
 * {@link FareAlertJob} re-reads the sites on the phone and calls {@link #checked}; there is an alert
 * when a fare is at least {@link #MIN_DROP_PAISE} (and 1%) below the lowest one already seen.
 */
final class FareWatches {
    static final int MAX = 3;
    /** ₹100: a fare a few rupees lower is noise between two readings, not news. */
    static final long MIN_DROP_PAISE = 10_000;
    private static final Pattern CODE = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern NAME = Pattern.compile("^[\\p{L}\\p{N} .&'-]{1,40}$");

    private final File file;

    private FareWatches(File file) {
        this.file = file;
    }

    static FareWatches inDirectory(File dir) {
        return new FareWatches(new File(dir, "fare-watches.json"));
    }

    /** Every watch, with its sites: [{id, from, to, date, sites, low, lowSite, last, lastSite, createdAt, checkedAt}]. */
    synchronized JSONArray all() {
        try {
            if (!file.exists()) return new JSONArray();
            return new JSONArray(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            return new JSONArray(); // a damaged file is not worth a crash: the shopper sets the alert again
        }
    }

    /** The watches for the page: no sites or recipes, only what it shows. */
    synchronized JSONArray summaries() {
        JSONArray all = all();
        JSONArray out = new JSONArray();
        try {
            for (int i = 0; i < all.length(); i++) {
                JSONObject w = all.getJSONObject(i);
                JSONObject s = new JSONObject();
                for (String k : new String[] {"id", "from", "to", "date", "low", "lowSite", "last", "lastSite", "createdAt", "checkedAt"}) {
                    if (w.has(k)) s.put(k, w.get(k));
                }
                out.put(s);
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return out;
    }

    /**
     * Watch a route and day. msg: {from, to, date, cheapest (paise), site (its name), sites (a
     * fare compare's list, each with this date)}. Watching the same route and day again replaces
     * it. {"ok": true, "id"} or {"ok": false, "reason": "bad" | "full"}.
     */
    synchronized JSONObject add(JSONObject msg, Predicate<String> opensHere, String today, long now) {
        try {
            String from = msg.optString("from", "");
            String to = msg.optString("to", "");
            String date = msg.optString("date", "");
            long cheapest = msg.optLong("cheapest", 0);
            String site = msg.optString("site", "");
            JSONArray sites = msg.optJSONArray("sites");
            boolean ok = CODE.matcher(from).matches() && CODE.matcher(to).matches() && !from.equals(to)
                    && FareJob.DAY.matcher(date).matches() && date.compareTo(today) >= 0
                    && cheapest > 0 && NAME.matcher(site).matches()
                    && sites != null && FareJob.of("watch", sites, opensHere) != null;
            for (int i = 0; ok && i < sites.length(); i++) {
                JSONObject s = sites.getJSONObject(i);
                ok = date.equals(s.optString("date", "")) && NAME.matcher(s.optString("name", "")).matches();
            }
            if (!ok) return new JSONObject().put("ok", false).put("reason", "bad");
            String id = from + "-" + to + "-" + date;
            JSONArray all = all();
            JSONArray next = new JSONArray();
            for (int i = 0; i < all.length(); i++) if (!id.equals(all.getJSONObject(i).optString("id"))) next.put(all.getJSONObject(i));
            if (next.length() >= MAX) return new JSONObject().put("ok", false).put("reason", "full");
            next.put(new JSONObject().put("id", id).put("from", from).put("to", to).put("date", date).put("sites", sites)
                    .put("low", cheapest).put("lowSite", site).put("last", cheapest).put("lastSite", site)
                    .put("createdAt", now).put("checkedAt", now));
            write(next);
            return new JSONObject().put("ok", true).put("id", id);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    synchronized boolean remove(String id) {
        JSONArray all = all();
        JSONArray next = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject w = all.optJSONObject(i);
            if (w != null && !w.optString("id").equals(id)) next.put(w);
        }
        if (next.length() == all.length()) return false;
        write(next);
        return true;
    }

    /** The watches still to check: a day that has passed is dropped. */
    synchronized JSONArray due(String today) {
        JSONArray all = all();
        JSONArray next = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject w = all.optJSONObject(i);
            if (w != null && w.optString("date").compareTo(today) >= 0) next.put(w);
        }
        if (next.length() != all.length()) write(next);
        return next;
    }

    /**
     * A check of watch `id` found `cheapest` (paise; 0 = no fare read) on `site`. The alert's
     * text when it is a real drop below the lowest fare seen (which then becomes the new lowest),
     * else null.
     */
    synchronized String checked(String id, long cheapest, String site, long now) {
        try {
            JSONArray all = all();
            String message = null;
            for (int i = 0; i < all.length(); i++) {
                JSONObject w = all.getJSONObject(i);
                if (!w.optString("id").equals(id)) continue;
                w.put("checkedAt", now);
                if (cheapest <= 0) continue;
                w.put("last", cheapest).put("lastSite", site);
                long low = w.optLong("low", Long.MAX_VALUE);
                if (low - cheapest >= Math.max(MIN_DROP_PAISE, low / 100)) {
                    message = w.optString("from") + " → " + w.optString("to") + ", " + dayName(w.optString("date")) + ": "
                            + rupees(cheapest) + " on " + site + ", down from " + rupees(low) + ".";
                    w.put("low", cheapest).put("lowSite", site);
                }
            }
            write(all);
            return message;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 711600 -> "₹7,116"; 12345600 -> "₹1,23,456" (Indian grouping, whole rupees). */
    static String rupees(long paise) {
        String r = Long.toString(Math.round(paise / 100.0));
        if (r.length() > 3) {
            StringBuilder b = new StringBuilder(r.substring(r.length() - 3));
            String head = r.substring(0, r.length() - 3);
            while (head.length() > 2) {
                b.insert(0, head.substring(head.length() - 2) + ",");
                head = head.substring(0, head.length() - 2);
            }
            r = head + "," + b;
        }
        return "₹" + r;
    }

    /** "2026-11-20" -> "Fri 20 Nov". */
    static String dayName(String iso) {
        LocalDate d = LocalDate.parse(iso);
        return d.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + d.getDayOfMonth() + " "
                + d.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
    }

    private void write(JSONArray list) {
        try {
            File tmp = new File(file.getPath() + ".tmp");
            Files.write(tmp.toPath(), list.toString().getBytes(StandardCharsets.UTF_8));
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
