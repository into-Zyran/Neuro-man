/* ===================================================================
   app.js — Main loop, Swarm, Sensors, GA lifecycle, UI Telemetry
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 0.  CHAMPION WEIGHTS  (pre-trained dummy matrix)
//     Generated with seeded random that biases agents
//     toward forward movement and ghost avoidance.
//     Format: flat 1D array matching NeuralNet topology [8,6,4]
// ─────────────────────────────────────────────

const CHAMPION_WEIGHTS = (() => {
  // 8→6 weights (48) + 6 biases = 54
  // 6→4 weights (24) + 4 biases = 28
  // total = 82 values
  const rng = mulberry32(0xDEADBEEF);
  const w = [];
  for (let i = 0; i < 82; i++) w.push((rng() - 0.5) * 2.8);
  // Tweak select weights to give champion sensible behaviour:
  // Strong forward drive (output right/up depending on ghost vector)
  w[54] =  1.8;  w[55] = -1.2;  // hidden→UP strong weight
  w[56] = -0.9;  w[57] =  1.4;  // hidden→DOWN
  w[58] = -1.1;  w[59] =  0.8;  // hidden→LEFT
  w[60] =  1.6;  w[61] = -0.7;  // hidden→RIGHT
  // Ghost avoidance (inputs 4-5 connect to hidden nodes 0,1)
  w[0]  = -1.4;  w[1]  = -1.3;  // Gx avoidance
  w[8]  = -1.2;  w[9]  = -1.1;  // Gy avoidance
  // Pellet attraction (inputs 6-7)
  w[16] =  1.5;  w[17] =  1.3;
  return w;
})();

// ─────────────────────────────────────────────
// 1.  DOM REFS
// ─────────────────────────────────────────────

const canvas      = document.getElementById('game-canvas');
const ctx         = canvas.getContext('2d');
const nnCanvas    = document.getElementById('nn-canvas');
const nnCtx       = nnCanvas.getContext('2d');
const overlay     = document.getElementById('canvas-overlay');
const overlayTitle= document.getElementById('overlay-title');
const overlaySub  = document.getElementById('overlay-sub');

const elGen       = document.getElementById('gen-display');
const elFps       = document.getElementById('fps-display');
const elAlive     = document.getElementById('alive-display');
const elBest      = document.getElementById('best-display');

const elMGen      = document.getElementById('m-gen');
const elMTimer    = document.getElementById('m-timer');
const elMAlive    = document.getElementById('m-alive');
const elMStag     = document.getElementById('m-stag');
const elMLeader   = document.getElementById('m-leader');
const elMAvg      = document.getElementById('m-avg');
const elMAlltime  = document.getElementById('m-alltime');
const elMPellets  = document.getElementById('m-pellets');
const elMMutrate  = document.getElementById('m-mutrate');
const elMGhosts   = document.getElementById('m-ghosts');
const elMMode     = document.getElementById('m-mode');

const elSUp       = document.getElementById('s-up');
const elSDn       = document.getElementById('s-dn');
const elSLt       = document.getElementById('s-lt');
const elSRt       = document.getElementById('s-rt');
const elSGx       = document.getElementById('s-gx');
const elSGy       = document.getElementById('s-gy');
const elSPx       = document.getElementById('s-px');
const elSPy       = document.getElementById('s-py');

const logEl       = document.getElementById('terminal-log');
const btnTrain    = document.getElementById('btn-train');
const btnPause    = document.getElementById('btn-pause');
const btnSpeed    = document.getElementById('btn-speed');

// ─────────────────────────────────────────────
// 2.  CANVAS SIZING
// ─────────────────────────────────────────────

canvas.width  = Engine.MAP_W;
canvas.height = Engine.MAP_H;

// ─────────────────────────────────────────────
// 3.  SIMULATION STATE
// ─────────────────────────────────────────────

let swarm       = [];
let ghosts      = [];
let generation  = 1;
let epochMs     = 10000;       // 10 seconds per epoch
let epochStart  = 0;
let paused      = false;
let fastMode    = false;
let speedMult   = 1;
let isChampion  = true;        // boot in champion mode
let allTimeBest = 0;
let stagnationCount = 0;
let lastEpochBest   = 0;
let lastFrameTime   = 0;
let frameCount      = 0;
let fpsTimer        = 0;
let fpsDisplay      = 0;
let rafId           = 0;

// ─────────────────────────────────────────────
// 4.  TERMINAL LOG
// ─────────────────────────────────────────────

const MAX_LOG_LINES = 80;
let logLines = [];

function log(msg, cls = '') {
  const ts  = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const line = `<span class="log-timestamp">[${ts}]</span> <span class="${cls}">${msg}</span>`;
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  logEl.innerHTML = logLines.map(l => `<span class="log-line">${l}</span>`).join('');
  logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
}

// ─────────────────────────────────────────────
// 5.  SENSOR EXTRACTION  (8 inputs for NN)
// ─────────────────────────────────────────────

/**
 * Build the 8-element input vector for one agent.
 * [wallUp, wallDown, wallLeft, wallRight, ghostDx, ghostDy, pelletDx, pelletDy]
 */
