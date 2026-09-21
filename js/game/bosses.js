import { rand, clamp, TAU, chance } from "../core/utils.js";
import { spawnEnemy } from "./enemies.js";
import { bullets } from "./bullets.js";
import { fx } from "./particles.js";
import { audio } from "../core/audio.js";
import { events } from "../core/events.js";

/**
 * Three boss designs with phased, telegraphed attacks.
 * Design cycles: wave 5 → A, 10 → B, 15 → C, 20+ remixes (A/B/C with extra patterns).
 *
 * Boss update runs from enemies via `bossUpdate` hook (attached on spawn).
 */

export const BOSS_DESIGNS = {
  /** A: THE BULWARK — slow, shielded, spread volleys + charge */
  bulwark: {
    name: "THE BULWARK",
    hp: 900,
    w: 90, h: 70,
    color: "#ff3df0",
    score: 5000,
    phases: [
      { at: 1.0, name: "PHASE I" },
      { at: 0.66, name: "PHASE II" },
      { at: 0.33, name: "PHASE III" },
    ],
  },
  /** B: WIDOWMOTHER — swarm spawner + laser sweeps */
  widow: {
    name: "WIDOWMOTHER",
    hp: 850,
    w: 84, h: 76,
    color: "#ffb03d",
    score: 5500,
    phases: [
      { at: 1.0, name: "PHASE I" },
      { at: 0.6, name: "PHASE II" },
      { at: 0.28, name: "PHASE III" },
    ],
  },
  /** C: PRISM ARCHON — rotating bullet spirals + teleport */
  archon: {
    name: "PRISM ARCHON",
    hp: 1000,
    w: 78, h: 78,
    color: "#35f0ff",
    score: 6500,
    phases: [
      { at: 1.0, name: "PHASE I" },
      { at: 0.7, name: "PHASE II" },
      { at: 0.4, name: "PHASE III" },
    ],
  },
};

function designForWave(wave) {
  const idx = Math.floor(wave / 5) - 1; // 0,1,2,3...
  const keys = ["bulwark", "widow", "archon"];
  return keys[idx % 3];
}

export function spawnBoss(wave, bounds) {
  const key = designForWave(wave);
  const def = BOSS_DESIGNS[key];
  const remix = wave > 15 && (Math.floor(wave / 5) - 1) >= 3;
  const hpScale = 1 + Math.max(0, wave - 5) * 0.12;

  const e = spawnEnemy("armored", bounds.w / 2, -80, {
    wave,
    targetX: bounds.w / 2,
    targetY: Math.max(100, bounds.h * 0.18),
    hpScale: 1,
    arriveDur: 1.4,
  });
  if (!e) return null;

  e.type = "boss";
  e.isBoss = true;
  e.bossKey = key;
  e.bossDef = def;
  e.w = def.w;
  e.h = def.h;
  e.color = def.color;
  e.hp = e.maxHp = Math.round(def.hp * hpScale);
  e.score = def.score + wave * 50;
  e.name = def.name;
  e.remix = remix;
  e.armor = 0.25;
  e.stunResist = 1;
  e.attackT = 2.0;
  e.telegraph = 0;
  e.telegraphType = null;
  e.phaseIdx = 0;
  e.phaseName = def.phases[0].name;
  e.spiralA = 0;
  e.moveT = 0;
  e.baseY = e.targetY;
  e.summonCd = 4;
  e.def = { ...e.def, fireCd: [999, 1000], fireChance: 0 }; // boss uses own AI

  return e;
}

/* Boss AI is driven from enemies.update when e.isBoss — see integration below.
   We expose a single entry: */

