// Veins: a vascular tree grown through the body's own nodes. It roots at the heart and spreads node
// to node along the cheapest paths, where cheap means short, deep inside the body, and (by the
// anatomy setting) near where the major vessels really run: the aorta, the carotids up the neck,
// the arteries down the arms and legs, the spinal cord. Every vein joins two real nodes, so the
// shape stays the data's: no nodes in the legs yet, no veins there yet. Trunks are the branches
// that feed the most nodes; the rest thin out to capillaries, and the branching setting decides how
// fine they go. Deterministic: the same nodes always grow the same tree.
import { elbowX, LEG, legHipX, shoulderX, type BodyParams } from "./mannequin";

type V3 = [number, number, number];

export interface VeinOptions {
  branching: number; // 0 trunks only → 1 down to capillaries
  surface: number; // 0 they keep deep inside → 1 they run just under the skin as readily
  anatomy: number; // 0 the data alone decides → 1 they hug the textbook vessels
}

export interface Veins {
  pairs: [number, number][]; // [toward the heart, away from it], as node (point) indices
  flow: number[]; // per pair: how much of the tree it feeds, 0 a capillary → 1 the aorta
  dist: Map<number, number>; // per node on the tree: path distance from the heart, 0–1
}

/** The major vessels in the rest pose, roughly where anatomy puts them. A guide, never drawn. */
export function vesselTemplate(b: BodyParams): V3[][] {
  const g = b.build, sx = shoulderX(b), ex = elbowX(b), hx = legHipX(b);
  const heart: V3 = [0.05 * g, 0.235, 0.045 * g];
  const arch: V3 = [0.015 * g, 0.29, 0.02 * g];
  const pelvis: V3 = [0, -0.22, 0];
  const out: V3[][] = [
    [heart, arch, [0, 0.27, -0.02 * g], [0, 0.1, -0.035 * g], [0, -0.1, -0.025 * g], pelvis], // aorta, down in front of the spine
    [[0, 0.44, -0.018], [0, 0.32, -0.05 * g], [0, 0.1, -0.065 * g], [0, -0.2, -0.055 * g]], // spinal cord, from the brainstem
    [[0, 0.02, -0.03 * g], [0.05 * g, 0.03, 0.04 * g], [0, -0.12, 0.04 * g]], // to the stomach and gut
  ];
  for (const s of [1, -1]) {
    out.push([arch, [s * 0.025, 0.33, 0.01], [s * 0.03, 0.44, 0], [s * 0.025, 0.53, -0.01]]); // carotid, up the neck into the head
    out.push([arch, [s * 0.08 * g, 0.29, 0], [s * sx, 0.27, -0.01], [s * (sx + 0.02), 0.15, -0.005], [s * ex, 0.02, -0.005], [s * (ex + 0.015), -0.22, 0.05]]); // subclavian, down the arm
    if (b.mode === "body") out.push([pelvis, [s * hx * 0.7, -0.27, 0.01], [s * hx, -0.4, 0.01], [s * hx * 1.05, LEG.kneeY, 0.01], [s * hx * 1.05, LEG.ankleY, -0.01]]); // iliac and femoral, down the leg
  }
  return out;
}

const segDist = (p: V3, a: V3, b: V3) => {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
};

