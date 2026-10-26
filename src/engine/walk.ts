// The walk controller (body mode). PLACEHOLDER for mocap walk clips. With walking on, a journey
// director strings routes together: stand a while, step on the spot, wander, walk a circle, pace,
// and walk back home to the centre to face the viewer. The order is drawn from the genome's seed.
// The shader turns the gait phase into leg swing, knee bend, arm counter-swing and the bob.
// Each leg of the journey also takes a gait, drawn by the person's mood: a purposeful or unhurried
// walk for the mind, drifting for the heart, easy for the gut, gliding or processional for the spirit.

export type Route = "stand" | "spot" | "circle" | "wander" | "pace" | "home" | "levitate";

const LEG_LENGTH = 0.77; // hip to ankle, metres
const RADIUS = 1.1; // circle
const PACE_HALF = 1.3; // half the pacing line
const FENCE = 2.2; // the wanderer turns back past this

// How often each route comes up, and how long it lasts (seconds). "home" ends when it arrives.
// Each route also leans on a region, so the mood shapes the journey: a spirit-heavy person lifts
// off more often, a gut-heavy one wanders, a thinker paces and circles, a heart stands with it.
const ROUTES: { route: Exclude<Route, "home">; weight: number; secs: [number, number]; region: number }[] = [
  { route: "stand", weight: 2, secs: [20, 60], region: 1 },
  { route: "spot", weight: 1.2, secs: [10, 25], region: 2 },
  { route: "wander", weight: 2, secs: [30, 80], region: 2 },
  { route: "circle", weight: 1.2, secs: [20, 50], region: 0 },
  { route: "pace", weight: 1, secs: [20, 40], region: 0 },
  { route: "levitate", weight: 1.2, secs: [30, 70], region: 3 },
];

export interface Gait {
  name: string;
  speed: number; // × ground speed
  stride: number; // × stride
  bob: number; // × the rise and fall
  swing: number; // × the arms' counter-swing
  region: number; // 0 head, 1 heart, 2 gut, 3 spirit
}
const GAITS: Gait[] = [
  { name: "easy", speed: 1, stride: 1, bob: 1, swing: 1, region: 2 },
  { name: "grounded", speed: 0.9, stride: 0.95, bob: 0.8, swing: 0.8, region: 2 },
  { name: "purposeful", speed: 1.2, stride: 1.12, bob: 0.9, swing: 1.1, region: 0 },
  { name: "unhurried", speed: 0.75, stride: 0.85, bob: 0.7, swing: 0.7, region: 0 },
  { name: "drifting", speed: 0.6, stride: 0.75, bob: 0.4, swing: 0.55, region: 1 },
  { name: "tender", speed: 0.7, stride: 0.8, bob: 0.5, swing: 0.4, region: 1 },
  { name: "gliding", speed: 0.85, stride: 0.8, bob: 0.12, swing: 0.3, region: 3 },
  { name: "processional", speed: 0.5, stride: 0.6, bob: 0.3, swing: 0.12, region: 3 },
];
export type WalkMood = [number, number, number, number];

export interface WalkState {
  weight: number; // 0 standing → 1 walking
  phase: number;
  stride: number;
  x: number;
  z: number;
  heading: number; // radians around y; 0 faces +z (the camera)
  air: number; // 0 on the ground → 1 hovering (eases up and down)
  bob: number;
  swing: number;
  gait: string;
}

const wave = (t: number, k: number) => (Math.sin(t * 0.31 + k) + 0.6 * Math.sin(t * 0.73 + k * 2.1) + 0.3 * Math.sin(t * 1.71 + k * 3.7)) / 1.9;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A tiny seeded PRNG so the journey is the genome's own. */
const seeded = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

export class WalkController {
  route: Route = "stand";
  private s: WalkState = { weight: 0, phase: 0, stride: 0.35, x: 0, z: 0, heading: 0, air: 0, bob: 1, swing: 1, gait: "easy" };
  private gait: Gait = GAITS[0];
  private mood: WalkMood = [0.25, 0.25, 0.25, 0.25];
  private until = 0;
  private legs = 0; // how many routes so far, for the seed
  private angle = 0; // circle position
  private paceDir = 1;
  private turning = 0; // seconds left in a pacing turn
  private pauseUntil = 0;

  constructor(private seed: string) {}

  reset() {
    this.s = { weight: 0, phase: 0, stride: 0.35, x: 0, z: 0, heading: 0, air: 0, bob: 1, swing: 1, gait: "easy" };
    this.gait = GAITS[0];
    this.route = "stand";
    this.until = 0;
  }

  step(dt: number, t: number, walking: boolean, levitate = false, mood?: WalkMood): WalkState {
    if (mood) this.mood = mood;
    let route: Route;
    if (levitate) route = "levitate";
    else if (!walking) {
      this.route = "stand";
      this.until = t; // when walking switches on, the journey starts straight away
      route = "stand";
    } else {
      if (t >= this.until) this.next(t);
      route = this.route;
    }
    if (levitate) this.route = "levitate";
    // Rise into the air over a few seconds; settle back down the same way.
    this.s.air += ((route === "levitate" ? 1 : 0) - this.s.air) * Math.min(1, dt * 0.8);
    return this.move(dt, t, route);
  }

