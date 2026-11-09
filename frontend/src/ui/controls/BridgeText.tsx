// Bridge notation, rendered the same way everywhere: suit symbols in the right colour, contracts,
// results and scores.

import { Box } from "@mui/material";
import type { Call } from "../../core/auction";
import { formatTrickResult } from "../../core/contract";
import { formatScore } from "../../core/scoring";
import { type Contract, type Strain, type Suit, type TableResult, SUIT_SYMBOLS } from "../../core/types";

export const SUIT_NAMES: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

/**
 * ♠ ♥ ♦ ♣, or "NT". Hearts and diamonds in the theme's red; spades and clubs in full-strength text
 * colour (black, or white in dark mode), not the grey of the text around them, so red and black
 * never look alike. On a filled background (a picked toggle, a contained button) they take its text
 * colour instead.
 */
export function StrainSymbol({ strain }: { strain: Strain }) {
  if (strain === "NT") return <>NT</>;
  const red = strain === "H" || strain === "D";
  return (
    <Box
      component="span"
      aria-label={SUIT_NAMES[strain]}
      sx={{
        color: red ? "error.main" : "text.primary",
        ...(!red && { ".Mui-selected &, .MuiButton-contained &": { color: "inherit" } }),
      }}
    >
      {SUIT_SYMBOLS[strain]}
    </Box>
  );
}

/** "4♠×" with a coloured suit. */
export function ContractText({ contract }: { contract: Contract | null }) {
  if (!contract) return <>Passed out</>;
  const dbl = contract.doubling === "X" ? "×" : contract.doubling === "XX" ? "××" : "";
  return (
    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
      {contract.level}
      <StrainSymbol strain={contract.strain} />
      {dbl}
    </Box>
  );
}

/**
 * "4♠× by S, −1" or "Passed out". One span, so it reads the same inside a button: a flex container
 * (like a button) would drop the space after the contract.
 */
export function ResultText({ result }: { result: TableResult }) {
  if (!result.contract || !result.declarer) return <>Passed out</>;
  return (
    <span>
      <ContractText contract={result.contract} /> by {result.declarer}, {formatTrickResult(result)}
    </span>
  );
}

/** A signed score with aligned digits: "+420", "−50". */
export function ScoreText({ score, strong = false }: { score: number; strong?: boolean }) {
  return (
    <Box
      component="span"
      className="num"
      sx={{ whiteSpace: "nowrap", ...(strong && { fontWeight: "fontWeightBold" }) }}
    >
      {formatScore(score)}
    </Box>
  );
}

/** A call in an auction: "3♥" with a coloured suit, "Pass", "X" (double) or "XX" (redouble). */
export function CallText({ call }: { call: Call }) {
  switch (call.kind) {
    case "bid":
      return <ContractText contract={{ level: call.level, strain: call.strain, doubling: "" }} />;
    case "pass":
      return <>Pass</>;
    case "double":
      return <>X</>;
    case "redouble":
      return <>XX</>;
  }
}

/** A call in words, for screen readers: "3 hearts", "Pass", "Double", "Redouble". */
export function callWords(call: Call): string {
  switch (call.kind) {
    case "bid":
      return `${call.level} ${call.strain === "NT" ? "no trumps" : SUIT_NAMES[call.strain]}`;
    case "pass":
      return "Pass";
    case "double":
      return "Double";
    case "redouble":
      return "Redouble";
  }
}

const SYMBOL_TO_SUIT: Record<string, Suit> = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };

/**
 * Plain text that may contain suit symbols ("1♠: 12–21 points, 5+ ♠"), with each symbol in its
 * colour. For explanations written as strings (the bidder's meanings and reasons).
 */
export function SuitString({ text }: { text: string }) {
  const parts = text.split(/([♠♥♦♣])/);
  return (
    <>
      {parts.map((part, i) => (SYMBOL_TO_SUIT[part] ? <StrainSymbol key={i} strain={SYMBOL_TO_SUIT[part]!} /> : part))}
    </>
  );
}
