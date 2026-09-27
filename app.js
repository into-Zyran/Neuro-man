/* ===================================================================
   app.js — Main loop, Swarm, 12-Sensors, GA lifecycle, UI Telemetry,
   Dense Reward Shaping, Energizers & Maze Architect
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 0.  CHAMPION WEIGHTS  (pre-trained weight matrix for [12, 10, 4])
//     12→10 weights (120) + 10 biases (10) = 130
//     10→4 weights (40) + 4 biases (4) = 44
//     total = 174 values
// ─────────────────────────────────────────────

const CHAMPION_WEIGHTS = (() => {
  const rng = mulberry32(0xDEADBEEF);
  const w = [];
  for (let i = 0; i < 174; i++) w.push((rng() - 0.5) * 0.8);

  // --- Layer 0: Inputs (12) -> Hidden (10) ---
  // Inputs:
  //  0:wallUp, 1:wallDown, 2:wallLeft, 3:wallRight
  //  4:ghostProx, 5:ghostDx, 6:ghostDy
  //  7:pelletPathDx, 8:pelletPathDy, 9:pelletProx
  //  10:dirX, 11:dirY

  // H0: Ghost horizontal avoidance
  w[0 * 12 + 4] =  2.5;
  w[0 * 12 + 5] = -3.2;

  // H1: Ghost vertical avoidance
  w[1 * 12 + 4] =  2.5;
  w[1 * 12 + 6] = -3.2;

  // H2: Pellet horizontal attraction
  w[2 * 12 + 7] =  3.4;
  w[2 * 12 + 9] =  1.8;

  // H3: Pellet vertical attraction
  w[3 * 12 + 8] =  3.4;
  w[3 * 12 + 9] =  1.8;

  // H4: Wall clearance UP / DOWN
  w[4 * 12 + 0] =  2.2;
  w[4 * 12 + 1] = -2.2;

  // H5: Wall clearance LEFT / RIGHT
  w[5 * 12 + 2] = -2.2;
  w[5 * 12 + 3] =  2.2;

  // H6: Momentum
  w[6 * 12 + 10] = 1.4;
  w[6 * 12 + 11] = 1.4;

  // --- Layer 1: Hidden (10) -> Outputs (4) ---
  // Offset: 130
  // Outputs: 0:UP (130..139), 1:DOWN (140..149), 2:LEFT (150..159), 3:RIGHT (160..169)

  // UP output (130)
  w[130 + 1] =  2.2; // H1 (ghost below -> move UP)
  w[130 + 3] =  2.8; // H3 (pellet up -> move UP)
  w[130 + 4] =  2.0; // H4 (wall clear UP)

  // DOWN output (140)
  w[140 + 1] = -2.2; // H1 (ghost above -> move DOWN)
  w[140 + 3] = -2.8; // H3 (pellet down -> move DOWN)
  w[140 + 4] = -2.0; // H4 (wall clear DOWN)

  // LEFT output (150)
  w[150 + 0] =  2.2; // H0 (ghost on right -> move LEFT)
  w[150 + 2] = -2.8; // H2 (pellet on left -> move LEFT)
  w[150 + 5] = -2.0; // H5 (wall clear LEFT)

  // RIGHT output (160)
  w[160 + 0] = -2.2; // H0 (ghost on left -> move RIGHT)
  w[160 + 2] =  2.8; // H2 (pellet on right -> move RIGHT)
  w[160 + 5] =  2.0; // H5 (wall clear RIGHT)

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
const elSGprox    = document.getElementById('s-gprox');
const elSGx       = document.getElementById('s-gx');
const elSGy       = document.getElementById('s-gy');
const elSPx       = document.getElementById('s-px');
const elSPy       = document.getElementById('s-py');
const elSPprox    = document.getElementById('s-pprox');
const elSDirX     = document.getElementById('s-dirx');
const elSDirY     = document.getElementById('s-diry');

const logEl       = document.getElementById('terminal-log');
const btnTrain    = document.getElementById('btn-train');
const btnPause    = document.getElementById('btn-pause');
const btnSpeed    = document.getElementById('btn-speed');

const btnBarrier  = document.getElementById('btn-barrier');
const btnWarp     = document.getElementById('btn-warp');

const tabArcade   = document.getElementById('tab-arcade');
const tabDuel     = document.getElementById('tab-duel');
const tabSwarm    = document.getElementById('tab-swarm');
const stat1Lbl    = document.getElementById('stat-1-lbl');
const stat2Lbl    = document.getElementById('stat-2-lbl');
const stat3Lbl    = document.getElementById('stat-3-lbl');
const overlayBtn  = document.getElementById('overlay-btn');
const canvasHint  = document.getElementById('canvas-hint');

// ─────────────────────────────────────────────
// 2.  CANVAS SIZING
// ─────────────────────────────────────────────

canvas.width  = Engine.MAP_W;
canvas.height = Engine.MAP_H;

// ─────────────────────────────────────────────
// 3.  SIMULATION & GAME STATE
// ─────────────────────────────────────────────

let activeMode    = 'arcade';  // 'arcade' | 'duel' | 'swarm'

let floatingTexts = [];
function addFloatingText(text, x, y, color = '#ffe600') {
  floatingTexts.push({ text, x, y, color, life: 40, maxLife: 40 });
}

// 🕹️ Playable Pac-Man for Arcade Mode
const humanPlayer = {
  col: Engine.SPAWN_COL,
  row: Engine.SPAWN_ROW,
  dir: Engine.DIR.LEFT,
  nextDir: Engine.DIR.LEFT,
  moveTimer: 0,
  moveRate: 8,
  alive: true,
  isDying: false,
  deathTimer: 0,
  lives: 3,
  score: 0,
  pelletsEaten: new Uint8Array(Engine.COLS * Engine.ROWS),
  energizersEaten: new Uint8Array(Engine.COLS * Engine.ROWS),
  pelletsCount: 0,
  energizersCount: 0,
  ghostsEatenCount: 0,
  ghostStreak: 0,
  reset(full = false) {
    this.col = Engine.SPAWN_COL;
    this.row = Engine.SPAWN_ROW;
    this.dir = Engine.DIR.LEFT;
    this.nextDir = Engine.DIR.LEFT;
    this.moveTimer = 0;
    this.alive = true;
    this.isDying = false;
    this.deathTimer = 0;
    if (full) {
      this.lives = 3;
      this.score = 0;
      this.pelletsEaten.fill(0);
      this.energizersEaten.fill(0);
      this.pelletsCount = 0;
      this.energizersCount = 0;
      this.ghostsEatenCount = 0;
      this.ghostStreak = 0;
    }
  }
};

// ⚔️ 1v1 Duel State
let duelAgent = null;
let duelTimer = 45 * 60; // 45s at 60fps
let duelCatches = 0;

const MAX_EPOCH_TICKS = 3600;  // 60 seconds max survival ceiling
const EPOCH_TICKS = MAX_EPOCH_TICKS;
let swarm         = [];
let ghosts        = [];
let generation    = 1;
let epochTicks    = 0;
let paused        = false;
let fastMode      = false;
let speedMult     = 1;
let isChampion    = true;      // boot in champion mode

let architectMode = false;     // Maze Architect mode
let allTimeBest   = 0;
let stagnationCount = 0;
let lastEpochBest = 0;
let lastFrameTime = 0;
let frameCount    = 0;
let fpsTimer      = 0;
let fpsDisplay    = 0;
let rafId         = 0;

// ─────────────────────────────────────────────
// 4.  TERMINAL LOG
// ─────────────────────────────────────────────

const MAX_LOG_LINES = 90;
let logLines = [];

function log(msg, cls = '') {
  const ts  = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const line = `<span class="log-timestamp">[${ts}]</span> <span class="${cls}">${msg}</span>`;
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  logEl.innerHTML = logLines.map(l => `<span class="log-line">${l}</span>`).join('');
  if (logEl.parentElement) {
    logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
  }
}

// ─────────────────────────────────────────────
// 5.  SENSOR EXTRACTION  (12 inputs for NN)
// ─────────────────────────────────────────────

function getSensors(agent, ghostArr) {
  const { col, row } = agent;
  const { COLS, ROWS, raycastWallClearance, findNearestPelletPath } = Engine;

  // 1. Raycast wall clearances in 4 directions [0..1]
  const wallClearances = raycastWallClearance(col, row);

  // 2. Closest ghost proximity and relative vector
  let minGDist = Infinity, gDx = 0, gDy = 0;
  for (const g of ghostArr) {
    if (g.eaten) continue;
    let dx = g.col - col;
    if (Math.abs(dx) > COLS / 2) dx = dx > 0 ? dx - COLS : dx + COLS;
    const dy = g.row - row;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < minGDist) {
      minGDist = d; gDx = dx; gDy = dy;
    }
  }
  const ghostProx = 1.0 / (1.0 + (minGDist !== Infinity ? minGDist : 20));
  const gNorm = (minGDist > 0 && minGDist !== Infinity) ? minGDist : 1;
  const ghostDx = gDx / gNorm;
  const ghostDy = gDy / gNorm;

  // 3. BFS Shortest Path to nearest uneaten pellet or energizer
  const pelletPath = findNearestPelletPath(col, row, agent.pelletsEaten, agent.energizersEaten);
  const pelletPathDx = pelletPath.dx;
  const pelletPathDy = pelletPath.dy;
  const pelletProx = 1.0 / (1.0 + pelletPath.dist);

  // 4. Current heading
  const dirX = agent.dir.dc;
  const dirY = agent.dir.dr;

  return [
    wallClearances[0], wallClearances[1], wallClearances[2], wallClearances[3],
    ghostProx, ghostDx, ghostDy,
    pelletPathDx, pelletPathDy, pelletProx,
    dirX, dirY
  ];
}

// ─────────────────────────────────────────────
// 6.  VALIDATION SHIELD
// ─────────────────────────────────────────────

function validatedDirection(outputs, col, row, currentDir) {
  const mapping = [Engine.DIR.UP, Engine.DIR.DOWN, Engine.DIR.LEFT, Engine.DIR.RIGHT];
  const scores  = Array.from(outputs);

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
    for (let i = 1; i < 4; i++) {
      if (scores[i] > scores[best]) best = i;
    }

    const d  = mapping[best];
    const nc = Engine.wrapCol(col + d.dc);
    const nr = row + d.dr;

    if (Engine.isWalkable(nc, nr)) return d;

    scores[best] = -Infinity;
  }
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
  epochTicks = 0;
}

function buildFirstGeneration(useChampion) {
  const brains = [];
  for (let i = 0; i < GA.SWARM_SIZE; i++) {
    const net = GA.createBrain();
    if (useChampion && i < 4) {
      net.setWeights(CHAMPION_WEIGHTS.map((w) =>
        i === 0 ? w : w + (Math.random() - 0.5) * 0.2 * i));
    }
    brains.push(net);
  }
  return brains;
}

// ─────────────────────────────────────────────
// 8.  EPOCH MANAGEMENT
// ─────────────────────────────────────────────

function endEpoch() {
  epochTicks = 0;
  const scored = swarm.map(a => ({ net: a.brain, fitness: a.calcFitness() }));
  scored.sort((a, b) => b.fitness - a.fitness);

  const topFitness = scored[0].fitness;
  const avgFitness = scored.reduce((s, a) => s + a.fitness, 0) / scored.length;

  if (topFitness <= lastEpochBest + 1.0) {
    stagnationCount++;
  } else {
    stagnationCount = 0;
  }
  lastEpochBest = topFitness;

  const applyEntropy = stagnationCount >= 3;
  if (applyEntropy) {
    log(`⚠ ENTROPY SHOCK! Stagnation threshold hit (${stagnationCount}/3). Applying 20% weight offset.`, 'log-entropy');
    stagnationCount = 0;
  }

  if (topFitness > allTimeBest) {
    allTimeBest = topFitness;
    log(`★ NEW ALL-TIME BEST → ${topFitness.toFixed(1)}`, 'log-champion');
  }

  log(`── EPOCH ${generation} END ── best=${topFitness.toFixed(1)} avg=${avgFitness.toFixed(1)} stag=${stagnationCount}/3`, 'log-epoch');

  const newBrains = GA.evolve(scored, applyEntropy);

  generation++;
  log(`⚙ GEN ${generation} spawned. Top ${GA.ELITE_COUNT} Elites preserved. Tournament bred 33.`, 'log-epoch');

  spawnSwarm(newBrains);
  ghosts = Engine.createDefaultGhosts();
  updateHUD();
}

/** Turbo Warp: simulate n full generations in headless memory loop */
function warpGenerations(n = 10) {
  log(`⏩ TURBO WARP: Simulating ${n} generations headlessly...`, 'log-champion');
  for (let g = 0; g < n; g++) {
    for (let t = 0; t < EPOCH_TICKS; t++) {
      const aliveList = swarm.filter(a => a.alive);
      const activeLead = aliveList.length > 0 ? aliveList[0] : null;
      for (const gh of ghosts) gh.update(activeLead);

      let aliveCount = 0;
      for (const agent of swarm) {
        if (!agent.alive) continue;
        aliveCount++;
        agent.frames++;
        agent.moveTimer++;
        if (agent.moveTimer < agent.moveRate) continue;
        agent.moveTimer = 0;

        const sensors = getSensors(agent, ghosts);
        const outputs = agent.brain.forward(sensors);
        const dir = validatedDirection(outputs, agent.col, agent.row, agent.dir);
        agent.dir = dir;
        const nc = Engine.wrapCol(agent.col + dir.dc);
        const nr = agent.row + dir.dr;
        if (Engine.isWalkable(nc, nr)) { agent.col = nc; agent.row = nr; }

        const pi = agent.row * Engine.COLS + agent.col;
        if (Engine.BASE_PELLETS[pi] && !agent.pelletsEaten[pi]) {
          agent.pelletsEaten[pi] = 1; agent.pelletsCount++;
        }
        if (Engine.BASE_ENERGIZERS[pi] && !agent.energizersEaten[pi]) {
          agent.energizersEaten[pi] = 1; agent.energizersCount++;
        }
        for (const gh of ghosts) {
          if (gh.collides(agent.col, agent.row)) {
            agent.alive = false;
            break;
          }
        }
      }
      if (aliveCount === 0) break;
    }
    endEpoch();
  }
  log(`⏩ WARP COMPLETE! Reached Gen ${generation}. Leader Score: ${allTimeBest.toFixed(1)}`, 'log-champion');
  updateHUD();
}

