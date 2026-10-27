// Pick one of a few options with big tap targets: level, strain, doubled, seat...
// Every single-choice picker in the app uses this, so they all look and behave the same.

import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { type ReactNode, useId } from "react";

export interface Choice<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Small second line, e.g. "Partner" under "West". */
  sub?: ReactNode;
  /** Accessible name when `label` is a symbol. */
  ariaLabel?: string;
}

interface Props<T extends string | number> {
  label?: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function ChoiceGroup<T extends string | number>({ label, choices, value, onChange }: Props<T>) {
  const id = useId();
  return (
    <Box sx={{ mt: 2 }}>
      {label && (
        <Typography id={id} variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
      )}
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        aria-labelledby={label ? id : undefined}
        onChange={(_, v: T | null) => {
          if (v !== null) onChange(v);
        }}
      >
        {choices.map((c) => (
          <ToggleButton key={String(c.value)} value={c.value} aria-label={c.ariaLabel} sx={{ flexDirection: "column" }}>
            <Typography variant="h6" component="span">
              {c.label}
            </Typography>
            {c.sub && (
              <Typography component="span" variant="caption">
                {c.sub}
              </Typography>
            )}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
