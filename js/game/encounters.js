import { rand, randInt, chance, clamp, TAU, makeNoRepeatPicker } from "../core/utils.js";

/**
 * 8 authored encounter patterns + controlled randomness.
 * Each builder(wave, bounds) → { name, spawns: [{type,x,y,homeX,homeY,delay,targetX,targetY,pattern,extras}] }
 */

const pickNoRepeat = makeNoRepeatPicker();

function grid(cols, rows, x0, x1, y0, yGap) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * c) / (cols - 1);
      const y = y0 + r * yGap;
      out.push({ x, y });
    }
  }
  return out;
}

export const PATTERNS = [
  {
    id: "march",
    name: "MARCHING GRID",
    minWave: 1,
    w: 10,
    build(wave, b) {
      const rows = clamp(2 + Math.floor(wave / 3), 2, 4);
      const cols = clamp(5 + Math.floor(wave / 4), 5, 8);
      const spawns = grid(cols, rows, b.w * 0.15, b.w * 0.85, 70, 46).map((p, i) => ({
        type: "grunt",
        x: p.x, y: p.y, homeX: p.x, homeY: p.y,
        delay: i * 0.05,
      }));
      return { name: "MARCHING GRID", spawns };
    },
  },
  {
    id: "swoop",
    name: "DIVE WING",
    minWave: 2,
    w: 9,
    build(wave, b) {
      const n = clamp(4 + Math.floor(wave / 2), 4, 8);
      const spawns = [];
      for (let i = 0; i < n; i++) {
        const x = (b.w / (n + 1)) * (i + 1);
        spawns.push({
          type: "swooper",
          x, y: -30,
          targetX: x, targetY: 80 + (i % 2) * 30,
          homeX: x, homeY: 80 + (i % 2) * 30,
          delay: i * 0.12,
          arriveDur: rand(0.4, 0.7),
        });
      }
      // backup grunts
      const g = clamp(Math.floor(wave / 3), 0, 4);
      for (let i = 0; i < g; i++) {
        const x = b.w * (0.3 + i * 0.15);
        spawns.push({ type: "grunt", x, y: 60, homeX: x, homeY: 60, delay: 1 + i * 0.1 });
      }
      return { name: "DIVE WING", spawns };
    },
  },
  {
    id: "swarm",
    name: "SWARM",
    minWave: 2,
    w: 9,
    build(wave, b) {
      const n = clamp(6 + wave * 2, 6, 16);
      const spawns = [];
      for (let i = 0; i < n; i++) {
        const x = rand(b.w * 0.1, b.w * 0.9);
        const y = rand(50, 200);
        spawns.push({
          type: "swarmling",
          x, y,
          homeX: x, homeY: y,
          delay: i * 0.07,
          arriveDur: rand(0.3, 0.55),
        });
      }
      return { name: "SWARM", spawns };
    },
  },
  {
    id: "escort",
    name: "ARMORED ESCORT",
    minWave: 3,
    w: 8,
    build(wave, b) {
      const spawns = [];
      const pairs = clamp(1 + Math.floor(wave / 4), 1, 3);
      for (let p = 0; p < pairs; p++) {
        const cx = b.w * (0.3 + p * 0.4);
        spawns.push({
          type: "armored",
          x: cx, y: 90, homeX: cx, homeY: 90,
          delay: p * 0.3, arriveDur: 0.7,
        });
        for (let i = -1; i <= 1; i += 2) {
          spawns.push({
            type: "grunt",
            x: cx + i * 60, y: 70, homeX: cx + i * 60, homeY: 70,
            delay: 0.3 + p * 0.3 + Math.abs(i) * 0.1,
          });
        }
      }
      return { name: "ARMORED ESCORT", spawns };
    },
  },
  {
    id: "snipers",
    name: "SNIPER LINE",
    minWave: 3,
    w: 7,
    build(wave, b) {
      const n = clamp(2 + Math.floor(wave / 3), 2, 5);
      const spawns = [];
      for (let i = 0; i < n; i++) {
        const x = (b.w / (n + 1)) * (i + 1);
        spawns.push({
          type: "sniper",
          x, y: 60, homeX: x, homeY: 60,
          delay: i * 0.2,
          arriveDur: 0.6,
        });
      }
      // screen-fillers
      const g = clamp(Math.floor(wave / 2), 2, 6);
      for (let i = 0; i < g; i++) {
        const x = rand(b.w * 0.15, b.w * 0.85);
        spawns.push({ type: "grunt", x, y: 140, homeX: x, homeY: 140, delay: 1 + i * 0.08 });
      }
      return { name: "SNIPER LINE", spawns };
    },
  },
  {
    id: "carrier",
    name: "CARRIER DROP",
    minWave: 4,
    w: 7,
    build(wave, b) {
      const spawns = [];
      const carriers = wave >= 8 ? 2 : 1;
      for (let i = 0; i < carriers; i++) {
        const x = b.w * (carriers === 1 ? 0.5 : 0.3 + i * 0.4);
        spawns.push({
          type: "carrier",
          x, y: 70, homeX: x, homeY: 70,
          delay: i * 0.5, arriveDur: 0.9,
        });
      }
      const escorts = clamp(2 + Math.floor(wave / 4), 2, 5);
      for (let i = 0; i < escorts; i++) {
        const x = rand(b.w * 0.15, b.w * 0.85);
        spawns.push({ type: "grunt", x, y: 130, homeX: x, homeY: 130, delay: 0.6 + i * 0.12 });
      }
      return { name: "CARRIER DROP", spawns };
    },
  },
  {
    id: "orbit",
    name: "ORBIT RING",
    minWave: 4,
    w: 8,
    build(wave, b) {
      const n = clamp(6 + Math.floor(wave / 3), 6, 12);
      const cx = b.w / 2, cy = Math.min(180, b.h * 0.3);
      const R = clamp(90 + wave * 4, 90, 150);
      const spawns = [];
      const type = wave >= 6 && chance(0.4) ? "swarmling" : "grunt";
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R * 0.55;
        spawns.push({
          type,
          x, y, homeX: x, homeY: y,
          delay: i * 0.06,
          pattern: "orbit",
          extras: { orbitC: true, ox: cx, oy: cy, or: R, oa: a, os: i % 2 ? 1 : -1 },
        });
      }
      return { name: "ORBIT RING", spawns };
    },
  },
  {
    id: "pincer",
    name: "PINCERS",
    minWave: 5,
    w: 9,
    build(wave, b) {
      const spawns = [];
      const n = clamp(3 + Math.floor(wave / 3), 3, 6);
      for (let i = 0; i < n; i++) {
        const y = 60 + i * 44;
        spawns.push({
          type: chance(0.3) ? "armored" : "grunt",
          x: 40, y, targetX: 40, targetY: y,
          homeX: 40, homeY: y,
          delay: i * 0.1, arriveDur: 0.5,
          pattern: "pincerL",
        });
        spawns.push({
          type: chance(0.3) ? "armored" : "grunt",
          x: b.w - 40, y, targetX: b.w - 40, targetY: y,
          homeX: b.w - 40, homeY: y,
          delay: i * 0.1 + 0.05, arriveDur: 0.5,
          pattern: "pincerR",
        });
      }
      // center threat
      spawns.push({
        type: "sniper",
        x: b.w / 2, y: 50, homeX: b.w / 2, homeY: 50,
        delay: 1.2, arriveDur: 0.7,
      });
      return { name: "PINCERS", spawns };
    },
  },
];

/** Pick encounter for wave with pressure/recovery awareness */
export function chooseEncounter(wave, lastId) {
  const pool = PATTERNS.filter((p) => p.minWave <= wave);
  if (wave <= 2) return pool.find((p) => p.id === "march") || pool[0];
  // avoid immediate repeat
  let candidates = pool.filter((p) => p.id !== lastId);
  if (!candidates.length) candidates = pool;
  // recovery: every 3rd non-boss wave after wave 4 gets a lighter pattern
  const recovery = wave > 4 && wave % 3 === 2;
  if (recovery) {
    const light = candidates.filter((c) => c.id === "march" || c.id === "orbit" || c.id === "snipers");
    if (light.length) candidates = light;
  }
  // pressure: alternate — even waves slightly prefer aggressive
  if (!recovery && wave % 2 === 0) {
    const hard = candidates.filter((c) => c.id === "swoop" || c.id === "swarm" || c.id === "pincer");
    if (hard.length && chance(0.55)) candidates = hard;
  }
  return pickNoRepeat(candidates);
}
