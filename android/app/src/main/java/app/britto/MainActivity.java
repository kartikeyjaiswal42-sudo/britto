package app.britto;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Britto website (BuildConfig.SITE) in a WebView, with Home / Shop / Alerts at the bottom.
 * A link to a store opens Super Browse (StoreActivity); Telegram links open Telegram; anything
 * else leaves for the phone's browser. Also the share target: a product shared from a store's
 * app opens in Super Browse, where Britto shows its history.
 */
public class MainActivity extends ComponentActivity {
    private static final Pattern LINK = Pattern.compile("https?://[^\\s<>\"']+");
    private WebView web;
    private Bridge siteBridge;
    private FareRunner fares;
    private FrameLayout frame;
    private View statusStrip;

    /** Only travel sites Britto opens in its own browser (core/services.ts) are read. */
    private boolean opensHere(String url) {
        Stores.Store at = Stores.forUrl(this, url);
        return at != null && at.service;
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        EdgeToEdge.enable(this);
        // `frame` holds the strip behind Android's status bar (coloured like the page's own top
        // bar, which the page reports: SiteBridgeCore "bars") and the app, padded clear of the bars.
        frame = new FrameLayout(this);
        statusStrip = new View(this);
        frame.addView(statusStrip, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));
        // Fare compare's travel-site browsers sit in `under`, below the Britto page (FareRunner).
        FrameLayout root = new FrameLayout(this);
        frame.addView(root, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        FrameLayout under = new FrameLayout(this);
        root.addView(under, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web = new WebView(this);
        // " BrittoApp/<version>": tells OUR site it runs in the app (it then offers Telegram for
        // alerts, since an Android WebView cannot receive web push). Store pages never see it.
        Ui.setUpWebView(web, " BrittoApp/" + BuildConfig.VERSION_NAME);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl());
            }
        });
        column.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        try {
            // Only travel sites Britto opens in its own browser (core/services.ts) are read.
            fares = new FareRunner(this, under, Stores.Assets.text(this, "britto-fares.js"), this::opensHere);
        } catch (IOException e) {
            fares = null; // a build without the fare reader: the site then shows links only
        }
        // Spend Lens: the Britto site (and nothing else) may read the orders kept on this phone.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            final FareRunner f = fares;
            SiteBridgeCore.Fares bridgeFares = f == null ? null : new SiteBridgeCore.Fares() {
                @Override
                public String start(org.json.JSONArray sites) {
                    return f.start(sites);
                }

                @Override
                public org.json.JSONObject status(String job) {
                    return f.status(job);
                }

                @Override
                public void stop() {
                    f.stop();
                }
            };
            siteBridge = new Bridge(new SiteBridgeCore(SpendStore.inDirectory(getFilesDir()), AlertWatch.inDirectory(getFilesDir()),
                    () -> runOnUiThread(this::watchAlerts), () -> AlertJob.notificationsAllowed(this), System::currentTimeMillis, bridgeFares)
                    .withPlaces(this::findPlaces)
                    .withHere(this::findHere)
                    .withBars((top, bottom) -> runOnUiThread(() -> paintBars(top, bottom)))
                    .withFareAlerts(fareAlerts())
                    .withRides(rides())
                    .withShare(text -> {
                        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                        runOnUiThread(() -> startActivity(Intent.createChooser(send, "Send Britto to a friend")));
                        return true;
                    })::handle);
            WebViewCompat.addWebMessageListener(web, "BrittoBridge", Collections.singleton(siteOrigin()), siteBridge);
        }
        // The site draws the design's tab bar (Home, Deals, Tracker, Shop, Travel) itself.
        ViewCompat.setOnApplyWindowInsetsListener(frame, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime() | WindowInsetsCompat.Type.displayCutout());
            root.setPadding(i.left, i.top, i.right, i.bottom);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) statusStrip.getLayoutParams();
            lp.height = i.top;
            statusStrip.setLayoutParams(lp);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(frame);
        Ui.backGoesBackInWeb(this, web);
        if (saved != null && web.restoreState(saved) != null) return;
        if (!handle(getIntent())) web.loadUrl(BuildConfig.SITE + "/");
    }

    /**
     * Ride compare's place search: the phone's own Geocoder (no permission; it does not use the
     * phone's location), limited to India. Runs on the bridge's thread (it waits for the network).
     */
    @SuppressWarnings("deprecation") // the listener form needs Android 13; this runs off the UI thread
    private org.json.JSONArray findPlaces(String query) throws IOException {
        if (!android.location.Geocoder.isPresent()) return null;
        java.util.List<android.location.Address> found = new android.location.Geocoder(this, new java.util.Locale("en", "IN"))
                .getFromLocationName(query, 5, 6.5, 68.0, 37.5, 97.5);
        org.json.JSONArray out = new org.json.JSONArray();
        if (found == null) return out;
        try {
            for (android.location.Address a : found) {
                if (!a.hasLatitude() || !a.hasLongitude()) continue;
                String line = a.getMaxAddressLineIndex() >= 0 ? a.getAddressLine(0) : null;
                String name = a.getFeatureName() != null && !a.getFeatureName().matches("[0-9-]+") ? a.getFeatureName() : query;
                out.put(new org.json.JSONObject().put("name", name).put("address", line == null ? name : line)
                        .put("lat", a.getLatitude()).put("lng", a.getLongitude()));
            }
        } catch (org.json.JSONException e) {
            throw new IllegalStateException(e);
        }
        return out;
    }

    private volatile java.util.concurrent.CountDownLatch locationAsked;

    private boolean mayLocate() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        java.util.concurrent.CountDownLatch asked = locationAsked;
        if (requestCode == 2 && asked != null) asked.countDown();
    }

    /**
     * "Use my current location" (ride compare): asks Android's location permission the first time
     * (the shopper decides), then one fresh fix, then the phone's Geocoder for its address. Runs on
     * the bridge's thread; waits at most 45 s for the answer to the permission and 15 s for a fix.
     */
    @SuppressWarnings({"deprecation", "MissingPermission"})
    private JSONObject findHere() {
        try {
            if (!mayLocate()) {
                java.util.concurrent.CountDownLatch asked = new java.util.concurrent.CountDownLatch(1);
                locationAsked = asked;
                runOnUiThread(() -> requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 2));
                asked.await(45, java.util.concurrent.TimeUnit.SECONDS);
                if (!mayLocate()) return new JSONObject().put("reason", "denied");
            }
            android.location.LocationManager lm = getSystemService(android.location.LocationManager.class);
            if (lm == null || !lm.isLocationEnabled()) return new JSONObject().put("reason", "off");
            String provider = Build.VERSION.SDK_INT >= 31 && lm.hasProvider(android.location.LocationManager.FUSED_PROVIDER) && lm.isProviderEnabled(android.location.LocationManager.FUSED_PROVIDER)
                    ? android.location.LocationManager.FUSED_PROVIDER
                    : lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ? android.location.LocationManager.GPS_PROVIDER
                    : android.location.LocationManager.NETWORK_PROVIDER;
            java.util.concurrent.atomic.AtomicReference<android.location.Location> got = new java.util.concurrent.atomic.AtomicReference<>();
            java.util.concurrent.CountDownLatch fixed = new java.util.concurrent.CountDownLatch(1);
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provider, null, getMainExecutor(), loc -> { got.set(loc); fixed.countDown(); });
            } else {
                lm.requestSingleUpdate(provider, loc -> { got.set(loc); fixed.countDown(); }, android.os.Looper.getMainLooper());
            }
            fixed.await(15, java.util.concurrent.TimeUnit.SECONDS);
            android.location.Location loc = got.get();
            if (loc == null) { // no fresh fix in time: a recent one from any source will do
                for (String p : lm.getProviders(true)) {
                    android.location.Location last = lm.getLastKnownLocation(p);
                    if (last != null && System.currentTimeMillis() - last.getTime() < 10 * 60_000L && (loc == null || last.getTime() > loc.getTime())) loc = last;
                }
            }
            if (loc == null) return new JSONObject().put("reason", "none");
            String address = null;
            if (android.location.Geocoder.isPresent()) {
                try {
                    java.util.List<android.location.Address> at = new android.location.Geocoder(this, new java.util.Locale("en", "IN")).getFromLocation(loc.getLatitude(), loc.getLongitude(), 1);
                    if (at != null && !at.isEmpty() && at.get(0).getMaxAddressLineIndex() >= 0) address = at.get(0).getAddressLine(0);
                } catch (IOException e) {
                    address = null; // offline: the point alone still makes a ride link
                }
            }
            return new JSONObject().put("name", "Current location").put("address", address == null ? JSONObject.NULL : address)
                    .put("lat", loc.getLatitude()).put("lng", loc.getLongitude()).put("accuracy", loc.hasAccuracy() ? Math.round(loc.getAccuracy()) : JSONObject.NULL);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (org.json.JSONException | SecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    /** The site handed over its alert token: check every 15 minutes, and ask once to notify. */
    private void watchAlerts() {
        AlertJob.schedule(this);
        askToNotify();
        checkAlertsNow();
    }

    private void askToNotify() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    /**
     * The strip behind the status bar takes the page's top-bar colour, the rest behind the
     * navigation bar its tab bar's; the bars' icons turn dark on a light colour, light on a dark one.
     */
    private void paintBars(int top, int bottom) {
        statusStrip.setBackgroundColor(top);
        frame.setBackgroundColor(bottom);
        androidx.core.view.WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), frame);
        c.setAppearanceLightStatusBars(light(top));
        c.setAppearanceLightNavigationBars(light(bottom));
    }

    static boolean light(int argb) {
        int r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
        return 0.299 * r + 0.587 * g + 0.114 * b > 160;
    }

    /** Flight price alerts on this phone: kept by FareWatches, checked by FareAlertJob. */
    /** Rapido: opened in the app to read its prices while the shopper enters the trip there. */
    private SiteBridgeCore.Rides rides() {
        return new SiteBridgeCore.Rides() {
            @Override
            public boolean open(String site, String url, JSONObject recipe) {
                Stores.Store at = Stores.forUrl(MainActivity.this, url);
                if (at == null || !at.service || !at.id.equals(site)) return false;
                runOnUiThread(() -> startActivity(StoreActivity.read(MainActivity.this, url, site, recipe.toString())));
                return true;
            }

            @Override
            public JSONObject reading(String site) {
                return RideReadings.SHARED.get(site, System.currentTimeMillis());
            }
        };
    }

    private SiteBridgeCore.FareAlerts fareAlerts() {
        FareWatches watches = FareWatches.inDirectory(getFilesDir());
        return new SiteBridgeCore.FareAlerts() {
            @Override
            public org.json.JSONObject watch(org.json.JSONObject msg) {
                org.json.JSONObject r = watches.add(msg, MainActivity.this::opensHere, FareAlertJob.today(), System.currentTimeMillis());
                if (r.optBoolean("ok")) {
                    runOnUiThread(() -> {
                        FareAlertJob.schedule(MainActivity.this);
                        askToNotify();
                    });
                }
                return r;
            }

            @Override
            public org.json.JSONArray list() {
                return watches.summaries();
            }

            @Override
            public boolean stop(String id) {
                boolean gone = watches.remove(id);
                if (watches.all().length() == 0) FareAlertJob.cancel(MainActivity.this);
                return gone;
            }
        };
    }

    private void checkAlertsNow() {
        new Thread(() -> AlertJob.check(getApplicationContext()), "britto-alerts-now").start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Opening the app shows any alert that fired since the last check, without waiting.
        if (AlertWatch.inDirectory(getFilesDir()).token() != null) {
            AlertJob.schedule(this);
            checkAlertsNow();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** A shared text or an address to show. True when it was handled. */
    private boolean handle(Intent intent) {
        if (intent == null) return false;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            Matcher m = LINK.matcher(text == null ? "" : text);
            // Store apps put the link mid-sentence ("Check out this product: https://…").
            while (m.find()) {
                String url = m.group();
                if (Stores.forUrl(this, url) != null) {
                    startActivity(StoreActivity.open(this, url));
                    if (web.getUrl() == null) web.loadUrl(BuildConfig.SITE + "/");
                    return true;
                }
            }
            Ui.toast(this, "That is not a product link from a store Britto knows yet.");
            return false;
        }
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && data != null && isSite(data)) {
            web.loadUrl(data.toString());
            return true;
        }
        return false;
    }

    /** The Britto site's origin ("https://host" or "http://127.0.0.1:port" in test builds). */
    @Override
    protected void onDestroy() {
        if (fares != null) fares.stop();
        if (siteBridge != null) siteBridge.close();
        super.onDestroy();
    }

    static String siteOrigin() {
        Uri site = Uri.parse(BuildConfig.SITE);
        return site.getScheme() + "://" + site.getHost() + (site.getPort() == -1 ? "" : ":" + site.getPort());
    }

    static boolean isSite(Uri uri) {
        Uri site = Uri.parse(BuildConfig.SITE);
        return site.getScheme().equals(uri.getScheme()) && site.getHost().equals(uri.getHost());
    }

    /** Where a link tapped on the Britto site goes. True = not in this WebView. */
    private boolean route(Uri uri) {
        if (isSite(uri)) return false;
        String url = uri.toString();
        if (Stores.forUrl(this, url) != null) {
            startActivity(StoreActivity.open(this, url));
            return true;
        }
        if (!Ui.openElsewhere(this, uri)) Ui.toast(this, "No app on this phone can open that link.");
        return true;
    }
}
