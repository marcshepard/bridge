// A board's auction as bridge players write it down: four columns, West North East South, each
// headed by its player (in red when vulnerable), the first call under the dealer and the empty
// places before it blank. While the auction is going, the next place to call is marked.
//
// In the bidding review the calls can be tapped (each opens its explanation), and some carry a
// small mark: a call of yours the bot would have made differently, a hard call, or a call no rule
// covers yet.

import { Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { type Call, isAuctionOver, seatOfCall } from "../../core/auction";
import { type Seat, type Vulnerability, SEAT_NAMES, directionOf, isVulnerable } from "../../core/types";
import { CallText, callWords } from "../controls/BridgeText";

/** Printed auctions start with West. */
const COLUMNS: readonly Seat[] = ["W", "N", "E", "S"];

/** A mark on a call in the review. */
export type CallMark = "differs" | "hard" | "norule";

export const CALL_MARKS: Record<CallMark, { symbol: string; color: string; words: string }> = {
  differs: { symbol: "≠", color: "warning.main", words: "the bot would have bid differently" },
  hard: { symbol: "?", color: "info.main", words: "a hard call: the rules don't settle it" },
  norule: { symbol: "!", color: "error.main", words: "no rule covers this yet" },
};

interface Props {
  dealer: Seat;
  vul: Vulnerability;
  names: Record<Seat, string>;
  calls: Call[];
  /** Your seat: its column is in bold. */
  seat: Seat;
  /** Makes each call a button that opens its explanation (by its index in the auction). */
  onOpenCall?: (index: number) => void;
  /** A mark for some calls (by index). */
  marks?: (index: number) => CallMark | null;
}

export function AuctionTable({ dealer, vul, names, calls, seat, onOpenCall, marks }: Props) {
  const offset = COLUMNS.indexOf(dealer);
  const over = isAuctionOver(calls);
  // The cells, row by row: blanks before the dealer, the calls, then the next place to call.
  const cells: Array<{ call: Call; seat: Seat; index: number } | "next" | null> = [
    ...Array<null>(offset).fill(null),
    ...calls.map((call, index) => ({ call, seat: seatOfCall(dealer, index), index })),
    ...(over ? [] : (["next"] as const)),
  ];
  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));

  return (
    <Table size="small" aria-label="The auction" sx={{ tableLayout: "fixed" }}>
      <TableHead>
        <TableRow>
          {COLUMNS.map((s) => {
            const vulnerable = isVulnerable(vul, directionOf(s));
            return (
              <TableCell
                key={s}
                align="center"
                sx={{ px: 0.5 }}
                aria-label={`${SEAT_NAMES[s]}, ${names[s]}${vulnerable ? ", vulnerable" : ""}`}
              >
                <Typography
                  variant="subtitle2"
                  component="span"
                  sx={{ display: "block", color: vulnerable ? "error.main" : undefined, fontWeight: s === seat ? "fontWeightBold" : undefined }}
                >
                  {SEAT_NAMES[s]}
                </Typography>
                <Typography variant="caption" component="span" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {names[s]}
                </Typography>
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, r) => (
          <TableRow key={r}>
            {COLUMNS.map((s, c) => {
              const cell = row[c];
              const mark = cell && cell !== "next" ? (marks?.(cell.index) ?? null) : null;
              const label = cell && cell !== "next" ? `${SEAT_NAMES[s]}: ${callWords(cell.call)}${mark ? `, ${CALL_MARKS[mark].words}` : ""}` : undefined;
              return (
                <TableCell
                  key={s}
                  align="center"
                  sx={{
                    px: 0.5,
                    py: onOpenCall ? 0 : undefined,
                    typography: "subtitle1",
                    fontWeight: s === seat ? "fontWeightBold" : undefined,
                    ...(cell === "next" && { bgcolor: "action.selected" }),
                  }}
                  aria-label={onOpenCall ? undefined : label}
                >
                  {cell === "next" ? (
                    "?"
                  ) : cell && onOpenCall ? (
                    <Button
                      onClick={() => onOpenCall(cell.index)}
                      aria-label={`${label}. Explain`}
                      sx={{ minWidth: 0, width: 1, typography: "subtitle1", fontWeight: "inherit", textTransform: "none" }}
                    >
                      <CallText call={cell.call} />
                      {mark && <Mark mark={mark} />}
                    </Button>
                  ) : cell ? (
                    <CallText call={cell.call} />
                  ) : (
                    ""
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Mark({ mark }: { mark: CallMark }) {
  return (
    <Box component="sup" aria-hidden sx={{ color: CALL_MARKS[mark].color, fontWeight: "fontWeightBold", ml: 0.25 }}>
      {CALL_MARKS[mark].symbol}
    </Box>
  );
}

/** What the marks mean, under the table. Only the marks that appear. */
export function MarkLegend({ marks }: { marks: CallMark[] }) {
  const shown = (["differs", "hard", "norule"] as CallMark[]).filter((m) => marks.includes(m));
  if (shown.length === 0) return null;
  return (
    <Box sx={{ display: "grid", gap: 0.5, mt: 1 }}>
      {shown.map((m) => (
        <Typography key={m} variant="body2" color="text.secondary">
          <Box component="span" sx={{ color: CALL_MARKS[m].color, fontWeight: "fontWeightBold", mr: 0.5 }}>
            {CALL_MARKS[m].symbol}
          </Box>
          {CALL_MARKS[m].words.charAt(0).toUpperCase() + CALL_MARKS[m].words.slice(1)}
        </Typography>
      ))}
    </Box>
  );
}
