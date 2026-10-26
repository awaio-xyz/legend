// The style controls, grouped into the categories the dock flies out to: Figure, Colour, Light and
// Effects. The dock's settings panels render these.
import { paletteFor, type EdgeStyle, type Genome, type Harmony, type SmearAxis } from "../engine/genome";
import { randomStyle, type ColourStory, type GlyphPreset, type Polygon, type Style } from "../engine/legend";
import type { BodyParams } from "../engine/mannequin";
import * as THREE from "three";
import { EFFECTS, type EffectGroup } from "../engine/grade";
import { Row, Select, Slider, Toggle } from "./controls";

export type Category = "figure" | "colour" | "light" | "effects";
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "figure", label: "Figure" },
  { id: "colour", label: "Colour" },
  { id: "light", label: "Light" },
  { id: "effects", label: "Effects" },
];

/** Which style keys belong to each category, so one category can be randomised alone. */
const KEYS: Record<Category, (keyof Style)[]> = {
  figure: ["body", "auraWarp"],
  colour: ["hueShift", "harmony", "colours", "colourStory", "colourBleed", "variation", "auraHues", "glyphs", "glyphCycle", "asciiCycle"],
  light: ["glowMaster", "glowBalance", "regionGlow", "exposure", "coreGlow", "heartbeat", "gutFlow", "neural", "glow", "bloomRadius", "bloomThreshold"],
  effects: ["fx", "smear", "smearAxis", "drift", "polygon", "edgeStyle"],
};

/** Randomise one category (or all of them), keeping the bust/body choice. */
export function randomise(style: Style, category?: Category): Style {
  const rolled = randomStyle();
  const keys = category ? KEYS[category] : (Object.keys(rolled) as (keyof Style)[]);
  const next = { ...style } as Record<keyof Style, unknown>;
  for (const k of keys) next[k] = rolled[k];
  const out = next as Style;
  return { ...out, body: { ...out.body, mode: style.body.mode } };
}

interface Props {
  s: Style;
  set: (patch: Partial<Style>) => void;
  genome: Genome;
}

const g = (label: string, overridden: boolean) => `${label}${overridden ? "" : " (genome)"}`;
const REGIONS = ["head", "heart", "gut", "spirit"] as const;

export function FigureSection({ s, set }: Props) {
  const setBody = (patch: Partial<BodyParams>) => set({ body: { ...s.body, ...patch } });
  return (
    <>
      <Row label="mode">
        <span className="segmented">
          {(["bust", "body"] as const).map((m) => (
            <button key={m} className={s.body.mode === m ? "on" : ""} onClick={() => setBody({ mode: m })}>
              {m}
            </button>
          ))}
        </span>
      </Row>
      {s.body.mode === "body" && <Toggle label="camera tracks" value={s.track} onChange={(v) => set({ track: v })} />}
      <Slider label="form" hint="masc ↔ fem" min={0} max={1} step={0.01} value={s.body.form} onChange={(v) => setBody({ form: v })} />
      <Slider label="build" hint="thin ↔ bulky" min={0.8} max={1.25} step={0.01} value={s.body.build} onChange={(v) => setBody({ build: v })} />
      <Slider label="shoulders" min={0.85} max={1.15} step={0.01} value={s.body.shoulders} onChange={(v) => setBody({ shoulders: v })} />
      <Slider label="head" min={0.85} max={1.15} step={0.01} value={s.body.head} onChange={(v) => setBody({ head: v })} />
      <Slider label="aura warp" hint="still ↔ dramatic" min={0} max={2} step={0.01} value={s.auraWarp ?? 1} onChange={(v) => set({ auraWarp: v })} />
    </>
  );
}

