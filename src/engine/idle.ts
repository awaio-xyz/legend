// The idle choreographer. PLACEHOLDER for rigged idle clips: a library of slow, open moves (long
// looks over a shoulder and up at an angle, a bowed head, palms opening, a hand to the heart, arms
// lifting like wings, a reach toward the light, weight shifts), sequenced with long holds and
// unhurried turns. No fidgets or chores: it should read as contemplative, not as an NPC.
//
// The idle preset is your style: the tempo, how long holds last. Which moves play is the data's:
// each move belongs to a region, and the person's mood (mostly their recent fragments, with their
// whole Legend underneath) weights the draw. Live fragments also get a reaction: the head turns
// toward where they landed, then a short move in their region answers. Each hour gets a fresh order, drawn from the
// genome's seed, so the body never visibly loops. The idle preset is the temperament: which moves
// it favours and how long it lingers.
import { rngFor } from "./rng";

export type Idle = "calm" | "watchful" | "contemplative" | "restless";

export interface Pose {
  yaw: number; // head turn, radians
  pitch: number; // head nod, positive looks down
  roll: number; // head tilt toward a shoulder
  shoulderL: number; // shoulder lift, 0–1 (the person's left, +x)
  shoulderR: number;
  armL: number; // arm swing toward the chest, radians
  armR: number;
  lean: number; // weight shift, metres at the crown
  bodyYaw: number; // whole-body turn from the hips
  bodyPitch: number; // lean in (positive) or back
  flexL: number; // arm raised forward and up
  flexR: number;
  abdL: number; // arm out to the side
  abdR: number;
  elbowL: number; // elbow bend
  elbowR: number;
  legFlexL: number; // leg raised forward at the hip
  legFlexR: number;
  legAbdL: number; // leg out to the side
  legAbdR: number;
  legTwistL: number; // leg turned out, for lotus
  legTwistR: number;
  kneeL: number;
  kneeR: number;
  point: number; // feet pointed down
}

const REST: Pose = {
  yaw: 0, pitch: 0, roll: 0, shoulderL: 0, shoulderR: 0, armL: 0.03, armR: 0.03, lean: 0, bodyYaw: 0, bodyPitch: 0,
  flexL: 0, flexR: 0, abdL: 0, abdR: 0, elbowL: 0.08, elbowR: 0.08,
  legFlexL: 0, legFlexR: 0, legAbdL: 0, legAbdR: 0, legTwistL: 0, legTwistR: 0, kneeL: 0, kneeR: 0, point: 0,
};
// Hovering: feet pointed, knees soft.
const AIR_REST: Pose = { ...REST, point: 0.75, kneeL: 0.12, kneeR: 0.12 };

type Weights = Record<Idle, number>;
/** A slow undulation during a hold: wings breathing, hands floating, a sway. */
interface Fidget {
  keys: (keyof Pose)[];
  amp: number;
  freq: number; // radians per second
  signs?: number[]; // per key: -1 moves against the others (one hand rises as the other falls)
}
interface Move {
  name: string;
  pose: (r: () => number) => Partial<Pose> & { fidget?: Fidget };
  hold: [number, number]; // seconds
  turn: [number, number]; // transition seconds
  weight: Weights;
  region?: number; // 0 head, 1 heart, 2 gut, 3 spirit (see REGION_OF for the older moves)
}
/** Weights by temperament: calm, watchful, contemplative, restless. */
const W = (calm: number, watchful: number, contemplative: number, restless: number): Weights => ({ calm, watchful, contemplative, restless });

const side = (r: () => number) => (r() < 0.5 ? -1 : 1);
/** One arm's gesture, on the person's left (+1) or right (-1). */
const arm = (s: number, g: { flex?: number; abd?: number; elbow?: number; inward?: number }): Partial<Pose> =>
  s > 0
    ? { flexL: g.flex ?? 0, abdL: g.abd ?? 0, elbowL: g.elbow ?? 0.08, armL: g.inward ?? 0.03 }
    : { flexR: g.flex ?? 0, abdR: g.abd ?? 0, elbowR: g.elbow ?? 0.08, armR: g.inward ?? 0.03 };
const L = (s: number) => (s > 0 ? "L" : "R");
const both = (g: { flex?: number; abd?: number; elbow?: number; inward?: number }) => ({ ...arm(1, g), ...arm(-1, g) });

