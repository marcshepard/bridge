-- Asking to take over a seat: someone new replacing a player, or a player moving to another
-- device. Anyone at the table can allow or deny it. Pending requests lapse after a few minutes
-- (worked out from created_at; nothing needs to update them).

CREATE TABLE seat_requests (
  id           TEXT PRIMARY KEY,
  event_code   TEXT NOT NULL REFERENCES events(code) ON DELETE CASCADE,
  slot         INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),  -- the seat asked for
  name         TEXT NOT NULL,                    -- the requester's display name
  player_id    TEXT NOT NULL,                    -- secret: the requester's key, the seat's key if allowed
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'allowed', 'denied', 'cancelled')),
  answered_by  INTEGER,                          -- slot of whoever allowed or denied it
  created_at   TEXT NOT NULL
);

CREATE INDEX seat_requests_by_event ON seat_requests (event_code, status);
