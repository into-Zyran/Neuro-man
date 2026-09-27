/* ===================================================================
   engine.js — 27x27 Puzzle Maze, Dual Tunnels, Energizers,
   Ghost AI Personalities & Dynamic Barriers
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 1.  MAP DEFINITION (27x27 Championship Puzzle Layout)
//     0 = pellet path, 1 = wall, 2 = empty path, 3 = ghost house, 4 = energizer
// ─────────────────────────────────────────────

const RAW_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,4,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,4,1],
  [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,0,1,0,1,1,1,2,1,2,1,1,1,0,1,0,1,1,1,1,1,1,1],
  [2,2,2,2,2,0,1,0,1,2,2,2,2,2,2,2,1,0,1,0,2,2,2,2,2,2,2], // Upper warp tunnel!
  [1,1,1,1,1,0,1,0,1,2,1,1,2,1,1,2,1,0,1,0,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,2,1,3,3,3,1,2,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,0,1,2,1,3,3,3,1,2,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,1,1,0,1,0,2,2,1,1,1,1,1,2,2,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,1,0,1,0,1,2,2,2,2,2,2,2,1,0,1,0,1,0,0,0,0,0,1],
  [1,1,1,0,1,0,1,0,1,1,1,1,2,1,1,1,1,0,1,0,1,0,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,0,1,2,1,0,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,1],
  [2,2,2,0,1,0,1,1,0,1,0,1,1,1,0,1,0,1,1,0,1,0,1,0,2,2,2], // Lower warp tunnel!
  [1,1,1,0,1,0,1,1,0,1,0,1,1,1,0,1,0,1,1,0,1,0,1,0,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,4,0,0,1,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1,0,0,0,0,4,1],
  [1,1,1,0,1,0,1,0,1,1,1,1,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const COLS        = 27;
const ROWS        = 27;
const TILE        = 20;                  // 20px * 27 = 540x540 canvas
const MAP_W       = COLS * TILE;
const MAP_H       = ROWS * TILE;

// Which tiles have regular pellets
const BASE_PELLETS = (() => {
  const arr = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (RAW_MAP[r][c] === 0) arr[r * COLS + c] = 1;
    }
  }
  return arr;
})();

// Which tiles have Super Energizers
const BASE_ENERGIZERS = (() => {
  const arr = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (RAW_MAP[r][c] === 4) arr[r * COLS + c] = 1;
    }
  }
  return arr;
})();

const TOTAL_PELLETS = BASE_PELLETS.reduce((s, v) => s + v, 0);

// Total walkable corridor tiles
const TOTAL_WALKABLE = (() => {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = RAW_MAP[r][c];
      if (t === 0 || t === 2 || t === 3 || t === 4) count++;
    }
  }
  return count;
})();

// Default spawn point for Pac-Man agents
const SPAWN_COL = 13, SPAWN_ROW = 23;

// Ghost citadel spawn center
const GHOST_HOUSE_ROW = 11, GHOST_HOUSE_COL = 13;

// Set of dynamic barriers placed by user in Maze Architect mode: 'col,row'
const dynamicBarriers = new Set();

// Open (walkable) tiles for agents and ghosts
function isWalkable(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  if (dynamicBarriers.has(`${col},${row}`)) return false;
  const t = RAW_MAP[row][col];
  return t === 0 || t === 2 || t === 3 || t === 4;
}

// Wrap horizontal (left/right dual tunnels)
function wrapCol(col) {
  if (col < 0) return COLS - 1;
  if (col >= COLS) return 0;
  return col;
}

// ─────────────────────────────────────────────
// 2.  DIRECTIONS
// ─────────────────────────────────────────────

const DIR = {
  UP:    { dc:  0, dr: -1, idx: 0, name: 'UP' },
  DOWN:  { dc:  0, dr:  1, idx: 1, name: 'DOWN' },
  LEFT:  { dc: -1, dr:  0, idx: 2, name: 'LEFT' },
  RIGHT: { dc:  1, dr:  0, idx: 3, name: 'RIGHT' },
};
const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

// ─────────────────────────────────────────────
// 3.  PATHFINDING & SENSOR HELPERS (BFS & Raycast)
// ─────────────────────────────────────────────

/**
 * BFS distance field from a starting tile to all walkable tiles.
 */
