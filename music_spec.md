# Forage Ahead — Music Specification (`music_spec.md`)

This document defines the full soundtrack requirements for **Forage Ahead** (Steam release). Every track is designed around the game's actual world structure: 5 overworld biomes across 25 islands, a Day/Night & Weather cycle, 4 story dungeons, and the 20-floor Void Spire endgame.

---

## 1. Technical & Delivery Standards (Steam PC)

| Parameter | Target | Notes |
|---|---|---|
| **Delivery Format** | `.ogg` (Vorbis, Quality 7–8 / ~224–256 kbps) | Primary runtime format for Electron/Chromium & Web Audio. Keep `.wav` (48 kHz / 24-bit) masters for archiving. |
| **Sample Rate** | 48 kHz, Stereo | Standard for PC/Steam. |
| **Loudness** | **-16 LUFS** integrated (±1 LU), **-1.0 dBTP** true peak | Leaves dynamic headroom for combat/foraging SFX without ducking everything. |
| **Looping** | Seamless loopable files | Either bake reverb tails into the loop start, or provide `intro` + `loop` stems if a track has a non-looping pickup. |
| **Target Length** | Overworld: `1:45–2:30` • Dungeons: `1:30–2:15` • Bosses: `1:30–2:00` | Long enough to avoid listener fatigue during extended foraging/crafting sessions. |
| **Naming Convention** | `mus_<category>_<name>.ogg` | Lowercase snake_case (e.g., `mus_overworld_grass.ogg`, `mus_dungeon_skull_crypt.ogg`). |

---

## 2. Title & Menu

### `mus_title_theme.ogg` — *"Horizons Uncharted"*
- **Where it plays:** `TitleScene` (Hero Class selection: Beastmaster, Gladiator, Sorcerer, Swashbuckler) over the shimmering ocean backdrop.
- **Mood & Vibe:** Inviting, adventurous, slightly mysterious—evoking a shipwrecked castaway looking out at an archipelago of possibilities.
- **Instrumentation:** Acoustic nylon/steel guitar arpeggios, warm Celtic/folk flute or ocarina melody, soft ocean-swell strings/pads, light bodhrán or brushed snare pulse.
- **Tempo / Key:** ~92–100 BPM, Major / Mixolydian (bright with a hint of wonder).
- **Looping:** Smooth, gentle swell; avoid jarring downbeat hits at bar 1.

---

## 3. Overworld Biomes (5 Biomes)

In `OverworldScene`, the player seamlessly walks/bridges between 25 islands across 5 biomes (`grass`, `autumn`, `graveyard`, `winter`, `infernal`). Tracks will **crossfade (1.5–2.0s)** when the player enters a new biome.

> **Optional Polish (Day/Night):** Overworld tracks work best when kept moderately relaxed so they fit both Day and Night, *or* you can optionally provide a sparser `*_night.ogg` variation (or solo acoustic stem) for Night (`timeOfDay` 0.78–1.00).

### 3.1 `mus_overworld_grass.ogg` — *"Emerald Origin"*
- **Islands:** Emerald Origin (starter), Meadow Homestead, Whispering Woods, Angler's Pier, Clover Cove, Seabreeze Atoll.
- **Mood & Vibe:** Cozy, breezy, pastoral, optimistic. This is the player's home base where they chop, mine, fish, farm, and build.
- **Instrumentation:** Fingerpicked acoustic guitar or lute, light marimba/kalimba plucks, airy tin whistle / pan flute, warm upright bass, subtle tambourine/shaker.
- **Tempo / Key:** ~104–112 BPM, G Major or C Major.
- **Notes:** Must remain pleasant after 30+ minutes of base-building and crafting. Avoid overly repetitive 2-bar ostinatos.

### 3.2 `mus_overworld_autumn.ogg` — *"Amber Steppe & Sunbleached Dunes"*
- **Islands:** Amber Steppe, Sunbleached Dunes, Dune Mirage, Golden Canyon, Sunken Tomb Isle.
- **Mood & Vibe:** Sun-baked, rhythmic, adventurous, slightly exotic—blending golden harvest steppes with desert ruins.
- **Instrumentation:** Oud or steel-string acoustic guitar, frame drum / darbuka / djembe groove, duduk or warm oboe/flute lead, subtle shimmer pad, muted brass swells.
- **Tempo / Key:** ~108–116 BPM, D Dorian or Phrygian Dominant (light, not overly aggressive).
- **Notes:** Needs forward momentum for exploring and fighting Mummies/Anubis Warriors without sounding like a boss fight.

