// Playing a shared game. Each device moves through the boards on its own; the results are the
// table's, shared live: whoever enters or corrects a board's result, everyone sees it.

import { Alert } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { type Seat, type TableResult, SEATS, directionOf } from "../../core/types";
import { toStored, compareSessionBoard, nextUnplayed, sessionFromShared, tally as tallyOf } from "../../session/session";
import type { Game } from "../../providers/types";
import type { EventSnapshot, ResultDto } from "../../session/store";
import { games } from "../../services";
import { AnalysisDialog, BreakdownDialog, FieldDialog } from "../components/BoardDialogs";
import { TallyDialog } from "../components/TallyDialog";
import { Screen } from "../controls/Layout";
import { toneOf } from "../controls/ScoreChip";
import { formatMargin } from "../labels";
import { EnterResultDialog } from "./EnterResult";
import { PlayBoard } from "./PlayBoard";

type Dialog = "enter" | "tally" | "breakdown" | "field" | "analysis" | null;

interface Props {
  snapshot: EventSnapshot;
  game: Game;
  seat: Seat;
  /** Called with the saved result, so the screen updates without waiting for the live update. */
  onSaved: (result: ResultDto) => void;
}

export function Play({ snapshot, game, seat, onSaved }: Props) {
  const session = useMemo(
    () => sessionFromShared(game, seat, snapshot.startBoard, snapshot.results),
    [game, seat, snapshot.startBoard, snapshot.results],
  );
  const order = session.boardOrder;
  // Start on the first board without a result; after that, this device moves on its own.
  const [current, setCurrent] = useState<number>(() => nextUnplayed(session) ?? order[0]!);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [current]);

  const board = game.boards.find((b) => b.number === current) ?? game.boards[0]!;
  const comparison = compareSessionBoard(session, game, board.number);
  const tally = useMemo(() => tallyOf(session, game), [session, game]);
  const dir = directionOf(seat);

  const names = Object.fromEntries(
    SEATS.map((s) => [s, snapshot.players.find((p) => p.seat === s)?.name ?? "?"]),
  ) as Record<Seat, string>;
  const shared = snapshot.results.find((r) => r.board === board.number);
  const enteredBy = shared ? (snapshot.players.find((p) => p.slot === shared.enteredBy)?.name ?? null) : null;

  const position = order.indexOf(board.number);
  const go = (i: number) => (i >= 0 && i < order.length ? () => setCurrent(order[i]!) : null);

  const tallyLabel = tally.played === 0 ? `${dir}: no boards yet` : `${dir} ${formatMargin(tally.margin)}`;

  async function save(result: TableResult) {
    setSaveError(null);
    try {
      onSaved(await games.saveResult(snapshot.code, board.number, toStored(result)));
      setDialog(null);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  return (
    <>
      {saveError && (
        <Screen>
          <Alert severity="error" onClose={() => setSaveError(null)}>
            Couldn't save the result: {saveError}
          </Alert>
        </Screen>
      )}
      <PlayBoard
        title={snapshot.title}
        board={board}
        seat={seat}
        names={names}
        position={position + 1}
        total={order.length}
        tally={{
          label: tallyLabel,
          tone: tally.played > 0 ? toneOf(tally.margin) : "neutral",
          ariaLabel: `Running tally: ${tallyLabel}. Show board by board.`,
        }}
        comparison={comparison}
        enteredBy={enteredBy}
        onTally={() => setDialog("tally")}
        onEnter={() => setDialog("enter")}
        onBreakdown={() => setDialog("breakdown")}
        onField={() => setDialog("field")}
        onAnalysis={() => setDialog("analysis")}
        onPrev={go(position - 1)}
        onNext={go(position + 1)}
      />

      {dialog === "enter" && (
        <EnterResultDialog
          open
          board={board}
          seat={seat}
          initial={comparison ? comparison.ours.result : null}
          onSave={(r) => void save(r)}
          onClose={() => setDialog(null)}
        />
      )}
      <TallyDialog
        open={dialog === "tally"}
        onClose={() => setDialog(null)}
        tally={tally}
        direction={dir}
        total={order.length}
        onOpenBoard={(b) => {
          setCurrent(b);
          setDialog(null);
        }}
      />
      {comparison && (
        <>
          <BreakdownDialog open={dialog === "breakdown"} onClose={() => setDialog(null)} board={board} seat={seat} c={comparison} />
          <FieldDialog open={dialog === "field"} onClose={() => setDialog(null)} board={board} seat={seat} c={comparison} />
          <AnalysisDialog open={dialog === "analysis"} onClose={() => setDialog(null)} board={board} seat={seat} c={comparison} />
        </>
      )}
    </>
  );
}
