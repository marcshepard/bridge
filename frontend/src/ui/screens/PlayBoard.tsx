import { Box, Button, Stack, Typography } from "@mui/material";
import type { BoardComparison } from "../../core/compare";
import { describeResult } from "../../core/describe";
import { hcp } from "../../core/deal";
import { type Seat, type TableResult, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import { DuplicateBoard } from "../components/DuplicateBoard";
import { Hand } from "../components/Hand";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { Panel, Screen, Section } from "../controls/Layout";
import { ScoreChip, toneOf } from "../controls/ScoreChip";
import { formatPct, seatWithRelation, vulnerabilityPhrase } from "../labels";
import { EnterResultDialog } from "./EnterResult";

interface Props {
  board: Board;
  seat: Seat;
  position: number; // 1-based position in play order
  total: number;
  /** Our result compared with the field, once entered. */
  comparison: BoardComparison | null;
  entering: boolean;
  onOpenEntry: () => void;
  onCloseEntry: () => void;
  onSave: (r: TableResult) => void;
  onDetails: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** The board as you see it at the table: its details, your 13 cards, and your result once entered. */
export function PlayBoard(p: Props) {
  const { board, seat, comparison: c } = p;
  const hand = board.hands[seat];
  const dir = directionOf(seat);

  return (
    <Screen>
      <Typography color="text.secondary" align="center" sx={{ mb: 2 }}>
        Board {p.position} of {p.total} in this session
      </Typography>

      <DuplicateBoard number={board.number} dealer={board.dealer} vul={board.vul} you={seat} />

      <Typography align="center" sx={{ mt: 2 }}>
        Dealer: {seatWithRelation(seat, board.dealer)}
        <br />
        {vulnerabilityPhrase(seat, board.vul)}
      </Typography>

      <Section title="Your hand" id="your-hand">
        <Panel>
          <Hand hand={hand} large />
        </Panel>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {hcp(hand)} high-card points
        </Typography>
      </Section>

      <Section title="Result" id="result">
        <Panel highlight={!!c}>
          {c ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <ScoreChip
                  label={c.mpPct === null ? `${dir}: no field` : `${dir}: ${formatPct(c.mpPct)}`}
                  tone={toneOf(c.mpPct === null ? null : c.mpPct - 50)}
                />
                <Typography variant="subtitle1">
                  <ScoreText score={c.ourScore} /> · <ResultText result={c.ours.result} />
                </Typography>
              </Stack>
              <Typography color="text.secondary">{describeResult(c.ours)}</Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={p.onDetails}>
                  See details
                </Button>
                <Button color="inherit" onClick={p.onOpenEntry}>
                  Change result
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <Typography color="text.secondary">No result entered</Typography>
              <Button variant="contained" size="large" onClick={p.onOpenEntry}>
                Enter result
              </Button>
            </Stack>
          )}
        </Panel>
      </Section>

      <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
        <Button variant="outlined" fullWidth disabled={!p.onPrev} onClick={p.onPrev ?? undefined}>
          Previous board
        </Button>
        <Button
          variant={c ? "contained" : "outlined"}
          fullWidth
          disabled={!p.onNext}
          onClick={p.onNext ?? undefined}
        >
          Next board
        </Button>
      </Box>

      {p.entering && (
        <EnterResultDialog
          open
          board={board}
          seat={seat}
          initial={c ? c.ours.result : null}
          onSave={p.onSave}
          onClose={p.onCloseEntry}
        />
      )}
    </Screen>
  );
}
