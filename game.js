// Pacman-like with score, lives, power pellets and respawn
// Map chars: '#' wall, '.' dot, 'o' power-pellet, ' ' empty, 'P' player, 'E' enemy

const TILE = 32;
const MOVE_MS = 160; // ms to interpolate between tiles
const mapSource = [
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

// Levels definition: each level has map (array of strings), optional playerStart/enemies can be derived from map
const levels = [
  { map: mapSource },
  // Example second level - slightly different layout
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

// Stage parameters (difficulty scaling). Index corresponds to levels.
const stageParams = [
  { enemyMoveInterval: 350, aiRecomputeInterval: 400, powerDuration: 6000 },
  { enemyMoveInterval: 300, aiRecomputeInterval: 350, powerDuration: 5000 }
];

// -- seed handling and RNG --
// baseSeed can be provided via URL ?seed=1234
function getSeedFromUrl(){ const p = new URLSearchParams(window.location.search); const s = p.get('seed'); return s ? parseInt(s,10) : 12345; }
const BASE_SEED = getSeedFromUrl();

// simple seeded PRNG (mulberry32) - returns function() -> [0,1)
function createRng(seed){ return function(){ seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Difficulty scaling constants (easy to tweak)
const DIFFICULTY = {
  enemyIntervalDecrement: 6, // ms per stage (lower = faster)
  minEnemyInterval: 120,
  aiRecomputeDecrement: 3, // ms per stage
  minAiRecompute: 120,
  powerDurationDecrement: 150, // ms per stage
  minPowerDuration: 2000
};

// initialize rows/cols from first level
let rows = levels[0].map.length;
let cols = levels[0].map[0].length;
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
canvas.width = cols * TILE;
canvas.height = rows * TILE;

let statusEl = document.getElementById('status');
let scoreEl = document.getElementById('score');
let livesEl = document.getElementById('lives');
let powerEl = document.getElementById('power');
let restartBtn = document.getElementById('restart');
let stageEl = document.getElementById('stage');
let seedEl = document.getElementById('seed');

let state = {
  tiles: [], // 0 wall, 1 dot, 2 empty, 3 power
  player: {x:0,y:0, prevX:0, prevY:0, moveStart:0},
  playerStart: {x:0,y:0},
  enemies: [], // array of enemies (see level.enemies)
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
  powerDuration: 6000
};

// enemy movement timer id (used to change interval per stage)
let enemyTickId = null;

// Deep copy a map (array of strings) into char matrix
function deepCopyMap(map){
  return map.map(r=>r.split(''));
}

// shuffle in-place using stage RNG
function shuffleArray(arr, rng){
  for(let i = arr.length-1;i>0;i--){
    const j = Math.floor(rng()* (i+1));
    const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
}

// Mutate base map slightly: flip some walls/floors and reposition dots/power slightly
function mutateMap(baseMapChars, rng, stageIndex){
  const h = baseMapChars.length, w = baseMapChars[0].length;
  const maxMutate = Math.min(0.08, 0.02 + stageIndex*0.001); // mutate rate increases slightly with stage
  const map = baseMapChars.map(r=>r.slice()); // deep copy chars

  // Collect P and E positions from base (we will preserve them)
  const preserve = new Set();
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const ch = baseMapChars[y][x]; if(ch==='P' || ch==='E') preserve.add(y*1000+x);} }

  // Flip some interior tiles (avoid borders and preserved points)
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx = y*1000+x;
      if(preserve.has(idx)) continue;
      if(rng() < maxMutate){
        if(map[y][x] === '#') map[y][x] = '.'; // open wall
        else if(map[y][x] === '.') map[y][x] = '#';
        // do not touch 'o','P','E',' ' here
      }
    }
  }

  // Reposition dots/power: keep counts but shuffle their locations among empty floor tiles
  const dotPositions = [];
  const powerCount = baseMapChars.flat().filter(c=>c==='o').length;
  const dotCount = baseMapChars.flat().filter(c=>c==='.').length;

  // collect candidate floor tiles (non-wall), exclude P/E
  const candidates = [];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx = y*1000+x;
      if(preserve.has(idx)) continue;
      if(map[y][x] !== '#') candidates.push({x,y});
    }
  }

  shuffleArray(candidates, rng);

  // clear existing dots/power on map
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) { if(map[y][x]==='.'||map[y][x]==='o') map[y][x]=' '; }

  // place power pellets first
  for(let i=0;i<powerCount && i<candidates.length;i++){
    const p = candidates[i]; map[p.y][p.x] = 'o';
  }
  // place dots
  for(let i=powerCount;i<powerCount+dotCount && i<candidates.length;i++){
    const p = candidates[i]; if(map[p.y][p.x]===' ') map[p.y][p.x] = '.';
  }

  return map;
}