function getSensors(agent, ghostArr) {
  const { col, row } = agent;
  const { COLS, ROWS, isWalkable, wrapCol, BASE_PELLETS } = Engine;

  // --- Wall sensors (binary 0/1) ---
  const wallUp    = isWalkable(col,           row - 1) ? 1 : 0;
  const wallDown  = isWalkable(col,           row + 1) ? 1 : 0;
  const wallLeft  = isWalkable(wrapCol(col - 1), row) ? 1 : 0;
  const wallRight = isWalkable(wrapCol(col + 1), row) ? 1 : 0;

  // --- Closest ghost normalised vector ---
  let minGDist = Infinity, gDx = 0, gDy = 0;
  for (const g of ghostArr) {
    const dx = g.col - col, dy = g.row - row;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < minGDist) {
      minGDist = d; gDx = dx; gDy = dy;
    }
  }
  const gNorm = minGDist > 0 ? minGDist : 1;
  const ghostDx = gDx / gNorm;
  const ghostDy = gDy / gNorm;

  // --- Closest pellet normalised vector (using agent's own pelletsEaten) ---
  let minPDist = Infinity, pDx = 0, pDy = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (!BASE_PELLETS[idx] || agent.pelletsEaten[idx]) continue;
      const dx = c - col, dy = r - row;
      const d  = Math.abs(dx) + Math.abs(dy); // Manhattan
      if (d < minPDist) {
        minPDist = d; pDx = dx; pDy = dy;
      }
    }
  }
  const pNorm  = minPDist > 0 ? minPDist : 1;
  const pelletDx = pDx / pNorm;
  const pelletDy = pDy / pNorm;

  return [wallUp, wallDown, wallLeft, wallRight, ghostDx, ghostDy, pelletDx, pelletDy];
}

// ─────────────────────────────────────────────
// 6.  VALIDATION SHIELD
//     Forces NN output away from walls.
// ─────────────────────────────────────────────

/**
 * @param {Float64Array} outputs  [up, down, left, right]
 * @param {number} col
 * @param {number} row
 * @returns {object} chosen Engine.DIR entry
 */
function validatedDirection(outputs, col, row, currentDir) {
  // outputs index → DIR
  const mapping = [Engine.DIR.UP, Engine.DIR.DOWN, Engine.DIR.LEFT, Engine.DIR.RIGHT];
  const scores  = Array.from(outputs);          // copy

  if (currentDir) {
    const reverseMap = {
      0: 1, // UP -> DOWN
      1: 0, // DOWN -> UP
      2: 3, // LEFT -> RIGHT
      3: 2  // RIGHT -> LEFT
    };
    const reverseIdx = reverseMap[currentDir.idx];
    scores[reverseIdx] -= 1000;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    let best = 0;
    for (let i = 1; i < 4; i++) if (scores[i] > scores[best]) best = i;

    const d  = mapping[best];
    const nc = Engine.wrapCol(col + d.dc);
    const nr = row + d.dr;

    if (Engine.isWalkable(nc, nr)) return d;

    scores[best] = -Infinity;   // block this option
  }
  // All directions blocked — stay still (shouldn't happen on open map)
  return Engine.DIR.RIGHT;
}

