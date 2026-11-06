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

import java.util.List;
import java.util.function.Predicate;

/** The rules of a fare compare on the phone (FareJob): what is accepted, how many load at once, when a site is done. */
@RunWith(RobolectricTestRunner.class)
public class FareJobTest {
    private static final Predicate<String> TRAVEL = (url) -> url.startsWith("https://www.ixigo.com/") || url.startsWith("https://www.makemytrip.com/") || url.startsWith("https://www.goibibo.com/");

    private static JSONObject site(String id, String url) throws Exception {
        return new JSONObject().put("id", id).put("url", url).put("recipe", new JSONObject().put("site", id));
    }

    private static JSONArray three() throws Exception {
        return new JSONArray().put(site("ixigo", "https://www.ixigo.com/search/result/flight?from=DEL"))
                .put(site("makemytrip", "https://www.makemytrip.com/flight/search?itinerary=DEL-BOM"))
                .put(site("goibibo", "https://www.goibibo.com/flight/search?itinerary=DEL-BOM"));
    }

    private static String fares(int rows, long cheapest) throws Exception {
        JSONArray list = new JSONArray();
        for (int i = 0; i < rows; i++) list.put(new JSONObject().put("label", "IndiGo").put("price", cheapest + i));
        return new JSONObject().put("status", "fares").put("rows", list).put("cheapest", cheapest).toString();
    }

    private static String status(String s) throws Exception {
        return new JSONObject().put("status", s).put("rows", new JSONArray()).toString();
    }

    @Test
    public void onlyWholeListsOfKnownTravelSitesAreAccepted() throws Exception {
        assertNotNull(FareJob.of("j1", three(), TRAVEL));
        assertNull("nothing to compare", FareJob.of("j", new JSONArray(), TRAVEL));
        assertNull("a site Britto does not open", FareJob.of("j", new JSONArray().put(site("evil", "https://evil.example/")), TRAVEL));
        assertNull("not https", FareJob.of("j", new JSONArray().put(site("ixigo", "http://www.ixigo.com/x")), TRAVEL));
        assertNull("a bad id", FareJob.of("j", new JSONArray().put(site("Ixigo<", "https://www.ixigo.com/x")), TRAVEL));
        assertNull("no recipe", FareJob.of("j", new JSONArray().put(new JSONObject().put("id", "ixigo").put("url", "https://www.ixigo.com/x")), TRAVEL));
        assertNull("the same site twice", FareJob.of("j", new JSONArray().put(site("ixigo", "https://www.ixigo.com/a")).put(site("ixigo", "https://www.ixigo.com/b")), TRAVEL));
        JSONArray eleven = new JSONArray();
        for (int i = 0; i < 11; i++) eleven.put(site("ixigo" + (char) ('a' + i), "https://www.ixigo.com/" + i));
        assertNull("at most ten sites", FareJob.of("j", eleven, TRAVEL));
        assertNull("one bad site refuses all of them", FareJob.of("j", three().put(site("evil", "https://evil.example/")), TRAVEL));
    }

    @Test
    public void twoSitesLoadAtOnceAndTheNextStartsWhenOneIsDone() throws Exception {
        FareJob job = FareJob.of("j1", three(), TRAVEL);
        List<FareJob.Site> first = job.toStart(0);
        assertEquals(2, first.size());
        assertEquals("ixigo", first.get(0).id);
        assertTrue("no third while two load", job.toStart(1).isEmpty());
        // check: not done before the settle time even when it repeats ...
        assertFalse(job.onRead("ixigo", status("check"), 1_000));
        assertFalse(job.onRead("ixigo", status("check"), 2_500));
        assertFalse(job.onRead("ixigo", status("check"), 4_000));
        // ... and done once it has repeated after it.
        assertTrue(job.onRead("ixigo", status("check"), FareJob.SETTLE_MS + 1));
        List<FareJob.Site> next = job.toStart(FareJob.SETTLE_MS + 2);
        assertEquals(1, next.size());
        assertEquals("goibibo", next.get(0).id);
        assertEquals("check", new JSONObject(job.toJson().getJSONArray("sites").get(0).toString()).getString("status"));
    }

