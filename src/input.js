// src/input.js
// Input handling moved from game.js. No direct game logic here; we accept callbacks.

export function setupInput(tryMovePlayer, getState){
  window.addEventListener('keydown', (e)=>{
    const state = getState();
    if(state.gameState !== 'playing') return;
    if(Date.now() < state.respawnUntil) return;
    switch(e.key){
      case 'ArrowUp': tryMovePlayer(0,-1); e.preventDefault(); break;
      case 'ArrowDown': tryMovePlayer(0,1); e.preventDefault(); break;
      case 'ArrowLeft': tryMovePlayer(-1,0); e.preventDefault(); break;
      case 'ArrowRight': tryMovePlayer(1,0); e.preventDefault(); break;
    }
  });
}
