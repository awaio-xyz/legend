// Video: the film button in the lower right, next to imagery. Asks first (ratio, resolution, lens,
// energy, continuity and transitions), then for a folder, then renders a ten-second clip of the figure (engine/director.ts plans the
// shots) and saves it there as an MP4.
import { useEffect, useRef, useState } from "react";
import type { LegendEngine } from "../engine/legend";
import { LENSES, RATIOS, type Lens } from "../engine/imagery";
import { RESOLUTIONS, videoSize, type Continuity, type Energy, type Resolution, type Transition } from "../engine/director";
import { chooseFolder } from "./Imagery";

type Stage = { kind: "ask" } | { kind: "working"; done: number; total: number } | { kind: "done"; message: string };

const PREFS_KEY = "legend.video";
const ENERGIES: [Energy, string][] = [
  ["either", "either (mostly meditative)"],
  ["meditative", "meditative"],
  ["trailer", "trailer"],
];
const CONTINUITY: [Continuity, string][] = [
  ["matched", "matched action"],
  ["fresh", "new take each shot"],
];
const TRANSITIONS: [Transition, string][] = [
  ["fade", "cross-fade"],
  ["cut", "hard cut"],
];
interface Prefs {
  ratio: string;
  resolution: Resolution;
  lens: Lens;
  energy: Energy;
  continuity: Continuity;
  transition: Transition;
}
const readPrefs = (): Prefs => {
  const base: Prefs = { ratio: "16:9", resolution: "1440p", lens: "mixed", energy: "either", continuity: "matched", transition: "fade" };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return base;
  }
};

const Film = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="3.5" y="6" width="12.5" height="12" rx="2" />
    <path d="M16 10.5 20.5 8v8L16 13.5z" />
  </svg>
);

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

function Choice<T extends string>(p: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="imagery-opt">
      <span>{p.label}</span>
      <select value={p.value} onChange={(ev) => p.onChange(ev.target.value as T)}>
        {p.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Video({ engine }: { engine: () => LegendEngine | null }) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const box = useRef<HTMLDivElement>(null);
  const ratio = RATIOS.find((r) => r.id === prefs.ratio) ?? RATIOS[0];
  const size = videoSize(ratio, prefs.resolution);
  const choose = (patch: Partial<typeof prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* it just won't remember */
      }
      return next;
    });

  // A click elsewhere closes the question (not a render in progress).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setStage((s) => (s?.kind === "working" ? s : null));
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const generate = async () => {
    const e = engine();
    if (!e) return;
    try {
      const folder = await chooseFolder();
      if (!folder) return setStage(null);
      setStage({ kind: "working", done: 0, total: 1 });
      const clip = await e.captureVideo({ ...prefs, ratio, onProgress: (done, total) => setStage({ kind: "working", done, total }) });
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      await folder.save(`legend-${stamp}-${ratio.id.replace(":", "x")}`, await blobToDataUrl(clip), "mp4");
      setStage({ kind: "done", message: `Saved a ${(clip.size / 1e6).toFixed(1)} MB clip to ${folder.label}.` });
    } catch (err) {
      setStage({ kind: "done", message: `Couldn't make the clip: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <div className="video" ref={box}>
      <button className={`dock-btn${stage ? " on" : ""}`} title="Generate video" onClick={() => setStage((s) => (s ? (s.kind === "working" ? s : null) : { kind: "ask" }))}>
        <Film />
      </button>
      {stage && (
        <div className="confirm imagery-pop">
          {stage.kind === "ask" && (
            <>
              <b>Generate a video?</b>
              <span className="muted">
                A 10 second clip of your Legend, different every time, {size.width}×{size.height} MP4, saved to a folder you choose.
              </span>
              <label className="imagery-opt">
                <span>ratio</span>
                <select value={ratio.id} onChange={(ev) => choose({ ratio: ev.target.value })}>
                  {RATIOS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <Choice label="resolution" value={prefs.resolution} options={RESOLUTIONS} onChange={(v) => choose({ resolution: v })} />
              <label className="imagery-opt">
                <span>lens</span>
                <select value={prefs.lens} onChange={(ev) => choose({ lens: ev.target.value as Lens })}>
                  {LENSES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="imagery-opt">
                <span>energy</span>
                <select value={prefs.energy} onChange={(ev) => choose({ energy: ev.target.value as Energy })}>
                  {ENERGIES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Choice label="continuity" value={prefs.continuity} options={CONTINUITY} onChange={(v) => choose({ continuity: v })} />
              <Choice label="cuts" value={prefs.transition} options={TRANSITIONS} onChange={(v) => choose({ transition: v })} />
              <div className="confirm-buttons">
                <button onClick={generate}>Yes</button>
                <button onClick={() => setStage(null)}>No</button>
              </div>
            </>
          )}
          {stage.kind === "working" && (
            <>
              <b>Filming…</b>
              <span className="muted">
                frame {stage.done} of {stage.total}
              </span>
            </>
          )}
          {stage.kind === "done" && (
            <>
              <span className="muted">{stage.message}</span>
              <div className="confirm-buttons">
                <button onClick={() => setStage(null)}>Done</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
