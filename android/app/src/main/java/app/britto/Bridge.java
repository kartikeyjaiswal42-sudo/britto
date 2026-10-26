package app.britto;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The page reader's way to the Britto server inside the app (BLUEPRINT §18): a WebView message
 * listener named `BrittoBridge`. WebView creates it ONLY in pages whose origin is one of the
 * stores' (StoreActivity passes the list), and only the top page is answered, so a payment page,
 * an ad frame or any other site gets nothing. The answers come from {@link BridgeCore}.
 */
final class Bridge implements WebViewCompat.WebMessageListener {
    private final BridgeCore core;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    Bridge(BridgeCore core) {
        this.core = core;
    }

    void close() {
        exec.shutdownNow();
    }

    @Override
    public void onPostMessage(@NonNull WebView view, @NonNull WebMessageCompat message, @NonNull Uri sourceOrigin,
                              boolean isMainFrame, @NonNull JavaScriptReplyProxy replyProxy) {
        final String data = message.getData();
        if (!isMainFrame || data == null) return;
        exec.execute(() -> {
            String reply = core.handle(data);
            if (reply != null) main.post(() -> replyProxy.postMessage(reply));
        });
    }
}
