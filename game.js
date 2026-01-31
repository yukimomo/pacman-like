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

let rows = mapSource.length;
let cols = mapSource[0].length;
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
canvas.width = cols * TILE;
canvas.height = rows * TILE;

let statusEl = document.getElementById('status');
let scoreEl = document.getElementById('score');
let livesEl = document.getElementById('lives');
let powerEl = document.getElementById('power');
let restartBtn = document.getElementById('restart');

let state = {
  tiles: [], // 0 wall, 1 dot, 2 empty, 3 power
  player: {x:0,y:0, prevX:0, prevY:0, moveStart:0},
  playerStart: {x:0,y:0},
  enemy: {x:0,y:0, prev:null, prevX:0, prevY:0, moveStart:0, state:'normal', eatenUntil:0},
  enemyStart: {x:0,y:0},
  dotsTotal:0,
  dotsLeft:0,
  gameState: 'playing', // 'playing'|'win'|'gameover'
  score: 0,
  lives: 3,
  poweredUntil: 0,
  respawnUntil: 0
};

function init(){
  state.tiles = [];
  state.dotsTotal = 0;
  state.dotsLeft = 0;
  state.gameState = 'playing';
  state.poweredUntil = 0;
  state.respawnUntil = 0;
  statusEl.textContent = '';

  for(let y=0;y<rows;y++){
    let row = [];
    for(let x=0;x<cols;x++){
      let ch = mapSource[y][x];
      if(ch === '#') row.push(0);
      else if(ch === '.') { row.push(1); state.dotsTotal++; }
      else if(ch === 'o') { row.push(3); state.dotsTotal++; }
      else if(ch === 'P') { row.push(2); state.player = {x,y, prevX:x, prevY:y, moveStart:0}; state.playerStart = {x,y}; }
      else if(ch === 'E') { row.push(2); state.enemy = {x,y, prev:null, prevX:x, prevY:y, moveStart:0, state:'normal', eatenUntil:0, aiLast:0, aiNext:null}; state.enemyStart = {x,y}; }
      else row.push(2);
    }
    state.tiles.push(row);
  }
  state.dotsLeft = state.dotsTotal;
  updateHUD();
}

function resetGame(){
  state.score = 0;
  state.lives = 3;
  init();
}

function updateHUD(){
  scoreEl.textContent = `Score: ${state.score}`;
  let hearts = '';
  for(let i=0;i<state.lives;i++) hearts += '♥';
  livesEl.textContent = `Lives: ${hearts}`;
  if(Date.now() < state.poweredUntil){
    powerEl.style.display = 'inline-block';
  } else {
    powerEl.style.display = 'none';
  }
}

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

  // enemy (states: normal, vulnerable(with blink), eaten) - rendered with interpolation
  let ePos = getRenderPos(state.enemy);
  if(state.enemy.state === 'eaten'){
    // draw eyes to indicate eaten (will respawn shortly)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ePos.rx - TILE*0.15, ePos.ry - TILE*0.05, TILE*0.12, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ePos.rx + TILE*0.15, ePos.ry - TILE*0.05, TILE*0.12, 0, Math.PI*2);
    ctx.fill();
  } else if(state.enemy.state === 'vulnerable'){
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
    if(state.dotsLeft === 0){ state.gameState = 'win'; statusEl.textContent = 'Clear!'; }
  } else if(state.tiles[ny][nx] === 3){
    state.tiles[ny][nx] = 2;
    state.dotsLeft--;
    state.score += 50;
    state.poweredUntil = Date.now() + 6000; // 6 seconds
    // set enemy to vulnerable
    state.enemy.state = 'vulnerable';
    updateHUD();
    if(state.dotsLeft === 0){ state.gameState = 'win'; statusEl.textContent = 'Clear!'; }
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
  const RECOMPUTE_INTERVAL = 400; // ms, can be tuned
  if(!atCenter && (now - (enemy.aiLast || 0) < RECOMPUTE_INTERVAL)) return; // skip
  enemy.aiLast = now;
  const step = bfsNextStep({x:enemy.x, y:enemy.y}, {x:player.x, y:player.y}, map);
  enemy.aiNext = step; // can be null
}

