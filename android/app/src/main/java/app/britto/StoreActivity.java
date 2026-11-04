package app.britto;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URISyntaxException;

/**
 * Super Browse (BLUEPRINT §18): one store in an in-app browser. The shopper browses and buys as
 * on the store's own site, with their own login. On every store page (and only there: the
 * stores' https origins) WebView runs the Britto page reader (assets/britto-reader.js, built
 * from the extension's reader) and gives it {@link Bridge}; the reader shows the Britto panel
 * and reports what it read. "Save page" keeps a copy of the page in Downloads so a reader can be
 * built for it (nothing is uploaded).
 */
public class StoreActivity extends ComponentActivity {
    private static final String EXTRA_URL = "url";
    private static final String EXTRA_SITE = "site";
    private static final String EXTRA_RECIPE = "recipe";
    private static final long READ_EVERY_MS = 2_000;
    /** Rides read on this page (Rapido, {@link RideReadings}): the site, its recipe, the fare reader. */
    private String rideSite;
    private String rideRecipe;
    private String faresJs;
    private TextView info;
    private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean resumed;
    private WebView web;
    private Bridge bridge;
    private TextView title;
    private String readerJs;
    /** True when WebView runs the reader itself at document start; else it is injected on load. */
    private boolean documentStart;
    private String currentUrl;

    static Intent open(Context context, String url) {
        return new Intent(context, StoreActivity.class).putExtra(EXTRA_URL, url);
    }

