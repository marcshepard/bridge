// The four seats round the table, each in a box of the same size: half the width. West and East
// share the middle row; North and South are centred above and below, as in a printed hand diagram
// (no empty middle square, so each box is as wide as it can be). By default it's turned so you're
// at the bottom: partner opposite, left-hand opponent on your left, right-hand opponent on your
// right. A hand diagram (all four hands once the board is over) keeps the standard layout instead,
// South at the bottom (`bottom`). What goes in each box (its heading too) is the caller's.

import { Box, Paper } from "@mui/material";
import type { ReactNode } from "react";
import { type Seat, SEATS } from "../../core/types";
import { relationTo, type Relation } from "../labels";

const AREA: Record<Relation, string> = { you: "bottom", lho: "left", partner: "top", rho: "right" };

interface Props {
  /** Your seat: highlighted, and drawn at the bottom unless `bottom` says otherwise. */
  me: Seat;
  /** The seat drawn at the bottom (South, for a standard hand diagram). */
  bottom?: Seat;
  /** What each seat's box holds. */
  seats: Record<Seat, ReactNode>;
  /** Names the group for screen readers. */
  label?: string;
}

export function Compass({ me, bottom = me, seats, label = "Who sits where" }: Props) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: "grid",
        // Four equal quarters: West and East take two each, North and South the middle two.
        gridTemplateAreas: '". top top ." "left left right right" ". bottom bottom ."',
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        // Equal rows, and each box fills its row: all four boxes are the height of the tallest, so
        // a suit that wraps in one hand doesn't make the boxes uneven.
        gridTemplateRows: "repeat(3, 1fr)",
        gap: 1,
      }}
    >
      {SEATS.map((seat) => (
        <Paper
          key={seat}
          variant="outlined"
          sx={{
            gridArea: AREA[relationTo(bottom, seat)],
            overflow: "hidden",
            ...(seat === me && { borderColor: "primary.main", borderWidth: 2 }),
          }}
        >
          {seats[seat]}
        </Paper>
      ))}
    </Box>
  );
}
