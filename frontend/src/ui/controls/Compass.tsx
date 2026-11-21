// The four seats round the table, each in a box of the same size: half the width. West and East
// share the middle row; North and South are centred above and below, as in a printed hand diagram
// (no empty middle square, so each box is as wide as it can be). By default it's turned so you're
// at the bottom: partner opposite, left-hand opponent on your left, right-hand opponent on your
// right. A hand diagram (all four hands once the board is over) keeps the standard layout instead,
// South at the bottom (`bottom`). What goes in each box (its heading too) is the caller's.

import { Box, Paper, type SxProps, type Theme } from "@mui/material";
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
        <SeatFrame key={seat} mine={seat === me} sx={{ gridArea: AREA[relationTo(bottom, seat)] }}>
          {seats[seat]}
        </SeatFrame>
      ))}
    </Box>
  );
}

/**
 * One seat's box in a hand diagram (the compass, the play review): an outlined box, yours in the
 * primary colour. What goes in it (usually a SeatHand: heading strip and cards) is the caller's.
 */
export function SeatFrame({ mine, sx, children }: { mine: boolean; sx?: SxProps<Theme>; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={[{ overflow: "hidden", minWidth: 0 }, mine && { borderColor: "primary.main", borderWidth: 2 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Paper>
  );
}