const MOVES: Move[] = [
  { name: "rest", pose: () => ({}), hold: [3, 10], turn: [1, 2.5], weight: { calm: 4, watchful: 2, contemplative: 3, restless: 1 } },
  {
    name: "glance",
    pose: (r) => ({ yaw: side(r) * (0.3 + 0.3 * r()), pitch: -0.05 + 0.1 * r() }),
    hold: [1.5, 4],
    turn: [0.9, 1.6],
    weight: { calm: 0.8, watchful: 2.5, contemplative: 0.4, restless: 1.5 },
  },
  {
    name: "over the shoulder",
    pose: (r) => {
      const s = side(r);
      return { yaw: s * (0.8 + 0.2 * r()), pitch: 0.05 * r(), roll: s * 0.06, shoulderL: s > 0 ? 0.3 : 0, shoulderR: s < 0 ? 0.3 : 0 };
    },
    hold: [6, 16],
    turn: [1.2, 2.5],
    weight: { calm: 1, watchful: 1.5, contemplative: 1, restless: 1 },
  },
  {
    name: "up at an angle",
    pose: (r) => ({ yaw: (r() - 0.5) * 0.7, pitch: -(0.3 + 0.2 * r()), roll: (r() - 0.5) * 0.1 }),
    hold: [5, 14],
    turn: [1.2, 2.4],
    weight: { calm: 2, watchful: 1, contemplative: 1.5, restless: 0.5 },
  },
  {
    name: "look down",
    pose: (r) => ({ yaw: (r() - 0.5) * 0.3, pitch: 0.3 + 0.2 * r(), armL: 0.1, armR: 0.1 }),
    hold: [5, 16],
    turn: [1.4, 2.8],
    weight: { calm: 1.5, watchful: 0.5, contemplative: 4, restless: 0.5 },
  },
  {
    name: "tilt",
    pose: (r) => ({ roll: side(r) * (0.1 + 0.08 * r()), yaw: (r() - 0.5) * 0.2 }),
    hold: [2, 6],
    turn: [0.8, 1.6],
    weight: { calm: 1, watchful: 1, contemplative: 1.5, restless: 1 },
  },
  {
    name: "arms in",
    pose: (r) => ({ armL: 0.18 + 0.1 * r(), armR: 0.18 + 0.1 * r() }),
    hold: [5, 14],
    turn: [1.5, 3],
    weight: { calm: 1, watchful: 0.5, contemplative: 2, restless: 1 },
  },
  {
    name: "turn",
    pose: (r) => {
      const s = side(r);
      return { bodyYaw: s * (0.15 + 0.12 * r()), yaw: s * (0.15 + 0.15 * r()), lean: s * 0.006 }; // the head leads the turn
    },
    hold: [5, 12],
    turn: [1.8, 3.2],
    weight: { calm: 1, watchful: 1.2, contemplative: 0.8, restless: 1.2 },
  },
  {
    name: "lean in",
    pose: (r) => ({ bodyPitch: 0.07 + 0.04 * r(), pitch: -0.12, armL: 0.12, armR: 0.12 }), // head lifts to keep looking ahead
    hold: [4, 10],
    turn: [1.5, 2.6],
    weight: { calm: 0.8, watchful: 1, contemplative: 1.5, restless: 0.8 },
  },
  {
    name: "stretch",
    pose: (r) => ({ bodyPitch: -0.05, pitch: -0.3 - 0.1 * r(), shoulderL: 0.5, shoulderR: 0.5 }),
    hold: [1.5, 3],
    turn: [1.2, 2],
    weight: { calm: 0.5, watchful: 0.4, contemplative: 0.5, restless: 1.2 },
  },
  {
    name: "hand to chin",
    pose: (r) => ({ ...arm(side(r), { flex: 1.2, elbow: 2.4, inward: 0.35 }), pitch: 0.08 }),
    hold: [3, 8],
    turn: [0.8, 1.4],
    weight: { calm: 0.5, watchful: 0.3, contemplative: 1.5, restless: 0.5 },
  },
  // Contemplative and open: slow to arrive, long to hold.
  {
    name: "bow",
    pose: (r) => ({ pitch: 0.42 + 0.1 * r(), bodyPitch: 0.06, ...both({ inward: 0.12, elbow: 0.2 }) }),
    hold: [6, 14],
    turn: [2.5, 4],
    weight: { calm: 1, watchful: 0.3, contemplative: 3, restless: 0.4 },
  },
  {
    name: "gaze upward",
    pose: (r) => ({ pitch: -(0.45 + 0.15 * r()), yaw: (r() - 0.5) * 0.3, bodyPitch: -0.04, ...both({ abd: 0.28, elbow: 0.15 }) }),
    hold: [6, 14],
    turn: [2.5, 4],
    weight: { calm: 1.5, watchful: 0.8, contemplative: 2.5, restless: 0.6 },
  },
  {
    name: "open palms",
    pose: (r) => ({ ...both({ flex: 0.35 + 0.15 * r(), abd: 0.35, elbow: 0.45, inward: -0.05 }), pitch: -0.12, roll: (r() - 0.5) * 0.1 }),
    hold: [6, 14],
    turn: [2.5, 3.8],
    weight: { calm: 2, watchful: 0.8, contemplative: 1.5, restless: 0.8 },
  },
  {
    name: "hand over heart",
    pose: () => ({ ...arm(1, { flex: 0.75, elbow: 1.95, inward: 0.6 }), pitch: 0.22, roll: -0.05 }),
    hold: [6, 14],
    turn: [2.2, 3.4],
    weight: { calm: 1.5, watchful: 0.4, contemplative: 2.5, restless: 0.5 },
  },
  {
    name: "self embrace",
    pose: () => ({ ...both({ flex: 0.95, elbow: 2.15, inward: 0.9 }), pitch: 0.25, shoulderL: 0.2, shoulderR: 0.2 }),
    hold: [5, 12],
    turn: [2.5, 3.6],
    weight: { calm: 0.8, watchful: 0.3, contemplative: 1.8, restless: 0.5 },
  },
  {
    name: "wings",
    pose: (r) => ({ ...both({ abd: 1.35 + 0.15 * r(), flex: 0.15, elbow: 0.3 }), pitch: -0.18, fidget: { keys: ["abdL", "abdR"], amp: 0.07, freq: 0.7 } }),
    hold: [6, 14],
    turn: [3, 4.5],
    weight: { calm: 1, watchful: 0.6, contemplative: 1, restless: 1 },
  },
  {
    name: "reach toward the light",
    pose: (r) => {
      const s = side(r);
      return { ...arm(s, { flex: 2.5 + 0.3 * r(), abd: 0.3, elbow: 0.25 }), pitch: -0.4, yaw: s * 0.12, lean: -s * 0.006 };
    },
    hold: [4, 10],
    turn: [3, 4.5],
    weight: { calm: 0.8, watchful: 0.6, contemplative: 1.2, restless: 1.2 },
  },
  {
    name: "unfurl",
    pose: () => ({ ...both({ flex: 1.5, abd: 0.85, elbow: 0.35 }), pitch: -0.3, bodyPitch: -0.03 }),
    hold: [4, 9],
    turn: [3.5, 5],
    weight: { calm: 0.8, watchful: 0.5, contemplative: 1, restless: 1 },
  },
  {
    name: "floating hands",
    pose: () => ({ ...both({ abd: 0.5, flex: 0.2, elbow: 0.5 }), pitch: 0.08, fidget: { keys: ["abdL", "abdR", "flexL", "flexR"], amp: 0.12, freq: 0.55 } }),
    hold: [8, 16],
    turn: [2.5, 3.5],
    weight: { calm: 1.5, watchful: 0.5, contemplative: 1.2, restless: 1 },
  },
  {
    name: "sway",
    pose: (r) => ({ ...both({ abd: 0.12, elbow: 0.2 }), pitch: (r() - 0.5) * 0.2, fidget: { keys: ["bodyYaw", "roll"], amp: 0.08, freq: 0.45 } }),
    hold: [8, 18],
    turn: [2, 3],
    weight: { calm: 1.2, watchful: 0.6, contemplative: 1, restless: 1.2 },
  },
  // The mind: still, inward, considering.
  { name: "listening", region: 0, pose: (r) => ({ roll: side(r) * 0.16, pitch: 0.12, ...both({ inward: 0.15, elbow: 0.25 }) }), hold: [6, 14], turn: [2.5, 3.5], weight: W(1, 1.2, 1.5, 0.6) },
  {
    name: "steepled fingers",
    region: 0,
    pose: () => ({ ...both({ flex: 0.85, abd: 0.08, elbow: 1.95, inward: 0.72 }), pitch: 0.12 }),
    hold: [6, 14],
    turn: [2.5, 3.5],
    weight: W(0.8, 0.8, 1.8, 0.5),
  },
  {
    name: "tracing a thought",
    region: 0,
    pose: (r) => {
      const s = side(r);
      return { ...arm(s, { flex: 0.75, abd: 0.25, elbow: 1.3, inward: 0.25 }), pitch: 0.32, yaw: s * 0.18, fidget: { keys: [`flex${L(s)}` as keyof Pose, `abd${L(s)}` as keyof Pose], amp: 0.1, freq: 0.5, signs: [1, -1] } };
    },
    hold: [6, 12],
    turn: [2.5, 3.5],
    weight: W(0.8, 0.8, 1.5, 1),
  },
  { name: "far horizon", region: 0, pose: (r) => { const s = side(r); return { yaw: s * (0.45 + 0.2 * r()), pitch: -0.06, bodyYaw: s * 0.1, ...both({ inward: 0.08, elbow: 0.15 }) }; }, hold: [8, 16], turn: [3, 4], weight: W(1, 1.5, 1, 0.8) },
  {
    name: "weighing",
    region: 0,
    pose: () => ({ ...both({ flex: 0.55, abd: 0.25, elbow: 1.2, inward: 0.1 }), pitch: 0.2, fidget: { keys: ["flexL", "flexR"], amp: 0.12, freq: 0.6, signs: [1, -1] } }),
    hold: [5, 10],
    turn: [2.5, 3.5],
    weight: W(0.6, 0.8, 1.2, 1),
  },
  // The heart: open, holding, giving.
  {
    name: "cradle",
    region: 1,
    pose: () => ({ ...both({ flex: 0.6, abd: 0.18, elbow: 1.45, inward: 0.5 }), pitch: 0.34, roll: 0.06 }),
    hold: [6, 14],
    turn: [2.5, 3.8],
    weight: W(1, 0.4, 1.6, 0.6),
  },
  { name: "offering", region: 1, pose: () => ({ ...both({ flex: 0.95, abd: 0.2, elbow: 0.4, inward: 0.05 }), pitch: -0.04 }), hold: [5, 11], turn: [3, 4.2], weight: W(1.2, 0.5, 1.2, 0.8) },
  { name: "heart open", region: 1, pose: () => ({ ...both({ abd: 0.3, elbow: 0.2, inward: -0.12 }), bodyPitch: -0.06, pitch: -0.22, shoulderL: 0.15, shoulderR: 0.15 }), hold: [6, 12], turn: [3, 4], weight: W(1.2, 0.6, 1, 0.8) },
  {
    name: "both hands to heart",
    region: 1,
    pose: () => ({ ...arm(1, { flex: 0.75, elbow: 1.95, inward: 0.62 }), ...arm(-1, { flex: 0.7, elbow: 1.85, inward: 0.85 }), pitch: 0.28 }),
    hold: [6, 14],
    turn: [2.5, 3.5],
    weight: W(1.2, 0.4, 2, 0.5),
  },
  {
    name: "letting go",
    region: 1,
    pose: () => ({ ...both({ abd: 0.65, elbow: 0.35, flex: 0.1 }), pitch: 0.24, fidget: { keys: ["abdL", "abdR"], amp: -0.08, freq: 0.4 } }),
    hold: [6, 12],
    turn: [3.5, 5],
    weight: W(1, 0.5, 1.2, 0.8),
  },
  // The gut: grounded, sure, present.
  { name: "grounding", region: 2, pose: () => ({ kneeL: 0.18, kneeR: 0.18, pitch: 0.14, ...both({ abd: 0.12, elbow: 0.15 }) }), hold: [6, 14], turn: [2.5, 3.5], weight: W(1.4, 0.8, 1, 1) },
  {
    name: "centred",
    region: 2,
    pose: () => ({ ...both({ flex: 0.25, abd: 0.05, elbow: 0.95, inward: 0.72 }), pitch: 0.18 }),
    hold: [8, 16],
    turn: [2.5, 3.5],
    weight: W(1.4, 0.6, 1.4, 0.6),
  },
  {
    name: "sensing the air",
    region: 2,
    pose: (r) => ({ ...both({ abd: 0.42, flex: 0.12, elbow: 0.25 }), yaw: side(r) * 0.35, pitch: 0.05, fidget: { keys: ["abdL", "abdR"], amp: 0.06, freq: 0.8 } }),
    hold: [6, 12],
    turn: [2.5, 3.5],
    weight: W(1, 1.4, 0.8, 1.2),
  },
  { name: "squared", region: 2, pose: () => ({ shoulderL: 0.1, shoulderR: 0.1, bodyPitch: -0.03, pitch: -0.05, ...both({ abd: 0.1, elbow: 0.12 }) }), hold: [6, 12], turn: [2, 3], weight: W(0.8, 1.5, 0.6, 1.2) },
  // The spirit: lifted, reaching, beyond.
  {
    name: "halo",
    region: 3,
    pose: () => ({ ...both({ flex: 2.65, abd: 0.6, elbow: 1.25, inward: 0.3 }), pitch: -0.12 }),
    hold: [5, 10],
    turn: [3.5, 5],
    weight: W(0.8, 0.5, 1, 1),
  },
  { name: "ascend", region: 3, pose: () => ({ ...both({ flex: 2.9, abd: 0.45, elbow: 0.15 }), pitch: -0.45, shoulderL: 0.3, shoulderR: 0.3 }), hold: [4, 9], turn: [4, 5.5], weight: W(0.7, 0.5, 1, 1.1) },
  { name: "blessing", region: 3, pose: (r) => ({ ...arm(side(r), { flex: 1.3, abd: 0.2, elbow: 0.6 }), pitch: -0.05 }), hold: [5, 10], turn: [3, 4], weight: W(0.9, 0.6, 1.2, 0.8) },
  { name: "surrender", region: 3, pose: () => ({ ...both({ abd: 0.32, elbow: 0.12, inward: -0.18 }), pitch: -0.36, bodyPitch: -0.04 }), hold: [6, 12], turn: [3, 4.5], weight: W(1, 0.5, 1.4, 0.7) },
  {
    name: "drifting wings",
    region: 3,
    pose: () => ({ ...both({ abd: 1.1, flex: 0.35, elbow: 0.4 }), pitch: -0.15, fidget: { keys: ["abdL", "abdR", "flexL", "flexR"], amp: 0.12, freq: 0.5, signs: [1, -1, -1, 1] } }),
    hold: [6, 14],
    turn: [3.5, 5],
    weight: W(0.9, 0.6, 1, 1.1),
  },
  {
    name: "weight shift",
    pose: (r) => ({ lean: side(r) * (0.01 + 0.01 * r()) }),
    hold: [6, 15],
    turn: [1.5, 3],
    weight: { calm: 1.5, watchful: 1, contemplative: 1, restless: 1.5 },
  },
];

