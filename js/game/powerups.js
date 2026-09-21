import { rand, chance, clamp } from "../core/utils.js";
import { audio } from "../core/audio.js";
import { events } from "../core/events.js";
import { fx } from "./particles.js";
import { bullets } from "./bullets.js";
import { enemies } from "./enemies.js";
import { player } from "./player.js";
import { TAU } from "../core/utils.js";

/**
 * 5 families × 3 variants.
 * One active variant per family. Picking a different variant replaces.
 * Picking the same variant extends duration + stacks (capped).
 *
 * Timer-based power-ups use `duration` seconds.
 * Charge-based (drone spawns etc.) use `charges`.
 */

export const FAMILIES = {
  prism: { color: "#ff7ae0", label: "PRISM" },
  drone: { color: "#35f0ff", label: "DRONE" },
  chrono: { color: "#7df9ff", label: "CHRONO" },
  aegis: { color: "#ffd23d", label: "AEGIS" },
  singularity: { color: "#9d5cff", label: "VOID" },
};

export const VARIANTS = {
  // ---- Prism (weapon) ----
  spread: {
    family: "prism", name: "SPREAD", icon: "⋔", duration: 18, maxStack: 4,
    apply(weapon, stack) {
      // stack 1 = 3-way (1 extra each side), higher stacks widen + damage
      weapon.spread = Math.min(4, stack);
      weapon.dmgMul = 1 + (stack - 1) * 0.15;
    },
    clear(weapon) {
      weapon.spread = 0;
      weapon.dmgMul = 1;
    },
    desc: "Multi-shot",
  },
  pierce: {
    family: "prism", name: "PIERCE", icon: "⟹", duration: 16, maxStack: 3,
    apply(weapon, stack) {
      weapon.pierce = Math.min(4, stack + 1);
      weapon.beam = stack >= 2;
    },
    clear(weapon) {
      weapon.pierce = 0;
      weapon.beam = false;
    },
    desc: "Piercing beam",
  },
  ricochet: {
    family: "prism", name: "RICOCHET", icon: "⤢", duration: 16, maxStack: 3,
    apply(weapon, stack) {
      weapon.ricochet = Math.min(4, stack + 1);
    },
    clear(weapon) { weapon.ricochet = 0; },
    desc: "Bullets bounce between foes",
  },

  // ---- Drones ----
  droneAttack: {
    family: "drone", name: "ATTACK DRONE", icon: "▲", duration: 22, maxStack: 3, charges: true,
    desc: "Orbiting gun drone",
  },
  droneShield: {
    family: "drone", name: "INTERCEPTOR", icon: "◈", duration: 22, maxStack: 3, charges: true,
    desc: "Shoots down bullets",
  },
  droneMagnet: {
    family: "drone", name: "COLLECTOR", icon: "⬡", duration: 22, maxStack: 3, charges: true,
    desc: "Vacuums pickups",
  },

  // ---- Chrono ----
  chronoField: {
    family: "chrono", name: "SLOW FIELD", icon: "◉", duration: 12, maxStack: 3,
    desc: "Local slow field",
  },
  chronoFreeze: {
    family: "chrono", name: "FREEZE PULSE", icon: "❄", duration: 14, maxStack: 3,
    desc: "Periodic enemy freeze",
  },
  chronoHaste: {
    family: "chrono", name: "HASTE", icon: "»", duration: 12, maxStack: 3,
    desc: "Move & fire faster",
  },

  // ---- Aegis ----
  aegisShield: {
    family: "aegis", name: "SHIELD", icon: "⬢", duration: 14, maxStack: 4,
    desc: "Absorbs hits",
  },
  aegisReflect: {
    family: "aegis", name: "REFLECT", icon: "⇋", duration: 8, maxStack: 2,
    desc: "Reflects bullets",
  },
  aegisNova: {
    family: "aegis", name: "BURST SHIELD", icon: "✦", duration: 14, maxStack: 3,
    desc: "Explodes when broken",
  },

  // ---- Singularity ----
  voidWell: {
    family: "singularity", name: "GRAVITY WELL", icon: "●", duration: 12, maxStack: 3,
    desc: "Pulls enemies & bullets",
  },
  voidChain: {
    family: "singularity", name: "CHAIN", icon: "⌁", duration: 14, maxStack: 3,
    desc: "Lightning chains on hit",
  },
  voidNova: {
    family: "singularity", name: "NOVA", icon: "✺", duration: 12, maxStack: 3,
    desc: "Clearing damage wave",
  },
};

