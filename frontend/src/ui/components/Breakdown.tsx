import { Table, TableBody, TableCell, TableFooter, TableRow, Typography } from "@mui/material";
import type { ScoreBreakdown } from "../../core/scoring";
import { ScoreText } from "../controls/BridgeText";

/** The score, itemised: each component, how it was worked out, and the total. */
export function Breakdown({ b, perspective }: { b: ScoreBreakdown; perspective?: string }) {
  return (
    <Table size="small" aria-label="Score breakdown">
      <TableBody>
        {b.lines.map((l, i) => (
          <TableRow key={i}>
            <TableCell component="th" scope="row" sx={{ pl: 0 }}>
              {l.label}
              {l.detail && (
                <Typography variant="body2" color="text.secondary">
                  {l.detail}
                </Typography>
              )}
            </TableCell>
            <TableCell align="right" sx={{ pr: 0, verticalAlign: "top" }}>
              <ScoreText score={l.points} strong />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow sx={{ "& td, & th": { borderTop: 2, borderBottom: 0, color: "text.primary", typography: "body2" } }}>
          <TableCell component="th" scope="row" sx={{ pl: 0, fontWeight: "fontWeightBold" }}>
            Total for declarer
            {perspective && (
              <Typography variant="body2" color="text.secondary">
                {perspective}
              </Typography>
            )}
          </TableCell>
          <TableCell align="right" sx={{ pr: 0, verticalAlign: "top" }}>
            <ScoreText score={b.declarerScore} strong />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
