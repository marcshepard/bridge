# Design

## Purpose

A small group plays duplicate bridge at home on boards from an old, finished club game. Today
that means printing the hands, dealing from the printout, scoring by hand, looking up each board
in the original game's results, and writing everything on paper. Bridge Replay does the
bookkeeping:

1. Pick an archived game, a starting board and your seat.
2. See only what you'd see at the table: board number, dealer, vulnerability, your 13 cards.
3. Deal your cards, then bid and play with real cards.
4. Enter the result (contract, declarer, tricks).
5. Get your score, **with the arithmetic shown**, then your matchpoint % and IMPs against the
   original field, what the field did, the double-dummy par, and any commentary.
6. Keep a running tally.

**Devices:** the app runs in a web browser on phones, tablets and computers, and every screen
must work well on all of them. Phones are the most common case at the table, so small screens and
touch get particular care, but nothing is phone-only.

**Non-goals for now:** live games (archived boards only, so no fairness or cheating concerns),
playing the cards inside the app, and accounts.

## Architecture

```
┌─────────────────────── frontend/src (in the browser) ────────────────────────┐
│                                                                              │
│  ui/ (React screens)                                                         │
│     │  uses only ↓                                                           │
│  services.ts ── picks implementations ──┐                                    │
│     │                                   │                                    │
│     ▼                                   ▼                                    │
│  providers/  GameProvider          session/  SessionStore                    │
│   ├ StaticProvider (public/games) ¹ └ LocalSessionStore (localStorage) ¹     │
│   ├ ImportedProvider (files → localStorage) ¹                                │
│   └ importers: gameFile.ts (our JSON), pbn.ts (PBN)                          │
│                                                                              │
│  core/  pure bridge rules: scoring · describe · compare (MP%) · imps         │
│         used by session/, ui/ and the backend; imports nothing from them     │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │  /api: HTTP and WebSocket ²
                                        │
┌─────────────────────── backend/src (Cloudflare Worker) ──────────────────────┐
│                                                                              │
│  index.ts  routes (Hono); checks every write with core/ and gameFile.ts      │
│  db.ts     all SQL ──► D1 (SQLite): events, players, results                 │
│  hub.ts    EventHub Durable Object: WebSockets, presence, push               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

¹ The local-only (solo) parts. Stage 2 removes them.
² The screens don't call the backend yet. Stage 2 adds a `SessionStore` that does, through `/api`.

Three decisions shape this:

- **Providers supply raw data; the app does all the computing.** A provider returns deals and
  each board's field results (contract, declarer, tricks, how many tables). It never supplies
  percentages. A source's own percentages are usually per club or per section, while ours are
  computed the same way for every source. It also keeps providers trivial to write.
- **Every source converts into one normalised game format** (below). The PBN importer, the
  bundled files and any future Common Game feed all produce it, and the rest of the app knows
  nothing else.
- **All data access is async and behind two interfaces** (`GameProvider`, `SessionStore`), wired
  in one file (`services.ts`). Moving to a backend is a matter of adding implementations, not
  rewriting screens (see [Backend](#backend-cloudflare-workers--d1)).

The frontend is static files. In production the backend's Worker will serve them alongside the API
(see [Deploying](#deploying)).

## Game file format

`schemaVersion: 1`. Seats are `N E S W`. Hands are `"spades.hearts.diamonds.clubs"`, ranks high to
low, `T` for ten. Contracts are `"4S"`, `"3NT"`, `"4SX"` (doubled), `"6HXX"` (redoubled) or `"PASS"`.
`tricks` is the number of tricks declarer took (0–13).

```jsonc
{
  "schemaVersion": 1,
  "id": "tcg-2021-12-03-pm",              // unique, stable
  "title": "Common Game, Fri 3 Dec 2021 afternoon",
  "date": "2021-12-03",                     // optional
  "session": "Afternoon",                   // optional
  "source": {                               // shown with the game
    "name": "The Common Game",
    "url": "https://…",                     // optional link back
    "attribution": "Hands and results © The Common Game, used with permission"
  },
  "boards": [
    {
      "number": 1,
      "dealer": "N",
      "vul": "None",                        // None | NS | EW | Both
      "hands": {
        "N": "AQ84.QT98.J.KQ43", "E": "K.KJ632.AT962.75",
        "S": "T76.54.753.AJT82", "W": "J9532.A7.KQ84.96"
      },
      "field": [                            // the traveller; identical results merged with count
        { "contract": "4D", "declarer": "E", "tricks": 10, "count": 5 },
        { "contract": "3NTX", "declarer": "N", "tricks": 7, "nsScore": -300 },
        { "contract": "PASS" }
      ],
      "doubleDummy": {                      // optional
        // tricks each seat takes as declarer in each strain: { "N": { "NT": n, "S": n, "H": n, "D": n, "C": n }, … }
        "tricks": { "N": { … }, "E": { … }, "S": { … }, "W": { … } },
        "par": { "nsScore": -130, "contracts": [{ "contract": "4D", "declarer": "E", "tricks": 10 }] }
      },
      "commentary": "Expert analysis text…"  // optional
    }
  ]
}
```

Validation (`providers/gameFile.ts`):

- A deal must be exactly 52 distinct cards, 13 per hand. Otherwise the game is rejected.
- A field line that can't be parsed is skipped with a warning.
- `nsScore` is optional. If present and it disagrees with the rules, the app warns and uses the
  rules.
- Optional `stratum` on a field line ("Open", "299er") is kept for a future "compare against which
  field" option.

## Scoring, explained

`core/scoring.ts` implements Law 77 duplicate scoring and returns a `ScoreBreakdown`: the total
plus one `ScoreLine { label, detail, points }` per component, for example:

| 1NT by E, 8 tricks, not vulnerable | |
|---|---|
| Contract tricks (1NT): 40 for the first trick | 40 |
| Part-score bonus: contract tricks under 100 | 50 |
| Overtrick: 1 × 30 (NT trick value) | 30 |
| **Total for declarer** | **120** |

The breakdown handles every case that changes the arithmetic:

- Overtricks are worth the trick value when undoubled, 100 or 200 doubled, and 200 or 400
  redoubled, depending on vulnerability.
- Undertricks are 50 or 100 each when undoubled. Doubled undertricks are shown in their bands:
  not vulnerable is 100 for the 1st, 200 each for the 2nd and 3rd, then 300 each; vulnerable is
  200 for the 1st, then 300 each. Redoubled is twice those.
- Game is decided on contract-trick points of 100 or more *after* doubling, so 2♠× is game. The
  breakdown says "doubled into game".
- The bonus for making a doubled or redoubled contract is 50 or 100.

`core/describe.ts` turns any result into words ("Small slam made with 1 overtrick", "Doubled game
down 3", "Passed out"), so the field can be read as *what happened*, not just numbers.

Tests check known scores (including the 2980 maximum and the vulnerable doubled 7NT down 13),
and that the lines always add up to the total.

## Comparing with the field

**Matchpoints** compare *scores*, not contracts:

```
MP% = (field tables you beat + ½ × tables you tied) / field size
```

So no extrapolation is needed when nobody in the field had your contract. Your score always
ranks somewhere. It is equivalent to slotting your table into the original field. Example: you
are EW at +100 and the field's EW scores are −120, −50, +50, +100, +100, +200. You beat 3 and tie
2 of 6, so (3 + 1) / 6 = 66.7%.

**IMPs** compare your score with the field *datum* (the average, rounded to 10) on the standard
IMP scale. That's useful as a second opinion and for team-style practice.

**The traveller view** groups the field by score from your side's point of view, best first, with
a count bar and the % each score would earn. Your result is slotted in and highlighted. Tapping a
row lists every contract that produced that score, with a description of each. Above the ladder
are the most common result and the top result for your side.

**Double dummy.** If the source provides it (our sample does, and BridgeComposer PBN files carry
`[DoubleDummyTricks]` and `[OptimumScore]`), the review shows the tricks table and the par score.
Later this could be computed in the browser with the DDS solver compiled to WebAssembly, making
it independent of the source.

## Sessions

A session is a game, a seat, a play order and the results entered. The play order starts at your
chosen board and wraps round, so tables can start on different boards. Sessions are saved through
`SessionStore`. Today that's `localStorage` on each device.

Each player can run the app on their own device. Partners who enter the same result get identical
scores, so no syncing is needed for the core flow. The tally shows the average MP% over boards
with a field, total IMPs against the datum, and a row per board that links back to its review.

**Dealing tip.** Use four decks, one per player. Each player pulls their 13 cards from their own
full deck, so nobody sees what's left, and the four hands never overlap.

## Data sources

| Source | Deals | Field results | Status |
|---|---|---|---|
| Synthetic sample (`scripts/make_sample_game.py`) | random | **simulated** | Bundled, for development and demos |
| PBN import | yes | if the file has a `[ScoreTable]` or per-table results | Works for any PBN file the user has |
| JSON import (our format) | yes | yes | Works. Your friend's parser can emit this |
| The Common Game archives | yes | yes (large national field) | **Asked for permission.** Their site sits behind Cloudflare bot protection, so automated fetching isn't possible or appropriate. |
| ACBL Live for Clubs | PBN download | per club only, often a small field | Import manually as PBN |

**The Common Game** is the best comparison field because the same deals are played across many
clubs. We emailed them proposing the app use **archived sets only** (never live games), with
credit and links on every board, and offered them the code. If they agree, the likely shape is a
`TcgProvider`, or a script that converts their archive files into our format in
`public/games/`. Neither needs changes elsewhere.

**Your friend's parser** gets plugged in by having it emit our JSON format, or by writing a small
importer next to `pbn.ts`.

## Shared game UX (planned)

Status: **design only.** This is the flow for a shared game played by four people at one table,
each on their own device (phone, tablet or computer), once the backend exists.

### Scope for the first version

- **Exactly 4 players, one table.** No spectators, no second table (the backend data model allows
  more tables later).
- **Self-deal only.** Players deal real cards from what their device shows and enter the contract
  and result. In-app bidding and card play ("the app deals") is a much larger project; it is
  **hidden**, not shown greyed out, until it exists.
- Every displayed percentage and score margin is rounded to a whole number. Calculations stay
  exact (see "Rounding" below).

### Screens

**Header (every screen):** app icon, help, and an avatar showing the first letter of your display
name ("?" until you set one). The avatar menu has the light/dark/system theme switch and
**Leave game** (enabled only while you're in a game).

**Home:** splash image. On first use it asks for your **display name**; after that it shows your
name (editable) and two actions: **Start a game** and **Join a game**.

**Start a game:** upload a PBN file or a saved Common Game results page (converted to PBN, see
"Data sources"), and choose the starting board. The app creates the game and shows its **join code**
with a share button. It then goes to the lobby.

**Join a game:** enter the code (or open a shared link). Goes to the lobby.

**Lobby:** shows who has joined, live. When 4 have joined, the creator chooses **partnerships**:
pick a partner, or **Random**. Seats are then assigned by the app (see "Seats"), and each device
shows where to sit physically: "You're North, opposite Bob, with Ann on your left."

**Playing a board:**

- Below the header: game title (from the PBN `Event`, or the TCG page), the board number and the
  position in the session ("Board 7, 3 of 24"), and the **running tally** for your side, e.g.
  "NS +140". Tapping the tally opens a dialog with the board-by-board grid.
- Dealer, vulnerability, and the contract once entered.
- A compass with the players' names, **you at the bottom**, and your hand below it.
- **Enter result** (any player at the table): contract, declarer, tricks, using the existing
  result dialog. Everyone sees it immediately, labelled "entered by Ann", and anyone can correct it.

**After the result:**

- All four hands, the result ("3NT by E, −1"), your side's score ("+50" for NS, "−50" for EW) and
  matchpoints for both sides ("83 / 17").
- Tap the **score** for the score breakdown dialog.
- Tap the **matchpoints** for the field dialog: all field results plus yours, with the most common
  result and the double-dummy par result called out.
- **Analysis** dialog: your result, the most common result, the best result double dummy, and
  expert commentary when the source has it.
- **Next board.** Each device moves on by itself; nobody waits for one person to advance the table.

**End game:** any player can end the game (with a confirmation). Everyone sees a short post-mortem:
a celebration or commiseration depending on the side, then the final tally grid, where each board
opens its final state (hands, result, analysis) in a dialog.

### Decisions made

1. **Seats don't need choosing; partnerships do.** Nobody knows the hands in advance, so which seat
   anyone gets makes no difference, and each pair is compared only with the field in its own
   direction, so which pair is North–South doesn't matter either. The creator picks partnerships
   (or random); the app assigns seats and tells people where to sit.
2. **No owner-only powers after setup.** The creator makes the game and picks partnerships. After
   that all four players are equal: anyone can enter or correct results and anyone can end the
   game. A creator's device dying costs nothing, and ownership never needs transferring.
3. **Disconnected is not "left".** Phones die and lock, laptops sleep; nobody remembers to tap Leave. With push,
   the game knows who is connected and shows a disconnected player's name greyed out.
   - **Same device:** reopening the app or link puts you back in your seat and catches up on missed
     results.
   - **Different device:** join with the code, choose your own greyed-out seat ("I'm Marc, North"),
     and one connected player confirms it, so nobody takes a seat by accident.
   - **Leave game** is a deliberate act (frees your seat); it does not end the game.
4. **Rounding.** The two sides' matchpoints always add to exactly 100 with our formula (every table
   you beat, they lost to, and ties count half for both). For display, round your side and show the
   other side as 100 minus that, so "50.5 / 49.5" never shows as "51 / 50".

### Dev mode: simulated players

- **Fill with test players** (dev builds only): a lobby button that adds Test East, Test South and
  Test West so a game starts immediately and every board can be played from one device. Nothing else
  is needed from the test players, because any player can enter results.
- **Several identities in one browser:** a dev-only URL option `?as=2` gives a tab its own player
  ID, so four tabs side by side behave like four players' devices for testing live sync.

### Not now (future features)

- Solo practice on one device (the original local-only app). **Removed:** the app is for exactly
  4 people playing a shared game.
- In-app bidding and card play ("the app deals").
- Play analysis beyond what the source provides (e.g. computing double dummy in the browser).
- More than one table, spectators.

## Backend: Cloudflare Workers + D1

Status: **stage 1 built** (API, database, push hub, tests, local dev). The frontend doesn't use it
yet; that's stage 2. The backend is required: every game is a shared game that one
person sets up and the other three join with a code. There is no local-only mode.

### Why Cloudflare

- Free at this scale: a busy evening is under 10% of the free plan's 100,000 API requests per day,
  and a few dozen database writes against 100,000 per day.
- The database (D1, which is SQLite) is reachable **only** through this app's Worker, never from the
  internet, and it's separate from any other app's data.
- No server to keep running and no cold starts: the Worker runs per request.
- TypeScript, like the frontend, so the backend reuses the same rules code (`core/`) for validation.

Rejected: Azure Static Web Apps + Functions on the shared Postgres (would expose a database used by
other apps), Supabase (free projects pause after 7 days idle), Firebase (security rules become the
whole security model; NoSQL data model).

### How it fits the existing code

The frontend talks to the backend through `services.ts` only. The session store becomes a
remote store (results read and written through the API, with `subscribe(onChange)` for pushed
updates); the game comes from the event it was created with. The local-only session store and the
bundled-games list are removed along with solo play.

### Concepts

- **Event**: one evening's shared game. Created from a game file (PBN or our JSON) by its host.
  Identified by a **join code** (8 characters from an unambiguous alphabet, e.g. `K7PM-3QXT`).
- **Table**: tables 1..n at the event. Each table plays the boards and records one result per board.
  The first version has exactly one table of 4 (see "Shared game UX").
- **Player**: a device that joined, with a display name, a table and a seat (assigned by the app
  once partnerships are chosen). Identified by a random player ID kept on the device. No accounts.

### Database (D1)

The schema is `backend/migrations/0001_init.sql`. In short:

- **events**: `code` (join code), `title`, `game_json` (the normalised game file), `start_board`,
  `status` (`lobby` → `playing` → `ended`), `created_at`, `expires_at` (30 days).
- **players**: `player_id` (the device's secret key), `slot` (public handle 1–4, in join order),
  `name`, `is_creator`, `seat` (assigned when play starts).
- **results**: one row per board per table: `contract`, `declarer`, `tricks`, `entered_by` (slot),
  `updated_at`.

One result per table per board: whoever at that table enters or corrects it, everyone sees the
same result. Scores, matchpoints and tallies are **not stored**; every device computes them from the
results with `core/`, exactly as before.

### API

All under `/api`, JSON in and out. The request and response types are in
`backend/src/api-types.ts`, which the frontend imports too.

**Identity:** creating or joining returns a secret `playerId`. The device keeps it and sends it as
the `X-Player-Id` header. Other players only ever see a public `slot` (1–4). The creator is simply
the player with `isCreator`; there's no separate host key.

| Method and path | Who | Does |
|---|---|---|
| `POST /api/events` | Anyone | Create a game from a game file: `{ name, game, startBoard }` → `{ code, playerId, slot }`. The creator is slot 1 |
| `GET /api/events/:code` | Anyone with the code | Snapshot: title, status, game, players (with seats and who's connected), results, and `you` if your player ID was sent |
| `POST /api/events/:code/players` | Anyone with the code | Join the lobby: `{ name }` → `{ code, playerId, slot }`. Closed once play starts or with 4 players |
| `DELETE /api/events/:code/players/me` | A player | Leave the lobby (frees the place). If the creator leaves the lobby, the game is cancelled |
| `POST /api/events/:code/partnerships` | Creator | `{ partnerSlot }` or `{ random: true }`; assigns seats (partners opposite, at random) and starts play |
| `PUT /api/events/:code/boards/:board` | A player | Save or correct a result: `{ contract, declarer, tricks }` |
| `GET /api/events/:code/results?since=` | A player | Results changed at or after a timestamp (catching up after a reconnect) |
| `POST /api/events/:code/end` | A player | End the game |
| `DELETE /api/events/:code` | Creator | Delete the game and its results |
| `GET /api/events/:code/live?playerId=` | A player | WebSocket for pushed updates |
| `POST /api/events/:code/test-players` | Dev only | Fill the empty places with test players |

Every write is validated in the Worker with the same `core/` functions the frontend uses (contract
parses, tricks 0–13, board exists in the game). Errors come back as `{ "error": "message" }` with
a 400, 403, 404 or 409 status.

**Pushed messages** (`PushMessage` in `api-types.ts`): `result` (a saved result), `players`
(someone joined, left or got a seat: refetch the snapshot), `status` (playing or ended),
`presence` (which slots are connected), `deleted`.

**Updates:** pushed by the game's Durable Object; see the decision below.

### Decided: push, via a Durable Object notifier (option B)

Options considered:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Polling** | Devices call `GET /results?since=` every 5 s while open, plus immediately after saving and when returning to the app | Simplest: only Workers + D1; easy to debug | Up to ~5 s delay; many no-change requests (still ~10% of the free quota) |
| **B. D1 + Durable Object notifier** | Saves go to D1 as in A; the Worker then tells the event's Durable Object, which pushes the change over WebSockets to every device | Instant updates; additive to A (no rewrite); D1 stays the store of record and is easy to query | One more concept (Durable Objects, WebSockets); reconnect handling |
| **C. Durable Object per event as the store** | Each event's Durable Object keeps its own results in its built-in SQLite and broadcasts changes; no D1 | Instant; simplest infrastructure (no shared database); the join code maps straight to the object | Moving from A or B to C later means rewriting the storage layer |

**Whichever is chosen:**

- The frontend uses `SessionStore.subscribe(onChange)` and never polls directly. Polling or a
  WebSocket is an implementation detail inside the store.
- The `results?since=` catch-up endpoint exists. Phones and laptops sleep and drop sockets, so a push client
  must resync after reconnecting anyway.

**Upgrade paths:** A → B is additive: a small Durable Object class, one notify call in the save
endpoint, a WebSocket route, and one frontend file. A or B → C rewrites the backend's storage
layer (events only live 30 days, so moving data is small). **Choose C now if it's the likely end
state.**

### Security

- Join codes are 8 characters from a 31-symbol alphabet (~40 bits), so they can't be found by
  guessing. (Rate-limiting failed lookups is planned for stage 4.)
- A player's `playerId` is a random UUID, never shown to other players; it's the only way to act as
  that player.
- Only the creator can choose partnerships or delete the game. During play all players are equal.
- Events and their results expire after 30 days (expired games are treated as not found; the
  scheduled clean-up is stage 4).
- Data stored: display names chosen by players, and bridge results. No emails, no accounts.
- The dev-only test-players endpoint is off unless `ALLOW_TEST_PLAYERS` is `true` (only
  `npm run dev` turns it on).
- Same origin in production (the Worker will serve the frontend and the API), so no CORS.

### Repo layout

```
bridge/
├── frontend/                 the frontend; `npm run dev` here starts the frontend and backend together
├── backend/                  the backend: the Worker
│   ├── src/index.ts          routes (Hono)
│   ├── src/api-types.ts      request/response/push types, shared with the frontend
│   ├── src/db.ts             all SQL
│   ├── src/hub.ts            EventHub Durable Object: WebSockets, presence, push
│   ├── src/seats.ts          seat assignment from partnerships
│   ├── src/ids.ts            join codes and player IDs
│   ├── migrations/           D1 schema migrations (0001_init.sql, ...)
│   ├── test/                 API tests, run inside the Workers runtime
│   └── wrangler.jsonc        Worker config: D1 and Durable Object bindings
```

The backend imports `frontend/src/core` (scoring rules) and `frontend/src/providers/gameFile.ts`
(game file validation) directly. If that cross-folder import gets awkward, move them to a
top-level `shared/` package.

### Running it locally

Nothing on Cloudflare is needed: Wrangler runs the Worker, its Durable Objects and a local SQLite
copy of D1 on your machine.

```bash
cd backend && npm install
cd ../frontend && npm install
npm run dev     # starts the backend (:8787, with a local database) and the frontend (:5185)
```

`npm run dev` applies any new database migrations first, then starts both, with their output
labelled `[backend]` and `[frontend]`. The frontend's dev server forwards `/api` (including
WebSockets) to the backend, so other devices on your Wi-Fi only need the frontend's address. `npm run dev:frontend` starts the frontend alone.

The local database lives in `backend/.wrangler/` (gitignored); delete that folder to start fresh.
Backend tests: `cd backend && npm test`.

### Deploying

Not set up yet (stage 4 adds serving the built frontend from the Worker). The plan:

```bash
cd backend
npx wrangler login                                  # once
npx wrangler d1 create bridge                       # once; paste the id into wrangler.jsonc
npx wrangler d1 migrations apply bridge --remote    # after each new migration
cd ../frontend && npm run build && cd ../backend
npx wrangler deploy                                 # uploads the Worker and the built frontend
```

It's served at `bridge-replay.<account>.workers.dev`. A custom domain (for example a subdomain of
`navia-apps.com` or a new domain) can be attached later in the Cloudflare dashboard without code
changes.

## Build plan and status

The shared-game version is built in four stages, each reviewed by Marc before the next starts.
**Read this first when picking the work up in a new session.**

### Stage 1: backend running locally (done)

`backend/`: the Worker API, D1 schema, EventHub Durable Object (push), validation via `core/`,
20 API tests, `npm run smoke`. `npm run dev` in `frontend/` starts the backend and frontend
together (each needs its own `npm install`), and the frontend proxies `/api` (including WebSockets)
to the backend on :8787. The frontend's screens don't use the backend yet.

### Stage 2: getting into a game (next)

- **App shell:** header with app icon, help, and the avatar menu (light/dark/system theme switch,
  Leave game). Home asks for a display name on first use (kept on the device), then offers
  Start a game / Join a game.
- **Start a game:** upload a game file and choose the starting board; creates the game via the API
  and shows the join code with a share button.
  - Accept **PBN** (existing importer) and a **saved Common Game results page** (HTML), which is
    converted to PBN first (see "Common Game results page" below), so PBN stays the one import
    format and the converted PBN can be shared.
  - The PBN importer must accept traveller rows that have a score but no contract (TCG pages give
    scores only), and the game file format needs a matching "score-only" field result. Results
    views then show scores and counts, without contracts, for such games.
- **Join a game:** enter the code or open a shared link.
- **Lobby:** live list of players (push), partnerships chosen by the creator (pick a partner or
  Random), then each device shows its seat and where to sit physically.
- **Dev mode:** "Fill with test players" button (calls the dev-only endpoint) and a `?as=2` URL
  option giving a tab its own player identity, so four tabs act as four players' devices.
- **Remove solo mode:** the old local-only screens and storage (`NewSession`, `TallyView` as a page,
  `LocalSessionStore`, `StaticProvider`/`ImportedProvider` and the bundled-games list) go. Deleting
  files needs Marc's permission on the `bridge` folder (the computer blocks deletes by default);
  ask once, or move them into `_to_delete/` for him to remove. Keep the sample game JSON for tests
  and `npm run smoke`, or update `backend/scripts/smoke.mjs` if it moves.
- *Review:* create a game in one tab, join from three others, pick partners, see the seats.

### Stage 3: playing

- Board screen: title, "Board 7, 3 of 24", running tally ("NS +140") opening the tally dialog;
  dealer, vulnerability, contract once entered; compass with names and you at the bottom; your hand.
- Result entry dialog shared by all four players, pushed live, labelled "entered by Ann",
  correctable by anyone.
- After the result: all four hands, result, your side's score, matchpoints for both sides
  ("83 / 17", rounded with the other side shown as 100 minus yours), and dialogs for the score
  breakdown, the field (most common and double-dummy par called out) and analysis (commentary).
- Next board per device. All displayed percentages and margins as whole numbers.
- *Review:* play a whole sample game with test players.

### Stage 4: resilience and finish

- Presence in the UI (disconnected players greyed out), reconnect and catch up via
  `results?since=`, reclaiming a seat from a different device (a connected player approves).
- End game with the post-mortem (celebration or commiseration, then the tally grid with each
  board's final state in a dialog).
- Backend: rate-limit failed code lookups; scheduled clean-up of games past `expires_at` (cron).
- Serve the built app from the Worker (static assets) and the deploy steps under "Deploying";
  Marc runs `wrangler login` and the first deploy himself.
- README and AGENTS.md updates.

### Working notes for a new session

Context from the conversation where stages 1 and the design were done, so a new session starts with
it:

- **How Marc likes to work:** change only what he asks (see the top of AGENTS.md); propose and wait
  for a go-ahead otherwise. Build in stages with his review between them. Prefers practical,
  concrete examples over abstract explanations. He'll often brainstorm on his phone and build at
  his PC.
- **His environment:** Windows, VS Code, Git Bash (README commands are bash). The frontend runs
  on **port 5185** (fixed, `strictPort`) so it doesn't clash with his other apps; the backend on
  8787. The VS Code task that starts both is **"start bridge app"** (Ctrl+Shift+B); **"Start
  frontend"** and **"Start backend"** start one each.
- **Agent tooling limits on his PC:** remote tools can't write into `.vscode/` (it's protected;
  ask him to make changes there, don't work around it), and deleting files is blocked until he
  grants permission for the `bridge` folder.
- **UI rules he set:** MUI 9; colours, sizes and type only via the theme (MUI defaults today, light
  and dark); shared controls in `ui/controls/`; no back buttons, prefer pages and dismissable
  dialogs.
- **Data sources:**
  - The Common Game (TCG) sites sit behind Cloudflare bot protection. Don't scrape or try to get
    around it; Marc saves pages himself and imports them. He emailed TCG (via
    sara@thecommongame.com) asking for archived-set downloads with their blessing (archived sets
    only, never live games); no reply recorded yet.
  - The TCG page's own "Download Board N PBN" links say "download unavailable".
  - Samples: `private/261022HandRecord.pbn` (hand record) and
    `private/tcg-2026-10-22-299ers-results.html` (saved 299er results page for the same set).
- **Hosting decisions:** Cloudflare Workers + D1 + Durable Objects, free tier; start on the free
  `bridge-replay.<account>.workers.dev` address. A custom domain later, possibly a subdomain of
  `navia-apps.com` (Marc buys domains from Cloudflare), though he may prefer a new name.
- **Tooling notes:** npm 10 crashes resolving Vitest 4.1's optional peers, so both packages use
  Vitest 5. Workers tests use `@cloudflare/vitest-plugin` (the renamed
  `@cloudflare/vitest-pool-workers`). Dependency versions are pinned exactly.

### Common Game results page (findings)

From a saved TCG results page for Thursday 22 Oct 2026 (set `CG-2026-1085-1438`, 36 boards). The
page header said "299ers Top 50 Ranking", so that copy was the 299er field; the open field has its
own page.

- **Per board:** `<h2> Board N (10/22/26)</h2>`; dealer in `#board_setup_dealer` ("N Deals");
  vulnerability in `#board_setup_vul` ("None Vul", "N-S Vul", "E-W Vul", "Both Vul"); hands in
  `#board_N_setup_north|east|south|west`, one `<div>` per suit (spades, hearts, diamonds, clubs)
  holding the ranks with `T` for ten.