// Validate that most dots are reachable from player start (avoid dead stages)
function isStageValid(mapChars, playerStart, requiredRatio = 0.95){
  const h = mapChars.length, w = mapChars[0].length;
  const visited = Array.from({length:h}, ()=> Array(w).fill(false));
  const q = [ {x:playerStart.x, y:playerStart.y} ];
  visited[playerStart.y][playerStart.x] = true;
  let qi=0;
  while(qi < q.length){ const cur = q[qi++]; const dirs=[[1,0],[-1,0],[0,1],[0,-1]]; for(const d of dirs){ const nx=cur.x+d[0], ny=cur.y+d[1]; if(nx>=0&&nx<w&&ny>=0&&ny<h && !visited[ny][nx] && mapChars[ny][nx] !== '#'){ visited[ny][nx]=true; q.push({x:nx,y:ny}); } } }
  let totalDots=0, reachableDots=0;
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ if(mapChars[y][x]==='.'||mapChars[y][x]==='o') { totalDots++; if(visited[y][x]) reachableDots++; } } }
  if(totalDots===0) return true; // degenerate but allow
  return (reachableDots / totalDots) >= requiredRatio;
}

// Reachability: flood-fill/BFS from player start, returns matrix and list
function getReachable(mapChars, start){
  const h = mapChars.length, w = mapChars[0].length;
  const reachable = Array.from({length:h}, ()=> Array(w).fill(false));
  const list = [];
  if(start.x < 0 || start.x >= w || start.y < 0 || start.y >= h) return {reachable, list};
  if(mapChars[start.y][start.x] === '#') return {reachable, list};
  const q = [{x:start.x,y:start.y}]; reachable[start.y][start.x] = true; let qi=0;
  while(qi < q.length){ const cur = q[qi++]; list.push({x:cur.x,y:cur.y}); const dirs=[[1,0],[-1,0],[0,1],[0,-1]]; for(const d of dirs){ const nx = cur.x + d[0], ny = cur.y + d[1]; if(nx>=0&&nx<w&&ny>=0&&ny<h && !reachable[ny][nx] && mapChars[ny][nx] !== '#'){ reachable[ny][nx] = true; q.push({x:nx,y:ny}); } } }
  return {reachable, list};
}

// Find disconnected (non-wall) tiles that are not reachable
function findDisconnected(mapChars, reachable){
  const h = mapChars.length, w = mapChars[0].length;
  const out = [];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(mapChars[y][x] !== '#' && !reachable[y][x]) out.push({x,y}); }
  return out;
}

// Connect disconnected components by carving simple Manhattan tunnels until all reachable or attempts exhausted
function connectMap(mapChars, playerStart, rng, maxOps = 200){
  for(let op=0; op<maxOps; op++){
    const nowResult = getReachable(mapChars, playerStart);
    const disconnected = findDisconnected(mapChars, nowResult.reachable);
    if(disconnected.length === 0) return true;
    // pick a disconnected cell (random)
    const d = disconnected[Math.floor(rng()*disconnected.length)];
    // pick nearest reachable cell (linear search; maps are small)
    let best = null, bestDist = Infinity;
    for(const r of nowResult.list){ const dist = Math.abs(r.x - d.x) + Math.abs(r.y - d.y); if(dist < bestDist){ bestDist = dist; best = r; } }
    if(!best) return false;
    // carve path between d and best using Manhattan path; randomly choose axis order
    let cx = d.x, cy = d.y;
    const horizFirst = rng() < 0.5;
    if(horizFirst){
      while(cx !== best.x){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cx += (best.x > cx) ? 1 : -1; }
      while(cy !== best.y){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cy += (best.y > cy) ? 1 : -1; }
    } else {
      while(cy !== best.y){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cy += (best.y > cy) ? 1 : -1; }
      while(cx !== best.x){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cx += (best.x > cx) ? 1 : -1; }
    }
    // ensure endpoints are floor
    if(mapChars[best.y][best.x] === '#') mapChars[best.y][best.x] = ' ';
    if(mapChars[d.y][d.x] === '#') mapChars[d.y][d.x] = ' ';
  }
  return false; // failed to connect within maxOps
}

