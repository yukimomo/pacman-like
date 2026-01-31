// src/config.js
// Moved constants and static level templates from original game.js

export const TILE = 32;
export const MOVE_MS = 160; // ms to interpolate between tiles

export const DIFFICULTY = {
  enemyIntervalDecrement: 6, // ms per stage (lower = faster)
  minEnemyInterval: 120,
  aiRecomputeDecrement: 3, // ms per stage
  minAiRecompute: 120,
  powerDurationDecrement: 150, // ms per stage
  minPowerDuration: 2000
};

export const mapSource = [
  "#################",
  "#.o.....o#.....o#",
  "#.###.###.#.##..#",
  "#P#.#.....#.....#",
  "#.#.###.#####.###",
  "#...o....o......#",
  "#.###.#.#.###.#.#",
  "#...#.#.#...#.#E#",
  "###.#.#.###.#.#.#",
  "#.....#.....#...#",
  "#################"
];

export const levels = [
  { map: mapSource },
  { map: [
    "#################",
    "#.o..##..o#..o..#",
    "#.##..##..#..##.#",
    "#P#.#.....#.....#",
    "#.#.###.#####.###",
    "#...o....o......#",
    "#.###.#.#.###.#.#",
    "#...#.#.#...#.#E#",
    "###.#.#.###.#.#.#",
    "#.....#.....#...#",
    "#################"
  ] }
];

export const stageParams = [
  { enemyMoveInterval: 350, aiRecomputeInterval: 400, powerDuration: 6000 },
  { enemyMoveInterval: 300, aiRecomputeInterval: 350, powerDuration: 5000 }
];

// small utility used by rendering pops
export function hexToRgba(hex, alpha){
  hex = (hex || '').replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.substring(0,2) || '0',16);
  const g = parseInt(hex.substring(2,4) || '0',16);
  const b = parseInt(hex.substring(4,6) || '0',16);
  return 'rgba('+r+','+g+','+b+','+ (alpha||1) +')';
}
