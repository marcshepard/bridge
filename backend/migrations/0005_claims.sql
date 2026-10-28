-- Claims while the cards are played on the devices: at most one per board at a time. Refusing or
-- taking back a claim deletes it; it's accepted once all the claimer's opponents (but dummy) are
-- in `accepted_by`.

CREATE TABLE claims (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  table_no     INTEGER NOT NULL DEFAULT 1,       -- one table for now
  board        INTEGER NOT NULL,
  seat         TEXT NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),  -- who claimed
  tricks       INTEGER NOT NULL CHECK (tricks BETWEEN 0 AND 13),     -- of those left, for their side
  accepted_by  TEXT NOT NULL DEFAULT '',         -- seats that accepted, e.g. "EW"
  created_at   TEXT NOT NULL,
  PRIMARY KEY (event_code, table_no, board)
);
