// Imagery: ten stills of the figure for sharing, each a pose from the library held still and a
// camera with a character of its own: angle, height, lens, distance, a Dutch tilt, a fisheye.
export interface Shot {
  name: string;
  pose: string; // a move from the library (idle.ts)
  azimuth: number; // radians around the figure; 0 is in front
  elevation: number; // radians above (+) or below (−) the target
  distance: number; // metres
  fov: number; // degrees: low is a long lens, high a wide one
  lookY: number; // the height looked at, from the figure's origin
  roll?: number; // a Dutch tilt, radians
  fisheye?: number;
}

export const SHOTS: Shot[] = [
  { name: "hero", pose: "open palms", azimuth: 0, elevation: 0.05, distance: 4.6, fov: 30, lookY: -0.15 },
  { name: "heroic-low", pose: "ascend", azimuth: 0.35, elevation: -0.4, distance: 3.2, fov: 48, lookY: 0.1 },
  { name: "from-above", pose: "bow", azimuth: -0.6, elevation: 0.85, distance: 3.6, fov: 34, lookY: -0.25 },
  { name: "portrait", pose: "hand over heart", azimuth: 0.25, elevation: 0.05, distance: 1.5, fov: 24, lookY: 0.35 },
  { name: "profile", pose: "far horizon", azimuth: 1.5, elevation: 0, distance: 3.8, fov: 30, lookY: -0.15 },
  { name: "over-the-shoulder", pose: "wings", azimuth: 2.6, elevation: 0.2, distance: 3.4, fov: 36, lookY: 0.05 },
  { name: "wide-aura", pose: "halo", azimuth: -0.3, elevation: 0.12, distance: 8.5, fov: 40, lookY: -0.2 },
  { name: "dutch", pose: "reach toward the light", azimuth: -0.5, elevation: -0.1, distance: 3.4, fov: 34, lookY: 0, roll: 0.35 },
  { name: "levitation", pose: "floating lotus", azimuth: 0.4, elevation: -0.2, distance: 3.6, fov: 34, lookY: 0.15 },
  { name: "fisheye-heart", pose: "cradle", azimuth: 0, elevation: 0.1, distance: 1.6, fov: 60, lookY: 0.15, fisheye: 0.8 },
];

export const IMAGE_SIZE = { width: 1600, height: 2000 }; // 4:5, at home on most feeds
