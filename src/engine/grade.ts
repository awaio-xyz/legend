// Effects: the colour grade and filters, ported from Qualia's ColorWashShader and extended with CRT
// curvature, contrast/saturation/temperature and a focus blur. Qualia's kaleidoscope, vortex,
// ghosting and prism are left out on purpose, and the filters are damped: the figure must always
// read as one human. One spec table drives the shader
// uniforms and every panel that edits them.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export type EffectGroup = "grade" | "crt" | "film" | "glitch" | "focus";

export interface EffectSpec {
  key: string;
  label: string;
  group: EffectGroup;
  min: number;
  max: number;
  step: number;
  value: number; // default
  damp?: number; // scales the slider into the shader, so full travel stays gentler than Qualia's
  parent?: string; // a refinement of this effect: shown only while the parent is above zero
  picker?: boolean; // part of the grade colour: set with the colour picker, not a slider
}

export const EFFECTS: EffectSpec[] = [
  // Grade
  { key: "contrast", label: "contrast", group: "grade", min: 0.5, max: 2, step: 0.01, value: 1 },
  { key: "saturation", label: "saturation", group: "grade", min: 0, max: 2, step: 0.01, value: 1 },
  { key: "temperature", label: "temperature", group: "grade", min: -1, max: 1, step: 0.01, value: 0 },
  { key: "washIntensity", label: "wash", group: "grade", min: 0, max: 1, step: 0.01, value: 0 },
  { key: "washHue", label: "wash hue", group: "grade", min: 0, max: 360, step: 1, value: 200, picker: true },
  { key: "washSat", label: "wash saturation", group: "grade", min: 0, max: 1, step: 0.01, value: 0.7, picker: true },
  { key: "washLight", label: "wash lightness", group: "grade", min: 0.1, max: 0.9, step: 0.01, value: 0.55, picker: true },
  { key: "blendMode", label: "wash blend", group: "grade", min: 0, max: 8, step: 1, value: 0, parent: "washIntensity" },
  { key: "colorInvert", label: "invert", group: "grade", min: 0, max: 1, step: 1, value: 0 },
  // CRT
  { key: "scanlineOpacity", label: "scanlines", group: "crt", min: 0, max: 1, step: 0.01, value: 0, damp: 0.5 },
  { key: "scanlineScale", label: "scanline size", group: "crt", min: 0.2, max: 3, step: 0.01, value: 1, parent: "scanlineOpacity" },
  { key: "scanlineSpeed", label: "scanline roll", group: "crt", min: 0, max: 2, step: 0.01, value: 0, parent: "scanlineOpacity" },
  { key: "curvature", label: "curvature", group: "crt", min: 0, max: 1, step: 0.01, value: 0, damp: 0.5 },
  { key: "chromaIntensity", label: "aberration", group: "crt", min: 0, max: 1, step: 0.01, value: 0, damp: 0.4 },
  { key: "chromaType", label: "aberration type", group: "crt", min: 0, max: 3, step: 1, value: 1, parent: "chromaIntensity" },
  { key: "vignetteStrength", label: "vignette", group: "crt", min: 0, max: 1, step: 0.01, value: 0.35 },
  { key: "flickerIntensity", label: "flicker", group: "crt", min: 0, max: 1, step: 0.01, value: 0, damp: 0.4 },
  // Film
  { key: "grainIntensity", label: "grain", group: "film", min: 0, max: 1, step: 0.01, value: 0.08, damp: 0.5 },
  { key: "grainScale", label: "grain size", group: "film", min: 0.1, max: 3, step: 0.01, value: 1, parent: "grainIntensity" },
  { key: "rawGrainIntensity", label: "noise", group: "film", min: 0, max: 1, step: 0.01, value: 0, damp: 0.4 },
  { key: "rawGrainWash", label: "noise wash", group: "film", min: 0, max: 1, step: 0.01, value: 0, damp: 0.3 },
  { key: "dustIntensity", label: "dust", group: "film", min: 0, max: 1, step: 0.01, value: 0, damp: 0.5 },
  { key: "scratchIntensity", label: "scratches", group: "film", min: 0, max: 1, step: 0.01, value: 0, damp: 0.5 },
  // Glitch
  { key: "glitchTearing", label: "tearing", group: "glitch", min: 0, max: 1, step: 0.01, value: 0, damp: 0.4 },
  { key: "glitchBlocks", label: "blocks", group: "glitch", min: 0, max: 1, step: 0.01, value: 0, damp: 0.35 },
  { key: "pixelation", label: "pixelate", group: "glitch", min: 0, max: 0.3, step: 0.005, value: 0, damp: 0.3 },
  // Focus (a screen-space depth of field: sharp at the focus, softening away from it)
  { key: "focusBlur", label: "focus blur", group: "focus", min: 0, max: 1, step: 0.01, value: 0, damp: 0.6 },
  { key: "focusY", label: "focus height", group: "focus", min: 0, max: 1, step: 0.01, value: 0.5, parent: "focusBlur" },
  { key: "focusRange", label: "focus range", group: "focus", min: 0.02, max: 0.8, step: 0.01, value: 0.25, parent: "focusBlur" },
];