export const VARIANT_IDS = Object.keys(VARIANTS);

/** Active effects state (persists across waves) */
export const powerState = {
  // family → { id, stack, t, maxT, charges }
  active: {},
  // visual/logic timers
  wellT: 0,
  freezeT: 0,
  novaT: 0,
  aegisHp: 0,
  aegisMax: 0,
  reflectT: 0,
  shieldBrokenNova: false,
};

export function resetPowerState() {
  // clear weapon mods
  VARIANTS.spread.clear(player.weapon);
  VARIANTS.pierce.clear(player.weapon);
  VARIANTS.ricochet.clear(player.weapon);
  player.hasteTimer = 0;
  powerState.active = {};
  powerState.wellT = 0;
  powerState.freezeT = 0;
  powerState.novaT = 0;
  powerState.aegisHp = 0;
  powerState.aegisMax = 0;
  powerState.reflectT = 0;
  powerState.shieldBrokenNova = false;
  // drones cleaned by game
}

export function getActiveList() {
  return Object.values(powerState.active).map((a) => ({
    ...a,
    def: VARIANTS[a.id],
    fam: FAMILIES[VARIANTS[a.id].family],
    frac: a.maxT ? clamp(a.t / a.maxT, 0, 1) : (a.charges != null ? a.charges / a.maxCharges : 0),
  }));
}

export function hasVariant(id) {
  const a = powerState.active[VARIANTS[id]?.family];
  return a && a.id === id;
}

/**
 * Apply pickup of variant id to player state.
 * Returns 'new' | 'replace' | 'stack'
 */
export function applyPowerup(id) {
  const def = VARIANTS[id];
  if (!def) return null;
  const fam = def.family;
  const cur = powerState.active[fam];
  let mode = "new";

  if (!cur) {
    powerState.active[fam] = {
      id, stack: 1, t: def.duration, maxT: def.duration,
      charges: def.charges ? 1 : null,
      maxCharges: def.charges ? 1 : null,
    };
    mode = "new";
  } else if (cur.id !== id) {
    // replace: clear old effects
    deactivateFamily(fam, true);
    powerState.active[fam] = {
      id, stack: 1, t: def.duration, maxT: def.duration,
      charges: def.charges ? 1 : null,
      maxCharges: def.charges ? 1 : null,
    };
    mode = "replace";
  } else {
    // stack: extend + strengthen up to cap
    const cap = def.maxStack || 3;
    cur.stack = Math.min(cap, cur.stack + 1);
    cur.maxT = def.duration + (cur.stack - 1) * (def.duration * 0.35);
    cur.t = Math.min(cur.maxT, cur.t + def.duration * 0.7 + (cur.stack - 1) * 2);
    if (def.charges) {
      cur.maxCharges = Math.min(3, (cur.maxCharges || 1) + 1);
      cur.charges = cur.maxCharges;
    }
    mode = "stack";
  }

  const st = powerState.active[fam];
  runApply(id, st.stack);
  if (id === "aegisShield" || id === "aegisNova") {
    powerState.aegisMax = 40 + (st.stack - 1) * 25;
    powerState.aegisHp = powerState.aegisMax;
    powerState.shieldBrokenNova = id === "aegisNova";
  }
  if (id === "aegisReflect") powerState.reflectT = 0.01; // active flag; pulsing
  if (id === "chronoHaste") player.hasteTimer = st.t;

  audio.play("powerup");
  fx.burst(player.x, player.y, { color: FAMILIES[fam].color, count: 20, speed: 200, life: 0.6, size: 3 });
  events.emit("power:changed", {});
  return mode;
}

