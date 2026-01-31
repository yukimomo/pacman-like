// src/state.js
// Central game state (moved from game.js)

export const state = {
  tiles: [], // 0 wall, 1 dot, 2 empty, 3 power
  player: {x:0,y:0, prevX:0, prevY:0, moveStart:0},
  playerStart: {x:0,y:0},
  enemies: [],
  dotsTotal:0,
  dotsLeft:0,
  stageIndex: 0,
  gameState: 'playing', // 'playing'|'win'|'gameover'
  score: 0,
  lives: 3,
  poweredUntil: 0,
  respawnUntil: 0,
  // params that can change per-stage
  enemyMoveInterval: 350,
  aiRecomputeInterval: 400,
  powerDuration: 6000,
  // visual/effect state (non-gameplay)
  pops: [],
  shakeUntil: 0,
  shakeMag: 4,
  stageDisplayUntil: 0,
  lastPickupAt: 0,
  lastPickupPos: null,
  // runtime flags
  runStart: 0,
  runEnded: false,
  stageSeed: null,
  rng: null
};

export function resetStateForRun(){
  state.score = 0;
  state.lives = 3;
  state.runStart = Date.now();
  state.runEnded = false;
}
