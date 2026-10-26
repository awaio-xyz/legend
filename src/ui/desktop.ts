// The desktop shell's side of things: which window this is, and reading the vault straight from disk
// (the browser has to ask for a folder; the desktop app knows where ~/Legend lives).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Fragment } from "../engine/fragments";
import { parseSession } from "./vault";

export const inDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
// In development, ?widget previews the widget in a browser tab (without the window behaviour).
export const isWidget = () => (inDesktop && getCurrentWindow().label === "widget") || (import.meta.env.DEV && location.search.includes("widget"));

export interface NativeVault {
  path: string;
  name: string;
  seed: string | null;
  fragments: Fragment[];
}

/** Read a vault from disk: the folder given, or your own Legend. */
export async function readNativeVault(path?: string): Promise<NativeVault> {
  if (!inDesktop) throw new Error("no desktop shell");
  const files = await invoke<{ path: string; seed: string | null; sessions: string[] }>("read_vault", { path: path ?? null });
  const fragments = files.sessions.flatMap(parseSession).sort((a, b) => a.t - b.t);
  const name = files.path.split(/[\\/]/).filter(Boolean).pop() ?? "Legend";
  return { path: files.path, name, seed: files.seed, fragments };
}

/**
 * Watch the vault every few seconds and report fragments not seen before. Each look only lists file
 * names and times; only files that are new or changed since the last look are read. (Tracked by
 * path, not just time: a file synced from Drive can arrive with an older timestamp.) Returns a stop
 * function.
 */
export function watchNativeVault(seen: Set<string>, onNew: (fragments: Fragment[]) => void, everyMs = 4000, path?: string): () => void {
  let stopped = false;
  let busy = false;
  let known: Map<string, number> | null = null; // path → modified, from the previous look
  const started = Date.now();
  const timer = window.setInterval(async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const listing = await invoke<{ path: string; modified: number }[]>("list_sessions", { path: path ?? null });
      // The first look only learns what's there (the caller has drawn it), except files touched just
      // before the watch began, which may have landed after the caller's read. The seen check drops
      // anything already drawn.
      const changed = listing
        .filter((s) => (known ? known.get(s.path) !== s.modified : s.modified >= started - 15000))
        .map((s) => s.path);
      known = new Map(listing.map((s) => [s.path, s.modified]));
      if (!changed.length) return;
      const texts = await invoke<string[]>("read_sessions", { paths: changed, root: path ?? null });
      const fresh = texts.flatMap(parseSession).filter((f) => !seen.has(f.id));
      fresh.forEach((f) => seen.add(f.id));
      if (fresh.length && !stopped) onNew(fresh);
    } catch {
      /* mid-write; try again next tick */
    } finally {
      busy = false;
    }
  }, everyMs);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export const showWindow = (label: "main" | "widget") => invoke("show_window", { label });

/** The native folder dialog: a vault to open. Resolves null when cancelled. */
export async function pickVaultFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title: "Open a Legend" });
  return typeof dir === "string" ? dir : null;
}

// Recently opened vaults (desktop), newest first.
const RECENT_KEY = "legend.recentVaults";
export interface RecentVault {
  path: string;
  name: string;
}
export const readRecent = (): RecentVault[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};
export const rememberVault = (v: RecentVault) => {
  const next = [v, ...readRecent().filter((r) => r.path !== v.path)].slice(0, 5);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* recents just won't persist */
  }
  return next;
};

/**
 * What the full app is showing, for the widget to follow: your Legend, or the simulated person
 * (with its sliders). Shared through storage, which both windows see; the time stamp makes every
 * change an event even when the view is the same as before.
 */
export type View = { kind: "vault"; path?: string } | { kind: "sim"; sim: { seed: string; counts: [number, number, number, number]; replaySeconds: number } };
export const VIEW_KEY = "legend.view";
export const publishView = (view: View) => {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ ...view, at: Date.now() }));
  } catch {
    /* the widget keeps what it has */
  }
};
export const toggleWidget = () => invoke("toggle_window", { label: "widget" });
export const quitApp = () => invoke("quit");
