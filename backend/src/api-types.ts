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
  /** null while only the contract is in (bidding over, play not finished). */
  tricks: number | null;
  /** Slot of the player who entered (or last corrected) it. */
  enteredBy: number;
  updatedAt: string;
  /**
   * The cards are being played on the players' devices: true from the start of play. While
   * `tricks` is null the board is being played; the tricks are filled in when the last card is.
   */
  onDevices: boolean;
}

/**
 * A claim on a board being played on the devices: `seat` says their side will take `tricks` of
 * the tricks still to play. Accepted once all the claimer's opponents but dummy are in
 * `acceptedBy` (see `claimAccepted` in core/play.ts).
 */
export interface ClaimDto {
  board: number;
  seat: Seat;
  tricks: number;
  acceptedBy: Seat[];
}

/** One card played on a device, in order (`seq` 1–52) on its board. */
export interface PlayDto {
  board: number;
  seq: number;
  /** Whose card it is: dummy's seat when declarer plays it. */
  seat: Seat;
  /** "SA", "HT": suit then rank. */
  card: string;
}

/** Someone asking to take over a seat (a new player, or the same one on another device). */
export interface SeatRequestDto {
  id: string;
  /** The seat (by slot) they want. */
  slot: number;
  /** Their display name. */
  name: string;
  createdAt: string;
}

/** Where a seat request stands, as its requester sees it. */
export type SeatRequestStatus = "pending" | "allowed" | "denied" | "cancelled" | "expired";

export interface EventSnapshot {
  code: string;
  title: string;
  status: EventStatus;
  startBoard: number;
  game: GameFileV1;
  players: PublicPlayer[];
  results: ResultDto[];
  /** The cards played so far on boards being played on devices right now. */
  plays: PlayDto[];
  /** Claims made on boards being played on devices right now. */
  claims: ClaimDto[];
  /** Seat requests waiting for an answer. Only sent to players in the game. */
  requests: SeatRequestDto[];
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
/** Joining a game (POST /events/:code/players), or starting a demo game (POST /events/demo). */
export interface JoinRequest {
  name: string;
}
/** The creator picks a partner by slot, or asks for random partnerships. */
export type PartnershipsRequest = { partnerSlot: number } | { random: true };
/** A board's result, or just its contract (`tricks: null`) once the bidding is over. */
export interface SaveResultRequest {
  contract: string;
  declarer: Seat | null;
  tricks: number | null;
}

/**
 * Play a card on a board being played on devices. `seq` is which card of the board this is (1–52),
 * so a repeated tap, or two devices at once, can't play twice.
 */
export interface PlayCardRequest {
  seq: number;
  card: string;
}

/** Claim this many of the tricks still to play, for your side. */
export interface ClaimRequest {
  tricks: number;
}
export interface AnswerClaimRequest {
  accept: boolean;
}

/** Ask to take over a seat in a full or started game. Someone at the table must allow it. */
export interface SeatRequestRequest {
  name: string;
  slot: number;
}
/**
 * `playerId` is the requester's key: it identifies them while they wait, and becomes the seat's
 * key if the request is allowed. `anyoneConnected` is false when nobody is there to answer yet.
 */
export interface SeatRequestCreated {
  requestId: string;
  playerId: string;
  anyoneConnected: boolean;
}
export interface SeatRequestState {
  status: SeatRequestStatus;
}
export interface AnswerSeatRequest {
  allow: boolean;
}

/** Returned when you create or join: keep `playerId` on the phone; it's your key to the game. */
export interface JoinedResponse {
  code: string;
  playerId: string;
  slot: number;
}

/** A single-use pass for opening the live connection: GET .../live?ticket=. Lasts a minute. */
export interface LiveTicketResponse {
  ticket: string;
}

export interface ResultsSinceResponse {
  results: ResultDto[];
  now: string;
}

export interface ErrorResponse {
  error: string;
}

// ---- Pushed over the WebSocket (GET /api/events/:code/live?ticket=) ------------------------------

export type PushMessage =
  | { type: "result"; result: ResultDto }
  | { type: "play"; play: PlayDto } // a card played on a device
  | { type: "claim"; board: number; claim: ClaimDto | null } // a claim made or answered; null: refused or taken back
  | { type: "players" } // someone joined, left or got a seat: refetch the snapshot
  | { type: "status"; status: EventStatus }
  | { type: "presence"; connected: number[] } // slots with a live connection
  | { type: "request"; request: SeatRequestDto } // someone wants a seat: anyone can answer
  | {
      // A seat request was answered or withdrawn. When allowed, `name` now holds the seat that
      // `replacedName` held (the same name: they moved to another device).
      type: "requestClosed";
      request: SeatRequestDto;
      outcome: "allowed" | "denied" | "cancelled";
      /** Slot of whoever answered (null when cancelled). */
      by: number | null;
      replacedName: string;
    }
  | { type: "deleted" };
