-- The game owner runs the table: how the boards are played is chosen when the game is created,
-- the owner moves everyone from board to board, and a real-cards game can have players without
-- the app.

-- 'cards': real cards at the table (self-deal); 'devices': bid and play on the devices.
-- Games made before this were real-cards games (on-device play was tried board by board).
ALTER TABLE events ADD COLUMN mode TEXT NOT NULL DEFAULT 'cards' CHECK (mode IN ('cards', 'devices'));

-- The board the table is on (original numbering); NULL until the owner first moves on: the start board.
ALTER TABLE events ADD COLUMN current_board INTEGER;

-- A player without the app (real-cards games only): a name in a seat, added by the owner. Their
-- key is never handed out; someone can take the seat over with a seat request.
ALTER TABLE players ADD COLUMN no_app INTEGER NOT NULL DEFAULT 0;