    @Test
    public void faresAreDoneOnlyWhenTheyStopChangingAfterTheSettleTime() throws Exception {
        FareJob job = FareJob.of("j1", three(), TRAVEL);
        job.toStart(0);
        long t = FareJob.SETTLE_MS;
        assertFalse(job.onRead("ixigo", fares(6, 711600), t));
        assertFalse(job.onRead("ixigo", fares(6, 711600), t + 1_500));
        assertFalse("still arriving: the list grew", job.onRead("ixigo", fares(9, 711600), t + 3_000));
        assertFalse(job.onRead("ixigo", fares(9, 711600), t + 4_500));
        assertTrue("three readings in a row agree", job.onRead("ixigo", fares(9, 711600), t + 6_000));
        JSONObject ixigo = job.toJson().getJSONArray("sites").getJSONObject(0);
        assertEquals("done", ixigo.getString("state"));
        assertEquals("fares", ixigo.getString("status"));
        assertEquals(9, ixigo.getJSONArray("rows").length());
        assertEquals(711600, ixigo.getLong("cheapest"));
    }

    @Test
    public void aPageWithoutFaresEndsAtTheTimeLimitAsWhatItLastShowed() throws Exception {
        FareJob job = FareJob.of("j1", three(), TRAVEL);
        job.toStart(0);
        for (long t = 2_500; t < FareJob.TIMEOUT_MS; t += 1_500) assertFalse("waiting never settles early", job.onRead("ixigo", status("waiting"), t));
        assertTrue(job.onRead("ixigo", null, FareJob.TIMEOUT_MS));
        assertEquals("waiting", job.toJson().getJSONArray("sites").getJSONObject(0).getString("status"));
        assertFalse(job.onRead("makemytrip", "not json", 5_000));
        assertTrue("never answered at all", job.onRead("makemytrip", null, FareJob.TIMEOUT_MS));
        assertEquals("failed", job.toJson().getJSONArray("sites").getJSONObject(1).getString("status"));
        assertFalse(job.toJson().getBoolean("done"));
    }

    @Test
    public void aLoadErrorEndsOnlyASiteThatShowedNothing() throws Exception {
        FareJob job = FareJob.of("j1", three(), TRAVEL);
        job.toStart(0);
        assertFalse(job.onRead("ixigo", status("waiting"), 3_000));
        assertFalse("ixigo already showed a page: its redirects' errors do not end it", job.failed("ixigo"));
        assertEquals("loading", job.site("ixigo").state);
        assertTrue(job.failed("makemytrip"));
        assertEquals("failed", job.toJson().getJSONArray("sites").getJSONObject(1).getString("status"));
        assertFalse("a site is ended once", job.failed("makemytrip"));
    }

    @Test
    public void theSearchedDayIsCheckedAndTheSitesDateStripIsReported() throws Exception {
        JSONArray dated = new JSONArray().put(site("ixigo", "https://www.ixigo.com/search/result/flight?from=DEL").put("date", "2026-11-20"));
        FareJob job = FareJob.of("j1", dated, TRAVEL);
        assertNotNull(job);
        assertEquals("{\"date\":\"2026-11-20\"}", job.site("ixigo").when());
        assertEquals("no day: no strip", "{}", FareJob.of("j", three(), TRAVEL).site("ixigo").when());
        for (String bad : new String[] {"2026-13-01", "20-11-2026", "2026-11-20\");alert(1);//", ""}) {
            assertNull("refused: " + bad, FareJob.of("j", new JSONArray().put(site("ixigo", "https://www.ixigo.com/x").put("date", bad)), TRAVEL));
        }
        job.toStart(0);
        String noStrip = fares(6, 711600);
        String withStrip = new JSONObject(noStrip).put("strip", new JSONArray().put(new JSONObject().put("date", "2026-11-20").put("price", 727900))).toString();
        long t = FareJob.SETTLE_MS;
        assertFalse(job.onRead("ixigo", noStrip, t));
        assertFalse(job.onRead("ixigo", noStrip, t + 1_500));
        assertFalse("the strip arrived: still changing", job.onRead("ixigo", withStrip, t + 3_000));
        assertFalse(job.onRead("ixigo", withStrip, t + 4_500));
        assertTrue(job.onRead("ixigo", withStrip, t + 6_000));
        JSONObject ixigo = job.toJson().getJSONArray("sites").getJSONObject(0);
        assertEquals(727900, ixigo.getJSONArray("strip").getJSONObject(0).getLong("price"));
        assertEquals("2026-11-20", ixigo.getJSONArray("strip").getJSONObject(0).getString("date"));
    }

