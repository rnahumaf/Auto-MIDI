import type { SeedInput } from "./types.js";

export interface RandomSource {
  next(): number;
  pick<T>(values: readonly T[]): T;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomSeed(): string {
  return `auto-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function createRandomSource(input?: SeedInput): { seed: string; random: RandomSource } {
  const seed = input === undefined ? randomSeed() : String(input);
  let state = hashSeed(seed) || 0x6d2b79f5;

  const random: RandomSource = {
    next() {
      state = Math.imul(state ^ (state >>> 15), state | 1);
      state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new Error("Não é possível escolher um item de uma lista vazia.");
      }
      return values[Math.floor(random.next() * values.length)] as T;
    },
  };

  return { seed, random };
}
