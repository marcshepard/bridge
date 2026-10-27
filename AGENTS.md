# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Copilot and others) working in this repo.
`CLAUDE.md` just points here. Keep this file as the single source of agent instructions.

## Only change what you're asked to change

**Don't create, edit, move or delete any file unless the user has asked for that change.**

- If the user reports a problem or asks a question, diagnose it and explain the fix, then wait
  for them to say go ahead. Don't apply the fix yourself.
- If you spot something else worth changing while you work, mention it and don't do it.
- Keep each change to exactly what was asked. Related improvements are suggestions, not edits.

## Starting a new session

Read **"Build plan and status"** in [docs/DESIGN.md](docs/DESIGN.md) first: it says which stage is
done, what the next stage contains, and has working notes (Marc's preferences, environment limits,
data-source decisions) carried over from earlier sessions. Update its status when a stage is done.

## What this is

Bridge Replay is a web app for replaying archived duplicate bridge boards at home and comparing
results against the original field. It runs in a web browser on phones, tablets and computers. It has a
frontend (`frontend/`, the screens on each player's device) and
a backend (`backend/`, a Cloudflare Worker API and database that lets a table share one game). Read [docs/DESIGN.md](docs/DESIGN.md) before making
structural changes. Setup is in [README.md](README.md).

## Layout

```
frontend/                 Vite + React 19 + MUI 9 + TypeScript (strict). All frontend code lives here.
  src/core/               Bridge rules. Pure functions, no React, no I/O.
    types.ts              Seat, Strain, Contract, TableResult, Hand...
    contract.ts           parse/format "4SX", "3NT", "PASS"
    deal.ts               hands, PBN deal strings, 52-card validation
    scoring.ts            duplicate scoring with an itemised breakdown (ScoreLine[])
    describe.ts           plain-English result ("Small slam made with 1 overtrick")
    compare.ts            matchpoints vs field, score groups (the traveller)
    imps.ts               IMP table and field datum
  src/providers/          WHERE GAMES COME FROM. The provider boundary.
    types.ts              GameProvider interface + Game/Board/FieldResult model
    gameFile.ts           our JSON game format (schemaVersion 1) → Game, with validation
    pbn.ts                PBN → our game format (deals, ScoreTable travellers, DD, commentary)
    staticProvider.ts     games in frontend/public/games (index.json + files)
    importedProvider.ts   games imported from files, kept in localStorage
  src/session/            Sessions and the running tally
    session.ts            Session model, play order, tally (pure)
    store.ts              SessionStore interface + LocalSessionStore
  src/services.ts         THE wiring point: which providers and which session store are used
  src/ui/                 React screens/components (MUI). No data access except via services.ts.
    theme.ts              MUI theme: palette (light + dark), typography, component defaults
    controls/             Shared UI controls built on MUI. Reuse these before writing new UI.
  public/games/           Bundled game files (index.json lists them)
backend/                  Cloudflare Worker (Hono + D1 + a Durable Object). The API for shared games.
  src/index.ts            routes; validation reuses frontend/src/core and providers/gameFile.ts
  src/api-types.ts        request/response/push types: THE API contract, imported by the frontend
  src/db.ts               all SQL (nothing else touches D1)
  src/hub.ts              EventHub Durable Object: WebSockets, presence, push (not a store)
  src/seats.ts, ids.ts    seat assignment; join codes and player IDs
  migrations/             D1 schema; add a new numbered file for every schema change
  test/                   API tests, run in the Workers runtime (@cloudflare/vitest-plugin)
scripts/                  Python data tools (sample-game generator; needs `endplay`)
docs/DESIGN.md            Design and rationale
.vscode/tasks.json        Install, start frontend/backend/both, tests, build, generate sample game
```

## Commands (run in `frontend/`)

- `npm install`: install the frontend's dependencies (`backend/` has its own; run `npm install` there too)
- `npm run dev`: backend (:8787, local D1) and frontend (http://localhost:5185) together; `/api` is proxied
- `npm run dev:frontend`: the frontend alone (`npm run dev` in `backend/` starts the backend alone)
- `npm test`: unit tests (Vitest). **Run before finishing any change.**
- `npm run typecheck`: `tsc --noEmit`
- `npm run build`: typecheck and production build

In `backend/`: `npm test` (API tests; **run before finishing any backend change**),
`npm run typecheck`, and `npm run smoke` (end-to-end check against a running `npm run dev`).

From the repo root: `python scripts/make_sample_game.py` regenerates the sample game, after
`pip install -r scripts/requirements.txt`.

## Rules of the road

**Backend rules**

- The API contract lives in `backend/src/api-types.ts`. Change it there, and update the frontend and
  tests in the same change.
- All SQL goes in `db.ts`. Schema changes are new migration files; never edit an applied migration.
- D1 is the store of record. The EventHub Durable Object only pushes messages and tracks who's
  connected; anything it loses must be recoverable from D1 (`results?since=`).
- A player's `playerId` is a secret. Never return another player's ID; others see only `slot`.
- Validate every write with `core/` (the same rules the frontend uses); never trust the client.

**General rules**

1. **Keep the layers separate.**
   - `core/` never imports from `providers/`, `session/` or `ui/`, and never touches the DOM,
     `fetch` or storage.
   - `ui/` never calls `fetch` or `localStorage`; it goes through `services.ts`.
   - Providers return **raw data only** (deals and field results). They never score or rank. All
     scoring happens in `core/`, so every source is scored the same way.
2. **Keep the backend door open.** `GameProvider` and `SessionStore` are async on purpose. A
   future backend is a new implementation of those interfaces, swapped in in `services.ts`.
   Don't add synchronous storage calls elsewhere.
3. **Scores are North–South by default.** `nsScore` is always from NS's point of view. Convert
   with `scoreFor(direction, nsScore)` at the edge, when showing "your" score.
4. **Show your working.** Every score shown to a user should be explainable by `ScoreLine[]`.
   If you change scoring, keep `lines` summing to `declarerScore`; a test enforces this.
5. **New data source?** Write an importer or provider that produces our game format
   (`GameFileV1`) or a `Game`, and add a test with a small fixture. Don't change `core/` or
   `ui/` to accommodate one source.
6. **Game files are validated, not trusted.** Bad deals throw. A bad traveller line is skipped
   with a warning, and a field score that disagrees with the rules produces a warning while the
   app uses the rules. Keep that behaviour.
7. **Tests.** Scoring rule changes need table-driven tests in `scoring.test.ts` with known values.
   Importers need fixture-based tests in `providers.test.ts`.
8. **Browser storage** is wrapped in try/catch everywhere. It can be unavailable (private
   windows), and the app must still work for the visit.
9. **Accessibility, on every device.** The app runs on phones, tablets and computers, and every
   screen must work well on all of them: check narrow and wide layouts, touch and mouse/keyboard.
   Tap targets of at least 44px, real buttons, visible focus, both light and dark themes.
10. **Styling goes through the MUI theme.** No hard-coded colours, font sizes or pixel/rem sizes in
    components. Use palette roles (`"error.main"`, `"action.selected"`, `"text.secondary"`),
    typography variants (`variant="h6"`), and theme spacing units (`sx={{ p: 2 }}`,
    `t.spacing(7)`). Suits ♥♦ use `error.main`. Any custom colour or app-wide style is defined
    once in `ui/theme.ts`, with light and dark variants.
11. **Use MUI, through common controls.** The UI is built with MUI. Before writing UI, look in
    `ui/controls/` for an existing control. When the same pattern appears twice (a picker, a score
    display, a dialog, a section heading), turn it into a shared control in `ui/controls/` and use it
    everywhere, so the app looks and behaves consistently. Set app-wide defaults (button size,
    radius, typography) in `theme.ts` rather than per component. Mention new or changed controls
    in your summary.
12. **The sample data is synthetic.** Never present it as real results. Don't add real
    third-party game data (The Common Game, ACBL) to the repo without permission from its owner.

## Style

- TypeScript strict, `noUncheckedIndexedAccess` on. Prefer small pure functions with a comment
  saying *why*.
- Terminology: "app" means the whole app (frontend and backend together). Say "frontend"
  (`frontend/`, the screens) or "backend" (`backend/`, the API and database) for a part, in docs,
  comments, script names and task names. Don't use "app" for the frontend or "API" for the backend
  as a whole; "API" is fine for the HTTP endpoints themselves. A player's "device" can be a phone,
  tablet or computer; say "phone" only when something really is phone-specific (a small screen,
  touch).
- UI copy: sentence case, plain words, a bridge player's vocabulary ("Partner", "left-hand
  opponent", "vulnerable"). No ALL-CAPS labels.
- Pinned dependency versions (exact). Note any upgrade in the commit message.
