import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const COMMIT = "684543d5e5efaef08d02be50dcda8d552478fa60";
const SHA256 = "9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe";
const URL = `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${COMMIT}/GeneralUser-GS.sf2`;
const DEFAULT_OUTPUT = "output/soundfonts/GeneralUser-GS.sf2";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const { values } = parseArgs({
  options: { out: { type: "string", default: DEFAULT_OUTPUT } },
});
const outputPath = resolve(values.out);

try {
  const existing = await readFile(outputPath);
  if (digest(existing) === SHA256) {
    console.log(`SoundFont pronto: ${outputPath}`);
    process.exit(0);
  }
  throw new Error(`O arquivo existente não corresponde ao SHA-256 esperado: ${outputPath}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(`Baixando GeneralUser GS fixado em ${COMMIT}...`);
const response = await fetch(URL);
if (!response.ok) throw new Error(`Falha ao baixar SoundFont: HTTP ${response.status}.`);
const bytes = new Uint8Array(await response.arrayBuffer());
const actualHash = digest(bytes);
if (actualHash !== SHA256) {
  throw new Error(`SHA-256 inesperado para o SoundFont: ${actualHash}.`);
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.download`;
await rm(temporaryPath, { force: true });
await writeFile(temporaryPath, bytes);
await rename(temporaryPath, outputPath);
console.log(`SoundFont pronto: ${outputPath}`);
