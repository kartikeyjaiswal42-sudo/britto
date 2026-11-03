package app.britto;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The app's real BridgeCore on a computer, for scripts/app.mjs: one message envelope per line
 * on stdin, one reply envelope per line on stdout (replies may come out of order; each carries
 * its id). Same single worker thread as the app's Bridge.
 */
public final class HarnessMain {
    public static void main(String[] args) throws Exception {
        BridgeCore core = new BridgeCore(new HashSet<>(Arrays.asList(System.getProperty("britto.stores").split(","))), Api::request, System::currentTimeMillis,
            new SpendStore(new SpendStore.Disk() {
                private String text;
                @Override public String read() { return text; }
                @Override public void write(String t) { text = t; }
            }));
        ExecutorService exec = Executors.newSingleThreadExecutor();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line; (line = in.readLine()) != null; ) {
            final String msg = line;
            exec.execute(() -> {
                String reply = core.handle(msg);
                synchronized (System.out) {
                    System.out.println(reply == null ? "{\"dropped\":true}" : reply);
                    System.out.flush();
                }
            });
        }
        exec.shutdown();
    }
}
