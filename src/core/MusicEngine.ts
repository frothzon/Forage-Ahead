export type MusicSituation = 'title' | 'pause' | 'overworld' | 'near_enemy' | 'dungeon' | 'boss';

export type TrackId =
  | 'mus_title'
  | 'mus_pause'
  | 'mus_overworld_1'
  | 'mus_overworld_2'
  | 'mus_overworld_3'
  | 'mus_overworld_4'
  | 'mus_near_enemy'
  | 'mus_dungeon'
  | 'mus_boss';

export interface MusicStep {
  lead: number | null; // MIDI note, -1 = hold, null = rest
  arp: number | null;
  bass: number | null;
  drum: 'K' | 'S' | 'H' | 'O' | null;
}

export interface CompiledTrack {
  id: TrackId;
  title: string;
  bpm: number;
  leadDuty: '125' | '25' | '50';
  arpDuty: '125' | '25' | '50';
  lowpassHz?: number;
  steps: MusicStep[];
  durationSec: number;
}

const NOTE_OFFSET: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function parseNoteToken(tok: string): number | null {
  if (!tok || tok === '.') return null;
  if (tok === '--' || tok === '-') return -1;
  const m = /^([A-G][#b]?)(-?\d)$/.exec(tok.trim());
  if (!m) return null;
  const semi = NOTE_OFFSET[m[1]];
  if (semi === undefined) return null;
  return (Number(m[2]) + 1) * 12 + semi;
}

interface BarPattern {
  lead: string; // 16 space-separated tokens
  arp: string;
  bass: string;
  drum: string; // 16 chars: K, S, H, O, .
}

function parse16(line: string): Array<number | null> {
  const parts = line.trim().split(/\s+/);
  const out: Array<number | null> = [];
  for (let i = 0; i < 16; i++) {
    out.push(parseNoteToken(parts[i] ?? '.'));
  }
  return out;
}

function parseDrums(line: string): Array<'K' | 'S' | 'H' | 'O' | null> {
  const clean = line.replace(/\s+/g, '');
  const out: Array<'K' | 'S' | 'H' | 'O' | null> = [];
  for (let i = 0; i < 16; i++) {
    const ch = clean[i] ?? '.';
    out.push(ch === 'K' || ch === 'S' || ch === 'H' || ch === 'O' ? ch : null);
  }
  return out;
}

function transposeBar(bar: BarPattern, semitones: number): BarPattern {
  const shiftLine = (line: string): string =>
    line
      .trim()
      .split(/\s+/)
      .map((t) => {
        const m = parseNoteToken(t);
        if (m === null) return '.';
        if (m === -1) return '--';
        const nm = m + semitones;
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const oct = Math.floor(nm / 12) - 1;
        return `${names[((nm % 12) + 12) % 12]}${oct}`;
      })
      .join(' ');
  return {
    lead: shiftLine(bar.lead),
    arp: shiftLine(bar.arp),
    bass: shiftLine(bar.bass),
    drum: bar.drum,
  };
}

function compileTrack(
  id: TrackId,
  title: string,
  bpm: number,
  leadDuty: '125' | '25' | '50',
  arpDuty: '125' | '25' | '50',
  bars: BarPattern[],
  lowpassHz?: number,
): CompiledTrack {
  const steps: MusicStep[] = [];
  for (const bar of bars) {
    const l = parse16(bar.lead);
    const a = parse16(bar.arp);
    const b = parse16(bar.bass);
    const d = parseDrums(bar.drum);
    for (let i = 0; i < 16; i++) {
      steps.push({ lead: l[i], arp: a[i], bass: b[i], drum: d[i] });
    }
  }
  const stepSec = 60 / bpm / 4;
  return {
    id,
    title,
    bpm,
    leadDuty,
    arpDuty,
    lowpassHz,
    steps,
    durationSec: steps.length * stepSec,
  };
}

// Helper to build a rich 16-step chord arpeggio bar
function arpBar(n1: string, n2: string, n3: string, n4?: string): string {
  const a = [n1, n2, n3, n4 ?? n2];
  return Array.from({ length: 16 }, (_, i) => a[i % 4]).join(' ');
}

function bassDrive(root: string, fifth: string, oct: string): string {
  return `${root} . ${oct} . ${root} . ${fifth} . ${root} . ${oct} . ${fifth} . ${oct} .`;
}

function bassPulse16(root: string, oct: string): string {
  return `${root} ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct}`;
}

// ============================================================================
// 9 FULL >= 60-SECOND 8-BIT ARRANGEMENTS
// ============================================================================

function buildTracks(): Record<TrackId, CompiledTrack> {
  // 1. START MENU (96 BPM, G Major, 28 bars = 70.0s)
  const titleA1: BarPattern = {
    lead: 'G4 -- B4 -- D5 -- -- G5 F#5 -- D5 -- B4 -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'G4'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const titleA2: BarPattern = {
    lead: 'E5 -- D5 -- C5 -- B4 -- A4 -- B4 -- G4 -- -- .',
    arp: arpBar('C4', 'E4', 'G4', 'E4'),
    bass: bassDrive('C3', 'G3', 'C4'),
    drum: 'K.H.S.H.K.H.S.HH',
  };
  const titleB1: BarPattern = {
    lead: 'D5 -- E5 -- F#5 -- A5 -- G5 -- F#5 -- D5 -- -- .',
    arp: arpBar('D4', 'F#4', 'A4', 'F#4'),
    bass: bassDrive('D3', 'A3', 'D4'),
    drum: 'K.H.S.H.K.K.S.HO',
  };
  const titleB2: BarPattern = {
    lead: 'B4 -- C5 -- D5 -- E5 -- D5 -- -- -- -- -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'F#4'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.SSKS',
  };
  const titleBridge = transposeBar(titleA1, 5); // C Major lift
  const titleBridge2 = transposeBar(titleA2, 2);
  const titleIntro: BarPattern = {
    lead: '. . . . . . . . G4 -- B4 -- D5 -- -- .',
    arp: arpBar('G3', 'D4', 'G4', 'B4'),
    bass: 'G2 -- -- -- . . . . D3 -- -- -- . . . .',
    drum: 'H...H...H...H.OO',
  };
  const titleBars: BarPattern[] = [
    titleIntro, titleIntro,
    titleA1, titleA2, titleA1, titleB2,
    titleB1, titleA2, titleB1, titleB2,
    titleA1, titleA2, titleB1, titleB2,
    titleBridge, titleBridge2, titleBridge, titleB2,
    titleA1, titleA2, titleB1, titleB2,
    titleA1, titleA2, titleB1, titleB2,
    titleA1, titleB2,
  ];

  // 2. PAUSE MENU (78 BPM, C Maj9 Music Box, 22 bars = 67.7s)
  const pause1: BarPattern = {
    lead: 'E5 -- . G5 -- . B5 -- . G5 -- . E5 -- . .',
    arp: arpBar('C4', 'E4', 'G4', 'B4'),
    bass: 'C3 -- -- -- . . . . G3 -- -- -- . . . .',
    drum: 'H.......H.......',
  };
  const pause2: BarPattern = {
    lead: 'D5 -- . F5 -- . A5 -- . F5 -- . D5 -- . .',
    arp: arpBar('F3', 'A3', 'C4', 'E4'),
    bass: 'F2 -- -- -- . . . . C3 -- -- -- . . . .',
    drum: 'H.......H.......',
  };
  const pause3: BarPattern = {
    lead: 'B4 -- . D5 -- . G5 -- . D5 -- . B4 -- . .',
    arp: arpBar('G3', 'B3', 'D4', 'F#4'),
    bass: 'G2 -- -- -- . . . . D3 -- -- -- . . . .',
    drum: 'H.......H...H...',
  };
  const pause4: BarPattern = {
    lead: 'C5 -- . E5 -- . G5 -- -- -- -- -- . . . .',
    arp: arpBar('A3', 'C4', 'E4', 'G4'),
    bass: 'A2 -- -- -- . . . . E3 -- -- -- . . . .',
    drum: 'H.......H.......',
  };
  const pauseBars: BarPattern[] = [
    pause1, pause2, pause3, pause4,
    pause1, pause2, pause3, pause1,
    transposeBar(pause1, 2), transposeBar(pause2, 2), pause3, pause4,
    pause1, pause2, pause3, pause4,
    pause1, pause2, pause3, pause4,
    pause1, pause4,
  ];

  // 3. OVERWORLD 1: Emerald Breeze (108 BPM, C Major, 32 bars = 71.1s)
  const ow1A1: BarPattern = {
    lead: 'E5 -- G5 -- C6 -- B5 -- A5 -- G5 -- E5 -- D5 .',
    arp: arpBar('C4', 'E4', 'G4', 'E4'),
    bass: bassDrive('C3', 'G3', 'C4'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const ow1A2: BarPattern = {
    lead: 'F5 -- A5 -- G5 -- E5 -- D5 -- E5 -- C5 -- -- .',
    arp: arpBar('F3', 'A3', 'C4', 'A3'),
    bass: bassDrive('F2', 'C3', 'F3'),
    drum: 'K.H.S.H.K.H.S.HH',
  };
  const ow1B1: BarPattern = {
    lead: 'A5 -- -- G5 F5 -- E5 -- D5 -- F5 -- A5 -- -- .',
    arp: arpBar('D4', 'F4', 'A4', 'F4'),
    bass: bassDrive('D3', 'A3', 'D4'),
    drum: 'K.H.S.H.K.K.S.HO',
  };
  const ow1B2: BarPattern = {
    lead: 'G5 -- B5 -- D6 -- B5 -- G5 -- F5 -- D5 -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'B3'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.SSKS',
  };
  const ow1Bars: BarPattern[] = [
    ow1A1, ow1A2, ow1A1, ow1B2,
    ow1A1, ow1A2, ow1B1, ow1B2,
    ow1B1, ow1B2, ow1A1, ow1A2,
    transposeBar(ow1A1, 5), transposeBar(ow1A2, 5), ow1B1, ow1B2,
    ow1A1, ow1A2, ow1B1, ow1B2,
    ow1A1, ow1A2, ow1A1, ow1B2,
    ow1B1, ow1B2, ow1A1, ow1A2,
    ow1A1, ow1A2, ow1B1, ow1B2,
  ];

  // 4. OVERWORLD 2: Sunlit Archipelago (100 BPM, G Major, 32 bars = 76.8s)
  const ow2Bars: BarPattern[] = [
    titleA1, titleA2, titleB1, titleB2,
    titleA1, titleB1, titleA2, titleB2,
    transposeBar(titleA1, 2), transposeBar(titleA2, 2), titleB1, titleB2,
    titleA1, titleA2, titleB1, titleB2,
    titleBridge, titleBridge2, titleB1, titleB2,
    titleA1, titleA2, titleB1, titleB2,
    titleA1, titleB1, titleA2, titleB2,
    titleA1, titleA2, titleB1, titleB2,
  ];

  // 5. OVERWORLD 3: Starlight Tide (92 BPM, D Dorian, 28 bars = 73.0s)
  const ow3A1: BarPattern = {
    lead: 'D5 -- F5 -- A5 -- -- G5 F5 -- E5 -- D5 -- -- .',
    arp: arpBar('D4', 'F4', 'A4', 'C5'),
    bass: bassDrive('D3', 'A3', 'D4'),
    drum: 'K...S.H.K.H.S.HO',
  };
  const ow3A2: BarPattern = {
    lead: 'C5 -- E5 -- G5 -- -- F5 E5 -- D5 -- C5 -- -- .',
    arp: arpBar('C4', 'E4', 'G4', 'B4'),
    bass: bassDrive('C3', 'G3', 'C4'),
    drum: 'K...S.H.K.H.S.HH',
  };
  const ow3B1: BarPattern = {
    lead: 'A4 -- C5 -- E5 -- G5 -- F5 -- E5 -- D5 -- -- .',
    arp: arpBar('F3', 'A3', 'C4', 'E4'),
    bass: bassDrive('F2', 'C3', 'F3'),
    drum: 'K.H.S.H.K.K.S.HO',
  };
  const ow3B2: BarPattern = {
    lead: 'G4 -- B4 -- D5 -- F5 -- E5 -- D5 -- A4 -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'F4'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.SSKS',
  };
  const ow3Bars: BarPattern[] = [
    ow3A1, ow3A2, ow3B1, ow3B2,
    ow3A1, ow3A2, ow3B1, ow3B2,
    transposeBar(ow3A1, 5), transposeBar(ow3A2, 5), ow3B1, ow3B2,
    ow3A1, ow3A2, ow3B1, ow3B2,
    ow3B1, ow3B2, ow3A1, ow3A2,
    ow3A1, ow3A2, ow3B1, ow3B2,
    ow3A1, ow3A2, ow3B1, ow3B2,
  ];

  // 6. OVERWORLD 4: Wild Frontier (116 BPM, A Minor/Dorian, 32 bars = 66.2s)
  const ow4A1: BarPattern = {
    lead: 'A4 . C5 . E5 -- A5 -- G5 . E5 . C5 -- D5 .',
    arp: arpBar('A3', 'C4', 'E4', 'A4'),
    bass: bassDrive('A2', 'E3', 'A3'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const ow4A2: BarPattern = {
    lead: 'F5 . E5 . D5 -- C5 -- B4 . C5 . A4 -- -- .',
    arp: arpBar('F3', 'A3', 'C4', 'E4'),
    bass: bassDrive('F2', 'C3', 'F3'),
    drum: 'K.H.S.H.K.K.S.HH',
  };
  const ow4B1: BarPattern = {
    lead: 'G5 -- E5 -- D5 -- B4 -- C5 -- D5 -- E5 -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'G4'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const ow4B2: BarPattern = {
    lead: 'E5 -- G#5 -- B5 -- E5 -- A5 -- -- -- -- -- -- .',
    arp: arpBar('E3', 'G#3', 'B3', 'E4'),
    bass: bassDrive('E2', 'B2', 'E3'),
    drum: 'K.H.S.H.K.H.SSKS',
  };
  const ow4Bars: BarPattern[] = [
    ow4A1, ow4A2, ow4B1, ow4B2,
    ow4A1, ow4A2, ow4B1, ow4B2,
    transposeBar(ow4A1, 3), transposeBar(ow4A2, 3), ow4B1, ow4B2,
    ow4A1, ow4A2, ow4B1, ow4B2,
    ow4A1, ow4A2, ow4B1, ow4B2,
    ow4B1, ow4B2, ow4A1, ow4A2,
    ow4A1, ow4A2, ow4B1, ow4B2,
    ow4A1, ow4A2, ow4B1, ow4B2,
  ];

  // 7. NEAR ENEMY (126 BPM, E Minor urgent skirmish, 36 bars = 68.6s)
  const ne1: BarPattern = {
    lead: 'E5 . G5 . F#5 . E5 . B4 . E5 . G5 . F#5 .',
    arp: arpBar('E4', 'G4', 'B4', 'G4'),
    bass: bassPulse16('E2', 'E3'),
    drum: 'KHSOKHSHKHSOKHSS',
  };
  const ne2: BarPattern = {
    lead: 'C5 . D5 . E5 . G5 . F#5 . D5 . B4 -- -- .',
    arp: arpBar('C4', 'E4', 'G4', 'E4'),
    bass: bassPulse16('C2', 'C3'),
    drum: 'KHSOKHSHKKSOKHSS',
  };
  const ne3: BarPattern = {
    lead: 'D5 . F#5 . A5 . G5 . F#5 . D5 . B4 . D5 .',
    arp: arpBar('D4', 'F#4', 'A4', 'F#4'),
    bass: bassPulse16('D2', 'D3'),
    drum: 'KHSOKHSHKHSOKHSS',
  };
  const ne4: BarPattern = {
    lead: 'B4 . D#5 . F#5 . B5 . A5 . F#5 . D#5 . B4 .',
    arp: arpBar('B3', 'D#4', 'F#4', 'D#4'),
    bass: bassPulse16('B1', 'B2'),
    drum: 'KHSOKHSSKKSOKSSS',
  };
  const neBars: BarPattern[] = [
    ne1, ne2, ne3, ne4,
    ne1, ne2, ne3, ne4,
    transposeBar(ne1, 5), transposeBar(ne2, 5), ne3, ne4,
    ne1, ne2, ne3, ne4,
    ne1, ne2, ne3, ne4,
    transposeBar(ne1, 3), transposeBar(ne2, 3), ne3, ne4,
    ne1, ne2, ne3, ne4,
    ne1, ne2, ne3, ne4,
    ne1, ne2, ne3, ne4,
    ne1, ne2, ne3, ne4,
  ];

  // 8. DUNGEON (114 BPM, C Minor echoing crypt, 32 bars = 67.4s)
  const dg1: BarPattern = {
    lead: 'C5 -- Eb5 -- G5 -- -- F5 Eb5 -- D5 -- C5 -- -- .',
    arp: arpBar('C4', 'Eb4', 'G4', 'Eb4'),
    bass: bassDrive('C2', 'G2', 'C3'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const dg2: BarPattern = {
    lead: 'Ab4 -- C5 -- Eb5 -- -- D5 C5 -- Bb4 -- Ab4 -- -- .',
    arp: arpBar('Ab3', 'C4', 'Eb4', 'C4'),
    bass: bassDrive('Ab1', 'Eb2', 'Ab2'),
    drum: 'K.H.S.H.K.K.S.HH',
  };
  const dg3: BarPattern = {
    lead: 'F4 -- Ab4 -- C5 -- Eb5 -- D5 -- C5 -- B4 -- -- .',
    arp: arpBar('F3', 'Ab3', 'C4', 'Ab3'),
    bass: bassDrive('F2', 'C3', 'F3'),
    drum: 'K.H.S.H.K.H.S.HO',
  };
  const dg4: BarPattern = {
    lead: 'G4 -- B4 -- D5 -- G5 -- F5 -- D5 -- B4 -- -- .',
    arp: arpBar('G3', 'B3', 'D4', 'B3'),
    bass: bassDrive('G2', 'D3', 'G3'),
    drum: 'K.H.S.H.K.H.SSKS',
  };
  const dgBars: BarPattern[] = [
    dg1, dg2, dg3, dg4,
    dg1, dg2, dg3, dg4,
    transposeBar(dg1, 5), transposeBar(dg2, 5), dg3, dg4,
    dg1, dg2, dg3, dg4,
    dg1, dg2, dg3, dg4,
    transposeBar(dg1, -2), transposeBar(dg2, -2), dg3, dg4,
    dg1, dg2, dg3, dg4,
    dg1, dg2, dg3, dg4,
  ];

  // 9. BOSS FIGHT (142 BPM, D Minor relentless showdown, 40 bars = 67.6s)
  const bs1: BarPattern = {
    lead: 'D5 . A5 . F5 . D5 . Bb5 . A5 . G5 . F5 .',
    arp: arpBar('D4', 'F4', 'A4', 'D5'),
    bass: bassPulse16('D2', 'D3'),
    drum: 'KHSOKHSHKHSOKHSS',
  };
  const bs2: BarPattern = {
    lead: 'Bb4 . F5 . D5 . Bb4 . G5 . F5 . E5 . D5 .',
    arp: arpBar('Bb3', 'D4', 'F4', 'Bb4'),
    bass: bassPulse16('Bb1', 'Bb2'),
    drum: 'KHSOKHSHKKSOKHSS',
  };
  const bs3: BarPattern = {
    lead: 'C5 . G5 . E5 . C5 . A5 . G5 . F5 . E5 .',
    arp: arpBar('C4', 'E4', 'G4', 'C5'),
    bass: bassPulse16('C2', 'C3'),
    drum: 'KHSOKHSHKHSOKHSS',
  };
  const bs4: BarPattern = {
    lead: 'A4 . C#5 . E5 . A5 . G5 . E5 . C#5 . A4 .',
    arp: arpBar('A3', 'C#4', 'E4', 'A4'),
    bass: bassPulse16('A1', 'A2'),
    drum: 'KHSOKHSSKKSOKSSS',
  };
  const bsBars: BarPattern[] = [
    bs1, bs2, bs3, bs4,
    bs1, bs2, bs3, bs4,
    transposeBar(bs1, 3), transposeBar(bs2, 3), bs3, bs4,
    bs1, bs2, bs3, bs4,
    bs1, bs2, bs3, bs4,
    transposeBar(bs1, 5), transposeBar(bs2, 5), bs3, bs4,
    bs1, bs2, bs3, bs4,
    bs1, bs2, bs3, bs4,
    bs1, bs2, bs3, bs4,
    bs1, bs2, bs3, bs4,
  ];

  return {
    mus_title: compileTrack('mus_title', 'Horizons Uncharted', 96, '25', '125', titleBars, 4500),
    mus_pause: compileTrack('mus_pause', 'Quiet Harbor', 78, '125', '25', pauseBars, 1500),
    mus_overworld_1: compileTrack('mus_overworld_1', 'Emerald Breeze', 98, '25', '125', ow1Bars, 3400),
    mus_overworld_2: compileTrack('mus_overworld_2', 'Sunlit Archipelago', 92, '25', '125', ow2Bars, 3200),
    mus_overworld_3: compileTrack('mus_overworld_3', 'Starlight Tide', 88, '125', '25', ow3Bars, 3000),
    mus_overworld_4: compileTrack('mus_overworld_4', 'Wild Frontier', 102, '25', '125', ow4Bars, 3600),
    mus_near_enemy: compileTrack('mus_near_enemy', 'Skirmish Alert', 138, '50', '125', neBars),
    mus_dungeon: compileTrack('mus_dungeon', 'Echoing Crypt', 114, '125', '25', dgBars, 2600),
    mus_boss: compileTrack('mus_boss', 'Obsidian Showdown', 142, '50', '25', bsBars),
  };
}

export const MUSIC_TRACKS = buildTracks();

const OVERWORLD_ROTATION: TrackId[] = [
  'mus_overworld_1',
  'mus_overworld_2',
  'mus_overworld_3',
  'mus_overworld_4',
];

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private pulseWaves: Partial<Record<'125' | '25' | '50', PeriodicWave>> = {};

  private schedulerTimer?: number;
  private fadeSwapTimer?: number;
  private duckTimer?: number;
  private fadingOut = false;
  private activeTrack: CompiledTrack | null = null;
  private stepIdx = 0;
  private nextNoteTime = 0;
  private situation: MusicSituation = 'title';
  private paused = false;
  private enabled = false;
  private masterVolume = 0.7;
  private muted = false;

  public getTrackForSituation(sit: MusicSituation, excludeId?: TrackId): TrackId {
    if (sit === 'title') return 'mus_title';
    if (sit === 'pause') return 'mus_pause';
    if (sit === 'near_enemy') return 'mus_near_enemy';
    if (sit === 'dungeon') return 'mus_dungeon';
    if (sit === 'boss') return 'mus_boss';
    const pool = OVERWORLD_ROTATION.filter((id) => id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)] ?? 'mus_overworld_1';
  }

  public syncAudioSettings(enabled: boolean, muted: boolean, masterVolume: number): void {
    this.enabled = enabled;
    this.muted = muted;
    this.masterVolume = masterVolume;
    if (this.ctx && this.musicBus) {
      const target = !enabled || muted ? 0 : masterVolume * 0.28;
      this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    if (!enabled || muted) {
      this.stopScheduler();
    } else if (!this.schedulerTimer && typeof window !== 'undefined') {
      this.startCurrentTrack();
    }
  }

  public setSituation(sit: MusicSituation): void {
    if (this.situation === sit && this.activeTrack) return;
    this.situation = sit;
    if (!this.paused && this.enabled && !this.muted) {
      this.crossfadeTo(this.getTrackForSituation(sit, this.activeTrack?.id), sit === 'near_enemy' ? 0.55 : 1.4);
    }
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!this.enabled || this.muted) return;
    const targetSit = paused ? 'pause' : this.situation;
    this.crossfadeTo(this.getTrackForSituation(targetSit, this.activeTrack?.id), 0.55);
  }

  public duck(factor = 0.25, holdMs = 750, releaseMs = 650): void {
    if (!this.ctx || !this.musicBus || !this.enabled || this.muted) return;
    const baseTarget = this.masterVolume * 0.28;
    const ducked = baseTarget * Math.max(0, Math.min(1, factor));
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(ducked, now, 0.025);
    if (this.duckTimer !== undefined) {
      window.clearTimeout(this.duckTimer);
    }
    this.duckTimer = window.setTimeout(() => {
      this.duckTimer = undefined;
      if (!this.ctx || !this.musicBus) return;
      const restore = !this.enabled || this.muted ? 0 : this.masterVolume * 0.28;
      this.musicBus.gain.setTargetAtTime(restore, this.ctx.currentTime, Math.max(0.05, releaseMs / 3000));
    }, Math.max(50, holdMs));
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      this.ctx = ctx;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 12000;

      const bus = ctx.createGain();
      bus.gain.value = !this.enabled || this.muted ? 0 : this.masterVolume * 0.28;

      filter.connect(bus);
      bus.connect(ctx.destination);

      this.filterNode = filter;
      this.musicBus = bus;
      this.buildPulseWaves(ctx);
      this.buildNoiseBuffer(ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private buildPulseWaves(ctx: AudioContext): void {
    const makeWave = (duty: number): PeriodicWave => {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      }
      return ctx.createPeriodicWave(real, imag);
    };
    this.pulseWaves['125'] = makeWave(0.125);
    this.pulseWaves['25'] = makeWave(0.25);
    this.pulseWaves['50'] = makeWave(0.5);
  }

  private buildNoiseBuffer(ctx: AudioContext): void {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  private startCurrentTrack(): void {
    const sit = this.paused ? 'pause' : this.situation;
    const id = this.getTrackForSituation(sit, this.activeTrack?.id);
    this.crossfadeTo(id, 0.8);
  }

  private crossfadeTo(trackId: TrackId, fadeSec: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicBus || !this.filterNode) return;
    const nextTrack = MUSIC_TRACKS[trackId];
    if (!nextTrack) return;

    if (this.fadeSwapTimer) {
      window.clearTimeout(this.fadeSwapTimer);
      this.fadeSwapTimer = undefined;
    }

    const startNext = () => {
      this.fadingOut = false;
      if (!this.ctx || !this.musicBus || !this.filterNode) return;
      this.activeTrack = nextTrack;
      this.stepIdx = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.04;
      this.filterNode.frequency.setTargetAtTime(nextTrack.lowpassHz ?? 12000, this.ctx.currentTime, 0.25);
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      const targetGain = !this.enabled || this.muted ? 0 : this.masterVolume * 0.28;
      this.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, targetGain), this.ctx.currentTime + fadeSec);
      if (!this.schedulerTimer && typeof window !== 'undefined') {
        this.schedulerTimer = window.setInterval(() => this.schedulerTick(), 40);
      }
    };

    if (this.activeTrack) {
      // Smoothly fade out current track before fading in the next track
      this.fadingOut = true;
      const fadeOutSec = 0.32;
      this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), ctx.currentTime);
      this.musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeOutSec);
      this.fadeSwapTimer = window.setTimeout(() => {
        this.fadeSwapTimer = undefined;
        startNext();
      }, Math.round(fadeOutSec * 1000));
    } else {
      startNext();
    }
  }

  public suspend(): void {
    this.stopScheduler();
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.enabled && !this.muted && this.activeTrack && !this.schedulerTimer && typeof window !== 'undefined') {
      if (this.ctx) {
        this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.04);
      }
      this.schedulerTimer = window.setInterval(() => this.schedulerTick(), 40);
    }
  }

  public stopScheduler(): void {
    if (this.fadeSwapTimer) {
      window.clearTimeout(this.fadeSwapTimer);
      this.fadeSwapTimer = undefined;
    }
    this.fadingOut = false;
    if (this.schedulerTimer) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.activeTrack || !this.enabled || this.muted || this.fadingOut) return;
    const lookahead = 0.15;
    const stepSec = 60 / this.activeTrack.bpm / 4;

    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      if (this.stepIdx >= this.activeTrack.steps.length) {
        if (!this.paused && this.situation === 'overworld') {
          const nextId = this.getTrackForSituation('overworld', this.activeTrack.id);
          this.crossfadeTo(nextId, 2.2);
          return;
        }
        this.stepIdx = 0;
      }
      this.scheduleStep(this.activeTrack, this.stepIdx, this.nextNoteTime, stepSec);
      this.nextNoteTime += stepSec;
      this.stepIdx += 1;
    }
  }

  private countHoldSteps(track: CompiledTrack, idx: number, channel: 'lead' | 'arp' | 'bass'): number {
    let count = 1;
    for (let i = idx + 1; i < track.steps.length && count < 12; i++) {
      if (track.steps[i][channel] === -1) count += 1;
      else break;
    }
    return count;
  }

  private scheduleStep(track: CompiledTrack, idx: number, time: number, stepSec: number): void {
    const step = track.steps[idx];
    if (!step || !this.ctx || !this.filterNode) return;

    if (step.lead !== null && step.lead > 0) {
      const hold = this.countHoldSteps(track, idx, 'lead');
      this.playVoice(midiToFreq(step.lead), time, hold * stepSec * 0.92, track.leadDuty, 0.22, 0.08, hold >= 3);
    }
    if (step.arp !== null && step.arp > 0) {
      const hold = this.countHoldSteps(track, idx, 'arp');
      this.playVoice(midiToFreq(step.arp), time, hold * stepSec * 0.85, track.arpDuty, 0.11, -0.22, false);
    }
    if (step.bass !== null && step.bass > 0) {
      const hold = this.countHoldSteps(track, idx, 'bass');
      this.playTriangleBass(midiToFreq(step.bass), time, hold * stepSec * 0.9);
    }
    if (step.drum) {
      this.playDrum(step.drum, time);
    }
  }

  private playVoice(
    freq: number,
    time: number,
    dur: number,
    duty: '125' | '25' | '50',
    peak: number,
    panVal: number,
    vibrato: boolean,
  ): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const wave = this.pulseWaves[duty];
    if (wave) osc.setPeriodicWave(wave);
    else osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.03, dur));

    if (vibrato) {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 5.6;
      lfoGain.gain.setValueAtTime(0, time);
      lfoGain.gain.linearRampToValueAtTime(14, time + Math.min(0.14, dur * 0.5));
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(time);
      lfo.stop(time + dur + 0.02);
    }

    if (typeof this.ctx.createStereoPanner === 'function') {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = panVal;
      osc.connect(env);
      env.connect(pan);
      pan.connect(this.filterNode);
    } else {
      osc.connect(env);
      env.connect(this.filterNode);
    }

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playTriangleBass(freq: number, time: number, dur: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.32, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.03, dur));

    osc.connect(env);
    env.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playDrum(kind: 'K' | 'S' | 'H' | 'O', time: number): void {
    if (!this.ctx || !this.filterNode) return;
    if (kind === 'K') {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.085);
      env.gain.setValueAtTime(0.35, time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.095);
      osc.connect(env);
      env.connect(this.filterNode);
      osc.start(time);
      osc.stop(time + 0.1);
      return;
    }

    if (!this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    if (kind === 'S') {
      flt.type = 'bandpass';
      flt.frequency.value = 1800;
      flt.Q.value = 1.2;
      env.gain.setValueAtTime(0.18, time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
      src.connect(flt);
      flt.connect(env);
      env.connect(this.filterNode);
      src.start(time, 0, 0.12);
    } else {
      const dur = kind === 'O' ? 0.095 : 0.032;
      flt.type = 'highpass';
      flt.frequency.value = kind === 'O' ? 5800 : 6800;
      env.gain.setValueAtTime(kind === 'O' ? 0.1 : 0.075, time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(flt);
      flt.connect(env);
      env.connect(this.filterNode);
      src.start(time, Math.random() * 0.4, dur + 0.01);
    }
  }
}

export const musicEngine = new MusicEngine();
