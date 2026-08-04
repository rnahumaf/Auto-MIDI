import toneMidi from "@tonejs/midi";
import { createRandomSource } from "./random.js";
import { presetFor, PRESETS } from "./presets.js";
import {
  chordMidiNotes,
  chordsFromProgression,
  normalizeTonic,
  rootMidi,
  scaleMidiNotes,
} from "./theory.js";
import type {
  GeneratedSection,
  GeneratedTrack,
  GenerateMusicOptions,
  MusicGenerationResult,
  MusicManifest,
  MusicStyle,
  MusicalMode,
  ResolvedCue,
  VideoCue,
} from "./types.js";

const PPQ = 480;
const BEATS_PER_BAR = 4;
const MIN_NOTE_TICKS = 1;
const DRUM_CHANNEL = 9;
const TRACK_CHANNELS = { harmony: 0, bass: 1, melody: 2, drums: DRUM_CHANNEL } as const;
const DRUMS = { kick: 36, snare: 38, closedHat: 42, openHat: 46, crash: 49 } as const;
type MidiFile = import("@tonejs/midi").Midi;
type MidiTrack = ReturnType<MidiFile["addTrack"]>;
const Midi = (toneMidi as unknown as { Midi: typeof import("@tonejs/midi").Midi }).Midi;

function assertFiniteNumber(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} precisa ser um número finito.`);
  }
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new Error(`${name} precisa estar entre ${min} e ${max}.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addNote(
  track: MidiTrack,
  midi: number,
  startTick: number,
  durationTicks: number,
  velocity: number,
): void {
  if (durationTicks < MIN_NOTE_TICKS || startTick < 0) {
    return;
  }
  track.addNote({
    midi: clamp(Math.round(midi), 0, 127),
    ticks: Math.max(0, Math.round(startTick)),
    durationTicks: Math.max(MIN_NOTE_TICKS, Math.round(durationTicks)),
    velocity: clamp(velocity, 0.01, 1),
  });
}

function makeSections(durationSeconds: number, barSeconds: number, barCount: number): GeneratedSection[] {
  if (barCount <= 2) {
    return [{ name: "body", startSeconds: 0, endSeconds: durationSeconds, startBar: 0, endBar: barCount }];
  }

  const introBars = 1;
  const outroBars = 1;
  const bodyStart = introBars;
  const bodyEnd = Math.max(bodyStart + 1, barCount - outroBars);
  return [
    { name: "intro", startSeconds: 0, endSeconds: Math.min(durationSeconds, barSeconds), startBar: 0, endBar: introBars },
    {
      name: "body",
      startSeconds: Math.min(durationSeconds, bodyStart * barSeconds),
      endSeconds: Math.min(durationSeconds, bodyEnd * barSeconds),
      startBar: bodyStart,
      endBar: bodyEnd,
    },
    {
      name: "outro",
      startSeconds: Math.min(durationSeconds, bodyEnd * barSeconds),
      endSeconds: durationSeconds,
      startBar: bodyEnd,
      endBar: barCount,
    },
  ].filter((section) => section.endSeconds > section.startSeconds) as GeneratedSection[];
}

function sectionForBar(bar: number, barCount: number): GeneratedSection["name"] {
  if (barCount <= 2) return "body";
  if (bar === 0) return "intro";
  if (bar === barCount - 1) return "outro";
  return "body";
}

function validateCues(cues: readonly VideoCue[] | undefined, durationSeconds: number): VideoCue[] {
  if (!cues) return [];
  return cues
    .map((cue, index) => {
      if (!cue || typeof cue !== "object") {
        throw new Error(`Cue ${index + 1} precisa ser um objeto.`);
      }
      assertFiniteNumber(`cues[${index}].timeSeconds`, cue.timeSeconds);
      if (cue.timeSeconds < 0 || cue.timeSeconds >= durationSeconds) {
        throw new Error(`cues[${index}].timeSeconds precisa estar em [0, duração).`);
      }
      const intensity = cue.intensity ?? 1;
      assertFiniteNumber(`cues[${index}].intensity`, intensity);
      assertRange(`cues[${index}].intensity`, intensity, 0, 1);
      return { ...cue, intensity };
    })
    .sort((left, right) => left.timeSeconds - right.timeSeconds);
}

function addVolume(track: MidiTrack, volume: number): void {
  track.addCC({ number: 7, ticks: 0, value: volume });
}

function addHarmony(
  track: MidiTrack,
  symbol: string,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  volume: number,
): void {
  const notes = chordMidiNotes(symbol, 4);
  const duration = endTick - startTick;
  if (style === "upbeat") {
    const stab = Math.max(MIN_NOTE_TICKS, Math.min(duration, Math.round(PPQ * 1.5)));
    addNote(track, notes[0] ?? 60, startTick, stab, volume * 0.65);
    for (const note of notes.slice(1)) addNote(track, note, startTick, stab, volume * 0.55);
    return;
  }
  const velocity = style === "ambient" ? volume * 0.42 : volume * 0.58;
  for (const note of notes) addNote(track, note, startTick, duration, velocity);
}

