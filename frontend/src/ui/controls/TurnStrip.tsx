// The strip at the top of a board played online (the auction and the card play): something on the
// left (the contract, or "Bidding"), whose turn it is in the middle, something on the right (the
// tricks, or who's vulnerable). The outer columns are the same width, so the turn stays in the
// middle, and its place has a fixed size, so nothing moves under your finger as turns change.
//
// The turn is plain text, not a box: a filled, rounded box reads as a button, and this isn't one.
// When it's yours, it's bold in the primary colour with a small pulsing dot to catch the eye.

import { Box, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import type { ReactNode } from "react";

/** The dot beside "Your turn" swells and fades. */
const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.6); }
`;

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
        {mine && turn !== "" && (
          <Box
            component="span"
            aria-hidden
            sx={(t) => ({
              flexShrink: 0,
              width: t.spacing(1.25),
              height: t.spacing(1.25),
              borderRadius: "50%",
              bgcolor: "primary.main",
              animation: `${pulse} 1.2s ease-in-out infinite`,
              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
            })}
          />
        )}
        {turn}
      </Typography>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>{right}</Box>
    </Box>
  );
}