    @Test
    public void theSiteBridgeStartsAndReportsACompare() throws Exception {
        final FareJob[] last = new FareJob[1];
        SiteBridgeCore.Fares fares = new SiteBridgeCore.Fares() {
            @Override
            public String start(JSONArray sites) {
                last[0] = FareJob.of("j7", sites, TRAVEL);
                return last[0] == null ? null : last[0].id;
            }

            @Override
            public JSONObject status(String job) {
                return last[0] != null && last[0].id.equals(job) ? last[0].toJson() : null;
            }

            @Override
            public void stop() {
                last[0] = null;
            }
        };
        SiteBridgeCore site = new SiteBridgeCore(SpendStore.inDirectory(new java.io.File(System.getProperty("java.io.tmpdir"))), null, () -> {}, () -> false, () -> 0L, fares);
        JSONObject started = new JSONObject(site.handle(new JSONObject().put("id", 1).put("msg", new JSONObject().put("type", "compareFares").put("sites", three())).toString())).getJSONObject("reply");
        assertTrue(started.getBoolean("ok"));
        assertEquals("j7", started.getString("job"));
        JSONObject st = new JSONObject(site.handle("{\"id\":2,\"msg\":{\"type\":\"compareStatus\",\"job\":\"j7\"}}")).getJSONObject("reply");
        assertTrue(st.getBoolean("ok"));
        assertEquals(3, st.getJSONArray("sites").length());
        assertFalse(new JSONObject(site.handle("{\"id\":3,\"msg\":{\"type\":\"compareStatus\",\"job\":\"j1\"}}")).getJSONObject("reply").getBoolean("ok"));
        JSONObject refused = new JSONObject(site.handle(new JSONObject().put("id", 4).put("msg", new JSONObject().put("type", "compareFares").put("sites", new JSONArray().put(site("evil", "https://evil.example/")))).toString())).getJSONObject("reply");
        assertFalse(refused.getBoolean("ok"));
        assertNull("no compare in a build without it", new SiteBridgeCore(SpendStore.inDirectory(new java.io.File(System.getProperty("java.io.tmpdir")))).handle("{\"id\":5,\"msg\":{\"type\":\"compareStatus\",\"job\":\"j7\"}}"));
    }

