import { rand, clamp, TAU, dist2, chance } from "../core/utils.js";
import { bullets } from "./bullets.js";
import { fx } from "./particles.js";
import { audio } from "../core/audio.js";

// late-bound to avoid circular import issues at module init
let bossUpdateFn = null;
let bossDrawFn = null;
export function setBossHooks({ update, drawTelegraph } = {}) {
  if (update) bossUpdateFn = update;
  if (drawTelegraph) bossDrawFn = drawTelegraph;
}

let eid = 0;

/**
 * Enemy archetypes registry.
 * Each def: { hp, score, r, w, h, color, behavior(state, self, ctx, dt) }
 * ctx = { player, bounds, wave, difficulty }
 */
export const ARCHETYPES = {
  grunt: {
    hp: 20, score: 100, w: 28, h: 24, color: "#ff5c7a",
    fireCd: [1.4, 2.6], fireChance: 0.45,
  },
  swooper: {
    hp: 16, score: 150, w: 26, h: 22, color: "#ffb03d",
    fireCd: [1.8, 3.0], fireChance: 0.3,
  },
  swarmling: {
    hp: 8, score: 60, w: 18, h: 18, color: "#b6ff3d",
    fireCd: [2.2, 3.5], fireChance: 0.2,
  },
  armored: {
    hp: 70, score: 250, w: 36, h: 30, color: "#9d5cff",
    fireCd: [1.2, 2.0], fireChance: 0.6, armor: 0.45,
  },
  sniper: {
    hp: 24, score: 200, w: 26, h: 26, color: "#35f0ff",
    fireCd: [2.0, 3.2], fireChance: 0.9,
  },
  carrier: {
    hp: 120, score: 500, w: 52, h: 40, color: "#ff3df0",
    fireCd: [1.6, 2.4], fireChance: 0.5, spawns: "swarmling",
  },
};

export function spawnEnemy(type, x, y, opts = {}) {
  const def = ARCHETYPES[type];
  if (!def) return null;
  const wave = opts.wave || 1;
  const hpScale = opts.hpScale ?? (1 + (wave - 1) * 0.12);
  const e = {
    id: ++eid,
    type,
    x, y,
    vx: 0, vy: 0,
    w: def.w, h: def.h,
    hp: Math.round(def.hp * hpScale),
    maxHp: Math.round(def.hp * hpScale),
    score: def.score,
    color: def.color,
    armor: def.armor || 0,
    dead: false,
    // warp-in arrival: invulnerable, no damage to player
    arriving: true,
    arriveT: 0,
    arriveDur: opts.arriveDur ?? rand(0.35, 0.7),
    spawnX: x,
    spawnY: y,
    targetX: opts.targetX ?? x,
    targetY: opts.targetY ?? y,
    // behavior state
    t: 0,
    fireTimer: rand(def.fireCd[0], def.fireCd[1]),
    phase: rand(TAU),
    homeX: opts.homeX ?? x,
    homeY: opts.homeY ?? y,
    pattern: opts.pattern || "hover",
    seed: rand(1000),
    frozen: 0,          // chrono freeze
    slowT: 0,           // chrono slow
    slowMul: 1,
    stunResist: 0,
    flash: 0,
    hpBarT: 0,
    showHp: false,
    def,
    extras: opts.extras || {},
  };
  return e;
}

