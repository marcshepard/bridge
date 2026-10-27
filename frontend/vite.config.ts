import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    strictPort: true,
    host: true,
    // The API (backend/, wrangler dev on :8787). ws: true forwards the live-update WebSockets too,
    // so phones on your Wi-Fi only ever talk to this one address.
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
