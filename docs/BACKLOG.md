# Backlog

Ideas for the app, and what was looked at and parked. None is promised or scheduled; some may never
be built. How the existing app works is in [DESIGN.md](DESIGN.md), and how it got there is in the
git history.

Work happens on `dev`; `main` is what's deployed. To take an idea on: agree the UX with Marc, build
it, Marc tests it by hand, then commit, and take it out of this file. Feedback from the bridge
group is handled the same way when it arrives.

## Online play (no self-dealing)

In-app bidding and card play for players who aren't at one table: dealing, turns, dummy shown
after the opening lead, following suit, claims, undo, and the score worked out from the play. The
biggest piece of work (several days).

**UX direction (discussed 27 Oct 2026):** phone-first, in portrait, which BBO and Funbridge show is
workable. Bigger screens use the same parts laid out round a table.

- **Hands as suit rows, not fanned cards:** "♠ A Q 10 9 7", one row per suit, each card its own
  tap target of 44px or more (13 overlapping cards on a phone would be about 25px each). Cards you
  can't play (following suit) are greyed out. The same control serves your hand and dummy.
- **Dummy on top**, smaller (you only read it, unless you're declarer), labelled with its seat
  ("Dummy (North, partner)"), so the screen never rotates.
- **The current trick in the middle**, as a small compass like the board screen's, with who led
  and the trick number; tap for the last trick.
- **One status strip:** contract, tricks won by each side, whose turn it is, board and code.
- **Bidding:** the auction in a four-column table, with a bidding box below (1–7 by strain, Pass,
  X, XX).
- **The hard parts aren't the layout:** declarer playing dummy's cards ("Play from dummy"),
  tap-to-pick then tap-to-play against misplays, claims (opponents agree or refuse), undo for a
  misclick, a phone asleep mid-hand (play waits; "(away)" shows why), and all four hands at the end.
- **First step:** a clickable prototype screen with sample data (no backend or rules), tried on a
  phone and a tablet before the game logic is built.

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

## End of game

A post-mortem when someone ends the game: a celebration or commiseration depending on the side,
then the final tally grid, where each board opens its final state (hands, result, analysis).
Depending on feedback.

## Ideas, not planned

- "Where would you have placed": rank the session total against the original pair standings
  (needs pair-level results from the source).
- Double dummy computed in the browser (DDS via WebAssembly) for sources that don't supply it.
- More than one table, and spectators.
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
