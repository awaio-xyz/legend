import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawGenome, makeSeed, type RareTrait } from "./engine/genome";
import { DEFAULT_STYLE, LegendEngine, type Stats, type Style } from "./engine/legend";
import { DEFAULT_SIM, type SimParams } from "./engine/fragments";
import { Panel } from "./ui/Panel";
import { Dock } from "./ui/Dock";
import { pickVault, watchVault } from "./ui/vault";
import { inDesktop, pickVaultFolder, publishView, readNativeVault, readRecent, rememberVault, toggleWidget, watchNativeVault, type RecentVault } from "./ui/desktop";
import { Imagery } from "./ui/Imagery";
import { Splash, SPLASH_BUILD_AT } from "./ui/Splash";
import { Timeline } from "./ui/Timeline";
import { useFlyout } from "./ui/flyout";
import "./App.css";

// The sketch's stand-in for a real birth: the first words written about Legend, 2026-10-24.
const FIRST_WORDS = "the nodes will always be generated in the bust shape of a human head shoulders chest and stomach";
const CREATED_AT = "2026-10-24T12:00:00+10:00";

export type RarePreview = "genome" | "none" | RareTrait;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LegendEngine | null>(null);

  const firstWords = FIRST_WORDS; // the sketch's stand-in seed; a real vault brings its own
  const [vaultSeed, setVaultSeed] = useState<string | null>(null);
  const [rarePreview, setRarePreview] = useState<RarePreview>("genome");
  const [style, setStyleNow] = useState<Style>(DEFAULT_STYLE);
  // Undo and redo for the look. A burst of changes (a slider drag) counts as one step.
  const history = useRef<{ past: Style[]; future: Style[]; last: number }>({ past: [], future: [], last: 0 });
  const [, bump] = useState(0);
  const setStyle = (next: Style) => {
    const h = history.current;
    const now = performance.now();
    if (now - h.last > 600) h.past.push(style);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    h.last = now;
    setStyleNow(next);
    bump((n) => n + 1);
  };
  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(style);
    h.last = 0;
    setStyleNow(prev);
    bump((n) => n + 1);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(style);
    h.last = 0;
    setStyleNow(next);
    bump((n) => n + 1);
  };
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  const [sim, setSim] = useState<SimParams>(DEFAULT_SIM);
  const [source, setSource] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  // The Experiment panel behaves like the settings menu: it closes a moment after the pointer
  // leaves, and at once on a click elsewhere.
  const expBox = useRef<HTMLDivElement>(null);
  const expHover = useFlyout(expBox, devOpen, () => setDevOpen(false));
  const [hidden, setHidden] = useState(false);
  const [timeline, setTimeline] = useState(false);
  const [recent, setRecent] = useState<RecentVault[]>(readRecent);
  const getEngine = useCallback(() => engineRef.current, []);
  const stopWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWatch.current?.(), []);

  const genome = useMemo(() => {
    const g = drawGenome(vaultSeed ?? makeSeed(firstWords, CREATED_AT));
    return rarePreview === "genome" ? g : { ...g, rare: rarePreview === "none" ? null : rarePreview };
  }, [firstWords, vaultSeed, rarePreview]);

  // Mount once; later changes go through the setters below. Building the figure holds the page for
  // a moment, so it waits until the splash has drawn itself, and happens behind it.
  useEffect(() => {
    let engine: LegendEngine | null = null;
    const build = window.setTimeout(() => {
      engine = new LegendEngine(hostRef.current!, genome, style, sim);
      engine.onStats = setStats;
      engineRef.current = engine;
      if (import.meta.env.DEV) (window as unknown as { legend: LegendEngine }).legend = engine;
    }, SPLASH_BUILD_AT);
    return () => {
      window.clearTimeout(build);
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mounted = useRef({ genome: false, style: false, sim: false });
  useEffect(() => {
    if (mounted.current.genome) engineRef.current?.setGenome(genome);
    mounted.current.genome = true;
  }, [genome]);
  useEffect(() => {
    if (mounted.current.style) engineRef.current?.setStyle(style);
    mounted.current.style = true;
    // The widget wears whatever look the full app has.
    try {
      localStorage.setItem("legend.style", JSON.stringify(style));
    } catch {
      /* the widget keeps its default look */
    }
  }, [style]);
  useEffect(() => {
    if (mounted.current.sim) {
      // Touching the simulated person switches back to it, wholly: stop watching the vault (or its
      // new fragments would land on the simulated person) and drop the vault's genome.
      stopWatch.current?.();
      stopWatch.current = null;
      setVaultSeed(null);
      engineRef.current?.setSim(sim);
      setSource(null);
      publishView({ kind: "sim", sim });
    }
    mounted.current.sim = true;
  }, [sim]);
  useEffect(() => engineRef.current?.setLive(live), [live]);

  // H hides everything (art mode); E opens the Experiment panel; Ctrl+Z / Ctrl+Y undo and redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) undoRef.current.redo();
        else undoRef.current.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        undoRef.current.redo();
        return;
      }
      if (k === "h") setHidden((h) => !h);
      if (k === "e") setDevOpen((o) => !o);
      if (k === "w" && inDesktop) toggleWidget(); // the floating widget, in the desktop app
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** The desktop app knows where your Legend lives: show it, watch it, and tell the widget. */
  // A vault from disk: your own Legend (no path), or any folder you open. Opening one is only
  // viewing it: capture keeps writing to your Legend.
  const showNativeVault = async (path?: string) => {
    const vault = await readNativeVault(path).catch(() => null);
    if (!vault || !vault.fragments.length) {
      window.alert(path ? `No fragments found in "${path}". A Legend vault keeps them in sessions/…/*.md.` : "Your Legend is empty so far: it fills in as you talk to Claude.");
      return;
    }
    if (path) setRecent(rememberVault({ path, name: vault.name }));
    if (vault.seed) setVaultSeed(vault.seed);
    engineRef.current?.loadFragments(vault.fragments);
    let count = vault.fragments.length;
    setSource(`${vault.name} · ${count.toLocaleString()}`);
    stopWatch.current?.();
    stopWatch.current = watchNativeVault(
      new Set(vault.fragments.map((f) => f.id)),
      (fresh) => {
        engineRef.current?.addFragments(fresh);
        count += fresh.length;
        setSource(`${vault.name} · ${count.toLocaleString()}`);
      },
      4000,
      path,
    );
    publishView({ kind: "vault", path });
  };

  /** The folder flyout: your Legend, a recent one, or a folder picked now. */
  const openVault = async (choice: "own" | "pick" | RecentVault) => {
    if (choice === "own") return showNativeVault();
    if (typeof choice === "object") return showNativeVault(choice.path);
    if (inDesktop) {
      const path = await pickVaultFolder();
      if (path) await showNativeVault(path);
      return;
    }
    try {
      const vault = await pickVault();
      if (!vault) return;
      if (vault.fragments.length === 0) {
        window.alert(`No fragments found in "${vault.name}". A Legend vault keeps them in sessions/…/*.md.`);
        return;
      }
      if (vault.seed) setVaultSeed(vault.seed);
      engineRef.current?.loadFragments(vault.fragments);
      let count = vault.fragments.length;
      setSource(`${vault.name} · ${count.toLocaleString()}`);
      // Keep watching: new fragments from a conversation in progress land live.
      stopWatch.current?.();
      stopWatch.current = watchVault(vault, (fresh) => {
        engineRef.current?.addFragments(fresh);
        count += fresh.length;
        setSource(`${vault.name} · ${count.toLocaleString()}`);
      });
    } catch (err) {
      window.alert(String(err instanceof Error ? err.message : err));
    }
  };

  const backToSimulation = () => {
    stopWatch.current?.();
    stopWatch.current = null;
    setVaultSeed(null);
    setSource(null);
    engineRef.current?.setSim(sim);
    publishView({ kind: "sim", sim });
  };

  return (
    <main className="legend">
      <div className="stage" ref={hostRef} />
      <Splash />
      <button className={`eye-btn${hidden ? " faint" : ""}`} title={hidden ? "Show the interface · H" : "Hide the interface · H"} onClick={() => setHidden((h) => !h)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="2.8" />
          {hidden && <path d="M4 20 20 4" strokeLinecap="round" />}
        </svg>
      </button>
      {!hidden && (
        <div className="history-btns">
          <button className="dock-btn" title="Undo · Ctrl+Z" disabled={!history.current.past.length} onClick={undo}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 7 4.5 11.5 9 16" />
              <path d="M5 11.5h9.5a5 5 0 0 1 0 10H12" />
            </svg>
          </button>
          <button className="dock-btn" title="Redo · Ctrl+Y" disabled={!history.current.future.length} onClick={redo}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 7l4.5 4.5L15 16" />
              <path d="M19 11.5H9.5a5 5 0 0 0 0 10H12" />
            </svg>
          </button>
        </div>
      )}
      {!hidden && <Imagery engine={getEngine} />}
      {!hidden && <Dock style={style} onStyle={setStyle} genome={genome} onOpen={openVault} recent={recent} loaded={source} stats={stats} timelineOpen={timeline} onTimeline={() => setTimeline((t) => !t)} />}
      {!hidden && timeline && <Timeline engine={getEngine} stats={stats} onClose={() => setTimeline(false)} />}
      {!hidden && (
        <div className="exp-menus" ref={expBox} {...expHover}>
        <button className={`dock-btn dev-btn${devOpen ? " on" : ""}`} title="Experiment: explore a simulated person · E" onClick={() => setDevOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            <path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 17.6a1.6 1.6 0 0 0 1.4 2.4h10.4a1.6 1.6 0 0 0 1.4-2.4l-5.1-8.9V3.5" />
            <path d="M7.4 14.5h9.2" opacity="0.55" />
          </svg>
        </button>
      {devOpen && (
        <Panel
          onClose={() => setDevOpen(false)}
          rarePreview={rarePreview}
          onRarePreview={setRarePreview}
          sim={sim}
          onSim={setSim}
          live={live}
          onLive={setLive}
          onReplay={() => engineRef.current?.replay()}
          source={source}
          onSimulate={backToSimulation}
          ghost={style.ghost}
          onGhost={(on) => setStyle({ ...style, ghost: on })}
        />
      )}
        </div>
      )}
    </main>
  );
}
