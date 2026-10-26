package app.britto;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** What both screens share: WebView settings, system-bar insets, Back, opening other apps. */
final class Ui {
    private Ui() {}

    static void setUpWebView(WebView web, String userAgentSuffix) {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false); // target=_blank opens here, through shouldOverrideUrlLoading
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        if (userAgentSuffix != null) s.setUserAgentString(s.getUserAgentString() + userAgentSuffix);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    }

    /** Keep content clear of the status bar, navigation bar, cutout and keyboard (edge-to-edge). */
    static void padForSystemBars(View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }

    /** Back goes back in the page history first, then does what Back normally does. */
    static void backGoesBackInWeb(ComponentActivity activity, WebView web) {
        activity.getOnBackPressedDispatcher().addCallback(activity, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                    return;
                }
                setEnabled(false);
                activity.getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    static Button barButton(Activity activity, String label, View.OnClickListener onClick) {
        Button b = new Button(activity, null, android.R.attr.borderlessButtonStyle);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(onClick);
        return b;
    }

    /** Hand a link to another app (Telegram, the phone's browser). False if none can open it. */
    static boolean openElsewhere(Activity activity, Uri uri) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /** Write a file into the phone's Downloads folder (no permission needed from Android 10). */
    static boolean saveToDownloads(Activity activity, String name, String mime, String text) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.Downloads.DISPLAY_NAME, name);
        v.put(MediaStore.Downloads.MIME_TYPE, mime);
        v.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) return false;
        try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
            if (out == null) return false;
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            activity.getContentResolver().delete(uri, null, null);
            return false;
        }
        v.clear();
        v.put(MediaStore.Downloads.IS_PENDING, 0);
        activity.getContentResolver().update(uri, v, null, null);
        return true;
    }

    static void toast(Activity activity, String text) {
        Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
    }
}
