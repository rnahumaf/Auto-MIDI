export type MusicStyle = "ambient" | "lofi" | "upbeat";
export type MusicalMode = "major" | "minor";
export type SeedInput = string | number;

export interface VideoCue {
  id?: string;
  timeSeconds: number;
  intensity?: number;
}

export interface GenerateMusicOptions {
  durationSeconds: number;
  style?: MusicStyle;
  tonic?: string;
  mode?: MusicalMode;
  progression?: string[];
  bpm?: number;
  volume?: number;
  seed?: SeedInput;
  cues?: VideoCue[];
}

export interface ResolvedCue {
  id: string;
  requestedTimeSeconds: number;
  actualTimeSeconds: number;
  tick: number;
  driftSeconds: number;
  intensity: number;
}

export interface GeneratedSection {
  name: "intro" | "body" | "outro";
  startSeconds: number;
  endSeconds: number;
  startBar: number;
  endBar: number;
}

export interface GeneratedTrack {
  name: "harmony" | "bass" | "melody" | "drums";
  role: string;
  channel: number;
  instrument: number;
}

export interface MusicManifest {
  schemaVersion: 1;
  durationSeconds: number;
  midiDurationSeconds: number;
  style: MusicStyle;
  tonic: string;
  mode: MusicalMode;
  progression: string[];
  resolvedChords: string[];
  bpm: number;
  volume: number;
  seed: string;
  timeSignature: [4, 4];
  ppq: number;
  sections: GeneratedSection[];
  tracks: GeneratedTrack[];
  cues: ResolvedCue[];
}

export interface MusicGenerationResult {
  midi: Uint8Array;
  manifest: MusicManifest;
}
