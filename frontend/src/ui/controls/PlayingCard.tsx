// A card on the table: one played to a trick, rank over suit as on a real card's corner. Used by the
// play table and the play review's replay, so both look the same.

import { Box } from "@mui/material";
import type { ReactNode } from "react";
import type { Card } from "../../core/play";
import { SUIT_SYMBOLS } from "../../core/types";

interface Props {
  card: Card;
  /** It's winning (or won) the trick: a raised card with a primary-colour edge. */
  won?: boolean;
  /** It's the card being looked at (the play review): a thick primary-colour edge. */
  current?: boolean;
  label: string;
  /** A small mark in the top-right corner (the play review's). */
  badge?: ReactNode;
  /** A word at the foot of the card, such as "led". */
  note?: string;
}

export function PlayingCard({ card, won = false, current = false, label, badge, note }: Props) {
  return (
    <Box
      aria-label={label || undefined}
      sx={{
        position: "relative",
        width: (t) => t.spacing(5),
        height: (t) => t.spacing(7),
        bgcolor: "card.face",
        border: current ? 2 : 1,
        borderColor: won || current ? "primary.main" : "card.edge",
        boxShadow: won ? 4 : 1,
        borderRadius: 1,
        color: card.suit === "H" || card.suit === "D" ? "card.red" : "card.ink",
        typography: "subtitle1",
        fontWeight: "fontWeightBold",
        lineHeight: 1.1,
        pt: 0.5,
      }}
    >
      {card.rank === "T" ? "10" : card.rank}
      <br />
      {SUIT_SYMBOLS[card.suit]}
      {note && (
        <Box
          component="span"
          aria-hidden
          sx={{ position: "absolute", left: 0, right: 0, bottom: (t) => t.spacing(0.25), typography: "caption", lineHeight: 1, fontWeight: "fontWeightRegular", color: "card.ink" }}
        >
          {note}
        </Box>
      )}
      {badge && (
        <Box aria-hidden sx={{ position: "absolute", top: (t) => t.spacing(-1), right: (t) => t.spacing(-1) }}>
          {badge}
        </Box>
      )}
    </Box>
  );
}