// Move dots/power onto reachable empty tiles only
function relocateDotsToReachable(mapChars, reachable, rng){
  const h = mapChars.length, w = mapChars[0].length;
  let powerCount = 0, dotCount = 0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(mapChars[y][x] === 'o'){ powerCount++; mapChars[y][x] = ' '; } if(mapChars[y][x] === '.'){ dotCount++; mapChars[y][x] = ' '; } }
  const candidates = [];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(reachable[y][x] && mapChars[y][x] === ' ') candidates.push({x,y}); }
  shuffleArray(candidates, rng);
  let idx = 0;
  for(let i=0;i<powerCount && idx < candidates.length;i++, idx++){ const p = candidates[idx]; mapChars[p.y][p.x] = 'o'; }
  for(let i=0;i<dotCount && idx < candidates.length;i++, idx++){ const p = candidates[idx]; if(mapChars[p.y][p.x] === ' ') mapChars[p.y][p.x] = '.'; }
}

// Generate a stage: mutate base template using seeded RNG; ensure full connectivity; returns { map, playerStart, enemies, seedUsed }
function generateStage(stageIndex, baseSeed){
  const template = levels[stageIndex % levels.length].map; // array of strings
  const baseChars = deepCopyMap(template);
  // find base player and enemies in template
  let basePlayer = null; const baseEnemies = [];
  for(let y=0;y<baseChars.length;y++) for(let x=0;x<baseChars[0].length;x++){ const ch = baseChars[y][x]; if(ch === 'P') basePlayer = {x,y}; if(ch==='E') baseEnemies.push({x,y}); }
  if(!basePlayer){ basePlayer = {x:1,y:1}; }

  const MAX_ATTEMPTS = 20;
  for(let attempt=0; attempt<MAX_ATTEMPTS; attempt++){
    const stageSeed = (baseSeed || BASE_SEED) + stageIndex*100 + attempt;
    const rng = createRng(stageSeed);
    let mutated = mutateMap(baseChars, rng, stageIndex);
    // ensure player/enemy starts are present
    mutated[basePlayer.y][basePlayer.x] = 'P';
    for(const be of baseEnemies) mutated[be.y][be.x] = 'E';

    // ensure the entire map is connected (all non-wall tiles reachable)
    const initialReach = getReachable(mutated, basePlayer);
    if(!connectMap(mutated, basePlayer, rng, 200)){
      // failed to connect; try next attempt
      continue;
    }

    // recompute reachability and relocate dots/power to reachable tiles
    const afterReach = getReachable(mutated, basePlayer);
    relocateDotsToReachable(mutated, afterReach.reachable, rng);

    // final validation: ensure no disconnected walkable tiles remain
    const finalReach = getReachable(mutated, basePlayer);
    const disconnected = findDisconnected(mutated, finalReach.reachable);
    if(disconnected.length === 0){
      const mapStrings = mutated.map(r=>r.join(''));
      return { map: mapStrings, playerStart: basePlayer, enemies: baseEnemies, seedUsed: stageSeed };
    }
    // else retry
  }
  // fallback: return base template unchanged
  return { map: template.slice(), playerStart: basePlayer, enemies: baseEnemies, seedUsed: (baseSeed || BASE_SEED) + stageIndex };
}

