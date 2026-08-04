import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  audioToWav,
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from "spessasynth_core";

const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_TAIL_SECONDS = 2;
const BUFFER_SIZE = 128;

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function masterAudio(channels, sampleRate, tailSeconds) {
  const fadeSamples = Math.min(channels[0].length, Math.round(sampleRate * Math.min(1.5, tailSeconds)));
  const fadeStart = channels[0].length - fadeSamples;
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      if (index >= fadeStart && fadeSamples > 0) {
        channel[index] *= (channel.length - index) / fadeSamples;
      }
      peak = Math.max(peak, Math.abs(channel[index]));
    }
  }
  const gain = peak > 0 ? Math.min(2.5, 0.92 / peak) : 1;
  let sumSquares = 0;
  let samples = 0;
  let peakAfterMaster = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.tanh(channel[index] * gain * 1.04) / Math.tanh(1.04);
      peakAfterMaster = Math.max(peakAfterMaster, Math.abs(channel[index]));
      sumSquares += channel[index] ** 2;
      samples += 1;
    }
  }
  return {
    peakBeforeMaster: peak,
    peakAfterMaster,
    appliedGain: gain,
    rmsAfterMaster: Math.sqrt(sumSquares / Math.max(1, samples)),
  };
}

function encodeMp3(wavPath, mp3Path) {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", wavPath,
    "-codec:a", "libmp3lame",
    "-q:a", "2",
    mp3Path,
  ], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return false;
  if (result.status !== 0) {
    throw new Error(`Falha ao codificar MP3: ${result.stderr || result.error?.message || "erro desconhecido"}`);
  }
  return true;
}

export async function renderMidiPreview({
  midiPath,
  soundfontPath,
  outPrefix,
  sampleRate = DEFAULT_SAMPLE_RATE,
  tailSeconds = DEFAULT_TAIL_SECONDS,
  mp3 = false,
}) {
  const resolvedMidi = resolve(midiPath);
  const resolvedSoundfont = resolve(soundfontPath);
  const resolvedPrefix = resolve(outPrefix);
  const [midiBytes, soundfontBytes] = await Promise.all([
    readFile(resolvedMidi),
    readFile(resolvedSoundfont),
  ]);
  const midi = BasicMIDI.fromArrayBuffer(exactArrayBuffer(midiBytes), resolvedMidi);
  const soundBank = SoundBankLoader.fromArrayBuffer(exactArrayBuffer(soundfontBytes));
  const synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(soundBank, "preview");
  await synth.processorInitialized;
  synth.setSystemParameter("autoAllocateVoices", true);

  const sequencer = new SpessaSynthSequencer(synth);
  sequencer.loadNewSongList([midi]);
  sequencer.play();
  const sampleCount = Math.ceil(sampleRate * (midi.duration + tailSeconds));
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);
  let filledSamples = 0;
  while (filledSamples < sampleCount) {
    sequencer.processTick();
    const count = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.process(left, right, filledSamples, count);
    filledSamples += count;
  }

  const metrics = masterAudio([left, right], sampleRate, tailSeconds);
  const wavPath = `${resolvedPrefix}.wav`;
  await mkdir(dirname(resolvedPrefix), { recursive: true });
  await writeFile(wavPath, new Uint8Array(audioToWav([left, right], sampleRate, { normalizeAudio: false })));
  let mp3Path;
  if (mp3) {
    const candidate = `${resolvedPrefix}.mp3`;
    if (encodeMp3(wavPath, candidate)) mp3Path = candidate;
  }
  return { wavPath, mp3Path, durationSeconds: midi.duration + tailSeconds, sampleRate, ...metrics };
}

async function main() {
  const { values } = parseArgs({
    options: {
      midi: { type: "string" },
      soundfont: { type: "string" },
      out: { type: "string" },
      mp3: { type: "boolean", default: false },
    },
  });
  if (!values.midi || !values.soundfont || !values.out) {
    throw new Error("Uso: node scripts/render-preview.mjs --midi <arquivo.mid> --soundfont <arquivo.sf2> --out <prefixo> [--mp3]");
  }
  const result = await renderMidiPreview({
    midiPath: values.midi,
    soundfontPath: values.soundfont,
    outPrefix: values.out,
    mp3: values.mp3,
  });
  console.log(`WAV: ${result.wavPath}`);
  console.log(result.mp3Path ? `MP3: ${result.mp3Path}` : "MP3: não solicitado ou ffmpeg indisponível");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
