// Fragments: the data unit. Until capture exists, the Simulator fakes a
// conversation's worth of them so the body has something to grow from.
import { rngFor } from "./rng";

/** The simulated person Legend opens with (and the Experiment panel starts from). */
export const DEFAULT_SIM = { seed: "sim-1", counts: [1500, 1500, 1500, 500] as [number, number, number, number], replaySeconds: 40 };

export interface Fragment {
  id: string;
  t: number; // seconds into the replay
  at?: number; // when it was said, seconds since the epoch: the timeline's clock
  weights: [head: number, heart: number, gut: number, spirit: number];
  intensity: number; // 0–1
  topic: number;
}

/**
 * How much the simulated person has said, per region. Each slider *adds* fragments, the way real
 * conversation would: raising head from 2,000 to 3,000 keeps every existing fragment and adds
 * 1,000 more head fragments, scattered through the same timeline.
 */
export interface SimParams {
  seed: string;
  counts: [head: number, heart: number, gut: number, spirit: number];
  replaySeconds: number;
}

export const simTotal = (p: SimParams) => p.counts.reduce((a, b) => a + b, 0);

// Topic ranges per region, so shared-topic edges mostly stay inside a region.
const TOPIC_RANGES: [number, number][] = [
  [0, 24],
  [24, 40],
  [40, 48],
  [48, 56],
];

export class Simulator {
  private live: () => number;
  private extra = [0, 0, 0, 0]; // live fragments added past the counts, per region

  constructor(private params: SimParams) {
    this.live = rngFor(`${params.seed}:live`);
  }

  /** The k-th fragment of a region. Each has its own seed, so it never changes as others are added. */
  private make(region: number, k: number): { f: Fragment; at: number } {
    const r = rngFor(`${this.params.seed}:${region}:${k}`);
    const w: [number, number, number, number] = [0, 0, 0, 0];
    const others = [0, 1, 2, 3].filter((x) => x !== region);
    if (r() < 0.2) {
      // A blended fragment: two regions share the weight, so it lands on a border.
      const other = others[Math.floor(r() * others.length)];
      const split = 0.35 + r() * 0.3;
      w[region] = split;
      w[other] = (1 - split) * 0.9;
      for (const x of others) if (x !== other) w[x] = ((1 - split) * 0.1) / 2;
    } else {
      // Mostly one region; the rest spreads thinly over the others.
      const main = 0.55 + r() * 0.4;
      const parts = others.map(() => r());
      const sum = parts.reduce((a, b) => a + b, 0) || 1;
      w[region] = main;
      others.forEach((x, j) => (w[x] = ((1 - main) * parts[j]) / sum));
    }
    const [lo, hi] = TOPIC_RANGES[region];
    const topic = lo + Math.floor((hi - lo) * r() ** 2.2); // a few topics recur a lot
    const intensity = r() ** 1.6;
    const at = r(); // where in the conversation it was said, 0–1
    return { f: { id: `${this.params.seed}:${region}:${k}`, t: 0, weights: w, intensity, topic }, at };
  }

  /** The whole history so far, in the order it was said, accelerating so the body visibly takes shape. */
  history(): Fragment[] {
    const all: { f: Fragment; at: number }[] = [];
    this.params.counts.forEach((n, region) => {
      for (let k = 0; k < n; k++) all.push(this.make(region, k));
    });
    all.sort((a, b) => a.at - b.at);
    const N = all.length;
    const { replaySeconds } = this.params;
    return all.map(({ f }, i) => ({ ...f, t: replaySeconds * (i / Math.max(N, 1)) ** 0.8 }));
  }

  /** One more fragment, live: a region picked in proportion to how the person talks. */
  next(t: number): Fragment {
    const counts = this.params.counts;
    const weights = counts.some((n) => n > 0) ? counts : [1, 1, 1, 1];
    let roll = this.live() * weights.reduce((x, y) => x + y, 0);
    let region = 0;
    while (region < 3 && roll >= weights[region]) roll -= weights[region++];
    const { f } = this.make(region, counts[region] + this.extra[region]++);
    return { ...f, t };
  }
}
