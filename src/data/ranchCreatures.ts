export interface RanchSpeciesDef {
  id: string;
  name: string;
  monsterId: string;
  eggItemId: string;
  spriteKey: string;
  hatchMs: number;
  layIntervalMs: number;
  eggValue: number;
}

export const RANCH_SPECIES: RanchSpeciesDef[] = [
  {
    id: 'slime',
    name: 'Tame Slime',
    monsterId: 'Slime',
    eggItemId: 'egg_slime',
    spriteKey: 'monsters/Slime',
    hatchMs: 8000,
    layIntervalMs: 28000,
    eggValue: 18,
  },
  {
    id: 'bat',
    name: 'Tame Dusk Bat',
    monsterId: 'Bat',
    eggItemId: 'egg_bat',
    spriteKey: 'monsters/Bat',
    hatchMs: 8000,
    layIntervalMs: 32000,
    eggValue: 26,
  },
  {
    id: 'mummy',
    name: 'Tame Sandling',
    monsterId: 'Mummy',
    eggItemId: 'egg_mummy',
    spriteKey: 'monsters/Mummy',
    hatchMs: 9000,
    layIntervalMs: 35000,
    eggValue: 34,
  },
  {
    id: 'salamander',
    name: 'Tame Frost Salamander',
    monsterId: 'Frost Salamander',
    eggItemId: 'egg_salamander',
    spriteKey: 'monsters/Frost Salamander',
    hatchMs: 10000,
    layIntervalMs: 38000,
    eggValue: 44,
  },
  {
    id: 'hellhound',
    name: 'Tame Hellhound',
    monsterId: 'Hellhound',
    eggItemId: 'egg_hellhound',
    spriteKey: 'monsters/Hellhound',
    hatchMs: 10000,
    layIntervalMs: 42000,
    eggValue: 55,
  },
];

export function getSpeciesById(id: string): RanchSpeciesDef | undefined {
  return RANCH_SPECIES.find((s) => s.id === id);
}

export function getSpeciesByEgg(eggItemId: string): RanchSpeciesDef | undefined {
  return RANCH_SPECIES.find((s) => s.eggItemId === eggItemId);
}
