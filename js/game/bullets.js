import { rand, clamp } from "../core/utils.js";

const MAX_PLAYER_BULLETS = 120;
const MAX_ENEMY_BULLETS = 220;

let pid = 0;

export function createBullet(opts) {
  return {
    id: ++pid,
    x: opts.x, y: opts.y,
    vx: opts.vx || 0, vy: opts.vy || 0,
    w: opts.w || 4, h: opts.h || 12,
    dmg: opts.dmg ?? 10,
    color: opts.color || "#35f0ff",
    life: opts.life ?? 3,
    pierce: opts.pierce || 0,       // remaining pierces
    ricochet: opts.ricochet || 0,   // remaining bounces
    from: opts.from || "player",    // player | enemy
    kind: opts.kind || "bolt",      // bolt | orb | beam
    homing: opts.homing || 0,
    target: opts.target || null,
    dead: false,
    age: 0,
  };
}

export const bullets = {
  player: [],
  enemy: [],

  clear() {
    this.player.length = 0;
    this.enemy.length = 0;
  },

  /** spawn respecting caps; returns bullet or null */
  spawnPlayer(b) {
    if (this.player.length >= MAX_PLAYER_BULLETS) {
      // drop oldest non-critical
      this.player.shift();
    }
    const bul = createBullet({ ...b, from: "player" });
    this.player.push(bul);
    return bul;
  },

  spawnEnemy(b) {
    if (this.enemy.length >= MAX_ENEMY_BULLETS) {
      this.enemy.shift();
    }
    const bul = createBullet({ ...b, from: "enemy" });
    this.enemy.push(bul);
    return bul;
  },

  update(dt, bounds) {
    this._step(this.player, dt, bounds);
    this._step(this.enemy, dt, bounds);
  },

  _step(list, dt, b) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      p.life -= dt;
      if (p.homing && p.target && !p.target.dead) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.vx = clamp(p.vx + (dx / d) * p.homing * 60 * dt * sp / 100, -sp, sp);
        p.vy = clamp(p.vy + (dy / d) * p.homing * 60 * dt * sp / 100, -sp, sp);
        // normalize-ish speed hold
        const cs = Math.hypot(p.vx, p.vy) || 1;
        const want = sp;
        p.vx = (p.vx / cs) * want;
        p.vy = (p.vy / cs) * want;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.ricochet > 0) {
        if (p.x < 4 || p.x > b.w - 4) {
          p.vx *= -1;
          p.ricochet--;
          p.x = clamp(p.x, 4, b.w - 4);
          p.color = "#ffd23d";
        }
        // top bounce for player bullets going up? no — only sides + bottom/top for enemy
      }

      if (p.life <= 0 || p.y < -30 || p.y > b.h + 30 || p.x < -40 || p.x > b.w + 40) {
        p.dead = true;
        list.splice(i, 1);
      }
    }
  },

  draw(ctx) {
    for (const p of this.player) drawBolt(ctx, p, false);
    for (const p of this.enemy) drawBolt(ctx, p, true);
  },
};

function drawBolt(ctx, p, isEnemy) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const ang = Math.atan2(p.vy, p.vx) - Math.PI / 2;
  ctx.rotate(ang);
  ctx.shadowColor = p.color;
  ctx.shadowBlur = isEnemy ? 10 : 8;
  ctx.fillStyle = p.color;

  if (p.kind === "orb") {
    const r = Math.max(p.w, p.h) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "beam") {
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#fff";
    ctx.fillRect(-p.w / 4, -p.h / 2, p.w / 2, p.h);
  } else {
    // bolt: elongated rounded rect
    const w = p.w, h = p.h;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w / 2);
    ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#fff";
    ctx.fillRect(-w / 4, -h / 2 + 1, w / 2, h - 2);
  }
  ctx.restore();
}
