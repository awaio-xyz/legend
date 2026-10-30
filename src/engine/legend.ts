// The engine: one invisible mannequin, a genome, a stream of fragments, and the render loop.
// Layers follow decision 6. setGenome rebuilds everything, setStyle only touches looks (the figure
// controls re-place the same fragments on a new body), setSim replaces the (simulated) data.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { paletteFor, type EdgeStyle, type Genome, type GlyphMix, type Harmony, type SmearAxis } from "./genome";
import { DEFAULT_BODY, eggOf, elbowX, ETHER_LAYER, LEG, legHipX, sampleAnchors, shoulderX, SPACE_LAYER, torsoHalf, type Anchors, type BodyParams } from "./mannequin";
import { WalkController } from "./walk";
import { etherRelease, Placement } from "./placement";
import { Simulator, simTotal, type Fragment, type SimParams } from "./fragments";
import { configureSmear, createSmearPass } from "./passes";
import { applyEffects, createGradePass, DEFAULT_EFFECTS, EFFECTS, type Effects } from "./grade";
import { ASCII_ATLAS, ASCII_RAMP, createAsciiAtlas } from "./atlas";
import { hash01 } from "./rng";
import { Choreographer, isAirPose, stillPose, type Idle, type Landing, type Mood, type Pose } from "./idle";
import { IMAGE_SIZE, SHOTS } from "./imagery";
import { DEFAULT_LOOK } from "./defaultLook";

export type { Idle };
import { FACETS_VERT, GHOST_FRAG, GHOST_VERT, LINES_FRAG, LINES_VERT, POINTS_FRAG, POINTS_VERT } from "./shaders";

// The engine is built once, at mount. Hot-swapping its code would leave the running instance on the
// old values (the zoom limit "never changed" for exactly this reason), so engine edits reload the page.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

export type GlyphPreset = "genome" | "dots" | "glyphs" | "squares" | "ascii";
export type Polygon = "off" | "wire" | "facets";
/** What the light tells: which part of the data colour follows. */
export type ColourStory = "region" | "topic" | "time" | "intensity";
const COLOUR_STORY: Record<ColourStory, number> = { region: 0, topic: 1, time: 2, intensity: 3 };
const smooth01 = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};


/** What the user may change (decision 6). `null` means "use the genome's value". */
export interface Style {
  hueShift: number;
  harmony: Harmony | null;
  glyphs: GlyphPreset;
  glyphCycle: number; // 0 still → every node keeps switching glyph type
  asciiCycle: number; // 0 still → ASCII characters keep changing
  edgeStyle: EdgeStyle | null;
  smear: number | null;
  smearAxis: SmearAxis | null;
  drift: number | null;
  glow: number | null;
  polygon: Polygon;
  meshScale: number; // polygon mesh: 0 joins each node to its nearest → 1 a coarse lattice of big facets
  wireStrength: number; // how bright the polygon's wires and facets are
  grain: number; // 0 soft points that pool into a cloud → 1 crisp specks that shrink as the figure fills
  idle: Idle;
  auraWarp: number; // how far the aura parts around moving limbs (0 still, 1 default, 2 dramatic)
  walk: boolean; // body mode: wander the space on a journey of routes, or stand
  levitate: boolean; // body mode: hover in the air, holding poses
  track: boolean; // body mode: the camera follows the walker, or holds on the centre
  // Colour
  colours: [head: string, heart: string, gut: string, spirit: string] | null; // null = the genome's palette
  auraHues: number; // 0 the spirit colour → 1 a chakra colour per aura layer
  colourStory: ColourStory;
  colourBleed: number; // 0 hard region borders → 1 colour washes across the body
  variation: number; // how many colours a region may hold
  // Light
  exposure: number;
  bloomRadius: number | null;
  bloomThreshold: number;
  coreGlow: number; // how strongly the dense masses (head, heart, gut cores) read as light
  heartbeat: number; // how strongly the beat shows. Its tempo is data
  gutFlow: number; // light travelling through the gut
  neural: number; // neurons firing in the brain
  glowMaster: number; // overall glow: dampens or lifts bloom and the organ masses together
  glowBalance: number; // 0 raw → 1 head, heart and gut glow evenly whatever their density and colour
  bodyLight: number; // 0 the dense organs carry the light → 1 the whole body shines more evenly
  regionGlow: [head: number, heart: number, gut: number, spirit: number]; // per-region trims on top of the balance
  ghost: boolean;
  body: BodyParams;
  fx: Effects; // colour grade and filters (CRT, film, glitch, focus), after Qualia
}

const BASE_STYLE: Style = {
  hueShift: 0,
  harmony: null,
  glyphs: "genome",
  glyphCycle: 0,
  asciiCycle: 0,
  edgeStyle: "hover", // lines are opt-in: the figure reads as floating nodes by default
  smear: null,
  smearAxis: null,
  drift: null,
  glow: null,
  polygon: "off",
  meshScale: 0,
  wireStrength: 1,
  grain: 0,
  idle: "watchful",
  auraWarp: 1,
  walk: false,
  levitate: false,
  track: true,
  colours: null,
  auraHues: 1,
  colourStory: "region",
  colourBleed: 0.5,
  variation: 0.15,
  exposure: 1,
  bloomRadius: null,
  bloomThreshold: 0,
  coreGlow: 0.5,
  heartbeat: 0.5,
  gutFlow: 0.6,
  neural: 0.6,
  glowMaster: 1,
  glowBalance: 1,
  bodyLight: 0.5,
  regionGlow: [1, 1, 1, 1],
  ghost: false,
  body: DEFAULT_BODY,
  fx: DEFAULT_EFFECTS,
};

/** The look Legend opens with: the chosen default (defaultLook.ts) over the base style. */
export const DEFAULT_STYLE: Style = { ...BASE_STYLE, ...DEFAULT_LOOK, body: { ...BASE_STYLE.body, ...DEFAULT_LOOK.body }, fx: { ...BASE_STYLE.fx, ...DEFAULT_LOOK.fx } };

/** Roll every style control. Never touches the genome or the data. */
export function randomStyle(): Style {
  const r = Math.random;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  return {
    hueShift: Math.round(r() * 360 - 180),
    harmony: pick(["analogous", "triadic", "split"] as const),
    glyphs: pick(["dots", "glyphs", "squares", "ascii", "genome"] as const),
    glyphCycle: r() < 0.6 ? 0 : r(),
    asciiCycle: r() < 0.5 ? 0 : r(),
    edgeStyle: pick(["straight", "curved", "hover", null] as const),
    smear: r() < 0.4 ? 0 : r() ** 1.5 * 0.8,
    smearAxis: pick(["horizontal", "vertical", "depth", "radial", "swirl", "all"] as const),
    drift: 0.002 + r() ** 1.5 * 0.04,
    glow: r(),
    polygon: pick(["off", "off", "wire", "facets"] as const),
    meshScale: r() < 0.35 ? 0 : r(),
    wireStrength: 0.6 + r() * 1.6,
    grain: r(),
    idle: pick(["calm", "watchful", "contemplative", "restless"] as const),
    auraWarp: 0.6 + r() * 1.2,
    walk: r() < 0.6,
    levitate: r() < 0.25,
    track: r() < 0.6,
    colours: null,
    auraHues: r(),
    colourStory: pick(["region", "region", "topic", "time", "intensity"] as const),
    colourBleed: r(),
    variation: r() ** 2,
    exposure: 0.8 + r() * 0.5,
    bloomRadius: r(),
    bloomThreshold: r() < 0.7 ? 0 : r() * 0.3,
    coreGlow: r() * 1.2,
    heartbeat: 0.2 + r() * 0.8,
    gutFlow: r(),
    neural: r(),
    glowMaster: 0.5 + r() * 0.8,
    glowBalance: 0.6 + r() * 0.4,
    bodyLight: r(),
    regionGlow: [1, 1, 1, 1],
    ghost: false,
    // Effects: mostly gentle, now and then a strong look.
    fx: Object.fromEntries(
      EFFECTS.map((e) => {
        const wild = r() < 0.18;
        const span = e.max - e.min;
        const v = wild ? e.min + r() * span : e.value + (r() - 0.5) * span * 0.15;
        return [e.key, Math.min(e.max, Math.max(e.min, e.step >= 1 ? Math.round(v) : v))];
      }),
    ),
    body: { form: r(), build: 0.8 + r() * 0.45, shoulders: 0.88 + r() * 0.24, head: 0.9 + r() * 0.2, mode: DEFAULT_BODY.mode },
  };
}

