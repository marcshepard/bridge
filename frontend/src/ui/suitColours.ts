// The colour of each suit's symbol, in one place. Hearts and diamonds red; spades black (the text
// colour, or the card face's ink); clubs black too, or green with "Green clubs" on in the avatar
// menu, for players who find ♣ and ♠ hard to tell apart. A setting on this device; App provides it
// so the switch takes effect everywhere at once. The colours themselves are in theme.ts.

import { createContext, useContext } from "react";
import type { Suit } from "../core/types";

export const GreenClubsContext = createContext(false);

export function useGreenClubs(): boolean {
  return useContext(GreenClubsContext);
}

/** A suit's palette colour on the page ("text.primary", "error.main", "clubs"). */
export function suitColour(suit: Suit, greenClubs: boolean): string {
  if (suit === "H" || suit === "D") return "error.main";
  return suit === "C" && greenClubs ? "clubs" : "text.primary";
}

/** A suit's palette colour on a playing card's face ("card.ink", "card.red", "card.green"). */
export function cardSuitColour(suit: Suit, greenClubs: boolean): string {
  if (suit === "H" || suit === "D") return "card.red";
  return suit === "C" && greenClubs ? "card.green" : "card.ink";
}