function runApply(id, stack) {
  const def = VARIANTS[id];
  if (def.apply) def.apply(player.weapon, stack);
  if (id === "chronoHaste") player.hasteTimer = def.duration;
}

function deactivateFamily(fam, silentClear = false) {
  const cur = powerState.active[fam];
  if (!cur) return;
  const def = VARIANTS[cur.id];
  if (def.clear) def.clear(player.weapon);
  if (cur.id === "chronoHaste") player.hasteTimer = 0;
  if (cur.id === "aegisShield" || cur.id === "aegisNova") {
    powerState.aegisHp = 0;
    powerState.aegisMax = 0;
    powerState.shieldBrokenNova = false;
  }
  if (cur.id === "aegisReflect") powerState.reflectT = 0;
  if (fam === "drone") {
    // remove drones tied to this family (all drones currently)
    events.emit("drones:clear", {});
  }
  delete powerState.active[fam];
}

export function updatePowerups(dt, game) {
  // tick durations (pause between waves handled by game: we skip decay flag)
  if (!game.inBreather) {
    for (const fam of Object.keys(powerState.active)) {
      const st = powerState.active[fam];
      const def = VARIANTS[st.id];
      if (def.charges) continue; // charges don't tick down by time in the same way — still tick
      st.t -= dt;
      if (st.id === "chronoHaste") player.hasteTimer = st.t;
      if (st.t <= 0) {
        deactivateFamily(fam);
        events.emit("power:expired", { family: fam });
        events.emit("power:changed", {});
      }
    }
  } else {
    // during breather, pause decay
    for (const fam of Object.keys(powerState.active)) {
      const st = powerState.active[fam];
      if (VARIANTS[st.id].charges && st.t > 0) st.t -= 0; // hold
    }
  }

  // --- Chrono field: slow nearby enemies ---
  const cf = powerState.active.chrono;
  if (cf?.id === "chronoField") {
    const radius = 150 + (cf.stack - 1) * 40;
    const slowMul = [0.55, 0.45, 0.35][Math.min(2, cf.stack - 1)];
    for (const e of enemies.list) {
      if (e.dead || e.arriving) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < radius) {
        e.slowT = 0.2;
        e.slowMul = bossSlowFactor(e, slowMul);
      }
    }
    // draw field
    game.effects.push({
      type: "chronoField", x: player.x, y: player.y, r: radius, life: 0.1, maxLife: 0.1,
    });
  }

  // --- Chrono freeze: periodic pulse ---
  if (cf?.id === "chronoFreeze") {
    powerState.freezeT -= dt;
    if (powerState.freezeT <= 0) {
      powerState.freezeT = 4.5 - (cf.stack - 1) * 0.8;
      const dur = 0.7 + (cf.stack - 1) * 0.35;
      for (const e of enemies.list) {
        if (e.dead || e.arriving) continue;
        const imm = e.isBoss ? dur * 0.35 : dur;
        e.frozen = Math.max(e.frozen, imm);
        e.stunResist = Math.min(3, (e.stunResist || 0) + 0.35);
      }
      audio.play("freeze");
      fx.burst(player.x, player.y, { color: "#7df9ff", count: 24, speed: 260, life: 0.6, size: 3 });
      fx.shake(3, 0.2);
    }
  }

  // --- Gravity well ---
  const sg = powerState.active.singularity;
  if (sg?.id === "voidWell") {
    powerState.wellT -= dt;
    if (powerState.wellT <= 0) {
      powerState.wellT = 5;
      game.effects.push({
        type: "well", x: rand(80, game.bounds.w - 80), y: rand(80, game.bounds.h * 0.5),
        life: 3.2, maxLife: 3.2, r: 150, power: 260 + (sg.stack - 1) * 80,
      });
    }
  }

  // --- Chain lightning passive handled on hit ---
  // --- Void nova periodic ---
  if (sg?.id === "voidNova") {
    powerState.novaT -= dt;
    if (powerState.novaT <= 0) {
      powerState.novaT = 5.5 - (sg.stack - 1) * 0.9;
      triggerNova(game, 120 + (sg.stack - 1) * 40);
    }
  }

  // --- Aegis reflect: mark window ---
  const ag = powerState.active.aegis;
  if (ag?.id === "aegisReflect") {
    powerState.reflectT = 1; // active
  } else {
    powerState.reflectT = 0;
  }

  // --- Drones spawn charges handled by game via spawnDrone ---
  for (const fam of Object.keys(powerState.active)) {
    const st = powerState.active[fam];
    if (VARIANTS[st.id].family === "drone") {
      // ensure drones exist up to stack
      game.syncDrones?.(st);
      // tick duration
      if (!game.inBreather) {
        st.t -= dt;
        if (st.t <= 0) {
          deactivateFamily(fam);
          events.emit("power:changed", {});
        }
      }
    }
  }
}