export interface Stats {
  placed: number;
  born: number; // every fragment drawn so far, ether included
  capacity: number;
  regions: [head: number, heart: number, gut: number, spirit: number]; // share of placed fragments by dominant region
  move: string; // the idle move playing now
  aura: number; // nodes in the aura
  ether: number; // ether nodes: the void filling, the figure coming apart
  route: string; // body mode: the walk route right now
}

const GLYPH_PRESETS: Record<Exclude<GlyphPreset, "genome" | "ascii">, GlyphMix> = {
  dots: [1, 0, 0, 0],
  glyphs: [0.5, 0.25, 0.25, 0.25],
  squares: [0.3, 1, 0, 0],
};
const ASCII_GLYPH = 5;
const CURVE_SEGMENTS = 6;
const MAX_EDGE_LENGTH = 0.1; // longer links turn the body into a wireframe
const EDGE_INTENSITY = 0.45; // only fragments said with some force reach out to others
const VIEW_HEIGHT = 900; // window height (CSS px) at and above which points are drawn full size
const ETHER_FULL = 120000; // ether nodes at which the figure has spread about as far as it will (uEther 1)
const POLY_RADIUS = 0.045; // polygon mode joins each node to its nearest neighbours within this
const POLY_NEIGHBOURS = 3;
// Mesh scale: at 0 the polygon joins every node to its nearest, a centimetre or so away, which
// pools into fuzz in a full figure. Above 0 it joins one node per lattice cell instead, up to this
// size, so the facets stay big and readable however many nodes there are.
const MESH_CELL_MIN = 0.012, MESH_CELL_MAX = 0.085;
/** Lines must never join the two legs: they'd stretch across the gap with every stride. */
const acrossLegs = (ax: number, ay: number, bx: number, by: number) => ay < -0.3 && by < -0.3 && Math.sign(ax) !== Math.sign(bx);

const sameBody = (a: BodyParams, b: BodyParams) =>
  a.form === b.form && a.build === b.build && a.shoulders === b.shoulders && a.head === b.head && a.mode === b.mode;

export class LegendEngine {
  onStats?: (s: Stats) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private smear = createSmearPass();
  private afterimage = new AfterimagePass(0.5);
  private grade = createGradePass();
  private clock = new THREE.Clock();
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private liveTimer: number | undefined;

  private genome!: Genome;
  private choreographer!: Choreographer;
  private walker = new WalkController("");
  private readonly session = Math.random().toString(36).slice(2, 10); // this opening of the app
  private lastTick = 0;
  private walkBase = { x: 0, z: 0, heading: 0 }; // where the walker is, before any floating
  private walkAir = 0; // 0 on the ground → 1 levitating
  // Mood: the region mix that weights the idle moves, mostly recent fragments over the lifetime.
  private mood: Mood = [0.25, 0.25, 0.25, 0.25];
  // Live reactions: fragments landed since the last one, and when.
  private pending: number[] = [];
  private lastArrival = -Infinity;
  private lastReaction = -Infinity;
  private floatSpin = 0;
  private style: Style;
  private sim: SimParams;
  private simulator!: Simulator;
  private anchors!: Anchors;
  private placement!: Placement;
  private fragments: Fragment[] = [];
  private births: number[] = [];
  private cutoff: number | null = null; // time travel: draw only the first k fragments
  // Ether releases, as the figure grows: born fragments counted in birth order, the release reached,
  // and when the last one breathed out.
  private birthOrder: number[] = [];
  private born = 0;
  private released = 0;
  private exhaleAt = -Infinity;
  private regionLight: [number, number, number] = [1, 1, 1];
  private pointSeed = new Float32Array(0); // per node, for the line layers
  private pointFray = new Float32Array(0);
  private pointLayer = new Float32Array(0);
  private bodyNodes = 0; // how much light each region's nodes put out
  private bodyPoints = 0; // body points, a deepened node's extras included
  private auraNodes = 0; // distinct aura nodes: the aura's own density

  private body = new THREE.Group();
  private points?: THREE.Points;
  private echo?: THREE.Points;
  private edges?: THREE.LineSegments;
  private wires?: THREE.LineSegments;
  private facets?: THREE.Mesh;
  private ghost?: THREE.Points;

  // Shared by every material, so one write updates them all.
  private shared = {
    uTime: { value: 0 },
    uEcho: { value: 0 },
    uDrift: { value: 0.01 },
    uFlowScale: { value: 3 },
    uFlowMode: { value: 0 },
    uBreathDepth: { value: 1 },
    uBreathRate: { value: 0.2 },
    uSway: { value: 1 },
    uLookYaw: { value: 0 },
    uLookPitch: { value: 0 },
    uArmL: { value: 0 },
    uArmR: { value: 0 },
    uFlexL: { value: 0 },
    uFlexR: { value: 0 },
    uAbdL: { value: 0 },
    uAbdR: { value: 0 },
    uElbowL: { value: 0 },
    uElbowR: { value: 0 },
    uElbowX: { value: 0.265 },
    uLookRoll: { value: 0 },
    uShoulderL: { value: 0 },
    uShoulderR: { value: 0 },
    uLean: { value: 0 },
    uBodyYaw: { value: 0 },
    uBodyPitch: { value: 0 },
    uWalk: { value: 0 },
    uPhase: { value: 0 },
    uStride: { value: 0.35 },
    uHipX: { value: 0.088 },
    uKneeY: { value: LEG.kneeY },
    uGround: { value: -0.3 },
    uLegsOn: { value: 0 },
    uAnkleY: { value: LEG.ankleY },
    uLegFlexL: { value: 0 },
    uLegFlexR: { value: 0 },
    uLegAbdL: { value: 0 },
    uLegAbdR: { value: 0 },
    uLegTwistL: { value: 0 },
    uLegTwistR: { value: 0 },
    uKneeL: { value: 0 },
    uKneeR: { value: 0 },
    uPoint: { value: 0 },
    uShoulderX: { value: 0.17 },
    uTorsoHalf: { value: 0.165 },
    uPixelRatio: { value: 1 },
    uViewScale: { value: 1 }, // points shrink with small windows (the widget), so it reads like the app
    uEther: { value: 0 },
    uExhale: { value: 0 },
    uBob: { value: 1 },
    uSwing: { value: 1 },
    uAuraWarp: { value: 1 },
    uEggCentre: { value: new THREE.Vector3(0, 0.15, 0) },
    uExposure: { value: 1 },
    uHead: { value: new THREE.Color() },
    uHeart: { value: new THREE.Color() },
    uGut: { value: new THREE.Color() },
    uSpirit: { value: new THREE.Color() },
  };
  private pointUniforms = {
    uSize: { value: 7 },
    uBeatRate: { value: 1 },
    uPulseSharp: { value: 4 },
    uFlicker: { value: 0 },
    uLanding: { value: 0 },
    uNegative: { value: -1 },
    uAtlas: { value: createAsciiAtlas() },
    uAtlasCells: { value: ASCII_ATLAS.length },
    uRampCells: { value: ASCII_RAMP.length },
    uGlyphCycle: { value: 0 },
    uAsciiCycle: { value: 0 },
    uColourBleed: { value: 0.5 },
    uColourMode: { value: 0 },
    uVariation: { value: 0.15 },
    uCoreGlow: { value: 0.6 },
    uHeartbeat: { value: 0.5 },
    uGutFlow: { value: 0.6 },
    uNeural: { value: 0.6 },
    uRegionSize: { value: new THREE.Vector3(1, 1, 1) },
    uRegionGain: { value: new THREE.Vector3(1, 1, 1) },
    uSpiritGain: { value: 1 },
    uAuraLift: { value: 1 }, // the aura's own exposure, undoing the body's density dimming
    uAuraHues: { value: 1 },
    uGrain: { value: 0 },
    uGrainSize: { value: 1 },
    uStackPow: { value: 0.5 },
    uSkinLift: { value: 1 },
  };
  private edgeAlpha = { value: 0.04 };
  private wireAlpha = { value: 0.035 };
  private facetAlpha = { value: 0.012 };

  constructor(private host: HTMLElement, genome: Genome, style: Style, sim: SimParams) {
    this.style = style;
    this.sim = sim;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Pure black. A tinted clear colour gets encoded twice through the composer and washes everything out.
    this.renderer.setClearColor(0x000000, 1);
    host.appendChild(this.renderer.domElement);
    this.shared.uPixelRatio.value = this.renderer.getPixelRatio();

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 500);
    this.camera.position.set(0, 0.22, 1.9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.2, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 90; // room to pull back and see the whole void, space and ether included

    this.scene.add(this.body);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1, 0.4, 0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.smear);
    this.composer.addPass(this.afterimage);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    this.setGenome(genome);
    this.frameCamera(style.body.mode);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ── Layers ──────────────────────────────────────────────────────────────

