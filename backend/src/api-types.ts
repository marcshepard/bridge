// The API's JSON shapes. The frontend imports these too, so both sides agree on the contract.

import type { Seat } from "../../frontend/src/core/types";
import type { GameFileV1 } from "../../frontend/src/providers/gameFile";

export type EventStatus = "lobby" | "playing" | "ended";

/** A player as everyone else sees them. The secret player ID is never included. */
export interface PublicPlayer {
  /** Public handle, 1–4 in join order. */
  slot: number;
  name: string;
  isCreator: boolean;
  /** Assigned when play starts. */
  seat: Seat | null;
  /** Has a live connection right now. */
  connected: boolean;
}

export interface ResultDto {
  board: number;
  contract: string; // "4SX", "3NT", "PASS"
  declarer: Seat | null;
  tricks: number;
  /** Slot of the player who entered (or last corrected) it. */
  enteredBy: number;
  updatedAt: string;
}

export interface EventSnapshot {
  code: string;
  title: string;
  status: EventStatus;
  startBoard: number;
  game: GameFileV1;
  players: PublicPlayer[];
  results: ResultDto[];
  /** Present when the request carried a valid X-Player-Id for this game. */
  you: { slot: number; isCreator: boolean; seat: Seat | null } | null;
  /** Server time; pass it as `since` to fetch only later changes. */
  now: string;
}

// ---- Requests and responses -------------------------------------------------------------------

export interface CreateEventRequest {
  name: string;
  game: GameFileV1;
  startBoard: number;
}
export interface JoinRequest {
  name: string;
}
/** The creator picks a partner by slot, or asks for random partnerships. */
export type PartnershipsRequest = { partnerSlot: number } | { random: true };
export interface SaveResultRequest {
  contract: string;
  declarer: Seat | null;
  tricks: number;
}

/** Returned when you create or join: keep `playerId` on the phone; it's your key to the game. */
export interface JoinedResponse {
  code: string;
  playerId: string;
  slot: number;
}

export interface ResultsSinceResponse {
  results: ResultDto[];
  now: string;
}

export interface ErrorResponse {
  error: string;
}

// ---- Pushed over the WebSocket (GET /api/events/:code/live) --------------------------------------

export type PushMessage =
  | { type: "result"; result: ResultDto }
  | { type: "players" } // someone joined, left or got a seat: refetch the snapshot
  | { type: "status"; status: EventStatus }
  | { type: "presence"; connected: number[] } // slots with a live connection
  | { type: "deleted" };
