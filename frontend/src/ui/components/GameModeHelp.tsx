// The "?" that explains the two ways to play a game, real cards or online. The same words wherever
// the choice is made (Start a game) or shown (the lobby).

import { HelpTip } from "../controls/HelpTip";

export function GameModeHelp() {
  return (
    <HelpTip label="About real cards and playing online">
      <span>
        <strong>Real cards:</strong> everyone needs their own deck. Each device shows the 13 cards you deal yourself
        from your deck; you bid and play at the table as usual. The owner enters each result, and the app scores it
        against the original game's field, with its analysis.
      </span>
      <span>
        <strong>Online:</strong> no cards needed. You bid and play on your phones, tablets or computers, and the app
        saves each result by itself.
      </span>
    </HelpTip>
  );
}
