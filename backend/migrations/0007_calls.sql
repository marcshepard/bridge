-- Bidding on the players' devices. A board played online starts with its auction: its result row
-- has `on_devices = 1` and an empty contract until the auction ends. Each call is a row here, in
-- order (`seq` from 1; the longest possible auction has 319 calls). When the auction ends, the
-- contract goes into the result (or the board is passed out) and the card play follows.

CREATE TABLE calls (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  table_no     INTEGER NOT NULL DEFAULT 1,       -- one table for now
  board        INTEGER NOT NULL,
  seq          INTEGER NOT NULL CHECK (seq BETWEEN 1 AND 319),
  seat         TEXT NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),  -- who made the call
  call         TEXT NOT NULL,                    -- "1H", "3NT", "PASS", "X", "XX"
  called_at    TEXT NOT NULL,
  PRIMARY KEY (event_code, table_no, board, seq)
);
