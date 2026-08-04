import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import test from "node:test";
import toneMidi from "@tonejs/midi";
import { generateMusic, PRESETS } from "../dist/index.js";

const Midi = toneMidi.Midi;
const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parse(result) {
  return new Midi(result.midi);
}

function allNotes(midi) {
  return midi.tracks.flatMap((track) => track.notes);
}

test("gera quatro trilhas válidas e uma grade de batidas para cada estilo", () => {
  for (const style of ["ambient", "lofi", "upbeat"]) {
    const result = generateMusic({ durationSeconds: 8, style, tonic: "D", seed: `test-${style}` });
    const midi = parse(result);
    assert.deepEqual(midi.tracks.map((track) => track.name), ["Harmony", "Bass", "Melody", "Drums"]);
    assert.deepEqual(midi.tracks.map((track) => track.channel), [0, 1, 2, 9]);
    assert.equal(result.manifest.algorithmVersion, 2);
    assert.ok(result.manifest.beats.length > 0);
    assert.equal(result.manifest.beats[0].bar, 1);
    assert.equal(result.manifest.beats[0].beat, 1);
    assert.equal(result.manifest.beats[0].strength, "strong");
    assert.equal(Math.max(...allNotes(midi).map((note) => note.ticks + note.durationTicks)), midi.durationTicks);
  }
});

test("mantém bytes e manifesto determinísticos com a mesma seed", () => {
  const options = {
    durationSeconds: 12,
    style: "lofi",
    tonic: "Bb",
    mode: "minor",
    seed: "deterministic-v1",
    cues: [{ id: "cta", timeSeconds: 7.25, intensity: 0.8 }],
  };
  const first = generateMusic(options);
  const second = generateMusic(options);
  assert.deepEqual(first.midi, second.midi);
  assert.deepEqual(first.manifest, second.manifest);
});

test("constrói escalas ascendentes e voicings próximos", () => {
  const midi = parse(generateMusic({ durationSeconds: 8, style: "lofi", tonic: "D", seed: "voicing" }));
  const harmony = midi.tracks.find((track) => track.name === "Harmony");
  const firstVoicing = harmony.notes.filter((note) => note.ticks === 0).map((note) => note.midi);
  const secondVoicing = harmony.notes.filter((note) => note.ticks === 1920).map((note) => note.midi);
  assert.ok(firstVoicing.every((note, index) => index === 0 || note > firstVoicing[index - 1]));
  assert.ok(secondVoicing.every((note, index) => index === 0 || note > secondVoicing[index - 1]));
  assert.ok([...firstVoicing, ...secondVoicing].every((note) => note >= 48 && note <= 84));

  const melody = midi.tracks.find((track) => track.name === "Melody").notes.map((note) => note.midi);
  assert.ok(melody.every((note) => note >= 62));
  assert.ok(melody.slice(1).every((note, index) => note - melody[index] >= -7));
});

test("usa ii menor com sétima no preset lofi maior", () => {
  const result = generateMusic({ durationSeconds: 12, style: "lofi", tonic: "D", seed: "lofi-harmony" });
  assert.deepEqual(result.manifest.resolvedChords, ["Em7", "A7", "DMaj7", "Bm7"]);
});

test("diferencia swing lofi e backbeat upbeat", () => {
  const lofi = parse(generateMusic({ durationSeconds: 8, style: "lofi", seed: "lofi-groove" }));
  const lofiDrums = lofi.tracks.find((track) => track.name === "Drums");
  assert.deepEqual(
    lofiDrums.notes.filter((note) => note.midi === 42 && note.ticks >= 1920).slice(0, 4).map((note) => note.ticks),
    [1920, 2240, 2400, 2720],
  );
  assert.deepEqual(lofiDrums.notes.filter((note) => note.midi === 38).slice(0, 2).map((note) => note.ticks), [500, 1460]);

  const upbeat = parse(generateMusic({ durationSeconds: 6, style: "upbeat", seed: "upbeat-groove" }));
  const upbeatDrums = upbeat.tracks.find((track) => track.name === "Drums");
  assert.deepEqual(
    upbeatDrums.notes.filter((note) => note.midi === 36 && note.ticks >= 1920).slice(0, 2).map((note) => note.ticks),
    [1920, 2880],
  );
  assert.deepEqual(
    upbeatDrums.notes.filter((note) => note.midi === 38 && note.ticks >= 1920).slice(0, 2).map((note) => note.ticks),
    [2400, 3360],
  );
});