// Temperament: how long each idle lingers, how fast it moves, how big the moves are.
const TEMPER: Record<Idle, { hold: number; turn: number; amp: number }> = {
  calm: { hold: 1.3, turn: 1.5, amp: 0.8 },
  watchful: { hold: 0.9, turn: 0.9, amp: 1 },
  contemplative: { hold: 1.6, turn: 1.8, amp: 0.9 },
  restless: { hold: 0.55, turn: 0.6, amp: 1.15 },
};

// Which region each move speaks for: 0 head, 1 heart, 2 gut, 3 spirit. Unlisted moves are neutral.
const REGION_OF: Record<string, number> = {
  "hand to chin": 0, "look down": 0, "lean in": 0, "up at an angle": 0, tilt: 0,
  "hand over heart": 1, "open palms": 1, "self embrace": 1, "floating hands": 1, "arms in": 1,
  turn: 2, "weight shift": 2, "over the shoulder": 2, glance: 2, stretch: 2,
  "gaze upward": 3, wings: 3, "reach toward the light": 3, unfurl: 3, bow: 3,
};
export type Mood = [head: number, heart: number, gut: number, spirit: number];
/** How much a move's region is favoured: a region at a quarter of the mood plays at its base rate. */
const regionOf = (m: Move) => m.region ?? REGION_OF[m.name];
const moodGain = (m: Move, mood: Mood) => {
  const r = regionOf(m);
  return r === undefined ? 1 : 0.3 + 2.8 * mood[r];
};
// Arms and head back to rest before a reaction's move, so it doesn't inherit a half-gesture.
const UPPER_REST: Partial<Pose> = { yaw: 0, pitch: 0, roll: 0, shoulderL: 0, shoulderR: 0, armL: 0.03, armR: 0.03, flexL: 0, flexR: 0, abdL: 0, abdR: 0, elbowL: 0.08, elbowR: 0.08 };

