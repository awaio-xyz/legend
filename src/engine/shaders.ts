// GLSL for the body. Points, edges, polygon wires and facets share one motion chunk, so every line
// stays pinned to the nodes it joins while everything drifts, frays and breathes.

export const MOTION_CHUNK = /* glsl */ `
uniform float uTime;
uniform float uEcho;        // 1 on the double-exposure echo layer (rare trait)
uniform float uDrift;
uniform float uFlowScale;
uniform float uFlowMode;    // 0 rising, 1 falling, 2 orbiting
uniform float uBreathDepth;
uniform float uBreathRate;  // Hz, from session rhythm (data)
uniform float uSway;
uniform float uLookYaw;     // idle animation, driven from JS
uniform float uLookPitch;   // positive looks down
uniform float uArmL;        // the person's left arm (+x), swing toward the chest in radians
uniform float uArmR;
uniform float uLookRoll;    // head tilt toward a shoulder
uniform float uShoulderL;   // shoulder lift, 0–1
uniform float uShoulderR;
uniform float uLean;        // weight shift, metres at the crown
uniform float uBodyYaw;     // whole-body turn from the hips
uniform float uBodyPitch;   // lean in (positive) or back
uniform float uWalk;        // 0 standing → 1 walking (eases in and out)
uniform float uPhase;       // gait phase, radians
uniform float uStride;      // thigh swing amplitude, radians
uniform float uHipX;
uniform float uKneeY;
uniform float uGround;      // where lean and sway pivot: the hips in bust mode, the feet in body mode
uniform float uLegsOn;      // 1 in body mode: the legs can move
uniform float uAnkleY;
uniform float uLegFlexL;    // hip flexion: the leg raised forward, radians (the person's left, +x)
uniform float uLegFlexR;
uniform float uLegAbdL;     // hip abduction: the leg out to the side
uniform float uLegAbdR;
uniform float uLegTwistL;   // hip external rotation, for lotus
uniform float uLegTwistR;
uniform float uKneeL;       // knee bend, on top of the walk's
uniform float uKneeR;
uniform float uPoint;       // feet pointed down, as when hovering
uniform float uShoulderX;
uniform float uElbowX;
uniform float uFlexL;       // shoulder flexion: the arm raised forward and up, radians
uniform float uFlexR;
uniform float uAbdL;        // shoulder abduction: the arm out to the side
uniform float uAbdR;
uniform float uElbowL;      // elbow bend
uniform float uElbowR;
uniform float uTorsoHalf;

uniform float uEther;       // grows with every ether node; 1 is about as far apart as it goes
uniform float uBob;         // the gait's rise and fall
uniform float uSwing;       // the gait's arm counter-swing
uniform float uExhale;      // 0 → 1 → 0 over a few seconds after each ether release
uniform float uAuraWarp;    // how far the aura gives way around the moving limbs
uniform vec3 uEggCentre;

float T; // local time; the echo layer runs a little behind

// The ether: with every ether node the figure loosens. All of it swells from the centre, so every
// gap grows, and each node strays off along its own line by its own amount, until the person is
// space and light.
vec3 etherSpread(vec3 p, float s) {
  // A release: the whole figure breathes out, swelling from its centre, then settles back.
  p += (p - uEggCentre) * uExhale * 0.08;
  if (uEther <= 0.0) return p;
  // Every node flies along its own direction, uniform over a sphere, so the figure tears on every
  // axis. (Scaling each node's offset from the centre stretched a tall body mostly vertically.)
  // Uneven on purpose: most nodes barely move while a few fly far, so it tears rather than swells.
  float fly = pow(fract(s * 7.31), 3.0);
  float z = 2.0 * fract(s * 43.758) - 1.0;
  float a = 6.2831853 * fract(s * 91.17);
  vec3 dir = vec3(sqrt(1.0 - z * z) * cos(a), z, sqrt(1.0 - z * z) * sin(a));
  vec3 wander = vec3(sin(T * 0.21 + s * 40.0), sin(T * 0.17 + s * 23.0), sin(T * 0.19 + s * 61.0)) * uEther * 0.12;
  float e = min(uEther, 2.0);
  return p + (p - uEggCentre) * e * 0.7 + dir * e * (0.04 + fly * 1.4) + wander;
}

// Arm nodes carry fray + 2: split them back apart.
float frayOf(float f) { return f > 1.5 ? f - 2.0 : f; }
float armOf(float f) { return step(1.5, f); }

// Each node wanders around its anchor through a layered-sine field, biased by flowBias. Frayed
// nodes (arms, lower belly) wander far more and drift outward, smearing into nothing.
vec3 driftOf(vec3 p, float s, float fray) {
  float t = T * 0.35;
  vec3 q = p * uFlowScale + s * 17.0;
  vec3 n = vec3(
    sin(q.y * 1.7 + t + s * 6.0) + sin(q.z * 2.3 - t * 0.7),
    sin(q.z * 1.3 + t * 0.8 + s * 3.0) + sin(q.x * 2.1 + t * 0.5),
    sin(q.x * 1.9 - t * 0.6 + s * 4.0) + sin(q.y * 1.1 + t * 0.9)) * 0.5;
  float ph = 0.5 + 0.5 * sin(T * 0.6 + s * 6.2831853);
  vec3 bias;
  if (uFlowMode < 0.5) bias = vec3(0.0, 1.0, 0.0);
  else if (uFlowMode < 1.5) bias = vec3(0.0, -1.0, 0.0);
  else bias = normalize(vec3(-p.z, 0.0, p.x) + 1e-5);
  vec3 outward = normalize(vec3(p.x, min(p.y + 0.1, 0.0) * 2.0, p.z) + 1e-5);
  float away = fray * fray * 0.06 * (0.5 + 0.5 * sin(T * 0.45 + s * 6.2831853));
  return (n * 0.6 + bias * ph * 0.6) * uDrift * (1.0 + fray * 3.0) + outward * away;
}

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }

// Whole-body motion. PLACEHOLDER for the rig: the same idle beats a skeleton would give us.
// armW: 1 an arm node, 0 not, -1 unknown (the ghost mannequin), which falls back to a mask by position.
vec3 bodyMotion(vec3 p, float armW) {
  // Breathing lives in the torso only: chest and belly swell forward from the spine, the shoulders
  // lift a touch. Arms, neck and head ride along without expanding.
  float torso = smoothstep(-0.12, 0.05, p.y) * (1.0 - smoothstep(0.3, 0.38, p.y))
              * (1.0 - smoothstep(uTorsoHalf * 0.85, uTorsoHalf * 1.1, abs(p.x)));
  float breath = sin(T * uBreathRate * 6.2831853);
  float b = torso * uBreathDepth * breath;
  p.z += (p.z + 0.01) * 0.04 * b;
  p.x *= 1.0 + 0.012 * b;
  float shoulders = smoothstep(0.22, 0.3, p.y) * (1.0 - smoothstep(0.34, 0.4, p.y));
  p.y += shoulders * uBreathDepth * 0.004 * breath;

  // Shoulders lift (shrugs, rolls), carrying the arm below them.
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  float arm = armW;
  if (armW < 0.0) {
    arm = smoothstep(uTorsoHalf * 0.95, uTorsoHalf * 1.2, abs(p.x)) * (1.0 - smoothstep(0.26, 0.32, p.y));
    // Below the waist only the forearms count as arm, not the hips beside them.
    arm *= mix(smoothstep(uTorsoHalf * 1.15, uTorsoHalf * 1.4, abs(p.x)), 1.0, smoothstep(-0.1, 0.0, p.y));
  }
  float shoulder = smoothstep(uTorsoHalf * 0.45, uTorsoHalf * 0.9, abs(p.x)) * smoothstep(0.2, 0.28, p.y) * (1.0 - smoothstep(0.36, 0.42, p.y));
  p.y += (side > 0.0 ? uShoulderL : uShoulderR) * 0.018 * max(shoulder, arm);

  // Walking: each leg swings from the hip and bends at the knee; the right leg runs half a cycle
  // behind the left. Arms counter-swing, the torso bobs and twists a little against the hips.
  float legPh = uPhase + (side > 0.0 ? 0.0 : 3.14159265);
  float thigh = uStride * sin(legPh) * uWalk;
  float kneeBend = uStride * 1.7 * pow(max(0.0, cos(legPh)), 2.0) * uWalk;
  // Legs (body mode): the foot points at the ankle, the shin bends at the knee, then the whole leg
  // turns out, opens and raises at the hip. Walking adds its swing on top.
  if (uLegsOn > 0.5 && p.y < -0.2) {
    float legW = 1.0 - smoothstep(-0.34, -0.22, p.y);
    vec3 hipJ = vec3(side * uHipX, -0.27, 0.0);
    vec3 kneeJ = vec3(side * uHipX * 1.05, uKneeY, 0.01);
    vec3 ankleJ = vec3(side * uHipX * 1.05, uAnkleY, -0.01);
    vec3 q = mix(p, ankleJ + rotX(p - ankleJ, uPoint), 1.0 - smoothstep(uAnkleY - 0.02, uAnkleY + 0.02, p.y));
    float knee = kneeBend + (side > 0.0 ? uKneeL : uKneeR);
    q = mix(q, kneeJ + rotX(q - kneeJ, knee), 1.0 - smoothstep(uKneeY - 0.03, uKneeY + 0.03, p.y));
    float flex = thigh + (side > 0.0 ? uLegFlexL : uLegFlexR);
    float abd = side > 0.0 ? uLegAbdL : uLegAbdR;
    float twist = side > 0.0 ? uLegTwistL : uLegTwistR;
    q = hipJ + rotX(rotZ(rotY(q - hipJ, side * twist), side * abd), -flex);
    p = mix(p, q, legW);
  }

  // Arms: the elbow bends, then the whole arm raises (flexion), opens (abduction) and draws in,
  // hinged at the shoulder. Walking swings it against the legs, except while it's busy with a
  // gesture (scratching the head, checking a wrist).
  vec3 hinge = vec3(side * uShoulderX, 0.29, -0.01);
  vec3 elbowJ = vec3(side * uElbowX, 0.02, -0.005);
  float flex = side > 0.0 ? uFlexL : uFlexR;
  float bend = side > 0.0 ? uElbowL : uElbowR;
  float busy = clamp(max(flex, bend) / 1.2, 0.0, 1.0);
  vec3 a = mix(p, elbowJ + rotX(p - elbowJ, -bend), 1.0 - smoothstep(-0.02, 0.06, p.y));
  a = hinge + rotY(rotZ(rotX(a - hinge, -flex + thigh * 0.7 * uSwing * (1.0 - busy)), side * (side > 0.0 ? uAbdL : uAbdR)), -side * (side > 0.0 ? uArmL : uArmR));
  p = mix(p, a, arm);

  // The head looks around, pivoting at the top of the neck.
  float head = smoothstep(0.38, 0.47, p.y);
  vec3 neck = vec3(0.0, 0.42, -0.01);
  p = mix(p, neck + rotY(rotX(rotZ(p - neck, uLookRoll), uLookPitch), uLookYaw), head);

  // The whole upper body turns and leans from the hips (and twists against the stride).
  vec3 hips = vec3(0.0, -0.24, 0.0);
  float upper = smoothstep(-0.34, -0.14, p.y);
  p = mix(p, hips + rotY(rotX(p - hips, uBodyPitch), uBodyYaw + 0.05 * sin(uPhase) * uWalk), upper);
  p.y += uWalk * 0.012 * uBob * cos(uPhase * 2.0); // the bob: highest as each leg passes under the body

  // Weight shifts lean the whole figure from the ground.
  float height = p.y - uGround;
  p.x += uLean * height / 0.95;

  // A faint whole-body sway underneath it all.
  p = rotY(p, uSway * 0.02 * sin(T * 0.23));
  p.x += uSway * 0.008 * sin(T * 0.19 + 0.7) * height;
  return p + vec3(0.012, 0.004, 0.0) * uEcho;
}

// The aura gives way around the limbs. Each aura node is pushed out from the nearest limb segment:
// hard inside AURA_GAP, then a soft bow out to twice that, so a raised arm or a striding leg parts
// the field in a wide wake and it closes again behind. Disturbed nodes glow (auraStir). The limb's
// joints are found by moving their rest positions with the body.
const float AURA_GAP = 0.2;
float auraStir;
vec3 segPush(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec3 v = p - (a + ab * t);
  float d = length(v);
  float k = max(0.0, 1.0 - d / (AURA_GAP * 2.0));
  auraStir = max(auraStir, k);
  return d > 1e-4 ? v / d * AURA_GAP * 1.25 * k * k : vec3(0.0);
}
vec3 auraWarp(vec3 p) {
  auraStir = 0.0;
  if (uAuraWarp <= 0.0) return p;
  vec3 w = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    vec3 sh = bodyMotion(vec3(s * (uShoulderX + 0.03), 0.27, -0.01), 1.0);
    vec3 el = bodyMotion(vec3(s * uElbowX, 0.02, -0.005), 1.0);
    vec3 wr = bodyMotion(vec3(s * (uElbowX + 0.015), -0.22, 0.05), 1.0);
    vec3 hd = bodyMotion(vec3(s * (uElbowX + 0.018), -0.38, 0.06), 1.0);
    w += segPush(p, sh, el) + segPush(p, el, wr) + segPush(p, wr, hd);
    if (uLegsOn > 0.5) {
      // The egg closes in under the feet, so a striding leg would shove its base about. The legs
      // part the field gently, and not at all near the ground; the foot doesn't push.
      float legFade = smoothstep(uGround + 0.08, uGround + 0.5, p.y) * 0.6;
      float stir = auraStir;
      vec3 hp = bodyMotion(vec3(s * uHipX, -0.27, 0.0), 0.0);
      vec3 kn = bodyMotion(vec3(s * uHipX * 1.05, uKneeY, 0.01), 0.0);
      vec3 an = bodyMotion(vec3(s * uHipX * 1.05, uAnkleY, -0.01), 0.0);
      w += (segPush(p, hp, kn) + segPush(p, kn, an)) * legFade;
      auraStir = mix(stir, auraStir, legFade);
    }
  }
  auraStir *= min(uAuraWarp, 1.0);
  return p + w * uAuraWarp;
}

uniform vec3 uHead;
uniform vec3 uHeart;
uniform vec3 uGut;
uniform vec3 uSpirit;
uniform float uExposure;
uniform float uPurity;      // colour purity: 0 a node's region mix blends → 1 its strongest region's colour
// Purity sharpens the mix toward its strongest region first, so mixed remarks keep a hue instead of
// averaging four colours to white.
vec3 regionColour(vec4 w) {
  vec4 p = pow(max(w, 0.0), vec4(1.0 + uPurity * 6.0));
  w = p / max(p.x + p.y + p.z + p.w, 1e-4);
  return uHead * w.x + uHeart * w.y + uGut * w.z + uSpirit * w.w;
}

// Rotate hue in YIQ space: lets one region hold many colours.
vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float h = atan(yiq.z, yiq.y) + a;
  float ch = length(yiq.yz);
  return max(toRGB * vec3(yiq.x, ch * cos(h), ch * sin(h)), 0.0);
}
`;

