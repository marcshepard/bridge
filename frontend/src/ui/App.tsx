// The app's top level: who you are, which game you're in, and which screen or dialog is showing.
//
// Pages: Home, and the game (lobby, then seats). Start a game, Join a game, Help and Leave game are
// dialogs over them, so there are no back buttons. A shared link (`?join=CODE`) opens the join
// dialog with the code filled in. A reload goes straight back to the game you're in.

import { Alert, Button, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { games, profile } from "../services";
import { ApiError } from "../session/apiGameStore";
import type { EventSnapshot } from "../session/store";
import { AppHeader } from "./controls/AppHeader";
import { Screen } from "./controls/Layout";
import { SheetDialog } from "./controls/SheetDialog";
import { HelpDialog } from "./components/HelpDialog";
import { formatJoinCode } from "./labels";
import { Home } from "./screens/Home";
import { JoinGame } from "./screens/JoinGame";
import { Lobby } from "./screens/Lobby";
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

/** The game you're in: its snapshot, kept current by live updates. */
function useGame(code: string | null, onGone: (why: string) => void) {
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const snap = await games.snapshot(code);
      if (!snap.you) {
        onGone("You're no longer in that game.");
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
    if (!code) return;
    void refresh();
    return games.subscribe(code, (m) => {
      if (m.type === "deleted") onGone("The person who started the game cancelled it.");
      else if (m.type === "presence") {
        setSnapshot((s) => s && { ...s, players: s.players.map((p) => ({ ...p, connected: m.connected.includes(p.slot) })) });
      } else if (m.type === "result") {
        // Results are used from stage 3 (playing the boards).
        setSnapshot((s) => s && { ...s, results: [...s.results.filter((r) => r.board !== m.result.board), m.result] });
      } else void refresh(); // players, status, reconnected: fetch the whole picture again
    });
  }, [code, refresh, onGone]);

  return { snapshot, error, refresh };
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

  const { snapshot, error } = useGame(code, onGone);

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
