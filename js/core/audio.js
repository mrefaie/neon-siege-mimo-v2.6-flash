/**
 * WebAudio: procedural SFX, synthwave music sequencer, speech captions.
 * Unlocked on first user gesture. All volumes user-controlled.
 */
import { events } from "./events.js";

let ctx = null;
let masterSfx = null;
let masterMusic = null;
let masterVoice = null;
let unlocked = false;

const settings = { music: 55, sfx: 70, voice: 70, voiceOn: true };

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterSfx = ctx.createGain();
    masterMusic = ctx.createGain();
    masterVoice = ctx.createGain();
    masterSfx.connect(ctx.destination);
    masterMusic.connect(ctx.destination);
    masterVoice.connect(ctx.destination);
    applyVolumes();
  } catch {
    ctx = null;
  }
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  masterSfx.gain.value = (settings.sfx / 100) * 0.9;
  masterMusic.gain.value = (settings.music / 100) * 0.55;
  masterVoice.gain.value = (settings.voice / 100);
}

function now() { return ctx.currentTime; }

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({ freq = 440, type = "square", dur = 0.15, vol = 0.4, slide = 0, attack = 0.005, delay = 0, dest = null }) {
  if (!ctx) return;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  env(g, t0, vol, attack, dur);
  osc.connect(g);
  g.connect(dest || masterSfx);
  osc.start(t0);
  osc.stop(t0 + dur + attack + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, filterFreq = 1200, delay = 0, q = 1, type = "lowpass", dest = null }) {
  if (!ctx) return;
  const t0 = now() + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, vol, 0.004, dur);
  src.connect(f); f.connect(g); g.connect(dest || masterSfx);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/* ---------------- SFX ---------------- */
const sfx = {
  shoot() { tone({ freq: 880, type: "square", dur: 0.07, vol: 0.18, slide: -520 }); },
  laser() { tone({ freq: 1400, type: "sawtooth", dur: 0.1, vol: 0.16, slide: -900 }); },
  enemyShoot() { tone({ freq: 320, type: "triangle", dur: 0.1, vol: 0.14, slide: 160 }); },
  hit() { tone({ freq: 220, type: "square", dur: 0.06, vol: 0.2, slide: -80 }); noise({ dur: 0.05, vol: 0.12, filterFreq: 2400 }); },
  enemyHit() { tone({ freq: 520, type: "square", dur: 0.05, vol: 0.16, slide: -200 }); },
  explode() {
    noise({ dur: 0.35, vol: 0.4, filterFreq: 900 });
    tone({ freq: 140, type: "sawtooth", dur: 0.3, vol: 0.25, slide: -110 });
  },
  bigExplode() {
    noise({ dur: 0.6, vol: 0.5, filterFreq: 500 });
    tone({ freq: 90, type: "sawtooth", dur: 0.55, vol: 0.35, slide: -70 });
    tone({ freq: 60, type: "square", dur: 0.5, vol: 0.2, slide: -40, delay: 0.05 });
  },
  playerHit() {
    tone({ freq: 180, type: "sawtooth", dur: 0.2, vol: 0.3, slide: -120 });
    noise({ dur: 0.2, vol: 0.25, filterFreq: 700 });
  },
  dash() {
    noise({ dur: 0.18, vol: 0.2, filterFreq: 2600, type: "bandpass", q: 2 });
    tone({ freq: 300, type: "sine", dur: 0.15, vol: 0.2, slide: 600 });
  },
  pickup() {
    tone({ freq: 660, type: "square", dur: 0.08, vol: 0.2 });
    tone({ freq: 990, type: "square", dur: 0.1, vol: 0.2, delay: 0.07 });
    tone({ freq: 1320, type: "square", dur: 0.14, vol: 0.18, delay: 0.14 });
  },
  powerup() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: "triangle", dur: 0.12, vol: 0.22, delay: i * 0.06 }));
  },
  waveClear() {
    [392, 523, 659, 784].forEach((f, i) =>
      tone({ freq: f, type: "square", dur: 0.16, vol: 0.2, delay: i * 0.09 }));
  },
  bossWarn() {
    tone({ freq: 110, type: "sawtooth", dur: 0.4, vol: 0.3 });
    tone({ freq: 112, type: "sawtooth", dur: 0.4, vol: 0.3, delay: 0.45 });
    noise({ dur: 0.7, vol: 0.15, filterFreq: 400, delay: 0.1 });
  },
  gameOver() {
    [440, 349, 262, 196].forEach((f, i) =>
      tone({ freq: f, type: "sawtooth", dur: 0.35, vol: 0.25, delay: i * 0.18 }));
  },
  menu() { tone({ freq: 700, type: "square", dur: 0.06, vol: 0.15 }); },
  menuConfirm() {
    tone({ freq: 600, type: "square", dur: 0.07, vol: 0.18 });
    tone({ freq: 900, type: "square", dur: 0.1, vol: 0.16, delay: 0.06 });
  },
  combo() { tone({ freq: 1200 + Math.random() * 400, type: "triangle", dur: 0.07, vol: 0.14 }); },
  shieldBreak() {
    noise({ dur: 0.3, vol: 0.3, filterFreq: 1800, type: "bandpass", q: 1.5 });
    tone({ freq: 800, type: "square", dur: 0.25, vol: 0.2, slide: -600 });
  },
  nova() {
    noise({ dur: 0.7, vol: 0.4, filterFreq: 1400 });
    tone({ freq: 70, type: "sine", dur: 0.7, vol: 0.35, slide: 200 });
  },
  zap() { tone({ freq: 2000, type: "sawtooth", dur: 0.09, vol: 0.16, slide: -1600 }); },
  freeze() { tone({ freq: 1600, type: "sine", dur: 0.3, vol: 0.2, slide: -1200 }); },
};