export function ColourSection({ s, set, genome }: Props) {
  const palette =
    s.colours ??
    (paletteFor(genome.hue + s.hueShift, s.harmony ?? genome.harmony, genome.rare === "monochrome").map((c) => `#${c.getHexString()}`) as [string, string, string, string]);
  const setColour = (i: number, hex: string) => {
    const next = [...palette] as [string, string, string, string];
    next[i] = hex;
    set({ colours: next });
  };
  return (
    <>
      <Row label={s.colours ? "regions" : "regions (genome)"}>
        <span className="swatches">
          {REGIONS.map((r, i) => (
            <input key={r} type="color" title={r} value={palette[i]} onChange={(e) => setColour(i, e.target.value)} />
          ))}
          {s.colours && (
            <button className="mini" onClick={() => set({ colours: null })}>
              ↺
            </button>
          )}
        </span>
      </Row>
      <Slider label="palette shift" min={-180} max={180} step={1} value={s.hueShift} onChange={(v) => set({ hueShift: v, colours: null })} />
      <Select<Harmony>
        label={g("harmony", s.harmony !== null)}
        value={s.harmony ?? genome.harmony}
        options={[["analogous", "analogous (soft)"], ["triadic", "triadic (distinct)"], ["split", "split"]]}
        onChange={(v) => set({ harmony: v, colours: null })}
      />
      <Select<ColourStory> label="light tells" value={s.colourStory} options={[["region", "region"], ["topic", "topic"], ["time", "time (old → new)"], ["intensity", "intensity"]]} onChange={(v) => set({ colourStory: v })} />
      <Slider label="aura hues" hint="spirit ↔ chakra" min={0} max={1} step={0.01} value={s.auraHues} onChange={(v) => set({ auraHues: v })} />
      <Slider label="colour bleed" hint="sharp ↔ washed" min={0} max={1} step={0.01} value={s.colourBleed} onChange={(v) => set({ colourBleed: v })} />
      <Slider label={s.colourStory === "time" ? "recent window" : "variation"} hint={s.colourStory === "time" ? "narrow ↔ wide" : "one ↔ many"} min={0} max={1} step={0.01} value={s.variation} onChange={(v) => set({ variation: v })} />
      <Select<GlyphPreset> label="glyphs" value={s.glyphs} options={[["genome", "genome"], ["dots", "dots"], ["glyphs", "glyph mix"], ["squares", "squares"], ["ascii", "ASCII"]]} onChange={(v) => set({ glyphs: v })} />
      <Slider label="glyph mix cycle" hint="still ↔ restless" min={0} max={1} step={0.01} value={s.glyphCycle} onChange={(v) => set({ glyphCycle: v })} />
      {(s.glyphs === "ascii" || s.glyphCycle > 0) && <Slider label="ASCII cycle" hint="still ↔ restless" min={0} max={1} step={0.01} value={s.asciiCycle} onChange={(v) => set({ asciiCycle: v })} />}
    </>
  );
}

export function LightSection({ s, set, genome }: Props) {
  return (
    <>
      <Slider label="overall glow" hint="dim ↔ blazing" min={0} max={1.5} step={0.01} value={s.glowMaster} onChange={(v) => set({ glowMaster: v })} />
      <Slider label="balance" hint="raw ↔ even" min={0} max={1} step={0.01} value={s.glowBalance} onChange={(v) => set({ glowBalance: v })} />
      {REGIONS.map((r, i) => (
        <Slider
          key={r}
          label={`${r} glow`}
          min={0.2}
          max={2}
          step={0.01}
          value={s.regionGlow[i]}
          onChange={(v) => {
            const next = [...s.regionGlow] as Style["regionGlow"];
            next[i] = v;
            set({ regionGlow: next });
          }}
        />
      ))}
      <Slider label="exposure" min={0.2} max={2} step={0.01} value={s.exposure} onChange={(v) => set({ exposure: v })} />
      <Slider label="core mass" hint="flat ↔ dense" min={0} max={1.5} step={0.01} value={s.coreGlow} onChange={(v) => set({ coreGlow: v })} />
      <Slider label="heartbeat" hint="faint ↔ strong" min={0} max={1.5} step={0.01} value={s.heartbeat} onChange={(v) => set({ heartbeat: v })} />
      <Slider label="gut flow" hint="still ↔ flowing" min={0} max={1.5} step={0.01} value={s.gutFlow} onChange={(v) => set({ gutFlow: v })} />
      <Slider label="neurons" hint="quiet ↔ firing" min={0} max={1.5} step={0.01} value={s.neural} onChange={(v) => set({ neural: v })} />
      <Slider label={g("bloom radius", s.bloomRadius !== null)} min={0} max={1} step={0.01} value={s.bloomRadius ?? 0.15 + genome.glow * 0.6} onChange={(v) => set({ bloomRadius: v })} />
      <Slider label="bloom threshold" min={0} max={0.6} step={0.01} value={s.bloomThreshold} onChange={(v) => set({ bloomThreshold: v })} />
    </>
  );
}

