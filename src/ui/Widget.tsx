// The widget: a small frameless window that floats above everything (Claude included) and shows
// only the figure, drawn from the real vault and filling in live. Drag it by the figure, resize it
// from the corner grip (it stays square), right-click for the full app or quit. On hover, a home
// button brings the camera back to the figure and a gear opens the widget's own settings: the frame
// (circle, or square with rounded corners), a grey ring and its thickness, a vignette, a fisheye
// lens, zoom, and whether a drag moves the window or explores the figure. It wears whatever look
// the full app last had.
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { drawGenome, makeSeed } from "../engine/genome";
import { DEFAULT_SIM } from "../engine/fragments";
import { DEFAULT_STYLE, LegendEngine, type Style } from "../engine/legend";
import { quitApp, readNativeVault, showWindow, VIEW_KEY, watchNativeVault, type View } from "./desktop";
import { Row, Slider, Toggle } from "./controls";
import "../App.css";

const STYLE_KEY = "legend.style";
const PREFS_KEY = "legend.widget";
// The same stand-in the full app is born from when there's no vault yet.
const FIRST_WORDS = "the nodes will always be generated in the bust shape of a human head shoulders chest and stomach";
const CREATED_AT = "2026-10-24T12:00:00+10:00";

interface Prefs {
  shape: "circle" | "square";
  corner: number; // square only: corner rounding, % of the side
  ring: boolean; // a mid-grey ring around the frame
  ringWidth: number; // px
  fisheye: boolean;
  vignette: number; // 0–1, darkening toward the edge
  zoom: number; // 1 frames the figure as the app does
  explore: boolean; // a drag orbits and the wheel zooms, instead of moving the window
}
const DEFAULT_PREFS: Prefs = { shape: "circle", corner: 8, ring: false, ringWidth: 3, fisheye: false, vignette: 0.3, zoom: 1, explore: false };
const FISHEYE = 0.7;

const readPrefs = (): Prefs => {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
};

/** The look the full app last had, followed in the widget, which always tracks the walker. */
const sharedStyle = (): Style => {
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? "null") as Partial<Style> | null;
    return { ...DEFAULT_STYLE, ...(saved ?? {}), track: true };
  } catch {
    return { ...DEFAULT_STYLE, track: true };
  }
};

