import * as THREE from "three";
import { WORLD_COUNT } from "./levels";

/** The light of a mountain: sky, sun, snow tint and what hangs in the sky. */
export interface Theme {
  sky: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sun: THREE.Color;
  sunIntensity: number;
  /** Multiplies the unlit snow, so it takes the colour of the light. */
  snow: THREE.Color;
  cloud: THREE.Color;
  cloudOpacity: number;
  /** How bright the stars and the aurora are, 0 to 1. */
  stars: number;
  aurora: number;
}
const theme = (
  sky: string,
  hemiSky: string,
  hemiGround: string,
  hemiIntensity: number,
  sun: string,
  sunIntensity: number,
  snow: string,
  cloud: string,
  cloudOpacity: number,
  stars = 0,
  aurora = 0,
): Theme => ({
  sky: new THREE.Color(sky),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemiIntensity,
  sun: new THREE.Color(sun),
  sunIntensity,
  snow: new THREE.Color(snow),
  cloud: new THREE.Color(cloud),
  cloudOpacity,
  stars,
  aurora,
});
/** One per world: clear morning, golden afternoon in the pines, hard blue cold on the river, dusk in the gorge, and night under the aurora. */
export const THEMES: Theme[] = [
  theme("#b8dded", "#f5fbff", "#98afca", 1.8, "#fff8df", 2.5, "#ffffff", "#ffffff", 0.55),
  theme("#f3cfa2", "#fff0d8", "#b7a08f", 1.65, "#ffc37a", 2.7, "#fff1de", "#fff3df", 0.6),
  theme("#7cc8f0", "#f2fbff", "#8fc0e0", 1.95, "#f4fbff", 2.3, "#f7fcff", "#ffffff", 0.4),
  theme("#c79bc4", "#ecd6f2", "#7d78a6", 1.45, "#ff9a78", 2.1, "#eedcf0", "#f6c9c9", 0.5),
  theme("#111c40", "#8ea4e6", "#27335e", 1.25, "#b9ccff", 1.5, "#8094cd", "#3a4a80", 0.35, 1, 1),
];
if (THEMES.length !== WORLD_COUNT) throw new Error("One theme per mountain");

const blended = theme("#000", "#000", "#000", 0, "#000", 0, "#000", "#000", 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** A theme part-way between two others. Returns a shared scratch theme. */
export function blendThemes(a: Theme, b: Theme, t: number): Theme {
  if (t <= 0) return a;
  if (t >= 1) return b;
  for (const key of ["sky", "hemiSky", "hemiGround", "sun", "snow", "cloud"] as const)
    blended[key].copy(a[key]).lerp(b[key], t);
  for (const key of ["hemiIntensity", "sunIntensity", "cloudOpacity", "stars", "aurora"] as const)
    blended[key] = mix(a[key], b[key], t);
  return blended;
}
/** Metres of an endless run spent in each light before it turns to the next. */
export const ENDLESS_THEME_SPAN = 1400;
const ENDLESS_THEME_FADE = 300;
/** The endless run skis through the day: morning to night and round again. */
export function endlessTheme(z: number): Theme {
  const at = Math.max(0, z) / ENDLESS_THEME_SPAN;
  const index = Math.floor(at) % THEMES.length;
  const into = (at - Math.floor(at)) * ENDLESS_THEME_SPAN;
  const fadeStart = ENDLESS_THEME_SPAN - ENDLESS_THEME_FADE;
  return blendThemes(
    THEMES[index],
    THEMES[(index + 1) % THEMES.length],
    (into - fadeStart) / ENDLESS_THEME_FADE,
  );
}

/** What stands beside the piste in each world, and in what colours: see Environment.setBiome. */
export const BIOMES: import("./environment").Biome[] = [
  { show: ["woods", "fence", "lamps", "cabins"], pine: "#326c64", stone: "#8396a6", peak: "#8cb3ce", peakSnow: "#f0f6fd", skyline: 1 },
  { show: ["woods", "thicket"], pine: "#2b5e3c", stone: "#8c8a7c", peak: "#8f9a6c", peakSnow: "#f3e6c0", skyline: 0.55 },
  { show: ["spires"], pine: "#3b7f86", stone: "#9fc6de", peak: "#5aa6dc", peakSnow: "#ffffff", skyline: 0.8 },
  { show: ["walls"], pine: "#3d5a52", stone: "#857a8c", peak: "#7d6f9a", peakSnow: "#f1dff0", skyline: 1.45 },
  { show: ["lamps"], pine: "#27484f", stone: "#6f7fa6", peak: "#2a3870", peakSnow: "#b9c6f2", skyline: 1.2 },
];
