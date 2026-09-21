# NEON SIEGE — Plan

A polished 2D Space Invaders–inspired browser game. Static HTML/CSS/JS + Canvas 2D, no build step, no backend.

## 1. Architecture

- **Single continuous world.** One `Game` owns the scene. Waves are spawner events, never scene rebuilds. Only `startNewRun()` resets state.
- **Fixed-ish timestep.** One `requestAnimationFrame` loop; `dt` clamped (max 50ms) so movement is frame-rate independent. Simulation keeps running while nonblocking.
- **Entity system (lightweight).** Plain objects with `type`, position, velocity, `update(dt)`, `draw(ctx)`, and rectangular hitboxes. World holds arrays: `player`, `enemies`, `playerBullets`, `enemyBullets`, `pickups`, `particles`, `drones`, `effects`, `beams`.
- **Data-driven content.** Enemy archetypes, encounters, bosses, and power-ups are config objects; systems interpret them.
- **Message bus.** Tiny pub/sub (`events.js`) for decoupling audio, HUD, and gameplay (`wave:clear`, `enemy:killed`, `player:hit`, …).
- **State machine.** `boot → menu → playing → paused → gameover`; overlays (settings/leaderboard/how-to) sit above menu.
- **Persistence.** `storage.js` wraps `localStorage` with try/catch and schema validation; corrupt data falls back to defaults.

### File structure

```
index.html            entry, canvas, overlay screens
css/style.css         theme, HUD, menus, mobile controls
js/
  main.js             boot, wiring, single RAF loop
  core/
    events.js         pub/sub
    input.js          keyboard, touch, gamepad-lite
    storage.js        settings + leaderboard
    utils.js          math, rng, pooling helpers
    audio.js          WebAudio SFX + music sequencer + speech
  game/
    game.js           world state, run lifecycle, wave flow
    player.js         movement, dash, fire, i-frames
    enemies.js        archetypes, behaviors, formations
    encounters.js     pattern library + picker (no-repeat)
    bosses.js         3+ boss designs, phases, telegraphs
    bullets.js        player/enemy projectiles, caps
    collisions.js     broadphase AABB
    powerups.js       15 variants, families, HUD hooks
    particles.js      explosions, trails, shake, starfield
    hud.js            score, combo, wave, power timers
    waves.js          wave director: pacing, spawns, boss every 5
  ui/
    menu.js           screens, settings, leaderboard
    touch.js          virtual stick + dash button
    debug.js          disabled-by-default helpers
assets/               generated audio (bundled locally)
tools/                asset generation scripts (Python)
PLAN.md TRACKER.md README.md
```

## 2. Gameplay systems

| System | Notes |
|---|---|
| Player | Left/right (←/→, A/D), hold Space = autofire with cooldown, Shift = dash (cooldown, brief i-frames), HP + shield layers. |
| Combat | AABB collisions, enemy bullets capped, readable colors, damage flash + i-frame blink. |
| Waves | `waveDirector`: brief nonblocking breather → pending spawn token → enemies warp in (no damage during arrival). Boss every 5th wave. |
| Encounters | ≥8 patterns: marching, swoop, swarm, armored escort, sniper, carrier, orbit, pincer. Authored weights + controlled randomness, no consecutive duplicate, alternate pressure/recovery. |
| Enemies | ≥6 archetypes: grunt, swooper, swarmling, armored, sniper, carrier (+ minions). Distinct movement/attacks. |
| Bosses | ≥3 designs with phased, telegraphed attacks; later remixes. Reduced crowd-control effectiveness; no infinite stun. |
| Power-ups | 5 families × 3 variants (15). One active variant per family; duplicate extends duration + stacks to a cap. Icons readable; HUD shows duration/charges. |
| Combos | Multiplier + multikill bonus + wave-clear bonus; combo decay pauses during breather. |
| Scoring | Score, multiplier, wave bonus; top-10 local leaderboard (name, score, wave, duration, date). |

## 3. Power-up families

1. **Prism** — spread / piercing beam / ricochet.
2. **Drones** — attacker / interceptor / collector (max 3 drones).
3. **Chrono** — local slow field / periodic enemy freeze / player haste.
4. **Aegis** — absorbing shield / bullet reflection / detonating shield.
5. **Singularity** — gravity well / chain lightning (capped chains) / damaging bullet-clearing nova.

Bosses resist freeze/slow; stun immunity ramps during stun. Projectiles, drones, chains all hard-capped.

## 4. Assets & audio

- **Visuals:** Canvas-drawn neon (glow via shadowBlur used sparingly), animated starfield, particle trails. No external images required.
- **SFX:** Procedural WebAudio (oscillators + noise) for shoot/hit/explosion/pickup/dash/UI — zero downloads, always available.
- **Music:** WebAudio step sequencer playing a looping synthwave pattern (bass, arp, drums) generated from note data in `audio.js`.
- **Voice:** Browser `speechSynthesis` for short announcements ("Wave 3", "Boss"); captions shown on screen. Falls back gracefully if unavailable.
- **Generation scripts:** `tools/generate_audio.py` (optional, uses numpy → WAV) retained for anyone who wants offline sample assets; runtime does not require it.
- Volumes: music / effects / voice independent. Audio unlocks on first user gesture. Announcements never overlap (queue + cancel).

## 5. Reliability

- One RAF loop; restart clears arrays and listeners it owns (listeners registered once at boot).
- Pause on `visibilitychange` → explicit resume required.
- Resize/`devicePixelRatio` handled without touching gameplay state.
- Bounded particles/bullets (ring buffers / caps).
- `settings` + `scores` in localStorage with corruption fallback.
- Reduced-motion and screen-shake toggles; shake off by default in reduced motion.

## 6. Milestones & acceptance criteria

### M0 — Planning ✅
- [x] `PLAN.md` + `TRACKER.md` exist, no app code.

### M1 — Playable MVP
- Player move/fire, 1 enemy type, collisions, HP, score, game over, restart.
- ≥3 continuous waves; scene never resets on wave change.
- One falling power-up survives wave transitions.
- Basic SFX. **AC:** run game, kill wave, confirm player/pickup/score persist, die, restart cleanly.

### M2 — Combat variety
- All 6+ enemy archetypes, 8 encounter patterns, wave pacing, 3+ bosses with phases.
- **AC:** first 10 waves varied; boss on wave 5 with telegraphed phases; no double wave transitions.

### M3 — Power-ups & progression
- All 15 variants, family replacement/stacking rules, HUD indicators, combo system, drop balance.
- **AC:** each variant triggers its mechanic; duplicates extend; HUD shows timers.

### M4 — Presentation
- Menus (Play/How to Play/Leaderboard/Settings), pause, game-over stats, music, voice+captions, settings persistence, mobile controls, local leaderboard.
- **AC:** settings and top-10 persist; touch controls work; mute/voice settings respected.

### M5 — Final verification
- Full playtest, defect fixes, pacing tune, README.
- **AC:** checklist in TRACKER executed and recorded; README launch/controls/asset docs complete.

## 7. Verification approach

- Manual browser playtests per milestone + targeted checks (wave persistence, restart hygiene, storage corruption, resize, hidden tab).
- Debug helper (`?debug=1` or localStorage flag) for wave select and power-up spawn.
- Results recorded in TRACKER.md as Executed vs Not tested.
