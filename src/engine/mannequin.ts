// PLACEHOLDER BODY. A smooth union of ellipsoids and capsules standing in for the real rigged bust,
// with anatomical region centres standing in for the painted head/heart/gut maps.
// Swap this file for a glTF loader once the body source is chosen; placement only needs Anchors.
import type { Genome } from "./genome";
import { hash01, rngFor } from "./rng";
import { makeAnatomy } from "./organs";

type V3 = [number, number, number];

/** The figure controls. Style layer: the user's to change (decision 6). */
export interface BodyParams {
  form: number; // 0 masculine → 1 feminine
  build: number; // 0.8 thin → 1.25 bulky
  shoulders: number; // 0.85 → 1.15
  head: number; // 0.85 → 1.15
  mode: "bust" | "body"; // bust ends below the hips; body adds legs and can walk
}

export const DEFAULT_BODY: BodyParams = { form: 0, build: 1, shoulders: 1, head: 1, mode: "body" };

// Leg joints, shared with the walk cycle in the shader.
export const LEG = { hipY: -0.27, kneeY: -0.69, ankleY: -1.04, groundY: -1.1 };
export const legHipX = (b: BodyParams) => lerpForm(b, 0.088, 0.095) * b.build;
/** The anchor count each mode needs to read at the same density. */
export const anchorCount = (b: BodyParams) => (b.mode === "body" ? 42000 : 28000);
/** A full body always has arms. */
/** Where the elbow sits at rest, for the gestures in the shader. */
export const elbowX = (b: BodyParams) => shoulderX(b) + lerpForm(b, 0.035, 0.033) * b.build + 0.03;

const FACE_SHARE = 0.03; // extra anchors on the face's skin, so brow, nose and sockets have points to read through
const ORGAN_SHARE = 0.16; // of all anchors. More, and the organs eat the silhouette
// The aura: seven nested egg-shaped layers, the common esoteric count (one per chakra, etheric to
// ketheric), after the classic energy-field diagrams. Spirit fragments float as loose nodes through
// each layer, inner layers first. No lines join them.
const AURA_LAYERS = 7;
const AURA_SHARE = [0.2, 0.18, 0.16, 0.14, 0.12, 0.11, 0.09];
export const auraCount = (b: BodyParams) => (b.mode === "body" ? 9000 : 6000);

// Space: the void around the figure, the last stop for overflow once the body and aura are full.
// The figure holds about 50,000 (body, limbs, aura); the void about 40,000 more. Past that, ether nodes
// still land, far out, unanchored.
export const CAPACITY = 90000;
export const SPACE_LAYER = 8;
export const ETHER_LAYER = 9;
/** The egg the aura swells toward; space and ether are measured from its centre. */
export const eggOf = (b: BodyParams): { c: V3; r: V3 } =>
  b.mode === "body" ? { c: [0, -0.15, 0], r: [0.55, 1.05, 0.42] } : { c: [0, 0.15, 0], r: [0.42, 0.62, 0.36] };
const SPACE_RADII = { bust: [0.75, 2.4], body: [1.2, 3.0] };
const ORGAN_SPLIT = { brain: 0.4, heart: 0.2, stomach: 0.12, gut: 0.28 };

export interface Anchors {
  count: number;
  regions: number; // how many weights each anchor carries: head, heart, gut, spirit
  layer: Float32Array; // 0 the body, 1–7 the aura's layers
  pos: Float32Array; // xyz
  normal: Float32Array; // xyz, outward
  weights: Float32Array; // head, heart, gut, normalised (for matching)
  core: Float32Array; // 1 at a region's centre, 0 far from every region: fills last
  cores: Float32Array; // head, heart, gut: tight masses around each centre, for the core glow and heartbeat
  field: Float32Array; // head, heart, gut, wide and normalised: colour bleeds across region borders
  path: Float32Array; // how far along the gut, 0–1, for anchors in the gut tube; -1 elsewhere
  neural: Float32Array; // brain activity weight (frontal lobe and hippocampus highest); 0 outside the brain
  wild: Float32Array; // 0–1: how much any fragment may land here regardless of region (the legs)
  reach: Float32Array; // 0 on the torso → 1 at the hands and feet: limbs fill from the body outward
  fray: Float32Array; // 0 on the body, 1 where arms and belly dissolve into nothing
  arm: Uint8Array; // 1 if the anchor belongs to an arm (shoulder cap to fingertips): it moves with the arm, nothing else does
  depth: Float32Array; // 0 at the surface, 1 deep inside
  angle: Float32Array; // around the spine, for spiral growth
  mirror: Int32Array; // index of the left/right twin
  spacing: number; // typical distance between anchors
}

