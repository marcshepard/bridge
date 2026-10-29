// Where shared games and this device's identity are kept.
//
// The screens only talk to these interfaces (through services.ts), and every game method is async,
// so the implementations can change without touching the UI. Today games live on the backend
// (`ApiGameStore`) and the identity lives in this browser (`LocalProfileStore`).

import type {
  ClaimDto,
  EventSnapshot,
  PartnershipsRequest,
  PlayDto,
  PushMessage,
  ResultDto,
  SaveResultRequest,
  SeatRequestStatus,
} from "../../../backend/src/api-types";
import type { GameFileV1 } from "../providers/gameFile";

export type {
  ClaimDto,
  EventSnapshot,
  PlayDto,
  PublicPlayer,
  ResultDto,
  SeatRequestDto,
  SeatRequestStatus,
} from "../../../backend/src/api-types";

/**
 * What a live subscription hears: the backend's pushes, plus this device's own connection news:
 * "disconnected" when the link drops (once per outage) and "reconnected" when it's back (anything
 * pushed in between was missed, so catch up).
 */
export type LiveMessage = PushMessage | { type: "disconnected" } | { type: "reconnected" };

export interface GameStore {
  /** Create a game from a game file. You join it as the first player; returns its join code. */
  create(name: string, game: GameFileV1, startBoard: number): Promise<string>;
  /**
   * Start a demo game: the built-in made-up game from board 9, with bots in the other three places.
   * You join it as the first player; returns its join code.
   */
  createDemo(name: string): Promise<string>;
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
  /** The creator starts playing a board's cards on the devices (its contract must be in). */
  startCardPlay(code: string, board: number): Promise<ResultDto>;
  /** Play a card ("SA") as card number `seq` (1–52) on the board. Rejects with the reason if refused. */
  playCard(code: string, board: number, seq: number, card: string): Promise<PlayDto>;
  /** Claim this many of the tricks left on the board, for your side. */
  claim(code: string, board: number, tricks: number): Promise<ClaimDto>;
  /** Accept or refuse the claim on the board (the claimer's opponents). Null once refused. */
  answerClaim(code: string, board: number, accept: boolean): Promise<ClaimDto | null>;
  /** The claimer takes their claim back. */
  withdrawClaim(code: string, board: number): Promise<void>;
  /**
   * Ask to take over a seat (by slot) in a full or started game. Someone at the table has to allow
   * it. Returns the request's ID, and whether anyone is connected to answer it right now.
   */
  requestSeat(code: string, name: string, slot: number): Promise<{ requestId: string; anyoneConnected: boolean }>;
  /** How your request stands. Once it's allowed, this device is in the game (it's the current game). */
  seatRequestStatus(code: string, requestId: string): Promise<SeatRequestStatus>;
  /** Give up waiting. */
  cancelSeatRequest(code: string, requestId: string): Promise<void>;
  /** At the table: allow or deny someone's request for a seat. */
  answerSeatRequest(code: string, requestId: string, allow: boolean): Promise<void>;
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
  /** The install banner was closed on this computer: don't show it again. */
  installBannerClosed(): boolean;
  setInstallBannerClosed(): void;
}
