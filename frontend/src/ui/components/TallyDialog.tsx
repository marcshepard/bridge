// The running tally, board by board. Opened from the tally chip on the board screen.

import { Alert, Box, Button, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, Typography } from "@mui/material";
import type { Direction } from "../../core/types";
import type { Tally } from "../../session/session";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { HelpTip } from "../controls/HelpTip";
import { StatPanel } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { formatImps, formatMargin, formatMp, netParts } from "../labels";

interface Props {
  open: boolean;
  onClose: () => void;
  tally: Tally;
  direction: Direction;
  onOpenBoard: (board: number) => void;
}

export function TallyDialog({ open, onClose, tally, direction, onOpenBoard }: Props) {
  return (
    <SheetDialog open={open} onClose={onClose} title="Running tally">
      <StatPanel
        figure={`${direction} ${formatMargin(tally.margin)}`}
        caption="Your matchpoints minus theirs summed over all played boards"
        tone={tally.margin < 0 ? "error" : "primary"}
        aside={
          <Box>
            <Typography variant="h5" component="p" className="num">
              IMPs: {formatImps(tally.totalImps)}
              <HelpTip label="About IMPs">
                <span>
                  IMPs (International Match Points) measure by how much you beat the field average on each board,
                  where matchpoints count how many tables you beat. They're how team games are scored; here
                  they're a second view of the same boards.
                </span>
                <span>This adds up your IMPs over the boards played.</span>
              </HelpTip>
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
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                Net
                <HelpTip label="About the net column">
                  <span>Your matchpoint % minus theirs: 95% nets 95 − 5 = +90.</span>
                  <span>The total at the top adds up the nets.</span>
                </HelpTip>
              </TableCell>
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
          <TableFooter sx={{ "& td, & th": { typography: "body2", color: "text.primary", borderBottom: 0 } }}>
            <TableRow>
              <TableCell component="th" scope="row" colSpan={2}>
                Average
              </TableCell>
              <TableCell align="right">
                {tally.averageScore === null ? "—" : <ScoreText score={Math.round(tally.averageScore)} />}
              </TableCell>
              <TableCell align="right" className="num">
                {formatMp(tally.averagePct)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </SheetDialog>
  );
}
