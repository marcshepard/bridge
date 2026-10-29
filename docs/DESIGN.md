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
│  providers/  importers               session/                                │
│   ├ gameFile.ts (our JSON)            ├ GameStore → ApiGameStore (/api)      │
│   ├ pbn.ts (PBN)                      ├ ProfileStore → LocalProfileStore     │
│   └ tcgPage.ts (Common Game page)     └ session.ts (play order, tally)       │
│                                                                              │
│  core/  pure bridge rules: scoring · describe · compare (MP%) · imps         │
│         used by session/, ui/ and the backend; imports nothing from them     │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │  /api: HTTP and WebSocket
                                        │
┌─────────────────────── backend/src (Cloudflare Worker) ──────────────────────┐
│                                                                              │
│  index.ts  routes (Hono); checks every write with core/ and gameFile.ts      │
│  db.ts     all SQL ──► D1 (SQLite): events, players, results, seat requests  │
│  hub.ts    EventHub Durable Object: WebSockets, presence, push               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three decisions shape this:

- **Providers supply raw data; the app does all the computing.** A provider returns deals and
  each board's field results (contract, declarer, tricks, how many tables). It never supplies
  percentages. A source's own percentages are usually per club or per section, while ours are
  computed the same way for every source. It also keeps providers trivial to write.
- **Every source converts into one normalised game format** (below). The PBN importer, the
  Common Game page importer and the sample game all produce it, and the rest of the app knows
  nothing else.