export type Effects = Record<string, number>;
export const DEFAULT_EFFECTS: Effects = Object.fromEntries(EFFECTS.map((e) => [e.key, e.value]));

const INT_KEYS = new Set(["blendMode", "chromaType", "colorInvert"]);

export function createGradePass() {
  const uniforms: Record<string, { value: unknown }> = { tDiffuse: { value: null }, time: { value: 0 }, washColor: { value: new THREE.Color() } };
  for (const e of EFFECTS) if (!e.picker) uniforms[e.key] = { value: e.value };
  uniforms.fisheye = { value: 0 }; // the widget's lens, outside the shared look
  return new ShaderPass({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform vec3 washColor;
      uniform float fisheye;
      ${EFFECTS.filter((e) => !e.picker).map((e) => `uniform ${INT_KEYS.has(e.key) ? "int" : "float"} ${e.key};`).join("\n      ")}
      varying vec2 vUv;

      float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
      float randomT(vec2 st, float t) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233)) + t) * 43758.5453123); }

      vec3 blendOverlay(vec3 b, vec3 l) { return mix(2.0 * b * l, 1.0 - 2.0 * (1.0 - b) * (1.0 - l), step(0.5, b)); }
      vec3 blendSoftLight(vec3 b, vec3 l) {
        return mix(sqrt(b) * (2.0 * l - 1.0) + 2.0 * b * (1.0 - l), b * (2.0 * l + (1.0 - b) * (2.0 * l - 1.0)), step(0.5, l));
      }
      vec3 blendMode_(vec3 b, vec3 l, int m) {
        if (m == 0) return blendOverlay(l, b);                                   // hard light
        if (m == 1) return blendOverlay(b, l);                                   // overlay
        if (m == 2) return mix(b / max(1.0 - l, 0.0001), vec3(1.0), step(1.0, l)); // colour dodge
        if (m == 3) return b * l;                                                // multiply
        if (m == 4) return 1.0 - (1.0 - b) * (1.0 - l);                           // screen
        if (m == 5) return b + l;                                                // linear dodge
        if (m == 6) return blendSoftLight(b, l);                                 // soft light
        if (m == 7) return abs(b - l);                                           // difference
        return b / max(l, 0.0001);                                               // divide
      }

      vec3 sampleAt(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }

      void main() {
        vec2 uv = vUv;

        // CRT curvature: a barrel bend toward the screen's edge.
        // Fisheye: the middle swells toward the viewer, the rim holds still.
        if (fisheye > 0.0) {
          vec2 c = uv * 2.0 - 1.0;
          c *= 1.0 - fisheye * 0.45 * (1.0 - min(1.0, dot(c, c)));
          uv = c * 0.5 + 0.5;
        }
        if (curvature > 0.0) {
          vec2 c = uv * 2.0 - 1.0;
          c *= 1.0 + dot(c, c) * curvature * 0.12;
          uv = c * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        }
        if (pixelation > 0.0) { vec2 grid = vec2(1920.0, 1080.0) / (1.0 + pixelation * 100.0); uv = floor(uv * grid) / grid; }
        if (glitchTearing > 0.0 && random(vec2(floor(time * 10.0), 0.0)) < glitchTearing * 0.1) uv.x += (random(vec2(floor(uv.y * 10.0), time * 10.0)) - 0.5) * glitchTearing * 0.05;
        if (glitchBlocks > 0.0) {
          vec2 block = floor(uv * 20.0);
          if (random(block + floor(time * 15.0)) < glitchBlocks * 0.03) uv += (vec2(random(block), random(block + 1.0)) - 0.5) * glitchBlocks * 0.015;
        }

        vec3 base;
        base = sampleAt(uv);

        // Focus blur: sharp at the focus height, softening with distance from it.
        if (focusBlur > 0.0) {
          float away = smoothstep(focusRange * 0.5, focusRange * 0.5 + 0.35, abs(vUv.y - focusY));
          float rad = focusBlur * away * 0.012;
          if (rad > 0.0001) {
            vec3 acc = base; float wsum = 1.0;
            for (int i = 0; i < 16; i++) {
              float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / 16.0);
              acc += sampleAt(uv + vec2(cos(a), sin(a)) * r * rad); wsum += 1.0;
            }
            base = acc / wsum;
          }
        }

        if (chromaIntensity > 0.0) {
          float shift = chromaIntensity * 0.015; vec2 dir = uv - 0.5;
          vec2 o = chromaType == 0 ? vec2(shift, 0.0) : chromaType == 1 ? dir * shift : chromaType == 2 ? vec2(shift, shift) : dir * shift * length(dir) * 2.0;
          base.r = sampleAt(uv + o).r; base.b = sampleAt(uv - o).b;
        }

        // Grade: contrast, saturation, temperature, then the colour wash.
        vec3 col = (base - 0.5) * contrast + 0.5;
        col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, saturation);
        col *= vec3(1.0 + temperature * 0.12, 1.0, 1.0 - temperature * 0.12);
        col = max(col, 0.0);
        col = mix(col, blendMode_(col, washColor, blendMode), washIntensity);

        if (dustIntensity > 0.0 && random(uv + fract(time)) > 1.0 - dustIntensity * 0.02) col += vec3(0.4);
        if (scratchIntensity > 0.0 && random(vec2(floor(uv.x * 800.0), floor(time * 10.0))) > 1.0 - scratchIntensity * 0.001) col *= 0.7;
        if (flickerIntensity > 0.0) col *= 1.0 - random(vec2(time, 0.0)) * flickerIntensity * 0.15;
        if (vignetteStrength > 0.0) col = mix(col, vec3(0.0), smoothstep(0.4, 1.5, distance(vUv, vec2(0.5)) * 1.6) * vignetteStrength);
        if (grainIntensity > 0.0) { float g = randomT(uv * grainScale * 1000.0, time * 100.0); col = mix(col, col * (g * 2.0 - 0.5), grainIntensity * 0.5); }
        if (rawGrainIntensity > 0.0 || rawGrainWash > 0.0) {
          float n = random(uv * 10.0 + fract(time));
          col = mix(col, col * (n * 2.0 - 0.5), rawGrainIntensity * 0.5) + vec3(n) * rawGrainWash * 0.5;
        }
        if (scanlineOpacity > 0.0) {
          float sl = smoothstep(0.0, 1.0, sin((uv.y - time * scanlineSpeed * 0.05) * 800.0 * scanlineScale) * 0.5 + 0.5);
          col = mix(col, col * sl, scanlineOpacity * 0.4);
        }
        if (colorInvert == 1) col = vec3(1.0) - col;
        if (any(notEqual(col, col))) col = vec3(0.0); // NaN shield, as in Qualia
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Push effect values into the pass. */
export function applyEffects(pass: ShaderPass, fx: Effects, time: number) {
  const u = pass.uniforms;
  u.time.value = time;
  const at = (key: string) => fx[key] ?? EFFECTS.find((e) => e.key === key)!.value;
  (u.washColor.value as THREE.Color).setHSL(at("washHue") / 360, at("washSat"), at("washLight"));
  for (const e of EFFECTS) {
    if (e.picker) continue;
    const v = fx[e.key] ?? e.value;
    u[e.key].value = INT_KEYS.has(e.key) ? Math.round(v) : v * (e.damp ?? 1);
  }
}