export const enemies = {
  list: [],

  clear() { this.list.length = 0; },

  add(e) { if (e) this.list.push(e); return e; },

  update(dt, ctx) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.frozen > 0) {
        e.frozen -= dt;
        // frozen: skip movement/attacks
        if (e.frozen <= 0) e.flash = 0;
        continue;
      }
      let mul = 1;
      if (e.slowT > 0) {
        e.slowT -= dt;
        mul = e.slowMul;
      }
      const sdt = dt * mul;

      // arrival animation
      if (e.arriving) {
        e.arriveT += dt;
        const p = clamp(e.arriveT / e.arriveDur, 0, 1);
        // ease out cubic
        const ease = 1 - Math.pow(1 - p, 3);
        e.x = e.spawnX + (e.targetX - e.spawnX) * ease;
        e.y = e.spawnY + (e.targetY - e.spawnY) * ease;
        if (p >= 1) {
          e.arriving = false;
          e.x = e.targetX; e.y = e.targetY;
          e.homeX = e.x; e.homeY = e.y;
        }
        continue;
      }

      if (e.isBoss && bossUpdateFn) {
        bossUpdateFn(e, sdt, ctx);
      } else {
        const key = (e.pattern && e.pattern !== "hover" && behavior[e.pattern]) ? e.pattern : e.type;
        behavior[key]?.(e, sdt, ctx);
      }

      // keep in bounds loosely
      const b = ctx.bounds;
      e.x = clamp(e.x, e.w / 2, b.w - e.w / 2);
      if (e.y > b.h + 60) e.y = b.h + 60;

      // fire timer (bosses use own AI)
      if (!e.arriving && ctx.player.alive && !e.isBoss) {
        e.fireTimer -= sdt;
        if (e.fireTimer <= 0) {
          const def = e.def;
          e.fireTimer = rand(def.fireCd[0], def.fireCd[1]) * (e.extras.fireMul || 1);
          if (chance(def.fireChance)) tryFire(e, ctx);
        }
      }
    }
  },

  damage(e, amount) {
    if (e.dead || e.arriving) return 0;
    let dmg = amount;
    if (e.armor > 0) dmg *= 1 - e.armor;
    e.hp -= dmg;
    e.flash = 0.1;
    e.showHp = true;
    e.hpBarT = 2;
    audio.play("enemyHit");
    fx.burst(e.x, e.y, { color: e.color, count: 4, speed: 90, life: 0.25, size: 2 });
    if (e.hp <= 0) {
      e.dead = true;
      return dmg;
    }
    return dmg;
  },

  /** remove dead, return killed list */
  sweep() {
    const killed = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) killed.push(this.list[i]);
    }
    return killed;
  },

  removeDead() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) this.list.splice(i, 1);
    }
  },

  draw(ctx) {
    for (const e of this.list) drawEnemy(ctx, e);
  },
};

/* ---------- behaviors ---------- */
const behavior = {
  grunt(e, dt, ctx) {
    // march side to side, slowly descend
    e.phase += dt * 1.6;
    e.x = e.homeX + Math.sin(e.phase + e.seed) * 46;
    e.y = e.homeY + Math.sin(e.phase * 0.5) * 8 + Math.min(30, e.t * 3);
  },

  swooper(e, dt, ctx) {
    // dive toward player x periodically
    const p = ctx.player;
    if (!e.extras.diveT) e.extras.diveT = rand(0.8, 2);
    e.extras.diveT -= dt;
    if (e.extras.diveT <= 0) {
      e.extras.diving = true;
      e.extras.diveT = rand(2.2, 3.5);
      e.extras.dvx = (p.x - e.x) * 1.4;
    }
    if (e.extras.diving) {
      e.vy = 260;
      e.vx = e.extras.dvx * 0.6;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.y > ctx.bounds.h * 0.75) {
        e.extras.diving = false;
        // return arc
        e.y = ctx.bounds.h * 0.4;
        e.x = clamp(e.x + rand(-80, 80), 30, ctx.bounds.w - 30);
        e.homeX = e.x; e.homeY = e.y;
      }
    } else {
      e.phase += dt * 2.2;
      e.x = e.homeX + Math.sin(e.phase + e.seed) * 70;
      e.y = e.homeY + Math.cos(e.phase * 0.7) * 20;
      fx.trail(e.x, e.y + 8, "#ffb03d", 2);
    }
  },

  swarmling(e, dt, ctx) {
    const p = ctx.player;
    e.phase += dt * 3;
    // seek player with wander
    const dx = p.x - e.x;
    const dy = (p.y - 90) - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 120;
    e.x += ((dx / d) * sp + Math.sin(e.phase + e.seed) * 60) * dt;
    e.y += ((dy / d) * sp * 0.7 + Math.cos(e.phase * 1.3) * 40) * dt;
  },

  armored(e, dt, ctx) {
    // slow heavy advance, shield faces player
    e.phase += dt * 0.8;
    e.y += 18 * dt;
    e.x = e.homeX + Math.sin(e.phase + e.seed) * 30;
    if (e.y > ctx.bounds.h * 0.55) e.y = ctx.bounds.h * 0.55;
  },

  sniper(e, dt, ctx) {
    // hold high, strafe, aimed shots (behavior of fire handled in tryFire)
    e.phase += dt * 1.1;
    const targetY = ctx.bounds.h * 0.16;
    e.y += (targetY - e.y) * Math.min(1, dt * 1.5);
    e.x = e.homeX + Math.sin(e.phase + e.seed) * 110;
    if (e.extras.telegraph > 0) e.extras.telegraph -= dt;
  },

  carrier(e, dt, ctx) {
    e.phase += dt * 0.6;
    e.y += 10 * dt;
    e.x = e.homeX + Math.sin(e.phase + e.seed) * 60;
    if (e.y > ctx.bounds.h * 0.4) e.y = ctx.bounds.h * 0.4;
    // spawn swarmlings periodically
    if (!e.extras.spawnT) e.extras.spawnT = 3.5;
    e.extras.spawnT -= dt;
    if (e.extras.spawnT <= 0 && ctx.allowSpawnMinion?.()) {
      e.extras.spawnT = rand(3, 5);
      const n = 2;
      for (let i = 0; i < n; i++) {
        ctx.spawnMinion?.("swarmling", e.x + (i ? 18 : -18), e.y + 14, { wave: ctx.wave });
      }
      fx.burst(e.x, e.y, { color: "#ff3df0", count: 10, speed: 120, life: 0.4 });
    }
  },

  // pattern overrides (selected via e.pattern)
  orbit(e, dt, ctx) {
    const x = e.extras;
    if (x.ox == null) { behavior.grunt(e, dt, ctx); return; }
    x.oa += dt * 0.7 * (x.os || 1);
    e.x = x.ox + Math.cos(x.oa) * x.or;
    e.y = x.oy + Math.sin(x.oa) * x.or * 0.55;
    e.homeX = e.x; e.homeY = e.y;
  },

  pincerL(e, dt, ctx) {
    e.y += (28 + (e.seed % 20)) * dt;
    e.x = e.homeX + Math.sin(e.t * 2 + e.seed) * 36 + Math.min(80, e.t * 22);
    if (e.y > ctx.bounds.h * 0.7) e.homeY = e.y = ctx.bounds.h * 0.3;
  },

  pincerR(e, dt, ctx) {
    e.y += (28 + (e.seed % 20)) * dt;
    e.x = e.homeX + Math.sin(e.t * 2 + e.seed) * 36 - Math.min(80, e.t * 22);
    if (e.y > ctx.bounds.h * 0.7) e.homeY = e.y = ctx.bounds.h * 0.3;
  },
};