function computeBFSMap(startCol, startRow) {
  const dists = new Int16Array(COLS * ROWS);
  dists.fill(-1);

  const startIdx = startRow * COLS + startCol;
  dists[startIdx] = 0;
  const queue = [startCol, startRow];
  let head = 0;

  while (head < queue.length) {
    const c = queue[head++];
    const r = queue[head++];
    const curDist = dists[r * COLS + c];

    for (const d of DIRS) {
      const nc = wrapCol(c + d.dc);
      const nr = r + d.dr;
      const nIdx = nr * COLS + nc;

      if (isWalkable(nc, nr) && dists[nIdx] === -1) {
        dists[nIdx] = curDist + 1;
        queue.push(nc, nr);
      }
    }
  }
  return dists;
}

/**
 * Find optimal step direction and path distance to the nearest uneaten pellet/energizer.
 */
function findNearestPelletPath(agentCol, agentRow, pelletsEaten, energizersEaten) {
  const visited = new Uint8Array(COLS * ROWS);
  const startIdx = agentRow * COLS + agentCol;
  visited[startIdx] = 1;

  const queue = [];

  for (const d of DIRS) {
    const nc = wrapCol(agentCol + d.dc);
    const nr = agentRow + d.dr;
    const nIdx = nr * COLS + nc;
    if (isWalkable(nc, nr) && !visited[nIdx]) {
      visited[nIdx] = 1;
      const hasPellet = BASE_PELLETS[nIdx] && (!pelletsEaten || !pelletsEaten[nIdx]);
      const hasEnergizer = BASE_ENERGIZERS[nIdx] && (!energizersEaten || !energizersEaten[nIdx]);
      if (hasPellet || hasEnergizer) {
        return { dirIdx: d.idx, dx: d.dc, dy: d.dr, dist: 1, isEnergizer: !!hasEnergizer };
      }
      queue.push(nc, nr, d.idx, 1);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const c = queue[head++];
    const r = queue[head++];
    const firstDirIdx = queue[head++];
    const dist = queue[head++];

    if (dist > 36) break; // depth limit for peak 60fps performance

    for (const d of DIRS) {
      const nc = wrapCol(c + d.dc);
      const nr = r + d.dr;
      const nIdx = nr * COLS + nc;

      if (isWalkable(nc, nr) && !visited[nIdx]) {
        visited[nIdx] = 1;
        const hasPellet = BASE_PELLETS[nIdx] && (!pelletsEaten || !pelletsEaten[nIdx]);
        const hasEnergizer = BASE_ENERGIZERS[nIdx] && (!energizersEaten || !energizersEaten[nIdx]);
        if (hasPellet || hasEnergizer) {
          const dObj = DIRS[firstDirIdx];
          return { dirIdx: firstDirIdx, dx: dObj.dc, dy: dObj.dr, dist: dist + 1, isEnergizer: !!hasEnergizer };
        }
        queue.push(nc, nr, firstDirIdx, dist + 1);
      }
    }
  }

  return { dirIdx: 3, dx: 1, dy: 0, dist: 99, isEnergizer: false };
}

/**
 * Raycast in 4 cardinal directions to measure distance to nearest wall or barrier.
 */
function raycastWallClearance(col, row) {
  const maxRange = 12;
  const clearances = [0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    const d = DIRS[i];
    let dist = 0;
    let c = col;
    let r = row;

    while (dist < maxRange) {
      c = wrapCol(c + d.dc);
      r = r + d.dr;
      if (!isWalkable(c, r)) break;
      dist++;
    }
    clearances[i] = dist / maxRange;
  }
  return clearances;
}

// ─────────────────────────────────────────────
// 4.  GHOST CLASS (AI Personalities)
// ─────────────────────────────────────────────

class Ghost {
  constructor(col, row, type = 'blinky', color = '#ff2d55') {
    this.col               = col;
    this.row               = row;
    this.type              = type;
    this.color             = color;
    this.dir               = DIRS[Math.floor(Math.random() * 4)];
    this.moveTimer         = 0;
    this.moveRate          = 13 + Math.floor(Math.random() * 4);
    this.userSpawned       = false;
    this.targetCol         = col;
    this.targetRow         = row;
    this.eaten             = false;
  }

  updateTarget(leadAgent) {
    if (!leadAgent || !leadAgent.alive) {
      this.targetCol = SPAWN_COL;
      this.targetRow = SPAWN_ROW;
      return;
    }

    switch (this.type) {
      case 'blinky': // Red: Direct aggressive pursuer
        this.targetCol = leadAgent.col;
        this.targetRow = leadAgent.row;
        break;

      case 'pinky': // Pink: Ambush interceptor (3 tiles ahead)
        this.targetCol = wrapCol(leadAgent.col + leadAgent.dir.dc * 3);
        this.targetRow = Math.max(1, Math.min(ROWS - 2, leadAgent.row + leadAgent.dir.dr * 3));
        break;

      case 'inky': // Cyan: Flanker
        this.targetCol = wrapCol(leadAgent.col - leadAgent.dir.dc * 2);
        this.targetRow = Math.max(1, Math.min(ROWS - 2, leadAgent.row - leadAgent.dir.dr * 2));
        break;

      case 'clyde': { // Orange: Cowardly roamer
        const dx = leadAgent.col - this.col;
        const dy = leadAgent.row - this.row;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 7) {
          this.targetCol = leadAgent.col;
          this.targetRow = leadAgent.row;
        } else {
          this.targetCol = 1;
          this.targetRow = ROWS - 2;
        }
        break;
      }

      default:
        this.targetCol = leadAgent.col;
        this.targetRow = leadAgent.row;
        break;
    }
  }

  update(leadAgent) {
    this.moveTimer++;
    if (this.moveTimer < this.moveRate) return;
    this.moveTimer = 0;

    this.updateTarget(leadAgent);

    const reverseIdx = (this.dir === DIR.UP ? DIR.DOWN.idx :
                        this.dir === DIR.DOWN ? DIR.UP.idx :
                        this.dir === DIR.LEFT ? DIR.RIGHT.idx : DIR.LEFT.idx);

    const validDirs = [];
    for (const d of DIRS) {
      if (d.idx === reverseIdx) continue;
      const tc = wrapCol(this.col + d.dc);
      const tr = this.row + d.dr;
      if (isWalkable(tc, tr)) validDirs.push(d);
    }

    if (validDirs.length === 0) {
      for (const d of DIRS) {
        const tc = wrapCol(this.col + d.dc);
        const tr = this.row + d.dr;
        if (isWalkable(tc, tr)) { this.dir = d; break; }
      }
    } else if (validDirs.length === 1) {
      this.dir = validDirs[0];
    } else {
      if (Math.random() < 0.15) {
        this.dir = validDirs[Math.floor(Math.random() * validDirs.length)];
      } else {
        let bestDir = validDirs[0];
        let minDist = Infinity;
        for (const d of validDirs) {
          const tc = wrapCol(this.col + d.dc);
          const tr = this.row + d.dr;
          let dx = tc - this.targetCol;
          if (Math.abs(dx) > COLS / 2) dx = dx > 0 ? dx - COLS : dx + COLS;
          const dy = tr - this.targetRow;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            bestDir = d;
          }
        }
        this.dir = bestDir;
      }
    }

    const fc = wrapCol(this.col + this.dir.dc);
    const fr = this.row + this.dir.dr;
    if (isWalkable(fc, fr)) {
      this.col = fc;
      this.row = fr;
    }
  }

  collides(agentCol, agentRow) {
    return this.col === agentCol && this.row === agentRow;
  }
}

