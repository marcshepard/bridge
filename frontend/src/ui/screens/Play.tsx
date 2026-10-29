// Playing a shared game. Each device moves through the boards on its own; the results are the
// table's, shared live: whoever enters or corrects a board's result, everyone sees it.

import { Alert } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Seat, type TableResult, SEATS, directionOf } from "../../core/types";
import {
  toStored,
  compareSessionBoard,
  corrections,
  fromStored,
  nextUnplayed,
  pendingContract,
  sessionFromShared,
  tally as tallyOf,
} from "../../session/session";
import type { Game } from "../../providers/types";
import type { ClaimDto, EventSnapshot, PlayDto, ResultDto } from "../../session/store";
import { parseContract } from "../../core/contract";
import { cardCode, parseCard } from "../../core/play";
import { games } from "../../services";
import { AnalysisDialog, BoardInfoDialog, BreakdownDialog, FieldDialog } from "../components/BoardDialogs";
import { TallyDialog } from "../components/TallyDialog";
import { ResultText } from "../controls/BridgeText";
import { Screen } from "../controls/Layout";
import type { NoticeMessage } from "../controls/Notice";
import { toneOf } from "../controls/ScoreChip";
import { formatMargin, isAway } from "../labels";
import { EnterResultDialog, type EntryStep } from "./EnterResult";
import { PlayBoard } from "./PlayBoard";

/** How long the finished table stays on screen after the play ends, before the result screen. */
const END_PAUSE_MS = 3000;

type Dialog = EntryStep | "tally" | "info" | "breakdown" | "field" | "analysis" | null;

interface Props {
  snapshot: EventSnapshot;
  game: Game;
  seat: Seat;
  /** Called with the saved result, so the screen updates without waiting for the live update. */
  onSaved: (result: ResultDto) => void;
  /** Called with a card you played, likewise. */
  onPlayed: (play: PlayDto) => void;
  /** Called with a claim you made or answered (null: refused or taken back), likewise. */
  onClaim: (board: number, claim: ClaimDto | null) => void;
  /** Show a notice about something someone else did (see controls/Notice). */
  onNotice: (notice: NoticeMessage) => void;
}

