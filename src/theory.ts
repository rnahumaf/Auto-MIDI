import { Chord, Note, Progression, Scale } from "tonal";
import type { MusicalMode } from "./types.js";

const TONIC_PATTERN = /^[A-Ga-g](?:#|b)?$/;

export function normalizeTonic(value: string): string {
  if (!TONIC_PATTERN.test(value.trim())) {
    throw new Error(`Tônica inválida: "${value}". Use A-G com # ou b opcional.`);
  }

  const note = Note.get(value.trim());
  if (note.empty || !note.name) {
    throw new Error(`Tônica inválida: "${value}".`);
  }
  return note.name;
}

export function scaleFor(tonic: string, mode: MusicalMode): string[] {
  const scale = Scale.get(`${tonic} ${mode}`);
  if (scale.empty || scale.notes.length === 0) {
    throw new Error(`Não foi possível construir a escala ${tonic} ${mode}.`);
  }
  return scale.notes;
}

export function chordsFromProgression(tonic: string, progression: readonly string[]): string[] {
  if (progression.length === 0) {
    throw new Error("A progressão precisa conter ao menos um grau romano.");
  }

  const normalizedProgression = progression.map(normalizeRomanNumeral);
  const chords = Progression.fromRomanNumerals(tonic, normalizedProgression);
  const parsed = chords.map((symbol) => Chord.get(symbol));
  if (parsed.some((chord) => chord.empty || chord.notes.length === 0)) {
    throw new Error(`Progressão inválida: ${progression.join(", ")}.`);
  }
  return chords;
}

function normalizeRomanNumeral(value: string): string {
  const trimmed = value.trim();
  if (/^[iv]+$/.test(trimmed)) return `${trimmed}m`;
  return trimmed;
}

export function midiForPitchClass(pitchClass: string, octave: number): number {
  const midi = Note.midi(`${pitchClass}${octave}`);
  if (midi === null) {
    throw new Error(`Nota MIDI inválida: ${pitchClass}${octave}.`);
  }
  return midi;
}

function ascendingMidiNotes(pitchClasses: readonly string[], octave: number): number[] {
  let previous = Number.NEGATIVE_INFINITY;
  return pitchClasses.map((pitchClass) => {
    let midi = midiForPitchClass(pitchClass, octave);
    while (midi <= previous) midi += 12;
    previous = midi;
    return midi;
  });
}

function voicingScore(candidate: readonly number[], previousVoicing: readonly number[] | undefined): number {
  if (!previousVoicing || previousVoicing.length === 0) {
    const center = candidate.reduce((sum, note) => sum + note, 0) / candidate.length;
    return Math.abs(center - 66);
  }

  return candidate.reduce((score, note, index) => {
    const previous = previousVoicing[Math.min(index, previousVoicing.length - 1)] ?? note;
    return score + Math.abs(note - previous);
  }, 0);
}

export function chordMidiNotes(
  symbol: string,
  octave: number,
  previousVoicing?: readonly number[],
): number[] {
  const chord = Chord.get(symbol);
  if (chord.empty || chord.notes.length === 0) {
    throw new Error(`Acorde inválido: ${symbol}.`);
  }

  const rootPosition = ascendingMidiNotes(chord.notes, octave);
  const candidates: number[][] = [];
  for (let inversion = 0; inversion < rootPosition.length; inversion += 1) {
    const inverted = [
      ...rootPosition.slice(inversion),
      ...rootPosition.slice(0, inversion).map((note) => note + 12),
    ];
    for (const shift of [-24, -12, 0, 12, 24]) {
      const candidate = inverted.map((note) => note + shift);
      if ((candidate[0] ?? 0) >= 48 && (candidate.at(-1) ?? 127) <= 84) {
        candidates.push(candidate);
      }
    }
  }

  return (candidates.length > 0 ? candidates : [rootPosition]).reduce((best, candidate) =>
    voicingScore(candidate, previousVoicing) < voicingScore(best, previousVoicing) ? candidate : best,
  );
}

export function chordToneMidiNotes(symbol: string, octave: number): number[] {
  const chord = Chord.get(symbol);
  if (chord.empty || chord.notes.length === 0) {
    throw new Error(`Acorde inválido: ${symbol}.`);
  }
  return ascendingMidiNotes(chord.notes, octave);
}

export function rootMidi(symbol: string, octave: number): number {
  const chord = Chord.get(symbol);
  const root = chord.root || chord.tonic || chord.notes[0];
  if (chord.empty || !root) {
    throw new Error(`Acorde inválido: ${symbol}.`);
  }
  return midiForPitchClass(root, octave);
}

export function scaleMidiNotes(tonic: string, mode: MusicalMode, octave: number): number[] {
  return ascendingMidiNotes(scaleFor(tonic, mode), octave);
}
