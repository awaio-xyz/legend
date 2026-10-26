// Tidying the vault. Claude chat (through the legend-chat-capture skill) writes one small file per
// message, YYYY-MM-DD_chat-xxxxxxxx_mN.md, because the Drive connector can't append. Once a day is
// over, each chat's parts are merged into one file, YYYY-MM-DD_chat-xxxxxxxx.md, in message order,
// and the parts are removed. A part that turns up later is appended to the merged file.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirs, localIso } from "./vault.mjs";

const PART = /^(\d{4}-\d{2}-\d{2})_(chat-[0-9a-z]+)_m(\d+)\.md$/i;
const FRONT = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function tidyChatFiles(today = localIso().slice(0, 10)) {
  const groups = new Map(); // dir|date|session → [{ n, path }]
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const m = PART.exec(name);
      if (!m || m[1] >= today) continue; // today's chat may still be writing
      const key = `${dir}|${m[1]}|${m[2]}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push({ n: Number(m[3]), path });
    }
  };
  walk(dirs.sessions);

  let merged = 0;
  for (const [key, parts] of groups) {
    const [dir, date, session] = key.split("|");
    parts.sort((a, b) => a.n - b.n);
    const texts = parts.map((p) => readFileSync(p.path, "utf8"));
    const target = join(dir, `${date}_${session}.md`);
    const head = existsSync(target) ? readFileSync(target, "utf8").replace(/\s*$/, "\n") : (FRONT.exec(texts[0])?.[0] ?? `---\nsession: ${session}\ndate: ${date}\nclassifier: claude-chat\n---\n`);
    const blocks = texts.map((t) => t.replace(FRONT, "").replace(/^\s+/, "\n").replace(/\s*$/, "\n")).join("");
    const out = head + blocks;
    writeFileSync(target, out);
    // Only remove the parts once the merged file holds every one of their blocks.
    const check = readFileSync(target, "utf8");
    const safe = texts.every((t) => [...t.matchAll(/^### .*$/gm)].every((h) => check.includes(h[0])));
    if (!safe) continue;
    for (const p of parts) rmSync(p.path);
    merged += parts.length;
  }
  return merged;
}
