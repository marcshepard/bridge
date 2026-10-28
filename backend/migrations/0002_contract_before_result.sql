-- The contract can be entered as soon as the bidding ends, before the play: `tricks` is NULL until
-- the result is in. SQLite can't relax a NOT NULL column in place, so the table is rebuilt.

CREATE TABLE results_new (
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  table_no     INTEGER NOT NULL DEFAULT 1,       -- one table for now
  board        INTEGER NOT NULL,
  contract     TEXT NOT NULL,                    -- "4SX", "3NT", "PASS"
  declarer     TEXT CHECK (declarer IN ('N', 'E', 'S', 'W')),
  tricks       INTEGER CHECK (tricks BETWEEN 0 AND 13),  -- NULL: contract only, not played yet
  entered_by   INTEGER NOT NULL,                 -- slot of the player who entered it
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (event_code, table_no, board)
);

INSERT INTO results_new SELECT event_code, table_no, board, contract, declarer, tricks, entered_by, updated_at FROM results;
DROP TABLE results;
ALTER TABLE results_new RENAME TO results;
CREATE INDEX results_by_update ON results (event_code, updated_at);
