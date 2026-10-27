// Join codes and player IDs.

/** No 0/O, 1/I/L: easy to read aloud and type. 32 symbols → 5 bits each. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8; // ~40 bits: not guessable by trying codes

export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Accepts "k7pm-3qxt", "K7PM 3QXT", etc. Returns null if it can't be a code. */
export function normaliseJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** A player's secret key to their seat. Unguessable; only ever held by that phone. */
export function newPlayerId(): string {
  return crypto.randomUUID();
}
