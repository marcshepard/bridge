// Turning an uploaded file into our game file format, whatever the source.
//
// Each source has its own importer that produces `GameFileV1`; this only decides which one to use.
// Nothing after this point knows where a game came from.

import type { GameFileV1 } from "./gameFile";
import { pbnToGameFile } from "./pbn";
import { looksLikeTcgPage, tcgPageToGameFile } from "./tcgPage";

/** The kinds of file "Start a game" accepts, for the file picker. */
export const ACCEPTED_FILES = ".pbn,.txt,.json,.html,.htm";

/** Convert file contents to our format. Decides by extension, falling back to sniffing the text. */
export function fileToGameFile(fileName: string, text: string): GameFileV1 {
  if (/\.html?$/i.test(fileName) || looksLikeTcgPage(text)) {
    if (!looksLikeTcgPage(text)) {
      throw new Error("This web page isn't a Common Game results page. Save the page that shows the boards and results.");
    }
    return tcgPageToGameFile(text, fileName);
  }
  if (/\.json$/i.test(fileName) || text.trimStart().startsWith("{")) {
    try {
      return JSON.parse(text) as GameFileV1;
    } catch {
      throw new Error("This JSON file couldn't be read");
    }
  }
  return pbnToGameFile(text, fileName);
}
