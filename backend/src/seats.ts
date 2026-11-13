// Assign the compass seats before play starts.

import { SEATS, type Seat } from "../../frontend/src/core/types";

/** Every player at this table must be assigned exactly one of the four seats. */
export function manualSeats(slots: number[], chosen: Record<Seat, number>): Map<number, Seat> {
  const assigned = SEATS.map((seat) => chosen?.[seat]);
  if (new Set(assigned).size !== SEATS.length || !assigned.every((slot) => slots.includes(slot))) {
    throw new Error("Assign one different player to each seat");
  }
  return new Map(SEATS.map((seat) => [chosen[seat], seat]));
}

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