// ─────────────────────────────────────────────
// 7.  SWARM INITIALISATION
// ─────────────────────────────────────────────

function spawnSwarm(brains) {
  swarm = brains.map(brain => {
    const a = new Engine.Agent(brain);
    a.reset(Engine.SPAWN_COL, Engine.SPAWN_ROW);
    return a;
  });
}

function buildFirstGeneration(useChampion) {
  const brains = [];
  for (let i = 0; i < GA.SWARM_SIZE; i++) {
    const net = GA.createBrain();
    if (useChampion && i < 4) {
      // Seed first few with champion weights (varying mutation)
      net.setWeights(CHAMPION_WEIGHTS.map((w, _) =>
        i === 0 ? w : w + (Math.random() - 0.5) * 0.4 * i));
    }
    brains.push(net);
  }
  return brains;
}

// ─────────────────────────────────────────────
// 8.  EPOCH MANAGEMENT
// ─────────────────────────────────────────────

function endEpoch() {
  // Score all agents
  const scored = swarm.map(a => ({ net: a.brain, fitness: a.calcFitness() }));
  scored.sort((a, b) => b.fitness - a.fitness);

  const topFitness = scored[0].fitness;
  const avgFitness = scored.reduce((s, a) => s + a.fitness, 0) / scored.length;

  // Stagnation check
  if (topFitness <= lastEpochBest + 0.5) {
    stagnationCount++;
  } else {
    stagnationCount = 0;
  }
  lastEpochBest = topFitness;

  const applyEntropy = stagnationCount >= 3;
  if (applyEntropy) {
    stagnationCount = 0;
    log(`⚠ ENTROPY SHOCK! Pop was stagnant. Applying 15% weight offset.`, 'log-entropy');
  }

  if (topFitness > allTimeBest) {
    allTimeBest = topFitness;
    log(`★ NEW ALL-TIME BEST → ${topFitness.toFixed(1)}`, 'log-champion');
  }

  log(`── EPOCH ${generation} END ── best=${topFitness.toFixed(1)} avg=${avgFitness.toFixed(1)} stag=${stagnationCount}/3`, 'log-epoch');

  // Evolve
  const newBrains = GA.evolve(scored, applyEntropy);

  generation++;
  log(`⚙ GEN ${generation} spawned. Elite preserved. Tournament bred 34.`, 'log-epoch');

  // Reset swarm
  spawnSwarm(newBrains);
  ghosts = Engine.createDefaultGhosts();
  epochStart = performance.now();

  updateHUD();
}

// ─────────────────────────────────────────────
// 9.  NEURAL NETWORK VISUALISER (left panel canvas)
// ─────────────────────────────────────────────

