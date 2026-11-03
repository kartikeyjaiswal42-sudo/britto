package app.britto;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the Britto site's own pages may ask the app: MainActivity attaches this bridge ONLY to the
 * Britto site's origin. It hands back the Spend Lens orders kept on this phone (the /spend page
 * sums them where they are) and clears them on request. Store pages never get this: their bridge
 * ({@link BridgeCore}) can save orders but not read any back, so a store's own scripts cannot
 * see what was bought at another store. Nothing here touches the network.
 * In: {"id": n, "msg": {...}}. Out: {"id": n, "reply": {...}}, or null to drop the message.
 */
final class SiteBridgeCore {
    private final SpendStore spend;

    SiteBridgeCore(SpendStore spend) {
        this.spend = spend;
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
                default:
                    return null;
            }
            return new JSONObject().put("id", id).put("reply", reply).toString();
        } catch (JSONException e) {
            return null;
        }
    }
}
