package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

/**
 * What the app's bridge answers, without Android in the way (so it is unit-tested on a
 * computer): the messages the extension's service worker answers (BLUEPRINT §7.5), plus
 * saveOrders (Spend Lens, §13), which keeps the orders on this phone and never sends them.
 * In: {"id": n, "msg": {...}}. Out: {"id": n, "reply": {...}}, or null for anything that is
 * not one of these messages exactly (dropped without an answer, like the extension does).
 * It reaches only Britto's public API; it never sees cookies or page content.
 */
final class BridgeCore {
    interface Transport {
        Api.Response request(String method, String path, String jsonBody, String ifNoneMatch) throws IOException;
    }

    /** Reader configs are kept this long before asking again (BLUEPRINT §6.3: 10 minutes). */
    static final long CONFIG_TTL_MS = 10 * 60_000L;
    static final String READER_VERSION = "app-" + BuildConfig.VERSION_NAME;
    private static final Pattern VERSION = Pattern.compile("^[\\w.-]{1,80}$");

    private static final class Cached {
        final long at;
        final String etag;
        final String body;

        Cached(long at, String etag, String body) {
            this.at = at;
            this.etag = etag;
            this.body = body;
        }
    }

    private final Set<String> storeIds;
    private final Transport transport;
    private final SpendStore spend;
    private final LongSupplier clock;
    private final Map<String, Cached> configs = new HashMap<>();

    BridgeCore(Set<String> storeIds, Transport transport, LongSupplier clock, SpendStore spend) {
        this.storeIds = storeIds;
        this.transport = transport;
        this.spend = spend;
        this.clock = clock;
    }

    /** One message from the page reader; the reply envelope, or null to drop it. */
    String handle(String envelopeJson) {
        final JSONObject envelope;
        try {
            envelope = new JSONObject(envelopeJson);
        } catch (JSONException e) {
            return null;
        }
        int id = envelope.optInt("id", -1);
        JSONObject msg = envelope.optJSONObject("msg");
        if (id < 0 || msg == null) return null;
        JSONObject reply;
        try {
            reply = answer(msg);
        } catch (IOException e) {
            reply = error("network", "Could not reach Britto (" + e.getMessage() + ")");
        } catch (JSONException e) {
            reply = error("internal", "Britto sent something the app could not read");
        }
        if (reply == null) return null;
        try {
            return new JSONObject().put("id", id).put("reply", reply).toString();
        } catch (JSONException e) {
            return null;
        }
    }

    private JSONObject answer(JSONObject msg) throws IOException, JSONException {
        switch (msg.optString("type")) {
            case "getReaderConfig": {
                String store = msg.optString("store");
                String device = msg.optString("device");
                if (!storeIds.contains(store) || !(device.equals("desktop") || device.equals("mobile"))) return null;
                return readerConfig(store, device);
            }
            case "getProductAnswer": {
                String key = msg.optString("key");
                if (key.isEmpty() || key.length() > 120) return null;
                return reply(transport.request("GET", "/api/products/" + URLEncoder.encode(key, StandardCharsets.UTF_8.name()), null, null));
            }
            case "postObservation": {
                String url = msg.optString("url");
                JSONObject observed = msg.optJSONObject("observed");
                String configVersion = msg.optString("configVersion");
                if (url.isEmpty() || url.length() > 2000 || observed == null || !VERSION.matcher(configVersion).matches()) return null;
                String status = observed.optString("status");
                if (!status.equals("priced") && !status.equals("unavailable")) return null;
                JSONObject body = new JSONObject()
                    .put("url", url)
                    .put("observed", observed)
                    .put("configVersion", configVersion)
                    .put("readerVersion", READER_VERSION)
                    .put("client", "app");
                return reply(transport.request("POST", "/api/observations", body.toString(), null));
            }
            case "saveOrders": {
                // Spend Lens: kept in the app's own storage. No transport call here, ever (rule 5).
                // Write-only: no message lets a store page read orders back.
                String store = msg.optString("store");
                JSONArray orders = msg.optJSONArray("orders");
                if (!storeIds.contains(store) || orders == null || orders.length() == 0 || orders.length() > 100) return null;
                for (int i = 0; i < orders.length(); i++) {
                    if (!isOrder(orders.optJSONObject(i), store)) return null;
                }
                return new JSONObject().put("ok", true).put("kept", spend.keep(orders));
            }
            case "reportTelemetry": {
                String store = msg.optString("store");
                String outcome = msg.optString("outcome");
                String configVersion = msg.optString("configVersion");
                if (!storeIds.contains(store) || !(outcome.equals("blocked") || outcome.equals("unrecognised"))
                    || !VERSION.matcher(configVersion).matches()) return null;
                JSONObject body = new JSONObject()
                    .put("feature", "read")
                    .put("store", store)
                    .put("outcome", outcome)
                    .put("configVersion", configVersion)
                    .put("readerVersion", READER_VERSION)
                    .put("client", "app");
                transport.request("POST", "/api/telemetry", body.toString(), null);
                return new JSONObject().put("ok", true);
            }
            default:
                return null;
        }
    }

