package app.britto;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Spend Lens orders (BLUEPRINT §13), kept in the app's own private storage on this phone and
 * nowhere else: nothing here has a way to the network (rule 5). One entry per store + order
 * number; the same order read again replaces the earlier reading, so it is never counted twice.
 */
final class SpendStore {
    interface Disk {
        String read();

        void write(String text);

        /** A file in the app's private files directory (the app is not backed up: allowBackup=false). */
        static Disk file(File file) {
            return new Disk() {
                @Override
                public String read() {
                    try {
                        return file.exists() ? new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8) : null;
                    } catch (IOException e) {
                        return null;
                    }
                }

                @Override
                public void write(String text) {
                    try {
                        Files.write(file.toPath(), text.getBytes(StandardCharsets.UTF_8));
                    } catch (IOException e) {
                        // Nothing to fall back to: the text simply is not kept this time.
                    }
                }
            };
        }
    }

    private final Disk disk;

    SpendStore(Disk disk) {
        this.disk = disk;
    }

    /** Keep these (already checked) orders; returns how many orders are kept in all. */
    synchronized int keep(JSONArray orders) throws JSONException {
        Map<String, JSONObject> byKey = new LinkedHashMap<>();
        JSONArray kept = all();
        for (int i = 0; i < kept.length(); i++) put(byKey, kept.getJSONObject(i));
        for (int i = 0; i < orders.length(); i++) put(byKey, orders.getJSONObject(i));
        JSONArray out = new JSONArray();
        for (JSONObject o : byKey.values()) out.put(o);
        disk.write(out.toString());
        return out.length();
    }

    private static void put(Map<String, JSONObject> byKey, JSONObject o) {
        byKey.put(o.optString("store") + ":" + o.optString("orderId"), o);
    }

    synchronized JSONArray all() {
        String text = disk.read();
        if (text == null || text.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(text);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    synchronized void clear() {
        disk.write("[]");
    }

    static SpendStore inDirectory(File dir) {
        return new SpendStore(Disk.file(new File(dir, "spend-orders.json")));
    }
}
