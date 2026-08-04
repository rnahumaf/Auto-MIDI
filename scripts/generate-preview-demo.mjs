import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateMusic } from "../dist/index.js";
import { renderMidiPreview } from "./render-preview.mjs";

const soundfontPath = resolve("output/soundfonts/GeneralUser-GS.sf2");
const outputDirectory = resolve("output/preview-v2");
const examples = [
  {
    id: "ambient-c-major",
    options: {
      durationSeconds: 28,
      style: "ambient",
      tonic: "C",
      mode: "major",
      volume: 0.76,
      seed: "preview-v2-ambient-c-major",
      cues: [{ id: "reveal", timeSeconds: 9.2, intensity: 0.7 }, { id: "cta", timeSeconds: 22.4, intensity: 0.9 }],
    },
  },
  {
    id: "lofi-a-minor",
    options: {
      durationSeconds: 28,
      style: "lofi",
      tonic: "A",
      mode: "minor",
      volume: 0.72,
      seed: "preview-v2-lofi-a-minor",
      cues: [{ id: "feature", timeSeconds: 7.3, intensity: 0.65 }, { id: "cta", timeSeconds: 19.6, intensity: 0.9 }],
    },
  },
  {
    id: "upbeat-d-major",
    options: {
      durationSeconds: 24,
      style: "upbeat",
      tonic: "D",
      mode: "major",
      volume: 0.7,
      seed: "preview-v2-upbeat-d-major",
      cues: [{ id: "feature", timeSeconds: 5.2, intensity: 0.75 }, { id: "cta", timeSeconds: 17.4, intensity: 1 }],
    },
  },
];

await mkdir(outputDirectory, { recursive: true });
const index = [];
for (const example of examples) {
  const result = generateMusic(example.options);
  const prefix = resolve(outputDirectory, example.id);
  const midiPath = `${prefix}.mid`;
  await writeFile(midiPath, result.midi);
  await writeFile(`${prefix}.json`, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
  const audio = await renderMidiPreview({ midiPath, soundfontPath, outPrefix: prefix, mp3: true });
  index.push({ id: example.id, options: example.options, manifest: result.manifest, audio });
  console.log(`${example.id}: ${audio.mp3Path ?? audio.wavPath}`);
}
await writeFile(resolve(outputDirectory, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