const GROUP_LABELS: Record<EffectGroup, string> = { grade: "grade", crt: "CRT", film: "film", glitch: "glitch", focus: "focus" };
type Subsection = EffectGroup | "motion" | "lines";

/** Re-roll one subsection of Effects, leaving the rest of the look alone. */
function randomiseSubsection(s: Style, sub: Subsection): Partial<Style> {
  const rolled = randomStyle();
  if (sub === "motion") return { smear: rolled.smear, smearAxis: rolled.smearAxis, drift: rolled.drift };
  if (sub === "lines") return { polygon: rolled.polygon, edgeStyle: rolled.edgeStyle };
  const keys = EFFECTS.filter((e) => e.group === sub).map((e) => e.key);
  return { fx: { ...s.fx, ...Object.fromEntries(keys.map((k) => [k, rolled.fx[k]])) } };
}

const Dice = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    {[[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />)}
  </svg>
);

function Head({ label, onRoll }: { label: string; onRoll: () => void }) {
  return (
    <h3 className="sub-head">
      {label}
      <button className="mini" title={`Randomise ${label}`} onClick={onRoll}>
        <Dice />
      </button>
    </h3>
  );
}

/** The grade's colour: a swatch for the wash. Picking a colour with no wash on turns a little on. */
function GradeColour({ s, set }: { s: Style; set: (patch: Partial<Style>) => void }) {
  const at = (k: string) => s.fx[k] ?? EFFECTS.find((e) => e.key === k)!.value;
  const hex = `#${new THREE.Color().setHSL(at("washHue") / 360, at("washSat"), at("washLight")).getHexString()}`;
  const pick = (value: string) => {
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(value).getHSL(hsl);
    set({ fx: { ...s.fx, washHue: Math.round(hsl.h * 360), washSat: hsl.s, washLight: Math.min(0.9, Math.max(0.1, hsl.l)), washIntensity: at("washIntensity") > 0 ? at("washIntensity") : 0.35 } });
  };
  return (
    <Row label="grade colour">
      <span className="swatches">
        <input type="color" value={hex} onChange={(e) => pick(e.target.value)} />
      </span>
    </Row>
  );
}

export function EffectsSection({ s, set, genome }: Props) {
  const roll = (sub: Subsection) => () => set(randomiseSubsection(s, sub));
  return (
    <>
      {(Object.keys(GROUP_LABELS) as EffectGroup[]).map((group) => (
        <div key={group}>
          <Head label={GROUP_LABELS[group]} onRoll={roll(group)} />
          {group === "grade" && <GradeColour s={s} set={set} />}
          {EFFECTS.filter((e) => e.group === group && !e.picker && (!e.parent || (s.fx[e.parent] ?? 0) > 0)).map((e) => (
            <Slider key={e.key} label={e.label} min={e.min} max={e.max} step={e.step} value={s.fx[e.key] ?? e.value} onChange={(v) => set({ fx: { ...s.fx, [e.key]: v } })} />
          ))}
        </div>
      ))}
      <Head label="motion" onRoll={roll("motion")} />
      <Slider label={g("smear", s.smear !== null)} min={0} max={1} step={0.01} value={s.smear ?? genome.smear} onChange={(v) => set({ smear: v })} />
      <Select<SmearAxis> label={g("smear axis", s.smearAxis !== null)} value={s.smearAxis ?? genome.smearAxis} options={["horizontal", "vertical", "depth", "radial", "swirl", "all"]} onChange={(v) => set({ smearAxis: v })} />
      <Slider label={g("drift", s.drift !== null)} min={0} max={0.05} step={0.001} value={s.drift ?? genome.drift} onChange={(v) => set({ drift: v })} />
      <Head label="lines" onRoll={roll("lines")} />
      <Select<Polygon> label="polygon" value={s.polygon} options={["off", "wire", "facets"]} onChange={(v) => set({ polygon: v })} />
      <Select<EdgeStyle | "genome">
        label="topic edges"
        value={s.edgeStyle ?? "genome"}
        options={[["genome", `genome (${genome.edgeStyle === "hover" ? "off" : genome.edgeStyle})`], ["hover", "off"], ["straight", "straight"], ["curved", "curved"]]}
        onChange={(v) => set({ edgeStyle: v === "genome" ? null : v })}
      />
    </>
  );
}

export const SECTION: Record<Category, (p: Props) => React.ReactElement> = {
  figure: FigureSection,
  colour: ColourSection,
  light: LightSection,
  effects: EffectsSection,
};
