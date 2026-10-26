// Step 2 of 2: read raw lines not yet classified, split and score them, and append fragment
// blocks to the session files the app reads (see the README). Runs detached after each prompt;
// a lock keeps it to one at a time, and it loops until no new lines remain.
//   node classify.mjs            classify what's new
//   node classify.mjs --rebuild  forget the cursor and redo every session file from the raw log
//   node classify.mjs --apply-privacy  bring existing records down to the privacy settings, then rebuild
// A tightened privacy setting (settings.json "pending") is applied the same way on the next run.
import { existsSync, readdirSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dirs, ensureVault, lock, readJson, readSettings, settingsPath, writeJson } from "./vault.mjs";
import { classify } from "./heuristic.mjs";
import { removeOwnSessions, scrubForeignSessions, scrubRaw } from "./privacy.mjs";
import { tidyChatFiles } from "./tidy.mjs";

const CLASSIFIER = "heuristic-v1";
const MIN_WORDS = 4; // shorter messages count for tempo but don't become fragments
const cursorPath = join(dirs.state, "cursor.json");

function sessionFile(line) {
  const date = line.t.slice(0, 10);
  const [y, m] = date.split("-");
  const dir = join(dirs.sessions, y, m);
  mkdirSync(dir, { recursive: true });
  return { path: join(dir, `${date}_${line.session.slice(0, 8)}.md`), date };
}

function writeFragments(line, fragments, n) {
  const { path, date } = sessionFile(line);
  if (!existsSync(path)) {
    const project = line.project ? `project: ${line.project}\n` : "";
    appendFileSync(path, `---\nsession: ${line.session}\ndate: ${date}\n${project}classifier: ${CLASSIFIER}\n---\n`);
  }
  const time = line.t.slice(11, 19);
  const blocks = fragments.map((f, i) => {
    const fields = ["head", "heart", "gut", "spirit"].map((r) => `${r} ${f.weights[r].toFixed(2)}`).join(" · ");
    const tags = f.topics.map((t) => `#${t}`).join(" ");
    // What was said, as far as the privacy level allows: the words, the words that drove the
    // scores, or nothing.
    const said = f.excerpt ? `> ${f.excerpt.replace(/\n/g, " ")}\n\n` : f.keywords?.length ? `> keywords: ${f.keywords.join(", ")}\n\n` : "";
    return `\n### ${time} · m${n}f${i + 1}\n${said}${fields} · intensity ${f.intensity.toFixed(2)}${tags ? ` · ${tags}` : ""}\n`;
  });
  appendFileSync(path, blocks.join(""));
}

function pass(cursor) {
  let done = 0;
  const files = existsSync(dirs.raw) ? readdirSync(dirs.raw).filter((f) => f.endsWith(".jsonl")).sort() : [];
  for (const file of files) {
    const lines = readFileSync(join(dirs.raw, file), "utf8").split("\n").filter(Boolean);
    const from = cursor[file] ?? 0;
    for (let i = from; i < lines.length; i++) {
      let line;
      try {
        line = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (Array.isArray(line.scored)) {
        if (line.scored.length) writeFragments(line, line.scored, i + 1);
      } else if (typeof line.text === "string" && line.text.split(/\s+/).length >= MIN_WORDS) {
        const fragments = classify(line.text);
        if (fragments.length) writeFragments(line, fragments, i + 1);
      }
      done++;
    }
    cursor[file] = lines.length;
  }
  return done;
}

function main() {
  ensureVault();
  const rebuild = process.argv.includes("--rebuild");
  const release = lock("classify.lock");
  if (!release) return; // another classifier is running; it will pick up our line
  try {
    // A tightened privacy setting: scrub the raw log, then redraw every session from it.
    const settings = readSettings();
    const scrub = process.argv.includes("--apply-privacy") || settings.pending;
    if (scrub) {
      scrubRaw(settings);
      writeJson(settingsPath(), { ...readSettings(), pending: false }); // re-read: the scrub may have added the salt
    }
    // Redraw only what this classifier wrote: other writers (Claude chat, through the Legend skill)
    // keep their files, scrubbed in place to the privacy level.
    if (rebuild || scrub) removeOwnSessions(CLASSIFIER);
    if (scrub) scrubForeignSessions(readSettings());
    const cursor = rebuild || scrub ? {} : readJson(cursorPath, {});
    // Loop until nothing new arrived while we worked.
    for (let rounds = 0; rounds < 20 && pass(cursor) > 0; rounds++) writeJson(cursorPath, cursor);
    writeJson(cursorPath, cursor);
    tidyChatFiles(); // merge finished days of chat's one-file-per-message parts
  } finally {
    release();
  }
}

main();
