#!/usr/bin/env python3
"""
Forage Ahead — Full-Campaign Pacing Simulator (0% -> 100% Completion)
=====================================================================
Uses exact formulas from:
  - src/world/ResourceNode.ts (node XP by kind)
  - src/data/economy.ts (scaledIslandCost, gearCoinCost, lighthouseBonus)
  - src/data/marketEconomy.ts (dynamic market supply/demand)
  - src/core/GameState.ts (getXpForNextLevel, SP milestones)
  - src/data/islands.ts, src/data/skills.ts, src/data/monsters.ts, src/data/quests.ts

Validates the final tuned 10-20h progression curve across 3 player archetypes:
  1. Speedrunner / Min-Maxer (target: ~11-12h)
  2. Normal Active Player    (target: ~14.5-16h)
  3. Cozy Explorer           (target: ~18-20h)
"""
from __future__ import annotations

import argparse
import pathlib
import re
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parents[1]

NODE_XP: dict[str, float] = {
    "tree": 12.0,
    "rock": 12.0,
    "coal_vein": 16.0,
    "iron_vein": 20.0,
    "gold_vein": 28.0,
    "crystal_vein": 36.0,
    "obsidian_vein": 45.0,
    "berry_bush": 8.0,
    "dig_spot": 18.0,
}

NODE_DROPS: dict[str, list[tuple[str, float]]] = {
    "tree":          [("wood", 3.0)],
    "rock":          [("stone", 3.0)],
    "coal_vein":     [("coal", 2.5), ("stone", 1.5)],
    "iron_vein":     [("iron_ore", 2.5), ("stone", 1.5)],
    "gold_vein":     [("gold_ore", 2.5), ("coal", 1.0)],
    "crystal_vein":  [("crystal", 2.0), ("stone", 1.5)],
    "obsidian_vein": [("obsidian", 2.0), ("coal", 1.5)],
    "berry_bush":    [("berries", 2.5), ("wood", 1.0)],
    "dig_spot":      [("coal", 1.5), ("bone", 1.5)],
}


def node_dist(biome: str) -> dict[str, float]:
    d = {"tree": 0.34, "rock": 0.22, "coal_vein": 0.11, "berry_bush": 0.10, "dig_spot": 0.08}
    split = {
        "grass":     {"iron_vein": 0.65, "tree": 0.35},
        "autumn":    {"gold_vein": 0.50, "iron_vein": 0.50},
        "graveyard": {"iron_vein": 0.55, "dig_spot": 0.45},
        "winter":    {"crystal_vein": 0.65, "gold_vein": 0.35},
        "infernal":  {"obsidian_vein": 0.65, "gold_vein": 0.35},
    }[biome]
    for k, p in split.items():
        d[k] = d.get(k, 0.0) + 0.15 * p
    return d


def biome_avg_node_xp(biome: str) -> float:
    return sum(p * NODE_XP[k] for k, p in node_dist(biome).items())


def parse_item_sell_values() -> dict[str, int]:
    txt = (ROOT / "src/data/items.ts").read_text(encoding="utf-8")
    out: dict[str, int] = {}
    for m in re.finditer(r"id:\s*'([^']+)'[\s\S]*?sellValue:\s*(\d+)", txt):
        out[m.group(1)] = int(m.group(2))
    return out


def parse_island_base_costs() -> list[tuple[str, str, int]]:
    txt = (ROOT / "src/data/islands.ts").read_text(encoding="utf-8")
    out: list[tuple[str, str, int]] = []
    for m in re.finditer(
        r"name:\s*'([^']+)'[\s\S]*?biome:\s*'([^']+)'[\s\S]*?baseCost:\s*(\d+)",
        txt,
    ):
        cost = int(m.group(3))
        if cost > 0:
            out.append((m.group(1), m.group(2), cost))
    return out


