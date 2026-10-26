// The timeline: how this Legend was said into being. Glowing lines for head, heart, gut and spirit
// (and the ether, in grey) over time, with the ether's releases marked. Drag the playhead and the
// figure becomes what it was on that day; play runs the whole life as a time-lapse.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendEngine, Stats } from "../engine/legend";
import { ETHER_RELEASES } from "../engine/placement";

const W = 1000, H = 150; // chart units
const PLAY_SECONDS = 14;
const DAY = 86400;
const REGIONS = ["head", "heart", "gut", "spirit"] as const;

interface Data {
  at: Float64Array;
  region: Uint8Array;
  ether: Uint8Array;
  colours: string[];
}

/** The first index whose date is after t: how many fragments had been said by then. */
const countBy = (at: Float64Array, t: number) => {
  let lo = 0, hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** A smooth path through points (Catmull–Rom as cubic Béziers). */
function smooth(pts: number[][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const fmt = (t: number, withYear: boolean) =>
  new Date(t * 1000).toLocaleDateString(undefined, withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });

export function Timeline({ engine, stats, onClose }: { engine: () => LegendEngine | null; stats: Stats | null; onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [head, setHead] = useState<number | null>(null); // playhead, 0–1 across the span; null is now
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<number | null>(null); // hovering a key entry shows that line alone
  const svg = useRef<SVGSVGElement>(null);

  // Re-read when the Legend grows (stats tick), but not while travelling.
  const born = stats?.born ?? 0;
  useEffect(() => {
    if (head !== null) return;
    const e = engine();
    if (!e) return;
    const t = e.timeline();
    setData({ at: t.at, region: t.region, ether: t.ether, colours: e.regionColours() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [born, engine]);

  // Leaving the timeline returns to now.
  useEffect(() => () => engine()?.setCutoff(null), [engine]);

  const chart = useMemo(() => {
    if (!data || data.at.length < 2) return null;
    const start = data.at[0], end = data.at[data.at.length - 1];
    const span = Math.max(end - start, 3600);
    const bucket = span <= 2 * DAY ? 3600 : span <= 120 * DAY ? DAY : 7 * DAY;
    const n = Math.max(1, Math.ceil(span / bucket));
    const counts = Array.from({ length: n }, () => [0, 0, 0, 0, 0]); // four regions, then ether
    for (let i = 0; i < data.at.length; i++) {
      const b = Math.min(n - 1, Math.floor((data.at[i] - start) / bucket));
      counts[b][data.ether[i] ? 4 : data.region[i]]++;
    }
    // The last bucket is only partly over: scale it up to a full bucket's rate, or the chart drops off.
    const lastCovered = Math.max(bucket * 0.05, span - (n - 1) * bucket);
    if (n > 1 && lastCovered < bucket) counts[n - 1] = counts[n - 1].map((v) => v * (bucket / lastCovered));
    const peak = Math.max(1, ...counts.flat());
    const x = (b: number) => (n === 1 ? W / 2 : (b / (n - 1)) * W);
    // One glowing line per series (head, heart, gut, spirit, ether), smoothed through its points,
    // with a faint wash beneath so the shape still reads.
    const lines = [0, 1, 2, 3, 4].map((series) => {
      const pts = counts.map((c, b) => [x(b), H - 4 - (c[series] / peak) * (H - 14)]);
      const line = smooth(pts);
      return { line, area: `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z` };
    });
    // Where each ether release fell.
    const releases = ETHER_RELEASES.filter((r) => r <= data.at.length).map((r, i) => ({ x: ((data.at[r - 1] - start) / span) * W, label: `R${i + 1}` }));
    return { start, end, span, lines, releases, withYear: span > 300 * DAY };
  }, [data]);

  const goTo = (frac: number) => {
    if (!data || !chart) return;
    const f = Math.min(1, Math.max(0, frac));
    setHead(f);
    engine()?.setCutoff(f >= 0.999 ? null : countBy(data.at, chart.start + f * chart.span));
  };
  const fracAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return (clientX - r.left) / r.width;
  };

  // The time-lapse: the whole life, start to now, in PLAY_SECONDS.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, from = performance.now(), base = head ?? 0;
    if (base >= 0.999) base = 0;
    const step = (now: number) => {
      const f = base + (now - from) / 1000 / PLAY_SECONDS;
      goTo(f);
      if (f >= 1) {
        setPlaying(false);
        setHead(null);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    from = performance.now();
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const said = data && chart && head !== null ? countBy(data.at, chart.start + head * chart.span) : data?.at.length ?? 0;
  const when = chart ? (head === null ? "now" : fmt(chart.start + head * chart.span, chart.withYear)) : "";

  return (
    <aside className="timeline">
      <header>
        <h2>Timeline</h2>
        <span className="muted">
          {when} · {said.toLocaleString()} fragments
        </span>
        <span className="timeline-actions">
          <button className="mini" title={playing ? "Pause" : "Play your Legend forming"} onClick={() => setPlaying((p) => !p)}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            className="mini"
            title="Back to now"
            onClick={() => {
              setPlaying(false);
              setHead(null);
              engine()?.setCutoff(null);
            }}
          >
            now
          </button>
          <button className="mini" title="Close" onClick={onClose}>
            ×
          </button>
        </span>
      </header>
      {!chart ? (
        <div className="muted">Not enough history yet: the timeline fills in as your Legend grows.</div>
      ) : (
        <>
          <svg
            ref={svg}
            className="timeline-chart"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={(e) => {
              setPlaying(false);
              e.currentTarget.setPointerCapture(e.pointerId);
              goTo(fracAt(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.buttons) goTo(fracAt(e.clientX));
            }}
          >
            <defs>
              <filter id="timeline-glow" x="-5%" y="-30%" width="110%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {[...data!.colours, "#9a9a9a"].map((c, i) => (
                <linearGradient key={i} id={`timeline-wash-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={c} stopOpacity="0.14" />
                  <stop offset="1" stopColor={c} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {chart.lines.map((l, i) => (
              <g key={i} className="timeline-series" style={{ opacity: focus === null || focus === i ? 1 : 0.06 }}>
                <path d={l.area} fill={`url(#timeline-wash-${i})`} />
                <path
                  d={l.line}
                  fill="none"
                  stroke={i < 4 ? data!.colours[i] : "#9a9a9a"}
                  strokeWidth={i < 4 ? 1.6 : 1.2}
                  strokeDasharray={i < 4 ? undefined : "4 4"}
                  strokeLinejoin="round"
                  filter="url(#timeline-glow)"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            {chart.releases.map((r) => (
              <g key={r.label}>
                <line x1={r.x} x2={r.x} y1={0} y2={H} stroke="#fff" strokeOpacity="0.35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                <text x={r.x + 4} y={12} fill="#aaa" fontSize="10">
                  {r.label}
                </text>
              </g>
            ))}
            <line x1={(head ?? 1) * W} x2={(head ?? 1) * W} y1={0} y2={H} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="timeline-axis muted">
            <span>{fmt(chart.start, chart.withYear)}</span>
            <span className="timeline-key">
              {[...REGIONS, "ether"].map((r, i) => (
                <span key={r} className={focus === i ? "on" : ""} onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)}>
                  <i style={{ background: i < 4 ? data!.colours[i] : "#9a9a9a" }} />
                  {r}
                </span>
              ))}
            </span>
            <span>{fmt(chart.end, chart.withYear)}</span>
          </div>
        </>
      )}
    </aside>
  );
}
