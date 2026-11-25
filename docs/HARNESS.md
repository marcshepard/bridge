# Bot evaluation harness: plan

A plan for measuring the bots' bidding and play, so that every change to them can be judged by
numbers rather than by a few hand-picked boards. Stages 0 and 1 are built in their minimal form
(November 2026; see "The harness's interface"); the rest isn't yet. When a stage is done,
its section here gets a short "Done" note and the details move into [BOT.md](BOT.md).

## Why

The bots branch (merged November 2026) changed about 20 bidding rules. Each was judged on the
example that prompted it. The headline result ("+80 IMPs on 1,200 deals") can't be reproduced
from the repo, rested on 25 boards that scored differently, and one existing test's expected call
changed as a side effect (5♥ became 4NT). A harness answers three questions quickly and
repeatably:

1. Did this change help or hurt, overall?
2. Did it break anything I wasn't looking at?
3. Where are the bots losing the most?

## Goals

- **Advanced first, then towards expert.** Bring each area (uncontested bidding, bidding with
  interference, declarer play, defence) to advanced standard with the current design, then take on
  the hard problems that separate advanced from expert in a final stage. An honest list of what
  the bots still do worse than an expert, all the way (BOT.md, "Advanced, and approaching expert
  over time").
- **Fast.** A bidding run in seconds, a play run in minutes, so changes can be tried quickly.
- **Objective.** Every number comes from scoring on solved deals, the same way every time.
- **Single dummy where it matters.** Judge players on what they could know (their own hand, the
  auction, the cards seen), not on the one layout that happened.
- **Clear about strengths and gaps.** Results broken down by situation, so the report doubles as a
  "what the bots do well and badly" list.

## Principles

- **Frozen, seeded deal sets.** The same deals every run. Sets are made from a generator version
  and a seed, so they can be rebuilt exactly.
- **Paired comparison.** A change is judged on the same deals as the baseline, board by board.
  Most boards don't change; the ones that do carry the signal.
- **Uncertainty shown.** Every comparison reports a 95% confidence interval (bootstrap over boards)
  and a plain verdict: better, worse, or no clear difference.
- **Solve once, score often.** Anything that doesn't depend on the bot's version (the solved
  layouts) is cached once per deal set, so a run only does the bot's own work.
- **Held-out deals.** Tuning happens on a working set; a separate held-out set is checked now and
  then to catch over-tuning to the working set.
- **Fair bots.** The bots only use what their seat knows. A test checks it: change the hidden
  cards in a way that leaves a seat's information the same, and its decision must not change.
- **Start small.** Build the least that answers the three questions above, use it, and grow it only
  when a question needs more. If the minimal version doesn't turn up things worth fixing, stop.

## Advanced and expert

Bridge players' own scale runs roughly beginner, intermediate, club player, **advanced**, expert,
world class. The plan has two phases:

- **Phase 1, to advanced (stages 0–5).** For each area: build its part of the harness, record a
  baseline, and improve the current design (rules for bidding, sampling with double dummy for
  play) until it reaches advanced standard. Everything in phase 1 fits the current design and the
  in-app time budget.
- **Phase 2, towards expert (stage 6).** The problems that need a different method, much more
  computing time, or both. Taken on only once phase 1 is done, one problem at a time, each measured
  on the same harness.

**What "advanced" means here.** For each area, all of these:
- The harness's main measure has stopped improving much from rule fixes and tuning: the last few
  changes each gained little.
- No situation tag loses badly compared with the overall average (about twice the average, as a
  first guess).
- Marc, reviewing the costliest boards, finds mostly system limits, bad luck or stage 6 problems,
  and few plain errors.
- The area's "can't do yet" list names only stage 6 problems.

The numbers are set after each area's first baseline, when we know what's realistic.

## Stages

| Stage | What it measures | Opponents | Scored by | Speed of a run |
|---|---|---|---|---|
| 0. Foundation | (the shared parts) | | | |
| 1. Non-competitive bidding | Does the partnership reach the right contract? | Silent | The ideal contract for the two hands, over sampled layouts | Seconds |
| 2. Competitive bidding | Who wins the auction when both sides bid? | Baseline bots | A teams match against the baseline, and par | About a minute |
| 3. Opening lead | Is the lead the best one from the leader's seat? | | Tricks after each lead, solved on the real deal | About a minute |
| 4. Declarer play | Does declarer take the tricks available? | Baseline defenders | Tricks and score against double dummy, and against the baseline | Minutes |
| 5. Defence | Do the defenders take theirs? | Baseline declarer | The same, from the defenders' side | Minutes |
| 6. Towards expert | The hard problems, one at a time | As for the area | The same measures as the area's stage | Varies |

Stages 1–5 each end at advanced standard (above), with a frozen "can and can't" list.

**One feedback loop.** Stages 1 and 2 score with double dummy, which flatters thin contracts that
depend on finding a guess or the right lead. Once the bots play well enough (after stage 4), score
a sample of the bidding sets by playing the boards out with the bots, and check which bidding
decisions flip.

### Stage 0: foundation

- **Deal sets.** A generator that deals random boards with a seed, rotates dealer and
  vulnerability, and applies a filter for the stage (for stage 1: neither opponent has a clear
  bid). Targeted generators later, for rare situations (slams, 2NT openings, misfits), so each has
  enough deals.
- **Solved-layout cache.** Built once per set, stored on disk, reused by every run.
- **Runner.** Runs the current code over a set and writes a run file: per board, the auction with
  each call's reason, the contract and declarer, the score, and situation tags.
- **Comparison.** Any run against any other, board by board, with the confidence interval.
- **Report.** A summary in the terminal, plus an HTML page for browsing boards.
- **Two versions at once** (needed from stage 2): build the baseline from a git ref into a separate
  bundle, the way `bidding-report` is bundled, and load both.

### Stage 1: non-competitive bidding

**Deals.** North–South hands from random deals where neither East nor West has a clear bid. The
filter is fixed and doesn't use the bot's bidder, so a bidding change never changes the test.
The filter (`hasClearBid` in `src/bench/deals.ts`, version 1) counts a hand as having a clear bid
when it has 12+ HCP or opens by the rule of 20, a 7-card suit with 5+ HCP, a 6-card suit with 8+
HCP, two 5-card suits with 8+ HCP, or a 5-card suit with 10+ HCP. East–West pass throughout.
Dealer and vulnerability follow the usual board rotation, so North–South open in every seat.

**The ideal contract.** For each deal:

1. Keep North–South's hands. Deal East–West's 26 cards at random about 50 times, keeping only
   layouts that pass the same filter.
2. Solve each layout: tricks for each strain with North or South declaring (10 numbers). The
   level doesn't change the trick count, only the score, so these 10 numbers price every North–South
   contract at every level, plus passing it out.
3. The ideal is the contract and declarer with the best average score over the layouts.

**Scoring the bot.** The bot bids the real deal with East–West silent. On each layout, the IMP
difference between the ideal contract and the bot's contract; averaged over the layouts, that's the
bot's expected loss on the board. Per layout matters: IMPs aren't linear, so a few big swings must
count as big swings.

Worked example (made-up numbers, neither side vulnerable): a 9-card club fit and a weak heart stop.

| Contract | Average score | Expected loss |
|---|---|---|
| **2♣ by South** | **+116** | (the ideal; 1♣ scores the same here) |
| 3♣ by South | +102 | 0.4 IMP |
| 1NT by North | +77 | 1.1 IMPs |
| 3NT by North | −45 | 4.0 IMPs |
| 5♣ by South | −85 | 5.1 IMPs |

(The losses depend on which trick counts fall on the same layout; these pair the best club
layouts with the best notrump ones. A test in `src/bench/bench.test.ts` checks these numbers.)

**What's cached.** Per deal: 50 layouts × 10 trick counts. About 500 small numbers per deal; a
1,000-deal set is well under a megabyte. Building it: one full solve takes about 155 ms on one
thread in Node; with 30 worker threads, 1,000 deals × 50 layouts takes about 12 minutes, once.

**Caveats.**
- Double dummy within each layout: declarer always guesses right and the defence always finds the
  best lead. Averaging over layouts gets a 50% finesse right, but guesses and leads are flattered.
- No doubles: a reckless slam goes down undoubled. Slightly kind to overbidding.
- The loss never reaches zero. The ideal assumes both hands are known, which no partnership has.
  Experts lose against it too, so it's a measure to track, not a target to hit.
- Near-ties: missing an ideal by a tenth of an IMP is nearly free. That's why the measure is
  expected loss, not "% of boards at the ideal".
- The filter favours strong North–South hands. With East and West both too weak to bid, North–South
  hold more than their share of the points, so slams are about a fifth of the quick set, far more
  than at the table. The overall average leans heavily on slam boards; read it alongside the
  breakdown by the ideal's level.
- Double dummy flatters slams most. A slam or grand slam that needs a guess or a finesse makes on
  every layout where it works and costs nothing for the guess, and the solver always finds the line.
  So some "ideal" slams, grand slams especially, are ones an expert wouldn't bid. Before acting on a
  missed slam, look at the board with `show` and judge it as a bridge player.

**Sizes.** A quick set of about 1,000 deals for every run; a full set of about 5,000 to confirm a
subtle change; a held-out set of about 2,000. Roughly, a clear fix (1 IMP better on each board it
changes) shows up on 1,000 deals; a subtle one (0.5 IMP) needs about 5,000.

**Exit criteria:** advanced standard, as defined above, with the numbers set after the first
baseline.

**First baseline** (set `quick`, 1,000 deals, 24 November 2026, bidding code as at commit
`6232024`):

| Measure | Value |
|---|---|
| Average loss against the ideal | 3.23 IMPs per board (95% interval 3.00 to 3.47) |
| At the ideal contract exactly | 18.3% of boards |
| Losing 3 or more IMPs | 40.1% of boards |
| Calls with no rule | 1 |

| Ideal contract's level | Boards | Average loss |
|---|---|---|
| Part-score | 266 | 2.44 |
| Game | 540 | 2.11 |
| Small slam | 164 | 7.14 |
| Grand slam | 27 | 9.90 |

- Too low is by far the biggest kind of miss (2,056 IMPs, against 756 for the wrong strain, 381
  for too high and 22 for the wrong declarer). The costliest boards are nearly all missed slams.
- The worst situations: the strong 2♣ opening (5.27 per board), Blackwood (5.05), the waiting 2♦
  (4.15).
- To check first: a sample of the costly slam boards with `show`, to see how many are real bidding
  errors and how many are double dummy's flattering slams (see the caveats). That decides how far
  to trust the slam numbers, and whether the filter or the ideal needs adjusting. **Checked:** most
  were real errors (below); a few notrump slams with 30–32 HCP were double dummy's flattery.

**First round of fixes** (24 November 2026, committed; not yet tested by hand: Marc tests once every stage is done). Each change was
tried on `quick`, kept only if it helped, then the whole set was checked on `holdout`, a second
1,000-deal set (seed 2) not used for tuning.

| Set | Before | After | Change (95% interval) |
|---|---|---|---|
| quick (tuned on) | 3.23 | 2.82 | −0.42 (−0.55 to −0.30) |
| holdout (not tuned on) | 3.75 | 3.39 | −0.37 (−0.50 to −0.24) |

Kept, roughly in order of what they gained on `quick`:
1. **Responder counts what opener's rebid showed** (`responderRebid` in `sayc/constructive.ts`).
   Responder judged game on opener's HCP floor from the opening, ignoring a jump rebid's or a
   reverse's extra strength, so it passed 1♦–1♠–3♦ with 13 HCP. About −0.17.
2. **Points shown with length count in any strain** (`shownPoints` in `position.ts`). Since the
   bots branch, a jump rebid's or reverse's strength was only counted when that suit was trumps;
   in notrump and general planning partner looked weaker than shown.
3. **Strong 2♣:** 22+ HCP or about nine playing tricks (Marc's agreement), forcing to game except
   when opener rebids 2NT over 2♦. It records 16+ HCP (nine-trick hands rarely have fewer; 10+
   tested about the same), and "fast arrival" no longer narrows the 2♣ opener's range to its
   bottom. The old 10+ floor and fast arrival made opener's 3NT read as 10–11 HCP, so responder
   passed with slam values.
4. **Responder leaves slam-range hands to the slam rules** (31+ with opener's least): the game
   signoffs in `responderRebid` step aside so Blackwood or a slam invitation can follow.
5. **After a minor limit raise, 3NT before five of the minor** with a balanced hand and 13+ HCP.
6. **Transfers count shape:** with 6+ trumps, responder counts shortness and extra trumps (as a
   raise does); with five, length in another suit. Six trumps and a void now bid game.
7. **After opener's 1NT rebid, responder counts a five-card suit** for 2NT and 3NT; 2NT shows 10–12.
   Responder's delayed invitation (1♦–1♥–2♦–3♦) now shows its HCP range.
8. **4NT is Blackwood when a major is agreed**, even after 3NT (as after Jacoby 2NT), and the bidder
   only uses 4NT for aces where partner will read it that way (after 3NT with no agreed major it
   bids the slam instead).
9. **The Blackwood asker names the fit it holds**, not only suits both partners have shown.
10. **Jacoby 2NT:** responder no longer passes opener's 3NT answer; it bids game or explores slam.
11. **Two-card support for opener's five-card major is the game** when a suit is unstopped for
    the "game values, no clear suit game" 3NT.
12. **Grand slams on points need 37 at the bottom of partner's range** (was 37 likely, 35 least).
13. Stayman: opener accepts a 3♥/3♠ invitation counting a fifth trump or a doubleton.

Tried and dropped (they made `quick` worse): counting notrump slams in HCP only (sound bridge, but
the double-dummy ideal likes notrump slams; see the caveats), and capping a misfit's own suit at game.

Not fixed, for the next round:
- Opener after a strong 2♣ and a positive response still jumps to slam in notrump on points; slam
  bidding after 2♣ is the worst situation on `holdout`.
- Wrong strain grew a little (+97 IMPs on `holdout`): more games reached, some in the wrong one.
- 1♣–1♠–1NT with five spades and four hearts: no way to look for the heart fit (no new minor
  forcing yet).
- The competitive rules still read partner's HCP floor (`sayc/competition.ts`), as the constructive
  ones did; for stage 2.

Baselines: after this round was committed, a run of each set on the committed code became the new
baseline, so the next round compares with this one. The "Before" column above (the original
bidding) is kept here as the record of where stage 1 started.

**Is stage 1 at advanced yet?** (Yes as of 25 November 2026: see "Stage 1 status" below. The
assessment that follows is from 24 November.) Not yet (24 November 2026). Against the definition above: fixes
are still finding real gains; Blackwood and strong 2♣ auctions lose about twice the average on
`holdout` (6.96 and 5.91 IMPs per board against 3.41); many of the costliest boards are still
plain errors; and the "can't do yet" list still has phase 1 items. The six biggest areas, roughly
by what they cost, to take one at a time:

1. **Slam bidding.** Slam decisions use fixed point totals; few control bids; slam auctions after
   a strong 2♣ are weak. The biggest single area.
2. **Counting playing tricks** (`suitTricks` in `evaluate.ts`) is generous with broken suits:
   ♠QT542 ♦AQJT7 and ♥KT876 ♦KQJ83 each count as nine tricks, enough for a strong 2♣.
3. **Choosing the strain:** 3NT against a major or a minor game; wrong strain grew slightly as the
   bots reached more games.
4. **Conventions on the card but not used:** new minor forcing, fourth suit forcing from the two
   level, splinters, inverted minors (and Texas, Smolen, Drury, not on the card yet).
5. **Valuation:** honours in long suits, wasted values opposite shortness, misfits, a second fit.
6. **What the auction model tracks:** no aces, key cards, controls or stoppers, so after a
   Blackwood answer the count isn't used in later decisions or in the bots' sampled deals.

Advanced may need advanced conventions switched on (Marc: "to be an advanced bidder you need
advanced conventions"). The harness can run with any card (`--card`); a convention counts towards
advanced when it measurably helps.

**Strong 2♣, Marc's agreement** (24 November 2026): 22+ HCP, or 18+ HCP with about nine playing
tricks, which plays like 22+; forcing to game except 2♣–2♦–2NT. Partner values it as 22+ in every
strain (a strength of 22+ with length); the HCP stay 18+ so the deals the bots sample still include
the trick hands. On the harness: neutral (quick −0.03, holdout +0.03). The trick hands that still
go wrong are area 2 above.

**Roman Key Card** (`--card blackwood=rkc1430`), first try: worse than plain Blackwood (holdout
+0.08), because asker and answerer could disagree about the trump suit, and the asker used 4NT for
a suit the auction hadn't agreed. Fixed: the key-card suit is read from the auction alone (the last
suit both partners bid, else our last natural suit) by asker, answerer and the queen ask; the
bidder uses 4NT only for that suit (otherwise it bids the slam); and with one key card missing, the
queen unknown and no room to ask, nine trumps are enough for the slam. After the fixes Roman Key
Card is level with plain Blackwood (holdout 3.41 both; quick 2.82 against 2.79): most slam losses
are about whether to bid slam, not about counting aces. Plain Blackwood stays the default; try
Roman Key Card again once slam judgment (area 1) improves.

**Slam judgment, first round** (area 1, 24 November 2026). Marc's yardstick: with 33+ HCP between
the hands a partnership should reach slam nearly every time; with 28 or fewer almost never (those
slams exist double dummy but are nearly impossible to find); in between, sometimes, and more often
with a good fit (33 points counting shape on about 30 HCP should find a decent share). Measured
that way, before this round: of the missed slams (the ideal a slam, the bots below it), only about
4% had 33+ HCP, 16% had 31–32, a third 29–30 and nearly half 28 or fewer. Every missed slam with
33+ HCP stopped in 3NT (or 2NT) from a specific rule placing the game.

| Combined HCP | quick: slam bid before → after | holdout: before → after |
|---|---|---|
| 33+ | 71% → 81% (15 → 17 of 21) | 70% → 90% (14 → 18 of 20) |
| 31–32 | 46% → 54% | 43% → 51% |
| 29–30 | 14% → 18% | 15% → 19% |
| 26–28 | 2% → 3% | 4% → 4% |
| 25 or less | none | almost none |

Loss: quick 2.79 → 2.73 (−0.06, −0.13 to 0.01), holdout 3.41 → 3.34 (−0.07, −0.14 to −0.00,
better). Gains are at 29+ HCP; 28 or fewer is level.

Kept:
1. **The plan's slam move takes over from a rule placing game** (`slamTakeover` in
   `sayc/index.ts`). The specific rules (Stayman and transfer continuations, opener's and
   responder's rebids) place games from fixed ranges and never looked for slam: 1NT–2♣–2♥ with 17
   bid 4♥, 1♣–1♥–1♠ with 20 bid 3NT. Now, when that rule's call is natural, not forcing and no
   higher than game, and the placement plan sees a slam, the plan's move comes first (4NT, a slam
   invitation, a control bid or the slam). Not when partner's last call was a forcing convention,
   and not for a call a specific rule gives another meaning. On its own this was level overall
   (slams −0.85 a slam board, games +0.30): the point counts, with shape counted in both hands,
   reached 33 on 29–30 HCP. So:
2. **The cards must back the takeover** (`slamCards` in `sayc/general.ts`): about 31 HCP between
   us for notrump; 30 HCP and 9 controls (ace 2, king 1; partner's estimated at 0.3 a point) for a
   suit; Blackwood from 28 HCP, since with a fit the aces often decide it (Marc) and the answer
   stops at five with two missing. The same gates inside the plan itself were worse: they cut slams
   the baseline already found (the Jacoby 2NT fit slams). Controls are a good guide double dummy:
   with an 8-card fit, slam is the ideal on 70–88% of boards with 10+ controls, 29% with 9, 7% with 8.
3. **Control bids past game only when slam is the target.** An invitation-strength control bid at
   the five level (5♣ over 4♥) left us too high when partner had nothing to add.

Tried and dropped:
- **4NT quantitative unless a suit is agreed** (both partners bid it). It found 1♣–1♥–1♠–4NT
  slams, but SAYC's rule is that 4NT is quantitative only directly over partner's natural notrump;
  it broke 2♣–3♦–4NT and 1♠–2♣–3♠–4NT, which are key-card asks.
- **Gating every suit slam on estimated controls** (10, 9 or 8) or HCP (30, 29), in the plan: level
  at best; the estimate from partner's HCP is too rough to overrule auctions that were working.

Still open:
- **Hands whose strength the bidding never shows:** 1♣–1♦–1♠–3NT (16 opposite 17) and similar
  stop in game because opener's 1-level rebid covers 12–18 (boards 240 and 372 on `holdout`).
  Needs forcing bids that show extras (fourth suit forcing, area 4).
- **Quantitative invitations declined at 32 HCP** (20 opposite 12 after 2NT): the 33 rule says
  decline; the double-dummy ideal says bid. Left as is.
- **Fit slams on fewer HCP** (a double fit, no wasted values): conventional bidding rarely finds
  them. Candidates for double-dummy simulation (Marc): the bidder already decides "hard" calls by
  simulation (`decideWithSimulation`); marking low-HCP slam decisions with a known double fit as
  hard would let simulation weigh them.
- **Controls aren't shown or tracked** (area 6): the takeover estimates partner's from points.
  Control bids and 5NT for kings would replace the estimate.

**Responder's rebids and strain, second round** (25 November 2026). Where the loss sat after the
slam round, as ideal level against the bots' level (`quick`, IMPs per board): slam ideal, game bid
0.84 (mostly fit slams on 30 HCP or fewer, which bidding rarely finds); game ideal, part score bid
0.40; right level, wrong strain 0.34 in games and 0.32 in part scores; part score ideal, game bid
0.23. Missed and overbid games are mostly at 22–25 HCP and roughly balance: game judgment looks
calibrated. The largest strain error was notrump instead of a major (0.24).

Loss: `quick` 2.73 → 2.66 (−0.07, −0.14 to 0.00); `holdout` 3.34 → 3.18 (−0.16, −0.26 to −0.07,
better). Slams bid with 33+ HCP on `quick`: 17 → 20 of 21.

**Rule from now on (Marc): analyse and tune only on `quick`;** `holdout` is run to confirm a change
and its headline reported, but its boards are never looked at. In this round, before that rule,
three of the fixes below (marked †) were found from `holdout` boards; they are plain SAYC errors,
not tuned numbers, but `holdout` isn't untouched for them.

Kept:
1. **Responder's game-level 3NT shows its strength** (13 up to just short of slam opposite
   opener's least, unless earlier bids showed more). It showed nothing, so opener read the
   first response's 6+ and passed 1♣–1♥–1♠–3NT with 19 opposite 18: five of the six missed slams
   with 33+ HCP. Now opener with extras looks for slam.
2. **The plan doesn't pull partner's game without slam** (3NT chosen knowing opener's suit), except
   to a six-card suit opener jump-rebid (1♠–1NT–3♠–3NT–4♠). Needed with 1: once 3NT showed
   strength, opener moved to 5♦ or 4♥ on fit points.
3. **After opener's 1NT rebid†:** three-card support for opener's five-card major raises it (game or
   invite); a six-card major invites with 3 of it, or bids game counting length, instead of 2NT.
4. **After opener's jump rebid** (2NT, or three of opener's suit): responder with six of its major
   bids game in it, with five bids 3 of it (forcing) so opener can raise with three.
5. **2♣–2NT†:** opener shows a five-card suit (the higher of two) before notrump.
6. **2NT transfer†:** opener with three trumps chooses 4 of the major over responder's 3NT (it needed
   four). The answers to a transfer-then-2NT invitation now record opener's trumps.
7. **Responder's second call, smaller fixes:** the 11–12 2NT invitation also when 1NT was cheaper
   (1♦–1♥–1♠–2NT); a jump raise of opener's second major invites (10–12); a shapely 4–5 count
   (a six-card suit, or 5-4 with a singleton or void) responds at the one level.

8. **Slam after Stayman:** with no fit, 6NT or a quantitative 4NT as in the direct responses (opener
   bids 6NT with the top of the range); with the fit, six of the major, or five to invite (4NT is
   quantitative here). Board 807 (2NT–3♣–3♠ with 12 opposite 21) was the last `quick` board with
   33+ HCP that missed slam.

After item 8: `quick` 2.63 (−0.10, −0.17 to −0.02, better); `holdout` 3.19 (−0.15, better). Slams
bid with 33+ HCP on `quick`: 21 of 21.

9. **Raised majors toward slam.** Responder's raise to game records its support (two cards after a
   jump rebid, three otherwise) and shows no extras (13–15 opposite 12), so opener with a long suit
   sees the fit and can try for slam (1♠–2♦–3♠–4♠ with seven spades). After opener's raise of
   responder's major, a responder in slam range on points, backed by about 29 HCP and 9 controls
   (partner's HCP estimated from the raise's support points), leaves game to the slam rules; the
   invitation is only for hands short of game. Tried first: a 13–18 range for suit games, as for
   3NT. Worse: opener counted its shape on top and bid slams on 27–28 HCP.
10. **Opener after a minor raise:** 16–18 invites with three of the minor; 19–22 bids 3NT (balanced,
    18+ HCP) or five of the minor; more is left to the slam rules. It used to invite with any strength
    (1♦–2♦–3♦ with 21 HCP, board 622).
11. **All four aces opposite a weak two in a major:** with two-card support and 19+ HCP, the small
    slam (board 198).

After items 9–11: `quick` 2.61 (−0.12, −0.21 to −0.04, better); `holdout` 3.20 (−0.15, −0.25 to
−0.04, better).

Slams by combined HCP after this round (ideal slams bid, and missed; slams bid where the ideal
isn't one):

| Combined HCP | `quick`: bid / missed (not ideal) | `holdout`: bid / missed (not ideal) |
|---|---|---|
| 33+ | 21 / 0 (0) | 20 / 0 (0) |
| 31–32 | 26 / 15 (3) | 28 / 25 (1) |
| 29–30 | 17 / 38 (2) | 24 / 63 (4) |
| 26–28 | 8 / 53 (2) | 7 / 65 (4) |
| 25 or less | 0 / 13 (0) | 1 / 15 (0) |

Missed slams with 33+ points counting shape but under 33 HCP (`quick`, before items 9–11): 28 boards,
0.26 IMPs per board, all with 9+ controls. Groups: raised majors stopped in game (10; items 9–11
reached three of them); long minor fits stopped in 3NT (10: needs an agreed minor and control bids
above 3NT, or counting a running suit's tricks for 6NT); two bugs (items 10 and 11); notrump with
five-card suits (1NT–3NT with 15 and a five-card suit, board 973).

**31–32 HCP, drilled down** (`quick`, 15 missed slams, 3 slams bid where the ideal isn't one). Nine
of the misses are balanced hands with no fit where the 33 rule invites at most; double dummy likes
6NT there (it finds the queens). Marc: missing those is fine when the hands lack the HCP, a long
suit or a fit, and the slam only "lucked out". The fixable ones:

12. **Opener's raise to game is 19–21** (it had no top: 1♦–1♠–4♠ showed "24 points"). With 22+ and
    four cards in partner's major, opener asks for aces with 4NT (boards 367, 588).
13. **A long suit counts for notrump slam invitations** (one point a card over four), as the general
    plan and the 1NT-rebid rules already did: the direct 4NT over 1NT and 2NT, the 4NT after Stayman,
    and a new 4NT after a transfer with exactly five (16–17 counting the fifth; opener bids six of
    the major with three, 6NT with two, at the top of the range). Boards 973, 450.
14. **2♣–2NT with an unbalanced 4-4-4-1:** opener shows a four-card major (hearts first) and
    responder shows four spades over 3♥ (board 914). The four-card rule comes first so partner reads
    3 of a major as 4+ (a call is read by the first rule that makes it: with the five-card rule
    first, responder read five and bid 6♠ on a 4-3 fit).

After items 12–14: `quick` 2.59 (−0.14, −0.24 to −0.05, better); `holdout` 3.15 (−0.20, −0.32 to
−0.08, better). Slams bid with 31–32 HCP on `quick`: 69% (was 60% after item 11, 54% at the
baseline). New overbid: board 642, 6NT on 30 HCP after 2♣–2NT–3♠, because a 2♣ opener with exactly
22 is read as about 24.

**Third round: new minor forcing, and the remaining non-slam auctions** (25 November 2026).

15. **New minor forcing** (on the SAYC card, not played until now): after 1♣/1♦–1♥/1♠–1NT,
    responder's 2 of the other minor is artificial, 11+ points, with five in the major or spades and
    four hearts. Opener shows three-card support, then four hearts (after 1♠), else notrump; at the
    two level with a minimum, three with 14. Responder bids game or stops. `quick` −0.02 (3NT becomes
    4♥ on 5-3 fits: boards 596, 302, 147); `holdout` about −0.01 (from the headline with it on and off).
    Marked as built in the settings.
16. **Removed: the light shapely response** (round two, item 7: a 4–5 count with a six-card suit,
    or 5-4 with a singleton, responding at the one level). Measured alone, it was exactly neutral on
    `quick`; with silent opponents its real benefit (getting in their way) can't show. Marc: leave it
    out. A sounder version to try in stage 2: respond with 6+ points counting support points with a
    fit, or length without one.

Drill-down of the reverse, responder's-second-suit and game-invitation auctions (`quick`): about
0.28 IMPs per board together; no bugs of the kind the slam rounds found. What's there: minor-suit
and fit slams on 28–30 HCP, and judgment (3NT against a 4-3 fit, invitations at 22–24 HCP).

After this round: `quick` 2.57, `holdout` 3.17 (the baselines after round two: 2.59 and 3.15).

**Stage 1 status (25 November 2026): done for phase 1; uncontested bidding at advanced.** From the
start: `quick` 3.23 → 2.57, `holdout` 3.75 → 3.17. Slams with 33+ HCP: all 41 on the two sets
(were 29 of 41 before the slam rounds). Notrump openings are the strongest area (1.4–1.9 IMPs per
board against 2.57). Game or part score is calibrated: missed and overbid games, mostly at 22–25
HCP, roughly balance. Left for stage 6 (judgment, or more machinery than phase 1 needs):
- Minor-suit slams past 3NT: an agreed minor and control bids above 3NT, or counting a running
  suit's tricks for 6NT.
- Fit slams on 30 HCP or fewer (double fits, no wasted values): rarely found by any bidding;
  candidates for double-dummy simulation of "hard" calls.
- Strain in part scores and 4-3 fits, partly double dummy's preference.
- Conventions not on the card: Texas, Smolen, splinters, inverted minors; Roman Key Card is level
  with plain Blackwood (try again with void answers and 5NT for kings).
- Playing tricks for a strong 2♣ (area 2) and valuation refinements (area 5).
- The 2♣ opener's likely point (24) may be high (board 642).

### Stage 2: competitive bidding

- **Deals.** Random deals, no filter. Opponents bid.
- **Teams match.** Table 1: the new version North–South against the baseline East–West. Table 2:
  the baseline North–South against the new version East–West. IMP the two tables board by board.
  Deal luck cancels.
- **Absolute measure.** IMPs against par for the real deal. Par is double dummy for both sides, so
  it's noisier than stage 1's ideal; it's a trend to watch, not a verdict.
- **Simulated hard calls** are the slow part. They're seeded, so cache them per position.
- **Also measured here:** the `--continue-auction` option against the current "each candidate ends
  the auction" assumption (a trial of 45 positions lost 9 IMPs with continuations).
- **Self-play bias** is largest here: the bots compete against copies of themselves. Cross-check
  with field results from Marc's Common Game sessions, kept outside the repo.

**First experiment: how strict should weak openings be?** (25 November 2026, Marc's question.)
Rather than the full teams match first, a targeted test of one rule:

- **Sets:** `weak-dev` (seed 101, for looking at boards) and `weak-holdout` (seed 202, headline only),
  1,500 deals each, in `bench/weak-sets.json`. A deal is kept when the first player in seats one to
  three who doesn't pass holds a weak-two hand (six cards in ♠ ♥ ♦, 5–11 HCP, no side four-card
  major) or a three-level preempt hand (seven cards, 5–10 HCP), whatever the suit's quality. The
  filter is frozen and doesn't use the bidder (`src/bench/weak.ts`). Each deal's full double-dummy
  table is solved once (13 s for a set).
- **Comparison:** each deal is bid twice, the opponents bidding normally on the base card both
  times, the preempting side once on the base card and once on the variant. Both contracts are
  scored on the deal's own double-dummy tricks (doubles included), and the difference is in IMPs for
  the preempting side. Same deal and opponents, so only the rule shows; a variant equal to the base
  scores exactly zero.
- **Settings tested:** `weakTwoSuit` and `preemptSuit` (`any`, `decent`: one of the top three and
  two of the top five, or `good`: two of the top three or three of the top five, SAYC's standard
  and the default). Shown on the settings page as fixed parts of the card.

(These first results were taken before each side read the other's calls by the other's card: the
defenders read a loose weak two as showing a good suit. Rerun under the plan below.)

| Variant (preempting side only) | `weak-dev` IMPs per board | Boards changed | `weak-holdout` |
|---|---|---|---|
| Weak twos: decent | +0.24 (+0.09 to +0.38) | 350 of 1,500 | +0.37 (+0.22 to +0.54) |
| Weak twos: any | +0.57 (+0.35 to +0.78) | 681 | +0.61 (+0.41 to +0.82) |
| Preempts: decent | +0.09 (+0.03 to +0.16) | 87 | +0.13 (+0.05 to +0.21) |
| Preempts: any | +0.17 (+0.08 to +0.27) | 136 | +0.18 (+0.08 to +0.28) |

Every loosening gains on both sets: the base passes those hands, and against these opponents
opening them pays. Read with care, though: looking at the biggest swings on `weak-dev`, much of
the gain is the opponent bots handling preempts badly, or bugs in their competitive auctions, not
the weak opening itself:
- Board 828: over 2♦–3♦, the opponent with 22 HCP and ♣AKQJ854 doubles, then lets 4♦ play
  (without the preempt they bid 6♣).
- Board 1223: in the base auction, North bids 3♥ holding four spades and a doubleton heart, and is
  doubled for −1700 (a competitive-bidding bug unrelated to weak twos).
- Board 845 goes the other way: the weak two helps the opponents find 6♥.

Also: double dummy's defenders always lead right, so the lead-directing value of a good suit
doesn't count (that favours looser suits), and self-play means the result is "against our bots".

**Plan for weak openings and the defence to them (Marc, 25 November 2026).** Tune the two against
each other until neither changes:
1. **Baseline:** weak twos and three-level preempts with 3+ HCP in the suit (`hcp3`: a king,
   queen-jack or better), as the preempting side's card in these runs (the bots' default in the
   frontend stays SAYC's "good" until step 3).
2. **Tune the defence** against it, one change at a time, keeping a change only if it helps
   against 3+ HCP preempts and doesn't hurt against SAYC's "good" ones (so the defence isn't
   tuned to one style). Evaluate on `weak-holdout`, then make it the new baseline.
3. **Choose the suit standard** for weak twos and preempts against the improved defence; the best
   becomes the final baseline (and the bots' default).
4. **One more pass at the defence** (expected to change little).

Who decides what, by case (Marc and Claude, 25 November 2026):

| Case | Decided by |
|---|---|
| The preemptor's later calls | A rule: the preemptor doesn't bid again unless partner forces (a new suit, the 2NT ask), and then only answers |
| Raising partner's preempt | Rules: the Law of Total Tricks (six shown: raise to 3 with three, to 4 with four; seven: raise to 4 with two or three), one level more at favourable vulnerability, less at unfavourable; game to make with opening values and a fit, the 2NT ask when it depends on a maximum; 3NT with stoppers and a way to run the suit |
| Coming in over their preempt, and our next round, **when we may have game** | Rules: act as if partner holds 7–8 useful points; the action by shape (double when short in their suit with support for the rest, overcall with a good suit, 2NT/3NT balanced with a stopper, jump to game with a self-sufficient suit); advancer's jumps and Lebensohl |
| The same **when it's only a part score** (marginal hands) | Double-dummy simulation, as a "hard" call with a few candidates |
| Competing, sacrifices, penalty doubles | Simulation, scored in IMPs (it scores share of deals today: fix first) |

Groundwork done for step 1: the `hcp3` standard; each side reads the other's calls by the other's
card (the bidder already supported a card per side; the experiment now passes both); par from the
double-dummy table (`parScore` in `src/bench/weak.ts`: over each contract the other side lets it
stand, doubled if it fails, or outbids it; the dealer's side acts first); and the defence run
(`weak-defence`): each deal bid once, the weak hand's side on 3+ HCP preempts, ours on the code
under test, scored for us in IMPs against par, compared board by board with a committed baseline
(`bench/weak-baselines.json`).

**Step 1 baseline** (code at `20b11de` plus the groundwork): our side against 3+ HCP weak openings,
IMPs per board against par: `weak-dev` −1.40 (−1.79 to −1.01), `weak-holdout` −1.89. On `weak-dev`:
after their three-level preempt −2.23, after their weak two −1.53, with the weak hand in third seat
−4.79 (133 boards). Par includes perfect sacrifices, so 0 isn't reachable; it's a yardstick for
change. For reference, 3+ HCP weak openings against SAYC's "good" suits (each side reading the
other's card): +0.32 IMPs per board on `weak-dev` (+0.16 to +0.49), +0.53 on `weak-holdout`.

Baselines are kept per set and per preempting side's card (`bench/weak-baselines.json`): against
3+ HCP preempts (the default for `weak-defence`) and against SAYC's "good" ones (`--base
weakTwoSuit=good,preemptSuit=good`): −1.12 on `weak-dev`, −1.42 on `weak-holdout`.

Where the defence lost against par at the step 1 baseline (`weak-dev`, against 3+ HCP preempts, IMPs
per board over the set): we play it and make it below par (missed game or slam, wrong strain) −1.25;
they play it when we had a plus available −1.17; we play it and go down −1.01. Boards at or near
par add +2.14, because par assumes the preempting side's perfect sacrifices, which the bots don't
make. The first group is mostly games and slams missed after a takeout double (the doubler with
17–23 passing partner's minimum answer); the other two are competing and doubling decisions.

**Step 2, first round** (rules for "may have game"):
1. **Game with a self-sufficient suit** over a two- or three-level bid: a good six-card or longer
   suit and the game's tricks less two (8 for a major, 9 for a minor), acting as if partner holds
   7–8 points. Advancer then passes partner's game (it used to "support" it to slam).
2. **Advancer's minimum answer to a takeout double shows 0–8 points** (0–10 at the three level), so
   the doubler can count; advancer's 3NT needs 10+ and a stopper (was 13+); over a three-level bid,
   four cards in an unbid major and 10+ bid game (was five).
3. **The doubler bids again** after partner's minimum answer: game in partner's suit with four
   trumps and 19+ (16+ when the cheapest raise is game), a raise with 16–18, 3NT with 18+ and a
   stopper, its own good suit with 17+ (game with a good six-card suit and 20+); otherwise pass.

| | `weak-dev` against 3+ HCP | against "good" | `weak-holdout` against 3+ HCP | against "good" |
|---|---|---|---|---|
| Step 1 baseline | −1.40 | −1.12 | −1.89 | −1.42 |
| After the first round | −1.16 (+0.23, better) | −0.96 (+0.16, better) | −1.70 (+0.19, better) | −1.28 (+0.14, better) |

`quick` (silent opponents) unchanged. Most of the gain is item 3 (+0.21 and +0.13 on `weak-dev` with
items 1–3; item 1 alone about +0.03). Still to do in step 2: the competing, sacrifice and penalty
decisions (simulation, scored in IMPs first), entering with shape, and the 3NT overcall's range.

**Step 2, second round: simulation for the competitive decisions** (25 November 2026).
- **IMP scoring:** simulation can now compare candidates in IMPs (each candidate IMPed against the
  others, deal by deal) as well as matchpoints (`SimulationOptions.scoring`; the default stays
  matchpoints, so the frontend is unchanged).
- **Judgment mode** (`SimulationOptions.judgment`, off by default): calls the rules don't flag as
  hard become hard calls when they're near the end of a competitive auction (the balancing seat, or
  over their bid at the three level or higher once both sides have bid), with candidates pass,
  double, and our suits (or a long suit of mine) at the cheapest level (`judgmentCandidates` in
  `bidder.ts`).
- **Harness:** `weak-defence --simulate` decides our side's hard calls by simulation (spread over
  the worker threads; about a minute for a set with judgment); `--judgment`, `--continue` (replay
  the rest of the auction with the rules on each sampled deal, the existing `continueAuction`) and
  `--scoring matchpoints`.

| Our side's hard calls (`weak-dev`, change against the round 1 baseline) | Against 3+ HCP | Against "good" |
|---|---|---|
| Simulation as today (only "outbid" calls, 75 of them), IMPs | +0.03 (no clear difference) | |
| Judgment mode, each candidate the last call (1,122 calls, 592 changed) | −0.08 (−0.27 to +0.12) | |
| Judgment mode, the auction continued by the rules, IMPs | **+0.24** (+0.06 to +0.41, better) | **+0.21** (better) |
| The same, matchpoints | +0.21 (better) | |
| `weak-holdout`, judgment and continued, IMPs | **+0.35** (+0.17 to +0.53, better) | **+0.47** (+0.29 to +0.66, better) |

So simulation pays for the competitive decisions, but only when it sees how the auction goes on:
treating each candidate as the final call loses, mostly on doubles the opponents run from or make.
IMPs against matchpoints made little difference here. Not yet measured: the same mode in other
competitive auctions (it fires in any contested auction, not only after a preempt).

Speed in the frontend (25 November 2026): 20 judgment positions from `weak-dev`, timed in the browser
with the app's four-worker solver pool: median 0.6 s, mean 0.66 s, slowest 1.6 s on a desktop; likely
1.5–2 s on a phone. **Switched on** (Marc): the bots now simulate with `BOT_SIMULATION` (IMPs,
judgment, the auction continued) at the table, in the hints and in the review.

**Decision (for now):** keep SAYC's "good" suits as the default. The experiment says our defence to
preempts is the bigger weakness. Next: improve the bots' bidding over the opponents' preempts and
weak twos (stage 2), using these sets with the opponents' standard loosened (`--base
weakTwoSuit=any,preemptSuit=any`) to measure it; then rerun this experiment.

Commands:
```
npm run bench -- weak-build weak-dev                       # once (and weak-holdout --seed 202)
npm run bench -- weak-run weak-dev --card weakTwoSuit=decent
npm run bench -- weak-show latest --board 828
```

### Stage 3: opening lead

- **Deals.** Random deals, bid by the bots (or the stage 1 and 2 sets with their auctions).
- **Score.** Solve the real deal after each possible lead: tricks given up by the bot's lead
  against the best lead. Over thousands of deals the luck of the layout averages out, so the real
  deal is a fair judge here, with no circular "what could the leader infer".
- **Also:** whether each lead lets the contract make that the best lead would beat, which matters
  more at IMPs than an overtrick.
- Cheap: one solve per lead per deal.

### Stage 4: declarer play

- **Deals.** Deal, auction and contract fixed (from the bidding sets). The defenders play the
  baseline; only declarer's policy changes.
- **Score.** Tricks and score against double dummy on the real deal, how often a contract that
  makes double dummy is made, and IMPs against the baseline declarer on the same boards.
- **Speed.** Every card is a sampling decision, so a board takes seconds. Run on worker threads,
  with smaller sets (500–1,000 boards), and record time per decision against the in-app budget.

### Stage 5: defence

The same as stage 4 with the sides swapped: baseline declarer, new defenders. Signals and
inference from partner's cards matter most here, and it's the hardest stage of phase 1.

### Stage 6: towards expert

The problems that separate advanced from expert, and that the current design can't solve with
tuning. Each is an experiment: try it, measure it on the area's harness, keep it only if it gains
enough for its cost in time. Roughly in order of likely value for effort:

| Problem | Area | Why it's hard | What to try |
|---|---|---|---|
| **Strategy fusion.** Each sampled deal is solved as if declarer could see it, so declarer "knows" which way to finesse. Misses safety plays, lines that gather information first, and keeping options open. | Declarer play | The fix is a search that chooses one line for all deals at once, which costs far more time than solving each deal separately. | α-μ search (from research on bridge card play), first in short endings and on the key decisions, where it's affordable. |
| **Defenders who can see each other.** On each sampled deal, the solver lets the two defenders see each other's hands, so the bots defend as if they knew partner's cards. | Defence | The same problem as strategy fusion, worse: two players, and partner's cards are the main unknown. | The same search as above, from the defenders' side; meanwhile, more weight on partner's signals. |
| **Judgment in constructive bidding.** Invite or bid game, 3NT or 4♠, whether to try for slam: fixed rules with fixed point totals. | Uncontested bidding | Deciding by simulation needs the rest of the auction played out on each sampled deal (`--continue-auction`), which lost IMPs in its first trial and costs time on the device. | Simulation with the auction continued, once stage 2 has made continuations reliable; perhaps on the backend or the fastest device only. |
| **Playing for the opponents' mistakes.** Bots play as if every opponent is perfect, so they never give one a chance to go wrong. | Declarer play, defence | Needs a model of how people err, which double dummy doesn't have. | Prefer, among nearly equal lines, the one that leaves an opponent a guess. Measure against people, not just bots. |
| **Deception.** Bots never false-card, and follow their signalling agreements only between equally good cards. | Declarer play, defence | Its value depends on who you play against: bots read signals mechanically, people don't. | Measure first how much honesty costs against the bot opponents; then decide. |
| **Expert-level bidding coverage.** The long tail of situations and conventions experts handle, and when to bend the rules. | Both kinds of bidding | No end to it by hand-written rules. | Keep adding by situation tag; consider a learned model (as the open-source Ben bot uses) as a cross-check or a judge for hard calls. |
| **An expert reference.** Without one, "expert" can't be measured. | All | Expert auctions and play records are scarce, mostly under copyright, and played in other systems. | Most promising: score experts' own contracts with the same measure. Vugraph archives of top events record real deals with experts' auctions; on the deals where the opponents stayed silent, the experts' loss against the two-hand ideal is a direct benchmark ("the bots lose 2.5 IMPs a board, experts about X"). Needs permission or a licence for the data, and covers contracts, not each call. Also: another strong bot on the same deals (the open-source Ben runs locally, in its own systems); expert auction sets for private reference; Marc's judgment throughout. |

## The harness's interface

Commands run in `frontend/`, through one npm script with subcommands (`npm run bench` alone lists
them).

```
npm run bench -- build <set> --deals 1000 --seed 1 --layouts 50   # deal a set and solve its layouts (once)
npm run bench -- run <set>                                        # bid every deal, compare with the baseline
npm run bench -- run <set> --label "jump shift fix"               # name the run
npm run bench -- baseline <set> [<run>]                           # make a run (default: the latest) the baseline
npm run bench -- compare <run> [<other run>]                      # compare two runs (default: with the baseline)
npm run bench -- show <run> --board 214                           # one board: hands, auction and reasons, the ideal table
npm run bench -- list                                             # sets, baselines and runs
```

A run is named by its id (`quick-2026-11-24-141502`), or as `latest` or `baseline` (with
`--set <name>` when there's more than one set). Options: `--top <n>` (how many costly and changed
boards to list, 10), `--changed` (list every changed board), `--min-boards <n>` (boards a situation
needs to be listed, 15), `--threads <n>` (for `build`; all but two of the computer's).

Each run records the git commit it ran on, and "with uncommitted changes" when the working tree
had any (outside `frontend/bench/`). That's the usual state while trying a change. It means the
run's code is the commit plus whatever was being tried, so give such runs a `--label` saying what
the change was.

`--card <setting>=<value>,…` runs with settings changed from the SAYC defaults (any key of
`SAYC_DEFAULTS` in `core/bidding/system.ts`, for example `blackwood=rkc1430`); the run records them
and the summary shows them.

Not built yet, for when they're needed: an HTML report, `--tag` to look at one situation, and
`--against <git-ref>` (stage 2 on: build that ref as the opponent or baseline engine).

**Where things live.**
- `frontend/src/bench/`: the harness's logic (deal sets and the filter, the ideal contract, stage 1
  runs, the report), pure and tested like `core/`, but not part of the app.
- `frontend/scripts/bench.ts`: the command line, files and worker threads.
- `frontend/bench/sets.json` (committed): each set's definition (size, seed, layouts, filter
  version). The boards are rebuilt exactly from it.
- `frontend/bench/baselines.json` (committed): each set's baseline run, with its git commit, a copy
  of its per-board results (without the reasons), so anyone can compare against the same baseline.
  One line per board (about 250 KB for 1,000 boards), so a new baseline's diff shows which boards
  changed. Commit it whenever the baseline changes.
- `frontend/bench/.cache/` (not committed): each set's dealt boards and solved layouts, and
  `runs/`, one file per run with every call's reason.

### What a run shows (stage 1)

Illustrative output; the numbers are made up.

```
Set quick-1 (1,000 deals, stage 1)    Run 2026-11-25 3f2a9c1 "jump shift fix"
Baseline: 2026-11-24 af6e74e

Loss against the ideal contract (IMPs per board)
                         this run    baseline    change
  All boards               1.42        1.51      −0.09  (−0.16 to −0.03)  better
  Boards at the ideal      58.1%       56.9%
  Boards losing 3+ IMPs    13.0%       14.2%

By the ideal contract's level            boards   loss   change
  Pass out / part-score                    512    0.81   −0.02
  Game                                     391    1.87   −0.14
  Small slam                                84    3.90   −0.22
  Grand slam                                13    6.10    0.00

How the bot's contract went wrong        boards   IMPs lost
  Too low (missed game or slam)             141    412
  Too high                                   97    288
  Wrong strain (missed a major fit)          38    121
  Wrong strain (notrump against a suit)      44     96
  Wrong declarer                             29     31

Slams by North–South's combined HCP   boards slam ideal  slam bid  baseline  not ideal   loss   change
  33+                                     21     100.0%     81.0%     71.4%          0   4.88    −1.81
  31–32                                   48      85.4%     54.2%     45.8%          4   6.11    −1.04
  ...

By situation (worst first)               boards   loss   change
  After a 2NT opening                        38    2.60   −0.05
  Responder with game values after a 2/1     52    2.10   −0.41
  ...

Changed boards: 41 (better 24, worse 11, same score 6)
  Board 214  3NT −45 → 4♠ +420   +9.1 IMPs  responder with game values after a 2/1
  Board  87  2♦ +90 → 3NT −50    −3.2 IMPs  ...

Calls with no rule: 3 (baseline 5)    Hard calls: 0    Time: 4.2 s
```

The parts:
- **The headline:** average loss against the ideal, the change against the baseline with its 95%
  confidence interval, and a verdict (better, worse, or no clear difference).
- **Where the loss comes from:** by the ideal contract's level, by kind of error, and by situation
  tag (the opening, conventions used, who had the values). These breakdowns are the "can and
  can't" list.
- **Slams by combined HCP:** for each band of North–South's HCP together, how often slam is the
  ideal, how often the bots bid one (this run and the baseline), slams bid where the ideal isn't
  one ("not ideal", the cost of looking), and the loss. Marc's yardstick: with 33+ a partnership
  should nearly always reach slam, with 28 or fewer almost never, and in between sometimes. Runs
  recorded before the HCP were added to run files don't have this table.
- **Changed boards,** sorted by size, so the biggest wins and losses are checked first.
- **Health:** calls with no rule, hard calls, run time.

`show` prints one board in full: the four hands, the auction with each call's reason (as
`bidding-report` does), and the ideal table with each contract's average score and expected loss.

### What later stages show

- **Stage 2:** IMPs per board against the baseline in the teams match (with interval), IMPs against
  par, and breakdowns by who opened, who won the auction, doubles (how often a penalty double
  scored), and hard calls (how often simulation overturned the rule of thumb, and whether that won).
- **Stage 3:** average tricks given up against the best lead, how often the lead was best, leads
  that let a beatable contract make, by contract (notrump, suit, slam) and by kind of lead.
- **Stages 4 and 5:** tricks lost against double dummy per board, the make rate on contracts that
  make double dummy (or the beat rate, defending), IMPs against the baseline policy, the costliest
  cards with their trick and situation, and time per decision (typical and slowest) against the
  in-app budget.

## Is expert level feasible?

It depends on the area. The main limit is the in-app time budget (a bot acts within about two
seconds, and an iPad is about ten times slower than Marc's PC), not the harness.

- **Declarer play: largely feasible.** Sampling with double dummy plays most ordinary hands close
  to expert standard. Its known weak spots are strategy fusion (it assumes it will know later what
  it has to guess now, so it misses safety plays and lines that gather information first), no
  deception, and playing as if the defenders never go wrong.
- **Defence: hard.** It depends on signals, counting and reading partner's cards, where sampling
  bots fall furthest short of experts. There's an extra problem in defence: on each sampled deal,
  the solver lets the two defenders see each other's hands.
- **Bidding: a long road.** Expert bidding is a much richer system plus judgment: when to bend
  the rules, competitive decisions, slam bidding. Rules plus simulation can reach advanced
  standard. Expert judgment needs far more coverage, perhaps learned models (as the open-source Ben
  bot uses).
- **No expert reference yet.** The harness measures progress and finds weak spots. To say "expert"
  needs a reference: Marc's judgment on the costliest boards first; later perhaps another strong
  bot, the club field, or expert auction sets (for private reference only, for copyright).

**Verdict.** Advanced standard looks feasible in all four areas with the current design and time
budget: most of what stands between today's bots and advanced is rules, tuning, valuation and
better use of what the auction and the play have shown (the tables below). Expert standard is
feasible in parts: declarer play could get close, while defence and bidding judgment may stay
short of it. Those hard problems are stage 6.

## Known issues and ideas to try, by stage

From reading the current code (November 2026). Each is something to measure once the harness
exists, not a change to make now. "Where" points at the code involved. These are phase 1 work,
towards advanced; the hard problems are in stage 6 above.

### Non-competitive bidding (stage 1)

| Issue | Where | Ideas to try |
|---|---|---|
| Game and slam decisions use fixed point totals (game at 25 for notrump, 26 for a major, 28 for a minor; slam at 33, invite from 31). Valuation is HCP plus fixed length and shortness points. | `sayc/general.ts` (`GAME_POINTS`, `SLAM_POINTS`), `evaluate.ts` | Tune the thresholds on the harness. Add valuation adjustments: honours in long suits, wasted honours opposite shortness, misfits (in the backlog), a second fit (in the backlog), losing-trick count as a cross-check. |
| What a call shows is HCP, suit lengths, balanced, suit quality and strength with a fit. No aces or key cards, controls, stoppers or where the honours are. After a Blackwood answer, the answer's ace count isn't used when the bots sample deals, in later bidding or in the play. | `model.ts` (`Shown`), `sayc/general.ts` (Blackwood answers) | Add aces and key cards (and later controls and stoppers) to `Shown`, and make the samplers respect them. |
| Passes aren't used as evidence (didn't open, so under 12; didn't bid a major, so no five-card major). | `simulate.ts`, `cardplay/sample.ts` (in the backlog) | Add what a pass rules out to what the auction has shown. |
| Conventions on the card that the bots don't use yet: splinters, inverted minors, new minor forcing, fourth suit forcing from the two level, Roman Key Card void answers and 5NT for kings. Not on the card yet: Texas transfers, Smolen, Drury. | `sayc/*.ts`, `system.ts` | Add one at a time; each should show up as a gain in its situation tag. |
| Right-siding isn't a goal of any rule; declarer falls out of the auction. | `sayc/notrump.ts`, `sayc/general.ts` | The harness measures "wrong declarer" directly; act only if it's costly. |
| The "game values, no clear suit game" 3NT and the limiting 2NT after a 2/1 don't check stoppers (from the bots-branch review). Partly fixed: with two cards in opener's five-card major and a suit unstopped, the bots now bid 4 of the major. | `sayc/constructive.ts` | A fourth-suit ask for the stopper (area 4 above). |
| Support points replaced HCP for raises and cuebid raises, so code that reads only `shown.hcp` saw a weaker partner (from the bots-branch review). Fixed for constructive bidding (points shown with length count in any strain; responder counts opener's rebid); the competitive rules still read the HCP floor. | `sayc/competition.ts` | Stage 2. |
| Calls with no rule fall back to a natural call or Pass. | `bidder.ts` | Track the count in every run; each one is a gap. |

### Competitive bidding (stage 2)

| Issue | Where | Ideas to try |
|---|---|---|
| Simulation treats each candidate as the last call of the auction. | `simulate.ts` | Compare with `--continue-auction` on fresh deals, as planned. |
| Simulation scores candidates at matchpoints (share of deals), not IMPs. | `simulate.ts` | Score by the game's scoring; at IMPs, a game swing outweighs several part-score gains. |
| Few candidates: pass, double and one bid. No redouble (in the backlog), no planned sacrifice beyond the Law of Total Tricks rule. | `sayc/competition.ts`, `sayc/general.ts` | Add candidates one at a time and measure. |
| 60 sampled deals, simulation needs 16 to fit, with some leeway when too few fit. | `simulate.ts` | Measure how often simulation overturns the rule of thumb, and whether it wins when it does. Tune deal counts against time. |
| Missing competitive tools: responsive doubles, support doubles, Lebensohl, lead-directing doubles of artificial bids. | `sayc/competition.ts` | Add one at a time, if the situation tags show a loss there. |
| Penalty doubles judged by double dummy, which lets the defence always find the best line. | `simulate.ts` | Check doubled boards in stage 2's breakdown; compare with play-outs after stage 4. |
| Self-play: the opponents are the same bots. | | Cross-check with Common Game field results kept outside the repo. |

### Opening lead (stage 3)

| Issue | Where | Ideas to try |
|---|---|---|
| The lead that's best on the most deals wins (most tricks). Against a game or slam at IMPs, beating the contract matters far more than an extra undertrick. | `cardplay/decide.ts` (in the backlog: judge by the game's scoring) | Score leads by the chance of beating the contract when that's what counts. |
| Fixed preferences: a lead from AK unless another lead is 10% better (`AK_LEAD_MARGIN`); partner's suit on a 3% near-tie. | `cardplay/decide.ts` | Tune both margins on the harness. |
| 40 deals for the lead, the costliest card of the hand; the play review uses 200 on a second pass. | `cardplay/decide.ts`, `cardplay/review.ts` | More deals for the lead only (100 deals take 0.6 s on the PC, about 5 s on an iPad). |
| The leader's picture of the hidden hands is only the auction's ranges; no inference from what the opponents didn't do (no Stayman, so no 4-card major). | `cardplay/sample.ts` | Same as passes in stage 1: add what the auction rules out. |

### Declarer play (stage 4)

| Issue | Where | Ideas to try |
|---|---|---|
| Most tricks counts, not making the contract (matchpoints); risks the contract for an overtrick at IMPs. | `cardplay/decide.ts` (in the backlog) | Score by the game's scoring. |
| Declarer reads the defenders' leads and signals as light hints, but not their discards, their choice of suit or what they didn't lead. | `cardplay/inference.ts` | Read discards and switches as evidence, carefully weighted. |
| 40 deals per card; sampling by trial and error (up to 20,000 tries), dropping the bidding when fewer than 6 deals fit. | `cardplay/decide.ts`, `cardplay/sample.ts` | Measure tricks against deals and time; fewer deals late in the hand, more at the key decisions. |
| Claims only when the rest is certain on every sampled deal. | `cardplay/claims.ts` | No effect on scores; low priority. |

### Defence (stage 5)

| Issue | Where | Ideas to try |
|---|---|---|
| Signals: only the first card played to a suit (attitude or count) and the first discard. No suit preference, no later signals, no reading partner's discards. | `cardplay/carding.ts`, `cardplay/inference.ts` | Add suit preference (after a ruff, and when attitude is already known), and read partner's discards. |

### Across all stages

- **Time budget.** Any gain that costs time must fit about two seconds on the slowest device that
  thinks for bots. Every run records time per decision.
- **Determinism.** Decisions are seeded, so runs repeat exactly. Keep it that way.
- **Double dummy biases.** The stage 1 and 2 scores flatter guesses and leads. Measure the size of
  that once play-outs are possible (after stage 4).

## Order of work

1. Stage 0 and stage 1 together, minimal: one 1,000-deal set (`quick`), the cache, `build`,
   `run`, `baseline`, `compare`, `show`, and the terminal summary. No HTML, no targeted generators
   yet. **Done** (November 2026).
2. Use it on the next few bidding fixes. Keep going only if it shows things worth fixing or catches
   side effects. **Done:** three rounds of stage 1 fixes, stage 1 at advanced (25 November 2026).
3. Targeted generators and the full and held-out sets, as stage 1's breakdowns show where they're
   needed.
4. Stage 2 (needs two engines at once), then 3, 4 and 5, each to advanced standard.
5. Stage 6, one problem at a time, once phase 1 is done.

The "Ideas to revisit" list from the bots branch's `bidding_changes.md` (removed; it's in the git
history, with the write-ups of each bidding change) is folded into this plan.