function drawNNViz(leader) {
  const W = nnCanvas.width, H = nnCanvas.height;
  nnCtx.clearRect(0, 0, W, H);
  nnCtx.fillStyle = '#030810';
  nnCtx.fillRect(0, 0, W, H);

  if (!leader) return;

  const topology = [8, 6, 4];
  const layerX   = [22, W / 2, W - 22];
  const acts     = leader.brain.activations;
  if (!acts || acts.length < 3) return;

  // Positions
  const positions = [];
  for (let l = 0; l < topology.length; l++) {
    const nodes = [];
    const n = topology[l];
    for (let i = 0; i < n; i++) {
      const y = H * 0.08 + (H * 0.84) * (i / (n - 1 || 1));
      nodes.push({ x: layerX[l], y });
    }
    positions.push(nodes);
  }

  // Draw connections
  for (let l = 0; l < topology.length - 1; l++) {
    const W_mat = leader.brain.W[l];
    const inn   = topology[l], out = topology[l + 1];
    for (let j = 0; j < out; j++) {
      for (let i = 0; i < inn; i++) {
        const w = W_mat[j * inn + i];
        const alpha = Math.min(Math.abs(w) * 0.6, 0.7);
        nnCtx.strokeStyle = w > 0
          ? `rgba(0,247,255,${alpha})`
          : `rgba(255,45,85,${alpha})`;
        nnCtx.lineWidth = 0.7;
        nnCtx.beginPath();
        nnCtx.moveTo(positions[l][i].x,     positions[l][i].y);
        nnCtx.lineTo(positions[l + 1][j].x, positions[l + 1][j].y);
        nnCtx.stroke();
      }
    }
  }

  // Draw nodes
  for (let l = 0; l < topology.length; l++) {
    for (let i = 0; i < topology[l]; i++) {
      const { x, y } = positions[l][i];
      const act = acts[l] ? (acts[l][i] || 0) : 0;
      const t = (act + 1) / 2;   // tanh → [0,1]
      const r = 5;
      nnCtx.beginPath();
      nnCtx.arc(x, y, r, 0, Math.PI * 2);
      const col = `hsl(${160 + t * 60}, 90%, ${30 + t * 40}%)`;
      nnCtx.fillStyle = col;
      nnCtx.fill();
      nnCtx.strokeStyle = '#ffffff30';
      nnCtx.lineWidth = 0.5;
      nnCtx.stroke();
    }
  }
}

// ─────────────────────────────────────────────
// 10.  HUD UPDATE
// ─────────────────────────────────────────────

let hudThrottle = 0;

function updateHUD(sensors) {
  hudThrottle++;
  if (hudThrottle % 4 !== 0) return;  // update every 4 frames

  const alive = swarm.filter(a => a.alive).length;
  const fitnesses = swarm.map(a => a.calcFitness());
  const best  = Math.max(...fitnesses);
  const avg   = fitnesses.reduce((s, v) => s + v, 0) / fitnesses.length;
  const leader = swarm.reduce((a, b) => a.fitness >= b.fitness ? a : b, swarm[0]);

  const elapsedSec = ((performance.now() - epochStart) / 1000).toFixed(1);
  const remaining  = Math.max(0, (epochMs / 1000) - parseFloat(elapsedSec)).toFixed(1);

  elGen.textContent   = String(generation).padStart(3, '0');
  elFps.textContent   = fpsDisplay;
  elAlive.textContent = alive;
  elBest.textContent  = best.toFixed(0);

  elMGen.textContent  = generation;
  elMTimer.textContent = remaining + 's';
  elMAlive.textContent = alive;
  elMStag.textContent  = stagnationCount + ' / 3';
  elMLeader.textContent = best.toFixed(1);
  elMAvg.textContent    = avg.toFixed(1);
  elMAlltime.textContent = allTimeBest.toFixed(1);
  elMPellets.textContent = leader ? leader.pelletsCount : 0;
  elMMutrate.textContent = (GA.BASE_MUTATION * 100).toFixed(1) + '%';
  elMGhosts.textContent  = ghosts.length;
  elMMode.textContent    = isChampion ? 'CHAMPION' : 'TRAINING';
  elMMode.className      = isChampion ? 'metric-val mode-champion' : 'metric-val mode-training';

  if (sensors) {
    elSUp.textContent = sensors[0];
    elSDn.textContent = sensors[1];
    elSLt.textContent = sensors[2];
    elSRt.textContent = sensors[3];
    elSGx.textContent = sensors[4].toFixed(2);
    elSGy.textContent = sensors[5].toFixed(2);
    elSPx.textContent = sensors[6].toFixed(2);
    elSPy.textContent = sensors[7].toFixed(2);
  }

  if (leader) drawNNViz(leader);
}

