// src/render/sprites.js
// SVG sprite generation/caching and draw helpers (moved from game.js)

import { TILE } from '../config.js';

const spriteCache = {};

function buildSvgDataUri(svg){ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

function loadSprite(name, svg){
  return new Promise((resolve, reject)=>{
    if(spriteCache[name]) return resolve(spriteCache[name]);
    const img = new Image();
    img.onload = ()=>{ spriteCache[name] = img; resolve(img); };
    img.onerror = (e)=>{ console.warn('Failed to load sprite', name, e); reject(e); };
    img.src = buildSvgDataUri(svg);
  });
}

// Player SVG (right-facing) - replaced per user's request with nicer path-based circle+mouth
export function playerSvg(){
  return `<?xml version='1.0' encoding='utf-8'?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
  <!-- Pac-Man (right-facing base). Circle radius 45 centered at 50,50, mouth ±20° -->
  <path d="M50 50 L 92.286 34.609 A 45 45 0 1 1 92.286 65.391 Z" fill="#FFD84D" />
  <!-- Eye (right-facing position) -->
  <circle cx="62" cy="35" r="4" fill="#000" />
</svg>`;
}

export function enemySvg(color){
  return `<?xml version='1.0' encoding='utf-8'?>
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <path d='M10 45 A40 40 0 0 1 90 45 L90 70 A10 10 0 0 1 70 70 A10 10 0 0 1 50 70 A10 10 0 0 1 30 70 A10 10 0 0 1 10 70 Z' fill='${color}' stroke='rgba(0,0,0,0.08)' stroke-width='2'/>
    <!-- eyes -->
    <circle cx='38' cy='50' r='9' fill='#fff'/>
    <circle cx='62' cy='50' r='9' fill='#fff'/>
    <circle cx='40' cy='52' r='4' fill='#000'/>
    <circle cx='64' cy='52' r='4' fill='#000'/>
  </svg>`;
}

export async function initSprites(){
  try{
    await Promise.all([
      loadSprite('player', playerSvg()),
      loadSprite('enemyRed', enemySvg('#ff6b6b')),
      loadSprite('enemyBlue', enemySvg('#6cf')),
      loadSprite('enemyWhite', enemySvg('#ffffff'))
    ]);
  }catch(e){ console.warn('sprite load failed', e); }
}

export function drawPlayerSprite(ctx, px, py, dir, scale=1){
  const img = spriteCache.player;
  const size = TILE * 0.9 * scale;
  if(img && img.complete){
    ctx.save(); ctx.translate(px, py);
    let angle = 0;
    if(dir === 'right') angle = 0;
    else if(dir === 'left') angle = Math.PI;
    else if(dir === 'up') angle = -Math.PI/2;
    else if(dir === 'down') angle = Math.PI/2;
    ctx.rotate(angle);
    ctx.drawImage(img, -size/2, -size/2, size, size);
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(px,py); ctx.scale(scale,scale);
    ctx.fillStyle = '#ffd86b'; ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0, TILE*0.38, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export function drawEnemySprite(ctx, px, py, enState, blinkOn, flip=false){
  const size = TILE * 0.9;
  if(enState === 'eaten'){
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px - TILE*0.15, py - TILE*0.05, TILE*0.12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + TILE*0.15, py - TILE*0.05, TILE*0.12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(px - TILE*0.15, py - TILE*0.05, TILE*0.06, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + TILE*0.15, py - TILE*0.05, TILE*0.06, 0, Math.PI*2); ctx.fill();
    return;
  }
  let key = 'enemyRed';
  if(enState === 'vulnerable') key = blinkOn ? 'enemyBlue' : 'enemyWhite';
  const img = spriteCache[key];
  if(img && img.complete){
    ctx.save();
    if(flip){ ctx.translate(px,py); ctx.scale(-1,1); ctx.drawImage(img, -size/2, -size/2, size, size); }
    else { ctx.drawImage(img, px - size/2, py - size/2, size, size); }
    ctx.restore();
  } else {
    if(enState === 'vulnerable') ctx.fillStyle = '#9fe6ff';
    else ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc(px,py, TILE*0.36, 0, Math.PI*2); ctx.fill();
  }
}
