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
  /**
   * Not on offer at all: its place stays empty, so the others keep theirs and can be tapped by
   * habit (the bidding box's levels and suits).
   */
  hidden?: boolean;
  /** A light shade of this palette colour behind it until it's picked (the bidding box's Pass, X and XX). */
  color?: "success" | "error";
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
  /**
   * The space above: `tight` joins the group to the one before (two parts of one choice, like a
   * bid's level and suit); `loose` sets it apart from them (a separate choice).
   */
  space?: "tight" | "normal" | "loose";
}

const SPACE_ABOVE = { tight: 0.5, normal: 2, loose: 3 } as const;

export function ChoiceGroup<T extends string | number>({ label, help, choices, value, onChange, disabled = false, space = "normal" }: Props<T>) {
  const id = useId();
  return (
    <Box sx={{ mt: SPACE_ABOVE[space] }}>
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
        {choices.map((c, i) => {
          // The buttons are joined into one strip. Next to an empty place, a button gets back the
          // edge and rounded corners the strip would otherwise share with its neighbour.
          const afterGap = i > 0 && !!choices[i - 1]!.hidden;
          const beforeGap = i < choices.length - 1 && !!choices[i + 1]!.hidden;
          return (
            <ToggleButton
              key={String(c.value)}
              value={c.value}
              aria-label={c.ariaLabel}
              aria-hidden={c.hidden || undefined}
              tabIndex={c.hidden ? -1 : undefined}
              disabled={disabled || c.disabled || c.hidden}
              color={c.color}
              sx={(t) => ({
                flexDirection: "column",
                ...(c.hidden && { visibility: "hidden" }),
                // "&&&" outranks the group's own rules for joined buttons.
                "&&&": {
                  ...(afterGap && {
                    borderLeftColor: t.vars!.palette.divider,
                    borderTopLeftRadius: t.shape.borderRadius,
                    borderBottomLeftRadius: t.shape.borderRadius,
                  }),
                  ...(beforeGap && {
                    borderTopRightRadius: t.shape.borderRadius,
                    borderBottomRightRadius: t.shape.borderRadius,
                  }),
                },
              })}
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
          );
        })}
      </ToggleButtonGroup>
    </Box>
  );
}
