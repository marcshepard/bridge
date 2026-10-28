-- Bots (demo games, and dev test players) are marked, so the creator's device can play their cards.
-- Bots made before this were named "Bot <slot>"; a person who takes a bot's seat stops being one.

ALTER TABLE players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

UPDATE players SET is_bot = 1 WHERE is_creator = 0 AND name = 'Bot ' || slot;