export const POINTS_VERT = /* glsl */ `
${MOTION_CHUNK}
// Scalars travel packed in vec4s: WebGL allows only 16 vertex attributes, and one more single
// float (the aura's layer) tipped the points shader over, so it silently stopped drawing.
attribute vec4 aWeights;
attribute vec3 aNormal;
attribute vec4 aField;      // wide region field, for colour bleed
attribute vec4 aCores;      // head, heart, gut core masses; w is the layer (0 the body, 1–7 the aura)
attribute vec4 aMisc;       // seed, intensity, fray, glyph
attribute vec4 aData;       // topic hash, order (0 oldest → 1 newest), gut path (-1 off the gut), brain activity
attribute float aBirth;
attribute vec2 aLight;      // which point this is on its node (1 the first), extremity 0–1

uniform float uPixelRatio;
uniform float uViewScale;
uniform float uColourBleed;
uniform float uColourMode;  // 0 region, 1 topic, 2 time, 3 intensity: what the light tells
uniform float uVariation;
uniform float uCoreGlow;
uniform float uHeartbeat;   // how strongly the beat shows
uniform float uGutFlow;     // light travelling through the gut
uniform float uNeural;      // neurons firing in the brain
uniform vec3 uRegionSize;   // glow balance: sparse organs get slightly larger points to cover their area
uniform vec3 uRegionGain;   // glow balance: per-region brightness, organ nodes only
uniform float uSpiritGain;  // the aura's brightness trim
uniform float uAuraLift;    // the aura's own exposure (see applyLooks)
uniform float uAuraHues;    // 0 the spirit colour → 1 a colour per layer, red at the skin to violet at the edge
uniform float uGlyphCycle;  // 0 still → nodes keep switching glyph type
uniform float uAsciiCycle;  // 0 still → ASCII characters keep changing
uniform float uRampCells;   // the light-to-dense part of the atlas
uniform float uAtlasCells;
uniform float uSize;
uniform float uGrainSize;   // grain: points shrink as the figure fills
uniform float uStackPow;    // a deepened node's k-th point adds k^p - (k-1)^p of a point's light
uniform float uSkinLift;    // body light: the skin and limbs, lifted toward the organs
uniform float uBeatRate;    // Hz, from how often they talk (data)
uniform float uPulseSharp;
uniform float uFlicker;
uniform float uLanding;     // 0 flash, 1 bloom, 2 ripple
uniform float uNegative;    // region index rendered inverted (rare trait), -1 for none

varying vec3 vColor;
varying float vGlyph;
varying float vCell;

void main() {
  float aSeed = aMisc.x, aIntensity = aMisc.y, aFray = frayOf(aMisc.z), aArm = armOf(aMisc.z), aGlyph = aMisc.w;
  float aTopic = aData.x, aOrder = aData.y, aPath = aData.z, aNeural = aData.w;
  float aLayer = aCores.w;
  T = uTime - uEcho * 0.4;
  float age = T - aBirth;
  if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }

  // New fragments drift in from just outside the skin.
  float arrive = 1.0 - smoothstep(0.0, 1.2, age);
  // Organ nodes hold still enough for their shapes to read.
  float organ = max(aCores.x, max(aCores.y, aCores.z));
  float space = step(7.5, aLayer);   // space (8) and ether (9)
  float aura = step(0.5, aLayer) * (1.0 - space);
  vec3 drifted = position + driftOf(position, aSeed, aFray) * (1.0 - organ * 0.75) * (1.0 - aura * 0.6 + space * 4.0) + aNormal * arrive * 0.08;
  // The aura and space don't ride the body's limbs; they move with the figure as a whole, and the
  // aura parts around the limbs as they move through it.
  auraStir = 0.0;
  vec3 moved = space > 0.5 ? drifted : aura > 0.5 ? auraWarp(drifted) : bodyMotion(drifted, aArm);
  vec3 p = etherSpread(moved, aSeed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // The heartbeat lives in the heart: strongest in its core on the left of the chest.
  float beat = pow(max(0.0, sin(T * uBeatRate * 6.2831853)), uPulseSharp) * (aWeights.y * aWeights.y * 0.3 + aCores.y) * uHeartbeat;
  // Region cores glow, so the density of each mass reads as light.
  float mass = max(aCores.x, max(aCores.y, aCores.z)) * uCoreGlow;
  float flare = exp(-age * 2.5);

  // Peristalsis: pulses of light travel the gut in digestive order, about 12 s end to end.
  float flow = 0.0;
  if (aPath >= 0.0) flow = pow(0.5 + 0.5 * sin((aPath * 6.0 - T * 0.5) * 6.2831853), 10.0) * uGutFlow;

  // Neurons: single sparks plus small clusters firing together, busiest in the frontal lobe and
  // hippocampus. Each lasts a fraction of a second.
  float spike = 0.0;
  if (aNeural > 0.0) {
    float fire = step(1.0 - 0.06 * aNeural, fract(sin(aSeed * 91.7 + floor(T * 12.0 + aSeed * 5.0) * 13.13) * 43758.5453));
    vec3 cell = floor(position * 30.0);
    float burst = step(1.0 - 0.05 * aNeural, fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719)) + floor(T * 6.0) * 7.31) * 43758.5453));
    spike = max(fire, burst) * uNeural;
  }
  float size = uSize * (0.6 + aIntensity * 0.9) * (1.0 + beat * 0.6) * (1.0 + mass * 0.4) * (1.0 + flow * 0.8 + spike * 0.8) * mix(1.0, dot(aWeights.xyz, uRegionSize), organ)
              // The aura is sparse, spread over an egg far wider than the body, so its nodes are drawn
              // larger: at the body's size they were single dim pixels and the aura vanished.
              * mix(1.0, 2.2, aura)
              * (1.0 - space * 0.45)                 // space: small, like stars
              * (1.0 + aLight.y * 0.35)              // hands and feet: sparse, so a little larger
              * uGrainSize;
  float flash = 2.0;
  if (uLanding < 0.5) size *= 1.0 + flare * 5.0;
  else if (uLanding < 1.5) { size *= 1.0 + flare * 2.0; flash = 4.0; }
  else size *= 1.0 + 3.0 * flare * (0.5 + 0.5 * sin(age * 18.0));
  // Glyph type: fixed, or cycling through dot, square, cross, triangle and ASCII.
  float glyph = aGlyph;
  if (uGlyphCycle > 0.001) {
    float k = mod(floor(aSeed * 31.0 + T * (0.4 + aSeed * 1.6) * uGlyphCycle * 3.0), 5.0);
    glyph = k < 3.5 ? k : 5.0;
  }
  // ASCII character: intensity's shade when still, otherwise always changing.
  vCell = floor(clamp(aIntensity, 0.0, 0.999) * uRampCells);
  if (uAsciiCycle > 0.001) vCell = mod(floor(aSeed * 97.0 + T * (1.0 + aSeed * 5.0) * uAsciiCycle * 4.0), uAtlasCells);
  // ASCII needs room to read; dim it to match, or the bigger sprites pile up into white.
  float asciiDim = 1.0;
  if (glyph > 4.5 && aura < 0.5) { size *= 2.2; asciiDim = 0.3; }
  gl_PointSize = size * uPixelRatio * uViewScale / -mv.z;

  vec3 col = regionColour(mix(aWeights, aField, uColourBleed));
  if (aura > 0.5) {
    // A chakra colour per layer: red at the skin through to violet at the edge.
    float k = (aLayer - 1.0) / 6.0;
    vec3 chakra = clamp(abs(fract(vec3(0.0, 0.67, 0.33) + 0.83 * k) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    col = mix(col, mix(chakra, vec3(1.0), 0.25), uAuraHues);
  }
  float shift;
  if (uColourMode < 0.5) shift = (aTopic - 0.5) * uVariation * 3.14159;                    // region, varied by topic
  else if (uColourMode < 1.5) shift = (aTopic - 0.5) * (0.6 + uVariation) * 6.28318;     // every topic its own hue
  else if (uColourMode < 2.5) {
    // Time: two tones. Old fragments settle into dim, cool dust; recent ones glow warm. Variation
    // widens the window of what counts as recent.
    float recent = pow(aOrder, 1.0 + (1.0 - uVariation) * 5.0);
    // The aura keeps more of its light when old: it's sparse, and dust there reads as nothing.
    col = mix(mix(col, vec3(0.25, 0.35, 0.6), 0.7) * mix(0.25, 0.6, aura), mix(col, vec3(1.0, 0.62, 0.3), 0.85) * 1.8, recent);
    shift = 0.0;
  }
  else { col = mix(col * 0.45, mix(col, vec3(1.0), 0.5), aIntensity); shift = (aIntensity - 0.5) * uVariation * 3.14159; } // intensity
  col = hueRotate(col, shift);
  float dominant = aWeights.x >= aWeights.y && aWeights.x >= aWeights.z ? 0.0 : (aWeights.y >= aWeights.z ? 1.0 : 2.0);
  if (aWeights.w > max(aWeights.x, max(aWeights.y, aWeights.z))) dominant = 3.0;
  vGlyph = aura > 0.5 ? 0.0 : glyph; // the aura's nodes are clean points along their lines
  if (abs(dominant - uNegative) < 0.5) { col = vec3(1.0) - col; vGlyph = 4.0; }

  float flick = 1.0 - uFlicker * fract(sin(dot(vec2(aSeed, floor(T * 10.0)), vec2(12.9898, 78.233))) * 43758.5453);
  vColor = col * (0.35 + aIntensity * 0.65) * flick * (1.0 + uExhale * 0.6) * (1.0 + beat * 1.4) * (1.0 + flow * 3.0 + spike * 4.0) * (1.0 + flare * flash)
         * (1.0 - aFray * 0.75) * (1.0 - uEcho * 0.7) * asciiDim * (1.0 + mass * 0.7) * (1.0 - organ * 0.6) * mix(1.0, dot(aWeights.xyz, uRegionGain), organ) * uExposure
         * (aLight.x <= 1.0 ? 1.0 : pow(aLight.x, uStackPow) - pow(aLight.x - 1.0, uStackPow)) * (1.0 + aLight.y * 0.8)
         * mix(1.0, uSkinLift, (1.0 - organ) * (1.0 - step(0.5, aLayer)))
         // Grain shrinks the body's points: each carries the light its lost area held, so crisp isn't dim.
         * mix(1.0, 1.0 / (uGrainSize * uGrainSize), 1.0 - step(0.5, aLayer))
         // The aura shimmers and thins toward its edge.
         * mix(1.0, uAuraLift * uSpiritGain * (0.9 - (aLayer - 1.0) * 0.07) * (0.85 + 0.15 * sin(T * 0.9 + aLayer * 0.9 + aSeed * 6.28)) * (1.0 + auraStir * auraStir * 1.8), aura)
         // Space twinkles: each star on its own slow rhythm.
         * mix(1.0, 0.25 + 0.9 * pow(0.5 + 0.5 * sin(T * (0.8 + aSeed * 3.0) + aSeed * 40.0), 3.0), space);
}
`;

