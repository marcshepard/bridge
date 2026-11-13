// The app's top level: who you are, which game you're in, and which screen or dialog is showing.
//
// Pages: Home, and the game (lobby, then seats). Start a game, Join a game, Help and Leave game are
// dialogs over them, so there are no back buttons. A shared link (`?join=CODE`) opens the join
// dialog with the code filled in. A reload goes straight back to the game you're in.

import { Alert, Box, Button, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseGameFile } from "../providers/gameFile";
import { games, profile } from "../services";
import { ApiError } from "../session/apiGameStore";
import type { CallDto, ClaimDto, CurrentGameInfo, EventSnapshot, PlayDto, ResultDto, SkipBoardResponse } from "../session/store";
import { AppHeader } from "./controls/AppHeader";
import { Screen } from "./controls/Layout";
import { Notice, type NoticeMessage } from "./controls/Notice";
import { SheetDialog } from "./controls/SheetDialog";
import { BiddingSystemDialog } from "./components/BiddingSystemDialog";
import { HelpDialog } from "./components/HelpDialog";
import { InstallBanner } from "./components/InstallBanner";
import { useInstall } from "./install";
import { SeatRequestDialog } from "./components/SeatRequestDialog";
import { formatJoinCode, sameName, seatRequestNews } from "./labels";
import { Home } from "./screens/Home";
import { JoinGame } from "./screens/JoinGame";
import { Lobby } from "./screens/Lobby";
import { Play } from "./screens/Play";
import { Practice } from "./screens/Practice";
import { StartGame } from "./screens/StartGame";

type Dialog = "start" | "join" | "practice" | "help" | "leave" | "install" | null;

/** A code from a shared link, removed from the address bar once read (other options, like dev mode's `?as=`, stay). */
function takeJoinCodeFromUrl(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("join");
  if (code === null) return null;
  url.searchParams.delete("join");
  window.history.replaceState(null, "", url);
  return code;
}

/** Is this board's play happening on the devices right now? */
const isLive = (r: ResultDto) => r.onDevices && r.tricks === null;

/** While the live connection is down, check this often whether you still have your seat. */
const OFFLINE_CHECK_MS = 10_000;
/**
 * Back within this long, the app opens straight into your game (a phone that slept mid-session);
 * after longer, on Home, with a note about it (and Resume).
 */
const RESUME_WITHIN_MS = 6 * 60 * 60 * 1000;

/** What Home's note says about a game you're in: its title, board, who else is there. */
function gameInfo(snapshot: EventSnapshot, mySlot: number): CurrentGameInfo {
  const others = snapshot.players.filter((p) => p.slot !== mySlot);
  return {
    title: snapshot.title,
    board: snapshot.currentBoard,
    boardCount: snapshot.game.boards.length,
    others: others.filter((p) => !p.isBot).map((p) => p.name),
    practice: others.length > 0 && others.every((p) => p.isBot),
  };
}

/** Was the current game on screen recently enough to open straight back into it? */
function recentlyInGame(): boolean {
  const at = profile.lastInGameAt();
  return at !== null && Date.now() - at < RESUME_WITHIN_MS;
}
/** How long the live connection is down before the header says "Reconnecting". */
const RECONNECTING_AFTER_MS = 5_000;
/** How long another player's device has been gone before they show as away. */
const AWAY_AFTER_MS = 5_000;

/**
 * The snapshot as the screens show it: another player shows as away only once their device has
 * been gone a few seconds, so a blip (a background window's connection dropping and coming
 * straight back) shows nothing on anyone's screen. Coming back shows at once, and players who are
 * already away when the game opens (bots, say) show as away straight away.
 */
