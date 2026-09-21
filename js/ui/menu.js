import { events } from "../core/events.js";
import { audio } from "../core/audio.js";
import { storage } from "../core/storage.js";
import { game } from "../game/game.js";
import { fmtTime } from "../core/utils.js";

const $ = (id) => document.getElementById(id);
const screens = ["screen-title", "screen-howto", "screen-leaderboard", "screen-settings", "screen-pause", "screen-gameover"];

let settings = null;
let onBack = null;

function show(id) {
  for (const s of screens) $(s)?.classList.toggle("hidden", s !== id);
}

function hideAll() {
  for (const s of screens) $(s)?.classList.add("hidden");
}

export const menu = {
  _bound: false,

  init({ backToTitle }) {
    settings = storage.loadSettings();
    onBack = backToTitle;
    this.bindSettingsUI();
    this.bindButtons();

    if (!this._bound) {
      this._bound = true;
      events.on("ui:pause", () => this.showPause());
      events.on("ui:resume", () => this.hidePause());
      events.on("game:over", (stats) => this.showGameOver(stats));
    }
    // Escape handling lives in main.js tick via input.consumePause
  },

  openTitle() {
    show("screen-title");
  },

  hideAll,

  showPause() { show("screen-pause"); },
  hidePause() { hideAll(); },

  bindButtons() {
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      audio.unlock();
      audio.play("menu");

      switch (action) {
        case "play":
          audio.play("menuConfirm");
          hideAll();
          game.startNewRun();
          break;
        case "howto":
          show("screen-howto");
          break;
        case "leaderboard":
          this.renderLeaderboard();
          show("screen-leaderboard");
          break;
        case "settings":
          this.syncSettingsUI();
          show("screen-settings");
          break;
        case "back":
          show("screen-title");
          break;
        case "resume":
          game.resume();
          hideAll();
          break;
        case "restart":
          hideAll();
          game.startNewRun();
          break;
        case "quit":
          hideAll();
          game.quitToMenu();
          show("screen-title");
          break;
        case "submit-score":
          this.submitScore();
          break;
      }
    });
  },

  bindSettingsUI() {
    const map = [
      ["set-music", "music"],
      ["set-sfx", "sfx"],
      ["set-voice", "voice"],
      ["set-shake", "shake"],
      ["set-reduced", "reducedMotion"],
      ["set-voice-on", "voiceOn"],
    ];
    for (const [id, key] of map) {
      const el = $(id);
      if (!el) continue;
      el.addEventListener("input", () => {
        if (el.type === "checkbox") settings[key] = el.checked;
        else settings[key] = Number(el.value);
        this.applySettings();
        storage.saveSettings(settings);
        this.syncSettingsUI();
      });
    }
    this.syncSettingsUI();
  },

  syncSettingsUI() {
    const pairs = [
      ["set-music", settings.music],
      ["set-sfx", settings.sfx],
      ["set-voice", settings.voice],
    ];
    for (const [id, v] of pairs) {
      const el = $(id);
      if (!el) continue;
      el.value = v;
      const lbl = el.parentElement.querySelector(".rng-val");
      if (lbl) lbl.textContent = v;
    }
    const checks = [
      ["set-shake", settings.shake],
      ["set-reduced", settings.reducedMotion],
      ["set-voice-on", settings.voiceOn],
    ];
    for (const [id, v] of checks) {
      const el = $(id);
      if (el) el.checked = v;
    }
  },

  applySettings() {
    audio.setSettings(settings);
    events.emit("settings:changed", settings);
  },

  getSettings() { return settings; },

  renderLeaderboard() {
    const tbody = $("leaderboard-table")?.querySelector("tbody");
    if (!tbody) return;
    const list = storage.loadScores();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No scores yet — be the first.</td></tr>`;
      return;
    }
    tbody.innerHTML =
      `<tr><th>#</th><th>NAME</th><th>SCORE</th><th>WAVE</th><th>DATE</th></tr>` +
      list
        .map(
          (s, i) =>
            `<tr><td class="rank">${i + 1}</td><td>${escapeHtml(s.name)}</td><td class="score">${s.score.toLocaleString()}</td><td>${s.wave}</td><td>${shortDate(s.date)}</td></tr>`
        )
        .join("");
  },

  showGameOver(stats) {
    const dl = $("gameover-stats");
    if (dl) {
      dl.innerHTML = `
        <dt>SCORE</dt><dd>${stats.score.toLocaleString()}</dd>
        <dt>WAVE</dt><dd>${stats.wave}</dd>
        <dt>TIME</dt><dd>${fmtTime(stats.duration)}</dd>
        <dt>KILLS</dt><dd>${stats.kills}</dd>
        <dt>ACCURACY</dt><dd>${stats.accuracy}%</dd>
        <dt>BEST COMBO</dt><dd>×${stats.bestCombo}</dd>
      `;
    }
    const entry = $("name-entry");
    const qualifies = storage.qualifies(stats.score) && stats.score > 0;
    entry?.classList.toggle("hidden", !qualifies);
    const input = $("player-name");
    if (input) input.value = storage.loadName() || "";
    show("screen-gameover");
    this._pendingStats = stats;
    this._qualified = qualifies;
  },

  submitScore() {
    const stats = this._pendingStats;
    if (!stats || !this._qualified) {
      hideAll();
      game.quitToMenu();
      show("screen-title");
      return;
    }
    const input = $("player-name");
    const name = (input?.value || "ACE").trim().slice(0, 12) || "ACE";
    storage.saveName(name);
    storage.addScore({
      name,
      score: stats.score,
      wave: stats.wave,
      duration: stats.duration,
      date: new Date().toISOString(),
    });
    audio.play("menuConfirm");
    hideAll();
    game.quitToMenu();
    show("screen-title");
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shortDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}
