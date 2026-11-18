import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { encodePng, generatePixelArtIcons } from './pixelArtIcons.mjs';

function computeFrameFeetOffset(buf, fw, fh) {
  if (buf.length < 33 || buf.toString('ascii', 1, 4) !== 'PNG') return Math.round(fh * 0.2);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      colorType = buf[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (colorType !== 6 || width < fw || height < fh) return Math.round(fh * 0.2);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const curr = Buffer.alloc(stride);
  let maxY = -1;
  for (let y = 0; y < fh; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + 1 + i];
      const a = i >= bpp ? curr[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 0xff;
      }
      curr[i] = val;
    }
    for (let x = 0; x < fw; x++) {
      if (curr[x * 4 + 3] > 10) {
        maxY = y + 1;
      }
    }
    curr.copy(prev);
  }
  if (maxY < 0) return Math.round(fh * 0.2);
  return maxY - fh / 2;
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'assets');
const MANIFEST_OUT = path.join(ROOT, 'src', 'data', 'assetManifest.json');

function readPngDimensions(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    return { width: 0, height: 0 };
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extractMatching(zipPath, rules, manifest) {
  const fullZip = path.join(ROOT, zipPath);
  if (!fs.existsSync(fullZip)) {
    throw new Error(`Missing zip archive: ${fullZip}`);
  }
  const zip = new AdmZip(fullZip);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const norm = entry.entryName.replace(/\\/g, '/');
    for (const rule of rules) {
      if (!rule.match(norm)) continue;
      const relOut = rule.map(norm);
      const dest = path.join(OUT_DIR, relOut);
      ensureDir(path.dirname(dest));
      const data = entry.getData();
      try {
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== data.length) {
          fs.writeFileSync(dest, data);
        }
      } catch (err) {
        if (err && err.code !== 'EPERM') throw err;
      }
      if (norm.toLowerCase().endsWith('.png')) {
        const { width, height } = readPngDimensions(data);
        const key = rule.key ? rule.key(norm) : relOut.replace(/\.png$/i, '');
        manifest.images[key] = {
          path: `assets/${relOut}`,
          width,
          height,
        };
      }
      break;
    }
  }
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(path.dirname(MANIFEST_OUT));

  const manifest = {
    images: {},
    heroes: {},
    monsters: {},
  };

  // 1. Fantasy RPG asset pack (2).zip
  extractMatching(
    'Fantasy RPG asset pack (2).zip',
    [
      {
        match: (n) => n.startsWith('1x/Tileset/') && n.endsWith('.png'),
        map: (n) => `tileset/${n.slice('1x/Tileset/'.length)}`,
      },
      {
        match: (n) => n.startsWith('1x/Objects/') && n.endsWith('.png'),
        map: (n) => `objects/${n.slice('1x/Objects/'.length)}`,
      },
      {
        match: (n) => n.startsWith('1x/NPCs/') && n.endsWith('.png'),
        map: (n) => `npcs/${n.slice('1x/NPCs/'.length)}`,
      },
      {
        match: (n) =>
          n.startsWith('1x/Monsters and animals/') &&
          !n.includes('/Extras/') &&
          n.endsWith('.png') &&
          /^(Cow|Deer|Hen|Pig|Rabbit|Raven|Bear|Wolf|Slime 0[1-4]|Bat 0[1-3]|Mushy 0[1-4])/.test(
            n.slice('1x/Monsters and animals/'.length),
          ),
        map: (n) => `animals/${n.slice('1x/Monsters and animals/'.length)}`,
      },
    ],
    manifest,
  );

  // 2. Fantasy RPG heroes pack (by Franuka).zip
  extractMatching(
    'Fantasy RPG heroes pack (by Franuka).zip',
    [
      {
        match: (n) =>
          n.startsWith('1x/Character sprites/') &&
          n.endsWith('.png') &&
          !n.includes('Full Sheet') &&
          !n.includes('hitbox.png') &&
          !n.endsWith('_melee.png'),
        map: (n) => `heroes/${n.slice('1x/Character sprites/'.length)}`,
      },
      {
        match: (n) =>
          n.startsWith('1x/Character portraits & Emotes/') &&
          n.endsWith('.png') &&
          (n.endsWith('_frame.png') || n.includes('Emotes/')),
        map: (n) => `portraits/${n.slice('1x/Character portraits & Emotes/'.length)}`,
      },
      {
        match: (n) => n.startsWith('1x/Projectiles & Breakables/') && n.endsWith('.png'),
        map: (n) => `projectiles/${n.slice('1x/Projectiles & Breakables/'.length)}`,
      },
      {
        match: (n) =>
          n.startsWith('1x/Tilesets & extras (free samples)/') &&
          !n.includes('/Old/') &&
          n.endsWith('.png'),
        map: (n) => `extras/${n.slice('1x/Tilesets & extras (free samples)/'.length)}`,
      },
    ],
    manifest,
  );

  // 3. Fantasy RPG ultimate monster pack (by Franuka).zip — extract all 55 monsters
  extractMatching(
    'Fantasy RPG ultimate monster pack (by Franuka).zip',
    [
      {
        match: (n) => {
          if (!n.startsWith('1x/') || n.startsWith('1x/EXTRAS/') || !n.endsWith('.png')) return false;
          if (n.includes('hitbox.png')) return false;
          const parts = n.slice(3).split('/');
          return parts.length >= 3;
        },
        map: (n) => {
          const parts = n.slice(3).split('/');
          return `monsters/${parts[1]}/${parts.slice(2).join('/')}`;
        },
      },
      {
        match: (n) => n.startsWith('1x/EXTRAS/Portraits/') && n.endsWith('_frame.png'),
        map: (n) => `boss_portraits/${n.slice('1x/EXTRAS/Portraits/'.length)}`,
      },
      {
        match: (n) => n.startsWith('1x/EXTRAS/Projectiles/') && n.endsWith('.png'),
        map: (n) => `monster_projectiles/${n.slice('1x/EXTRAS/Projectiles/'.length)}`,
      },
      {
        match: (n) => n.startsWith('1x/EXTRAS/Icons (item drops)/') && n.endsWith('.png'),
        map: (n) => `icons/${n.slice('1x/EXTRAS/Icons (item drops)/'.length)}`,
      },
    ],
    manifest,
  );

  // Build hero metadata (all 48x48 frames, 4 directional rows except sleeping which is 1 row)
  const heroClasses = ['Beastmaster', 'Gladiator', 'Sorcerer', 'Swashbuckler', 'Fox'];
  for (const cls of heroClasses) {
    manifest.heroes[cls] = {};
    for (const [key, info] of Object.entries(manifest.images)) {
      if (!key.startsWith(`heroes/${cls}/`)) continue;
      const file = key.slice(`heroes/${cls}/`.length);
      if (!file.startsWith(`${cls}_`)) continue;
      const animName = file.slice(cls.length + 1);
      const targetName = animName === 'melee_NoHitbox' ? 'melee' : animName;
      const pngBuf = fs.readFileSync(path.join(ROOT, 'public', info.path));
      const feetOffset = animName === 'idle' ? computeFrameFeetOffset(pngBuf, 48, 48) : undefined;
      manifest.heroes[cls][targetName] = {
        key,
        frameWidth: 48,
        frameHeight: 48,
        cols: Math.floor(info.width / 48),
        rows: Math.floor(info.height / 48),
        ...(feetOffset !== undefined ? { feetOffset } : {}),
      };
    }
  }

  // Build monster metadata from *_idle.png (always 4 cols x 4 rows)
  const monsterFolders = new Set();
  for (const key of Object.keys(manifest.images)) {
    if (key.startsWith('monsters/')) {
      monsterFolders.add(key.split('/')[1]);
    }
  }
  for (const mName of monsterFolders) {
    const prefix = `monsters/${mName}/`;
    const idleEntry = Object.entries(manifest.images).find(
      ([k]) => k.startsWith(prefix) && k.endsWith('_idle'),
    );
    if (!idleEntry) continue;
    const [, idleInfo] = idleEntry;
    const frameWidth = Math.floor(idleInfo.width / 4);
    const frameHeight = Math.floor(idleInfo.height / 4);
    const idleBuf = fs.readFileSync(path.join(ROOT, 'public', idleInfo.path));
    const feetOffset = computeFrameFeetOffset(idleBuf, frameWidth, frameHeight);
    const anims = {};
    for (const [key, info] of Object.entries(manifest.images)) {
      if (!key.startsWith(prefix)) continue;
      const raw = key.slice(prefix.length);
      const underscoreIdx = raw.indexOf('_');
      if (underscoreIdx === -1) continue;
      let animName = raw.slice(underscoreIdx + 1);
      if (animName.includes('projectile')) continue;
      if (animName === 'attack_NOhitbox') animName = 'attack';
      if (animName === 'special_NOhitbox') animName = 'special';
      // Skip raw attack/special if NOhitbox exists
      if (
        (animName === 'attack' && manifest.images[`${key}_NOhitbox`]) ||
        (animName === 'special' && manifest.images[`${key}_NOhitbox`])
      ) {
        continue;
      }
      anims[animName] = {
        key,
        frameWidth,
        frameHeight,
        cols: Math.max(1, Math.floor(info.width / frameWidth)),
        rows: Math.max(1, Math.floor(info.height / frameHeight)),
      };
    }
    manifest.monsters[mName] = {
      frameWidth,
      frameHeight,
      feetOffset,
      anims,
    };
  }

  generatePixelArtIcons(path.join(OUT_DIR, 'ui_icons'), manifest);
  extractSproutLands(manifest);

  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
  console.log(
    `Extracted ${Object.keys(manifest.images).length} PNGs, ${Object.keys(manifest.heroes).length} heroes, ${Object.keys(manifest.monsters).length} monsters.`,
  );
}

