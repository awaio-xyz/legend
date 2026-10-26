// Reading a Legend vault from disk (see the README): session markdown files of fragment blocks,
// plus genome.json for the seed. Uses the browser's folder picker (Chromium, including the Tauri
// WebView2 shell), so no native plugin is needed yet.
import type { Fragment } from "../engine/fragments";
import { hashString } from "../engine/rng";

// Minimal typings for the File System Access API.
interface FileHandle { kind: "file"; name: string; getFile(): Promise<File> }
interface DirHandle { kind: "directory"; name: string; values(): AsyncIterable<FileHandle | DirHandle> }
declare global {
  interface Window { showDirectoryPicker?: (opts?: { mode?: "read" }) => Promise<DirHandle> }
}

export interface Vault {
  name: string;
  fragments: Fragment[];
  seed: string | null; // from genome.json, when present
  handle: DirHandle; // kept so the app can watch for new fragments
}

export const canPickFolders = () => typeof window !== "undefined" && !!window.showDirectoryPicker;

/** Ask for a folder and read it as a Legend vault. Resolves null if the user cancels. */
export async function pickVault(): Promise<Vault | null> {
  if (!window.showDirectoryPicker) throw new Error("This browser can't open folders. Use Chrome, Edge or the desktop app.");
  let dir: DirHandle;
  try {
    dir = await window.showDirectoryPicker({ mode: "read" });
  } catch {
    return null; // cancelled
  }
  return readVault(dir);
}

async function readVault(root: DirHandle): Promise<Vault> {
  let seed: string | null = null;
  const sessions: string[] = [];
  const walk = async (dir: DirHandle, path: string) => {
    for await (const entry of dir.values()) {
      if (entry.kind === "directory") {
        if (!entry.name.startsWith(".")) await walk(entry, `${path}/${entry.name}`);
      } else if (entry.name === "genome.json" && path === "") {
        try {
          seed = JSON.parse(await (await entry.getFile()).text()).seed ?? null;
        } catch {
          /* an unreadable genome just means the app keeps its own */
        }
      } else if (entry.name.endsWith(".md") && path.includes("/sessions")) {
        sessions.push(await (await entry.getFile()).text());
      }
    }
  };
  await walk(root, "");
  const fragments = sessions.flatMap(parseSession).sort((a, b) => a.t - b.t);
  return { name: root.name, fragments, seed, handle: root };
}

const FIELD = /(head|heart|gut|spirit|intensity)\s+([\d.]+)/g;

/** Parse one session file's fragment blocks. Times are kept absolute; the app rescales them. */
export function parseSession(text: string): Fragment[] {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const session = /session:\s*(\S+)/.exec(front)?.[1] ?? "session";
  const date = /date:\s*(\S+)/.exec(front)?.[1] ?? "1970-01-01";
  const out: Fragment[] = [];
  const blocks = text.split(/^### /m).slice(1);
  for (const block of blocks) {
    const [head, ...rest] = block.split("\n");
    const time = /(\d\d:\d\d(?::\d\d)?)/.exec(head)?.[1] ?? "00:00:00";
    const id = head.split("·").pop()?.trim() || String(out.length);
    const fieldsLine = rest.find((l) => /\b(head|heart|gut|spirit)\s+[\d.]/.test(l)) ?? "";
    const v: Record<string, number> = { head: 0, heart: 0, gut: 0, spirit: 0, intensity: 0.5 };
    for (const m of fieldsLine.matchAll(FIELD)) v[m[1]] = Number(m[2]);
    const tag = /#([\w-]+)/.exec(fieldsLine)?.[1] ?? "untagged";
    const sum = v.head + v.heart + v.gut + v.spirit || 1;
    out.push({
      id: `${session}:${id}`,
      t: Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}`) / 1000,
      weights: [v.head / sum, v.heart / sum, v.gut / sum, v.spirit / sum],
      intensity: Math.min(1, Math.max(0, v.intensity)),
      topic: hashString(`topic:${tag}`) % 997,
    });
  }
  return out;
}

/**
 * Watch a loaded vault: re-read it every few seconds and report fragments not seen before, so a
 * conversation in progress lands on the figure live. The browser can't subscribe to folder changes,
 * so it polls. Returns a stop function.
 */
export function watchVault(vault: Vault, onNew: (fragments: Fragment[]) => void, everyMs = 4000): () => void {
  const seen = new Set(vault.fragments.map((f) => f.id));
  let stopped = false;
  let busy = false;
  const timer = window.setInterval(async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const next = await readVault(vault.handle);
      const fresh = next.fragments.filter((f) => !seen.has(f.id));
      fresh.forEach((f) => seen.add(f.id));
      if (fresh.length && !stopped) onNew(fresh);
    } catch {
      /* the folder may be mid-write; try again next tick */
    } finally {
      busy = false;
    }
  }, everyMs);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
