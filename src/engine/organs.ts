// PLACEHOLDER ANATOMY. Rough organ shapes made of nodes: a brain, a heart, a stomach and a gut path.
// Their anchors fill first, so each region's density builds up as an organ before scattering into
// the rest of the body. Like mannequin.ts, this is a stand-in for painted or modelled anatomy.
import type { BodyParams } from "./mannequin";

type V3 = [number, number, number];

const ellipsoid = (p: V3, c: V3, r: V3) => {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  const k1 = Math.max(Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2])), 1e-6);
  return (k0 * (k0 - 1)) / k1;
};

const segment = (p: V3, a: V3, b: V3) => {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2] || 1)));
  return { d: Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h), h };
};

const smoothMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** A tube through the belly, in order of digestion: small intestine, then colon. */
export interface GutPath {
  points: V3[];
  radius: number[];
  s: number[]; // 0 at the stomach → 1 at the end, by arc length
}

export interface Anatomy {
  brain: (p: V3) => number;
  heart: (p: V3) => number;
  stomach: (p: V3) => number;
  gut: GutPath;
  /** Distance to the gut tube's surface, plus how far along the gut the nearest point is. */
  gutDistance: (p: V3) => { d: number; s: number };
  /** How active a brain anchor is: the frontal lobe and hippocampus fire most. */
  neural: (p: V3) => number;
  bounds: { brain: [V3, V3]; heart: [V3, V3]; stomach: [V3, V3] };
}

export function makeAnatomy(b: BodyParams): Anatomy {
  const h = b.head, g = b.build;
  const H = (x: number, y: number, z: number): V3 => [x * h, 0.55 + (y - 0.55) * h, z * h];
  const T = (x: number, y: number, z: number): V3 => [x * g, y, z * g];

  const brain = (p: V3) => {
    let d = Math.min(ellipsoid(p, H(0.034, 0.567, -0.005), [0.05 * h, 0.056 * h, 0.077 * h]), ellipsoid(p, H(-0.034, 0.567, -0.005), [0.05 * h, 0.056 * h, 0.077 * h]));
    d = Math.max(d, 0.004 * h - Math.abs(p[0])); // the fissure between hemispheres
    d = smoothMin(d, ellipsoid(p, H(0, 0.515, -0.052), [0.044 * h, 0.025 * h, 0.03 * h]), 0.01); // cerebellum
    d = smoothMin(d, segment(p, H(0, 0.515, -0.028), H(0, 0.44, -0.018)).d - 0.012 * h, 0.01); // brainstem
    return d;
  };

  // Tilted toward the person's left, apex down and forward.
  const heart = (p: V3) => {
    let d = ellipsoid(p, T(0.045, 0.228, 0.055), [0.03 * g, 0.03, 0.03 * g]);
    d = smoothMin(d, ellipsoid(p, T(0.078, 0.222, 0.05), [0.028 * g, 0.028, 0.028 * g]), 0.015);
    d = smoothMin(d, ellipsoid(p, T(0.068, 0.198, 0.058), [0.042 * g, 0.042, 0.036 * g]), 0.015);
    d = smoothMin(d, ellipsoid(p, T(0.088, 0.166, 0.066), [0.022 * g, 0.026, 0.022 * g]), 0.015);
    d = smoothMin(d, segment(p, T(0.052, 0.235, 0.045), T(0.04, 0.275, 0.035)).d - 0.012 * g, 0.01); // aorta
    return d;
  };

  // A J-shaped stomach in the upper left of the abdomen, kept well below the heart: the diaphragm
  // sits between them, and nothing should read as wiring from one to the other.
  const stomach = (p: V3) => {
    let d = ellipsoid(p, T(0.075, 0.035, 0.045), [0.032 * g, 0.028, 0.028 * g]);
    d = smoothMin(d, ellipsoid(p, T(0.06, 0.005, 0.05), [0.037 * g, 0.03, 0.03 * g]), 0.02);
    d = smoothMin(d, ellipsoid(p, T(0.025, -0.012, 0.055), [0.03 * g, 0.022, 0.025 * g]), 0.02);
    d = smoothMin(d, ellipsoid(p, T(-0.01, -0.008, 0.055), [0.017 * g, 0.015, 0.017 * g]), 0.015);
    return d;
  };

  // The gut path: from the stomach's exit, the small intestine winds back and forth across the
  // belly, then the colon climbs the person's right side, crosses, and descends on the left.
  const points: V3[] = [];
  const radius: number[] = [];
  const push = (p: V3, r: number) => {
    points.push(T(p[0], p[1], p[2]));
    radius.push(r * g);
  };
  for (let i = 0; i <= 10; i++) push([-0.01 - 0.05 * (i / 10), -0.015 - 0.065 * (i / 10), 0.055], 0.008);
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y = -0.08 - r * 0.033;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = (r % 2 === 0 ? -0.065 + 0.13 * t : 0.065 - 0.13 * t);
      push([x, y + 0.008 * Math.sin(t * Math.PI * 6 + r), 0.045 + 0.012 * Math.cos(t * Math.PI * 9 + r * 2)], 0.008);
    }
  }
  const colon: V3[] = [
    [-0.065, -0.23, 0.04],
    [-0.1, -0.23, 0.035],
    [-0.1, -0.05, 0.035],
    [0.1, -0.05, 0.035],
    [0.1, -0.23, 0.035],
    [0.03, -0.265, 0.04],
  ];
  for (let k = 0; k < colon.length - 1; k++) {
    const [a, c] = [colon[k], colon[k + 1]];
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t + 0.006 * Math.sin(t * Math.PI * 4), a[2] + (c[2] - a[2]) * t], 0.012);
    }
  }
  const s = [0];
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  const total = s[s.length - 1];
  const gut: GutPath = { points, radius, s: s.map((x) => x / total) };

  const gutDistance = (p: V3) => {
    let best = Infinity, bestS = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const { d, h: t } = segment(p, points[i], points[i + 1]);
      const surface = d - (radius[i] + (radius[i + 1] - radius[i]) * t);
      if (surface < best) {
        best = surface;
        bestS = gut.s[i] + (gut.s[i + 1] - gut.s[i]) * t;
      }
    }
    return { d: best, s: bestS };
  };

  const neural = (p: V3) => {
    const frontal = Math.min(1, Math.max(0, (p[2] / h - 0.02) / 0.04));
    const hippo = Math.max(...[1, -1].map((side) => Math.exp(-((Math.hypot(p[0] - side * 0.028 * h, p[1] - (0.55 + (0.537 - 0.55) * h), p[2] - 0.005 * h) / (0.016 * h)) ** 2))));
    return Math.max(0.3, frontal, hippo);
  };

  return {
    brain,
    heart,
    stomach,
    gut,
    gutDistance,
    neural,
    bounds: {
      brain: [H(-0.09, 0.42, -0.1), H(0.09, 0.64, 0.08)],
      heart: [T(0.01, 0.13, 0.01), T(0.12, 0.29, 0.1)],
      stomach: [T(-0.03, -0.04, 0.01), T(0.12, 0.07, 0.09)],
    },
  };
}