function decodePngRgba(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      colorType = buf[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (colorType !== 6 && colorType !== 2) return null;
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const curr = Buffer.alloc(stride);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + 1 + i];
      const a = i >= bpp ? curr[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 0xff;
      }
      curr[i] = val;
    }
    curr.copy(prev);
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = x * bpp;
      rgba[dst] = curr[src];
      rgba[dst + 1] = curr[src + 1];
      rgba[dst + 2] = curr[src + 2];
      rgba[dst + 3] = bpp === 4 ? curr[src + 3] : 255;
    }
  }
  return { width, height, rgba };
}

function sliceAndSaveIcon(decoded, sx, sy, w, h, relOut, manifest) {
  if (!decoded) return;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((sy + y) * decoded.width + (sx + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      out[dstIdx] = decoded.rgba[srcIdx];
      out[dstIdx + 1] = decoded.rgba[srcIdx + 1];
      out[dstIdx + 2] = decoded.rgba[srcIdx + 2];
      out[dstIdx + 3] = decoded.rgba[srcIdx + 3];
    }
  }
  const dest = path.join(OUT_DIR, relOut);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, encodePng(w, h, out));
  const key = relOut.replace(/\.png$/i, '');
  manifest.images[key] = { path: `assets/${relOut}`, width: w, height: h };
}

