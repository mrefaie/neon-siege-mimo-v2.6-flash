import { input } from "../core/input.js";
import { audio } from "../core/audio.js";
import { events } from "../core/events.js";
import { clamp, TAU } from "../core/utils.js";
import { bullets } from "./bullets.js";
import { fx } from "./particles.js";

const PLAYER_W = 34;
const PLAYER_H = 28;
const BASE_SPEED = 420;
const DASH_SPEED = 1150;
const DASH_TIME = 0.14;
const DASH_CD = 1.15;
const FIRE_INTERVAL = 0.14;
const IFRAME_TIME = 0.9;

export const player = {
  x: 0, y: 0, w: PLAYER_W, h: PLAYER_H,
  vx: 0, vy: 0,
  hp: 100, maxHp: 100,
  alive: true,
  fireTimer: 0,
  dashCd: 0,
  dashTime: 0,
  dashDir: 1,
  iFrames: 0,
  flash: 0,
  // weapon modifiers (from power-ups)
  weapon: {
    spread: 0,        // extra bullets per side
    pierce: 0,
    ricochet: 0,
    beam: false,
    fireRateMul: 1,   // <1 = faster
    dmgMul: 1,
  },
  hasteTimer: 0,      // chrono haste
  autofire: false,

  reset(w, h) {
    this.x = w / 2;
    this.y = h - 72;
    this.vx = 0; this.vy = 0;
    this.hp = this.maxHp = 100;
    this.alive = true;
    this.fireTimer = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.iFrames = 0;
    this.flash = 0;
    this.weapon = { spread: 0, pierce: 0, ricochet: 0, beam: false, fireRateMul: 1, dmgMul: 1 };
    this.hasteTimer = 0;
    this.autofire = false;
  },

  get rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  },

  speed() {
    return BASE_SPEED * (this.hasteTimer > 0 ? 1.35 : 1);
  },

  update(dt, bounds) {
    if (!this.alive) return;

    if (this.iFrames > 0) this.iFrames -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.hasteTimer > 0) this.hasteTimer -= dt;
    if (this.fireTimer > 0) this.fireTimer -= dt;

    // dash
    if (input.consumeDash() && this.dashCd <= 0 && this.dashTime <= 0) {
      const ax = input.axis();
      this.dashDir = ax !== 0 ? Math.sign(ax) : (this.vx !== 0 ? Math.sign(this.vx) : 1);
      this.dashTime = DASH_TIME;
      this.dashCd = DASH_CD;
      this.iFrames = Math.max(this.iFrames, DASH_TIME + 0.12);
      audio.play("dash");
      fx.burst(this.x, this.y, { color: "#9d5cff", count: 12, speed: 160, life: 0.35, size: 3 });
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir * DASH_SPEED;
      fx.trail(this.x - this.dashDir * 14, this.y + 8, "#9d5cff", 4);
    } else {
      const ax = input.axis();
      const sp = this.speed();
      // smooth accel
      const target = ax * sp;
      this.vx += (target - this.vx) * Math.min(1, dt * 18);
      if (ax === 0) this.vx *= Math.pow(0.001, dt);
      if (Math.abs(this.vx) < 4 && ax === 0) this.vx = 0;
      if (Math.abs(this.vx) > 4) fx.trail(this.x, this.y + 12, "#35f0ff", 2);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, this.w / 2 + 4, bounds.w - this.w / 2 - 4);
    this.y = clamp(this.y, bounds.h * 0.35, bounds.h - this.h / 2 - 10);

    // firing
    const firing = input.fire() || this.autofire;
    if (firing && this.fireTimer <= 0) {
      this.shoot();
      const interval = FIRE_INTERVAL * this.weapon.fireRateMul * (this.hasteTimer > 0 ? 0.7 : 1);
      this.fireTimer = Math.max(0.045, interval);
    }
  },

  shoot() {
    const w = this.weapon;
    const muzzleY = this.y - this.h / 2 - 4;
    const speeds = w.beam ? 1400 : 980;
    const dmg = (w.beam ? 16 : 12) * w.dmgMul;
    const count = 1 + w.spread;
    const spreadAng = 0.16;

    window.__gameStats && (window.__gameStats.shots += count);

    for (let i = 0; i < count; i++) {
      const off = i - (count - 1) / 2;
      const ang = -Math.PI / 2 + off * spreadAng;
      bullets.spawnPlayer({
        x: this.x + off * 6,
        y: muzzleY,
        vx: Math.cos(ang) * speeds,
        vy: Math.sin(ang) * speeds,
        w: w.beam ? 5 : 4,
        h: w.beam ? 22 : 14,
        dmg,
        color: w.beam ? "#b6ff3d" : (w.ricochet > 0 ? "#ffd23d" : "#35f0ff"),
        pierce: w.pierce,
        ricochet: w.ricochet,
        kind: w.beam ? "beam" : "bolt",
        life: 2.2,
      });
    }
    audio.play(w.beam ? "laser" : "shoot");
  },

  damage(amount) {
    if (!this.alive || this.iFrames > 0) return false;
    this.hp -= amount;
    this.iFrames = IFRAME_TIME;
    this.flash = 0.25;
    audio.play("playerHit");
    fx.shake(7, 0.28);
    fx.burst(this.x, this.y, { color: "#ff4d6d", count: 16, speed: 200, life: 0.5, size: 3 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      fx.explosion(this.x, this.y, "#35f0ff", 1.8);
      fx.explosion(this.x, this.y, "#ff3df0", 1.4);
      audio.play("bigExplode");
      fx.shake(14, 0.5);
      events.emit("player:died", {});
    }
    return true;
  },

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  },

  dashReady() {
    return this.dashCd <= 0;
  },

  draw(ctx) {
    if (!this.alive) return;
    // i-frame blink
    if (this.iFrames > 0 && Math.floor(this.iFrames * 18) % 2 === 0 && this.dashTime <= 0) {
      ctx.globalAlpha = 0.35;
    }
    if (this.flash > 0) ctx.globalAlpha = 0.5;

    ctx.save();
    ctx.translate(this.x, this.y);
    // bank lean
    const lean = clamp(this.vx / 500, -1, 1) * 0.22;
    ctx.rotate(lean);

    const hitFlash = this.flash > 0;
    const body = hitFlash ? "#ffffff" : "#35f0ff";

    // engine glow
    ctx.shadowColor = "#9d5cff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#9d5cff";
    ctx.beginPath();
    ctx.moveTo(-7, 10);
    ctx.lineTo(0, 20 + Math.random() * 6);
    ctx.lineTo(7, 10);
    ctx.closePath();
    ctx.fill();

    // wings
    ctx.shadowColor = body;
    ctx.shadowBlur = 12;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(14, 10);
    ctx.lineTo(6, 8);
    ctx.lineTo(4, 12);
    ctx.lineTo(-4, 12);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-14, 10);
    ctx.closePath();
    ctx.fill();

    // cockpit
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-2.5, -8, 5, 10);
    ctx.fillStyle = "#ff3df0";
    ctx.fillRect(-1.5, -6, 3, 5);

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // shield ring placeholder hook (aegis draws elsewhere)
  },
};
