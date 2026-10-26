package app.britto;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

/**
 * The app's bridge answers exactly the extension's messages, sends exactly what the extension
 * sends, and drops everything else. Runs on a computer (Robolectric supplies Android's org.json);
 * the server here is a fake that records every request.
 */
@RunWith(RobolectricTestRunner.class)
public class BridgeCoreTest {
    private static final String CONFIG = "{\"version\":\"amazon.desktop.r1.abc\",\"store\":\"amazon\",\"domRecipe\":{}}";

    private static final class FakeServer implements BridgeCore.Transport {
        final List<String> calls = new ArrayList<>();
        final List<String> bodies = new ArrayList<>();
        Api.Response next = new Api.Response(200, "{}", null);
        boolean down;

        @Override
        public Api.Response request(String method, String path, String jsonBody, String ifNoneMatch) throws IOException {
            calls.add(method + " " + path + (ifNoneMatch == null ? "" : " If-None-Match " + ifNoneMatch));
            bodies.add(jsonBody);
            if (down) throw new IOException("offline");
            return next;
        }
    }

    private final FakeServer server = new FakeServer();
    private long now = 1_000_000L;
    private final BridgeCore core = new BridgeCore(new HashSet<>(Arrays.asList("amazon", "flipkart", "myntra", "vijaysales")), server, () -> now);

    private JSONObject ask(String msg) throws Exception {
        String out = core.handle("{\"id\":7,\"msg\":" + msg + "}");
        if (out == null) return null;
        JSONObject envelope = new JSONObject(out);
        assertEquals(7, envelope.getInt("id"));
        return envelope.getJSONObject("reply");
    }

    @Test
    public void readerConfigIsCachedTenMinutesThenRevalidatedWithItsEtag() throws Exception {
        server.next = new Api.Response(200, CONFIG, "\"amazon.desktop.r1.abc\"");
        JSONObject first = ask("{\"type\":\"getReaderConfig\",\"store\":\"amazon\",\"device\":\"mobile\"}");
        assertTrue(first.getBoolean("ok"));
        assertEquals("amazon.desktop.r1.abc", first.getJSONObject("body").getString("version"));
        assertEquals("GET /api/config/reader?store=amazon&device=mobile&v=app-0.1.0", server.calls.get(0));

        now += BridgeCore.CONFIG_TTL_MS - 1;
        ask("{\"type\":\"getReaderConfig\",\"store\":\"amazon\",\"device\":\"mobile\"}");
        assertEquals("within 10 minutes: no request", 1, server.calls.size());

        now += 2;
        server.next = new Api.Response(304, "", "\"amazon.desktop.r1.abc\"");
        JSONObject revalidated = ask("{\"type\":\"getReaderConfig\",\"store\":\"amazon\",\"device\":\"mobile\"}");
        assertEquals("GET /api/config/reader?store=amazon&device=mobile&v=app-0.1.0 If-None-Match \"amazon.desktop.r1.abc\"", server.calls.get(1));
        assertEquals("a 304 keeps the cached config", "amazon.desktop.r1.abc", revalidated.getJSONObject("body").getString("version"));

        now += BridgeCore.CONFIG_TTL_MS;
        server.down = true;
        assertTrue("offline: the stale config still reads", ask("{\"type\":\"getReaderConfig\",\"store\":\"amazon\",\"device\":\"mobile\"}").getBoolean("ok"));
    }

    @Test
    public void observationCarriesTheConfigAndAppVersionsAndNothingElse() throws Exception {
        server.next = new Api.Response(200, "{\"recorded\":\"accept\",\"product\":{\"key\":\"amazon:B09X5DK382\"}}", null);
        JSONObject reply = ask("{\"type\":\"postObservation\",\"url\":\"https://www.amazon.in/dp/B09X5DK382\",\"configVersion\":\"amazon.desktop.r1.abc\","
            + "\"observed\":{\"status\":\"priced\",\"title\":\"Pens\",\"image\":null,\"price\":26500,\"mrp\":29900}}");
        assertTrue(reply.getBoolean("ok"));
        assertEquals("accept", reply.getString("recorded"));
        assertEquals("POST /api/observations", server.calls.get(0));
        JSONObject sent = new JSONObject(server.bodies.get(0));
        assertEquals("https://www.amazon.in/dp/B09X5DK382", sent.getString("url"));
        assertEquals(26500, sent.getJSONObject("observed").getInt("price"));
        assertEquals("amazon.desktop.r1.abc", sent.getString("configVersion"));
        assertEquals("app-0.1.0", sent.getString("readerVersion"));
        assertEquals("app", sent.getString("client"));
        assertEquals(5, sent.length());
    }

    @Test
    public void serverErrorsKeepTheirCodeAndMessage() throws Exception {
        server.next = new Api.Response(404, "{\"error\":{\"code\":\"not_tracked\",\"message\":\"We are not tracking this product yet.\"}}", null);
        JSONObject reply = ask("{\"type\":\"getProductAnswer\",\"key\":\"amazon:B09X5DK382\"}");
        assertEquals("GET /api/products/amazon%3AB09X5DK382", server.calls.get(0));
        assertFalse(reply.getBoolean("ok"));
        assertEquals("not_tracked", reply.getString("code"));
        server.down = true;
        assertEquals("network", ask("{\"type\":\"getProductAnswer\",\"key\":\"amazon:B09X5DK382\"}").getString("code"));
    }

    @Test
    public void telemetryNamesOnlyStoreOutcomeAndVersions() throws Exception {
        JSONObject reply = ask("{\"type\":\"reportTelemetry\",\"store\":\"flipkart\",\"outcome\":\"unrecognised\",\"configVersion\":\"flipkart.desktop.r1.x\"}");
        assertTrue(reply.getBoolean("ok"));
        JSONObject sent = new JSONObject(server.bodies.get(0));
        assertEquals("POST /api/telemetry", server.calls.get(0));
        assertEquals("{\"feature\":\"read\",\"store\":\"flipkart\",\"outcome\":\"unrecognised\",\"configVersion\":\"flipkart.desktop.r1.x\",\"readerVersion\":\"app-0.1.0\",\"client\":\"app\"}", sent.toString());
    }

    @Test
    public void anythingElseIsDroppedWithoutARequest() throws Exception {
        String[] bad = {
            "{\"type\":\"captureFixture\",\"url\":\"x\",\"html\":\"<html>\"}",
            "{\"type\":\"getReaderConfig\",\"store\":\"ebay\",\"device\":\"mobile\"}",
            "{\"type\":\"getReaderConfig\",\"store\":\"amazon\",\"device\":\"tablet\"}",
            "{\"type\":\"postObservation\",\"url\":\"https://www.amazon.in/dp/X\",\"configVersion\":\"<script>\",\"observed\":{\"status\":\"priced\"}}",
            "{\"type\":\"postObservation\",\"url\":\"https://www.amazon.in/dp/X\",\"configVersion\":\"v1\",\"observed\":{\"status\":\"blocked\"}}",
            "{\"type\":\"reportTelemetry\",\"store\":\"amazon\",\"outcome\":\"priced\",\"configVersion\":\"v1\"}",
            "{\"type\":\"getProductAnswer\",\"key\":\"\"}",
        };
        for (String m : bad) assertNull(m, ask(m));
        assertNull(core.handle("not json"));
        assertNull(core.handle("{\"msg\":{\"type\":\"getProductAnswer\",\"key\":\"amazon:B09X5DK382\"}}"));
        assertEquals("no request was made", 0, server.calls.size());
    }
}