function useSteadyPresence(snapshot: EventSnapshot | null): EventSnapshot | null {
  const down = snapshot?.players.filter((p) => !p.connected).map((p) => p.slot).join(",") ?? null;
  // The away list once it has held for AWAY_AFTER_MS (null: no game yet, so the first list counts).
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (down === null) {
      setSettled(null);
      return;
    }
    const timer = setTimeout(() => setSettled(down), settled === null ? 0 : AWAY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [down]);
  return useMemo(() => {
    if (!snapshot) return snapshot;
    const away = new Set((settled ?? down ?? "").split(",").filter(Boolean).map(Number));
    return { ...snapshot, players: snapshot.players.map((p) => ({ ...p, connected: p.connected || !away.has(p.slot) })) };
  }, [snapshot, settled, down]);
}

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

  /**
   * A result saved here or pushed from another device: replace that board's result. A board's
   * claim is kept while it's being played on the devices, and when that play has just ended (the
   * finished table stays on screen for a moment). Its auction and cards are kept for good, for the
   * bidding and play reviews. A fresh start of the board (its auction again, or its play stopped)
   * has none of them.
   */
  const mergeResult = useCallback((result: ResultDto) => {
    setSnapshot((s) => {
      if (!s) return s;
      const before = s.results.find((r) => r.board === result.board);
      if (before?.contract === "SKIP") return s;
      const keepPlays = result.onDevices && !!before && isLive(before);
      const freshStart = result.onDevices && result.contract === "" && !(before && isLive(before));
      return {
        ...s,
        results: [...s.results.filter((r) => r.board !== result.board), result],
        calls: freshStart ? s.calls.filter((k) => k.board !== result.board) : s.calls,
        // Cards go when the board starts afresh or stops being played on the devices.
        plays: freshStart || !result.onDevices || (result.contract !== "" && !(before && isLive(before)) && isLive(result))
          ? s.plays.filter((p) => p.board !== result.board)
          : s.plays,
        claims: keepPlays ? s.claims : s.claims.filter((k) => k.board !== result.board),
      };
    });
  }, []);

  /** The owner moved the table to a board (here, or pushed to everyone). */
  const mergeCurrent = useCallback((board: number) => {
    setSnapshot((s) => s && { ...s, currentBoard: board });
  }, []);

  const mergeSkip = useCallback(({ currentBoard, skipped }: SkipBoardResponse) => {
    setSnapshot((s) => s && {
      ...s,
      currentBoard: s.currentBoard === skipped.board ? currentBoard : s.currentBoard,
      results: [...s.results.filter((r) => r.board !== skipped.board), skipped],
    });
  }, []);

  /** A claim made, answered or ended (null) here or on another device. */
  const mergeClaim = useCallback((board: number, claim: ClaimDto | null) => {
    setSnapshot((s) => s && { ...s, claims: [...s.claims.filter((k) => k.board !== board), ...(claim ? [claim] : [])] });
  }, []);

  /** A call made here or on another device (once, however often it's heard). */
  const mergeCall = useCallback((call: CallDto) => {
    setSnapshot(
      (s) => s && (s.calls.some((k) => k.board === call.board && k.seq === call.seq) ? s : { ...s, calls: [...s.calls, call] }),
    );
  }, []);

  /** A card played here or on another device (once, however often it's heard). */
  const mergePlay = useCallback((play: PlayDto) => {
    setSnapshot(
      (s) => s && (s.plays.some((p) => p.board === play.board && p.seq === play.seq) ? s : { ...s, plays: [...s.plays, play] }),
    );
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
      if (m.type === "deleted") onGone("The game's owner cancelled it.");
      else if (m.type === "disconnected") setOnline(false);
      else if (m.type === "presence") {
        setSnapshot((s) => s && { ...s, players: s.players.map((p) => ({ ...p, connected: m.connected.includes(p.slot) })) });
      } else if (m.type === "result") {
        mergeResult(m.result);
      } else if (m.type === "board") {
        mergeCurrent(m.board);
      } else if (m.type === "boardSkipped") {
        mergeSkip(m);
      } else if (m.type === "call") {
        mergeCall(m.call);
      } else if (m.type === "play") {
        mergePlay(m.play);
      } else if (m.type === "claim") {
        mergeClaim(m.board, m.claim);
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
  }, [code, refresh, onGone, onNews, mergeResult, mergeCurrent, mergeSkip, mergeCall, mergePlay, mergeClaim]);

  // While disconnected, keep checking: if your seat was given to someone else meanwhile, the live
  // connection can't come back, and this is how you find out.
  useEffect(() => {
    if (online || !code) return;
    void refresh();
    const timer = setInterval(() => void refresh(), OFFLINE_CHECK_MS);
    return () => clearInterval(timer);
  }, [online, code, refresh]);

  return { snapshot, error, refresh, mergeResult, mergeCurrent, mergeSkip, mergeCall, mergePlay, mergeClaim, online };
}

