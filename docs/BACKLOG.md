# Backlog

Ideas for the app, and what was looked at and parked. None is promised or scheduled; some may never
be built. How the existing app works is in [DESIGN.md](DESIGN.md), and how it got there is in the
git history.

Work happens on `dev`; `main` is what's deployed. To take an idea on: agree the UX with Marc, build
it, Marc tests it by hand, then commit, and take it out of this file. Feedback from the bridge
group is handled the same way when it arrives.

## Online play: what's left

Card play on the devices is in, being tried out (see "Playing the cards on devices" in
DESIGN.md): the creator starts it board by board, with claims and no undo. Still to do:

- **Bidding:** the auction in a four-column table, with a bidding box below (1–7 by strain, Pass,
  X, XX), ending where play starts today (the contract entered).
- **Choosing how cards are played:** per game rather than the creator tapping Play on each board,
  without putting it in settings (decided 28 Oct 2026: it's per game, and per board while trying it).
- **Telling you it's your turn** when your phone is face down or in another app: "Your turn" in
  the browser tab's title. Real notifications are a much bigger job. (Not vibration: Marc doesn't
  want it.)
- **Height on a phone:** check the play table fits held upright with dummy on top; if not, a slimmer
  header during play.
- **Reviewing the play** on a finished board, trick by trick (the cards are stored; the snapshot
  only sends them for the board being played).

## Rate limiting

Backend only. Limits per device address, to stop code guessing and runaway clients (the free plan
caps the Worker at 100,000 requests a day):

- Joining or asking for a seat with a code (wrong codes especially): about 20 a minute.
- Creating games: about 5 a minute.
- Use Workers' rate limiting binding (`ratelimits` in `wrangler.jsonc`; generally available since
  September 2025, a loose limit rather than an exact count). It keeps its own counts, so no schema
  change. Check first that it's on the free plan; if not, fall back to a counter table in D1 (that
  needs a migration).
- The dashboard's WAF rate limiting rules work per domain you own, so they don't cover the
  `workers.dev` address; they'd be an option after moving to a custom domain.
- Seat requests already have their own limit (5 waiting per game).

## Hide the other hands from each device

Every device gets the whole game file in the snapshot (`GET /events/:code`): all boards, all four
hands, double dummy, par and commentary. Anyone can read the other hands with the browser's
developer tools. Fine among friends, but it needs fixing before play on devices goes beyond them.
Not urgent: every game is a replay of a deal already published with its results, so there's
nothing secret to protect beyond the fairness of one game, and rate limiting comes first.

- **What a device needs:** its own hand; dummy after the opening lead; a claimer's hand during a
  claim; all four hands (and double dummy, par, commentary) once the board has a result.
- **The full fix:** the backend trims the snapshot per player and hands out cards as each board
  goes on. Every screen that reads `board.hands` then copes with hands it doesn't have yet. Decide
  whether games played with real cards keep today's "everything up front".
- **A cheap middle step:** leave the hands out of the snapshot and fetch them on a separate request
  when a board starts. That stops casual peeking, not a determined player.

## Ideas, not planned

- "Where would you have placed": rank the session total against the original pair standings
  (needs pair-level results from the source).
- Double dummy computed in the browser (DDS via WebAssembly) for sources that don't supply it.
- More than one table, and spectators.
- **"Not played":** give up on a board partway through, on the devices or with real cards (a dead
  device, a mix-up), without replaying it. The board is scored as not played, the way a director
  gives an average when a board can't be finished (Law 12), rather than thrown away and restarted.
  Anyone can do it, with a confirmation. (Replaces the old creator-only "Stop playing", which threw
  the cards away so the board could be played again.)
- A custom domain (a subdomain of `navia-apps.com`, or a new name), attached in the Cloudflare
  dashboard without code changes.

## Parked

**Other ways to start a game from a phone.** Decided instead: prepare on a computer, play on a
phone (start on the computer, then join from the phone as a replacement for your own seat; Help
says how). Parked unless that proves not enough:

- **Email or cloud:** save the page on a computer, open it from the phone's file picker (works
  today; would need a line in Help).
- **Saving on a phone:** Chrome on Android saves pages as `.mhtml`, which the importer could read;
  iPhone Safari saves PDF or `.webarchive` (would need real samples).
- Not: fetching pages from the Common Game site on the server (bot protection, permission), or
  copy and paste (loses the structure).
- The real fix is still the Common Game agreeing to archived downloads (asked; no reply yet).

**Other sources of games.** Looked for sources with fields big enough to make the comparison
interesting, the way the Common Game's are (hundreds of tables per board). None found:

- *ContractBridge/pbn-files on GitHub* (mostly 1996–97 championships, the same files as Tis
  Veugen's PBN homepage): its files import as they are, but they have 1–14 tables per board, and
  no licence. Ruled out.
- *ACBL Live for Clubs:* a club game's "hand record" PBN is deals only, and a club field is about
  10 tables. *ACBL tournament results* turn away automated access, like the Common Game.
- PBN files any player brings still work (the importer reads deals, `ScoreTable` travellers and
  one-result-per-table files). If a large-field source turns up: collect real samples of what it
  writes, add a fixture-based test for each (made-up data in the same layout, cut down to a few
  boards), and fix the importer where needed. Things that vary by the program that wrote a file:

| Written by | Typical contents | Watch for |
|---|---|---|
| BridgeComposer (TCG hand records) | hands, double dummy, par | already supported |
| ACBL Live for Clubs downloads | hands, plus results from the club's scorer | `ScoreTable` layout, partial club fields |
| Bridgemate / BCScorer / ACBLscore exports | per-table results or a `ScoreTable` | a board repeated per table; `=`, `+1`, `-2` results |
| EBU / Scorebridge / Pairs Scorer (UK) | `ScoreTable` with extra columns | column names, MP/percentage columns |
| Hand generators (Dealer, BigDeal, Goldsmith) | deals only | no `Event`/`Date`; `#` repeats |
| PBN 2.1 standard examples | edge cases | escaped quotes, multi-line commentary |

**Dropped:** a "Continue on another device" QR code (joining as a replacement for your own seat
already does it; the QR code would only skip the approval), and freeing your seat on "Leave game"
during play (leaving keeps the seat yours, and anyone can take it over by replacement).
