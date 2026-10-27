// The running tally, board by board. Opened from the tally chip on the board screen.

import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { Direction } from "../../core/types";
import type { Tally } from "../../session/session";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { StatPanel } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { formatImps, formatMargin, formatPct, netParts } from "../labels";

interface Props {
  open: boolean;
  onClose: () => void;
  tally: Tally;
  direction: Direction;
  total: number;
  onOpenBoard: (board: number) => void;
}

export function TallyDialog({ open, onClose, tally, direction, total, onOpenBoard }: Props) {
  return (
    <SheetDialog open={open} onClose={onClose} title="Running tally">
      <StatPanel
        figure={`${direction} ${formatMargin(tally.margin)}`}
        caption={`Your matchpoints minus theirs, added up over ${tally.played} of ${total} boards`}
        tone={tally.margin < 0 ? "error" : "primary"}
        aside={
          <Box>
            <Typography variant="h5" component="p" className="num">
              {formatPct(tally.averagePct)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              average matchpoints
            </Typography>
            <Typography variant="subtitle1" sx={{ mt: 1 }} className="num">
              {formatImps(tally.totalImps)} IMPs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              against the field average
            </Typography>
          </Box>
        }
      />

      {tally.rows.length === 0 ? (
        <Alert severity="info" sx={{ mt: 3 }}>
          No boards played yet. Results collect here as your table enters them.
        </Alert>
      ) : (
        <Table size="small" sx={{ mt: 3 }} aria-label="Board by board">
          <TableHead>
            <TableRow>
              <TableCell>Board</TableCell>
              <TableCell>Result</TableCell>
              <TableCell align="right">Score</TableCell>
              <TableCell align="right">MP %</TableCell>
              <TableCell align="right">Net</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tally.rows.map(({ board, comparison: c }) => (
              <TableRow key={board} hover>
                <TableCell component="th" scope="row">
                  <Button
                    size="small"
                    aria-label={`Go to board ${board}`}
                    sx={{ minWidth: 0 }}
                    onClick={() => onOpenBoard(board)}
                  >
                    {board}
                  </Button>
                </TableCell>
                <TableCell>
                  <ResultText result={c.ours.result} />
                </TableCell>
                <TableCell align="right">
                  <ScoreText score={c.ourScore} />
                </TableCell>
                <TableCell align="right" className="num">
                  {c.mpPct === null ? "—" : netParts(c.mpPct).pct}
                </TableCell>
                <TableCell
                  align="right"
                  className="num"
                  sx={{ fontWeight: "fontWeightBold", color: c.mpPct !== null && c.mpPct < 50 ? "error.main" : undefined }}
                >
                  {c.mpPct === null ? "—" : netParts(c.mpPct).net}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {tally.rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Net is your matchpoint % minus theirs: 95% nets 95 − 5 = +90. The total at the top adds up the nets.
          A percentage shows one decimal when rounding it would hide where its net comes from (95.4% nets +91).
        </Typography>
      )}
    </SheetDialog>
  );
}
