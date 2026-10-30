// Placement: each fragment takes the free anchor whose region mix best matches its
// weights; among close matches, the one farthest from existing nodes. Deterministic: the same
// fragments in the same order always draw the same body.
//
// Every fragment first takes a route:
//   ether: a share released in steps with the Legend's lifetime volume (etherShare). Ether nodes
//          fill the void around the figure, and every one pushes the figure a little further apart.
//   limb:  passing remarks (low intensity) often drift out to the arms and legs, so the limbs grow
//          from the first day alongside everything else. Intense thoughts stay in the core.
//   body:  the rest, the head, heart, gut and the spirit's aura, by region match.
// A route with no room left falls through to the next. When a fragment's own region is full, it
// deepens an existing node of that region instead of spilling into another: the node takes a second
// point on top of the first, so a full heart keeps its shape and burns hotter.
//
// Built to scale to tens of thousands of fragments. Free anchors live in buckets by kind and
// dominant region, so each fragment scores a seeded sample of likely candidates instead of every
// anchor. "Farthest from existing nodes" only matters within SPREAD_CAP, so a spatial grid limits
// each update to the anchors nearby.
import { SPACE_LAYER, type Anchors } from "./mannequin";
import type { Genome } from "./genome";
import type { Fragment } from "./fragments";
import { hashString, rngFor } from "./rng";

const MATCH_TOLERANCE = 0.12; // how much worse than the best match a candidate may be
const SPREAD_CAP = 0.03; // beyond this distance from other nodes, candidates tie on spread
const GROWTH_BIAS = 0.12;
// Strong, but only for fragments said with some force: intense thoughts build the organs first,
// passing remarks scatter and form the skin. That keeps both the density and the silhouette.
const CORE_PULL = 0.35;
// Matching sharpens weights first, so a mostly-heart fragment heads for the heart's core instead of
// a border, and each region condenses into a visible mass. Truly mixed fragments still land between.
const SHARPEN = 2;
const REACH_ORDER = 0.45; // in the body, the shoulders fill before the start of the arm
const WILD_ERR = 0.35; // the fixed match grade of anchors that belong to no region
// Limbs: a passing remark lands on a limb with up to this chance. Within a limb, nodes spread along
// its whole length, leaning only slightly to the root, so hands and feet show early.
// Passing means below about 0.75 intensity, fading in from 0.3.
const LIMB_SHARE = 0.75;
// The limbs come slowly at first: a quarter of LIMB_SHARE for a young Legend, rising to all of it by
// LIMB_RAMP fragments, so a light, sketchy person is mostly core and only grows hands and feet with time.
const LIMB_RAMP = 100000;
const limbRamp = (count: number) => 0.25 + 0.75 * smoothstep(0, LIMB_RAMP, count);
const LIMB_REACH = 0.03;
const LIMB_MIN = 0.05; // how far down the arm it stops counting as shoulder
// Limbs fill scattered and uneven, not as an even wash: each limb anchor has a seeded preference,
// part a soft noise field (different on each side, so one forearm runs a little fuller than the
// other) and part its own coin toss, so nodes land scattered rather than in clumps. Spread still
// counts as much, so nowhere goes dense and nowhere is left empty.
const PATCH_SCALE = 0.16; // metres per noise cell
const PATCH_PULL = 0.07; // about the same weight as spread (at most 0.06 here)
// Ether: released in steps. At each Fibonacci count (13k, 21k, 34k, 55k, 89k, 144k…) the ether's
// share of new fragments grows by the golden ratio, from 2% at the first release, and holds until
// the next. About 6% of everything is ether by 100k, 12% by 200k; full dissolution takes far longer.
const PHI = (1 + Math.sqrt(5)) / 2;
export const ETHER_RELEASES = [13, 21, 34, 55, 89, 144, 233, 377, 610, 987].map((k) => k * 1000);
const ETHER_FIRST = 0.02;
const ETHER_MAX = 0.9;
const ETHER_REACH = 0.3; // nearer the figure first, loosely
/** How many releases a Legend of this many fragments has passed. */
export const etherRelease = (count: number) => ETHER_RELEASES.filter((at) => count >= at).length;
/** The ether's share of the next fragment. */
export const etherShare = (count: number) => {
  const k = etherRelease(count);
  return k ? Math.min(ETHER_MAX, ETHER_FIRST * PHI ** (k - 1)) : 0;
};
/** The expected share of all fragments that are ether after this many. */
export const etherFraction = (count: number) => {
  if (count <= 0) return 0;
  let total = 0;
  ETHER_RELEASES.forEach((at, k) => {
    const end = Math.min(count, ETHER_RELEASES[k + 1] ?? Infinity);
    if (end > at) total += (end - at) * Math.min(ETHER_MAX, ETHER_FIRST * PHI ** k);
  });
  return total / count;
};

