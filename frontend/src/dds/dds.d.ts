// Types for dds.js, the Emscripten loader for dds.wasm (built by scripts/dds/build.sh).

export interface DdsModule {
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _bd_table(pbn: number, out: number): number;
  _bd_tricks(pbn: number, trump: number, first: number): number;
  getValue(ptr: number, type: "i32"): number;
  stringToUTF8(text: string, ptr: number, maxBytes: number): void;
}

export default function createDdsModule(options?: Record<string, unknown>): Promise<DdsModule>;