// ─────────────────────────────────────────────
// 9.  NEURAL NETWORK VISUALISER (12 -> 10 -> 4)
// ─────────────────────────────────────────────

function drawNNViz(leader) {
  const W = nnCanvas.width, H = nnCanvas.height;
  nnCtx.clearRect(0, 0, W, H);
  nnCtx.fillStyle = '#030810';
  nnCtx.fillRect(0, 0, W, H);

  if (!leader || !leader.brain) return;

  const topology = leader.brain.topology;
  const layerX   = [20, W / 2, W - 20];
  const acts     = leader.brain.activations;
  if (!acts || acts.length < 3) return;

  const positions = [];
  for (let l = 0; l < topology.length; l++) {
    const nodes = [];
    const n = topology[l];
    for (let i = 0; i < n; i++) {
      const y = H * 0.06 + (H * 0.88) * (i / (n - 1 || 1));
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
        const alpha = Math.min(Math.abs(w) * 0.4, 0.6);
        nnCtx.strokeStyle = w > 0
          ? `rgba(0,247,255,${alpha})`
          : `rgba(255,45,85,${alpha})`;
        nnCtx.lineWidth = 0.6;
        nnCtx.beginPath();
        nnCtx.moveTo(positions[l][i].x,     positions[l][i].y);
        nnCtx.lineTo(positions[l + 1][j].x, positions[l + 1][j].y);
        nnCtx.stroke();
      }
    }
  }

  // Draw neurons
  for (let l = 0; l < topology.length; l++) {
    for (let i = 0; i < topology[l]; i++) {
      const { x, y } = positions[l][i];
      const act = acts[l] ? (acts[l][i] || 0) : 0;
      const t = Math.max(0, Math.min(1, (act + 1) / 2));
      const r = l === 1 ? 3.5 : 4;
      nnCtx.beginPath();
      nnCtx.arc(x, y, r, 0, Math.PI * 2);
      const col = `hsl(${160 + t * 60}, 95%, ${30 + t * 45}%)`;
      nnCtx.fillStyle = col;
      nnCtx.fill();
      nnCtx.strokeStyle = '#ffffff40';
      nnCtx.lineWidth = 0.5;
      nnCtx.stroke();
    }
  }
}

