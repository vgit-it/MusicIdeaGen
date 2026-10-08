// Seeded random numbers so an idea can be recreated from its seed.

/** String -> 32-bit hash (cyrb53, truncated). */
function hash(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: string) {
    this.s = hash(seed);
  }

  /** Float in [0, 1). mulberry32 */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [a, b], inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick from [item, weight] pairs. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let r = this.next() * items.reduce((a, [, wt]) => a + wt, 0);
    for (const [item, wt] of items) if ((r -= wt) < 0) return item;
    return items[items.length - 1][0];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Short random seed for a new idea (not deterministic, by design). */
export function newSeed(): string {
  const n = crypto.getRandomValues(new Uint32Array(2));
  return (n[0].toString(36) + n[1].toString(36)).slice(0, 8);
}
