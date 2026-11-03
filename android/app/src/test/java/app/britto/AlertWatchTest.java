package app.britto;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/**
 * Alert notifications in the app: which firings are news (fired after watching began, not shown
 * before), what the site may hand over, and that nothing is shown twice. The server's answer is
 * GET /api/me's real shape (core/types.ts MeView).
 */
@RunWith(RobolectricTestRunner.class)
public class AlertWatchTest {
    private static final String TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"; // 43, like randomToken(32)

    private static final class MemDisk implements SpendStore.Disk {
        String text;

        @Override
        public String read() {
            return text;
        }

        @Override
        public void write(String t) {
            text = t;
        }
    }

    private static String me(Object... alerts) throws Exception {
        JSONArray list = new JSONArray();
        for (Object a : alerts) list.put(a);
        return new JSONObject().put("me", new JSONObject().put("telegram", false).put("push", 0).put("alerts", list)).toString();
    }

    private static JSONObject alert(String id, Long firedAt, String message) throws Exception {
        return new JSONObject().put("id", id).put("key", "amazon:B09X5DK382").put("store", "amazon").put("title", "Cello pens")
                .put("lastFiredAt", firedAt == null ? JSONObject.NULL : firedAt).put("lastMessage", message == null ? JSONObject.NULL : message);
    }

    @Test
    public void onlyFiringsAfterWatchingBeganAndNotShownBefore() throws Exception {
        AlertWatch w = new AlertWatch(new MemDisk());
        assertTrue(w.watch(TOKEN, 1_000));
        String body = me(alert("old", 900L, "fired before the app watched"), alert("new", 1_500L, "₹265 → ₹246"), alert("never", null, null));
        List<AlertWatch.Fired> fired = w.newlyFired(body);
        assertEquals(1, fired.size());
        assertEquals("new", fired.get(0).id);
        assertEquals("₹265 → ₹246", fired.get(0).message);
        assertEquals("amazon:B09X5DK382", fired.get(0).key);
        w.shown(fired);
        assertTrue("a firing shown once is not shown again", w.newlyFired(body).isEmpty());
        List<AlertWatch.Fired> again = w.newlyFired(me(alert("new", 2_000L, "₹246 → ₹230")));
        assertEquals("the same alert firing LATER is news again", 1, again.size());
        assertEquals(2_000L, again.get(0).at);
    }

    @Test
    public void tokenRules() {
        MemDisk disk = new MemDisk();
        AlertWatch w = new AlertWatch(disk);
        assertFalse(w.watch("short", 1));
        assertFalse(w.watch("has spaces in it and is long enough to pass the length", 1));
        assertFalse(w.watch(null, 1));
        assertNull(w.token());
        assertTrue(w.watch(TOKEN, 1_000));
        String kept = disk.text;
        assertTrue("the same token again changes nothing", w.watch(TOKEN, 5_000));
        assertEquals(kept, disk.text);
        String other = TOKEN.replace('A', 'B');
        assertTrue(w.watch(other, 9_000));
        assertEquals(other, w.token());
        assertTrue("a new token starts afresh: nothing seen", w.seen().isEmpty());
        w.forget();
        assertNull(w.token());
    }

    @Test
    public void wrongShapesYieldNothing() throws Exception {
        AlertWatch w = new AlertWatch(new MemDisk());
        assertTrue(w.newlyFired(me(alert("x", 5L, "m"))).isEmpty());
        w.watch(TOKEN, 1);
        assertTrue(w.newlyFired("not json").isEmpty());
        assertTrue(w.newlyFired("{\"error\":{\"code\":\"no_device\"}}").isEmpty());
        assertTrue(w.newlyFired(me(new JSONObject().put("lastFiredAt", 5))).isEmpty());
        List<AlertWatch.Fired> two = w.newlyFired(me(alert("b", 30L, "b"), alert("a", 20L, "a")));
        assertEquals("oldest first", "a", two.get(0).id);
    }

    @Test
    public void siteBridgeHandsOverTheTokenAndSaysTheStatus() throws Exception {
        MemDisk disk = new MemDisk();
        AlertWatch w = new AlertWatch(disk);
        List<String> ran = new ArrayList<>();
        SiteBridgeCore site = new SiteBridgeCore(SpendStore.inDirectory(new java.io.File(System.getProperty("java.io.tmpdir"))), w,
                () -> ran.add("watch"), () -> true, () -> 7_000L);
        JSONObject status = new JSONObject(site.handle("{\"id\":1,\"msg\":{\"type\":\"alertStatus\"}}")).getJSONObject("reply");
        assertFalse(status.getBoolean("watching"));
        assertTrue(status.getBoolean("notifications"));
        JSONObject bad = new JSONObject(site.handle("{\"id\":2,\"msg\":{\"type\":\"watchAlerts\",\"token\":\"<script>\"}}")).getJSONObject("reply");
        assertFalse(bad.getBoolean("ok"));
        assertTrue("a refused token schedules nothing", ran.isEmpty());
        JSONObject ok = new JSONObject(site.handle("{\"id\":3,\"msg\":{\"type\":\"watchAlerts\",\"token\":\"" + TOKEN + "\"}}")).getJSONObject("reply");
        assertTrue(ok.getBoolean("ok"));
        assertEquals(List.of("watch"), ran);
        assertEquals(TOKEN, w.token());
        assertEquals(7_000L, new JSONObject(disk.text).getLong("since"));
        assertTrue(new JSONObject(site.handle("{\"id\":4,\"msg\":{\"type\":\"alertStatus\"}}")).getJSONObject("reply").getBoolean("watching"));
    }

    @Test
    public void spendOnlySiteBridgeIgnoresAlertMessages() {
        SiteBridgeCore site = new SiteBridgeCore(SpendStore.inDirectory(new java.io.File(System.getProperty("java.io.tmpdir"))));
        assertNull(site.handle("{\"id\":1,\"msg\":{\"type\":\"watchAlerts\",\"token\":\"" + TOKEN + "\"}}"));
    }
}