// ─────────────────────────────────────────────
// 10.  HUD UPDATE & TELEMETRY STREAM
// ─────────────────────────────────────────────

let hudThrottle = 0;

function updateHUD(sensors) {
  hudThrottle++;
  if (hudThrottle % 4 !== 0) return;

  if (activeMode === 'arcade') {
    if (elGen)   elGen.textContent   = humanPlayer.score.toFixed(1);
    if (elAlive) elAlive.textContent = '🟡 '.repeat(Math.max(0, humanPlayer.lives)) || '💀';
    if (elBest)  elBest.textContent  = `${ghosts.length} 👻`;
    if (elFps)   elFps.textContent   = fpsDisplay > 0 ? fpsDisplay : '--';

    if (elMGen)     elMGen.textContent     = 'ARCADE';
    if (elMTimer)   elMTimer.textContent   = humanPlayer.score.toFixed(1) + ' / 100';
    if (elMAlive)   elMAlive.textContent   = humanPlayer.lives + ' / 3';
    if (elMStag)    elMStag.textContent    = (window.ArcadeMode ? window.ArcadeMode.getTrapKills() : humanPlayer.ghostsEatenCount) + ' killed';
    if (elMLeader)  elMLeader.textContent  = humanPlayer.score.toFixed(1);
    if (elMAvg)     elMAvg.textContent     = humanPlayer.pelletsCount;
    if (elMAlltime) elMAlltime.textContent = allTimeBest.toFixed(1);
    if (elMPellets) elMPellets.textContent = humanPlayer.pelletsCount;
    if (elMMutrate) elMMutrate.textContent = 'TRAP ARENA';
    if (elMGhosts)  elMGhosts.textContent  = `${ghosts.length} REMAINING`;
    if (elMMode) {
      elMMode.textContent = 'TRAP RUN';
      elMMode.className   = 'metric-val mode-champion';
    }
  } else if (activeMode === 'duel') {
    if (elGen)   elGen.textContent   = Math.max(0, (duelTimer / 60)).toFixed(1) + 's';
    if (elAlive) elAlive.textContent = duelAgent ? duelAgent.pelletsCount : 0;
    if (elBest)  elBest.textContent  = duelCatches;
    if (elFps)   elFps.textContent   = fpsDisplay > 0 ? fpsDisplay : '--';

    if (elMGen)     elMGen.textContent     = '1v1 DUEL';
    if (elMTimer)   elMTimer.textContent   = Math.max(0, (duelTimer / 60)).toFixed(1) + 's';
    if (elMAlive)   elMAlive.textContent   = '1 AI AGENT';
    if (elMStag)    elMStag.textContent    = 'HUNT';
    if (elMLeader)  elMLeader.textContent  = duelAgent ? duelAgent.pelletsCount : 0;
    if (elMAvg)     elMAvg.textContent     = duelCatches;
    if (elMAlltime) elMAlltime.textContent = allTimeBest.toFixed(1);
    if (elMPellets) elMPellets.textContent = duelAgent ? duelAgent.pelletsCount : 0;
    if (elMMutrate) elMMutrate.textContent = 'CHAMPION';
    if (elMGhosts)  elMGhosts.textContent  = '1 (YOU)';
    if (elMMode) {
      elMMode.textContent = '1v1 DUEL';
      elMMode.className   = 'metric-val mode-training';
    }
    if (duelAgent) drawNNViz(duelAgent);
  } else {
    // Swarm mode
    const aliveList = swarm.filter(a => a.alive);
    const alive = aliveList.length;
    const fitnesses = swarm.map(a => a.calcFitness());
    const best  = fitnesses.length > 0 ? Math.max(...fitnesses) : 0;
    const avg   = fitnesses.length > 0 ? (fitnesses.reduce((s, v) => s + v, 0) / fitnesses.length) : 0;

    const leader = aliveList.length > 0
      ? aliveList.reduce((a, b) => a.fitness >= b.fitness ? a : b)
      : swarm.reduce((a, b) => a.fitness >= b.fitness ? a : b, swarm[0]);

    elGen.textContent   = String(generation).padStart(3, '0');
    elFps.textContent   = fpsDisplay > 0 ? fpsDisplay : '--';
    elAlive.textContent = alive;
    elBest.textContent  = best.toFixed(1); // strictly 0-100

    elMGen.textContent  = generation;
    elMTimer.textContent = (epochTicks / 60).toFixed(1) + 's';
    elMAlive.textContent = alive;
    elMStag.textContent  = stagnationCount + ' / 3';
    elMLeader.textContent = best.toFixed(1);
    elMAvg.textContent    = avg.toFixed(1);
    elMAlltime.textContent = allTimeBest.toFixed(1);
    elMPellets.textContent = leader ? leader.pelletsCount : 0;
    elMMutrate.textContent = (GA.BASE_MUTATION * 100).toFixed(1) + '%';
    elMGhosts.textContent  = ghosts.length;

    elMMode.textContent = isChampion ? 'CHAMPION' : 'TRAINING';
    elMMode.className = isChampion ? 'metric-val mode-champion' : 'metric-val mode-training';

    if (leader) drawNNViz(leader);
  }

  if (sensors) {
    if (elSUp)    elSUp.textContent    = sensors[0].toFixed(1);
    if (elSDn)    elSDn.textContent    = sensors[1].toFixed(1);
    if (elSLt)    elSLt.textContent    = sensors[2].toFixed(1);
    if (elSRt)    elSRt.textContent    = sensors[3].toFixed(1);
    if (elSGprox) elSGprox.textContent = sensors[4].toFixed(2);
    if (elSGx)    elSGx.textContent    = sensors[5].toFixed(2);
    if (elSGy)    elSGy.textContent    = sensors[6].toFixed(2);
    if (elSPx)    elSPx.textContent    = sensors[7].toFixed(2);
    if (elSPy)    elSPy.textContent    = sensors[8].toFixed(2);
    if (elSPprox) elSPprox.textContent = sensors[9].toFixed(2);
    if (elSDirX)  elSDirX.textContent  = sensors[10].toFixed(0);
    if (elSDirY)  elSDirY.textContent  = sensors[11].toFixed(0);
  }
}

