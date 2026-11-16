import { gameState } from '../core/GameState';
import { RECIPES } from './recipes';

/**
 * Rolls a chance to unlock one locked blueprint from `candidateRecipeIds`.
 * Returns the unlocked recipe's display name, or null if none unlocked.
 */
export function tryUnlockBlueprintFromPool(candidateRecipeIds: string[], chance: number): string | null {
  if (Math.random() > chance) return null;
  const locked = candidateRecipeIds.filter((id) => !gameState.unlockedBlueprints.has(id));
  if (locked.length === 0) return null;
  const pick = locked[Math.floor(Math.random() * locked.length)];
  if (!gameState.unlockBlueprint(pick)) return null;
  return RECIPES.find((r) => r.id === pick)?.name ?? pick;
}

export function getBlueprintsForNode(kind: string, biome: string): string[] {
  if (kind === 'gold_ore') return ['smelt_gold', 'upgrade_pick_3'];
  if (kind === 'iron_ore' || kind === 'coal') return ['craft_armor_iron'];
  if (kind === 'crystal') return ['craft_charm_miner', 'upgrade_pick_4', 'craft_armor_frost'];
  if (kind === 'obsidian') return ['craft_armor_obsidian', 'upgrade_sword_4'];
  if (biome === 'autumn') return ['smelt_gold', 'craft_ring_copper'];
  if (biome === 'winter') return ['craft_armor_frost', 'upgrade_pick_4'];
  if (biome === 'infernal') return ['craft_armor_obsidian', 'craft_amulet_dragon'];
  return [];
}

export function getBlueprintsForMonster(monsterId: string, isBoss = false): string[] {
  if (isBoss) {
    if (monsterId === 'Lich') return ['craft_ring_copper', 'smelt_gold'];
    if (monsterId === 'Purple Worm') return ['upgrade_sword_3', 'upgrade_pick_3'];
    if (monsterId === 'Frost Giant') return ['craft_armor_frost', 'upgrade_pick_4'];
    if (monsterId === 'Adult Red Dragon') return ['craft_amulet_dragon', 'craft_armor_obsidian', 'upgrade_sword_4'];
  }
  switch (monsterId) {
    case 'Goblin':
    case 'Orc':
      return ['craft_armor_iron'];
    case 'Mummy':
    case 'Anubis Warrior':
    case 'Djinn':
      return ['smelt_gold', 'craft_ring_copper', 'upgrade_sword_3'];
    case 'Ice Golem':
    case 'Frost Salamander':
    case 'Bheur Hag':
      return ['craft_armor_frost', 'craft_charm_miner', 'upgrade_pick_4'];
    case 'Imp':
    case 'Gog':
    case 'Hellhound':
    case 'Demon':
      return ['craft_armor_obsidian', 'upgrade_sword_4', 'craft_amulet_dragon'];
    default:
      return [];
  }
}
