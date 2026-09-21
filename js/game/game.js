import { events } from "../core/events.js";
import { audio } from "../core/audio.js";
import { clamp, rand, chance } from "../core/utils.js";
import { input } from "../core/input.js";
import { fx } from "./particles.js";
import { bullets } from "./bullets.js";
import { enemies, spawnEnemy } from "./enemies.js";
import { player } from "./player.js";
import { resolveCollisions } from "./collisions.js";
import { waveDirector } from "./waves.js";
import { spawnBoss as spawnBossDesign, bossUpdate, drawBossTelegraph } from "./bosses.js";
import { setBossHooks } from "./enemies.js";
import {
  powerState, resetPowerState, applyPowerup, updatePowerups,
  createPickup, updatePickup, drawPickup, rollPowerupDrop,
  tryAegisAbsorb, VARIANT_IDS, VARIANTS,
} from "./powerups.js";
import { hud } from "./hud.js";

setBossHooks({ update: bossUpdate, drawTelegraph: drawBossTelegraph });

/** Combo / scoring */
const combo = {
  mult: 1,
  chain: 0,
  timer: 0,
  window: 2.5,
  killsThisWave: 0,
  waveBonusApplied: false,
};

export const game = {
  mode: "boot",          // boot | menu | playing | paused | gameover
  bounds: { w: 800, h: 600 },
  score: 0,
  runTime: 0,
  kills: 0,
  shotsFired: 0,
  hits: 0,
  wavesCleared: 0,
  pickups: [],           // falling power-ups (persist across waves)
  effects: [],           // transient world effects (wells, rings)
  drones: [],
  pendingSpawns: 0,
  inBreather: false,
  enemiesAlive: 0,
  hiscore: 0,
  _spawnGuard: new Set(),
  _listenersBound: false,
  _scoreSubmitted: false,
  stats: { lastWave: 0, bestCombo: 1, multikills: 0 },

  init(hiscore) {
    this.hiscore = hiscore || 0;
    if (!this._listenersBound) {
      this._bindEvents();
      this._listenersBound = true;
    }
  },

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    events.on("enemy:killed", ({ enemy }) => this.onEnemyKilled(enemy));
    events.on("pickup:collected", ({ pickup }) => this.onPickup(pickup));
    events.on("player:died", () => this.onPlayerDied());
    events.on("drones:clear", () => this.clearDrones());
  },

  setBounds(w, h) {
    // resize preserves relative positions; never resets gameplay
    const ow = this.bounds.w, oh = this.bounds.h;
    this.bounds.w = w;
    this.bounds.h = h;
    if (ow && oh && (ow !== w || oh !== h)) {
      const sx = w / ow, sy = h / oh;
      for (const e of enemies.list) {
        e.x *= sx; e.y *= sy;
        e.homeX *= sx; e.homeY *= sy;
        e.spawnX *= sx; e.spawnY *= sy;
        e.targetX *= sx; e.targetY *= sy;
      }
      for (const p of this.pickups) { p.x *= sx; p.y *= sy; }
      for (const p of bullets.player) { p.x *= sx; p.y *= sy; }
      for (const p of bullets.enemy) { p.x *= sx; p.y *= sy; }
      for (const d of this.drones) { d.x *= sx; d.y *= sy; }
      for (const e of this.effects) { e.x *= sx; e.y *= sy; }
      player.x = clamp(player.x * sx, 20, w - 20);
      player.y = clamp(player.y * sy, h * 0.35, h - 20);
    }
  },

  /** ONLY this resets the world */
  startNewRun() {
    this.mode = "playing";
    this.score = 0;
    this.runTime = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.hits = 0;
    this.wavesCleared = 0;
    this._scoreSubmitted = false;
    this.stats = { lastWave: 0, bestCombo: 1, multikills: 0 };
    window.__gameStats = { shots: 0, hits: 0 };

    bullets.clear();
    enemies.clear();
    fx.clear();
    this.pickups.length = 0;
    this.effects.length = 0;
    this.clearDrones();
    resetPowerState();
    player.reset(this.bounds.w, this.bounds.h);
    window.__gameStats = { shots: 0, hits: 0 };

    combo.mult = 1;
    combo.chain = 0;
    combo.timer = 0;
    combo.killsThisWave = 0;
    combo.waveBonusApplied = false;
    window.__score = 0;
    window.__mult = 1;

    waveDirector.start();
    hud.renderPowerups();
    hud.show(true);
    events.emit("run:started", {});
    audio.startMusic();
  },

  quitToMenu() {
    this.mode = "menu";
    audio.stopMusic();
    hud.show(false);
    hud.showCombo(null);
    // world left as-is but hidden; menu is clean
  },

  pause() {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    audio.stopMusic();
    events.emit("game:paused", {});
    // show pause overlay if menu is listening
    events.emit("ui:pause", {});
  },

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    audio.startMusic();
    events.emit("game:resumed", {});
    events.emit("ui:resume", {});
  },

  togglePause() {
    if (this.mode === "playing") this.pause();
    else if (this.mode === "paused") this.resume();
  },

  /* ---------------- update ---------------- */
  update(dt) {
    if (this.mode !== "playing") return;

    this.runTime += dt;
    this.inBreather = waveDirector.state === "breather";

    // player
    player.update(dt, this.bounds);

    // wave director (after spawn processing from previous events would be ideal;
    // process wave events first so same-frame spawns count)
    const waveEvents = waveDirector.update(dt, this);
    for (const ev of waveEvents) this.handleWaveEvent(ev);

    // enemies
    const ctx = {
      player,
      bounds: this.bounds,
      wave: waveDirector.wave,
      allowSpawnMinion: () => enemies.list.filter((e) => !e.dead).length < 60 && this.pendingSpawns < 40,
      spawnMinion: (type, x, y, opts) => this.spawnEnemyAt(type, x, y, opts),
    };
    enemies.update(dt, ctx);
    enemies.removeDead();
    this.enemiesAlive = enemies.list.filter((e) => !e.dead).length;

    // bullets
    bullets.update(dt, this.bounds);

    // effects (gravity wells etc.)
    this.updateEffects(dt);

    // power-ups
    updatePowerups(dt, this);

    // drones
    this.updateDrones(dt);

    // pickups keep falling always (even mid-breach)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      updatePickup(this.pickups[i], dt, this);
      if (this.pickups[i].dead) this.pickups.splice(i, 1);
    }

    // collisions
    resolveCollisions(this);

    // combo decay
    this.updateCombo(dt);

    // particles
    fx.update(dt);

    // HUD
    hud.update(this.hiscore);
  },

  countEnemies() {
    let n = 0;
    for (const e of enemies.list) if (!e.dead) n++;
    return n;
  },

  handleWaveEvent(ev) {
    if (ev.type === "waveStart") {
      hud.banner(ev.name || `WAVE ${ev.wave}`);
      this.inBreather = false;
      if (ev.wave % 5 === 0) {
        audio.play("bossWarn");
        audio.speak(`Boss wave ${ev.wave}`);
      } else {
        audio.speak(`Wave ${ev.wave}`);
      }
      combo.killsThisWave = 0;
      combo.waveBonusApplied = false;
      events.emit("wave:start", { wave: ev.wave });
      return;
    }

    if (ev.type === "spawn") {
      this.processSpawn(ev.item);
      return;
    }

    if (ev.type === "waveClear") {
      this.onWaveClear(ev.wave);
      return;
    }
  },

  processSpawn(item) {
    // unique key prevents duplicate processing
    const key = `${waveDirector.wave}:${this.spawnedSeq = (this.spawnedSeq || 0) + 1}`;
    if (this._spawnGuard.has(key)) return;
    this._spawnGuard.add(key);
    if (this._spawnGuard.size > 500) {
      const first = this._spawnGuard.values().next().value;
      this._spawnGuard.delete(first);
    }

    if (item.boss) {
      this.spawnBoss(waveDirector.wave);
      return;
    }
    this.spawnEnemyAt(item.type, item.x, item.y, {
      wave: waveDirector.wave,
      homeX: item.homeX ?? item.x,
      homeY: item.homeY ?? item.y,
      targetX: item.targetX ?? item.x,
      targetY: item.targetY ?? item.y,
      pattern: item.pattern,
      extras: item.extras,
      arriveDur: item.arriveDur,
    });
  },

  spawnEnemyAt(type, x, y, opts = {}) {
    // arrival from above the screen
    const fromY = -40;
    const e = spawnEnemy(type, x, y, {
      ...opts,
      spawnX: opts.spawnX ?? x,
      spawnY: opts.spawnY ?? fromY,
      targetX: opts.targetX ?? x,
      targetY: opts.targetY ?? y,
    });
    if (e) enemies.add(e);
    return e;
  },

  spawnBoss(wave) {
    try {
      const b = spawnBossDesign(wave, this.bounds);
      if (b) {
        enemies.add(b);
        events.emit("boss:spawn", { boss: b, wave });
        return b;
      }
    } catch (e) { console.error(e); }
    return null;
  },

  onWaveClear(wave) {
    if (combo.waveBonusApplied) return;
    combo.waveBonusApplied = true;

    // pause combo decay between waves: reset window generously
    combo.timer = combo.window;
    combo.killsThisWave = 0;
    this.wavesCleared = wave;
    this.stats.lastWave = wave;

    const bonus = 500 * wave + Math.floor(this.score * 0.02);
    this.addScore(bonus);
    fx.textPop(this.bounds.w / 2, this.bounds.h * 0.4, `WAVE CLEAR +${bonus}`, "#b6ff3d");
    audio.play("waveClear");
    hud.banner(`WAVE ${wave} CLEAR`);
    events.emit("wave:clear", { wave, bonus });

    // schedule next wave — continuous, no scene reset
    // pickups keep falling; player state preserved
    setTimeout(() => {
      if (this.mode === "playing" && waveDirector.state === "cleared") {
        waveDirector.queueWave(wave + 1);
      }
    }, 600);
  },

  onEnemyKilled(e) {
    this.kills++;
    combo.chain++;
    combo.timer = combo.window;
    const prevMult = combo.mult;
    combo.mult = clamp(1 + Math.floor(combo.chain / 4) * 0.5, 1, 8);
    this.stats.bestCombo = Math.max(this.stats.bestCombo, combo.mult);
    window.__mult = combo.mult;

    const pts = Math.floor(e.score * combo.mult);
    this.addScore(pts);
    fx.textPop(e.x, e.y, `+${pts}`, e.isBoss ? "#ff3df0" : "#ffb03d");

    const scale = e.isBoss ? 2.5 : (e.w > 40 ? 1.5 : 1);
    fx.explosion(e.x, e.y, e.color, scale);
    audio.play(e.isBoss || e.w > 44 ? "bigExplode" : "explode");
    fx.shake(e.isBoss ? 10 : 2.5 * scale, 0.2);

    if (combo.mult > prevMult) audio.play("combo");

    // multikill bonus: count kills within short window
    this._mk = this._mk || { n: 0, t: 0 };
    this._mk.n++;
    this._mk.t = 0.6;
    if (this._mk.n >= 3) {
      const mb = 100 * this._mk.n;
      this.addScore(mb);
      this.stats.multikills++;
      fx.textPop(e.x, e.y - 20, `MULTIKILL +${mb}`, "#ff3df0");
      this._mk.n = 0;
    }

    // drop chance
    const dropChance = e.isBoss ? 1 : (e.type === "carrier" || e.type === "armored" ? 0.35 : 0.1);
    if (chance(dropChance)) {
      const id = rollPowerupDrop(waveDirector.wave, e.type === "armored" || e.isBoss);
      this.pickups.push(createPickup(e.x, e.y, id));
    }

    // charge drops heal sometimes
    if (chance(0.12)) {
      // small heal orb as pickup side effect via prism family? use heal directly
      player.heal(8);
      fx.textPop(e.x, e.y - 36, "+HP", "#b6ff3d");
    }

    events.emit("score", { score: this.score });
  },

  onPickup(pickup) {
    const mode = applyPowerup(pickup.id);
    if (!mode) return;
    audio.play("pickup");
    const def = VARIANTS[pickup.id];
    fx.textPop(player.x, player.y - 30, def.name, pickup.color);
    events.emit("pickup", { id: pickup.id, mode });
  },

  /** aegis intercept hook from collisions */
  onPlayerBulletHit(bullet) {
    // reflect
    if (powerState.reflectT > 0 && powerState.active.aegis?.id === "aegisReflect") {
      // reflect a portion
      const speed = Math.hypot(bullet.vx, bullet.vy) || 400;
      bullets.spawnPlayer({
        x: player.x, y: player.y - 10,
        vx: (bullet.vx / (Math.hypot(bullet.vx, bullet.vy) || 1)) * speed * 1.2,
        vy: (bullet.vy / (Math.hypot(bullet.vx, bullet.vy) || 1)) * speed * 1.2,
        w: 6, h: 6, kind: "orb",
        dmg: 22, color: "#ffd23d", life: 2.5,
      });
      audio.play("zap");
      fx.burst(player.x, player.y, { color: "#ffd23d", count: 8, speed: 140, life: 0.3 });
      return true;
    }
    // absorb via shield
    if (tryAegisAbsorb(bullet.dmg)) {
      fx.burst(player.x, player.y, { color: "#ffd23d", count: 8, speed: 120, life: 0.3 });
      return true;
    }
    return false;
  },

  addScore(n) {
    this.score += n;
    window.__score = this.score;
    if (this.score > this.hiscore) this.hiscore = this.score;
  },

  updateCombo(dt) {
    if (this._mk) {
      this._mk.t -= dt;
      if (this._mk.t <= 0) this._mk.n = 0;
    }
    if (this.inBreather) {
      // pause decay between waves
      hud.showCombo(combo.mult > 1 ? `×${combo.mult.toFixed(1)}` : null);
      return;
    }
    if (combo.chain > 0) {
      combo.timer -= dt;
      if (combo.timer <= 0) {
        combo.chain = 0;
        combo.mult = 1;
        window.__mult = 1;
        hud.showCombo(null);
      } else {
        hud.showCombo(`×${combo.mult.toFixed(1)}  ${combo.chain}k`);
      }
    } else {
      hud.showCombo(null);
    }
  },

  onPlayerDied() {
    if (this.mode !== "playing") return;
    this.mode = "gameover";
    // sync accuracy stats
    if (window.__gameStats) {
      this.shotsFired = window.__gameStats.shots;
      this.hits = window.__gameStats.hits;
    }
    audio.stopMusic();
    audio.play("gameOver");
    audio.speak("Game over");
    fx.shake(12, 0.6);
    events.emit("game:over", {
      score: this.score,
      wave: waveDirector.wave,
      duration: this.runTime,
      kills: this.kills,
      accuracy: this.shotsFired > 0 ? Math.round((this.hits / this.shotsFired) * 100) : 0,
      bestCombo: this.stats.bestCombo,
    });
  },

  /* ---------------- effects ---------------- */
  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) { this.effects.splice(i, 1); continue; }

      if (e.type === "well") {
        // pull enemies
        for (const en of enemies.list) {
          if (en.dead || en.arriving) continue;
          const dx = e.x - en.x, dy = e.y - en.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < e.r) {
            const f = e.power * (1 - d / e.r);
            en.x += (dx / d) * f * dt * (en.isBoss ? 0.3 : 1);
            en.y += (dy / d) * f * dt * (en.isBoss ? 0.3 : 1);
          }
        }
        // pull enemy bullets toward center and eat them when close
        for (let j = bullets.enemy.length - 1; j >= 0; j--) {
          const b = bullets.enemy[j];
          const dx = e.x - b.x, dy = e.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < e.r) {
            b.vx += (dx / d) * 200 * dt * 6;
            b.vy += (dy / d) * 200 * dt * 6;
            if (d < 24) {
              fx.burst(b.x, b.y, { color: "#9d5cff", count: 3, speed: 60, life: 0.25, size: 2 });
              bullets.enemy.splice(j, 1);
            }
          }
        }
      }
    }
  },

  drawEffects(ctx) {
    for (const e of this.effects) {
      const a = clamp(e.life / e.maxLife, 0, 1);
      if (e.type === "chronoField") {
        ctx.save();
        ctx.globalAlpha = 0.15 * a;
        ctx.strokeStyle = "#7df9ff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#7df9ff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#7df9ff";
        ctx.fill();
        ctx.restore();
      } else if (e.type === "well") {
        ctx.save();
        ctx.globalAlpha = 0.7 * a;
        const grad = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, e.r * 0.6);
        grad.addColorStop(0, "rgba(157,92,255,.9)");
        grad.addColorStop(0.4, "rgba(157,92,255,.25)");
        grad.addColorStop(1, "rgba(157,92,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(e.x, e.y, 10 + Math.sin(e.life * 10) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#c9a0ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 16, e.life * 4, e.life * 4 + 4);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "novaRing") {
        const t = 1 - a;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = "#9d5cff";
        ctx.lineWidth = 6 * a;
        ctx.shadowColor = "#9d5cff";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * t, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "chainBolt") {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = "#c9a0ff";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#9d5cff";
        ctx.shadowBlur = 10;
        for (const b of e.bolts) {
          ctx.beginPath();
          ctx.moveTo(b.x0, b.y0);
          // jagged midpoint
          const mx = (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * 18;
          const my = (b.y0 + b.y1) / 2 + (Math.random() - 0.5) * 18;
          ctx.lineTo(mx, my);
          ctx.lineTo(b.x1, b.y1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  },

  /* ---------------- drones (M3) ---------------- */
  clearDrones() { this.drones.length = 0; },

  syncDrones(st) {
    const want = st.stack;
    const ofKind = st.id === "droneAttack" ? "attack" : st.id === "droneShield" ? "shield" : "magnet";
    // only keep drones matching current variant kind
    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].kind !== ofKind) this.drones.splice(i, 1);
    }
    let mine = this.drones.filter((d) => d.kind === ofKind);
    while (mine.length < want && this.drones.length < 3) {
      const d = this.spawnDrone(ofKind);
      if (d) mine.push(d);
      else break;
    }
    // trim extras over stack
    while (mine.length > want && this.drones.length > 0) {
      const idx = this.drones.lastIndexOf(mine[mine.length - 1]);
      if (idx >= 0) this.drones.splice(idx, 1);
      mine.pop();
    }
  },

  spawnDrone(kind) {
    if (this.drones.length >= 3) return null;
    const d = {
      kind,
      x: player.x, y: player.y + 30,
      angle: rand(Math.PI * 2),
      fireT: 0,
      dead: false,
    };
    this.drones.push(d);
    return d;
  },

  updateDrones(dt) {
    const orbitR = 42;
    this.drones.forEach((d, i) => {
      d.angle += dt * 2.2 * (i % 2 === 0 ? 1 : -1);
      const tx = player.x + Math.cos(d.angle + i * 2.1) * orbitR;
      const ty = player.y + Math.sin(d.angle + i * 2.1) * orbitR * 0.6;
      d.x += (tx - d.x) * Math.min(1, dt * 8);
      d.y += (ty - d.y) * Math.min(1, dt * 8);

      if (d.kind === "attack") {
        d.fireT -= dt;
        if (d.fireT <= 0 && enemies.list.some((e) => !e.dead && !e.arriving)) {
          d.fireT = 0.45;
          // aim nearest
          let best = null, bd = 1e9;
          for (const e of enemies.list) {
            if (e.dead || e.arriving) continue;
            const dd = (e.x - d.x) ** 2 + (e.y - d.y) ** 2;
            if (dd < bd) { bd = dd; best = e; }
          }
          if (best) {
            const dx = best.x - d.x, dy = best.y - d.y;
            const dist = Math.hypot(dx, dy) || 1;
            bullets.spawnPlayer({
              x: d.x, y: d.y,
              vx: (dx / dist) * 700, vy: (dy / dist) * 700,
              w: 3, h: 8, dmg: 8, color: "#35f0ff", life: 1.5,
            });
            audio.play("shoot");
          }
        }
      }

      if (d.kind === "shield") {
        // intercept nearest enemy bullet within radius
        const R = 70;
        for (let j = bullets.enemy.length - 1; j >= 0; j--) {
          const b = bullets.enemy[j];
          if (Math.hypot(b.x - d.x, b.y - d.y) < R) {
            fx.burst(b.x, b.y, { color: "#35f0ff", count: 4, speed: 80, life: 0.25, size: 2 });
            bullets.enemy.splice(j, 1);
            audio.play("hit");
            break;
          }
        }
      }
    });

    // remove drones whose family expired
    const fam = powerState.active.drone;
    if (!fam) {
      this.drones.length = 0;
    }
  },

  drawDrones(ctx) {
    for (const d of this.drones) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.shadowColor = "#35f0ff";
      ctx.shadowBlur = 10;
      ctx.fillStyle = d.kind === "attack" ? "#ff5c7a" : d.kind === "shield" ? "#35f0ff" : "#b6ff3d";
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, 6);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  },

  drawPickups(ctx) {
    for (const p of this.pickups) drawPickup(ctx, p);
  },

  /** debug helpers */
  debugSpawnPickup(variantId) {
    const id = VARIANT_IDS.includes(variantId) ? variantId : "spread";
    this.pickups.push(createPickup(rand(60, this.bounds.w - 60), 40, id, { vy: 40 }));
  },

  debugGotoWave(n) {
    enemies.clear();
    bullets.enemy.length = 0;
    waveDirector.spawnQueue.length = 0;
    waveDirector.state = "cleared";
    waveDirector.queueWave(Math.max(1, Math.floor(n)));
  },
};
