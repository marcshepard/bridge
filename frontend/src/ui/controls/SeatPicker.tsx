// Choosing a seat, laid out the way the seats sit round a table.

import { Box, ToggleButton } from "@mui/material";
import { type Seat, SEAT_NAMES } from "../../core/types";

const AREA: Record<Seat, string> = { N: "n", E: "e", S: "s", W: "w" };

export function SeatPicker({ value, onChange }: { value: Seat | null; onChange: (s: Seat) => void }) {
  return (
    <Box
      role="radiogroup"
      aria-label="Your seat"
      sx={{
        display: "grid",
        gridTemplateAreas: '". n ." "w t e" ". s ."',
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 1,
        maxWidth: (t) => t.spacing(45),
        mx: "auto",
      }}
    >
      {(["N", "W", "E", "S"] as const).map((s) => (
        <ToggleButton
          key={s}
          value={s}
          role="radio"
          aria-checked={value === s}
          selected={value === s}
          onChange={() => onChange(s)}
          sx={{ gridArea: AREA[s] }}
        >
          {SEAT_NAMES[s]}
        </ToggleButton>
      ))}
      <Box aria-hidden sx={{ gridArea: "t", bgcolor: "action.selected", borderRadius: 1 }} />
    </Box>
  );
}
