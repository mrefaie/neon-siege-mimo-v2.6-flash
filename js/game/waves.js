import { makeNoRepeatPicker, chance, clamp } from "../core/utils.js";
import { chooseEncounter, PATTERNS } from "./encounters.js";

/**
 * Wave director — owns pacing. Never resets the scene.
 * States: idle → breather → spawning → active → cleared → (next) breather
 */

let lastEncounterId = null;

export const waveDirector = {
  wave: 0,
  state: "idle",          // idle | breather | spawning | active | cleared
  timer: 0,
  spawnQueue: [],         // pending spawns — processed once
  spawnClock: 0,
  pendingNext: false,     // guard against double transitions
  encounterName: "",
  breatherLen: 2.4,
  spawnedCount: 0,
  totalPlanned: 0,
  isBossWave: false,

  reset() {
    this.wave = 0;
    this.state = "idle";
    this.timer = 0;
    this.spawnQueue.length = 0;
    this.spawnClock = 0;
    this.pendingNext = false;
    this.encounterName = "";
    this.spawnedCount = 0;
    this.totalPlanned = 0;
    this.isBossWave = false;
    lastEncounterId = null;
  },

  start() {
    this.reset();
    this.queueWave(1);
  },

  queueWave(n) {
    if (this.state === "breather" && this.wave === n) return; // already queued this wave
    if (this.pendingNext && this.wave >= n && this.state !== "cleared") return;
    this.pendingNext = true;
    this.wave = n;
    this.isBossWave = n % 5 === 0;
    this.state = "breather";
    this.timer = n === 1 ? 1.0 : this.breatherLen;
    this.spawnQueue.length = 0;
    this.spawnClock = 0;
    this.spawnedCount = 0;
    this.totalPlanned = 0;
    this.encounterName = this.isBossWave ? "⚠ BOSS INCOMING ⚠" : "";
    this._planWave(n);
  },

  _planWave(n) {
    if (this.isBossWave) {
      this.spawnQueue.push({ boss: true, delay: 0.1 });
      this.totalPlanned = 1;
      this.encounterName = "⚠ BOSS INCOMING ⚠";
      return;
    }

    const encounter = chooseEncounter(n, lastEncounterId);
    lastEncounterId = encounter.id;
    const result = encounter.build(n, this._bounds || { w: 800, h: 600 });

    // difficulty pressure: scale delays slightly tighter on later waves
    const speed = n >= 8 ? 0.75 : n >= 5 ? 0.9 : 1;
    this.spawnQueue = result.spawns.map((s, i) => ({
      ...s,
      delay: (s.delay ?? i * 0.06) * speed,
    }));

    // optional controlled-random reinforcement on high waves
    if (n >= 6 && chance(0.35)) {
      const extra = clamp(Math.floor(n / 4), 1, 4);
      for (let i = 0; i < extra; i++) {
        this.spawnQueue.push({
          type: chance(0.5) ? "swarmling" : "grunt",
          x: 80 + Math.random() * ((this._bounds?.w || 800) - 160),
          y: -20,
          targetY: 70 + Math.random() * 80,
          delay: 2.2 + i * 0.3,
        });
      }
    }

    this.totalPlanned = this.spawnQueue.length;
    this.encounterName = result.name || encounter.name;
  },

  get progress() {
    if (this.totalPlanned === 0) return 1;
    return this.spawnedCount / this.totalPlanned;
  },

  /** Update; returns events. */
  update(dt, game) {
    const out = [];
    this._bounds = game.bounds;

    if (this.state === "breather") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = "spawning";
        this.pendingNext = false; // wave officially started — queue clear
        this.spawnClock = 0;
        // normalize delays so first spawn is immediate
        if (this.spawnQueue.length) {
          const minD = Math.min(...this.spawnQueue.map((s) => s.delay || 0));
          for (const s of this.spawnQueue) s.delay = Math.max(0, (s.delay || 0) - minD);
        }
        out.push({ type: "waveStart", wave: this.wave, name: this.encounterName });
      }
      return out;
    }

    if (this.state === "spawning" || this.state === "active") {
      let spawnedThisFrame = 0;
      if (this.spawnQueue.length) {
        this.spawnClock += dt;
        let guard = 0;
        while (this.spawnQueue.length && this.spawnClock >= (this.spawnQueue[0].delay || 0) && guard++ < 30) {
          const item = this.spawnQueue.shift();
          out.push({ type: "spawn", item });
          this.spawnedCount++;
          spawnedThisFrame++;
        }
        this.state = this.spawnQueue.length ? "spawning" : "active";
      } else {
        this.state = "active";
      }

      // only clear if no pending spawns AND nothing spawned this frame
      // (spawn events execute after this function returns)
      if (this.spawnQueue.length === 0 && this.state === "active" && spawnedThisFrame === 0) {
        const alive = typeof game.countEnemies === "function"
          ? game.countEnemies()
          : game.enemiesAlive;
        if (alive <= 0) {
          this.state = "cleared";
          out.push({ type: "waveClear", wave: this.wave });
        }
      }
      return out;
    }

    return out;
  },
};
