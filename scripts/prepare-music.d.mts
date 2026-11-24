export interface TrackConfig {
  source?: string;
  passthrough?: boolean;
  bpm?: number;
  beatsPerBar?: number;
  stinger?: boolean;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  loopStartSec?: number;
  loopEndSec?: number | null;
  crossfadeLoopSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  gainDb?: number;
}

export interface MusicManifestEntry {
  id: string;
  url: string;
  durationSec: number;
  loopStartSec: number;
  loopEndSec: number | null;
  bpm: number;
  beatsPerBar: number;
  stinger: boolean;
  crossfadeBaked: boolean;
}

export interface MusicManifest {
  version: number;
  generatedAt: string;
  tracks: Record<string, MusicManifestEntry>;
}

export interface InspectAudioResult {
  filePath: string;
  durationSec: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  suggested: {
    trimStartSec: number | null;
    trimEndSec: number | null;
    loopStartSec: number;
    crossfadeLoopSec: number;
  };
}

export interface FilterGraphResult {
  filterComplex: string;
  outputLabel: string;
  crossfadeBaked: boolean;
  effectiveLoopStartSec: number;
  effectiveLoopEndSec: number | null;
}

export function inspectAudioFile(filePath: string, ffmpegBin?: string): Promise<InspectAudioResult>;

export function buildFilterGraph(
  options: TrackConfig & { totalDurationSec: number },
): FilterGraphResult;

export function resolveRawSourcePath(
  trackId: string,
  trackConfig: TrackConfig,
  dirs: { rootDir: string; rawDir: string },
): string | null;

export function processTrack(
  trackId: string,
  trackConfig: TrackConfig,
  options?: {
    rootDir?: string;
    rawDir?: string;
    outDir?: string;
    ffmpegBin?: string;
  },
): Promise<MusicManifestEntry | null>;

export function prepareAllMusic(options?: {
  rootDir?: string;
  configPath?: string;
  rawDir?: string;
  outDir?: string;
  manifestPath?: string;
  ffmpegBin?: string;
  onlyTrack?: string | null;
}): Promise<{
  manifest: MusicManifest;
  processed: string[];
  skipped: string[];
}>;
