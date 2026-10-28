// The app's top level: who you are, which game you're in, and which screen or dialog is showing.
//
// Pages: Home, and the game (lobby, then seats). Start a game, Join a game, Help and Leave game are
// dialogs over them, so there are no back buttons. A shared link (`?join=CODE`) opens the join
// dialog with the code filled in. A reload goes straight back to the game you're in.

import { Alert, Button, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseGameFile } from "../providers/gameFile";
import { games, profile } from "../services";
import { ApiError } from "../session/apiGameStore";
import type { EventSnapshot, ResultDto } from "../session/store";
import { AppHeader } from "./controls/AppHeader";
import { Screen } from "./controls/Layout";
import { Notice, type NoticeMessage } from "./controls/Notice";
import { SheetDialog } from "./controls/SheetDialog";
import { HelpDialog } from "./components/HelpDialog";
import { InstallBanner } from "./components/InstallBanner";
import { ReconnectingBanner } from "./components/ReconnectingBanner";
import { SeatRequestDialog } from "./components/SeatRequestDialog";
import { formatJoinCode, sameName, seatRequestNews } from "./labels";
import { Home } from "./screens/Home";
import { JoinGame } from "./screens/JoinGame";
import { Lobby } from "./screens/Lobby";
import { Play } from "./screens/Play";
import { StartGame } from "./screens/StartGame";

type Dialog = "start" | "join" | "help" | "leave" | null;

/** A code from a shared link, removed from the address bar once read (other options, like dev mode's `?as=`, stay). */
function takeJoinCodeFromUrl(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("join");
  if (code === null) return null;
  url.searchParams.delete("join");
  window.history.replaceState(null, "", url);
  return code;
}

/** While the live connection is down, check this often whether you still have your seat. */
const OFFLINE_CHECK_MS = 10_000;

/**
 * The game you're in: its snapshot, kept current by live updates, and whether this device's live
 * connection is up (`online`). After a dropped connection the whole snapshot is fetched again.
 * `onNews` hears about things worth telling you (a seat changing hands).
 */
function useGame(code: string | null, onGone: (why: string) => void, onNews: (text: string) => void) {
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // The latest snapshot, for live messages that need to know who's who.
  const latest = useRef(snapshot);
  latest.current = snapshot;

  /** A result saved here or pushed from another device: replace that board's result. */
  const mergeResult = useCallback((result: ResultDto) => {
    setSnapshot((s) => s && { ...s, results: [...s.results.filter((r) => r.board !== result.board), result] });
  }, []);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const snap = await games.snapshot(code);
      if (!snap.you) {
        onGone("You're no longer in that game: someone else has taken your seat.");
        return;
      }
      setSnapshot(snap);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) onGone("That game no longer exists.");
      else setError((e as Error).message);
    }
  }, [code, onGone]);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setOnline(true);
    if (!code) return;
    void refresh();
    return games.subscribe(code, (m) => {
      if (m.type === "deleted") onGone("The person who started the game cancelled it.");
      else if (m.type === "disconnected") setOnline(false);
      else if (m.type === "presence") {
        setSnapshot((s) => s && { ...s, players: s.players.map((p) => ({ ...p, connected: m.connected.includes(p.slot) })) });
      } else if (m.type === "result") {
        mergeResult(m.result);
      } else if (m.type === "request") {
        setSnapshot((s) => s && { ...s, requests: [...s.requests.filter((r) => r.id !== m.request.id), m.request] });
      } else if (m.type === "requestClosed") {
        setSnapshot((s) => s && { ...s, requests: s.requests.filter((r) => r.id !== m.request.id) });
        const snap = latest.current;
        const moving = sameName(m.request.name, m.replacedName);
        if (m.outcome === "allowed" && snap?.you?.slot === m.request.slot) {
          // It's your seat that changed hands: this device is out of the game.
          onGone(moving ? "You've moved this game to another device." : `${m.request.name} has replaced you in this game.`);
          return;
        }
        const by = snap?.players.find((p) => p.slot === m.by)?.name ?? null;
        const news = seatRequestNews(m.outcome, m.request.name, m.replacedName, by);
        if (news) onNews(news);
      } else {
        // players, status, reconnected: fetch the whole picture again
        if (m.type === "reconnected") setOnline(true);
        void refresh();
      }
    });
  }, [code, refresh, onGone, onNews, mergeResult]);

  // While disconnected, keep checking: if your seat was given to someone else meanwhile, the live
  // connection can't come back, and this is how you find out.
  useEffect(() => {
    if (online || !code) return;
    void refresh();
    const timer = setInterval(() => void refresh(), OFFLINE_CHECK_MS);
    return () => clearInterval(timer);
  }, [online, code, refresh]);

  return { snapshot, error, refresh, mergeResult, online };
}