// ─────────────────────────────────────────────
// 11.  MAIN GAME LOOP
// ─────────────────────────────────────────────

let leaderSensors = null;

function gameLoop(ts) {
  rafId = requestAnimationFrame(gameLoop);
  if (paused) return;

  frameCount++;
  if (ts - fpsTimer >= 1000) {
    fpsDisplay = frameCount;
    frameCount = 0;
    fpsTimer   = ts;
  }

  // ─────────────────────────────────────────
  // A.  🕹️ ARCADE MODE (Playable Pac-Man)
  // ─────────────────────────────────────────
  if (activeMode === 'arcade') {
    if (humanPlayer.isDying) {
      humanPlayer.deathTimer++;
      if (humanPlayer.deathTimer >= 30) {
        if (humanPlayer.lives <= 0) {
          overlay.classList.remove('hidden');
          overlayTitle.textContent = 'GAME OVER';
          overlayTitle.className = 'overlay-title title-gameover';
          overlaySub.textContent = `FINAL SCORE: ${humanPlayer.score.toFixed(1)} / 100  |  PELLETS: ${humanPlayer.pelletsCount}`;
          if (overlayBtn) {
            overlayBtn.textContent = 'PLAY AGAIN';
            overlayBtn.style.display = 'inline-block';
          }
          return;
        } else {
          humanPlayer.reset(false);
          ghosts = Engine.createDefaultGhosts();
          addFloatingText('READY!', Engine.SPAWN_COL * Engine.TILE + Engine.TILE / 2, Engine.SPAWN_ROW * Engine.TILE, '#ffe600');
        }
      }
    } else {
      humanPlayer.moveTimer++;
      if (humanPlayer.moveTimer >= humanPlayer.moveRate) {
        humanPlayer.moveTimer = 0;

        // Turn buffer: try turning into nextDir if walkable
        const ncNext = Engine.wrapCol(humanPlayer.col + humanPlayer.nextDir.dc);
        const nrNext = humanPlayer.row + humanPlayer.nextDir.dr;
        if (Engine.isWalkable(ncNext, nrNext)) {
          humanPlayer.dir = humanPlayer.nextDir;
        }

        // Advance in current dir
        const nc = Engine.wrapCol(humanPlayer.col + humanPlayer.dir.dc);
        const nr = humanPlayer.row + humanPlayer.dir.dr;
        if (Engine.isWalkable(nc, nr)) {
          humanPlayer.col = nc;
          humanPlayer.row = nr;
        }

        // Pellet eating (points continue building towards 100)
        const pi = humanPlayer.row * Engine.COLS + humanPlayer.col;
        if (Engine.BASE_PELLETS[pi] && !humanPlayer.pelletsEaten[pi]) {
          humanPlayer.pelletsEaten[pi] = 1;
          humanPlayer.pelletsCount++;
          const pDelta = 40.0 / Math.max(1, Engine.TOTAL_PELLETS);
          humanPlayer.score = Math.min(100.0, humanPlayer.score + pDelta);
        }

        // Super Energizer eating (+10.0 pts each)
        if (Engine.BASE_ENERGIZERS[pi] && !humanPlayer.energizersEaten[pi]) {
          humanPlayer.energizersEaten[pi] = 1;
          humanPlayer.energizersCount++;
          humanPlayer.score = Math.min(100.0, humanPlayer.score + 10.0);
          addFloatingText('+10.0 ⚡', humanPlayer.col * Engine.TILE + Engine.TILE / 2, humanPlayer.row * Engine.TILE - 5, '#00f7ff');
          log('⚡ SUPER ENERGIZER CONSUMED! +10.0 PTS!', 'log-champion');
        }
      }

      // ⚡ ArcadeMode Electric Hazard Barriers update (ghost traps, player shocks & victory check)
      if (window.ArcadeMode) {
        window.ArcadeMode.update(humanPlayer, ghosts, {
          addFloatingText,
          log,
          onVictory: () => {
            overlay.classList.remove('hidden');
            overlayTitle.textContent = 'VICTORY!';
            overlayTitle.className = 'overlay-title title-victory';
            overlaySub.textContent = `ALL GHOSTS VAPORIZED! Maze Secured! Score: ${humanPlayer.score.toFixed(1)} / 100`;
            if (overlayBtn) {
              overlayBtn.textContent = 'PLAY AGAIN';
              overlayBtn.style.display = 'inline-block';
            }
          }
        });
      }

      // Ghosts update
      for (const g of ghosts) g.update(humanPlayer);

      // Ghost collisions (contact with ghost costs a life)
      for (const g of ghosts) {
        if (g.collides(humanPlayer.col, humanPlayer.row)) {
          humanPlayer.lives--;
          humanPlayer.isDying = true;
          humanPlayer.deathTimer = 0;
          addFloatingText('OUCH! 💀', humanPlayer.col * Engine.TILE + Engine.TILE / 2, humanPlayer.row * Engine.TILE, '#ff2d55');
          log(`💀 Caught by ${g.type.toUpperCase()}! Lives remaining: ${humanPlayer.lives}`, 'log-death');
          break;
        }
      }
    }

    // Render Arcade
    Engine.drawMap(ctx, humanPlayer.pelletsEaten, humanPlayer.energizersEaten);
    if (window.ArcadeMode) {
      window.ArcadeMode.render(ctx);
    }
    Engine.drawPlayer(ctx, humanPlayer);
    for (const g of ghosts) Engine.drawGhost(ctx, g);
    Engine.drawFloatingTexts(ctx, floatingTexts);

    const sensors = getSensors(humanPlayer, ghosts);
    updateHUD(sensors);
    lastFrameTime = ts;
    return;
  }

  // ─────────────────────────────────────────
  // B.  ⚔️ 1v1 MAN vs MACHINE DUEL
  // ─────────────────────────────────────────
  if (activeMode === 'duel') {
    duelTimer--;
    if (duelTimer <= 0) {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'MACHINE WINS!';
      overlayTitle.className = 'overlay-title title-gameover';
      overlaySub.textContent = `Time Expired! The AI outmaneuvered you with ${duelAgent ? duelAgent.pelletsCount : 0} pellets!`;
      if (overlayBtn) {
        overlayBtn.textContent = 'TRY AGAIN';
        overlayBtn.style.display = 'inline-block';
      }
      return;
    }

    // Player ghost update (Blinky)
    if (ghosts.length > 0) {
      ghosts[0].update(duelAgent, false);
    }

    // AI agent update
    if (duelAgent) {
      duelAgent.frames++;
      duelAgent.moveTimer++;
      if (duelAgent.moveTimer >= duelAgent.moveRate) {
        duelAgent.moveTimer = 0;
        const sensors = getSensors(duelAgent, ghosts);
        const outputs = duelAgent.brain.forward(sensors);
        duelAgent.lastOutputs.set(outputs);
        const dir = validatedDirection(outputs, duelAgent.col, duelAgent.row, duelAgent.dir);
        duelAgent.dir = dir;
        const nc = Engine.wrapCol(duelAgent.col + dir.dc);
        const nr = duelAgent.row + dir.dr;
        if (Engine.isWalkable(nc, nr)) {
          duelAgent.col = nc;
          duelAgent.row = nr;
        }
        const pi = duelAgent.row * Engine.COLS + duelAgent.col;
        if (Engine.BASE_PELLETS[pi] && !duelAgent.pelletsEaten[pi]) {
          duelAgent.pelletsEaten[pi] = 1;
          duelAgent.pelletsCount++;
          if (duelAgent.pelletsCount >= 50) {
            overlay.classList.remove('hidden');
            overlayTitle.textContent = 'MACHINE WINS!';
            overlayTitle.className = 'overlay-title title-gameover';
            overlaySub.textContent = `The AI speedran and ate 50 pellets before you could catch it!`;
            if (overlayBtn) {
              overlayBtn.textContent = 'TRY AGAIN';
              overlayBtn.style.display = 'inline-block';
            }
            return;
          }
        }
      }
    }

    // Player catches AI check
    if (ghosts.length > 0 && duelAgent && ghosts[0].collides(duelAgent.col, duelAgent.row)) {
      duelCatches++;
      addFloatingText('CAUGHT! ⚡', duelAgent.col * Engine.TILE + Engine.TILE / 2, duelAgent.row * Engine.TILE, '#00ff88');
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'HUMAN WINS!';
      overlayTitle.className = 'overlay-title title-victory';
      overlaySub.textContent = `You captured the AI with ${(duelTimer / 60).toFixed(1)}s remaining!`;
      if (overlayBtn) {
        overlayBtn.textContent = 'PLAY AGAIN';
        overlayBtn.style.display = 'inline-block';
      }
      return;
    }

    // Render Duel
    Engine.drawMap(ctx, duelAgent ? duelAgent.pelletsEaten : null, duelAgent ? duelAgent.energizersEaten : null);
    if (duelAgent) Engine.drawAgent(ctx, duelAgent, true);
    if (ghosts.length > 0) Engine.drawGhost(ctx, ghosts[0], false);
    Engine.drawFloatingTexts(ctx, floatingTexts);

    const sensors = duelAgent ? getSensors(duelAgent, ghosts) : null;
    updateHUD(sensors);
    lastFrameTime = ts;
    return;
  }

  // ─────────────────────────────────────────
  // C.  🔬 AI SWARM LAB MODE (Parallel GA)
  // ─────────────────────────────────────────
  const stepsPerFrame = fastMode ? 4 : 1;

  for (let step = 0; step < stepsPerFrame; step++) {
    epochTicks++;

    const aliveList = swarm.filter(a => a.alive);
    const activeLead = aliveList.length > 0
      ? aliveList.reduce((a, b) => a.fitness >= b.fitness ? a : b)
      : null;

    // ── Ghost updates
    for (const g of ghosts) g.update(activeLead);

    // ── Agent updates
    let aliveCount = 0;
    for (const agent of swarm) {
      if (!agent.alive) continue;
      aliveCount++;

      agent.frames++;
      agent.moveTimer++;

      if (agent.moveTimer < agent.moveRate) continue;
      agent.moveTimer = 0;

      // 1. 12-Input sensor extraction
      const sensors = getSensors(agent, ghosts);

      // 2. Forward pass through NeuralNet
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

      // 5. Dense Reward Shaping: scaled so total score stays <= 100
      const pelletPath = Engine.findNearestPelletPath(agent.col, agent.row, agent.pelletsEaten, agent.energizersEaten);
      if (agent.prevPelletDist !== -1) {
        if (pelletPath.dist < agent.prevPelletDist) {
          agent.shapedReward += 0.05;
        } else if (pelletPath.dist > agent.prevPelletDist) {
          agent.shapedReward -= 0.03;
        }
      }
      agent.prevPelletDist = pelletPath.dist;

      // Ghost proximity gradient (avoidance vs danger)
      let nearestGDist = Infinity;
      for (const g of ghosts) {
        if (g.eaten) continue;
        let dx = g.col - agent.col;
        if (Math.abs(dx) > Engine.COLS / 2) dx = dx > 0 ? dx - Engine.COLS : dx + Engine.COLS;
        const dy = g.row - agent.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestGDist) nearestGDist = d;
      }
      if (nearestGDist <= 3.5) {
        if (agent.prevGhostDist !== -1) {
          if (nearestGDist > agent.prevGhostDist) {
            agent.shapedReward += 0.08;
          } else {
            agent.shapedReward -= 0.04;
          }
        }
      }
      agent.prevGhostDist = nearestGDist;

      // Track recent path & oscillation
      const curTileIdx = agent.row * Engine.COLS + agent.col;
      agent.recentPath.push(curTileIdx);
      if (agent.recentPath.length > 6) agent.recentPath.shift();

      if (agent.col === agent.lastCol && agent.row === agent.lastRow) {
        agent.stuckFrames++;
      } else if (agent.recentPath.length >= 4 &&
                 agent.recentPath[agent.recentPath.length - 1] === agent.recentPath[agent.recentPath.length - 3] &&
                 agent.recentPath[agent.recentPath.length - 2] === agent.recentPath[agent.recentPath.length - 4]) {
        agent.stuckFrames += 2;
        agent.shapedReward -= 0.5;
      } else {
        agent.stuckFrames = Math.max(0, agent.stuckFrames - 1);
        agent.lastCol = agent.col;
        agent.lastRow = agent.row;
      }

      agent.shapedReward = Math.max(-10.0, Math.min(10.0, agent.shapedReward));

      if (agent.stuckFrames > 8) {
        agent.alive = false;
        agent.calcFitness();
        log(`✗ Agent died (camping/oscillation). Pellets=${agent.pelletsCount} Fit=${agent.fitness.toFixed(1)}`, 'log-death');
        continue;
      }

      // 6. Visit tracking & corridor exploration reward
      const vi = agent.row * Engine.COLS + agent.col;
      agent.visitCount[vi]++;
      if (agent.visitCount[vi] === 1) {
        agent.shapedReward = Math.min(10.0, agent.shapedReward + 0.15);
      }

      // 7. Regular Pellet Eating
      const pi = agent.row * Engine.COLS + agent.col;
      if (Engine.BASE_PELLETS[pi] && !agent.pelletsEaten[pi]) {
        agent.pelletsEaten[pi] = 1;
        agent.pelletsCount++;
      }

      // 8. Super Energizer Eating
      if (Engine.BASE_ENERGIZERS[pi] && !agent.energizersEaten[pi]) {
        agent.energizersEaten[pi] = 1;
        agent.energizersCount++;
      }

      // 9. Ghost Collisions (fatal contact)
      for (const g of ghosts) {
        if (g.collides(agent.col, agent.row)) {
          agent.alive = false;
          agent.calcFitness();
          log(`✗ Agent caught by ${g.type.toUpperCase()}. Pellets=${agent.pelletsCount} Fit=${agent.fitness.toFixed(1)}`, 'log-death');
          break;
        }
      }
    }

    // Rollover the epoch only when every agent is dead (no time cap)
    if (aliveCount === 0) {
      endEpoch();
      return;
    }
  }

  // ── RENDER SWARM ────────────────────────────
  const aliveList = swarm.filter(a => a.alive);
  const leader = aliveList.length > 0
    ? aliveList.reduce((a, b) => a.fitness >= b.fitness ? a : b)
    : swarm.reduce((a, b) => a.fitness >= b.fitness ? a : b, swarm[0]);

  Engine.drawMap(ctx, leader ? leader.pelletsEaten : null, leader ? leader.energizersEaten : null);

  for (const agent of swarm) {
    if (agent.alive && agent !== leader) {
      Engine.drawAgent(ctx, agent, false);
    }
  }
  if (leader && leader.alive) {
    Engine.drawAgent(ctx, leader, true);
  }

  for (const g of ghosts) Engine.drawGhost(ctx, g);

  if (leader && leader.alive) {
    leaderSensors = getSensors(leader, ghosts);
  }

  updateHUD(leaderSensors);
  lastFrameTime = ts;
}

