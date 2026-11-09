// Random deals that keep one hand fixed, the way a bot samples the hands it can't see.

const SEATS = ["N", "E", "S", "W"];
const SUITS = ["S", "H", "D", "C"];
const RANKS = "AKQJT98765432";

/** A small seeded random generator (mulberry32), so every run deals the same hands. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "AQ84.QT98.J.KQ43" → ["SA", "SQ", ...] */
function cardsOf(hand) {
  return hand.split(".").flatMap((ranks, i) => [...ranks].map((r) => SUITS[i] + r));
}

function handString(cards) {
  return SUITS.map((s) =>
    cards
      .filter((c) => c[0] === s)
      .map((c) => c[1])
      .sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b))
      .join(""),
  ).join(".");
}

/** `count` deals with `seat` holding `hand` and the other 39 cards dealt at random. */
export function sampleDeals(seat, hand, count, rand) {
  const mine = new Set(cardsOf(hand));
  const rest = SUITS.flatMap((s) => [...RANKS].map((r) => s + r)).filter((c) => !mine.has(c));
  const others = SEATS.filter((s) => s !== seat);
  return Array.from({ length: count }, () => {
    const deck = [...rest];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const deal = { [seat]: hand };
    others.forEach((s, k) => (deal[s] = handString(deck.slice(k * 13, k * 13 + 13))));
    return deal;
  });
}
