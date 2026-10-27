// A compact badge for how your side is doing: "NS 83.3%" on a board, "NS +140" for the session.
// Green when you're above average, red below, neutral at average or with nothing to compare.

import { Chip, type ChipProps } from "@mui/material";

export type Tone = "good" | "bad" | "neutral";

/** Above or below average. `value` is relative to average (MP% − 50, or a ± margin). */
export function toneOf(value: number | null): Tone {
  if (value === null || Math.abs(value) < 1e-9) return "neutral";
  return value > 0 ? "good" : "bad";
}

const COLOR: Record<Tone, ChipProps["color"]> = { good: "success", bad: "error", neutral: "default" };

interface Props {
  label: string;
  tone: Tone;
  size?: "small" | "medium";
  onClick?: () => void;
  ariaLabel?: string;
}

export function ScoreChip({ label, tone, size = "medium", onClick, ariaLabel }: Props) {
  return (
    <Chip
      label={label}
      color={COLOR[tone]}
      size={size}
      onClick={onClick}
      aria-label={ariaLabel}
      className="num"
    />
  );
}