/** A binary min-heap of node indices by cost. */
class Heap {
  private items: number[] = [];
  constructor(private cost: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (this.cost[a[up]] <= this.cost[a[k]]) break;
      [a[up], a[k]] = [a[k], a[up]];
      k = up;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && this.cost[a[l]] < this.cost[a[m]]) m = l;
        if (r < a.length && this.cost[a[r]] < this.cost[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

/**
 * Grow the tree. `nodes` are point indices (one per body anchor), `P` their positions, `depth` how
 * deep inside the body each sits (0 the skin → 1 the core), `arm` whether it rides an arm.
 */
export function growVeins(nodes: number[], P: Float32Array, depth: (i: number) => number, arm: (i: number) => boolean, body: BodyParams, o: VeinOptions): Veins {
  const n = nodes.length;
  const empty: Veins = { pairs: [], flow: [], dist: new Map() };
  if (n < 8) return empty;
  const pos = (k: number): V3 => [P[nodes[k] * 3], P[nodes[k] * 3 + 1], P[nodes[k] * 3 + 2]];

  // Link each node to its nearest few within a radius that follows the spacing: a sparse body links
  // further, so its veins can still reach, but never across real gaps.
  const volume = body.mode === "body" ? 0.05 : 0.03;
  const radius = Math.min(0.08, 2.6 * Math.cbrt(volume / n));
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let k = 0; k < n; k++) [X[k], Y[k], Z[k]] = pos(k);
  const cellKey = (cx: number, cy: number, cz: number) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
  const grid = new Map<number, number[]>();
  for (let k = 0; k < n; k++) {
    const c = cellKey(Math.floor(X[k] / radius), Math.floor(Y[k] / radius), Math.floor(Z[k] / radius));
    (grid.get(c) ?? grid.set(c, []).get(c)!).push(k);
  }
  const isArm = new Uint8Array(n);
  for (let k = 0; k < n; k++) isArm[k] = arm(nodes[k]) ? 1 : 0;

  // How near each node lies to the vessels anatomy draws.
  const template = vesselTemplate(body);
  const guide = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const p = pos(k);
    let d = Infinity;
    for (const line of template) for (let s = 0; s < line.length - 1; s++) d = Math.min(d, segDist(p, line[s], line[s + 1]));
    guide[k] = Math.exp(-((d / 0.022) ** 2));
  }

  const NEIGHBOURS = 6;
  const links: number[][] = new Array(n);
  const r2 = radius * radius;
  for (let k = 0; k < n; k++) {
    const px = X[k], py = Y[k], pz = Z[k];
    const cx = Math.floor(px / radius), cy = Math.floor(py / radius), cz = Math.floor(pz / radius);
    // The nearest few, kept in a small sorted list rather than sorting every candidate.
    const best: number[] = [], bestD: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!cell) continue;
          for (const j of cell) {
            if (j === k) continue;
            const ex = X[j] - px, ey = Y[j] - py, ez = Z[j] - pz;
            const d = ex * ex + ey * ey + ez * ez;
            if (d >= r2) continue;
            // An arm vein meets the body only at the shoulder, or it would stretch whenever the arm moves.
            if (isArm[k] !== isArm[j] && Math.max(py, Y[j]) <= 0.2) continue;
            if (best.length === NEIGHBOURS && d >= bestD[NEIGHBOURS - 1]) continue;
            let at = best.length < NEIGHBOURS ? best.length : NEIGHBOURS - 1;
            while (at > 0 && bestD[at - 1] > d) {
              if (at < NEIGHBOURS) [best[at], bestD[at]] = [best[at - 1], bestD[at - 1]];
              at--;
            }
            best[at] = j;
            bestD[at] = d;
          }
        }
    links[k] = best;
  }

  // Root: the node nearest the heart.
  const heart: V3 = [0.05 * body.build, 0.22, 0.05 * body.build];
  let root = 0, rootD = Infinity;
  for (let k = 0; k < n; k++) {
    const p = pos(k);
    const d = Math.hypot(p[0] - heart[0], p[1] - heart[1], p[2] - heart[2]);
    if (d < rootD) [root, rootD] = [k, d];
  }
  if (rootD > 0.1) return empty; // no heart yet

  // Dijkstra from the heart. Deep and anatomical links are cheap; skin links cost more, less so as
  // the surface setting rises.
  const cost = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const order: number[] = [];
  const done = new Uint8Array(n);
  cost[root] = 0;
  const heap = new Heap(cost);
  heap.push(root);
  const skin = 3 * (1 - o.surface);
  while (heap.size) {
    const k = heap.pop();
    if (done[k]) continue;
    done[k] = 1;
    order.push(k);
    const p = pos(k);
    for (const j of links[k]) {
      if (done[j]) continue;
      const q = pos(j);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const shallow = 1 - (depth(nodes[k]) + depth(nodes[j])) / 2;
      const along = (guide[k] + guide[j]) / 2;
      const c = cost[k] + len * (1 + skin * shallow) * (1 - 0.8 * o.anatomy * along);
      if (c < cost[j]) {
        cost[j] = c;
        parent[j] = k;
        heap.push(j);
      }
    }
  }

  // How many nodes each branch feeds, leaves first.
  const feeds = new Float32Array(n).fill(1);
  for (let i = order.length - 1; i > 0; i--) {
    const k = order[i];
    if (parent[k] >= 0) feeds[parent[k]] += feeds[k];
  }
  const total = order.length;
  // Branching keeps every branch feeding at least this many nodes: a hundredth of the tree at 0, two at 1.
  const least = Math.exp(Math.log(Math.max(2, total * 0.01)) * (1 - o.branching) + Math.log(2) * o.branching);
  const far = Math.max(...order.map((k) => cost[k]).filter(Number.isFinite), 1e-6);

  const pairs: [number, number][] = [];
  const flow: number[] = [];
  const dist = new Map<number, number>();
  const logTotal = Math.log(total);
  for (const k of order) {
    dist.set(nodes[k], cost[k] / far);
    if (parent[k] < 0 || feeds[k] < least) continue;
    pairs.push([nodes[parent[k]], nodes[k]]);
    flow.push(Math.log(feeds[k]) / logTotal);
  }
  return { pairs, flow, dist };
}
