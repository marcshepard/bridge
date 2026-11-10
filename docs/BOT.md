# Bots

Goals for robot players: bots that bid and play a seat, and give feedback on a person's bidding and
play. This file starts with the goals. Architecture, design and the staged plan get added below as
they're agreed. Nothing here is built yet beyond what "Where we start from" describes.

## Why

Two reasons to have a bot at the table:

1. **Practice and learning.** One person and three bots. You bid and play every board at your own
   pace, and the app tells you where your bidding or play could have been better, then compares your
   result with the original field as usual.
2. **A fourth.** Three people turn up. A bot takes the empty seat so the game can go ahead, and
   it should be good enough that nobody minds having it as a partner or an opponent.

## Who plays with whom

| Table | What it's for | What matters most |
|---|---|---|
| 1 person, 3 bots | Practice and learning | Feedback, a partner bot that bids the system you're learning, going at your own pace |
| 3 people, 1 bot | Getting a fourth | Sensible bidding and play, no waiting on the bot, feedback off or private |
| 2 people, 2 bots | Two partners practising together, or two friends against bots | Bot opponents that bid and defend sensibly; feedback for both people |
| Demo game | Trying the app alone | Already exists for real cards (bots do nothing); online it becomes the 1 + 3 case |

## Goals

### Playing

- **Bots bid and play their seat on their own** in an online game, the same game and the same
  screens as four people. Nobody bids or plays for them (today the owner's device bids for a bot).
- **They never hold the table up.** A bot acts within a couple of seconds, a short pause so people
  can follow it, and keeps acting when the owner's device is asleep or gone.
- **They play fair.** A bot uses only what its seat would know at a real table: its own hand, the
  auction, dummy after the lead, the cards played. The game file has all four hands, so this is a
  rule the bot keeps, not something the data stops.
- **Good enough, not expert.** Club-player standard: a bidding system a club player would recognise,
  and card play that draws trumps, sets up long suits, finesses, gives count and attitude, and
  doesn't revoke or make obviously silly plays. Not world-class.
- **A partner you can trust.** A bot partner bids a known, stated system so that a person can bid
  with it. Its calls mean what the system says they mean, every time.
- **Claims.** Bots accept a claim that's right and refuse one that isn't, and can claim themselves
  when the rest is obvious.

### Bidding system

- **Standard American Yellow Card (SAYC) first.** It's what most club players learn, and it's
  written down in one short booklet, so the bots' calls can be checked against it.
- **SAYC's own choices are settings.** The yellow card has thresholds and optional conventions
  (the full list gets settled in the design). For example: the 1NT opening range, light openings
  in third and fourth seat, which Blackwood (plain or Roman Key Card, 1430 or 3014), Gerber, Jacoby
  2NT, splinters, inverted minors, Drury, Michaels and the unusual 2NT, how high negative doubles
  go, new minor forcing, fourth suit forcing. Each has a default, so nobody has to fill anything in
  to start.
- **Built to grow.** 2/1 game forcing comes later as another system on the same foundations: the
  shared parts (notrump structures, slam conventions, competitive bidding) written once, the parts
  that differ swapped. Adding a system or a convention shouldn't mean rewriting the others.
- **Your settings live on your device** (browser storage, through `ProfileStore`), since there are
  no accounts. When a game starts, the settings that apply go with the game, so a bot uses the same
  card wherever it does its thinking, and a review afterwards judges your calls by the card you
  played. A bot partner plays its person's card; bots on the other side play the defaults (or the
  owner's card; to settle in the design).

### Feedback (for learning)

- **On bidding:** after (or, if you ask, during) the auction: what the bot would have bid in your
  seat and why, and what each call in the auction meant ("2♣: Stayman, asking for a 4-card major").
- **On play:** the opening lead and the cards that cost tricks, measured against double dummy
  ("This card cost a trick: the ♠Q finesse was on"), with the best card instead. Picking out the
  few that matter, not every card.
- **On the result:** ties into what's there now (score, matchpoints, the field, par): "Most of the
  field bid 4♠ and made 10 tricks; you stopped in 2♠."
- **Explained for a learner.** Plain words, short, a bridge player's vocabulary, the same voice as
  the in-app help. Every comment says why, the way every score shows its arithmetic.
- **Your choice when and how much.** A setting, one of four:

  | Setting | What you get |
  |---|---|
  | No review | Nothing beyond today's result screen |
  | **Review after the board** (the default) | A review of the auction and the play once the board is over |
  | As you go | The review, plus a comment straight after a call or card that the bot would have made differently |
  | As you go, with take-backs | The same, and you can take that call or card back and try again |

  The first version builds the first two. "As you go" and take-backs come later, but the design
  leaves room for them from the start. Take-backs only make sense when nobody else at the table is
  a person, so they're offered only in a game with bots in the other three seats.
- **Private.** Feedback for a player goes only to that player, and nobody else sees it. Each
  person picks their own setting.
- **Reviewable later.** Feedback stays with the board, so you can look back at it from the tally
  (with "Reviewing the play" in the backlog).

### Fitting into the app

- **Part of the online flow,** not a separate mode: choosing who plays, the lobby, the board and
  result screens, the tally and the help all work the same with bots in the seats.
- **Adding a bot** is a choice in the lobby (the owner fills empty places with bots), and starting
  a practice game alone is one step from Home.
- **Online games only.** A bot can't hold real cards, so real-cards games have no bots (except the
  demo, where they do nothing, as now).