/** One leg's pose, on the person's left (+1) or right (-1). */
const leg = (s: number, g: { flex?: number; abd?: number; twist?: number; knee?: number }): Partial<Pose> =>
  s > 0
    ? { legFlexL: g.flex ?? 0, legAbdL: g.abd ?? 0, legTwistL: g.twist ?? 0, kneeL: g.knee ?? 0.12 }
    : { legFlexR: g.flex ?? 0, legAbdR: g.abd ?? 0, legTwistR: g.twist ?? 0, kneeR: g.knee ?? 0.12 };
const lotus: Partial<Pose> = { ...leg(1, { flex: 1.45, abd: 0.55, twist: 0.9, knee: 2.6 }), ...leg(-1, { flex: 1.45, abd: 0.55, twist: 0.9, knee: 2.6 }) };

// Levitation: the figure hovers, feet pointed, balancing and holding poses in the air.
const AIR_MOVES: Move[] = [
  { name: "hover", pose: (r) => ({ ...leg(side(r), { knee: 0.25 }), pitch: (r() - 0.5) * 0.2 }), hold: [5, 12], turn: [1.5, 2.5], weight: { calm: 3, watchful: 2, contemplative: 2, restless: 1.5 } },
  {
    name: "balance on the air",
    pose: (r) => {
      const s = side(r);
      return { ...leg(s, { flex: 0.35 + 0.2 * r(), abd: 0.2 + 0.15 * r(), knee: 0.5 }), ...arm(-s, { abd: 0.5 }), ...arm(s, { abd: 0.35 }), roll: s * 0.05 };
    },
    hold: [4, 9],
    turn: [1.5, 2.5],
    weight: { calm: 1.5, watchful: 2, contemplative: 1, restless: 2 },
  },
  { name: "legs apart", pose: (r) => ({ ...leg(1, { abd: 0.2 + 0.1 * r() }), ...leg(-1, { abd: 0.2 + 0.1 * r() }) }), hold: [4, 9], turn: [1.5, 2.5], weight: { calm: 1, watchful: 1, contemplative: 1, restless: 1.5 } },
  { name: "arms wide", pose: () => ({ ...both({ abd: 1.4, elbow: 0.15 }), pitch: -0.25 }), hold: [5, 12], turn: [2, 3], weight: { calm: 1.2, watchful: 1, contemplative: 1.2, restless: 1 } },
  { name: "arms above", pose: () => ({ ...both({ flex: 2.9, abd: 0.25, elbow: 0.35, inward: 0.15 }), pitch: -0.2 }), hold: [4, 10], turn: [2, 3], weight: { calm: 1, watchful: 0.8, contemplative: 1.2, restless: 1 } },
  { name: "hands at heart", pose: () => ({ ...both({ flex: 0.75, elbow: 1.75, inward: 0.6 }), pitch: 0.15 }), hold: [6, 14], turn: [2, 3], weight: { calm: 1.5, watchful: 0.8, contemplative: 2, restless: 0.6 } },
  {
    name: "floating lotus",
    pose: () => ({ ...lotus, ...both({ flex: 0.45, elbow: 1.2, inward: 0.3 }), point: 0.3, pitch: 0.12 }),
    hold: [15, 40],
    turn: [3, 4.5],
    weight: { calm: 1.5, watchful: 0.6, contemplative: 2.5, restless: 0.4 },
  },
  { name: "suspended", region: 3, pose: () => ({ ...both({ abd: 0.9, elbow: 0.3, flex: -0.1 }), bodyPitch: -0.08, pitch: -0.4, ...leg(1, { knee: 0.3 }), ...leg(-1, { knee: 0.15 }) }), hold: [6, 14], turn: [3, 4.5], weight: W(1.2, 0.8, 1.2, 1) },
  {
    name: "falling upward",
    region: 3,
    pose: () => ({ ...both({ abd: 0.35, elbow: 0.15, inward: -0.2 }), pitch: -0.5, ...leg(1, { flex: -0.15, knee: 0.4 }), ...leg(-1, { flex: -0.05, knee: 0.25 }), point: 0.9 }),
    hold: [6, 12],
    turn: [3, 4.5],
    weight: W(1, 0.8, 1.2, 1),
  },
  {
    name: "held knees",
    region: 1,
    pose: () => ({ ...leg(1, { flex: 1.35, knee: 2.3, abd: 0.08 }), ...leg(-1, { flex: 1.35, knee: 2.3, abd: 0.08 }), ...both({ flex: 0.9, elbow: 1.3, inward: 0.55 }), pitch: 0.3, point: 0.4 }),
    hold: [10, 24],
    turn: [3, 4.5],
    weight: W(1, 0.5, 1.8, 0.5),
  },
  { name: "kneeling on air", region: 2, pose: () => ({ ...leg(1, { flex: 0.1, knee: 1.9 }), ...leg(-1, { flex: 0.1, knee: 1.9 }), ...both({ flex: 0.3, elbow: 0.9, inward: 0.6 }), pitch: 0.25, point: 0.6 }), hold: [8, 18], turn: [3, 4], weight: W(1, 0.6, 1.6, 0.5) },
  {
    name: "arabesque",
    region: 3,
    pose: (r) => {
      const s = side(r);
      return { ...leg(s, { flex: -0.55, knee: 0.1 }), ...leg(-s, { knee: 0.25 }), ...arm(-s, { flex: 1.9, abd: 0.3, elbow: 0.2 }), ...arm(s, { abd: 0.9, elbow: 0.25 }), pitch: -0.15, point: 0.9 };
    },
    hold: [5, 10],
    turn: [3, 4],
    weight: W(0.8, 1, 0.8, 1.4),
  },
  { name: "star", region: 3, pose: () => ({ ...both({ abd: 1.25, flex: 0.4, elbow: 0.1 }), ...leg(1, { abd: 0.4, knee: 0.08 }), ...leg(-1, { abd: 0.4, knee: 0.08 }), pitch: -0.2, point: 0.8 }), hold: [5, 10], turn: [3.5, 5], weight: W(0.8, 1, 0.8, 1.3) },
  { name: "crossed ankles", region: 0, pose: () => ({ ...leg(1, { abd: -0.06, twist: 0.1, knee: 0.2 }), ...leg(-1, { abd: -0.06, twist: -0.1, knee: 0.2 }), ...both({ flex: 0.85, elbow: 1.95, inward: 0.72 }), pitch: 0.1 }), hold: [8, 16], turn: [2.5, 3.5], weight: W(1.2, 1, 1.5, 0.6) },
  { name: "prayer above", region: 3, pose: () => ({ ...both({ flex: 2.95, abd: 0.05, elbow: 0.55, inward: 0.45 }), pitch: -0.25, ...leg(1, { knee: 0.15 }), ...leg(-1, { knee: 0.15 }) }), hold: [6, 12], turn: [3.5, 5], weight: W(0.9, 0.5, 1.4, 0.8) },
  { name: "holding the sky", region: 3, pose: () => ({ ...both({ flex: 2.4, abd: 0.95, elbow: 0.2 }), pitch: -0.42 }), hold: [5, 10], turn: [3.5, 5], weight: W(0.8, 0.8, 1, 1.2) },
  {
    name: "curled",
    region: 1,
    pose: () => ({ ...leg(1, { flex: 1.1, knee: 2.0 }), ...leg(-1, { flex: 0.9, knee: 1.8 }), ...both({ flex: 0.95, elbow: 2.1, inward: 0.9 }), pitch: 0.45, bodyPitch: 0.1, point: 0.5 }),
    hold: [10, 22],
    turn: [3.5, 5],
    weight: W(1, 0.4, 1.6, 0.5),
  },
  {
    name: "drifting",
    region: 2,
    pose: () => ({ ...both({ abd: 0.55, elbow: 0.45, flex: 0.15 }), ...leg(1, { knee: 0.35 }), pitch: 0.05, fidget: { keys: ["abdL", "abdR", "kneeL", "kneeR"], amp: 0.1, freq: 0.45, signs: [1, -1, 1, -1] } }),
    hold: [8, 16],
    turn: [2.5, 3.5],
    weight: W(1.5, 1, 1.2, 1.2),
  },
];
// Regions for the original air moves.
Object.assign(REGION_OF, { hover: 2, "balance on the air": 2, "legs apart": 2, "arms wide": 3, "arms above": 3, "hands at heart": 1, "floating lotus": 0 });