function extractSproutLands(manifest) {
  const zipPath = path.join(ROOT, 'Sprout Lands - Sprites - premium pack.zip');
  if (!fs.existsSync(zipPath)) return;

  const mapFiles = {
    'Sprout Lands - Sprites - premium pack/Objects/Farming Plants.png': 'sprout/farming_plants.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/ground tiles/Old tiles/Tilled_Dirt_Wide_v2.png': 'sprout/tilled_dirt.png',
    'Sprout Lands - Sprites - premium pack/Objects/Items/Farming Plants items.png': 'sprout/farming_items.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Wooden_House_Walls_Tilset.png': 'sprout/house_walls.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Wooden_House_Roof_Tilset.png': 'sprout/house_roof.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/door animation sprites.png': 'sprout/house_door.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Basic_Furniture.png': 'sprout/furniture.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Fences.png': 'sprout/fences.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Fence gates animation sprites .png': 'sprout/fence_gates.png',
    'Sprout Lands - Sprites - premium pack/Objects/Water well.png': 'sprout/water_well.png',
    'Sprout Lands - Sprites - premium pack/Tilesets/Building parts/Mailbox Animation Frames.png': 'sprout/mailbox.png',
    'Sprout Lands - Sprites - premium pack/Objects/Tree animations/tree apple sprites.png': 'sprout/tree_apple.png',
    'Sprout Lands - Sprites - premium pack/Objects/Tree animations/tree orange sprites.png': 'sprout/tree_orange.png',
    'Sprout Lands - Sprites - premium pack/Objects/Tree animations/tree peach sprites.png': 'sprout/tree_peach.png',
    'Sprout Lands - Sprites - premium pack/Objects/Tree animations/tree pear sprites.png': 'sprout/tree_pear.png',
  };

  extractMatching(
    'Sprout Lands - Sprites - premium pack.zip',
    [
      {
        match: (n) => Boolean(mapFiles[n]),
        map: (n) => mapFiles[n],
      },
    ],
    manifest,
  );

  // Slice 14 crop icons from sprout/farming_items.png (col 1, rows 1..14)
  const itemsBuf = fs.readFileSync(path.join(OUT_DIR, 'sprout/farming_items.png'));
  const itemsDec = decodePngRgba(itemsBuf);
  const cropIconNames = [
    'corn',
    'carrot_sl',
    'cauliflower',
    'tomato',
    'eggplant',
    'blue_tulip',
    'cabbage',
    'wheat',
    'pumpkin',
    'radish',
    'pink_rose',
    'beet',
    'starfruit',
    'cucumber',
  ];
  cropIconNames.forEach((name, i) => {
    sliceAndSaveIcon(itemsDec, 16, (i + 1) * 16, 16, 16, `sprout_icons/${name}.png`, manifest);
  });

  // Slice house & furniture icons
  const wallsDec = decodePngRgba(fs.readFileSync(path.join(OUT_DIR, 'sprout/house_walls.png')));
  sliceAndSaveIcon(wallsDec, 16, 0, 16, 16, 'sprout_icons/house_wall.png', manifest);
  sliceAndSaveIcon(wallsDec, 16, 32, 16, 16, 'sprout_icons/house_floor.png', manifest);

  const doorDec = decodePngRgba(fs.readFileSync(path.join(OUT_DIR, 'sprout/house_door.png')));
  sliceAndSaveIcon(doorDec, 0, 0, 16, 16, 'sprout_icons/house_door.png', manifest);

  const furnDec = decodePngRgba(fs.readFileSync(path.join(OUT_DIR, 'sprout/furniture.png')));
  sliceAndSaveIcon(furnDec, 0, 32, 16, 16, 'sprout_icons/bed.png', manifest);
  sliceAndSaveIcon(furnDec, 48, 16, 16, 16, 'sprout_icons/lamp.png', manifest);
  sliceAndSaveIcon(furnDec, 48, 48, 16, 16, 'sprout_icons/table.png', manifest);
  sliceAndSaveIcon(furnDec, 0, 80, 16, 16, 'sprout_icons/rug.png', manifest);

  const gateDec = decodePngRgba(fs.readFileSync(path.join(OUT_DIR, 'sprout/fence_gates.png')));
  sliceAndSaveIcon(gateDec, 0, 0, 16, 16, 'sprout_icons/fence_gate.png', manifest);

  extractFranukaIcons(manifest);
}