// ─────────────────────────────────────────────
// 12.  MOUSE & INTERACTIVE CONTROLS
// ─────────────────────────────────────────────

canvas.addEventListener('click', function (e) {
  // In Arcade Mode: clicking to spawn ghosts is disabled
  if (activeMode === 'arcade') {
    return;
  }

  const rect    = canvas.getBoundingClientRect();
  const scaleX  = canvas.width  / rect.width;
  const scaleY  = canvas.height / rect.height;
  const px      = (e.clientX - rect.left) * scaleX;
  const py      = (e.clientY - rect.top)  * scaleY;
  const col     = Math.floor(px / Engine.TILE);
  const row     = Math.floor(py / Engine.TILE);

  const key = `${col},${row}`;

  // Maze Architect Barrier Placement (or Shift+Click)
  if (architectMode || e.shiftKey) {
    if (Engine.dynamicBarriers.has(key)) {
      Engine.dynamicBarriers.delete(key);
      log(`🧱 Barrier removed at (${col},${row}). Swarm rerouting.`, 'log-mutate');
    } else if (Engine.isWalkable(col, row)) {
      Engine.dynamicBarriers.add(key);
      log(`🧱 Dynamic Barrier placed at (${col},${row}). Swarm rerouting!`, 'log-mutate');
    }
    return;
  }

  // Default: Spawn hunter ghost (Swarm mode)
  if (!Engine.isWalkable(col, row)) return;
  const colors  = ['#ff2d55', '#ff6b00', '#a855f7', '#00ff88'];
  const color   = colors[ghosts.length % colors.length];
  const ghost   = new Engine.Ghost(col, row, 'custom', color);
  ghost.userSpawned = true;
  ghosts.push(ghost);

  log(`[CLICK] Hunter Ghost #${ghosts.length} spawned at (${col},${row}).`, 'log-ghost');
  elMGhosts.textContent = ghosts.length;
});