test("varia padrões, enriquece o baixo e escreve controles de mix", () => {
  const lofi = parse(generateMusic({ durationSeconds: 16, style: "lofi", tonic: "C", seed: "arrangement-v2" }));
  const bass = lofi.tracks.find((track) => track.name === "Bass");
  assert.ok(new Set(bass.notes.map((note) => note.midi)).size >= 5);

  const drums = lofi.tracks.find((track) => track.name === "Drums");
  const secondBarKicks = drums.notes.filter((note) => note.midi === 36 && note.ticks >= 1920 && note.ticks < 3840)
    .map((note) => note.ticks - 1920);
  const thirdBarKicks = drums.notes.filter((note) => note.midi === 36 && note.ticks >= 3840 && note.ticks < 5760)
    .map((note) => note.ticks - 3840);
  assert.notDeepEqual(secondBarKicks, thirdBarKicks);

  for (const track of lofi.tracks) {
    for (const controller of [7, 10, 11, 91, 93]) {
      assert.ok(track.controlChanges[controller]?.length > 0, `${track.name} sem CC${controller}`);
    }
  }
});

test("usa acentos de cue próprios por estilo e respeita intensidade zero", () => {
  const cueTime = 1.13;
  const styles = {
    ambient: { intensity: 1, expectedDrum: undefined },
    lofi: { intensity: 0.8, expectedDrum: 37 },
    upbeat: { intensity: 0.8, expectedDrum: 54 },
  };
  for (const [style, expectation] of Object.entries(styles)) {
    const result = generateMusic({
      durationSeconds: 8,
      style,
      seed: `cue-style-${style}`,
      cues: [{ timeSeconds: cueTime, intensity: expectation.intensity }],
    });
    const midi = parse(result);
    const cueTick = result.manifest.cues[0].tick;
    const hits = midi.tracks.flatMap((track) => track.notes.filter((note) => note.ticks === cueTick));
    assert.ok(hits.length > 0);
    assert.equal(hits.some((note) => note.midi === 49), false);
    if (expectation.expectedDrum !== undefined) {
      const drums = midi.tracks.find((track) => track.name === "Drums");
      assert.ok(drums.notes.some((note) => note.ticks === cueTick && note.midi === expectation.expectedDrum));
    } else {
      const drums = midi.tracks.find((track) => track.name === "Drums");
      assert.equal(drums.notes.some((note) => note.ticks === cueTick), false);
    }
  }

  const strongUpbeat = generateMusic({
    durationSeconds: 8,
    style: "upbeat",
    seed: "strong-upbeat-cue",
    cues: [{ timeSeconds: cueTime, intensity: 1 }],
  });
  const strongMidi = parse(strongUpbeat);
  assert.ok(strongMidi.tracks.find((track) => track.name === "Drums").notes
    .some((note) => note.ticks === strongUpbeat.manifest.cues[0].tick && note.midi === 49 && note.velocity < 0.65));

  const withoutCue = generateMusic({ durationSeconds: 8, style: "lofi", seed: "silent-cue" });
  const silentCue = generateMusic({
    durationSeconds: 8,
    style: "lofi",
    seed: "silent-cue",
    cues: [{ timeSeconds: cueTime, intensity: 0 }],
  });
  assert.deepEqual(silentCue.midi, withoutCue.midi);
});

test("rearticula cue ambient sem cortar a sustentação", () => {
  const result = generateMusic({
    durationSeconds: 8,
    style: "ambient",
    seed: "ambient-sustain-cue",
    cues: [{ timeSeconds: 1, intensity: 1 }],
  });
  const midi = parse(result);
  const cueTick = result.manifest.cues[0].tick;
  const harmony = midi.tracks.find((track) => track.name === "Harmony");
  const before = harmony.notes.find((note) => note.ticks < cueTick && note.ticks + note.durationTicks === cueTick);
  assert.ok(before);
  const resumed = harmony.notes.find((note) => note.midi === before.midi && note.ticks === cueTick);
  assert.ok(resumed);
  assert.ok(resumed.ticks + resumed.durationTicks >= 1920);
});

test("mantém cues e notas dentro do tick final", () => {
  const result = generateMusic({
    durationSeconds: 1,
    bpm: 120,
    seed: "boundary",
    cues: [{ timeSeconds: 0.9999 }],
  });
  const midi = parse(result);
  const cue = result.manifest.cues[0];
  assert.equal(midi.durationTicks, 960);
  assert.equal(cue.tick, 959);
  assert.ok(Math.abs(cue.driftSeconds) <= 60 / 120 / 480);
  assert.ok(allNotes(midi).every((note) => note.ticks + note.durationTicks <= midi.durationTicks));
});

