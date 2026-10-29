// A board's auction as bridge players write it down: four columns, West North East South, each
// headed by its player (in red when vulnerable), the first call under the dealer and the empty
// places before it blank. While the auction is going, the next place to call is marked.

import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { type Call, isAuctionOver, seatOfCall } from "../../core/auction";
import { type Seat, type Vulnerability, SEAT_NAMES, directionOf, isVulnerable } from "../../core/types";
import { CallText, callWords } from "../controls/BridgeText";

/** Printed auctions start with West. */
const COLUMNS: readonly Seat[] = ["W", "N", "E", "S"];

interface Props {
  dealer: Seat;
  vul: Vulnerability;
  names: Record<Seat, string>;
  calls: Call[];
  /** Your seat: its column is in bold. */
  seat: Seat;
}

export function AuctionTable({ dealer, vul, names, calls, seat }: Props) {
  const offset = COLUMNS.indexOf(dealer);
  const over = isAuctionOver(calls);
  // The cells, row by row: blanks before the dealer, the calls, then the next place to call.
  const cells: Array<{ call: Call; seat: Seat } | "next" | null> = [
    ...Array<null>(offset).fill(null),
    ...calls.map((call, i) => ({ call, seat: seatOfCall(dealer, i) })),
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
              return (
                <TableCell
                  key={s}
                  align="center"
                  sx={{
                    px: 0.5,
                    typography: "subtitle1",
                    fontWeight: s === seat ? "fontWeightBold" : undefined,
                    ...(cell === "next" && { bgcolor: "action.selected" }),
                  }}
                  aria-label={cell && cell !== "next" ? `${SEAT_NAMES[s]}: ${callWords(cell.call)}` : undefined}
                >
                  {cell === "next" ? "?" : cell ? <CallText call={cell.call} /> : ""}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
