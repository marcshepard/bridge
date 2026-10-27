import { Box, Button, Stack, Typography } from "@mui/material";
import type { BoardComparison } from "../../core/compare";
import { describeResult } from "../../core/describe";
import { type Seat, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import { Breakdown } from "../components/Breakdown";
import { DoubleDummyTable } from "../components/DoubleDummyTable";
import { FullDeal } from "../components/Hand";
import { Traveller } from "../components/Traveller";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { Screen, Section, StatPanel } from "../controls/Layout";
import { formatImps, formatPct } from "../labels";

interface Props {
  board: Board;
  seat: Seat;
  c: BoardComparison;
  onBack: () => void;
  onChange: () => void;
  onNext: (() => void) | null;
}

/** The details behind a board's result: the score explained, then where it sits in the field. */
export function BoardReview({ board, seat, c, onBack, onChange, onNext }: Props) {
  const dir = directionOf(seat);
  const weDeclared = c.ours.result.declarer ? directionOf(c.ours.result.declarer) === dir : false;
  const best = c.groups[0];
  const common = c.mostCommon;

  return (
    <Screen>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
        <Button color="inherit" onClick={onBack}>
          Back to board {board.number}
        </Button>
      </Stack>

      <StatPanel
        figure={c.mpPct === null ? "—" : `${dir} ${formatPct(c.mpPct)}`}
        caption={c.fieldSize === 0 ? "No field results to compare with" : "matchpoints"}
        tone={c.mpPct === null || c.mpPct >= 50 ? "primary" : "error"}
        aside={
          <Box>
            <Typography variant="subtitle1">
              <ResultText result={c.ours.result} />
            </Typography>
            <Typography variant="h5" component="p">
              <ScoreText score={c.ourScore} />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {describeResult(c.ours)}
            </Typography>
          </Box>
        }
      />

      {c.fieldSize > 0 && (
        <Typography sx={{ mt: 2 }}>
          You beat {c.beat} of {c.fieldSize} tables{c.tied > 0 && <>, tied with {c.tied}</>}
          {c.lost > 0 && <>, and lost to {c.lost}</>}. Against the field average of{" "}
          <ScoreText score={c.fieldDatum} /> that's <span className="num">{formatImps(c.impsVsDatum)}</span> IMPs.
        </Typography>
      )}

      <Section title="How your score adds up" id="breakdown">
        <Breakdown
          b={c.ours}
          perspective={
            c.ours.result.contract
              ? weDeclared
                ? "your side declared"
                : "your side defended, so this counts against declarer"
              : undefined
          }
        />
      </Section>

      {c.fieldSize > 0 && (
        <Section title="The field" id="field">
          <Stack component="ul" spacing={0.75} sx={{ pl: 2.5, mt: 0, mb: 2 }}>
            {common && (
              <li>
                Most common: <ScoreText score={common.score} /> for your side at {common.count} of {c.fieldSize} tables
                {common.results[0] && (
                  <>
                    , {common.results[0].description.toLowerCase()} (<ResultText result={common.results[0].result} />)
                  </>
                )}
              </li>
            )}
            {best && best !== common && (
              <li>
                Top for your side: <ScoreText score={best.score} />
                {best.results[0] && (
                  <>
                    , {best.results[0].description.toLowerCase()} (<ResultText result={best.results[0].result} />)
                  </>
                )}
              </li>
            )}
          </Stack>
          <Traveller c={c} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tap a score to see every contract that produced it. The right-hand column is the matchpoint % that
            score earns.
          </Typography>
        </Section>
      )}

      {board.doubleDummy && (
        <Section title="Double dummy" id="dd">
          <DoubleDummyTable dd={board.doubleDummy} direction={dir} />
        </Section>
      )}

      {board.commentary && (
        <Section title="Commentary" id="commentary">
          <Typography sx={{ whiteSpace: "pre-line", pl: 2, borderLeft: 3, borderColor: "primary.main" }}>
            {board.commentary}
          </Typography>
        </Section>
      )}

      <Section title="The full deal" id="deal">
        <FullDeal hands={board.hands} you={seat} />
      </Section>

      <Stack spacing={1} sx={{ mt: 4 }}>
        {onNext && (
          <Button variant="contained" size="large" onClick={onNext}>
            Next board
          </Button>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" fullWidth onClick={onBack}>
            Back to board {board.number}
          </Button>
          <Button variant="outlined" fullWidth onClick={onChange}>
            Change result
          </Button>
        </Stack>
      </Stack>
    </Screen>
  );
}