/* ---------------- Music (synthwave step sequencer) ---------------- */
// 16-step patterns, semitone notes relative to A1 = 55Hz
const MUSIC = {
  bpm: 100,
  // bass line (root notes as MIDI-ish steps)
  bass: [0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 15, 3, 3, 3, 15, 3,
         5, 5, 17, 5, 5, 5, 17, 5, 7, 7, 19, 7, 7, 10, 7, 12],
  arp: [12, 15, 19, 24, 19, 15, 12, 15, 15, 19, 22, 27, 22, 19, 15, 19,
        17, 20, 24, 29, 24, 20, 17, 20, 19, 22, 26, 31, 26, 22, 19, 24],
  kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0,
          1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,1],
  snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
          0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
  hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1,
          1,0,1,0, 1,0,1,0, 1,0,1,0, 1,1,1,1],
  bassRoot: 55, // A1
  arpRoot: 220,
};

let musicOn = false;
let musicTimer = null;
let step = 0;
let nextTime = 0;
const LOOKAHEAD = 0.12;
const STEP_INTERVAL = 60 / MUSIC.bpm / 4; // 16th notes

function midiToFreq(root, semi) { return root * Math.pow(2, semi / 12); }

function schedMusic() {
  if (!ctx || !musicOn) return;
  while (nextTime < now() + LOOKAHEAD) {
    const t = nextTime;
    const s = step % 32;

    if (MUSIC.kick[s]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g); g.connect(masterMusic);
      osc.start(t); osc.stop(t + 0.16);
    }
    if (MUSIC.snare[s]) noise({ dur: 0.14, vol: 0.28, filterFreq: 2000, dest: masterMusic, delay: t - now() });
    if (MUSIC.hat[s]) noise({ dur: 0.04, vol: 0.1, filterFreq: 7000, type: "highpass", dest: masterMusic, delay: t - now() });

    // bass every step
    const bOsc = ctx.createOscillator();
    const bG = ctx.createGain();
    bOsc.type = "sawtooth";
    bOsc.frequency.value = midiToFreq(MUSIC.bassRoot, MUSIC.bass[s]);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(180, t + STEP_INTERVAL * 0.9);
    bG.gain.setValueAtTime(0.0001, t);
    bG.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    bG.gain.exponentialRampToValueAtTime(0.0001, t + STEP_INTERVAL * 0.95);
    bOsc.connect(f); f.connect(bG); bG.connect(masterMusic);
    bOsc.start(t); bOsc.stop(t + STEP_INTERVAL);

    // arp on off-beats
    if (s % 2 === 0) {
      const aOsc = ctx.createOscillator();
      const aG = ctx.createGain();
      aOsc.type = "square";
      aOsc.frequency.value = midiToFreq(MUSIC.arpRoot, MUSIC.arp[s]);
      aG.gain.setValueAtTime(0.0001, t);
      aG.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      aG.gain.exponentialRampToValueAtTime(0.0001, t + STEP_INTERVAL * 1.6);
      aOsc.connect(aG); aG.connect(masterMusic);
      aOsc.start(t); aOsc.stop(t + STEP_INTERVAL * 1.8);
    }

    nextTime += STEP_INTERVAL;
    step++;
  }
}

function startMusic() {
  if (!ensureCtx() || musicOn) return;
  musicOn = true;
  step = 0;
  nextTime = now() + 0.05;
  musicTimer = setInterval(schedMusic, 30);
}

function stopMusic() {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

/* ---------------- Voice ---------------- */
let captionTimer = null;
let speaking = false;

function speak(text) {
  if (!settings.voiceOn || !text) return;
  showCaption(text);
  try {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 0.85;
    u.volume = settings.voice / 100;
    speaking = true;
    u.onend = u.onerror = () => { speaking = false; };
    speechSynthesis.speak(u);
  } catch {
    // speech unavailable — caption already shown
  }
}

function showCaption(text) {
  const el = document.getElementById("caption");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
  if (captionTimer) clearTimeout(captionTimer);
  captionTimer = setTimeout(() => el.classList.add("hidden"), 1800);
}

/* ---------------- Public API ---------------- */
export const audio = {
  unlock() {
    const c = ensureCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    if (!unlocked) {
      unlocked = true;
      // unlock gesture click
      tone({ freq: 880, type: "sine", dur: 0.05, vol: 0.05 });
    }
  },

  setSettings(s) {
    Object.assign(settings, s);
    applyVolumes();
  },

  play(name) {
    if (!ensureCtx()) return;
    if (settings.sfx <= 0) return;
    const fn = sfx[name];
    if (fn) { try { fn(); } catch { /* ignore */ } }
  },

  startMusic() { startMusic(); },
  stopMusic() { stopMusic(); },
  isMusicOn() { return musicOn; },

  speak,
  showCaption,

  /** release timers (for tests / teardown) */
  dispose() {
    stopMusic();
    if (captionTimer) clearTimeout(captionTimer);
    try { speechSynthesis?.cancel(); } catch { /* ignore */ }
  },
};
