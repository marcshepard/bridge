"""Generate the synthetic sample game in frontend/public/games/.

The deals are random, and the double-dummy analysis is real (computed with the DDS solver
via the `endplay` package). The *field results* are SIMULATED: each "table" bids somewhere
near what its side can make double dummy, with some random error. They are plausible
enough to exercise the app, but they are not real results from any game.

Usage (from the repo root):

    pip install endplay
    python scripts/make_sample_game.py

or run the VS Code task "Generate sample game".

The output is deterministic for a given --seed, so re-running it produces the same file.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path

from endplay.dds import calc_dd_table, par
from endplay.dealer import generate_deal
from endplay.types import Denom, Penalty, Player, Vul

SEATS = ["N", "E", "S", "W"]
PLAYERS = {"N": Player.north, "E": Player.east, "S": Player.south, "W": Player.west}
STRAINS = {"S": Denom.spades, "H": Denom.hearts, "D": Denom.diamonds, "C": Denom.clubs, "NT": Denom.nt}
DENOM_CODE = {Denom.spades: "S", Denom.hearts: "H", Denom.diamonds: "D", Denom.clubs: "C", Denom.nt: "NT"}
PLAYER_CODE = {v: k for k, v in PLAYERS.items()}
PENALTY_CODE = {Penalty.passed: "", Penalty.doubled: "X", Penalty.redoubled: "XX"}

# Standard duplicate board rotation (repeats every 16 boards).
VUL_CYCLE = ["None", "NS", "EW", "Both", "NS", "EW", "Both", "None",
             "EW", "Both", "None", "NS", "Both", "None", "NS", "EW"]
VUL_ENUM = {"None": Vul.none, "NS": Vul.ns, "EW": Vul.ew, "Both": Vul.both}
SIDES = {"NS": ("N", "S"), "EW": ("E", "W")}


def hcp(hand_pbn: str) -> int:
    values = {"A": 4, "K": 3, "Q": 2, "J": 1}
    return sum(values.get(ch, 0) for ch in hand_pbn)


def trick_points(level: int, strain: str) -> int:
    if strain == "NT":
        return 40 + 30 * (level - 1)
    return level * (20 if strain in ("C", "D") else 30)


def made_score(level: int, strain: str, tricks: int, vul: bool) -> int:
    """Undoubled score for a making contract (enough to choose a sensible target)."""
    pts = trick_points(level, strain)
    score = pts + ((500 if vul else 300) if pts >= 100 else 50)
    if level == 6:
        score += 750 if vul else 500
    if level == 7:
        score += 1500 if vul else 1000
    over = tricks - (level + 6)
    score += over * (20 if strain in ("C", "D") else 30)
    return score


def best_contract(dd: dict, side: str, vul: bool):
    """The highest-scoring makeable contract for a side, as (score, level, strain, declarer)."""
    best = (0, 0, None, None)
    for strain in STRAINS:
        for seat in SIDES[side]:
            tricks = dd[seat][strain]
            for level in range(1, 8):
                if level + 6 > tricks:
                    break
                s = made_score(level, strain, tricks, vul)
                # Prefer the lower level when the score is the same (2♠+1 over 3♠=).
                if s > best[0]:
                    best = (s, level, strain, seat)
    return best


def simulate_table(rng: random.Random, dd: dict, hands: dict, vul_name: str):
    ns_hcp = hcp(hands["N"]) + hcp(hands["S"])
    side = "NS" if ns_hcp > 20 or (ns_hcp == 20 and rng.random() < 0.5) else "EW"
    # Occasionally the weaker side buys the contract (competing / a misjudgement).
    if rng.random() < 0.12:
        side = "EW" if side == "NS" else "NS"
    vul = vul_name in ("Both", side)

    score, level, strain, seat = best_contract(dd, side, vul)
    if strain is None:
        # The side can't make anything: play a 2-level contract in its longest-trick strain.
        strain = max(STRAINS, key=lambda s: max(dd[p][s] for p in SIDES[side]))
        level = 2
    else:
        pts = trick_points(level, strain)
        if pts < 100:
            level = rng.choice([1, 2, 2, 2, 3])  # part scores are usually played at the 2-level
            # A part-score side that might have a game sometimes bids it.
        roll = rng.random()
        if roll < 0.15:
            level -= 1  # under-bid (e.g. stop in 3NT with 6NT on)
        elif roll < 0.30:
            level += 1  # over-bid
        level = max(1, min(7, level))
        # A side with a fit and game values often lands in the right strain but not always.
        if rng.random() < 0.15:
            alternatives = sorted(STRAINS, key=lambda s: -max(dd[p][s] for p in SIDES[side]))
            strain = alternatives[1]

    a, b = SIDES[side]
    best_decl = a if dd[a][strain] >= dd[b][strain] else b
    other = b if best_decl == a else a
    declarer = best_decl if rng.random() < 0.75 else other

    tricks = dd[declarer][strain] + rng.choices([-1, 0, 1], weights=[22, 63, 15])[0]
    tricks = max(0, min(13, tricks))

    doubling = ""
    if tricks < level + 6 - 1 and rng.random() < 0.35:
        doubling = "X"
    elif tricks < level + 6 and level >= 4 and rng.random() < 0.15:
        doubling = "X"
    return f"{level}{strain}{doubling}", declarer, tricks


def board_entry(rng: random.Random, number: int, deal, field_size: int) -> dict:
    hands = {}
    for seat, player in PLAYERS.items():
        hands[seat] = deal[player].to_pbn()

    table = calc_dd_table(deal)
    dd = {seat: {s: table[denom, PLAYERS[seat]] for s, denom in STRAINS.items()} for seat in SEATS}

    dealer = SEATS[(number - 1) % 4]
    vul = VUL_CYCLE[(number - 1) % 16]
    par_list = par(table, VUL_ENUM[vul], PLAYERS[dealer])
    par_contracts = []
    for c in par_list:
        if c.is_passout():
            continue
        par_contracts.append({
            "contract": f"{c.level}{DENOM_CODE[c.denom]}{PENALTY_CODE[c.penalty]}",
            "declarer": PLAYER_CODE[c.declarer],
            "tricks": c.level + 6 + c.result,
        })

    results = Counter(simulate_table(rng, dd, hands, vul) for _ in range(field_size))
    field = [
        {"contract": contract, "declarer": declarer, "tricks": tricks, "count": count}
        for (contract, declarer, tricks), count in sorted(results.items(), key=lambda kv: -kv[1])
    ]

    entry = {
        "number": number,
        "dealer": dealer,
        "vul": vul,
        "hands": hands,
        "field": field,
        "doubleDummy": {
            "tricks": dd,
            "par": {"nsScore": par_list.score, "contracts": par_contracts},
        },
    }
    if abs(par_list.score) >= 980:
        entry["commentary"] = (
            "Sample note (auto-generated, not expert analysis): double dummy, this deal "
            f"has a slam for the side with the high cards; par is {par_list.score:+d} for North–South."
        )
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=20211203)
    parser.add_argument("--boards", type=int, default=24)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "frontend" / "public" / "games")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    boards = []
    for n in range(1, args.boards + 1):
        deal = generate_deal(seed=rng.randrange(2**31))
        boards.append(board_entry(rng, n, deal, field_size=rng.randint(14, 30)))

    game_id = "sample-synthetic-01"
    game = {
        "schemaVersion": 1,
        "id": game_id,
        "title": "Sample game (synthetic)",
        "date": "2021-12-03",
        "session": "Afternoon",
        "source": {
            "name": "Synthetic sample",
            "attribution": (
                "Random deals with real double-dummy analysis; field results are simulated "
                "by scripts/make_sample_game.py. Not real results from any game."
            ),
        },
        "boards": boards,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    game_path = args.out / f"{game_id}.json"
    game_path.write_text(json.dumps(game, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    # The index lists every game file in this folder, so the app can offer them.
    index = []
    for path in sorted(args.out.glob("*.json")):
        if path.name == "index.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        index.append({
            "id": data["id"],
            "file": path.name,
            "title": data.get("title", data["id"]),
            "date": data.get("date"),
            "session": data.get("session"),
            "source": data.get("source", {}).get("name"),
            "boardCount": len(data["boards"]),
        })
    (args.out / "index.json").write_text(json.dumps({"games": index}, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {game_path} ({len(boards)} boards) and index.json ({len(index)} games)")


if __name__ == "__main__":
    main()