// ─────────────────────────────────────────────
// 5.  AGENT CLASS (Dense Reward & Exploration State)
// ─────────────────────────────────────────────

class Agent {
  constructor(brain) {
    this.brain            = brain;
    this.col              = SPAWN_COL;
    this.row              = SPAWN_ROW;
    this.dir              = DIR.RIGHT;
    this.alive            = true;
    this.pelletsEaten     = new Uint8Array(COLS * ROWS);
    this.energizersEaten  = new Uint8Array(COLS * ROWS);
    this.pelletsCount     = 0;
    this.energizersCount  = 0;
    this.ghostsEatenCount = 0;
    this.frames           = 0;
    this.fitness          = 0;
    this.visitCount       = new Uint16Array(COLS * ROWS);
    this.uniqueTiles      = 0;
    this.moveTimer        = 0;
    this.moveRate         = 8;
    this.lastOutputs      = new Float64Array(4);
    this.stuckFrames      = 0;
    this.lastCol          = -1;
    this.lastRow          = -1;
    this.recentPath       = [];
    this.shapedReward     = 0;
    this.prevPelletDist   = -1;
    this.prevGhostDist    = -1;
  }

  reset(col, row) {
    this.col = col;
    this.row = row;
    this.dir = DIR.RIGHT;
    this.alive = true;
    this.pelletsEaten.fill(0);
    this.energizersEaten.fill(0);
    this.pelletsCount = 0;
    this.energizersCount = 0;
    this.ghostsEatenCount = 0;
    this.frames = 0;
    this.fitness = 0;
    this.visitCount.fill(0);
    this.uniqueTiles = 0;
    this.moveTimer = 0;
    this.stuckFrames = 0;
    this.lastCol = col;
    this.lastRow = row;
    this.recentPath = [];
    this.shapedReward = 0;
    this.prevPelletDist = -1;
    this.prevGhostDist = -1;
  }

