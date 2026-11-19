// Seeded, synthetic-deal probes for the bot-engine review. Does not change either engine.
// Bundle from frontend with rolldown to node_modules/.cache/bot-audit.mjs, next to dds.wasm.
// Run that bundle with Node, optionally passing transfers, probes, or play.
import { auctionResult, isAuctionOver, parseCall, type Call } from '../src/core/auction';
import { botAuction, chooseCall, positionAt } from '../src/core/bidding/bidder';
import { evaluate } from '../src/core/bidding/evaluate';
import { dealsFittingAuction } from '../src/core/bidding/simulate';
import { playContext } from '../src/core/cardplay/context';
import { decideCard, simulateCards } from '../src/core/cardplay/decide';
import { checkClaim } from '../src/core/cardplay/claims';
import { decider, hiddenSeats, voids } from '../src/core/cardplay/sample';
import { parseHand } from '../src/core/deal';
import { imps } from '../src/core/imps';
import { cardCode, cardsOf, legalCards, playCard, startPlay, toPlay, tricksLeft, tricksWon, type PlayState } from '../src/core/play';
import { hash, seeded } from '../src/core/random';
import { scoreResult } from '../src/core/scoring';
import { RANKS, SEATS, SUITS, directionOf, type Hand, type Seat, type Strain } from '../src/core/types';
import { SyncSolver } from '../src/dds/syncSolver';

const rng = seeded(20261112);
const dealer = 'N';
const deal = { dealer, vul: 'None' } as const;
const solver = new SyncSolver();
const callsOf = (s: string) => s.split(' ').map((c) => parseCall(c)!);
const name = (c: Call) => c.kind === 'bid' ? `${c.level}${c.strain}` : c.kind;
const handText = (h: Hand) => SUITS.map((s) => h[s]).join('.');
const handsText = (hands: Record<Seat, Hand>) => SEATS.map((s) => handText(hands[s])).join(' ');

