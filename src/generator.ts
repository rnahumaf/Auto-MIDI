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
  GeneratedBeat,
  GeneratedSection,
  GeneratedTrack,
  GenerateMusicOptions,
  MusicGenerationResult,
  MusicManifest,
  MusicStyle,
  MusicalMode,
  ResolvedCue,
  SeedInput,
  VideoCue,
} from "./types.js";

const PPQ = 480;
const BEATS_PER_BAR = 4;
const MIN_NOTE_TICKS = 1;
const MAX_DURATION_SECONDS = 60 * 60;
const MAX_CUES = 1_000;
const MAX_PROGRESSION_LENGTH = 64;
const DRUM_CHANNEL = 9;
const TRACK_CHANNELS = { harmony: 0, bass: 1, melody: 2, drums: DRUM_CHANNEL } as const;
const DRUMS = { kick: 36, snare: 38, closedHat: 42, openHat: 46, crash: 49 } as const;
type MidiFile = import("@tonejs/midi").Midi;
type MidiTrack = ReturnType<MidiFile["addTrack"]>;
const Midi = (toneMidi as unknown as { Midi: typeof import("@tonejs/midi").Midi }).Midi;

interface NormalizedOptions {
  durationSeconds: number;
  style: MusicStyle;
  tonic: string;
  mode: MusicalMode;
  progression: string[];
  bpm: number;
  volume: number;
  seed: SeedInput | undefined;
  cues: VideoCue[];
}

interface MelodyState {
  index: number;
  direction: 1 | -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function validateCues(value: unknown, durationSeconds: number): VideoCue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("cues precisa ser uma lista.");
  if (value.length > MAX_CUES) throw new Error(`cues aceita no máximo ${MAX_CUES} itens.`);

  return value
    .map((candidate, index) => {
      if (!isRecord(candidate)) throw new Error(`Cue ${index + 1} precisa ser um objeto.`);
      assertFiniteNumber(`cues[${index}].timeSeconds`, candidate.timeSeconds);
      if (candidate.timeSeconds < 0 || candidate.timeSeconds >= durationSeconds) {
        throw new Error(`cues[${index}].timeSeconds precisa estar em [0, duração).`);
      }

      const intensity = candidate.intensity ?? 1;
      assertFiniteNumber(`cues[${index}].intensity`, intensity);
      assertRange(`cues[${index}].intensity`, intensity, 0, 1);
      if (candidate.id !== undefined && typeof candidate.id !== "string") {
        throw new Error(`cues[${index}].id precisa ser uma string.`);
      }

      const cue: VideoCue = { timeSeconds: candidate.timeSeconds, intensity };
      const id = candidate.id?.trim();
      if (id) cue.id = id;
      return cue;
    })
    .sort((left, right) => left.timeSeconds - right.timeSeconds);
}

function normalizeOptions(options: GenerateMusicOptions): NormalizedOptions {
  if (!isRecord(options)) throw new Error("options precisa ser um objeto.");

  assertFiniteNumber("durationSeconds", options.durationSeconds);
  if (options.durationSeconds <= 0) throw new Error("durationSeconds precisa ser positivo.");
  if (options.durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`durationSeconds aceita no máximo ${MAX_DURATION_SECONDS} segundos.`);
  }

  const styleValue = options.style ?? "ambient";
  if (typeof styleValue !== "string" || !Object.hasOwn(PRESETS, styleValue)) {
    throw new Error(`Estilo inválido: ${String(styleValue)}.`);
  }
  const style = styleValue as MusicStyle;

  const modeValue = options.mode ?? "major";
  if (modeValue !== "major" && modeValue !== "minor") {
    throw new Error(`Modo inválido: ${String(modeValue)}. Use major ou minor.`);
  }
  const mode = modeValue;

  const tonicValue = options.tonic ?? "C";
  if (typeof tonicValue !== "string") throw new Error("tonic precisa ser uma string.");
  const tonic = normalizeTonic(tonicValue);
  const preset = presetFor(style);

  const bpm = options.bpm ?? preset.bpm;
  assertFiniteNumber("bpm", bpm);
  assertRange("bpm", bpm, 30, 300);
  const volume = options.volume ?? 0.8;
  assertFiniteNumber("volume", volume);
  assertRange("volume", volume, 0, 1);

  const progressionValue = options.progression ?? preset.progression[mode];
  if (!Array.isArray(progressionValue) || progressionValue.length === 0) {
    throw new Error("progression precisa ser uma lista não vazia de graus romanos.");
  }
  if (progressionValue.length > MAX_PROGRESSION_LENGTH) {
    throw new Error(`progression aceita no máximo ${MAX_PROGRESSION_LENGTH} graus.`);
  }
  const progression = progressionValue.map((degree, index) => {
    if (typeof degree !== "string" || degree.trim() === "") {
      throw new Error(`progression[${index}] precisa ser um grau romano não vazio.`);
    }
    return degree;
  });

  const seed = options.seed;
  if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
    throw new Error("seed precisa ser uma string ou um número.");
  }
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new Error("seed numérica precisa ser finita.");
  }

  return {
    durationSeconds: options.durationSeconds,
    style,
    tonic,
    mode,
    progression,
    bpm,
    volume,
    seed,
    cues: validateCues(options.cues, options.durationSeconds),
  };
}

