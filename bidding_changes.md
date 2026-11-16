# Proposed bidding changes

These cases are in discussion order. The original calls document the behavior that prompted the changes. Unshown opponents pass except in the competitive examples. Examples use the default system and neither side is vulnerable. Double-dummy scores show what was available on the full deal. The revised bids use what the player can know during the auction.

## 1A. Keep bidding when responder knows the partnership has game values

**Hand and auction.** West holds ♠K ♥AQJT5 ♦J9 ♣AQ542 (17 HCP). East opens `1♠`, West responds `2♥`, and East rebids `2♠`. West is next.

**Current bid and algorithm.** West passes. The responder rules look for a fit in opener’s suit, then game in notrump, then invitations or a preference. West has one spade, ♦J9 fails the stopper test for `3NT`, and the rules offer no natural `3♣` here. The catch-all pass fires even though 17 HCP plus the bottom of opener’s range already gives game values.

**Proposed bid and change.** Bid `3♣`, natural and forcing for at least one round. Show the second five-card suit and let opener help choose the game. On the audit deal, `2♠` scored +200 and `3NT` by West scored +460 double dummy. The hand has enough strength to explore further, but `3♣` gives opener useful information before West commits to a strain.

At constructive placement, check whether the partnership has game values from the acting hand and the strength and fit already shown. Use the bottom of partner’s credible range to distinguish known game values from an invitation. Count fit values when the fit is established. When game is warranted and the strain remains open, offer a forcing descriptive bid and carry the commitment to game through the continuation. A failed stopper check should redirect the auction toward finding a strain.

