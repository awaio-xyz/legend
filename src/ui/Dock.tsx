// The interface: three buttons in a corner.
//   Settings — hover or click to fly out the categories: click one to open its settings, where a
//   small dice randomises just that category. Presets save and restore looks. The menus close a
//   moment after the pointer leaves them (so a slip doesn't lose them), and at once on a click out
//   in the void.
//   Dice — randomise everything.
//   Stats — what this Legend is made of: head, heart, gut and spirit as shares, the ether apart.
//   Timeline — the Legend over time, and travelling back through it.
//   Folder — load a Legend: pick the vault folder the figure is drawn from.
import { useEffect, useRef, useState } from "react";
import type { Genome } from "../engine/genome";
import type { Stats, Style } from "../engine/legend";
import { CATEGORIES, randomise, SECTION, type Category } from "./sections";
import { PrivacySection } from "./Privacy";
import { inDesktop, type RecentVault } from "./desktop";
import { useFlyout } from "./flyout";

// Privacy lives in the menu only in the desktop app, which can write to the vault.
type Panel = Category | "privacy";
const MENU: { id: Panel; label: string }[] = [...CATEGORIES, ...(inDesktop ? [{ id: "privacy" as const, label: "Privacy" }] : [])];

interface Props {
  style: Style;
  onStyle: (s: Style) => void;
  genome: Genome;
  onOpen: (choice: "own" | "pick" | RecentVault) => void;
  recent: RecentVault[];
  loaded: string | null; // the vault's name, when one is loaded
  stats: Stats | null;
  timelineOpen: boolean;
  onTimeline: () => void;
}

interface Preset { name: string; style: Style }
const PRESETS_KEY = "legend.presets";
const SKIP_CONFIRM_KEY = "legend.randomise.noConfirm";
const CLOSE_DELAY = 2500; // ms after the pointer leaves the menus
const readPresets = (): Preset[] => {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const writePresets = (list: Preset[]) => {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* presets just won't persist in this browser */
  }
};

const Dice = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    {[[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" fill="currentColor" stroke="none" />)}
  </svg>
);
const Gear = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M10.3 3.5h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.7 1.6v1.8l1.7 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.7-1.6v-1.8L4.1 8.8l1.7-2.9 2.2.8 1.6-.9z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);
const Chart = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M5 19.5V13M10 19.5V7M15 19.5v-9M20 19.5v-4" />
    <path d="M3.5 19.5h18" opacity="0.5" />
  </svg>
);
const Wave = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 15c2 0 2.5-6 4.5-6S9.5 17 12 17s2.5-10 4.5-10 2.5 8 4.5 8" />
  </svg>
);
const Folder = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
);

