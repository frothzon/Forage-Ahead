import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { encodePng } from './pixelArtIcons.mjs';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function savePng(outDir, relOut, w, h, rgba, manifest) {
  const dest = path.join(outDir, relOut);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, encodePng(w, h, rgba));
  if (manifest) {
    const key = relOut.replace(/\.png$/i, '');
    manifest.images[key] = { path: `assets/${relOut}`, width: w, height: h };
  }
}

function cropRgba(decoded, sx, sy, w, h) {
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
  return out;
}

function upscale2xRgba(rgba, w, h) {
  const out = Buffer.alloc(w * 2 * h * 2 * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const d = ((y * 2 + dy) * (w * 2) + (x * 2 + dx)) * 4;
          out[d] = rgba[s];
          out[d + 1] = rgba[s + 1];
          out[d + 2] = rgba[s + 2];
          out[d + 3] = rgba[s + 3];
        }
      }
    }
  }
  return out;
}

function recolorHue(rgba, w, h, targetHue) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < w * h * 4; i += 4) {
    if (out[i + 3] === 0) continue;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (targetHue === 'red') {
      out[i] = Math.min(255, Math.round(140 + lum * 115));
      out[i + 1] = Math.min(255, Math.round(32 + lum * 68));
      out[i + 2] = Math.min(255, Math.round(44 + lum * 64));
    } else if (targetHue === 'blue') {
      out[i] = Math.min(255, Math.round(38 + lum * 72));
      out[i + 1] = Math.min(255, Math.round(108 + lum * 115));
      out[i + 2] = Math.min(255, Math.round(165 + lum * 90));
    }
  }
  return out;
}

function extractRawFile(zip, entryName, outDir, relOut) {
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  const data = entry.getData();
  const dest = path.join(outDir, relOut);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, data);
  return data;
}

function sliceRegion(decoded, sx, sy, w, h, outDir, relOut, manifest) {
  if (!decoded) return;
  const rgba = cropRgba(decoded, sx, sy, w, h);
  savePng(outDir, relOut, w, h, rgba, manifest);
  return rgba;
}

function sliceTightRegion(decoded, sx, sy, w, h, outDir, relOut, manifest) {
  if (!decoded) return;
  const raw = cropRgba(decoded, sx, sy, w, h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (raw[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    savePng(outDir, relOut, w, h, raw, manifest);
    return raw;
  }
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const tight = cropRgba(decoded, sx + minX, sy + minY, tw, th);
  savePng(outDir, relOut, tw, th, tight, manifest);
  return tight;
}

function mirrorRightBorderToLeft(rgba, w, h, cols = 4) {
  const out = Buffer.from(rgba);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < cols; c++) {
      const srcIdx = (y * w + (w - 1 - c)) * 4;
      const dstIdx = (y * w + c) * 4;
      out[dstIdx] = out[srcIdx];
      out[dstIdx + 1] = out[srcIdx + 1];
      out[dstIdx + 2] = out[srcIdx + 2];
      out[dstIdx + 3] = out[srcIdx + 3];
    }
  }
  return out;
}

