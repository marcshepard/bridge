// The dialogs behind a board: how the score adds up, the field and the analysis (opened once a
// result is entered), and the board details (opened from the board number at any time).

import { Alert, Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { BoardComparison } from "../../core/compare";
import { describeResult } from "../../core/describe";
import { scoreFor } from "../../core/scoring";
import { type Seat, directionOf } from "../../core/types";
import type { Board, Game } from "../../providers/types";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { Section } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { HelpTip } from "../controls/HelpTip";
import { formatImps, netParts } from "../labels";
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

/** The most common score in the field, for your side like every score shown. The list below has the detail. */
function MostCommon({ c }: { c: BoardComparison }) {
  const g = c.mostCommon;
  if (!g) return null;
  return <ScoreText score={g.score} />;
}

/** Double-dummy par (for your side, like every score shown), with the par contracts when the source names them. */
function Par({ board, seat }: { board: Board; seat: Seat }) {
  const par = board.doubleDummy?.par;
  if (!par) return null;
  return (
    <>
      <ScoreText score={scoreFor(directionOf(seat), par.nsScore)} />
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

/** What IMPs are, worked through for this board: the difference from the field average, then the scale. */
function ImpsHelp({ c }: { c: BoardComparison }) {
  const diff = c.ourScore - c.fieldDatum;
  return (
    <>
      <span>
        IMPs (International Match Points) measure by how much you beat a score, where matchpoints count how many
        tables you beat. They're how team games are scored; here they're a second view of the same board.
      </span>
      <span>
        Your <ScoreText score={c.ourScore} /> is{" "}
        {diff === 0 ? (
          "the same as"
        ) : (
          <>
            <span className="num">{Math.abs(diff)}</span> {diff > 0 ? "more than" : "less than"}
          </>
        )}{" "}
        the field average of <ScoreText score={c.fieldDatum} />, which is worth{" "}
        <strong className="num">{formatImps(c.impsVsDatum)}</strong> IMPs.
      </span>
      <span>
        The scale squeezes big swings: a difference of 20–40 points is 1 IMP, 400 points is 9, and the most is 24.
      </span>
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
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {/* The results themselves, with their bullets spaced like lines of the same paragraph. */}
            <Stack spacing={0.5}>
              <Typography>
                Out of <span className="num">{c.fieldSize}</span> {c.fieldSize === 1 ? "table" : "tables"}, you beat{" "}
                {c.beat}, tied {c.tied} and lost to {c.lost}.
              </Typography>
              <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, my: 0 }}>
                <li>
                  Your score: <ScoreText score={c.ourScore} />
                </li>
                <li>
                  Most common result: <MostCommon c={c} />
                </li>
                {board.doubleDummy?.par && (
                  <li>
                    Double-dummy par: <Par board={board} seat={seat} />
                  </li>
                )}
              </Stack>
            </Stack>
            {/* How the results are scored. */}
            <Stack spacing={0.5}>
              {c.mpPct !== null && (
                <Typography>
                  <strong>Matchpoints: {netParts(c.mpPct).pct}</strong> ={" "}
                  <span className="num">
                    ({c.beat} + {c.tied / 2}) ÷ {c.fieldSize}
                  </span>
                  . A tie counts as half.
                </Typography>
              )}
              {c.mpPct !== null && (
                <Typography>
                  <strong>Net: {netParts(c.mpPct).net}</strong> ={" "}
                  <span className="num">{netParts(c.mpPct).working}</span> (your matchpoints minus theirs)
                </Typography>
              )}
              <Typography>
                <strong>IMPs: {formatImps(c.impsVsDatum)}</strong> against the field average of{" "}
                <ScoreText score={c.fieldDatum} />
                <HelpTip label="About IMPs">
                  <ImpsHelp c={c} />
                </HelpTip>
              </Typography>
            </Stack>
          </Stack>
          <Traveller c={c} />
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

/** How many results a board's field has: each traveller line can stand for several tables. */
function fieldSize(board: Board): number {
  return board.field.reduce((n, f) => n + f.count, 0);
}

/**
 * About the board you're on: which game it's from, its number there, and how many results it's
 * scored against (later boards in a big game often have far fewer). Opened from the board number.
 */
export function BoardInfoDialog({
  open,
  onClose,
  board,
  position,
  title,
  game,
}: {
  open: boolean;
  onClose: () => void;
  board: Board;
  /** Where this board comes in your game, from 1. */
  position: number;
  /** The game's title, e.g. "The Common Game, 16 Oct 2026 (Open field)". */
  title: string;
  game: Game;
}) {
  const rows: [string, ReactNode][] = [
    ["Game", title],
    [
      "Board number",
      <span className="num">
        {board.number} of {game.boards.length}
      </span>,
    ],
    ["Results", <span className="num">{fieldSize(board)}</span>],
  ];
  return (
    <SheetDialog open={open} onClose={onClose} title={`Board ${position}`}>
      <Box component="dl" sx={{ m: 0, display: "grid", gap: 1 }}>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", gap: 1 }}>
            <Typography component="dt" color="text.secondary" sx={{ flexShrink: 0 }}>
              {label}:
            </Typography>
            <Typography component="dd" sx={{ m: 0, minWidth: 0 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </SheetDialog>
  );
}