const ellipsoid = (p: V3, c: V3, r: V3) => {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  const k1 = Math.max(Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2])), 1e-6);
  return (k0 * (k0 - 1)) / k1;
};

const capsule = (p: V3, a: V3, b: V3, r: number) => {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2])));
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
};

const smoothMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

const smoothMax = (a: number, b: number, k: number) => -smoothMin(-a, -b, k);

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const lerpForm = (b: BodyParams, masc: number, fem: number) => masc + (fem - masc) * b.form;
/** Where the arms hinge, for the idle animation. */
export const shoulderX = (b: BodyParams) => lerpForm(b, 0.17, 0.145) * b.shoulders;
/** Half the chest's width: breathing stays inside it, arms outside it don't swell. */
export const torsoHalf = (b: BodyParams) => lerpForm(b, 0.165, 0.145) * b.build;

/** Signed distance to the bust, in metres. Symmetric in x. Front is +z, the person's left is +x. */
/** One arm (the +x side): upper arm, forearm and hand, hanging at rest. */
export function makeArmSdf(b: BodyParams): (q: V3) => number {
  const f = b.form;
  const L = (masc: number, fem: number) => masc + (fem - masc) * f;
  const g = b.build;
  const armTop: V3 = [shoulderX(b) + L(0.035, 0.033) * g, 0.27, -0.01];
  const elbow: V3 = [armTop[0] + 0.03, 0.02, -0.005];
  const wrist: V3 = [elbow[0] + 0.015, -0.22, 0.05]; // forearm hangs slightly forward
  return (q: V3) => {
    let d = capsule(q, armTop, elbow, L(0.045, 0.037) * g); // upper arm
    d = smoothMin(d, capsule(q, elbow, wrist, L(0.035, 0.029) * g), 0.025); // forearm
    // The hand: a flat paddle, palm to the thigh, fingers down.
    return smoothMin(d, ellipsoid(q, [wrist[0] + 0.003, wrist[1] - 0.085, wrist[2] + 0.008], [L(0.022, 0.019) * g, 0.09, L(0.046, 0.04) * g]), 0.02);
  };
}

