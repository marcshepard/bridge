// All SQL lives here. Routes call these functions; nothing else touches D1 directly.

import type { Seat } from "../../frontend/src/core/types";
import type { EventStatus, ResultDto, SeatRequestDto } from "./api-types";

export interface EventRow {
  code: string;
  title: string;
  game_json: string;
  start_board: number;
  status: EventStatus;
  created_at: string;
  expires_at: string;
}

export interface PlayerRow {
  player_id: string;
  slot: number;
  name: string;
  is_creator: number;
  seat: Seat | null;
}

interface ResultRow {
  board: number;
  contract: string;
  declarer: Seat | null;
  tricks: number | null;
  entered_by: number;
  updated_at: string;
}

const toResult = (r: ResultRow): ResultDto => ({
  board: r.board,
  contract: r.contract,
  declarer: r.declarer,
  tricks: r.tricks,
  enteredBy: r.entered_by,
  updatedAt: r.updated_at,
});

/** Live (not expired) event, or null. */
export async function getEvent(db: D1Database, code: string, now: string): Promise<EventRow | null> {
  return db
    .prepare("SELECT * FROM events WHERE code = ? AND expires_at > ?")
    .bind(code, now)
    .first<EventRow>();
}

export async function insertEvent(db: D1Database, e: EventRow, creator: PlayerRow, joinedAt: string) {
  await db.batch([
    db
      .prepare(
        "INSERT INTO events (code, title, game_json, start_board, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(e.code, e.title, e.game_json, e.start_board, e.status, e.created_at, e.expires_at),
    insertPlayerStmt(db, e.code, creator, joinedAt),
  ]);
}

function insertPlayerStmt(db: D1Database, code: string, p: PlayerRow, joinedAt: string) {
  return db
    .prepare(
      "INSERT INTO players (event_code, player_id, slot, name, is_creator, seat, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(code, p.player_id, p.slot, p.name, p.is_creator, p.seat, joinedAt);
}

export async function insertPlayer(db: D1Database, code: string, p: PlayerRow, joinedAt: string) {
  await insertPlayerStmt(db, code, p, joinedAt).run();
}

export async function getPlayers(db: D1Database, code: string): Promise<PlayerRow[]> {
  const { results } = await db
    .prepare("SELECT player_id, slot, name, is_creator, seat FROM players WHERE event_code = ? ORDER BY slot")
    .bind(code)
    .all<PlayerRow>();
  return results;
}

export async function deletePlayer(db: D1Database, code: string, playerId: string) {
  await db.prepare("DELETE FROM players WHERE event_code = ? AND player_id = ?").bind(code, playerId).run();
}

export async function setSeatsAndStart(db: D1Database, code: string, seats: Map<number, Seat>) {
  await db.batch([
    ...[...seats].map(([slot, seat]) =>
      db.prepare("UPDATE players SET seat = ? WHERE event_code = ? AND slot = ?").bind(seat, code, slot),
    ),
    db.prepare("UPDATE events SET status = 'playing' WHERE code = ?").bind(code),
  ]);
}

export async function setStatus(db: D1Database, code: string, status: EventStatus) {
  await db.prepare("UPDATE events SET status = ? WHERE code = ?").bind(status, code).run();
}

export async function upsertResult(db: D1Database, code: string, r: ResultDto) {
  await db
    .prepare(
      `INSERT INTO results (event_code, table_no, board, contract, declarer, tricks, entered_by, updated_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_code, table_no, board) DO UPDATE SET
         contract = excluded.contract, declarer = excluded.declarer, tricks = excluded.tricks,
         entered_by = excluded.entered_by, updated_at = excluded.updated_at`,
    )
    .bind(code, r.board, r.contract, r.declarer, r.tricks, r.enteredBy, r.updatedAt)
    .run();
}

/**
 * Results for the game, optionally only those changed at or after `since`. Inclusive on purpose:
 * re-sending a result the phone already has is harmless; missing one isn't.
 */
export async function getResults(db: D1Database, code: string, since?: string): Promise<ResultDto[]> {
  const { results } = since
    ? await db
        .prepare("SELECT * FROM results WHERE event_code = ? AND updated_at >= ? ORDER BY board")
        .bind(code, since)
        .all<ResultRow>()
    : await db.prepare("SELECT * FROM results WHERE event_code = ? ORDER BY board").bind(code).all<ResultRow>();
  return results.map(toResult);
}

// ---- Seat requests ------------------------------------------------------------------------------

export interface SeatRequestRow {
  id: string;
  slot: number;
  name: string;
  player_id: string;
  status: "pending" | "allowed" | "denied" | "cancelled";
  answered_by: number | null;
  created_at: string;
}

export const toSeatRequest = (r: SeatRequestRow): SeatRequestDto => ({
  id: r.id,
  slot: r.slot,
  name: r.name,
  createdAt: r.created_at,
});

export async function insertSeatRequest(db: D1Database, code: string, r: SeatRequestRow) {
  await db
    .prepare(
      "INSERT INTO seat_requests (id, event_code, slot, name, player_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(r.id, code, r.slot, r.name, r.player_id, r.created_at)
    .run();
}

export async function getSeatRequest(db: D1Database, code: string, id: string): Promise<SeatRequestRow | null> {
  return db
    .prepare("SELECT * FROM seat_requests WHERE event_code = ? AND id = ?")
    .bind(code, id)
    .first<SeatRequestRow>();
}

/** Pending requests made after `since` (older ones have lapsed), oldest first. */
export async function getPendingSeatRequests(db: D1Database, code: string, since: string): Promise<SeatRequestRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM seat_requests WHERE event_code = ? AND status = 'pending' AND created_at > ? ORDER BY created_at",
    )
    .bind(code, since)
    .all<SeatRequestRow>();
  return results;
}

/**
 * Close a pending request. Returns false if it was no longer pending (someone else answered first),
 * so only one answer ever wins.
 */
export async function closeSeatRequest(
  db: D1Database,
  code: string,
  id: string,
  status: "allowed" | "denied" | "cancelled",
  answeredBy: number | null,
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE seat_requests SET status = ?, answered_by = ? WHERE event_code = ? AND id = ? AND status = 'pending'")
    .bind(status, answeredBy, code, id)
    .run();
  return res.meta.changes > 0;
}

/** The seat changes hands: the requester's key and name replace the old player's. */
export async function replacePlayer(db: D1Database, code: string, slot: number, playerId: string, name: string) {
  await db
    .prepare("UPDATE players SET player_id = ?, name = ? WHERE event_code = ? AND slot = ?")
    .bind(playerId, name, code, slot)
    .run();
}

export async function deleteEvent(db: D1Database, code: string) {
  await db.batch([
    db.prepare("DELETE FROM seat_requests WHERE event_code = ?").bind(code),
    db.prepare("DELETE FROM results WHERE event_code = ?").bind(code),
    db.prepare("DELETE FROM players WHERE event_code = ?").bind(code),
    db.prepare("DELETE FROM events WHERE code = ?").bind(code),
  ]);
}
