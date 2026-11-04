package app.britto;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** Rapido read while the shopper looks (RideReadings) and the Britto page's two messages for it. */
@RunWith(RobolectricTestRunner.class)
public class RideReadingsTest {
    private static final long NOW = 1_794_000_000_000L;

    private static JSONObject fares(long cheapest) throws Exception {
        return new JSONObject().put("status", "fares").put("cheapest", cheapest)
                .put("rows", new JSONArray().put(new JSONObject().put("label", "Auto").put("price", cheapest)))
                .put("places", new JSONArray().put("Gate no. 3, Amity Rd").put("Noida Sector 18 Metro Station"));
    }

    @Test
    public void keepsOnlyFaresAndOnlyWhileFresh() throws Exception {
        RideReadings r = new RideReadings();
        assertFalse("a login page is not a reading", r.put("rapido", new JSONObject().put("status", "login").put("rows", new JSONArray()), NOW));
        assertFalse("fares with no rows are not a reading", r.put("rapido", new JSONObject().put("status", "fares").put("rows", new JSONArray()), NOW));
        assertNull(r.get("rapido", NOW));
        assertTrue(r.put("rapido", fares(16200), NOW));
        JSONObject got = r.get("rapido", NOW + 60_000);
        assertNotNull(got);
        assertEquals(16200, got.getLong("cheapest"));
        assertEquals(NOW, got.getLong("at"));
        assertEquals("Noida Sector 18 Metro Station", got.getJSONArray("places").getString(1));
        assertNotNull("still fresh at 15 minutes", r.get("rapido", NOW + RideReadings.FRESH_MS));
        assertNull("too old after 15 minutes: ride fares change by the minute", r.get("rapido", NOW + RideReadings.FRESH_MS + 1));
        assertNull("and it is gone, not kept", r.get("rapido", NOW));
        assertTrue(r.put("rapido", fares(16200), NOW));
        assertTrue(r.put("rapido", fares(15000), NOW + 5_000));
        assertEquals("the newest reading wins", 15000, r.get("rapido", NOW + 6_000).getLong("cheapest"));
        assertNull("another site has none", r.get("uber", NOW));
    }

    @Test
    public void bridgeOpensOnlyARideRecipeOnHttpsAndHandsBackTheReading() throws Exception {
        List<String> opened = new ArrayList<>();
        RideReadings store = new RideReadings();
        SiteBridgeCore core = new SiteBridgeCore(null).withRides(new SiteBridgeCore.Rides() {
            @Override
            public boolean open(String site, String url, JSONObject recipe) {
                opened.add(site + " " + url);
                return true;
            }

            @Override
            public JSONObject reading(String site) {
                return store.get(site, NOW);
            }
        });
        JSONObject recipe = new JSONObject().put("site", "rapido").put("sector", "ride");
        String ok = core.handle(new JSONObject().put("id", 1).put("msg", new JSONObject().put("type", "readRide").put("site", "rapido").put("url", "https://m.rapido.bike/").put("recipe", recipe)).toString());
        assertTrue(new JSONObject(ok).getJSONObject("reply").getBoolean("ok"));
        assertEquals(List.of("rapido https://m.rapido.bike/"), opened);
        String[][] refused = {
            {"rapido", "http://m.rapido.bike/", "ride", "rapido"},   // not https
            {"rapido", "https://m.rapido.bike/", "flight", "rapido"}, // not a ride recipe
            {"rapido", "https://m.rapido.bike/", "ride", "uber"},     // another site's recipe
            {"Rapido!", "https://m.rapido.bike/", "ride", "Rapido!"}, // not a site id
        };
        for (String[] c : refused) {
            String reply = core.handle(new JSONObject().put("id", 2).put("msg", new JSONObject().put("type", "readRide").put("site", c[0]).put("url", c[1])
                    .put("recipe", new JSONObject().put("site", c[3]).put("sector", c[2]))).toString());
            assertFalse(String.join(" ", c), new JSONObject(reply).getJSONObject("reply").getBoolean("ok"));
        }
        assertEquals("nothing else was opened", 1, opened.size());
        String none = core.handle(new JSONObject().put("id", 3).put("msg", new JSONObject().put("type", "rideReading").put("site", "rapido")).toString());
        assertTrue(new JSONObject(none).getJSONObject("reply").isNull("reading"));
        store.put("rapido", fares(16200), NOW);
        String some = core.handle(new JSONObject().put("id", 4).put("msg", new JSONObject().put("type", "rideReading").put("site", "rapido")).toString());
        assertEquals(16200, new JSONObject(some).getJSONObject("reply").getJSONObject("reading").getLong("cheapest"));
        assertNull("without the rides part (a store page's bridge) the message is not answered",
                new SiteBridgeCore(null).handle(new JSONObject().put("id", 5).put("msg", new JSONObject().put("type", "rideReading").put("site", "rapido")).toString()));
    }

