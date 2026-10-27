// The four seats round the table, turned so you're at the bottom: partner opposite, left-hand
// opponent on your left, right-hand opponent on your right. Used wherever we show who sits where.

import { Box, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { type Seat, SEATS, SEAT_NAMES } from "../../core/types";
import { relationTo, type Relation } from "../labels";

const AREA: Record<Relation, string> = { you: "bottom", lho: "left", partner: "top", rho: "right" };

interface Props {
  /** Your seat: drawn at the bottom. */
  me: Seat;
  /** What to show under each seat's name, e.g. the player sitting there. */
  seats: Record<Seat, ReactNode>;
  /** Shown in the middle of the table, e.g. the board number. */
  center?: ReactNode;
}

export function Compass({ me, seats, center }: Props) {
  return (
    <Box
      role="list"
      aria-label="Who sits where"
      sx={{
        display: "grid",
        gridTemplateAreas: '". top ." "left table right" ". bottom ."',
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 1,
        maxWidth: (t) => t.spacing(60),
        mx: "auto",
      }}
    >
      {SEATS.map((seat) => {
        const relation = relationTo(me, seat);
        return (
          <Paper
            key={seat}
            role="listitem"
            variant="outlined"
            sx={{
              gridArea: AREA[relation],
              p: 1.5,
              textAlign: "center",
              ...(relation === "you" && { bgcolor: "action.selected", borderColor: "primary.main" }),
            }}
          >
            <Typography variant="caption" component="p" color="text.secondary">
              {SEAT_NAMES[seat]}
            </Typography>
            <Typography variant="subtitle1" component="div" sx={{ overflowWrap: "anywhere" }}>
              {seats[seat]}
            </Typography>
          </Paper>
        );
      })}
      {/* Decorative: anything shown here is also said elsewhere on the screen. */}
      <Box
        aria-hidden
        sx={{
          gridArea: "table",
          bgcolor: "action.hover",
          borderRadius: 1,
          minHeight: (t) => t.spacing(8),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        {center}
      </Box>
    </Box>
  );
}