// Walking: what the upper body does while the legs carry it. The gait itself (speed, stride, bob,
// arm swing) comes from the walk controller.
const WALK_MOVES: Move[] = [
  { name: "easy walk", region: 2, pose: () => ({}), hold: [6, 16], turn: [1.5, 2.5], weight: W(2, 1.5, 1, 2) },
  { name: "head up, walking", region: 2, pose: (r) => ({ pitch: -0.12, yaw: (r() - 0.5) * 0.3 }), hold: [5, 12], turn: [1.5, 2.5], weight: W(1, 1.2, 0.6, 1.2) },
  { name: "looking aside, walking", region: 2, pose: (r) => ({ yaw: side(r) * (0.4 + 0.25 * r()), pitch: 0.02 }), hold: [3, 7], turn: [1.5, 2.2], weight: W(0.8, 1.8, 0.5, 1.4) },
  { name: "hands behind, walking", region: 0, pose: () => ({ ...both({ flex: -0.4, elbow: 1.25, inward: 0.5 }), pitch: 0.22 }), hold: [8, 18], turn: [2, 3], weight: W(1, 0.6, 1.8, 0.5) },
  { name: "lost in thought, walking", region: 0, pose: () => ({ pitch: 0.38, ...both({ inward: 0.15, elbow: 0.3 }) }), hold: [6, 14], turn: [2, 3], weight: W(0.8, 0.4, 1.6, 0.6) },
  { name: "hand on heart, walking", region: 1, pose: () => ({ ...arm(1, { flex: 0.75, elbow: 1.95, inward: 0.6 }), pitch: 0.16 }), hold: [6, 14], turn: [2, 3], weight: W(1, 0.4, 1.4, 0.6) },
  { name: "arms open, walking", region: 1, pose: () => ({ ...both({ abd: 0.38, elbow: 0.35, inward: -0.08 }), pitch: -0.1 }), hold: [6, 12], turn: [2.5, 3.5], weight: W(1.2, 0.6, 0.8, 1) },
  {
    name: "touching the air, walking",
    region: 1,
    pose: () => ({ ...both({ abd: 0.3, flex: 0.2, elbow: 0.5 }), fidget: { keys: ["abdL", "abdR"], amp: 0.08, freq: 0.9, signs: [1, -1] } }),
    hold: [6, 12],
    turn: [2, 3],
    weight: W(1, 0.6, 0.8, 1),
  },
  { name: "processional", region: 3, pose: () => ({ ...both({ flex: 0.75, elbow: 1.75, inward: 0.62 }), pitch: 0.18 }), hold: [8, 18], turn: [2.5, 3.5], weight: W(1, 0.4, 1.6, 0.5) },
  { name: "palms up, walking", region: 3, pose: () => ({ ...both({ flex: 0.5, abd: 0.25, elbow: 1.1, inward: 0.15 }), pitch: -0.15 }), hold: [6, 12], turn: [2.5, 3.5], weight: W(0.9, 0.5, 1.2, 0.8) },
  { name: "wings low, walking", region: 3, pose: () => ({ ...both({ abd: 0.65, elbow: 0.25 }), pitch: -0.08 }), hold: [6, 12], turn: [2.5, 3.5], weight: W(0.9, 0.6, 0.8, 1.1) },
  { name: "face to the sky, walking", region: 3, pose: () => ({ pitch: -0.4, ...both({ abd: 0.2, elbow: 0.15 }) }), hold: [4, 9], turn: [2, 3], weight: W(0.8, 0.5, 1, 0.9) },
];

