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
/** One per mountain: clear morning, golden afternoon, dusk, and night under the aurora. */
export const THEMES: Theme[] = [
  theme("#b8dded", "#f5fbff", "#98afca", 1.8, "#fff8df", 2.5, "#ffffff", "#ffffff", 0.55),
  theme("#f3cfa2", "#fff0d8", "#b7a08f", 1.65, "#ffc37a", 2.7, "#fff1de", "#fff3df", 0.6),
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