function addBass(
  track: MidiTrack,
  symbol: string,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  volume: number,
): void {
  const root = rootMidi(symbol, 2);
  const step = style === "upbeat" ? PPQ : style === "lofi" ? PPQ * 2 : endTick - startTick;
  for (let tick = startTick; tick < endTick; tick += step) {
    addNote(track, root, tick, Math.min(step - 20, endTick - tick), volume * (style === "ambient" ? 0.45 : 0.62));
  }
}

function addMelody(
  track: MidiTrack,
  scale: number[],
  startTick: number,
  endTick: number,
  style: MusicStyle,
  volume: number,
  random: ReturnType<typeof createRandomSource>["random"],
  bar: number,
): void {
  const step = style === "ambient" ? PPQ * 2 : style === "lofi" ? PPQ : PPQ / 2;
  let index = (bar * 2) % scale.length;
  for (let tick = startTick; tick < endTick; tick += step) {
    const shouldPlay = style === "ambient" ? random.next() > 0.3 : random.next() > 0.12;
    if (!shouldPlay) continue;
    const note = (scale[index % scale.length] ?? 60) + (style === "upbeat" ? 12 : 0);
    const length = Math.max(MIN_NOTE_TICKS, Math.min(Math.round(step * 0.72), endTick - tick));
    addNote(track, note, tick, length, volume * (style === "ambient" ? 0.38 : 0.48));
    index += random.next() > 0.68 ? 2 : 1;
  }
}

function addDrums(
  track: MidiTrack,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  volume: number,
): void {
  const step = style === "ambient" ? PPQ * 2 : PPQ;
  let beat = 0;
  for (let tick = startTick; tick < endTick; tick += step) {
    const length = Math.min(Math.round(PPQ / 8), endTick - tick);
    if (beat % 4 === 0) addNote(track, DRUMS.kick, tick, length, volume * 0.72);
    if (style !== "ambient" && beat % 4 === 2) addNote(track, DRUMS.snare, tick, length, volume * 0.58);
    if (style === "upbeat" || beat % 2 === 0) addNote(track, DRUMS.closedHat, tick, length, volume * 0.38);
    beat += style === "upbeat" ? 1 : 2;
  }
}

function addCueAccent(
  tracks: Record<GeneratedTrack["name"], MidiTrack>,
  cueTick: number,
  remainingTicks: number,
  intensity: number,
  volume: number,
  tonic: string,
): void {
  const accentDuration = Math.max(MIN_NOTE_TICKS, Math.min(remainingTicks, Math.round(PPQ / 3)));
  const strength = volume * (0.55 + intensity * 0.45);
  const root = rootMidi(`${tonic}${""}`, 4);
  addNote(tracks.drums, DRUMS.crash, cueTick, accentDuration, strength);
  addNote(tracks.drums, DRUMS.kick, cueTick, accentDuration, strength);
  addNote(tracks.harmony, root, cueTick, accentDuration, strength * 0.82);
  addNote(tracks.melody, root + 12, cueTick, accentDuration, strength * 0.78);
}

function trackManifest(name: GeneratedTrack["name"], instrument: number): GeneratedTrack {
  const roles = {
    harmony: "Acordes e sustentação harmônica",
    bass: "Fundamental e pulso grave",
    melody: "Motivo melódico curto",
    drums: "Batidas e acentos de sincronização",
  } as const;
  return { name, role: roles[name], channel: TRACK_CHANNELS[name], instrument };
}

