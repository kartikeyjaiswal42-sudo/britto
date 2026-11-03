package app.britto;

import android.Manifest;
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
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import java.util.List;

/**
 * Asks the Britto server which of this phone's alerts fired ({@link AlertWatch}) and shows each new
 * firing as a notification that opens the product. Runs every 15 minutes (Android's shortest
 * periodic job), only with a network, kept across restarts; and once whenever the app opens.
 */
public final class AlertJob extends JobService {
    static final int JOB_ID = 4201;
    static final String CHANNEL = "price-alerts";
    static final long EVERY_MS = 15 * 60_000L;

    /** Schedule the periodic check (no-op when it is already scheduled). */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, AlertJob.class))
                    .setPeriodic(EVERY_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build());
        } catch (RuntimeException e) {
            // Never worth a crash: the app still checks whenever it is opened.
            android.util.Log.w("Britto", "alert job not scheduled", e);
        }
    }

    static boolean scheduled(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        return js != null && js.getPendingJob(JOB_ID) != null;
    }

    static boolean notificationsAllowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm != null && nm.areNotificationsEnabled();
    }

    /** One check, on the calling (background) thread. Returns how many notifications it showed. */
    static int check(Context c) {
        AlertWatch watch = AlertWatch.inDirectory(c.getFilesDir());
        String token = watch.token();
        if (token == null) return 0;
        Api.Response r;
        try {
            r = Api.request("GET", "/api/me", null, null, token);
        } catch (java.io.IOException e) {
            return 0; // offline: the next check tries again
        }
        if (r.status == 401 || r.status == 403) {
            watch.forget();
            return 0;
        }
        if (!r.ok()) return 0;
        List<AlertWatch.Fired> fired = watch.newlyFired(r.body);
        if (fired.isEmpty()) return 0;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return 0;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, c.getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH));
        int shown = 0;
        for (AlertWatch.Fired f : fired) {
            Uri page = Uri.parse(BuildConfig.SITE + "/p/" + Uri.encode(f.key));
            PendingIntent open = PendingIntent.getActivity(c, f.id.hashCode(),
                    new Intent(Intent.ACTION_VIEW, page, c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new Notification.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_alert)
                    // The server's message names the product and the price; the title stays short.
                    .setContentTitle(c.getString(R.string.alerts_title))
                    .setContentText(f.message != null ? f.message : f.title)
                    .setStyle(new Notification.BigTextStyle().bigText(f.message))
                    .setWhen(f.at)
                    .setShowWhen(true)
                    .setAutoCancel(true)
                    .setContentIntent(open)
                    .build();
            try {
                nm.notify(f.id, 1, n);
                shown++;
            } catch (SecurityException e) {
                // Notifications not allowed: the alert still shows on the Price Tracker page.
            }
        }
        watch.shown(fired);
        return shown;
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            check(getApplicationContext());
            jobFinished(params, false);
        }, "britto-alerts").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
