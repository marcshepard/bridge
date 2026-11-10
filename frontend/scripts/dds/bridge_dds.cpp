/*
   Bridge Replay's entry points into DDS, the double-dummy solver (DDS 3, Apache 2.0), for the
   WebAssembly build in frontend/src/dds/. Two calls:

     bd_table(pbn, out)          tricks for every declarer in every strain (20 numbers)
     bd_tricks(pbn, trump, lead) the most tricks the side on lead takes, in one strain

   bd_tricks is what a bot needs most: the tricks one contract makes, about a twentieth of the work
   of a full table. Each Web Worker loads its own copy, so one solver context per copy is enough.
   Built by frontend/scripts/dds/build.sh.
*/

#include <cstring>

#include <api/calc_dd_table.hpp>
#include <api/dds.h>
#include <api/PBN.h>
#include <api/solve_board.hpp>

#include <emscripten.h>

namespace {

auto solver_config() -> SolverConfig
{
  // The small transposition table: a browser tab, possibly on a phone.
  return SolverConfig{
      .tt_kind_ = TTKind::Small,
      .tt_mem_default_mb_ = THREADMEM_SMALL_DEF_MB,
      .tt_mem_maximum_mb_ = THREADMEM_SMALL_MAX_MB,
  };
}

auto context() -> SolverContext&
{
  static SolverContext ctx(solver_config());
  return ctx;
}

}  // namespace

extern "C" {

// out[strain * 4 + hand]: strain 0..4 = S, H, D, C, NT; hand 0..3 = N, E, S, W.
// Returns 1 on success, or a DDS error code.
EMSCRIPTEN_KEEPALIVE
int bd_table(const char* pbn, int* out)
{
  if (pbn == nullptr || out == nullptr) return RETURN_UNKNOWN_FAULT;
  DdTableDealPBN deal{};
  const size_t n = std::strlen(pbn);
  if (n >= sizeof(deal.cards)) return RETURN_PBN_FAULT;
  std::memcpy(deal.cards, pbn, n + 1);

  SolverContext& ctx = context();
  ctx.reset_for_solve();
  DdTableResults table{};
  const int res = calc_dd_table_pbn(ctx, deal, &table);
  if (res != RETURN_NO_FAULT) return res;
  int k = 0;
  for (int strain = 0; strain < DDS_STRAINS; ++strain)
    for (int hand = 0; hand < DDS_HANDS; ++hand) out[k++] = table.res_table[strain][hand];
  return RETURN_NO_FAULT;
}

// The most tricks the side of `first` (on lead, 0..3 = N, E, S, W) takes with `trump` (0..4 =
// S, H, D, C, NT) as trumps. Returns the tricks (0..13), or -1 on any error.
EMSCRIPTEN_KEEPALIVE
int bd_tricks(const char* pbn, int trump, int first)
{
  if (pbn == nullptr || trump < 0 || trump > 4 || first < 0 || first > 3) return -1;
  Deal dl{};
  dl.trump = trump;
  dl.first = first;
  if (convert_from_pbn(pbn, dl.remainCards) != RETURN_NO_FAULT) return -1;

  SolverContext& ctx = context();
  ctx.reset_for_solve();
  FutureTricks fut{};
  const int res = solve_board(ctx, dl, /*target=*/-1, /*solutions=*/1, /*mode=*/0, &fut);
  if (res != RETURN_NO_FAULT) return -1;
  return fut.score[0];
}

}  // extern "C"