/* ---------- attacks ---------- */
function tryFire(e, ctx) {
  const p = ctx.player;
  if (!p.alive) return;
  const type = e.type;

  if (type === "sniper") {
    // telegraph then fast aimed shot
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 520;
    bullets.spawnEnemy({
      x: e.x, y: e.y + 8,
      vx: (dx / d) * sp, vy: (dy / d) * sp,
      w: 6, h: 6, kind: "orb",
      dmg: 14, color: "#35f0ff", life: 3.5,
    });
    audio.play("enemyShoot");
    fx.burst(e.x, e.y, { color: "#35f0ff", count: 5, speed: 80, life: 0.25, size: 2 });
    return;
  }

  if (type === "armored") {
    // 3-way
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let k = -1; k <= 1; k++) {
      const a = base + k * 0.3;
      bullets.spawnEnemy({
        x: e.x, y: e.y + 10,
        vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        w: 7, h: 7, kind: "orb", dmg: 12, color: "#9d5cff", life: 4,
      });
    }
    audio.play("enemyShoot");
    return;
  }

  if (type === "carrier") {
    // ring burst
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + e.phase;
      bullets.spawnEnemy({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
        w: 6, h: 6, kind: "orb", dmg: 10, color: "#ff3df0", life: 4,
      });
    }
    audio.play("enemyShoot");
    return;
  }

  if (type === "swooper" && e.extras.diving) {
    // shot while diving
    bullets.spawnEnemy({
      x: e.x, y: e.y + 10,
      vx: 0, vy: 380,
      w: 5, h: 12, dmg: 12, color: "#ffb03d", life: 3,
    });
    audio.play("enemyShoot");
    return;
  }

  // default aimed bolt (grunt / swarmling)
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = type === "swarmling" ? 260 : 320;
  bullets.spawnEnemy({
    x: e.x, y: e.y + e.h / 2,
    vx: (dx / d) * sp, vy: (dy / d) * sp,
    w: 5, h: 12, dmg: 10, color: e.color, life: 4,
  });
  audio.play("enemyShoot");
}

