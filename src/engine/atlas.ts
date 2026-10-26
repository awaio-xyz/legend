// The ASCII glyph atlas: one row of characters. The first part is a ramp from light to dense, so
// a still fragment's intensity picks its shade like classic ASCII art. Letters and digits follow,
// for when the characters cycle.
import * as THREE from "three";

export const ASCII_RAMP = ".,:;-~=+*x#%@";
export const ASCII_LETTERS = "AEKMNRSVXZ0123456789";
export const ASCII_ATLAS = ASCII_RAMP + ASCII_LETTERS;
const CELL = 64;

export function createAsciiAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * ASCII_ATLAS.length;
  canvas.height = CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${CELL * 0.82}px "JetBrains Mono", "Cascadia Mono", Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [...ASCII_ATLAS].forEach((ch, i) => ctx.fillText(ch, i * CELL + CELL / 2, CELL / 2 + 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
