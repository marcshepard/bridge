// Assigning seats once partnerships are chosen.
//
// Which seat anyone gets doesn't matter for fairness: nobody knows the hands in advance, and each
// pair is compared only with the field in its own direction. So the only real choice is who
// partners whom; the seats themselves are assigned at random.

import type { Seat } from "../../frontend/src/core/types";

/** `random` returns a number in [0, 1); injectable so tests can be deterministic. */
export function assignSeats(
  slots: number[],
  creatorSlot: number,
  partnerSlot: number | "random",
  random: () => number = Math.random,
): Map<number, Seat> {
  if (slots.length !== 4) throw new Error("Need exactly 4 players");
  const others = slots.filter((s) => s !== creatorSlot);
  const partner = partnerSlot === "random" ? others[Math.floor(random() * others.length)]! : partnerSlot;
  if (!others.includes(partner)) throw new Error("Partner must be one of the other players");

  const pairA = [creatorSlot, partner];
  const pairB = slots.filter((s) => !pairA.includes(s));
  const flip = <T>(pair: T[]) => (random() < 0.5 ? pair : [pair[1]!, pair[0]!]);

  // Randomly decide which pair sits North–South, and who sits where within each pair.
  const [ns, ew] = random() < 0.5 ? [pairA, pairB] : [pairB, pairA];
  const [n, s] = flip(ns!);
  const [e, w] = flip(ew!);
  return new Map<number, Seat>([
    [n!, "N"],
    [s!, "S"],
    [e!, "E"],
    [w!, "W"],
  ]);
}
