// src/rng.js
// Seed handling + PRNG moved from game.js

export function getSeedFromUrl(){ const p = new URLSearchParams(window.location.search); const s = p.get('seed'); return s ? parseInt(s,10) : 12345; }
export const BASE_SEED = getSeedFromUrl();

// simple mulberry32 PRNG factory (kept identical to original)
export function createRng(seed){
  return function(){ seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