// Reactions: quick answers to new fragments, by region. Smaller and sooner than the idles.
const REACTIONS: Move[][] = [
  [
    { name: "a thought lands", pose: () => ({ pitch: -0.18, roll: 0.1 }), hold: [2, 4], turn: [0.9, 1.3], weight: W(1, 1, 1, 1) },
    { name: "hand rises to the chin", pose: (r) => ({ ...arm(side(r), { flex: 1.2, elbow: 2.4, inward: 0.35 }), pitch: 0.1 }), hold: [2.5, 4], turn: [1.1, 1.5], weight: W(1, 1, 1, 1) },
    { name: "considering", pose: (r) => ({ yaw: side(r) * 0.3, pitch: -0.25 }), hold: [2, 4], turn: [1, 1.4], weight: W(1, 1, 1, 1) },
    { name: "fingertips meet", pose: () => ({ ...both({ flex: 0.85, abd: 0.08, elbow: 1.95, inward: 0.72 }) }), hold: [2.5, 4.5], turn: [1.2, 1.6], weight: W(1, 1, 1, 1) },
  ],
  [
    { name: "hand to heart", pose: () => ({ ...arm(1, { flex: 0.75, elbow: 1.95, inward: 0.6 }), pitch: 0.2 }), hold: [3, 5], turn: [1.1, 1.5], weight: W(1, 1, 1, 1) },
    { name: "both hands to heart", pose: () => ({ ...arm(1, { flex: 0.75, elbow: 1.95, inward: 0.62 }), ...arm(-1, { flex: 0.7, elbow: 1.85, inward: 0.85 }), pitch: 0.25 }), hold: [3, 5], turn: [1.2, 1.6], weight: W(1, 1, 1, 1) },
    { name: "arms soften open", pose: () => ({ ...both({ abd: 0.4, elbow: 0.4, inward: -0.1 }), pitch: -0.1 }), hold: [2.5, 4.5], turn: [1.2, 1.6], weight: W(1, 1, 1, 1) },
    { name: "a breath in", pose: () => ({ shoulderL: 0.45, shoulderR: 0.45, pitch: -0.12, bodyPitch: -0.03 }), hold: [1.5, 2.5], turn: [1.2, 1.6], weight: W(1, 1, 1, 1) },
  ],
  [
    { name: "turns toward it", pose: (r) => ({ bodyYaw: side(r) * 0.18, yaw: side(r) * 0.2 }), hold: [2, 4], turn: [1, 1.4], weight: W(1, 1, 1, 1) },
    { name: "settles", pose: () => ({ kneeL: 0.18, kneeR: 0.18, pitch: 0.12 }), hold: [2, 4], turn: [1, 1.4], weight: W(1, 1, 1, 1) },
    { name: "squares up", pose: () => ({ shoulderL: 0.12, shoulderR: 0.12, bodyPitch: -0.04, pitch: -0.06 }), hold: [2, 3.5], turn: [0.9, 1.3], weight: W(1, 1, 1, 1) },
    { name: "a step's weight", pose: (r) => ({ lean: side(r) * 0.016 }), hold: [2, 4], turn: [1, 1.4], weight: W(1, 1, 1, 1) },
  ],
  [
    { name: "eyes to the sky", pose: () => ({ pitch: -0.5 }), hold: [2.5, 4.5], turn: [1.2, 1.6], weight: W(1, 1, 1, 1) },
    { name: "wings lift", pose: () => ({ ...both({ abd: 0.9, elbow: 0.3 }), pitch: -0.2 }), hold: [2.5, 4.5], turn: [1.4, 1.8], weight: W(1, 1, 1, 1) },
    { name: "palms rise", pose: () => ({ ...both({ flex: 0.6, abd: 0.25, elbow: 1.0, inward: 0.15 }), pitch: -0.15 }), hold: [2.5, 4.5], turn: [1.3, 1.7], weight: W(1, 1, 1, 1) },
    { name: "one hand up", pose: (r) => ({ ...arm(side(r), { flex: 2.4, abd: 0.25, elbow: 0.3 }), pitch: -0.35 }), hold: [2.5, 4], turn: [1.4, 1.8], weight: W(1, 1, 1, 1) },
  ],
];
export type ChoreoMode = "ground" | "walk" | "air";

