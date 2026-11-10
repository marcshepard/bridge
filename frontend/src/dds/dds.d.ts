// Types for dds.js, the Emscripten loader for dds.wasm (built by scripts/dds/build.sh).

export interface DdsModule {
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _bd_table(pbn: number, out: number): number;
  _bd_tricks(pbn: number, trump: number, first: number): number;
  _bd_cards(pbn: number, trump: number, first: number, n: number, suits: number, ranks: number, out: number): number;
  setValue(ptr: number, value: number, type: "i32"): void;
  getValue(ptr: number, type: "i32"): number;
  stringToUTF8(text: string, ptr: number, maxBytes: number): void;
}

export default function createDdsModule(options?: Record<string, unknown>): Promise<DdsModule>;