function randomHands() {
  const deck = SUITS.flatMap((suit) => [...RANKS].map((rank) => ({ suit, rank })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return Object.fromEntries(SEATS.map((seat, i) => {
    const cards = deck.slice(i * 13, (i + 1) * 13);
    const hand = Object.fromEntries(SUITS.map((suit) => [suit, [...RANKS].filter((rank) => cards.some((c) => c.suit === suit && c.rank === rank)).join('')]));
    return [seat, hand];
  })) as Record<Seat, Hand>;
}

async function ddScore(hands: Record<Seat, Hand>, strain: Strain, level: number, declarer: Seat) {
  const [tricks] = await solver.tricks([{ hands, strain, declarer }]);
  if (tricks === undefined) throw new Error('DDS did not return a trick count');
  return { tricks, score: scoreResult({ contract: { strain, level, doubling: '' }, declarer, tricks }, deal.vul).declarerScore };
}

async function bidding() {
  const missed = [];
  const forced = [];
  const secondMajor = [];
  let ntRebids = 0;
  let twoOverOnes = 0;
  let hard = 0;
  let starved = 0;
  let passNotClosing = 0;
  let hardExample: unknown;
  for (let i = 0; i < 2_000; i++) {
    const hands = randomHands();
    const decisions = botAuction(hands, deal);
    const calls = decisions.map((d) => d.call);
    for (let j = 0; j < calls.length; j++) {
      if (!decisions[j]!.hard || hard >= 100) continue;
      const p = positionAt(deal, calls.slice(0, j));
      const callKey = p.calls.map(name).join(' ');
      const auditRandom = seeded(hash(`${handText(hands[p.seat])}|${p.dealer}|${p.vul}|${callKey}`));
      const count = dealsFittingAuction(p, hands[p.seat], 60, 40_000, auditRandom).length;
      hard++;
      if (!isAuctionOver([...p.calls, { kind: 'pass' }])) passNotClosing++;
      if (count < 16) {
        starved++;
        hardExample ??= { calls: calls.slice(0, j).map(name), hands: handsText(hands), reasons: decisions.slice(0, j).map((d) => d.reason), count, shown: Object.fromEntries(SEATS.map((s) => [s, p.shown[s].hcp])) };
      }
    }
    if (!isAuctionOver(calls)) continue;
    const start = calls.findIndex((c) => c.kind === 'bid');
    if (start < 0) continue;
    const [open, opp, response, opp2, rebid, opp3, again] = calls.slice(start);
    if (open?.kind !== 'bid' || open.level !== 1 || open.strain === 'NT' || opp?.kind !== 'pass' || opp2?.kind !== 'pass' || opp3?.kind !== 'pass' || response?.kind !== 'bid' || response.strain === 'NT' || response.strain === open.strain || rebid?.kind !== 'bid') continue;
    const responder = SEATS[(start + 2) % 4]!;
    const opener = SEATS[start % 4]!;
    const result = auctionResult(dealer, calls)!;
    const rebidMajor = rebid.strain === 'H' || rebid.strain === 'S';
    const support = hands[responder][rebid.strain as keyof Hand]?.length ?? 0;
    if (response.level === 1 && rebidMajor && rebid.strain !== open.strain && rebid.strain !== response.strain && support >= 4 && evaluate(hands[responder]).hcp >= 12 && result.contract && result.contract.strain !== rebid.strain && calls.slice(start + 7).every((c) => c.kind === 'pass')) {
      const actual = await ddScore(hands, result.contract.strain, result.contract.level, result.declarer!);
      const alternative = await ddScore(hands, rebid.strain, 4, opener);
      secondMajor.push({ calls: calls.map(name), hands: handsText(hands), actual, alternative });
    }
    if (rebid.level === 1 && rebid.strain === 'NT' && (response.strain === 'H' || response.strain === 'S')) {
      ntRebids++;
      const h = evaluate(hands[responder]);
      if (h.len[response.strain] >= 6 && h.hcp >= 13 && again?.kind === 'bid' && again.level === 3 && again.strain === 'NT' && result.contract?.strain === 'NT') {
        missed.push({ calls: calls.map(name), hands: handsText(hands), actual: await ddScore(hands, 'NT', result.contract.level, result.declarer!), alternative: await ddScore(hands, response.strain, 4, responder) });
      }
    }
    if (response.level === 2 && start < 2 && positionAt(deal, calls.slice(0, start + 3)).read.at(-1)?.forcing === 'one round') {
      twoOverOnes++;
      if (again?.kind === 'pass' && result.contract && (result.contract.strain === 'NT' ? result.contract.level < 3 : result.contract.level <= 3) && calls.slice(start + 5).every((c) => c.kind === 'pass')) {
        const games = await Promise.all(([['NT', 3], ['H', 4], ['S', 4], ['D', 5], ['C', 5]] as const).map(async ([strain, level]) => {
          const first = [open, response, rebid].findIndex((c) => c.strain === strain);
          const declarer = first === 0 || first === 2 ? opener : responder;
          return { strain, level, declarer, ...await ddScore(hands, strain, level, declarer) };
        }));
        const actual = await ddScore(hands, result.contract.strain, result.contract.level, result.declarer!);
        forced.push({ calls: calls.map(name), hands: handsText(hands), actual, bestGame: games.sort((a, b) => b.score - a.score)[0] });
      }
    }
  }
  const availableGame = forced.filter((f) => f.bestGame!.tricks >= f.bestGame!.level + 6);
  console.log(JSON.stringify({ ntRebids, missed, twoOverOnes, prematurePasses: forced.length, availableGame: availableGame.length, examples: availableGame.slice(0, 4), secondMajor, hard, starved, passNotClosing, hardExample }, null, 2));
}

async function transfers() {
  const examples = [];
  let auctions = 0;
  let better = 0;
  let worse = 0;
  let tied = 0;
  let pairedImps = 0;
  for (let i = 0; i < 100_000; i++) {
    const hands = randomHands();
    const h = evaluate(hands.N);
    if (!h.balanced || h.hcp < 20 || h.hcp > 21) continue;
    const decisions = botAuction(hands, deal);
    const calls = decisions.map((d) => d.call);
    const prefix = calls.slice(0, 7).map(name).join(' ');
    if (prefix !== '2NT pass 3H pass 3S pass 3NT' && prefix !== '2NT pass 3D pass 3H pass 3NT') continue;
    auctions++;
    const strain = prefix.startsWith('2NT pass 3H') ? 'S' : 'H';
    if (hands.N[strain].length < 3 || calls[8]?.kind !== 'pass') continue;
    const actual = await ddScore(hands, 'NT', 3, 'N');
    const alternative = await ddScore(hands, strain, 4, 'N');
    if (alternative.score > actual.score) better++;
    else if (alternative.score < actual.score) worse++;
    else tied++;
    pairedImps += imps(alternative.score - actual.score);
    if (actual.tricks < 9 && alternative.tricks >= 10 && examples.length < 2) examples.push({ prefix, hands: handsText(hands), actual, alternative });
  }
  console.log(JSON.stringify({ auctions, better, worse, tied, pairedImps, examples }, null, 2));
}

async function probes() {
  const cases = [
    { name: '19 HCP with a second suit', hand: 'AKJ84.76.AKQ7.Q4', auction: '1S PASS 1NT PASS' },
    { name: 'Two suits after a transfer', hand: 'KJ984.7.AQJ98.Q4', auction: '1NT PASS 2H PASS 2S PASS' },
    { name: 'Strong responder after superaccept', hand: 'KJT98.AQJ.AK4.82', auction: '1NT PASS 2H PASS 3S PASS' },
  ];
  for (const c of cases) {
    const d = chooseCall(parseHand(c.hand), deal, callsOf(c.auction));
    console.log(c.name, name(d.call), d.reason);
  }

  const north = parseHand('AQ74.K84.KQ6.K93');
  const south = parseHand('KJT98.AQJ.AJ4.A2');
  const unseen = SUITS.flatMap((suit) => [...RANKS].filter((r) => !north[suit].includes(r) && !south[suit].includes(r)).map((rank) => ({ suit, rank })));
  const east = Object.fromEntries(SUITS.map((suit) => [suit, unseen.filter((c, i) => c.suit === suit && i % 2 === 0).map((c) => c.rank).join('')])) as Hand;
  const west = Object.fromEntries(SUITS.map((suit) => [suit, unseen.filter((c, i) => c.suit === suit && i % 2 === 1).map((c) => c.rank).join('')])) as Hand;
  const slamHands = { N: north, E: east, S: south, W: west };
  const slamCalls = botAuction(slamHands, deal).map((d) => d.call);
  console.log('Slam after a superaccept', { hands: handsText(slamHands), calls: slamCalls.map(name), grand: await ddScore(slamHands, 'S', 7, 'N') });

  for (let i = 0; i < 100; i++) {
    const hands = randomHands();
    let state = startPlay(hands, 'NT', 'N');
    while (tricksLeft(state) > 2) state = playCard(state, legalCards(state, toPlay(state))[0]!);
    if (toPlay(state) !== 'N') continue;
    const job = { hands: state.hands, trump: state.trump, leader: toPlay(state), trick: [] };
    const [row] = await solver.cards([job]);
    const nsTricks = Math.max(...row!.map((r) => r.tricks));
    if (nsTricks >= 2) continue;
    const ctx = playContext(deal, []);
    const claim = { seat: 'N', tricks: 2, acceptedBy: [] } as const;
    const consistent = await checkClaim(state, { ...claim, acceptedBy: [] }, 'E', ctx, solver);
    ctx.shown.W.hcp = [30, 37];
    const inconsistent = await checkClaim(state, { ...claim, acceptedBy: [] }, 'E', ctx, solver);
    console.log('Claim with deliberately inconsistent auction evidence', { hands: handsText(hands), nsTricks, consistent, inconsistent });
    break;
  }
}

async function exactPlay(state: PlayState, level: number, baseline: string, alternative: string) {
  const [a, b] = hiddenSeats(state, decider(state, toPlay(state)));
  if (!a || !b) throw new Error('Expected two hidden hands');
  const aSize = cardsOf(state.hands[a]).length;
  const pool = [...cardsOf(state.hands[a]), ...cardsOf(state.hands[b])];
  const out = voids(state);
  const jobs = [];
  for (let mask = 0; mask < 2 ** pool.length; mask++) {
    const aa = pool.filter((_, j) => mask & (1 << j));
    if (aa.length !== aSize || aa.some((c) => out[a].has(c.suit))) continue;
    const bb = pool.filter((_, j) => !(mask & (1 << j)));
    if (bb.some((c) => out[b].has(c.suit))) continue;
    const asHand = (cards: typeof pool) => Object.fromEntries(SUITS.map((s) => [s, [...RANKS].filter((r) => cards.some((c) => c.suit === s && c.rank === r)).join('')])) as Hand;
    jobs.push({ hands: { ...state.hands, [a]: asHand(aa), [b]: asHand(bb) }, leader: toPlay(state), trump: state.trump, trick: [] });
  }
  const rows = await solver.cards(jobs);
  const counts: Record<string, Record<number, number>> = { [baseline]: {}, [alternative]: {} };
  let impGain = 0;
  for (const row of rows) {
    const scores = [baseline, alternative].map((code) => {
      const tricks = tricksWon(state).declarer + row.find((r) => cardCode(r.card) === code)!.tricks;
      counts[code]![tricks] = (counts[code]![tricks] ?? 0) + 1;
      return scoreResult({ contract: { strain: state.trump, level, doubling: '' }, declarer: state.declarer, tricks }, deal.vul).declarerScore;
    });
    impGain += imps(scores[1]! - scores[0]!);
  }
  return { deals: jobs.length, trickCounts: counts, pairedImpGain: impGain / jobs.length };
}

async function play() {
  const ctx = { ...playContext(deal, []), readCarding: false };
  const examples = [];
  for (let i = 0; i < 100 && examples.length < 3; i++) {
    const hands = randomHands();
    let state = startPlay(hands, 'NT', 'N');
    const history = [];
    while (tricksLeft(state) > 5) {
      const legal = legalCards(state, toPlay(state));
      const c = legal[Math.floor(rng() * legal.length)]!;
      history.push(cardCode(c));
      state = playCard(state, c);
    }
    if (directionOf(toPlay(state)) !== 'NS' || legalCards(state, toPlay(state)).length < 2) continue;
    const sim = await simulateCards(state, ctx, solver, 40);
    if (!sim) continue;
    const actual = cardCode((await decideCard(state, ctx, solver, { simulation: sim })).card);
    const prior = tricksWon(state).declarer;
    for (const level of [1, 3, 6]) {
      const values = legalCards(state, toPlay(state)).map(cardCode).map((card) => {
        const total = sim.perDeal.reduce((sum, row, j) => {
          const tricks = prior + row.get(card)!;
          return sum + sim.deals[j]!.weight * scoreResult({ contract: { strain: 'NT', level, doubling: '' }, declarer: 'N', tricks }, 'None').declarerScore;
        }, 0);
        const making = sim.perDeal.reduce((sum, row, j) => sum + (prior + row.get(card)! >= level + 6 ? sim.deals[j]!.weight : 0), 0);
        return { card, points: total / sim.total, making: making / sim.total };
      }).sort((a, b) => b.points - a.points);
      const baseline = values.find((v) => v.card === actual)!;
      if (values[0]!.points - baseline.points >= 45 && values[0]!.making > baseline.making + 0.1) {
        examples.push({ hands: handsText(hands), history, level, prior, baseline, alternative: values[0], deals: sim.deals.length, exact: await exactPlay(state, level, baseline.card, values[0]!.card) });
        break;
      }
    }
  }
  console.log(JSON.stringify(examples, null, 2));
}

if (process.argv.includes('play')) await play();
else if (process.argv.includes('transfers')) await transfers();
else if (process.argv.includes('probes')) await probes();
else await bidding();
