// The video director: plans a ten-second clip as one to four shots, each a camera move with a lens,
// and the figure's own performance for the camera: what it does with its body (stand, pace, wander,
// walk a circle, levitate) and the gestures and reaches it's cued to make. It doesn't film whatever
// the figure happens to be doing; it directs it.
//
// Two energies: meditative (one or two long, slow takes) and trailer (several cuts, faster moves, a
// dolly zoom). Two kinds of continuity: matched action (one continuous performance, so a cut picks up
// the same gesture from a new angle) and a new take each shot (every shot its own moment and its own
// performance). Every plan is rolled fresh. Style only: none of it touches the data.
import type { Lens, Ratio } from "./imagery";
import type { Route } from "./walk";

type V3 = [number, number, number];
export type Energy = "either" | "meditative" | "trailer";
export type Continuity = "matched" | "fresh";
export type Transition = "cut" | "fade";
export type Resolution = "1080p" | "1440p" | "2160p";
type Glass = Exclude<Lens, "mixed">;
type Kind = "static" | "drift" | "orbit" | "pushin" | "crane" | "dolly" | "hand";

export interface Cue {
  at: number; // seconds into the clip (matched) or into the shot's own take (fresh)
  move?: string; // a standing move by name
  reach?: { side: 1 | -1; point: V3 }; // or a hand out to a point, which a hand shot follows
}

/** What the body does for a stretch of the clip. */
export interface Act {
  start: number;
  end: number;
  route: Route;
}

export interface Shot {
  kind: Kind;
  start: number;
  end: number;
  lens: Glass;
  azimuth: number; // radians around the figure from its front at the shot's start
  elevation: number;
  turn: number; // orbit and drift: radians over the whole shot
  organ: V3; // push-ins: what they close on
  side: 1 | -1;
  rise: number; // crane: +1 up, -1 down
  reach?: { side: 1 | -1; point: V3 }; // hand shots: where the hand goes
  // A new take each shot: the shot's own moment (seconds added to the clock), body and cues.
  take?: { offset: number; route: Route; cues: Cue[] };
}

export interface Plan {
  shots: Shot[];
  acts: Act[]; // matched action: the one continuous performance
  cues: Cue[];
}

/** One frame's camera, in the body's frame at the shot's start (y up, z toward its front). */
export interface Frame {
  target: V3;
  position: V3;
  fov: number;
  roll: number;
  fisheye: number;
  pointScale: number; // how far the lens moved the camera, which the points' size must follow
}

const BASE_SIZE: Record<string, [number, number]> = { "4:5": [1080, 1350], "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080], "2.39:1": [1920, 804] };
const SCALE: Record<Resolution, number> = { "1080p": 1, "1440p": 4 / 3, "2160p": 2 };
export const RESOLUTIONS: [Resolution, string][] = [
  ["1080p", "1080p"],
  ["1440p", "1440p"],
  ["2160p", "4K"],
];
/** Video sizes: the imagery ratios at the chosen resolution, even on both sides for H.264. */
export const videoSize = (ratio: Ratio, res: Resolution = "1440p") => {
  const [w, h] = BASE_SIZE[ratio.id] ?? [1920, 1080];
  const even = (x: number) => Math.round((x * SCALE[res]) / 2) * 2;
  return { width: even(w), height: even(h) };
};

const HEAD: V3 = [0, 0.55, 0.02], HEART: V3 = [0.05, 0.22, 0.05], GUT: V3 = [0, -0.08, 0.05];
const LENS_FOV: Record<Glass, number> = { "as-shot": 30, wide: 70, long: 15, fisheye: 76 };
const BASE_FOV = 30;

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const weighted = <T extends string>(r: () => number, w: Partial<Record<T, number>>): T => {
  const entries = Object.entries(w) as [T, number][];
  let x = r() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) if ((x -= v) <= 0) return k;
  return entries[0][0];
};

