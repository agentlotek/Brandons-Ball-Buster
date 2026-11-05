(() => {
  'use strict';

  /* ============================================================
     Tyler's Ball Buster
     A candy-coated falling-ball puzzle. Four berries per piece.
     ============================================================ */

  const COLS = 10;
  const ROWS = 20;
  const LOCK_DELAY = 420;        // ms a piece rests before locking
  const MAX_LOCK_RESETS = 15;
  const CLEAR_ANIM = 340;        // ms of line-clear celebration
  const BEST_KEY = 'tylersBallBuster.best';
  const SCORES_KEY = 'tylersBallBuster.topScores';
  const MAX_TOP_SCORES = 10;
  const SOUND_KEY = 'tylersBallBuster.sound';
  const MUSIC_KEY = 'tylersBallBuster.music';
  const SFX_VOLUME_KEY = 'tylersBallBuster.sfxVolume';
  const MUSIC_VOLUME_KEY = 'tylersBallBuster.musicVolume';

  const DEFAULT_SFX_VOLUME = 0.8;
  const DEFAULT_MUSIC_VOLUME = 0.9;
  const SFX_BOOST = 3; // lift effects up to the music's level

  const COLORS = [
    { base: '#ff3d4f', light: '#ffa8ae', dark: '#9c0d1a' }, // cherry
    { base: '#ff8a1e', light: '#ffc57e', dark: '#a34a00' }, // orange
    { base: '#ffd21f', light: '#fff09a', dark: '#8a6a00' }, // lemon
    { base: '#3fd45c', light: '#a8f3b7', dark: '#0c7327' }, // apple
    { base: '#2f9dff', light: '#a9d8ff', dark: '#07539f' }, // blue raspberry
    { base: '#a45cff', light: '#dcc0ff', dark: '#541799' }, // grape
    { base: '#ff5cc8', light: '#ffb9e9', dark: '#9c1269' }, // bubblegum
  ];

  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  // Simple wall-kick attempts, ordered from least to most intrusive.
  const KICKS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [-2, 0],
    [2, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
  ];

  /* ============================================================
     Glossy Sixlet sprites
     ============================================================ */

  const SPRITE_SIZE = 128;
  const SPRITE_RADIUS = 58;
  const BALL_DRAW_SCALE = SPRITE_SIZE / (SPRITE_RADIUS * 2);

  function makeBallSprite(color, variant) {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const ctx = canvas.getContext('2d');

    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    const r = SPRITE_RADIUS;
    const hx = cx + (variant ? -r * 0.29 : -r * 0.38);
    const hy = cy - r * 0.36;

    // Body: lit from the upper left, dark candy-coating rim.
    const body = ctx.createRadialGradient(hx, hy, r * 0.06, cx, cy, r * 1.05);
    body.addColorStop(0, color.light);
    body.addColorStop(0.3, color.base);
    body.addColorStop(0.72, color.base);
    body.addColorStop(1, color.dark);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Darken the rim for a rounder, shinier shell.
    const rim = ctx.createRadialGradient(cx, cy, r * 0.68, cx, cy, r);
    rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Main specular highlight.
    const shine = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.64);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    shine.addColorStop(0.26, 'rgba(255, 255, 255, 0.42)');
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(hx, hy, r * 0.43, r * 0.3, -0.55, 0, Math.PI * 2);
    ctx.fill();

    // Tiny secondary glint.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(hx + r * 0.31, hy + r * 0.19, r * 0.052, 0, Math.PI * 2);
    ctx.fill();

    // Soft bounce light along the bottom edge.
    const bounceX = cx + r * 0.16;
    const bounceY = cy + r * 0.58;
    const bounce = ctx.createRadialGradient(bounceX, bounceY, 0, bounceX, bounceY, r * 0.52);
    bounce.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    bounce.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = bounce;
    ctx.beginPath();
    ctx.arc(bounceX, bounceY, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  const SPRITES = COLORS.map((color) => [
    makeBallSprite(color, 0),
    makeBallSprite(color, 1),
  ]);

  function drawBall(ctx, cx, cy, radius, colorIndex, alpha = 1, variant = 0) {
    if (alpha <= 0.01 || radius <= 0.15) return;
    const sprite = SPRITES[colorIndex & 7] || SPRITES[0];
    const img = sprite[variant & 1];
    const size = radius * 2 * BALL_DRAW_SCALE;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     Small helpers
     ============================================================ */

  function hashNoise(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function makeBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function makePiece(type) {
    const matrix = SHAPES[type].map((row) =>
      row.map((cell) => (cell ? 1 + Math.floor(Math.random() * COLORS.length) : 0))
    );
    return { type, matrix, x: 0, y: 0, rot: 0 };
  }

  function rotateMatrix(matrix, dir) {
    const n = matrix.length;
    const out = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = matrix[y][x];
        if (!v) continue;
        if (dir > 0) out[x][n - 1 - y] = v;
        else out[n - 1 - x][y] = v;
      }
    }
    return out;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /* ============================================================
     DOM + canvases
     ============================================================ */

  const els = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lines: document.getElementById('lines'),
    best: document.getElementById('best'),
    board: document.getElementById('board'),
    hold: document.getElementById('hold'),
    next: document.getElementById('next'),
    boardArea: document.getElementById('boardArea'),
    game: document.querySelector('.game'),
    touch: document.getElementById('touchControls'),
    overlay: document.getElementById('overlay'),
    overlayKicker: document.getElementById('overlayKicker'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    overlayBtn: document.getElementById('overlayBtn'),
    overlayHint: document.getElementById('overlayHint'),
    pauseBtn: document.getElementById('pauseBtn'),
    soundBtn: document.getElementById('soundBtn'),
    musicBtn: document.getElementById('musicBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    sfxSlider: document.getElementById('sfxSlider'),
    musicSlider: document.getElementById('musicSlider'),
    sfxIcon: document.getElementById('sfxIcon'),
    musicIcon: document.getElementById('musicIcon'),
    quitBtn: document.getElementById('quitBtn'),
    quitToast: document.getElementById('quitToast'),
    topScores: document.getElementById('topScores'),
    topScoresBar: document.getElementById('topScoresBar'),
    scoresList: document.getElementById('scoresList'),
    viewScoresBtn: document.getElementById('viewScoresBtn'),
    viewScoresBtnMobile: document.getElementById('viewScoresBtnMobile'),
    helpBtn: document.getElementById('helpBtn'),
    helpBtnMobile: document.getElementById('helpBtnMobile'),
    helpModal: document.getElementById('helpModal'),
    helpClose: document.getElementById('helpClose'),
    scoresModal: document.getElementById('scoresModal'),
    scoresClose: document.getElementById('scoresClose'),
    initialsModal: document.getElementById('initialsModal'),
    initialsClose: document.getElementById('initialsClose'),
    initialsKicker: document.getElementById('initialsKicker'),
    initialsTitle: document.getElementById('initialsTitle'),
    initialsScore: document.getElementById('initialsScore'),
    initialsForm: document.getElementById('initialsForm'),
    initialsInput: document.getElementById('initialsInput'),
    initialsSkip: document.getElementById('initialsSkip'),
  };

  function createCanvasView(canvas, onResize) {
    const view = {
      canvas,
      ctx: canvas.getContext('2d'),
      w: 0,
      h: 0,
      dpr: 1,
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      view.w = rect.width;
      view.h = rect.height;
      view.dpr = dpr;
      if (onResize) onResize();
    };
    resize();
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }
    return view;
  }

  let boardView;
  let holdView;
  let nextView;

  boardView = createCanvasView(els.board);
  holdView = createCanvasView(els.hold, () => drawPreviews());
  nextView = createCanvasView(els.next, () => drawPreviews());

  /* ============================================================
     Game state
     ============================================================ */

  const state = {
    status: 'ready', // ready | playing | clearing | paused | gameover
    prevStatus: 'playing',
    board: makeBoard(),
    piece: null,
    queue: [],
    bag: [],
    hold: null,
    canHold: true,
    score: 0,
    level: 1,
    lines: 0,
    combo: 0,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    clearRows: [],
    clearTimer: 0,
    particles: [],
    floaters: [],
    shake: 0,
  };

  const input = {
    left: false,
    right: false,
    down: false,
    dir: 0,
    hTimer: 0,
    softTimer: 0,
  };

  const GESTURE = {
    TAP_MOVE: 9, // movement under this many px counts as a tap
    TAP_TIME: 500, // ms
    SWIPE_X: 10,
    SWIPE_Y: 12,
    FAST_DOWN: 0.9, // px per ms — faster than this is a slam
    SLAM_DISTANCE: 26,
  };

  let gesture = null;

  let best = 0;
  try {
    best = Math.max(0, parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  } catch (err) {
    best = 0;
  }

  let topScores = loadTopScores();
  let newScoreId = null;

  let soundOn = true;
  let musicOn = true;
  let sfxVolume = DEFAULT_SFX_VOLUME;
  let musicVolume = DEFAULT_MUSIC_VOLUME;
  let lastSfxVolume = DEFAULT_SFX_VOLUME;
  let lastMusicVolume = DEFAULT_MUSIC_VOLUME;

  function readVolume(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const value = parseFloat(raw);
      return Number.isFinite(value) ? clamp(value, 0, 1) : null;
    } catch (err) {
      return null;
    }
  }

  try {
    const savedSfx = readVolume(SFX_VOLUME_KEY);
    const savedMusic = readVolume(MUSIC_VOLUME_KEY);
    // Fall back to the old on/off flags when no volume was saved yet.
    sfxVolume = savedSfx !== null ? savedSfx : localStorage.getItem(SOUND_KEY) === '0' ? 0 : DEFAULT_SFX_VOLUME;
    musicVolume =
      savedMusic !== null ? savedMusic : localStorage.getItem(MUSIC_KEY) === '0' ? 0 : DEFAULT_MUSIC_VOLUME;
  } catch (err) {
    sfxVolume = DEFAULT_SFX_VOLUME;
    musicVolume = DEFAULT_MUSIC_VOLUME;
  }

  soundOn = sfxVolume > 0;
  musicOn = musicVolume > 0;
  lastSfxVolume = soundOn ? sfxVolume : DEFAULT_SFX_VOLUME;
  lastMusicVolume = musicOn ? musicVolume : DEFAULT_MUSIC_VOLUME;

  /* ============================================================
     Audio
     ============================================================ */

  let audioCtx = null;
  let sfxBus = null;

  function applySfxGain() {
    if (!sfxBus || !audioCtx) return;
    const target = soundOn ? sfxVolume * SFX_BOOST : 0;
    sfxBus.gain.setTargetAtTime(target, audioCtx.currentTime, 0.015);
  }

  function ensureAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (!sfxBus) {
        sfxBus = audioCtx.createGain();
        sfxBus.gain.value = soundOn ? sfxVolume * SFX_BOOST : 0;
        sfxBus.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (err) {
      return null;
    }
  }

  function getAudio() {
    if (!soundOn) return null;
    return ensureAudio();
  }

  function beep(freq, dur, opts = {}) {
    if (!soundOn) return;
    const ctx = getAudio();
    if (!ctx) return;
    const { type = 'sine', vol = 0.05, when = 0, slideTo = null } = opts;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(24, freq), t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(sfxBus || ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
    } catch (err) {
      /* audio is a bonus, never a blocker */
    }
  }

  /* ============================================================
     Background music — an original synth-disco loop
     ============================================================ */

  const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  const music = (() => {
    const BPM = 122;
    const STEP = 60 / BPM / 4; // one 16th note
    const LOOKAHEAD = 0.12;
    const BAR_COUNT = 8;
    const STEP_COUNT = BAR_COUNT * 16;
    const VOLUME = 0.62;

    // D minor: Dm | Bb | C | Dm | Gm | Bb | C | A
    const PROGRESSION = [
      { chord: [62, 65, 69, 74], pad: [62, 65, 69], bass: 50 },
      { chord: [58, 62, 65, 70], pad: [58, 62, 65], bass: 46 },
      { chord: [60, 64, 67, 72], pad: [60, 64, 67], bass: 48 },
      { chord: [62, 65, 69, 74], pad: [62, 65, 69], bass: 50 },
      { chord: [55, 58, 62, 67], pad: [55, 58, 62], bass: 43 },
      { chord: [58, 62, 65, 70], pad: [58, 62, 65], bass: 46 },
      { chord: [60, 64, 67, 72], pad: [60, 64, 67], bass: 48 },
      { chord: [57, 61, 64, 69], pad: [57, 61, 64], bass: 45 },
    ];

    // Bouncy staccato ostinato — indices into the chord, -1 is a rest.
    const ARP_A = [0, 1, 2, -1, 3, 2, 1, 2, 0, 1, 2, -1, 3, 2, 3, 1];
    const ARP_B = [0, 2, 1, 3, -1, 2, 1, 3, 0, 2, 1, 3, 2, -1, 3, 2];

    // Disco octave bass, one entry per 8th note.
    const BASS = [0, 0, 12, 0, 7, 12, 0, 10];

    let ctx = null;
    let master = null;
    let drums = null;
    let arpBus = null;
    let bassBus = null;
    let padBus = null;
    let stabBus = null;
    let noiseBuf = null;
    let timer = null;
    let step = 0;
    let nextTime = 0;
    let running = false;
    let level = 1;

    function buildGraph() {
      const c = ensureAudio();
      if (!c) return false;
      if (master) return true;
      ctx = c;

      master = ctx.createGain();
      master.gain.value = 0.0001;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      master.connect(comp).connect(ctx.destination);

      drums = ctx.createGain();
      drums.gain.value = 0.9;
      drums.connect(master);

      arpBus = ctx.createGain();
      arpBus.gain.value = 0.8;
      arpBus.connect(master);

      bassBus = ctx.createGain();
      bassBus.gain.value = 1;
      bassBus.connect(master);

      padBus = ctx.createGain();
      padBus.gain.value = 0.9;
      padBus.connect(master);

      stabBus = ctx.createGain();
      stabBus.gain.value = 0.75;
      stabBus.connect(master);

      // Dotted-eighth echo on the synth lead.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = STEP * 3;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      arpBus.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(master);

      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      return true;
    }

    function noiseHit(when, opts) {
      const { dur = 0.08, type = 'highpass', freq = 8000, q = 0.7, vol = 0.04 } = opts;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(vol, when + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(filter).connect(gain).connect(drums);
      src.start(when);
      src.stop(when + dur + 0.05);
    }

    function kick(when) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, when);
      osc.frequency.exponentialRampToValueAtTime(44, when + 0.13);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.42, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      osc.connect(gain).connect(drums);
      osc.start(when);
      osc.stop(when + 0.3);
    }

    function snare(when, velocity = 1) {
      noiseHit(when, {
        dur: 0.16,
        type: 'bandpass',
        freq: 1900,
        q: 0.9,
        vol: 0.11 * velocity,
      });
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, when);
      osc.frequency.exponentialRampToValueAtTime(150, when + 0.09);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.05 * velocity, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
      osc.connect(gain).connect(drums);
      osc.start(when);
      osc.stop(when + 0.15);
    }

    function clap(when) {
      [0, 0.012, 0.026].forEach((offset, i) => {
        noiseHit(when + offset, {
          dur: 0.05,
          type: 'bandpass',
          freq: 1400,
          q: 1.3,
          vol: 0.05 - i * 0.008,
        });
      });
    }

    function hat(when, vol = 0.032, open = false) {
      noiseHit(when, {
        dur: open ? 0.14 : 0.04,
        type: 'highpass',
        freq: open ? 6400 : 8200,
        q: 0.7,
        vol,
      });
    }

    function arp(midi, when, accent) {
      const freq = midiToFreq(midi);
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = 'square';
      b.type = 'sawtooth';
      b.detune.value = 7;
      a.frequency.value = freq;
      b.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(3600, when);
      filter.frequency.exponentialRampToValueAtTime(1200, when + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(accent ? 0.055 : 0.038, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain).connect(arpBus);
      a.start(when);
      b.start(when);
      a.stop(when + 0.18);
      b.stop(when + 0.18);
    }

    function bass(midi, when, accent) {
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      osc.type = 'sawtooth';
      sub.type = 'sine';
      osc.frequency.value = freq;
      sub.frequency.value = freq / 2;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 5;
      filter.frequency.setValueAtTime(accent ? 900 : 650, when);
      filter.frequency.exponentialRampToValueAtTime(260, when + 0.14);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(accent ? 0.1 : 0.075, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(bassBus);
      osc.start(when);
      sub.start(when);
      osc.stop(when + 0.24);
      sub.stop(when + 0.24);
    }

    function pad(midis, when, dur) {
      midis.forEach((midi, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(midi);
        osc.detune.value = i % 2 ? 6 : -6;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1600;
        filter.Q.value = 0.6;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(0.014, when + 0.2);
        gain.gain.setValueAtTime(0.014, when + dur - 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(filter).connect(gain).connect(padBus);
        osc.start(when);
        osc.stop(when + dur + 0.05);
      });
    }

    function stab(midis, when) {
      midis.forEach((midi) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(midi + 12);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(0.018, when + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
        osc.connect(gain).connect(stabBus);
        osc.start(when);
        osc.stop(when + 0.12);
      });
    }

    function scheduleStep(i, when) {
      const bar = Math.floor(i / 16);
      const s = i % 16;
      const prog = PROGRESSION[bar];
      const pattern = bar < 4 ? ARP_A : ARP_B;
      const accent = s % 4 === 0;

      if (s % 4 === 0) kick(when);
      if (s === 4 || s === 12) snare(when);
      if (s === 12) clap(when);
      if (s % 2 === 0) hat(when, s % 4 === 2 ? 0.05 : 0.032);
      if (s === 14 && bar % 2 === 1) hat(when, 0.036, true);

      // Little snare pickup into the loop point.
      if (bar === BAR_COUNT - 1 && s >= 13) snare(when, 0.35 + (s - 13) * 0.22);

      const arpIndex = pattern[s];
      if (arpIndex >= 0) arp(prog.chord[arpIndex], when, accent);

      if (s % 2 === 0) bass(prog.bass + BASS[s / 2], when, accent);

      if (s === 0) pad(prog.pad, when, STEP * 16 * 0.98);

      if (s === 2 || s === 6 || s === 10 || s === 14) stab(prog.pad, when);
    }

    function schedule() {
      if (!ctx) return;
      if (nextTime < ctx.currentTime - 0.25) nextTime = ctx.currentTime + 0.05;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        step = (step + 1) % STEP_COUNT;
        nextTime += STEP;
      }
    }

    function start() {
      if (!musicOn) return;
      if (!buildGraph()) return;

      if (!running) {
        running = true;
        step = 0;
        nextTime = ctx.currentTime + 0.08;
      }
      if (ctx.state === 'suspended') ctx.resume();

      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, VOLUME * level), ctx.currentTime + 0.9);

      if (!timer) {
        timer = setInterval(schedule, 25);
        schedule();
      }
    }

    function setVolume(value) {
      level = clamp(value, 0, 1);
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(Math.max(0.0001, VOLUME * level), ctx.currentTime + 0.12);
      }
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      running = false;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      }
    }

    return {
      start,
      stop,
      setVolume,
      get running() {
        return running;
      },
    };
  })();

  const sfx = {
    move() {      beep(300, 0.05, { type: 'triangle', vol: 0.02, slideTo: 340 });
    },
    rotate() {
      beep(420, 0.07, { type: 'triangle', vol: 0.027, slideTo: 530 });
    },
    lock() {
      beep(150, 0.09, { type: 'sine', vol: 0.05, slideTo: 108 });
    },
    slam() {
      beep(210, 0.11, { type: 'square', vol: 0.028, slideTo: 65 });
    },
    hold() {
      beep(520, 0.06, { type: 'triangle', vol: 0.028, slideTo: 660 });
      beep(780, 0.06, { type: 'triangle', vol: 0.018, when: 0.065 });
    },
    clear(n) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const count = clamp(n + 1, 2, 4);
      for (let i = 0; i < count; i++) {
        beep(notes[Math.min(i, notes.length - 1)], 0.15, {
          type: 'triangle',
          vol: 0.042,
          when: i * 0.055,
        });
      }
    },
    level() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        beep(f, 0.13, { type: 'sine', vol: 0.032, when: i * 0.075 })
      );
    },
    start() {
      [392, 523.25, 659.25].forEach((f, i) =>
        beep(f, 0.13, { type: 'triangle', vol: 0.038, when: i * 0.085 })
      );
    },
    over() {
      [392, 329.63, 261.63, 196].forEach((f, i) =>
        beep(f, 0.26, { type: 'triangle', vol: 0.045, when: i * 0.16 })
      );
    },
  };

  function applySlider(slider, volume, label) {
    const percent = Math.round(volume * 100);
    if (!slider) return;
    slider.value = String(percent);
    slider.style.setProperty('--fill', `${percent}%`);
    slider.setAttribute('aria-valuetext', `${percent}%`);
    slider.title = `${label}: ${percent}%`;
  }

  function applySoundUI() {
    els.soundBtn.textContent = soundOn ? '🔊' : '🔇';
    els.soundBtn.setAttribute('aria-pressed', String(!soundOn));
    els.soundBtn.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Unmute sound');
    els.soundBtn.setAttribute('title', soundOn ? 'Mute (M)' : 'Unmute (M)');
    applySlider(els.sfxSlider, sfxVolume, 'Sound effects volume');
    if (els.sfxIcon) els.sfxIcon.classList.toggle('off', !soundOn);
  }

  function setSfxVolume(value, opts = {}) {
    const wasOn = soundOn;
    sfxVolume = clamp(value, 0, 1);
    soundOn = sfxVolume > 0;
    if (soundOn) lastSfxVolume = sfxVolume;
    try {
      localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume));
      localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0');
    } catch (err) {
      /* ignore */
    }
    applySfxGain();
    applySoundUI();
    if (opts.feedback && soundOn && !wasOn) {
      beep(720, 0.09, { type: 'triangle', vol: 0.03, slideTo: 900 });
    }
  }

  function toggleSound() {
    setSfxVolume(soundOn ? 0 : lastSfxVolume || DEFAULT_SFX_VOLUME, { feedback: true });
  }

  function applyMusicUI() {
    els.musicBtn.classList.toggle('off', !musicOn);
    els.musicBtn.setAttribute('aria-pressed', String(!musicOn));
    els.musicBtn.setAttribute('aria-label', musicOn ? 'Turn music off' : 'Turn music on');
    els.musicBtn.setAttribute('title', musicOn ? 'Music off (N)' : 'Music on (N)');
    applySlider(els.musicSlider, musicVolume, 'Music volume');
    if (els.musicIcon) els.musicIcon.classList.toggle('off', !musicOn);
  }

  function setMusicVolume(value, opts = {}) {
    musicVolume = clamp(value, 0, 1);
    musicOn = musicVolume > 0;
    if (musicOn) lastMusicVolume = musicVolume;
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume));
      localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0');
    } catch (err) {
      /* ignore */
    }
    applyMusicUI();
    if (musicOn) {
      music.setVolume(musicVolume);
      if (!music.running) music.start();
    } else {
      music.stop();
    }
    if (opts.feedback && soundOn) {
      beep(musicOn ? 880 : 520, 0.07, { type: 'triangle', vol: 0.02 });
    }
  }

  function toggleMusic() {
    setMusicVolume(musicOn ? 0 : lastMusicVolume || DEFAULT_MUSIC_VOLUME, { feedback: true });
  }

  /* ============================================================
     HUD / overlay
     ============================================================ */

  function updateHUD() {
    els.score.textContent = state.score.toLocaleString();
    els.level.textContent = String(state.level);
    els.lines.textContent = String(state.lines);
    els.best.textContent = Math.max(best, state.score).toLocaleString();
  }

  let overlayAction = null;

  function showOverlay(config) {
    els.overlayKicker.textContent = config.kicker || '';
    els.overlayTitle.textContent = config.title || '';
    els.overlayText.textContent = config.text || '';
    els.overlayBtn.textContent = config.btn || 'Continue';
    els.overlayHint.textContent = config.hint || '';
    overlayAction = config.action || null;
    els.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    els.overlay.classList.add('hidden');
    overlayAction = null;
    try {
      els.overlayBtn.blur();
    } catch (err) {
      /* ignore */
    }
  }

  /* ============================================================
     "Tyler's Top Ball Busters" — top 10 scores
     ============================================================ */

  function normalizeInitials(value) {
    const letters = String(value || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3);
    return letters || 'AAA';
  }

  function normalizeScoreEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const score = Math.floor(Number(raw.score));
    if (!Number.isFinite(score) || score <= 0) return null;
    const date = Number(raw.date);
    return {
      id: String(raw.id || `s-${date || 0}-${score}`),
      initials: normalizeInitials(raw.initials),
      score,
      lines: Math.max(0, Math.floor(Number(raw.lines) || 0)),
      date: Number.isFinite(date) ? date : 0,
    };
  }

  function sortScores(list) {
    return list.sort((a, b) => b.score - a.score || a.date - b.date);
  }

  function loadTopScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return sortScores(raw.map(normalizeScoreEntry).filter(Boolean)).slice(0, MAX_TOP_SCORES);
    } catch (err) {
      return [];
    }
  }

  function saveTopScores() {
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(topScores));
    } catch (err) {
      /* ignore */
    }
  }

  function scoreQualifiesForTop(score) {
    if (!Number.isFinite(score) || score <= 0) return false;
    if (topScores.length < MAX_TOP_SCORES) return true;
    return score > topScores[topScores.length - 1].score;
  }

  function addTopScore(initials, score, lines) {
    const entry = {
      id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      initials: normalizeInitials(initials),
      score: Math.max(0, Math.floor(Number(score) || 0)),
      lines: Math.max(0, Math.floor(Number(lines) || 0)),
      date: Date.now(),
    };
    topScores = sortScores(topScores.concat(entry)).slice(0, MAX_TOP_SCORES);
    newScoreId = topScores.some((item) => item.id === entry.id) ? entry.id : null;
    saveTopScores();
    renderTopScores();
    return entry;
  }

  function makeScoreRow(entry, rank) {
    const li = document.createElement('li');
    if (entry.id === newScoreId) li.classList.add('is-new');

    const rankEl = document.createElement('span');
    rankEl.className = 'score-rank';
    rankEl.textContent = String(rank);

    const nameEl = document.createElement('span');
    nameEl.className = 'score-name';
    nameEl.textContent = entry.initials;

    const pointsEl = document.createElement('span');
    pointsEl.className = 'score-points';
    pointsEl.textContent = entry.score.toLocaleString();

    li.append(rankEl, nameEl, pointsEl);
    return li;
  }

  function fillScoreList(listEl, entries, limit, emptyText) {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'score-empty';
      empty.textContent = emptyText;
      listEl.append(empty);
      return;
    }
    entries.slice(0, limit).forEach((entry, index) => {
      listEl.append(makeScoreRow(entry, index + 1));
    });
  }

  function renderTopScores() {
    fillScoreList(els.topScores, topScores, 3, 'No scores yet — be the first!');
    fillScoreList(els.topScoresBar, topScores, 3, 'No scores yet!');
    fillScoreList(els.scoresList, topScores, MAX_TOP_SCORES, 'No scores yet. Play a game to start the list.');
  }

  /* ============================================================
     Popup windows
     ============================================================ */

  let modalPauseStatus = null;
  let lastFocused = null;
  let initialsOpen = false;
  let pendingGameOver = null;

  function isModalOpen(modal) {
    return !!modal && !modal.classList.contains('hidden');
  }

  function anyModalOpen() {
    return isModalOpen(els.initialsModal) || isModalOpen(els.scoresModal) || isModalOpen(els.helpModal);
  }

  function openModal(modal) {
    if (!modal) return;
    if (!anyModalOpen()) {
      lastFocused = document.activeElement;
      if (state.status === 'playing' || state.status === 'clearing') {
        modalPauseStatus = state.status;
        state.status = 'paused';
        releaseInput();
      }
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (anyModalOpen()) return;

    document.body.classList.remove('modal-open');
    if (modalPauseStatus) {
      if (state.status === 'paused') state.status = modalPauseStatus;
      modalPauseStatus = null;
    }
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try {
        lastFocused.focus();
      } catch (err) {
        /* ignore */
      }
    }
    lastFocused = null;
  }

  function openHelpModal() {
    openModal(els.helpModal);
    setTimeout(() => {
      try {
        els.helpClose.focus();
      } catch (err) {
        /* ignore */
      }
    }, 30);
  }

  function openScoresModal() {
    renderTopScores();
    openModal(els.scoresModal);
    setTimeout(() => {
      try {
        els.scoresClose.focus();
      } catch (err) {
        /* ignore */
      }
    }, 30);
  }

  function openInitialsModal() {
    initialsOpen = true;
    els.initialsScore.textContent = state.score.toLocaleString();
    els.initialsKicker.textContent = "Tyler's Top Ball Busters";
    els.initialsTitle.textContent = pendingGameOver && pendingGameOver.newBest ? 'New high score!' : 'Top 10!';
    els.initialsInput.value = 'AAA';
    openModal(els.initialsModal);
    setTimeout(() => {
      try {
        els.initialsInput.focus();
        els.initialsInput.select();
      } catch (err) {
        /* ignore */
      }
    }, 30);
  }

  function finishInitials(save) {
    if (!initialsOpen) return;
    initialsOpen = false;
    if (save) addTopScore(els.initialsInput.value, state.score, state.lines);
    closeModal(els.initialsModal);

    const info = pendingGameOver || { newBest: false };
    pendingGameOver = null;
    showGameOverOverlay(info.newBest);
    try {
      els.overlayBtn.focus();
    } catch (err) {
      /* ignore */
    }
  }

  /* ============================================================
     Board layout (fits the playfield to the viewport)
     ============================================================ */

  let layoutRaf = 0;

  function layoutBoard() {
    if (!els.boardArea || !els.game) return;

    const mobile = window.matchMedia('(max-width: 820px)').matches;
    const touchStyle = window.getComputedStyle(els.touch);
    const touchVisible = touchStyle.display !== 'none';
    const touchRect = els.touch.getBoundingClientRect();
    const touchReserve = touchVisible ? touchRect.height + 30 : 64;

    const top = els.boardArea.getBoundingClientRect().top;
    const available = window.innerHeight - top - touchReserve;
    const maxByHeight = Math.max(150, available / 2);

    let maxByWidth = 340;
    if (mobile) {
      maxByWidth = Math.max(150, window.innerWidth - 36);
    } else {
      const gameW = els.game.getBoundingClientRect().width;
      maxByWidth = Math.max(150, gameW - 168 * 2 - 36);
    }

    const width = Math.floor(clamp(Math.min(maxByHeight, maxByWidth), 150, 340));
    els.boardArea.style.width = `${width}px`;
  }

  function scheduleLayout() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      layoutBoard();
    });
  }

  /* ============================================================
     Game flow
     ============================================================ */

  function fillQueue() {
    while (state.queue.length < 5) {
      if (!state.bag.length) {
        state.bag = SHAPE_KEYS.slice();
        for (let i = state.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.bag[i];
          state.bag[i] = state.bag[j];
          state.bag[j] = tmp;
        }
      }
      state.queue.push(makePiece(state.bag.pop()));
    }
  }

  function centerPiece(piece) {
    piece.x = Math.floor((COLS - piece.matrix[0].length) / 2);
    piece.y = 0;
    piece.rot = 0;
  }

  function spawnNext() {
    fillQueue();
    const piece = state.queue.shift();
    fillQueue();
    centerPiece(piece);
    state.piece = piece;
    state.gravityTimer = 0;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.canHold = true;
    drawPreviews();

    if (collides(piece.matrix, piece.x, piece.y)) {
      gameOver();
    }
  }

  function startGame() {
    state.board = makeBoard();
    state.piece = null;
    state.queue = [];
    state.bag = [];
    state.hold = null;
    state.canHold = true;
    state.score = 0;
    state.level = 1;
    state.lines = 0;
    state.combo = 0;
    state.gravityTimer = 0;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.clearRows = [];
    state.clearTimer = 0;
    state.particles = [];
    state.floaters = [];
    state.shake = 0;
    state.status = 'playing';
    state.prevStatus = 'playing';

    releaseInput();
    hideOverlay();
    updateHUD();
    sfx.start();
    music.start();

    fillQueue();
    spawnNext();
  }

  function showGameOverOverlay(newBest) {
    els.pauseBtn.textContent = '⏸';
    els.pauseBtn.setAttribute('aria-label', 'Pause game');
    showOverlay({
      kicker: newBest ? 'New sweet record!' : 'Game over',
      title: newBest ? 'Sweet!' : 'Busted!',
      text: `You scored ${state.score.toLocaleString()} points and busted ${state.lines} ${
        state.lines === 1 ? 'line' : 'lines'
      }.`,
      btn: 'Play Again',
      hint: 'Press Enter or Space to restart',
      action: startGame,
    });
  }

  function gameOver() {
    state.status = 'gameover';
    state.piece = null;
    state.clearRows = [];
    state.shake = Math.max(state.shake, 8);
    sfx.over();

    const newBest = state.score > best;
    if (newBest) {
      best = state.score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch (err) {
        /* ignore */
      }
    }

    updateHUD();
    els.pauseBtn.textContent = '⏸';
    els.pauseBtn.setAttribute('aria-label', 'Pause game');

    if (scoreQualifiesForTop(state.score)) {
      pendingGameOver = { newBest };
      openInitialsModal();
    } else {
      showGameOverOverlay(newBest);
    }
  }

  function pauseGame() {
    if (state.status !== 'playing' && state.status !== 'clearing') return;
    state.prevStatus = state.status;
    state.status = 'paused';
    releaseInput();
    els.pauseBtn.textContent = '▶';
    els.pauseBtn.setAttribute('aria-label', 'Resume game');
    showOverlay({
      kicker: 'Candy break',
      title: 'Paused',
      text: 'Take a breath. The berries will wait.',
      btn: 'Resume',
      hint: 'Press P or Esc to resume',
      action: resumeGame,
    });
  }

  function resumeGame() {
    if (state.status !== 'paused') return;
    state.status = state.prevStatus || 'playing';
    state.prevStatus = 'playing';
    hideOverlay();
    els.pauseBtn.textContent = '⏸';
    els.pauseBtn.setAttribute('aria-label', 'Pause game');
  }

  /* ============================================================
     Core mechanics
     ============================================================ */

  function collides(matrix, px, py) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && state.board[by][bx]) return true;
      }
    }
    return false;
  }

  function canFall() {
    const p = state.piece;
    return !!p && !collides(p.matrix, p.x, p.y + 1);
  }

  function gravityInterval() {
    return Math.max(70, 800 * Math.pow(0.86, state.level - 1));
  }

  function noteAction() {
    if (!state.piece) return;
    if (canFall()) {
      state.lockTimer = 0;
      state.lockResets = 0;
    } else if (state.lockResets < MAX_LOCK_RESETS) {
      state.lockTimer = 0;
      state.lockResets++;
    }
  }

  function tryMove(dx, dy) {
    const p = state.piece;
    if (!p) return false;
    if (collides(p.matrix, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    noteAction();
    return true;
  }

  function rotatePiece(dir) {
    const p = state.piece;
    if (!p) return;
    const rotated = rotateMatrix(p.matrix, dir);
    for (let i = 0; i < KICKS.length; i++) {
      const dx = KICKS[i][0];
      const dy = KICKS[i][1];
      if (!collides(rotated, p.x + dx, p.y + dy)) {
        p.matrix = rotated;
        p.x += dx;
        p.y += dy;
        noteAction();
        sfx.rotate();
        return;
      }
    }
  }

  function hardDrop() {
    const p = state.piece;
    if (!p || state.status !== 'playing') return;
    let dist = 0;
    while (!collides(p.matrix, p.x, p.y + 1)) {
      p.y++;
      dist++;
    }
    if (dist > 0) {
      addScore(dist * 2);
      state.shake = Math.max(state.shake, Math.min(7, 1.5 + dist * 0.32));
      sfx.slam();
    }
    lockPiece();
  }

  function holdCurrent() {
    if (state.status !== 'playing' || !state.piece || !state.canHold) return;

    const current = state.piece;
    const held = state.hold;
    state.hold = {
      type: current.type,
      matrix: current.matrix.map((row) => row.slice()),
      rot: current.rot,
    };
    state.canHold = false;

    if (held) {
      state.piece = held;
      centerPiece(state.piece);
    } else {
      fillQueue();
      state.piece = state.queue.shift();
      fillQueue();
      centerPiece(state.piece);
    }

    state.gravityTimer = 0;
    state.lockTimer = 0;
    state.lockResets = 0;
    sfx.hold();
    drawPreviews();

    if (collides(state.piece.matrix, state.piece.x, state.piece.y)) {
      gameOver();
    }
  }

  function lockPiece() {
    const p = state.piece;
    if (!p) return;

    let topOut = false;
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        const v = p.matrix[y][x];
        if (!v) continue;
        const bx = p.x + x;
        const by = p.y + y;
        if (by < 0) {
          topOut = true;
          continue;
        }
        if (by < ROWS && bx >= 0 && bx < COLS) {
          state.board[by][bx] = v;
        }
      }
    }

    state.piece = null;
    state.lockTimer = 0;
    state.lockResets = 0;
    sfx.lock();

    if (topOut) {
      gameOver();
      return;
    }

    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (state.board[y].every(Boolean)) fullRows.push(y);
    }

    if (fullRows.length) {
      handleClear(fullRows);
    } else {
      state.combo = 0;
      spawnNext();
    }
  }

  function handleClear(rows) {
    const n = rows.length;
    state.status = 'clearing';
    state.clearRows = rows.slice();
    state.clearTimer = CLEAR_ANIM;
    state.combo += 1;

    const lineScores = [0, 100, 300, 500, 800];
    let gained = (lineScores[n] || 0) * state.level;
    if (state.combo > 1) gained += 50 * (state.combo - 1) * state.level;
    addScore(gained);

    state.lines += n;
    const nextLevel = Math.floor(state.lines / 10) + 1;
    const levelUp = nextLevel > state.level;
    if (levelUp) state.level = nextLevel;

    const cell = (boardView.w || 300) / COLS;
    let rowSum = 0;
    for (let i = 0; i < rows.length; i++) rowSum += rows[i];
    const avgRow = rowSum / n;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let x = 0; x < COLS; x++) {
        const v = state.board[row][x];
        if (v) spawnBurst(x, row, v - 1, cell);
      }
    }

    const labels = ['', 'SINGLE!', 'DOUBLE!', 'TRIPLE!', 'BALL BUSTER!'];
    let label = labels[n] || 'SWEET!';
    if (state.combo > 1) label += ` x${state.combo}`;
    addFloater(label, COLS / 2, avgRow + 0.3, n === 4 ? '#ffd21f' : '#ffffff');

    state.shake = Math.max(state.shake, 3 + n * 2);
    sfx.clear(n);
    if (levelUp) {
      addFloater(`LEVEL ${state.level}`, COLS / 2, Math.max(1.5, avgRow - 1.8), '#7cf3ff');
      sfx.level();
    }

    updateHUD();
  }

  function addScore(points) {
    if (!points) return;
    state.score += points;
    els.score.textContent = state.score.toLocaleString();
    els.best.textContent = Math.max(best, state.score).toLocaleString();
  }

  function spawnBurst(gx, gy, colorIndex, cell) {
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = cell * (1.6 + Math.random() * 5.4);
      const life = 480 + Math.random() * 480;
      state.particles.push({
        x: (gx + 0.5) * cell,
        y: (gy + 0.5) * cell,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - cell * 2.2,
        size: cell * (0.07 + Math.random() * 0.11),
        color: colorIndex,
        variant: Math.random() < 0.5 ? 0 : 1,
        life,
        lifeMax: life,
      });
    }
  }

  function addFloater(text, gx, gy, color) {
    state.floaters.push({
      text,
      gx,
      gy,
      vy: -1.1,
      life: 1150,
      maxLife: 1150,
      color,
    });
  }

  /* ============================================================
     Update
     ============================================================ */

  function update(dt) {
    if (state.status === 'playing') updatePlaying(dt);
    else if (state.status === 'clearing') updateClearing(dt);
    updateEffects(dt);
  }

  function updatePlaying(dt) {
    // Horizontal auto-repeat (DAS).
    if (input.dir !== 0) {
      input.hTimer -= dt;
      let guard = 0;
      while (input.hTimer <= 0 && guard < 4) {
        guard++;
        tryMove(input.dir, 0);
        input.hTimer += 45;
        if (input.hTimer <= 0) input.hTimer = 45;
      }
    }

    // Soft drop.
    if (input.down && state.piece) {
      input.softTimer += dt;
      if (input.softTimer >= 42) {
        input.softTimer = 0;
        if (canFall()) {
          state.piece.y++;
          addScore(1);
        }
      }
    } else {
      input.softTimer = 0;
    }

    if (!state.piece) return;

    // Gravity and lock delay.
    if (canFall()) {
      state.gravityTimer += dt;
      if (state.gravityTimer >= gravityInterval()) {
        state.gravityTimer = 0;
        state.piece.y++;
        state.lockTimer = 0;
        state.lockResets = 0;
      }
    } else {
      state.gravityTimer = 0;
      state.lockTimer += dt;
      if (state.lockTimer >= LOCK_DELAY) {
        lockPiece();
      }
    }
  }

  function updateClearing(dt) {
    state.clearTimer -= dt;
    if (state.clearTimer > 0) return;

    const rows = state.clearRows.slice().sort((a, b) => b - a);
    for (let i = 0; i < rows.length; i++) {
      state.board.splice(rows[i], 1);
    }
    for (let i = 0; i < rows.length; i++) {
      state.board.unshift(new Array(COLS).fill(0));
    }

    state.clearRows = [];
    state.clearTimer = 0;
    state.status = 'playing';
    spawnNext();
  }

  function updateEffects(dt) {
    const seconds = dt / 1000;

    if (state.particles.length) {
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        p.vy += 1500 * seconds;
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
        p.life -= dt;
      }
      state.particles = state.particles.filter((p) => p.life > 0);
    }

    if (state.floaters.length) {
      for (let i = 0; i < state.floaters.length; i++) {
        const f = state.floaters[i];
        f.gy += f.vy * seconds;
        f.life -= dt;
      }
      state.floaters = state.floaters.filter((f) => f.life > 0);
    }

    if (state.shake > 0.05) {
      state.shake *= Math.pow(0.002, seconds);
      if (state.shake < 0.05) state.shake = 0;
    }
  }

  /* ============================================================
     Rendering — playfield
     ============================================================ */

  function renderBoard() {
    if (!boardView || !boardView.w || !boardView.h) return;
    const { ctx, w, h, dpr } = boardView;
    const cell = w / COLS;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Backdrop.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2a1740');
    bg.addColorStop(0.55, '#1c1030');
    bg.addColorStop(1, '#110a1b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Polka-dot grid.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    const dotR = Math.max(0.7, cell * 0.022);
    for (let y = 1; y < ROWS; y++) {
      for (let x = 1; x < COLS; x++) {
        ctx.beginPath();
        ctx.arc(x * cell, y * cell, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Danger glow when the candy stack gets close to the ceiling.
    let topRow = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (state.board[y].some(Boolean)) {
        topRow = y;
        break;
      }
    }
    if (topRow < 5) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
      const danger = clamp((5 - topRow) / 5, 0, 1);
      const dg = ctx.createLinearGradient(0, 0, 0, cell * 5);
      dg.addColorStop(0, `rgba(255, 40, 74, ${0.32 * danger * pulse})`);
      dg.addColorStop(1, 'rgba(255, 40, 74, 0)');
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, w, cell * 5);
    }

    ctx.save();
    if (state.shake > 0.2) {
      ctx.translate(
        (Math.random() - 0.5) * state.shake,
        (Math.random() - 0.5) * state.shake
      );
    }

    const clearingT =
      state.status === 'clearing'
        ? clamp(1 - state.clearTimer / CLEAR_ANIM, 0, 1)
        : 0;
    const clearSet =
      state.status === 'clearing' ? new Set(state.clearRows) : null;

    // Stacked candy.
    for (let y = 0; y < ROWS; y++) {
      const isClearing = clearSet && clearSet.has(y);
      for (let x = 0; x < COLS; x++) {
        const v = state.board[y][x];
        if (!v) continue;
        drawCellBall(
          ctx,
          x,
          y,
          cell,
          v - 1,
          isClearing ? 1 - clearingT : 1,
          isClearing ? 1 - clearingT * 0.88 : 1
        );
      }
    }

    // Ghost + active piece.
    if (state.piece && state.status !== 'gameover') {
      const p = state.piece;
      const gy = ghostY();
      if (gy > p.y) {
        ctx.save();
        ctx.translate(p.x * cell, gy * cell);
        drawGhost(ctx, p.matrix, cell);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(p.x * cell, p.y * cell);
      drawMatrixBalls(ctx, p.matrix, cell, 1, 1);
      ctx.restore();
    }

    // White flash over rows being busted.
    if (clearSet && clearingT < 0.65) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.42 * (1 - clearingT / 0.65)})`;
      for (let i = 0; i < state.clearRows.length; i++) {
        ctx.fillRect(0, state.clearRows[i] * cell, w, cell);
      }
    }

    // Candy shrapnel.
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const a = clamp(p.life / p.lifeMax, 0, 1);
      drawBall(ctx, p.x, p.y, p.size * (0.45 + 0.55 * a), p.color, a, p.variant);
    }

    // Floating score messages.
    if (state.floaters.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < state.floaters.length; i++) {
        const f = state.floaters[i];
        const alpha = clamp(f.life / 320, 0, 1);
        const size = Math.max(10, Math.min(cell * 0.5, (w * 0.92) / (f.text.length * 0.58)));
        ctx.globalAlpha = alpha;
        ctx.font = `800 ${size}px "Baloo 2", "Trebuchet MS", sans-serif`;
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, size * 0.18);
        ctx.strokeStyle = 'rgba(18, 7, 28, 0.82)';
        ctx.strokeText(f.text, f.gx * cell, f.gy * cell);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.gx * cell, f.gy * cell);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();

    // Vignette.
    const vg = ctx.createRadialGradient(
      w / 2,
      h * 0.42,
      w * 0.12,
      w / 2,
      h * 0.5,
      h * 0.72
    );
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCellBall(ctx, gx, gy, cell, colorIndex, alpha, scale) {
    if (alpha <= 0.01) return;
    const jx = (hashNoise(gx * 1.37 + 3.1, gy * 2.11 + 9.7) - 0.5) * cell * 0.055;
    const jy = (hashNoise(gy * 1.91 + 5.3, gx * 2.53 + 1.7) - 0.5) * cell * 0.055;
    drawBall(
      ctx,
      (gx + 0.5) * cell + jx,
      (gy + 0.5) * cell + jy,
      cell * 0.44 * scale,
      colorIndex,
      alpha,
      (gx + gy) & 1
    );
  }

  function drawMatrixBalls(ctx, matrix, cell, alpha, scale) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        const v = matrix[y][x];
        if (!v) continue;
        drawCellBall(ctx, x, y, cell, v - 1, alpha, scale);
      }
    }
  }

  function drawGhost(ctx, matrix, cell) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        const v = matrix[y][x];
        if (!v) continue;
        const jx = (hashNoise(x * 1.37 + 3.1, y * 2.11 + 9.7) - 0.5) * cell * 0.055;
        const jy = (hashNoise(y * 1.91 + 5.3, x * 2.53 + 1.7) - 0.5) * cell * 0.055;
        const cx = (x + 0.5) * cell + jx;
        const cy = (y + 0.5) * cell + jy;
        drawBall(ctx, cx, cy, cell * 0.44, v - 1, 0.14, (x + y) & 1);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.lineWidth = Math.max(1, cell * 0.028);
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function ghostY() {
    const p = state.piece;
    if (!p) return 0;
    let y = p.y;
    while (!collides(p.matrix, p.x, y + 1)) y++;
    return y;
  }

  /* ============================================================
     Rendering — hold / next previews
     ============================================================ */

  function drawPreviews() {
    if (!holdView || !nextView) return;
    drawPreview(holdView, state.hold ? [state.hold] : []);
    const horizontal = nextView.w > nextView.h * 1.15;
    drawPreview(nextView, state.queue.slice(0, horizontal ? 2 : 3));
  }

  function drawPreview(view, pieces) {
    if (!view || !view.w || !view.h) return;
    const { ctx, w, h, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!pieces.length) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.font = `600 ${Math.max(11, h * 0.16)}px "Baloo 2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', w / 2, h / 2 + 1);
      return;
    }

    const horizontal = w > h * 1.15;
    const n = pieces.length;
    const slotW = horizontal ? w / n : w;
    const slotH = horizontal ? h : h / n;

    for (let i = 0; i < n; i++) {
      const piece = pieces[i];
      const ox = horizontal ? i * slotW : 0;
      const oy = horizontal ? 0 : i * slotH;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      roundRectPath(ctx, ox + 2, oy + 2, slotW - 4, slotH - 4, 9);
      ctx.fill();

      let minX = 99;
      let maxX = -1;
      let minY = 99;
      let maxY = -1;
      for (let y = 0; y < piece.matrix.length; y++) {
        for (let x = 0; x < piece.matrix[y].length; x++) {
          if (!piece.matrix[y][x]) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) continue;

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const cell = Math.min(
        (slotW - 16) / bw,
        (slotH - 12) / bh,
        horizontal ? 21 : 27
      );
      const startX = ox + (slotW - bw * cell) / 2 - minX * cell;
      const startY = oy + (slotH - bh * cell) / 2 - minY * cell;

      for (let y = 0; y < piece.matrix.length; y++) {
        for (let x = 0; x < piece.matrix[y].length; x++) {
          const v = piece.matrix[y][x];
          if (!v) continue;
          const jx = (hashNoise(x * 1.37 + 3.1, y * 2.11 + 9.7) - 0.5) * cell * 0.05;
          const jy = (hashNoise(y * 1.91 + 5.3, x * 2.53 + 1.7) - 0.5) * cell * 0.05;
          drawBall(
            ctx,
            startX + (x + 0.5) * cell + jx,
            startY + (y + 0.5) * cell + jy,
            cell * 0.44,
            v - 1,
            1,
            (x + y) & 1
          );
        }
      }
    }
  }

  /* ============================================================
     Input
     ============================================================ */

  const GAME_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowDown',
    'ArrowUp',
    'Space',
    'KeyP',
    'KeyR',
    'KeyC',
    'KeyX',
    'KeyZ',
    'ShiftLeft',
    'ShiftRight',
    'Escape',
    'KeyM',
    'KeyN',
    'Enter',
  ]);

  function releaseInput() {
    input.left = false;
    input.right = false;
    input.down = false;
    input.dir = 0;
    input.hTimer = 0;
    input.softTimer = 0;
    if (gesture) cancelGesture();
  }

  /* ============================================================
     Fullscreen (desktop app window, or the browser page)
     ============================================================ */

  function hasDesktopFullscreen() {
    return !!(window.desktop && typeof window.desktop.toggleFullscreen === 'function');
  }

  function applyFullscreenUI(active) {
    els.fullscreenBtn.setAttribute('aria-pressed', String(active));
    els.fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    els.fullscreenBtn.setAttribute('title', active ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)');
  }

  function toggleFullscreen() {
    if (hasDesktopFullscreen()) {
      window.desktop.toggleFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  /* ============================================================
     Quitting (button, or hold Escape for 2.5 seconds)
     ============================================================ */

  const QUIT_HOLD_MS = 2500;

  let quitTimer = null;
  let quitting = false;
  let escSuppressed = false;

  function requestQuit() {
    if (quitting) return;
    quitting = true;
    cancelQuitHold();

    if (window.desktop && typeof window.desktop.quit === 'function') {
      window.desktop.quit();
      return;
    }

    // Browser fallback (works for script-opened windows; otherwise ask the user).
    try {
      window.close();
    } catch (err) {
      /* ignore */
    }
    setTimeout(() => {
      if (!document.hidden) {
        els.quitToast.classList.add('show', 'blocked');
        els.quitToast.setAttribute('aria-hidden', 'false');
        els.quitToast.querySelector('span').textContent = 'Close this window to quit';
      }
    }, 400);
  }

  function startQuitHold() {
    if (quitTimer || quitting) return;
    els.quitToast.classList.add('show');
    els.quitToast.setAttribute('aria-hidden', 'false');
    quitTimer = setTimeout(requestQuit, QUIT_HOLD_MS);
  }

  function cancelQuitHold() {
    if (quitTimer) {
      clearTimeout(quitTimer);
      quitTimer = null;
    }
    els.quitToast.classList.remove('show');
    els.quitToast.setAttribute('aria-hidden', 'true');
  }

  function togglePauseFromEscape() {
    if (state.status === 'paused') {
      resumeGame();
    } else if (state.status === 'playing' || state.status === 'clearing') {
      pauseGame();
    }
  }

  function pressHorizontal(dir) {
    input[dir < 0 ? 'left' : 'right'] = true;
    input.dir = dir;
    input.hTimer = 170;
    if (tryMove(dir, 0)) sfx.move();
  }

  function onKeyDown(e) {
    // A popup gets first claim on Escape and every game key.
    if (anyModalOpen()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        cancelQuitHold();
        escSuppressed = true;
        if (initialsOpen) finishInitials(false);
        else if (isModalOpen(els.scoresModal)) closeModal(els.scoresModal);
        else if (isModalOpen(els.helpModal)) closeModal(els.helpModal);
        return;
      }
      if (initialsOpen && e.code === 'Enter') {
        e.preventDefault();
        finishInitials(true);
      }
      return;
    }

    if (GAME_KEYS.has(e.code)) e.preventDefault();

    // Hold Escape for 2.5s to quit; a short press still toggles pause (on release).
    if (e.code === 'Escape') {
      if (!e.repeat) startQuitHold();
      return;
    }

    if (e.code === 'KeyM') {
      toggleSound();
      return;
    }

    if (e.code === 'KeyN') {
      toggleMusic();
      return;
    }

    if (state.status === 'ready' || state.status === 'gameover') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
        startGame();
      }
      return;
    }

    if (state.status === 'paused') {
      if (e.code === 'KeyP' || e.code === 'Enter') {
        resumeGame();
      }
      return;
    }

    if (e.code === 'KeyP') {
      pauseGame();
      return;
    }

    if (state.status !== 'playing' || e.repeat) return;

    switch (e.code) {
      case 'ArrowLeft':
        pressHorizontal(-1);
        break;
      case 'ArrowRight':
        pressHorizontal(1);
        break;
      case 'ArrowDown':
        input.down = true;
        input.softTimer = 0;
        break;
      case 'ArrowUp':
      case 'KeyX':
        rotatePiece(1);
        break;
      case 'KeyZ':
        rotatePiece(-1);
        break;
      case 'Space':
        hardDrop();
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        holdCurrent();
        break;
      default:
        break;
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Escape') {
      cancelQuitHold();
      if (escSuppressed) {
        escSuppressed = false;
        return;
      }
      if (!quitting) togglePauseFromEscape();
      return;
    }

    if (e.code === 'ArrowLeft') {
      input.left = false;
      if (input.dir === -1) input.dir = input.right ? 1 : 0;
    } else if (e.code === 'ArrowRight') {
      input.right = false;
      if (input.dir === 1) input.dir = input.left ? -1 : 0;
    } else if (e.code === 'ArrowDown') {
      input.down = false;
      input.softTimer = 0;
    }
  }

  function doTouchAction(action) {
    if (state.status === 'ready' || state.status === 'gameover') {
      if (action === 'hard') startGame();
      return;
    }
    if (state.status !== 'playing') return;

    switch (action) {
      case 'left':
        if (tryMove(-1, 0)) sfx.move();
        break;
      case 'right':
        if (tryMove(1, 0)) sfx.move();
        break;
      case 'soft':
        if (canFall()) {
          state.piece.y++;
          addScore(1);
          noteAction();
        }
        break;
      case 'rotateCW':
        rotatePiece(1);
        break;
      case 'rotateCCW':
        rotatePiece(-1);
        break;
      case 'hard':
        hardDrop();
        break;
      case 'hold':
        holdCurrent();
        break;
      default:
        break;
    }
  }

  function setupTouchControls() {
    const buttons = els.touch.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      const action = btn.dataset.action;
      let repeatStart = null;
      let repeatTimer = null;

      const stop = () => {
        if (repeatStart) {
          clearTimeout(repeatStart);
          repeatStart = null;
        }
        if (repeatTimer) {
          clearInterval(repeatTimer);
          repeatTimer = null;
        }
        btn.classList.remove('pressed');
      };

      const start = (event) => {
        event.preventDefault();
        getAudio();
        doTouchAction(action);
        btn.classList.add('pressed');

        if (action === 'left' || action === 'right' || action === 'soft') {
          repeatStart = setTimeout(() => {
            repeatTimer = setInterval(() => {
              doTouchAction(action);
            }, action === 'soft' ? 45 : 60);
          }, 190);
        }
      };

      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('lostpointercapture', stop);
    });

    els.touch.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ============================================================
     Board gestures — tap, swipe and drag on the playfield
     ============================================================ */

  function pointInBoard(clientX, clientY) {
    const rect = els.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      rect,
      col: (clientX - rect.left) / (rect.width / COLS),
      row: (clientY - rect.top) / (rect.height / ROWS),
    };
  }

  function pointTouchesPiece(clientX, clientY) {
    const p = state.piece;
    if (!p) return false;
    const point = pointInBoard(clientX, clientY);
    if (!point) return false;
    const mx = Math.floor(point.col) - p.x;
    const my = Math.floor(point.row) - p.y;
    if (my < 0 || my >= p.matrix.length || mx < 0 || mx >= p.matrix[my].length) {
      return false;
    }
    return p.matrix[my][mx] !== 0;
  }

  function gestureStepSize(rect) {
    return clamp(rect.width / COLS, 16, 34);
  }

  function cancelGesture() {
    if (!gesture) return;
    const id = gesture.id;
    input.down = false;
    gesture = null;
    try {
      if (els.board.hasPointerCapture(id)) els.board.releasePointerCapture(id);
    } catch (err) {
      /* ignore */
    }
  }

  function setupGestures() {
    const canvas = els.board;

    const begin = (event) => {
      if (state.status !== 'playing') return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (gesture) cancelGesture();
      getAudio();

      const rect = canvas.getBoundingClientRect();
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        startTime: performance.now(),
        mode: 'pending', // pending | horizontal | down | hold | slam
        onPiece: pointTouchesPiece(event.clientX, event.clientY),
        anchorX: event.clientX,
        step: gestureStepSize(rect),
        downActive: false,
        maxDownSpeed: 0,
      };

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* synthetic events have no active pointer to capture */
      }
      event.preventDefault();
    };

    const move = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (state.status !== 'playing') {
        cancelGesture();
        return;
      }
      event.preventDefault();

      const now = performance.now();
      const dt = Math.max(1, now - gesture.lastTime);
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const stepY = event.clientY - gesture.lastY;

      if (stepY > 0) {
        gesture.maxDownSpeed = Math.max(gesture.maxDownSpeed, stepY / dt);
      }

      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.lastTime = now;

      if (gesture.mode === 'pending') {
        if (Math.abs(dx) >= GESTURE.SWIPE_X || Math.abs(dy) >= GESTURE.SWIPE_Y) {
          if (Math.abs(dx) > Math.abs(dy) * 1.1) {
            gesture.mode = 'horizontal';
          } else if (dy < 0) {
            gesture.mode = 'hold';
            holdCurrent();
          } else {
            gesture.mode = 'down';
            gesture.downActive = true;
            input.down = true; // slow drag keeps the piece easing down
          }
        }
      }

      if (gesture.mode === 'horizontal') {
        let delta = event.clientX - gesture.anchorX;
        while (Math.abs(delta) >= gesture.step) {
          const dir = delta < 0 ? -1 : 1;
          if (tryMove(dir, 0)) sfx.move();
          gesture.anchorX += dir * gesture.step;
          delta = event.clientX - gesture.anchorX;
        }
      }

      if (
        gesture.mode === 'down' &&
        gesture.maxDownSpeed >= GESTURE.FAST_DOWN &&
        dy >= GESTURE.SLAM_DISTANCE
      ) {
        gesture.mode = 'slam';
        if (gesture.downActive) {
          input.down = false;
          gesture.downActive = false;
        }
        hardDrop();
      }
    };

    const finish = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;

      const elapsed = Math.max(1, performance.now() - gesture.startTime);
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const dist = Math.hypot(dx, dy);

      if (gesture.downActive) {
        input.down = false;
        gesture.downActive = false;
      }

      if (state.status !== 'playing') {
        gesture = null;
        return;
      }

      if (gesture.mode === 'pending') {
        if (dist < GESTURE.TAP_MOVE && elapsed < GESTURE.TAP_TIME) {
          if (gesture.onPiece) holdCurrent();
          else rotatePiece(1);
        } else if (dy < -GESTURE.SWIPE_Y && Math.abs(dy) > Math.abs(dx)) {
          holdCurrent();
        } else if (dy > GESTURE.SLAM_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
          if (dist / elapsed >= GESTURE.FAST_DOWN) hardDrop();
        } else if (Math.abs(dx) >= GESTURE.SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
          const dir = dx < 0 ? -1 : 1;
          const steps = Math.max(1, Math.floor(Math.abs(dx) / gesture.step));
          for (let i = 0; i < steps; i++) {
            if (tryMove(dir, 0)) sfx.move();
          }
        }
      } else if (
        gesture.mode === 'down' &&
        dy >= GESTURE.SLAM_DISTANCE &&
        dist / elapsed >= GESTURE.FAST_DOWN
      ) {
        // A quick flick that released before a move reported high speed.
        hardDrop();
      }

      gesture = null;
    };

    const cancel = (event) => {
      if (!gesture || (event && event.pointerId !== gesture.id)) return;
      cancelGesture();
    };

    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('dragstart', (event) => event.preventDefault());
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('blur', () => cancelGesture());
  }

  /* ============================================================
     Init + main loop
     ============================================================ */

  els.overlayBtn.addEventListener('click', () => {
    if (overlayAction) overlayAction();
  });

  els.pauseBtn.addEventListener('click', () => {
    if (state.status === 'paused') resumeGame();
    else if (state.status === 'playing' || state.status === 'clearing') pauseGame();
  });

  els.soundBtn.addEventListener('click', toggleSound);

  els.musicBtn.addEventListener('click', toggleMusic);

  els.fullscreenBtn.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    if (!hasDesktopFullscreen()) applyFullscreenUI(!!document.fullscreenElement);
  });

  if (hasDesktopFullscreen()) {
    if (typeof window.desktop.onFullscreenChange === 'function') {
      window.desktop.onFullscreenChange(applyFullscreenUI);
    }
    if (typeof window.desktop.isFullscreen === 'function') {
      window.desktop
        .isFullscreen()
        .then(applyFullscreenUI)
        .catch(() => {});
    }
  }

  els.sfxSlider.addEventListener('input', (event) => {
    setSfxVolume(Number(event.target.value) / 100);
  });

  els.musicSlider.addEventListener('input', (event) => {
    setMusicVolume(Number(event.target.value) / 100);
  });

  els.quitBtn.addEventListener('click', requestQuit);

  els.viewScoresBtn.addEventListener('click', openScoresModal);
  els.viewScoresBtnMobile.addEventListener('click', openScoresModal);
  els.helpBtn.addEventListener('click', openHelpModal);
  els.helpBtnMobile.addEventListener('click', openHelpModal);
  els.helpClose.addEventListener('click', () => closeModal(els.helpModal));
  els.scoresClose.addEventListener('click', () => closeModal(els.scoresModal));
  els.initialsClose.addEventListener('click', () => finishInitials(false));
  els.initialsSkip.addEventListener('click', () => finishInitials(false));

  els.initialsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    finishInitials(true);
  });

  els.initialsInput.addEventListener('input', () => {
    const input = els.initialsInput;
    const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
    const cleaned = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (input.value !== cleaned) {
      input.value = cleaned;
      const pos = Math.min(caret, cleaned.length);
      try {
        input.setSelectionRange(pos, pos);
      } catch (err) {
        /* ignore */
      }
    }
  });

  [els.helpModal, els.scoresModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelQuitHold();
      if (state.status === 'playing' || state.status === 'clearing') {
        pauseGame();
      }
    }
  });

  window.addEventListener('blur', () => {
    cancelQuitHold();
    releaseInput();
  });

  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);

  setupTouchControls();
  setupGestures();
  music.setVolume(musicVolume);
  applySoundUI();
  applyMusicUI();
  updateHUD();
  renderTopScores();
  fillQueue();
  drawPreviews();

  // Browsers only allow audio after a gesture; start the loop on the first one.
  let musicUnlocked = false;
  const unlockMusic = () => {
    if (musicUnlocked) return;
    musicUnlocked = true;
    window.removeEventListener('pointerdown', unlockMusic);
    window.removeEventListener('keydown', unlockMusic);
    if (musicOn) music.start();
  };
  window.addEventListener('pointerdown', unlockMusic);
  window.addEventListener('keydown', unlockMusic);

  showOverlay({
    kicker: 'Candy Arcade',
    title: 'Ready to bust?',
    text: 'Stack the berries, fill a row, and bust it. Keep the candy off the ceiling.',
    btn: 'Start Busting',
    hint: 'Tap rotate · tap piece hold · swipe ↔ move · ↑ hold · ↓ soft / flick slam',
    action: startGame,
  });

  requestAnimationFrame(() => {
    layoutBoard();
    drawPreviews();
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => scheduleLayout());
  }

  // Test-only handle, enabled with ?gestureTest. Keeps the shipped game closed.
  if (new URLSearchParams(window.location.search).has('gestureTest')) {
    window.__tbbTest = {
      state,
      input,
      holdCurrent,
      rotatePiece,
      tryMove,
      hardDrop,
      gameOver,
      addTopScore,
      scoreQualifiesForTop,
      topScores: () => topScores.slice(),
      finishInitials,
      anyModalOpen,
      openHelpModal,
      openScoresModal,
    };
  }

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min(50, Math.max(0, now - lastTime));
    lastTime = now;

    if (state.status !== 'paused') update(dt);
    renderBoard();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
