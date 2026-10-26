// Privacy levels for the raw log (see vault.mjs). A line below verbatim carries "scored" (its
// fragments' scores, and keywords at the keywords level) instead of "text", so it can still be
// drawn and rebuilt, but the words are gone.
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { classify } from "./heuristic.mjs";
import { dirs, readSettings, settingsPath, writeJson } from "./vault.mjs";

// At "scores", topic tags are words too, so they become salted hashes: the same topic still links
// to itself (topic colours, topic edges), but no word is written. The salt is the vault's own.
function topicHasher() {
  const settings = readSettings();
  if (!settings.salt) {
    settings.salt = randomBytes(12).toString("hex");
    writeJson(settingsPath(), settings);
  }
  return (topic) => (/^t[0-9a-f]{6}$/.test(topic) ? topic : "t" + createHash("sha256").update(settings.salt + topic).digest("hex").slice(0, 6));
}

const MIN_WORDS = 4;

/** Replace a line's text with its scores (and keywords, at the keywords level). */
export function scoredLine(line, level) {
  if (level === "verbatim" || typeof line.text !== "string") return line;
  const { text, ...rest } = line;
  const fragments = text.split(/\s+/).length >= MIN_WORDS ? classify(text) : [];
  const hash = level === "scores" ? topicHasher() : (t) => t;
  return {
    ...rest,
    words: text.split(/\s+/).length, // still counts for tempo
    scored: fragments.map((f) => ({ weights: f.weights, intensity: f.intensity, topics: f.topics.map(hash), ...(level === "keywords" ? { keywords: f.keywords } : {}) })),
  };
}

/** Bring every raw line down to the settings: strip text, keywords and project names as needed. */
export function scrubRaw(settings) {
  if (!existsSync(dirs.raw)) return 0;
  let changed = 0;
  for (const file of readdirSync(dirs.raw).filter((f) => f.endsWith(".jsonl"))) {
    const path = join(dirs.raw, file);
    const out = readFileSync(path, "utf8").split("\n").filter(Boolean).map((raw) => {
      let line;
      try {
        line = JSON.parse(raw);
      } catch {
        return raw;
      }
      const before = JSON.stringify(line);
      if (!settings.recordProject) delete line.project;
      line = scoredLine(line, settings.privacy);
      if (settings.privacy === "scores" && Array.isArray(line.scored)) {
        const hash = topicHasher();
        line.scored = line.scored.map(({ keywords: _k, ...s }) => ({ ...s, topics: (s.topics ?? []).map(hash) }));
      }
      const after = JSON.stringify(line);
      if (after !== before) changed++;
      return after;
    });
    writeFileSync(path, out.join("\n") + "\n");
  }
  return changed;
}

/** Every session file in the vault, with its text. */
function sessionFiles() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".md")) out.push({ path, text: readFileSync(path, "utf8") });
    }
  };
  walk(dirs.sessions);
  return out;
}

const classifierOf = (text) => /^classifier:\s*(\S+)/m.exec(text)?.[1] ?? "";

/** Remove the session files this classifier wrote (they're redrawn from the raw log). */
export function removeOwnSessions(classifier) {
  for (const f of sessionFiles()) if (classifierOf(f.text) === classifier) rmSync(f.path);
}

/**
 * Session files written by others (Claude chat) have no raw log behind them, so they're scrubbed
 * in place: below verbatim the excerpts go (keywords can't be recovered from them, so they're
 * dropped too at that level), at "scores" the topic tags go, and project lines go unless recorded.
 */
export function scrubForeignSessions(settings) {
  for (const f of sessionFiles()) {
    if (classifierOf(f.text).startsWith("heuristic")) continue;
    let text = f.text;
    if (!settings.recordProject) text = text.replace(/^project:.*\n/m, "");
    if (settings.privacy !== "verbatim") text = text.replace(/^> (?!keywords:).*\n\n?/gm, "");
    if (settings.privacy === "scores") text = text.replace(/^> keywords:.*\n\n?/gm, "").replace(/ · #[^\n]*/g, "");
    if (text !== f.text) writeFileSync(f.path, text);
  }
}
