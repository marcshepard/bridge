// Provider: game files hosted next to the app, under public/games/.
//
// public/games/index.json lists the files; each game file is in our own format (gameFile.ts).
// This is how the bundled sample game ships, and how a future preprocessing step (e.g. a script
// that converts licensed Common Game archives) could publish games without any backend.

import { parseGameFile } from "./gameFile";
import type { Game, GameProvider, GameSummary } from "./types";

interface IndexEntry {
  id: string;
  file: string;
  title?: string;
  date?: string;
  session?: string;
  source?: string;
  boardCount?: number;
}

export class StaticProvider implements GameProvider {
  readonly id = "static";
  readonly name = "Included games";
  private index: Promise<IndexEntry[]> | null = null;
  private cache = new Map<string, Promise<Game>>();

  constructor(private readonly baseUrl: string = `${import.meta.env.BASE_URL}games/`) {}

  private loadIndex(): Promise<IndexEntry[]> {
    this.index ??= fetch(`${this.baseUrl}index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load the game list (${r.status})`);
        return r.json() as Promise<{ games: IndexEntry[] }>;
      })
      .then((d) => d.games)
      .catch((e) => {
        this.index = null; // allow a retry
        throw e;
      });
    return this.index;
  }

  async listGames(): Promise<GameSummary[]> {
    const entries = await this.loadIndex();
    return entries.map((e) => ({
      id: e.id,
      title: e.title ?? e.id,
      ...(e.date ? { date: e.date } : {}),
      ...(e.session ? { session: e.session } : {}),
      source: { name: e.source ?? "Included" },
      boardCount: e.boardCount ?? 0,
    }));
  }

  getGame(gameId: string): Promise<Game> {
    let game = this.cache.get(gameId);
    if (!game) {
      game = this.loadIndex().then(async (entries) => {
        const entry = entries.find((e) => e.id === gameId);
        if (!entry) throw new Error(`Game "${gameId}" isn't in the game list`);
        const r = await fetch(`${this.baseUrl}${entry.file}`);
        if (!r.ok) throw new Error(`Couldn't load ${entry.file} (${r.status})`);
        return parseGameFile(await r.json());
      });
      game.catch(() => this.cache.delete(gameId));
      this.cache.set(gameId, game);
    }
    return game;
  }
}
