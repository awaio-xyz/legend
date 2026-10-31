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

export interface Ratio {
  id: string;
  label: string;
  width: number;
  height: number;
}
export const RATIOS: Ratio[] = [
  { id: "4:5", label: "4:5 feed", width: 1600, height: 2000 },
  { id: "9:16", label: "9:16 story", width: 1440, height: 2560 },
  { id: "1:1", label: "1:1 square", width: 2000, height: 2000 },
  { id: "16:9", label: "16:9 wide", width: 2560, height: 1440 },
  { id: "2.39:1", label: "2.39:1 cinemascope", width: 2868, height: 1200 },
];

// A lens over every shot. Each keeps the figure about the size it was in frame, so a wide lens has
// to come in close, which foreshortens (near limbs loom, far ones shrink), and a long lens stands
// well back, which flattens the figure against its aura. Mixed gives each shot a lens of its own.
export type Lens = "mixed" | "as-shot" | "wide" | "long" | "fisheye";
export const LENSES: [Lens, string][] = [
  ["mixed", "mixed"],
  ["as-shot", "as shot"],
  ["wide", "wide, foreshortened"],
  ["long", "long, compressed"],
  ["fisheye", "fisheye"],
];
const LENS_FOV = { wide: 80, long: 13, fisheye: 76 };

/** The shot through a lens, and how far the camera moved (new distance over old), which the points' size must follow. */
export function throughLens(shot: Shot, lens: Exclude<Lens, "mixed">): { shot: Shot; pointScale: number } {
  if (lens === "as-shot") return { shot, pointScale: 1 };
  const fov = LENS_FOV[lens];
  const keep = Math.tan((shot.fov * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
  const distance = Math.max(lens === "long" ? 0 : 0.8, shot.distance * keep);
  return {
    shot: {
      ...shot,
      name: `${shot.name}-${lens}`,
      fov,
      distance,
      // Close in, the angle is the drama: a wide lens leans further into the shot's height.
      elevation: lens === "wide" ? shot.elevation * 1.4 : shot.elevation,
      fisheye: lens === "fisheye" ? 0.85 : 0,
    },
    pointScale: distance / shot.distance,
  };
}

/** Mixed: a lens for each shot, different every time. */
export const pickLens = (lens: Lens): Exclude<Lens, "mixed"> =>
  lens !== "mixed" ? lens : (["as-shot", "wide", "wide", "long", "fisheye"] as const)[Math.floor(Math.random() * 5)];
