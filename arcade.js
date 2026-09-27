/* ===================================================================
   arcade.js — Arcade Mode with Moving Slow Hazard Barriers,
   3-Strike Barrier Shields, Slow Ghost Pursuit, 5 Wormholes & Point Clearance
   =================================================================== */
'use strict';

const ArcadeMode = (() => {
  // ─────────────────────────────────────────────
  // 1.  NATIVE PROCEDURAL WEB AUDIO SYNTHESIZER
  // ─────────────────────────────────────────────
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx && (typeof window !== 'undefined')) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // Alarm buzzer when Pac-Man touches a barrier (spawns +1 ghost)
  function playAlarmSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      // Urgent high-low hazard pulse
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(280, now + 0.12);
      osc.frequency.setValueAtTime(440, now + 0.24);
      osc.frequency.setValueAtTime(220, now + 0.36);

      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.48);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (_) {}
  }

  // Victory fanfare when all points are cleared
  function playVictoryFanfare() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.25, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch (_) {}
  }

  // Quantum warp sound when teleporting
  function playTeleportSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      // Rapid ascending quantum warp sweep
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.28);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 2.  MOVING SLOW BARRIERS CONFIGURATION
  // ─────────────────────────────────────────────
  // Reduced to 3 patrolling slow-moving hazard barriers across corridors.
  // Ghosts are completely immune to them; only Protagonist is penalized on contact!
  const INITIAL_BARRIERS = [
    {
      id: 1,
      name: 'Vanguard Titan',
      // Upper sector horizontal cruiser: patrols along row 4 between col 3 and 23
      col: 3, row: 4,
      targetCol: 23, targetRow: 4,
      minCol: 3, maxCol: 23,
      minRow: 4, maxRow: 4,
      dirCol: 1, dirRow: 0,
      moveInterval: 32, // Slow speed: 1 tile every 32 frames
      stepTimer: 0,
      renderX: 3 * Engine.TILE,
      renderY: 4 * Engine.TILE,
      color: '#ff2d55',
      pulse: 0
    },
    {
      id: 2,
      name: 'Centurion Cruiser',
      // Lower sector horizontal cruiser: patrols along row 20 between col 23 and 3
      col: 23, row: 20,
      targetCol: 3, targetRow: 20,
      minCol: 3, maxCol: 23,
      minRow: 20, maxRow: 20,
      dirCol: -1, dirRow: 0,
      moveInterval: 32, // Slow speed
      stepTimer: 0,
      renderX: 23 * Engine.TILE,
      renderY: 20 * Engine.TILE,
      color: '#ff6b00',
      pulse: Math.PI / 2
    },
    {
      id: 3,
      name: 'Phantom Sentry',
      // Western vertical choke: patrols along col 6 between row 4 and row 17
      col: 6, row: 4,
      targetCol: 6, targetRow: 17,
      minCol: 6, maxCol: 6,
      minRow: 4, maxRow: 17,
      dirCol: 0, dirRow: 1,
      moveInterval: 36, // Slow speed
      stepTimer: 0,
      renderX: 6 * Engine.TILE,
      renderY: 4 * Engine.TILE,
      color: '#a855f7',
      pulse: Math.PI
    },
    {
      id: 4,
      name: 'Solar Sentry',
      // Eastern vertical choke: patrols along col 20 between row 4 and row 17
      col: 20, row: 4,
      targetCol: 20, targetRow: 17,
      minCol: 20, maxCol: 20,
      minRow: 4, maxRow: 17,
      dirCol: 0, dirRow: 1,
      moveInterval: 36,
      stepTimer: 0,
      renderX: 20 * Engine.TILE,
      renderY: 4 * Engine.TILE,
      color: '#ffe600',
      pulse: Math.PI * 1.5
    },
    {
      id: 5,
      name: 'Quantum Core',
      // Mid sector cross: patrols along row 15 between col 3 and 23
      col: 13, row: 15,
      targetCol: 23, targetRow: 15,
      minCol: 3, maxCol: 23,
      minRow: 15, maxRow: 15,
      dirCol: 1, dirRow: 0,
      moveInterval: 34,
      stepTimer: 0,
      renderX: 13 * Engine.TILE,
      renderY: 15 * Engine.TILE,
      color: '#00f7ff',
      pulse: Math.PI * 0.5
    }
  ];

  let configuredBarrierCount = 3;      // Customizable from Settings (1 to 5)
  let movingBarriers = [];
  let barrierStrikes = 0;              // 3 strikes = game over (3 barrier lives)
  const MAX_BARRIER_STRIKES = 3;
  let playerInvulnerableTimer = 0;      // Debounce cooldown after hitting barrier
  let reinforcementIndex = 0;
  let frameCount = 0;
  let shockParticles = [];
  let teleportCharges = 0;             // Charges gained from eating glowing blue points

  const SLOW_GHOST_MOVE_RATE = 22;      // Slow, menacing ghost speed (human is 8)

  // Colors for dynamically spawned reinforcement ghosts
  const REINFORCEMENT_GHOST_STYLES = [
    { type: 'blinky', color: '#ff0055', name: 'Alpha Crimson' },
    { type: 'pinky',  color: '#ff00d4', name: 'Phantom Magenta' },
    { type: 'inky',   color: '#00e5ff', name: 'Volt Cyan' },
    { type: 'clyde',  color: '#ff9900', name: 'Solar Amber' },
    { type: 'blinky', color: '#a855f7', name: 'Nether Violet' },
    { type: 'pinky',  color: '#00ff88', name: 'Toxic Emerald' },
  ];

  let runStartTime = Date.now();
  let warpsUsedCount = 0;
  let isVictoryTriggered = false;

  function reset() {
    movingBarriers = INITIAL_BARRIERS.slice(0, configuredBarrierCount).map(b => ({
      ...b,
      renderX: b.col * Engine.TILE,
      renderY: b.row * Engine.TILE,
      stepTimer: 0
    }));
    barrierStrikes = 0;
    playerInvulnerableTimer = 0;
    reinforcementIndex = 0;
    shockParticles = [];
    teleportCharges = 0;
    runStartTime = Date.now();
    warpsUsedCount = 0;
    isVictoryTriggered = false;
  }

  // ─────────────────────────────────────────────
  // 3.  REINFORCEMENT SLOW GHOST SPAWN
  // ─────────────────────────────────────────────
  function spawnReinforcementGhost(ghosts) {
    const style = REINFORCEMENT_GHOST_STYLES[reinforcementIndex % REINFORCEMENT_GHOST_STYLES.length];
    reinforcementIndex++;

    const spawnCol = Engine.GHOST_HOUSE_COL;
    const spawnRow = Engine.GHOST_HOUSE_ROW - 2;

    const g = new Engine.Ghost(spawnCol, spawnRow, style.type, style.color);
    g.userSpawned = true;
    g.moveRate = SLOW_GHOST_MOVE_RATE; // Ensure slow ghost speed
    ghosts.push(g);
    return { ghost: g, style };
  }

  // Spawn visual shock spark particles
  function spawnShockParticles(x, y, color = '#ff0055') {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.0 + Math.random() * 3.0;
      shockParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.floor(Math.random() * 12),
        maxLife: 37,
        size: 2.0 + Math.random() * 2.0,
        color: i % 2 === 0 ? color : '#ffe600'
      });
    }
  }

  function updateParticles() {
    for (let i = shockParticles.length - 1; i >= 0; i--) {
      const p = shockParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.life--;
      if (p.life <= 0) shockParticles.splice(i, 1);
    }
  }

  // ─────────────────────────────────────────────
  // 4.  UPDATE LOOP: MOVING BARRIERS & COLLISIONS
  // ─────────────────────────────────────────────
  function update(humanPlayer, ghosts, context) {
    const { addFloatingText, log, onVictory, onBarrierGameOver } = context;
    frameCount++;

    if (playerInvulnerableTimer > 0) {
      playerInvulnerableTimer--;
    }

    updateParticles();

    // ─────────────────────────────────────────────────────────
    // A. UPDATE SLOW MOVING BARRIERS
    // ─────────────────────────────────────────────────────────
    for (const b of movingBarriers) {
      b.stepTimer++;
      if (b.stepTimer >= b.moveInterval) {
        b.stepTimer = 0;

        // Advance 1 tile in patrol direction
        let nextCol = b.col + b.dirCol;
        let nextRow = b.row + b.dirRow;

        // Check patrol boundary reversal
        if (nextCol < b.minCol || nextCol > b.maxCol || nextRow < b.minRow || nextRow > b.maxRow || !Engine.isWalkable(nextCol, nextRow)) {
          b.dirCol = -b.dirCol;
          b.dirRow = -b.dirRow;
          nextCol = b.col + b.dirCol;
          nextRow = b.row + b.dirRow;
        }

        if (Engine.isWalkable(nextCol, nextRow)) {
          b.col = nextCol;
          b.row = nextRow;
        }
      }

      // Smooth interpolation for silky-smooth motion
      const targetPixelX = b.col * Engine.TILE;
      const targetPixelY = b.row * Engine.TILE;
      b.renderX += (targetPixelX - b.renderX) * 0.12;
      b.renderY += (targetPixelY - b.renderY) * 0.12;
    }

    // (Note: Ghosts are completely immune to barriers now - no ghost vaporization)

    // ─────────────────────────────────────────────────────────
    // B. PROTAGONIST COLLISION WITH MOVING BARRIERS
    // ─────────────────────────────────────────────────────────
    if (!humanPlayer.isDying && humanPlayer.alive) {
      const playerCenterX = humanPlayer.col * Engine.TILE + Engine.TILE / 2;
      const playerCenterY = humanPlayer.row * Engine.TILE + Engine.TILE / 2;

      for (const b of movingBarriers) {
        const barrierCenterX = b.renderX + Engine.TILE / 2;
        const barrierCenterY = b.renderY + Engine.TILE / 2;

        const dx = playerCenterX - barrierCenterX;
        const dy = playerCenterY - barrierCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Collision threshold (within 0.85 tile)
        if (dist < Engine.TILE * 0.85) {
          if (playerInvulnerableTimer <= 0) {
            b.lastShockFrame = frameCount;
            barrierStrikes++;
            playerInvulnerableTimer = 90; // ~1.5s invulnerability cooldown

            spawnShockParticles(playerCenterX, playerCenterY, b.color);
            playAlarmSound();
            if (context && typeof context.onScreenShake === 'function') {
              context.onScreenShake();
            }

            const shieldsLeft = Math.max(0, MAX_BARRIER_STRIKES - barrierStrikes);

            // Spawn +1 slow ghost as penalty
            const { ghost: newGhost, style } = spawnReinforcementGhost(ghosts);

            addFloatingText(`⚠️ BARRIER HIT! (${shieldsLeft} SHIELDS LEFT) +1 GHOST 👻`, playerCenterX, playerCenterY - 8, '#ff0055');
            log(`⚠️ BARRIER STRIKE ${barrierStrikes}/${MAX_BARRIER_STRIKES}! Struck ${b.name}. Reinforcement ${style.name} deployed! Total ghosts: ${ghosts.length}`, 'log-death');

            // 3rd barrier strike = PROTAGONIST LOSES (GAME OVER)
            if (barrierStrikes >= MAX_BARRIER_STRIKES) {
              humanPlayer.alive = false;
              humanPlayer.isDying = true;
              if (typeof onBarrierGameOver === 'function') {
                onBarrierGameOver();
              }
              return;
            }
          }
          break;
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // C. PROTAGONIST POINT COMPLETION WIN CONDITION
    // ─────────────────────────────────────────────────────────
    let remainingPellets = 0;
    let remainingEnergizers = 0;
    for (let i = 0; i < Engine.COLS * Engine.ROWS; i++) {
      if (Engine.BASE_PELLETS[i] && !humanPlayer.pelletsEaten[i]) remainingPellets++;
      if (Engine.BASE_ENERGIZERS[i] && !humanPlayer.energizersEaten[i]) remainingEnergizers++;
    }

    const allPelletsEaten = remainingPellets === 0;
    const allEnergizersEaten = remainingEnergizers === 0;
    const totalPointsEaten = (humanPlayer.pelletsCount || 0) + (humanPlayer.energizersCount || 0);
    const totalPoints = Engine.TOTAL_POINTS || (Engine.TOTAL_PELLETS + 4);

    if (allPelletsEaten || totalPointsEaten >= totalPoints || humanPlayer.pelletsCount >= Engine.TOTAL_PELLETS) {
      if (!isVictoryTriggered) {
        isVictoryTriggered = true;
        playVictoryFanfare();
        humanPlayer.score = 100.0;
        if (typeof onVictory === 'function') {
          onVictory();
        }
      }
      return;
    }
  }

  // ─────────────────────────────────────────────
  // 5.  RENDER WORMHOLE GATES & MOVING BARRIERS
  // ─────────────────────────────────────────────
  function render(ctx) {
    const tile = Engine.TILE;
    const time = frameCount * 0.08;

    // A. Render 5 Wormhole Neon Portal Vortex Gates (Rows 3, 8, 13, 18, 23)
    const portalRows = [3, 8, 13, 18, 23];
    const pPulse = (Math.sin(time * 3) + 1) * 0.5;
    for (const pr of portalRows) {
      const py = pr * tile;
      ctx.save();
      // Left portal gate (col 0)
      ctx.fillStyle = `rgba(0, 247, 255, ${0.18 + pPulse * 0.28})`;
      ctx.strokeStyle = '#00f7ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00f7ff';
      ctx.shadowBlur = 8 + pPulse * 8;
      ctx.strokeRect(0, py + 1, 4, tile - 2);
      ctx.fillRect(0, py + 2, 3, tile - 4);
      // Right portal gate (col 27)
      const rx = (Engine.COLS - 1) * tile + tile - 4;
      ctx.strokeRect(rx, py + 1, 4, tile - 2);
      ctx.fillRect(rx + 1, py + 2, 3, tile - 4);
      ctx.restore();
    }

    // B. Render subtle dashed patrol trajectory guides for moving barriers
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    for (const b of movingBarriers) {
      ctx.strokeStyle = `${b.color}35`;
      ctx.beginPath();
      const x1 = b.minCol * tile + tile / 2;
      const y1 = b.minRow * tile + tile / 2;
      const x2 = b.maxCol * tile + tile / 2;
      const y2 = b.maxRow * tile + tile / 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    for (const b of movingBarriers) {
      const x = b.renderX;
      const y = b.renderY;
      const cx = x + tile / 2;
      const cy = y + tile / 2;
      const isRecentlyShocked = (frameCount - (b.lastShockFrame || 0)) < 18;

      ctx.save();

      // 1. Glowing High-Voltage Electric Background Plate
      const glow = Math.sin(time * 2 + b.pulse) * 0.25 + 0.75;
      ctx.fillStyle = isRecentlyShocked
        ? 'rgba(255, 0, 85, 0.48)'
        : `rgba(0, 247, 255, ${0.22 * glow})`;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);

      // 2. High-Tech Corner Brackets & Electric Frame
      const frameColor = isRecentlyShocked ? '#ff0055' : '#00f7ff';
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 1.5, y + 1.5, tile - 3, tile - 3);

      // Corner accent pylons
      ctx.fillStyle = isRecentlyShocked ? '#ffffff' : '#ffe600';
      ctx.fillRect(x + 1, y + 1, 3, 3);
      ctx.fillRect(x + tile - 4, y + 1, 3, 3);
      ctx.fillRect(x + 1, y + tile - 4, 3, 3);
      ctx.fillRect(x + tile - 4, y + tile - 4, 3, 3);

      // 3. Dynamic Animated Lightning / Plasma Shock Arcs across barrier
      ctx.beginPath();
      ctx.strokeStyle = isRecentlyShocked ? '#ffffff' : (Math.random() < 0.5 ? '#ffe600' : '#00f7ff');
      ctx.lineWidth = isRecentlyShocked ? 2.4 : 1.6;

      ctx.moveTo(x + 2, cy + Math.sin(time * 4) * 3);
      ctx.lineTo(x + 5, cy - Math.cos(time * 5) * 4);
      ctx.lineTo(cx, cy + Math.sin(time * 6) * 5);
      ctx.lineTo(x + tile - 5, cy - Math.cos(time * 4) * 4);
      ctx.lineTo(x + tile - 2, cy + Math.sin(time * 5) * 3);
      ctx.stroke();

      // Second crossed electric arc for rich high-voltage look
      ctx.beginPath();
      ctx.strokeStyle = isRecentlyShocked ? '#ff0055' : (Math.random() < 0.3 ? '#00f7ff' : '#ffe600');
      ctx.lineWidth = 1.2;
      ctx.moveTo(cx + Math.cos(time * 5) * 3, y + 2);
      ctx.lineTo(cx - Math.sin(time * 4) * 4, y + 6);
      ctx.lineTo(cx + Math.sin(time * 6) * 4, y + tile - 6);
      ctx.lineTo(cx - Math.cos(time * 5) * 3, y + tile - 2);
      ctx.stroke();

      // 4. Central High-Voltage Core (⚡)
      ctx.fillStyle = isRecentlyShocked ? '#ffffff' : (Math.random() < 0.25 ? '#ffe600' : '#00f7ff');
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', cx, cy);

      // 5. Electric discharge sparks radiating around the barrier
      if (Math.random() < 0.4 || isRecentlyShocked) {
        ctx.fillStyle = '#ffffff';
        const sx = x + 2 + Math.random() * (tile - 4);
        const sy = y + 2 + Math.random() * (tile - 4);
        ctx.fillRect(sx, sy, 1.8, 1.8);
      }

      ctx.restore();
    }

    // Render Shock & Alert Particles
    for (const p of shockParticles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─────────────────────────────────────────────
  // 6.  QUANTUM TELEPORTATION LOGIC [KEY T]
  // ─────────────────────────────────────────────
  function executeTeleport(humanPlayer, ghosts, context) {
    const { addFloatingText, log } = context;

    if (!humanPlayer.alive || humanPlayer.isDying) return false;

    if (teleportCharges <= 0) {
      addFloatingText('NO WARP CHARGE! Eat 🔵 Point First!', humanPlayer.col * Engine.TILE + Engine.TILE / 2, humanPlayer.row * Engine.TILE - 8, '#ff6b6b');
      return false;
    }

    teleportCharges--;

    // Gather all walkable corridor tiles (excluding ghost house)
    const candidates = [];
    for (let r = 1; r < Engine.ROWS - 1; r++) {
      for (let c = 1; c < Engine.COLS - 1; c++) {
        if (!Engine.isWalkable(c, r)) continue;
        if (Engine.RAW_MAP[r][c] === 3) continue; // Ghost house

        // Don't land directly on moving barriers
        let onBarrier = false;
        for (const b of movingBarriers) {
          if (b.col === c && b.row === r) { onBarrier = true; break; }
        }
        if (onBarrier) continue;

        // Calculate minimum distance to any active ghost
        let minGhostDist = 999;
        for (const g of ghosts) {
          const dx = c - g.col;
          const dy = r - g.row;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minGhostDist) minGhostDist = dist;
        }

        // Distance from current player position (bias towards opposite side of the map)
        const pDx = c - humanPlayer.col;
        const pDy = r - humanPlayer.row;
        const distFromPlayer = Math.sqrt(pDx * pDx + pDy * pDy);

        // Score: Heavily prioritize maximum distance from ghosts, plus opposite side of map
        const score = minGhostDist * 2.5 + distFromPlayer;

        candidates.push({ col: c, row: r, minGhostDist, distFromPlayer, score });
      }
    }

    if (candidates.length === 0) return false;

    // Sort to find the safest destination tile on the other side of the map
    candidates.sort((a, b) => b.score - a.score);
    const bestTile = candidates[0];

    // Spawn warp particles at origin
    spawnShockParticles(humanPlayer.col * Engine.TILE + Engine.TILE / 2, humanPlayer.row * Engine.TILE + Engine.TILE / 2, '#00f7ff');

    const oldCol = humanPlayer.col;
    const oldRow = humanPlayer.row;

    // Teleport Pac-Man
    humanPlayer.col = bestTile.col;
    humanPlayer.row = bestTile.row;
    humanPlayer.moveTimer = 0;

    // Spawn warp particles at destination
    spawnShockParticles(bestTile.col * Engine.TILE + Engine.TILE / 2, bestTile.row * Engine.TILE + Engine.TILE / 2, '#00f7ff');
    playTeleportSound();
    warpsUsedCount++;

    addFloatingText('🌀 QUANTUM WARP! SAFE! ✨', bestTile.col * Engine.TILE + Engine.TILE / 2, bestTile.row * Engine.TILE - 8, '#00f7ff');
    log(`🌀 QUANTUM WARP! Teleported from (${oldCol},${oldRow}) to safe sector (${bestTile.col},${bestTile.row})! Ghost clearance: ${bestTile.minGhostDist.toFixed(1)} tiles away. Charges left: ${teleportCharges}`, 'log-champion');

    return true;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────
  return {
    init: reset,
    reset,
    update,
    render,
    getBarrierStrikes: () => barrierStrikes,
    getShieldsLeft: () => Math.max(0, MAX_BARRIER_STRIKES - barrierStrikes),
    getMovingBarriers: () => movingBarriers,
    getBarrierCount: () => configuredBarrierCount,
    setBarrierCount: (n) => {
      configuredBarrierCount = Math.max(1, Math.min(5, n));
      reset();
    },
    getSlowGhostSpeed: () => SLOW_GHOST_MOVE_RATE,
    getTeleportCharges: () => teleportCharges,
    addTeleportCharge: () => { teleportCharges++; },
    executeTeleport,
    spawnReinforcementGhost,
    getRunStats: (player) => {
      const elapsedSec = Math.floor((Date.now() - (runStartTime || Date.now())) / 1000);
      const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const secs = (elapsedSec % 60).toString().padStart(2, '0');
      const totalPoints = Engine.TOTAL_POINTS || (Engine.TOTAL_PELLETS + 4);
      const pointsEaten = player ? ((player.pelletsCount || 0) + (player.energizersCount || 0)) : 0;
      return {
        pelletsEaten: pointsEaten,
        totalPellets: totalPoints,
        timeSurvivedStr: `${mins}:${secs}`,
        warpsUsed: warpsUsedCount,
        barrierStrikes: barrierStrikes,
        maxStrikes: MAX_BARRIER_STRIKES,
        score: player ? player.score : 0,
      };
    },
    playAlarmSound,
    playVictoryFanfare,
    playTeleportSound,
  };
})();

// Attach to global window
if (typeof window !== 'undefined') {
  window.ArcadeMode = ArcadeMode;
}
