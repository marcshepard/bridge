// A web page saved by Safari as a Web Archive (.webarchive): what an iPhone or iPad saves with
// Share → Options → Web Archive → Save to Files. It's an Apple binary property list ("bplist00"):
// a dictionary whose WebMainResource holds the page's HTML as bytes (WebResourceData), next to
// its images and stylesheets. We take the page's HTML out and hand it to the importer for that
// page; the rest is ignored.
//
// Binary property lists: a header, the objects, a table of where each object starts, and a
// 32-byte trailer saying how big the table's entries are and which object is the top one. Each
// object starts with a byte whose high four bits give its type and low four its size.

/** True when the bytes are a binary property list (a Web Archive, if it's a saved page). */
export function looksLikeWebArchive(bytes: Uint8Array): boolean {
  return bytes.length > 40 && ascii(bytes, 0, 8) === "bplist00";
}

/** The HTML of the saved page, decoded. Throws if the file isn't a Web Archive of a page. */
export function webArchiveToHtml(bytes: Uint8Array): string {
  if (!looksLikeWebArchive(bytes)) throw new Error("This isn't a Safari Web Archive");
  const plist = new BinaryPlist(bytes);
  const main = plist.dict(plist.top).get("WebMainResource");
  if (main === undefined) throw new Error("This Web Archive has no web page inside it");
  const resource = plist.dict(main);
  const data = resource.get("WebResourceData");
  const type = resource.get("WebResourceMIMEType");
  if (data === undefined || (type !== undefined && plist.string(type) !== "text/html")) {
    throw new Error("This Web Archive has no web page inside it");
  }
  const charset = resource.get("WebResourceTextEncodingName");
  return decodeText(plist.data(data), charset === undefined ? "utf-8" : plist.string(charset));
}

class BinaryPlist {
  private readonly offsets: number[] = [];
  private readonly refSize: number;
  readonly top: number;

  constructor(private readonly bytes: Uint8Array) {
    const t = bytes.length - 32;
    const offsetSize = bytes[t + 6]!;
    this.refSize = bytes[t + 7]!;
    const count = this.uint(t + 8, 8);
    this.top = this.uint(t + 16, 8);
    const table = this.uint(t + 24, 8);
    if (!offsetSize || !this.refSize || count > bytes.length || table + count * offsetSize > t || this.top >= count) {
      throw new Error("This Web Archive is damaged");
    }
    for (let i = 0; i < count; i++) this.offsets.push(this.uint(table + i * offsetSize, offsetSize));
  }

  /** A dictionary's entries, by key, as references to their values (read only when asked for). */
  dict(ref: number): Map<string, number> {
    const { type, length, start } = this.header(ref);
    if (type !== 0xd) throw new Error("This Web Archive isn't laid out as expected");
    const entries = new Map<string, number>();
    for (let i = 0; i < length; i++) {
      const key = this.uint(start + i * this.refSize, this.refSize);
      const value = this.uint(start + (length + i) * this.refSize, this.refSize);
      entries.set(this.string(key), value);
    }
    return entries;
  }

  data(ref: number): Uint8Array {
    const { type, length, start } = this.header(ref);
    if (type !== 0x4) throw new Error("This Web Archive isn't laid out as expected");
    return this.bytes.subarray(start, start + length);
  }

  string(ref: number): string {
    const { type, length, start } = this.header(ref);
    if (type === 0x5) return ascii(this.bytes, start, length);
    if (type === 0x6) {
      // UTF-16, big-endian; `length` counts the 16-bit units.
      let s = "";
      for (let i = 0; i < length; i++) s += String.fromCharCode(this.uint(start + i * 2, 2));
      return s;
    }
    throw new Error("This Web Archive isn't laid out as expected");
  }

  /** An object's type, its length (in items, characters or bytes) and where its contents start. */
  private header(ref: number): { type: number; length: number; start: number } {
    const at = this.offsets[ref];
    if (at === undefined || at >= this.bytes.length) throw new Error("This Web Archive is damaged");
    const marker = this.bytes[at]!;
    const type = marker >> 4;
    let length = marker & 0xf;
    let start = at + 1;
    if (length === 0xf) {
      // A longer length follows, as an integer object: 0x1n, then 2^n bytes.
      const intMarker = this.bytes[start]!;
      if (intMarker >> 4 !== 0x1) throw new Error("This Web Archive is damaged");
      const size = 1 << (intMarker & 0xf);
      length = this.uint(start + 1, size);
      start += 1 + size;
    }
    const width = type === 0x6 ? 2 : type === 0xa ? this.refSize : type === 0xd ? 2 * this.refSize : 1;
    if (start + length * width > this.bytes.length) throw new Error("This Web Archive is damaged");
    return { type, length, start };
  }

  /** A big-endian unsigned integer of `size` bytes (sizes up to 8; real files stay far below 2^53). */
  private uint(at: number, size: number): number {
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + (this.bytes[at + i] ?? 0);
    return n;
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = "";
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function decodeText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // An unknown charset label: UTF-8 is what Common Game pages use.
    return new TextDecoder("utf-8").decode(bytes);
  }
}
