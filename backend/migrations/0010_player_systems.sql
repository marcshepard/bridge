-- Each player's bidding system: their SAYC settings (JSON, checked with parseSystemSettings),
-- sent from their device when they start or join a game and fixed from then on. A side's bots bid
-- by the card of the person on their side. NULL: SAYC as it comes (bots, players without the app,
-- and games from before this).

ALTER TABLE players ADD COLUMN system_json TEXT;