export function App() {
  const [name, setName] = useState(profile.name());
  const [linkCode] = useState(takeJoinCodeFromUrl);
  // The game on screen (null: Home). Your current game stays in the profile when you go Home.
  const [code, setCode] = useState<string | null>(() => (recentlyInGame() ? profile.currentGame() : null));
  const [dialog, setDialog] = useState<Dialog>(() => (linkCode !== null && profile.name() ? "join" : null));
  const install = useInstall();
  const [notice, setNotice] = useState<string | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [mySystem, setMySystem] = useState(() => profile.biddingSystem());
  const [leaveError, setLeaveError] = useState<string | null>(null);

  /** To Home with your game still current: Home's note about it has Resume. */
  function showHome() {
    setDialog(null);
    setNotice(null);
    setCode(null);
  }
  /** Back to Home, still holding your seat (you can rejoin with the code), and no longer current. */
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

  const live = useGame(code, onGone, onNews);
  const { error, mergeResult, mergeCurrent, mergeSkip, mergeCall, mergePlay, mergeClaim, online } = live;
  const snapshot = useSteadyPresence(live.snapshot);
  // Say "Reconnecting" only once the connection has been down a while: a blip that's back within
  // a few seconds (the usual case) shows nothing.
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    setReconnecting(false);
    if (online || !code) return;
    const timer = setTimeout(() => setReconnecting(true), RECONNECTING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [online, code]);
  // Seat requests to answer: only once you're in the game, and not ones you've put off.
  const request = snapshot?.you ? snapshot.requests.find((r) => !laterRequests.includes(r.id)) : undefined;
  // The game file is parsed once per game, not on every live update.
  const gameJson = snapshot?.game;
  const game = useMemo(() => (gameJson ? parseGameFile(gameJson) : null), [snapshot?.code]);
  const mySeat = snapshot?.you?.seat ?? null;

  // While you're in a game on screen, remember so, with what Home's note about it says.
  const inGame = useMemo(() => (code && snapshot?.you ? gameInfo(snapshot, snapshot.you.slot) : null), [code, snapshot]);
  const inGameRef = useRef(inGame);
  inGameRef.current = inGame;
  useEffect(() => {
    if (inGame) profile.noteInGame(inGame);
  }, [inGame]);
  // Put away and brought back after a long time (a phone left asleep overnight): go Home, as if
  // the app had just been opened.
  const onScreen = inGame !== null;
  useEffect(() => {
    if (!onScreen) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (inGameRef.current) profile.noteInGame(inGameRef.current);
      } else if (!recentlyInGame()) showHome();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onScreen]);
  // Bumped when Home's note is closed, so Home shows the profile as it now is.
  const [, setNoteClosed] = useState(0);

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
        onPractice={() => setDialog("practice")}
        onHelp={() => setDialog("help")}
        lastGame={
          profile.currentGame()
            ? {
                code: profile.currentGame()!,
                info: profile.currentGameInfo(),
                at: profile.lastInGameAt(),
                onGoBack: () => enter(profile.currentGame()!),
                onClose: () => {
                  // Your seat is kept: the join code still takes you back.
                  profile.setCurrentGame(null);
                  setNoteClosed((n) => n + 1);
                },
              }
            : undefined
        }
      />
    );
  } else if (snapshot && snapshot.status === "playing" && game && mySeat) {
    page = (
      <Play
        snapshot={snapshot}
        game={game}
        seat={mySeat}
        onSaved={mergeResult}
        onMoved={mergeCurrent}
        onSkipped={mergeSkip}
        onCalled={mergeCall}
        onPlayed={mergePlay}
        onClaim={mergeClaim}
        onNotice={setNews}
      />
    );
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
    // The app fills the window: header (and install banner) on top, then the screen, whose middle
    // is all that scrolls (see Screen in controls/Layout.tsx).
    <Box sx={{ height: "100vh", "@supports (height: 100dvh)": { height: "100dvh" }, display: "flex", flexDirection: "column" }}>
      <AppHeader
        name={name}
        onHelp={() => setDialog("help")}
        onHome={code ? showHome : undefined}
        onLeaveGame={code && snapshot ? () => setDialog("leave") : undefined}
        onInstall={install.canInstall ? () => setDialog("install") : undefined}
        onSystem={() => setSystemOpen(true)}
        reconnecting={reconnecting}
      />
      <InstallBanner open={dialog === "install"} onOpen={() => setDialog("install")} onClose={() => setDialog(null)} />
      {page}

      <StartGame open={dialog === "start"} name={name} onClose={() => setDialog(null)} onCreated={enter} />
      <Practice open={dialog === "practice"} name={name} onClose={() => setDialog(null)} onCreated={enter} system={mySystem} onSystem={() => setSystemOpen(true)} />
      {/* Its own state, so it opens over the practice dialog and closing it goes back there. */}
      <BiddingSystemDialog
        open={systemOpen}
        onClose={() => setSystemOpen(false)}
        system={mySystem}
        onChange={(s) => {
          profile.setBiddingSystem(s);
          setMySystem(profile.biddingSystem());
        }}
        note={
          code && snapshot && snapshot.status !== "lobby"
            ? "Kept on this device. The game you're in keeps the card it started with (see it from a bidding review); changes apply to the next game you start or join."
            : undefined
        }
      />
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
    </Box>
  );
}
