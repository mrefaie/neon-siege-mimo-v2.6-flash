import { events } from "./core/events.js";
import { input } from "./core/input.js";
import { audio } from "./core/audio.js";
import { storage } from "./core/storage.js";
import { fx } from "./game/particles.js";
import { game } from "./game/game.js";
import { player } from "./game/player.js";
import { enemies } from "./game/enemies.js";
import { bullets } from "./game/bullets.js";
import { hud } from "./game/hud.js";
import { menu } from "./ui/menu.js";
import { touch } from "./ui/touch.js";
import { initDebug, maybeDebug } from "./ui/debug.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

let dpr = 1;
let W = 800;
let H = 600;
let rafId = 0;
let lastT = 0;
let running = false;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.setBounds(W, H);
  fx.resize(W, H);
}

function loop(t) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;

  try {
    tick(dt);
  } catch (e) {
    console.error(e);
  }
  input.endFrame();
}

function tick(dt) {
  if (input.consumePause()) {
    if (game.mode === "playing") game.pause();
    else if (game.mode === "paused") game.resume();
  }

  game.update(dt);

  // autofire on touch
  if (touch.enabled && game.mode === "playing") player.autofire = true;
  else player.autofire = false;

  draw();
}

function draw() {
  fx.drawBackground(ctx);

  const shake = fx.getShake();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  if (game.mode === "playing" || game.mode === "paused" || game.mode === "gameover") {
    game.drawEffects(ctx);
    enemies.draw(ctx);
    game.drawDrones(ctx);
    bullets.draw(ctx);
    game.drawPickups(ctx);
    player.draw(ctx);
    fx.drawParticles(ctx);
  } else {
    // idle starfield particles in menu
    fx.drawParticles(ctx);
  }

  ctx.restore();
}

function boot() {
  const settings = storage.loadSettings();
  audio.setSettings(settings);

  fx.reducedMotion = settings.reducedMotion;
  fx.shakeEnabled = settings.shake;

  events.on("settings:changed", (s) => {
    fx.reducedMotion = s.reducedMotion;
    fx.shakeEnabled = s.shake;
  });

  const hiscore = storage.loadScores()[0]?.score || 0;

  resize();
  fx.init(W, H);

  input.init({
    pause: () => {
      // edge handled in tick via consumePause — this is fallback
    },
  });

  game.init(hiscore);
  hud.init();
  menu.init({
    backToTitle: () => menu.openTitle(),
  });
  menu.applySettings();
  touch.init();
  initDebug(game);

  // audio unlock on first interaction
  const unlock = () => {
    audio.unlock();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // game over → stats screen (menu listens via events.on("game:over"))

  // pause when tab hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.mode === "playing") {
      game.pause();
    }
  });

  window.addEventListener("resize", () => {
    resize();
  });

  // prevent double registration of RAF
  if (!running) {
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  menu.openTitle();
  maybeDebug();

  // expose for console debugging
  window.__neon = { game, player, enemies, bullets, fx, audio, storage, hud };
}

boot();
