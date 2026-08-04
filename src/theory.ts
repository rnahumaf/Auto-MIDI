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

export function chordMidiNotes(symbol: string, octave: number): number[] {
  const notes = Chord.get(symbol).notes;
  return notes.map((note) => midiForPitchClass(note, octave));
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
  return scaleFor(tonic, mode).map((note) => midiForPitchClass(note, octave));
}
