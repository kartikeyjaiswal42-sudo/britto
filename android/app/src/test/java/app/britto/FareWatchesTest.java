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

import java.io.File;
import java.nio.file.Files;
import java.util.function.Predicate;

/** Flight price alerts on the phone (FareWatches, FareAlertJob's pure parts, the bridge's messages). */
@RunWith(RobolectricTestRunner.class)
public class FareWatchesTest {
    private static final Predicate<String> TRAVEL = (url) -> url.startsWith("https://www.ixigo.com/") || url.startsWith("https://www.makemytrip.com/");
    private static final String TODAY = "2026-11-04";

    private static FareWatches fresh() throws Exception {
        return FareWatches.inDirectory(Files.createTempDirectory("fare-watches").toFile());
    }

    private static JSONObject site(String id, String name, String url, String date) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("url", url).put("date", date)
                .put("recipe", new JSONObject().put("site", id).put("sector", "flight").put("verified", "2026-11-04"));
    }

    private static JSONObject watch(String from, String to, String date, long cheapest) throws Exception {
        return new JSONObject().put("type", "watchFare").put("from", from).put("to", to).put("date", date).put("cheapest", cheapest).put("site", "MakeMyTrip")
                .put("sites", new JSONArray()
                        .put(site("ixigo", "ixigo", "https://www.ixigo.com/search/result/flight?from=" + from, date))
                        .put(site("makemytrip", "MakeMyTrip", "https://www.makemytrip.com/flight/search?itinerary=" + from, date)));
    }

    @Test
    public void aRouteIsWatchedOnlyWhenEverythingAboutItIsRight() throws Exception {
        FareWatches w = fresh();
        JSONObject ok = w.add(watch("DEL", "BOM", "2026-11-20", 701600), TRAVEL, TODAY, 1);
        assertTrue(ok.getBoolean("ok"));
        assertEquals("DEL-BOM-2026-11-20", ok.getString("id"));
        String[][] bad = {
            {"del", "BOM", "2026-11-20"}, {"DEL", "DEL", "2026-11-20"}, {"DEL", "BOM", "2026-11-03"}, {"DEL", "BOM", "20-11-2026"},
        };
        for (String[] b : bad) assertEquals(String.join(" ", b), "bad", w.add(watch(b[0], b[1], b[2], 701600), TRAVEL, TODAY, 1).getString("reason"));
        assertEquals("no fare seen", "bad", w.add(watch("DEL", "BOM", "2026-11-21", 0), TRAVEL, TODAY, 1).getString("reason"));
        JSONObject otherDay = watch("DEL", "BOM", "2026-11-21", 701600);
        otherDay.getJSONArray("sites").getJSONObject(0).put("date", "2026-11-22");
        assertEquals("a site searched for another day", "bad", w.add(otherDay, TRAVEL, TODAY, 1).getString("reason"));
        JSONObject evil = watch("DEL", "BOM", "2026-11-21", 701600);
        evil.getJSONArray("sites").put(site("evil", "Evil", "https://evil.example/", "2026-11-21"));
        assertEquals("a site Britto does not open", "bad", w.add(evil, TRAVEL, TODAY, 1).getString("reason"));
        assertEquals(1, w.all().length());
        JSONObject summary = w.summaries().getJSONObject(0);
        assertFalse("the page is not handed the sites and recipes", summary.has("sites"));
        assertEquals(701600, summary.getLong("low"));
    }

    @Test
    public void theSameRouteReplacesItselfAndAtMostThreeAreWatched() throws Exception {
        FareWatches w = fresh();
        assertTrue(w.add(watch("DEL", "BOM", "2026-11-20", 701600), TRAVEL, TODAY, 1).getBoolean("ok"));
        assertTrue(w.add(watch("DEL", "BOM", "2026-11-20", 690000), TRAVEL, TODAY, 2).getBoolean("ok"));
        assertEquals(1, w.all().length());
        assertEquals(690000, w.all().getJSONObject(0).getLong("low"));
        assertTrue(w.add(watch("BOM", "DEL", "2026-11-25", 650000), TRAVEL, TODAY, 3).getBoolean("ok"));
        assertTrue(w.add(watch("DEL", "BLR", "2026-11-25", 550000), TRAVEL, TODAY, 4).getBoolean("ok"));
        assertEquals("full", w.add(watch("DEL", "GOI", "2026-11-25", 550000), TRAVEL, TODAY, 5).getString("reason"));
        assertTrue(w.remove("DEL-BLR-2026-11-25"));
        assertFalse(w.remove("DEL-BLR-2026-11-25"));
        assertTrue(w.add(watch("DEL", "GOI", "2026-11-25", 550000), TRAVEL, TODAY, 6).getBoolean("ok"));
    }

    @Test
    public void anAlertOnlyForARealDropBelowTheLowestSeen() throws Exception {
        FareWatches w = fresh();
        w.add(watch("DEL", "BOM", "2026-11-20", 711600), TRAVEL, TODAY, 1);
        String id = "DEL-BOM-2026-11-20";
        assertNull("₹50 lower is not news", w.checked(id, 706600, "ixigo", 10));
        assertNull("dearer", w.checked(id, 750000, "ixigo", 11));
        assertNull("nothing read", w.checked(id, 0, "", 12));
        assertEquals("a check that read nothing keeps the last fare", 750000, w.all().getJSONObject(0).getLong("last"));
        String m = w.checked(id, 685000, "ixigo", 13);
        assertEquals("DEL → BOM, Fri 20 Nov: ₹6,850 on ixigo, down from ₹7,116.", m);
        assertNull("the drop is the new lowest: the same fare again is not news", w.checked(id, 685000, "Goibibo", 14));
        JSONObject s = w.summaries().getJSONObject(0);
        assertEquals(685000, s.getLong("low"));
        assertEquals("ixigo", s.getString("lowSite"));
        assertEquals(14, s.getLong("checkedAt"));
        // 1% of a dear fare is more than ₹100: ₹1,50,000 -> ₹1,49,000 (₹1,000 = 0.67%) is not an alert.
        w.add(watch("DEL", "LHR", "2026-11-25", 15_000_000), TRAVEL, TODAY, 1);
        assertNull(w.checked("DEL-LHR-2026-11-25", 14_900_000, "ixigo", 20));
        assertNotNull(w.checked("DEL-LHR-2026-11-25", 14_850_000, "ixigo", 21));
    }

    @Test
    public void aDayThatHasPassedIsDropped() throws Exception {
        FareWatches w = fresh();
        w.add(watch("DEL", "BOM", "2026-11-05", 701600), TRAVEL, TODAY, 1);
        w.add(watch("DEL", "BOM", "2026-11-20", 701600), TRAVEL, TODAY, 1);
        assertEquals(2, w.due("2026-11-05").length());
        assertEquals(1, w.due("2026-11-06").length());
        assertEquals(1, w.all().length());
    }

    @Test
    public void rupeesAndDaysAsTheAlertPrintsThem() {
        assertEquals("₹711", FareWatches.rupees(71100));
        assertEquals("₹7,116", FareWatches.rupees(711600));
        assertEquals("₹1,23,456", FareWatches.rupees(12345600));
        assertEquals("₹12,34,567", FareWatches.rupees(123456700));
        assertEquals("Sat 5 Dec", FareWatches.dayName("2026-12-05"));
    }

    @Test
    public void theJobComparesWithTodaysRecipesAndFindsTheCheapestSite() throws Exception {
        JSONArray sites = watch("DEL", "BOM", "2026-11-20", 701600).getJSONArray("sites");
        JSONObject newer = new JSONObject().put("site", "ixigo").put("sector", "flight").put("verified", "2026-12-01");
        JSONArray recipes = new JSONArray().put(new JSONObject().put("site", "ixigo").put("sector", "ride")).put(newer);
        JSONArray fixed = FareAlertJob.withRecipes(sites, recipes);
        assertEquals("2026-12-01", fixed.getJSONObject(0).getJSONObject("recipe").getString("verified"));
        assertEquals("a site without a newer recipe keeps its own", "2026-11-04", fixed.getJSONObject(1).getJSONObject("recipe").getString("verified"));
        assertEquals("2026-11-04", FareAlertJob.withRecipes(sites, null).getJSONObject(0).getJSONObject("recipe").getString("verified"));
        JSONObject state = new JSONObject().put("sites", new JSONArray()
                .put(new JSONObject().put("id", "ixigo").put("status", "fares").put("cheapest", 711600))
                .put(new JSONObject().put("id", "makemytrip").put("status", "fares").put("cheapest", 701600))
                .put(new JSONObject().put("id", "goibibo").put("status", "check")));
        Object[] best = FareAlertJob.cheapest(state, sites);
        assertEquals(701600L, best[0]);
        assertEquals("MakeMyTrip", best[1]);
        assertNull("no site read a fare", FareAlertJob.cheapest(new JSONObject().put("sites", new JSONArray().put(new JSONObject().put("id", "ixigo").put("status", "waiting"))), sites));
    }

    @Test
    public void theBridgeKeepsAlertsAndBarColours() throws Exception {
        FareWatches store = fresh();
        int[] painted = new int[2];
        SiteBridgeCore.FareAlerts alerts = new SiteBridgeCore.FareAlerts() {
            @Override
            public JSONObject watch(JSONObject msg) {
                return store.add(msg, TRAVEL, TODAY, 1);
            }

            @Override
            public JSONArray list() {
                return store.summaries();
            }

            @Override
            public boolean stop(String id) {
                return store.remove(id);
            }
        };
        SiteBridgeCore core = new SiteBridgeCore(SpendStore.inDirectory(new File(System.getProperty("java.io.tmpdir"))))
                .withFareAlerts(alerts).withBars((top, bottom) -> {
                    painted[0] = top;
                    painted[1] = bottom;
                });
        JSONObject set = new JSONObject(core.handle(new JSONObject().put("id", 1).put("msg", watch("DEL", "BOM", "2026-11-20", 701600)).toString())).getJSONObject("reply");
        assertTrue(set.getBoolean("ok"));
        JSONObject list = new JSONObject(core.handle("{\"id\":2,\"msg\":{\"type\":\"fareWatches\"}}")).getJSONObject("reply");
        assertEquals("DEL-BOM-2026-11-20", list.getJSONArray("watches").getJSONObject(0).getString("id"));
        assertTrue(new JSONObject(core.handle("{\"id\":3,\"msg\":{\"type\":\"unwatchFare\",\"id\":\"DEL-BOM-2026-11-20\"}}")).getJSONObject("reply").getBoolean("ok"));
        assertEquals(0, store.all().length());
        assertTrue(new JSONObject(core.handle("{\"id\":4,\"msg\":{\"type\":\"bars\",\"top\":\"#1F5BFF\",\"bottom\":\"#ffffff\"}}")).getJSONObject("reply").getBoolean("ok"));
        assertEquals(0xFF1F5BFF, painted[0]);
        assertEquals(0xFFFFFFFF, painted[1]);
        assertFalse("not a colour", new JSONObject(core.handle("{\"id\":5,\"msg\":{\"type\":\"bars\",\"top\":\"red\",\"bottom\":\"#ffffff\"}}")).getJSONObject("reply").getBoolean("ok"));
        assertEquals("a refused colour paints nothing", 0xFF1F5BFF, painted[0]);
        assertTrue(MainActivity.light(0xFFFFFFFF));
        assertFalse("white icons on the blue Home header", MainActivity.light(0xFF1F5BFF));
        assertFalse(MainActivity.light(0xFF171D33));
        assertNull("no alerts in a build without them", new SiteBridgeCore(SpendStore.inDirectory(new File(System.getProperty("java.io.tmpdir")))).handle("{\"id\":6,\"msg\":{\"type\":\"fareWatches\"}}"));
    }
}
