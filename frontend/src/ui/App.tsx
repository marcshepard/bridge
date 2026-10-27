import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Alert, AppBar, Box, Button, Container, Toolbar, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { type Seat, type TableResult, directionOf } from "../core/types";
import type { Game } from "../providers/types";
import { providerById, sessionStore } from "../services";
import { type Session, compareSessionBoard, newSession, nextUnplayed, tally, toStored } from "../session/session";
import { Screen } from "./controls/Layout";
import { ScoreChip, toneOf } from "./controls/ScoreChip";
import { formatMargin, formatPct } from "./labels";
import { BoardReview } from "./screens/BoardReview";
import { Home } from "./screens/Home";
import { NewSession } from "./screens/NewSession";
import { PlayBoard } from "./screens/PlayBoard";
import { TallyView } from "./screens/TallyView";

type View =
  | { name: "home" }
  | { name: "new" }
  | { name: "board"; board: number; entering?: boolean }
  | { name: "review"; board: number }
  | { name: "tally" };

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "home" });

  const session = sessions.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    sessionStore
      .list()
      .then(setSessions)
      .catch((e: Error) => setStoreError(`Couldn't load your sessions: ${e.message}`));
  }, []);

  // New screen → start at the top (but not when only the result dialog opens or closes).
  const screenKey = view.name === "board" || view.name === "review" ? `${view.name}-${view.board}` : view.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  // Load the game behind the active session.
  useEffect(() => {
    if (!session) return;
    if (game?.summary.id === session.gameId) return;
    let live = true;
    setLoadError(null);
    providerById(session.providerId)
      .getGame(session.gameId)
      .then((g) => live && setGame(g))
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [session, game]);

  const currentTally = useMemo(
    () => (session && game && game.summary.id === session.gameId ? tally(session, game) : null),
    [session, game],
  );

  /** Save through the store; the screen updates immediately and a failed save is reported. */
  function persist(s: Session) {
    sessionStore.save(s).catch((e: Error) => setStoreError(`Couldn't save your result: ${e.message}`));
  }

  function start(providerId: string, g: Game, seat: Seat, startBoard: number) {
    const s = newSession(providerId, g, seat, startBoard);
    setSessions((all) => [...all, s]);
    persist(s);
    setActiveId(s.id);
    setGame(g);
    setView({ name: "board", board: s.boardOrder[0]! });
  }

  function resume(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setActiveId(id);
    const next = nextUnplayed(s);
    setView(next === null ? { name: "tally" } : { name: "board", board: next });
  }

  function saveResult(boardNumber: number, r: TableResult) {
    if (!session) return;
    const updated: Session = {
      ...session,
      results: { ...session.results, [boardNumber]: toStored(r) },
      updatedAt: new Date().toISOString(),
    };
    setSessions((all) => all.map((s) => (s.id === updated.id ? updated : s)));
    persist(updated);
    setView({ name: "board", board: boardNumber }); // close the dialog, stay on the board
  }

  const storeNotice = storeError && (
    <Container maxWidth="sm" sx={{ pt: 2 }}>
      <Alert severity="error">{storeError}</Alert>
    </Container>
  );

  if (view.name === "new") {
    return (
      <>
        {storeNotice}
        <NewSession onStart={start} onCancel={() => setView({ name: "home" })} />
      </>
    );
  }
  if (view.name === "home" || !session) {
    return (
      <>
        {storeNotice}
        <Home
          sessions={sessions}
          onResume={resume}
          onNew={() => setView({ name: "new" })}
          onDelete={(id) => {
            setSessions((all) => all.filter((s) => s.id !== id));
            sessionStore.remove(id).catch((e: Error) => setStoreError(e.message));
          }}
        />
      </>
    );
  }

  const dir = directionOf(session.seat);
  const t = currentTally;
  const tallyLabel =
    !t || t.played === 0
      ? `${dir}: no boards yet`
      : `${dir} ${formatMargin(t.margin)}${t.averagePct !== null ? ` (${formatPct(t.averagePct)})` : ""}`;

  const header = (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 1 }}>
        <Button
          color="inherit"
          startIcon={<ArrowBackIcon />}
          onClick={() => {
            setActiveId(null);
            setView({ name: "home" });
          }}
        >
          Sessions
        </Button>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap variant="subtitle1">
            {session.gameTitle}
          </Typography>
          <Typography noWrap variant="caption" component="p">
            Sitting {session.seat}
          </Typography>
        </Box>
        <ScoreChip
          label={tallyLabel}
          tone={t && t.played > 0 ? toneOf(t.margin) : "neutral"}
          onClick={() => setView({ name: "tally" })}
          ariaLabel={`Running tally: ${tallyLabel}. Show board by board.`}
        />
      </Toolbar>
    </AppBar>
  );

  let screen: React.ReactNode;
  if (loadError) {
    screen = (
      <Screen>
        <Alert severity="error">This session's game couldn't be loaded: {loadError}</Alert>
      </Screen>
    );
  } else if (!game || game.summary.id !== session.gameId || !t) {
    screen = (
      <Screen>
        <Typography color="text.secondary">Loading the game…</Typography>
      </Screen>
    );
  } else {
    const order = session.boardOrder;
    const neighbour = (n: number, step: number) => {
      const i = order.indexOf(n) + step;
      return i >= 0 && i < order.length ? order[i]! : null;
    };

    if (view.name === "tally") {
      const next = nextUnplayed(session);
      screen = (
        <TallyView
          tally={t}
          direction={dir}
          total={order.length}
          onOpen={(b) => setView({ name: "review", board: b })}
          onContinue={next === null ? null : () => setView({ name: "board", board: next })}
        />
      );
    } else {
      const board = game.boards.find((b) => b.number === view.board);
      const comparison = board ? compareSessionBoard(session, game, board.number) : null;
      if (!board) {
        screen = (
          <Screen>
            <Alert severity="error">Board {view.board} isn't in this game.</Alert>
          </Screen>
        );
      } else if (view.name === "review" && comparison) {
        const next = nextUnplayed(session);
        screen = (
          <BoardReview
            board={board}
            seat={session.seat}
            c={comparison}
            onBack={() => setView({ name: "board", board: board.number })}
            onChange={() => setView({ name: "board", board: board.number, entering: true })}
            onNext={next === null ? null : () => setView({ name: "board", board: next })}
          />
        );
      } else {
        const prev = neighbour(board.number, -1);
        const next = neighbour(board.number, 1);
        screen = (
          <PlayBoard
            board={board}
            seat={session.seat}
            position={order.indexOf(board.number) + 1}
            total={order.length}
            comparison={comparison}
            entering={view.name === "board" && !!view.entering}
            onOpenEntry={() => setView({ name: "board", board: board.number, entering: true })}
            onCloseEntry={() => setView({ name: "board", board: board.number })}
            onSave={(r) => saveResult(board.number, r)}
            onDetails={() => setView({ name: "review", board: board.number })}
            onPrev={prev === null ? null : () => setView({ name: "board", board: prev })}
            onNext={next === null ? null : () => setView({ name: "board", board: next })}
          />
        );
      }
    }
  }

  return (
    <>
      {header}
      {storeNotice}
      {screen}
    </>
  );
}
