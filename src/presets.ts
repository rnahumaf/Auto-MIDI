import type { MusicStyle } from "./types.js";

export interface StylePreset {
  readonly bpm: number;
  readonly progression: {
    readonly major: readonly string[];
    readonly minor: readonly string[];
  };
  readonly instruments: {
    readonly harmony: number;
    readonly bass: number;
    readonly melody: number;
  };
  readonly description: string;
}

function freezePreset(preset: StylePreset): StylePreset {
  Object.freeze(preset.progression.major);
  Object.freeze(preset.progression.minor);
  Object.freeze(preset.progression);
  Object.freeze(preset.instruments);
  return Object.freeze(preset);
}

export const PRESETS: Readonly<Record<MusicStyle, StylePreset>> = Object.freeze({
  ambient: {
    bpm: 72,
    progression: {
      major: ["I", "V", "vim", "IV"],
      minor: ["im", "bVI", "bIII", "bVII"],
    },
    instruments: { harmony: 89, bass: 88, melody: 10 },
    description: "Pads longos, pulso discreto e melodia espaçada.",
  },
  lofi: {
    bpm: 82,
    progression: {
      major: ["IIm7", "V7", "IMaj7", "VIm7"],
      minor: ["im7", "ivm7", "bVII", "bIII"],
    },
    instruments: { harmony: 4, bass: 33, melody: 11 },
    description: "Acordes macios, baixo marcado e bateria laid-back.",
  },
  upbeat: {
    bpm: 120,
    progression: {
      major: ["I", "V", "vi", "IV"],
      minor: ["im", "bVI", "bIII", "bVII"],
    },
    instruments: { harmony: 81, bass: 38, melody: 80 },
    description: "Ataques curtos, pulso claro e energia de demonstração.",
  },
} satisfies Record<MusicStyle, StylePreset>);

for (const preset of Object.values(PRESETS)) freezePreset(preset);

export function presetFor(style: MusicStyle): StylePreset {
  const preset = PRESETS[style];
  if (!preset) {
    throw new Error(`Estilo inválido: ${style}.`);
  }
  return preset;
}
