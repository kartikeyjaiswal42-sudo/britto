package app.britto;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * Fare compare on the phone (core/fares.ts, {@link FareJob}): each travel site's own results page
 * opens in an in-app browser that sits UNDER the Britto site (the shopper sees the Britto page
 * with its progress, not the sites), with the phone's own WebView as is, the same cookies as
 * Super Browse (a site the shopper logged in to stays logged in), and no Britto bridge or reader.
 * Every 1.5 s the fare reader (assets/britto-fares.js) reads the page; {@link FareJob} decides
 * when a site is done, and its browser is then destroyed. Links that try to leave for an app are
 * not followed. Nothing is clicked, typed or booked on the sites.
 * Without a layer (flight alerts, {@link FareAlertJob}) the browsers are not on any screen: each is
 * laid out at the phone's own screen size, so the page lays out as it would under the app.
 */
final class FareRunner {
    static final long POLL_MS = 1_500;
    static final long FIRST_POLL_MS = 2_500;

    private final Context context;
    private final FrameLayout layer;
    private final String engineJs;
    private final Predicate<String> opensHere;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, WebView> views = new HashMap<>();
    private FareJob job;
    private Consumer<JSONObject> onDone;
    private int seq;

    /** layer: where the browsers sit (under the Britto page), or null for none on screen. */
    FareRunner(Context context, FrameLayout layer, String engineJs, Predicate<String> opensHere) {
        this.context = context;
        this.layer = layer;
        this.engineJs = engineJs;
        this.opensHere = opensHere;
    }

    /** From the bridge thread: start a compare (any earlier one stops). The job id, or null when refused. */
    synchronized String start(JSONArray sites) {
        return start(sites, null);
    }

    /** As {@link #start(JSONArray)}; done (on the UI thread) gets the final state once every site is done. */
    synchronized String start(JSONArray sites, Consumer<JSONObject> done) {
        FareJob next = FareJob.of("j" + (++seq), sites, opensHere);
        if (next == null) return null;
        job = next;
        onDone = done;
        ui.post(() -> {
            closeAll();
            pump(next);
        });
        return next.id;
    }

    /** From the bridge thread: where the compare is, or null for another (older) job. */
    synchronized JSONObject status(String jobId) {
        return job != null && job.id.equals(jobId) ? job.toJson() : null;
    }

    synchronized void stop() {
        job = null;
        onDone = null;
        ui.post(this::closeAll);
    }

    private void pump(FareJob j) {
        java.util.List<FareJob.Site> starting;
        synchronized (this) {
            if (job != j) return;
            starting = j.toStart(SystemClock.elapsedRealtime());
        }
        for (FareJob.Site s : starting) open(j, s);
        Consumer<JSONObject> done = null;
        JSONObject state = null;
        synchronized (this) {
            if (job == j && onDone != null && j.done()) {
                done = onDone;
                onDone = null;
                state = j.toJson();
            }
        }
        if (done != null) done.accept(state);
    }

    private void open(FareJob j, FareJob.Site site) {
        WebView w = new WebView(context);
        Ui.setUpWebView(w, null); // the site sees the phone's own WebView, unchanged
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme)); // never hand over to another app
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                android.util.Log.i("BrittoFares", site.id + " page error " + error.getErrorCode() + " " + error.getDescription());
                boolean gone;
                synchronized (FareRunner.this) {
                    gone = job == j && j.failed(site.id);
                }
                if (gone) finish(j, site.id);
            }
        });
        views.put(site.id, w);
        if (layer != null) {
            layer.addView(w, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            android.util.DisplayMetrics m = context.getResources().getDisplayMetrics();
            w.measure(android.view.View.MeasureSpec.makeMeasureSpec(m.widthPixels, android.view.View.MeasureSpec.EXACTLY),
                    android.view.View.MeasureSpec.makeMeasureSpec(m.heightPixels, android.view.View.MeasureSpec.EXACTLY));
            w.layout(0, 0, m.widthPixels, m.heightPixels);
        }
        w.loadUrl(site.url);
        ui.postDelayed(() -> poll(j, site, w), FIRST_POLL_MS);
        // A page that stops answering still ends: one more reading after the time limit.
        ui.postDelayed(() -> read(j, site, null), FareJob.TIMEOUT_MS + 1_000);
    }

    private void poll(FareJob j, FareJob.Site site, WebView w) {
        if (views.get(site.id) != w) return;
        String script = "(function(){" + engineJs + ";return __brittoFares.read(" + site.recipe + "," + site.when() + ");})()";
        w.evaluateJavascript(script, value -> {
            String json = null;
            try {
                if (value != null && !"null".equals(value)) json = new JSONArray("[" + value + "]").getString(0);
            } catch (Exception e) {
                json = null;
            }
            if (!read(j, site, json) && views.get(site.id) == w) ui.postDelayed(() -> poll(j, site, w), POLL_MS);
        });
    }

    /** True when the site is done (its browser is gone). */
    private boolean read(FareJob j, FareJob.Site site, String json) {
        boolean done;
        synchronized (this) {
            if (job != j || !"loading".equals(site.state)) return true;
            done = j.onRead(site.id, json, SystemClock.elapsedRealtime());
        }
        android.util.Log.i("BrittoFares", site.id + " " + site.status + (done ? " done" : ""));
        if (done) finish(j, site.id);
        return done;
    }

    private void finish(FareJob j, String siteId) {
        WebView w = views.remove(siteId);
        if (w != null) {
            if (layer != null) layer.removeView(w);
            w.destroy();
        }
        pump(j);
    }

    private void closeAll() {
        for (WebView w : views.values()) {
            if (layer != null) layer.removeView(w);
            w.destroy();
        }
        views.clear();
    }
}