**Additional test after a one-level response.** North holds ♠4 ♥AJ3 ♦AJ874 ♣KT82. South holds ♠AKJ87 ♥64 ♦KQ3 ♣AJ9 (18 HCP). After `1♦–1♠–2♣`, the original bidder made a minimum `2♦` preference because hearts failed the notrump stopper test. With game values and no clear suit game, the revised bidder chooses `3NT` on this hand. A fourth-suit inquiry would let the partnership check the heart stopper first. The ACBL booklet gives an example in which that inquiry forces for one round, and the app’s fourth-suit treatment remains a separate decision. [Responder rules](frontend/src/core/bidding/sayc/constructive.ts) · [ACBL SAYC booklet](https://web2.acbl.org/documentLibrary/play/SP3%20%28bk%29%20single%20pages.pdf)

## 1B. Honor the unpassed responder’s rebid obligation in SAYC

**Hand and auction.** North holds ♠AQJ74 ♥A3 ♦J864 ♣53 (12 HCP). South holds ♠82 ♥KJ6 ♦T92 ♣AQ764 (10 HCP). South has not passed before responding. The auction is `1♠–2♣–2♦`, with South next.

**Current bid and algorithm.** South passes. The engine records that `2♣` forces opener for one round. Once opener bids `2♦`, the engine checks only the latest call for a one-round force and misses responder’s obligation to describe the hand again.

**Proposed bid and change.** Bid `2♠`, a minimum preference. North can pass. I fed that continuation to the current bot and verified North’s pass. Track the obligation created by an unpassed hand’s original two-level new-suit response until responder rebids or opener reaches game. Apply it to an opener who repeats their own suit as well. Test the passed-hand exception and a weak one-level response where pass is available. If we choose a partnership agreement that lets a minimum responder pass here, the game-values fix in 1A still applies. [Forcing rules](frontend/src/core/bidding/position.ts#L84) · [ACBL SAYC booklet](https://web2.acbl.org/documentLibrary/play/sayc_book.pdf)

## 1C. Give a maximum opener a forcing rebid

**Hand and auction.** North holds ♠AKJ84 ♥76 ♦AKQ7 ♣Q4 (19 HCP). The auction is `1♠–1NT`, with North next.

**Current bid and algorithm.** North bids a nonforcing `2♦`. The normal second-suit rule checks shape and finds four diamonds. The balanced notrump rebid does not apply to this 5–4–2–2 hand, and there is no strong jump shift in the rebid rules.

**Proposed bid and change.** Bid `3♦`, a strong jump shift forcing to game. Add that rule ahead of the ordinary second-suit rebid and describe both the strength and suit in the auction reader. Test that the same shape with a normal minimum still rebids `2♦`, and that an auction already forced to game can show diamonds economically. [Current opener rebids](frontend/src/core/bidding/sayc/constructive.ts#L199) · [ACBL SAYC booklet](https://web2.acbl.org/documentLibrary/play/sayc_book.pdf)

## 2. Show the six-card major after opener rebids 1NT

**Hand and auction.** South holds ♠KJT963 ♥K4 ♦AJ ♣K75 (15 HCP). The auction is `1♣–1♠–1NT`, with South next.

**Current bid and algorithm.** South bids `3NT`. The rule for 13+ HCP runs before the existing `4♠` rule for a six-card major with game values. North held three spades. The audit deal gave `3NT` down one (−50) and `4♠` by South making eleven (+450).

**Proposed bid and change.** Bid `4♠` with this ordinary game-going hand. The balanced rebid promises at least two spades, so responder already knows there is a fit. Check the six-card major before the general `3NT` signoff. Include a five-card-major control, a weak six-card-major control, and a strong hand that should explore slam before signing off. [Current 1NT rebid continuations](frontend/src/core/bidding/sayc/constructive.ts#L440)

## 3. Raise opener’s second suit when it reveals a major fit

**Hand and auction.** West holds ♠QJ74 ♥QT8 ♦AJ72 ♣QJ (13 HCP). East opens `1♣` after North passes. West bids `1♦` and East rebids `1♠`, showing at least four spades. West is next.

**Current bid and algorithm.** West bids `3NT`. The responder rules check for game in opener’s first suit and for notrump with stoppers. They omit the direct raise of opener’s second major. The audit deal gave `3NT` down two (−100) and `4♠` by East making (+420).

**Proposed bid and change.** Bid `4♠`. Add the known 4–4 fit to the responder’s choices before signing off in `3NT`. Provide a raise appropriate to responder’s strength and the height of the auction. Test a minimum hand that can support below game and a hand with only three spades that still needs another reason to choose spades. [Current responder rebids](frontend/src/core/bidding/sayc/constructive.ts#L454)

## 4. Let opener choose the game after a transfer over 2NT

**Hand and auction.** North holds ♠QJ5 ♥AKQJ ♦K76 ♣A85 (20 HCP). The auction is `2NT–3♦–3♥–3NT`, with North next. South has shown exactly five hearts and offered a choice of games.

**Current bid and algorithm.** North passes with four hearts. The code handles the choice after a transfer over `1NT`. The same position after `2NT` falls through to a rule that treats `3NT` as responder’s final choice. The audit deal gave `3NT` down one (−50) and `4♥` making (+420), both by North.

**Proposed bid and change.** Bid `4♥` with North’s nine-card fit. Add the opener’s choice after transfers over `2NT` and the `2♣–2♦–2NT` rebid that uses the same structure. With two trumps, pass `3NT`. With three, test a judgment rule using shape and side-suit strength before changing the default. Among 76 audited positions where opener passed with at least three trumps, a blanket switch to four of the major improved the double-dummy score on 38, worsened it on 34, and tied on four. [Current transfer continuations](frontend/src/core/bidding/sayc/notrump.ts#L279)

## 5. Show a second suit after an ordinary transfer

**Hand and auction.** South holds ♠KJ984 ♥7 ♦AQJ98 ♣Q4 (13 HCP). The auction is `1NT–2♥–2♠`, with South next.

**Current bid and algorithm.** South bids `3NT`. The transfer continuation looks at the length of the transferred major and responder’s HCP. Five spades and game strength match the notrump rule, which never checks the diamond suit or the singleton heart.

**Proposed bid and change.** Bid `3♦`, natural and game forcing. Add a new-suit continuation ahead of the `3NT` choice for a hand with a genuine second suit and game strength. Record both suits and the force in the auction reader. Test opener’s ability to show major support or consider notrump after hearing about diamonds. Keep `3NT` as a choice of games on an ordinary game-going five-card-major hand without a second suit to show. [Transfer rules](frontend/src/core/bidding/sayc/notrump.ts#L248) · [ACBL SAYC booklet](https://web2.acbl.org/documentLibrary/play/sayc_book.pdf)

## 6. Leave room for slam after a transfer super-accept

**Hand and auction.** South holds ♠KJT98 ♥AQJ ♦AJ4 ♣A2 (20 HCP). North holds ♠AQ74 ♥K84 ♦KQ6 ♣K93 (17 HCP). The auction is `1NT–2♥–3♠`, with South next. The super-accept has shown a maximum and at least four spades.

**Current bid and algorithm.** South bids `4♠`. The super-accept branch offers only `4♠` or pass. The auction ends in game despite 37 known combined HCP and a nine-card fit. On this deal spades take all thirteen tricks double dummy.

**Proposed bid and change.** Bid `4NT` as Blackwood under the default card. South has a control in every side suit and knows spades are agreed. Route a strong hand after a super-accept into the existing slam rules and explicitly read `4NT` using the card’s ace-asking agreement in this sequence. Keep the normal game signoff and weak pass available. The regression should require that South investigates slam and that North understands the ask. Choosing between six and seven is a later decision in the auction. [Super-accept continuation](frontend/src/core/bidding/sayc/notrump.ts#L248)

## 7. Keep support points distinct from HCP in competitive auctions

**Hand and auction.** South holds ♠5 ♥7632 ♦3 ♣KQJ9543 (6 HCP and 12 support points for hearts). North opens `1♥`, East overcalls `1♠`, and South bids the `2♠` cuebid raise. West follows with `3♥`, a cuebid raise of spades. North holds ♠87 ♥AKT84 ♦Q87 ♣A76 (13 HCP) and is next.

**Original bid and algorithm.** South’s `2♠` is the bid produced by the app’s competitive agreements. Whether to cue-bid or raise preemptively with these cards is a separate judgment. The old auction reader stored the bid as a minimum of 10 HCP, even though the bidding rule used support points. The two cuebids both got that treatment. From North’s seat the resulting HCP minimums were 13 in hand, 8 for East, 10 for South, and 10 for West. That totals 41 in a 40-HCP deck. The bidding sampler found zero deals and North fell back to the rule-based double.

**Bidding and sampling change.** South still bids `2♠`. The reader records support, fit, and length values separately from HCP. The change covers the two cuebid raise paths, Jordan `2NT`, constructive raises, and several length-based rebids. Both samplers use the separate measures when evaluating a hand, and the bidding sampler widens uncertain auction evidence in stages when too few deals fit. The bidder’s own hand stays fixed. The regression checks that hands under 10 HCP can fit this cuebid with sufficient support points. [Cuebid raise rules](frontend/src/core/bidding/sayc/competition.ts) · [Bidding sampler](frontend/src/core/bidding/simulate.ts)

## 8A. Leave partner’s penalty double in

**Hand and auction.** West holds ♠QT6 ♥Q432 ♦J62 ♣QJT (8 HCP). North passes, East opens `1♦`, and South overcalls `1NT`. West is next. The other hands are North ♠9842 ♥985 ♦4 ♣K9653, East ♠AK73 ♥A76 ♦QT83 ♣84, and South ♠J5 ♥KJT ♦AK975 ♣A72.

**Original bid and algorithm.** When West doubled and South’s partner passed, East pulled the double to `2NT`. The generic placement rule saw enough combined strength to invite game and overlooked partner’s penalty double. On this layout, `2NT` scores −100 for East–West. Defending `1NT` doubled scores +300, versus +100 if West never doubles.

**Correct bid and change.** East passes. After an uncontested penalty double of the `1NT` overcall, opener leaves partner’s double in. The old `2NT` continuation is a bidding regression case. It is a poor basis for teaching the simulation to prefer West’s pass. [Competitive bidding](frontend/src/core/bidding/sayc/competition.ts)

## 8B. Score the auction that follows the competitive call

**Fixture.** Use case 7 and add East ♠QJ9632 ♥J9 ♦A654 ♣8 and West ♠AKT4 ♥Q5 ♦KJT92 ♣T2. North is considering what to do over West’s artificial `3♥` cuebid. If North passes, the old evaluator scores `3♥` by West. East holds six spades opposite spade support and corrects to `3♠`. The bot auction on these cards continues to `4♠` by East. The model must account for East’s `3♠`, regardless of which candidate wins overall.

**Evaluation change.** The report option `--continue-auction` uses the ordinary bidder for subsequent turns on each sampled deal. Each seat uses its own hand and the public auction, and no subsequent call starts another simulation. The evaluator scores the resulting contract with DDS. A targeted test checks the open pass and confirms that a true closing pass still ends the auction immediately. [Competitive simulation](frontend/src/core/bidding/simulate.ts)

The [synthetic-deal audit harness](frontend/scripts/bot-audit.ts) records the original audit probes. The regression tests check the revised calls, their meanings, the sampling fix, and the competitive continuation.

On 1,200 fresh synthetic deals, the revised rule-based partnership gained 80 IMPs in total against the original bidder, using double-dummy scores. The comparison kept the opposing partnership fixed and varied the dealer and vulnerability. The revised bidder changed 44 auctions, improved the score on 17, and worsened it on eight. This measures the combined rule changes on that sample.

In the trial of competitive simulation on 45 positions, following the remaining bidding changed six calls and lost 9 IMPs in total when both choices were scored after rule-based continuations on the actual deals. The experiment remains available in the report. Live bidding still scores each candidate with the current end-of-auction assumption.

## Ideas to revisit for bidding and play

- Build a corpus of full deals with dealer and vulnerability. Common Game sessions are a candidate source. Where available, keep raw North–South traveller scores for comparison with the field. Split whole sessions roughly 80/20 for tuning and evaluation, and keep repeated deals on the same side of the split. Use fresh sessions for confirmation once the evaluation results have informed a change. Keep the existing regression hands for testing specific agreements and bugs.
- Compare two bidding versions on identical deals with fixed opposition. Score the resulting contracts with the same double-dummy solver, calculate the IMP difference on each board, and report the average with a paired confidence interval. The archived field is a secondary comparison because its scores reflect both human bidding and play.
- For a disputed bid, fix the bidder’s hand and the auction so far. Try each plausible call on the same sampled layouts consistent with that information. Let partner and the opponents respond, then compare the contracts and paired IMP results. The preferred call depends on what the bidder knew and how the rest of the auction and play are modeled.
- For auctions such as gambling 3NT, compare the double-dummy result with a run using the same card-play bots for both versions. Let each opening leader use their own hand and that auction, and let the rest of the play proceed with the information visible at each turn. Check how sensitive the result is to the opening-lead style.
- For play changes, hold the deal, auction, contract, and declarer fixed and change the play policy being evaluated. Revisit scoring card choices in IMPs, since risking game for an overtrick can lose more than it gains. Also revisit playing on when a bot cannot verify a claim, and test single-dummy planning in short endings where the bot must choose a line without knowing the hidden cards.
