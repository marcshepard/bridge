// Pick a number with − and + buttons either side of it: how many tricks were taken, or claimed.
// Big tap targets, and the value is read out as it changes.

import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** A second line under the number, e.g. "4♠ +1". */
  caption?: ReactNode;
  /** Accessible names for the buttons, e.g. "One trick fewer". */
  lessLabel: string;
  moreLabel: string;
}

export function NumberStepper({ label, value, min, max, onChange, caption, lessLabel, moreLabel }: Props) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: (t) => `${t.spacing(7)} 1fr ${t.spacing(7)}`, gap: 1 }}>
        <IconButton
          aria-label={lessLabel}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <RemoveIcon />
        </IconButton>
        <Box
          component="output"
          aria-live="polite"
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            py: 0.5,
          }}
        >
          <Typography variant="h4" component="span" className="num">
            {value}
          </Typography>
          {caption && <Typography color="text.secondary">{caption}</Typography>}
        </Box>
        <IconButton
          aria-label={moreLabel}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <AddIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