    /** A ride site whose trip is typed on its own page: its fares are read while the shopper looks. */
    static Intent read(Context context, String url, String site, String recipe) {
        return open(context, url).putExtra(EXTRA_SITE, site).putExtra(EXTRA_RECIPE, recipe);
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        EdgeToEdge.enable(this);
        try {
            readerJs = Stores.Assets.text(this, "britto-reader.js");
        } catch (IOException e) {
            throw new IllegalStateException("assets/britto-reader.js is missing", e);
        }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        title = new TextView(this);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(32, 0, 16, 0);
        title.setSingleLine(true);
        bar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(Ui.barButton(this, "Save page", v -> savePage()));
        bar.addView(Ui.barButton(this, "Britto", v -> startActivity(new Intent(this, MainActivity.class))));
        root.addView(bar);
        rideSite = getIntent().getStringExtra(EXTRA_SITE);
        rideRecipe = getIntent().getStringExtra(EXTRA_RECIPE);
        if (rideSite != null && rideRecipe != null) {
            try {
                faresJs = Stores.Assets.text(this, "britto-fares.js");
            } catch (IOException e) {
                faresJs = null;
            }
            info = new TextView(this);
            info.setPadding(32, 12, 32, 12);
            info.setTextSize(13);
            info.setBackgroundColor(0xFFEEF3FF);
            info.setTextColor(0xFF0A1128);
            info.setText("Enter your pickup and drop on this page. Britto reads the prices when they show and puts them beside Uber's. Britto never books.");
            root.addView(info);
        }

        web = new WebView(this);
        Ui.setUpWebView(web, null); // the store sees the phone's own WebView, unchanged
        java.util.Set<String> origins = Stores.origins(this);
        bridge = new Bridge(new BridgeCore(Stores.ids(this), Api::request, System::currentTimeMillis, SpendStore.inDirectory(getFilesDir()))::handle);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "BrittoBridge", origins, bridge);
        } else {
            Ui.toast(this, "Update \"Android System WebView\" from the Play Store to see Britto on store pages.");
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, readerJs, origins);
            documentStart = true;
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                currentUrl = url;
                showStore(url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                currentUrl = url; // single-page stores change the address without a page load
                showStore(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                currentUrl = url;
                // Older WebViews: inject on load, only on the stores Britto knows (the reader
                // starts once per page, so a second injection does nothing).
                Stores.Store at = Stores.forUrl(StoreActivity.this, url);
                if (!documentStart && url.startsWith("https://") && at != null && !at.service) {
                    view.evaluateJavascript(readerJs, null);
                }
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        Ui.padForSystemBars(root);
        setContentView(root);
        Ui.backGoesBackInWeb(this, web);
        if (saved != null && web.restoreState(saved) != null) return;
        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || Stores.forUrl(this, url) == null) {
            finish();
            return;
        }
        showStore(url);
        web.loadUrl(url);
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (faresJs != null) ui.postDelayed(this::readRide, READ_EVERY_MS);
    }

    @Override
    protected void onPause() {
        resumed = false;
        ui.removeCallbacksAndMessages(null);
        super.onPause();
    }

    /** Reads the ride site's page (the fare reader, as in a compare) and keeps fresh fares. */
    private void readRide() {
        if (!resumed || faresJs == null || web == null) return;
        Stores.Store at = currentUrl == null ? null : Stores.forUrl(this, currentUrl);
        if (at == null || !at.id.equals(rideSite)) {
            ui.postDelayed(this::readRide, READ_EVERY_MS);
            return;
        }
        String script = "(function(){" + faresJs + ";return __brittoFares.read(" + rideRecipe + ",{});})()";
        web.evaluateJavascript(script, value -> {
            if (!resumed) return;
            try {
                JSONObject r = new JSONObject(new JSONArray("[" + value + "]").getString(0));
                showReading(at.name, r);
            } catch (Exception e) {
                // not a reading (the page was changing): try again
            }
            ui.postDelayed(this::readRide, READ_EVERY_MS);
        });
    }

    private void showReading(String name, JSONObject r) {
        String status = r.optString("status");
        if (RideReadings.SHARED.put(rideSite, r, System.currentTimeMillis())) {
            int n = r.optJSONArray("rows").length();
            info.setText("Britto read " + n + " " + name + " price" + (n == 1 ? "" : "s") + ", from " + FareWatches.rupees(r.optLong("cheapest"))
                    + ". Tap Britto (top right) to see them beside Uber's. Britto never books.");
        } else if ("login".equals(status)) {
            info.setText("Log in on " + name + "'s page with your number. Then enter the trip: Britto reads the prices when they show.");
        } else if ("ask".equals(status)) {
            info.setText("Enter your pickup and drop on " + name + "'s page. Britto reads the prices when they show and puts them beside Uber's.");
        } else if ("check".equals(status)) {
            info.setText(name + " asks if you are a person: answer it on its page.");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.close();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void showStore(String url) {
        Stores.Store s = Stores.forUrl(this, url);
        title.setText(s != null ? s.name : Uri.parse(url).getHost());
    }

    /** Links on a store page: the Britto site opens in the app's main screen; the rest stays here. */
    private boolean route(Uri uri) {
        if (MainActivity.isSite(uri)) {
            startActivity(new Intent(Intent.ACTION_VIEW, uri, this, MainActivity.class));
            return true;
        }
        String scheme = uri.getScheme();
        if ("https".equals(scheme) || "http".equals(scheme)) return false; // checkout and login pages stay in this browser
        if ("intent".equals(scheme)) {
            // Stores try to hand over to their own app; stay in the browser, at the page they offer for browsers.
            try {
                String fallback = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
                if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) web.loadUrl(fallback);
            } catch (URISyntaxException ignored) {
                // not a link we can follow
            }
            return true;
        }
        return true; // other app links (flipkart://, market://): not followed
    }

    /** "Save page": this page's HTML into Downloads, like the extension's "Save this page". */
    private void savePage() {
        final String url = currentUrl;
        final Stores.Store store = Stores.forUrl(this, url);
        if (store == null) {
            Ui.toast(this, "Open a store page first.");
            return;
        }
        web.evaluateJavascript("document.documentElement.outerHTML", value -> {
            String html;
            try {
                html = new JSONArray("[" + value + "]").getString(0);
            } catch (Exception e) {
                Ui.toast(this, "Could not read this page to save it.");
                return;
            }
            String name = "britto-page-" + store.id + "-mobile-" + System.currentTimeMillis() + ".html";
            String text = "<!-- saved by the Britto app from " + url.replace("--", "") + " -->\n" + html;
            Ui.toast(this, Ui.saveToDownloads(this, name, "text/html", text)
                ? "Saved to Downloads: " + name + ". Nothing was uploaded."
                : "Could not save to Downloads.");
        });
    }
}
