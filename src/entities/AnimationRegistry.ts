import Phaser from 'phaser';
import manifest from '../data/assetManifest.json';

export type Direction = 'down' | 'left' | 'right' | 'up';

const DIR_ROW: Record<Direction, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

export function vectorToDirection(dx: number, dy: number, fallback: Direction = 'down'): Direction {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'up' : 'down';
}

export function registerDirectionalAnim(
  scene: Phaser.Scene,
  animPrefix: string,
  textureKey: string,
  cols: number,
  rows: number,
  frameRate: number,
  repeat: number,
): void {
  const dirs: Direction[] = ['down', 'left', 'right', 'up'];
  for (const dir of dirs) {
    const row = Math.min(DIR_ROW[dir], Math.max(0, rows - 1));
    const start = row * cols;
    const end = start + Math.max(0, cols - 1);
    const key = `${animPrefix}_${dir}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(textureKey, { start, end }),
      frameRate,
      repeat,
    });
  }
}

export function registerAllAnimations(scene: Phaser.Scene): void {
  // 1. Heroes + Fox companion
  const heroSpecs = manifest.heroes as Record<
    string,
    Record<string, { key: string; cols: number; rows: number }>
  >;
  const loopingHeroAnims = new Set(['idle', 'walk', 'fishing', 'sleeping']);
  for (const [cls, anims] of Object.entries(heroSpecs)) {
    for (const [animName, info] of Object.entries(anims)) {
      const isLoop = loopingHeroAnims.has(animName);
      const fps = animName === 'idle' ? 6 : animName === 'walk' ? 10 : 14;
      registerDirectionalAnim(
        scene,
        `hero_${cls}_${animName}`,
        info.key,
        info.cols,
        info.rows,
        fps,
        isLoop ? -1 : 0,
      );
    }
  }

  // 2. Monsters
  const monsterSpecs = manifest.monsters as Record<
    string,
    {
      frameWidth: number;
      frameHeight: number;
      anims: Record<string, { key: string; cols: number; rows: number }>;
    }
  >;
  for (const [mName, spec] of Object.entries(monsterSpecs)) {
    for (const [animName, info] of Object.entries(spec.anims)) {
      const normalized = animName === 'move' || animName === 'fly' ? 'walk' : animName;
      const isLoop = normalized === 'idle' || normalized === 'walk';
      const fps = normalized === 'idle' ? 6 : normalized === 'walk' ? 8 : 11;
      registerDirectionalAnim(
        scene,
        `mon_${mName}_${normalized}`,
        info.key,
        info.cols,
        info.rows,
        fps,
        isLoop ? -1 : 0,
      );
    }
  }

  // 2b. Familiars (CuteRPG 3x4 blocks)
  const familiarSpecs =
    (manifest as {
      familiars?: Record<
        string,
        {
          key: string;
          cols: number;
          rows: number;
          rowOrder: Record<Direction, number>;
        }
      >;
    }).familiars ?? {};
  const dirs: Direction[] = ['down', 'left', 'right', 'up'];
  for (const [id, spec] of Object.entries(familiarSpecs)) {
    if (!scene.textures.exists(spec.key)) continue;
    const cols = spec.cols || 3;
    for (const dir of dirs) {
      const row = spec.rowOrder?.[dir] ?? DIR_ROW[dir];
      const base = row * cols;
      const idleKey = `fam_${id}_idle_${dir}`;
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: spec.key, frame: base + 1 }],
          frameRate: 1,
          repeat: 0,
        });
      }
      const walkKey = `fam_${id}_walk_${dir}`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: [base + 0, base + 1, base + 2, base + 1].map((frame) => ({
            key: spec.key,
            frame,
          })),
          frameRate: 7,
          repeat: -1,
        });
      }
    }
  }

  // 3. NPCs
  for (const npc of ['Farmer', 'Blacksmith', 'Alchemist', 'Fisherman']) {
    const idleKey = `npcs/Medieval Townsfolk pack (bonus)/${npc}_idle`;
    if (scene.textures.exists(idleKey)) {
      registerDirectionalAnim(scene, `npc_${npc}_idle`, idleKey, 4, 4, 5, -1);
    }
  }

  // 4. Wildlife
  const animals = [
    { id: 'Cow', key: 'animals/Cow_idle (20x16)' },
    { id: 'Deer', key: 'animals/Deer_Idle (32x32)' },
    { id: 'Hen', key: 'animals/Hen_idle (16x16)' },
    { id: 'Rabbit', key: 'animals/Rabbit_Idle (16x16)' },
  ];
  for (const a of animals) {
    if (scene.textures.exists(a.key)) {
      registerDirectionalAnim(scene, `animal_${a.id}_idle`, a.key, 4, 4, 4, -1);
    }
  }

  // 5. Animated Props & Effects
  const simpleLoops: Array<{ key: string; tex: string; start: number; end: number; fps: number; repeat: number }> = [
    { key: 'prop_bonfire', tex: 'extras/Bonfire', start: 0, end: 3, fps: 8, repeat: -1 },
    { key: 'prop_bobber', tex: 'extras/Fishing bobber', start: 0, end: 3, fps: 5, repeat: -1 },
    { key: 'prop_chest_small_open', tex: 'objects/Chest_small', start: 0, end: 3, fps: 10, repeat: 0 },
    { key: 'prop_chest_big_open', tex: 'objects/Chest_big', start: 0, end: 3, fps: 10, repeat: 0 },
    { key: 'fx_bomb_impact', tex: 'projectiles/Bomb_impact', start: 0, end: 2, fps: 14, repeat: 0 },
  ];
  for (const item of simpleLoops) {
    if (scene.textures.exists(item.tex) && !scene.anims.exists(item.key)) {
      scene.anims.create({
        key: item.key,
        frames: scene.anims.generateFrameNumbers(item.tex, { start: item.start, end: item.end }),
        frameRate: item.fps,
        repeat: item.repeat,
      });
    }
  }
}