    @Test
    public void aRideTripIsTwoShortPlacesAndItsStepGoesBackToTheReader() throws Exception {
        java.util.function.Predicate<String> rides = (url) -> url.startsWith("https://m.rapido.bike/");
        JSONObject recipe = new JSONObject().put("site", "rapido").put("sector", "ride");
        java.util.function.Function<Object, JSONArray> withTrip = (trip) -> {
            try {
                return new JSONArray().put(new JSONObject().put("id", "rapido").put("url", "https://m.rapido.bike/").put("recipe", recipe).put("trip", trip));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        };
        FareJob job = FareJob.of("j1", withTrip.apply(new JSONObject().put("pickup", "Amity University Noida").put("drop", "Noida Sector 18 Metro Station")), rides);
        assertNotNull(job);
        FareJob.Site s = job.site("rapido");
        JSONObject when = new JSONObject(s.when());
        assertEquals("Amity University Noida", when.getJSONObject("trip").getString("pickup"));
        assertEquals("the first reading starts from the beginning", "", when.getString("stage"));
        job.toStart(0);
        job.onRead("rapido", new JSONObject().put("status", "waiting").put("rows", new JSONArray()).put("stage", "pickup-typed-0").toString(), 1_000);
        assertEquals("pickup-typed-0", new JSONObject(s.when()).getString("stage"));
        job.onRead("rapido", new JSONObject().put("status", "waiting").put("rows", new JSONArray()).put("stage", "evil\");alert(1);//").toString(), 2_000);
        assertEquals("a step the app does not know is not kept", "pickup-typed-0", new JSONObject(s.when()).getString("stage"));
        assertEquals("pickup-typed-0", job.toJson().getJSONArray("sites").getJSONObject(0).getString("stage"));
        Object[] refused = {
            new JSONObject().put("pickup", "Amity").put("drop", "x".repeat(81)),   // too long
            new JSONObject().put("pickup", "Amity\nNoida").put("drop", "Sector 18"), // a control character
            new JSONObject().put("pickup", 42).put("drop", "Sector 18"),            // not text
            new JSONObject().put("pickup", "Amity"),                                 // no drop
            "Amity to Sector 18",                                                    // not an object
        };
        for (Object t : refused) assertNull(String.valueOf(t), FareJob.of("j2", withTrip.apply(t), rides));
        JSONObject flight = new JSONObject(FareJob.of("j3", three(), TRAVEL).site("ixigo").when());
        assertFalse("a flight has no trip and no step", flight.has("trip") || flight.has("stage"));
    }

    private static final Predicate<String> STORES = (url) -> url.startsWith("https://www.flipkart.com/") || url.startsWith("https://www.croma.com/")
            || url.startsWith("https://www.ajio.com/") || url.startsWith("https://www.ixigo.com/");

    private static JSONObject store(String id, String url) throws Exception {
        return new JSONObject().put("id", id).put("url", url).put("recipe", new JSONObject().put("store", id).put("sector", "shop"));
    }

    private static String listed(String title, long price) throws Exception {
        JSONArray rows = new JSONArray().put(new JSONObject().put("title", title).put("price", price).put("mrp", JSONObject.NULL)
                .put("image", "https://img.example/a.jpg").put("link", "https://www.flipkart.com/p/itm1"));
        return new JSONObject().put("status", "listed").put("rows", rows).put("cheapest", price).toString();
    }

    @Test
    public void storeSearchPagesLoadThreeAtOnceSettleSoonerAndHandBackTheirProducts() throws Exception {
        JSONArray four = new JSONArray().put(store("flipkart", "https://www.flipkart.com/search?q=boat"))
                .put(store("croma", "https://www.croma.com/searchB?q=boat")).put(store("ajio", "https://www.ajio.com/search/?text=boat"))
                .put(store("flipkartb", "https://www.flipkart.com/search?q=boat+141"));
        FareJob job = FareJob.of("j1", four, STORES);
        assertNotNull(job);
        assertEquals("three store pages at once", 3, job.toStart(0).size());
        assertTrue(job.toStart(1).isEmpty());
        String read = listed("boAt Airdopes 141 Gen 2", 79_900);
        assertFalse(job.onRead("flipkart", read, 1_500));
        assertFalse(job.onRead("flipkart", read, 3_000));
        assertFalse("not before 5 s", job.onRead("flipkart", read, 4_500));
        assertTrue("settled at 5 s, not the 15 s fares take", job.onRead("flipkart", read, FareJob.SHOP_SETTLE_MS));
        JSONObject site = job.toJson().getJSONArray("sites").getJSONObject(0);
        assertEquals("listed", site.getString("status"));
        assertEquals("boAt Airdopes 141 Gen 2", site.getJSONArray("rows").getJSONObject(0).getString("title"));
        assertEquals(79_900, site.getLong("cheapest"));
        // A store that never shows a product is given up at 30 s, not 45.
        assertFalse(job.onRead("croma", status("waiting"), FareJob.SHOP_TIMEOUT_MS - 1));
        assertTrue(job.onRead("croma", status("waiting"), FareJob.SHOP_TIMEOUT_MS));
        // A job mixing a travel site keeps the fare pace (two at once).
        JSONArray mixed = new JSONArray().put(store("flipkart", "https://www.flipkart.com/search?q=a")).put(store("croma", "https://www.croma.com/searchB?q=a"))
                .put(site("ixigo", "https://www.ixigo.com/search/result/flight?from=DEL"));
        assertEquals(2, FareJob.of("j2", mixed, STORES).toStart(0).size());
    }
}
