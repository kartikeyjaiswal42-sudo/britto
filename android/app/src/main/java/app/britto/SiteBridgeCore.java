package app.britto;

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
 * In: {"id": n, "msg": {...}}. Out: {"id": n, "reply": {...}}, or null to drop the message.
 */
final class SiteBridgeCore {
    private final SpendStore spend;
    private final AlertWatch alerts;
    private final Runnable onWatch;
    private final BooleanSupplier notificationsAllowed;
    private final LongSupplier clock;

    SiteBridgeCore(SpendStore spend) {
        this(spend, null, () -> {}, () -> false, System::currentTimeMillis);
    }

    /** onWatch: schedule the checks and ask Android for permission to notify (MainActivity). */
    SiteBridgeCore(SpendStore spend, AlertWatch alerts, Runnable onWatch, BooleanSupplier notificationsAllowed, LongSupplier clock) {
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
                default:
                    return null;
            }
            return new JSONObject().put("id", id).put("reply", reply).toString();
        } catch (JSONException e) {
            return null;
        }
    }
}