export function extractSproutLandsUi({ root, outDir, manifest, decodePngRgba, readPngDimensions }) {
  const zipPath = path.join(root, 'Sprout Lands - UI Pack - Premium pack.zip');
  if (!fs.existsSync(zipPath)) return;

  const zip = new AdmZip(zipPath);
  const P = 'Sprout Lands - UI Pack - Premium pack';
  const decCache = new Map();
  const getDec = (rel) => {
    if (decCache.has(rel)) return decCache.get(rel);
    const entry = zip.getEntry(`${P}/${rel}`);
    if (!entry) return null;
    const dec = decodePngRgba(entry.getData());
    decCache.set(rel, dec);
    return dec;
  };

  manifest.uiNineSlices = manifest.uiNineSlices || {};
  manifest.uiSpritesheets = manifest.uiSpritesheets || {};

  // 1. Pixel Fonts (TTF)
  const fontFiles = [
    'pixelFont-1-5x4-sproutLands.ttf',
    'pixelFont-2-5x5-sproutLands.ttf',
    'pixelFont-3-7x5-sproutLands.ttf',
    'pixelFont-4-7x7-sproutLands.ttf',
    'pixelFont-7-8x14-sproutLands.ttf',
  ];
  for (const f of fontFiles) {
    extractRawFile(zip, `${P}/fonts/Font files TTF/${f}`, outDir, `fonts/${f}`);
  }

  // 2. Panels & Settings Menu
  const settingDec = getDec('UI Sprites/Other UI sprites/Setting menu.png');
  sliceRegion(settingDec, 139, 12, 106, 122, outDir, 'sprout_ui/panels/panel_wood_tan.png', manifest);
  sliceRegion(settingDec, 11, 12, 106, 122, outDir, 'sprout_ui/panels/panel_settings_titled.png', manifest);

  // 3. Docks, Heart Tabs & Hearts (Inventory_Spritesheet.png)
  const invDec = getDec('emojis/emoji style ui/Inventory_Spritesheet.png');
  const dockRows = [
    ['sm', 217, 95, 23, 8, 120],
    ['md', 249, 100, 23, 6, 118],
    ['lg', 279, 110, 25, 1, 113],
    ['xl', 307, 110, 29, 1, 113],
  ];
  for (const [sz, y, w, h, lx, dx] of dockRows) {
    sliceRegion(invDec, lx, y, w, h, outDir, `sprout_ui/docks/dock_bar_light_${sz}.png`, manifest);
    sliceRegion(invDec, dx, y, w, h, outDir, `sprout_ui/docks/dock_bar_dark_${sz}.png`, manifest);
  }
  const heartTabRows = [
    ['sm', 89, 95, 23, 8, 120],
    ['md', 121, 100, 23, 6, 118],
    ['lg', 151, 110, 25, 1, 113],
    ['xl', 179, 110, 29, 1, 113],
  ];
  for (const [sz, y, w, h, lx, dx] of heartTabRows) {
    sliceRegion(invDec, lx, y, w, h, outDir, `sprout_ui/docks/heart_tab_light_${sz}.png`, manifest);
    sliceRegion(invDec, dx, y, w, h, outDir, `sprout_ui/docks/heart_tab_dark_${sz}.png`, manifest);
  }

  // Hearts from Inventory_Spritesheet.png
  const heartRowSpecs = [
    ['sm', 2, 15, 14, [0, 16, 32], [112, 128, 144]],
    ['md', 25, 18, 16, [7, 39, 71], [119, 151, 183]],
    ['lg', 54, 23, 20, [4, 36, 68], [116, 148, 180]],
  ];
  const hStates = ['full', 'half', 'empty'];
  for (const [sz, y, w, h, cxs, bxs] of heartRowSpecs) {
    hStates.forEach((st, idx) => {
      sliceRegion(invDec, cxs[idx], y, w, h, outDir, `sprout_ui/vitals/heart_${sz}_cream_${st}.png`, manifest);
      sliceRegion(invDec, bxs[idx], y, w, h, outDir, `sprout_ui/vitals/heart_${sz}_brown_${st}.png`, manifest);
    });
  }

  // 4. Inventory Slots & Enclosed 4-Sided Trays (Inventory_Blocks_Spritesheet.png)
  const blocksDec = getDec('emojis/emoji style ui/Inventory_Blocks_Spritesheet.png');
  const tones3 = ['light', 'med', 'dark'];
  tones3.forEach((tone, i) => {
    sliceTightRegion(blocksDec, 9 + i * 48, 9, 30, 32, outDir, `sprout_ui/slots/slot_oct_${tone}.png`, manifest);
    sliceTightRegion(blocksDec, 9 + i * 48, 57, 30, 32, outDir, `sprout_ui/slots/slot_round_${tone}.png`, manifest);
    sliceTightRegion(blocksDec, 3 + i * 48, 98, 42, 44, outDir, `sprout_ui/slots/slot_large_${tone}.png`, manifest);
    sliceTightRegion(blocksDec, 3 + i * 48, 98, 42, 44, outDir, `sprout_ui/docks/tray_${tone}_enclosed.png`, manifest);
  });

  // 5. Wooden Portrait Backdrops (tight-trimmed, zero transparent pad) & Sticks
  const backdropTones = ['a', 'b', 'c'];
  const backdropCrops = {
    1: [8, 8, 32, 32],
    2: [8, 8, 32, 32],
    3: [10, 10, 28, 28],
    4: [8, 6, 32, 36],
    5: [8, 6, 32, 36],
  };
  for (const t of backdropTones) {
    for (let i = 1; i <= 5; i++) {
      const dec = getDec(`UI Sprites/Dialouge UI/Character Backdrop-frame/backdrops_${t}${i}.png`);
      const [sx, sy, w, h] = backdropCrops[i];
      sliceTightRegion(dec, sx, sy, w, h, outDir, `sprout_ui/frames/backdrop_${t}${i}.png`, manifest);
    }
    const stickData = extractRawFile(
      zip,
      `${P}/UI Sprites/Dialouge UI/Character Backdrop-frame/backdrops_${t}_stick.png`,
      outDir,
      `sprout_ui/frames/backdrop_${t}_stick.png`,
    );
    if (stickData) {
      const { width, height } = readPngDimensions(stickData);
      manifest.images[`sprout_ui/frames/backdrop_${t}_stick`] = {
        path: `assets/sprout_ui/frames/backdrop_${t}_stick.png`,
        width,
        height,
      };
    }
  }
  for (const idx of [1, 2]) {
    const bigDec = getDec(`UI Sprites/Dialouge UI/Character Backdrop-frame/backdrops_big${idx}.png`);
    sliceTightRegion(bigDec, 8, 8, 64, 65, outDir, `sprout_ui/frames/backdrop_big${idx}.png`, manifest);
  }

  // 6. Wide Play / Action Buttons
  const playDec = getDec('UI Sprites/Other UI sprites/UI Big Play Button.png');
  sliceTightRegion(playDec, 3, 2, 90, 27, outDir, 'sprout_ui/buttons/btn_wide_blank_normal.png', manifest);
  sliceTightRegion(playDec, 99, 4, 90, 25, outDir, 'sprout_ui/buttons/btn_wide_blank_pressed.png', manifest);
  sliceTightRegion(playDec, 3, 34, 90, 27, outDir, 'sprout_ui/buttons/btn_wide_play_normal.png', manifest);
  sliceTightRegion(playDec, 99, 36, 90, 25, outDir, 'sprout_ui/buttons/btn_wide_play_pressed.png', manifest);

  // 7. Square & Rectangular Blank Buttons (tight-trimmed, zero transparent pad)
  const sqSmDec = getDec('UI Sprites/buttons/square/Small Square Buttons.png');
  const sqTones = ['white', 'light', 'tan', 'dark'];
  sqTones.forEach((tone, ti) => {
    const rOct = ti * 2;
    const rRnd = ti * 2 + 1;
    sliceTightRegion(sqSmDec, 0, rOct * 16, 16, 16, outDir, `sprout_ui/buttons/sq_sm_${tone}_oct_normal.png`, manifest);
    sliceTightRegion(sqSmDec, 16, rOct * 16, 16, 16, outDir, `sprout_ui/buttons/sq_sm_${tone}_oct_pressed.png`, manifest);
    sliceTightRegion(sqSmDec, 0, rRnd * 16, 16, 16, outDir, `sprout_ui/buttons/sq_sm_${tone}_round_normal.png`, manifest);
    sliceTightRegion(sqSmDec, 16, rRnd * 16, 16, 16, outDir, `sprout_ui/buttons/sq_sm_${tone}_round_pressed.png`, manifest);
  });

  const rectTallDec = getDec('UI Sprites/buttons/square/Square Buttons 19x26.png');
  const rectTallMap = [
    ['white', 0, 0],
    ['tan', 64, 0],
    ['light', 0, 48],
    ['dark', 64, 48],
  ];
  for (const [tone, bx, by] of rectTallMap) {
    sliceTightRegion(rectTallDec, bx + 6, by + 10, 19, 28, outDir, `sprout_ui/buttons/rect_tall_${tone}_normal.png`, manifest);
    sliceTightRegion(rectTallDec, bx + 38, by + 11, 19, 26, outDir, `sprout_ui/buttons/rect_tall_${tone}_pressed.png`, manifest);
  }

  const rectWideDec = getDec('UI Sprites/buttons/square/Square Buttons 26x19.png');
  sqTones.forEach((tone, ti) => {
    sliceTightRegion(rectWideDec, 11, ti * 32 + 5, 26, 21, outDir, `sprout_ui/buttons/rect_wide_${tone}_normal.png`, manifest);
    sliceTightRegion(rectWideDec, 59, ti * 32 + 6, 26, 19, outDir, `sprout_ui/buttons/rect_wide_${tone}_pressed.png`, manifest);
  });

  const sqLgDec = getDec('UI Sprites/buttons/square/Square Buttons 26x26.png');
  sqTones.forEach((tone, ti) => {
    sliceTightRegion(sqLgDec, 11, ti * 48 + 11, 26, 28, outDir, `sprout_ui/buttons/sq_lg_${tone}_normal.png`, manifest);
    sliceTightRegion(sqLgDec, 59, ti * 48 + 12, 26, 26, outDir, `sprout_ui/buttons/sq_lg_${tone}_pressed.png`, manifest);
  });

  // 8. Colored Round Buttons (medium 32x32, small 16x16)
  const roundColors = [
    'white', 'cream', 'tan', 'brown', 'indigo', 'blue',
    'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink',
  ];
  const rndMdDec = getDec('UI Sprites/buttons/round/medium colored round buttons.png');
  const rndSmDec = getDec('UI Sprites/buttons/round/small colored round buttons.png');
  roundColors.forEach((col, r) => {
    sliceRegion(rndMdDec, 0, r * 32, 32, 32, outDir, `sprout_ui/buttons/round_md_${col}_normal.png`, manifest);
    sliceRegion(rndMdDec, 32, r * 32, 32, 32, outDir, `sprout_ui/buttons/round_md_${col}_hover.png`, manifest);
    sliceRegion(rndMdDec, 64, r * 32, 32, 32, outDir, `sprout_ui/buttons/round_md_${col}_pressed.png`, manifest);
    sliceRegion(rndSmDec, 0, r * 16, 16, 16, outDir, `sprout_ui/buttons/round_sm_${col}_normal.png`, manifest);
    sliceRegion(rndSmDec, 16, r * 16, 16, 16, outDir, `sprout_ui/buttons/round_sm_${col}_pressed.png`, manifest);
  });

  // 9. Icon Buttons Spritesheet (6 cols x 15 rows of 32x32)
  const icBtnDec = getDec('UI Sprites/buttons/Icon Buttons/Icon Buttons Spritesheet.png');
  const icBtnNames = [
    ['ic_btn_blank_sm', 'ic_btn_check_sm', 'ic_btn_close_sm'],
    ['ic_btn_arrow_down', 'ic_btn_arrow_up', 'ic_btn_arrow_right_sm'],
    ['ic_btn_arrow_left_sm', 'ic_btn_pause', 'ic_btn_play'],
    ['ic_btn_blank', 'ic_btn_fast_forward', 'ic_btn_plus'],
    ['ic_btn_settings_gear', 'ic_btn_help_question', 'ic_btn_minus'],
    ['ic_btn_alert_exclaim', 'ic_btn_heart', 'ic_btn_home'],
    ['ic_btn_leaderboard', 'ic_btn_star', 'ic_btn_login_enter'],
    ['ic_btn_trophy', 'ic_btn_gamepad', 'ic_btn_power'],
    ['ic_btn_crown', 'ic_btn_chat_dots', 'ic_btn_logout_exit'],
    ['ic_btn_check', 'ic_btn_skull', 'ic_btn_music_double'],
    ['ic_btn_close', 'ic_btn_cart', 'ic_btn_music_off'],
    ['ic_btn_ban_cancel', 'ic_btn_dollar_coin', 'ic_btn_paw'],
    ['ic_btn_sprout_1', 'ic_btn_music_single', 'ic_btn_music_single_off'],
    ['ic_btn_sprout_2', 'ic_btn_sfx_off', 'ic_btn_vol_down'],
    ['ic_btn_sfx_on', 'ic_btn_slash', 'ic_btn_vol_up'],
  ];
  icBtnNames.forEach((rowNames, r) => {
    rowNames.forEach((name, g) => {
      sliceTightRegion(icBtnDec, g * 64, r * 32, 32, 32, outDir, `sprout_ui/buttons/${name}_normal.png`, manifest);
      sliceTightRegion(icBtnDec, g * 64 + 32, r * 32, 32, 32, outDir, `sprout_ui/buttons/${name}_pressed.png`, manifest);
    });
  });

  // 10. Dialogue Boxes, Tails, Premades & Continue Indicator
  const dlgMini = getDec('UI Sprites/Dialouge UI/dialog box.png');
  const dlgSm = getDec('UI Sprites/Dialouge UI/dialog box small.png');
  const dlgMd = getDec('UI Sprites/Dialouge UI/dialog box medium.png');
  const dlgBig = getDec('UI Sprites/Dialouge UI/dialog box big.png');
  sliceRegion(dlgMini, 7, 11, 30, 28, outDir, 'sprout_ui/dialogue/dialog_box_mini.png', manifest);
  sliceRegion(dlgSm, 2, 7, 108, 35, outDir, 'sprout_ui/dialogue/dialog_box_small.png', manifest);
  sliceRegion(dlgMd, 2, 7, 124, 35, outDir, 'sprout_ui/dialogue/dialog_box_medium.png', manifest);
  sliceRegion(dlgBig, 2, 7, 172, 35, outDir, 'sprout_ui/dialogue/dialog_box_big.png', manifest);
  // Clean 4-sided tail-free 9-sliceable dialog frame (left border repaired by mirroring right border)
  if (dlgBig) {
    const rawFrame = cropRgba(dlgBig, 6, 7, 168, 35);
    const repaired = mirrorRightBorderToLeft(rawFrame, 168, 35, 4);
    savePng(outDir, 'sprout_ui/dialogue/dialog_box_frame.png', 168, 35, repaired, manifest);
  }
  sliceRegion(dlgBig, 2, 20, 7, 12, outDir, 'sprout_ui/dialogue/dialog_tail_left.png', manifest);

  const preSm = getDec('UI Sprites/Dialouge UI/Premade dialog box small.png');
  const preMd = getDec('UI Sprites/Dialouge UI/Premade dialog box medium.png');
  const preBig = getDec('UI Sprites/Dialouge UI/Premade dialog box  big.png');
  sliceRegion(preSm, 3, 2, 170, 60, outDir, 'sprout_ui/dialogue/premade_dialog_small.png', manifest);
  sliceRegion(preMd, 3, 2, 234, 60, outDir, 'sprout_ui/dialogue/premade_dialog_medium.png', manifest);
  sliceRegion(preBig, 3, 2, 298, 60, outDir, 'sprout_ui/dialogue/premade_dialog_big.png', manifest);

  const contData = extractRawFile(
    zip,
    `${P}/UI Sprites/Dialouge UI/dialog box character finished talking click to continue indicator - spritesheet .png`,
    outDir,
    'sprout_ui/dialogue/continue_indicator.png',
  );
  if (contData) {
    const { width, height } = readPngDimensions(contData);
    manifest.images['sprout_ui/dialogue/continue_indicator'] = {
      path: 'assets/sprout_ui/dialogue/continue_indicator.png',
      width,
      height,
    };
    manifest.uiSpritesheets['sprout_ui/dialogue/continue_indicator'] = {
      key: 'sprout_ui/dialogue/continue_indicator',
      frameWidth: 16,
      frameHeight: 16,
      frames: 7,
    };
  }

  // Speech bubbles (6 colors)
  for (const col of ['blue', 'green', 'grey', 'pink', 'purple', 'yellow']) {
    const sbData = extractRawFile(
      zip,
      `${P}/emojis/speech_bubble_${col}.png`,
      outDir,
      `sprout_ui/dialogue/speech_bubble_${col}.png`,
    );
    if (sbData) {
      const dec = decodePngRgba(sbData);
      sliceRegion(dec, 12, 11, 41, 45, outDir, `sprout_ui/dialogue/speech_bubble_${col}_static.png`, manifest);
    }
  }

  // Tiny emotes & Teemo basic emotes
  const tinyData = extractRawFile(zip, `${P}/emojis/tiny emotes.png`, outDir, 'sprout_ui/emotes/tiny_emotes.png');
  if (tinyData) {
    const dec = decodePngRgba(tinyData);
    ['very_happy', 'happy', 'neutral', 'sad', 'angry', 'crying', 'skull'].forEach((n, idx) => {
      sliceRegion(dec, idx * 16, 0, 16, 16, outDir, `sprout_ui/emotes/tiny_${n}.png`, manifest);
    });
  }

  // 11. Sliders & Toggles & Progress Bars
  for (let i = 1; i <= 6; i++) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/Sliders/slider_a_${i}.png`, outDir, `sprout_ui/controls/slider_a_${i}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[`sprout_ui/controls/slider_a_${i}`] = { path: `assets/sprout_ui/controls/slider_a_${i}.png`, width, height };
    }
  }
  for (const part of ['start', 'mid', 'end', 'start2', 'mid2', 'end2']) {
    for (const grp of ['a', 'b']) {
      const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/Sliders/slider_${grp}_${part}.png`, outDir, `sprout_ui/controls/slider_${grp}_${part}.png`);
      if (d) {
        const { width, height } = readPngDimensions(d);
        manifest.images[`sprout_ui/controls/slider_${grp}_${part}`] = { path: `assets/sprout_ui/controls/slider_${grp}_${part}.png`, width, height };
      }
    }
  }
  for (let i = 1; i <= 3; i++) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/Sliders/slider_b_${i}.png`, outDir, `sprout_ui/controls/slider_b_${i}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[`sprout_ui/controls/slider_b_${i}`] = { path: `assets/sprout_ui/controls/slider_b_${i}.png`, width, height };
    }
  }

  // Tight zero-padding scrollbar & slider pieces from Sliders.png
  const slidersSheetDec = getDec('UI Sprites/Other UI sprites/Sliders/Sliders.png');
  sliceRegion(slidersSheetDec, 84, 4, 7, 40, outDir, 'sprout_ui/controls/scrollbar_v_track_thick.png', manifest);
  sliceRegion(slidersSheetDec, 182, 5, 4, 38, outDir, 'sprout_ui/controls/scrollbar_v_track_slim.png', manifest);
  sliceRegion(slidersSheetDec, 35, 3, 11, 21, outDir, 'sprout_ui/controls/scrollbar_v_thumb_dark.png', manifest);
  sliceRegion(slidersSheetDec, 51, 3, 11, 21, outDir, 'sprout_ui/controls/scrollbar_v_thumb_med.png', manifest);
  sliceRegion(slidersSheetDec, 67, 3, 11, 21, outDir, 'sprout_ui/controls/scrollbar_v_thumb_light.png', manifest);
  sliceRegion(slidersSheetDec, 133, 5, 7, 18, outDir, 'sprout_ui/controls/scrollbar_v_thumb_slim_dark.png', manifest);
  sliceRegion(slidersSheetDec, 149, 5, 7, 18, outDir, 'sprout_ui/controls/scrollbar_v_thumb_slim_med.png', manifest);
  sliceRegion(slidersSheetDec, 165, 5, 7, 18, outDir, 'sprout_ui/controls/scrollbar_v_thumb_slim_light.png', manifest);
  sliceRegion(slidersSheetDec, 36, 36, 40, 7, outDir, 'sprout_ui/controls/slider_h_track_thick.png', manifest);
  sliceRegion(slidersSheetDec, 6, 1, 20, 12, outDir, 'sprout_ui/controls/slider_h_thumb_light.png', manifest);
  sliceRegion(slidersSheetDec, 6, 17, 20, 12, outDir, 'sprout_ui/controls/slider_h_thumb_med.png', manifest);
  sliceRegion(slidersSheetDec, 6, 33, 20, 12, outDir, 'sprout_ui/controls/slider_h_thumb_dark.png', manifest);

  // Master sheet unique regions
  const masterDec = getDec('UI Sprites/ALL UI ASSETS on one sheet.png');
  // HUD frames & coin plates
  sliceRegion(masterDec, 724, 432, 71, 32, outDir, 'sprout_ui/frames/hud_heart_plate_3.png', manifest);
  sliceRegion(masterDec, 821, 453, 71, 54, outDir, 'sprout_ui/frames/hud_sign_hanging_blank.png', manifest);
  sliceRegion(masterDec, 821, 517, 71, 54, outDir, 'sprout_ui/frames/hud_sign_hanging_hearts.png', manifest);
  sliceRegion(masterDec, 776, 483, 35, 41, outDir, 'sprout_ui/frames/hud_sign_hanging_sm.png', manifest);
  sliceRegion(masterDec, 727, 471, 34, 17, outDir, 'sprout_ui/frames/coin_plate_100.png', manifest);
  sliceRegion(masterDec, 727, 503, 34, 17, outDir, 'sprout_ui/frames/coin_plate_sm.png', manifest);
  sliceRegion(masterDec, 723, 535, 41, 17, outDir, 'sprout_ui/frames/coin_plate_md.png', manifest);

  // Progress / Health bars + recolored fills
  sliceRegion(masterDec, 534, 258, 99, 13, outDir, 'sprout_ui/bars/bar_frame_green_lg.png', manifest);
  sliceRegion(masterDec, 534, 273, 99, 13, outDir, 'sprout_ui/bars/bar_frame_empty_lg.png', manifest);
  sliceRegion(masterDec, 534, 289, 35, 13, outDir, 'sprout_ui/bars/bar_frame_empty_sm.png', manifest);
  const greenFill = sliceRegion(masterDec, 584, 291, 30, 8, outDir, 'sprout_ui/bars/bar_fill_green.png', manifest);
  if (greenFill) {
    savePng(outDir, 'sprout_ui/bars/bar_fill_red.png', 30, 8, recolorHue(greenFill, 30, 8, 'red'), manifest);
    savePng(outDir, 'sprout_ui/bars/bar_fill_blue.png', 30, 8, recolorHue(greenFill, 30, 8, 'blue'), manifest);
  }
  sliceRegion(masterDec, 576, 565, 112, 7, outDir, 'sprout_ui/bars/bar_segmented_blue.png', manifest);
  sliceRegion(masterDec, 576, 581, 112, 7, outDir, 'sprout_ui/bars/bar_segmented_green.png', manifest);
  sliceRegion(masterDec, 576, 597, 112, 7, outDir, 'sprout_ui/bars/bar_segmented_red.png', manifest);

  // Toggle switches
  const toggleColors = ['brown', 'green', 'red'];
  toggleColors.forEach((tc, ci) => {
    const x = 658 + ci * 32;
    sliceRegion(masterDec, x, 73, 28, 14, outDir, `sprout_ui/controls/toggle_track_${tc}_raised.png`, manifest);
    sliceRegion(masterDec, x, 105, 28, 14, outDir, `sprout_ui/controls/toggle_track_${tc}_flat.png`, manifest);
    for (let st = 1; st <= 6; st++) {
      sliceRegion(masterDec, x, 135 + (st - 1) * 32, 28, 18, outDir, `sprout_ui/controls/toggle_${tc}_state_${st}.png`, manifest);
    }
  });

  // Stamina circles (spritesheets)
  for (const [fname, key] of [
    ['Stamina circle with black outline sprite sheet .png', 'sprout_ui/bars/stamina_circle_black'],
    ['Stamina circle with white outline sprite sheet .png', 'sprout_ui/bars/stamina_circle_white'],
  ]) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/${fname}`, outDir, `${key.replace('sprout_ui/', 'sprout_ui/')}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[key] = { path: `assets/${key}.png`, width, height };
      manifest.uiSpritesheets[key] = { key, frameWidth: 16, frameHeight: 16, frames: 37 };
    }
  }

  // 12. Corner Selectors & Dots
  const cornerNames = { 1: 'tl', 2: 'tr', 3: 'bl', 4: 'br' };
  for (const series of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (let i = 1; i <= 4; i++) {
      const d = extractRawFile(
        zip,
        `${P}/UI Sprites/Other UI sprites/Selectors/selectorst_${series}${i}.png`,
        outDir,
        `sprout_ui/selectors/selector_${series}_${cornerNames[i]}.png`,
      );
      if (d) {
        const { width, height } = readPngDimensions(d);
        manifest.images[`sprout_ui/selectors/selector_${series}_${cornerNames[i]}`] = {
          path: `assets/sprout_ui/selectors/selector_${series}_${cornerNames[i]}.png`,
          width,
          height,
        };
      }
    }
  }
  for (let i = 1; i <= 6; i++) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/Selectors/dot_${i}.png`, outDir, `sprout_ui/selectors/dot_${i}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[`sprout_ui/selectors/dot_${i}`] = { path: `assets/sprout_ui/selectors/dot_${i}.png`, width, height };
    }
  }

  // 13. Mouse Cursors (1x + 2x for CSS cursor: url(...))
  const cursorMap = {
    cursor_arrow_1: 'Arrow Mouse icon 1.png',
    cursor_arrow_2: 'Arrow Mouse icon 2.png',
    cursor_arrow_3: 'Arrow Mouse icon 3.png',
    cursor_catpaw: 'Catpaw Mouse icon.png',
    cursor_catpaw_holding: 'Catpaw holding Mouse icon.png',
    cursor_catpaw_pointing: 'Catpaw pointing Mouse icon.png',
    cursor_triangle_1: 'Triangle Mouse icon 1.png',
    cursor_triangle_2: 'Triangle Mouse icon 2.png',
    cursor_triangle_3: 'Triangle Mouse icon 3.png',
  };
  for (const [outKey, srcName] of Object.entries(cursorMap)) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Mouse sprites/${srcName}`, outDir, `sprout_ui/cursors/${outKey}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[`sprout_ui/cursors/${outKey}`] = { path: `assets/sprout_ui/cursors/${outKey}.png`, width, height };
      const dec = decodePngRgba(d);
      if (dec) {
        const up = upscale2xRgba(dec.rgba, dec.width, dec.height);
        savePng(outDir, `sprout_ui/cursors/${outKey}_2x.png`, dec.width * 2, dec.height * 2, up, manifest);
      }
    }
  }

  // 14. Checkmarks & Crosses
  const markMap = {
    check_sm_light_normal: 'small check mark.png',
    check_sm_light_pressed: 'small check mark pressed.png',
    check_md_light_normal: 'check mark.png',
    check_md_light_pressed: 'check mark pressed.png',
    check_lg_light_normal: 'big check mark.png',
    check_lg_light_pressed: 'big check mark pressed.png',
    check_sm_dark_normal: 'darker small check mark.png',
    check_sm_dark_pressed: 'darker small check mark pr.png',
    check_md_dark_normal: 'darker check mark.png',
    check_md_dark_pressed: 'darker check mark pressed.png',
    check_lg_dark_normal: 'darker big check mark.png',
    check_lg_dark_pressed: 'darker big check mark pres.png',
    x_sm_light_normal: 'small X.png',
    x_sm_light_pressed: 'small X pressed.png',
    x_md_light_normal: 'X.png',
    x_md_light_pressed: 'X pressed.png',
    x_lg_light_normal: 'big X.png',
    x_lg_light_pressed: 'big X pressed.png',
    x_sm_dark_normal: 'darker small X.png',
    x_sm_dark_pressed: 'darker small X pressed.png',
    x_md_dark_normal: 'darker X.png',
    x_md_dark_pressed: 'darker X prssed.png',
    x_lg_dark_normal: 'darker big X.png',
    x_lg_dark_pressed: 'darker big X pressed.png',
  };
  for (const [outKey, srcName] of Object.entries(markMap)) {
    const d = extractRawFile(zip, `${P}/UI Sprites/Other UI sprites/Xs and check marks/1s/${srcName}`, outDir, `sprout_ui/marks/${outKey}.png`);
    if (d) {
      const { width, height } = readPngDimensions(d);
      manifest.images[`sprout_ui/marks/${outKey}`] = { path: `assets/sprout_ui/marks/${outKey}.png`, width, height };
    }
  }

  // 15. Core UI Glyphs (All Icons.png & white icons.png)
  const allIconsDec = getDec('UI Sprites/Icons/All Icons.png');
  const whiteIconsDec = getDec('UI Sprites/Icons/white icons.png');
  const glyphGrid = [
    ['gear', 'question', 'star', null],
    ['podium', 'trophy', 'crown', 'slash'],
    ['check', 'close_x', 'ban', 'music_double'],
    ['fast_forward', 'play', 'pause', 'music_double_off'],
    ['heart', 'sprout_1', 'sprout_2', 'music_single'],
    ['gamepad', 'chat_bubble', 'skull', 'music_single_off'],
    ['exclaim', 'dollar', 'cart', 'sfx_on'],
    ['plus', 'minus', 'home', 'sfx_off'],
    ['power', 'login', 'logout', 'vol_down'],
    [null, null, 'paw', 'vol_up'],
  ];
  const iconBlocks = [
    ['dark_brown', 12, 0, allIconsDec],
    ['green_outline', 0, 10, allIconsDec],
    ['brown_outline_tan', 8, 10, allIconsDec],
    ['brown_outline_dark', 12, 10, allIconsDec],
    ['pure_white', 0, 0, whiteIconsDec],
  ];
  for (const [style, colOff, rowOff, dec] of iconBlocks) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 4; c++) {
        const gName = glyphGrid[r][c];
        if (!gName) continue;
        sliceRegion(dec, (colOff + c) * 16, (rowOff + r) * 16, 16, 16, outDir, `sprout_ui/icons/${style}/${gName}.png`, manifest);
      }
    }
  }

  // 16. Special Vitals: Hearts in wood, Stars in wood, Coins
  const hiwDec = getDec('UI Sprites/Icons/special icons/Hearts in wood.png');
  ['full', 'half', 'empty'].forEach((st, i) => {
    sliceRegion(hiwDec, i * 32, 0, 32, 32, outDir, `sprout_ui/vitals/heart_wood_${st}.png`, manifest);
    sliceRegion(hiwDec, i * 32, 32, 32, 32, outDir, `sprout_ui/vitals/heart_wood_spark_${st}.png`, manifest);
  });
  const siwDec = getDec('UI Sprites/Icons/special icons/stars in wood.png');
  sliceRegion(siwDec, 0, 0, 32, 32, outDir, 'sprout_ui/vitals/star_wood_full.png', manifest);
  sliceRegion(siwDec, 32, 0, 32, 32, outDir, 'sprout_ui/vitals/star_wood_empty.png', manifest);

  const coinsDec = getDec('UI Sprites/Icons/special icons/coins.png');
  ['1', '2', 'outline', 'shadow'].forEach((v, i) => {
    sliceRegion(coinsDec, i * 16, 0, 16, 16, outDir, `sprout_ui/vitals/coin_sm_${v}.png`, manifest);
    sliceRegion(coinsDec, i * 32, 16, 32, 32, outDir, `sprout_ui/vitals/coin_lg_${v}.png`, manifest);
  });

  // 17. Moods (Small & Medium Happiness-Sadness)
  const moodNames = ['ecstatic', 'happy', 'neutral', 'sad', 'upset', 'skull'];
  const moodSmDec = getDec('UI Sprites/Icons/special icons/Small Happines-Sadness icons.png');
  const moodMdDec = getDec('UI Sprites/Icons/special icons/Medium Happines-Sadness icons.png');
  moodNames.forEach((m, c) => {
    for (let r = 0; r < 2; r++) {
      sliceRegion(moodSmDec, c * 16, r * 16, 16, 16, outDir, `sprout_ui/moods/mood_sm_r${r}_${m}.png`, manifest);
    }
    for (let r = 0; r < 6; r++) {
      sliceRegion(moodMdDec, c * 16, r * 16, 16, 16, outDir, `sprout_ui/moods/mood_md_r${r}_${m}.png`, manifest);
    }
  });

  // 18. Weather HUD & Icons
  const wUiDec = getDec('emojis/emoji style ui/weather/Weather_UI.png');
  sliceRegion(wUiDec, 7, 7, 98, 99, outDir, 'sprout_ui/weather/weather_hud_full.png', manifest);
  sliceRegion(wUiDec, 119, 7, 92, 50, outDir, 'sprout_ui/weather/weather_hud_top_frame.png', manifest);
  sliceRegion(wUiDec, 231, 7, 92, 73, outDir, 'sprout_ui/weather/weather_hud_with_banner.png', manifest);
  sliceRegion(wUiDec, 359, 7, 64, 33, outDir, 'sprout_ui/weather/weather_hud_compact.png', manifest);
  sliceRegion(wUiDec, 358, 55, 65, 54, outDir, 'sprout_ui/weather/weather_hud_compact_hanging.png', manifest);
  sliceRegion(wUiDec, 263, 100, 51, 24, outDir, 'sprout_ui/weather/weather_time_banner_wide.png', manifest);
  sliceRegion(wUiDec, 264, 135, 48, 19, outDir, 'sprout_ui/weather/weather_time_banner_slim.png', manifest);
  sliceRegion(wUiDec, 67, 103, 22, 34, outDir, 'sprout_ui/weather/weather_dial_day_night_lg.png', manifest);
  sliceRegion(wUiDec, 369, 119, 13, 17, outDir, 'sprout_ui/weather/weather_dial_day_night_sm.png', manifest);

  const wSmDec = getDec('emojis/emoji style ui/weather/Weather_Icons_small.png');
  const wSmGrid = [
    ['day_sunny', 'day_partly_cloudy', 'day_rainbow', 'day_rain', 'day_snow', 'day_blizzard', 'day_wind_tornado'],
    ['night_clear', 'night_cloudy', 'night_rain', 'night_storm', 'overcast_day', 'overcast_dusk', 'overcast_night'],
    ['dusk_clear', 'dusk_cloudy', 'dusk_rain', 'dusk_hot_sun', null, null, null],
  ];
  wSmGrid.forEach((row, r) => {
    row.forEach((name, c) => {
      if (!name) return;
      sliceRegion(wSmDec, c * 32, r * 32, 32, 32, outDir, `sprout_ui/weather/icon_sm_${name}.png`, manifest);
    });
  });

  // 19. Register 9-Slice Definitions in Manifest (verified tight zero-pad dimensions)
  const nineSlices = {
    panel_wood: { key: 'sprout_ui/panels/panel_wood_tan', top: 4, right: 4, bottom: 8, left: 4 },
    dock_light: { key: 'sprout_ui/docks/tray_light_enclosed', top: 5, right: 5, bottom: 7, left: 5 },
    dock_dark: { key: 'sprout_ui/docks/tray_dark_enclosed', top: 5, right: 5, bottom: 7, left: 5 },
    tray_light_enclosed: { key: 'sprout_ui/docks/tray_light_enclosed', top: 5, right: 5, bottom: 7, left: 5 },
    tray_med_enclosed: { key: 'sprout_ui/docks/tray_med_enclosed', top: 5, right: 5, bottom: 7, left: 5 },
    tray_dark_enclosed: { key: 'sprout_ui/docks/tray_dark_enclosed', top: 5, right: 5, bottom: 7, left: 5 },
    slot_oct_light: { key: 'sprout_ui/slots/slot_oct_light', top: 8, right: 8, bottom: 9, left: 8 },
    slot_oct_med: { key: 'sprout_ui/slots/slot_oct_med', top: 8, right: 8, bottom: 9, left: 8 },
    slot_oct_dark: { key: 'sprout_ui/slots/slot_oct_dark', top: 8, right: 8, bottom: 9, left: 8 },
    slot_round_light: { key: 'sprout_ui/slots/slot_round_light', top: 5, right: 5, bottom: 7, left: 5 },
    slot_round_med: { key: 'sprout_ui/slots/slot_round_med', top: 5, right: 5, bottom: 7, left: 5 },
    btn_wide_normal: { key: 'sprout_ui/buttons/btn_wide_blank_normal', top: 4, right: 4, bottom: 6, left: 4 },
    btn_wide_pressed: { key: 'sprout_ui/buttons/btn_wide_blank_pressed', top: 4, right: 4, bottom: 4, left: 4 },
    btn_rect_light_normal: { key: 'sprout_ui/buttons/rect_wide_light_normal', top: 4, right: 4, bottom: 6, left: 4 },
    btn_rect_light_pressed: { key: 'sprout_ui/buttons/rect_wide_light_pressed', top: 3, right: 4, bottom: 4, left: 4 },
    btn_rect_tan_normal: { key: 'sprout_ui/buttons/rect_wide_tan_normal', top: 4, right: 4, bottom: 6, left: 4 },
    btn_rect_tan_pressed: { key: 'sprout_ui/buttons/rect_wide_tan_pressed', top: 3, right: 4, bottom: 4, left: 4 },
    btn_rect_dark_normal: { key: 'sprout_ui/buttons/rect_wide_dark_normal', top: 4, right: 4, bottom: 6, left: 4 },
    btn_rect_dark_pressed: { key: 'sprout_ui/buttons/rect_wide_dark_pressed', top: 3, right: 4, bottom: 4, left: 4 },
    btn_rect_white_normal: { key: 'sprout_ui/buttons/rect_wide_white_normal', top: 4, right: 4, bottom: 6, left: 4 },
    btn_rect_white_pressed: { key: 'sprout_ui/buttons/rect_wide_white_pressed', top: 3, right: 4, bottom: 4, left: 4 },
    frame_wood_a1: { key: 'sprout_ui/frames/backdrop_a1', top: 7, right: 7, bottom: 7, left: 7 },
    frame_wood_a3: { key: 'sprout_ui/frames/backdrop_a3', top: 5, right: 5, bottom: 5, left: 5 },
    frame_wood_a4: { key: 'sprout_ui/frames/backdrop_a4', top: 7, right: 7, bottom: 7, left: 7 },
    frame_wood_b1: { key: 'sprout_ui/frames/backdrop_b1', top: 7, right: 7, bottom: 7, left: 7 },
    frame_wood_b3: { key: 'sprout_ui/frames/backdrop_b3', top: 5, right: 5, bottom: 5, left: 5 },
    frame_wood_c1: { key: 'sprout_ui/frames/backdrop_c1', top: 7, right: 7, bottom: 7, left: 7 },
    frame_wood_c4: { key: 'sprout_ui/frames/backdrop_c4', top: 7, right: 7, bottom: 7, left: 7 },
    frame_wood_big1: { key: 'sprout_ui/frames/backdrop_big1', top: 19, right: 19, bottom: 19, left: 19 },
    frame_wood_big2: { key: 'sprout_ui/frames/backdrop_big2', top: 19, right: 19, bottom: 19, left: 19 },
    dialog_frame: { key: 'sprout_ui/dialogue/dialog_box_frame', top: 4, right: 4, bottom: 6, left: 4 },
    bar_track: { key: 'sprout_ui/bars/bar_frame_empty_lg', top: 3, right: 4, bottom: 3, left: 4 },
  };
  Object.assign(manifest.uiNineSlices, nineSlices);
}