function extractFranukaIcons(manifest) {
  const zipPath = path.join(ROOT, 'Fantasy RPG icon pack (by Franuka) (1).zip');
  if (!fs.existsSync(zipPath)) return;
  const zip = new AdmZip(zipPath);

  const base = (n) => `Base set/Individual icons (16x16)/${n}.png`;
  const fish = (n) => `Expansions/02 - Fishing set/Individual icons (16x16)/${n}.png`;

  // Pixel-verified named catalog for Franuka Base set (16x16)
  const FRANUKA_BASE = {
    // Tools & Weapons (R01..R04)
    WOOD_SWORD: 2,
    WOOD_PICKAXE: 8,
    WOOD_HOE: 10,
    IRON_SWORD: 12,
    IRON_BOW: 13,
    IRON_SHOVEL: 17,
    IRON_PICKAXE: 18,
    GOLD_SWORD: 22,
    GOLD_PICKAXE: 28,
    CRYSTAL_SWORD: 340,
    FIRE_SWORD: 342,
    SUN_SWORD: 343,
    IRON_WATERING_CAN: 346,

    // Armor, Accessories, Rods, Potions, Gems (R06..R11)
    FROST_ROBE: 41,
    LEATHER_ARMOR: 43,
    IRON_ARMOR: 53,
    OBSIDIAN_ROBE: 61,
    WOOD_STAFF: 71,
    FIRE_ROD: 72,
    THUNDER_ROD: 73,
    ICE_ROD: 74,
    RUBY_RING: 75,
    AMBER_RING: 76,
    SAPPHIRE_AMULET: 80,
    RED_POTION: 82,
    BLUE_POTION: 85,
    AMBER_GEM: 97,
    DIAMOND_GEM: 100,

    // Bags, Resources, Crops, Ingots (R12..R16)
    MAP: 101,
    TOME: 102,
    BACKPACK: 104,
    WOOD_LOG: 111,
    STONES: 112,
    RAW_MEAT: 113,
    GOLD_EGG: 120,
    CARROT: 121,
    BERRIES: 122,
    SUNFLOWER: 123,
    FISHING_ROD: 127,
    IRON_INGOT: 306,
    GOLD_INGOT: 307,
    COOKED_MEAT: 354,

    // UI Chrome & Status (R17..R26)
    SAVE_FLOPPY: 131,
    GEAR_COG: 132,
    CHECKMARK: 133,
    CLOSE_X: 134,
    HEART_FULL: 139,
    ENERGY_WING: 145,
    SPRINT_BOOT: 164,
    QUEST_SCROLL: 250,
    STAR_XP: 265,
    GOLD_COIN: 271,
    CLOCK: 275,
    COMPASS: 277,
    PAW: 278,
    SPEAKER_ON: 279,
    SPEAKER_MUTE: 281,
    MUSIC_ON: 282,
    MUSIC_OFF: 283,
  };

  // Pixel-verified named catalog for Franuka Fishing Expansion (16x16)
  const FRANUKA_FISHING = {
    BLUE_FISH: 27,
    COOKED_FISH: 31,
    EMBER_KOI: 35,
    FROST_SALMON: 36,
    DUNE_CATFISH: 57,
    GHOST_EEL: 71,
  };

  // Map ui_icons/* (items, weapons, tools, armor, accessories, food, potions)
  const uiIconMap = {
    coin: base(FRANUKA_BASE.GOLD_COIN),
    pickaxe: base(FRANUKA_BASE.WOOD_PICKAXE),
    pickaxe_iron: base(FRANUKA_BASE.IRON_PICKAXE),
    pickaxe_gold: base(FRANUKA_BASE.GOLD_PICKAXE),
    pickaxe_crystal: base(FRANUKA_BASE.GOLD_PICKAXE),
    shovel: base(FRANUKA_BASE.IRON_SHOVEL),
    hoe: base(FRANUKA_BASE.WOOD_HOE),
    watering_can: base(FRANUKA_BASE.IRON_WATERING_CAN),
    fishing_rod: base(FRANUKA_BASE.FISHING_ROD),
    sword: base(FRANUKA_BASE.WOOD_SWORD),
    sword_iron: base(FRANUKA_BASE.IRON_SWORD),
    sword_gold: base(FRANUKA_BASE.SUN_SWORD),
    sword_obsidian: base(FRANUKA_BASE.FIRE_SWORD),
    sword_astral: base(FRANUKA_BASE.CRYSTAL_SWORD),
    bow: base(FRANUKA_BASE.IRON_BOW),
    fire_rod: base(FRANUKA_BASE.FIRE_ROD),
    thunder_rod: base(FRANUKA_BASE.THUNDER_ROD),
    ice_rod: base(FRANUKA_BASE.ICE_ROD),
    necro_rod: base(FRANUKA_BASE.WOOD_STAFF),
    armor_leather: base(FRANUKA_BASE.LEATHER_ARMOR),
    armor_iron: base(FRANUKA_BASE.IRON_ARMOR),
    armor_frost: base(FRANUKA_BASE.FROST_ROBE),
    armor_obsidian: base(FRANUKA_BASE.OBSIDIAN_ROBE),
    ring_copper: base(FRANUKA_BASE.RUBY_RING),
    charm_miner: base(FRANUKA_BASE.AMBER_RING),
    amulet_dragon: base(FRANUKA_BASE.SAPPHIRE_AMULET),
    potion_red: base(FRANUKA_BASE.RED_POTION),
    potion_blue: base(FRANUKA_BASE.BLUE_POTION),
    berries: base(FRANUKA_BASE.BERRIES),
    carrot: base(FRANUKA_BASE.CARROT),
    sunflower: base(FRANUKA_BASE.SUNFLOWER),
    meat: base(FRANUKA_BASE.RAW_MEAT),
    cooked_meat: base(FRANUKA_BASE.COOKED_MEAT),
    amber: base(FRANUKA_BASE.AMBER_GEM),
    fish: fish(FRANUKA_FISHING.BLUE_FISH),
    cooked_fish: fish(FRANUKA_FISHING.COOKED_FISH),
    dune_catfish: fish(FRANUKA_FISHING.DUNE_CATFISH),
    ghost_eel: fish(FRANUKA_FISHING.GHOST_EEL),
    frost_salmon: fish(FRANUKA_FISHING.FROST_SALMON),
    ember_koi: fish(FRANUKA_FISHING.EMBER_KOI),
    iron_ingot: base(FRANUKA_BASE.IRON_INGOT),
    gold_ingot: base(FRANUKA_BASE.GOLD_INGOT),
  };

  // Dedicated HUD chrome icons (hud_icons/*)
  const hudIconMap = {
    menu: base(FRANUKA_BASE.BACKPACK),
    save: base(FRANUKA_BASE.SAVE_FLOPPY),
    music_on: base(FRANUKA_BASE.MUSIC_ON),
    music_off: base(FRANUKA_BASE.MUSIC_OFF),
    sfx_on: base(FRANUKA_BASE.SPEAKER_ON),
    sfx_off: base(FRANUKA_BASE.SPEAKER_MUTE),
    heart: base(FRANUKA_BASE.HEART_FULL),
    energy: base(FRANUKA_BASE.ENERGY_WING),
    xp: base(FRANUKA_BASE.STAR_XP),
    quest: base(FRANUKA_BASE.QUEST_SCROLL),
    craft: base(FRANUKA_BASE.GEAR_COG),
    skills: base(FRANUKA_BASE.TOME),
    map: base(FRANUKA_BASE.MAP),
    compass: base(FRANUKA_BASE.COMPASS),
    dash: base(FRANUKA_BASE.SPRINT_BOOT),
    check: base(FRANUKA_BASE.CHECKMARK),
    close: base(FRANUKA_BASE.CLOSE_X),
    clock: base(FRANUKA_BASE.CLOCK),
    paw: base(FRANUKA_BASE.PAW),
    sword: base(FRANUKA_BASE.IRON_SWORD),
    wood: base(FRANUKA_BASE.WOOD_LOG),
    stone: base(FRANUKA_BASE.STONES),
    gem: base(FRANUKA_BASE.DIAMOND_GEM),
  };

  const writeEntries = (prefix, map, addToManifest) => {
    for (const [key, entryName] of Object.entries(map)) {
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      const data = entry.getData();
      const relOut = `${prefix}/${key}.png`;
      const dest = path.join(OUT_DIR, relOut);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, data);
      if (addToManifest) {
        const { width, height } = readPngDimensions(data);
        manifest.images[`${prefix}/${key}`] = {
          path: `assets/${relOut}`,
          width,
          height,
        };
      }
    }
  };

  writeEntries('ui_icons', uiIconMap, true);
  writeEntries('hud_icons', hudIconMap, false);
}

main();
