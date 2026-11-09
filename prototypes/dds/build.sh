#!/usr/bin/env bash
# Builds DDS (the double-dummy solver) to WebAssembly for the timing prototype.
#
# Needs: the Emscripten SDK in ~/emsdk (installed and activated), and the DDS source cloned into
# vendor/dds at a release tag (see README.md). Writes page/dds/dds.js and page/dds/dds.wasm.
#
# Single-threaded on purpose: the page runs several copies in Web Workers instead, which avoids
# the special server headers that WebAssembly threads need in a browser.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DDS="$HERE/vendor/dds"
OUT="$HERE/page/dds"
EMXX="${EMXX:-$HOME/emsdk/upstream/emscripten/em++.exe}"
[ -x "$EMXX" ] || EMXX="$HOME/emsdk/upstream/emscripten/em++"

mkdir -p "$OUT"

# Every library source, plus DDS's own small browser wrapper (one full table; every card from a
# position on lead).
mapfile -t SOURCES < <(find "$DDS/library/src" -name '*.cpp' | sort)
SOURCES+=("$DDS/web/dds_web_wasm.cpp")

"$EMXX" -O3 -flto -std=c++20 -fexceptions -fwasm-exceptions \
  -I"$DDS/library/src" \
  "${SOURCES[@]}" \
  -sWASM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=67108864 \
  -sSTACK_SIZE=8388608 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createDdsModule \
  -sEXPORTED_FUNCTIONS="['_dds_web_calc_table','_dds_web_solve_leads','_malloc','_free']" \
  -sEXPORTED_RUNTIME_METHODS="['ccall','getValue','stringToUTF8','lengthBytesUTF8']" \
  -sENVIRONMENT=web,worker,node \
  -o "$OUT/dds.js"

ls -l "$OUT"
