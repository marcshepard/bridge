// Provider: games the user imported from a file on their device (our JSON format, or PBN).
//
// Imported games are converted to our game file format once, then kept in this browser's
// localStorage so they survive a reload. Nothing is uploaded anywhere.

import { parseGameFile, type GameFileV1 } from "./gameFile";
import { pbnToGameFile } from "./pbn";
import type { Game, GameProvider, GameSummary } from "./types";

const STORAGE_KEY = "bridge.importedGames.v1";

function readStore(): GameFileV1[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameFileV1[]) : [];
  } catch {
    return [];
  }
}

function writeStore(files: GameFileV1[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // Storage unavailable or full: the game still works for this visit, it just won't be remembered.
  }
}

/** Convert file contents to our format. Decides by extension, falling back to sniffing the text. */
export function fileToGameFile(fileName: string, text: string): GameFileV1 {
  const looksJson = /\.json$/i.test(fileName) || text.trimStart().startsWith("{");
  if (looksJson) return JSON.parse(text) as GameFileV1;
  return pbnToGameFile(text, fileName);
}

export class ImportedProvider implements GameProvider {
  readonly id = "imported";
  readonly name = "Imported games";
  private files: GameFileV1[] = readStore();

  async listGames(): Promise<GameSummary[]> {
    return this.files.map((f) => parseGameFile(f).summary);
  }

  async getGame(gameId: string): Promise<Game> {
    const f = this.files.find((x) => x.id === gameId);
    if (!f) throw new Error(`Imported game "${gameId}" not found`);
    return parseGameFile(f);
  }

  /** Validate and store a game file; returns the parsed game (with any warnings). */
  async importFile(fileName: string, text: string): Promise<Game> {
    const file = fileToGameFile(fileName, text);
    const game = parseGameFile(file); // throws if unusable, before anything is stored
    this.files = [...this.files.filter((x) => x.id !== file.id), file];
    writeStore(this.files);
    return game;
  }

  remove(gameId: string): void {
    this.files = this.files.filter((x) => x.id !== gameId);
    writeStore(this.files);
  }
}
