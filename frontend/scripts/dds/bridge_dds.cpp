/*
   Bridge Replay's entry points into DDS, the double-dummy solver (DDS 3, Apache 2.0), for the
   WebAssembly build in frontend/src/dds/. Three calls:

     bd_table(pbn, out)          tricks for every declarer in every strain (20 numbers)
     bd_tricks(pbn, trump, lead) the most tricks the side on lead takes, in one strain
     bd_cards(pbn, trump, first, n, suits, ranks, out)
                                 every legal card for the player to move, part-way through a
                                 trick, with the tricks their side then takes (for card play)

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
  if (fut.score[0] >= 0) return fut.score[0];
  // DDS 3.1.1 returns -2 here on some freak deals (each hand nearly one suit). Solving every card
  // gets them right, so fall back to that and take the best card's tricks.
  ctx.reset_for_solve();
  FutureTricks all{};
  if (solve_board(ctx, dl, -1, /*solutions=*/3, 0, &all) != RETURN_NO_FAULT || all.cards == 0) return -1;
  int best = -1;
  for (int i = 0; i < all.cards; ++i) best = all.score[i] > best ? all.score[i] : best;
  return best;
}

// The player to move, part-way through the hand: `pbn` holds the cards still unplayed (not those
// in the current trick), `first` led the current trick, and the `n` (0..3) cards already in it are
// trickSuits/trickRanks (suit 0..3 = S, H, D, C; rank 2..14). out[0] = how many cards follow, then
// (suit, rank, tricks) for every legal card, cards DDS treats as equal listed one by one. The
// tricks are those the mover's side takes from here, this trick included. Returns 1, or an error.
EMSCRIPTEN_KEEPALIVE
int bd_cards(const char* pbn, int trump, int first, int n, const int* trickSuits, const int* trickRanks, int* out)
{
  if (pbn == nullptr || out == nullptr || trump < 0 || trump > 4 || first < 0 || first > 3 || n < 0 || n > 3) return RETURN_UNKNOWN_FAULT;
  Deal dl{};
  dl.trump = trump;
  dl.first = first;
  for (int i = 0; i < 3; ++i) {
    dl.currentTrickSuit[i] = i < n ? trickSuits[i] : 0;
    dl.currentTrickRank[i] = i < n ? trickRanks[i] : 0;
  }
  if (convert_from_pbn(pbn, dl.remainCards) != RETURN_NO_FAULT) return RETURN_PBN_FAULT;

  SolverContext& ctx = context();
  ctx.reset_for_solve();
  FutureTricks fut{};
  const int res = solve_board(ctx, dl, /*target=*/-1, /*solutions=*/3, /*mode=*/0, &fut);
  if (res != RETURN_NO_FAULT) return res;

  // fut lists the highest card of each group of equals; `equals` names the lower ranks in the same
  // group (bit r - 2 after >> 2). Expand them, so every card has its score.
  int k = 0;
  for (int i = 0; i < fut.cards && k < 13; ++i) {
    out[1 + 3 * k] = fut.suit[i];
    out[2 + 3 * k] = fut.rank[i];
    out[3 + 3 * k] = fut.score[i];
    ++k;
    const unsigned lower = static_cast<unsigned>(fut.equals[i]) >> 2;
    for (int r = 2; r < fut.rank[i] && k < 13; ++r) {
      if (!(lower & (1u << (r - 2)))) continue;
      out[1 + 3 * k] = fut.suit[i];
      out[2 + 3 * k] = r;
      out[3 + 3 * k] = fut.score[i];
      ++k;
    }
  }
  out[0] = k;
  return RETURN_NO_FAULT;
}

}  // extern "C"
