/* ===================================================================
   arcade.js — Dedicated Arcade Mode with Electric Hazard Barriers,
   Ghost Vaporization, Player Shock Penalty, Web Audio FX & Win System
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

  // Zap / Vaporize sound when a ghost hits an electric barrier
  function playZapSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Frequency modulated oscillator for electric crackle
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      // Sweep from 900Hz down to 80Hz with rapid frequency drops
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (_) {}
  }

  // Shock / Alarm buzzer when Pac-Man touches a barrier and spawns a ghost
  function playAlarmSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';

      // Two-tone warning pulse
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(220, now + 0.1);
      osc.frequency.setValueAtTime(320, now + 0.2);
      osc.frequency.setValueAtTime(180, now + 0.3);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (_) {}
  }

  // Victory fanfare when all ghosts are eliminated
  function playVictoryFanfare() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C E G C E G

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.25, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.38);
      });
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 2.  ELECTRIC HAZARD BARRIERS CONFIGURATION
  // ─────────────────────────────────────────────
  // Strategically distributed across the 4 quadrants and central corridors.
  // All coordinates are open, walkable corridor tiles.
  const DEFAULT_BARRIER_LOCATIONS = [
    { col: 3,  row: 4,  name: 'Northwest Pylon' },
    { col: 23, row: 4,  name: 'Northeast Pylon' },
    { col: 5,  row: 10, name: 'West Gate' },
    { col: 21, row: 10, name: 'East Gate' },
    { col: 13, row: 17, name: 'Center Prism' },
    { col: 5,  row: 20, name: 'Southwest Pylon' },
    { col: 21, row: 20, name: 'Southeast Pylon' },
  ];

  let barriers = [];
  let particles = [];
  let playerShockCooldown = 0;
  let trapKills = 0;
  let allPelletsBonusAwarded = false;
  let frameCount = 0;

  // Colors for dynamically spawned reinforcement ghosts
  const REINFORCEMENT_GHOST_STYLES = [
    { type: 'blinky', color: '#ff0055', name: 'Alpha Red' },
    { type: 'pinky',  color: '#ff00d4', name: 'Phantom Pink' },
    { type: 'inky',   color: '#00e5ff', name: 'Volt Cyan' },
    { type: 'clyde',  color: '#ff9900', name: 'Solar Clyde' },
    { type: 'blinky', color: '#a855f7', name: 'Nether Violet' },
    { type: 'pinky',  color: '#00ff88', name: 'Toxic Green' },
  ];
  let spawnStyleIdx = 0;

  function reset() {
    barriers = DEFAULT_BARRIER_LOCATIONS.map(b => ({
      col: b.col,
      row: b.row,
      name: b.name,
      pulse: Math.random() * Math.PI * 2,
      lastShockFrame: 0,
      killsCount: 0
    }));
    particles = [];
    playerShockCooldown = 0;
    trapKills = 0;
    allPelletsBonusAwarded = false;
    spawnStyleIdx = 0;
  }

  // ─────────────────────────────────────────────
  // 3.  EXPLOSION & ELECTRIC SPARK PARTICLES
  // ─────────────────────────────────────────────
  function spawnZapParticles(col, row, color = '#00f7ff') {
    const cx = col * Engine.TILE + Engine.TILE / 2;
    const cy = row * Engine.TILE + Engine.TILE / 2;
    const count = 22;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 1.2 + Math.random() * 3.5;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.floor(Math.random() * 15),
        maxLife: 40,
        size: 1.8 + Math.random() * 2.2,
        color: i % 2 === 0 ? color : '#ffe600'
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life--;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // ─────────────────────────────────────────────
  // 4.  REINFORCEMENT GHOST SPAWNER
  // ─────────────────────────────────────────────
  function spawnReinforcementGhost(ghosts) {
    const style = REINFORCEMENT_GHOST_STYLES[spawnStyleIdx % REINFORCEMENT_GHOST_STYLES.length];
    spawnStyleIdx++;

    // Spawns from the ghost house citadel entrance
    const spawnCol = Engine.GHOST_HOUSE_COL;
    const spawnRow = Engine.GHOST_HOUSE_ROW - 2;

    const g = new Engine.Ghost(spawnCol, spawnRow, style.type, style.color);
    g.userSpawned = true;
    // Make reinforcement ghost swift and aggressive
    g.moveRate = Math.max(10, 13 - Math.min(4, Math.floor(ghosts.length / 2)));
    ghosts.push(g);
    return { ghost: g, style };
  }

  // ─────────────────────────────────────────────
  // 5.  UPDATE LOOP & COLLISION CHECKS
  // ─────────────────────────────────────────────
  function update(humanPlayer, ghosts, context) {
    const { addFloatingText, log, onVictory } = context;
    frameCount++;

    if (playerShockCooldown > 0) {
      playerShockCooldown--;
    }

    updateParticles();

    // ─────────────────────────────────────────────────────────
    // CHECK A: GHOSTS COLLIDING WITH ELECTRIC BARRIERS (VAPORIZE!)
    // ─────────────────────────────────────────────────────────
    for (let gi = ghosts.length - 1; gi >= 0; gi--) {
      const g = ghosts[gi];
      for (const b of barriers) {
        if (g.col === b.col && g.row === b.row) {
          // Vaporize ghost!
          b.killsCount++;
          trapKills++;
          b.lastShockFrame = frameCount;

          spawnZapParticles(b.col, b.row, '#00f7ff');
          playZapSound();

          // Award score
          humanPlayer.score = Math.min(100.0, humanPlayer.score + 20.0);
          humanPlayer.ghostsEatenCount++;

          const ghostTypeName = (g.type || 'ghost').toUpperCase();
          addFloatingText('⚡ VAPORIZED! +20', b.col * Engine.TILE + Engine.TILE / 2, b.row * Engine.TILE - 4, '#00f7ff');
          log(`⚡ GHOST ELIMINATED! ${ghostTypeName} lured into ${b.name} (${b.col},${b.row}) and VAPORIZED! Ghosts left: ${ghosts.length - 1}`, 'log-champion');

          // Remove the dead ghost
          ghosts.splice(gi, 1);

          // Check if all ghosts have been destroyed (THE WIN CONDITION!)
          if (ghosts.length === 0) {
            playVictoryFanfare();
            humanPlayer.score = 100.0;
            if (typeof onVictory === 'function') {
              onVictory();
            }
          }
          break; // Move to next ghost
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // CHECK B: PAC-MAN (PLAYER) TOUCHING BARRIER (PENALTY: +1 GHOST)
    // ─────────────────────────────────────────────────────────
    if (!humanPlayer.isDying) {
      for (const b of barriers) {
        if (humanPlayer.col === b.col && humanPlayer.row === b.row) {
          if (playerShockCooldown <= 0) {
            // Player hit barrier! Cooldown = 70 frames (~1.1s) to prevent instant ghost spam
            playerShockCooldown = 70;
            b.lastShockFrame = frameCount;

            spawnZapParticles(b.col, b.row, '#ff0055');
            playAlarmSound();

            const { ghost: newGhost, style } = spawnReinforcementGhost(ghosts);

            addFloatingText('⚠️ SHOCKED! +1 GHOST 👻', humanPlayer.col * Engine.TILE + Engine.TILE / 2, humanPlayer.row * Engine.TILE - 6, '#ff0055');
            log(`⚠️ BARRIER TRIGGERED! Pac-Man touched ${b.name} (${b.col},${b.row})! Reinforcement ${style.name} deployed from Ghost House! Total ghosts: ${ghosts.length}`, 'log-death');
          }
          break;
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // CHECK C: PELLET CLEARANCE CELEBRATION (GAME CONTINUES UNTIL GHOSTS ARE DEAD)
    // ─────────────────────────────────────────────────────────
    if (!allPelletsBonusAwarded && humanPlayer.pelletsCount >= Engine.TOTAL_PELLETS) {
      allPelletsBonusAwarded = true;
      addFloatingText('ALL PELLETS EATEN! 🌟 NOW ELIMINATE ALL GHOSTS!', Engine.MAP_W / 2, Engine.MAP_H / 2, '#ffe600');
      log('🌟 ALL PELLETS CONSUMED! Perfect maze sweep. Now lure the remaining ghosts into barriers to WIN!', 'log-champion');
    }
  }

  // ─────────────────────────────────────────────
  // 6.  RENDER ELECTRIC HAZARD BARRIERS & FX
  // ─────────────────────────────────────────────
  function render(ctx) {
    const tile = Engine.TILE;
    const time = frameCount * 0.08;

    for (const b of barriers) {
      const x = b.col * tile;
      const y = b.row * tile;
      const isRecentlyShocked = (frameCount - b.lastShockFrame) < 15;

      // 1. Glowing Background Plate
      ctx.save();
      const glow = Math.sin(time + b.pulse) * 0.25 + 0.75;
      ctx.fillStyle = isRecentlyShocked ? 'rgba(255, 0, 85, 0.45)' : `rgba(0, 247, 255, ${0.18 * glow})`;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);

      // 2. High-Tech Corner Brackets / Posts
      const postColor = isRecentlyShocked ? '#ff0055' : '#00f7ff';
      ctx.strokeStyle = postColor;
      ctx.lineWidth = 1.6;

      // Border frame
      ctx.strokeRect(x + 1.5, y + 1.5, tile - 3, tile - 3);

      // 3. Dynamic Animated Lightning / Plasma Arc across barrier
      ctx.beginPath();
      ctx.strokeStyle = isRecentlyShocked ? '#ffffff' : (Math.random() < 0.5 ? '#ffe600' : '#00f7ff');
      ctx.lineWidth = isRecentlyShocked ? 2.2 : 1.4;

      const midY = y + tile / 2;
      const midX = x + tile / 2;

      ctx.moveTo(x + 2, midY + (Math.sin(time * 3) * 3));
      ctx.lineTo(x + 6, midY - (Math.cos(time * 4) * 4));
      ctx.lineTo(midX, midY + (Math.sin(time * 5) * 5));
      ctx.lineTo(x + tile - 6, midY - (Math.cos(time * 3) * 4));
      ctx.lineTo(x + tile - 2, midY + (Math.sin(time * 4) * 3));
      ctx.stroke();

      // 4. Central Energy Spark Core (Zap symbol ⚡)
      ctx.fillStyle = isRecentlyShocked ? '#ffffff' : (Math.random() < 0.2 ? '#ffe600' : '#00f7ff');
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', midX, midY);

      // 5. Electric discharge sparks radiating around the post
      if (Math.random() < 0.35 || isRecentlyShocked) {
        ctx.fillStyle = '#ffffff';
        const sx = x + 2 + Math.random() * (tile - 4);
        const sy = y + 2 + Math.random() * (tile - 4);
        ctx.fillRect(sx, sy, 1.8, 1.8);
      }

      ctx.restore();
    }

    // ─────────────────────────────────────────
    // Render Explosion & Shock Particles
    // ─────────────────────────────────────────
    for (const p of particles) {
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
  // PUBLIC API
  // ─────────────────────────────────────────────
  return {
    init: reset,
    reset,
    update,
    render,
    getBarriers: () => barriers,
    getTrapKills: () => trapKills,
    spawnReinforcementGhost,
    playZapSound,
    playAlarmSound,
    playVictoryFanfare,
  };
})();

// Attach to global window
if (typeof window !== 'undefined') {
  window.ArcadeMode = ArcadeMode;
}