// ─────────────────────────────────────────────
// 11.  MAIN GAME LOOP
// ─────────────────────────────────────────────

let leaderSensors = null;

function gameLoop(ts) {
  rafId = requestAnimationFrame(gameLoop);
  if (paused) return;

  // FPS counter
  frameCount++;
  if (ts - fpsTimer >= 1000) {
    fpsDisplay = frameCount;
    frameCount = 0;
    fpsTimer   = ts;
  }

  const stepsPerFrame = fastMode ? 4 : 1;

  for (let step = 0; step < stepsPerFrame; step++) {
    // ── Epoch timeout check
    if (performance.now() - epochStart >= epochMs) {
      endEpoch();
      return;
    }

    // ── Ghost updates
    for (const g of ghosts) g.update();

    // ── Agent updates
    let aliveCount = 0;
    for (const agent of swarm) {
      if (!agent.alive) continue;
      aliveCount++;

      agent.frames++;
      agent.moveTimer++;

      if (agent.moveTimer < agent.moveRate) continue;
      agent.moveTimer = 0;

      // 1. Sensor extraction
      const sensors = getSensors(agent, ghosts);

      // 2. Forward pass
      const outputs = agent.brain.forward(sensors);
      agent.lastOutputs.set(outputs);

      // 3. Validation shield
      const dir = validatedDirection(outputs, agent.col, agent.row, agent.dir);
      agent.dir = dir;

      // 4. Move
      const nc = Engine.wrapCol(agent.col + dir.dc);
      const nr = agent.row + dir.dr;
      if (Engine.isWalkable(nc, nr)) {
        agent.col = nc;
        agent.row = nr;
      }

      // Anti-camping kill switch
      if (agent.col === agent.lastCol && agent.row === agent.lastRow) {
        agent.stuckFrames++;
      } else {
        agent.stuckFrames = 0;
        agent.lastCol = agent.col;
        agent.lastRow = agent.row;
      }

      if (agent.stuckFrames > 5) {
        agent.alive = false;
        agent.calcFitness();
        log(`✗ Agent died (camping). Pellets=${agent.pelletsCount} Fit=${agent.fitness.toFixed(1)}`, 'log-death');
        continue;
      }

      // 5. Visit tracking
      const vi = agent.row * Engine.COLS + agent.col;
      agent.visitCount[vi]++;

      // 6. Pellet eating (independent state)
      const pi = agent.row * Engine.COLS + agent.col;
      if (Engine.BASE_PELLETS[pi] && !agent.pelletsEaten[pi]) {
        agent.pelletsEaten[pi] = 1;
        agent.pelletsCount++;
      }

      // 7. Ghost collision
      for (const g of ghosts) {
        if (g.collides(agent.col, agent.row)) {
          agent.alive = false;
          agent.calcFitness();
          log(`✗ Agent died. Pellets=${agent.pelletsCount} Fit=${agent.fitness.toFixed(1)}`, 'log-death');
          break;
        }
      }
    }

    // All dead → trigger early epoch end
    if (aliveCount === 0) {
      endEpoch();
      return;
    }
  }

  // ── RENDER ──────────────────────────────────
  // Sort swarm by fitness (desc) to identify leader
  const sorted = [...swarm].sort((a, b) => b.fitness - a.fitness);
  const leader = sorted[0];

  Engine.drawMap(ctx, leader.pelletsEaten);

  // Render followers first (dim)
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].alive) Engine.drawAgent(ctx, sorted[i], false);
  }
  // Render leader on top (bright)
  Engine.drawAgent(ctx, leader, true);

  // Render ghosts
  for (const g of ghosts) Engine.drawGhost(ctx, g);

  // Capture leader sensors for HUD
  if (leader && leader.alive) {
    leaderSensors = getSensors(leader, ghosts);
  }

  updateHUD(leaderSensors);
  lastFrameTime = ts;
}