// Right click to drop Super Energizer
canvas.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  const rect    = canvas.getBoundingClientRect();
  const scaleX  = canvas.width  / rect.width;
  const scaleY  = canvas.height / rect.height;
  const px      = (e.clientX - rect.left) * scaleX;
  const py      = (e.clientY - rect.top)  * scaleY;
  const col     = Math.floor(px / Engine.TILE);
  const row     = Math.floor(py / Engine.TILE);

  if (!Engine.isWalkable(col, row)) return;
  const idx = row * Engine.COLS + col;
  Engine.BASE_ENERGIZERS[idx] = 1;
  log(`⚡ [RIGHT-CLICK] Super Energizer dropped at (${col},${row})!`, 'log-champion');
});

// ─────────────────────────────────────────────
// 13.  CONTROL BUTTONS & PUBLIC SIMULATION API
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
    overlaySub.textContent   = 'Press Space or click RESUME';
  } else {
    overlay.classList.add('hidden');
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



// Maze Architect Mode Toggle
if (btnBarrier) {
  btnBarrier.addEventListener('click', () => {
    architectMode = !architectMode;
    btnBarrier.classList.toggle('active-mode', architectMode);
    log(architectMode
      ? '🧱 MAZE ARCHITECT ON! Click any open corridor to place/remove dynamic barriers.'
      : '🧱 Maze Architect Off. Normal click-to-spawn restored.', 'log-mutate');
  });
}

// Turbo Warp Button
if (btnWarp) {
  btnWarp.addEventListener('click', () => {
    warpGenerations(10);
  });
}

// ─────────────────────────────────────────────
// 14.  MODE SWITCHER & INTERACTION
// ─────────────────────────────────────────────

function switchMode(mode) {
  activeMode = mode;
  paused = false;
  overlay.classList.add('hidden');
  overlayTitle.className = 'overlay-title';
  if (overlayBtn) overlayBtn.style.display = 'none';
  floatingTexts = [];

  if (tabArcade) tabArcade.classList.toggle('active', mode === 'arcade');
  if (tabDuel)   tabDuel.classList.toggle('active', mode === 'duel');
  if (tabSwarm)  tabSwarm.classList.toggle('active', mode === 'swarm');

  if (mode === 'arcade') {
    if (stat1Lbl) stat1Lbl.textContent = 'SCORE';
    if (stat2Lbl) stat2Lbl.textContent = 'LIVES';
    if (stat3Lbl) stat3Lbl.textContent = 'GHOSTS';
    if (canvasHint) canvasHint.textContent = '🕹️ ARCADE: Arrow Keys / WASD · Lure Ghosts into Electric Barriers ⚡ to Vaporize them · Avoid Barriers (bumping spawns +1 Ghost) · Kill All Ghosts to Win!';
    humanPlayer.reset(true);
    if (window.ArcadeMode) window.ArcadeMode.reset();
    ghosts = Engine.createDefaultGhosts();
    log('🕹️ ARCADE MODE ACTIVATED! Lure ghosts into Electric Barriers ⚡ to vaporize them! Avoid touching barriers (+1 ghost penalty). Kill all ghosts to win!', 'log-champion');
  } else if (mode === 'duel') {
    if (stat1Lbl) stat1Lbl.textContent = 'TIME';
    if (stat2Lbl) stat2Lbl.textContent = 'AI FOOD';
    if (stat3Lbl) stat3Lbl.textContent = 'CATCHES';
    if (canvasHint) canvasHint.textContent = 'WASD / Arrows = Steer Blinky · Hunt down the AI Champion before time expires!';
    duelTimer = 45 * 60;
    duelCatches = 0;
    duelAgent = new Agent(GA.createBrain());
    duelAgent.brain.setWeights(CHAMPION_WEIGHTS);
    ghosts = [new Engine.Ghost(Engine.GHOST_HOUSE_COL, Engine.GHOST_HOUSE_ROW - 2, 'blinky', '#ff2d55')];
    ghosts[0].isPlayerControlled = true;
    log('⚔️ 1v1 MAN vs MACHINE DUEL! You are Blinky. Hunt the Neural Network!', 'log-ghost');
  } else {
    if (stat1Lbl) stat1Lbl.textContent = 'GEN';
    if (stat2Lbl) stat2Lbl.textContent = 'ALIVE';
    if (stat3Lbl) stat3Lbl.textContent = 'BEST FIT';
    if (canvasHint) canvasHint.textContent = 'Click = Ghost · Shift+Click = Dynamic Wall Barrier · Right-Click = Energizer · Space = Pause';
    ghosts = Engine.createDefaultGhosts();
    spawnSwarm(buildFirstGeneration(isChampion));
    log('🔬 AI SWARM LAB: 35 neural network agents evolving across generations.', 'log-mutate');
  }
  updateHUD();
}

if (tabArcade) tabArcade.addEventListener('click', () => switchMode('arcade'));
if (tabDuel)   tabDuel.addEventListener('click', () => switchMode('duel'));
if (tabSwarm)  tabSwarm.addEventListener('click', () => switchMode('swarm'));
if (overlayBtn) overlayBtn.addEventListener('click', () => {
  switchMode(activeMode);
});

// Keyboard controls: Space (Pause), R (Restart), B (Barriers), WASD/Arrows
document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    btnPause.click();
    return;
  }
  if (e.code === 'KeyR') {
    switchMode(activeMode);
    return;
  }

  if (e.code === 'KeyB') {
    if (btnBarrier) btnBarrier.click();
    return;
  }

  // Directional controls for Arcade Pac-Man OR Playable Ghost
  if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (activeMode === 'arcade') humanPlayer.nextDir = Engine.DIR.UP;
    else if (activeMode === 'duel' && ghosts.length > 0) ghosts[0].dir = Engine.DIR.UP;
    e.preventDefault();
  } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    if (activeMode === 'arcade') humanPlayer.nextDir = Engine.DIR.DOWN;
    else if (activeMode === 'duel' && ghosts.length > 0) ghosts[0].dir = Engine.DIR.DOWN;
    e.preventDefault();
  } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    if (activeMode === 'arcade') humanPlayer.nextDir = Engine.DIR.LEFT;
    else if (activeMode === 'duel' && ghosts.length > 0) ghosts[0].dir = Engine.DIR.LEFT;
    e.preventDefault();
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    if (activeMode === 'arcade') humanPlayer.nextDir = Engine.DIR.RIGHT;
    else if (activeMode === 'duel' && ghosts.length > 0) ghosts[0].dir = Engine.DIR.RIGHT;
    e.preventDefault();
  }
});

