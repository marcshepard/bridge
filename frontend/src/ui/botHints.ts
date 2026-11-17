// Whether bot hints are on ("✓ The bot would bid this too", "✓ The bot would play this too"): a
// setting on this device, switched in the avatar menu during a game on the devices. The bidding and
// play screens read it from here, so the switch takes effect at once without passing it down.

import { createContext, useContext } from "react";

export const BotHintsContext = createContext(false);

export function useBotHints(): boolean {
  return useContext(BotHintsContext);
}
