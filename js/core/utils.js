export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

export function aabb(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function rectFrom(e) {
  return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
}

/** Weighted pick: entries [{w, ...}] */
export function weighted(items) {
  let total = 0;
  for (const it of items) total += it.w;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Seeded-ish shuffle-free "no immediate repeat" picker */
export function makeNoRepeatPicker() {
  let last = null;
  return (items) => {
    const pool = items.filter((i) => i !== last);
    const chosen = pool.length ? pick(pool) : pick(items);
    last = chosen;
    return chosen;
  };
}

/** Format seconds as m:ss */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Simple object pool */
export class Pool {
  constructor(factory, reset, size = 64) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    for (let i = 0; i < size; i++) this.free.push(factory());
  }
  get() {
    return this.free.pop() || this.factory();
  }
  put(obj) {
    if (this.free.length < 512) this.free.push(obj);
  }
}