export const POINTS_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uAtlasCells;
uniform float uGrain;       // 0 soft dots → 1 crisp
varying vec3 vColor;
varying float vGlyph;
varying float vCell;

float triangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  vec2 q = abs(uv);
  float a;
  if (vGlyph < 0.5) { float r = length(uv); a = smoothstep(1.0, 0.0, r); a = mix(a * a, smoothstep(1.0, 0.45, r), uGrain); } // dot: soft ↔ crisp (still reaching the edge, or tiny points vanish)
  else if (vGlyph < 1.5) a = smoothstep(0.16, 0.0, abs(max(q.x, q.y) - 0.7));                    // square
  else if (vGlyph < 2.5) a = smoothstep(0.14, 0.0, min(q.x, q.y)) * step(max(q.x, q.y), 0.85);  // cross
  else if (vGlyph < 3.5) a = smoothstep(0.14, 0.0, abs(triangle(uv * vec2(1.0, -1.0), 0.6)));   // triangle
  else if (vGlyph < 4.5) a = smoothstep(0.16, 0.0, abs(length(uv) - 0.65));                      // ring
  else a = texture2D(uAtlas, vec2((gl_PointCoord.x + vCell) / uAtlasCells, 1.0 - gl_PointCoord.y)).a; // ASCII
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/** Lines between two nodes: topic edges and polygon wires. Drift interpolates along the line. */
export const LINES_VERT = /* glsl */ `
${MOTION_CHUNK}
attribute vec3 aPosA;
attribute vec3 aPosB;
attribute float aSeedA;
attribute float aSeedB;
attribute float aFrayA;
attribute float aFrayB;
attribute float aT;
attribute float aBirth;
attribute vec4 aWeights;
attribute float aFlow;      // veins: how much of the tree this feeds, 0 a capillary → 1 the aorta
attribute float aDist;      // veins: path distance from the heart, 0–1

uniform float uLineAlpha;
uniform float uLinesFree;   // 1 for lines that don't ride the limbs (the aura's bands)
uniform float uVein;        // 1 for veins
uniform float uVeinPulse;
uniform float uBeatRate;
uniform float uPulseSharp;

varying vec3 vColor;
varying float vAlpha;

void main() {
  T = uTime - uEcho * 0.4;
  float age = T - aBirth;
  vec3 d = mix(driftOf(aPosA, aSeedA, frayOf(aFrayA)), driftOf(aPosB, aSeedB, frayOf(aFrayB)), aT);
  // Each end rides its own node's motion, so a line from the body into an arm follows the arm.
  vec3 moved = mix(bodyMotion(position + d, armOf(aT < 0.5 ? aFrayA : aFrayB)), position + d, uLinesFree);
  vec3 p = mix(etherSpread(moved, aSeedA), etherSpread(moved, aSeedB), aT);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vColor = regionColour(aWeights) * uExposure;
  float fray = mix(frayOf(aFrayA), frayOf(aFrayB), aT);
  vAlpha = age < 0.0 ? 0.0 : uLineAlpha * smoothstep(0.0, 1.5, age) * (1.0 - fray * 0.7) * (1.0 - uEcho * 0.7);
  // Veins: trunks carry more light than capillaries, and each beat sends a pulse out from the heart.
  float pulse = pow(max(0.0, sin((T * uBeatRate - aDist * 0.7) * 6.2831853)), uPulseSharp);
  vAlpha *= mix(1.0, (0.15 + 0.85 * aFlow) * (1.0 + pulse * uVeinPulse * 3.0), uVein);
}
`;

