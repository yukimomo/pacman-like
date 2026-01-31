// src/map/generate.js
// Map generation utilities moved from game.js (mutateMap, generateStage, connectivity helpers)

import { createRng, BASE_SEED } from '../rng.js';
import { levels } from '../config.js';

export function deepCopyMap(map){ return map.map(r=>r.split('')); }

export function shuffleArray(arr, rng){
  for(let i = arr.length-1;i>0;i--){
    const j = Math.floor(rng()* (i+1));
    const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
}

export function mutateMap(baseMapChars, rng, stageIndex){
  const h = baseMapChars.length, w = baseMapChars[0].length;
  const maxMutate = Math.min(0.08, 0.02 + stageIndex*0.001);
  const map = baseMapChars.map(r=>r.slice());
  const preserve = new Set();
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const ch = baseMapChars[y][x]; if(ch==='P' || ch==='E') preserve.add(y*1000+x);} }
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx = y*1000+x;
      if(preserve.has(idx)) continue;
      if(rng() < maxMutate){ if(map[y][x] === '#') map[y][x] = '.'; else if(map[y][x] === '.') map[y][x] = '#'; }
    }
  }

  const powerCount = baseMapChars.flat().filter(c=>c==='o').length;
  const dotCount = baseMapChars.flat().filter(c=>c==='.').length;
  const candidates = [];
  for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ const idx = y*1000+x; if(preserve.has(idx)) continue; if(map[y][x] !== '#') candidates.push({x,y}); } }
  shuffleArray(candidates, rng);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) { if(map[y][x]==='.'||map[y][x]==='o') map[y][x]=' '; }
  for(let i=0;i<powerCount && i<candidates.length;i++){ const p = candidates[i]; map[p.y][p.x] = 'o'; }
  for(let i=powerCount;i<powerCount+dotCount && i<candidates.length;i++){ const p = candidates[i]; if(map[p.y][p.x]===' ') map[p.y][p.x] = '.'; }
  return map;
}

export function getReachable(mapChars, start){
  const h = mapChars.length, w = mapChars[0].length;
  const reachable = Array.from({length:h}, ()=> Array(w).fill(false));
  const list = [];
  if(start.x < 0 || start.x >= w || start.y < 0 || start.y >= h) return {reachable, list};
  if(mapChars[start.y][start.x] === '#') return {reachable, list};
  const q = [{x:start.x,y:start.y}]; reachable[start.y][start.x] = true; let qi=0;
  while(qi < q.length){ const cur = q[qi++]; list.push({x:cur.x,y:cur.y}); const dirs=[[1,0],[-1,0],[0,1],[0,-1]]; for(const d of dirs){ const nx = cur.x + d[0], ny = cur.y + d[1]; if(nx>=0&&nx<w&&ny>=0&&ny<h && !reachable[ny][nx] && mapChars[ny][nx] !== '#'){ reachable[ny][nx] = true; q.push({x:nx,y:ny}); } } }
  return {reachable, list};
}

export function findDisconnected(mapChars, reachable){
  const h = mapChars.length, w = mapChars[0].length;
  const out = [];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(mapChars[y][x] !== '#' && !reachable[y][x]) out.push({x,y}); }
  return out;
}

export function connectMap(mapChars, playerStart, rng, maxOps = 200){
  for(let op=0; op<maxOps; op++){
    const nowResult = getReachable(mapChars, playerStart);
    const disconnected = findDisconnected(mapChars, nowResult.reachable);
    if(disconnected.length === 0) return true;
    const d = disconnected[Math.floor(rng()*disconnected.length)];
    let best = null, bestDist = Infinity;
    for(const r of nowResult.list){ const dist = Math.abs(r.x - d.x) + Math.abs(r.y - d.y); if(dist < bestDist){ bestDist = dist; best = r; } }
    if(!best) return false;
    let cx = d.x, cy = d.y;
    const horizFirst = rng() < 0.5;
    if(horizFirst){ while(cx !== best.x){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cx += (best.x > cx) ? 1 : -1; } while(cy !== best.y){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cy += (best.y > cy) ? 1 : -1; } }
    else { while(cy !== best.y){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cy += (best.y > cy) ? 1 : -1; } while(cx !== best.x){ if(mapChars[cy][cx] === '#') mapChars[cy][cx] = ' '; cx += (best.x > cx) ? 1 : -1; } }
    if(mapChars[best.y][best.x] === '#') mapChars[best.y][best.x] = ' ';
    if(mapChars[d.y][d.x] === '#') mapChars[d.y][d.x] = ' ';
  }
  return false;
}

export function relocateDotsToReachable(mapChars, reachable, rng){
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

export function generateStage(stageIndex, baseSeed){
  const template = levels[stageIndex % levels.length].map; // array of strings
  const baseChars = deepCopyMap(template);
  let basePlayer = null; const baseEnemies = [];
  for(let y=0;y<baseChars.length;y++) for(let x=0;x<baseChars[0].length;x++){ const ch = baseChars[y][x]; if(ch === 'P') basePlayer = {x,y}; if(ch==='E') baseEnemies.push({x,y}); }
  if(!basePlayer){ basePlayer = {x:1,y:1}; }

  const MAX_ATTEMPTS = 20;
  for(let attempt=0; attempt<MAX_ATTEMPTS; attempt++){
    const stageSeed = (baseSeed || BASE_SEED) + stageIndex*100 + attempt;
    const rng = createRng(stageSeed);
    let mutated = mutateMap(baseChars, rng, stageIndex);
    mutated[basePlayer.y][basePlayer.x] = 'P';
    for(const be of baseEnemies) mutated[be.y][be.x] = 'E';
    const initialReach = getReachable(mutated, basePlayer);
    if(!connectMap(mutated, basePlayer, rng, 200)) continue;
    const afterReach = getReachable(mutated, basePlayer);
    relocateDotsToReachable(mutated, afterReach.reachable, rng);
    const finalReach = getReachable(mutated, basePlayer);
    const disconnected = findDisconnected(mutated, finalReach.reachable);
    if(disconnected.length === 0){ const mapStrings = mutated.map(r=>r.join('')); return { map: mapStrings, playerStart: basePlayer, enemies: baseEnemies, seedUsed: stageSeed }; }
  }
  return { map: template.slice(), playerStart: basePlayer, enemies: baseEnemies, seedUsed: (baseSeed || BASE_SEED) + stageIndex };
}
