// Small shared controls for every panel.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const fmt = (v: unknown) =>
  typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : Array.isArray(v) ? v.map((x) => (x as number).toFixed(1)).join(" ") : String(v);
export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      {children}
    </div>
  );
}

/**
 * The curve: a bell of light whose peak sits at the value. Pulled up it tightens and rises; pulled
 * down it widens and sinks. It springs to each new value with a little overshoot.
 */
function Curve({ t }: { t: number }) {
  const id = `curve${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`; // safe inside url(#…)
  const [shown, setShown] = useState(t);
  const state = useRef({ x: t, v: 0, raf: 0 });
  useEffect(() => {
    const s = state.current;
    cancelAnimationFrame(s.raf);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.v += ((t - s.x) * 260 - s.v * 14) * dt; // a stiff, lightly damped spring
      s.x += s.v * dt;
      if (Math.abs(t - s.x) < 0.0005 && Math.abs(s.v) < 0.001) {
        s.x = t;
        s.v = 0;
        setShown(t);
        return;
      }
      setShown(s.x);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(s.raf);
  }, [t]);

  const k = Math.min(1.08, Math.max(-0.08, shown));
  const peak = 3 + Math.min(1, Math.max(0, k)) * 94;
  const width = 30 - 23 * k; // wide and low at the minimum, tight and tall at the maximum
  const height = 4 + 16 * k;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * 100;
    const y = 22 - height * Math.exp(-(((x - peak) / width) ** 2));
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const line = `M${pts.join(" L")}`;
  return (
    <svg className="curve" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,24 L0,24 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Slider(props: { label: string; hint?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const ends = props.hint?.split(" ↔ ");
  const t = (props.value - props.min) / (props.max - props.min || 1);
  return (
    <Row label={props.label}>
      <span className="curve-slider">
        <Curve t={Math.min(1, Math.max(0, t))} />
        <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} title={props.hint} />
      </span>
      <em>{ends && props.value === props.min ? ends[0] : ends && props.value === props.max ? ends[1] : fmt(props.value)}</em>
    </Row>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </Row>
  );
}

export function Select<T extends string>(props: { label: string; value: T; options: readonly (T | [T, string])[]; onChange: (v: T) => void }) {
  return (
    <Row label={props.label}>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </Row>
  );
}

export function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <i style={{ width: pct(value) }} />
      <b>{pct(value)}</b>
    </div>
  );
}
