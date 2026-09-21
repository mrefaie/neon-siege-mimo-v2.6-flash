# NEON SIEGE

A polished 2D Space Invaders–inspired browser game. Pure HTML/CSS/JS + Canvas 2D — no build step, no backend, no API keys.

> **Built by [mimo-v2.6-flash](https://github.com/mrefaie)** using the **opencode** harness + Chrome DevTools MCP.  
> This project was a capability test: plan → MVP → full game in ~30 minutes for about **$0.08** in tokens.  
> Repo: [`mrefaie/neon-siege-mimo-v2.6-flash`](https://github.com/mrefaie/neon-siege-mimo-v2.6-flash)

## Run

Serve the folder over HTTP (ES modules require it):

```bash
# Python
python3 -m http.server 8765
# or Node
npx --yes serve -l 8765
```

Open **http://127.0.0.1:8765/** in a browser.

## Controls

| Action | Keyboard | Mobile |
|---|---|---|
| Move | ← → or A / D | Drag the left stick |
| Fire | Hold Space | Autofire |
| Dash | Shift | DASH button |
| Pause | Esc | Pause via menu / tab switch |

## Gameplay

- Continuous world: waves never reset your ship, pickups, score, or power-ups.
- Boss every 5th wave (three designs, phased telegraphed attacks).
- 6 enemy archetypes, 8 encounter patterns, combo multipliers, local leaderboard.
- 15 power-ups across 5 families (Prism, Drones, Chrono, Aegis, Singularity). One variant per family; duplicates stack and extend.

## Settings & data

- Music / effects / voice volume, screen shake, reduced motion, voice on/off.
- Top-10 **Local leaderboard** (name, score, wave, duration, date) in `localStorage`.
- Corrupt or unavailable storage falls back to defaults — the game still runs.

## Assets & audio

- **Runtime:** procedural WebAudio (SFX + synthwave step-sequencer music) and browser speech synthesis for voice lines with captions. Nothing to download.
- **Optional sample generation:**  

  ```bash
  pip install numpy   # only needed for the generator
  python3 tools/generate_audio.py --out assets/
  ```

  Writes WAVs under `assets/`. The game does not require them; keep the script if you want offline samples.

- Voice uses `speechSynthesis` when available; if blocked/missing, captions still show and the game continues.

## Debug helper (disabled by default)

Enable with `?debug=1` on the URL or `localStorage.setItem('neon_siege_debug','1')`.

```js
__debug.wave(5)       // jump to wave
__debug.pickup('spread')  // spawn a power-up on the player
__debug.god(true)     // invulnerability
```

## Project layout

```
index.html
css/style.css
js/
  main.js              boot + single RAF loop
  core/                events, input, storage, audio, utils
  game/                world, player, enemies, bosses, waves,
                       encounters, power-ups, collisions, hud, fx
  ui/                  menus, touch controls, debug
tools/generate_audio.py
PLAN.md  TRACKER.md  README.md
```

## Verification notes

See **TRACKER.md** for the milestone checklist and which checks were actually executed in a browser versus not tested.

## Credits

- **Game design, code, art, audio & docs:** [mimo-v2.6-flash](https://github.com/mrefaie) (model `opencode-go/mimo-v2.6-flash`)
- **Harness:** [opencode](https://opencode.ai) with Chrome DevTools MCP for in-browser verification
- **Prompt / commission:** Mohamed El-Refaie ([@mrefaie](https://github.com/mrefaie))
- Inspired by classic *Space Invaders*; all assets generated locally (no third-party game assets).