export function Play({ snapshot, game, seat, onSaved, onPlayed, onClaim, onNotice }: Props) {
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

  // When a board's cards start being played on the devices, every device goes to it: the table
  // plays it together.
  const liveBoard = snapshot.results.find((r) => r.onDevices && r.tricks === null)?.board;
  useEffect(() => {
    if (liveBoard !== undefined) setCurrent(liveBoard);
  }, [liveBoard]);

  // When the play ends (the last card, or a claim accepted), the backend saves the result. The
  // finished table stays on screen for a moment, showing how it went, before the result screen.
  const [ending, setEnding] = useState<number | null>(null);
  const wasLive = useRef(liveBoard);
  useEffect(() => {
    const ended = wasLive.current;
    wasLive.current = liveBoard;
    if (ended === undefined || ended === liveBoard) return;
    const r = snapshot.results.find((x) => x.board === ended);
    if (r?.onDevices && r.tricks !== null) setEnding(ended);
  }, [liveBoard]);
  useEffect(() => {
    if (ending === null) return;
    const timer = setTimeout(() => setEnding(null), END_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [ending]);

  // Tell this device when someone else corrects a finished board: it may be one you've moved on
  // from, and it changes the tally.
  const seen = useRef(snapshot.results);
  useEffect(() => {
    const fixed = corrections(seen.current, snapshot.results, snapshot.you?.slot ?? null)
      .filter((r) => r.tricks !== null)
      .at(-1);
    seen.current = snapshot.results;
    if (!fixed || fixed.tricks === null) return;
    const who = snapshot.players.find((p) => p.slot === fixed.enteredBy)?.name ?? "Someone";
    onNotice({
      key: `${fixed.board}-${fixed.updatedAt}`,
      text: (
        <>
          {who} corrected board {fixed.board}: now <ResultText result={fromStored({ ...fixed, tricks: fixed.tricks })} />
        </>
      ),
      action: fixed.board === current ? undefined : { label: "Show board", onClick: () => setCurrent(fixed.board) },
    });
  }, [snapshot.results]); // only on new results, not when you change board

  const board = game.boards.find((b) => b.number === current) ?? game.boards[0]!;
  const comparison = compareSessionBoard(session, game, board.number);
  const tally = useMemo(() => tallyOf(session, game), [session, game]);
  const dir = directionOf(seat);

  const names = Object.fromEntries(
    SEATS.map((s) => [s, snapshot.players.find((p) => p.seat === s)?.name ?? "?"]),
  ) as Record<Seat, string>;
  const mySlot = snapshot.you?.slot ?? null;
  const away = Object.fromEntries(
    SEATS.map((st) => {
      const p = snapshot.players.find((x) => x.seat === st);
      return [st, !!p && isAway(p, mySlot)];
    }),
  ) as Record<Seat, boolean>;
  const shared = snapshot.results.find((r) => r.board === board.number);
  const enteredBy = shared ? (snapshot.players.find((p) => p.slot === shared.enteredBy)?.name ?? null) : null;
  const contract = pendingContract(snapshot.results, board.number);

  const position = order.indexOf(board.number);
  const go = (i: number) => (i >= 0 && i < order.length ? () => setCurrent(order[i]!) : null);

  const tallyLabel = tally.played === 0 ? `${dir}: no boards yet` : `${dir} ${formatMargin(tally.margin)}`;

  const isCreator = snapshot.you?.isCreator ?? false;
  const live = !!shared && shared.onDevices && shared.tricks === null;
  // The contract on the play table: also for the moment after play ends, once the result is in.
  const playContract =
    contract ??
    (ending === board.number && shared?.declarer && parseContract(shared.contract)
      ? { contract: parseContract(shared.contract)!, declarer: shared.declarer }
      : null);
  const cards = useMemo(
    () =>
      snapshot.plays
        .filter((p) => p.board === board.number)
        .sort((a, b) => a.seq - b.seq)
        .map((p) => parseCard(p.card)!),
    [snapshot.plays, board.number],
  );

  /** For the board's buttons: a failure shows above the board, like a failed save. */
  async function act(what: string, run: () => Promise<void>) {
    setSaveError(null);
    try {
      await run();
    } catch (e) {
      setSaveError(`${what}: ${(e as Error).message}`);
    }
  }

  async function save(result: TableResult, contractOnly: boolean) {
    setSaveError(null);
    try {
      const stored = toStored(result);
      onSaved(await games.saveResult(snapshot.code, board.number, contractOnly ? { ...stored, tricks: null } : stored));
      setDialog(null);
    } catch (e) {
      setSaveError(`Couldn't save the result: ${(e as Error).message}`);
    }
  }

  return (
    <>
      {saveError && (
        <Screen>
          <Alert severity="error" onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        </Screen>
      )}
      <PlayBoard
        code={snapshot.code}
        board={board}
        position={position + 1}
        seat={seat}
        names={names}
        away={away}
        total={order.length}
        tally={{
          label: tallyLabel,
          tone: tally.played > 0 ? toneOf(tally.margin) : "neutral",
          ariaLabel: `Running tally: ${tallyLabel}. Show board by board.`,
        }}
        comparison={comparison}
        contract={playContract}
        enteredBy={enteredBy}
        onTally={() => setDialog("tally")}
        onBoardInfo={() => setDialog("info")}
        onEnterContract={() => setDialog("contract")}
        onEnterResult={() => setDialog("result")}
        onStartPlay={
          isCreator && contract
            ? () => void act("Couldn't start playing", async () => onSaved(await games.startCardPlay(snapshot.code, board.number)))
            : undefined
        }
        play={
          (live || ending === board.number) && playContract
            ? {
                bots: snapshot.players.filter((pl) => pl.isBot && pl.seat).map((pl) => pl.seat!),
                playsForBots: isCreator,
                cards,
                claim: snapshot.claims.find((k) => k.board === board.number) ?? null,
                onPlay: async (seq, card) => onPlayed(await games.playCard(snapshot.code, board.number, seq, cardCode(card))),
                onClaim: async (tricks) => onClaim(board.number, await games.claim(snapshot.code, board.number, tricks)),
                onAnswerClaim: async (accept) => onClaim(board.number, await games.answerClaim(snapshot.code, board.number, accept)),
                onWithdrawClaim: async () => {
                  await games.withdrawClaim(snapshot.code, board.number);
                  onClaim(board.number, null);
                },
              }
            : null
        }
        onCorrect={() => setDialog("correct")}
        onBreakdown={() => setDialog("breakdown")}
        onField={() => setDialog("field")}
        onAnalysis={() => setDialog("analysis")}
        onPrev={go(position - 1)}
        onNext={go(position + 1)}
      />

      {(dialog === "contract" || dialog === "result" || dialog === "correct") && (
        <EnterResultDialog
          open
          step={dialog}
          board={board}
          seat={seat}
          initial={comparison ? comparison.ours.result : contract ? { ...contract, tricks: null } : null}
          onSave={(r, contractOnly) => void save(r, contractOnly)}
          lastSavedBy={enteredBy}
          onClose={() => setDialog(null)}
        />
      )}
      <TallyDialog
        open={dialog === "tally"}
        onClose={() => setDialog(null)}
        tally={tally}
        direction={dir}
        onOpenBoard={(b) => {
          setCurrent(b);
          setDialog(null);
        }}
      />
      <BoardInfoDialog
        open={dialog === "info"}
        onClose={() => setDialog(null)}
        board={board}
        position={position + 1}
        title={snapshot.title}
        game={game}
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
