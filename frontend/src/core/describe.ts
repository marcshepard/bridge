// Plain-English meaning of a result: "Small slam made", "Game down 1", "Doubled part score, down 3".
// Used to annotate the field distribution so a score like +980 reads as "made a small slam".

import { contractTrickPoints, type ScoreBreakdown } from "./scoring";

export type ResultKind = "passout" | "partscore" | "game" | "small-slam" | "grand-slam";

/** What level of contract this was, by bonus category. */
export function resultKind(b: ScoreBreakdown): ResultKind {
  const c = b.result.contract;
  if (!c) return "passout";
  if (c.level === 7) return "grand-slam";
  if (c.level === 6) return "small-slam";
  return contractTrickPoints(c).points >= 100 ? "game" : "partscore";
}

const KIND_NAME: Record<ResultKind, string> = {
  passout: "Passed out",
  partscore: "Part score",
  game: "Game",
  "small-slam": "Small slam",
  "grand-slam": "Grand slam",
};

function tricksPhrase(n: number, word: "overtrick" | "undertrick"): string {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}

/** e.g. "Small slam made +1", "Game down 2", "Doubled part score made (doubled into game)". */
export function describeResult(b: ScoreBreakdown): string {
  const c = b.result.contract;
  if (!c) return "Passed out";

  const kind = resultKind(b);
  // A doubled contract that only counts as game because of the double is worth flagging.
  const undoubledGame = contractTrickPoints({ ...c, doubling: "" }).points >= 100;
  const doubledIntoGame = c.doubling !== "" && kind === "game" && !undoubledGame;

  const prefix = c.doubling === "X" ? "Doubled " : c.doubling === "XX" ? "Redoubled " : "";
  const name = doubledIntoGame ? "part score" : KIND_NAME[kind].toLowerCase();
  const subject = prefix ? `${prefix}${name}` : KIND_NAME[kind];
  const head = doubledIntoGame ? `${subject} (${prefix.trim().toLowerCase()} into game)` : subject;

  if (b.made) {
    return b.overUnder === 0 ? `${head} made` : `${head} made with ${tricksPhrase(b.overUnder, "overtrick")}`;
  }
  return `${head} down ${-b.overUnder}`;
}
