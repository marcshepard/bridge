# Backlog

Ideas for the app, and what was looked at and parked. None is promised or scheduled; some may never
be built. How the existing app works is in [DESIGN.md](DESIGN.md), and how it got there is in the
git history.

Work happens on `dev`; `main` is what's deployed. To take an idea on: agree the UX with Marc, build
it, Marc tests it by hand, then commit, and take it out of this file. Feedback from the bridge
group is handled the same way when it arrives.

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

## Make the other hands less visible in the data

Low priority. The screens already show each player only the hands they should see, but every
device gets the whole game file in the snapshot (`GET /events/:code`): all boards, all four hands,
double dummy, par and commentary, readable as plain text with the browser's developer tools. This
is not a security feature: every game replays a deal already published with its results, so
someone set on cheating has easier ways to find the hands. The aim is only that the hands aren't
sitting there in plain sight.

- **Preferred: obfuscate, with few code changes.** Store and send the hands scrambled (ROT13-style
  or base64 of a shuffled encoding) and unscramble them in one place on the frontend, where the game
  is loaded. The screens, `core/` and the API's shape stay as they are.
- **Not planned: hiding them properly.** The backend would trim the snapshot per player and hand
  out cards as each board goes on (its own hand; dummy after the opening lead; a claimer's hand
  during a claim; everything once the board has a result), and every screen that reads
  `board.hands` would cope with hands it doesn't have yet. Much more work than the problem deserves.

## Reviews of earlier boards, for everyone

The bidding and play reviews open from a board's result screen. Only the game's owner can look back
at an earlier board (from the tally, to correct it), so only the owner can review one. Everyone else
sees the board the table is on. The snapshot already keeps every board's auction and cards, so this
is a frontend change: let anyone open an earlier board from the tally to review it (read-only),
without moving the table.

## Play review: judge by the game's scoring

The play review (stage 5 in [BOT.md](BOT.md)) and the bots' card play count a card as best when it
takes the most tricks, so overtricks matter as at matchpoints. At IMPs, making the contract (or
beating it) matters far more than an overtrick. Score each card's tricks by the game's scoring
instead, in both the bots' play and the review.

## Bidding bot: gaps, to take on as feedback comes in

The bots bid SAYC well enough to practise with (stages 1–3 in [BOT.md](BOT.md)). Bidding has no
end of conventions and judgment calls, so these wait for feedback from the people using it rather
than being built in advance. Each fix the usual way: the board, a rule change, and a test built from
that deal; `npm run bidding-report` to check nothing else got worse.

- **On the card, not used yet** (shown as "Not used by the bots yet"): splinters, inverted minors,
  new minor forcing, fourth suit forcing (from the two level).
- **Roman Key Card extras:** answers that show a void, and 5NT asking for kings.
- **Other systems and conventions:** 2/1 game forcing as a second system (the design allows for
  it), Lebensohl, a lead-directing double of an artificial bid, Drury.
- **Judgment:**
  - drop length points once partner shows shortness in the suit (a misfit), unless the suit runs
    by itself;
  - a second 8-card fit (partner raises our second suit and we hold support for theirs) is worth
    about 1 more point;
  - redouble when they double us into game and we have extras;
  - preempts and weak jump overcalls as high as the highest of the cheapest level, length minus
    four, and playing tricks plus 2 or 3 (as over a conventional bid already);
  - with 3NT as 25–27, a gambling-type hand opens a preempt or one of a suit (check it suits).
- **Simulation of hard calls:**
  - use what passes rule out (didn't open, so under 12; didn't bid a major, so no five-card major);
  - each candidate is treated as the last call of the auction; fine for late competitive calls,
    not for constructive ones;
  - a redouble as a candidate.

## To undo

- **Demo board 9 is a test deal** (each hand a 13-card suit), to check the result screen's worst
  case. Put the real deal back with `git checkout` of `backend/src/demo/demo-game.json`'s board 9,
  or regenerate with `python scripts/make_sample_game.py --demo`.

## Ideas, not planned

- "Where would you have placed": rank the session total against the original pair standings
  (needs pair-level results from the source).
- Double dummy computed in the browser (DDS via WebAssembly) for sources that don't supply it.
- More than one table, and spectators.
- **Reviewing the play** on a finished board, trick by trick (the cards are stored; the snapshot
  only sends them for the board being played).
- **Convention cards and alerts,** together (an alert means little without the card behind it):
  each pair fills in a simple convention card, and during online bidding a player can alert a call
  and explain it from the card. Left out of the first version of online bidding.
- **"Not played":** give up on a board partway through, on the devices or with real cards (a dead
  device, a mix-up), without replaying it. The board is scored as not played, the way a director
  gives an average when a board can't be finished (Law 12), rather than thrown away and restarted.
  The owner does it, with a confirmation. (Replaces the old creator-only "Stop playing", which threw
  the cards away so the board could be played again.)
- **A better way to get a player without the app their hands.** Today a player without the app is
  just a name in a seat, and they need a printed hand record (or similar). Something better might
  be a "Show Joe's hand" on the owner's device to hand over, or one device dealing for two seats.
- **An End game button** for the owner (the API has `POST /events/:code/end`; no screen uses it).
- A custom domain (a subdomain of `navia-apps.com`, or a new name), attached in the Cloudflare
  dashboard without code changes.

## Parked

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