export function Dock(p: Props) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Panel | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(() => {
    try {
      return localStorage.getItem(SKIP_CONFIRM_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [renaming, setRenaming] = useState<number | null>(null);
  // The folder flyout: your Legend, recent ones, open a folder.
  const [folderOpen, setFolderOpen] = useState(false);
  const folderBox = useRef<HTMLDivElement>(null);
  const folderHover = useFlyout(folderBox, folderOpen, () => setFolderOpen(false));
  const openChoice = (choice: "own" | "pick" | RecentVault) => {
    setFolderOpen(false);
    p.onOpen(choice);
  };
  const confirmRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [presets, setPresets] = useState<Preset[]>(readPresets);
  const closeTimer = useRef<number | undefined>(undefined);
  const menus = useRef<HTMLDivElement>(null);
  // Hovering opens the menu; a click right after (the same reach for the button) shouldn't shut it.
  const hoverOpenedAt = useRef(0);
  const hoverOpen = () => {
    if (!open) hoverOpenedAt.current = Date.now();
    setOpen(true);
  };
  const clickSettings = () => {
    if (Date.now() - hoverOpenedAt.current < 800) return;
    setOpen((o) => !o);
  };

  const close = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    setSettings(null);
  };
  const stay = () => window.clearTimeout(closeTimer.current);
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(function check() {
      // A native picker (a colour, a dropdown) can take the pointer outside; wait for it to finish.
      const el = document.activeElement;
      if (menus.current?.contains(el) && (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "color"))) {
        closeTimer.current = window.setTimeout(check, 500);
      } else close();
    }, CLOSE_DELAY);
  };
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!menus.current?.contains(e.target as Node)) close();
      if (!statsRef.current?.contains(e.target as Node)) setStatsOpen(false);
      if (!confirmRef.current?.contains(e.target as Node)) setConfirming(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  const set = (patch: Partial<Style>) => p.onStyle({ ...p.style, ...patch });
  const save = () => {
    const name = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const next = [{ name, style: p.style }, ...presets].slice(0, 12);
    setPresets(next);
    writePresets(next);
  };
  const rename = (i: number, name: string) => {
    const clean = name.trim();
    setRenaming(null);
    if (!clean) return;
    const next = presets.map((pr, k) => (k === i ? { ...pr, name: clean } : pr));
    setPresets(next);
    writePresets(next);
  };
  const remove = (i: number) => {
    const next = presets.filter((_, k) => k !== i);
    setPresets(next);
    writePresets(next);
  };
  const Section = settings && settings !== "privacy" ? SECTION[settings] : null;

  return (
    <div className="dock">
      <div className="dock-menus" ref={menus} onMouseEnter={stay} onMouseLeave={leave}>
      <div className="dock-dice" onMouseEnter={hoverOpen}>
        {open && (
          <div className="flyout">
            {MENU.map((c) => (
              <div key={c.id} className={`fly-row${settings === c.id ? " on" : ""}`}>
                <button className="fly-label" title={`${c.label} settings`} onClick={() => setSettings(settings === c.id ? null : c.id)}>
                  {c.label}
                </button>
              </div>
            ))}
            <div className="fly-sep" />
            <button className="fly-label save" onClick={save}>
              Save preset
            </button>
            {presets.map((pr, i) => (
              <div key={`${pr.name}${i}`} className="fly-row">
                {renaming === i ? (
                  <input
                    className="preset-name"
                    autoFocus
                    defaultValue={pr.name}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(i, e.currentTarget.value);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={(e) => rename(i, e.currentTarget.value)}
                  />
                ) : (
                  <button className="fly-label preset" onClick={() => p.onStyle(pr.style)}>
                    {pr.name}
                  </button>
                )}
                <button className="fly-gear" title="Rename preset" onClick={() => setRenaming(renaming === i ? null : i)}>
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                  </svg>
                </button>
                <button className="fly-gear" title="Delete preset" onClick={() => remove(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button className={`dock-btn${open ? " on" : ""}`} title="Settings" onClick={clickSettings}>
          <Gear />
        </button>
      </div>
      {settings && (
        <aside className="settings">
          <header>
            <h2>{MENU.find((c) => c.id === settings)!.label}</h2>
            <span className="settings-actions">
              {settings !== "privacy" && (
                <button className="mini" title={`Randomise ${settings}`} onClick={() => p.onStyle(randomise(p.style, settings))}>
                  <Dice size={13} />
                </button>
              )}
              <button className="mini" title="Close" onClick={() => setSettings(null)}>
                ×
              </button>
            </span>
          </header>
          {Section ? <Section s={p.style} set={set} genome={p.genome} /> : <PrivacySection />}
        </aside>
      )}
      </div>
      <div className="dock-confirm" ref={confirmRef}>
        <button
          className={`dock-btn${confirming ? " on" : ""}`}
          title="Randomise everything"
          onClick={() => (skipConfirm ? p.onStyle(randomise(p.style)) : setConfirming((c) => !c))}
        >
          <Dice />
        </button>
        {confirming && (
          <div className="confirm">
            <b>Randomise?</b>
            <span className="muted">Overwrites everything.</span>
            <div className="confirm-buttons">
              <button
                onClick={() => {
                  p.onStyle(randomise(p.style));
                  setConfirming(false);
                }}
              >
                Yes
              </button>
              <button onClick={() => setConfirming(false)}>No</button>
            </div>
            <label className="dont-ask">
              <input
                type="checkbox"
                checked={skipConfirm}
                onChange={(e) => {
                  setSkipConfirm(e.target.checked);
                  try {
                    localStorage.setItem(SKIP_CONFIRM_KEY, e.target.checked ? "1" : "0");
                  } catch {
                    /* it'll ask again next time */
                  }
                }}
              />
              Don't show again
            </label>
          </div>
        )}
      </div>
      <div className="dock-stats" ref={statsRef}>
        <button className={`dock-btn${statsOpen ? " on" : ""}`} title="What this Legend is made of" onClick={() => setStatsOpen((o) => !o)}>
          <Chart />
        </button>
        {statsOpen && <StatsPanel stats={p.stats} name={p.loaded} />}
      </div>
      <button className={`dock-btn${p.timelineOpen ? " on" : ""}`} title="Timeline: your Legend over time" onClick={p.onTimeline}>
        <Wave />
      </button>
      <div className="dock-folder" ref={folderBox} {...folderHover}>
        {folderOpen && (
          <div className="flyout">
            {inDesktop && (
              <button className="fly-label" onClick={() => openChoice("own")}>
                Your Legend
              </button>
            )}
            {inDesktop && p.recent.length > 0 && <div className="fly-sep" />}
            {inDesktop &&
              p.recent.map((r) => (
                <button key={r.path} className="fly-label preset" title={r.path} onClick={() => openChoice(r)}>
                  {r.name}
                </button>
              ))}
            {inDesktop && <div className="fly-sep" />}
            <button className="fly-label" onClick={() => openChoice("pick")}>
              Open folder…
            </button>
          </div>
        )}
        <button
          className={`dock-btn${folderOpen ? " on" : ""}`}
          title={p.loaded ? `Showing ${p.loaded} · open a Legend` : "Open a Legend"}
          onClick={() => setFolderOpen((o) => !o)}
        >
          <Folder />
        </button>
      </div>
      {p.loaded && <span className="dock-name">{p.loaded}</span>}
    </div>
  );
}

const REGIONS = ["head", "heart", "gut", "spirit"] as const;

/** The person in numbers: the four regions as shares of the body and aura, and the ether apart. */
function StatsPanel({ stats, name }: { stats: Stats | null; name: string | null }) {
  const ether = stats && stats.born ? stats.ether / stats.born : 0;
  return (
    <aside className="stats">
      <header>
        <h2>{name ?? "This Legend"}</h2>
        <span className="muted">{stats ? `${stats.born.toLocaleString()} fragments` : "…"}</span>
      </header>
      {REGIONS.map((r, i) => {
        const v = stats?.regions[i] ?? 0;
        return (
          <div key={r} className="stat">
            <span>{r}</span>
            <i>
              <b style={{ width: `${(v * 100).toFixed(1)}%` }} />
            </i>
            <em>{Math.round(v * 100)}%</em>
          </div>
        );
      })}
      <div className="stat ether" title="Not chosen: the ether comes with time. As it grows, the figure slowly comes apart into light.">
        <span>ether</span>
        <i>
          <b style={{ width: `${(ether * 100).toFixed(1)}%` }} />
        </i>
        <em>{(ether * 100).toFixed(1)}%</em>
      </div>
    </aside>
  );
}
