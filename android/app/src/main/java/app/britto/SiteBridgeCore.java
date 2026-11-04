package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;

/**
 * What the Britto site's own pages may ask the app: MainActivity attaches this bridge ONLY to the
 * Britto site's origin. It hands back the Spend Lens orders kept on this phone (the /spend page
 * sums them where they are) and clears them on request. Store pages never get this: their bridge
 * ({@link BridgeCore}) can save orders but not read any back, so a store's own scripts cannot
 * see what was bought at another store. Nothing here touches the network.
 * Alerts: the site hands over its device token ({@code watchAlerts}) so the app can show this
 * phone's alerts as notifications ({@link AlertWatch}, {@link AlertJob}); {@code alertStatus}
 * says whether it is watching and whether Android lets it notify.
 * Fare compare: {@code compareFares} hands over the travel sites to read on this phone
 * ({@link FareRunner}), {@code compareStatus} says how far it got, {@code compareStop} ends it;
 * {@code places} looks a typed place up on the phone (ride compare), nothing leaves for Britto.
 * In: {"id": n, "msg": {...}}. Out: {"id": n, "reply": {...}}, or null to drop the message.
 */
final class SiteBridgeCore {
    /** Fare compare on this phone ({@link FareRunner}); absent where the app cannot run one. */
    interface Fares {
        /** The job id, or null when the sites were refused. */
        String start(JSONArray sites);

        /** The job's state, or null for an unknown job. */
        JSONObject status(String job);

        void stop();
    }

    /** Places by name, from the phone's own place search (android.location.Geocoder). */
    interface Places {
        /** [{name, address, lat, lng}], or null when the phone has no place search. */
        JSONArray find(String query) throws java.io.IOException;
    }

    private Places places;

    /** Adds the place search (MainActivity); without it {@code places} is not answered. */
    SiteBridgeCore withPlaces(Places p) {
        this.places = p;
        return this;
    }

    /** The colours of the page's top bar and bottom tab bar, for the strips behind Android's bars. */
    interface Bars {
        void set(int top, int bottom);
    }

    private Bars bars;

    SiteBridgeCore withBars(Bars b) {
        this.bars = b;
        return this;
    }

    /** Flight price alerts kept on this phone ({@link FareWatches}). */
    interface FareAlerts {
        /** {"ok": true, "id"} or {"ok": false, "reason"}. */
        JSONObject watch(JSONObject msg);

        JSONArray list();

        boolean stop(String id);
    }

    private FareAlerts fareAlerts;

    SiteBridgeCore withFareAlerts(FareAlerts f) {
        this.fareAlerts = f;
        return this;
    }

    /** Rides read while the shopper looks at the site's page (Rapido: {@link RideReadings}). */
    interface Rides {
        /** Opens the site's page in the app to read it; false when the site, address or recipe is refused. */
        boolean open(String site, String url, JSONObject recipe);

        /** The site's newest fresh reading, or null. */
        JSONObject reading(String site);
    }

    private Rides rides;

    SiteBridgeCore withRides(Rides r) {
        this.rides = r;
        return this;
    }

    /** "Send Britto to a friend": Android's share sheet (WhatsApp and the rest) with the page's text. */
    interface Share {
        boolean text(String text);
    }

    private Share share;

    SiteBridgeCore withShare(Share s) {
        this.share = s;
        return this;
    }

    static final java.util.regex.Pattern SITE_ID = java.util.regex.Pattern.compile("^[a-z]{2,20}$");

    private static final java.util.regex.Pattern COLOUR = java.util.regex.Pattern.compile("^#[0-9a-fA-F]{6}$");

    /** "#1F5BFF" -> an opaque ARGB int, or null. */
    static Integer colour(String s) {
        return s != null && COLOUR.matcher(s).matches() ? 0xFF000000 | Integer.parseInt(s.substring(1), 16) : null;
    }

    private final SpendStore spend;
    private final AlertWatch alerts;
    private final Runnable onWatch;
    private final BooleanSupplier notificationsAllowed;
    private final LongSupplier clock;
    private final Fares fares;

    SiteBridgeCore(SpendStore spend) {
        this(spend, null, () -> {}, () -> false, System::currentTimeMillis);
    }

    SiteBridgeCore(SpendStore spend, AlertWatch alerts, Runnable onWatch, BooleanSupplier notificationsAllowed, LongSupplier clock) {
        this(spend, alerts, onWatch, notificationsAllowed, clock, null);
    }

