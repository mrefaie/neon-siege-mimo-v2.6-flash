#!/usr/bin/env python3
"""
NEON SIEGE — optional asset generation script.

The game runs fully offline with procedural WebAudio (no files required).
This script generates optional WAV samples you can bundle under assets/ if you
prefer sample-based sound. Runtime does NOT require these files.

Usage:
  python3 tools/generate_audio.py
  python3 tools/generate_audio.py --out assets/

Requires: numpy (pip install numpy). Writes 16-bit PCM WAV files.
"""
from __future__ import annotations

import argparse
import math
import os
import struct
import wave


SR = 44100


def _write_wav(path: str, samples: list[float]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))
    print(f"wrote {path} ({len(samples)/SR:.2f}s)")


def _env(i: int, n: int, attack: float = 0.01, release: float = 0.3) -> float:
    t = i / SR
    dur = n / SR
    a = max(attack, 1e-4)
    r = max(release, 1e-4)
    if t < a:
        return t / a
    if t > dur - r:
        return max(0.0, (dur - t) / r)
    return 1.0


def beep(freq: float, dur: float, kind: str = "square") -> list[float]:
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        phase = (freq * t) % 1.0
        if kind == "square":
            s = 1.0 if phase < 0.5 else -1.0
        elif kind == "saw":
            s = 2.0 * phase - 1.0
        elif kind == "tri":
            s = 4.0 * abs(phase - 0.5) - 1.0
        else:  # sine
            s = math.sin(2 * math.pi * freq * t)
        # pitch drop for lasers
        out.append(s * 0.35 * _env(i, n, 0.005, dur * 0.6))
    return out


def noise_hit(dur: float = 0.3, tone: float = 0.4) -> list[float]:
    n = int(SR * dur)
    out = []
    seed = 12345
    for i in range(n):
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        r = (seed / 0x7FFFFFFF) * 2 - 1
        # simple lowpass blend
        s = r * tone + math.sin(2 * math.pi * 60 * i / SR) * (1 - tone) * 0.5
        out.append(s * 0.5 * _env(i, n, 0.002, dur * 0.7))
    return out


def concat(*parts: list[float]) -> list[float]:
    out: list[float] = []
    for p in parts:
        out.extend(p)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate optional NEON SIEGE WAV assets")
    ap.add_argument("--out", default="assets", help="output directory")
    args = ap.parse_args()
    out = args.out

    _write_wav(os.path.join(out, "shoot.wav"), beep(880, 0.08, "square"))
    _write_wav(os.path.join(out, "laser.wav"), concat(beep(1400, 0.05, "saw"), beep(700, 0.08, "saw")))
    _write_wav(os.path.join(out, "hit.wav"), beep(220, 0.06, "square"))
    _write_wav(os.path.join(out, "explode.wav"), noise_hit(0.35, 0.7))
    _write_wav(os.path.join(out, "big_explode.wav"), noise_hit(0.6, 0.5))
    _write_wav(os.path.join(out, "pickup.wav"), concat(beep(660, 0.07, "tri"), beep(990, 0.07, "tri"), beep(1320, 0.1, "tri")))
    _write_wav(os.path.join(out, "dash.wav"), noise_hit(0.18, 0.9))
    _write_wav(os.path.join(out, "powerup.wav"), concat(beep(523, 0.08, "tri"), beep(659, 0.08, "tri"), beep(784, 0.08, "tri"), beep(1047, 0.12, "tri")))
    _write_wav(os.path.join(out, "wave_clear.wav"), concat(beep(392, 0.12, "sq"), beep(523, 0.12, "sq"), beep(659, 0.12, "sq"), beep(784, 0.16, "sq")))

    print("Done. These are optional — the game uses procedural WebAudio by default.")


if __name__ == "__main__":
    main()
