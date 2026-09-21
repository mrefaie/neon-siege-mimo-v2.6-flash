import { rectFrom, aabb } from "../core/utils.js";
import { bullets } from "./bullets.js";
import { enemies } from "./enemies.js";
import { player } from "./player.js";
import { events } from "../core/events.js";
import { fx } from "./particles.js";
import { tryChainLightning } from "./powerups.js";

/**
 * AABB collision resolution. Emits events; game.js applies scoring/state.
 */
export function resolveCollisions(game) {
  const pRect = player.rect;
  const pickupRects = game.pickups;

  // player bullets → enemies
  const pBullets = bullets.player;
  for (let i = pBullets.length - 1; i >= 0; i--) {
    const b = pBullets[i];
    const br = rectFrom(b);
    let hitSomething = false;

    for (const e of enemies.list) {
      if (e.dead || e.arriving) continue;
      if (aabb(br, rectFrom(e))) {
        const killed = enemies.damage(e, b.dmg);
        if (window.__gameStats) window.__gameStats.hits++;
        events.emit("enemy:hit", { enemy: e, bullet: b });
        if (e.dead) {
          events.emit("enemy:killed", { enemy: e });
        }
        // chain lightning from power-up
        tryChainLightning(e, game);
        hitSomething = true;
        if (b.pierce > 0) {
          b.pierce--;
          hitSomething = false; // continue flying
          break; // one target per frame per pierce step is fine
        }
        if (b.ricochet > 0) {
          // jump to another nearby enemy
          b.ricochet--;
          const next = findNearestEnemy(e, b.x, b.y, 220);
          if (next && !next.dead) {
            const dx = next.x - b.x, dy = next.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = (dx / d) * sp;
            b.vy = (dy / d) * sp;
            b.color = "#ffd23d";
            hitSomething = false;
          }
          break;
        }
        break;
      }
    }

    if (hitSomething) {
      pBullets.splice(i, 1);
    }
  }

  // enemy bullets → player (and aegis systems via events)
  if (player.alive) {
    const eBullets = bullets.enemy;
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (!aabb(rectFrom(b), pRect)) continue;

      // aegis reflection / absorb handled by powerups via intercept flag
      const intercepted = game.onPlayerBulletHit?.(b);
      if (intercepted) {
        eBullets.splice(i, 1);
        continue;
      }

      if (player.iFrames <= 0) {
        const ok = player.damage(b.dmg);
        eBullets.splice(i, 1);
        if (ok) events.emit("player:hit", { hp: player.hp });
        if (!player.alive) break;
      } else {
        // graze during iframes — bullet passes
      }
    }

    // enemy body → player
    if (player.iFrames <= 0 && player.alive) {
      for (const e of enemies.list) {
        if (e.dead || e.arriving) continue;
        if (aabb(pRect, rectFrom(e))) {
          const ok = player.damage(18);
          enemies.damage(e, 12);
          if (ok) events.emit("player:hit", { hp: player.hp });
          break;
        }
      }
    }
  }

  // pickups → player
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    if (pk.dead) { game.pickups.splice(i, 1); continue; }
    if (player.alive && aabb(pRect, { x: pk.x - pk.r, y: pk.y - pk.r, w: pk.r * 2, h: pk.r * 2 })) {
      pk.dead = true;
      events.emit("pickup:collected", { pickup: pk });
      game.pickups.splice(i, 1);
    }
  }
}

function findNearestEnemy(from, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const e of enemies.list) {
    if (e === from || e.dead || e.arriving) continue;
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
