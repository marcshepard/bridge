// Playing a shared game. The owner runs the table: every device shows the board the table is on
// (`currentBoard`), and only the owner enters results and moves everyone on to the next board. The
// owner can also look back at an earlier board from the tally, to correct it.

import { Alert, Container } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Seat, type TableResult, SEATS, directionOf } from "../../core/types";
import {
  toStored,
  compareSessionBoard,
  corrections,
  fromStored,
  pendingContract,
  sessionFromShared,
  tally as tallyOf,
} from "../../session/session";
import type { Game } from "../../providers/types";
import type { CallDto, ClaimDto, EventSnapshot, PlayDto, ResultDto } from "../../session/store";
import { callCode, parseCall } from "../../core/auction";
import { parseContract } from "../../core/contract";
import { cardCode, parseCard } from "../../core/play";
import { games } from "../../services";
import { BoardInfoDialog, BreakdownDialog, FieldDialog } from "../components/BoardDialogs";
import { TallyDialog } from "../components/TallyDialog";
import { ResultText } from "../controls/BridgeText";
import type { NoticeMessage } from "../controls/Notice";
import { toneOf } from "../controls/ScoreChip";
import { formatMargin, isAway } from "../labels";
import { EnterResultDialog, type EntryStep } from "./EnterResult";
import { PlayBoard } from "./PlayBoard";

/** How long the finished table stays on screen after the play ends, before the result screen. */
const END_PAUSE_MS = 3000;

type Dialog = EntryStep | "tally" | "info" | "breakdown" | "field" | null;

interface Props {
  snapshot: EventSnapshot;
  game: Game;
  seat: Seat;
  /** Called with the saved result, so the screen updates without waiting for the live update. */
  onSaved: (result: ResultDto) => void;
  /** Called with the board the owner moved the table to, likewise. */
  onMoved: (board: number) => void;
  /** Called with a call you made, likewise. */
  onCalled: (call: CallDto) => void;
  /** Called with a card you played, likewise. */
  onPlayed: (play: PlayDto) => void;
  /** Called with a claim you made or answered (null: refused or taken back), likewise. */
  onClaim: (board: number, claim: ClaimDto | null) => void;
  /** Show a notice about something someone else did (see controls/Notice). */
  onNotice: (notice: NoticeMessage) => void;
}