  calcFitness() {
    let penalty = 0;
    let uniqueCount = 0;

    for (let i = 0; i < this.visitCount.length; i++) {
      const v = this.visitCount[i];
      if (v > 0) uniqueCount++;
      if (v > 4) penalty += (v - 4) * 0.15;
    }
    this.uniqueTiles = uniqueCount;

    // Strict 0 to 100 max scale:
    // 1. Food: up to 50 pts (clearing all pellets = 50 pts)
    const foodScore = (this.pelletsCount / Math.max(1, TOTAL_PELLETS)) * 50.0;
    // 2. Exploration: up to 25 pts (exploring all walkable corridors = 25 pts)
    const exploreScore = (uniqueCount / Math.max(1, TOTAL_WALKABLE)) * 25.0;
    // 3. Energizers: up to 15 pts (4 energizers * 3.75 = 15 pts)
    const energizerScore = Math.min(15.0, this.energizersCount * 3.75);
    // 4. Survival & Dense Shaping: up to 10 pts
    const shapeScore = Math.max(-10.0, Math.min(10.0, this.shapedReward + (this.frames * 0.005)));

    const raw = foodScore + exploreScore + energizerScore + shapeScore - penalty;
    this.fitness = Math.max(0.0, Math.min(100.0, raw));

    return this.fitness;
  }
}

// ─────────────────────────────────────────────
// 6.  ENGINE EXPORTS & CANVAS DRAWING
// ─────────────────────────────────────────────