function bossSlowFactor(e, mul) {
  if (e.isBoss) return 1 - (1 - mul) * 0.4; // bosses resist
  return mul;
}

export function triggerNova(game, dmg) {
  audio.play("nova");
  fx.shake(8, 0.35);
  fx.explosion(player.x, player.y, "#9d5cff", 2.2);
  // clear enemy bullets
  for (const b of bullets.enemy) {
    fx.burst(b.x, b.y, { color: "#9d5cff", count: 2, speed: 60, life: 0.25, size: 2 });
  }
  bullets.enemy.length = 0;
  // damage enemies in radius
  const R = 340;
  for (const e of enemies.list) {
    if (e.dead || e.arriving) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < R) {
      const falloff = 1 - (d / R) * 0.5;
      enemies.damage(e, dmg * falloff * (e.isBoss ? 0.6 : 1));
      if (e.dead) events.emit("enemy:killed", { enemy: e });
    }
  }
  game.effects.push({ type: "novaRing", x: player.x, y: player.y, life: 0.5, maxLife: 0.5, r: R });
}

/** Called when player takes damage — aegis absorb */
export function tryAegisAbsorb(damage) {
  const ag = powerState.active.aegis;
  if (!ag) return false;
  if (ag.id === "aegisShield" || ag.id === "aegisNova") {
    if (powerState.aegisHp > 0) {
      powerState.aegisHp -= damage;
      if (powerState.aegisHp <= 0) {
        powerState.aegisHp = 0;
        audio.play("shieldBreak");
        if (powerState.shieldBrokenNova) {
          // explode
          triggerNova({ effects: [], bounds: { w: 800, h: 600 }, syncDrones: null }, 80);
          // full clear nearby
          for (const b of bullets.enemy) b.dead = true;
          bullets.enemy.length = 0;
        }
        deactivateFamily("aegis");
        events.emit("power:changed", {});
      }
      return true;
    }
  }
  return false;
}

/** Called after a player bullet hits an enemy — chain lightning */
export function tryChainLightning(hitEnemy, game) {
  const st = powerState.active.singularity;
  if (!st || st.id !== "voidChain") return;
  if (hitEnemy.dead || hitEnemy.arriving) return;
  const maxChain = Math.min(6, 2 + st.stack); // hard cap
  const dmg = 10 + (st.stack - 1) * 5;
  const chained = new Set([hitEnemy.id]);
  let current = hitEnemy;
  const bolts = [{ x0: hitEnemy.x, y0: hitEnemy.y, x1: hitEnemy.x, y1: hitEnemy.y }];

  for (let i = 0; i < maxChain; i++) {
    let next = null;
    let bestD = 180 * 180;
    for (const e of enemies.list) {
      if (e.dead || e.arriving || chained.has(e.id)) continue;
      const d = (e.x - current.x) ** 2 + (e.y - current.y) ** 2;
      if (d < bestD) { bestD = d; next = e; }
    }
    if (!next) break;
    chained.add(next.id);
    bolts.push({ x0: current.x, y0: current.y, x1: next.x, y1: next.y });
    enemies.damage(next, dmg * Math.pow(0.85, i));
    if (next.dead) events.emit("enemy:killed", { enemy: next });
    current = next;
  }

  if (bolts.length > 1) {
    audio.play("zap");
    game.effects.push({ type: "chainBolt", life: 0.18, maxLife: 0.18, bolts });
  }
}

