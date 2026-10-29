import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createLogger } from "vite";

const BACKEND = "http://localhost:8787";

// While the backend isn't running (not started yet, or stopped), every request the proxy passes on
// fails with ECONNREFUSED, and Vite prints each one with a stack trace. Say it once, in one line,
// until a request gets through again. Any other proxy error still shows in full.
const logger = createLogger();
let backendDown = false;
const logError = logger.error.bind(logger);
logger.error = (msg, options) => {
  const refused = (options?.error as NodeJS.ErrnoException | undefined)?.code === "ECONNREFUSED";
  if (refused && /(http|ws) proxy (socket )?error/.test(msg)) {
    if (!backendDown) logger.warn(`Backend isn't running on ${BACKEND} yet: start it, or wait for it`, { timestamp: true });
    backendDown = true;
    return;
  }
  logError(msg, options);
};

export default defineConfig({
  plugins: [react()],
  customLogger: logger,
  server: {
    port: 5185,
    strictPort: true,
    host: true,
    // The API (backend/, wrangler dev on :8787). ws: true forwards the live-update WebSockets too,
    // so phones on your Wi-Fi only ever talk to this one address.
    proxy: {
      "/api": {
        target: BACKEND,
        ws: true,
        // A request got through: the backend is back, so say so again if it goes away.
        configure: (proxy) => {
          proxy.on("proxyRes", () => (backendDown = false));
          proxy.on("open", () => (backendDown = false));
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
