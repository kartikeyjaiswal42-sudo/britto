package app.britto;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Calls to the Britto server, and only to it (BuildConfig.SITE). It says who it is in its
 * User-Agent. It never talks to a store: store pages are loaded by the WebView the shopper is
 * using, with the shopper's own session.
 */
final class Api {
    static final class Response {
        final int status;
        final String body;
        final String etag;

        Response(int status, String body, String etag) {
            this.status = status;
            this.body = body;
            this.etag = etag;
        }

        boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    static final String USER_AGENT = "BrittoApp/" + BuildConfig.VERSION_NAME + " (Android)";

    private Api() {}

    static Response request(String method, String path, String jsonBody, String ifNoneMatch) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.SITE + path).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(10_000);
            c.setReadTimeout(20_000);
            c.setUseCaches(false);
            c.setRequestProperty("User-Agent", USER_AGENT);
            c.setRequestProperty("Accept", "application/json");
            if (ifNoneMatch != null) c.setRequestProperty("If-None-Match", ifNoneMatch);
            if (jsonBody != null) {
                byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String body = "";
            if (in != null) {
                try (InputStream s = in) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    for (int n; (n = s.read(buf)) > 0; ) out.write(buf, 0, n);
                    body = new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            }
            return new Response(status, body, c.getHeaderField("ETag"));
        } finally {
            c.disconnect();
        }
    }
}