### 3.3 `mus_overworld_graveyard.ogg` — *"Misty Hollow"*
- **Islands:** Misty Graveyard, Hollow Fen, Blighted Bog, Dread Marsh, Skull Crypt Isle.
- **Mood & Vibe:** Eerie, foggy, gothic-cozy (spooky rather than pure horror). Think haunted lantern-lit marshland.
- **Instrumentation:** Harpsichord or plucked pizzicato strings, bowed cello/viola drone, celesta/music-box bell accents, sparse low woodwinds (bassoon/clarinet), soft brushed percussion.
- **Tempo / Key:** ~84–92 BPM, D Minor or Harmonic Minor (3/4 or 6/8 waltz feel works great here).
- **Notes:** Keep dynamics controlled; sudden loud stings will clash with Skeleton/Bat combat SFX.

### 3.4 `mus_overworld_winter.ogg` — *"Frostwind Ridge"*
- **Islands:** Frozen Fjord, Frostwind Ridge, Glacier Peak, Frost Cavern Isle.
- **Mood & Vibe:** Crystalline, crisp, lonely yet majestic—snow-covered peaks and frozen fjords.
- **Instrumentation:** Glockenspiel / glass celesta / bell chimes, legato strings (high violins + warm cellos), solo French horn or flute, soft sleigh-bell / wind-chime texture, sparse deep timpani.
- **Tempo / Key:** ~80–90 BPM, E Minor or A Dorian.
- **Notes:** Clean high-frequency sparkle that complements falling snow particles (`WeatherSystem`).

### 3.5 `mus_overworld_infernal.ogg` — *"Ember Wastes"*
- **Islands:** Ember Wastes, Sulfur Crag, Cinder Crossing, Scorched Oasis, Infernal Sanctum.
- **Mood & Vibe:** Brooding, volcanic, high-stakes frontier. Ash, obsidian, and demonic patrols (Imps, Hellhounds, Demons).
- **Instrumentation:** Low distorted/palm-muted cello & contrabass ostinato, war drums / taiko hits, dark brass (trombones/horns), metallic anvil/bell accents, subtle synth sub-drone.
- **Tempo / Key:** ~112–122 BPM, C# Minor or Phrygian.
- **Notes:** Higher intensity than earlier biomes, signaling endgame danger while still leaving room for boss music to escalate further.

---

## 4. Dungeons (4 Story Dungeons + Void Spire)

Each dungeon in `DungeonScene` is a focused combat gauntlet with minions, breakables, switches, and a room boss.

### 4.1 `mus_dungeon_skull_crypt.ogg` — *"Catacombs of the Lich"*
- **Dungeon:** Skull Crypt (`skull_crypt`) • **Minions:** Skeleton, Vampire • **Boss:** Lich (`necro_rod`)
- **Mood & Vibe:** Tense, claustrophobic, ancient stone crypts.
- **Instrumentation:** Pipe organ chords (subtle, not cheesy), pizzicato/staccato string ostinato, low choir pad ("ooh/aah"), metallic chain/bone percussion.
- **Tempo / Key:** ~110–118 BPM, C Minor.

### 4.2 `mus_dungeon_sunken_tomb.ogg` — *"Vault of the Sand Wyrm"*
- **Dungeon:** Sunken Tomb (`sunken_tomb`) • **Minions:** Mummy, Anubis Warrior • **Boss:** Purple Worm (`thunder_rod`)
- **Mood & Vibe:** Ancient temple traps, shifting sands, subterranean mystery.
- **Instrumentation:** Plucked santoor/oud, deep tomb drums, breathy ney flute, low brass drones, shaker/sand percussion.
- **Tempo / Key:** ~114–122 BPM, E Phrygian Dominant.

### 4.3 `mus_dungeon_frost_cavern.ogg` — *"Glacial Hollows"*
- **Dungeon:** Frost Cavern (`frost_cavern`) • **Minions:** Frost Salamander, Ice Golem • **Boss:** Frost Giant (`ice_rod`)
- **Mood & Vibe:** Echoing ice caves, monolithic, heavy yet crystalline.
- **Instrumentation:** Icicle marimba/vibraphone ostinato, deep echoing taiko/bass drum, cold synth/string pad, low brass swells.
- **Tempo / Key:** ~106–116 BPM, F# Minor.

### 4.4 `mus_dungeon_infernal_sanctum.ogg` — *"Heart of the Inferno"*
- **Dungeon:** Infernal Sanctum (`infernal_sanctum`) • **Minions:** Imp, Demon • **Boss:** Adult Red Dragon (`fire_rod`)
- **Mood & Vibe:** Relentless, molten, demonic forge.
- **Instrumentation:** Driving orchestral percussion + anvil strikes, aggressive low string/synth bass riff, menacing horn stabs, dark choir accents.
- **Tempo / Key:** ~126–134 BPM, D Minor / Locrian accents.