    @Test
    public void sendBrittoToAFriendSharesThePagesTextOnlyWhenShort() throws Exception {
        List<String> shared = new ArrayList<>();
        SiteBridgeCore core = new SiteBridgeCore(null).withShare(t -> shared.add(t));
        String ok = core.handle(new JSONObject().put("id", 1).put("msg", new JSONObject().put("type", "shareApp").put("text", "Get Britto: https://britto.example/app")).toString());
        assertTrue(new JSONObject(ok).getJSONObject("reply").getBoolean("ok"));
        String empty = core.handle(new JSONObject().put("id", 2).put("msg", new JSONObject().put("type", "shareApp").put("text", "")).toString());
        assertFalse(new JSONObject(empty).getJSONObject("reply").getBoolean("ok"));
        String huge = core.handle(new JSONObject().put("id", 3).put("msg", new JSONObject().put("type", "shareApp").put("text", "x".repeat(501))).toString());
        assertFalse(new JSONObject(huge).getJSONObject("reply").getBoolean("ok"));
        assertEquals(List.of("Get Britto: https://britto.example/app"), shared);
    }

    @Test
    public void currentLocationIsAskedOnlyThroughTheAppAndOnlyARealPointGoesBack() throws Exception {
        JSONObject ask = new JSONObject().put("id", 1).put("msg", new JSONObject().put("type", "here"));
        assertNull("without the location part (a store page's bridge) the message is not answered", new SiteBridgeCore(null).handle(ask.toString()));
        JSONObject[] next = {new JSONObject().put("name", "Current location").put("address", "Gate no. 3, Amity Rd, Sector 125, Noida").put("lat", 28.5442).put("lng", 77.3331)};
        SiteBridgeCore core = new SiteBridgeCore(null).withHere(() -> next[0]);
        JSONObject ok = new JSONObject(core.handle(ask.toString())).getJSONObject("reply");
        assertTrue(ok.getBoolean("ok"));
        assertEquals(28.5442, ok.getJSONObject("place").getDouble("lat"), 1e-9);
        assertEquals("Gate no. 3, Amity Rd, Sector 125, Noida", ok.getJSONObject("place").getString("address"));
        next[0] = new JSONObject().put("reason", "denied");
        JSONObject denied = new JSONObject(core.handle(ask.toString())).getJSONObject("reply");
        assertFalse(denied.getBoolean("ok"));
        assertEquals("the shopper said no: the page says so", "denied", denied.getString("reason"));
        next[0] = new JSONObject().put("lat", 128.0).put("lng", 77.3);
        assertFalse("a point off the globe is not a place", new JSONObject(core.handle(ask.toString())).getJSONObject("reply").getBoolean("ok"));
        next[0] = null;
        JSONObject none = new JSONObject(core.handle(ask.toString())).getJSONObject("reply");
        assertFalse(none.getBoolean("ok"));
        assertEquals("none", none.getString("reason"));
    }
}