  /** Pick the next route. After a long way out, the walker often heads home first. */
  private next(t: number) {
    const r = seeded(`${this.seed}:journey:${this.legs++}`);
    const away = Math.hypot(this.s.x, this.s.z) > 0.4;
    if (away && this.route !== "home" && r() < 0.5) {
      this.route = "home";
      this.until = Infinity;
      return;
    }
    const options = ROUTES.filter((o) => o.route !== this.route);
    const weightOf = (o: (typeof ROUTES)[number]) => o.weight * (0.4 + 2.4 * this.mood[o.region]);
    let roll = r() * options.reduce((s, o) => s + weightOf(o), 0);
    let pick = options[0];
    for (const o of options) {
      roll -= weightOf(o);
      if (roll <= 0) {
        pick = o;
        break;
      }
    }
    this.route = pick.route;
    this.until = t + pick.secs[0] + r() * (pick.secs[1] - pick.secs[0]);
    // A new stretch, a new way of walking.
    const gw = GAITS.map((g) => 0.3 + 2.8 * this.mood[g.region]);
    let groll = r() * gw.reduce((a, b) => a + b, 0);
    this.gait = GAITS.find((_, i) => (groll -= gw[i]) <= 0) ?? GAITS[0];
    if (pick.route === "circle") this.angle = Math.atan2(this.s.z, this.s.x) || 0;
    if (pick.route === "pace") this.paceDir = this.s.x > 0 ? -1 : 1;
  }

  private move(dt0: number, t: number, route: Route): WalkState {
    const s = this.s;
    // The gait's pace: positions advance on a scaled clock; turning and easing keep real time.
    const dt = dt0 * this.gait.speed;
    let speed = 0; // metres per second along the ground
    let stride = 0.35; // thigh swing, radians
    let moving = route !== "stand" && route !== "levitate";

    if (route === "spot") {
      stride = 0.22;
    } else if (route === "circle") {
      speed = 0.55;
      this.angle += (speed / RADIUS) * dt;
      const tx = RADIUS * Math.cos(this.angle), tz = RADIUS * Math.sin(this.angle);
      // Ease onto the circle from wherever the figure was.
      s.x += (tx - s.x) * Math.min(1, dt * 1.5);
      s.z += (tz - s.z) * Math.min(1, dt * 1.5);
      this.turnToward(Math.atan2(-Math.sin(this.angle), Math.cos(this.angle)), dt, 2.5);
    } else if (route === "wander") {
      // Speed drifts, and now and then the wanderer stops to stand a while.
      if (t < this.pauseUntil) moving = false;
      else if (wave(t * 0.07, 11) > 0.62) this.pauseUntil = t + 4 + 6 * (0.5 + 0.5 * wave(t, 3));
      speed = moving ? 0.35 + 0.25 * (0.5 + 0.5 * wave(t * 0.2, 5)) : 0;
      stride = 0.25 + 0.15 * (speed / 0.6);
      let target = s.heading + wave(t * 0.15, 7) * 0.9;
      if (Math.hypot(s.x, s.z) > FENCE) target = Math.atan2(-s.x, -s.z); // head back toward the middle
      this.turnToward(target, dt, 0.8);
      s.x += Math.sin(s.heading) * speed * dt * s.weight;
      s.z += Math.cos(s.heading) * speed * dt * s.weight;
    } else if (route === "pace") {
      if (this.turning > 0) {
        // Turn on the spot at the end of the line, with small steps.
        this.turning -= dt;
        stride = 0.15;
        this.turnToward(this.paceDir > 0 ? Math.PI / 2 : -Math.PI / 2, dt, 2.2);
      } else {
        speed = 0.5;
        s.x += this.paceDir * speed * dt;
        s.z += (0 - s.z) * Math.min(1, dt);
        this.turnToward(this.paceDir > 0 ? Math.PI / 2 : -Math.PI / 2, dt, 3);
        if (Math.abs(s.x) > PACE_HALF && Math.sign(s.x) === this.paceDir) {
          this.paceDir *= -1;
          this.turning = 1.6;
        }
      }
    } else if (route === "home") {
      const dist = Math.hypot(s.x, s.z);
      if (dist > 0.08) {
        speed = Math.min(0.45, 0.2 + dist * 0.5);
        this.turnToward(Math.atan2(-s.x, -s.z), dt, 2.5);
        s.x += Math.sin(s.heading) * speed * dt * s.weight;
        s.z += Math.cos(s.heading) * speed * dt * s.weight;
      } else {
        // Home: turn to face the viewer with small steps, then stand.
        stride = 0.15;
        this.turnToward(0, dt, 2);
        if (Math.abs(wrap(s.heading)) < 0.05) {
          this.route = "stand";
          this.until = t + 15 + 25 * Math.abs(wave(t, 9)); // a long stand once home
        }
      }
    }

    // Ease in and out of walking; the gait keeps cycling while it eases. The gait's character eases
    // in too, so a change of walk never jolts.
    s.weight += ((moving ? 1 : 0) - s.weight) * Math.min(1, dt0 * 2.5);
    s.stride += (stride * this.gait.stride - s.stride) * Math.min(1, dt0 * 2);
    s.bob += (this.gait.bob - s.bob) * Math.min(1, dt0);
    s.swing += (this.gait.swing - s.swing) * Math.min(1, dt0);
    s.gait = this.gait.name;
    // Cadence follows ground speed (one gait cycle covers about four leg-lengths × sin(stride)).
    // Stepping on the spot, and turning, keep an easy rhythm.
    const cycle = 4 * LEG_LENGTH * Math.sin(s.stride);
    const cadence = speed > 0 ? speed / cycle : 0.75;
    s.phase += 2 * Math.PI * cadence * dt * s.weight; // dt is the gait's clock, so cadence follows its pace
    return { ...s };
  }

  private turnToward(target: number, dt: number, rate: number) {
    this.s.heading += wrap(target - this.s.heading) * Math.min(1, dt * rate);
  }
}