// ─────────────────────────────────────────────
// 12.  MOUSE CLICK → SPAWN GHOST
// ─────────────────────────────────────────────

canvas.addEventListener('click', function (e) {
  const rect    = canvas.getBoundingClientRect();
  const scaleX  = canvas.width  / rect.width;
  const scaleY  = canvas.height / rect.height;
  const px      = (e.clientX - rect.left) * scaleX;
  const py      = (e.clientY - rect.top)  * scaleY;
  const col     = Math.floor(px / Engine.TILE);
  const row     = Math.floor(py / Engine.TILE);

  if (!Engine.isWalkable(col, row)) return;

  const colors  = ['#ff2d55', '#ff6b00', '#a855f7', '#00ff88'];
  const color   = colors[ghosts.length % colors.length];
  const ghost   = new Engine.Ghost(col, row, color);
  ghost.userSpawned = true;
  ghosts.push(ghost);

  log(`[CLICK] Ghost #${ghosts.length} spawned at (${col},${row}). Swarm rerouting.`, 'log-ghost');
  elMGhosts.textContent = ghosts.length;
});

// ─────────────────────────────────────────────
// 13.  CONTROL BUTTONS
// ─────────────────────────────────────────────

btnTrain.addEventListener('click', () => {
  isChampion = false;
  generation = 1;
  stagnationCount = 0;
  lastEpochBest   = 0;
  allTimeBest     = 0;
  ghosts          = Engine.createDefaultGhosts();
  logLines        = [];
  logEl.innerHTML = '';

  const brains = [];
  for (let i = 0; i < GA.SWARM_SIZE; i++) brains.push(GA.createBrain());
  spawnSwarm(brains);
  epochStart = performance.now();

  log('⚡ LIVE TRAIN mode activated. Weights cleared. Gen 1 chaos begins.', 'log-mutate');
  updateHUD();
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.innerHTML = paused
    ? '<span class="btn-icon">&#9654;</span> RESUME'
    : '<span class="btn-icon">&#9208;</span> PAUSE';

  if (paused) {
    overlay.classList.remove('hidden');
    overlayTitle.textContent = 'PAUSED';
    overlaySub.textContent   = 'Click RESUME to continue';
    epochStart += performance.now(); // freeze timer accounting
  } else {
    overlay.classList.add('hidden');
    epochStart = performance.now() - (epochMs * 0.5);
  }
});

btnSpeed.addEventListener('click', () => {
  fastMode = !fastMode;
  speedMult = fastMode ? 4 : 1;
  btnSpeed.innerHTML = fastMode
    ? '<span class="btn-icon">&#9193;</span> 4x'
    : '<span class="btn-icon">&#9193;</span> 1x';
  log(`Speed set to ${speedMult}x`, '');
});

// Spacebar = pause
document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
});

// ─────────────────────────────────────────────
// 14.  BOOT
// ─────────────────────────────────────────────

(function boot() {
  log('┌─────────────────────────────────────────┐', 'log-champion');
  log('│  NEURO-PACMAN ARENA — AI Swarm Sandbox  │', 'log-champion');
  log('│  35 neural agents · genetic evolution   │', 'log-champion');
  log('└─────────────────────────────────────────┘', 'log-champion');
  log('Booting in CHAMPION mode. Pre-trained weights loaded.', 'log-champion');
  log(`Topology: [8 → 6 → 4] · Mutation: ${(GA.BASE_MUTATION*100).toFixed(0)}% · Epoch: 10s`, '');
  log('Click canvas to spawn ghosts. Space = Pause.', '');
  log('─────────────────────────────────────────────', '');

  isChampion = true;
  ghosts     = Engine.createDefaultGhosts();
  const brains = buildFirstGeneration(true);
  spawnSwarm(brains);
  epochStart = performance.now();
  updateHUD();

  rafId = requestAnimationFrame(gameLoop);
})();
