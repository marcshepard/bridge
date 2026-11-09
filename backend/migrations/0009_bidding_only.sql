-- Bidding practice: a game whose boards are only bid on the devices, not played. Each board goes
-- from its auction straight to a result scored double dummy (or just the contract, when the game
-- file has no double-dummy tricks). Stored as a flag beside `mode` ('devices'), because SQLite
-- can't widen the CHECK on `mode`; the API reports such a game's mode as 'bidding'.

ALTER TABLE events ADD COLUMN bidding_only INTEGER NOT NULL DEFAULT 0;
