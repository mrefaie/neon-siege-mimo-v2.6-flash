import { clamp } from "../core/utils.js";
import { events } from "../core/events.js";
import { player } from "./player.js";
import { waveDirector } from "./waves.js";
import { getActiveList, powerState, FAMILIES } from "./powerups.js";

const $ = (id) => document.getElementById(id);

export const hud = {
  el: null,

  init() {
    this.el = $("hud");
    this._score = -1;
    this._wave = -1;
    this._hp = -1;
    events.on("power:changed", () => this.renderPowerups());
  },

  show(v) { this.el?.classList.toggle("hidden", !v); },

  renderPowerups() {
    const wrap = $("hud-powerups");
    if (!wrap) return;
    const list = getActiveList();
    if (!list.length) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = list
      .map(
        (a) => `
      <div class="pu-chip" style="color:${a.fam.color}">
        <span class="icon"></span>
        <span>${a.def.name}</span>
        <span class="stack">×${a.stack}</span>
        <span class="t">${a.def.charges ? a.charges + "⟳" : Math.ceil(a.t) + "s"}</span>
      </div>`
      )
      .join("");
  },

  update(hiscore) {
    const score = Math.floor(window.__score || 0);
    if (score !== this._score) {
      this._score = score;
      const el = $("hud-score");
      if (el) el.textContent = score.toLocaleString();
      const mult = $("hud-mult");
      if (mult) mult.textContent = `×${(window.__mult || 1).toFixed(1)}`;
    } else {
      const mult = $("hud-mult");
      if (mult) mult.textContent = `×${(window.__mult || 1).toFixed(1)}`;
    }

    const wave = waveDirector.wave;
    if (wave !== this._wave) {
      this._wave = wave;
      const el = $("hud-wave");
      if (el) el.textContent = wave;
      const name = $("hud-wave-name");
      if (name) name.textContent = waveDirector.encounterName || "";
    }

    const hp = Math.ceil(player.hp);
    if (hp !== this._hp) {
      this._hp = hp;
      const h = $("hud-hp");
      if (h) h.textContent = hp;
    }
    const bar = $("hud-hp-bar");
    if (bar) bar.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;

    const dash = $("hud-dash-bar");
    if (dash) {
      const ready = player.dashReady();
      const frac = ready ? 1 : 1 - clamp(player.dashCd / 1.15, 0, 1);
      dash.style.width = `${frac * 100}%`;
    }

    const hi = $("hud-hiscore");
    if (hi) hi.textContent = (hiscore || 0).toLocaleString();

    // combo chip throttled
    if (this._puTick === undefined) this._puTick = 0;
    this._puTick++;
    if (this._puTick % 15 === 0) this.renderPowerups();
  },

  showCombo(text) {
    const el = $("hud-combo");
    if (!el) return;
    if (!text) { el.classList.add("hidden"); return; }
    el.textContent = text;
    el.classList.remove("hidden");
  },

  banner(text) {
    const el = $("wave-banner");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
    // reflow to restart animation
    void el.offsetWidth;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    if (this._bannerT) clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.add("hidden"), 1700);
  },
};