### 4.5 Void Spire (Endgame Endless Dungeon — Floors 1–20+)
If budget allows **two** tracks for Void Spire (recommended), split into Early Spire and Deep Spire. Otherwise, `mus_dungeon_void_spire.ogg` can cover all floors.

- **`mus_dungeon_void_spire.ogg`** — *"The Astral Rift"* (Floors 1–10: Feywild, Yokai, Wyrmlings; Bosses: Oni, Young Green Dragon)
  - **Mood & Vibe:** Otherworldly, arcane, surreal—blending cosmic synth/bell arpeggios with shamisen/koto or harp plucks and tight electronic-orchestral percussion.
  - **Tempo / Key:** ~120–128 BPM, A Minor / Lydian-dominant twists.
- **`mus_dungeon_void_deep.ogg`** *(Optional Tier 2)* — *"Abyssal Ascension"* (Floors 11–20+: Fallen Celestials & Black Dragon; Bosses: Planetar, Ancient Black Dragon)
  - **Mood & Vibe:** Grand, apocalyptic, celestial-horror. Cathedral choir, sweeping strings, heavy sub-bass pulses, crisp hybrid percussion.
  - **Tempo / Key:** ~130–138 BPM, B Minor.

---

## 5. Boss Battles & Stingers

### 5.1 `mus_boss_standard.ogg` — *"Guardian of the Relic"*
- **Where it plays:** Engaging dungeon bosses (Lich, Purple Worm, Frost Giant, Adult Red Dragon, Oni, Young Green Dragon, Planetar) or can be used for all dungeon rooms if per-dungeon tracks don't crossfade on boss aggro.
- **Mood & Vibe:** High-energy, heroic urgency, punchy ARPG combat.
- **Instrumentation:** Driving string ostinato, full orchestral brass melody, pounding drums/timpani, electric bass or tight synth bass underneath for modern punch.
- **Tempo / Key:** ~136–144 BPM, E Minor or D Minor.

### 5.2 `mus_boss_final.ogg` — *"Obsidian Sovereign"*
- **Where it plays:** Void Spire Floor 20 boss fight (**Ancient Black Dragon / Obsidian Sovereign Vaelkor**).
- **Mood & Vibe:** Climactic, monumental, orchestral-hybrid final showdown.
- **Instrumentation:** Full epic choir, soaring brass fanfare, rapid string runs, thunderous hybrid percussion, shimmering astral synth arpeggios tying back to Void Spire.
- **Tempo / Key:** ~144–152 BPM, C Minor (with heroic major-key bridge).

### 5.3 Short Non-Looping Stingers (2–6 seconds each)
| File | Trigger | Mood & Style | Length |
|---|---|---|---|
| `mus_stinger_dungeon_clear.ogg` | Boss defeated / Relic claimed | Triumphant brass/chime flourish, resolves cleanly | ~3–4s |
| `mus_stinger_grand_victory.ogg` | Floor 20 cleared + 25 islands owned | Grand celebratory orchestral + folk-guitar/flute resolution | ~5–7s |
| `mus_stinger_defeat.ogg` | Player HP hits 0 | Somber, gentle descending strings/harp (not harsh) | ~3s |

---

## 6. Summary Checklist for Composer / Licensing

- [ ] `mus_title_theme.ogg` (Title Screen)
- [ ] `mus_overworld_grass.ogg` (Chapter 1: Grasslands)
- [ ] `mus_overworld_autumn.ogg` (Chapter 2: Autumn & Dunes)
- [ ] `mus_overworld_graveyard.ogg` (Chapter 2: Graveyard & Bog)
- [ ] `mus_overworld_winter.ogg` (Chapter 3: Winter)
- [ ] `mus_overworld_infernal.ogg` (Chapter 4: Infernal)
- [ ] `mus_dungeon_skull_crypt.ogg` (Skull Crypt)
- [ ] `mus_dungeon_sunken_tomb.ogg` (Sunken Tomb)
- [ ] `mus_dungeon_frost_cavern.ogg` (Frost Cavern)
- [ ] `mus_dungeon_infernal_sanctum.ogg` (Infernal Sanctum)
- [ ] `mus_dungeon_void_spire.ogg` (Void Spire Floors 1–10 / all)
- [ ] `mus_dungeon_void_deep.ogg` *(Optional: Void Spire Floors 11–20+)*
- [ ] `mus_boss_standard.ogg` (Dungeon Bosses)
- [ ] `mus_boss_final.ogg` (Ancient Black Dragon — Floor 20)
- [ ] `mus_stinger_dungeon_clear.ogg`, `mus_stinger_grand_victory.ogg`, `mus_stinger_defeat.ogg`