- **A person can take a bot's seat** mid-game, and a bot can take over a seat whose player has gone
  (the owner's choice), so a game survives someone leaving.
- **The layers stay as they are:** bidding and play logic in `core/` (pure, testable, no I/O),
  usable by the frontend and the backend; screens get bot behaviour through `services.ts`.
- **Every bot call and card is checked** by the backend with `core/`, like a person's.

### Quality and cost

- **Testable.** The same deal and state give the same bot decision (a seeded random), so tests can
  pin known hands to known calls and cards. A set of reference deals checks the bots don't get
  worse.
- **Explainable.** Every bot decision can say why, in words. That's what the feedback is built on.
- **Works on every device:** phones especially, so anything heavy (double dummy, simulations)
  must be fast enough there or run somewhere else.
- **Free to run.** It stays within Cloudflare's free plan, which limits CPU time per request (about
  10 ms), so the backend can't do heavy thinking per request. Any paid service (an AI model, a
  hosted bridge engine) is an explicit decision, not a default.

## Not goals (for now)

- Expert or tournament-strength bots.
- Systems other than SAYC to start with (2/1 next; the design allows for it).
- Hiding the hands from someone reading the game's data with developer tools. The boards are
  replays of published deals, and the screens already show each player only what they should see.
- Alerts and convention cards for people (in the backlog); bots explain their calls through
  feedback instead.
- Bots in real-cards games.
- Rating or ranking players.

## Where we start from

- `core/bot.ts` plays cards with a few textbook rules (second hand low, third hand high, ruff low,
  standard opening leads, else random). It looks at dummy's hand, which is fair, and at nothing else
  hidden.
- Bots exist as players (`is_bot`, migration 0006), from the demo game and dev test players.
- Bots don't bid: the owner's device bids for them ("Bid for North"). The owner's device also plays
  their cards, after a 2-second pause, and they accept every claim.
- Double dummy comes only from the game file when the source has it (the TCG page and BridgeComposer
  PBNs do); computing it in the browser (DDS in WebAssembly) is an idea in the backlog.

## Decided

- **System:** SAYC first, with its thresholds and optional conventions as settings, built so 2/1 can
  be added (see "Bidding system").
- **Settings** are kept on the device in browser storage, and travel with the game once it starts.
- **Feedback:** review after the board by default; no review as an option. "As you go" and
  take-backs later, with room left for them (see "Feedback").
- **Hidden hands** don't need to come first. Bots keep to what their seat would know as a rule of
  their own; the backlog item is now a low-priority "make the hands less visible in the data".

- **How bots think:** hand-written rules for bidding (they follow the system and explain
  themselves), with double-dummy simulation for the hard calls; double-dummy sampling over what
  each seat knows for card play. AI models aren't used to choose calls or cards; at most, later, to
  word a review from facts the rules and the solver supply.
- **Where bots think:** on the devices first (free), with the solver behind one interface so a
  paid backend service can be added when a slow device gets in the way. See "Prototype 1".

## Prototype 1: double dummy in the browser (done)

DDS 3.1.1 compiled to WebAssembly (324 KB), single-threaded copies in Web Workers. Code, steps and
the full results are in [prototypes/dds/](../prototypes/dds/README.md).

- Its answers match the double dummy stored in the demo game on every real board.
- The opening lead (the costliest card of a hand), 100 sample deals: 0.6 s on Marc's PC with 4
  copies, about 5 s on an iPad (7th generation, 2019), where more copies barely help.
- 200 full tables (every seat in every strain) for a bidding decision: 4.7 s on the PC with 4
  copies, 26 s on the iPad. Too slow: a bidding decision should solve only the contracts it's
  comparing (estimated at about a tenth of that; not yet measured).
- Devices differ about tenfold, so bots should think on the fastest device at the table, and slow
  devices may need fewer samples or the backend.

## Architecture

```
core/bidding/      pure, no I/O, used by the devices (to bid for bots, and for reviews) and tests
  evaluate.ts      hand facts: HCP, shape, length and shortness points, suit quality, stoppers
  system.ts        the system's settings (SAYC defaults), with words for the settings page
  knowledge.ts     what each call has shown: HCP and suit-length ranges per seat
  sayc/*.ts        the rules: for each kind of position, the calls in priority order, each with
                   its meaning, what it shows, and a test on the hand
  bidder.ts        walks the auction: each call's meaning, and the bot's call with its reason
```

- **One table of rules does both jobs.** For each position the rules list the possible calls in
  order, each with what it means. The bot makes the first call whose test its hand passes; the
  meaning of anyone's call is the meaning of the rule that makes it. So the bot's own calls, its
  understanding of other calls, and the review's explanations can't drift apart.
