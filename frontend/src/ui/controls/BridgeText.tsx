// Bridge notation, rendered the same way everywhere: suit symbols in the right colour, contracts,
// results and scores.

import { Box } from "@mui/material";
import { formatTrickResult } from "../../core/contract";
import { formatScore } from "../../core/scoring";
import { type Contract, type Strain, type Suit, type TableResult, SUIT_SYMBOLS } from "../../core/types";

export const SUIT_NAMES: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

/** ♠ ♥ ♦ ♣ (hearts and diamonds in the theme's red), or "NT". */
export function StrainSymbol({ strain }: { strain: Strain }) {
  if (strain === "NT") return <>NT</>;
  const red = strain === "H" || strain === "D";
  return (
    <Box component="span" aria-label={SUIT_NAMES[strain]} sx={{ color: red ? "error.main" : "inherit" }}>
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

/** "4♠× by S, −1" or "Passed out". */
export function ResultText({ result }: { result: TableResult }) {
  if (!result.contract || !result.declarer) return <>Passed out</>;
  return (
    <>
      <ContractText contract={result.contract} /> by {result.declarer}, {formatTrickResult(result)}
    </>
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
