/**
 * Debug helper — disabled by default.
 * Enable with ?debug=1 or localStorage neon_siege_debug = "1".
 * Then: __debug.wave(n), __debug.pickup(id), __debug.god(true)
 */
const KEY = "neon_siege_debug";

function enabled() {
  try {
    if (new URLSearchParams(location.search).get("debug") === "1") return true;
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function initDebug(game) {
  if (!enabled()) return;
  window.__debug = {
    game,
    wave(n) { game.debugGotoWave(n); },
    pickup(id) {
      // spawn pickup directly on player for reliable testing
      game.debugSpawnPickup(id);
      const pk = game.pickups[game.pickups.length - 1];
      const pl = window.__neon?.player;
      if (pk && pl) {
        pk.x = pl.x;
        pk.y = pl.y;
        pk.vx = 0;
        pk.vy = 0;
      }
    },
    god(on = true) {
      const p = window.__neon?.player || game;
      // simple: keep refreshing iframes
      if (on) {
        setInterval(() => {
          const pl = window.__neon?.player;
          if (pl) { pl.iFrames = 1; pl.hp = pl.maxHp; }
        }, 200);
      }
    },
    clearBullets() { window.__neon?.bullets.enemy.splice(0); },
    info() {
      return {
        mode: game.mode,
        wave: window.__neon && game,
        score: game.score,
        enemies: window.__neon?.enemies.list.length,
        pickups: game.pickups.length,
      };
    },
  };
  console.info("[NEON SIEGE] debug enabled — window.__debug");
}

export function maybeDebug() {
  if (enabled()) console.info("[NEON SIEGE] debug mode ON");
}
