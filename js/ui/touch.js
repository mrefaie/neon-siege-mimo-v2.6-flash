import { input } from "../core/input.js";

/** Virtual stick + dash button for mobile. */
export const touch = {
  enabled: false,
  stickId: "touch-stick",
  knobId: "touch-knob",
  dashId: "touch-dash",
  wrapId: "touch-controls",
  _active: false,
  _pid: null,
  _originX: 0,

  init() {
    this.wrap = document.getElementById(this.wrapId);
    this.stick = document.getElementById(this.stickId);
    this.knob = document.getElementById(this.knobId);
    this.dashBtn = document.getElementById(this.dashId);
    if (!this.stick) return;

    const isCoarse = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.setEnabled(isCoarse);

    // stick
    const onDown = (e) => {
      if (!this.enabled) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this._active = true;
      this._pid = t.identifier ?? "mouse";
      const rect = this.stick.getBoundingClientRect();
      this._originX = rect.left + rect.width / 2;
      this._originY = rect.top + rect.height / 2;
      this._maxR = rect.width / 2 - 10;
      this.move(t.clientX, t.clientY);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!this._active) return;
      const t = e.changedTouches
        ? Array.from(e.changedTouches).find((x) => (x.identifier ?? "mouse") === this._pid)
        : e;
      if (!t) return;
      this.move(t.clientX, t.clientY);
      e.preventDefault();
    };
    const onUp = () => {
      this._active = false;
      this._pid = null;
      input.setMoveAxis(0);
      if (this.knob) this.knob.style.transform = "translate(0,0)";
    };

    this.stick.addEventListener("touchstart", onDown, { passive: false });
    this.stick.addEventListener("touchmove", onMove, { passive: false });
    this.stick.addEventListener("touchend", onUp);
    this.stick.addEventListener("touchcancel", onUp);
    // mouse fallback for testing
    this.stick.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    // dash button — simulate shift press via input
    const dashDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      input._touchDash = true;
      // feed one frame of dash edge
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" })), 50);
    };
    this.dashBtn?.addEventListener("touchstart", dashDown, { passive: false });
    this.dashBtn?.addEventListener("mousedown", dashDown);
  },

  move(cx, cy) {
    const dx = cx - this._originX;
    const dy = cy - this._originY;
    const max = this._maxR || 50;
    const d = Math.hypot(dx, dy);
    const cl = Math.min(d, max);
    const nx = d ? (dx / d) * cl : 0;
    const ny = d ? (dy / d) * cl : 0;
    if (this.knob) this.knob.style.transform = `translate(${nx}px, ${ny}px)`;
    // horizontal axis with deadzone
    const ax = Math.abs(nx) < max * 0.18 ? 0 : Math.max(-1, Math.min(1, nx / (max * 0.7)));
    input.setMoveAxis(ax);
  },

  setEnabled(v) {
    this.enabled = v;
    this.wrap?.classList.toggle("hidden", !v);
    // mobile autofire
    const p = document.getElementById("app");
    if (p) p.dataset.touch = v ? "1" : "0";
  },

  setAutofire(playerRef) {
    // called by main each frame
  },
};
