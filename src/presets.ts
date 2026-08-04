import type { MusicStyle, MusicalMode } from "./types.js";

export interface StylePreset {
  bpm: number;
  progression: {
    major: string[];
    minor: string[];
  };
  instruments: {
    harmony: number;
    bass: number;
    melody: number;
  };
  description: string;
}

export const PRESETS: Record<MusicStyle, StylePreset> = {
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
      major: ["IIM7", "V7", "IM7", "VIm7"],
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
};

export function presetFor(style: MusicStyle, mode: MusicalMode): StylePreset {
  const preset = PRESETS[style];
  if (!preset) {
    throw new Error(`Estilo inválido: ${style}.`);
  }
  return preset;
}