  /** A new genome is a new body: re-sample the mannequin, re-place everything, replay. */
  setGenome(genome: Genome) {
    this.genome = genome;
    // Behaviour is seeded by the genome and this session, so every opening plays out differently:
    // a different first move, a different journey, whether it starts standing, walking or aloft.
    this.choreographer = new Choreographer(`${genome.seed}:${this.session}`);
    this.walker = new WalkController(`${genome.seed}:${this.session}`);
    this.anchors = sampleAnchors(genome, this.style.body);
    this.buildGhost();
    this.rebuildData();
  }

  setStyle(style: Style) {
    const prev = this.style;
    this.style = style;
    if (prev.body.mode !== style.body.mode) this.frameCamera(style.body.mode);
    else if (prev.track !== style.track && style.body.mode === "body") this.aimCamera(style.track);
    if (!sameBody(prev.body, style.body)) {
      // Same fragments, same births, new body: re-place without replaying the growth.
      this.anchors = sampleAnchors(this.genome, style.body);
      this.buildGhost();
      this.replace();
    } else {
      if (style.glyphs !== prev.glyphs) this.writeGlyphs();
      if (style.edgeStyle !== prev.edgeStyle) this.buildEdges();
      if (style.polygon !== prev.polygon || style.meshScale !== prev.meshScale) this.buildPolygon();
    }
    if (this.ghost) this.ghost.visible = style.ghost;
    this.applyLooks();
  }

  setSim(sim: SimParams) {
    this.sim = sim;
    this.rebuildData();
  }

  /** New fragments from a watched vault: they land on the figure now, with the arrival flare. */
  addFragments(fragments: Fragment[]) {
    const now = this.clock.getElapsedTime();
    for (const f of fragments) {
      this.fragments.push({ ...f, at: f.at ?? (f.t > 1e9 ? f.t : Date.now() / 1000) });
      this.placement.add(f);
      this.births.push(now);
      this.birthOrder.push(now);
      this.pending.push(this.fragments.length - 1);
    }
    this.lastArrival = now;
    this.buildLayers();
    this.emitStats();
  }

  /** Draw a loaded vault's fragments instead of simulated ones, in the order they were said. */
  loadFragments(fragments: Fragment[]) {
    const sorted = [...fragments].sort((x, y) => x.t - y.t);
    const N = sorted.length;
    this.fragments = sorted.map((f, i) => ({ ...f, at: f.at ?? f.t, t: this.sim.replaySeconds * (i / Math.max(N, 1)) ** 0.8 }));
    this.resetBirths();
    this.replace();
  }

  /** Frame the camera for the mode: close on the bust, pulled back for the whole body. */
  private frameCamera(mode: BodyParams["mode"]) {
    this.walker.reset();
    this.walkBase = { x: 0, z: 0, heading: 0 };
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    if (mode === "body") {
      this.camera.position.set(0, -0.1, 4.4);
      this.controls.target.set(0, -0.2, 0);
    } else {
      this.camera.position.set(0, 0.22, 1.9);
      this.controls.target.set(0, 0.2, 0);
    }
  }

  /** Swing the camera onto the walker (tracking) or back to the centre, keeping the user's orbit. */
  private aimCamera(track: boolean) {
    const want = (track ? new THREE.Vector3(this.walkBase.x, 0, this.walkBase.z) : new THREE.Vector3()).add(new THREE.Vector3(0, -0.2, 0));
    const delta = want.sub(this.controls.target);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
  }

  /** Replay the same history from an empty body. Placement doesn't change, only the births. */
  replay() {
    this.resetBirths();
    this.writeBirths();
    this.buildEdges();
    this.buildPolygon();
  }

  /** Keep adding simulated fragments, like a live conversation. */
  setLive(on: boolean) {
    window.clearInterval(this.liveTimer);
    this.liveTimer = undefined;
    if (!on) return;
    this.liveTimer = window.setInterval(() => {
      const f = { ...this.simulator.next(0), at: Date.now() / 1000 };
      this.fragments.push(f);
      this.placement.add(f);
      this.births.push(this.clock.getElapsedTime());
      this.birthOrder.push(this.clock.getElapsedTime());
      this.pending.push(this.fragments.length - 1);
      this.lastArrival = this.clock.getElapsedTime();
      this.buildLayers();
      this.emitStats();
    }, 900);
  }

  /**
   * Time travel. Placement is sequential and deterministic, so the figure as it was after its first
   * k fragments is exactly the first k points of today's: drawing fewer points is the past, with no
   * rebuild. null is now. Lines are hidden while looking back (they join nodes from any time).
   */
  setCutoff(k: number | null) {
    this.cutoff = k === null ? null : Math.max(0, Math.min(this.fragments.length, Math.round(k)));
    this.applyCutoff();
    this.applyLooks();
    this.emitStats();
  }

  private applyCutoff() {
    const n = this.fragments.length;
    const k = this.cutoff ?? n;
    this.points?.geometry.setDrawRange(0, k);
    this.echo?.geometry.setDrawRange(0, k);
    for (const o of [this.edges, this.wires, this.facets]) if (o) o.visible = this.cutoff === null;
    // The ether and the light as they were then.
    let ether = 0;
    let bodyPoints = 0;
    const nodes = new Set<number>();
    const aura = new Set<number>();
    for (let i = 0; i < k; i++) {
      const a = this.placement.anchorOf[i];
      if (a < 0 || this.pointLayer[i] >= SPACE_LAYER) ether++;
      else if (this.pointLayer[i] === 0) {
        nodes.add(a);
        bodyPoints++;
      }
      else aura.add(a);
    }
    this.shared.uEther.value = ether / ETHER_FULL;
    this.bodyNodes = nodes.size;
    this.bodyPoints = bodyPoints;
    this.auraNodes = aura.size;
  }

  /** Every fragment's date, dominant region and whether it went to the ether, in order: the timeline. */
  timeline() {
    const n = this.fragments.length;
    const at = new Float64Array(n);
    const region = new Uint8Array(n);
    const ether = new Uint8Array(n);
    this.fragments.forEach((f, i) => {
      at[i] = f.at ?? 0;
      const w = f.weights;
      region[i] = w.indexOf(Math.max(...w));
      ether[i] = this.placement.anchorOf[i] < 0 || (this.pointLayer[i] ?? 0) >= SPACE_LAYER ? 1 : 0;
    });
    return { at, region, ether, cutoff: this.cutoff };
  }

  /** The four region colours as hex, for charts. */
  regionColours(): [string, string, string, string] {
    const u = this.shared;
    return [u.uHead, u.uHeart, u.uGut, u.uSpirit].map((c) => `#${(c.value as THREE.Color).getHexString()}`) as [string, string, string, string];
  }

  /** The widget turns orbiting off: dragging it moves the window instead. */
  setInteractive(on: boolean) {
    this.controls.enabled = on;
  }

  /** The widget's zoom: 1 frames the figure as the app does; 2 is twice as close. Keeps the angle. */
  setZoom(zoom: number) {
    const framed = this.style.body.mode === "body" ? 4.4 : 1.9;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(framed / Math.max(0.25, zoom));
    this.camera.position.copy(this.controls.target).add(offset);
  }

