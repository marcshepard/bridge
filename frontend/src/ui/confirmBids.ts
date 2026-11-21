// Whether a bid needs confirming ("Confirm bids", in the avatar menu): on, you pick a bid and then
// tap Submit, seeing what it means (and the bot hint) first; off, a bid goes as soon as you tap it.
// A setting on this device, read here by the bidding screen so the switch takes effect at once.

import { createContext, useContext } from "react";

export const ConfirmBidsContext = createContext(true);

export function useConfirmBids(): boolean {
  return useContext(ConfirmBidsContext);
}
