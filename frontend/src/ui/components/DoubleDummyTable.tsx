import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { scoreFor } from "../../core/scoring";
import type { Direction, Seat, Strain } from "../../core/types";
import type { DoubleDummy } from "../../providers/types";
import { ResultText, ScoreText, StrainSymbol } from "../controls/BridgeText";

const STRAIN_ORDER: Strain[] = ["NT", "S", "H", "D", "C"];
const SEAT_ORDER: Seat[] = ["N", "S", "E", "W"];

const cell = { textAlign: "center", border: 1, borderColor: "divider", px: 1.5 } as const;

/** Tricks each declarer takes in each strain with perfect play, plus the par result. */
export function DoubleDummyTable({ dd, direction }: { dd: DoubleDummy; direction: Direction }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Tricks each player would take as declarer, double dummy
      </Typography>
      <Table size="small" sx={{ width: "auto", mb: 1.5 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={cell} aria-label="Declarer" />
            {STRAIN_ORDER.map((s) => (
              <TableCell key={s} sx={cell}>
                <Typography variant="subtitle1" component="span">
                  <StrainSymbol strain={s} />
                </Typography>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {SEAT_ORDER.map((seat) => (
            <TableRow key={seat}>
              <TableCell component="th" scope="row" sx={{ ...cell, fontWeight: "fontWeightBold" }}>
                {seat}
              </TableCell>
              {STRAIN_ORDER.map((s) => {
                const n = dd.tricks[seat][s];
                return (
                  <TableCell
                    key={s}
                    className="num"
                    sx={{ ...cell, ...(n >= 7 && { bgcolor: "action.selected", fontWeight: "fontWeightBold" }) }}
                  >
                    {n}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {dd.par && (
        <Typography>
          Par: <ScoreText score={scoreFor(direction, dd.par.nsScore)} strong /> for your side
          {dd.par.contracts.length > 0 && (
            <>
              {" ("}
              {dd.par.contracts.map((c, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  <ResultText result={c} />
                </span>
              ))}
              {")"}
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}
