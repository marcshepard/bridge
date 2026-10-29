// The strip at the top of a board played online (the auction and the card play): something on the
// left (the contract, or "Bidding"), whose turn it is in the middle, something on the right (the
// tricks, or who's vulnerable). The outer columns are the same width, so the turn box stays in the
// middle, and the box has a fixed size, so nothing moves under your finger as turns change.

import { Box, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import type { ReactNode } from "react";

/** "Your turn" pulses: its background swings between two shades of the primary colour. */
const pulse = keyframes`
  0%, 100% { background-color: var(--pulse-from); }
  50% { background-color: var(--pulse-to); }
`;

interface Props {
  left: ReactNode;
  /** "Your turn", "East's turn"; empty once nobody's turn (the play is over). */
  turn: string;
  /** It's for you to act: the box is in the primary colour and pulses. */
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
        sx={(t) => ({
          width: t.spacing(18),
          minHeight: t.spacing(5),
          px: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          borderRadius: 1,
          lineHeight: 1.2,
          ...(turn === ""
            ? {}
            : mine
              ? {
                  fontWeight: "fontWeightBold",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "--pulse-from": t.vars!.palette.primary.main,
                  "--pulse-to": t.vars!.palette.primary.dark,
                  animation: `${pulse} 1.2s ease-in-out infinite`,
                  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                }
              : { bgcolor: "action.hover", color: "text.secondary" }),
        })}
      >
        {turn}
      </Typography>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>{right}</Box>
    </Box>
  );
}