function addNote(
  track: MidiTrack,
  midiValue: number,
  startTick: number,
  durationTicks: number,
  velocity: number,
): void {
  const midi = clamp(Math.round(midiValue), 0, 127);
  const start = Math.max(0, Math.round(startTick));
  let end = start + Math.max(MIN_NOTE_TICKS, Math.round(durationTicks));
  if (durationTicks < MIN_NOTE_TICKS || startTick < 0) return;

  for (const existing of track.notes) {
    if (existing.midi !== midi) continue;
    const existingEnd = existing.ticks + existing.durationTicks;
    if (existing.ticks === start) {
      existing.velocity = Math.max(existing.velocity, clamp(velocity, 0.01, 1));
      existing.durationTicks = Math.max(existing.durationTicks, end - start);
      return;
    }
    if (existing.ticks < start && existingEnd > start) {
      existing.durationTicks = Math.max(MIN_NOTE_TICKS, start - existing.ticks);
    } else if (existing.ticks > start && existing.ticks < end) {
      end = existing.ticks;
    }
  }

  if (end <= start) return;
  track.addNote({
    midi,
    ticks: start,
    durationTicks: end - start,
    velocity: clamp(velocity, 0.01, 1),
  });
}

function makeSections(durationSeconds: number, barSeconds: number, barCount: number): GeneratedSection[] {
  if (barCount <= 2) {
    return [{ name: "body", startSeconds: 0, endSeconds: durationSeconds, startBar: 0, endBar: barCount }];
  }

  const bodyEnd = Math.max(2, barCount - 1);
  return [
    { name: "intro", startSeconds: 0, endSeconds: Math.min(durationSeconds, barSeconds), startBar: 0, endBar: 1 },
    {
      name: "body",
      startSeconds: Math.min(durationSeconds, barSeconds),
      endSeconds: Math.min(durationSeconds, bodyEnd * barSeconds),
      startBar: 1,
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

function makeBeats(header: MidiFile["header"], endTick: number): GeneratedBeat[] {
  const beats: GeneratedBeat[] = [];
  for (let tick = 0; tick < endTick; tick += PPQ) {
    const beatIndex = Math.floor(tick / PPQ) % BEATS_PER_BAR;
    beats.push({
      bar: Math.floor(tick / (PPQ * BEATS_PER_BAR)) + 1,
      beat: beatIndex + 1,
      tick,
      timeSeconds: header.ticksToSeconds(tick),
      strength: beatIndex === 0 ? "strong" : beatIndex === 2 ? "secondary" : "weak",
    });
  }
  return beats;
}

function addVolume(track: MidiTrack, volume: number): void {
  track.addCC({ number: 7, ticks: 0, value: volume });
}

function addHarmony(
  track: MidiTrack,
  notes: readonly number[],
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  sustainToEnd: boolean,
): void {
  const duration = endTick - startTick;
  if (style === "upbeat" && !sustainToEnd) {
    const stab = Math.min(duration, Math.round(PPQ * 1.5));
    notes.forEach((note, index) => addNote(track, note, startTick, stab, dynamics * (index === 0 ? 0.65 : 0.55)));
    return;
  }
  const velocity = style === "ambient" ? dynamics * 0.42 : dynamics * 0.58;
  for (const note of notes) addNote(track, note, startTick, duration, velocity);
}

function addBass(
  track: MidiTrack,
  root: number,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  sustainToEnd: boolean,
): void {
  if (sustainToEnd) {
    addNote(track, root, startTick, endTick - startTick, dynamics * 0.55);
    return;
  }

  const step = style === "upbeat" ? PPQ : style === "lofi" ? PPQ * 2 : endTick - startTick;
  for (let tick = startTick; tick < endTick; tick += step) {
    const available = endTick - tick;
    const duration = available <= 20 ? available : Math.min(step - 20, available);
    addNote(track, root, tick, duration, dynamics * (style === "ambient" ? 0.45 : 0.62));
  }
}

function advanceMelody(state: MelodyState, scaleLength: number, step: number): void {
  let next = state.index + step * state.direction;
  if (next >= scaleLength) {
    state.direction = -1;
    next = Math.max(0, scaleLength - 1 - step);
  } else if (next < 0) {
    state.direction = 1;
    next = Math.min(scaleLength - 1, step);
  }
  state.index = next;
}

function addMelody(
  track: MidiTrack,
  scale: readonly number[],
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  random: ReturnType<typeof createRandomSource>["random"],
  state: MelodyState,
): void {
  const stepTicks = style === "ambient" ? PPQ * 2 : style === "lofi" ? PPQ : PPQ / 2;
  for (let tick = startTick; tick < endTick; tick += stepTicks) {
    if (random.next() > (style === "ambient" ? 0.3 : 0.12)) {
      const note = scale[state.index] ?? scale[0] ?? 60;
      const length = Math.min(Math.round(stepTicks * 0.72), endTick - tick);
      addNote(track, note, tick, length, dynamics * (style === "ambient" ? 0.38 : 0.48));
    }
    advanceMelody(state, scale.length, random.next() > 0.68 ? 2 : 1);
  }
}

function addDrum(track: MidiTrack, midi: number, tick: number, endTick: number, velocity: number): void {
  if (tick >= endTick) return;
  addNote(track, midi, tick, Math.min(Math.round(PPQ / 8), endTick - tick), velocity);
}

function addDrums(
  track: MidiTrack,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
): void {
  if (style === "ambient") {
    addDrum(track, DRUMS.kick, startTick, endTick, dynamics * 0.55);
    addDrum(track, DRUMS.closedHat, startTick, endTick, dynamics * 0.24);
    addDrum(track, DRUMS.closedHat, startTick + PPQ * 2, endTick, dynamics * 0.2);
    return;
  }

  if (style === "lofi") {
    const swing = Math.round(PPQ / 12);
    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      const straightTick = startTick + beat * PPQ;
      const swungTick = straightTick + (beat % 2 === 1 ? swing : 0);
      if (beat === 0 || beat === 2) addDrum(track, DRUMS.kick, straightTick, endTick, dynamics * 0.68);
      if (beat === 1 || beat === 3) addDrum(track, DRUMS.snare, swungTick, endTick, dynamics * 0.56);
      addDrum(track, DRUMS.closedHat, swungTick, endTick, dynamics * 0.32);
    }
    return;
  }

  for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth += 1) {
    const tick = startTick + eighth * (PPQ / 2);
    addDrum(track, eighth === 7 ? DRUMS.openHat : DRUMS.closedHat, tick, endTick, dynamics * 0.36);
    if (eighth === 0 || eighth === 4) addDrum(track, DRUMS.kick, tick, endTick, dynamics * 0.76);
    if (eighth === 2 || eighth === 6) addDrum(track, DRUMS.snare, tick, endTick, dynamics * 0.64);
  }
}

function addCueAccent(
  tracks: Record<GeneratedTrack["name"], MidiTrack>,
  cueTick: number,
  remainingTicks: number,
  intensity: number,
  chordSymbol: string,
): void {
  const duration = Math.min(remainingTicks, Math.round(PPQ / 3));
  const strength = 0.55 + intensity * 0.4;
  const root = rootMidi(chordSymbol, 4);
  addNote(tracks.drums, DRUMS.crash, cueTick, duration, strength);
  addNote(tracks.drums, DRUMS.kick, cueTick, duration, strength);
  addNote(tracks.harmony, root, cueTick, duration, strength * 0.82);
  addNote(tracks.melody, root + 12, cueTick, duration, strength * 0.78);
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
  const normalized = normalizeOptions(options);
  const { durationSeconds, style, tonic, mode, progression, bpm, volume, seed: seedInput, cues } = normalized;
  const preset = presetFor(style);
  const resolvedChords = chordsFromProgression(tonic, progression);
  const { seed, random } = createRandomSource(seedInput);
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
  Object.values(tracks).forEach((track) => addVolume(track, volume));

  const barSeconds = (60 / bpm) * BEATS_PER_BAR;
  const barTicks = PPQ * BEATS_PER_BAR;
  const endTick = Math.max(MIN_NOTE_TICKS, midi.header.secondsToTicks(durationSeconds));
  const barCount = Math.max(1, Math.ceil(endTick / barTicks));
  const scale = scaleMidiNotes(tonic, mode, style === "upbeat" ? 5 : 4);
  const finalChord = mode === "minor" ? `${tonic}m` : tonic;
  const barChords: string[] = [];
  const melodyState: MelodyState = { index: 0, direction: 1 };
  let previousVoicing: number[] | undefined;

  for (let bar = 0; bar < barCount; bar += 1) {
    const startTick = bar * barTicks;
    if (startTick >= endTick) break;
    const barEndTick = Math.min(endTick, startTick + barTicks);
    const isLastBar = bar === barCount - 1;
    const symbol = isLastBar ? finalChord : resolvedChords[bar % resolvedChords.length] as string;
    barChords.push(symbol);
    const section = sectionForBar(bar, barCount);
    const dynamics = section === "intro" ? 0.82 : section === "outro" ? 0.9 : 1;
    const voicing = chordMidiNotes(symbol, 4, previousVoicing);
    previousVoicing = voicing;

    addHarmony(tracks.harmony, voicing, startTick, barEndTick, style, dynamics, isLastBar);
    addBass(tracks.bass, rootMidi(symbol, 2), startTick, barEndTick, style, dynamics, isLastBar);
    if (isLastBar) {
      const resolutionStart = Math.max(startTick, barEndTick - PPQ);
      addNote(
        tracks.melody,
        rootMidi(finalChord, style === "upbeat" ? 5 : 4),
        resolutionStart,
        barEndTick - resolutionStart,
        dynamics * 0.48,
      );
    } else {
      addMelody(tracks.melody, scale, startTick, barEndTick, style, dynamics, random, melodyState);
    }
    addDrums(tracks.drums, startTick, barEndTick, style, dynamics);
  }

  const resolvedCues: ResolvedCue[] = cues.map((cue, index) => {
    const tick = clamp(midi.header.secondsToTicks(cue.timeSeconds), 0, endTick - 1);
    const actualTimeSeconds = midi.header.ticksToSeconds(tick);
    const barIndex = Math.min(barChords.length - 1, Math.floor(tick / barTicks));
    addCueAccent(tracks, tick, endTick - tick, cue.intensity ?? 1, barChords[barIndex] ?? finalChord);
    return {
      id: cue.id ?? `cue-${index + 1}`,
      requestedTimeSeconds: cue.timeSeconds,
      actualTimeSeconds,
      tick,
      driftSeconds: actualTimeSeconds - cue.timeSeconds,
      intensity: cue.intensity ?? 1,
    };
  });

  const manifest: MusicManifest = {
    schemaVersion: 1,
    algorithmVersion: 1,
    durationSeconds,
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
    sections: makeSections(durationSeconds, barSeconds, barCount),
    beats: makeBeats(midi.header, endTick),
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
