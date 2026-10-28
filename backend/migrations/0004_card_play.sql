-- Playing the cards on the players' devices. A board's play starts once its contract is in
-- (`on_devices` on its result); each card played is a row in `plays`, in order (`seq` 1–52). The
-- result's tricks are filled in when the 52nd card is played.

ALTER TABLE results ADD COLUMN on_devices INTEGER NOT NULL DEFAULT 0;

CREATE TABLE plays (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  table_no     INTEGER NOT NULL DEFAULT 1,       -- one table for now
  board        INTEGER NOT NULL,
  seq          INTEGER NOT NULL CHECK (seq BETWEEN 1 AND 52),
  seat         TEXT NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),  -- whose card (dummy's when declarer plays it)
  card         TEXT NOT NULL,                    -- "SA", "HT"
  played_at    TEXT NOT NULL,
  PRIMARY KEY (event_code, table_no, board, seq)
);