export function makeBustSdf(b: BodyParams, withArms = true): (p: V3) => number {
  const f = b.form;
  const L = (masc: number, fem: number) => masc + (fem - masc) * f;
  const g = b.build, h = b.head;
  const sx = shoulderX(b);
  const arm = makeArmSdf(b);
  const F = (x: number, y: number, z: number): V3 => [x * h, 0.55 + y * h, z * h]; // face, relative to the head's centre

  return (p: V3) => {
    const q: V3 = [Math.abs(p[0]), p[1], p[2]];
    let d = ellipsoid(q, [0, 0.55, 0], [0.092 * h, 0.118 * h, 0.108 * h]); // cranium
    d = smoothMin(d, ellipsoid(q, [0, 0.55 - 0.08 * h, 0.025 * h], [L(0.07, 0.06) * h, L(0.065, 0.058) * h, 0.08 * h]), 0.04); // jaw
    // A subtle face: brow, nose, shallow eye sockets.
    d = smoothMin(d, ellipsoid(q, F(0, 0.035, 0.098), [0.055 * h, 0.011 * h, 0.012 * h]), 0.01); // brow
    d = smoothMin(d, ellipsoid(q, F(0, -0.035, 0.105), [L(0.011, 0.009) * h, 0.024 * h, 0.016 * h]), 0.008); // nose
    d = smoothMax(d, 0.017 * h - Math.hypot(q[0] - 0.033 * h, q[1] - (0.55 + 0.012 * h), q[2] - 0.1 * h), 0.008); // eye sockets
    d = smoothMin(d, capsule(q, [0, 0.36, -0.01], [0, 0.46, 0], L(0.052, 0.043) * Math.sqrt(g)), 0.04); // neck
    d = smoothMin(d, capsule(q, [0, 0.305, -0.01], [sx, 0.3, -0.01], L(0.065, 0.055) * g), 0.06); // shoulders
    d = smoothMin(d, ellipsoid(q, [0, 0.18, 0.012], [L(0.165, 0.145) * g, 0.145, L(0.105, 0.095) * g]), 0.06); // chest
    if (f < 0.95) d = smoothMin(d, ellipsoid(q, [0.055, 0.19, 0.06], [0.07 * g, 0.06, 0.05 * g * (1 - f)]), 0.04); // pectoral
    if (f > 0.05) d = smoothMin(d, ellipsoid(q, [0.07 * g, 0.155, 0.07 * g], [0.068 * g * f, 0.064 * f, 0.062 * g * f]), 0.05); // breast
    d = smoothMin(d, ellipsoid(q, [0, -0.02, 0], [L(0.14, 0.118) * g, 0.15, L(0.095, 0.088) * g]), 0.07); // stomach / waist
    d = smoothMin(d, ellipsoid(q, [0, -0.19, -0.005], [L(0.15, 0.17) * g, 0.1, L(0.1, 0.106) * g]), 0.06); // lower belly
    d = smoothMin(d, ellipsoid(q, [L(0.1, 0.11) * g, -0.25, -0.005], [L(0.07, 0.078) * g, 0.075, 0.08 * g]), 0.05); // hip bones
    d = smoothMin(d, ellipsoid(q, [0, -0.29, 0], [L(0.12, 0.13) * g, 0.06, 0.085 * g]), 0.05); // pelvis
    if (withArms) d = smoothMin(d, arm(q), 0.04);
    if (b.mode === "body") {
      const hx = legHipX(b);
      d = smoothMin(d, capsule(q, [hx, LEG.hipY, 0], [hx * 1.05, LEG.kneeY, 0.01], L(0.068, 0.072) * g), 0.05); // thigh
      d = smoothMin(d, capsule(q, [hx * 1.05, LEG.kneeY, 0.01], [hx * 1.05, LEG.ankleY, -0.01], 0.043 * g), 0.03); // shin
      d = smoothMin(d, ellipsoid(q, [hx * 1.05, -0.8, -0.022], [0.05 * g, 0.1, 0.05 * g]), 0.03); // calf
      d = smoothMin(d, ellipsoid(q, [hx * 1.08, LEG.groundY + 0.025, 0.05], [0.04 * g, 0.025, 0.1]), 0.02); // foot
    }
    return d;
  };
}

// Anatomical region centres. The heart sits to the person's left (+x), forward in the chest.
const CENTRES: V3[] = [
  [0, 0.53, 0],
  [0.065, 0.2, 0.06],
  [0, -0.08, 0.03],
];
const FIELD_SIGMA = 0.2;

const gaussians = (p: V3, sigma: (r: number) => number) =>
  CENTRES.map((c, r) => Math.exp(-((Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / sigma(r)) ** 2)));

/** Stand-in for the painted maps. Raw membership falls off with distance from each centre. */
function regionWeights(p: V3, bleed: number): { w: [number, number, number]; core: number } {
  const sigma = 0.11 + bleed * 0.15;
  const raw = CENTRES.map((c) => Math.exp(-((Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / sigma) ** 2)) + 1e-9);
  const sum = raw[0] + raw[1] + raw[2];
  return { w: [raw[0] / sum, raw[1] / sum, raw[2] / sum], core: Math.min(1, Math.max(raw[0], raw[1], raw[2])) };
}

