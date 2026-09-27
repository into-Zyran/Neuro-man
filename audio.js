/* ===================================================================
   audio.js — Native Web Audio Procedural Synthesizer Engine
   Pac-Man Chiptune Theme, Waka-Waka Pellets, Teleport & UI Sounds
   =================================================================== */
'use strict';

const SoundSystem = (() => {
  let ctx = null;
  let isMusicEnabled = true;
  let isSoundEnabled = true;
  let masterVolume = 0.6;

  let themeOscillators = [];
  let isThemePlaying = false;
  let themeTimeoutId = null;

  function getAudioContext() {
    if (!ctx && (typeof window !== 'undefined')) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // Master Gain node
  function createGain(vol = 1.0) {
    const audioCtx = getAudioContext();
    if (!audioCtx) return null;
    const gain = audioCtx.createGain();
    gain.gain.value = vol * masterVolume;
    gain.connect(audioCtx.destination);
    return gain;
  }

  // ─────────────────────────────────────────────
  // 1.  RETRO CYBER-ARCADE MENU THEME (Original Chiptune)
  // ─────────────────────────────────────────────
  // Upbeat, bouncy 8-bit arcade arpeggio theme (loops on menu screen only)
  const ARCADE_MENU_THEME = [
    // Measure 1: A minor upbeat arpeggio
    { f: 440.00, d: 120, type: 'square',   v: 0.15 }, // A4
    { f: 523.25, d: 120, type: 'square',   v: 0.15 }, // C5
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 880.00, d: 240, type: 'square',   v: 0.19 }, // A5
    { f: 783.99, d: 120, type: 'square',   v: 0.17 }, // G5
    { f: 659.25, d: 120, type: 'square',   v: 0.15 }, // E5
    { f: 523.25, d: 240, type: 'square',   v: 0.16 }, // C5

    // Measure 2: F major driving bounce
    { f: 349.23, d: 120, type: 'triangle', v: 0.22 }, // F4
    { f: 523.25, d: 120, type: 'square',   v: 0.15 }, // C5
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 698.46, d: 240, type: 'square',   v: 0.19 }, // F5
    { f: 659.25, d: 120, type: 'square',   v: 0.15 }, // E5
    { f: 523.25, d: 120, type: 'square',   v: 0.15 }, // C5
    { f: 587.33, d: 240, type: 'square',   v: 0.17 }, // D5

    // Measure 3: G major rising energy
    { f: 392.00, d: 120, type: 'triangle', v: 0.22 }, // G4
    { f: 587.33, d: 120, type: 'square',   v: 0.15 }, // D5
    { f: 783.99, d: 120, type: 'square',   v: 0.17 }, // G5
    { f: 987.77, d: 240, type: 'square',   v: 0.19 }, // B5
    { f: 880.00, d: 120, type: 'square',   v: 0.17 }, // A5
    { f: 783.99, d: 120, type: 'square',   v: 0.15 }, // G5
    { f: 659.25, d: 240, type: 'square',   v: 0.17 }, // E5

    // Measure 4: E minor turn-around
    { f: 329.63, d: 120, type: 'triangle', v: 0.22 }, // E4
    { f: 493.88, d: 120, type: 'square',   v: 0.15 }, // B4
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 739.99, d: 120, type: 'square',   v: 0.17 }, // F#5
    { f: 783.99, d: 120, type: 'square',   v: 0.19 }, // G5
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 493.88, d: 240, type: 'square',   v: 0.17 }, // B4

    // Measure 5: High peak flourish
    { f: 440.00, d: 120, type: 'square',   v: 0.15 }, // A4
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 880.00, d: 120, type: 'square',   v: 0.19 }, // A5
    { f: 1046.50,d: 240, type: 'square',   v: 0.21 }, // C6
    { f: 987.77, d: 120, type: 'square',   v: 0.19 }, // B5
    { f: 880.00, d: 120, type: 'square',   v: 0.17 }, // A5
    { f: 783.99, d: 240, type: 'square',   v: 0.17 }, // G5

    // Measure 6: Cadence resolution
    { f: 698.46, d: 120, type: 'square',   v: 0.17 }, // F5
    { f: 659.25, d: 120, type: 'square',   v: 0.17 }, // E5
    { f: 587.33, d: 120, type: 'square',   v: 0.17 }, // D5
    { f: 523.25, d: 120, type: 'square',   v: 0.15 }, // C5
    { f: 493.88, d: 120, type: 'square',   v: 0.15 }, // B4
    { f: 523.25, d: 120, type: 'square',   v: 0.15 }, // C5
    { f: 440.00, d: 360, type: 'square',   v: 0.19 }, // A4
  ];

  function scheduleMelodyLoop() {
    if (!isMusicEnabled || !isThemePlaying) return;

    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    let noteTime = audioCtx.currentTime + 0.05;

    ARCADE_MENU_THEME.forEach(note => {
      const durSec = note.d / 1000;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = note.type || 'square';
      osc.frequency.setValueAtTime(note.f, noteTime);

      const noteVol = (note.v || 0.16) * masterVolume;
      gain.gain.setValueAtTime(noteVol, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + durSec * 0.92);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + durSec);

      themeOscillators.push(osc);
      noteTime += durSec;
    });

    const totalDurationMs = ARCADE_MENU_THEME.reduce((sum, n) => sum + n.d, 0) + 160;
    themeTimeoutId = setTimeout(() => {
      if (isThemePlaying && isMusicEnabled) {
        themeOscillators = [];
        scheduleMelodyLoop();
      }
    }, totalDurationMs);
  }

  function playMenuMusic() {
    if (!isMusicEnabled) return;
    if (isThemePlaying) return; // already looping

    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    isThemePlaying = true;
    scheduleMelodyLoop();
  }

  function stopMenuMusic() {
    isThemePlaying = false;
    if (themeTimeoutId) {
      clearTimeout(themeTimeoutId);
      themeTimeoutId = null;
    }
    themeOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (_) {}
    });
    themeOscillators = [];
  }

  // ─────────────────────────────────────────────
  // 2.  WAKA-WAKA PELLET EATING SOUND
  // ─────────────────────────────────────────────
  let wakaStep = 0;
  function playWaka(combo = 0) {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';

      // Alternate between low and high chew frequency with subtle pitch boost on combo streaks
      const pitchMod = Math.min(1.5, 1 + Math.max(0, combo - 1) * 0.018);
      const baseFreq = wakaStep % 2 === 0 ? 460 : 310;
      const freq = baseFreq * pitchMod;
      wakaStep++;

      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.75, now + 0.045);

      const vol = 0.16 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 3.  UI BUTTON CLICK & HOVER SOUNDS
  // ─────────────────────────────────────────────
  function playMenuClick() {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);

      const vol = 0.2 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (_) {}
  }

  function playMenuHover() {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(640, now + 0.02);

      const vol = 0.08 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 4.  DEATH SOUND (Retro Pacman downward slide)
  // ─────────────────────────────────────────────
  function playDeathSound() {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';

      // Downward warble
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.65);

      const vol = 0.28 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.72);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // 5.  WARP TELEPORT SOUND & ALARM
  // ─────────────────────────────────────────────
  function playWarp() {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.28);

      const vol = 0.25 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (_) {}
  }

  function playAlarm() {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.1);

      const vol = 0.22 * masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }

  return {
    getAudioContext,
    playMenuMusic,
    stopMenuMusic,
    playPacmanTheme: playMenuMusic,
    stopPacmanTheme: stopMenuMusic,
    playWaka,
    playMenuClick,
    playUiClick: playMenuClick,
    playMenuHover,
    playDeathSound,
    playWarp,
    playAlarm,
    setMusicEnabled: (v) => {
      isMusicEnabled = !!v;
      if (!isMusicEnabled) stopMenuMusic();
    },
    getMusicEnabled: () => isMusicEnabled,
    setSoundEnabled: (v) => { isSoundEnabled = !!v; },
    setSfxEnabled: (v) => { isSoundEnabled = !!v; },
    getSoundEnabled: () => isSoundEnabled,
    getSfxEnabled: () => isSoundEnabled,
    setMasterVolume: (v) => { masterVolume = Math.max(0, Math.min(1, v)); },
    getMasterVolume: () => masterVolume,
  };
})();

if (typeof window !== 'undefined') {
  window.SoundSystem = SoundSystem;
}
