#!/usr/bin/env python3
"""
Forage Ahead — Economy & Resource Flow Simulator (Per-Island Respawn Model)
===========================================================================
Models resources gathered over time when:
  1. Each owned island independently respawns 1 node every 4.2s (up to 40 nodes/island).
  2. Max node density per island is increased from 32 -> 40 (starter 26 -> 34),
     reducing walk time between nodes and increasing Mining Rod coverage.
  3. Harvesting combines:
     - Active Player farming on target islands (scales with tool damage, gather skills,
       and higher 40-node island density)
     - Automated Mining Rods ticking in parallel across owned islands
     - Capped per biome by each island's independent respawn ceiling (857 nodes/hr/island).

Usage:
  python tools/economy_sim.py                 # full report
  python tools/economy_sim.py --cost-mult 5   # evaluate flat 5x vs progressive tier scaling
  python tools/economy_sim.py --lighthouse    # lighthouse curve tables only
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# 1. Game constants (Per-Island Respawn + 40 Max Density)
# ---------------------------------------------------------------------------
RESPAWN_INTERVAL_PER_ISLAND_S = 3.36  # 1 node / 3.36s PER OWNED ISLAND (was global!)
OLD_MAX_NODES_PER_ISLAND = 32
NEW_MAX_NODES_PER_ISLAND = 50         # +56% density per island (starter: 26 -> 42)
DAY_NIGHT_SPAWN_FACTOR = 0.5463 + 0.4537 * 0.55  # 0.7958 effective day/night spawn rate
DENSITY_SPEEDUP = (NEW_MAX_NODES_PER_ISLAND / OLD_MAX_NODES_PER_ISLAND) ** 0.5  # ~1.12x faster node-to-node

NODE_DROPS: dict[str, list[tuple[str, int, int]]] = {
    "tree":          [("wood", 2, 4)],
    "rock":          [("stone", 2, 4)],
    "coal_vein":     [("coal", 2, 3), ("stone", 1, 2)],
    "iron_vein":     [("iron_ore", 2, 3), ("stone", 1, 2)],
    "gold_vein":     [("gold_ore", 2, 3), ("coal", 1, 1)],
    "crystal_vein":  [("crystal", 1, 3), ("stone", 1, 2)],
    "obsidian_vein": [("obsidian", 1, 3), ("coal", 1, 2)],
    "berry_bush":    [("berries", 2, 3), ("wood", 1, 1)],
    "dig_spot":      [("coal", 1, 2), ("bone", 1, 2)],
}
ORE_ITEMS = {"coal", "iron_ore", "gold_ore", "crystal"}


def node_distribution(biome: str) -> dict[str, float]:
    """Exact probabilities from OverworldScene.pickNodeKindForBiome."""
    d = {"tree": 0.34, "rock": 0.22, "coal_vein": 0.11, "berry_bush": 0.10, "dig_spot": 0.08}
    tail = 0.15
    split = {
        "grass":     {"iron_vein": 0.65, "tree": 0.35},
        "autumn":    {"gold_vein": 0.50, "iron_vein": 0.50},
        "graveyard": {"iron_vein": 0.55, "dig_spot": 0.45},
        "winter":    {"crystal_vein": 0.65, "gold_vein": 0.35},
        "infernal":  {"obsidian_vein": 0.65, "gold_vein": 0.35},
    }[biome]
    for k, p in split.items():
        d[k] = d.get(k, 0) + tail * p
    return d


# ---------------------------------------------------------------------------
# 2. Lighthouse models
# ---------------------------------------------------------------------------
def lighthouse_linear(n: int) -> float:
    """OLD game: +50% per overlapping lighthouse (unbounded)."""
    return 1.0 + 0.5 * n


def lighthouse_bonus(n: int) -> float:
    """PROPOSED: f(n) = 1/2 * prod_{k=1}^{n-1} (1 + 1/2^k).  f(0)=0, f(1)=0.5, f(inf)~1.1921"""
    if n <= 0:
        return 0.0
    p = 1.0
    for k in range(1, n):
        p *= 1.0 + 1.0 / (2 ** k)
    return 0.5 * p


def lighthouse_mult(n: int, beacon_scale: float = 1.0) -> float:
    """Drop multiplier = 1 + S * f(n). S is raised by the Beacon skill line (1 -> 10)."""
    return 1.0 + beacon_scale * lighthouse_bonus(n)


BEACON_TIERS = [
    ("(none)",              1.0),
    ("T9  Beacon Lens",     2.5),
    ("T10 Prism Array",     4.5),
    ("T11 Tidal Resonance", 7.0),
    ("T12 Eternal Flame",  10.0),
]


# ---------------------------------------------------------------------------
# 3. Player state per progression stage
# ---------------------------------------------------------------------------
@dataclass
class Stage:
    name: str
    level: int
    islands: dict[str, int]
    focus_biomes: dict[str, float]
    active_nodes_per_hr: float
    mining_rods: int = 0
    skills: set[str] = field(default_factory=set)
    lighthouses_in_range: int = 0
    lighthouse_coverage: float = 0.0
    beacon_scale: float = 1.0


STAGES: list[Stage] = [
    Stage(
        "Ch1 Castaway", 3,
        islands={"grass": 3},
        focus_biomes={"grass": 1.0},
        active_nodes_per_hr=650 * DENSITY_SPEEDUP,
        mining_rods=0,
        skills=set(),
    ),
    Stage(
        "Ch2 Ashes & Tombs", 9,
        islands={"grass": 6, "autumn": 3, "graveyard": 3},
        focus_biomes={"grass": 0.20, "autumn": 0.50, "graveyard": 0.30},
        active_nodes_per_hr=820 * DENSITY_SPEEDUP,
        mining_rods=2,
        skills={"foraging_bounty"},
    ),
    Stage(
        "Ch3 Frozen", 14,
        islands={"grass": 6, "autumn": 5, "graveyard": 5, "winter": 3},
        focus_biomes={"grass": 0.10, "autumn": 0.25, "graveyard": 0.15, "winter": 0.50},
        active_nodes_per_hr=980 * DENSITY_SPEEDUP,
        mining_rods=6,
        skills={"foraging_bounty", "industry_prospecting"},
        lighthouses_in_range=1, lighthouse_coverage=0.35, beacon_scale=1.0,
    ),
    Stage(
        "Ch4 Inferno", 20,
        islands={"grass": 6, "autumn": 5, "graveyard": 5, "winter": 4, "infernal": 3},
        focus_biomes={"grass": 0.10, "autumn": 0.15, "graveyard": 0.10, "winter": 0.25, "infernal": 0.40},
        active_nodes_per_hr=1150 * DENSITY_SPEEDUP,
        mining_rods=12,
        skills={"foraging_bounty", "industry_prospecting", "industry_overclock"},
        lighthouses_in_range=2, lighthouse_coverage=0.50, beacon_scale=1.0,
    ),
    Stage(
        "Ch5-6 Void 1-10", 38,
        islands={"grass": 6, "autumn": 5, "graveyard": 5, "winter": 4, "infernal": 5},
        focus_biomes={"grass": 0.15, "autumn": 0.20, "graveyard": 0.15, "winter": 0.25, "infernal": 0.25},
        active_nodes_per_hr=1350 * DENSITY_SPEEDUP,
        mining_rods=22,
        skills={"foraging_bounty", "industry_prospecting", "industry_overclock"},
        lighthouses_in_range=4, lighthouse_coverage=0.70, beacon_scale=4.5,
    ),
    Stage(
        "Ch7-8 Void 11-20", 60,
        islands={"grass": 6, "autumn": 5, "graveyard": 5, "winter": 4, "infernal": 5},
        focus_biomes={"grass": 0.15, "autumn": 0.20, "graveyard": 0.15, "winter": 0.25, "infernal": 0.25},
        active_nodes_per_hr=1550 * DENSITY_SPEEDUP,
        mining_rods=35,
        skills={"foraging_bounty", "industry_prospecting", "industry_overclock", "foraging_sovereign"},
        lighthouses_in_range=6, lighthouse_coverage=0.85, beacon_scale=10.0,
    ),
]


def expected_drops_per_node(kind: str, skills: set[str], mult: float) -> dict[str, float]:
    out: dict[str, float] = {}
    for item, lo, hi in NODE_DROPS[kind]:
        q = (lo + hi) / 2
        if "foraging_bounty" in skills:
            q += 0.35
        if "industry_prospecting" in skills and item in ORE_ITEMS:
            q += 1
        if "foraging_sovereign" in skills:
            q *= 1.5
        out[item] = out.get(item, 0) + max(1.0, q * mult)
    return out


def rod_nodes_per_hour(stage: Stage) -> float:
    if stage.mining_rods <= 0:
        return 0.0
    pulse_s = 2.4 if "industry_overclock" in stage.skills else 4.5
    avg_nodes_hit = 1.6 * DENSITY_SPEEDUP
    avg_node_hp = 52.0
    kills_per_rod_hr = (3600.0 / pulse_s) * avg_nodes_hit * (16.0 / avg_node_hp) * 0.35
    return stage.mining_rods * kills_per_rod_hr


def income_per_hour_per_island_spawn(stage: Stage, lighthouse_fn) -> dict[str, float]:
    max_spawn_per_island_hr = (3600.0 / RESPAWN_INTERVAL_PER_ISLAND_S) * DAY_NIGHT_SPAWN_FACTOR
    total_harvest_demand = stage.active_nodes_per_hr + rod_nodes_per_hour(stage)

    lh_mult = lighthouse_fn(stage)
    eff_mult = stage.lighthouse_coverage * lh_mult + (1 - stage.lighthouse_coverage) * 1.0

    income: dict[str, float] = {}
    for biome, count in stage.islands.items():
        biome_spawn_cap = count * max_spawn_per_island_hr
        biome_demand = total_harvest_demand * stage.focus_biomes.get(biome, 0.0)
        harvested_nodes = min(biome_spawn_cap, biome_demand)
        for kind, p in node_distribution(biome).items():
            for item, q in expected_drops_per_node(kind, stage.skills, eff_mult).items():
                income[item] = income.get(item, 0) + harvested_nodes * p * q
    return income


# ---------------------------------------------------------------------------
# 4. Recipe costs & tier multipliers
# ---------------------------------------------------------------------------
INGOT = {"iron_ingot": {"iron_ore": 2, "coal": 1}, "gold_ingot": {"gold_ore": 2, "coal": 1}}

# Progressive chapter multiplier (starts at 5x in Ch1-2, scales with per-island + rod expansion)
CHAPTER_TIER_MULT = {"Ch1": 5.0, "Ch2": 5.0, "Ch3": 8.0, "Ch4": 12.0}

TIER_GEAR: dict[str, dict[str, dict[str, int]]] = {
    "Ch1": {
        "Leather Vest":  {"wood": 6, "slime_gel": 4, "berries": 4},
        "Furnace":       {"stone": 10, "coal": 2},
    },
    "Ch2": {
        "Iron Pickaxe":    {"wood": 8, "iron_ingot": 5},
        "Iron Broadsword": {"iron_ingot": 6, "slime_gel": 4},
        "Iron Hauberk":    {"iron_ingot": 8, "coal": 4},
        "Golden Pickaxe":  {"iron_ingot": 6, "gold_ingot": 6},
        "Sunforged Blade": {"gold_ingot": 6, "amber": 5, "bone": 5},
    },
    "Ch3": {
        "Frostcrystal Kiln":    {"stone": 14, "gold_ingot": 4, "crystal": 6},
        "Frostcrystal Plate":   {"iron_ingot": 6, "crystal": 8},
        "Crystal Void Pickaxe": {"gold_ingot": 8, "crystal": 8, "obsidian": 4},
    },
    "Ch4": {
        "Infernal Forge":      {"obsidian": 6, "gold_ingot": 6, "demon_horn": 4},
        "Obsidian Greatsword": {"obsidian": 8, "demon_horn": 4, "crystal": 6},
        "Obsidian Battlegear": {"obsidian": 8, "demon_horn": 4, "gold_ingot": 4},
    },
}
STAGE_FOR_TIER = {"Ch1": 0, "Ch2": 1, "Ch3": 2, "Ch4": 3}


def expand_flat(cost: dict[str, int], mult: float) -> dict[str, float]:
    out: dict[str, float] = {}
    for item, n in cost.items():
        if item in INGOT:
            for raw, m in INGOT[item].items():
                out[raw] = out.get(raw, 0) + n * m * mult
        else:
            out[item] = out.get(item, 0) + n * mult
    return out


def hours_to_afford(cost: dict[str, float], income: dict[str, float]) -> tuple[float, str]:
    worst, bottleneck = 0.0, "-"
    for item, need in cost.items():
        rate = income.get(item, 0)
        if rate <= 0:
            continue
        h = need / rate
        if h > worst:
            worst, bottleneck = h, item
    return worst, bottleneck


def gear_coin_cost(level: int) -> int:
    return int(round(25 * 1.13 ** level / 5) * 5)


def island_cost(base: int, owned: int) -> int:
    return int(round(base * 1.18 ** owned / 5) * 5)


def print_lighthouse_tables() -> None:
    print("\n=== LIGHTHOUSE MULTIPLIER: CURRENT (linear) vs PROPOSED f(n) ===")
    print(f"{'n':>3} | {'current':>8} | {'f(n)':>7} | " + " | ".join(f"S={s:<4}" for _, s in BEACON_TIERS))
    for n in range(0, 13):
        row = [f"{lighthouse_mult(n, s):6.2f}x" for _, s in BEACON_TIERS]
        print(f"{n:>3} | {lighthouse_linear(n):7.2f}x | {lighthouse_bonus(n):7.4f} | " + " | ".join(row))
    print(f"limit  f(inf) = {lighthouse_bonus(60):.4f}  ->  max mult S=1: {lighthouse_mult(60):.3f}x, "
          f"S=10: {lighthouse_mult(60, 10):.3f}x")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cost-mult", type=float, default=5.0)
    ap.add_argument("--lighthouse", action="store_true")
    args = ap.parse_args()

    print_lighthouse_tables()
    if args.lighthouse:
        return

    def proposed(stage: Stage) -> float:
        return lighthouse_mult(stage.lighthouses_in_range, stage.beacon_scale)

    key_items = ["wood", "stone", "coal", "iron_ore", "gold_ore", "crystal", "obsidian", "berries", "bone"]
    print("\n=== PER-ISLAND RESPAWN (1 node/4.2s/island, 40 max density) + PROPOSED LIGHTHOUSE ===")
    print(f"{'stage':<20}" + "".join(f"{i:>10}" for i in key_items))
    for st in STAGES:
        inc = income_per_hour_per_island_spawn(st, proposed)
        print(f"{st.name:<20}" + "".join(f"{inc.get(i, 0):10.0f}" for i in key_items))

    print(f"\n=== FARM TIME: FLAT x{args.cost_mult:g} vs PROGRESSIVE TIER (5x/5x/8x/12x) ===")
    print(f"{'Tier & Item':<28} | {'Flat x5':>12} | {'Tiered (5x->12x)':>16} | {'Bottleneck'}")
    print("-" * 76)
    for tier, items in TIER_GEAR.items():
        st = STAGES[STAGE_FOR_TIER[tier]]
        inc = income_per_hour_per_island_spawn(st, proposed)
        t_mult = CHAPTER_TIER_MULT[tier]
        for name, cost in items.items():
            h_flat, b = hours_to_afford(expand_flat(cost, args.cost_mult), inc)
            h_prog, _ = hours_to_afford(expand_flat(cost, t_mult), inc)
            print(f"{tier + ' ' + name:<28} | {h_flat*60:9.1f} min | {h_prog*60:13.1f} min | {b}")


if __name__ == "__main__":
    main()
