import { rand, TAU, clamp } from "../core/utils.js";

const MAX_PARTICLES = 400;

export const fx = {
  particles: [],
  stars: [],
  shakeMag: 0,
  shakeTime: 0,
  reducedMotion: false,
  shakeEnabled: true,
  w: 800,
  h: 600,

  init(w, h) {
    this.w = w; this.h = h;
    this.particles.length = 0;
    this.stars.length = 0;
    const count = Math.min(160, Math.floor((w * h) / 9000));
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: rand(w), y: rand(h),
        z: rand(0.2, 1),
        s: rand(0.5, 2),
        tw: rand(TAU),
      });
    }
  },

  resize(w, h) {
    const sx = w / (this.w || w);
    const sy = h / (this.h || h);
    this.w = w; this.h = h;
    for (const st of this.stars) {
      st.x *= sx; st.y *= sy;
    }
    while (this.stars.length < Math.min(160, Math.floor((w * h) / 9000))) {
      this.stars.push({ x: rand(w), y: rand(h), z: rand(0.2, 1), s: rand(0.5, 2), tw: rand(TAU) });
    }
  },

  shake(mag, time = 0.25) {
    if (!this.shakeEnabled || this.reducedMotion) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  },

  add(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  },

  burst(x, y, { color = "#35f0ff", count = 14, speed = 180, life = 0.5, size = 3 } = {}) {
    if (this.reducedMotion) count = Math.min(count, 6);
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const sp = rand(speed * 0.3, speed);
      this.add({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life),
        maxLife: life,
        size: rand(size * 0.5, size),
        color,
        drag: 0.92,
        glow: true,
      });
    }
  },

  explosion(x, y, color = "#ff8a3d", scale = 1) {
    this.burst(x, y, { color, count: Math.round(22 * scale), speed: 240 * scale, life: 0.7, size: 4 * scale });
    this.burst(x, y, { color: "#ffffff", count: Math.round(8 * scale), speed: 140 * scale, life: 0.35, size: 2.5 * scale });
    this.add({
      x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
      size: 6 * scale, color, drag: 1, glow: true, ring: true,
    });
  },

  trail(x, y, color = "#35f0ff", size = 2) {
    this.add({
      x: x + rand(-2, 2), y: y + rand(-2, 2),
      vx: rand(-20, 20), vy: rand(30, 80),
      life: rand(0.2, 0.45), maxLife: 0.45,
      size: rand(1, size), color, drag: 0.95, glow: true,
    });
  },

  textPop(x, y, text, color = "#ffb03d") {
    this.add({
      x, y, vx: 0, vy: -50, life: 0.9, maxLife: 0.9,
      size: 13, color, drag: 0.96, glow: true, text,
    });
  },

  update(dt) {
    // starfield
    for (const st of this.stars) {
      st.y += (18 + st.z * 55) * dt;
      st.tw += dt * (1 + st.z * 2);
      if (st.y > this.h + 4) { st.y = -4; st.x = rand(this.w); }
    }
    // particles
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.drag && p.drag !== 1) {
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
      }
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) { this.shakeMag = 0; this.shakeTime = 0; }
    }
  },

  drawBackground(ctx) {
    const { w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#070a1a");
    g.addColorStop(0.55, "#05060e");
    g.addColorStop(1, "#0a0618");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint nebula bands
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#35f0ff";
    ctx.fillRect(0, h * 0.28, w, 2);
    ctx.fillStyle = "#ff3df0";
    ctx.fillRect(0, h * 0.66, w, 1.5);
    ctx.globalAlpha = 1;

    for (const st of this.stars) {
      const a = 0.35 + 0.55 * st.z * (0.6 + 0.4 * Math.sin(st.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = st.z > 0.7 ? "#cfe8ff" : "#8fb4e8";
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    ctx.globalAlpha = 1;
  },

  drawParticles(ctx) {
    for (const p of this.particles) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = t;
      if (p.text) {
        ctx.font = `700 ${p.size}px "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillText(p.text, p.x, p.y);
        ctx.shadowBlur = 0;
        continue;
      }
      if (p.ring) {
        const r = p.size + (1 - t) * 36;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        continue;
      }
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t * 0.5);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  },

  getShake() {
    if (!this.shakeEnabled || this.reducedMotion || this.shakeMag <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag * (this.shakeTime > 0 ? 1 : 0);
    return { x: rand(-m, m), y: rand(-m, m) };
  },

  clear() {
    this.particles.length = 0;
    this.shakeMag = 0;
    this.shakeTime = 0;
  },
};