- **Results distribution:** a table per board with columns *N/S Result*, *# of Pairs*, *PCT*,
  *MP %* (rounded). Gives every N/S score and how many tables got it (board 1: 14 scores over 127
  tables), but **not the contracts**. Later boards have smaller fields (boards 34–36: 1 table).
- **Double dummy:** `#board_N_setup_dda` text, e.g. "NS 2N; NS 3♦; … Optimal Contract +110:
  NS 3♦=". The hand-record PBN has full `DoubleDummyTricks` / `OptimumScore` / `ParContract`.
- **Expert analysis:** only on some boards (1 and 8 in that set), in `#mm_N_…` with the auction
  and a write-up; other boards only link to Bridge Winners.
- **Ignore:** the Top 50 tables (player names, clubs, and email addresses in popovers).
- Verified: all 36 deals and dealers on the page match the hand-record PBN exactly.
- **Hand-record PBN** (`261022HandRecord.pbn`, BridgeComposer): deals, dealer, vulnerability,
  double dummy and par for all boards; `Event`/`Date` tags empty, but comments carry
  `%HRTitleEvent "THU 10/22/2026"` and `%HRTitleSetID "CG-2026-1085-1438"`. No results.
- Sample copies (if present) are in `private/` at the repo root, which is gitignored. Never commit
  TCG data.

## Future work

- Choose which field to compare against (Open or 299er) using `stratum`.
- "Where would you have placed": rank the session total against the original pair standings
  (needs pair-level results from the source).
- Double dummy computed in the browser (DDS via WebAssembly) for sources that don't supply it.
- PWA manifest and offline caching for use without Wi-Fi.
- Export and import of a session (JSON or CSV) to share a tally without a backend.