/* ---------- drawing ---------- */
function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.arriving) {
    const p = clamp(e.arriveT / e.arriveDur, 0, 1);
    ctx.globalAlpha = 0.3 + p * 0.7;
    const s = 1.6 - p * 0.6;
    ctx.scale(s, s);
    // warp streaks
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = (1 - p) * 0.6;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(rand(-20, 20), -40 - i * 12);
      ctx.lineTo(rand(-8, 8), -10);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.3 + p * 0.7;
  }

  if (e.frozen > 0) {
    ctx.globalAlpha *= 0.75;
    ctx.shadowColor = "#7df9ff";
    ctx.shadowBlur = 16;
  } else {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;
  }

  const col = e.flash > 0 ? "#ffffff" : e.color;
  ctx.fillStyle = col;

  const w = e.w, h = e.h;
  if (e.isBoss) {
    // unique boss hulls by bossKey
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    if (e.bossKey === "widow") {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.beginPath(); ctx.ellipse(0, -4, w * 0.28, h * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(-w / 2 - 6, -h / 4, 10, h / 2);
      ctx.fillRect(w / 2 - 4, -h / 4, 10, h / 2);
      // legs
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.3, h * 0.3);
        ctx.lineTo(i * w * 0.55, h * 0.55);
        ctx.stroke();
      }
    } else if (e.bossKey === "archon") {
      ctx.rotate(e.t * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? w / 2 : w / 3;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.rotate(-e.t * 0.4);
    } else {
      // bulwark — heavy fortress
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, -h / 4);
      ctx.lineTo(w / 2, h / 3);
      ctx.lineTo(w / 4, h / 2);
      ctx.lineTo(-w / 4, h / 2);
      ctx.lineTo(-w / 2, h / 3);
      ctx.lineTo(-w / 2, -h / 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.fillRect(-w * 0.2, -h * 0.15, w * 0.4, h * 0.3);
      ctx.fillStyle = col;
      ctx.fillRect(-w / 2 - 4, -h / 6, 8, h / 2);
      ctx.fillRect(w / 2 - 4, -h / 6, 8, h / 2);
      // core
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(e.t * 4) * 2, 0, TAU); ctx.fill();
    }
    // phase pips
    ctx.fillStyle = "#fff";
    for (let i = 0; i <= (e.phaseIdx || 0); i++) {
      ctx.fillRect(-18 + i * 14, -h / 2 - 8, 10, 4);
    }
  } else
  switch (e.type) {
    case "grunt": {
      // classic invader-ish wedge
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(-w / 2, -h / 4);
      ctx.lineTo(-w / 4, -h / 2);
      ctx.lineTo(w / 4, -h / 2);
      ctx.lineTo(w / 2, -h / 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.fillRect(-w * 0.22, -h * 0.12, 5, 5);
      ctx.fillRect(w * 0.22 - 5, -h * 0.12, 5, 5);
      break;
    }
    case "swooper": {
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(-w / 2, -h / 3);
      ctx.lineTo(0, -h / 6);
      ctx.lineTo(w / 2, -h / 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case "swarmling": {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + e.t * 3;
        const r = w / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "armored": {
      // hex tank
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const px = Math.cos(a) * (w / 2), py = Math.sin(a) * (h / 2);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = col;
      // shoulder plates
      ctx.fillRect(-w / 2 - 4, -6, 6, 16);
      ctx.fillRect(w / 2 - 2, -6, 6, 16);
      break;
    }
    case "sniper": {
      // diamond + barrel
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(0, h / 2);
      ctx.lineTo(-w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(-2, 0, 4, h / 2 + 6);
      break;
    }
    case "carrier": {
      // big oval hull
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#05060e";
      ctx.beginPath();
      ctx.ellipse(0, 2, w * 0.3, h * 0.28, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col;
      // pods
      ctx.fillRect(-w / 2 + 4, -4, 8, 14);
      ctx.fillRect(w / 2 - 12, -4, 8, 14);
      break;
    }
    default: {
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
  }

  // freeze overlay
  if (e.frozen > 0) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#7df9ff";
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // boss telegraph overlay
  if (e.isBoss && bossDrawFn) bossDrawFn(ctx, e);

  // hp bar when damaged
  if (e.showHp && e.hp < e.maxHp && !e.arriving) {
    if (e.hpBarT > 0) e.hpBarT -= 0.016;
    const bw = e.w;
    const bx = e.x - bw / 2;
    const by = e.y - e.h / 2 - 7;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? "#b6ff3d" : "#ff4d6d";
    ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}
