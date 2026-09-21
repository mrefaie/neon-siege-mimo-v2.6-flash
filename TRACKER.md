# NEON SIEGE — Tracker

**Current milestone:** M5 — Final verification (complete)  
**Next action:** None — project delivered.  
**Known bugs:** None open.  
**Verification results:** Full executed/not-tested matrix in M5 below.

Status key: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED`

---

## M0 — Planning

- [x] `PLAN.md` written (architecture, structure, systems, audio, milestones) — `DONE`
- [x] `TRACKER.md` created — `DONE`
- [x] No application code before planning files — `DONE`

## M1 — Playable MVP

- [x] Project scaffold: `index.html`, CSS, file layout — `DONE`
- [x] Core loop: RAF, clamped dt, resize/DPI, pause on hidden tab — `DONE`
- [x] Input: keyboard move/fire/dash — `DONE`
- [x] Player: movement, hold-to-fire, dash cooldown — `DONE`
- [x] One enemy type + spawning — `DONE`
- [x] Player bullets + collisions (player HP, enemy HP, score) — `DONE`
- [x] Enemy bullets + player damage + i-frames — `DONE`
- [x] Game over + restart (no listener/loop duplication) — `DONE`
- [x] Continuous waves (≥3), breather, scene never resets — `DONE`
- [x] One falling power-up persisting across waves — `DONE`
- [x] Basic SFX (procedural WebAudio) — `DONE`
- **AC (executed 2026-09-22):** waves 1→4 persisted score/HP/position/pickup; death→restart clean; `addScore` once — **PASS**

## M2 — Combat variety

- [x] 6 enemy archetypes with distinct behaviors — `DONE` (grunt, swooper, swarmling, armored, sniper, carrier)
- [x] 8 encounter patterns + no-repeat picker + pressure/recovery — `DONE` (march, dive wing, swarm, armored escort, sniper line, carrier drop, orbit ring, piners)
- [x] Wave pacing / difficulty curve — `DONE` (HP scaling, spawn speed-up, reinforcements ≥6, pressure/recovery every 3rd)
- [x] Boss every 5th wave; ≥3 boss designs, phased telegraphed attacks — `DONE` (Bulwark, Widowmother, Prism Archon; 3 phases each; telegraph ring + !! warn)
- [x] Warp-in arrival (no damage during arrival) — `DONE`
- **AC (executed):**
  - Waves 1–10 showed MARCHING GRID, SWARM, DIVE WING, ARMORED ESCORT, SNIPER LINE, CARRIER DROP, ORBIT RING, PINCERS — **PASS**
  - Archetypes observed: grunt, swooper, swarmling, armored, sniper, carrier — **PASS**
  - Wave 5/10/15 bosses: bulwark (900hp), widow (1360), archon (2200); phases I→II→III on damage; telegraph attacks fire enemy bullets — **PASS**
  - Boss kill → wave 6 exactly once, no double transition — **PASS**
  - Arrival: enemies `arriving:true` during warp, invulnerable — **PASS**

## M3 — Power-ups and progression

- [x] Framework: families, one-variant-per-family, stack/extend, caps — `DONE`
- [x] Prism ×3 (spread, pierce, ricochet) — `DONE`
- [x] Drones ×3 (attacker, interceptor, collector) — `DONE`
- [x] Chrono ×3 (slow field, freeze pulse, haste) — `DONE`
- [x] Aegis ×3 (absorb, reflect, detonate) — `DONE`
- [x] Singularity ×3 (gravity well, chain lightning, nova) — `DONE`
- [x] HUD indicators with duration/charges — `DONE`
- [x] Combos: multiplier, multikill, wave bonus, pause decay between waves — `DONE`
- [x] Balanced drops; boss CC resistance; no infinite stun — `DONE`
- **AC (executed):**
  - All 15 variants collected → HUD chip + mechanic observed (weapon mods, drones count, haste timer, shield absorb intercept=true, gravity well/chain/nova effects) — **PASS**
  - Stack: SPREAD ×1 18s → ×2 25s — **PASS**
  - Replace: SPREAD → PIERCE clears spread, sets pierce — **PASS**
  - Multi-family coexist: SPREAD + HASTE + SHIELD together — **PASS**
  - Drones: 1 per stack, kind switches on variant replace — **PASS**
  - Boss `stunResist` rises; freeze duration ×0.35 on bosses — **PASS**
  - Combo: 8 rapid kills → ×2.0 mult, HUD shows it — **PASS**
  - Chain lightning caps at 2+stack (max 6) — **PASS**

## M4 — Complete presentation

- [x] Title menu: Play / How to Play / Leaderboard / Settings — `DONE`
- [x] Pause overlay, game-over stats, instant restart — `DONE`
- [x] Starfield + neon polish, screen shake toggle, reduced motion — `DONE`
- [x] Music sequencer (synthwave loop) — `DONE`
- [x] Voice announcements + captions (speechSynthesis fallback) — `DONE`
- [x] Settings: music/effects/voice volume, shake, reduced motion — `DONE`
- [x] Mobile: touch move, autofire, dash button — `DONE`
- [x] Local leaderboard top 10 (name, score, wave, duration, date) — `DONE`
- **AC (executed):**
  - Settings persist (`music:0, voiceOn:false` saved/reloaded); slider + checkbox UI works — **PASS**
  - Leaderboard: score 5000 saved as VYX, table renders, top-10 sort — **PASS**
  - Name entry only when `qualifies` (score>0) — **PASS**
  - Pause shows overlay; resume hides; tab-hidden → pause — **PASS**
  - `speechSynthesis` undefined → no throw, captions still path — **PASS**
  - Muted music (sfx/music 0) → no crash — **PASS**
  - Touch stick + DASH elements present; autofire when `pointer:coarse` — **PASS** (DOM verified; physical device not tested)
  - Game-over stats show accuracy (33% after test fire) — **PASS**

## M5 — Final verification

- [x] Full integrated playtest — `DONE` (executed)
- [x] Wave-transition persistence check — `DONE` (executed: pickups, drones, weapon, HP, score, position survive)
- [x] Double/premature transition check — `DONE` (executed: boss/normal wave clear → next wave once; fixed stale `enemiesAlive` / same-frame spawn clear bug)
- [x] Restart/resize/hidden-tab check — `DONE` (executed)
- [x] Storage corruption fallback check — `DONE` (executed: broken JSON → defaults; bad score entries filtered)
- [x] Missing speech / muted audio resilience — `DONE` (executed)
- [x] Busy encounter readability/perf — `DONE` (executed: particle cap 400 enforced; swarm 16 + bullets OK)
- [x] Pacing fixes — `DONE` (executed: waves 1–10 variety confirmed; boss every 5)
- [x] README (launch, controls, asset generation) — `DONE`
- [x] `tools/generate_audio.py` runs — `DONE` (executed: wrote 9 WAVs to temp dir)

### Verification matrix (M5)

| Check | Result | Notes |
|---|---|---|
| Pickups/projectiles/player/effects persist across waves | **PASS** | Explicitly asserted after 3+ transitions |
| Pending spawns / boss phases no double or premature transition | **PASS** | Fixed wave-clear on spawn frame; retested |
| All 15 power-up variants work | **PASS** | Per-variant collection + HUD + mechanic |
| First 10 waves meaningful variety | **PASS** | ≥4 distinct encounters + all archetypes seen |
| Boss progression (5/10/15 + phases) | **PASS** | 3 designs, phase banners, telegraphs |
| Pause/resume | **PASS** | Button + Esc + tab-hide |
| Restart hygiene | **PASS** | No duplicate RAF/listeners; fresh state |
| Resize mid-game | **PASS** | Positions scale; mode/score intact |
| Mobile controls | **PARTIAL** | DOM + code paths present; not tested on real touch hardware |
| Settings persistence | **PASS** | Corrupt + valid round-trip |
| Leaderboard persistence | **PASS** | Top-10, labels, date |
| Missing speech / muted audio | **PASS** | speechSynthesis absent path + volume 0 |
| Blocked/corrupt storage | **PASS** | try/catch fallbacks |
| Busy encounter readability | **PASS** | Caps on particles/bullets; shake restrained |
| Audio generation script | **PASS** | `python3 tools/generate_audio.py` OK |

**Not tested (honest gaps):**
- Real iOS/Android touch latency and multitouch edge cases.
- Actual speechSynthesis voice quality/timing across OS voices (only code-path resilience).
- Long-session memory over hours (particle/bullet pools bounded but not soak-tested).
- Gamepad input (not implemented).

### Bugs found & fixed during verification

1. Power-up `apply/clear` received wrong object → crash on first pickup — fixed.
2. `bossBehaviors` ReferenceError → boss never spawned — fixed.
3. Wave cleared on same frame as last spawn (`enemiesAlive` stale) → premature transition — fixed.
4. Drone family replace left orphan drones — fixed (kind sync + clear event).
5. `player:died` only emitted from collisions, not `player.damage()` → direct lethal hits skipped game-over — fixed.
6. Pause overlay not shown when `game.pause()` called programmatically (visibility handler) — fixed via `ui:pause` event.
7. Accuracy always 0% (`shotsFired`/`hits` never incremented) — fixed with `__gameStats`.
8. Escape double-handled (menu + tick) — consolidated into tick only.

---

## Log

| Date | Milestone | Note |
|---|---|---|
| 2026-09-22 | M0 | Planning docs created. |
| 2026-09-22 | M1 | MVP playable; continuity + restart verified in browser. |
| 2026-09-22 | M2 | 6 archetypes, 8 patterns, 3 phased bosses verified. |
| 2026-09-22 | M3 | All 15 power-ups + combos + stacking verified. |
| 2026-09-22 | M4 | Menus, settings, leaderboard, voice fallback verified. |
| 2026-09-22 | M5 | Full verification matrix executed; 8 defects fixed; README + asset script done. |
