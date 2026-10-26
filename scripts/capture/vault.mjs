// Shared vault plumbing for the capture scripts.
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// Where the vault lives: LEGEND_VAULT if set, else the "vault" in ~/.legend/config.json, else
// ~/Legend. The desktop app looks in the same places, so capture and app always agree.
const configured = () => {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".legend", "config.json"), "utf8")).vault || null;
  } catch {
    return null;
  }
};
export const VAULT = process.env.LEGEND_VAULT || configured() || join(homedir(), "Legend");
export const dirs = {
  raw: join(VAULT, "raw"),
  sessions: join(VAULT, "sessions"),
  state: join(VAULT, ".legend"),
};

export function ensureVault() {
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
}

export const monthFile = (iso) => join(dirs.raw, `${iso.slice(0, 7)}.jsonl`);

// Privacy (the vault's settings.json, set from the desktop app):
//   privacy        "verbatim" keeps the text; "keywords" keeps only the words that drove the scores;
//                  "scores" keeps no words at all. It governs the raw log as well as the sessions, so
//                  a stricter level can't be rescored later.
//   recordProject  whether a capture notes which folder it came from (off by default).
//   pending        set when the level was tightened: existing records still need scrubbing.
export const settingsPath = () => join(VAULT, "settings.json");
export const PRIVACY_DEFAULTS = { privacy: "verbatim", recordProject: false, pending: false };
export function readSettings() {
  return { ...PRIVACY_DEFAULTS, ...readJson(settingsPath(), {}) };
}

/** True if this folder or any parent opts out of capture with a .legendignore file. */
export function ignored(cwd) {
  if (!cwd) return false;
  let dir = cwd;
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, ".legendignore"))) return true;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

/** Local time as an ISO string with the offset, e.g. 2026-10-25T12:41:07+00:00. */
export function localIso(d = new Date()) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

/** A simple exclusive lock. Returns a release function, or null if another classifier is running. */
export function lock(name, staleMs = 180000) {
  const path = join(dirs.state, name);
  try {
    if (existsSync(path) && Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
    closeSync(openSync(path, "wx"));
    writeFileSync(path, String(process.pid));
    return () => {
      try {
        unlinkSync(path);
      } catch {
        /* already gone */
      }
    };
  } catch {
    return null;
  }
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