  /** Home: the camera back in front of the figure, wherever it has walked, framed as at the start. */
  resetView(zoom = 1) {
    const body = this.style.body.mode === "body";
    this.controls.target.set(this.body.position.x, (body ? -0.2 : 0.2) + this.body.position.y, this.body.position.z);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, body ? 0.1 : 0.02, body ? 4.4 : 1.9));
    this.setZoom(zoom);
  }

  /** The widget's fisheye lens, 0 (off) to 1. */
  setFisheye(amount: number) {
    this.grade.uniforms.fisheye.value = amount;
  }

  dispose() {
    this.setLive(false);
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.composer.dispose();
    for (const o of [this.points, this.echo, this.edges, this.wires, this.facets, this.ghost]) this.removeLayer(o);
    this.pointUniforms.uAtlas.value.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Building ────────────────────────────────────────────────────────────

  private rebuildData() {
    this.simulator = new Simulator(this.sim);
    this.fragments = this.simulator.history();
    // The simulated person has no real dates: spread them over a pretend year, ending now.
    const end = Date.now() / 1000, n = this.fragments.length;
    this.fragments.forEach((f, i) => (f.at = end - 365 * 86400 * (1 - (n > 1 ? i / (n - 1) : 1))));
    this.resetBirths();
    this.replace();
  }

  /** Place the current fragments on the current anchors and rebuild every layer. */
  private replace() {
    this.placement = new Placement(this.anchors, this.genome);
    for (const f of this.fragments) this.placement.add(f);
    this.buildLayers();
    this.applyLooks();
    this.emitStats();
  }

  private buildLayers() {
    this.buildPoints();
    this.buildEdges();
    this.buildPolygon();
    if (this.cutoff !== null) this.applyCutoff();
    this.applyLooks();
  }

  private resetBirths() {
    const now = this.clock.getElapsedTime();
    this.births = this.fragments.map((f) => now + 0.5 + f.t);
    this.birthOrder = [...this.births].sort((a, b) => a - b);
    this.born = 0;
    this.released = 0;
    this.exhaleAt = -Infinity;
  }

  /** Each ether release breathes out: a swell and a brightening over about 1 s, settling over 3. */
  private breathe(t: number) {
    while (this.born < this.birthOrder.length && this.birthOrder[this.born] <= t) this.born++;
    const k = etherRelease(this.cutoff === null ? this.born : Math.min(this.born, this.cutoff));
    if (k < this.released) this.released = k; // scrubbed back in time: no breath for going backwards
    if (k > this.released) {
      this.released = k;
      this.exhaleAt = t;
    }
    const age = t - this.exhaleAt;
    const rise = Math.min(1, Math.max(0, age / 1.1));
    this.shared.uExhale.value = age < 0 ? 0 : age < 1.1 ? rise * rise * (3 - 2 * rise) : Math.exp(-(age - 1.1) / 1.4);
  }

  private buildPoints() {
    const n = this.fragments.length;
    const { pos, normal, fray, cores, field, path, neural, layer, reach } = this.anchors;
    const R = this.anchors.regions;
    const position = new Float32Array(n * 3);
    const aNormal = new Float32Array(n * 3);
    const aWeights = new Float32Array(n * R);
    const aSeed = new Float32Array(n);
    const aIntensity = new Float32Array(n);
    const aFray = new Float32Array(n);
    const aCores = new Float32Array(n * 3);
    const aField = new Float32Array(n * R);
    const aLayer = new Float32Array(n);
    const aTopic = new Float32Array(n);
    const aOrder = new Float32Array(n);
    const aPath = new Float32Array(n).fill(-1);
    const aNeural = new Float32Array(n);
    const aLight = new Float32Array(n * 2);
    const stacked = new Uint16Array(this.anchors.count);
    const jitter = this.genome.jitter * this.anchors.spacing;

    const egg = eggOf(this.style.body);
    let ether = 0;
    this.fragments.forEach((f, i) => {
      const a = this.placement.anchorOf[i];
      if (a >= 0 && layer[a] === SPACE_LAYER) ether++;
      if (a < 0) {
        // Every anchor taken: still ether, at a place far out in the void, fixed by the id.
        ether++;
        const th = hash01(`${f.id}:th`) * Math.PI * 2, ph = Math.acos(2 * hash01(`${f.id}:ph`) - 1);
        const r = 2.4 + hash01(`${f.id}:r`) * 2.5;
        position.set([egg.c[0] + r * Math.sin(ph) * Math.cos(th), egg.c[1] + r * Math.cos(ph), egg.c[2] + r * Math.sin(ph) * Math.sin(th)], i * 3);
        aNormal.set([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)], i * 3);
        aWeights.set(f.weights, i * R);
        aField.set(f.weights, i * R);
        aSeed[i] = hash01(f.id);
        aIntensity[i] = f.intensity;
        aLayer[i] = ETHER_LAYER;
        aTopic[i] = hash01(`topic:${f.topic}`);
        aOrder[i] = n > 1 ? i / (n - 1) : 1;
        aLight[i * 2] = 1;
        return;
      }
      // Jitter pushes each node off its anchor in a direction fixed by its id.
      const jx = hash01(`${f.id}:x`) - 0.5, jy = hash01(`${f.id}:y`) - 0.5, jz = hash01(`${f.id}:z`) - 0.5;
      position.set([pos[a * 3] + jx * jitter * 2, pos[a * 3 + 1] + jy * jitter * 2, pos[a * 3 + 2] + jz * jitter * 2], i * 3);
      aNormal.set([normal[a * 3], normal[a * 3 + 1], normal[a * 3 + 2]], i * 3);
      aWeights.set(f.weights, i * R);
      aSeed[i] = hash01(f.id);
      aIntensity[i] = f.intensity;
      aFray[i] = fray[a] + (this.anchors.arm[a] ? 2 : 0); // +2 marks an arm node for the shaders
      aCores.set([cores[a * 3], cores[a * 3 + 1], cores[a * 3 + 2]], i * 3);
      aField.set(field.subarray(a * R, a * R + R), i * R);
      aLayer[i] = layer[a];
      aTopic[i] = hash01(`topic:${f.topic}`);
      aOrder[i] = n > 1 ? i / (n - 1) : 1;
      aPath[i] = path[a];
      aNeural[i] = neural[a];
      // Which point this is on its node (1 the first): a deepened body node's later points add less
      // light (see bodyLight). By arrival order, so each point keeps its share as more arrive, and
      // time travel agrees. The aura keeps full light per point.
      const k = ++stacked[a];
      aLight[i * 2] = layer[a] === 0 ? k : 1;
      // Hands and feet are small and soften at the edge, so they get a little more light and size.
      aLight[i * 2 + 1] = layer[a] === 0 ? smooth01(0.7, 0.95, reach[a]) : 0;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("aNormal", new THREE.BufferAttribute(aNormal, 3));
    geometry.setAttribute("aWeights", new THREE.BufferAttribute(aWeights, R));
    geometry.setAttribute("aField", new THREE.BufferAttribute(aField, R));
    // Scalars are packed into vec4s to stay inside WebGL's 16-attribute limit (see the shader).
    const pack = (cols: Float32Array[]) => {
      const out = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = cols[c][i];
      return out;
    };
    const coreLayer = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) coreLayer.set([aCores[i * 3], aCores[i * 3 + 1], aCores[i * 3 + 2], aLayer[i]], i * 4);
    geometry.setAttribute("aCores", new THREE.BufferAttribute(coreLayer, 4));
    geometry.setAttribute("aMisc", new THREE.BufferAttribute(pack([aSeed, aIntensity, aFray, new Float32Array(n)]), 4));
    geometry.setAttribute("aData", new THREE.BufferAttribute(pack([aTopic, aOrder, aPath, aNeural]), 4));
    geometry.setAttribute("aBirth", new THREE.BufferAttribute(new Float32Array(n), 1));
    geometry.setAttribute("aLight", new THREE.BufferAttribute(aLight, 2));
    this.pointSeed = aSeed;
    this.pointFray = aFray;
    this.pointLayer = aLayer;
    // Distinct body anchors: a deepened node's extra points add light rather than dimming the rest.
    this.bodyNodes = new Set(this.placement.anchorOf.filter((a, i) => a >= 0 && aLayer[i] === 0)).size;
    this.bodyPoints = this.placement.anchorOf.filter((a, i) => a >= 0 && aLayer[i] === 0).length;
    this.auraNodes = new Set(this.placement.anchorOf.filter((a, i) => a >= 0 && aLayer[i] >= 1 && aLayer[i] <= 7)).size;
    // Every ether node pulls the figure a little further apart.
    this.shared.uEther.value = ether / ETHER_FULL;
    this.shared.uEggCentre.value.set(...egg.c);

    this.removeLayer(this.points);
    this.removeLayer(this.echo);
    this.points = new THREE.Points(geometry, this.pointsMaterial(0));
    this.points.frustumCulled = false;
    this.body.add(this.points);

    if (this.genome.rare === "double") {
      this.echo = new THREE.Points(geometry, this.pointsMaterial(1));
      this.echo.frustumCulled = false;
      this.body.add(this.echo);
    } else {
      this.echo = undefined;
    }

    this.writeGlyphs();
    this.writeBirths();
    this.measureRegions(position, aCores, aIntensity);
  }

  /**
   * How brightly each region's organ reads on screen before balancing: its nodes' light divided by
   * the area they cover, seen from the front. Glow is density, not totals: the gut can carry more
   * light than the heart and still look dimmer, because it's spread across the whole belly.
   */
  private measureRegions(position: Float32Array, cores: Float32Array, intensity: Float32Array) {
    const CELL = 0.015;
    const light = [1e-3, 1e-3, 1e-3];
    const cells = [new Set<string>(), new Set<string>(), new Set<string>()];
    for (let i = 0; i < intensity.length; i++) {
      for (let r = 0; r < 3; r++) {
        if (cores[i * 3 + r] < 0.5) continue;
        light[r] += 0.35 + 0.65 * intensity[i];
        cells[r].add(`${Math.floor(position[i * 3] / CELL)},${Math.floor(position[i * 3 + 1] / CELL)}`);
      }
    }
    this.regionLight = light.map((l, r) => l / Math.max(cells[r].size, 1)) as [number, number, number];
  }

  private pointsMaterial(echo: number) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.shared, ...this.pointUniforms, uEcho: { value: echo } },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  /** Shared-topic edges (data): forceful fragments link back to recent fragments on their topic. */
  private buildEdges() {
    this.removeLayer(this.edges);
    this.edges = undefined;
    if (!this.points) return;
    const style = this.style.edgeStyle ?? this.genome.edgeStyle;
    // "hover" means no lines until hover exists. Only the constellation rare trait shows them anyway,
    // and never when the user turned lines off themselves.
    if (style === "hover" && (this.style.edgeStyle === "hover" || this.genome.rare !== "constellation")) return;

    const { pos } = this.anchors;
    const byTopic = new Map<number, number[]>();
    const pairs: [number, number][] = [];
    this.fragments.forEach((f, i) => {
      const a = this.placement.anchorOf[i];
      if (a < 0) return;
      const prior = byTopic.get(f.topic) ?? [];
      let links = f.intensity < EDGE_INTENSITY ? this.genome.edgeReach : 0;
      for (let k = prior.length - 1; k >= 0 && links < this.genome.edgeReach; k--) {
        const b = this.placement.anchorOf[prior[k]];
        const d = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        // No edges in the aura: lines out there draw a cage around the body.
        if (d > MAX_EDGE_LENGTH || acrossLegs(pos[a * 3], pos[a * 3 + 1], pos[b * 3], pos[b * 3 + 1]) || this.anchors.arm[a] !== this.anchors.arm[b] || this.anchors.layer[a] > 0 || this.anchors.layer[b] > 0) continue;
        pairs.push([prior[k], i]);
        links++;
      }
      prior.push(i);
      byTopic.set(f.topic, prior);
    });

    this.edges = this.lineLayer(pairs, style === "curved", this.edgeAlpha);
    this.body.add(this.edges);
  }

  /** Polygon mode (style): join each node to its nearest neighbours, as wires or faint facets. */
  private buildPolygon() {
    this.removeLayer(this.wires);
    this.removeLayer(this.facets);
    this.wires = undefined;
    this.facets = undefined;
    if (this.style.polygon === "off" || !this.points) return;

    const P = this.points.geometry.getAttribute("position").array as Float32Array;
    // The figure only (the aura floats), and one point per node: a deepened node's extras add none.
    const seen = new Set<number>();
    const placed = this.fragments.map((_, i) => i).filter((i) => {
      const a = this.placement.anchorOf[i];
      if (a < 0 || this.pointLayer[i] !== 0 || seen.has(a)) return false;
      seen.add(a);
      return true;
    });
    const scale = this.style.meshScale ?? 0;
    const lattice = MESH_CELL_MIN + (MESH_CELL_MAX - MESH_CELL_MIN) * scale;
    const radius = scale > 0 ? lattice * 1.8 : POLY_RADIUS;
    if (scale > 0) {
      // One node per lattice cell, the oldest, so the mesh holds still as the figure grows.
      const reps = new Map<string, number>();
      for (const i of placed) {
        const k = `${Math.floor(P[i * 3] / lattice)},${Math.floor(P[i * 3 + 1] / lattice)},${Math.floor(P[i * 3 + 2] / lattice)}`;
        if (!reps.has(k)) reps.set(k, i);
      }
      placed.splice(0, placed.length, ...reps.values());
    }
    const cell = radius;
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const grid = new Map<string, number[]>();
    for (const i of placed) {
      const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }

    const pairSet = new Set<string>();
    const triSet = new Set<string>();
    const pairs: [number, number][] = [];
    const tris: [number, number, number][] = [];
    for (const i of placed) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      const near: [number, number][] = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
              if (j === i) continue;
              const d = Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z);
              if (d < radius && !acrossLegs(x, y, P[j * 3], P[j * 3 + 1]) && this.pointFray[i] > 1.5 === this.pointFray[j] > 1.5) near.push([d, j]);
            }
      near.sort((a, b) => a[0] - b[0]);
      const nbrs = near.slice(0, POLY_NEIGHBOURS).map(([, j]) => j);
      for (const j of nbrs) {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!pairSet.has(k)) {
          pairSet.add(k);
          pairs.push([i, j]);
        }
      }
      if (nbrs.length >= 2) {
        const t = [i, nbrs[0], nbrs[1]].sort((a, b) => a - b) as [number, number, number];
        const k = t.join("-");
        if (!triSet.has(k)) {
          triSet.add(k);
          tris.push(t);
        }
      }
    }

    this.wires = this.lineLayer(pairs, false, this.wireAlpha);
    this.body.add(this.wires);
    if (this.style.polygon === "facets") {
      this.facets = this.facetLayer(tris);
      this.body.add(this.facets);
    }
  }

  /** Lines between nodes, carrying both endpoints so the shader can drift them with their nodes. */
  private lineLayer(pairs: [number, number][], curved: boolean, alpha: { value: number }, free = 0) {
    const segs = curved ? CURVE_SEGMENTS : 1;
    const g = this.points!.geometry;
    const P = g.getAttribute("position").array as Float32Array;
    const S = this.pointSeed;
    const F = this.pointFray;
    const nVerts = pairs.length * segs * 2;
    const position = new Float32Array(nVerts * 3);
    const aPosA = new Float32Array(nVerts * 3);
    const aPosB = new Float32Array(nVerts * 3);
    const aSeedA = new Float32Array(nVerts);
    const aSeedB = new Float32Array(nVerts);
    const aFrayA = new Float32Array(nVerts);
    const aFrayB = new Float32Array(nVerts);
    const aT = new Float32Array(nVerts);
    const aBirth = new Float32Array(nVerts);
    const aWeights = new Float32Array(nVerts * 4);

    let v = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), Q = new THREE.Vector3();
    for (const [j, i] of pairs) {
      A.fromArray(P, j * 3);
      B.fromArray(P, i * 3);
      // Curved lines bow slightly toward the spine, which bundles them like reference image 2.
      C.addVectors(A, B).multiplyScalar(0.5);
      C.set(C.x * 0.8, C.y, C.z * 0.8);
      const wa = this.fragments[j].weights, wb = this.fragments[i].weights;
      for (let s = 0; s < segs; s++) {
        for (const t of [s / segs, (s + 1) / segs]) {
          if (curved) Q.copy(A).multiplyScalar((1 - t) * (1 - t)).addScaledVector(C, 2 * (1 - t) * t).addScaledVector(B, t * t);
          else Q.lerpVectors(A, B, t);
          Q.toArray(position, v * 3);
          A.toArray(aPosA, v * 3);
          B.toArray(aPosB, v * 3);
          aSeedA[v] = S[j];
          aSeedB[v] = S[i];
          aFrayA[v] = F[j];
          aFrayB[v] = F[i];
          aT[v] = t;
          aBirth[v] = Math.max(this.births[j], this.births[i]);
          aWeights.set(wa.map((x, k) => (x + wb[k]) / 2), v * 4);
          v++;
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("aPosA", new THREE.BufferAttribute(aPosA, 3));
    geometry.setAttribute("aPosB", new THREE.BufferAttribute(aPosB, 3));
    geometry.setAttribute("aSeedA", new THREE.BufferAttribute(aSeedA, 1));
    geometry.setAttribute("aSeedB", new THREE.BufferAttribute(aSeedB, 1));
    geometry.setAttribute("aFrayA", new THREE.BufferAttribute(aFrayA, 1));
    geometry.setAttribute("aFrayB", new THREE.BufferAttribute(aFrayB, 1));
    geometry.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geometry.setAttribute("aBirth", new THREE.BufferAttribute(aBirth, 1));
    geometry.setAttribute("aWeights", new THREE.BufferAttribute(aWeights, 4));

    const lines = new THREE.LineSegments(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { ...this.shared, uLineAlpha: alpha, uLinesFree: { value: free }, uEcho: { value: 0 } },
        vertexShader: LINES_VERT,
        fragmentShader: LINES_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    lines.frustumCulled = false;
    return lines;
  }

  private facetLayer(tris: [number, number, number][]) {
    const g = this.points!.geometry;
    const P = g.getAttribute("position").array as Float32Array;
    const S = this.pointSeed;
    const F = this.pointFray;
    const n = tris.length * 3;
    const position = new Float32Array(n * 3);
    const aSeed = new Float32Array(n);
    const aFray = new Float32Array(n);
    const aBirth = new Float32Array(n);
    const aWeights = new Float32Array(n * 4);
    let v = 0;
    for (const t of tris) {
      const born = Math.max(this.births[t[0]], this.births[t[1]], this.births[t[2]]);
      for (const i of t) {
        position.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], v * 3);
        aSeed[v] = S[i];
        aFray[v] = F[i];
        aBirth[v] = born;
        aWeights.set(this.fragments[i].weights, v * 4);
        v++;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geometry.setAttribute("aFray", new THREE.BufferAttribute(aFray, 1));
    geometry.setAttribute("aBirth", new THREE.BufferAttribute(aBirth, 1));
    geometry.setAttribute("aWeights", new THREE.BufferAttribute(aWeights, 4));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { ...this.shared, uFacetAlpha: this.facetAlpha, uEcho: { value: 0 } },
        vertexShader: FACETS_VERT,
        fragmentShader: LINES_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Faint unplaced anchors. Style only, off by default: the mannequin is meant to be invisible. */
  private buildGhost() {
    this.removeLayer(this.ghost);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.anchors.pos, 3));
    this.ghost = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { ...this.shared },
        vertexShader: GHOST_VERT,
        fragmentShader: GHOST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.ghost.frustumCulled = false;
    this.ghost.visible = this.style.ghost;
    this.body.add(this.ghost);
  }

  private writeGlyphs() {
    if (!this.points) return;
    const preset = this.style.glyphs;
    const attr = this.points.geometry.getAttribute("aMisc") as THREE.BufferAttribute;
    if (preset === "ascii") {
      for (let i = 0; i < this.fragments.length; i++) attr.setW(i, ASCII_GLYPH);
    } else {
      const mix = preset === "genome" ? this.genome.glyphs : GLYPH_PRESETS[preset];
      const total = mix[0] + mix[1] + mix[2] + mix[3];
      this.fragments.forEach((f, i) => {
        let r = hash01(`${f.id}:glyph`) * total;
        let g = 0;
        while (g < 3 && r >= mix[g]) r -= mix[g++];
        attr.setW(i, g);
      });
    }
    attr.needsUpdate = true;
  }

  private writeBirths() {
    if (!this.points) return;
    const attr = this.points.geometry.getAttribute("aBirth") as THREE.BufferAttribute;
    this.births.forEach((b, i) => attr.setX(i, b));
    attr.needsUpdate = true;
  }

  /** The palette currently in use, as hex, so the panel's colour pickers start from it. */
  paletteHex(): [string, string, string, string] {
    const { uHead, uHeart, uGut, uSpirit } = this.shared;
    return [uHead, uHeart, uGut, uSpirit].map((u) => `#${u.value.getHexString()}`) as [string, string, string, string];
  }

  /** Everything that's a uniform: genome character plus the user's style. Cheap to call. */
  private applyLooks() {
    const g = this.genome;
    const s = this.style;
    const rare = g.rare;
    const palette = paletteFor(g.hue + s.hueShift, s.harmony ?? g.harmony, rare === "monochrome");
    const colours = s.colours ? s.colours.map((c) => new THREE.Color(c)) : palette;
    // Balance: each region's gain evens out its organ's light (density times colour luminance)
    // against the average, then the user's trims apply. It applies to organ nodes only: a gut
    // remark that overflowed into a knee shouldn't glow like the gut.
    const luminance = colours.slice(0, 3).map((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b + 1e-3);
    const light = this.regionLight.map((l, r) => l * luminance[r]);
    const mean = (light[0] + light[1] + light[2]) / 3;
    const gains = light.map((l, r) => {
      const even = Math.min(4, Math.max(0.2, (mean / l) ** 1.5));
      return (1 + (even - 1) * s.glowBalance) * s.regionGlow[r];
    });
    this.shared.uHead.value.copy(colours[0]);
    this.shared.uHeart.value.copy(colours[1]);
    this.shared.uGut.value.copy(colours[2]);
    this.shared.uSpirit.value.copy(colours[3]);
    this.pointUniforms.uSpiritGain.value = s.regionGlow[3];
    this.pointUniforms.uAuraHues.value = s.auraHues;
    this.pointUniforms.uRegionGain.value.set(gains[0], gains[1], gains[2]);
    const size = gains.map((g) => Math.min(1.8, Math.max(0.75, 1 + (g - 1) * 0.35)));
    this.pointUniforms.uRegionSize.value.set(size[0], size[1], size[2]);
    // Overall glow dims the nodes too, or dense organs stay clipped. And as the body fills, each
    // node gives a little less light, so a full figure reads as density, not a white blaze.
    const density = Math.min(1, (4500 / Math.max(this.bodyNodes, 1)) ** 0.8) / (1 + 1.5 * this.shared.uEther.value); // the ether spreads the light thin
    this.shared.uExposure.value = s.exposure * (0.35 + 0.65 * s.glowMaster) * density;
    // The aura is sparse and has no organ glow, so the body's density dimming nearly erased it in a
    // full Legend (spirit at 40k sat at a sixth of its light). It answers to its own density instead:
    // gently dimmer as it fills, never by how full the body is.
    const auraDensity = Math.min(1, (3000 / Math.max(this.auraNodes, 1)) ** 0.35);
    this.pointUniforms.uAuraLift.value = (auraDensity / Math.max(density, 1e-3)) * (1 / (1 + 1.5 * this.shared.uEther.value));
    this.pointUniforms.uColourBleed.value = s.colourBleed;
    this.pointUniforms.uColourMode.value = COLOUR_STORY[s.colourStory];
    this.pointUniforms.uVariation.value = s.variation;
    this.pointUniforms.uCoreGlow.value = s.coreGlow * s.glowMaster;
    // Body light: a deepened node's k-th point adds k^p - (k-1)^p of a point's light. p 1 lets dense
    // organs blaze; 0.5 (the default) shines like sqrt(k); near 0 every node is one point of light.
    // Past the middle the skin and limbs are lifted too, up to most of the way out of the density
    // dimming below, which only the organs' own glow can otherwise outshine: the whole body reads.
    const bodyLight = s.bodyLight ?? 0.5;
    const p = Math.max(0.05, 1 - bodyLight);
    this.pointUniforms.uStackPow.value = p;
    // It moves light between the organs and the rest rather than adding or removing it: the body's
    // total stays where the default (sqrt) puts it, judged by the average node's depth.
    const depth = this.bodyPoints / Math.max(this.bodyNodes, 1);
    const undim = (1 / Math.max(density, 1e-3)) ** 0.7 - 1;
    this.pointUniforms.uSkinLift.value = (1 + Math.max(0, bodyLight - 0.5) * 2 * undim) * depth ** (0.5 - p);
    // Grain: crisper points, and smaller as the body fills, so a full figure reads as specks, not fog.
    const grain = s.grain ?? 0;
    const shrink = Math.min(1, Math.max(0.45, (8000 / Math.max(this.bodyNodes, 1)) ** 0.3));
    this.pointUniforms.uGrain.value = grain;
    this.pointUniforms.uGrainSize.value = 1 + (0.75 * shrink - 1) * grain;
    // The polygon: a coarse mesh has far fewer lines, so each can carry more light.
    const wires = (s.wireStrength ?? 1) * (1 + 3 * (s.meshScale ?? 0));
    this.wireAlpha.value = 0.035 * wires;
    this.facetAlpha.value = 0.012 * wires;
    this.pointUniforms.uHeartbeat.value = s.heartbeat;
    this.pointUniforms.uGutFlow.value = s.gutFlow;
    this.pointUniforms.uNeural.value = s.neural;
    this.pointUniforms.uGlyphCycle.value = s.glyphCycle;
    this.pointUniforms.uAsciiCycle.value = s.asciiCycle;
    this.shared.uDrift.value = (s.drift ?? g.drift) * (rare === "ash" ? 2.5 : 1);
    this.shared.uFlowScale.value = g.flowScale;
    this.shared.uFlowMode.value = rare === "ash" ? 0 : { rising: 0, falling: 1, orbiting: 2 }[g.flowBias];
    this.shared.uBreathDepth.value = g.breathDepth;
    this.shared.uSway.value = g.sway;
    this.shared.uShoulderX.value = shoulderX(s.body);
    this.shared.uTorsoHalf.value = torsoHalf(s.body);
    this.shared.uHipX.value = legHipX(s.body);
    this.shared.uElbowX.value = elbowX(s.body);
    this.shared.uGround.value = s.body.mode === "body" ? LEG.groundY : -0.3;
    this.shared.uLegsOn.value = s.body.mode === "body" ? 1 : 0;
    this.shared.uAuraWarp.value = s.auraWarp ?? 1; // presets saved before it existed lack it
    this.pointUniforms.uPulseSharp.value = g.pulseShape;
    this.pointUniforms.uFlicker.value = g.flicker;
    this.pointUniforms.uLanding.value = { flash: 0, bloom: 1, ripple: 2 }[g.landing];
    this.pointUniforms.uSize.value = rare === "constellation" ? 3.5 : 7;
    this.pointUniforms.uNegative.value = rare === "negative" ? Math.floor(hash01(`${g.seed}:negative`) * 3) : -1;
    this.edgeAlpha.value = rare === "constellation" ? 0.12 : 0.04;

    const glow = s.glow ?? g.glow;
    this.bloom.strength = (0.5 + glow * 1.1) * s.glowMaster;
    this.bloom.radius = s.bloomRadius ?? 0.15 + glow * 0.6;
    this.bloom.threshold = s.bloomThreshold;
    const smear = s.smear ?? g.smear;
    configureSmear(this.smear, s.smearAxis ?? g.smearAxis, smear);
    this.smear.uniforms.uSignal.value = rare === "signal" ? 1 : 0;
    this.afterimage.enabled = smear > 0.02;
    this.afterimage.uniforms["damp"].value = 0.55 + smear * 0.4;
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  private tick() {
    const t = this.clock.getElapsedTime();
    this.shared.uTime.value = t;
    this.smear.uniforms.uTime.value = t;
    applyEffects(this.grade, this.style.fx, t);
    // Tempo is data: in the sketch it comes from the simulated pace (fragments per replay second).
    const pace = simTotal(this.sim) / Math.max(this.sim.replaySeconds, 1);
    this.pointUniforms.uBeatRate.value = 0.55 + Math.min(pace / 500, 0.4); // ~45 bpm at the default pace
    this.shared.uBreathRate.value = 0.16 + Math.min(pace / 4000, 0.1);
    this.breathe(t);
    this.animateIdle(t);
    this.animateWalk(t);
    this.animateFloat(t);
    this.controls.update();
    this.composer.render();
    if (++this.frame % 30 === 0) this.emitStats();
  }

  /**
   * How human the figure still is: 1 while the ether is thin, falling to 0 as it grows (gone at
   * 60% of ETHER_FULL, about 72k ether nodes). Past that point it isn't a person any more.
   */
  private humanness() {
    return Math.max(0, 1 - this.shared.uEther.value / 0.6);
  }

  /** Mood: the region mix of the last 300 fragments born (65%) over the whole Legend's (35%). */
  private updateMood(t: number) {
    const life: Mood = [0, 0, 0, 0];
    const recent: Mood = [0, 0, 0, 0];
    const born: number[] = [];
    const limit = this.cutoff ?? Infinity;
    this.fragments.forEach((f, i) => {
      if (i >= limit || (this.births[i] ?? Infinity) > t) return;
      const w = f.weights;
      const r = w.indexOf(Math.max(...w));
      life[r]++;
      born.push(r);
    });
    for (const r of born.slice(-300)) recent[r]++;
    const norm = (m: Mood) => {
      const s = m.reduce((a, b) => a + b, 0) || 1;
      return m.map((x) => x / s) as Mood;
    };
    const l = norm(life), n = norm(recent);
    this.mood = l.map((x, i) => 0.35 * x + 0.65 * n[i]) as Mood;
  }

  /**
   * React to new fragments once a burst has settled (a prompt lands as several at once): look
   * toward where they landed, then answer in their strongest region. At most one every 6 s.
   */
  private maybeReact(t: number) {
    if (!this.pending.length || t - this.lastArrival < 0.8 || t - this.lastReaction < 6) return;
    const burst = this.pending;
    this.pending = [];
    if (this.humanness() < 0.3) return;
    const sum: Mood = [0, 0, 0, 0];
    let intensity = 0;
    const at = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const { pos, normal: normals, layer, arm } = this.anchors;
    let n = 0, onBody = 0, onArm = 0;
    for (const i of burst) {
      const f = this.fragments[i];
      f.weights.forEach((w, k) => (sum[k] += w));
      intensity = Math.max(intensity, f.intensity);
      const a = this.placement.anchorOf[i];
      if (a >= 0) {
        at.x += pos[a * 3];
        at.y += pos[a * 3 + 1];
        at.z += pos[a * 3 + 2];
        normal.x += normals[a * 3];
        normal.y += normals[a * 3 + 1];
        normal.z += normals[a * 3 + 2];
        if (layer[a] === 0) onBody++;
        if (arm[a]) onArm += Math.sign(pos[a * 3]);
        n++;
      }
    }
    if (n) at.divideScalar(n);
    else at.set(0, 0.55, 1);
    // Where it landed, for an answer in place: on the body if most of the burst did.
    const body = this.style.body;
    const land: Landing | undefined = n
      ? {
          at: [at.x, at.y, at.z],
          normal: normal.normalize().toArray() as [number, number, number],
          onBody: onBody * 2 > n,
          arm: Math.abs(onArm) * 2 > n ? Math.sign(onArm) : 0,
          shoulderX: shoulderX(body),
          elbowX: elbowX(body),
        }
      : undefined;
    // From the head: a burst on the chest is a look down at it; one out in the aura, a look out.
    const d = at.sub(new THREE.Vector3(0, 0.55, 0.05));
    const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(d.x, Math.max(0.05, d.z))));
    const pitch = Math.max(-0.5, Math.min(0.55, Math.atan2(-d.y, Math.hypot(d.x, d.z))));
    this.choreographer.react(t, sum.indexOf(Math.max(...sum)), intensity, { yaw, pitch }, land);
    this.lastReaction = t;
  }

  /**
   * The temperament comes from the person, not a setting: the strongest region of their mood.
   * A thinker is watchful, a heart is calm, a gut is restless, a spirit is contemplative.
   */
  private temperament(): Idle {
    const order: Idle[] = ["watchful", "calm", "restless", "contemplative"];
    return order[this.mood.indexOf(Math.max(...this.mood))];
  }

  private animateIdle(t: number) {
    const human = this.humanness();
    if (this.frame % 30 === 0) this.updateMood(t);
    this.maybeReact(t);
    const mode = this.walkAir > 0.5 ? "air" : this.shared.uWalk.value > 0.5 ? "walk" : "ground";
    const raw = this.choreographer.pose(t, this.temperament(), this.genome.sway, mode, this.mood);
    // Idles, gestures and head tilts fade with the ether; elbows ease back to rest.
    const pose = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k.startsWith("elbow") ? 0.08 + (v - 0.08) * human : v * human])) as unknown as typeof raw;
    this.shared.uBreathDepth.value = this.genome.breathDepth * human;
    this.applyPose(pose);
  }

  private applyPose(pose: Pose) {
    const u = this.shared;
    u.uLookYaw.value = pose.yaw;
    u.uLookPitch.value = pose.pitch;
    u.uLookRoll.value = pose.roll;
    u.uShoulderL.value = pose.shoulderL;
    u.uShoulderR.value = pose.shoulderR;
    u.uArmL.value = pose.armL;
    u.uArmR.value = pose.armR;
    u.uLean.value = pose.lean;
    u.uBodyYaw.value = pose.bodyYaw;
    u.uBodyPitch.value = pose.bodyPitch;
    u.uFlexL.value = pose.flexL;
    u.uFlexR.value = pose.flexR;
    u.uAbdL.value = pose.abdL;
    u.uAbdR.value = pose.abdR;
    u.uElbowL.value = pose.elbowL;
    u.uElbowR.value = pose.elbowR;
    u.uLegFlexL.value = pose.legFlexL;
    u.uLegFlexR.value = pose.legFlexR;
    u.uLegAbdL.value = pose.legAbdL;
    u.uLegAbdR.value = pose.legAbdR;
    u.uLegTwistL.value = pose.legTwistL;
    u.uLegTwistR.value = pose.legTwistR;
    u.uKneeL.value = pose.kneeL;
    u.uKneeR.value = pose.kneeR;
    u.uPoint.value = pose.point;
  }

  /**
   * Imagery: render the ten shots (imagery.ts) off-screen at full size, each pose held still, and
   * hand back JPEGs. The live view pauses meanwhile and comes back exactly as it was.
   */
  async captureImagery(onProgress?: (done: number) => void): Promise<{ name: string; dataUrl: string }[]> {
    this.renderer.setAnimationLoop(null);
    const saved = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      up: this.camera.up.clone(),
      fov: this.camera.fov,
      bodyPosition: this.body.position.clone(),
      bodyRotation: this.body.rotation.clone(),
      fisheye: this.grade.uniforms.fisheye.value as number,
      pixelRatio: this.renderer.getPixelRatio(),
      walk: this.shared.uWalk.value,
      exhale: this.shared.uExhale.value,
    };
    const { width, height } = IMAGE_SIZE;
    const base = new THREE.Vector3(this.body.position.x, 0, this.body.position.z);
    const out: { name: string; dataUrl: string }[] = [];
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height);
      this.bloom.resolution.set(width, height);
      this.smear.uniforms.uRes.value.set(width, height);
      this.shared.uWalk.value = 0;
      this.shared.uExhale.value = 0;
      // Points keep the size they have relative to the figure in the live view.
      this.shared.uViewScale.value *= height / Math.max(1, this.host.clientHeight);
      for (const [i, shot] of SHOTS.entries()) {
        this.applyPose(stillPose(shot.pose, this.genome.seed));
        this.body.position.set(base.x, isAirPose(shot.pose) ? 0.32 : 0, base.z);
        this.body.rotation.set(0, 0, 0);
        const target = base.clone().add(new THREE.Vector3(0, shot.lookY + this.body.position.y, 0));
        const flat = Math.cos(shot.elevation) * shot.distance;
        this.camera.position.set(target.x + Math.sin(shot.azimuth) * flat, target.y + Math.sin(shot.elevation) * shot.distance, target.z + Math.cos(shot.azimuth) * flat);
        this.camera.up.set(Math.sin(shot.roll ?? 0), Math.cos(shot.roll ?? 0), 0);
        this.camera.fov = shot.fov;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(target);
        this.grade.uniforms.fisheye.value = shot.fisheye ?? 0;
        this.shared.uTime.value = this.clock.getElapsedTime();
        // Several passes, so the trails and afterimage settle on the new view.
        for (let k = 0; k < 6; k++) this.composer.render();
        out.push({ name: `${String(i + 1).padStart(2, "0")}-${shot.name}`, dataUrl: this.renderer.domElement.toDataURL("image/jpeg", 0.92) });
        onProgress?.(i + 1);
        await new Promise((r) => setTimeout(r, 0)); // let the page breathe between shots
      }
    } finally {
      this.renderer.setPixelRatio(saved.pixelRatio);
      this.camera.position.copy(saved.position);
      this.controls.target.copy(saved.target);
      this.camera.up.copy(saved.up);
      this.camera.fov = saved.fov;
      this.body.position.copy(saved.bodyPosition);
      this.body.rotation.copy(saved.bodyRotation);
      this.grade.uniforms.fisheye.value = saved.fisheye;
      this.shared.uWalk.value = saved.walk;
      this.shared.uExhale.value = saved.exhale;
      this.resize();
      this.renderer.setAnimationLoop(() => this.tick());
    }
    return out;
  }

  /** Body mode: step the walk, move the figure through the space, and let the camera follow. */
  private animateWalk(t: number) {
    const dt = Math.min(0.1, t - this.lastTick);
    this.lastTick = t;
    const human = this.humanness();
    // In body mode the figure always has a journey: standing, walking, levitating, chosen by mood.
    const walking = this.style.body.mode === "body" && human > 0.5;
    const w = this.walker.step(dt, t, walking, false, this.mood);
    this.walkAir = this.style.body.mode === "body" ? w.air : 0;
    const u = this.shared;
    u.uWalk.value = w.weight * human;
    u.uPhase.value = w.phase;
    u.uStride.value = w.stride;
    u.uBob.value = w.bob;
    u.uSwing.value = w.swing;
    if (this.style.body.mode !== "body") return;
    const delta = new THREE.Vector3(w.x - this.walkBase.x, 0, w.z - this.walkBase.z);
    this.walkBase = { x: w.x, z: w.z, heading: w.heading };
    // When tracking, the camera follows the walker, keeping whatever angle the user has orbited to.
    if (this.style.track) {
      this.camera.position.add(delta);
      this.controls.target.add(delta);
    }
    if (w.weight > 0.01) {
      // While walking the legs belong to the gait: no weight shifts, hip turns or leans. The head,
      // shoulders and gestures carry on; an idle arm drawn in gives way to the swing.
      u.uLean.value *= 1 - w.weight;
      u.uBodyYaw.value *= 1 - w.weight;
      u.uBodyPitch.value *= 1 - w.weight;
      if (u.uFlexL.value < 0.3 && u.uElbowL.value < 0.3) u.uArmL.value *= 1 - w.weight;
      if (u.uFlexR.value < 0.3 && u.uElbowR.value < 0.3) u.uArmR.value *= 1 - w.weight;
    }
  }

  /**
   * Past human: the figure floats. As the ether grows it slowly turns, rises and falls and sways as
   * one body of light, drifting rather than standing. Applied to the whole figure, on top of
   * wherever the walker left it.
   */
  private animateFloat(t: number) {
    const angel = 1 - this.humanness();
    this.floatSpin += Math.min(0.1, Math.max(0, t - this.lastFloat)) * 0.07 * angel;
    this.lastFloat = t;
    const base = this.style.body.mode === "body" ? this.walkBase : { x: 0, z: 0, heading: 0 };
    // Levitating lifts the figure clear of the ground, with a slow bob.
    const lift = this.walkAir * (0.32 + 0.03 * Math.sin(t * 0.6));
    this.body.position.set(base.x, lift + angel * 0.14 * Math.sin(t * 0.23), base.z);
    this.body.rotation.set(angel * 0.05 * Math.sin(t * 0.11 + 1), base.heading + this.floatSpin, angel * 0.06 * Math.sin(t * 0.17));
  }
  private lastFloat = 0;

  /** The idle move playing right now, for the panel. */
  get idleMove() {
    return this.choreographer.current;
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.smear.uniforms.uRes.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Points are sized in pixels, so a small window (the widget) drew them far bigger relative to the
    // figure: they piled up and blew out. Below VIEW_HEIGHT they shrink with the window instead.
    this.shared.uViewScale.value = Math.min(1, Math.max(0.15, h / VIEW_HEIGHT));
    // Resizing clears the canvas, and this runs after the frame was drawn, so draw again now or the
    // window shows a blank frame at every step of a resize.
    this.composer.render();
  }

  private emitStats() {
    if (!this.onStats) return;
    const now = this.clock.getElapsedTime();
    const regions: [number, number, number, number] = [0, 0, 0, 0];
    let placed = 0;
    let born = 0;
    const layers = { aura: 0, ether: 0 };
    this.fragments.forEach((f, i) => {
      const l = this.pointLayer[i] ?? 0;
      if (i >= (this.cutoff ?? Infinity) || (this.births[i] ?? Infinity) > now) return;
      born++;
      if (l >= 1 && l <= 7) layers.aura++;
      else if (l >= SPACE_LAYER) {
        layers.ether++;
        return; // the ether isn't head, heart, gut or spirit any more
      }
      if (this.placement.anchorOf[i] < 0) return;
      const w = f.weights;
      regions[w.indexOf(Math.max(...w))]++;
      placed++;
    });
    const share = (x: number) => (placed ? x / placed : 0);
    this.onStats({ placed, born, capacity: this.anchors.count, regions: regions.map(share) as Stats["regions"], ...layers, move: this.choreographer.current, route: this.style.body.mode === "body" ? this.walker.route : "" });
  }

  private removeLayer(o?: THREE.Object3D) {
    if (!o) return;
    this.body.remove(o);
    if (o instanceof THREE.Points || o instanceof THREE.LineSegments || o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