const Home = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    <path d="M4 11.5 12 5l8 6.5M6.5 9.8V19h11V9.8" />
  </svg>
);
const Gear = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M10.3 3.5h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.7 1.6v1.8l1.7 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.7-1.6v-1.8L4.1 8.8l1.7-2.9 2.2.8 1.6-.9z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export function Widget() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<LegendEngine | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const [empty, setEmpty] = useState(false);
  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

  useEffect(() => {
    document.documentElement.classList.add("widget-mode");
    let stop: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const vault = await readNativeVault().catch(() => null);
      if (disposed) return;
      const genome = drawGenome(vault?.seed ?? makeSeed(FIRST_WORDS, CREATED_AT));
      const e = new LegendEngine(host.current!, genome, sharedStyle(), DEFAULT_SIM);
      const p = readPrefs();
      e.setInteractive(p.explore);
      e.setZoom(p.zoom);
      e.setFisheye(p.fisheye ? FISHEYE : 0);
      engine.current = e;
      if (import.meta.env.DEV) (window as unknown as { legendWidget: LegendEngine }).legendWidget = e;
      if (vault && vault.fragments.length) {
        e.loadFragments(vault.fragments);
        stop = watchNativeVault(new Set(vault.fragments.map((f) => f.id)), (fresh) => e.addFragments(fresh));
      } else {
        // No vault yet: show the simulated person, and switch to the real one when it appears.
        setEmpty(true);
        stop = watchNativeVault(new Set(), (fresh) => {
          setEmpty(false);
          e.loadFragments(fresh);
          stop?.();
          stop = watchNativeVault(new Set(fresh.map((f) => f.id)), (more) => e.addFragments(more));
        });
      }
    })();
    // The full app's look, as it changes, and what it's showing: switch to the simulated person when
    // the full app does, and back to your Legend when it loads it again.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === STYLE_KEY) engine.current?.setStyle(sharedStyle());
      if (ev.key === VIEW_KEY && ev.newValue && engine.current) {
        const view = JSON.parse(ev.newValue) as View;
        const e = engine.current;
        stop?.();
        stop = undefined;
        if (view.kind === "sim") {
          setEmpty(false);
          e.setSim(view.sim);
        } else {
          readNativeVault(view.path)
            .then((vault) => {
              if (!vault.fragments.length) return;
              e.loadFragments(vault.fragments);
              stop = watchNativeVault(new Set(vault.fragments.map((f) => f.id)), (fresh) => e.addFragments(fresh), 4000, view.path);
            })
            .catch(() => {});
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      disposed = true;
      stop?.();
      window.removeEventListener("storage", onStorage);
      engine.current?.dispose();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* the widget just won't remember */
    }
    engine.current?.setInteractive(prefs.explore);
    engine.current?.setFisheye(prefs.fisheye ? FISHEYE : 0);
  }, [prefs]);
  useEffect(() => engine.current?.setZoom(prefs.zoom), [prefs.zoom]);

  const drag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setMenu(null);
    setSettings(false);
    getCurrentWindow().startDragging();
  };
  const resize = (e: React.MouseEvent) => {
    e.stopPropagation();
    getCurrentWindow().startResizeDragging("SouthEast");
  };
  const item = (label: string, act: () => void) => (
    <button
      onClick={() => {
        setMenu(null);
        act();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="widget-shell"
      onContextMenu={(e) => {
        e.preventDefault();
        setSettings(false);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <main className="widget" style={{ borderRadius: prefs.shape === "circle" ? "50%" : `${prefs.corner}%` }}>
        <div className="stage" ref={host} />
        {prefs.vignette > 0 && <div className="widget-vignette" style={{ opacity: prefs.vignette }} />}
        {prefs.ring && <div className="widget-ring" style={{ boxShadow: `inset 0 0 0 ${prefs.ringWidth}px #808080` }} />}
        {!prefs.explore && <div className="widget-drag" onMouseDown={drag} title={empty ? "No Legend yet: showing a simulated person" : undefined} />}
      </main>
      <div className="widget-buttons">
        <button className="widget-gear" title="Home: back to the figure" onClick={() => engine.current?.resetView(prefs.zoom)}>
          <Home />
        </button>
        <button className={`widget-gear${settings ? " on" : ""}`} title="Widget settings" onClick={() => setSettings((s) => !s)}>
          <Gear />
        </button>
      </div>
      <div className="widget-grip" onMouseDown={resize} />
      {settings && (
        <div className="widget-settings">
          <Row label="drag">
            <span className="segmented">
              <button className={prefs.explore ? "" : "on"} onClick={() => set({ explore: false })}>
                move
              </button>
              <button className={prefs.explore ? "on" : ""} onClick={() => set({ explore: true })}>
                explore
              </button>
            </span>
          </Row>
          <Row label="frame">
            <span className="segmented">
              {(["circle", "square"] as const).map((s) => (
                <button key={s} className={prefs.shape === s ? "on" : ""} onClick={() => set({ shape: s })}>
                  {s}
                </button>
              ))}
            </span>
          </Row>
          {prefs.shape === "square" && <Slider label="corners" min={0} max={40} step={1} value={prefs.corner} onChange={(v) => set({ corner: v })} />}
          <Toggle label="ring" value={prefs.ring} onChange={(v) => set({ ring: v })} />
          {prefs.ring && <Slider label="thickness" min={1} max={12} step={0.5} value={prefs.ringWidth} onChange={(v) => set({ ringWidth: v })} />}
          <Slider label="zoom" min={0.5} max={3} step={0.01} value={prefs.zoom} onChange={(v) => set({ zoom: v })} />
          <Slider label="vignette" min={0} max={1} step={0.01} value={prefs.vignette} onChange={(v) => set({ vignette: v })} />
          <Toggle label="fisheye" value={prefs.fisheye} onChange={(v) => set({ fisheye: v })} />
        </div>
      )}
      {menu && (
        <div className="widget-menu" style={{ left: Math.min(menu.x, window.innerWidth - 120), top: Math.min(menu.y, window.innerHeight - 110) }}>
          {item("Open Legend", () => showWindow("main"))}
          {item("Quit Legend", () => quitApp())}
        </div>
      )}
    </div>
  );
}