export function Play({ snapshot, game, seat, onSaved, onMoved, onCalled, onPlayed, onClaim, onNotice }: Props) {
  const session = useMemo(
    () => sessionFromShared(game, seat, snapshot.startBoard, snapshot.results),
    [game, seat, snapshot.startBoard, snapshot.results],
  );
  const order = session.boardOrder;
  const isOwner = snapshot.you?.isCreator ?? false;
  const tableBoard = snapshot.currentBoard;
  // The owner looking back at an earlier board (from the tally); everyone else stays on the table's.
  const [lookingAt, setLookingAt] = useState<number | null>(null);
  const current = isOwner && lookingAt !== null ? lookingAt : tableBoard;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When the table moves on, any look back ends, and so do dialogs about the old board.
  useEffect(() => {
    setLookingAt(null);
    setDialog((d) => (d === "tally" ? d : null));
  }, [tableBoard]);

  // When the play ends (the last card, or a claim accepted), the backend saves the result. The
  // finished table stays on screen for a moment, showing how it went, before the result screen.
  // Noticed while rendering, not in an effect: an effect runs after the screen has redrawn, so the
  // play table would be taken away for one redraw and come back as a fresh copy (with the last
  // trick turned face down).
  const liveBoard = snapshot.results.find((r) => r.onDevices && r.tricks === null)?.board;
  const [ending, setEnding] = useState<number | null>(null);
  const [wasLive, setWasLive] = useState(liveBoard);
  if (wasLive !== liveBoard) {
    setWasLive(liveBoard);
    const r = wasLive === undefined ? undefined : snapshot.results.find((x) => x.board === wasLive);
    if (r?.onDevices && r.tricks !== null) setEnding(r.board);
  }
  useEffect(() => {
    if (ending === null) return;
    const timer = setTimeout(() => setEnding(null), END_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [ending]);

  // Tell everyone else when the owner corrects a board the table has moved on from: it changes
  // the tally.
  const seen = useRef(snapshot.results);
  useEffect(() => {
    const fixed = corrections(seen.current, snapshot.results, snapshot.you?.slot ?? null)
      .filter((r) => r.tricks !== null && r.board !== tableBoard)
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
  const owner = snapshot.players.find((p) => p.isCreator)?.name ?? "the owner";
  const shared = snapshot.results.find((r) => r.board === board.number);
  const enteredBy = shared ? (snapshot.players.find((p) => p.slot === shared.enteredBy)?.name ?? null) : null;
  const contract = pendingContract(snapshot.results, board.number);

  const position = order.indexOf(board.number);
  const next = order[order.indexOf(tableBoard) + 1] ?? null;

  const tallyLabel = tally.played === 0 ? `${dir}: no boards yet` : `${dir} ${formatMargin(tally.margin)}`;

  const live = !!shared && shared.onDevices && shared.tricks === null;
  // Being bid on the devices: the result has no contract yet. Passed out, the finished auction
  // stays on screen for the moment after, like the play table.
  const bidding =
    (live && shared.contract === "") || (ending === board.number && shared?.contract === "PASS" && snapshot.calls.some((k) => k.board === board.number));
  // The contract on the play table: also for the moment after play ends, once the result is in.
  const playContract =
    contract ??
    (ending === board.number && shared?.declarer && parseContract(shared.contract)
      ? { contract: parseContract(shared.contract)!, declarer: shared.declarer }
      : null);
  const calls = useMemo(
    () =>
      snapshot.calls
        .filter((k) => k.board === board.number)
        .sort((a, b) => a.seq - b.seq)
        .map((k) => parseCall(k.call)!),
    [snapshot.calls, board.number],
  );
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
      {/* Above the screen, outside the part that scrolls, so it can't be missed. */}
      {saveError && (
        <Container maxWidth="sm" sx={{ pt: 2, flexShrink: 0 }}>
          <Alert severity="error" onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        </Container>
      )}
      <PlayBoard
        // A new board is a fresh screen, scrolled to the top.
        key={board.number}
        code={snapshot.code}
        title={snapshot.title}
        board={board}
        position={position + 1}
        seat={seat}
        names={names}
        away={away}
        tally={{
          label: tallyLabel,
          tone: tally.played > 0 ? toneOf(tally.margin) : "neutral",
          ariaLabel: `Running tally: ${tallyLabel}. Show board by board.`,
        }}
        comparison={comparison}
        contract={playContract}
        isOwner={isOwner}
        owner={owner}
        onTally={() => setDialog("tally")}
        onBoardInfo={() => setDialog("info")}
        onEnterResult={() => setDialog("result")}
        onEnterContract={() => setDialog("contract")}
        onStartPlay={
          isOwner && snapshot.mode === "devices"
            ? () => void act("Couldn't start playing", async () => onSaved(await games.startCardPlay(snapshot.code, board.number)))
            : undefined
        }
        bidding={
          bidding
            ? {
                bots: snapshot.players.filter((pl) => pl.isBot && pl.seat).map((pl) => pl.seat!),
                callsForBots: isOwner,
                calls,
                onCall: async (seq, call) => onCalled(await games.call(snapshot.code, board.number, seq, callCode(call))),
              }
            : null
        }
        play={
          !bidding && (live || ending === board.number) && playContract
            ? {
                bots: snapshot.players.filter((pl) => pl.isBot && pl.seat).map((pl) => pl.seat!),
                playsForBots: isOwner,
                calls,
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
        onCorrect={isOwner ? () => setDialog("correct") : undefined}
        onBreakdown={() => setDialog("breakdown")}
        onField={() => setDialog("field")}
        next={next}
        // Moving on is the owner's, from the table's board; from one they're looking back at, it's back.
        backTo={board.number !== tableBoard ? { board: tableBoard, onBack: () => setLookingAt(null) } : null}
        onNext={
          isOwner && next !== null && board.number === tableBoard
            ? () =>
                void act("Couldn't move to the next board", async () => {
                  await games.moveTo(snapshot.code, next);
                  onMoved(next);
                })
            : undefined
        }
      />

      {isOwner && (dialog === "contract" || dialog === "result" || dialog === "correct") && (
        <EnterResultDialog
          open
          // The result after the contract needs only the tricks; without one (shouldn't happen: its
          // button waits for the contract), it takes both.
          step={dialog === "result" ? (contract ? "result" : "full") : dialog}
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
        // Only the owner looks back at earlier boards: everyone else keeps to the table's.
        onOpenBoard={
          isOwner
            ? (b) => {
                setLookingAt(b === tableBoard ? null : b);
                setDialog(null);
              }
            : undefined
        }
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
        </>
      )}
    </>
  );
}