/** Random drop table — balanced */
export function rollPowerupDrop(wave, isElite = false) {
  // weights shift over waves for variety; not all available from wave 1
  const pool = [];
  const add = (id, w) => pool.push({ id, w });

  add("spread", 16);
  add("pierce", 12);
  add("ricochet", 10);
  add("droneAttack", 10);
  add("droneShield", 8);
  add("droneMagnet", 7);
  add("chronoField", 8);
  add("chronoFreeze", 8);
  add("chronoHaste", 9);
  add("aegisShield", 12);
  add("aegisReflect", 7);
  add("aegisNova", 6);
  add("voidWell", 7);
  add("voidChain", 8);
  add("voidNova", 6);

  if (wave >= 3) pool.forEach((p) => { if (p.id.startsWith("drone") || p.id.startsWith("void")) p.w += 3; });
  if (isElite) pool.forEach((p) => p.w *= 1.3);

  let total = 0;
  for (const p of pool) total += p.w;
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.id;
  }
  return "spread";
}

/** Create a falling pickup entity */
export function createPickup(x, y, variantId, opts = {}) {
  const def = VARIANTS[variantId];
  const fam = FAMILIES[def.family];
  return {
    x, y,
    vx: opts.vx ?? rand(-30, 30),
    vy: opts.vy ?? rand(60, 90),
    r: 14,
    id: variantId,
    family: def.family,
    color: fam.color,
    icon: def.icon,
    name: def.name,
    t: 0,
    life: opts.life ?? 14,
    dead: false,
    magnet: false,
  };
}

export function updatePickup(p, dt, game) {
  p.t += dt;
  p.life -= dt;
  if (p.life <= 0) { p.dead = true; return; }

  // magnet drone / proximity magnet
  const magnetDrone = game.drones?.some((d) => d.kind === "magnet");
  const distToPlayer = Math.hypot(p.x - player.x, p.y - player.y);
  if (magnetDrone || (p.magnet && distToPlayer < 220)) {
    const dx = player.x - p.x, dy = player.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = magnetDrone ? 520 : 340;
    p.x += (dx / d) * sp * dt;
    p.y += (dy / d) * sp * dt;
  } else {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // slight sway
    p.vx += Math.sin(p.t * 3) * 8 * dt;
    p.vx = clamp(p.vx, -60, 60);
  }

  // trail sparkles
  if (chance(dt * 8)) {
    fx.add({
      x: p.x + rand(-8, 8), y: p.y + rand(-8, 8),
      vx: 0, vy: 30, life: 0.4, maxLife: 0.4,
      size: 2, color: p.color, drag: 0.95, glow: true,
    });
  }

  if (p.y > game.bounds.h + 40) p.dead = true;
  if (p.x < -30 || p.x > game.bounds.w + 30) p.dead = true;
}

export function drawPickup(ctx, p) {
  const pulse = 1 + Math.sin(p.t * 6) * 0.1;
  const fade = p.life < 3 ? (Math.floor(p.t * 8) % 2 === 0 ? 0.35 : 1) : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = fade;
  ctx.rotate(p.t * 1.5);
  ctx.scale(pulse, pulse);
  // hex shell
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = p.color;
  ctx.fillStyle = "rgba(5,6,14,.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const px = Math.cos(a) * p.r, py = Math.sin(a) * p.r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // icon
  ctx.rotate(-p.t * 1.5);
  ctx.fillStyle = p.color;
  ctx.font = `700 ${p.r + 4}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.icon, 0, 1);
  ctx.restore();
  ctx.globalAlpha = 1;
}