const Engine = {
  RAW_MAP, COLS, ROWS, TILE, MAP_W, MAP_H,
  BASE_PELLETS, BASE_ENERGIZERS, TOTAL_PELLETS, TOTAL_WALKABLE,
  SPAWN_COL, SPAWN_ROW,
  GHOST_HOUSE_ROW, GHOST_HOUSE_COL,
  DIRS, DIR,
  dynamicBarriers,
  isWalkable, wrapCol,
  findNearestPelletPath,
  raycastWallClearance,
  computeBFSMap,
  Ghost, Agent,

  createDefaultGhosts() {
    return [
      new Ghost(12, 11, 'blinky', '#ff2d55'), // Red Chaser
      new Ghost(14, 11, 'pinky',  '#ffb8ff'), // Pink Ambusher
      new Ghost(12, 12, 'inky',   '#00b8ff'), // Cyan Flanker
      new Ghost(14, 12, 'clyde',  '#ffb700'), // Orange Roamer
    ];
  },

  drawMap(ctx, leaderPellets, leaderEnergizers) {
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = RAW_MAP[r][c];
        const x = c * TILE, y = r * TILE;
        const key = `${c},${r}`;

        if (dynamicBarriers.has(key)) {
          // Dynamic Neon Barrier
          ctx.fillStyle = '#ff6b00';
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = '#ffe600';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        } else if (t === 1) {
          // Wall
          ctx.fillStyle = '#0b1d33';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#183c66';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (t === 3) {
          // Ghost house
          ctx.fillStyle = '#081420';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#ff2d5530';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          // Floor
          ctx.fillStyle = '#040a12';
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    const cx = TILE / 2, cy = TILE / 2;

    // Draw regular pellets
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (!BASE_PELLETS[idx]) continue;
        if (leaderPellets && leaderPellets[idx]) continue;
        const x = c * TILE, y = r * TILE;
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#f5e6a0';
        ctx.fill();
      }
    }

    // Draw glowing Super Energizers (Power Pellets)
    const pulse = 0.8 + 0.25 * Math.sin(performance.now() * 0.008);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (!BASE_ENERGIZERS[idx]) continue;
        if (leaderEnergizers && leaderEnergizers[idx]) continue;
        const x = c * TILE, y = r * TILE;

        ctx.save();
        ctx.shadowBlur = 12 * pulse;
        ctx.shadowColor = '#00f7ff';
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, 5.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#00f7ff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
    }
  },

  drawGhost(ctx, ghost) {
    const x = ghost.col * TILE + TILE / 2;
    const y = ghost.row * TILE + TILE / 2;
    const r = TILE * 0.44;

    ctx.save();

    const gColor = ghost.color;

    ctx.shadowBlur  = 10;
    ctx.shadowColor = gColor;

    // Body
    ctx.beginPath();
    ctx.arc(x, y - r * 0.1, r, Math.PI, 0, false);
    const segs = 3;
    const segW = (r * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const bx = (x - r) + segW * (i + 1);
      const bcy = (i % 2 === 0) ? y + r * 0.7 : y + r * 0.3;
      ctx.quadraticCurveTo(bx - segW / 2, bcy, bx, y + r * 0.5);
    }
    ctx.lineTo(x - r, y - r * 0.1);
    ctx.fillStyle = gColor;
    ctx.fill();

    // Eyes
    const eyeOffX = r * 0.28, eyeOffY = r * 0.05;
    [x - eyeOffX, x + eyeOffX].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, y - eyeOffY, r * 0.22, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ghost.dir.dc * 1.5, y - eyeOffY + ghost.dir.dr * 1.5, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#1a2aff';
      ctx.fill();
    });

    ctx.restore();
  },

  drawPlayer(ctx, player) {
    if (!player.alive && !player.isDying) return;
    const x = player.col * TILE + TILE / 2;
    const y = player.row * TILE + TILE / 2;
    let r = TILE * 0.44;

    ctx.save();

    if (player.isDying) {
      const progress = Math.min(1, player.deathTimer / 30);
      r *= Math.max(0, 1 - progress);
      ctx.translate(x, y);
      ctx.rotate(progress * Math.PI * 4);
      ctx.translate(-x, -y);
      ctx.fillStyle = '#ff2d55';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff2d55';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const mouthAngle = 0.28 * Math.abs(Math.sin(performance.now() * 0.02));
    let heading = 0;
    if      (player.dir === DIR.UP)    heading = 1.5 * Math.PI;
    else if (player.dir === DIR.DOWN)  heading = 0.5 * Math.PI;
    else if (player.dir === DIR.LEFT)  heading = Math.PI;

    ctx.shadowBlur  = 22;
    ctx.shadowColor = '#ffe600';
    ctx.fillStyle   = '#ffe600';

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, heading + mouthAngle, heading + Math.PI * 2 - mouthAngle);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.beginPath();
    const eyeAngle = heading - Math.PI / 2.5;
    const eyeOffX = Math.cos(eyeAngle) * r * 0.45;
    const eyeOffY = Math.sin(eyeAngle) * r * 0.45;
    ctx.arc(x + eyeOffX, y + eyeOffY, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Subtle crown/player ring
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  },

  drawAgent(ctx, agent, isLeader) {
    if (!agent.alive) return;
    const x = agent.col * TILE + TILE / 2;
    const y = agent.row * TILE + TILE / 2;
    const r = TILE * 0.40;

    const mouthAngle = 0.25 * Math.abs(Math.sin(performance.now() * 0.018));
    let heading = 0;
    if      (agent.dir === DIR.UP)    heading = 1.5 * Math.PI;
    else if (agent.dir === DIR.DOWN)  heading = 0.5 * Math.PI;
    else if (agent.dir === DIR.LEFT)  heading = Math.PI;

    ctx.save();
    if (isLeader) {
      ctx.shadowBlur  = 16;
      ctx.shadowColor = '#ffe600';
      ctx.fillStyle   = '#ffe600';
      ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle   = '#00c8d4';
      ctx.globalAlpha = 0.25;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, heading + mouthAngle, heading + Math.PI * 2 - mouthAngle);
    ctx.closePath();
    ctx.fill();

    if (isLeader) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      const eyeAngle = heading - Math.PI / 2.5;
      const eyeOffX = Math.cos(eyeAngle) * r * 0.45;
      const eyeOffY = Math.sin(eyeAngle) * r * 0.45;
      ctx.arc(x + eyeOffX, y + eyeOffY, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.restore();
  },

  drawFloatingTexts(ctx, floatingTexts) {
    if (!floatingTexts || floatingTexts.length === 0) return;
    ctx.save();
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.life--;
      ft.y -= 0.6;
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color || '#ffe600';
      ctx.font = 'bold 12px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 8;
      ctx.shadowColor = ft.color || '#ffe600';
      ctx.fillText(ft.text, ft.x, ft.y);
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
    ctx.restore();
  },
};


