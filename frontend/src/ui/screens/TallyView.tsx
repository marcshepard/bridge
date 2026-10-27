import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { Direction } from "../../core/types";
import { marginFor, type Tally } from "../../session/session";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { Screen, StatPanel } from "../controls/Layout";
import { formatImps, formatMargin, formatPct } from "../labels";

interface Props {
  tally: Tally;
  direction: Direction;
  total: number;
  onOpen: (board: number) => void;
  onContinue: (() => void) | null;
}

export function TallyView({ tally, direction, total, onOpen, onContinue }: Props) {
  return (
    <Screen>
      <StatPanel
        figure={`${direction} ${formatMargin(tally.margin)}`}
        caption={`Your % minus theirs, over ${tally.played} of ${total} boards`}
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
          No boards played yet. Your results will collect here as you enter them.
        </Alert>
      ) : (
        <Table size="small" sx={{ mt: 3 }} aria-label="Board by board">
          <TableHead>
            <TableRow>
              <TableCell>Board</TableCell>
              <TableCell>Result</TableCell>
              <TableCell align="right">Score</TableCell>
              <TableCell align="right">MP%</TableCell>
              <TableCell align="right">±</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tally.rows.map(({ board, comparison: c }) => (
              <TableRow key={board} hover onClick={() => onOpen(board)} sx={{ cursor: "pointer" }}>
                <TableCell component="th" scope="row">
                  <Button size="small" sx={{ minWidth: 0, minHeight: 0, p: 0.5 }} onClick={() => onOpen(board)}>
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
                  {formatPct(c.mpPct)}
                </TableCell>
                <TableCell
                  align="right"
                  className="num"
                  sx={{ fontWeight: "fontWeightBold", color: c.mpPct !== null && c.mpPct < 50 ? "error.main" : undefined }}
                >
                  {c.mpPct === null ? "—" : formatMargin(marginFor(c.mpPct))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {onContinue && (
        <Button variant="contained" size="large" fullWidth sx={{ mt: 3 }} onClick={onContinue}>
          Continue playing
        </Button>
      )}
    </Screen>
  );
}
