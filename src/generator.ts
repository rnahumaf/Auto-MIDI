import toneMidi from "@tonejs/midi";
import { createRandomSource, type RandomSource } from "./random.js";
import { presetFor, PRESETS } from "./presets.js";
import {
  chordMidiNotes,
  chordToneMidiNotes,
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
const DRUMS = {
  kick: 36,
  sideStick: 37,
  snare: 38,
  closedHat: 42,
  lowTom: 45,
  openHat: 46,
  crash: 49,
  tambourine: 54,
} as const;
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
  lastMidi?: number;
  motif: number[];
  motifIndex: number;
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

function addMixControls(
  track: MidiTrack,
  volume: number,
  pan: number,
  reverb: number,
  chorus: number,
): void {
  addVolume(track, volume);
  track.addCC({ number: 10, ticks: 0, value: pan });
  track.addCC({ number: 91, ticks: 0, value: reverb });
  track.addCC({ number: 93, ticks: 0, value: chorus });
}

function variedVelocity(base: number, random: RandomSource, amount = 0.04): number {
  return clamp(base + (random.next() * 2 - 1) * amount, 0.02, 1);
}

function addExpression(track: MidiTrack, tick: number, value: number): void {
  track.addCC({ number: 11, ticks: Math.max(0, Math.round(tick)), value: clamp(value, 0, 1) });
}

function addHarmony(
  track: MidiTrack,
  notes: readonly number[],
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  section: GeneratedSection["name"],
  barIndex: number,
  random: RandomSource,
  sustainToEnd: boolean,
): void {
  const duration = endTick - startTick;
  if (sustainToEnd || style === "ambient") {
    const base = style === "ambient" ? 0.38 : 0.52;
    notes.forEach((note, index) => {
      const balance = index === 0 ? 0.92 : index === notes.length - 1 ? 0.82 : 0.74;
      addNote(track, note, startTick, duration, variedVelocity(dynamics * base * balance, random, 0.025));
    });
    return;
  }

  const offsets = style === "lofi"
    ? section === "intro" ? [0] : [0, Math.round(PPQ * 2.5) + Math.round(PPQ / 12)]
    : section === "intro" ? [0, PPQ * 2] : [0, Math.round(PPQ * 1.5), Math.round(PPQ * 2.5)];
  const noteLength = style === "lofi" ? Math.round(PPQ * 1.18) : Math.round(PPQ * 0.68);
  for (const [attackIndex, offset] of offsets.entries()) {
    const tick = startTick + offset;
    if (tick >= endTick) continue;
    const accent = attackIndex === 0 ? 1 : 0.86 + (barIndex % 2) * 0.04;
    for (const [noteIndex, note] of notes.entries()) {
      const balance = noteIndex === 0 ? 0.88 : noteIndex === notes.length - 1 ? 0.8 : 0.72;
      addNote(
        track,
        note,
        tick,
        Math.min(noteLength, endTick - tick),
        variedVelocity(dynamics * 0.62 * balance * accent, random, 0.035),
      );
    }
  }
}

function addBass(
  track: MidiTrack,
  chordSymbol: string,
  nextChordSymbol: string,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  section: GeneratedSection["name"],
  barIndex: number,
  random: RandomSource,
  sustainToEnd: boolean,
): void {
  const root = rootMidi(chordSymbol, 2);
  if (sustainToEnd) {
    addNote(track, root, startTick, endTick - startTick, variedVelocity(dynamics * 0.52, random, 0.025));
    return;
  }

  const chordTones = chordToneMidiNotes(chordSymbol, 2);
  const fifth = chordTones[2] ?? root + 7;
  const nextRoot = rootMidi(nextChordSymbol, 2);

  if (style === "ambient") {
    const moveAt = section === "body" && barIndex % 2 === 1 ? startTick + PPQ * 3 : endTick;
    addNote(track, root, startTick, moveAt - startTick, variedVelocity(dynamics * 0.4, random, 0.02));
    if (moveAt < endTick) {
      addNote(track, fifth, moveAt, endTick - moveAt, variedVelocity(dynamics * 0.32, random, 0.02));
    }
    return;
  }

  const events = style === "lofi"
    ? section === "intro"
      ? [[0, root], [PPQ * 2, fifth]] as const
      : [[0, root], [Math.round(PPQ * 1.5), fifth], [PPQ * 2, root], [Math.round(PPQ * 3.5), nextRoot]] as const
    : section === "intro"
      ? [[0, root], [PPQ * 2, root + 12]] as const
      : [[0, root], [PPQ, fifth], [PPQ * 2, root + 12], [PPQ * 3, fifth], [Math.round(PPQ * 3.5), nextRoot]] as const;
  const length = style === "lofi" ? Math.round(PPQ * 0.62) : Math.round(PPQ * 0.44);
  for (const [offset, note] of events) {
    const tick = startTick + offset;
    if (tick >= endTick) continue;
    addNote(
      track,
      note,
      tick,
      Math.min(length, endTick - tick),
      variedVelocity(dynamics * (style === "lofi" ? 0.56 : 0.62), random, 0.045),
    );
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

function nearestNote(target: number, candidates: readonly number[]): number {
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best,
  );
}

function melodyRhythm(
  style: MusicStyle,
  section: GeneratedSection["name"],
  barIndex: number,
): readonly number[] {
  if (style === "ambient") {
    if (section === "intro") return [PPQ * 2];
    return barIndex % 2 === 0 ? [0, PPQ * 2] : [PPQ, PPQ * 3];
  }
  if (style === "lofi") {
    const swing = Math.round(PPQ / 6);
    return barIndex % 2 === 0
      ? [0, PPQ / 2 + swing, PPQ * 2, PPQ * 2.5 + swing, PPQ * 3]
      : [PPQ / 2 + swing, PPQ, PPQ * 2.5 + swing, PPQ * 3.5 + swing];
  }
  return barIndex % 2 === 0
    ? [0, PPQ / 2, PPQ, PPQ * 2, PPQ * 2.5, PPQ * 3.5]
    : [0, PPQ, PPQ * 1.5, PPQ * 2, PPQ * 3, PPQ * 3.5];
}

function addMelody(
  track: MidiTrack,
  scale: readonly number[],
  chordSymbol: string,
  startTick: number,
  endTick: number,
  style: MusicStyle,
  dynamics: number,
  section: GeneratedSection["name"],
  barIndex: number,
  random: RandomSource,
  state: MelodyState,
): void {
  const chordBase = chordToneMidiNotes(chordSymbol, style === "upbeat" ? 5 : 4);
  const chordTones = [...chordBase, ...chordBase.map((note) => note + 12)]
    .filter((note) => note >= (scale[0] ?? 60) && note <= (scale.at(-1) ?? 84));
  const rhythm = melodyRhythm(style, section, barIndex);
  const baseLength = style === "ambient" ? PPQ * 1.45 : style === "lofi" ? PPQ * 0.62 : PPQ * 0.38;

  for (const [eventIndex, offset] of rhythm.entries()) {
    const tick = startTick + Math.round(offset);
    if (tick >= endTick) continue;
    if (style === "ambient" && random.next() < 0.24) continue;

    const beat = Math.floor(offset / PPQ);
    const isMetricAnchor = offset % PPQ === 0 && (beat === 0 || beat === 2);
    let note: number;
    if (isMetricAnchor && chordTones.length > 0) {
      const target = state.lastMidi ?? scale[state.index] ?? scale[0] ?? 60;
      note = nearestNote(target, chordTones);
      const scaleIndex = scale.indexOf(note);
      if (scaleIndex >= 0) state.index = scaleIndex;
    } else {
      const motifStep = state.motif[state.motifIndex % state.motif.length] ?? 1;
      state.motifIndex += 1;
      advanceMelody(state, scale.length, Math.max(1, Math.abs(motifStep)));
      note = scale[state.index] ?? scale[0] ?? 60;
    }

    state.lastMidi = note;
    const accent = isMetricAnchor ? 1 : eventIndex % 2 === 0 ? 0.88 : 0.78;
    addNote(
      track,
      note,
      tick,
      Math.min(Math.round(baseLength), endTick - tick),
      variedVelocity(dynamics * (style === "ambient" ? 0.34 : style === "lofi" ? 0.42 : 0.46) * accent, random),
    );
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
  section: GeneratedSection["name"],
  barIndex: number,
  random: RandomSource,
): void {
  if (style === "ambient") {
    if (section === "body" && barIndex % 2 === 0) {
      addDrum(track, DRUMS.kick, startTick, endTick, variedVelocity(dynamics * 0.32, random, 0.025));
    }
    if (section !== "outro") {
      addDrum(track, DRUMS.closedHat, startTick + PPQ * 2, endTick, variedVelocity(dynamics * 0.14, random, 0.02));
    }
    if (section === "body" && barIndex % 4 === 3) {
      addDrum(track, DRUMS.lowTom, startTick + PPQ * 3, endTick, variedVelocity(dynamics * 0.24, random, 0.025));
    }
    return;
  }

  if (style === "lofi") {
    const swing = Math.round(PPQ / 6);
    const laidBack = Math.round(PPQ / 24);
    for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth += 1) {
      const tick = startTick + eighth * (PPQ / 2) + (eighth % 2 === 1 ? swing : 0);
      if (section === "body" || eighth % 2 === 0) {
        const hatAccent = eighth % 2 === 0 ? 1 : 0.7;
        addDrum(track, DRUMS.closedHat, tick, endTick, variedVelocity(dynamics * 0.24 * hatAccent, random, 0.025));
      }
    }
    const kickOffsets = section === "outro"
      ? [0]
      : barIndex % 2 === 0 ? [0, Math.round(PPQ * 2.5)] : [0, Math.round(PPQ * 1.5), PPQ * 3];
    if (section !== "intro") {
      for (const offset of kickOffsets) {
        addDrum(track, DRUMS.kick, startTick + offset, endTick, variedVelocity(dynamics * 0.56, random, 0.035));
      }
    }
    const snareBeats = section === "outro" ? [1] : [1, 3];
    for (const beat of snareBeats) {
      addDrum(track, DRUMS.snare, startTick + beat * PPQ + laidBack, endTick, variedVelocity(dynamics * 0.48, random, 0.03));
    }
    if (section === "body" && barIndex % 4 === 3) {
      addDrum(track, DRUMS.sideStick, startTick + Math.round(PPQ * 3.5) + swing, endTick, dynamics * 0.24);
    }
    return;
  }

  for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth += 1) {
    const tick = startTick + eighth * (PPQ / 2);
    const open = eighth === 7 && section === "body" && barIndex % 2 === 1;
    if (section === "body" || eighth % 2 === 0) {
      addDrum(
        track,
        open ? DRUMS.openHat : DRUMS.closedHat,
        tick,
        endTick,
        variedVelocity(dynamics * (eighth % 2 === 0 ? 0.3 : 0.22), random, 0.025),
      );
    }
    const kickHit = section === "body"
      ? eighth === 0 || eighth === 4 || (barIndex % 2 === 1 && eighth === 5)
      : eighth === 0;
    if (kickHit) addDrum(track, DRUMS.kick, tick, endTick, variedVelocity(dynamics * 0.64, random, 0.035));
    const snareHit = section === "body" ? eighth === 2 || eighth === 6 : eighth === 2;
    if (snareHit) {
      addDrum(track, DRUMS.snare, tick, endTick, variedVelocity(dynamics * 0.56, random, 0.03));
    }
  }
  if (section === "body" && barIndex % 4 === 3) {
    addDrum(track, DRUMS.lowTom, startTick + PPQ * 3, endTick, dynamics * 0.42);
    addDrum(track, DRUMS.lowTom + 2, startTick + Math.round(PPQ * 3.5), endTick, dynamics * 0.48);
  }
}

function activeNotesAt(track: MidiTrack, tick: number): MidiTrack["notes"] {
  return track.notes.filter((note) => note.ticks <= tick && note.ticks + note.durationTicks > tick);
}

function retriggerActiveNote(track: MidiTrack, tick: number, velocity: number, targetMidi = 66): boolean {
  const active = activeNotesAt(track, tick);
  if (active.length === 0) return false;
  const note = active.reduce((best, candidate) =>
    Math.abs(candidate.midi - targetMidi) < Math.abs(best.midi - targetMidi) ? candidate : best,
  );
  if (note.ticks === tick) {
    note.velocity = Math.max(note.velocity, velocity);
    return true;
  }
  const originalEnd = note.ticks + note.durationTicks;
  note.durationTicks = Math.max(MIN_NOTE_TICKS, tick - note.ticks);
  addNote(track, note.midi, tick, originalEnd - tick, Math.max(note.velocity, velocity));
  return true;
}

function addCueAccent(
  tracks: Record<GeneratedTrack["name"], MidiTrack>,
  cueTick: number,
  remainingTicks: number,
  intensity: number,
  chordSymbol: string,
  style: MusicStyle,
): void {
  if (intensity <= 0 || remainingTicks <= 0) return;
  const duration = Math.min(remainingTicks, Math.round(PPQ / 3));
  const chordTones = chordToneMidiNotes(chordSymbol, 4);
  const middleTone = nearestNote(66, chordTones);

  if (style === "ambient") {
    const strength = 0.22 + intensity * 0.28;
    if (!retriggerActiveNote(tracks.harmony, cueTick, strength, middleTone)) {
      addNote(tracks.harmony, middleTone, cueTick, duration, strength);
    }
    return;
  }

  if (style === "lofi") {
    const strength = 0.18 + intensity * 0.38;
    addDrum(tracks.drums, DRUMS.sideStick, cueTick, cueTick + duration, strength);
    if (intensity >= 0.72) {
      addDrum(tracks.drums, DRUMS.kick, cueTick, cueTick + duration, 0.18 + intensity * 0.32);
    }
    if (!retriggerActiveNote(tracks.harmony, cueTick, strength * 0.82, middleTone)) {
      addNote(tracks.harmony, middleTone, cueTick, duration, strength * 0.82);
    }
    retriggerActiveNote(tracks.melody, cueTick, strength * 0.74, middleTone + 7);
    return;
  }

  const strength = 0.28 + intensity * 0.38;
  addDrum(tracks.drums, DRUMS.kick, cueTick, cueTick + duration, strength);
  if (intensity >= 0.85) {
    addDrum(tracks.drums, DRUMS.crash, cueTick, cueTick + duration, 0.28 + intensity * 0.34);
  } else {
    addDrum(tracks.drums, DRUMS.tambourine, cueTick, cueTick + duration, strength * 0.72);
  }
  if (!retriggerActiveNote(tracks.harmony, cueTick, strength * 0.76, middleTone)) {
    addNote(tracks.harmony, middleTone, cueTick, duration, strength * 0.76);
  }
  if (!retriggerActiveNote(tracks.melody, cueTick, strength * 0.72, middleTone + 7)) {
    const melodyTone = nearestNote(76, [...chordTones, ...chordTones.map((note) => note + 12)]);
    addNote(tracks.melody, melodyTone, cueTick, duration, strength * 0.72);
  }
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
  addMixControls(tracks.harmony, volume, 0.42, style === "ambient" ? 0.68 : 0.42, 0.38);
  addMixControls(tracks.bass, volume, 0.5, 0.12, 0.08);
  addMixControls(tracks.melody, volume, 0.58, style === "ambient" ? 0.52 : 0.34, 0.22);
  addMixControls(tracks.drums, volume, 0.5, style === "ambient" ? 0.3 : 0.18, 0.05);

  const barSeconds = (60 / bpm) * BEATS_PER_BAR;
  const barTicks = PPQ * BEATS_PER_BAR;
  const endTick = Math.max(MIN_NOTE_TICKS, midi.header.secondsToTicks(durationSeconds));
  const barCount = Math.max(1, Math.ceil(endTick / barTicks));
  const baseScale = scaleMidiNotes(tonic, mode, style === "upbeat" ? 5 : 4);
  const melodyCeiling = style === "upbeat" ? 88 : 84;
  const scale = [...baseScale, ...baseScale.map((note) => note + 12)].filter((note) => note <= melodyCeiling);
  const finalChord = mode === "minor" ? `${tonic}m` : tonic;
  const barChords: string[] = [];
  const melodyState: MelodyState = {
    index: Math.min(2, scale.length - 1),
    direction: 1,
    motif: Array.from({ length: 8 }, () => random.pick([-2, -1, 1, 1, 2, 3])),
    motifIndex: 0,
  };
  let previousVoicing: number[] | undefined;

  for (let bar = 0; bar < barCount; bar += 1) {
    const startTick = bar * barTicks;
    if (startTick >= endTick) break;
    const barEndTick = Math.min(endTick, startTick + barTicks);
    const isLastBar = bar === barCount - 1;
    const symbol = isLastBar ? finalChord : resolvedChords[bar % resolvedChords.length] as string;
    const nextSymbol = bar + 1 === barCount - 1
      ? finalChord
      : resolvedChords[(bar + 1) % resolvedChords.length] as string;
    barChords.push(symbol);
    const section = sectionForBar(bar, barCount);
    const dynamics = section === "intro" ? 0.82 : section === "outro" ? 0.9 : 1;
    const voicing = chordMidiNotes(symbol, 4, previousVoicing);
    previousVoicing = voicing;

    const expression = section === "intro" ? 0.74 : section === "outro" ? 0.82 : 1;
    Object.values(tracks).forEach((track) => addExpression(track, startTick, expression));

    addHarmony(tracks.harmony, voicing, startTick, barEndTick, style, dynamics, section, bar, random, isLastBar);
    addBass(tracks.bass, symbol, nextSymbol, startTick, barEndTick, style, dynamics, section, bar, random, isLastBar);
    if (isLastBar) {
      const resolutionStart = Math.max(startTick, barEndTick - PPQ);
      const resolutionBase = rootMidi(finalChord, style === "upbeat" ? 5 : 4);
      const resolutionNote = nearestNote(
        melodyState.lastMidi ?? resolutionBase,
        [resolutionBase - 12, resolutionBase, resolutionBase + 12].filter((note) => note >= 48 && note <= 96),
      );
      addNote(
        tracks.melody,
        resolutionNote,
        resolutionStart,
        barEndTick - resolutionStart,
        dynamics * 0.48,
      );
      melodyState.lastMidi = resolutionNote;
    } else {
      addMelody(tracks.melody, scale, symbol, startTick, barEndTick, style, dynamics, section, bar, random, melodyState);
    }
    addDrums(tracks.drums, startTick, barEndTick, style, dynamics, section, bar, random);
  }

  const resolvedCues: ResolvedCue[] = cues.map((cue, index) => {
    const tick = clamp(midi.header.secondsToTicks(cue.timeSeconds), 0, endTick - 1);
    const actualTimeSeconds = midi.header.ticksToSeconds(tick);
    const barIndex = Math.min(barChords.length - 1, Math.floor(tick / barTicks));
    addCueAccent(tracks, tick, endTick - tick, cue.intensity ?? 1, barChords[barIndex] ?? finalChord, style);
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
    algorithmVersion: 2,
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