// Enemy movement now uses BFS next step and falls back to random move if no path
function moveEnemy(){
  if(state.gameState !== 'playing') return;
  if(Date.now() < state.respawnUntil) return; // pause while respawning
  if(state.enemy.state === 'eaten') return; // don't move while eaten

  // possibly compute AI
  updateEnemyAI(state.enemy, state.player, state.tiles);

  // follow BFS step if available
  const step = state.enemy.aiNext;
  if(step && (step.nx !== state.enemy.x || step.ny !== state.enemy.y)){
    state.enemy.prev = {x:state.enemy.x, y:state.enemy.y};
    state.enemy.prevX = state.enemy.x; state.enemy.prevY = state.enemy.y;
    state.enemy.x = step.nx; state.enemy.y = step.ny;
    state.enemy.moveStart = Date.now();
    checkCollision();
    return;
  }

  // fallback: random move (existing behavior)
  let n = neighbors(state.enemy.x, state.enemy.y);
  if(n.length===0) return;
  let choice = n[Math.floor(Math.random()*n.length)];
  state.enemy.prev = {x:state.enemy.x,y:state.enemy.y};
  state.enemy.prevX = state.enemy.x; state.enemy.prevY = state.enemy.y;
  state.enemy.x = choice.x; state.enemy.y = choice.y;
  state.enemy.moveStart = Date.now();
  checkCollision();
}

function checkCollision(){
  if(state.player.x === state.enemy.x && state.player.y === state.enemy.y){
    if(state.enemy.state === 'vulnerable'){
      // eat enemy: mark eaten and delay respawn for a short time
      state.score += 200;
      state.enemy.state = 'eaten';
      state.enemy.eatenUntil = Date.now() + 800; // show eaten eyes for 800ms
      updateHUD();
    } else {
      // player hit
      state.lives -= 1;
      updateHUD();
      if(state.lives <= 0){
        state.gameState = 'gameover';
        statusEl.textContent = 'Game Over';
      } else {
        // respawn both
        state.player.x = state.playerStart.x; state.player.y = state.playerStart.y;
        state.player.prevX = state.player.x; state.player.prevY = state.player.y; state.player.moveStart = 0;
        state.enemy.x = state.enemyStart.x; state.enemy.y = state.enemyStart.y; state.enemy.prev = null;
        state.enemy.prevX = state.enemy.x; state.enemy.prevY = state.enemy.y; state.enemy.moveStart = 0;
        state.enemy.aiNext = null; state.enemy.aiLast = 0;
        state.respawnUntil = Date.now() + 800;
        statusEl.textContent = 'Life lost';
        setTimeout(()=>{ statusEl.textContent = ''; }, 1000);
      }
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

// enemy tick
setInterval(moveEnemy, 350);

function updateTimers(){
  // end vulnerability
  if(state.enemy.state === 'vulnerable' && Date.now() >= state.poweredUntil){
    state.enemy.state = 'normal';
  }
  // finish eaten state and respawn enemy
  if(state.enemy.state === 'eaten' && Date.now() >= state.enemy.eatenUntil){
    state.enemy.state = 'normal';
    state.enemy.x = state.enemyStart.x; state.enemy.y = state.enemyStart.y; state.enemy.prev = null;
    state.enemy.prevX = state.enemy.x; state.enemy.prevY = state.enemy.y; state.enemy.moveStart = 0;
    state.enemy.aiNext = null; state.enemy.aiLast = 0;
  }
}

// render loop
function loop(){ updateTimers(); draw(); updateHUD(); requestAnimationFrame(loop); }

resetGame();
loop();