export function bossUpdate(e, dt, ctx) {
  if (e.arriving) return;
  const p = ctx.player;
  const b = ctx.bounds;

  // phase transitions (once each)
  const frac = e.hp / e.maxHp;
  const phases = e.bossDef.phases;
  while (e.phaseIdx + 1 < phases.length && frac <= phases[e.phaseIdx + 1].at) {
    e.phaseIdx++;
    e.phaseName = phases[e.phaseIdx].name;
    hudBannerBoss(e);
    fx.shake(8, 0.4);
    fx.burst(e.x, e.y, { color: e.color, count: 30, speed: 260, life: 0.7, size: 4 });
    audio.play("bossWarn");
    // clear room: brief safe pause on boss attacks
    e.telegraph = 1.2;
    e.telegraphType = "phase";
  }

  e.moveT += dt;
  const ph = e.phaseIdx;

  // horizontal float
  const amp = b.w * 0.3;
  e.x = b.w / 2 + Math.sin(e.moveT * (0.5 + ph * 0.15)) * amp;
  e.y = e.baseY + Math.sin(e.moveT * 0.9) * 18 + ph * 8;

  if (e.telegraph > 0) {
    e.telegraph -= dt;
    // visual telegraph handled in draw
    if (e.telegraph <= 0) {
      fireBossVolley(e, e.telegraphType, ctx);
      e.telegraphType = null;
      // schedule next
      const intervals = [2.4, 1.9, 1.4];
      e.attackT = intervals[Math.min(2, ph)] * rand(0.85, 1.15);
    }
    return;
  }

  e.attackT -= dt;
  if (e.attackT <= 0 && p.alive) {
    e.telegraphType = pickAttack(e, ph, ctx);
    e.telegraph = e.telegraphType === "sweep" ? 0.9 : 0.65;
  }

  // summons in later phases
  if (ph >= 1) {
    e.summonCd -= dt;
    if (e.summonCd <= 0 && ctx.allowSpawnMinion?.()) {
      e.summonCd = ph >= 2 ? 5 : 7;
      const n = e.bossKey === "widow" ? 3 : 2;
      for (let i = 0; i < n; i++) {
        ctx.spawnMinion?.(e.bossKey === "widow" ? "swarmling" : "grunt",
          e.x + (i - n / 2) * 30, e.y + 30, { wave: ctx.wave });
      }
      fx.burst(e.x, e.y + 20, { color: e.color, count: 14, speed: 140, life: 0.4 });
    }
  }

  // remix: also keep base armored movement feel slow descent attempt
  if (e.remix && chance(dt * 0.5)) {
    // extra spiral shot
    bossSpiral(e, 4, 0.25);
  }
}

function pickAttack(e, ph, ctx) {
  const key = e.bossKey;
  const pool = [];
  if (key === "bulwark") {
    pool.push({ id: "spread", w: 10 });
    pool.push({ id: "aimed", w: 6 + ph * 2 });
    if (ph >= 1) pool.push({ id: "chargeTelegraph", w: 5 });
    if (ph >= 2) pool.push({ id: "ring", w: 7 });
  } else if (key === "widow") {
    pool.push({ id: "spiral", w: 9 });
    pool.push({ id: "sweep", w: 6 + ph * 2 });
    if (ph >= 1) pool.push({ id: "ring", w: 6 });
    if (ph >= 2) pool.push({ id: "aimed", w: 8 });
  } else {
    pool.push({ id: "spiral", w: 8 });
    pool.push({ id: "ring", w: 7 + ph * 2 });
    if (ph >= 1) pool.push({ id: "spread", w: 7 });
    if (ph >= 2) pool.push({ id: "sweep", w: 6 });
  }
  let total = 0;
  for (const a of pool) total += a.w;
  let r = Math.random() * total;
  for (const a of pool) {
    r -= a.w;
    if (r <= 0) return a.id;
  }
  return pool[0].id;
}