/** A move from the library held still, by name: for imagery. Levitation moves come with the air's rest. */
export function stillPose(name: string, seed = "still"): Pose {
  const air = AIR_MOVES.find((m) => m.name === name);
  const move = air ?? [...MOVES, ...WALK_MOVES].find((m) => m.name === name);
  if (!move) return air ? AIR_REST : REST;
  const { fidget: _f, ...p } = move.pose(rngFor(`${seed}:${name}`));
  return { ...(air ? AIR_REST : REST), ...p };
}
export const isAirPose = (name: string) => AIR_MOVES.some((m) => m.name === name);
const MOVES_FOR: Record<ChoreoMode, Move[]> = { ground: MOVES, walk: WALK_MOVES, air: AIR_MOVES };
const RECENT = 6; // a move doesn't come back until this many others have played

interface Beat {
  name: string;
  fidget?: Fidget;
  from: Pose;
  to: Pose;
  start: number; // seconds into the hour
  turn: number;
  end: number;
}

const KEYS = Object.keys(REST) as (keyof Pose)[];
const lerpPose = (a: Pose, b: Pose, t: number) => Object.fromEntries(KEYS.map((k) => [k, a[k] + (b[k] - a[k]) * t])) as unknown as Pose;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // ease in-out cubic
const wave = (t: number, k: number) => (Math.sin(t * 0.31 + k) + 0.6 * Math.sin(t * 0.73 + k * 2.1) + 0.3 * Math.sin(t * 1.71 + k * 3.7)) / 1.9;

export class Choreographer {
  private hour = -1;
  private idle: Idle | null = null;
  private mode: ChoreoMode = "ground";
  private beats: Beat[] = [];
  private cursor = 0;
  private last: Pose = REST;
  private mood: Mood = [0.25, 0.25, 0.25, 0.25];
  current = "rest";

  constructor(private seed: string) {}