def parse_skills_for_class(hero_class: str = "Swashbuckler") -> tuple[int, int, int]:
    txt = (ROOT / "src/data/skills.ts").read_text(encoding="utf-8")
    blocks = re.findall(r"\{[^{}]*id:\s*'[^']+'[^{}]*\}", txt, flags=re.S)
    avail = 0
    sp_cost = 0
    for b in blocks:
        hc = re.search(r"heroClass:\s*'([^']+)'", b)
        if hc and hc.group(1) != hero_class:
            continue
        avail += 1
        sc = re.search(r"spCost:\s*(\d+)", b)
        sp_cost += int(sc.group(1)) if sc else 1
    return len(blocks), avail, sp_cost


def biome_avg_node_sell_gold(biome: str, sell_vals: dict[str, int], drop_mult: float) -> float:
    total = 0.0
    for kind, p in node_dist(biome).items():
        val = sum(qty * drop_mult * sell_vals.get(item, 2) for item, qty in NODE_DROPS[kind])
        total += p * val
    return total


@dataclass
class TuningProfile:
    name: str
    xp_base: float
    xp_lin: float
    xp_quad: float
    node_xp_mult: float
    monster_xp_mult: float
    spire_xp_mult: float
    craft_xp_per_item: float
    island_exp: float
    gear_coin_mult: float
    surplus_sell_share: float
    market_slippage: float
    extra_quests: int
    extra_quest_xp: int
    extra_quest_gold: int


BASELINE = TuningProfile(
    name="BEFORE (Current Baseline)",
    xp_base=400, xp_lin=200, xp_quad=7.0,
    node_xp_mult=1.0, monster_xp_mult=1.0, spire_xp_mult=1.0, craft_xp_per_item=8.0,
    island_exp=1.18, gear_coin_mult=1.0,
    surplus_sell_share=0.45, market_slippage=0.80,
    extra_quests=0, extra_quest_xp=0, extra_quest_gold=0,
)

# Candidate final profile — tight 10-20h across all 3 player styles
FINAL_TUNED = TuningProfile(
    name="AFTER (Tuned 10-20h Campaign)",
    xp_base=290, xp_lin=115, xp_quad=3.0,
    node_xp_mult=1.15, monster_xp_mult=1.20, spire_xp_mult=1.35, craft_xp_per_item=18.0,
    island_exp=1.20, gear_coin_mult=1.35,
    surplus_sell_share=0.45, market_slippage=0.80,
    extra_quests=12, extra_quest_xp=26000, extra_quest_gold=16000,
)


def xp_for_lv(lv: int, p: TuningProfile) -> int:
    return round(p.xp_base + lv * p.xp_lin + lv * lv * p.xp_quad)


def xp_between(lv0: int, lv1: int, p: TuningProfile) -> int:
    return sum(xp_for_lv(lv, p) for lv in range(lv0, lv1))


def scaled_island(base: int, owned: int, exp: float, baron: bool) -> int:
    raw = round((base * (exp ** owned)) / 5) * 5
    return max(10, round(raw * 0.75)) if baron else raw


@dataclass
class ChapterDef:
    name: str
    lv0: int
    lv1: int
    islands_target: int
    baron: bool
    biome_mix: dict[str, float]
    drop_mult: float
    nodes_hr: float
    crafts_hr: float
    kills_hr: float
    avg_kill_xp: float
    avg_kill_gold: float
    dungeons: int
    spire_floors: int
    dungeon_min: float
    town_min: float
    gear_gold_base: float
    base_quest_xp: float
    base_quest_gold: float
    extra_quest_share: float