function fireBossVolley(e, type, ctx) {
  const p = ctx.player;
  audio.play("enemyShoot");
  const col = e.color;
  const ph = e.phaseIdx;

  switch (type) {
    case "spread": {
      const n = 7 + ph * 2;
      const base = Math.PI / 2;
      const arc = 1.2;
      for (let i = 0; i < n; i++) {
        const a = base - arc / 2 + (arc * i) / (n - 1);
        bullets.spawnEnemy({
          x: e.x, y: e.y + e.h / 2,
          vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
          w: 7, h: 7, kind: "orb", dmg: 14, color: col, life: 5,
        });
      }
      break;
    }
    case "aimed": {
      const shots = 3 + ph;
      for (let i = 0; i < shots; i++) {
        const delay = i * 0.12;
        const dx = p.x - e.x + (i - shots / 2) * 30;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        bullets.spawnEnemy({
          x: e.x, y: e.y + e.h / 2,
          vx: (dx / d) * 420, vy: (dy / d) * 420,
          w: 6, h: 6, kind: "orb", dmg: 16, color: "#ffffff", life: 4,
        });
      }
      break;
    }
    case "ring": {
      const n = 12 + ph * 4;
      const off = e.spiralA;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + off;
        bullets.spawnEnemy({
          x: e.x, y: e.y,
          vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
          w: 6, h: 6, kind: "orb", dmg: 12, color: col, life: 5,
        });
      }
      e.spiralA += 0.4;
      break;
    }
    case "spiral": {
      bossSpiral(e, 10 + ph * 3, 0.3);
      break;
    }
    case "sweep": {
      // vertical wall of bullets with a gap
      const gapX = clamp(p.x + rand(-40, 40), 60, ctx.bounds.w - 60);
      for (let x = 30; x < ctx.bounds.w; x += 36) {
        if (Math.abs(x - gapX) < 55) continue;
        bullets.spawnEnemy({
          x, y: e.y + e.h / 2,
          vx: 0, vy: 260,
          w: 8, h: 16, dmg: 15, color: col, life: 5,
        });
      }
      break;
    }
    case "chargeTelegraph": {
      // brief dash toward player x
      const tx = p.x;
      e.x += clamp(tx - e.x, -280, 280) * 0.5;
      fx.burst(e.x, e.y, { color: col, count: 16, speed: 200, life: 0.4 });
      // knockback bullets
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i - 2) * 0.25;
        bullets.spawnEnemy({
          x: e.x, y: e.y + 20,
          vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
          w: 7, h: 7, kind: "orb", dmg: 18, color: col, life: 4,
        });
      }
      break;
    }
    case "phase": {
      // phase transition: radial burst then pause
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        bullets.spawnEnemy({
          x: e.x, y: e.y,
          vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
          w: 5, h: 5, kind: "orb", dmg: 10, color: col, life: 5,
        });
      }
      break;
    }
  }
}

function bossSpiral(e, arms, spin) {
  e.spiralA += spin;
  for (let i = 0; i < arms; i++) {
    const a = e.spiralA + (i / arms) * TAU;
    bullets.spawnEnemy({
      x: e.x, y: e.y,
      vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
      w: 5, h: 5, kind: "orb", dmg: 11, color: e.color, life: 5,
    });
  }
}

function hudBannerBoss(e) {
  const el = document.getElementById("wave-banner");
  if (!el) return;
  el.textContent = `${e.name} — ${e.phaseName}`;
  el.classList.remove("hidden");
  void el.offsetWidth;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  setTimeout(() => el.classList.add("hidden"), 1700);
}

/* ---------- drawing support: telegraph ring ---------- */
export function drawBossTelegraph(ctx, e) {
  if (e.telegraph <= 0) return;
  const t = 1 - clamp(e.telegraph / (e.telegraphType === "sweep" ? 0.9 : 0.65), 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.35 + t * 0.5;
  ctx.strokeStyle = "#ff4d6d";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.w * 0.7 + t * 12, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // warn text
  ctx.fillStyle = "#ff4d6d";
  ctx.font = "700 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("!!", e.x, e.y - e.h / 2 - 14);
  ctx.restore();
  ctx.globalAlpha = 1;
}
