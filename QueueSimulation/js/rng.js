// Seeded random-number generator and random-digit helpers (SPEC Section 5.1).
// The engines never call Math.random(): every run is reproducible from its seed.

/**
 * Mulberry32: a small, fast 32-bit generator. Returns a function that yields
 * uniform numbers in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a random-number stream for one simulation run.
 * randomDigits(k) returns an integer from 0 to 10^k - 1, exactly like reading
 * k digits from a table of random digits. A value of 0 (displayed as "000" or
 * "00") stands for the top of the last interval (10^k).
 */
export function createRng(seed) {
  const next = mulberry32(normalizeSeed(seed));
  return {
    seed: normalizeSeed(seed),
    next,
    randomDigits(k) {
      return Math.floor(next() * 10 ** k);
    }
  };
}

/** Converts any user-typed seed into an unsigned 32-bit integer. */
export function normalizeSeed(seed) {
  const n = Number(seed);
  if (Number.isFinite(n)) return Math.abs(Math.trunc(n)) >>> 0;
  // Text seeds are hashed so that a class can share a word as a seed.
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Derives an independent seed for replication number `index` (day or run)
 * from a master seed, so that one master seed reproduces all replications.
 */
export function deriveSeed(masterSeed, index) {
  let h = (normalizeSeed(masterSeed) ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Formats a random-digit value with leading zeros, as in the slides:
 * 15 with k = 3 gives "015"; 1000 (or 0) with k = 3 gives "000".
 */
export function formatDigits(value, k) {
  if (value === null || value === undefined) return '-';
  return String(value % 10 ** k).padStart(k, '0');
}
