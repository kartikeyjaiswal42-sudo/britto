package app.britto;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Flight price alerts ({@link FareWatches}): every few hours, with a network, each watched route
 * is compared again ON THIS PHONE, exactly as the Travel page does it (the same sites, recipes and
 * {@link FareRunner}, with no browser on screen), and a fare that dropped is shown as a
 * notification that opens Travel. The Britto server is asked only for the current recipes
 * (web/fares.json); it never learns the route.
 */
public final class FareAlertJob extends JobService {
    static final int JOB_ID = 4202;
    static final long EVERY_MS = 6 * 3_600_000L;
    /** Android stops a job after 10 minutes; three routes take about 1.5 minutes each. */
    static final long LIMIT_MS = 8 * 60_000L;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FareRunner runner;
    private boolean finished;

    static String today() {
        return LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();
    }

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, FareAlertJob.class))
                    .setPeriodic(EVERY_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build());
        } catch (RuntimeException e) {
            android.util.Log.w("Britto", "fare alert job not scheduled", e);
        }
    }

    static void cancel(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js != null) js.cancel(JOB_ID);
    }

    /** The watch's sites with today's recipe for each (a site whose page changed is fixed in fares.json). */
    static JSONArray withRecipes(JSONArray sites, JSONArray recipes) throws JSONException {
        JSONArray out = new JSONArray();
        for (int i = 0; i < sites.length(); i++) {
            JSONObject s = new JSONObject(sites.getJSONObject(i).toString());
            for (int k = 0; recipes != null && k < recipes.length(); k++) {
                JSONObject r = recipes.optJSONObject(k);
                if (r != null && s.optString("id").equals(r.optString("site")) && "flight".equals(r.optString("sector"))) s.put("recipe", r);
            }
            out.put(s);
        }
        return out;
    }

    /** The cheapest fare of a finished compare and the site's name: {paise, name}, or null. */
    static Object[] cheapest(JSONObject state, JSONArray sites) {
        long best = 0;
        String name = null;
        JSONArray list = state.optJSONArray("sites");
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i);
            if (s == null || !"fares".equals(s.optString("status"))) continue;
            long c = s.optLong("cheapest", 0);
            if (c <= 0 || (best > 0 && c >= best)) continue;
            best = c;
            for (int k = 0; k < sites.length(); k++) {
                JSONObject w = sites.optJSONObject(k);
                if (w != null && w.optString("id").equals(s.optString("id"))) name = w.optString("name");
            }
        }
        return best > 0 && name != null ? new Object[] {best, name} : null;
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        FareWatches store = FareWatches.inDirectory(getFilesDir());
        JSONArray due = store.due(today());
        if (due.length() == 0) {
            cancel(this);
            return false;
        }
        String engine;
        try {
            engine = Stores.Assets.text(this, "britto-fares.js");
        } catch (IOException e) {
            return false;
        }
        runner = new FareRunner(this, null, engine, url -> {
            Stores.Store at = Stores.forUrl(this, url);
            return at != null && at.service;
        });
        ui.postDelayed(() -> end(params), LIMIT_MS);
        new Thread(() -> {
            JSONArray recipes = null;
            try {
                Api.Response r = Api.request("GET", "/fares.json", null, null);
                if (r.ok()) recipes = new JSONObject(r.body).optJSONArray("recipes");
            } catch (IOException | JSONException e) {
                recipes = null; // the recipes kept with the watch are used
            }
            final JSONArray current = recipes;
            ui.post(() -> next(params, store, due, current, 0));
        }, "britto-fare-alerts").start();
        return true;
    }

    private void next(JobParameters params, FareWatches store, JSONArray due, JSONArray recipes, int i) {
        if (finished) return;
        if (i >= due.length()) {
            end(params);
            return;
        }
        JSONObject w = due.optJSONObject(i);
        JSONArray sites;
        try {
            sites = withRecipes(w.getJSONArray("sites"), recipes);
        } catch (JSONException e) {
            next(params, store, due, recipes, i + 1);
            return;
        }
        String id = w.optString("id");
        String started = runner.start(sites, state -> {
            Object[] best = cheapest(state, sites);
            android.util.Log.i("BrittoFares", "alert " + id + " " + (best == null ? "no fare" : best[0] + " on " + best[1]));
            String message = store.checked(id, best == null ? 0 : (long) best[0], best == null ? "" : (String) best[1], System.currentTimeMillis());
            if (message != null) notify(id, message);
            next(params, store, due, recipes, i + 1);
        });
        if (started == null) next(params, store, due, recipes, i + 1);
    }

    private void notify(String id, String message) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || !AlertJob.notificationsAllowed(this)) return;
        nm.createNotificationChannel(new NotificationChannel(AlertJob.CHANNEL, getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH));
        PendingIntent open = PendingIntent.getActivity(this, id.hashCode(),
                new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.SITE + "/travel"), this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, AlertJob.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_alert)
                .setContentTitle(getString(R.string.fare_alert_title))
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setAutoCancel(true)
                .setContentIntent(open)
                .build();
        try {
            nm.notify("fare-" + id, 1, n);
        } catch (SecurityException e) {
            // Notifications not allowed: the lower fare still shows under Fare alerts on Travel.
        }
    }

    private void end(JobParameters params) {
        if (finished) return;
        finished = true;
        ui.removeCallbacksAndMessages(null);
        if (runner != null) runner.stop();
        jobFinished(params, false);
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        finished = true;
        ui.removeCallbacksAndMessages(null);
        if (runner != null) runner.stop();
        return true; // try again later
    }
}
