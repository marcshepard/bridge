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
  /** Can't be picked right now (greyed out). */
  disabled?: boolean;
}

interface Props<T extends string | number> {
  label?: string;
  /** A "?" beside the label that explains the choice (a HelpTip). */
  help?: ReactNode;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** None can be picked right now. */
  disabled?: boolean;
}

export function ChoiceGroup<T extends string | number>({ label, help, choices, value, onChange, disabled = false }: Props<T>) {
  const id = useId();
  return (
    <Box sx={{ mt: 2 }}>
      {label && (
        <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
          <span id={id}>{label}</span>
          {help}
        </Typography>
      )}
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        disabled={disabled}
        aria-labelledby={label ? id : undefined}
        onChange={(_, v: T | null) => {
          if (v !== null) onChange(v);
        }}
      >
        {choices.map((c) => (
          <ToggleButton
            key={String(c.value)}
            value={c.value}
            aria-label={c.ariaLabel}
            disabled={disabled || c.disabled}
            sx={{ flexDirection: "column" }}
          >
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