export function generateMusic(options: GenerateMusicOptions): MusicGenerationResult {
  assertFiniteNumber("durationSeconds", options.durationSeconds);
  if (options.durationSeconds <= 0) throw new Error("durationSeconds precisa ser positivo.");

  const style = options.style ?? "ambient";
  if (!Object.hasOwn(PRESETS, style)) throw new Error(`Estilo inválido: ${style}.`);
  const mode: MusicalMode = options.mode ?? "major";
  const tonic = normalizeTonic(options.tonic ?? "C");
  const preset = presetFor(style, mode);
  const bpm = options.bpm ?? preset.bpm;
  assertFiniteNumber("bpm", bpm);
  assertRange("bpm", bpm, 30, 300);
  const volume = options.volume ?? 0.8;
  assertFiniteNumber("volume", volume);
  assertRange("volume", volume, 0, 1);
  const progression = options.progression ?? preset.progression[mode];
  if (!Array.isArray(progression) || progression.length === 0 || progression.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new Error("progression precisa ser uma lista não vazia de graus romanos.");
  }

  const resolvedChords = chordsFromProgression(tonic, progression);
  const cues = validateCues(options.cues, options.durationSeconds);
  const { seed, random } = createRandomSource(options.seed);
  const midi = new Midi();
  midi.name = `Auto-MIDI ${style} ${tonic} ${mode}`;
  midi.header.setTempo(bpm);
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
  // @tonejs/midi@2.0.28 encodes key-signature indices with the wrong offset.
  // Keep tonic/mode in the manifest until that dependency fixes its encoder.
  midi.header.keySignatures = [];
  midi.header.update();

  const tracks = {
    harmony: midi.addTrack(),
    bass: midi.addTrack(),
    melody: midi.addTrack(),
    drums: midi.addTrack(),
  };
  tracks.harmony.name = "Harmony";
  tracks.harmony.channel = TRACK_CHANNELS.harmony;
  tracks.harmony.instrument.number = preset.instruments.harmony;
  tracks.bass.name = "Bass";
  tracks.bass.channel = TRACK_CHANNELS.bass;
  tracks.bass.instrument.number = preset.instruments.bass;
  tracks.melody.name = "Melody";
  tracks.melody.channel = TRACK_CHANNELS.melody;
  tracks.melody.instrument.number = preset.instruments.melody;
  tracks.drums.name = "Drums";
  tracks.drums.channel = DRUM_CHANNEL;
  addVolume(tracks.harmony, volume);
  addVolume(tracks.bass, volume);
  addVolume(tracks.melody, volume);
  addVolume(tracks.drums, volume);

  const barSeconds = (60 / bpm) * BEATS_PER_BAR;
  const barTicks = PPQ * BEATS_PER_BAR;
  const endTick = midi.header.secondsToTicks(options.durationSeconds);
  const barCount = Math.max(1, Math.ceil(options.durationSeconds / barSeconds));
  const scale = scaleMidiNotes(tonic, mode, 4);

  for (let bar = 0; bar < barCount; bar += 1) {
    const startTick = bar * barTicks;
    if (startTick >= endTick) break;
    const barEndTick = Math.min(endTick, startTick + barTicks);
    const chordIndex = bar % resolvedChords.length;
    const symbol = bar === barCount - 1 ? (mode === "minor" ? `${tonic}m` : tonic) : resolvedChords[chordIndex] as string;
    const section = sectionForBar(bar, barCount);
    const sectionFactor = section === "intro" ? 0.82 : section === "outro" ? 0.92 : 1;
    addHarmony(tracks.harmony, symbol, startTick, barEndTick, style, volume * sectionFactor);
    addBass(tracks.bass, symbol, startTick, barEndTick, style, volume * sectionFactor);
    addMelody(tracks.melody, scale, startTick, barEndTick, style, volume * sectionFactor, random, bar);
    addDrums(tracks.drums, startTick, barEndTick, style, volume * sectionFactor);
  }

  // Keep a resolving tonic alive through the exact requested end tick.
  const finalStartTick = Math.max(0, endTick - PPQ);
  const finalChord = mode === "minor" ? `${tonic}m` : tonic;
  for (const note of chordMidiNotes(finalChord, 4)) {
    addNote(tracks.harmony, note, finalStartTick, endTick - finalStartTick, volume * 0.48);
  }
  addNote(tracks.bass, rootMidi(finalChord, 2), finalStartTick, endTick - finalStartTick, volume * 0.5);

  const resolvedCues: ResolvedCue[] = cues.map((cue, index) => {
    const tick = midi.header.secondsToTicks(cue.timeSeconds);
    const actualTimeSeconds = midi.header.ticksToSeconds(tick);
    addCueAccent(tracks, tick, Math.max(MIN_NOTE_TICKS, endTick - tick), cue.intensity ?? 1, volume, tonic);
    return {
      id: cue.id?.trim() || `cue-${index + 1}`,
      requestedTimeSeconds: cue.timeSeconds,
      actualTimeSeconds,
      tick,
      driftSeconds: actualTimeSeconds - cue.timeSeconds,
      intensity: cue.intensity ?? 1,
    };
  });

  const sections = makeSections(options.durationSeconds, barSeconds, barCount);
  const manifest: MusicManifest = {
    schemaVersion: 1,
    durationSeconds: options.durationSeconds,
    midiDurationSeconds: midi.duration,
    style,
    tonic,
    mode,
    progression: [...progression],
    resolvedChords,
    bpm,
    volume,
    seed,
    timeSignature: [4, 4],
    ppq: midi.header.ppq,
    sections,
    tracks: [
      trackManifest("harmony", preset.instruments.harmony),
      trackManifest("bass", preset.instruments.bass),
      trackManifest("melody", preset.instruments.melody),
      trackManifest("drums", 0),
    ],
    cues: resolvedCues,
  };

  return { midi: midi.toArray(), manifest };
}

export { PRESETS };