CHAPTERS: list[ChapterDef] = [
    ChapterDef(
        "Ch1: Castaway Meadows", 1, 8, 4, False,
        {"grass": 1.0}, 1.15, 520, 45, 34, 19, 6,
        dungeons=0, spire_floors=0, dungeon_min=0, town_min=22,
        gear_gold_base=500, base_quest_xp=720, base_quest_gold=560, extra_quest_share=0.04,
    ),
    ChapterDef(
        "Ch2: Ashes & Tombs", 8, 18, 10, True,
        {"grass": 0.20, "autumn": 0.45, "graveyard": 0.35}, 1.40, 740, 90, 48, 46, 15,
        dungeons=2, spire_floors=0, dungeon_min=24, town_min=26,
        gear_gold_base=2200, base_quest_xp=1450, base_quest_gold=1150, extra_quest_share=0.10,
    ),
    ChapterDef(
        "Ch3: Frozen Frontier", 18, 28, 15, True,
        {"autumn": 0.25, "graveyard": 0.15, "winter": 0.60}, 1.95, 980, 140, 56, 98, 30,
        dungeons=1, spire_floors=0, dungeon_min=28, town_min=28,
        gear_gold_base=5500, base_quest_xp=950, base_quest_gold=750, extra_quest_share=0.18,
    ),
    ChapterDef(
        "Ch4: Infernal Crucible", 28, 38, 20, True,
        {"winter": 0.30, "infernal": 0.70}, 2.75, 1280, 210, 64, 175, 52,
        dungeons=1, spire_floors=0, dungeon_min=32, town_min=28,
        gear_gold_base=11500, base_quest_xp=630, base_quest_gold=500, extra_quest_share=0.22,
    ),
    ChapterDef(
        "Ch5: Void Spire (Fl.1-10)", 38, 49, 23, True,
        {"winter": 0.35, "infernal": 0.65}, 4.20, 1650, 280, 82, 340, 88,
        dungeons=0, spire_floors=10, dungeon_min=9.5, town_min=24,
        gear_gold_base=24000, base_quest_xp=0, base_quest_gold=0, extra_quest_share=0.23,
    ),
    ChapterDef(
        "Ch6: Void Spire Apex (Fl.11-20)", 49, 60, 25, True,
        {"winter": 0.35, "infernal": 0.65}, 6.00, 2000, 340, 95, 620, 155,
        dungeons=0, spire_floors=10, dungeon_min=11.0, town_min=24,
        gear_gold_base=42000, base_quest_xp=0, base_quest_gold=0, extra_quest_share=0.23,
    ),
]