    /**
     * A served reader config: from memory while fresh, else revalidated (If-None-Match; a 304
     * costs no body). Offline, a stale one still reads. The page script checks it
     * (configFromServed: valid, and hashes to its version) before using it.
     */
    private JSONObject readerConfig(String store, String device) throws IOException, JSONException {
        String key = store + "." + device;
        Cached cached;
        synchronized (configs) {
            cached = configs.get(key);
        }
        long now = clock.getAsLong();
        if (cached != null && now - cached.at < CONFIG_TTL_MS) return withBody(cached.body);
        Api.Response r;
        try {
            r = transport.request("GET", "/api/config/reader?store=" + store + "&device=" + device + "&v=" + READER_VERSION, null, cached == null ? null : cached.etag);
        } catch (IOException e) {
            if (cached != null) return withBody(cached.body);
            throw e;
        }
        if (r.status == 304 && cached != null) {
            put(key, new Cached(now, cached.etag, cached.body));
            return withBody(cached.body);
        }
        if (!r.ok()) return cached != null ? withBody(cached.body) : reply(r);
        JSONObject body = new JSONObject(r.body); // must be JSON before it reaches the page
        put(key, new Cached(now, r.etag, r.body));
        return new JSONObject().put("ok", true).put("body", body);
    }

    private void put(String key, Cached c) {
        synchronized (configs) {
            configs.put(key, c);
        }
    }

    private static JSONObject withBody(String body) throws JSONException {
        return new JSONObject().put("ok", true).put("body", new JSONObject(body));
    }

    /** The extension's reply shape: {ok: true, ...server body} or {ok: false, code, message}. */
    private static JSONObject reply(Api.Response r) throws JSONException {
        JSONObject body;
        try {
            body = new JSONObject(r.body);
        } catch (JSONException e) {
            return error("http_" + r.status, "Britto answered " + r.status);
        }
        if (!r.ok()) {
            JSONObject err = body.optJSONObject("error");
            String code = err != null ? err.optString("code", "http_" + r.status) : "http_" + r.status;
            String message = err != null ? err.optString("message", "Britto answered " + r.status) : "Britto answered " + r.status;
            return error(code, message);
        }
        return body.put("ok", true);
    }

    private static JSONObject error(String code, String message) {
        try {
            return new JSONObject().put("ok", false).put("code", code).put("message", message);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** The shape core/spend.ts isOrder accepts, for one store: what the app may keep. */
    static boolean isOrder(JSONObject o, String store) {
        if (o == null || o.length() != 5 || !store.equals(o.optString("store"))) return false;
        String id = o.optString("orderId");
        if (id.isEmpty() || id.length() > 64) return false;
        try {
            LocalDate.parse(o.optString("date")); // strict ISO day: 2026-02-30 is refused
        } catch (DateTimeParseException e) {
            return false;
        }
        if (!o.optString("date").matches("^\\d{4}-\\d{2}-\\d{2}$")) return false;
        Object total = o.opt("total");
        if (!(total instanceof Integer || total instanceof Long) || ((Number) total).longValue() < 0) return false;
        JSONArray items = o.optJSONArray("items");
        if (items == null || items.length() > 50) return false;
        for (int i = 0; i < items.length(); i++) {
            Object item = items.opt(i);
            if (!(item instanceof String) || ((String) item).length() > 200) return false;
        }
        return true;
    }
}
