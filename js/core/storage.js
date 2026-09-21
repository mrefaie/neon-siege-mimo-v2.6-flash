const KEY_SETTINGS = "neon_siege_settings_v1";
const KEY_SCORES = "neon_siege_scores_v1";
const KEY_NAME = "neon_siege_name_v1";
const MAX_SCORES = 10;

export const DEFAULT_SETTINGS = {
  music: 55,
  sfx: 70,
  voice: 70,
  shake: true,
  reducedMotion: false,
  voiceOn: true,
};

function safeParse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? safeParse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  loadSettings() {
    const s = read(KEY_SETTINGS);
    if (!s) return { ...DEFAULT_SETTINGS };
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in s) {
        if (typeof DEFAULT_SETTINGS[k] === "number") {
          const n = Number(s[k]);
          if (Number.isFinite(n)) out[k] = Math.max(0, Math.min(100, n));
        } else {
          out[k] = !!s[k];
        }
      }
    }
    return out;
  },

  saveSettings(s) {
    return write(KEY_SETTINGS, s);
  },

  loadScores() {
    const list = read(KEY_SCORES);
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.score)))
      .map((e) => ({
        name: String(e.name || "ACE").slice(0, 12),
        score: Math.max(0, Math.floor(Number(e.score))),
        wave: Math.max(1, Math.floor(Number(e.wave) || 1)),
        duration: Math.max(0, Number(e.duration) || 0),
        date: typeof e.date === "string" ? e.date : new Date().toISOString(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  },

  addScore(entry) {
    const list = storage.loadScores();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, MAX_SCORES);
    write(KEY_SCORES, top);
    return top;
  },

  qualifies(score) {
    if (score <= 0) return false;
    const list = storage.loadScores();
    if (list.length < MAX_SCORES) return true;
    return score > list[list.length - 1].score;
  },

  loadName() {
    try { return localStorage.getItem(KEY_NAME) || ""; } catch { return ""; }
  },

  saveName(name) {
    try { localStorage.setItem(KEY_NAME, String(name).slice(0, 12)); } catch { /* ignore */ }
  },

  /** test helper */
  _keys: { KEY_SETTINGS, KEY_SCORES },
};
