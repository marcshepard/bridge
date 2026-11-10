# Double dummy in the browser (DDS)

`dds.js` and `dds.wasm` are DDS, the double-dummy solver (version 3.1.1, by Bo Haglund, Søren Hein
and Martin Nygren; Apache License 2.0, see `LICENSE-DDS.txt`), compiled to WebAssembly with two
entry points of our own (`frontend/scripts/dds/bridge_dds.cpp`):

- `bd_table`: tricks for every declarer in every strain;
- `bd_tricks`: the tricks one contract makes (about a twentieth of the work of a table).

They're committed as built, so nobody needs the build tools to run or deploy the app.

- `engine.ts`: plain calls on one copy of DDS (`table`, `tricks`).
- `worker.ts` + `workerSolver.ts`: the browser's solver, a pool of up to 4 Web Workers started when
  first needed (wired in `services.ts` as `doubleDummy`).
- `syncSolver.ts`: one copy on the current thread, for tests and the bidding report (Node).
- The interface they implement, `DoubleDummySolver`, is in `core/doubleDummy.ts`.

## Rebuilding

Only to change DDS's version or the entry points. Needs the Emscripten SDK and the DDS source (the
same setup as `prototypes/dds/README.md`):

1. `git clone --depth 1 https://github.com/emscripten-core/emsdk.git ~/emsdk`, then in that folder
   `python emsdk.py install latest` and `python emsdk.py activate latest`.
2. `git clone --depth 1 --branch v3.1.1 https://github.com/dds-bridge/dds.git prototypes/dds/vendor/dds`
3. From `frontend/`: `bash scripts/dds/build.sh` (under a minute). Then run `npx vitest run src/dds`,
   which checks the answers against the double dummy stored in the demo game.
