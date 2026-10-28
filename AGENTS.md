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

Read [docs/BACKLOG.md](docs/BACKLOG.md) first: what's left to build, what's next, and what was
looked at and parked. Then read **"Working notes for a new session"** in
[docs/DESIGN.md](docs/DESIGN.md): Marc's preferences, environment limits and data-source decisions
carried over from earlier sessions. When a piece of work is done, take it out of the backlog (the
git history records it) and update DESIGN.md if the design changed.

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
  src/providers/          WHERE GAMES COME FROM. One importer per source, each producing GameFileV1.
    types.ts              Game/Board/FieldResult model (+ GameProvider, for a future feed)
    gameFile.ts           our JSON game format (schemaVersion 1) → Game, with validation
    importFile.ts         picks the importer for an uploaded file
    pbn.ts                PBN → our game format (deals, ScoreTable travellers, DD, commentary)
    tcgPage.ts            saved Common Game results page (HTML) → our game format (score-only field)
  src/session/            Shared games, identity, sessions and the running tally
    session.ts            Session model, play order, tally (pure)
    store.ts              GameStore and ProfileStore interfaces
    apiGameStore.ts       GameStore on the backend: HTTP API plus a WebSocket for live updates
    localProfile.ts       ProfileStore in localStorage: display name, player IDs, current game
  src/services.ts         THE wiring point: which stores are used; dev mode and `?as=`
  src/ui/                 React screens/components (MUI). No data access except via services.ts.
    theme.ts              MUI theme: palette (light + dark), typography, component defaults
    controls/             Shared UI controls built on MUI. Reuse these before writing new UI.
  public/games/           The synthetic sample game (used by tests and `npm run smoke`)
backend/                  Cloudflare Worker (Hono + D1 + a Durable Object). The API for shared games.
  src/index.ts            routes; validation reuses frontend/src/core and providers/gameFile.ts
  src/api-types.ts        request/response/push types: THE API contract, imported by the frontend
  src/db.ts               all SQL (nothing else touches D1)
  src/hub.ts              EventHub Durable Object: WebSockets, presence, push (not a store)
  src/seats.ts, ids.ts    seat assignment; join codes and player IDs
  migrations/             D1 schema; add a new numbered file for every schema change
  test/                   API tests, run in the Workers runtime (@cloudflare/vitest-plugin)
scripts/                  Python data tools (sample-game generator; needs `endplay`)
docs/DESIGN.md            Design and rationale, plus working notes for a new session
docs/BACKLOG.md           What's left to build, and what was parked
.vscode/tasks.json        Install, start frontend/backend/both, tests, build, generate sample game
```

## Commands (run in `frontend/`)

- `npm install`: install the frontend's dependencies (`backend/` has its own; run `npm install` there too)
- `npm run dev`: backend (:8787, local D1) and frontend (http://localhost:5185) together; `/api` is proxied
- `npm run dev:frontend`: the frontend alone (`npm run dev` in `backend/` starts the backend alone)
- `npm test`: unit tests (Vitest). See "When to run tests" below.
- `npm run typecheck`: `tsc --noEmit`
- `npm run build`: typecheck and production build

In `backend/`: `npm test` (API tests), `npm run typecheck`, `npm run smoke` (end-to-end check
against a running `npm run dev`), and `npm run deploy` (build and publish to Cloudflare; Marc runs
it, see "Deploying" in README.md).

From the repo root: `python scripts/make_sample_game.py` regenerates the sample game, after
`pip install -r scripts/requirements.txt`.

### When to run tests

Marc tests each change by hand first. Until Marc says the manual tests have passed:

- Run only a type check and **targeted** tests: the test files that cover what you changed
  (e.g. `npx vitest run src/providers/tcgPage.test.ts`). Add or update tests for the change as usual.
- Don't run the full suites (`npm test` in `frontend/` and `backend/`), `npm run smoke`, or browser
  play-throughs.

Run the full suites (and the smoke test, if the backend changed) only when Marc explicitly asks, or
when checking in, and before a check-in only if the change could affect more than the targeted
tests covered. Always say which tests you did and didn't run.

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
2. **Data access goes through interfaces.** `GameStore` (async) and `ProfileStore` are wired in
   `services.ts`; screens never know whether data comes from the backend or the browser. Don't
   add storage or network calls elsewhere.
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
13. **Keep the in-app help in sync with the code.** Help lives in `ui/components/HelpDialog.tsx`
    (plus inline help such as the Common Game steps in `StartGame.tsx`). Whenever a change alters
    what players see or do (screens, steps, scoring), update the help in the same change. Write it
    for a complete newcomer: someone who has never used the app and may never have played
    duplicate. Plain words, short steps, a worked example where a number needs explaining.
14. **Actions look like actions, the same way everywhere.** Anything you can tap is a real button
    that looks tappable; plain-looking text is never an action. Pick by role:
    - **The main action** of a screen or dialog ("Start a game", "Enter the result", "Save result"):
      a contained (filled) button. At most one per screen or dialog.
    - **Other actions** ("Join a game", "Score breakdown", "Copy link"): outlined buttons.
    - **Changing something shown on screen** (your name, a board's result): `EditButton` from
      `ui/controls/`, an outlined button with a pencil, placed right beside the thing it changes and
      labelled with the value itself ("Carol ✎") or a short verb ("Correct ✎").
    - **Text-only buttons** only for dismissing, beside the main action in a dialog's action bar or
      a form ("Cancel", "Stay"), and in an alert's action slot.
    - **Items in a list or table that open something** (a board number in the tally): the item
      itself as a text button in the primary colour, so the whole row of numbers stays readable.
    - **A banner that opens something** (the install banner): the whole banner is the button, with
      no separate button or chevron inside it.
    - **Links** (underlined) only to go to another website. Icon-only buttons only for universal
      icons (help, close, avatar), always with an `aria-label`.

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
