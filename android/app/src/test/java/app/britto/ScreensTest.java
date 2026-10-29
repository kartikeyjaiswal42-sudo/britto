package app.britto;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.content.Intent;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.shadows.ShadowToast;

import java.util.Set;

/**
 * The app's screens on Robolectric's Android: which addresses count as a store (exactly the
 * hosts of core/stores.ts, from the APK's own stores.json), and "Share -> Britto".
 */
@RunWith(RobolectricTestRunner.class)
public class ScreensTest {
    private final Context context = RuntimeEnvironment.getApplication();

    @Test
    public void storesAreMatchedByExactHost() {
        assertEquals("amazon", Stores.forUrl(context, "https://www.amazon.in/dp/B09X5DK382").id);
        assertEquals("amazon", Stores.forUrl(context, "https://amzn.in/d/abc").id);
        assertEquals("flipkart", Stores.forUrl(context, "https://dl.flipkart.com/s/xyz").id);
        assertEquals("myntra", Stores.forUrl(context, "https://WWW.MYNTRA.COM/1700944").id);
        assertEquals("vijaysales", Stores.forUrl(context, "https://www.vijaysales.com/p/222878/air-fryer").id);
        assertNull("a look-alike host is not Amazon", Stores.forUrl(context, "https://amazon.in.evil.example/dp/B09X5DK382"));
        assertNull(Stores.forUrl(context, "https://www.amazon.com/dp/B09X5DK382"));
        assertNull("not a web page", Stores.forUrl(context, "intent://www.amazon.in/#Intent;end"));
        assertNull(Stores.forUrl(context, null));
        Set<String> origins = Stores.origins(context);
        assertTrue(origins.contains("https://www.amazon.in"));
        assertTrue(origins.stream().allMatch((o) -> o.startsWith("https://")));
        // One service per sector opens in the app (so the shopper can log in on its own page),
        // but gets no reader and no bridge.
        assertEquals("uber", Stores.forUrl(context, "https://m.uber.com/go/home").id);
        assertTrue(Stores.forUrl(context, "https://www.cleartrip.com/flights/results?from=DEL").service);
        assertTrue(Stores.forUrl(context, "https://www.booking.com/searchresults.html?ss=Goa").service);
        assertFalse(Stores.forUrl(context, "https://www.amazon.in/dp/B09X5DK382").service);
        assertFalse("no reader on a service", origins.contains("https://m.uber.com") || origins.contains("https://www.cleartrip.com"));
        assertFalse(Stores.ids(context).contains("uber"));
    }

    @Test
    public void aSharedProductOpensInSuperBrowse() {
        Intent share = new Intent(context, MainActivity.class).setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "Check out this product on Amazon: Cello pens https://www.amazon.in/dp/B09X5DK382?ref=share 🙂");
        MainActivity main = Robolectric.buildActivity(MainActivity.class, share).setup().get();
        Intent started = shadowOf(main).getNextStartedActivity();
        assertNotNull("Super Browse was opened", started);
        assertEquals(StoreActivity.class.getName(), started.getComponent().getClassName());
        assertEquals("https://www.amazon.in/dp/B09X5DK382?ref=share", started.getStringExtra("url"));
    }

    @Test
    public void aSharedLinkFromAnotherSiteSaysSo() {
        Intent share = new Intent(context, MainActivity.class).setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "https://example.com/something");
        MainActivity main = Robolectric.buildActivity(MainActivity.class, share).setup().get();
        assertNull("nothing else was opened", shadowOf(main).getNextStartedActivity());
        assertEquals("That is not a product link from a store Britto knows yet.", ShadowToast.getTextOfLatestToast());
    }
}
