package app.britto;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;

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

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        EdgeToEdge.enable(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
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
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams third = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(Ui.barButton(this, "Home", v -> web.loadUrl(BuildConfig.SITE + "/")), third);
        bar.addView(Ui.barButton(this, "Shop", v -> web.loadUrl(BuildConfig.SITE + "/browse")), third);
        bar.addView(Ui.barButton(this, "Alerts", v -> web.loadUrl(BuildConfig.SITE + "/alerts")), third);
        root.addView(bar);
        Ui.padForSystemBars(root);
        setContentView(root);
        Ui.backGoesBackInWeb(this, web);
        if (saved != null && web.restoreState(saved) != null) return;
        if (!handle(getIntent())) web.loadUrl(BuildConfig.SITE + "/");
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
