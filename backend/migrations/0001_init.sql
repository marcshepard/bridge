-- Bridge Replay: shared games.
-- Scores, matchpoints and tallies are not stored; every phone computes them from `results`.

CREATE TABLE events (
  code         TEXT PRIMARY KEY,                 -- join code, 8 chars, e.g. K7PM3QXT
  title        TEXT NOT NULL,
  game_json    TEXT NOT NULL,                    -- normalised game file (GameFileV1)
  start_board  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'lobby'
               CHECK (status IN ('lobby', 'playing', 'ended')),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL                     -- deleted after this (30 days)
);

CREATE TABLE players (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  player_id    TEXT NOT NULL,                    -- secret: identifies the phone; never sent to others
  slot         INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),  -- public handle, join order
  name         TEXT NOT NULL,
  is_creator   INTEGER NOT NULL DEFAULT 0,
  seat         TEXT CHECK (seat IN ('N', 'E', 'S', 'W')),      -- assigned when play starts
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (event_code, player_id),
  UNIQUE (event_code, slot)
);

CREATE TABLE results (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  table_no     INTEGER NOT NULL DEFAULT 1,       -- one table for now
  board        INTEGER NOT NULL,
  contract     TEXT NOT NULL,                    -- "4SX", "3NT", "PASS"
  declarer     TEXT CHECK (declarer IN ('N', 'E', 'S', 'W')),
  tricks       INTEGER NOT NULL CHECK (tricks BETWEEN 0 AND 13),
  entered_by   INTEGER NOT NULL,                 -- slot of the player who entered it
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (event_code, table_no, board)
);

CREATE INDEX results_by_update ON results (event_code, updated_at);
CREATE INDEX events_by_expiry ON events (expires_at);
