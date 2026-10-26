// The genome: the body's temperament, drawn once from the first words and locked.
// Every gene is drawn from its own hash, so adding a gene never moves the others.
import * as THREE from "three";
import { rngFor } from "./rng";

export type Growth = "outline" | "core" | "spiral";
export type FlowBias = "rising" | "falling" | "orbiting";
export type Harmony = "analogous" | "triadic" | "split";
export type SmearAxis = "horizontal" | "vertical" | "depth" | "radial" | "swirl" | "all";
export type EdgeStyle = "straight" | "curved" | "hover";
export type Landing = "flash" | "bloom" | "ripple";
export type RareTrait = "ash" | "monochrome" | "signal" | "double" | "constellation" | "negative";
export type GlyphMix = [dot: number, square: number, cross: number, triangle: number];

export const RARE_TRAITS: RareTrait[] = ["ash", "monochrome", "signal", "double", "constellation", "negative"];
export const RARE_ODDS = 1 / 50;

export interface Genome {
  version: 1;
  seed: string;
  // Form
  jitter: number;
  shellBias: number;
  symmetry: number;
  regionBleed: number;
  growth: Growth;
  // Flow
  flowScale: number;
  flowBias: FlowBias;
  drift: number;
  breathDepth: number;
  pulseShape: number;
  sway: number;
  // Light
  hue: number;
  harmony: Harmony;
  glow: number;
  flicker: number;
  glyphs: GlyphMix;
  smearAxis: SmearAxis;
  smear: number;
  // Connection and landing
  edgeStyle: EdgeStyle;
  edgeReach: number;
  landing: Landing;
  // One genome in fifty
  rare: RareTrait | null;
}

/** The seed is the first words plus the moment of birth. Hashed, never read (rule 4). */
export const makeSeed = (firstWords: string, createdAt: string) => `${firstWords.trim()}|${createdAt}`;

/**
 * Draw a genome. The ranges are the art direction: the seed picks inside them, so no genome can
 * come out ugly, only different (rule 1). They're tuned by eye.
 */
export function drawGenome(seed: string): Genome {
  const r = (gene: string) => rngFor(`${seed}:${gene}`)();
  const range = (gene: string, lo: number, hi: number) => lo + (hi - lo) * r(gene);
  const pick = <T,>(gene: string, options: readonly T[]) => options[Math.floor(r(gene) * options.length)];

  const glyphRng = rngFor(`${seed}:glyphs`);
  const glyphs: GlyphMix = [0.4 + 0.6 * glyphRng(), 0.4 * glyphRng(), 0.4 * glyphRng(), 0.4 * glyphRng()];

  return {
    version: 1,
    seed,
    jitter: range("jitter", 0, 0.6),
    shellBias: range("shellBias", 0, 1),
    symmetry: range("symmetry", 0.6, 1),
    regionBleed: range("regionBleed", 0, 0.4),
    growth: pick("growth", ["outline", "core", "spiral"] as const),
    flowScale: range("flowScale", 1.5, 6),
    flowBias: pick("flowBias", ["rising", "falling", "orbiting"] as const),
    drift: range("drift", 0.002, 0.03),
    breathDepth: range("breathDepth", 0.5, 1.5),
    pulseShape: range("pulseShape", 1, 12),
    sway: range("sway", 0.5, 1.5),
    hue: range("hue", 0, 360),
    harmony: pick("harmony", ["analogous", "triadic", "split"] as const),
    glow: range("glow", 0, 1),
    flicker: range("flicker", 0, 0.3),
    glyphs,
    smearAxis: pick("smearAxis", ["horizontal", "vertical", "depth", "radial", "swirl", "all"] as const),
    smear: range("smear", 0, 0.5),
    edgeStyle: pick("edgeStyle", ["straight", "curved", "hover"] as const),
    edgeReach: Math.round(range("edgeReach", 2, 8)),
    landing: pick("landing", ["flash", "bloom", "ripple"] as const),
    rare: r("rare") < RARE_ODDS ? pick("rareTrait", RARE_TRAITS) : null,
  };
}

/** Head, heart and gut colours from a root hue and a harmony rule. */
/** Head, heart, gut and spirit colours. Spirit is a pale, luminous complement: the aura's light. */
export function paletteFor(hue: number, harmony: Harmony, monochrome: boolean): [THREE.Color, THREE.Color, THREE.Color, THREE.Color] {
  const h = (deg: number) => (((deg % 360) + 360) % 360) / 360;
  if (monochrome) {
    return [
      new THREE.Color().setHSL(h(hue), 0.55, 0.78),
      new THREE.Color().setHSL(h(hue), 0.6, 0.55),
      new THREE.Color().setHSL(h(hue), 0.65, 0.36),
      new THREE.Color().setHSL(h(hue), 0.3, 0.88),
    ];
  }
  const step = harmony === "analogous" ? 40 : harmony === "triadic" ? 120 : 150;
  return [
    new THREE.Color().setHSL(h(hue), 0.8, 0.62),
    new THREE.Color().setHSL(h(hue + step), 0.8, 0.6),
    new THREE.Color().setHSL(h(hue + 2 * step), 0.8, 0.58),
    new THREE.Color().setHSL(h(hue + 180), 0.45, 0.78),
  ];
}
