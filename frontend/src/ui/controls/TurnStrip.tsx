// The strip at the top of a board played online (the auction and the card play): something on the
// left (the contract, or "Bidding"), whose turn it is in the middle, something on the right (the
// tricks, or who's vulnerable). The outer columns are the same width, so the turn stays in the
// middle, and its place has a fixed size, so nothing moves under your finger as turns change.
//
// The turn is plain text, not a box: a filled, rounded box reads as a button, and this isn't one.
// When it's yours, it's bold in the primary colour with a small pulsing dot to catch the eye.

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { TurnDot } from "./TurnDot";

interface Props {
  left: ReactNode;
  /** "Your turn", "East's turn"; empty once nobody's turn (the play is over). */
  turn: string;
  /** It's for you to act: bold, in the primary colour, with a pulsing dot. */
  mine: boolean;
  right: ReactNode;
}

export function TurnStrip({ left, turn, mine, right }: Props) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 1, alignItems: "center" }}>
      <Box sx={{ minWidth: 0 }}>{left}</Box>
      <Typography
        variant="body2"
        aria-live="polite"
        color={mine ? "primary" : "text.secondary"}
        sx={(t) => ({
          width: t.spacing(18),
          minHeight: t.spacing(5),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.75,
          textAlign: "center",
          lineHeight: 1.2,
          ...(mine && { fontWeight: "fontWeightBold" }),
        })}
      >
        {mine && turn !== "" && <TurnDot />}
        {turn}
      </Typography>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>{right}</Box>
    </Box>
  );
}
