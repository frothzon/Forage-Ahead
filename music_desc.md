# Forage Ahead — Track-by-Track Music Brief & Prompts (`music_desc.md`)

A concise, production-ready reference for commissioning or generating every music track in **Forage Ahead**. Covers all full-soundtrack biome, dungeon, boss, UI, and stinger tracks (combining the Steam soundtrack roadmap in `music_spec.md` and all active `MusicEngine.ts` states).

> **Global Production Targets (All Looping Tracks)**
> - **Format:** Seamless loop, stereo, 48 kHz / 24-bit WAV master -> `.ogg` (Vorbis Q7–Q8) for runtime.
> - **Loudness:** -16 LUFS integrated, -1.0 dBTP peak (leaves headroom for combat/foraging SFX).
> - **Style Cohesion:** Warm 16-bit/modern-indie fantasy ARPG soundtrack — organic folk/orchestral instruments blended with subtle retro/celestial textures; **instrumental only (no lyrics)**.

---

## 1. Menus & System States

### 1.1 `mus_title_theme.ogg` — *"Horizons Uncharted"*
- **Plays in:** `TitleScene` (Hero Class Select over shimmering ocean backdrop)
- **Tempo / Meter:** 96 BPM, 4/4
- **Key & Notes:** G Major / Mixolydian — core motif `G4 - B4 - D5 - G5 - F#5 - D5 - B4`; progression `G -> C -> D -> G` (lifting to C Major on bridge)
- **Instruments:** Nylon/steel acoustic guitar arpeggios, warm Celtic folk flute / ocarina lead, soft ocean-swell strings, light bodhrán and brushed snare
- **Feel:** Inviting, adventurous, slightly mysterious; shipwrecked castaway gazing across an archipelago of islands. Gentle swell with no jarring bar-1 downbeat.
- **Prompt:**
  > Instrumental fantasy RPG title theme, 96 BPM, 4/4, G Major with Mixolydian color (rising G-B-D-G-F#-D-B melody over G-C-D-G chords). Fingerpicked nylon acoustic guitar arpeggios, warm Celtic flute lead, soft sweeping ocean-like string pads, light bodhrán and brushed snare. Inviting, adventurous, hopeful wonder, seamless loop, clean mix, no vocals.

---

### 1.2 `mus_pause.ogg` — *"Quiet Harbor"*
- **Plays in:** Pause menu / resting UI overlay (`MusicEngine` `pause` state)
- **Tempo / Meter:** 78 BPM, 4/4
- **Key & Notes:** C Major 9 (`Cmaj9 -> Fmaj7 -> G6 -> Am7`); delicate bell motif `E5 - G5 - B5 - G5 - E5`
- **Instruments:** Soft music box / celesta, muted felt piano, warm low-passed acoustic harp arpeggios, whisper-light shaker
- **Feel:** Cozy, calm, restorative lullaby; tucked-away harbor breathing room that never fatigues the ear.
- **Prompt:**
  > Instrumental cozy fantasy pause menu theme, 78 BPM, 4/4, C Major 9 (Cmaj9-Fmaj7-G6-Am7, gentle E-G-B-G-E motif). Delicate music box, warm felt piano, soft plucked harp arpeggios, warm low-pass intimacy, whisper-soft brush pulse. Peaceful, dreamy, restful, seamless loop, no vocals.

---

## 2. Overworld Biomes (5 Biomes + Skirmish)

### 2.1 `mus_overworld_grass.ogg` — *"Emerald Origin"*
- **Plays in:** Grasslands islands (Emerald Origin, Meadow Homestead, Whispering Woods, Angler's Pier, Clover Cove, Seabreeze Atoll)
- **Tempo / Meter:** 108 BPM, 4/4
- **Key & Notes:** C Major (`C -> F -> Dm -> G`); breezy melody `E5 - G5 - C6 - B5 - A5 - G5 - E5 - D5`
- **Instruments:** Fingerpicked acoustic guitar/lute, wooden marimba & kalimba plucks, airy tin whistle / pan flute, warm upright bass, soft tambourine/shaker
- **Feel:** Cozy, pastoral, optimistic, bouncy without being hyper — comfortable for 30+ minutes of chopping, farming, fishing, and base-building.
- **Prompt:**
  > Instrumental cozy fantasy overworld theme, 108 BPM, 4/4, C Major (C-F-Dm-G, playful rising E-G-C-B-A-G melody). Fingerpicked acoustic guitar, wooden marimba and kalimba plucks, airy tin whistle lead, warm upright bass, light shaker and tambourine. Sunny, pastoral, breezy, relaxing yet lively, seamless loop, no vocals.

---

### 2.2 `mus_overworld_autumn.ogg` — *"Amber Steppe & Sunbleached Dunes"*
- **Plays in:** Autumn / Desert islands (Amber Steppe, Sunbleached Dunes, Dune Mirage, Golden Canyon, Sunken Tomb Isle)
- **Tempo / Meter:** 112 BPM, 4/4
- **Key & Notes:** D Dorian (`Dm -> C -> F -> G`, notes `D - E - F - G - A - B - C`) with light Phrygian Dominant color (`Eb - F#`) in turnarounds
- **Instruments:** Oud and steel-string acoustic guitar, darbuka / frame drum / djembe groove, warm duduk or oboe/flute melody, subtle desert shimmer pad, muted brass swells
- **Feel:** Sun-baked, rhythmic, adventurous, slightly exotic; steady forward travel momentum without feeling like a boss battle.
- **Prompt:**
  > Instrumental desert and golden steppe fantasy adventure theme, 112 BPM, 4/4, D Dorian with subtle Phrygian Dominant accents (Dm-C-F-G). Expressive oud and steel-string guitar, tight darbuka and frame drum groove, warm duduk and flute melody, airy heat-shimmer pad, soft muted brass swells. Sun-baked, mysterious, rhythmic, adventurous, seamless loop, no vocals.

---

### 2.3 `mus_overworld_graveyard.ogg` — *"Misty Hollow"*
- **Plays in:** Graveyard / Bog islands (Misty Graveyard, Hollow Fen, Blighted Bog, Dread Marsh, Skull Crypt Isle)
- **Tempo / Meter:** 88 BPM, 6/8 (or 3/4 waltz)
- **Key & Notes:** D Harmonic Minor (`Dm -> Bb -> Gm -> A7`, featuring the tense `C#` leading tone)
- **Instruments:** Harpsichord, pizzicato strings, bowed cello/viola drone, celesta/music-box bell chimes, sparse bassoon & clarinet, soft brushed percussion
- **Feel:** Gothic-cozy, foggy, lantern-lit spooky (charmingly eerie rather than harsh horror); controlled dynamics so SFX stay clear.
- **Prompt:**
  > Instrumental gothic-cozy haunted marshland theme, 88 BPM, 6/8 waltz, D Harmonic Minor (Dm-Bb-Gm-A7 with C# leading tone). Crisp harpsichord, plucked pizzicato strings, eerie bowed cello drone, delicate celesta chimes, quirky low bassoon and clarinet, soft brushed drums. Foggy, spooky-charming, lantern-lit mystery, seamless loop, no vocals.

---

### 2.4 `mus_overworld_winter.ogg` — *"Frostwind Ridge"*
- **Plays in:** Winter islands (Frozen Fjord, Frostwind Ridge, Glacier Peak, Frost Cavern Isle)
- **Tempo / Meter:** 86 BPM, 4/4
- **Key & Notes:** E Minor / A Dorian (`Em -> C -> G -> D` / `Am -> G -> D -> Em`, crystalline high register `E5 - F#5 - G5 - B5`)
- **Instruments:** Glockenspiel, glass celesta, tubular bell chimes, soaring legato strings, solo French horn & icy concert flute, subtle sleigh-bell/wind-chime texture, sparse deep timpani
- **Feel:** Crystalline, crisp, lonely yet majestic; clean high-end sparkle that pairs with falling snow.
- **Prompt:**
  > Instrumental snowy fantasy tundra theme, 86 BPM, 4/4, E Minor / A Dorian (Em-C-G-D, sparkling high E-F#-G-B motif). Shimmering glockenspiel and glass celesta, sweeping legato strings, noble solo French horn and airy flute, soft wind chimes, sparse deep timpani. Crisp, crystalline, serene, lonely yet majestic, seamless loop, no vocals.

---

### 2.5 `mus_overworld_infernal.ogg` — *"Ember Wastes"*
- **Plays in:** Infernal islands (Ember Wastes, Sulfur Crag, Cinder Crossing, Scorched Oasis, Infernal Sanctum)
- **Tempo / Meter:** 118 BPM, 4/4
- **Key & Notes:** C# Phrygian (`C#m -> D -> C#m -> G#`, notes `C# - D - E - F# - G# - A - B`)
- **Instruments:** Low palm-muted/gritty cello & contrabass ostinato, deep taiko/war drums, dark trombones & French horns, metallic anvil/iron bell hits, brooding sub-bass synth drone
- **Feel:** Brooding, volcanic, high-stakes endgame frontier — intense and dangerous while leaving headroom for dungeon & boss tracks to escalate higher.
- **Prompt:**
  > Instrumental volcanic fantasy frontier theme, 118 BPM, 4/4, C# Phrygian (C#m-D-G# dark half-step tension). Driving low cello and contrabass ostinato, booming taiko war drums, menacing low brass trombones and horns, metallic anvil strikes, dark sub-bass drone. Brooding, fiery, perilous, high-stakes exploration, seamless loop, no vocals.

---

### 2.6 `mus_near_enemy.ogg` — *"Skirmish Alert"*
- **Plays in:** Overworld combat proximity (`MusicEngine` `near_enemy` state when hostile mobs are within aggro range)
- **Tempo / Meter:** 138 BPM, 4/4
- **Key & Notes:** E Minor (`Em -> C -> D -> B7`, sharp 16th-note motif `E5 - G5 - F#5 - E5 - B4 - E5 - G5 - F#5`)
- **Instruments:** Staccato spiccato strings, punchy frame drums & snare rolls, driving bassline, sharp flute/fiddle or brass stabs
- **Feel:** Urgent, agile, scrappy ARPG skirmish — snaps in cleanly on crossfade without overwhelming regular combat SFX.
- **Prompt:**
  > Instrumental agile fantasy ARPG skirmish combat theme, 138 BPM, 4/4, E Minor (Em-C-D-B7, tight E-G-F#-E-B motif). Fast spiccato string ostinato, punchy driving bass, crisp snare and tom percussion, sharp brass and woodwind stabs. Energetic, urgent, nimble, heroic tension, seamless loop, no vocals.

---

## 3. Dungeons (4 Story Dungeons + 2 Void Spire Tiers)

### 3.1 `mus_dungeon_skull_crypt.ogg` — *"Catacombs of the Lich"*
- **Plays in:** `DungeonScene` — Skull Crypt (`skull_crypt`; Skeletons, Vampires, Lich boss)
- **Tempo / Meter:** 114 BPM, 4/4
- **Key & Notes:** C Minor (`Cm -> Ab -> Fm -> G7`; echoing motif `C5 - Eb5 - G5 - F5 - Eb5 - D5 - C5`)
- **Instruments:** Subtle pipe organ chords, staccato/pizzicato string ostinato, dark ambient choir pad ("ooh/aah"), metallic chain & dry bone percussion, deep bass pulse
- **Feel:** Tense, claustrophobic, ancient stone catacombs with creeping undead dread.
- **Prompt:**
  > Instrumental undead crypt dungeon theme, 114 BPM, 4/4, C Minor (Cm-Ab-Fm-G7, haunted C-Eb-G-F-Eb-D-C motif). Atmospheric pipe organ, tight staccato string ostinato, shadowy wordless choir pad, rattling chain and dry wood/bone percussion, deep bass pulse. Tense, claustrophobic, dark gothic dungeon, seamless loop, no vocals or lyrics.

---

### 3.2 `mus_dungeon_sunken_tomb.ogg` — *"Vault of the Sand Wyrm"*
- **Plays in:** `DungeonScene` — Sunken Tomb (`sunken_tomb`; Mummies, Anubis Warriors, Purple Worm boss)
- **Tempo / Meter:** 118 BPM, 4/4
- **Key & Notes:** E Phrygian Dominant (`E -> F -> G -> F -> E`, notes `E - F - G# - A - B - C - D`)
- **Instruments:** Plucked santoor & oud, deep echoing tomb drums, breathy ney flute, low brass drones, dry sand-shaker percussion
- **Feel:** Subterranean mystery, ancient sandstone traps, coiled tension beneath the dunes.
- **Prompt:**
  > Instrumental ancient desert tomb dungeon theme, 118 BPM, 4/4, E Phrygian Dominant (E-F-G-F-E with G# exotic intervals). Fast plucked santoor and oud arpeggios, deep resonant tomb drums, breathy ney flute lead, ominous low brass drones, dry sand shakers. Mysterious, ancient, trap-filled tension, seamless loop, no vocals.

---

### 3.3 `mus_dungeon_frost_cavern.ogg` — *"Glacial Hollows"*
- **Plays in:** `DungeonScene` — Frost Cavern (`frost_cavern`; Frost Salamanders, Ice Golems, Frost Giant boss)
- **Tempo / Meter:** 110 BPM, 4/4
- **Key & Notes:** F# Minor (`F#m -> D -> Bm -> C#7`, crystalline arpeggios `F#4 - A4 - C#5 - F#5`)
- **Instruments:** Icicle marimba & vibraphone ostinato, cavernous echoing taiko/bass drum, glacial synth/string pad, heavy low brass swells
- **Feel:** Monolithic, echoing ice caverns — heavy frozen footsteps paired with sharp crystalline shimmer.
- **Prompt:**
  > Instrumental ice cavern dungeon theme, 110 BPM, 4/4, F# Minor (F#m-D-Bm-C#7). Sparkling icicle marimba and vibraphone ostinato, cavernous echoing bass drums and taiko, cold glassy string and synth pads, monolithic low brass swells. Frozen, vast, echoing, dangerous crystalline dungeon, seamless loop, no vocals.

---

### 3.4 `mus_dungeon_infernal_sanctum.ogg` — *"Heart of the Inferno"*
- **Plays in:** `DungeonScene` — Infernal Sanctum (`infernal_sanctum`; Imps, Demons, Adult Red Dragon boss)
- **Tempo / Meter:** 130 BPM, 4/4
- **Key & Notes:** D Minor with Locrian/flat-2nd accents (`Dm -> Eb -> Bb -> A7`, aggressive bass riff on `D2 - Eb2 - F2 - A2`)
- **Instruments:** Driving orchestral percussion + metallic anvil clangs, aggressive low string & distorted synth bass riff, menacing French horn/trombone stabs, dark choir accents
- **Feel:** Relentless, molten, demonic forge gauntlet — intense heat and nonstop combat drive.
- **Prompt:**
  > Instrumental demonic volcanic dungeon theme, 130 BPM, 4/4, D Minor with Phrygian/Locrian flat-second edge (Dm-Eb-Bb-A7). Relentless war percussion and metallic blacksmith anvil strikes, aggressive low strings and gritty synth bass riff, menacing brass stabs, dark wordless choir hits. Fierce, molten, relentless, high-intensity ARPG dungeon, seamless loop, no lyrics.

---

### 3.5 `mus_dungeon_void_spire.ogg` — *"The Astral Rift"* (Void Spire Floors 1–10)
- **Plays in:** `DungeonScene` — Void Spire Floors 1–10 (Feywild, Yokai, Wyrmlings; Oni & Young Green Dragon bosses)
- **Tempo / Meter:** 124 BPM, 4/4
- **Key & Notes:** A Minor with Lydian-Dominant twists (`Am -> F#dim/B -> Fmaj7 -> E7`, starry arpeggios `A4 - C5 - E5 - G#5 - B5`)
- **Instruments:** Shimmering cosmic synth & bell arpeggios, plucked koto/shamisen & harp, tight electronic-orchestral hybrid percussion, ethereal string swells
- **Feel:** Otherworldly, arcane, surreal — drifting between fey realms, yokai spirits, and starlight rifts.
- **Prompt:**
  > Instrumental arcane astral tower dungeon theme, 124 BPM, 4/4, A Minor with mystical Lydian twists. Shimmering cosmic synth and bell arpeggios, crisp plucked koto and concert harp, tight electronic-orchestral hybrid percussion, ethereal strings. Surreal, arcane, otherworldly, agile combat energy, seamless loop, no vocals.

---

### 3.6 `mus_dungeon_void_deep.ogg` — *"Abyssal Ascension"* (Void Spire Floors 11–20+)
- **Plays in:** `DungeonScene` — Deep Void Spire Floors 11–20+ (Fallen Celestials, Planetar, Ancient Black Dragon approach)
- **Tempo / Meter:** 134 BPM, 4/4
- **Key & Notes:** B Minor (`Bm -> G -> Em -> F#7`, soaring gothic-celestial intervals `B4 - D5 - F#5 - A#5 - B5`)
- **Instruments:** Grand cathedral choir pad (wordless), sweeping dramatic strings, heavy sub-bass pulses, crisp hybrid orchestral/electronic percussion, distant tolling bells
- **Feel:** Grand, apocalyptic, celestial-horror; ascending toward an ancient godlike dragon.
- **Prompt:**
  > Instrumental apocalyptic celestial dungeon theme, 134 BPM, 4/4, B Minor (Bm-G-Em-F#7). Grand wordless cathedral choir, sweeping high-tension strings, heavy sub-bass pulses, thunderous hybrid percussion, distant tolling bells. Monumental, dark celestial awe, intense endgame ascent, seamless loop, no lyrics.

---

## 4. Boss Battles

### 4.1 `mus_boss_standard.ogg` — *"Guardian of the Relic"*
- **Plays in:** Standard Dungeon Bosses (Lich, Purple Worm, Frost Giant, Adult Red Dragon, Oni, Young Green Dragon, Planetar)
- **Tempo / Meter:** 142 BPM, 4/4
- **Key & Notes:** D Minor (`Dm -> Bb -> C -> A7`; heroic driving motif `D5 - A5 - F5 - D5 - Bb5 - A5 - G5 - F5`)
- **Instruments:** Rapid driving string ostinato, soaring full orchestral brass melody, pounding timpani & cinematic drums, tight electric/synth bass pulse
- **Feel:** High-energy, heroic urgency, punchy ARPG duel — thrilling and focused without muddy low end.
- **Prompt:**
  > Instrumental heroic fantasy ARPG boss battle theme, 142 BPM, 4/4, D Minor (Dm-Bb-C-A7, urgent D-A-F-D-Bb-A-G-F brass melody). Fast driving string ostinato, powerful orchestral horns and trumpets, pounding timpani and battle drums, tight punchy bass. Exhilarating, high-stakes, heroic action combat, seamless loop, no vocals.

---

### 4.2 `mus_boss_final.ogg` — *"Obsidian Sovereign"*
- **Plays in:** Void Spire Floor 20 Final Boss (**Ancient Black Dragon — Obsidian Sovereign Vaelkor**)
- **Tempo / Meter:** 148 BPM, 4/4
- **Key & Notes:** C Minor (`Cm -> Ab -> Fm -> G7`) opening into a triumphant Eb Major / C Major heroic bridge before returning to C Minor fury
- **Instruments:** Full epic wordless choir, soaring brass fanfare, blistering string runs, thunderous hybrid percussion, shimmering astral synth arpeggios (callback to Void Spire)
- **Feel:** Climactic, monumental, awe-inspiring final showdown — the emotional and musical peak of the entire game.
- **Prompt:**
  > Instrumental climactic final boss orchestral-hybrid theme, 148 BPM, 4/4, C Minor with a soaring heroic Eb Major bridge. Full epic wordless choir, triumphant brass fanfare, rapid virtuosic string runs, thunderous hybrid war drums, shimmering cosmic synth arpeggios. Monumental, awe-inspiring, desperate yet heroic final dragon showdown, seamless loop, no lyrics.

---

## 5. Non-Looping Stingers (2–7 Seconds)

### 5.1 `mus_stinger_dungeon_clear.ogg` — *"Relic Claimed"*
- **Plays in:** Dungeon boss defeated / Relic acquired
- **Length / Tempo:** ~3.5s, 128 BPM, 4/4
- **Key & Notes:** C Major / G Major triumphant cadence (`F -> G -> C`, rising fanfare `G4 - C5 - D5 - E5 - G5`)
- **Instruments:** Bright French horns & trumpets, sparkling glockenspiel/chime flourish, crisp timpani roll + cymbal swell
- **Feel:** Punchy, victorious, clean natural tail (no loop).
- **Prompt:**
  > Short 4-second instrumental fantasy RPG victory fanfare stinger, 128 BPM, C Major (rising G-C-D-E-G horn fanfare resolving on a bright C major chord). Triumphant orchestral brass, sparkling chime glissando, crisp timpani and cymbal swell, clean natural decay, non-looping, no vocals.

---

### 5.2 `mus_stinger_grand_victory.ogg` — *"Master of the Archipelago"*
- **Plays in:** Grand Victory (Void Spire Floor 20 cleared + all 25 islands owned)
- **Length / Tempo:** ~6s, 108 BPM, 4/4
- **Key & Notes:** G Major (callback to Title Theme motif `G4 - B4 - D5 - G5` resolving warmly on `Gmaj9`)
- **Instruments:** Full celebratory orchestra (brass + sweeping strings) resolving gently into warm acoustic guitar & folk flute
- **Feel:** Grand, emotional, triumphant homecoming that ties the endgame back to *Horizons Uncharted*.
- **Prompt:**
  > Short 6-second instrumental grand victory fantasy RPG fanfare, 108 BPM, G Major (celebratory G-B-D-G orchestral swell resolving into warm Gmaj9). Majestic brass and sweeping strings transitioning into a heartfelt acoustic guitar and Celtic flute final chord, warm natural decay, non-looping, no vocals.

---

### 5.3 `mus_stinger_defeat.ogg` — *"Fallen Castaway"*
- **Plays in:** Player HP reaches 0
- **Length / Tempo:** ~3s, 72 BPM, 4/4
- **Key & Notes:** D Minor descending cadence (`Dm -> Bbmaj7 -> A -> Dm`, falling motif `A4 - F4 - E4 - D4`)
- **Instruments:** Warm solo cello, gentle descending harp arpeggio, soft muted strings
- **Feel:** Somber, gentle, reflective (never harsh or jarring — encourages jumping right back in).
- **Prompt:**
  > Short 3-second instrumental fantasy RPG defeat stinger, 72 BPM, D Minor (gentle falling A-F-E-D melody). Warm solo cello, soft descending harp arpeggio, muted strings settling onto a quiet D minor chord. Somber, wistful, gentle, non-looping, no vocals.

---

## Quick Track Checklist (19 Total)

| # | Filename | Category | BPM | Key / Mode | Loop? |
|---|---|---|---|---|---|
| 1 | `mus_title_theme.ogg` | Menu | 96 | G Major / Mixolydian | Yes |
| 2 | `mus_pause.ogg` | Menu | 78 | C Major 9 | Yes |
| 3 | `mus_overworld_grass.ogg` | Overworld | 108 | C Major | Yes |
| 4 | `mus_overworld_autumn.ogg` | Overworld | 112 | D Dorian / Phrygian Dom. | Yes |
| 5 | `mus_overworld_graveyard.ogg` | Overworld | 88 (6/8) | D Harmonic Minor | Yes |
| 6 | `mus_overworld_winter.ogg` | Overworld | 86 | E Minor / A Dorian | Yes |
| 7 | `mus_overworld_infernal.ogg` | Overworld | 118 | C# Phrygian | Yes |
| 8 | `mus_near_enemy.ogg` | Overworld Combat | 138 | E Minor | Yes |
| 9 | `mus_dungeon_skull_crypt.ogg` | Dungeon | 114 | C Minor | Yes |
| 10 | `mus_dungeon_sunken_tomb.ogg` | Dungeon | 118 | E Phrygian Dominant | Yes |
| 11 | `mus_dungeon_frost_cavern.ogg` | Dungeon | 110 | F# Minor | Yes |
| 12 | `mus_dungeon_infernal_sanctum.ogg` | Dungeon | 130 | D Minor / Locrian | Yes |
| 13 | `mus_dungeon_void_spire.ogg` | Dungeon (F1–10) | 124 | A Minor / Lydian | Yes |
| 14 | `mus_dungeon_void_deep.ogg` | Dungeon (F11–20+) | 134 | B Minor | Yes |
| 15 | `mus_boss_standard.ogg` | Boss | 142 | D Minor | Yes |
| 16 | `mus_boss_final.ogg` | Final Boss | 148 | C Minor / Eb Major | Yes |
| 17 | `mus_stinger_dungeon_clear.ogg` | Stinger (~3.5s) | 128 | C Major | No |
| 18 | `mus_stinger_grand_victory.ogg` | Stinger (~6s) | 108 | G Major | No |
| 19 | `mus_stinger_defeat.ogg` | Stinger (~3s) | 72 | D Minor | No |
