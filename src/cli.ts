#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateMusic } from "./generator.js";
import type { GenerateMusicOptions } from "./types.js";

function usage(): string {
  return [
    "auto-midi generate --config <arquivo.json> --out <prefixo>",
    "",
    "O arquivo de configuração aceita as mesmas opções de generateMusic().",
  ].join("\n");
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals[0] !== "generate") {
    console.log(usage());
    if (positionals[0] !== undefined && positionals[0] !== "generate") process.exitCode = 1;
    return;
  }
  if (!values.config || !values.out) {
    throw new Error("Informe --config e --out.\n\n" + usage());
  }

  const configPath = resolve(values.config);
  const outputPrefix = resolve(values.out);
  const config = JSON.parse(await readFile(configPath, "utf8")) as GenerateMusicOptions;
  const result = generateMusic(config);
  await mkdir(dirname(outputPrefix), { recursive: true });
  await writeFile(`${outputPrefix}.mid`, result.midi);
  await writeFile(`${outputPrefix}.json`, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
  console.log(`MIDI: ${outputPrefix}.mid`);
  console.log(`Manifesto: ${outputPrefix}.json`);
  console.log(`Seed: ${result.manifest.seed}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
