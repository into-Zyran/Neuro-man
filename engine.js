/* ===================================================================
   engine.js — Maze, Collision, Ghost AI, Agent State
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 1.  MAP DEFINITION
//     0 = pellet path, 1 = wall, 2 = empty path (no pellet), 3 = ghost house
// ─────────────────────────────────────────────

const RAW_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,2,2,1,2,2,1,1,1,0,1,1,1,1],
  [1,1,1,1,0,1,2,2,2,2,2,2,2,2,2,1,0,1,1,1,1],
  [1,1,1,1,0,1,2,1,3,3,3,3,3,1,2,1,0,1,1,1,1],
  [2,2,2,2,0,2,2,1,3,3,3,3,3,1,2,2,0,2,2,2,2],
  [1,1,1,1,0,1,2,1,1,1,1,1,1,1,2,1,0,1,1,1,1],
  [1,1,1,1,0,1,2,2,2,2,2,2,2,2,2,1,0,1,1,1,1],
  [1,1,1,1,0,1,2,1,1,1,1,1,1,1,2,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,1,0,0,0,0,0,0,2,0,0,0,0,0,0,1,0,0,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const COLS        = RAW_MAP[0].length;   // 21
const ROWS        = RAW_MAP.length;      // 22
const TILE        = 24;                  // pixels per tile
const MAP_W       = COLS * TILE;
const MAP_H       = ROWS * TILE;

// Which tiles have pellets initially
const BASE_PELLETS = (() => {
  const arr = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (RAW_MAP[r][c] === 0) arr[r * COLS + c] = 1;
  return arr;
})();

const TOTAL_PELLETS = BASE_PELLETS.reduce((s, v) => s + v, 0);

// Spawn point (open path tile)
const SPAWN_COL = 10, SPAWN_ROW = 16;

// Ghost house center
const GHOST_HOUSE_ROW = 9, GHOST_HOUSE_COL = 10;

// Open (walkable) tiles for agents and ghosts
function isWalkable(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  const t = RAW_MAP[row][col];
  return t === 0 || t === 2 || t === 3;
}

// Wrap horizontal (left/right tunnel)
function wrapCol(col) {
  if (col < 0) return COLS - 1;
  if (col >= COLS) return 0;
  return col;
}

// ─────────────────────────────────────────────
// 2.  DIRECTIONS
// ─────────────────────────────────────────────

const DIR = {
  UP:    { dc:  0, dr: -1, idx: 0 },
  DOWN:  { dc:  0, dr:  1, idx: 1 },
  LEFT:  { dc: -1, dr:  0, idx: 2 },
  RIGHT: { dc:  1, dr:  0, idx: 3 },
};
const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

// ─────────────────────────────────────────────
// 3.  GHOST CLASS
// ─────────────────────────────────────────────

class Ghost {
  constructor(col, row, color) {
    this.col      = col;
    this.row      = row;
    this.color    = color || '#ff2d55';
    this.dir      = DIRS[Math.floor(Math.random() * 4)];
    this.moveTimer = 0;
    this.moveRate  = 14 + Math.floor(Math.random() * 6); // frames per step
    this.userSpawned = false;
  }

  /** Semi-random intersection roaming — prefers straight/turning, rarely reverses. */
  update() {
    this.moveTimer++;
    if (this.moveTimer < this.moveRate) return;
    this.moveTimer = 0;

    const nc = wrapCol(this.col + this.dir.dc);
    const nr = this.row + this.dir.dr;
    const canContinue = isWalkable(nc, nr);

    // Collect valid directions (excluding reverse)
    const reverseIdx = (this.dir === DIR.UP ? DIR.DOWN.idx :
                        this.dir === DIR.DOWN ? DIR.UP.idx :
                        this.dir === DIR.LEFT ? DIR.RIGHT.idx : DIR.LEFT.idx);
    const options = [];
    for (const d of DIRS) {
      if (d.idx === reverseIdx) continue;
      const tc = wrapCol(this.col + d.dc);
      const tr = this.row + d.dr;
      if (isWalkable(tc, tr)) options.push(d);
    }

    if (options.length === 0) {
      // boxed in — take reverse
      for (const d of DIRS) {
        const tc = wrapCol(this.col + d.dc);
        const tr = this.row + d.dr;
        if (isWalkable(tc, tr)) { this.dir = d; break; }
      }
    } else if (!canContinue || (options.length > 1 && Math.random() < 0.40)) {
      // at wall OR random turn at intersection
      this.dir = options[Math.floor(Math.random() * options.length)];
    }

    const fc = wrapCol(this.col + this.dir.dc);
    const fr = this.row + this.dir.dr;
    if (isWalkable(fc, fr)) {
      this.col = fc;
      this.row = fr;
    }
  }

  /** Check collision with an agent (tile-based). */
  collides(agentCol, agentRow) {
    return this.col === agentCol && this.row === agentRow;
  }
}

// ─────────────────────────────────────────────
// 4.  AGENT CLASS
// ─────────────────────────────────────────────