- **What each call has shown** builds up through the auction (HCP range, suit lengths, forcing or
  not), and the rules for later calls use it ("partner has shown 6–10 with 3+ spades").
- **Every call carries its reason,** in a learner's words, and whether it was a **hard call**:
  the rules don't settle it, so the bot chose by a rule of thumb between named candidates. Hard
  calls are what double-dummy simulation will decide in stage 3.
- **No rule fits:** the bot falls back to a natural call or Pass, and says so in its reason ("No
  rule for this yet"), so gaps show up in reviews and reports rather than hiding.
- **Fair:** the bidder sees its own hand, the auction, the vulnerability and the settings, and
  nothing else.
- **Where it runs:** on the owner's device, which already plays the bots' cards; the backend checks
  every call with `core/auction.ts`, as for a person's.

## Stages

1. **Bidding bot, bidding review and bidding practice** (done; details below).
2. **Your SAYC settings** (done): editable on the Bidding system page, kept
   on the device, sent with each game you start or join and fixed there; each side bids by its own
   card (a bot partner by its person's, bots on their own by SAYC as it comes). Choices the rules
   don't act on yet (splinters, inverted minors, new minor forcing, fourth suit forcing, Roman Key
   Card) are shown but can't be changed.
3. **Double dummy in the app** (done): DDS 3.1.1 in WebAssembly
   (`frontend/src/dds/`, our own entry points for a full table or one contract), in a pool of up to
   4 Web Workers started when first needed, behind `DoubleDummySolver` in `core/`.
   - **Scoring without double dummy in the file** (Common Game pages): in bidding practice the owner's
     device solves the contract and saves the result, as an owner enters one with real cards.
   - **Simulation for hard calls** (`core/bidding/simulate.ts`): deal hands that fit what the auction
     has shown for the other three seats (HCP, suit lengths, balanced), solve each candidate's
     contract on each deal, and score the candidates against each other at matchpoints; the best
     wins (the rule of thumb's choice on a tie, or when fewer than 16 deals fit). 60 deals take about
     0.6 s on one thread in Node, less with the workers. Seeded from the hand and the auction, so the
     review runs it again and gets the bot's answer; the review shows each candidate's share.
   - **The simplification:** each candidate is treated as the last call of the auction (everyone
     passes after it). That suits the calls marked hard (compete, double or pass, late in a
     contested auction), not early constructive ones.
   - `npm run bidding-report -- --simulate` runs the bots with simulation, and scores boards whose
     file has no double dummy.
   Gaps in the bidding (conventions not used yet, judgment calls, sharper simulation) are listed in
   the backlog, to take on as feedback comes in.
4. **Card play by sampling,** replacing today's simple rules.
5. **Play review** after the board, then feedback as you go and take-backs.
6. **Bots on the fastest device,** with a backend fallback; bots in games with people ("Add a bot"
   in the lobby).

### Stage 1

- **The SAYC bidder** in `core/bidding/` (above), with SAYC's usual choices as fixed defaults:
  openings, responses, opener's and responder's rebids, 1NT and 2NT structures (Stayman, Jacoby
  transfers), the strong 2♣, weak twos and preempts, Blackwood and Gerber, and simple competition
  (overcalls, takeout doubles, negative doubles, Michaels, the unusual 2NT). Beyond that, a
  general "place the contract" rule from the partnership's known values and fits, then the
  fallback.
- **Bots bid by themselves** in any game played on the devices: the owner's device makes their
  calls after a short pause. The owner no longer bids for them, and their hands aren't shown.
- **Practice with bots** on Home: pick the built-in game or upload one, then **Bidding only**,
  and whether you bid South or watch the bots bid all four seats. No lobby: you're South with a
  bot partner, straight to the first board. A bidding-only board goes from the auction to its
  review, scored with the game file's double dummy (unscored, showing just the contract, when the
  file has none, as with Common Game pages until stage 3).
- **The bidding review:** the summary (contract, result, how it compares), all four hands, and the
  auction; tapping a call shows what it means, why it was chosen, what the auction had shown so
  far, and for your calls what the bot would have bid instead. Hard calls are marked with their
  candidates. Reached from a bidding-only board straight away, and from the result screen of any
  board bid on the devices. Explanations are worked out again when the review opens (the rules are
  repeatable), so improving the rules improves old reviews too.
- **The bidding system page:** the SAYC defaults the bots use, read-only for now (editable in
  stage 2), from the avatar menu, the practice screen and the review.
- **The bidding report** (development): `npm run bidding-report` in `frontend/` runs the bidder
  over every board of a game file and writes each auction with its reasons, and every hard call,
  for skimming and for catching changes that make the bidding worse.
- **Kept on the backend:** a board's auction stays in the snapshot once its result is in (it used
  to be dropped), so reviews work after a reload. Practice games are a new game type, "bidding
  only", created with three bots already seated.
