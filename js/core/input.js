/** Keyboard + pointer input. Registered once at boot. */
const keys = new Set();
const pressed = new Set();
const released = new Set();

let fireHeld = false;
let dashEdge = false;
let moveAxis = 0;
let pointerX = null;

const KEYMAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  Space: "fire",
  ShiftLeft: "dash", ShiftRight: "dash",
  Escape: "pause",
  Enter: "confirm",
};

let onPause = null;

export const input = {
  init({ pause: pauseCb } = {}) {
    onPause = pauseCb || null;
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearAll);
  },

  /** axis: -1..1 */
  axis() {
    let a = 0;
    if (keys.has("left")) a -= 1;
    if (keys.has("right")) a += 1;
    if (moveAxis) a = moveAxis;
    return Math.max(-1, Math.min(1, a));
  },

  isDown(action) { return keys.has(action); },
  fire() { return fireHeld || keys.has("fire"); },
  consumeDash() {
    const d = dashEdge;
    dashEdge = false;
    return d;
  },
  consumePause() {
    const p = pressed.has("pause");
    pressed.delete("pause");
    return p;
  },
  consumeConfirm() {
    const c = pressed.has("confirm");
    pressed.delete("confirm");
    return c;
  },
  endFrame() {
    pressed.clear();
    released.clear();
  },
  setMoveAxis(a) { moveAxis = a; },
  setPointerX(x) { pointerX = x; },
  clearAll,
};

function onKeyDown(e) {
  if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  const action = KEYMAP[e.code];
  if (!action) return;
  if (e.repeat) return;
  keys.add(action);
  pressed.add(action);
  if (action === "fire") fireHeld = true;
  if (action === "dash") dashEdge = true;
  if (action === "pause") onPause?.();
}

function onKeyUp(e) {
  const action = KEYMAP[e.code];
  if (!action) return;
  keys.delete(action);
  released.add(action);
  if (action === "fire") fireHeld = false;
}

function clearAll() {
  keys.clear();
  pressed.clear();
  released.clear();
  fireHeld = false;
  dashEdge = false;
  moveAxis = 0;
}
