// The video director: plans a ten-second clip of the figure as one to four shots, each a camera move
// with a lens, and cues moves for the figure to perform on camera (a reach to follow, a gesture).
// Two energies: meditative (one or two long, slow takes, mostly still or drifting) and trailer
// (several cuts, faster orbits, push-ins, a dolly zoom). Every plan is rolled fresh, so no two clips
// are the same. Style only: the camera and the cues never touch the data.
import type { Lens, Ratio } from "./imagery";

type V3 = [number, number, number];
export type Energy = "either" | "meditative" | "trailer";
type Glass = Exclude<Lens, "mixed">;
type Kind = "static" | "drift" | "orbit" | "pushin" | "crane" | "dolly" | "hand";

export interface Cue {
  at: number; // seconds into the clip
  move?: string; // a standing move by name
  reach?: { side: 1 | -1; point: V3 }; // or a hand out to a point, which the shot follows
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
  cue?: Cue;
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

/** Video sizes: the imagery ratios at 1080p-class sizes, even on both sides for H.264. */
export const videoSize = (ratio: Ratio): { width: number; height: number } =>
  ({ "4:5": { width: 1080, height: 1350 }, "9:16": { width: 1080, height: 1920 }, "1:1": { width: 1080, height: 1080 }, "16:9": { width: 1920, height: 1080 }, "2.39:1": { width: 1920, height: 804 } })[ratio.id] ?? { width: 1920, height: 1080 };

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

/** Roll a plan. `body` is false in bust mode (no legs to frame). */
export function planClip(energy: Energy, seconds: number, lens: Lens, moves: string[], body: boolean, r: () => number = Math.random): Shot[] {
  const trailer = energy === "trailer" || (energy === "either" && r() >= 0.6);
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
    const shot: Shot = {
      kind,
      start,
      end,
      lens: kind === "dolly" ? "as-shot" : glass,
      azimuth: (r() - 0.5) * (trailer ? 1.6 : 0.9),
      elevation: (r() - 0.4) * 0.35,
      turn: kind === "orbit" ? side * len * (trailer ? 0.3 + r() * 0.25 : 0.05 + r() * 0.05) : kind === "drift" ? side * (0.15 + r() * 0.2) : 0,
      organ: pick(r, [HEAD, HEART, GUT, HEART]),
      side,
      rise: r() < 0.5 ? 1 : -1,
    };
    // Something for the camera to watch: a hand out to follow, or a gesture.
    if (kind === "hand") shot.cue = { at: start + 0.1, reach: { side, point: [side * (0.36 + r() * 0.1), 0.25 + r() * 0.2, 0.22 + r() * 0.12] } };
    else if (moves.length && r() < (trailer ? 0.55 : 0.3)) shot.cue = { at: start + 0.2 + r() * Math.min(1.5, len * 0.3), move: pick(r, moves) };
    shots.push(shot);
    start = end;
  }
  // Bust mode has no legs: everything frames a little higher.
  if (!body) for (const s of shots) if (s.organ === GUT) s.organ = HEART;
  return shots;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const around = (target: V3, azimuth: number, elevation: number, distance: number): V3 => {
  const flat = Math.cos(elevation) * distance;
  return [target[0] + Math.sin(azimuth) * flat, target[1] + Math.sin(elevation) * distance, target[2] + Math.cos(azimuth) * flat];
};

/** Where the camera is `u` (0–1) of the way through a shot. `trailer` shots move further. */
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
      const point = s.cue?.reach?.point ?? HEART;
      // Start on the chest, then let the camera find the hand as it goes out.
      return out(lerp3(HEART, point, ease(Math.min(1, u * 1.6))), s.side * 0.55 + s.azimuth * 0.3, 0.05, lerp(2.4, 1.05, e));
    }
    case "dolly": {
      // The figure stays the same size while the world stretches behind it.
      const d = lerp(1.7, 4.4, e);
      const fov = (2 * Math.atan((Math.tan((34 * Math.PI) / 360) * 1.7) / d) * 180) / Math.PI;
      return out(HEART, s.azimuth * 0.5, 0.04, d, fov);
    }
  }
}