class Agent {
  constructor(brain) {
    this.brain        = brain;                         // NeuralNet
    this.col          = SPAWN_COL;
    this.row          = SPAWN_ROW;
    this.dir          = DIR.RIGHT;
    this.alive        = true;
    this.pelletsEaten = new Uint8Array(COLS * ROWS);   // independent state!
    this.pelletsCount = 0;
    this.frames       = 0;
    this.fitness      = 0;
    this.visitCount   = new Uint16Array(COLS * ROWS);  // for tile-repeat penalty
    this.moveTimer    = 0;
    this.moveRate     = 8;                             // frames per step
    this.lastOutputs  = new Float64Array(4);
  }

  reset(col, row) {
    this.col = col; this.row = row;
    this.dir = DIR.RIGHT;
    this.alive = true;
    this.pelletsEaten.fill(0);
    this.pelletsCount = 0;
    this.frames = 0; this.fitness = 0;
    this.visitCount.fill(0);
    this.moveTimer = 0;
  }

  /** Compute composite fitness. */
  calcFitness() {
    let penalty = 0;
    for (let i = 0; i < this.visitCount.length; i++) {
      const v = this.visitCount[i];
      if (v > 2) penalty += (v - 2) * 3;
    }
    this.fitness = (this.pelletsCount * 100) + (this.frames * 0.2) - penalty;
    return this.fitness;
  }
}

// ─────────────────────────────────────────────
// 5.  ENGINE EXPORTS
// ─────────────────────────────────────────────

const Engine = {
  RAW_MAP, COLS, ROWS, TILE, MAP_W, MAP_H,
  BASE_PELLETS, TOTAL_PELLETS,
  SPAWN_COL, SPAWN_ROW,
  GHOST_HOUSE_ROW, GHOST_HOUSE_COL,
  DIRS, DIR,
  isWalkable, wrapCol,
  Ghost, Agent,

  /** Build the default 4 ghosts. */
  createDefaultGhosts() {
    return [
      new Ghost(9,  9,  '#ff2d55'),
      new Ghost(11, 9,  '#ffb8ff'),
      new Ghost(9,  10, '#00b8ff'),
      new Ghost(11, 10, '#ffb700'),
    ];
  },

  /** Canvas drawing helpers */
  drawMap(ctx, leaderPellets) {
    // Background
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = RAW_MAP[r][c];
        const x = c * TILE, y = r * TILE;

        if (t === 1) {
          // Wall
          ctx.fillStyle = '#0d2540';
          ctx.fillRect(x, y, TILE, TILE);
          // Wall inner highlight
          ctx.strokeStyle = '#1a4880';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (t === 3) {
          // Ghost house
          ctx.fillStyle = '#0a1520';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#ff2d5540';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          // Walkable — dark floor
          ctx.fillStyle = '#050c14';
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // Draw pellets based on leader's local state
    const cx = TILE / 2, cy = TILE / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (BASE_PELLETS[idx] && !leaderPellets[idx]) continue;
        if (!BASE_PELLETS[idx]) continue;
        const x = c * TILE, y = r * TILE;
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f5e6a0';
        ctx.fill();
      }
    }
  },

  drawGhost(ctx, ghost) {
    const x = ghost.col * TILE + TILE / 2;
    const y = ghost.row * TILE + TILE / 2;
    const r = TILE * 0.42;

    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = ghost.color;

    // Body
    ctx.beginPath();
    ctx.arc(x, y - r * 0.1, r, Math.PI, 0, false);
    // Wavy bottom
    const segs = 3;
    const segW  = (r * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const bx = (x - r) + segW * (i + 1);
      const bcy = (i % 2 === 0) ? y + r * 0.7 : y + r * 0.3;
      ctx.quadraticCurveTo(bx - segW / 2, bcy, bx, y + r * 0.5);
    }
    ctx.lineTo(x - r, y - r * 0.1);
    ctx.fillStyle = ghost.color;
    ctx.fill();

    // Eyes
    const eyeOffX = r * 0.28, eyeOffY = r * 0.05;
    [x - eyeOffX, x + eyeOffX].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, y - eyeOffY, r * 0.22, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + r * 0.05, y - eyeOffY + r * 0.06, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#1a2aff';
      ctx.fill();
    });

    ctx.restore();
  },

  drawAgent(ctx, agent, isLeader) {
    if (!agent.alive && !isLeader) return;
    const x  = agent.col * TILE + TILE / 2;
    const y  = agent.row * TILE + TILE / 2;
    const r  = TILE * 0.38;

    // Mouth angle
    const mouthAngle = 0.25 * Math.PI;
    let startAngle = mouthAngle;
    if      (agent.dir === DIR.UP)    startAngle += 1.5 * Math.PI;
    else if (agent.dir === DIR.DOWN)  startAngle += 0.5 * Math.PI;
    else if (agent.dir === DIR.LEFT)  startAngle += Math.PI;
    // RIGHT is default 0

    ctx.save();
    if (isLeader) {
      ctx.shadowBlur  = 18;
      ctx.shadowColor = '#ffe600';
      ctx.fillStyle   = '#ffe600';
      ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle   = '#00c8d4';
      ctx.globalAlpha = 0.22;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, startAngle + mouthAngle, startAngle + Math.PI * 2 - mouthAngle);
    ctx.closePath();
    ctx.fill();

    // Eye
    if (isLeader) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      const eyeOffX = Math.cos(startAngle - 0.5) * r * 0.4;
      const eyeOffY = Math.sin(startAngle - 0.5) * r * 0.4;
      ctx.arc(x + eyeOffX, y + eyeOffY, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.restore();
  },
};