    /** onWatch: schedule the checks and ask Android for permission to notify (MainActivity). */
    SiteBridgeCore(SpendStore spend, AlertWatch alerts, Runnable onWatch, BooleanSupplier notificationsAllowed, LongSupplier clock, Fares fares) {
        this.fares = fares;
        this.spend = spend;
        this.alerts = alerts;
        this.onWatch = onWatch;
        this.notificationsAllowed = notificationsAllowed;
        this.clock = clock;
    }

    String handle(String envelopeJson) {
        try {
            JSONObject envelope = new JSONObject(envelopeJson);
            int id = envelope.optInt("id", -1);
            JSONObject msg = envelope.optJSONObject("msg");
            if (id < 0 || msg == null) return null;
            JSONObject reply;
            switch (msg.optString("type")) {
                case "getSpend":
                    reply = new JSONObject().put("ok", true).put("orders", spend.all());
                    break;
                case "clearSpend":
                    spend.clear();
                    reply = new JSONObject().put("ok", true);
                    break;
                case "watchAlerts": {
                    if (alerts == null) return null;
                    boolean ok = alerts.watch(msg.optString("token", null), clock.getAsLong());
                    if (ok) onWatch.run();
                    reply = new JSONObject().put("ok", ok);
                    break;
                }
                case "alertStatus":
                    if (alerts == null) return null;
                    reply = new JSONObject().put("ok", true).put("watching", alerts.token() != null)
                            .put("notifications", notificationsAllowed.getAsBoolean());
                    break;
                case "compareFares": {
                    if (fares == null) return null;
                    String job = fares.start(msg.optJSONArray("sites"));
                    reply = new JSONObject().put("ok", job != null).put("job", job == null ? JSONObject.NULL : job);
                    break;
                }
                case "compareStatus": {
                    if (fares == null) return null;
                    JSONObject state = fares.status(msg.optString("job", ""));
                    reply = state == null ? new JSONObject().put("ok", false) : state.put("ok", true);
                    break;
                }
                case "places": {
                    if (places == null) return null;
                    String q = msg.optString("q", "").trim();
                    if (q.length() < 3 || q.length() > 100) {
                        reply = new JSONObject().put("ok", false);
                        break;
                    }
                    JSONArray found;
                    try {
                        found = places.find(q);
                    } catch (java.io.IOException e) {
                        found = null; // offline, or the phone's place search did not answer
                    }
                    reply = new JSONObject().put("ok", found != null).put("places", found == null ? new JSONArray() : found);
                    break;
                }
                case "compareStop":
                    if (fares == null) return null;
                    fares.stop();
                    reply = new JSONObject().put("ok", true);
                    break;
                case "bars": {
                    if (bars == null) return null;
                    Integer top = colour(msg.optString("top", null));
                    Integer bottom = colour(msg.optString("bottom", null));
                    if (top != null && bottom != null) bars.set(top, bottom);
                    reply = new JSONObject().put("ok", top != null && bottom != null);
                    break;
                }
                case "readRide": {
                    if (rides == null) return null;
                    String site = msg.optString("site", "");
                    JSONObject recipe = msg.optJSONObject("recipe");
                    boolean ok = SITE_ID.matcher(site).matches() && recipe != null
                            && site.equals(recipe.optString("site")) && "ride".equals(recipe.optString("sector"))
                            && msg.optString("url", "").startsWith("https://")
                            && rides.open(site, msg.optString("url"), recipe);
                    reply = new JSONObject().put("ok", ok);
                    break;
                }
                case "shareApp": {
                    if (share == null) return null;
                    String text = msg.optString("text", "");
                    reply = new JSONObject().put("ok", !text.isEmpty() && text.length() <= 500 && share.text(text));
                    break;
                }
                case "rideReading": {
                    if (rides == null) return null;
                    String site = msg.optString("site", "");
                    JSONObject r = SITE_ID.matcher(site).matches() ? rides.reading(site) : null;
                    reply = new JSONObject().put("ok", true).put("reading", r == null ? JSONObject.NULL : r);
                    break;
                }
                case "watchFare":
                    if (fareAlerts == null) return null;
                    reply = fareAlerts.watch(msg);
                    break;
                case "fareWatches":
                    if (fareAlerts == null) return null;
                    reply = new JSONObject().put("ok", true).put("watches", fareAlerts.list());
                    break;
                case "unwatchFare":
                    if (fareAlerts == null) return null;
                    reply = new JSONObject().put("ok", fareAlerts.stop(msg.optString("id", "")));
                    break;
                default:
                    return null;
            }
            return new JSONObject().put("id", id).put("reply", reply).toString();
        } catch (JSONException e) {
            return null;
        }
    }
}
