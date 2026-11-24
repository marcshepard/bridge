-- Playing on with new partners: the owner ends an online game and starts a new one from the next
-- board, with the same boards; everyone else is offered the new game to join. `continued_in` is
-- the new game's join code (NULL: the game wasn't continued).

ALTER TABLE events ADD COLUMN continued_in TEXT;