// Expose Public Simulation API
(typeof window !== 'undefined' ? window : globalThis).NeuroArena = {
  getSwarm: () => swarm,
  getGhosts: () => ghosts,
  getPlayer: () => humanPlayer,
  getMode: () => activeMode,
  setMode: (m) => switchMode(m),
  getGeneration: () => generation,
  getBestFitness: () => allTimeBest,
  warpGenerations: (n) => warpGenerations(n),
  exportBestBrainJSON: () => {
    const best = [...swarm].sort((a, b) => b.fitness - a.fitness)[0];
    return best ? best.brain.toJSON() : null;
  }
};

// ─────────────────────────────────────────────
// 15.  BOOT
// ─────────────────────────────────────────────

(function boot() {
  log('┌─────────────────────────────────────────┐', 'log-champion');
  log('│  NEURO-PACMAN ARENA — AI Swarm Sandbox  │', 'log-champion');
  log('│  35 neural agents · genetic evolution   │', 'log-champion');
  log('└─────────────────────────────────────────┘', 'log-champion');
  log('Dual Tunnels · 4 Energizer Chambers · Dense Reward Shaping', '');
  log('Modes: 🕹️ ARCADE · ⚔️ 1v1 VS AI · 🔬 SWARM LAB', 'log-champion');
  log('─────────────────────────────────────────────', '');

  isChampion = true;
  switchMode('arcade');

  rafId = requestAnimationFrame(gameLoop);
})();


