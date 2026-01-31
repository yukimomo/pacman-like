// src/ai/bfs.js
// BFS pathfinding moved from game.js; now parameterized by cols/rows

export function isWalkable(tx, ty, map, cols, rows){
  return tx >= 0 && tx < cols && ty >= 0 && ty < rows && map[ty][tx] !== 0;
}

export function bfsNextStep(start, goal, map, cols, rows){
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
      if(!isWalkable(nx, ny, map, cols, rows)) continue;
      const nIdx = ny * cols + nx;
      if(visited[nIdx]) continue;
      visited[nIdx] = 1;
      parent[nIdx] = idx;
      if(nIdx === goalIdx){
        let cur = goalIdx;
        while(parent[cur] !== startIdx){ cur = parent[cur]; if(cur === -1) break; }
        return { nx: cur % cols, ny: Math.floor(cur / cols) };
      }
      q.push(nIdx);
    }
  }
  return null;
}