- **All data access is async and behind two interfaces** (`GameStore`, `ProfileStore`), wired in
  one file (`services.ts`). Screens never know whether data comes from the backend or the browser
  (see [Backend](#backend-cloudflare-workers--d1)).

The frontend is static files. In production the backend's Worker serves them alongside the API
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
| Synthetic sample (`scripts/make_sample_game.py`) | random | **simulated** | Bundled, for development and tests (24 boards, small fields) |
| Synthetic demo (`make_sample_game.py --demo`) | random | **simulated** | Built into the backend for **Start demo game**: 36 boards, a few hundred made-up tables per board (far fewer on the last six), double dummy, made-up commentary on boards 9 and 16 |
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

## Shared game UX

The flow for a shared game played by four people at one table, each on their own device (phone,
tablet or computer).

### Scope for the first version

- **Exactly 4 players, one table.** No spectators, no second table (the backend data model allows
  more tables later).
- **Self-deal only.** Players deal real cards from what their device shows and enter the contract
  and result. In-app bidding and card play ("the app deals") is a much larger project; it is
  **hidden**, not shown greyed out, until it exists.
- Your matchpoint % and nets (a board's, the tally's) are shown to one decimal, left off when it's
  zero: 96.3%, 62%, +92.6. A net comes from the % as shown, so "96.3 − 3.7" always nets +92.6, and
  the tally adds up the nets as shown. Every other percentage (the field list's other rows) is a
  whole number. A share of the field's tables is whole too, but never shows 0% or 100% unless it's
  none or all of them ("<1%", ">99%"). Calculations stay exact (see "Rounding" below).

### Screens

**Header (every screen):** app icon, help, and an avatar showing the first letter of your display
name ("?" until you set one). The avatar menu has the light/dark/system theme switch and
**Leave game** (enabled only while you're in a game).

**Home:** splash image. On first use it asks for your **display name**; after that it shows your
name (editable) and two actions: **Start a game** and **Join a game**.

**Start a game:** upload a PBN file or a saved Common Game results page (see "Data sources"), and choose the starting board. The app creates the game and shows its **join code**
with a share button. It then goes to the lobby.

**Join a game:** enter the code (or open a shared link). Goes to the lobby.

**Lobby:** shows who has joined, live. When 4 have joined, the creator chooses **partnerships**:
pick a partner, or **Random**. Seats are then assigned by the app (see "Seats"), and each device
shows where to sit physically: "You're North, opposite Bob, with Ann on your left."

**Playing a board:**

- Below the header: the **join code** (to read out to someone rejoining) and the **running tally**
  for your side, e.g. "NS +140". Tapping the tally opens a dialog with the board-by-board grid.
- A compass with the players' names, **you at the bottom**, and Dealer / Vulnerable chips under
  the names (no separate dealer and vulnerability sentence). A player who isn't connected is
  greyed out with a small no-signal icon; tap it for "Away".
- The **board number** in the middle of the compass counts from 1 in the order you play (a game
  started at original board 9 shows 1 there). Tap it for board details: the game's title, the
  original board number "of" the game's boards, and how many field results it's scored against.
- **Contract** row: "Contract: Tap to enter" until the bidding is over, then "Contract: 4♠ by West".
  Tapping it opens the contract dialog (any player); everyone sees it at once.
- **Your hand (11 HCP)**: by default a fan of overlapping playing cards, rank over suit in each
  corner, sorted by suit (trumps first once there's a contract, colours alternating), sized from
  the screen's width. **Large** switches to big suit rows for reading at arm's length.
- **Enter the result** (any player, once the play is over): the tricks. Everyone sees it
  immediately. The entry dialog says "Last saved by: Ann" once anything is saved. A correction by
  someone else shows a notice on every other device ("Ann corrected board 3: now …", with **Show
  board**), since it may be a board they've moved on from and it changes the tally.

**After the result:**

- Two lines above the compass: "2♣× by N, made +180 N/S" and "83% matchpoints, net +66". Tap the
  result to correct it, the score for the score breakdown dialog, and the matchpoints for the field
  dialog (all field results plus yours, with the most common result and the par result called out).
- The compass fills in with **all four hands**, each in its seat under the name.
- **Analysis** (only when the board has expert commentary): your result, the most common result,
  the best result double dummy, and the commentary.
- **Next board.** Each device moves on by itself; nobody waits for one person to advance the table.

**Playing the cards on devices (being tried out):** instead of real cards, a board's cards can be
played on the devices. For now the creator turns it on board by board (**Play**, beside **Enter
the result**, once the contract is in); one board at a time, and every device jumps to it.

- The board screen becomes the play table: the join code and tally on top, then a status strip
  (contract, tricks for each side, whose turn it is or why a card can't go), the partner's edge on
  top, left and right opponents beside the trick, and your hand at the bottom. Opponents show only
  their name and card count.
- **Dummy** goes down after the opening lead. Declarer's dummy is always partner, so it's opposite
  only when you're declarer: a short fan you tap to play from. On your left or right (you're
  defending) it's a read-only suit-per-row list, never rotated. Declarer plays dummy's cards;
  dummy's player only watches, with their own cards at the bottom.
- **Tap to pick, tap again to play.** A picked card lifts without coming to the front, so a tap
  meant for a neighbour can't play it. Unplayable cards are greyed out and say why when tapped. When
  only one card is legal it's picked already: one tap plays it. No undo (a card shown to partner
  can't be taken back).
- **The trick:** a fixed-size compass in the middle. A finished trick shows face up for 1.5
  seconds, then lies face down; anyone can tap it to see it again until the next lead (and after
  the last trick).
- **Claims:** a player (not dummy) claims how many of the tricks left their side will take. Their
  hand is shown to everyone and play stops. The claimer's opponents answer, but never dummy: when a
  defender claims, declarer answers alone. One refusal ends the claim and play goes on; the
  claimer can take it back until it's accepted.
- **The end:** after the last card or an accepted claim, the status strip shows the outcome
  ("Game down 1: 9 tricks") and anyone taps **Enter the result**, which saves it like any result.
  Until then the board stays in play on the devices.
- **Stop playing** (creator) throws away the cards played on the board.

**End game:** any player can end the game (with a confirmation). A post-mortem after it is in the
backlog.

### Decisions made

1. **Seats don't need choosing; partnerships do.** Nobody knows the hands in advance, so which seat
   anyone gets makes no difference, and each pair is compared only with the field in its own
   direction, so which pair is North–South doesn't matter either. The creator picks partnerships
   (or random); the app assigns seats and tells people where to sit.
2. **No owner-only powers after setup.** The creator makes the game and picks partnerships. After
   that all four players are equal: anyone can enter or correct results and anyone can end the
   game. (While card play on devices is being tried out, only the creator starts and stops it.) A creator's device dying costs nothing, and ownership never needs transferring.
3. **Disconnected is not "left".** Phones die and lock, laptops sleep; nobody remembers to tap Leave. With push,
   the game knows who is connected and shows a disconnected player's name greyed out, with a no-signal icon.
   - **Same device:** reopening the app or link puts you back in your seat and catches up on missed
     results.
   - **Different device, or a new player:** join with the code; the game is full, so you pick
     whose seat you're taking (your own, if you're changing devices) and tap **Join as
     replacement**. Everyone connected gets Allow / Deny, the first answer wins, and everyone is
     told the outcome ("Dana has replaced Joe", "Marc has moved to another device"). Allowed: the
     new device's key and name take the seat and its results, the old key stops working, and the
     old device is sent Home. Requests lapse after 10 minutes; at most 5 wait per game.
   - **Leave game** during play only leaves on that device: the seat stays yours, and joining
     again with the code goes straight back to it. It does not end the game.
4. **Rounding.** The two sides' matchpoints always add to exactly 100 with our formula (every table
   you beat, they lost to, and ties count half for both). For display, round your side and show the
   other side as 100 minus that, so "50.5 / 49.5" never shows as "51 / 50".

### Demo games

**Start demo game** on Home lets someone try the app alone in the live app: `POST
/api/events/demo` creates a game from the synthetic demo game built into the backend
(`backend/src/demo/demo-game.json`), starting at board 9 (to show a game needn't start at 1), and
fills the other three places with Bot 2, Bot 3 and Bot 4. The player lands in the lobby to pick
partners. Bots are allowed here even though test players are off in the live app, because the
game file is ours. No Common Game data is used (see AGENTS.md); bots still show as away.

Bots are marked (`players.is_bot`, `isBot` in the snapshot; migration 0006). When a board's cards
are played on the devices, the creator's device plays the bots' cards after a two-second pause,
using the robot rules in `core/bot.ts` (second hand low, third hand high, win cheaply fourth hand,
ruff low, discard from the shortest suit, standard opening leads, else random); the backend lets
the creator play a bot's turn, and a bot declarer's dummy. Bots accept every claim straight away.
The same goes for dev test players. A person who takes over a bot's seat stops being a bot.

### Dev mode: simulated players

- **Fill with test players** (dev builds only): a lobby button that adds Bot 2, Bot 3 and Bot 4 (the
  number is the order they joined) so a game starts immediately and every board can be played from one device. Nothing else
  is needed from the test players, because any player can enter results.
- **Several identities in one browser:** a dev-only URL option `?as=2` gives a tab its own player
  ID, so four tabs side by side behave like four players' devices for testing live sync.

### Not now

Solo practice on one device (the original local-only app) was **removed**: the app is for exactly
4 people playing a shared game. In-app bidding, and other ideas, are in
[BACKLOG.md](BACKLOG.md).

## Backend: Cloudflare Workers + D1

The backend is required: every game is a shared game that one person sets up and the other three
join with a code. There is no local-only mode.

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
  `name`, `is_creator`, `is_bot`, `seat` (assigned when play starts).
- **results**: one row per board per table: `contract`, `declarer`, `tricks`, `entered_by` (slot),
  `updated_at`, `on_devices` (the cards are played on the devices; with `tricks` NULL the board is
  being played right now).
- **plays** (`0004_card_play.sql`): each card played on the devices, in order: `board`, `seq`
  (1–52), `seat` (dummy's when declarer plays it), `card` ("SA").
- **claims** (`0005_claims.sql`): at most one per board: `seat`, `tricks` (of those left, for the
  claimer's side), `accepted_by` (seats, e.g. "EW"). Refused or taken back: deleted.

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
| `GET /api/events/:code` | Anyone with the code | Snapshot: title, status, game, players (with seats and who's connected), results, the cards and claim on a board being played on the devices, and `you` if your player ID was sent |
| `POST /api/events/:code/players` | Anyone with the code | Join the lobby: `{ name }` → `{ code, playerId, slot }`. Closed once play starts or with 4 players |
| `DELETE /api/events/:code/players/me` | A player | Leave the lobby (frees the place). If the creator leaves the lobby, the game is cancelled |
| `POST /api/events/:code/partnerships` | Creator | `{ partnerSlot }` or `{ random: true }`; assigns seats (partners opposite, at random) and starts play |
| `PUT /api/events/:code/boards/:board` | A player | Save or correct a result: `{ contract, declarer, tricks }`. `tricks: null` saves just the contract (bidding over, play not); passed out is always complete |
| `POST /api/events/:code/requests` | Anyone with the code | Full or started game only: ask to take over a seat, `{ name, slot }` → `{ requestId, playerId, anyoneConnected }` |
| `GET /api/events/:code/requests/:id` | The requester (its `playerId`) | `{ status }`: pending, allowed, denied, cancelled or expired (10 minutes) |
| `DELETE /api/events/:code/requests/:id` | The requester | Withdraw the request |
| `POST /api/events/:code/requests/:id/answer` | A player | `{ allow }`. First answer wins. Allowing gives the seat (and its results) the requester's key and name; the old key stops working and the old device is disconnected |
| `POST /api/events/:code/boards/:board/play` | Creator | Start playing the board's cards on the devices (its contract must be in; one board at a time) |
| `DELETE /api/events/:code/boards/:board/play` | Creator | Stop: the cards played and any claim are thrown away |
| `POST /api/events/:code/boards/:board/cards` | The player whose turn it is (declarer for dummy) | `{ seq, card }`: play a card. `seq` is its number on the board, so a double tap can't play twice. Checked with `core/play.ts` |
| `POST /api/events/:code/boards/:board/claim` | A player, not dummy | `{ tricks }`: claim that many of the tricks left. Play stops until it's answered |
| `POST /api/events/:code/boards/:board/claim/answer` | The claimer's opponents, not dummy | `{ accept }`. A refusal ends the claim |
| `DELETE /api/events/:code/boards/:board/claim` | The claimer | Take the claim back (until it's accepted) |
| `GET /api/events/:code/results?since=` | A player | Results changed at or after a timestamp (catching up after a reconnect) |
| `POST /api/events/:code/end` | A player | End the game |
| `DELETE /api/events/:code` | Creator | Delete the game and its results |
| `POST /api/events/:code/live-ticket` | A player | `{ ticket }`: a single-use pass to open the WebSocket, valid for a minute. Browsers can't send headers on a WebSocket, and the secret `playerId` mustn't appear in an address (addresses end up in logs) |
| `GET /api/events/:code/live?ticket=` | A player (with a pass) | WebSocket for pushed updates |
| `POST /api/events/:code/test-players` | Dev only | Fill the empty places with test players |
| `POST /api/events/demo` | Anyone | `{ name }` → a demo game (the built-in made-up game from board 9) with three bots; you're the creator |

Every write is validated in the Worker with the same `core/` functions the frontend uses (contract
parses, tricks 0–13, board exists in the game). Errors come back as `{ "error": "message" }` with
a 400, 403, 404 or 409 status.

**Pushed messages** (`PushMessage` in `api-types.ts`): `result` (a saved result), `players`
(someone joined, left or got a seat: refetch the snapshot), `status` (playing or ended),
`presence` (which slots are connected), `play` (a card played on a device), `claim` (a claim
made or answered; null when refused or taken back), `request` (someone asks for a seat), `requestClosed` (it
was allowed, denied or withdrawn; the table is told "Dana has replaced Joe", "Marc has moved to
another device" or "Ann didn't let Dana replace Joe"), `deleted`.

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
  guessing. (Rate-limiting failed lookups is in the backlog.)
- A player's `playerId` is a random UUID, never shown to other players; it's the only way to act as
  that player.
- Only the creator can choose partnerships or delete the game. During play all players are equal.
- Events and their results expire 30 days after creation: expired games are treated as not found
  at once, and a nightly clean-up deletes them (03:00 UTC, logged).
- Data stored: display names chosen by players, and bridge results. No emails, no accounts.
- The dev-only test-players endpoint is off unless `ALLOW_TEST_PLAYERS` is `true` (only
  `npm run dev` turns it on).
- Same origin in production (the Worker serves the frontend and the API), so no CORS.

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

One Worker serves everything: the API under `/api`, and the built frontend (`frontend/dist`) for
every other path (`assets` in `backend/wrangler.jsonc`). Free Cloudflare plan: Workers, D1 and
SQLite-backed Durable Objects are all included.

The steps (releasing an update, fixing a failed deploy, logs, and first-time setup) are under
"Deploying" in the [README](../README.md). `npm run deploy` builds the frontend, applies new
database migrations to the live database, then uploads the Worker and the frontend. Games in
progress carry on: the database isn't touched except by new migrations. The nightly clean-up's
schedule (`triggers` in `wrangler.jsonc`) is set by the same deploy.

In the live app, dev mode is off: no "Fill with test players" button, `?as=` is ignored, and the
backend refuses the test-players endpoint (`ALLOW_TEST_PLAYERS` is "false").

A custom domain (for example a subdomain of `navia-apps.com`, or a new domain) can be attached later
in the Cloudflare dashboard without code changes.

## Ideas and parked work

This file describes the existing app. Ideas that may or may not be built, and what was looked at
and parked, are in [BACKLOG.md](BACKLOG.md).

## Working notes for a new session

Context carried over from earlier sessions, so a new session starts with it:

- **How Marc likes to work:** change only what he asks (see the top of AGENTS.md); propose and wait
  for a go-ahead otherwise. Agree the UX first, and Marc tests each change by hand before it's
  committed. Prefers practical,
  concrete examples over abstract explanations. He'll often brainstorm on his phone and build at
  his PC.
- **His environment:** Windows, VS Code, Git Bash (README commands are bash). The frontend runs
  on **port 5185** (fixed, `strictPort`) so it doesn't clash with his other apps; the backend on
  8787. The VS Code task that starts both is **"start bridge app"** (Ctrl+Shift+B); **"Start
  frontend"** and **"Start backend"** start one each.
- **Agent tooling limits:** sessions started remotely from his phone couldn't write into
  `.vscode/` or delete files. Sessions in the desktop app on his PC can do both (deletes via
  `git rm`, so they're recoverable).
- **UI rules he set:** MUI 9; colours, sizes and type only via the theme (MUI defaults today, light
  and dark); shared controls in `ui/controls/`; no back buttons, prefer pages and dismissable
  dialogs.
- **Data sources:**
  - The Common Game (TCG) sites sit behind Cloudflare bot protection. Don't scrape or try to get
    around it; Marc saves pages himself and imports them. He emailed TCG (via
    sara@thecommongame.com) asking for archived-set downloads with their blessing (archived sets
    only, never live games); no reply recorded yet.
  - The TCG page's own "Download Board N PBN" links say "download unavailable".
  - Samples in `private/`: `The Common Game Top 50 Page.html` (the regular archive's results page
    for Fri 16 Oct 2026, saved with the in-app steps; the main test page) and
    `261022HandRecord.pbn` (a hand record for a different set, 22 Oct 2026).
- **Hosting decisions:** Cloudflare Workers + D1 + Durable Objects, free tier; start on the free
  `bridge-replay.<account>.workers.dev` address. A custom domain later, possibly a subdomain of
  `navia-apps.com` (Marc buys domains from Cloudflare), though he may prefer a new name.
- **Branches:** work happens on `dev`; `main` is what's deployed. Marc merges, pushes and runs
  `npm run deploy`.
- **Testing several players on one computer:** all incognito windows share one storage area, so
  use different browsers or profiles (Edge, Edge incognito and a phone work); `?as=` is dev only.
- **Unused controls:** `CardList`, `ConfirmButton` and `SeatPicker` in `ui/controls/` are left over
  from solo mode; not yet decided whether to remove them.
- **Tooling notes:** npm 10 crashes resolving Vitest 4.1's optional peers, so both packages use
  Vitest 5. Workers tests use `@cloudflare/vitest-plugin` (the renamed
  `@cloudflare/vitest-pool-workers`). Dependency versions are pinned exactly.

## Common Game results page (findings)

First from a 299er-archive page for Thursday 22 Oct 2026 (since removed), then confirmed on the
regular archive's page for Friday 16 Oct 2026 (36 boards, 938 tables on board 1). The two archives
use the same markup. The 299er page's heading says "299ers Top 50 Ranking" (newer players only);
the regular page's says just "Top 50 Ranking", and includes all players; game titles add no label for it, and "(299er)" for the 299er page. The page names
the game only by its date: no set ID or session name.

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
- Verified (22 Oct page): all 36 deals and dealers matched that set's hand-record PBN exactly.
- **Hand-record PBN** (`261022HandRecord.pbn`, BridgeComposer): deals, dealer, vulnerability,
  double dummy and par for all boards; `Event`/`Date` tags empty, but comments carry
  `%HRTitleEvent "THU 10/22/2026"` and `%HRTitleSetID "CG-2026-1085-1438"`. No results.
- Sample copies (if present) are in `private/` at the repo root, which is gitignored. Never commit
  TCG data.