  /** The pose at time t (seconds since the app started), scaled by the genome's sway. */
  pose(t: number, idle: Idle, sway: number, mode: ChoreoMode = "ground", mood?: Mood): Pose {
    const hour = Math.floor(t / 3600);
    const local = t - hour * 3600;
    // A shift in mood re-plans from the end of the current beat, so nothing is cut off mid-move.
    let moodShift = false;
    if (mood && mood.reduce((s, m, i) => s + Math.abs(m - this.mood[i]), 0) > 0.12) {
      this.mood = [...mood] as Mood;
      moodShift = true;
    }
    if (hour !== this.hour || idle !== this.idle || mode !== this.mode) this.build(hour, idle, local, mode);
    else if (moodShift) this.replanAfterCurrent(local);

    while (this.cursor < this.beats.length - 1 && local >= this.beats[this.cursor].end) this.cursor++;
    const beat = this.beats[this.cursor];
    this.current = beat.name;
    const into = ease(Math.min(1, Math.max(0, (local - beat.start) / beat.turn)));
    const p = lerpPose(beat.from, beat.to, into);
    if (beat.fidget) beat.fidget.keys.forEach((k, i) => (p[k] += (beat.fidget!.signs?.[i] ?? 1) * beat.fidget!.amp * Math.sin(t * beat.fidget!.freq) * into));

    // Micro-motion, so holds are never dead still.
    const amp = TEMPER[idle].amp * (0.6 + 0.4 * sway);
    const out: Pose = {
      ...p,
      yaw: (p.yaw + 0.025 * wave(t * 0.5, 1)) * amp,
      pitch: (p.pitch + 0.02 * wave(t * 0.43, 2)) * amp,
      roll: (p.roll + 0.01 * wave(t * 0.37, 3)) * amp,
      armL: p.armL + 0.01 * wave(t * 0.3, 4),
      armR: p.armR + 0.01 * wave(t * 0.33, 5),
    };
    this.last = p;
    return out;
  }

  /**
   * New fragments just landed: look toward them (yaw/pitch for the head), then answer with a short
   * move from their region, sized by how forcefully they were said. The plan resumes after.
   */
  react(t: number, region: number, intensity: number, look: { yaw: number; pitch: number }) {
    if (this.hour < 0 || this.idle === null) return;
    const local = t - this.hour * 3600;
    const r = rngFor(`${this.seed}:react:${Math.floor(t * 10)}`);
    const from = this.poseAt(local);
    const notice: Pose = { ...from, yaw: look.yaw, pitch: look.pitch, roll: look.yaw * -0.08 };
    const options = REACTIONS[region] ?? REACTIONS[0];
    const move = options[Math.floor(r() * options.length)];
    const { fidget, ...moved } = move.pose(r);
    const size = 0.5 + 0.5 * Math.min(1, Math.max(0, intensity));
    const target: Pose = { ...from, ...UPPER_REST, ...moved };
    const answer = lerpPose({ ...from, ...UPPER_REST }, target, size);
    const beats: Beat[] = [
      { name: "notice", from, to: notice, start: local, turn: 0.7, end: local + 1.6 },
      { name: `${move.name} (answer)`, fidget, from: notice, to: answer, start: local + 1.6, turn: 1.6, end: local + 1.6 + 1.6 + 3 + 2 * r() },
    ];
    const resume = beats[1].end;
    this.last = answer;
    const idle = this.idle;
    this.build(this.hour, idle, resume, this.mode);
    this.beats = [...beats, ...this.beats];
    this.cursor = 0;
  }

  /** The planned pose at a local time, without micro-motion. */
  private poseAt(local: number): Pose {
    const beat = this.beats.find((b) => local < b.end) ?? this.beats[this.beats.length - 1];
    if (!beat) return this.last;
    return lerpPose(beat.from, beat.to, ease(Math.min(1, Math.max(0, (local - beat.start) / beat.turn))));
  }

  /** Keep the beat playing now; plan everything after it again (with the new mood). */
  private replanAfterCurrent(local: number) {
    const now = this.beats[this.cursor];
    if (!now || this.idle === null) return;
    this.last = now.to;
    this.build(this.hour, this.idle, now.end, this.mode);
    this.beats = [now, ...this.beats];
    this.cursor = 0;
    void local;
  }

  /** Lay out the rest of this hour. A fresh order every hour; changing idle re-plans from now. */
  private build(hour: number, idle: Idle, from: number, mode: ChoreoMode) {
    const r = rngFor(`${this.seed}:idle:${hour}:${idle}:${mode}:${Math.floor(from)}`);
    const temper = TEMPER[idle];
    const air = mode === "air";
    const moves = MOVES_FOR[mode];
    const rest = air ? AIR_REST : REST;
    const weightOf = (m: Move) => m.weight[idle] * moodGain(m, this.mood);
    const total = moves.reduce((s, m) => s + weightOf(m), 0);
    const beats: Beat[] = [];
    let t = from;
    let prev = this.last;
    const recent: string[] = [];
    while (t < 3600) {
      let roll = r() * total;
      let move = moves[0];
      for (const m of moves) {
        roll -= weightOf(m);
        if (roll <= 0) {
          move = m;
          break;
        }
      }
      if (move.name !== "rest" && recent.includes(move.name)) continue; // nothing comes back too soon
      // Weight shifts and arm positions often persist through the next few head moves.
      const carry: Partial<Pose> = r() < 0.6 ? { lean: prev.lean, bodyYaw: prev.bodyYaw * 0.6 } : {};
      const { fidget, ...moved } = move.pose(r);
      const to: Pose = { ...rest, ...(mode === "ground" ? carry : {}), ...moved };
      const turn = (move.turn[0] + r() * (move.turn[1] - move.turn[0])) * temper.turn;
      const hold = (move.hold[0] + r() * (move.hold[1] - move.hold[0])) * temper.hold;
      beats.push({ name: move.name, fidget, from: prev, to, start: t, turn, end: t + turn + hold });
      t += turn + hold;
      prev = to;
      recent.push(move.name);
      if (recent.length > Math.min(RECENT, moves.length - 2)) recent.shift();
    }
    this.beats = beats;
    this.cursor = 0;
    this.hour = hour;
    this.idle = idle;
    this.mode = mode;
  }
}