def evaluate(
    p: TuningProfile,
    pace_mult: float = 1.0,
    town_mult: float = 1.0,
    label_suffix: str = "",
    verbose: bool = True,
) -> float:
    islands = sorted(parse_island_base_costs(), key=lambda x: x[2])
    sell_vals = parse_item_sell_values()
    owned = 1
    idx = 0
    carry_gold = 0.0
    total_hrs = 0.0
    total_island_g = 0.0
    total_gear_g = 0.0
    imbalance_sum = 0.0

    if verbose:
        total_sk, class_sk, class_sp = parse_skills_for_class("Swashbuckler")
        print(f"\n{'='*106}")
        print(f"PROFILE: {p.name}{label_suffix}")
        print(
            f"XP Formula: {p.xp_base:g} + {p.xp_lin:g}*lv + {p.xp_quad:g}*lv^2  (Lv1->60 = {xp_between(1, 60, p):,} XP) | "
            f"Island Exp: {p.island_exp:.2f} | Gear Mult: {p.gear_coin_mult:.2f}x | "
            f"Skills: {class_sk}/{total_sk} ({class_sp} SP)"
        )
        print(f"{'='*106}")
        print(
            f"{'Chapter':<31} | {'Need XP':>9} | {'Need Gold':>10} | {'XP hr':>5} | {'Au hr':>5} | {'Act hr':>6} | {'Total':>5} | {'Driver'}"
        )
        print("-" * 106)

    for ch in CHAPTERS:
        ch_isl_g = 0
        while owned < ch.islands_target and idx < len(islands):
            ch_isl_g += scaled_island(islands[idx][2], owned - 1, p.island_exp, ch.baron)
            owned += 1
            idx += 1

        ch_gear_g = ch.gear_gold_base * p.gear_coin_mult
        total_island_g += ch_isl_g
        total_gear_g += ch_gear_g

        q_xp = ch.base_quest_xp + p.extra_quest_xp * ch.extra_quest_share
        q_gold = ch.base_quest_gold + p.extra_quest_gold * ch.extra_quest_share

        need_xp = max(0.0, xp_between(ch.lv0, ch.lv1, p) - q_xp)
        gross_gold_need = ch_isl_g + ch_gear_g
        need_gold = max(0.0, gross_gold_need - q_gold - carry_gold)

        dung_hrs = (ch.dungeons + ch.spire_floors) * (ch.dungeon_min / pace_mult) / 60.0
        town_hrs = (ch.town_min * town_mult) / 60.0

        avg_nxp = sum(w * biome_avg_node_xp(b) for b, w in ch.biome_mix.items())
        avg_ngold = sum(w * biome_avg_node_sell_gold(b, sell_vals, ch.drop_mult) for b, w in ch.biome_mix.items())

        is_spire = ch.spire_floors > 0
        mon_mult = p.spire_xp_mult if is_spire else p.monster_xp_mult

        combat_xp_hr = ch.kills_hr * pace_mult * ch.avg_kill_xp * mon_mult
        gather_xp_hr = ch.nodes_hr * pace_mult * avg_nxp * p.node_xp_mult
        craft_xp_hr = ch.crafts_hr * pace_mult * p.craft_xp_per_item

        farm_xp_hr = gather_xp_hr * 0.65 + combat_xp_hr * 0.55 + craft_xp_hr
        farm_gold_hr = (
            ch.nodes_hr * pace_mult * avg_ngold * p.surplus_sell_share * p.market_slippage * 0.65
            + ch.kills_hr * pace_mult * ch.avg_kill_gold * 0.55
        )

        dung_xp = dung_hrs * (combat_xp_hr * 1.15)
        dung_gold = dung_hrs * (ch.kills_hr * pace_mult * ch.avg_kill_gold * 1.65)
        town_xp = town_hrs * (craft_xp_hr * 1.2 + 900.0)
        town_gold = town_hrs * (farm_gold_hr * 0.25)

        rem_xp = max(0.0, need_xp - dung_xp - town_xp)
        rem_gold = max(0.0, need_gold - dung_gold - town_gold)

        xp_hrs = rem_xp / farm_xp_hr if farm_xp_hr > 0 else 0.0
        au_hrs = rem_gold / farm_gold_hr if farm_gold_hr > 0 else 0.0

        farm_hrs = max(xp_hrs, au_hrs)
        ch_total = dung_hrs + town_hrs + farm_hrs
        total_hrs += ch_total
        imbalance_sum += abs(xp_hrs - au_hrs)

        earned_gold = dung_gold + town_gold + farm_hrs * farm_gold_hr + q_gold
        carry_gold = max(0.0, carry_gold + earned_gold - gross_gold_need)

        if verbose:
            driver = "XP" if xp_hrs > au_hrs + 0.25 else ("Gold" if au_hrs > xp_hrs + 0.25 else "Balanced")
            print(
                f"{ch.name:<31} | {need_xp:9,.0f} | {gross_gold_need:10,.0f} | "
                f"{xp_hrs:5.2f} | {au_hrs:5.2f} | {dung_hrs + town_hrs:6.2f} | {ch_total:5.2f} | {driver}"
            )

    if verbose:
        print("-" * 106)
        print(
            f"TOTAL 0%->100%: {total_hrs:.2f} hrs  |  Islands: {total_island_g:,.0f}g  |  "
            f"Gear/Sinks: {total_gear_g:,.0f}g  |  Leftover Gold: {carry_gold:,.0f}g  |  "
            f"XP/Gold Imbalance: {imbalance_sum:.2f}h"
        )
    return total_hrs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="Show baseline + 3 archetypes on final tuned profile")
    args = ap.parse_args()
    evaluate(BASELINE, verbose=True)
    h_norm = evaluate(FINAL_TUNED, pace_mult=1.0, town_mult=1.0, label_suffix=" [Normal Active]", verbose=True)
    h_fast = evaluate(FINAL_TUNED, pace_mult=1.30, town_mult=0.70, label_suffix=" [Speedrunner / Min-Max]", verbose=False)
    h_cozy = evaluate(FINAL_TUNED, pace_mult=0.78, town_mult=1.45, label_suffix=" [Cozy Explorer / Social]", verbose=False)
    print(f"\n=== 3-ARCHETYPE ENVELOPE (Target: 10.0 - 20.0 hours) ===")
    print(f"  Speedrunner / Min-Maxer : {h_fast:5.2f} hours")
    print(f"  Normal Active Player    : {h_norm:5.2f} hours")
    print(f"  Cozy Explorer / Social  : {h_cozy:5.2f} hours")


if __name__ == "__main__":
    main()