// Initialize the given stage index: parse map, spawn player and enemies, apply stage params
function initStage(stageIndex){
  // generate stage using seeded generator (may mutate base template)
  const gen = generateStage(stageIndex, BASE_SEED);
  state.stageIndex = stageIndex;
  state.stageSeed = gen.seedUsed;
  state.rng = createRng(state.stageSeed); // RNG for this stage

  state.tiles = [];
  state.dotsTotal = 0;
  state.dotsLeft = 0;
  state.gameState = 'playing';
  state.poweredUntil = 0;
  state.respawnUntil = 0;
  statusEl.textContent = '';

  // apply stage params (with fallback) and apply difficulty scaling based on stageIndex
  const params = stageParams[stageIndex % stageParams.length] || stageParams[0];
  state.enemyMoveInterval = Math.max(DIFFICULTY.minEnemyInterval, params.enemyMoveInterval - stageIndex * DIFFICULTY.enemyIntervalDecrement);
  state.aiRecomputeInterval = Math.max(DIFFICULTY.minAiRecompute, params.aiRecomputeInterval - stageIndex * DIFFICULTY.aiRecomputeDecrement);
  state.powerDuration = Math.max(DIFFICULTY.minPowerDuration, params.powerDuration - stageIndex * DIFFICULTY.powerDurationDecrement);

  // use generated map
  const map = gen.map;
  rows = map.length;
  cols = map[0].length;
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;

  state.enemies = [];

  for(let y=0;y<rows;y++){
    let row = [];
    for(let x=0;x<cols;x++){
      let ch = map[y][x];
      if(ch === '#') row.push(0);
      else if(ch === '.') { row.push(1); state.dotsTotal++; }
      else if(ch === 'o') { row.push(3); state.dotsTotal++; }
      else if(ch === 'P') { row.push(2); state.player = {x,y, prevX:x, prevY:y, moveStart:0}; state.playerStart = {x,y}; }
      else if(ch === 'E') {
        row.push(2);
        // create enemy object per-level
        state.enemies.push({ x, y, startX: x, startY: y, prev:null, prevX:x, prevY:y, moveStart:0, state:'normal', eatenUntil:0, aiLast:0, aiNext:null });
      } else row.push(2);
    }
    state.tiles.push(row);
  }
  state.dotsLeft = state.dotsTotal;

  // set enemy tick according to stage (scaled)
  setEnemyTickInterval(state.enemyMoveInterval);

  updateHUD();
}

function resetGame(){
  state.score = 0;
  state.lives = 3;
  state.runStart = Date.now(); // track run start time for timeMs
  state.runEnded = false; // allow saving when this run ends
  // start at stage 0
  initStage(0);
  renderScores(); // refresh leaderboard display
}

function updateHUD(){
  scoreEl.textContent = `Score: ${state.score}`;
  let hearts = '';
  for(let i=0;i<state.lives;i++) hearts += '♥';
  livesEl.textContent = `Lives: ${hearts}`;
  stageEl.textContent = `Stage: ${state.stageIndex + 1}`;
  seedEl.textContent = `Seed: ${state.stageSeed || BASE_SEED}`;
  if(Date.now() < state.poweredUntil){
    powerEl.style.display = 'inline-block';
  } else {
    powerEl.style.display = 'none';
  }
}

// -------- Leaderboard / LocalStorage helpers --------
const SCORE_KEY = 'pacmanLikeScores';

function loadScores(){
  try{
    const raw = localStorage.getItem(SCORE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)) return parsed;
    return [];
  }catch(e){ console.warn('Failed to load scores',e); return []; }
}

function saveScores(list){
  try{ localStorage.setItem(SCORE_KEY, JSON.stringify(list)); }
  catch(e){ console.warn('Failed to save scores', e); }
}