test("quantiza uma duração positiva muito curta para pelo menos um tick", () => {
  const result = generateMusic({ durationSeconds: 0.0001, bpm: 120, seed: "tiny" });
  const midi = parse(result);
  assert.equal(midi.durationTicks, 1);
  assert.ok(allNotes(midi).length > 0);
  assert.ok(allNotes(midi).every((note) => note.ticks + note.durationTicks <= 1));
});

test("rejeita entradas inválidas recebidas em runtime", () => {
  assert.throws(() => generateMusic(null), /options precisa ser um objeto/);
  assert.throws(() => generateMusic({ durationSeconds: 2, mode: "dorian", progression: ["I"] }), /Modo inválido/);
  assert.throws(() => generateMusic({ durationSeconds: 2, tonic: 12 }), /tonic precisa ser uma string/);
  assert.throws(() => generateMusic({ durationSeconds: 2, seed: {} }), /seed precisa ser/);
  assert.throws(() => generateMusic({ durationSeconds: 2, cues: "agora" }), /cues precisa ser uma lista/);
  assert.throws(
    () => generateMusic({ durationSeconds: 2, cues: [{ id: 123, timeSeconds: 1 }] }),
    /id precisa ser uma string/,
  );
  assert.throws(() => generateMusic({ durationSeconds: 3_601 }), /no máximo 3600/);
  assert.throws(() => generateMusic({ durationSeconds: 2, progression: Array(65).fill("I") }), /no máximo 64/);
});

test("usa CC7 como volume sem achatar a dinâmica das notas", () => {
  const silent = parse(generateMusic({ durationSeconds: 4, volume: 0, seed: "volume" }));
  const full = parse(generateMusic({ durationSeconds: 4, volume: 1, seed: "volume" }));
  assert.deepEqual(silent.tracks.map((track) => track.controlChanges[7][0].value), [0, 0, 0, 0]);
  assert.deepEqual(full.tracks.map((track) => track.controlChanges[7][0].value), [1, 1, 1, 1]);
  assert.deepEqual(
    silent.tracks.map((track) => track.notes.map((note) => note.velocity)),
    full.tracks.map((track) => track.notes.map((note) => note.velocity)),
  );
});

test("não cria notas iguais sobrepostas no mesmo canal", () => {
  const midi = parse(generateMusic({
    durationSeconds: 9,
    style: "ambient",
    tonic: "C",
    seed: "overlap",
    cues: [{ timeSeconds: 1 }, { timeSeconds: 7.999 }],
  }));
  for (const track of midi.tracks) {
    for (let pitch = 0; pitch < 128; pitch += 1) {
      const notes = track.notes.filter((note) => note.midi === pitch).sort((left, right) => left.ticks - right.ticks);
      for (let index = 1; index < notes.length; index += 1) {
        assert.ok(notes[index - 1].ticks + notes[index - 1].durationTicks <= notes[index].ticks);
      }
    }
  }
});

test("expõe presets congelados", () => {
  assert.ok(Object.isFrozen(PRESETS));
  assert.ok(Object.isFrozen(PRESETS.ambient));
  assert.ok(Object.isFrozen(PRESETS.ambient.progression.major));
  assert.throws(() => { PRESETS.ambient.bpm = 199; }, TypeError);
  assert.equal(PRESETS.ambient.bpm, 72);
});

test("mantém smoke checks ESM, CommonJS e CLI", async () => {
  const require = createRequire(import.meta.url);
  const commonJs = require("../dist/index.cjs");
  assert.equal(typeof commonJs.generateMusic, "function");

  const indexSource = await readFile(join(projectRoot, "dist", "index.js"), "utf8");
  const cliSource = await readFile(join(projectRoot, "dist", "cli.js"), "utf8");
  assert.ok(!indexSource.startsWith("#!"));
  assert.ok(cliSource.startsWith("#!/usr/bin/env node"));

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "auto-midi-test-"));
  try {
    const configPath = join(temporaryDirectory, "config.json");
    const outputPrefix = join(temporaryDirectory, "demo");
    await writeFile(configPath, JSON.stringify({ durationSeconds: 2, style: "upbeat", seed: "cli" }), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      join(projectRoot, "dist", "cli.js"),
      "generate",
      "--config",
      configPath,
      "--out",
      outputPrefix,
    ]);
    assert.match(stdout, /Seed: cli/);
    assert.equal(new Midi(await readFile(`${outputPrefix}.mid`)).tracks.length, 4);
    assert.equal(JSON.parse(await readFile(`${outputPrefix}.json`, "utf8")).algorithmVersion, 2);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
