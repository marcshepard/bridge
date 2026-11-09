# Prototype 1: double dummy in the browser

Can a device run the bots' double-dummy work fast enough? (See [docs/BOT.md](../../docs/BOT.md).)
This builds DDS, the standard double-dummy solver, to WebAssembly and times the two heaviest things
a bot does:

- **A card decision:** every card South could lead against 4♥, solved on 100 sample deals (South's
  hand fixed, the other 39 cards dealt at random).
- **A hard bidding decision:** 200 full double-dummy tables (every seat in every strain).

It runs single-threaded copies of DDS in Web Workers ("copies"), splitting the deals between them.

Not part of the app: nothing here is imported by `frontend/` or `backend/`, or deployed.

## Setting up (once)

1. The Emscripten SDK in `~/emsdk`:
   `git clone --depth 1 https://github.com/emscripten-core/emsdk.git ~/emsdk`, then in that folder
   `python emsdk.py install latest` and `python emsdk.py activate latest` (the `./emsdk` script
   looks for `python3`, which on Windows is the Microsoft Store alias).
2. DDS 3.1.1 (Apache 2.0) in `vendor/dds`:
   `git clone --depth 1 --branch v3.1.1 https://github.com/dds-bridge/dds.git prototypes/dds/vendor/dds`
3. `bash prototypes/dds/build.sh` (under a minute; writes `page/dds/dds.js` and `dds.wasm`, about
   320 KB).

`vendor/` and `page/dds/` are gitignored.

## Running it

- **Check the answers:** `node prototypes/dds/check.mjs` compares every board of the demo game with
  the double dummy stored in it (made with `endplay`, which wraps DDS 2.x). All boards match except
  board 9, the test deal whose stored double dummy is still the original deal's (see "To undo" in
  the backlog).
- **Time it:** start the `dds-timing` launch configuration (Vite on port 5186, open to the local
  network), or `node frontend/node_modules/vite/bin/vite.js prototypes/dds/page --host --port 5186`.
  Open `http://<this computer's address>:5186/` on the device and tap **Run with 1, then with that
  many**.

## Results

| Device | Copies | Card decision (100 deals) | Bidding decision (200 tables) |
|---|---|---|---|
| Marc's PC (32 logical cores), desktop app's browser | 1 | 2.12 s (21 ms a deal) | 17.3 s (86 ms a table) |
| Marc's PC | 4 | 0.62 s | 4.7 s |
| iPad (7th generation, 2019), Safari | 1 | 6.32 s | 47.3 s |
| iPad (7th generation) | 4 | 5.12 s | 25.9 s |
| Pixel 9 | 1 | | |
| Pixel 9 | 4 | | |

For comparison, native DDS through `endplay` (Python, possibly several threads) takes about 59 ms
for a full table on the PC; this build takes about 86 ms in the browser and 166 ms in Node.