function addScore(entry){
  const list = loadScores();
  list.push(entry);
  // sort: score desc, stage desc, timeMs asc
  list.sort((a,b)=>{
    if(b.score !== a.score) return b.score - a.score;
    if(b.stage !== a.stage) return b.stage - a.stage;
    if(a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    return b.at - a.at; // tie-breaker: recent first
  });
  saveScores(list);
}

function clearScores(){
  localStorage.removeItem(SCORE_KEY);
  renderScores();
}

function formatTimeMs(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(total/60); const s = total%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderScores(){
  const container = document.getElementById('scoresList');
  const list = loadScores();
  const top = list.slice(0,10);
  if(top.length === 0){ container.innerHTML = '<div style="opacity:0.6;">No scores yet</div>'; return; }
  let html = '<table><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Stage</th><th>Time</th><th>Seed</th></tr></thead><tbody>';
  for(let i=0;i<top.length;i++){
    const r = top[i];
    html += `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.score}</td><td>${r.stage}</td><td>${formatTimeMs(r.timeMs)}</td><td style="opacity:0.8">${r.seed}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

// handle run end: prompt for name and save once
function handleRunEnd(){
  if(state.runEnded) return; // guard: only once per run
  state.runEnded = true;
  // ask for name
  let name = prompt('Game Over - enter name for leaderboard','player');
  if(!name) name = 'player';
  const timeMs = Date.now() - (state.runStart || Date.now());
  const entry = { name, score: state.score, stage: (state.stageIndex+1), timeMs, seed: state.stageSeed || BASE_SEED, at: Date.now() };
  addScore(entry);
  renderScores();
  // show a short message
  statusEl.textContent = 'Score saved';
  setTimeout(()=>{ if(state.gameState === 'gameover') statusEl.textContent = 'Game Over'; }, 1200);
}

// wire clear button
document.getElementById('clearScores').addEventListener('click', ()=>{ if(confirm('Clear all local rankings?')) clearScores(); });

// render initial
renderScores();


function draw(){
  // background
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      let t = state.tiles[y][x];
      let px = x*TILE, py = y*TILE;
      // walls
      if(t===0){
        ctx.fillStyle = '#224';
        ctx.fillRect(px,py,TILE,TILE);
      } else {
        // floor subtle shading
        ctx.fillStyle = '#080808';
        ctx.fillRect(px,py,TILE,TILE);
        // dot
        if(t===1){
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(px+TILE/2, py+TILE/2, 4, 0, Math.PI*2);
          ctx.fill();
        }
        // power pellet
        if(t===3){
          ctx.fillStyle = '#6cf';
          ctx.beginPath();
          ctx.arc(px+TILE/2, py+TILE/2, 7, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }

  // interpolation helper
  function getRenderPos(entity){
    let sx = (entity.prevX !== undefined) ? entity.prevX : entity.x;
    let sy = (entity.prevY !== undefined) ? entity.prevY : entity.y;
    let start = entity.moveStart || 0;
    let t = 1;
    if(start > 0){
      let dt = Date.now() - start;
      if(dt < MOVE_MS){ t = dt / MOVE_MS; }
      else { t = 1; }
    }
    let rx = (sx + (entity.x - sx) * t) * TILE + TILE/2;
    let ry = (sy + (entity.y - sy) * t) * TILE + TILE/2;
    return {rx, ry};
  }

  // player (rendered with interpolation)
  let pPos = getRenderPos(state.player);
  ctx.fillStyle = '#ffec3d';
  ctx.beginPath();
  ctx.arc(pPos.rx, pPos.ry, TILE*0.38, 0, Math.PI*2);
  ctx.fill();

  // enemies (render all enemies with interpolation)
  for(const en of state.enemies){
    let ePos = getRenderPos(en);
    if(en.state === 'eaten'){
      // draw eyes to indicate eaten (will respawn shortly)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ePos.rx - TILE*0.15, ePos.ry - TILE*0.05, TILE*0.12, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ePos.rx + TILE*0.15, ePos.ry - TILE*0.05, TILE*0.12, 0, Math.PI*2);
      ctx.fill();
    } else if(en.state === 'vulnerable'){
      // blinking when vulnerability is ending
      const BLINK_START = 2000; // ms
      const BLINK_PERIOD = 250; // ms
      let remaining = state.poweredUntil - Date.now();
      let visible = true;
      if(remaining <= BLINK_START){ visible = Math.floor(remaining / BLINK_PERIOD) % 2 === 0; }
      if(visible){
        ctx.fillStyle = '#6cf';
        ctx.beginPath();
        ctx.arc(ePos.rx, ePos.ry, TILE*0.38, 0, Math.PI*2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#ff4d4f';
      ctx.beginPath();
      ctx.arc(ePos.rx, ePos.ry, TILE*0.38, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // overlays
  if(state.gameState !== 'playing'){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(state.gameState === 'win' ? 'You Win! 🎉' : 'Game Over 💀', canvas.width/2, canvas.height/2);
  }
}

function tryMovePlayer(dx,dy){
  if(state.gameState !== 'playing') return;
  if(Date.now() < state.respawnUntil) return; // during respawn pause
  let nx = state.player.x + dx;
  let ny = state.player.y + dy;
  if(nx<0||nx>=cols||ny<0||ny>=rows) return;
  if(state.tiles[ny][nx] === 0) return; // wall
  state.player.prevX = state.player.x; state.player.prevY = state.player.y;
  state.player.x = nx; state.player.y = ny;
  state.player.moveStart = Date.now();
  // collect tile
  if(state.tiles[ny][nx] === 1){
    state.tiles[ny][nx] = 2;
    state.dotsLeft--;
    state.score += 10;
    updateHUD();
    if(state.dotsLeft === 0){ nextStage(); }
  } else if(state.tiles[ny][nx] === 3){
    state.tiles[ny][nx] = 2;
    state.dotsLeft--;
    state.score += 50;
    state.poweredUntil = Date.now() + (state.powerDuration || 6000);
    // set ALL enemies to vulnerable
    for(const en of state.enemies){ en.state = 'vulnerable'; }
    updateHUD();
    if(state.dotsLeft === 0){ nextStage(); }
  }
  checkCollision();
}

function neighbors(x,y){
  const dirs = [ [1,0],[-1,0],[0,1],[0,-1] ];
  return dirs.map(d=>({x:x+d[0], y:y+d[1]})).filter(p=>p.x>=0&&p.x<cols&&p.y>=0&&p.y<rows && state.tiles[p.y][p.x] !== 0);
}

function manhattan(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }

// Check if a tile is walkable (not a wall) - function required by BFS
function isWalkable(tx, ty, map){
  return tx >= 0 && tx < cols && ty >= 0 && ty < rows && map[ty][tx] !== 0;
}

// BFS: returns the next tile {nx, ny} on the shortest path from start -> goal, or null if no path
function bfsNextStep(start, goal, map){
  // start, goal: {x, y}
  if(start.x === goal.x && start.y === goal.y) return null;
  const total = rows * cols;
  const startIdx = start.y * cols + start.x;
  const goalIdx = goal.y * cols + goal.x;
  const q = [];
  const visited = new Uint8Array(total);
  const parent = new Int32Array(total).fill(-1);

  q.push(startIdx);
  visited[startIdx] = 1;

  while(q.length){
    const idx = q.shift();
    const cx = idx % cols, cy = Math.floor(idx / cols);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for(const d of dirs){
      const nx = cx + d[0], ny = cy + d[1];
      if(!isWalkable(nx, ny, map)) continue;
      const nIdx = ny * cols + nx;
      if(visited[nIdx]) continue;
      visited[nIdx] = 1;
      parent[nIdx] = idx;
      if(nIdx === goalIdx){
        // reconstruct path: walk back from goal to the tile after start
        let cur = goalIdx;
        while(parent[cur] !== startIdx){
          cur = parent[cur];
          if(cur === -1) break; // safety
        }
        return { nx: cur % cols, ny: Math.floor(cur / cols) };
      }
      q.push(nIdx);
    }
  }
  return null; // no path
}

// Update enemy AI: compute next step via BFS occasionally (when at tile center or after interval)
function updateEnemyAI(enemy, player, map){
  if(enemy.state === 'eaten') return; // don't compute while eaten
  const now = Date.now();
  const atCenter = !enemy.moveStart || (now - (enemy.moveStart || 0) >= MOVE_MS);
  const RECOMPUTE_INTERVAL = state.aiRecomputeInterval || 400; // use stage param
  if(!atCenter && (now - (enemy.aiLast || 0) < RECOMPUTE_INTERVAL)) return; // skip
  enemy.aiLast = now;
  const step = bfsNextStep({x:enemy.x, y:enemy.y}, {x:player.x, y:player.y}, map);
  enemy.aiNext = step; // can be null
}

// Enemy movement now uses BFS next step and falls back to random move if no path
function moveEnemy(){
  if(state.gameState !== 'playing') return;
  if(Date.now() < state.respawnUntil) return; // pause while respawning

  // move each enemy independently
  for(const en of state.enemies){
    if(en.state === 'eaten') continue; // don't move eaten enemies

    // compute AI step if needed
    updateEnemyAI(en, state.player, state.tiles);

    const step = en.aiNext;
    if(step && (step.nx !== en.x || step.ny !== en.y)){
      en.prev = {x:en.x, y:en.y}; en.prevX = en.x; en.prevY = en.y;
      en.x = step.nx; en.y = step.ny; en.moveStart = Date.now();
      checkCollision();
      continue;
    }

    // fallback random move
    let n = neighbors(en.x, en.y);
    if(n.length===0) continue;
    let choice = n[Math.floor((state.rng ? state.rng() : Math.random())*n.length)];
    en.prev = {x:en.x,y:en.y}; en.prevX = en.x; en.prevY = en.y;
    en.x = choice.x; en.y = choice.y; en.moveStart = Date.now();
    checkCollision();
  }
}

function checkCollision(){
  for(const en of state.enemies){
    if(state.player.x === en.x && state.player.y === en.y){
      if(en.state === 'vulnerable'){
        // eat enemy: mark eaten and delay respawn for a short time
        state.score += 200;
        en.state = 'eaten';
        en.eatenUntil = Date.now() + 800; // show eaten eyes for 800ms
        en.aiNext = null; en.aiLast = 0;
        updateHUD();
      } else if(en.state === 'normal') {
        // player hit
        state.lives -= 1;
        updateHUD();
        if(state.lives <= 0){
          state.gameState = 'gameover';
          statusEl.textContent = 'Game Over';
          // save score locally (single shot)
          handleRunEnd();
        } else {
          // respawn player and all enemies
          state.player.x = state.playerStart.x; state.player.y = state.playerStart.y;
          state.player.prevX = state.player.x; state.player.prevY = state.player.y; state.player.moveStart = 0;
          for(const e2 of state.enemies){
            e2.x = e2.startX; e2.y = e2.startY; e2.prev = null; e2.prevX = e2.x; e2.prevY = e2.y; e2.moveStart = 0; e2.aiNext = null; e2.aiLast = 0;
          }
          state.respawnUntil = Date.now() + 800;
          statusEl.textContent = 'Life lost';
          setTimeout(()=>{ statusEl.textContent = ''; }, 1000);
        }
      }
      // don't break; multiple enemy collisions will be processed
    }
  }
}

window.addEventListener('keydown', (e)=>{
  if(state.gameState !== 'playing') return;
  if(Date.now() < state.respawnUntil) return;
  switch(e.key){
    case 'ArrowUp': tryMovePlayer(0,-1); e.preventDefault(); break;
    case 'ArrowDown': tryMovePlayer(0,1); e.preventDefault(); break;
    case 'ArrowLeft': tryMovePlayer(-1,0); e.preventDefault(); break;
    case 'ArrowRight': tryMovePlayer(1,0); e.preventDefault(); break;
  }
});

restartBtn.addEventListener('click', ()=>{ resetGame(); });

// Manage the enemy movement tick interval (can be changed per-stage)
function setEnemyTickInterval(ms){
  if(enemyTickId) clearInterval(enemyTickId);
  enemyTickId = setInterval(moveEnemy, ms);
}

function updateTimers(){
  // end vulnerability globally (same poweredUntil for all enemies)
  if(Date.now() >= state.poweredUntil){
    for(const en of state.enemies){ if(en.state === 'vulnerable') en.state = 'normal'; }
  }
  // finish eaten state and respawn enemies individually
  for(const en of state.enemies){
    if(en.state === 'eaten' && Date.now() >= en.eatenUntil){
      en.state = 'normal';
      en.x = en.startX; en.y = en.startY; en.prev = null;
      en.prevX = en.x; en.prevY = en.y; en.moveStart = 0;
      en.aiNext = null; en.aiLast = 0;
    }
  }
}

// handle stage progression: advance to next stage or end game
function nextStage(){
  // infinite progression: always advance to next stage (templates are reused cyclically)
  statusEl.textContent = 'Stage Clear!';
  const next = state.stageIndex + 1;
  // keep score and lives; load next stage after short delay
  setTimeout(()=>{ initStage(next); statusEl.textContent = ''; }, 700);
}

// render loop
function loop(){ updateTimers(); draw(); updateHUD(); requestAnimationFrame(loop); }

resetGame();
loop();