export const LINES_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha < 0.001) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

/** Faint triangles between neighbouring nodes: the faceted, low-poly look. */
export const FACETS_VERT = /* glsl */ `
${MOTION_CHUNK}
attribute vec4 aWeights;
attribute float aSeed;
attribute float aFray;
attribute float aBirth;

uniform float uFacetAlpha;

varying vec3 vColor;
varying float vAlpha;

void main() {
  T = uTime;
  float age = T - aBirth;
  vec3 p = etherSpread(bodyMotion(position + driftOf(position, aSeed, frayOf(aFray)), armOf(aFray)), aSeed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vColor = regionColour(aWeights) * uExposure;
  vAlpha = age < 0.0 ? 0.0 : uFacetAlpha * smoothstep(0.0, 1.5, age) * (1.0 - frayOf(aFray) * 0.8);
}
`;

export const GHOST_VERT = /* glsl */ `
${MOTION_CHUNK}
uniform float uPixelRatio;
uniform float uViewScale;
void main() {
  T = uTime;
  vec4 mv = modelViewMatrix * vec4(bodyMotion(position, -1.0), 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 2.0 * uPixelRatio * uViewScale / -mv.z;
}
`;

export const GHOST_FRAG = /* glsl */ `
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  gl_FragColor = vec4(0.6, 0.7, 0.9, 0.05);
}
`;
