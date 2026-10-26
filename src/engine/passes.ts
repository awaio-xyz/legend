// Post-processing: the smear (decision 13) and the Signal rare trait.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import type { SmearAxis } from "./genome";

const SMEAR_MODE: Record<SmearAxis, number> = { horizontal: 0, vertical: 0, depth: 1, radial: 2, swirl: 3, all: 4 };

export function createSmearPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uAmount: { value: 0 },
      uMode: { value: 0 },
      uDir: { value: new THREE.Vector2(1, 0) },
      uSignal: { value: 0 },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uAmount;
      uniform int uMode;
      uniform vec2 uDir;
      uniform float uSignal;
      uniform float uTime;
      uniform vec2 uRes;
      varying vec2 vUv;

      vec3 smearAt(vec2 uv) {
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        vec2 c = uv - 0.5;
        for (int i = 0; i < 16; i++) {
          float f = float(i) / 15.0;
          float w = 1.0 - f * 0.85;
          vec2 off;
          if (uMode == 0) off = uDir * f;                                        // a streak along one axis
          else if (uMode == 1) off = -c * f * 0.9;                               // depth: rushing toward the centre
          else if (uMode == 2) off = c * f * 0.6;                                // radial: bursting outward
          else if (uMode == 3) off = vec2(-c.y, c.x) * f * 1.4;                  // swirl
          else off = vec2(cos(float(i) * 2.39996), sin(float(i) * 2.39996)) * f; // all directions
          acc += texture2D(tDiffuse, uv + off * uAmount).rgb * w;
          wsum += w;
        }
        return acc / wsum;
      }

      void main() {
        vec2 uv = vUv;
        if (uSignal > 0.5) {
          float line = floor(uv.y * 140.0);
          float tear = step(0.985, fract(sin(line * 12.9898 + floor(uTime * 8.0) * 78.233) * 43758.5453));
          uv.x += tear * 0.015;
        }
        vec3 base = texture2D(tDiffuse, uv).rgb;
        vec3 col = base;
        if (uAmount > 0.0005) col = mix(base, max(base, smearAt(uv) * 1.8), clamp(uAmount * 40.0, 0.0, 1.0));
        if (uSignal > 0.5) {
          col.r = max(col.r, texture2D(tDiffuse, uv + vec2(0.0025, 0.0)).r);
          col.b = max(col.b, texture2D(tDiffuse, uv - vec2(0.0025, 0.0)).b);
          col *= 0.86 + 0.14 * sin(uv.y * uRes.y * 1.6);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Map the genome's axis and the user's amount (0–1) onto the pass. */
export function configureSmear(pass: ShaderPass, axis: SmearAxis, amount: number) {
  pass.uniforms.uMode.value = SMEAR_MODE[axis];
  pass.uniforms.uDir.value.set(axis === "vertical" ? 0 : 1, axis === "vertical" ? 1 : 0);
  pass.uniforms.uAmount.value = amount * 0.06;
}