export function App() {
  const [name, setName] = useState(profile.name());
  const [linkCode] = useState(takeJoinCodeFromUrl);
  const [code, setCode] = useState<string | null>(() => profile.currentGame());
  const [dialog, setDialog] = useState<Dialog>(() => (linkCode !== null && profile.name() ? "join" : null));
  const [notice, setNotice] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  /** Back to Home, still holding your seat (you can rejoin with the code). */
  function goHome(why: string | null) {
    profile.setCurrentGame(null);
    setCode(null);
    setNotice(why);
  }
  /** The game is over or gone for you: forget it on this device. */
  const onGone = useCallback(
    (why: string) => {
      if (code) profile.forget(code);
      setCode(null);
      setNotice(why || null);
    },
    [code],
  );

  // One notice at a time, for news from the rest of the table (see controls/Notice).
  const [news, setNews] = useState<NoticeMessage | null>(null);
  const onNews = useCallback((text: string) => setNews({ key: Date.now(), text }), []);
  const [laterRequests, setLaterRequests] = useState<string[]>([]);

  const { snapshot, error, mergeResult, online } = useGame(code, onGone, onNews);
  // Seat requests to answer: only once you're in the game, and not ones you've put off.
  const request = snapshot?.you ? snapshot.requests.find((r) => !laterRequests.includes(r.id)) : undefined;
  // The game file is parsed once per game, not on every live update.
  const gameJson = snapshot?.game;
  const game = useMemo(() => (gameJson ? parseGameFile(gameJson) : null), [snapshot?.code]);
  const mySeat = snapshot?.you?.seat ?? null;

  function enter(c: string) {
    setDialog(null);
    setNotice(null);
    setCode(c);
  }

  async function leave() {
    if (!code || !snapshot) return;
    setLeaveError(null);
    try {
      if (snapshot.status === "lobby") {
        await games.leave(code);
        goHome(null);
      } else {
        // During play your seat stays yours: rejoining with the code takes you back to it.
        goHome(`You left ${snapshot.title}. To go back, join with code ${formatJoinCode(code)}.`);
      }
      setDialog(null);
    } catch (e) {
      setLeaveError((e as Error).message);
    }
  }

  let page: React.ReactNode;
  if (!code) {
    page = (
      <Home
        name={name}
        notice={notice}
        onName={(n) => {
          profile.setName(n);
          setName(n);
          if (linkCode !== null && !code) setDialog("join");
        }}
        onStart={() => setDialog("start")}
        onJoin={() => setDialog("join")}
        onHelp={() => setDialog("help")}
      />
    );
  } else if (snapshot && snapshot.status === "playing" && game && mySeat) {
    page = <Play snapshot={snapshot} game={game} seat={mySeat} onSaved={mergeResult} onNotice={setNews} />;
  } else if (snapshot) {
    page = <Lobby snapshot={snapshot} onDone={() => onGone("")} />;
  } else {
    page = (
      <Screen>
        {error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => goHome(null)}>
                Home
              </Button>
            }
          >
            Couldn't load the game: {error}
          </Alert>
        ) : (
          <Typography color="text.secondary">Loading the game…</Typography>
        )}
      </Screen>
    );
  }

  const isCreatorInLobby = snapshot?.status === "lobby" && snapshot.you?.isCreator;

  return (
    <>
      <AppHeader
        name={name}
        onHelp={() => setDialog("help")}
        onLeaveGame={code && snapshot ? () => setDialog("leave") : undefined}
      />
      {code && !online && <ReconnectingBanner />}
      <InstallBanner />
      {page}

      <StartGame open={dialog === "start"} name={name} onClose={() => setDialog(null)} onCreated={enter} />
      <JoinGame
        open={dialog === "join"}
        name={name}
        initialCode={linkCode ?? ""}
        onClose={() => setDialog(null)}
        onJoined={enter}
      />
      <HelpDialog open={dialog === "help"} onClose={() => setDialog(null)} />
      <Notice notice={news} onClose={() => setNews(null)} />
      {code && snapshot && request && (
        <SeatRequestDialog
          key={request.id}
          request={request}
          players={snapshot.players}
          onAnswer={async (allow) => {
            try {
              await games.answerSeatRequest(code, request.id, allow);
            } catch (e) {
              // Someone else got there first: their answer stands, and the news is on its way.
              if (!(e instanceof ApiError && e.status === 409)) throw e;
            }
            setLaterRequests((ids) => [...ids, request.id]);
          }}
          onLater={() => setLaterRequests((ids) => [...ids, request.id])}
        />
      )}
      <SheetDialog
        open={dialog === "leave"}
        title="Leave this game?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button color="inherit" onClick={() => setDialog(null)}>
              Stay
            </Button>
            <Button variant="contained" color="error" onClick={() => void leave()}>
              {isCreatorInLobby ? "Cancel the game" : "Leave"}
            </Button>
          </>
        }
      >
        <Typography>
          {isCreatorInLobby
            ? "You started this game, so leaving cancels it for everyone who has joined."
            : snapshot?.status === "lobby"
              ? "Your place will be freed for someone else."
              : "Your seat stays yours: join again with the code to come back."}
        </Typography>
        {leaveError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {leaveError}
          </Alert>
        )}
      </SheetDialog>
    </>
  );
}
