package app.britto;

import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The stores Britto knows, from assets/stores.json, which scripts/build-apk.mjs writes from
 * core/stores.ts (the one registry): which hosts belong to which store, and each store's front
 * page. Only these pages get the Britto reader injected.
 */
final class Stores {
    static final class Store {
        final String id;
        final String name;
        final String home;
        /** A ride/flight/hotel service (core/services.ts): opens in the app, no reader, no bridge. */
        final boolean service;
        final List<String> hosts = new ArrayList<>();

        Store(String id, String name, String home, boolean service) {
            this.id = id;
            this.name = name;
            this.home = home;
            this.service = service;
        }
    }

    private static List<Store> all;

    private Stores() {}

    static synchronized List<Store> all(Context context) {
        if (all != null) return all;
        List<Store> list = new ArrayList<>();
        try {
            JSONArray stores = new JSONArray(Assets.text(context, "stores.json"));
            for (int i = 0; i < stores.length(); i++) {
                JSONObject s = stores.getJSONObject(i);
                Store store = new Store(s.getString("id"), s.getString("name"), s.getString("home"), s.optBoolean("service", false));
                for (String key : new String[] {"hosts", "shortHosts"}) {
                    JSONArray hosts = s.getJSONArray(key);
                    for (int j = 0; j < hosts.length(); j++) store.hosts.add(hosts.getString(j));
                }
                list.add(store);
            }
        } catch (Exception e) {
            throw new IllegalStateException("assets/stores.json is broken", e);
        }
        all = list;
        return all;
    }

    /** The store a web address belongs to (exact host match, as core/stores.ts), or null. */
    static Store forUrl(Context context, String url) {
        if (url == null) return null;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || !("https".equals(scheme) || "http".equals(scheme))) return null;
        host = host.toLowerCase(java.util.Locale.ROOT);
        for (Store s : all(context)) if (s.hosts.contains(host)) return s;
        return null;
    }

    /** "https://<host>" for every store host: the only pages that get the reader and the bridge. */
    static java.util.Set<String> origins(Context context) {
        java.util.Set<String> out = new java.util.LinkedHashSet<>();
        for (Store s : all(context)) if (!s.service) for (String h : s.hosts) out.add("https://" + h);
        return out;
    }

    static java.util.Set<String> ids(Context context) {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (Store s : all(context)) if (!s.service) out.add(s.id);
        return out;
    }

    static Store byId(Context context, String id) {
        for (Store s : all(context)) if (s.id.equals(id)) return s;
        return null;
    }

    /** Small helpers for files packed into the APK. */
    static final class Assets {
        private Assets() {}

        static String text(Context context, String name) throws IOException {
            try (InputStream in = context.getAssets().open(name)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        }
    }
}