// Candidate quotas per fragment, by bucket.
const QUOTA_OWN = 700; // the fragment's dominant region
const QUOTA_BORDER = 300; // anchors with no clearly dominant region
const QUOTA_OTHER = 60; // each other region, so mixed fragments still find their match
const QUOTA_LIMB = 400;
const QUOTA_SPACE = 150;
const QUOTA_DEEPEN = 200;
const DEEPEN_SPREAD = 0.05; // how strongly deepening prefers the least-deepened nodes

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Placement {
  readonly anchorOf: number[] = []; // fragment index → anchor index (-1 if every anchor is taken)
  private occupied: Uint8Array;
  private nearest: Float32Array;
  private regions: number;
  // Free anchors by bucket: 0..regions-1 by dominant region, then border, limbs, and the void.
  private buckets: number[][];
  private bucketOf: Uint8Array;
  private slot: Int32Array; // where each anchor sits in its bucket, for O(1) removal
  private grid = new Map<number, number[]>();
  private taken: number[][]; // occupied anchors by bucket, for deepening
  private patch: Float32Array; // limb anchors: 0–1, where on the limbs light gathers first
  private stack: Uint16Array; // fragments on each anchor

  constructor(private anchors: Anchors, private genome: Genome) {
    const n = anchors.count;
    this.regions = anchors.regions;
    this.occupied = new Uint8Array(n);
    this.nearest = new Float32Array(n).fill(Infinity);
    this.bucketOf = new Uint8Array(n);
    this.slot = new Int32Array(n);
    const R = this.regions;
    this.buckets = Array.from({ length: R + 3 }, () => []);
    this.taken = Array.from({ length: R + 3 }, () => []);
    this.stack = new Uint16Array(n);
    this.patch = new Float32Array(n);
    const noise = valueNoise(hashString(`${genome.seed}:patches`));
    for (let i = 0; i < n; i++) {
      let b: number;
      if (anchors.layer[i] === SPACE_LAYER) b = R + 2;
      else if (anchors.layer[i] === 0 && (anchors.wild[i] > 0.5 || anchors.reach[i] > LIMB_MIN)) b = R + 1;
      else {
        let top = 0;
        for (let r = 1; r < R; r++) if (anchors.weights[i * R + r] > anchors.weights[i * R + top]) top = r;
        b = anchors.weights[i * R + top] < 0.6 ? R : top;
      }
      this.bucketOf[i] = b;
      if (b === R + 1) {
        const x = anchors.pos[i * 3] / PATCH_SCALE, y = anchors.pos[i * 3 + 1] / PATCH_SCALE, z = anchors.pos[i * 3 + 2] / PATCH_SCALE;
        this.patch[i] = 0.55 * noise(x, y, z) + 0.45 * noise(x * 9.7 + 31, y * 9.7, z * 9.7);
      }
      this.slot[i] = this.buckets[b].length;
      this.buckets[b].push(i);
      const k = this.cell(anchors.pos[i * 3], anchors.pos[i * 3 + 1], anchors.pos[i * 3 + 2]);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(i);
    }
  }

  add(f: Fragment): number {
    const roll = rngFor(`${f.id}:route`);
    const ether = roll() < etherShare(this.anchorOf.length);
    const limb = roll() < LIMB_SHARE * limbRamp(this.anchorOf.length) * (1 - smoothstep(0.3, 0.75, f.intensity));
    const rand = rngFor(f.id);
    const LIMBS = this.regions + 1, VOID = this.regions + 2;
    let best = -1;
    if (ether) best = this.pickSpread(VOID, ETHER_REACH, rand);
    else if (limb) best = this.pickSpread(LIMBS, LIMB_REACH, rand);
    let deepened = false;
    if (best < 0 && !ether) {
      const { fw, own } = this.mixOf(f);
      if (this.buckets[own].length) best = this.pickBody(fw, own, f.intensity, rand);
      else {
        best = this.deepen(fw, own, f.intensity, rand);
        deepened = best >= 0;
      }
    }
    if (best < 0 && !limb) best = this.pickSpread(LIMBS, LIMB_REACH, rand);
    if (best >= 0 && !deepened) this.claim(best);
    if (best >= 0) this.stack[best]++;
    this.anchorOf.push(best);
    return best;
  }

  /** How many fragments sit on this anchor (more than one: it has deepened). */
  depthOf(anchor: number) {
    return this.stack[anchor];
  }

  /** The fragment's sharpened region mix and its dominant region. */
  private mixOf(f: Fragment) {
    const R = this.regions;
    const sharp = f.weights.map((w) => w ** SHARPEN);
    const total = sharp.reduce((a, b) => a + b, 0) || 1;
    const fw = sharp.map((w) => w / total);
    let own = 0;
    for (let r = 1; r < R; r++) if (fw[r] > fw[own]) own = r;
    return { fw, own };
  }

  /** A full region: add to one of its nodes, the best match among the least deepened. */
  private deepen(fw: number[], own: number, intensity: number, rand: () => number): number {
    const list = this.taken[own];
    if (!list.length) return -1;
    const { weights, core } = this.anchors;
    const R = this.regions;
    const pull = CORE_PULL * smoothstep(0.2, 0.55, intensity);
    const n = Math.min(list.length, QUOTA_DEEPEN);
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = list.length === n ? list[k] : list[Math.floor(rand() * list.length)];
      let err = 0;
      for (let r = 0; r < R; r++) err += Math.abs(fw[r] - weights[i * R + r]);
      const s = -err * 0.8 - this.stack[i] * DEEPEN_SPREAD + core[i] * pull + rand() * 0.01;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  /** Limbs and the void: no region to match, so spread out, leaning toward the root (low reach). */
  private pickSpread(bucket: number, reachOrder: number, rand: () => number): number {
    const list = this.buckets[bucket];
    if (!list.length) return -1;
    const { reach } = this.anchors;
    const limbs = bucket === this.regions + 1;
    const n = Math.min(list.length, limbs ? QUOTA_LIMB : QUOTA_SPACE);
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = list.length === n ? list[k] : list[Math.floor(rand() * list.length)];
      // Limbs: the patch first, then spread within it. The void: spread, nearer first.
      const s = limbs
        ? this.patch[i] * PATCH_PULL + Math.min(this.nearest[i], SPREAD_CAP) * 2 - reach[i] * reachOrder + rand() * 0.01
        : Math.min(this.nearest[i], SPREAD_CAP) * 4 - reach[i] * reachOrder + rand() * 0.01;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  /** The head, heart, gut and aura: the best region match, then spread and growth. */
  private pickBody(fw: number[], own: number, intensity: number, rand: () => number): number {
    const { weights, core, depth, angle, mirror, wild, reach } = this.anchors;
    const { occupied, nearest } = this;
    const R = this.regions;

    // A seeded sample of candidates from each bucket.
    const candidates: number[] = [];
    const draw = (b: number, quota: number) => {
      const list = this.buckets[b];
      if (list.length <= quota) candidates.push(...list);
      else for (let k = 0; k < quota; k++) candidates.push(list[Math.floor(rand() * list.length)]);
    };
    for (let b = 0; b < R; b++) draw(b, b === own ? QUOTA_OWN : QUOTA_OTHER);
    draw(R, QUOTA_BORDER);
    if (candidates.length === 0) return -1;

    const err = new Float32Array(candidates.length);
    let minErr = Infinity;
    candidates.forEach((i, c) => {
      let exact = 0;
      for (let r = 0; r < R; r++) exact += Math.abs(fw[r] - weights[i * R + r]);
      // Anchors that belong to no region (the edge of the pelvis) are always exactly
      // their fixed grade of match: never better, never worse.
      err[c] = exact + (WILD_ERR - exact) * wild[i];
      if (err[c] < minErr) minErr = err[c];
    });

    const pull = CORE_PULL * smoothstep(0.2, 0.55, intensity);
    const phase = this.anchorOf.length * 0.05;
    let best = -1;
    let bestScore = -Infinity;
    candidates.forEach((i, c) => {
      if (err[c] > minErr + MATCH_TOLERANCE) return;
      let s = Math.min(nearest[i], SPREAD_CAP) * 4 - err[c] * 0.8 - (1 - core[i]) * pull - reach[i] * REACH_ORDER;
      if (this.genome.growth === "outline") s += GROWTH_BIAS * (1 - depth[i]);
      else if (this.genome.growth === "core") s += GROWTH_BIAS * depth[i];
      else s += GROWTH_BIAS * (0.5 + 0.5 * Math.cos(angle[i] - phase));
      if (mirror[i] >= 0 && occupied[mirror[i]]) s += 0.08 * this.genome.symmetry;
      s += rand() * 0.01;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });

    return best;
  }

  /** Take an anchor and update every nearby anchor's distance to its nearest node. */
  private claim(best: number) {
    const { pos } = this.anchors;
    const { nearest } = this;
    this.take(best);
    const bx = pos[best * 3], by = pos[best * 3 + 1], bz = pos[best * 3 + 2];
    const cx = Math.floor(bx / SPREAD_CAP), cy = Math.floor(by / SPREAD_CAP), cz = Math.floor(bz / SPREAD_CAP);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const j of this.grid.get(this.key(cx + dx, cy + dy, cz + dz)) ?? []) {
            const ex = pos[j * 3] - bx, ey = pos[j * 3 + 1] - by, ez = pos[j * 3 + 2] - bz;
            const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (d < nearest[j]) nearest[j] = d;
          }
  }

  /** Mark an anchor taken and swap it out of its bucket. */
  private take(i: number) {
    this.occupied[i] = 1;
    this.taken[this.bucketOf[i]].push(i);
    const list = this.buckets[this.bucketOf[i]];
    const at = this.slot[i];
    const last = list[list.length - 1];
    list[at] = last;
    this.slot[last] = at;
    list.pop();
  }

  private key(x: number, y: number, z: number) {
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  }

  private cell(x: number, y: number, z: number) {
    return this.key(Math.floor(x / SPREAD_CAP), Math.floor(y / SPREAD_CAP), Math.floor(z / SPREAD_CAP));
  }
}

/** Smooth 3D value noise in 0–1, seeded. */
function valueNoise(seed: number) {
  const lattice = (x: number, y: number, z: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const c = (dx: number, dy: number, dz: number) => lattice(xi + dx, yi + dy, zi + dz);
    return lerp(
      lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
      w,
    );
  };
}