/** What the body does: mostly still for meditative, more often on the move for trailer. */
const rollRoute = (r: () => number, trailer: boolean, body: boolean): Route =>
  !body ? "stand" : weighted<Route>(r, trailer ? { stand: 2, pace: 2, wander: 1.5, circle: 1.5, levitate: 1.5 } : { stand: 4, levitate: 1.5, pace: 1.5, wander: 1, circle: 0.5 });
const rollReach = (r: () => number, side: 1 | -1) => ({ side, point: [side * (0.36 + r() * 0.1), 0.25 + r() * 0.2, 0.22 + r() * 0.12] as V3 });

/** Roll a plan. `body` is false in bust mode (no legs to frame, no walking). */
export function planClip(o: { energy: Energy; continuity: Continuity; seconds: number; lens: Lens; moves: string[]; body: boolean }, r: () => number = Math.random): Plan {
  const { seconds, lens, moves, body } = o;
  const trailer = o.energy === "trailer" || (o.energy === "either" && r() >= 0.6);
  // How many shots, and where the cuts fall.
  const count = trailer ? 2 + Math.floor(r() * 3) : r() < 0.6 ? 1 : 2;
  const weights = Array.from({ length: count }, () => 0.6 + r());
  const total = weights.reduce((a, b) => a + b, 0);
  const kinds: Partial<Record<Kind, number>> = trailer
    ? { orbit: 2, pushin: 2, hand: 2, dolly: 1.5, crane: 1.5, static: 0.6 }
    : { static: 3, drift: 3, orbit: 2, pushin: 2, crane: 1, hand: 1.2 };
  const shots: Shot[] = [];
  let start = 0;
  let last: Kind | null = null;
  for (let i = 0; i < count; i++) {
    const end = i === count - 1 ? seconds : start + (seconds * weights[i]) / total;
    let kind = weighted(r, kinds);
    if (kind === last) kind = weighted(r, kinds); // rarely the same move twice in a row
    last = kind;
    const glass: Glass = lens !== "mixed" ? lens : trailer ? pick(r, ["as-shot", "wide", "wide", "long", "fisheye"] as const) : pick(r, ["as-shot", "as-shot", "long", "wide"] as const);
    const side: 1 | -1 = r() < 0.5 ? 1 : -1;
    const len = end - start;
    shots.push({
      kind,
      start,
      end,
      lens: kind === "dolly" ? "as-shot" : glass,
      azimuth: (r() - 0.5) * (trailer ? 1.6 : 0.9),
      elevation: (r() - 0.4) * 0.35,
      turn: kind === "orbit" ? side * len * (trailer ? 0.3 + r() * 0.25 : 0.05 + r() * 0.05) : kind === "drift" ? side * (0.15 + r() * 0.2) : 0,
      organ: body ? pick(r, [HEAD, HEART, GUT, HEART]) : pick(r, [HEAD, HEART]),
      side,
      rise: r() < 0.5 ? 1 : -1,
      reach: kind === "hand" ? rollReach(r, side) : undefined,
    });
    start = end;
  }

  if (o.continuity === "fresh") {
    // Each shot is its own take: a different moment, its own body, its own cue at the top.
    shots.forEach((s, i) => {
      const cues: Cue[] = [];
      if (s.reach) cues.push({ at: 0.1, reach: s.reach });
      else if (moves.length && r() < (trailer ? 0.7 : 0.45)) cues.push({ at: 0.15, move: pick(r, moves) });
      s.take = { offset: i * 47 + r() * 20, route: rollRoute(r, trailer, body), cues };
    });
    return { shots, acts: [], cues: [] };
  }

  // Matched action: one performance across the cuts. The body's act changes at most once, and not on
  // a cut, so a walk carries straight through from one angle to the next.
  const acts: Act[] = [];
  if (trailer && r() < 0.5) {
    const split = seconds * (0.35 + r() * 0.3);
    const first = rollRoute(r, trailer, body);
    let second = rollRoute(r, trailer, body);
    if (second === first) second = rollRoute(r, trailer, body);
    acts.push({ start: 0, end: split, route: first }, { start: split, end: seconds, route: second });
  } else acts.push({ start: 0, end: seconds, route: rollRoute(r, trailer, body) });

  // Gestures land across the clip, not on the cuts, so a cut often catches one mid-way. A hand shot
  // gets its reach just before it starts, so the camera arrives as the hand goes out.
  const cues: Cue[] = [];
  for (const s of shots) if (s.reach) cues.push({ at: Math.max(0, s.start - 0.4), reach: s.reach });
  const gestures = moves.length ? (trailer ? 2 + Math.floor(r() * 2) : r() < 0.6 ? 1 : 2) : 0;
  for (let g = 0; g < gestures; g++) {
    const at = 0.3 + r() * (seconds - 3);
    if (cues.some((c) => Math.abs(c.at - at) < 3.5)) continue; // let each one finish
    cues.push({ at, move: pick(r, moves) });
  }
  cues.sort((a, b) => a.at - b.at);
  return { shots, acts, cues };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const around = (target: V3, azimuth: number, elevation: number, distance: number): V3 => {
  const flat = Math.cos(elevation) * distance;
  return [target[0] + Math.sin(azimuth) * flat, target[1] + Math.sin(elevation) * distance, target[2] + Math.cos(azimuth) * flat];
};

/** Where the camera is `u` of the way through a shot (a cross-fade runs u a little past 0 and 1). */
export function shotFrame(s: Shot, u: number, body: boolean): Frame {
  const e = ease(Math.min(1, Math.max(0, u)));
  const centre: V3 = [0, body ? -0.15 : 0.2, 0];
  const fov0 = LENS_FOV[s.lens];
  // A lens keeps the figure about the size it would be at 30°: a wide one comes closer.
  const keep = Math.tan((BASE_FOV * Math.PI) / 360) / Math.tan((fov0 * Math.PI) / 360);
  const near = (d: number) => Math.max(0.55, d * keep);
  const out = (target: V3, az: number, el: number, d: number, fov = fov0, roll = 0): Frame => ({
    target,
    position: around(target, az, el, near(d)),
    fov,
    roll,
    fisheye: s.lens === "fisheye" ? 0.85 : 0,
    pointScale: keep,
  });
  const wide = body ? 4.6 : 3.2;
  switch (s.kind) {
    case "static":
      return out(centre, s.azimuth, s.elevation * 0.5, wide);
    case "drift":
      return out(centre, s.azimuth + s.turn * e, s.elevation * 0.5, wide * 0.92);
    case "orbit":
      return out(lerp3(centre, HEART, 0.3), s.azimuth + s.turn * u, 0.08 + s.elevation * 0.5, wide * 0.8);
    case "pushin":
      return out(lerp3(centre, s.organ, e), s.azimuth * 0.5, s.elevation * 0.4, lerp(wide * 0.75, 1.0, e));
    case "crane":
      return out(lerp3(centre, HEART, 0.4), s.azimuth, s.rise * lerp(-0.35, 0.55, e), wide * 0.85);
    case "hand": {
      const point = s.reach?.point ?? HEART;
      // Start on the chest, then let the camera find the hand as it goes out.
      return out(lerp3(HEART, point, ease(Math.min(1, Math.max(0, u * 1.6)))), s.side * 0.55 + s.azimuth * 0.3, 0.05, lerp(2.4, 1.05, e));
    }
    case "dolly": {
      // The figure stays the same size while the world stretches behind it.
      const d = lerp(1.7, 4.4, e);
      const fov = (2 * Math.atan((Math.tan((34 * Math.PI) / 360) * 1.7) / d) * 180) / Math.PI;
      return out(HEART, s.azimuth * 0.5, 0.04, d, fov);
    }
  }
}
