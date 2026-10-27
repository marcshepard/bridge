// The dialogs behind a board's result: how the score adds up, the field, and the analysis.
// Opened from the board screen once a result is entered.

import { Alert, Stack, Typography } from "@mui/material";
import type { BoardComparison } from "../../core/compare";
import { describeResult } from "../../core/describe";
import { scoreFor } from "../../core/scoring";
import { type Seat, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { Section } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { formatImps } from "../labels";
import { Breakdown } from "./Breakdown";
import { DoubleDummyTable } from "./DoubleDummyTable";
import { Traveller } from "./Traveller";

interface Props {
  open: boolean;
  onClose: () => void;
  board: Board;
  seat: Seat;
  c: BoardComparison;
}

function perspective(c: BoardComparison, seat: Seat): string | undefined {
  const declarer = c.ours.result.declarer;
  if (!c.ours.result.contract || !declarer) return undefined;
  return directionOf(declarer) === directionOf(seat)
    ? "your side declared"
    : "your side defended, so this counts against declarer";
}

/** The most common result in the field, in words: "+420 for your side at 45 of 127 tables (game made)". */
function MostCommon({ c }: { c: BoardComparison }) {
  const g = c.mostCommon;
  if (!g) return null;
  const r = g.results[0];
  return (
    <>
      <ScoreText score={g.score} /> for your side at {g.count} of {c.fieldSize} tables
      {r && (
        <>
          : {r.description.toLowerCase()} (<ResultText result={r.result} />)
        </>
      )}
    </>
  );
}

/** Double-dummy par for your side, with the par contracts when the source names them. */
function Par({ board, seat }: { board: Board; seat: Seat }) {
  const par = board.doubleDummy?.par;
  if (!par) return null;
  return (
    <>
      <ScoreText score={scoreFor(directionOf(seat), par.nsScore)} /> for your side
      {par.contracts.length > 0 && (
        <>
          {" ("}
          {par.contracts.map((r, i) => (
            <span key={i}>
              {i > 0 && "; "}
              <ResultText result={r} />
            </span>
          ))}
          {")"}
        </>
      )}
    </>
  );
}

export function BreakdownDialog({ open, onClose, board, seat, c }: Props) {
  return (
    <SheetDialog open={open} onClose={onClose} title={`Board ${board.number}: how the score adds up`}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        <ResultText result={c.ours.result} />: <ScoreText score={c.ourScore} strong /> for your side
      </Typography>
      <Breakdown b={c.ours} perspective={perspective(c, seat)} />
    </SheetDialog>
  );
}

export function FieldDialog({ open, onClose, board, seat, c }: Props) {
  return (
    <SheetDialog open={open} onClose={onClose} title={`Board ${board.number}: the field`}>
      {c.fieldSize === 0 ? (
        <Alert severity="info">This game has no results from the original field for this board.</Alert>
      ) : (
        <>
          <Typography sx={{ mb: 2 }}>
            You beat {c.beat} of {c.fieldSize} tables{c.tied > 0 && <>, tied with {c.tied}</>}
            {c.lost > 0 && <>, and lost to {c.lost}</>}. Against the field average of{" "}
            <ScoreText score={c.fieldDatum} /> that's <span className="num">{formatImps(c.impsVsDatum)}</span> IMPs.
          </Typography>
          <Stack component="ul" spacing={0.75} sx={{ pl: 2.5, mt: 0, mb: 2 }}>
            <li>
              Most common: <MostCommon c={c} />
            </li>
            {board.doubleDummy?.par && (
              <li>
                Double-dummy par: <Par board={board} seat={seat} />
              </li>
            )}
          </Stack>
          <Traveller c={c} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Best scores for your side first. Tap a score to see the contracts behind it, when the source gives them.
            The right-hand column is the matchpoint % that score earns.
          </Typography>
        </>
      )}
    </SheetDialog>
  );
}

export function AnalysisDialog({ open, onClose, board, seat, c }: Props) {
  return (
    <SheetDialog open={open} onClose={onClose} title={`Board ${board.number}: analysis`}>
      <Stack component="ul" spacing={0.75} sx={{ pl: 2.5, my: 0 }}>
        <li>
          Your result: <ResultText result={c.ours.result} />, <ScoreText score={c.ourScore} /> (
          {describeResult(c.ours).toLowerCase()})
        </li>
        {c.mostCommon && (
          <li>
            Most common: <MostCommon c={c} />
          </li>
        )}
        {board.doubleDummy?.par && (
          <li>
            Best result double dummy (par): <Par board={board} seat={seat} />
          </li>
        )}
      </Stack>

      {board.doubleDummy?.tricks && (
        <Section title="Double dummy" id="dd">
          <DoubleDummyTable dd={{ tricks: board.doubleDummy.tricks }} direction={directionOf(seat)} />
        </Section>
      )}

      <Section title="Expert commentary" id="commentary">
        {board.commentary ? (
          <Typography sx={{ whiteSpace: "pre-line", pl: 2, borderLeft: 3, borderColor: "primary.main" }}>
            {board.commentary}
          </Typography>
        ) : (
          <Typography color="text.secondary">No commentary for this board.</Typography>
        )}
      </Section>
    </SheetDialog>
  );
}
