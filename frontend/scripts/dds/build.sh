#!/usr/bin/env bash
# Builds DDS (the double-dummy solver) to WebAssembly for the frontend: src/dds/dds.js and
# src/dds/dds.wasm, which are committed, so nobody else needs these tools. Rebuild only to change
# DDS's version or the entry points in bridge_dds.cpp.
#
# Needs: the Emscripten SDK in ~/emsdk, and the DDS source at a release tag in
# prototypes/dds/vendor/dds (or DDS_SRC). Steps are in frontend/src/dds/README.md.
#
# Single-threaded on purpose: the app runs several copies in Web Workers instead, which avoids the
# special server headers WebAssembly threads need in a browser.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DDS="${DDS_SRC:-$REPO/prototypes/dds/vendor/dds}"
OUT="$REPO/frontend/src/dds"
EMXX="${EMXX:-$HOME/emsdk/upstream/emscripten/em++.exe}"
[ -x "$EMXX" ] || EMXX="$HOME/emsdk/upstream/emscripten/em++"

mapfile -t SOURCES < <(find "$DDS/library/src" -name '*.cpp' | sort)
SOURCES+=("$HERE/bridge_dds.cpp")

"$EMXX" -O3 -flto -std=c++20 -fexceptions -fwasm-exceptions \
  -I"$DDS/library/src" \
  "${SOURCES[@]}" \
  -sWASM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=67108864 \
  -sSTACK_SIZE=8388608 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createDdsModule \
  -sEXPORTED_FUNCTIONS="['_bd_table','_bd_tricks','_malloc','_free']" \
  -sEXPORTED_RUNTIME_METHODS="['getValue','stringToUTF8']" \
  -sENVIRONMENT=web,worker,node \
  -o "$OUT/dds.js"

cp "$DDS/LICENSE" "$OUT/LICENSE-DDS.txt"
ls -l "$OUT/dds.js" "$OUT/dds.wasm"
