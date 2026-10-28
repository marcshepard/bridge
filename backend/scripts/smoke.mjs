// End-to-end check against a running dev server (start it with `npm run dev` in frontend/).
// Usage: npm run smoke            (talks to the app's address, http://localhost:5185)
//        npm run smoke -- 8787    (talks to the API directly)
// Creates a game from the sample, fills it with test players, starts play, saves a result, and
// shows the result arriving over the live-update WebSocket.

import { readFileSync } from "node:fs";

const port = process.argv[2] ?? "5185";
const base = `http://localhost:${port}/api`;
const game = JSON.parse(
  readFileSync(new URL("../../frontend/public/games/sample-synthetic-01.json", import.meta.url), "utf8"),
);

async function call(method, path, body, playerId) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(playerId ? { "x-player-id": playerId } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json;
}

const { code, playerId } = await call("POST", "/events", { name: "You", game, startBoard: 1 });
console.log(`Created game ${code} (you are slot 1)`);

const { added } = await call("POST", `/events/${code}/test-players`);
console.log(`Added test players in slots ${added.join(", ")}`);

const { seats } = await call("POST", `/events/${code}/partnerships`, { random: true }, playerId);
console.log(`Random partnerships; seats by slot: ${JSON.stringify(seats)}`);

const pushed = [];
const { ticket } = await call("POST", `/events/${code}/live-ticket`, null, playerId);
const ws = new WebSocket(`ws://localhost:${port}/api/events/${code}/live?ticket=${ticket}`);
ws.onmessage = (e) => pushed.push(JSON.parse(e.data));
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("WebSocket failed to connect"));
});
console.log("Connected for live updates");

await call("PUT", `/events/${code}/boards/1`, { contract: "3NT", declarer: "N", tricks: 10 }, playerId);
console.log("Saved board 1: 3NT by N, 10 tricks");
await new Promise((r) => setTimeout(r, 300));
for (const m of pushed) console.log("Pushed:", JSON.stringify(m));

const snap = await call("GET", `/events/${code}`, null, playerId);
console.log(
  `Snapshot: ${snap.status}; players ${snap.players.map((p) => `${p.name} (${p.seat}${p.connected ? ", connected" : ""})`).join(", ")}; ${snap.results.length} result(s)`,
);
ws.close();
console.log(pushed.some((m) => m.type === "result") ? "OK" : "FAILED: no pushed result");