/** Sample anchors through the bust, in mirrored pairs so the symmetry gene has twins to favour. */
export function sampleAnchors(genome: Genome, body: BodyParams, count = anchorCount(body)): Anchors {
  const full = body.mode === "body";
  const sdf = makeBustSdf(body);
  // Which anchors are arm: nearer the arm than the armless body. Crisp, so a raised arm takes its
  // own nodes and leaves the waist beside it where it was.
  const armSdf = makeArmSdf(body);
  const trunkSdf = makeBustSdf(body, false);
  const isArmAt = (q: V3) => armSdf([Math.abs(q[0]), q[1], q[2]]) < trunkSdf(q);
  const gradient = (p: V3): V3 => {
    const e = 1e-3;
    const g: V3 = [
      sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]),
      sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]),
      sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]),
    ];
    const len = Math.hypot(g[0], g[1], g[2]) || 1;
    return [g[0] / len, g[1] / len, g[2] / len];
  };

  const rand = rngFor(`${genome.seed}:anchors`);
  // The organs are always there: brain, heart, stomach and gut, made of nodes.
  const anatomy = makeAnatomy(body);
  // Which arm dissolves more is part of the person's temperament.
  const heavySide = hash01(`${genome.seed}:fraySide`) < 0.5 ? 1 : -1;
  const reach = Math.max(body.shoulders, 1) * Math.max(body.build, 1);
  const organCount = Math.floor(count * ORGAN_SHARE);
  const faceCount = Math.floor(count * FACE_SHARE);
  const pairs = Math.floor((count - organCount - faceCount) / 2);
  const aura = auraCount(body);
  const bodyEnd = pairs * 2 + faceCount + organCount;
  const auraEnd = bodyEnd + aura;
  const n = Math.max(CAPACITY, auraEnd);
  const R = 4;
  const layer = new Float32Array(n);
  const pos = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const weights = new Float32Array(n * R);
  const core = new Float32Array(n);
  const cores = new Float32Array(n * 3);
  const field = new Float32Array(n * R);
  const path = new Float32Array(n).fill(-1);
  const neural = new Float32Array(n);
  const wild = new Float32Array(n);
  const limbReach = new Float32Array(n);
  const fray = new Float32Array(n);
  const depth = new Float32Array(n);
  const angle = new Float32Array(n);
  const mirror = new Int32Array(n).fill(-1);
  const armOf = new Uint8Array(n);

  // Membership in each region's core: the organs.
  const member = (d: number) => (d <= 0 ? 1 : Math.exp(-((d / 0.01) ** 2)));
  const near = (q: V3, [lo, hi]: [V3, V3]) =>
    q[0] > lo[0] - 0.06 && q[0] < hi[0] + 0.06 && q[1] > lo[1] - 0.06 && q[1] < hi[1] + 0.06 && q[2] > lo[2] - 0.06 && q[2] < hi[2] + 0.06;
  const coresAt = (q: V3): [number, number, number] => {
    const { bounds } = anatomy;
    const brain = near(q, bounds.brain) ? member(anatomy.brain(q)) : 0;
    const heart = near(q, bounds.heart) ? member(anatomy.heart(q)) : 0;
    const stomach = near(q, bounds.stomach) ? member(anatomy.stomach(q)) : 0;
    const gut = q[1] < 0.06 && q[1] > -0.34 && Math.abs(q[0]) < 0.2 ? member(anatomy.gutDistance(q).d) : 0;
    return [brain, heart, Math.max(stomach, gut)];
  };

  const write = (i: number, q: V3, g: V3, d: number, fr: number) => {
    const r = regionWeights(q, genome.regionBleed);
    // The legs belong to no region: any passing remark may land there, at a slightly worse match
    // than its own region. They fill as the body's overflow, the dust it walks on.
    // From the hips down it's fully overflow; a half-overflow pelvis lost every match to the legs.
    if (full && q[1] < -0.12) wild[i] = smoothstep(-0.12, -0.26, q[1]);
    // How far out along a limb: down a leg from the hip, down an arm from the shoulder.
    const legReach = full ? Math.max(0, -0.25 - q[1]) / 0.85 : 0;
    const onArm = isArmAt(q);
    armOf[i] = onArm ? 1 : 0;
    const armReach = onArm ? Math.max(0, 0.27 - q[1]) / 0.65 : 0; // shoulder 0 → fingertips 1
    limbReach[i] = Math.min(1, Math.max(legReach, armReach));
    const c = coresAt(q);
    pos.set(q, i * 3);
    normal.set(g, i * 3);
    weights.set([...r.w, 0], i * R);
    cores.set(c, i * 3);
    core[i] = Math.max(c[0], c[1], c[2]);
    const f = gaussians(q, () => FIELD_SIGMA).map((x) => x + 1e-6);
    const fsum = f[0] + f[1] + f[2];
    field.set([f[0] / fsum, f[1] / fsum, f[2] / fsum, 0], i * R);
    if (c[0] > 0.5) neural[i] = anatomy.neural(q);
    fray[i] = fr;
    depth[i] = Math.min(1, Math.max(0, -d / 0.08));
    angle[i] = Math.atan2(q[2], q[0]);
  };

  let made = 0;
  while (made < pairs) {
    let p: V3 = full
      ? [rand() * 0.32 * reach, LEG.groundY - 0.02 + rand() * (0.7 - LEG.groundY), -0.16 + rand() * 0.38]
      : [rand() * 0.32 * reach, -0.4 + rand() * 1.08, -0.16 + rand() * 0.34];
    let d = sdf(p);
    if (d > 0) continue;
    // The face always sits on the skin, whatever the genome's shell bias, or its features vanish
    // among interior points.
    const face = p[1] > 0.42 && p[1] < 0.64 && p[2] > 0.03;
    if (face || rand() < genome.shellBias) {
      // Project onto the skin, then sink a hair so points sit just inside it.
      for (let i = 0; i < 3; i++) {
        const g = gradient(p);
        p = [p[0] - g[0] * d, p[1] - g[1] * d, p[2] - g[2] * d];
        d = sdf(p);
      }
      const g = gradient(p);
      const sink = rand() * 0.005;
      p = [p[0] - g[0] * sink, p[1] - g[1] * sink, p[2] - g[2] * sink];
      d = sdf(p);
    }
    const g = gradient(p);

    for (const side of [1, -1]) {
      const i = made * 2 + (side === 1 ? 0 : 1);
      const x = p[0] * side;
      // Extremities fray: the arms and the bottom of the belly, unevenly. One side (the genome
      // picks which) dissolves sooner and further, and the edge is ragged rather than a clean line.
      const heavy = side === heavySide;
      // The upper arm stays crisp; the fade starts around the elbow and is gone by the wrist.
      const isArm = smoothstep(0.17 * body.shoulders, 0.21 * body.shoulders, p[0]);
      // A full body keeps its arms: they soften toward the hands rather than fading out.
      const armFray = isArm * smoothstep(heavy ? 0.08 : 0.0, -0.24, p[1]) * (full ? 0.35 : 1);
      // The hips hold their shape, then the body fades below them.
      // In bust mode the body fades below the hips; in body mode only the feet soften.
      const waistFray = full ? 0.5 * smoothstep(-0.95, LEG.groundY, p[1]) : smoothstep(heavy ? -0.2 : -0.25, -0.4, p[1]);
      const fr = Math.min(1, Math.max(armFray * (heavy ? 1 : 0.45), waistFray * (heavy ? 1 : 0.75)) * (0.7 + 0.6 * rand()));
      // Frayed anchors scatter outward and down, spreading the nodes apart into nothing.
      const scatter = fr ** 1.3 * 0.16 * rand();
      const rx = rand() - 0.5, ry = rand() - 0.5, rz = rand() - 0.5;
      const q: V3 = [
        x + (g[0] * side * 0.6 + rx * 0.8) * scatter,
        p[1] + (g[1] * 0.6 + ry * 0.8) * scatter - waistFray * 0.1 * rand(),
        p[2] + (g[2] * 0.6 + rz * 0.8) * scatter,
      ];
      write(i, q, [g[0] * side, g[1], g[2]], d, fr);
      mirror[i] = side === 1 ? i + 1 : i - 1;
    }
    made++;
  }

  // Face anchors: on the skin of the face only, unmirrored.
  for (let i = pairs * 2; i < pairs * 2 + faceCount; ) {
    let q: V3 = [(rand() - 0.5) * 0.14 * body.head, 0.44 + rand() * 0.18 * body.head, 0.04 + rand() * 0.1 * body.head];
    let d = sdf(q);
    if (d > 0.02) continue;
    for (let k = 0; k < 3; k++) {
      const g = gradient(q);
      q = [q[0] - g[0] * d, q[1] - g[1] * d, q[2] - g[2] * d];
      d = sdf(q);
    }
    const g = gradient(q);
    if (g[2] < 0.2) continue; // front-facing skin only
    write(i++, q, g, d, 0);
  }

  // Organ anchors: dense, unmirrored, filled first. The brain and heart lean to their surfaces so
  // their shapes read; the gut is sampled along its tube.
  {
    let i = pairs * 2 + faceCount;
    const solid = (sdfOf: (q: V3) => number, [lo, hi]: [V3, V3], want: number, shell: number) => {
      for (let k = 0; k < want; ) {
        const q: V3 = [lo[0] + rand() * (hi[0] - lo[0]), lo[1] + rand() * (hi[1] - lo[1]), lo[2] + rand() * (hi[2] - lo[2])];
        const d = sdfOf(q);
        if (d > 0 || (rand() < shell && d < -0.01)) continue;
        write(i++, q, gradient(q), sdf(q), 0);
        k++;
      }
    };
    const share = (x: number) => Math.round(organCount * x);
    solid(anatomy.brain, anatomy.bounds.brain, share(ORGAN_SPLIT.brain), 0.7);
    solid(anatomy.heart, anatomy.bounds.heart, share(ORGAN_SPLIT.heart), 0.5);
    solid(anatomy.stomach, anatomy.bounds.stomach, share(ORGAN_SPLIT.stomach), 0.5);
    const { points, radius, s: arc } = anatomy.gut;
    while (i < bodyEnd) {
      const u = rand();
      let k = 0;
      while (k < arc.length - 2 && arc[k + 1] < u) k++;
      const t = (u - arc[k]) / Math.max(arc[k + 1] - arc[k], 1e-9);
      const a = points[k], b = points[k + 1];
      const rr = (radius[k] + (radius[k + 1] - radius[k]) * t) * Math.sqrt(rand());
      const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      const q: V3 = [
        a[0] + (b[0] - a[0]) * t + rr * Math.sin(ph) * Math.cos(th),
        a[1] + (b[1] - a[1]) * t + rr * Math.sin(ph) * Math.sin(th),
        a[2] + (b[2] - a[2]) * t + rr * Math.cos(ph),
      ];
      write(i, q, gradient(q), sdf(q), 0);
      path[i] = u;
      i++;
    }
  }

  // The aura: egg shells from the crown, bowing out around the figure and back in at the feet (or
  // the base of the bust). Inner layers sit close; each layer out is wider. Nodes scatter evenly
  // over each shell's surface and a little through its thickness, so they read as floating, not
  // as lines.
  const egg = eggOf(body);
  const crown = 0.72 * Math.max(body.head, 1);
  const base = full ? LEG.groundY : -0.45;
  const yc = (crown + base) / 2, hh = (crown - base) / 2;
  const baseR = full ? 0.36 : 0.32, stepR = full ? 0.1 : 0.068;
  let a = bodyEnd;
  for (let k = 0; k < AURA_LAYERS; k++) {
    const want = k === AURA_LAYERS - 1 ? auraEnd - a : Math.round(aura * AURA_SHARE[k]);
    const R = (baseR + stepR * k) * body.build;
    for (let m = 0; m < want; m++, a++) {
      const phi = rand() * Math.PI * 2;
      const th = Math.acos(1 - 2 * rand()); // area-even from crown to feet
      const swell = 1 + (rand() - 0.5) * 0.18; // a little depth to each layer
      const rho = R * swell * Math.sin(th) * (1 + 0.12 * Math.sin(th)); // slightly fuller through the middle
      const q: V3 = [rho * Math.cos(phi), yc + hh * swell * Math.cos(th), rho * Math.sin(phi) * 0.82];
      pos.set(q, a * 3);
      normal.set([Math.cos(phi), 0, Math.sin(phi)], a * 3);
      weights.set([0, 0, 0, 1], a * 4);
      field.set([0, 0, 0, 1], a * 4);
      layer[a] = k + 1;
      limbReach[a] = (k / (AURA_LAYERS - 1)) * 0.8; // inner layers first
      angle[a] = phi;
    }
  }

  // Space: points through the void, denser near the aura, filling outward. Overflow of any kind.
  const [r0, r1] = SPACE_RADII[body.mode];
  for (let i = auraEnd; i < n; i++) {
    const u = rand();
    const r = r0 + (r1 - r0) * u ** 0.6;
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
    const q: V3 = [egg.c[0] + r * Math.sin(ph) * Math.cos(th), egg.c[1] + r * Math.cos(ph) * 0.85, egg.c[2] + r * Math.sin(ph) * Math.sin(th)];
    pos.set(q, i * 3);
    normal.set([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)], i * 3);
    weights.set([0.25, 0.25, 0.25, 0.25], i * R);
    field.set([0.25, 0.25, 0.25, 0.25], i * R);
    layer[i] = SPACE_LAYER;
    wild[i] = 1;
    limbReach[i] = (r - r0) / (r1 - r0); // nearest the figure first
    angle[i] = th;
  }

  // Bust volume is roughly 0.03 m³ at default build; spacing is the edge of each anchor's share.
  const spacing = Math.cbrt((0.03 * body.build * body.build) / bodyEnd);
  return { count: n, regions: R, layer, pos, normal, weights, core, cores, field, path, neural, wild, reach: limbReach, fray, arm: armOf, depth, angle, mirror, spacing };
}
