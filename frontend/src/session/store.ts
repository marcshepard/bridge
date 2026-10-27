// Where shared games and this device's identity are kept.
//
// The screens only talk to these interfaces (through services.ts), and every game method is async,
// so the implementations can change without touching the UI. Today games live on the backend
// (`ApiGameStore`) and the identity lives in this browser (`LocalProfileStore`).

import type {
  EventSnapshot,
  PartnershipsRequest,
  PushMessage,
  ResultDto,
  SaveResultRequest,
} from "../../../backend/src/api-types";
import type { GameFileV1 } from "../providers/gameFile";

export type { EventSnapshot, PublicPlayer, ResultDto } from "../../../backend/src/api-types";

/** What a live subscription hears: the backend's pushes, plus "reconnected" after a dropped link. */
export type LiveMessage = PushMessage | { type: "reconnected" };

export interface GameStore {
  /** Create a game from a game file. You join it as the first player; returns its join code. */
  create(name: string, game: GameFileV1, startBoard: number): Promise<string>;
  /** Join a game that hasn't started; returns its normalised join code. */
  join(code: string, name: string): Promise<string>;
  /** Everything about a game, including `you` when this device is one of its players. */
  snapshot(code: string): Promise<EventSnapshot>;
  /** Leave a game before it starts. If you created it, this cancels it for everyone. */
  leave(code: string): Promise<void>;
  /** The creator picks a partner (or random partnerships); seats are assigned and play starts. */
  choosePartnerships(code: string, choice: PartnershipsRequest): Promise<void>;
  /** Save or correct the table's result on a board. Everyone at the table sees it straight away. */
  saveResult(code: string, board: number, result: SaveResultRequest): Promise<ResultDto>;
  /** Dev only: fill the empty places with test players. */
  fillWithTestPlayers(code: string): Promise<void>;
  /** Live updates for a game. Returns a function that stops them. */
  subscribe(code: string, onMessage: (message: LiveMessage) => void): () => void;
}

/** Who you are on this device: no accounts, just a display name and a key per game joined. */
export interface ProfileStore {
  name(): string;
  setName(name: string): void;
  /** Your secret player ID for a game, if this device is in it. */
  playerId(code: string): string | null;
  setPlayerId(code: string, playerId: string): void;
  forget(code: string): void;
  /** The game this device is in right now, so a reload goes straight back to it. */
  currentGame(): string | null;
  setCurrentGame(code: string | null): void;
}
