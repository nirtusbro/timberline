import type { MoverKind, MoverSpec } from "./movers";
import { DOUBLE_TIME, EXTRAS_BASE, buildExtras, type ExtrasDesign } from "./extras";
import { CAST } from "./cast";

export const LEVEL_COUNT = 40;
/** Levels come in mountains of ten, each with its own light and its own idea. */
export const WORLD_SIZE = 10;
export const WORLDS = [
  { name: "Sunrise Glades", blurb: "Wide gates and gentle snow. Learn to carve.", starsToUnlock: 0 },
  { name: "Golden Ridge", blurb: "Faster, tighter, and rock on the racing line.", starsToUnlock: 12 },
  { name: "Granite Dusk", blurb: "Rock in every stretch. Precision at speed.", starsToUnlock: 30 },
  { name: "North Face", blurb: "Shaped snow that drags you sideways, under the aurora.", starsToUnlock: 50 },
] as const;
export const WORLD_COUNT = WORLDS.length;
/** The first two mountains have gold tokens on the slope; the rock mountains have none. */
export const TOKEN_LEVELS = 20;
export const worldOf = (level: number) =>
  Math.max(0, Math.min(WORLD_COUNT - 1, Math.floor(level / WORLD_SIZE)));
/** From this level on, the north face: banked snow that drags the skier sideways. */
export const SLOPE_LEVELS = 30;
export const MAX_GATES = 30;
/** Gold tokens a level can hold: optional pickups off the racing line, worth coins. */
export const MAX_TOKENS = 4;
/** Longest course any level can produce; scenery is laid out to cover it. */
export const MAX_COURSE_LENGTH = 1300;
export const STEER_RESPONSE = 4.4;
/** The slope steepens toward the finish: cruising speed rises by this fraction. */
export const SLOPE_RAMP = 0.08;
/** Every level's authored cruising speed is scaled by this. */
export const SPEED_SCALE = 1.15;
/**
 * Star scores as shares of the maximum gate score, easing from the first
 * level to the last: one star forgives a few missed gates, two allow about
 * one, three want a clean run.
 */
export const STAR_FRACTIONS = {
  first: [0.3, 0.6, 0.9],
  last: [0.45, 0.75, 0.97],
} as const;

export interface Gate {
  x: number;
  z: number;
  width: number;
  color: "red" | "blue";
}
export interface Stretch {
  index: number;
  length: number;
  /** Where a token would sit along the stretch and the direct line there. */
  tokenZ: number;
  lineX: number;
  side: number;
  swing: number;
}
export interface TokenSpot {
  x: number;
  z: number;
  side: number;
  stretch: number;
}
export interface Hazard {
  x: number;
  z: number;
  radius: number;
  kind: "rock" | "tree";
}
/**
 * A band of banked snow between `from` and `to`, eased in and out over
 * SLOPE_EASE metres at each end. The shapes banked snow comes in: `camber` tilts the whole piste one way;
 * `dish` curves it up into walls either side that pull toward the middle;
 * `crown` raises a ridge down the middle that tips the skier off to either
 * side; `roller` is a knoll across the piste that hides what lies behind it;
 * `step` splits the piste into two shelves with a bank between them.
 */
export type SlopeKind = "camber" | "dish" | "crown" | "roller" | "step";
export const SLOPE_KINDS: SlopeKind[] = ["camber", "dish", "crown", "roller", "step"];
export interface Slope {
  from: number;
  to: number;
  /** For a camber or step, the side the snow falls toward; 1 for the other kinds. */
  dir: 1 | -1;
  kind: SlopeKind;
  stretch: number;
}
/**
 * Banked snow drives a sideslip: the skis skid down the tilt at this
 * acceleration on a full bank, while edge grip bleeds the slip away with
 * this time constant, so the slip tends to ACCEL × GRIP (7.2 m/s) and keeps
 * carrying the skier for a moment after the bank ends.
 */
export const SLIP_ACCEL = 16;
export const SLIP_GRIP = 0.45;
/** Skidding sideways scrubs forward speed: this much per second for every metre a second of slip. */
export const SLIP_DRAG = 0.25;
export const GRAVITY = 9.81;
/** Metres over which banked snow eases in and out at each end of a slope: long enough that no entry is steeper than a roller's face. */
export const SLOPE_EASE = 8;
/** Slopes keep this far from the gate lines either side of their stretch. */
export const SLOPE_MARGIN = 12;
/** Slopes end this far before any rock in their stretch. */
export const SLOPE_ROCK_GAP = 10;
/** How far a camber rises per metre across: the piste tilts about its centre line. */
export const BANK_RATE = 0.16;
/** Where banked snow meets the fences: it returns to flat over the 4 m before this. */
export const BANK_HALF_WIDTH = 21;
/**
 * A dish's walls and a crown's ridge stand this high, curving out to
 * DISH_REACH either side of centre and level beyond: about a camber's rise,
 * so no shape of snow is a wall.
 */
export const DISH_HEIGHT = 1.6;
export const CROWN_HEIGHT = 1.4;
export const DISH_REACH = 14;
/** A roller's crest stands this high above the piste. */
export const ROLLER_HEIGHT = 2.4;
/** A step drops this far from its high shelf to its low one, across a bank this wide either side of centre. */
export const STEP_HEIGHT = 1.6;
export const STEP_HALF = 4;
/** The steepest cross-slope the skis feel, as a multiple of a full camber. */
export const CROSS_SLOPE_MAX = 1.25;
/** A gate as authored: sideways position, gap from the gate before, width scale. */
export type GateSpec = [x: number, gap: number, widthScale?: number];
/** A slope as authored: the stretch it lies in, the way it falls, and its shape (a camber if unsaid). */
export type SlopeSpec = [stretch: number, dir: 1 | -1, kind?: SlopeKind];
/** A patch of the piste that changes how the skis run: see extras.ts. */
export type ZoneKind = "ice" | "ramp";
export interface Zone {
  kind: ZoneKind;
  /** The middle of the zone across the slope, where it starts down the slope, and its size. */
  x: number;
  z: number;
  halfWidth: number;
  length: number;
}
export type PowerKind = "magnet" | "shield" | "double";
export interface PowerSpot {
  kind: PowerKind;
  x: number;
  z: number;
}
export interface Coin {
  x: number;
  z: number;
  /** Height above the snow: coins over a jump hang in the air. */
  y: number;
}
export type Twist = "" | "rival" | "avalanche" | "goldrush";
export type Weather = "clear" | "snow" | "fog" | "blizzard";
export type { MoverKind, MoverSpec };
export interface LevelDesign extends ExtrasDesign {
  name: string;
  /** What this level asks of the skier, shown on the home card. */
  hint: string;
  gates: GateSpec[];
  baseWidth: number;
  speed: number;
  turnAngle: number;
  pickupRadius: number;
  /** How far off the direct line a token sits, and how far along its stretch. */
  detour: number;
  tokenFraction: number;
  /**
   * Stretches (gate index to the next gate) holding the gold tokens, in order:
   * each sits wide of the line with a fork rock on the line beside it. The
   * rock mountains have none: every stretch there is spoken for.
   */
  tokens: number[];
  forkRocks: boolean;
  /** Token indexes (0–3) that get a guard tree on the token side. */
  guards: number[];
  /** Token-free stretches holding a stray rock where a token would have been. */
  wideRocks: number[];
  /** Stretches with a rock on the direct line halfway along, for gates that would otherwise line up. */
  lineRocks: number[];
  /** Put a stray rock on every stretch that has nothing else in it. */
  fillRocks: boolean;
  /** Stretches that end in a rock gate: two rocks to thread on the way to the next flags. */
  rockGates: number[];
  /** Stretches that end in a weave: three rocks alternating sides on the way in. */
  weaves: number[];
  /** Stretches holding a band of banked snow, and which way each band pushes. */
  slopes: SlopeSpec[];
  /** Par time as a multiple of the course length at cruising speed. */
  parFactor: number;
  /** Points per second under par. Sprint levels pay far more for speed. */
  timeBonusRate: number;
}
export interface Course {
  level: number;
  name: string;
  hint: string;
  /** Set on the endless course, which generates itself ahead of the skier. */
  endless?: boolean;
  extend?: (untilZ: number) => void;
  speedAt?: (z: number) => number;
  gates: Gate[];
  finishZ: number;
  stretches: Stretch[];
  tokens: TokenSpot[];
  hazards: Hazard[];
  /** Bands of banked snow, sorted by z. */
  slopes: Slope[];
  speed: number;
  turnAngle: number;
  pickupRadius: number;
  parTime: number;
  timeBonusRate: number;
  maxGateScore: number;
  /** Scores that earn one, two and three stars. One star passes the level. */
  starScores: [number, number, number];
  /** Small coins, sorted by z. */
  coins: Coin[];
  /** Ice sheets and ramps, sorted by z. */
  zones: Zone[];
  powers: PowerSpot[];
  movers: MoverSpec[];
  twist: Twist;
  weather: Weather;
  /** What a supply crate can hold on this course. */
  cratePowers: PowerKind[];
  /** The rival's pace as a share of cruising speed, on a race level. */
  rivalPace: number;
  /** The avalanche's pace as a share of cruising speed, on an avalanche level. */
  avalanchePace: number;
}
export const BULLSEYE_POINTS = 50;
/** How much of what a Double on the course could add counts toward the star scores. */
export const DOUBLE_SHARE = 0.35;
/** Points lost on every tumble, on top of the broken combo and the lost speed. */
export const CRASH_PENALTY = 300;
export const FORK_ROCK_RADIUS = 1.2;
export const GUARD_TREE_RADIUS = 0.9;
export const WIDE_ROCK_RADIUS = 1;
export const ROCK_GATE_HALF = 3.8;
export const WEAVE_OFFSET = 3.8;
export const WEAVE_STEP = 9;
/** Rock features sit this far before the gate they lead into, on that gate's line. */
export const FEATURE_LEAD = 14;

const base: Omit<LevelDesign, "name" | "hint" | "gates" | "tokens"> = {
  baseWidth: 9,
  speed: 22,
  turnAngle: 0.8,
  pickupRadius: 2.3,
  detour: 4.5,
  tokenFraction: 0.5,
  forkRocks: true,
  guards: [],
  wideRocks: [],
  lineRocks: [],
  fillRocks: false,
  rockGates: [],
  weaves: [],
  slopes: [],
  ...EXTRAS_BASE,
  parFactor: 1.3,
  timeBonusRate: 50,
};
const design = (
  name: string,
  hint: string,
  spec: Partial<Omit<LevelDesign, "name" | "hint">> & Pick<LevelDesign, "gates" | "tokens">,
): LevelDesign => ({ ...base, ...spec, name, hint });

/**
 * Forty hand-placed levels. Each gate is [x, gap before it, width scale];
 * the slope runs from x = −9.5 to 9.5 and every gap is at least 30 metres.
 * Stretch n is the run from gate n to gate n+1 (the last one leads to the finish).
 * Rule: the openings of consecutive gates never overlap sideways, so no two
 * gates can be taken in a straight line, unless a rock sits on the line between
 * them (a token's fork rock, a line rock, a rock gate or a weave).
 */
const LAYOUTS: LevelDesign[] = [
  design("First tracks", "Wide gates that swing wider as you go. Pass between the flags and pick up the gold.", {
    forkRocks: false, baseWidth: 8.4,
    gates: [[-4.5, 60], [4.5, 52], [-4.5, 50], [5, 50], [-5.5, 48], [6, 48], [-6.5, 48], [7, 46], [-7, 46], [6.5, 46]],
    tokens: [1, 3, 5, 7],
  }),
  design("Fool's gold", "A rock sits beside every gold token: go wide for it, or cut inside past the rock.", {
    baseWidth: 8, speed: 23.5,
    gates: [[-4, 60], [4.5, 50], [-4.5, 50], [5, 48], [-6, 48], [5.5, 48], [-5, 46], [6, 46], [-6.5, 46], [7, 46], [-6, 46]],
    tokens: [1, 4, 6, 8],
    wideRocks: [2],
  }),
  design("Find the rhythm", "Even spacing, steady swings, one off-beat gate. Link the combo.", {
    baseWidth: 7.6, speed: 25, turnAngle: 0.83, pickupRadius: 2.2, parFactor: 1.26,
    gates: [[4, 60], [-4, 46], [4.5, 46], [-4.5, 46], [5, 46], [-5, 46], [0, 30], [5.5, 46], [-5, 46], [5, 46], [-5.5, 46], [5, 46]],
    tokens: [1, 3, 8, 10],
    lineRocks: [5, 6],
  }),
  design("Squeeze", "Two funnels that close in and narrow, a double, a chicane and a rock gate.", {
    baseWidth: 7.4, speed: 26, turnAngle: 0.88, pickupRadius: 1.95, detour: 5.2, tokenFraction: 0.46, parFactor: 1.22,
    gates: [[-4, 60], [5, 44], [-5, 42, 0.95], [5, 40, 0.9], [-4.5, 38, 0.85], [4, 36, 0.8], [-3.8, 34, 0.75], [6, 44], [-6, 44], [5.5, 42, 0.95], [-5, 40, 0.9], [4.5, 38, 0.85], [-4, 36, 0.8], [3.5, 33, 0.75], [-6.5, 44, 0.9], [6, 44, 0.85]],
    tokens: [0, 7, 8, 14],
    guards: [1],
    rockGates: [13],
    wideRocks: [1, 9],
  }),
  design("Halfway sprint", "A tight par and a high rate. Carry speed: every second under par pays.", {
    baseWidth: 7.3, speed: 27, turnAngle: 0.89, pickupRadius: 1.95, detour: 5.2, tokenFraction: 0.45, parFactor: 1.1, timeBonusRate: 120,
    gates: [[-3.5, 60], [3.5, 50], [-4, 50], [4, 50], [-3.5, 30], [4.2, 30], [-6, 50], [6, 50], [-9.5, 46], [9.5, 46], [-4, 48], [4, 48], [-4, 48], [3.5, 30], [-4, 30], [5, 50]],
    tokens: [0, 2, 6, 10],
    guards: [2],
    rockGates: [12],
    wideRocks: [7, 11],
  }),
  design("Hold the line", "Pairs on the same side with a rock between them, then a snap back.", {
    baseWidth: 7.2, speed: 28, turnAngle: 0.84, pickupRadius: 2.2, parFactor: 1.26,
    gates: [[4, 60], [-4.5, 46], [5, 46], [8.5, 42], [-5, 46], [-8.5, 42], [5, 44], [-5, 44], [5, 44], [1.5, 42], [-6, 46], [6, 44], [-6, 44]],
    tokens: [0, 5, 6, 11],
    lineRocks: [2, 4, 8],
    wideRocks: [1, 7, 9],
  }),
  design("Light touch", "Chicanes of quick flicks that narrow as they go. Small inputs only.", {
    baseWidth: 7.1, speed: 28.5, turnAngle: 0.85, pickupRadius: 2.1, parFactor: 1.24,
    gates: [[-4, 60], [4.5, 46], [-4.5, 45], [3, 30, 0.95], [-4.2, 30, 0.9], [3, 30, 0.85], [-5, 45], [5, 45], [-2.5, 30, 0.95], [4.7, 30, 0.9], [-2.5, 30, 0.85], [5, 45], [-5.5, 45], [5, 45]],
    tokens: [0, 5, 10, 12],
    wideRocks: [1, 6, 11],
  }),
  design("Read ahead", "Rock gates on the way into flags, each narrower and later than the last.", {
    baseWidth: 7, speed: 29, turnAngle: 0.86, pickupRadius: 2.1, detour: 5, parFactor: 1.24,
    gates: [[4, 60], [-4, 45], [4.5, 45], [-5, 45], [5, 45], [-5.5, 45], [6, 44], [-6, 44], [-1, 40], [6.5, 44], [-6, 44], [6.5, 44], [-6.5, 44], [6, 44]],
    tokens: [0, 4, 9, 12],
    rockGates: [2, 7, 11],
    wideRocks: [1, 5, 6],
  }),
  design("Guarded gold", "Trees guard the gold, and rock-strewn staircases cross the slope.", {
    baseWidth: 6.9, speed: 29.5, turnAngle: 0.87, pickupRadius: 2, detour: 5.2, parFactor: 1.24,
    gates: [[-8, 60], [-4, 42], [0, 40], [4, 40], [8, 40], [-5, 46], [5, 44], [1, 40], [-3, 40], [-7, 40], [8, 44], [-7, 44], [6, 44], [-6, 44], [6, 44]],
    tokens: [4, 9, 11, 13],
    guards: [0, 1, 2, 3],
    lineRocks: [0, 1, 2, 3, 6, 7, 8],
    rockGates: [5],
    wideRocks: [10, 12],
  }),
  design("Commit", "Hairpins from edge to edge. Start the turn before you think you need to.", {
    baseWidth: 6.8, speed: 30, turnAngle: 0.88, pickupRadius: 2, detour: 5.2, tokenFraction: 0.46, parFactor: 1.24,
    gates: [[-9, 60], [9, 44], [-4, 44], [9.5, 44], [-9.5, 44], [4, 44], [-9, 44], [9, 44], [-3.5, 44], [9.5, 44], [-9.5, 44], [4.5, 44], [-9, 44], [9, 44], [-8, 44]],
    tokens: [2, 5, 8, 11],
    guards: [1, 2],
    rockGates: [9],
    wideRocks: [0, 4, 7, 13],
  }),
  design("The long run", "Twenty-two gates of everything so far. Keep the combo alive.", {
    baseWidth: 6.6, speed: 32, turnAngle: 0.9, pickupRadius: 1.9, detour: 5.4, tokenFraction: 0.44, parFactor: 1.22,
    gates: [[-4, 60], [4.5, 44], [-5, 44], [-1, 40], [3, 40], [7, 40], [-9, 44], [9, 44], [1.5, 30], [8.5, 30], [-4, 44], [-8, 40], [5, 44], [-5, 44], [5, 42], [-4, 40], [3.5, 38], [-3.5, 36], [6, 44], [-6, 44], [7, 44], [-5.5, 44]],
    tokens: [0, 6, 12, 19],
    guards: [0, 2],
    lineRocks: [2, 3, 4, 10],
    rockGates: [1, 13],
    wideRocks: [5, 15, 17],
  }),
  design("Tight corridor", "Narrow flags and rock gates all the way down. Precision only.", {
    baseWidth: 6.2, speed: 32.5, turnAngle: 0.9, pickupRadius: 1.9, detour: 5.4, tokenFraction: 0.44, parFactor: 1.22,
    gates: [[4, 60], [-4, 44], [5, 44], [-5, 44], [-8.5, 40], [4, 44, 0.95], [-4, 44, 0.95], [4, 42, 0.9], [-4, 42, 0.9], [4.5, 42, 0.9], [-5, 44, 0.85], [5, 42, 0.85], [-6, 42, 0.85], [-9, 40, 0.8], [5, 44, 0.8], [-5, 44, 0.8], [6, 44, 0.78], [-6, 44, 0.75]],
    tokens: [0, 6, 11, 16],
    guards: [1, 3],
    lineRocks: [3, 12],
    rockGates: [1, 5, 10, 15],
    wideRocks: [8],
  }),
  design("Boulder field", "Weave through rock after rock. Read the slope two gates ahead.", {
    baseWidth: 6.4, speed: 33, turnAngle: 0.91, pickupRadius: 1.85, detour: 5.5, tokenFraction: 0.43, parFactor: 1.22,
    gates: [[-4, 60], [5, 46], [-6, 46], [6, 46], [-9, 44], [9, 44], [-5, 46], [5, 46], [-2, 44], [4.5, 44], [-3, 44], [5, 46], [-6, 46], [6, 46], [-9.5, 44], [9.5, 44], [-5, 44], [5, 44]],
    tokens: [0, 6, 10, 16],
    guards: [1, 2],
    weaves: [7, 8, 9],
    rockGates: [3, 15],
    wideRocks: [1, 4, 13],
  }),
  design("Zigzag", "Fast, wide, relentless alternation at short spacing, rocks in the corners.", {
    baseWidth: 6.2, speed: 34, turnAngle: 0.92, pickupRadius: 1.85, detour: 5.5, tokenFraction: 0.42, parFactor: 1.2,
    gates: [[3, 60], [-8.5, 38], [7.5, 36], [-6, 36], [7, 36], [-5.5, 36], [7, 36], [-9.5, 38], [9.5, 38], [-7.5, 36], [7, 36], [-7.5, 36], [8.5, 36], [-7, 36], [7, 36], [-9.5, 38], [9.5, 38], [-7, 36], [5.5, 36], [-9, 38]],
    tokens: [0, 7, 8, 15],
    guards: [0],
    rockGates: [9],
    wideRocks: [3, 5, 11, 13, 17],
  }),
  design("No mercy", "Hairpins, flicks and a weave, with gates that keep you guessing.", {
    baseWidth: 6.1, speed: 35, turnAngle: 0.93, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.42, parFactor: 1.2,
    gates: [[4.5, 60], [8, 40], [-9.5, 42], [9.5, 42], [3, 30], [-3.5, 30], [5, 44], [9, 40], [2.5, 44], [-5, 44], [6, 42], [-5, 40], [4, 38], [-9.5, 42], [9.5, 42], [3, 44], [-9.5, 42], [9.5, 42], [3, 40], [-3.5, 30]],
    tokens: [5, 8, 11, 14],
    guards: [1, 3],
    lineRocks: [0, 6],
    weaves: [7],
    rockGates: [9, 15],
    wideRocks: [3, 12, 17],
  }),
  design("Speed run", "A tight par and a huge time bonus. Carry speed through every gate.", {
    baseWidth: 6.1, speed: 35.5, turnAngle: 0.94, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.41, parFactor: 1.1, timeBonusRate: 250,
    gates: [[-2.5, 60], [6.8, 44], [-6.3, 44], [6.2, 44], [-4.6, 44], [9.5, 44], [-9.5, 44], [4, 44], [-7, 44], [5, 44], [8.4, 40], [-6, 44], [6, 44], [-5.5, 44], [9.5, 44], [-9.5, 44], [4.4, 44], [-6.5, 44], [4.4, 44], [-5.3, 44], [9.5, 44], [-9.5, 44]],
    tokens: [0, 6, 12, 18],
    guards: [1],
    lineRocks: [9],
    rockGates: [8],
    wideRocks: [2, 10, 16, 20],
  }),
  design("Thin air", "The fastest cruise yet, through the narrowest flags and quick flicks.", {
    baseWidth: 5.8, speed: 37, turnAngle: 0.95, pickupRadius: 1.8, detour: 5.7, tokenFraction: 0.4, parFactor: 1.2,
    gates: [[-4, 60], [7, 42], [-7.5, 42], [-1.5, 30], [4.5, 30], [-1.5, 30], [4.5, 40], [-2, 40], [4, 40], [-4, 42], [2, 30], [-4, 30], [2, 30], [8, 42], [-7.5, 42], [9.5, 42], [-9.5, 42], [6.5, 42], [-4.5, 42], [1.5, 30], [-4.5, 30], [4, 42]],
    tokens: [0, 8, 13, 20],
    guards: [1, 2, 3],
    rockGates: [1, 14],
    wideRocks: [6, 16, 17],
  }),
  design("The gauntlet", "Weaves, rock gates, hairpins and flicks, one after another.", {
    baseWidth: 5.8, speed: 37.5, turnAngle: 0.95, pickupRadius: 1.8, detour: 5.8, tokenFraction: 0.39, parFactor: 1.2,
    gates: [[3, 60], [-3, 30], [3, 30], [-3, 30], [3.5, 45], [-9.5, 42], [9.5, 42], [3.5, 40], [-2.5, 40], [3.5, 40], [-2.5, 30], [3.5, 30], [-2.5, 30], [4, 45], [-7.5, 42], [-1.5, 40], [7, 42], [-3.5, 42], [3, 40], [-3, 38], [-9, 45], [9.5, 42], [-9.5, 42], [6, 42]],
    tokens: [4, 8, 15, 22],
    guards: [1, 2],
    weaves: [3, 12, 19],
    rockGates: [5, 16, 21],
    wideRocks: [6, 13, 17],
  }),
  design("Everything at once", "Twenty-six gates and every trick on the ridge.", {
    baseWidth: 5.6, speed: 38.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 6, tokenFraction: 0.38, parFactor: 1.16,
    gates: [[-3, 60], [6, 44], [-8, 44], [9.5, 44], [-9.5, 44], [6, 40], [-5, 38, 0.95], [4.5, 36, 0.9], [-3.5, 34, 0.85], [-9.5, 40], [-3, 30], [3, 30], [-3, 30], [3, 40], [-3, 40], [3.5, 40], [-3, 45], [9.5, 44], [-9.5, 44], [5, 44], [-1, 30], [5, 30], [-1.5, 45], [5, 44], [-9, 44], [9, 44]],
    tokens: [0, 5, 13, 23],
    guards: [0, 2, 3],
    weaves: [15, 21],
    rockGates: [1, 16, 22],
    wideRocks: [3, 8, 18, 24],
  }),
  design("The summit", "The top of the ridge: the fastest snow yet, and every second under par pays.", {
    baseWidth: 5.5, speed: 40, turnAngle: 0.96, pickupRadius: 1.8, detour: 6, tokenFraction: 0.38, parFactor: 1.1, timeBonusRate: 250,
    gates: [[4, 60], [-7.8, 42], [8.5, 42], [-6.7, 45], [9.5, 42], [-9.5, 42], [-3.5, 40], [3, 40], [-3, 40], [3.5, 42], [-3, 42], [3, 30], [-3, 30], [3, 30], [-3.5, 42], [-9.5, 45], [9.5, 42], [-7.4, 42], [6.1, 42], [-3.1, 40, 0.95], [3, 38, 0.92], [-2.8, 36, 0.9], [5.7, 42], [-5.4, 45], [4.6, 42], [-9.5, 42]],
    tokens: [0, 6, 13, 21],
    guards: [0, 2, 3],
    weaves: [2, 14, 22],
    rockGates: [1, 9, 17],
    wideRocks: [4, 7, 18, 23],
  }),
  // Granite Dusk: ten levels of gates and rock, with a rock in every stretch
  // that has nothing else in it.
  design("Black run", "Past the summit there is only rock. Four rock gates and two weaves at speed.", {
    baseWidth: 5.4, speed: 38, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [5, 42], [-6, 40], [7, 40], [-8, 40], [9, 45], [-5, 38], [4, 38], [-7, 40], [8, 40], [-9.5, 42], [9.5, 42], [-4, 38], [5, 38], [-6, 38], [7, 40], [-8, 40], [9, 45], [-5, 38], [6, 38], [-7, 40], [8, 40], [-9.5, 42], [9.5, 42]],
    tokens: [],
    weaves: [4, 16],
    rockGates: [1, 7, 13, 19],
  }),
  design("Rock garden", "Weave after weave. Read three rocks ahead or eat snow.", {
    baseWidth: 5.3, speed: 38.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[3, 60], [-6, 42], [6, 44], [-7, 44], [6, 44], [-5, 44], [7, 44], [-8, 40], [8, 40], [-6, 44], [5, 44], [-7, 44], [8, 44], [-9, 40], [9, 40], [-6, 44], [6, 44], [-7, 44], [7, 44], [-5, 40], [9.5, 42], [-9.5, 42], [6, 40], [-7, 40]],
    tokens: [],
    weaves: [1, 3, 5, 9, 11, 15, 17],
    rockGates: [7, 13, 19],
  }),
  design("The chute", "Funnels that close to nothing, with flicks between. Precision at speed.", {
    baseWidth: 5.2, speed: 39, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [5, 42], [-5, 40, 0.95], [4.5, 38, 0.9], [-4, 36, 0.88], [6, 42], [-6, 40, 0.95], [5.5, 38, 0.9], [-5, 36, 0.88], [7, 44], [-3, 30], [3.5, 30], [-3, 30], [6, 42], [-6, 40, 0.95], [5.5, 38, 0.9], [-5, 36, 0.88], [7, 44], [-9.5, 42], [9.5, 42], [-3, 30], [3.5, 30], [-3, 30], [6, 42], [-7, 42], [7, 42]],
    tokens: [],
    weaves: [8, 16],
    rockGates: [4, 12, 24],
  }),
  design("Knife edge", "Hairpin after hairpin at full tilt, rocks on every way in.", {
    baseWidth: 5.1, speed: 39.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-9, 60], [9.5, 42], [-9.5, 42], [5, 40], [-9.5, 42], [9.5, 42], [-4, 40], [9, 45], [-9.5, 42], [4.5, 40], [-9, 42], [9.5, 42], [-5, 40], [9.5, 42], [-9.5, 42], [4, 40], [-9.5, 42], [9.5, 42], [-5, 40], [9, 45], [-9.5, 42], [5, 40], [-9.5, 42], [9.5, 42], [-4, 40], [8, 42]],
    tokens: [],
    weaves: [6, 18],
    rockGates: [3, 9, 15, 21],
  }),
  design("Couloir", "Twenty-eight gates of flicks, each pair ending in rock.", {
    baseWidth: 5, speed: 40, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-3, 60], [3.5, 40], [-3.5, 40], [3, 30], [-3, 30], [3, 30], [-3, 30], [7, 44], [-7, 44], [3, 30], [-3, 30], [3, 30], [-3, 30], [8, 44], [-8, 44], [3.5, 30], [-3, 30], [3.5, 30], [-3, 30], [7, 44], [-7, 44], [3, 30], [-3, 30], [3, 30], [-3, 30], [9, 44], [-9, 44], [6, 40]],
    tokens: [],
    weaves: [6, 12, 18, 24],
    rockGates: [7, 13, 19, 25],
  }),
  design("Icefall", "Staircases with a rock on every step, then the drop.", {
    baseWidth: 5, speed: 40.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-9, 60], [-5, 40], [-1, 40], [3, 40], [7, 40], [-6, 44], [6, 44], [2, 40], [-2, 40], [-6, 40], [-9, 40], [9, 44], [-9, 44], [-5, 40], [-1, 40], [3, 40], [7, 40], [-7, 44], [7, 44], [3, 40], [-1, 40], [-5, 40], [-9, 40], [9.5, 44], [-9.5, 44], [5, 40], [-6, 40], [7, 40]],
    tokens: [],
    lineRocks: [0, 1, 2, 3, 6, 7, 8, 9, 12, 13, 14, 15, 18, 19, 20, 21],
    weaves: [5, 11, 17, 23],
    rockGates: [4, 10, 16, 22],
  }),
  design("Vertigo", "Hairpins into chicanes into hairpins. Never a straight metre.", {
    baseWidth: 4.9, speed: 41, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-9, 60], [9.5, 42], [-9.5, 42], [3, 30], [-3, 30], [3, 30], [-9, 42], [9.5, 42], [-9.5, 42], [3, 30], [-3, 30], [3, 30], [-9, 42], [9.5, 44], [-9.5, 44], [3, 30], [-3, 30], [3, 30], [-9, 42], [9.5, 44], [-9.5, 44], [3, 30], [-3, 30], [3, 30], [-9, 42], [9.5, 44], [-9.5, 44], [5, 40]],
    tokens: [],
    weaves: [12, 18, 24],
    rockGates: [0, 6, 13, 19],
  }),
  design("Whiteout", "Everything the mountain has, thirty gates of it.", {
    baseWidth: 4.9, speed: 41.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [6, 40], [-7, 40], [8, 40], [-9, 42], [9.5, 42], [-5, 38], [4, 38], [-3, 30], [3, 30], [-3, 30], [7, 44], [-8, 44], [3, 40], [-1, 40], [-5, 40], [-9, 40], [9.5, 44], [-9.5, 44], [5, 40], [-6, 40, 0.95], [5, 38, 0.9], [-4.5, 36, 0.88], [7, 44], [-7, 44], [3, 30], [-3, 30], [3, 30], [-8, 42], [8, 42]],
    tokens: [],
    lineRocks: [13, 14, 15],
    weaves: [10, 16, 22],
    rockGates: [3, 11, 17, 23, 28],
  }),
  design("Last light", "Tighter, faster, rockier. One tumble is one too many.", {
    baseWidth: 4.8, speed: 42, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[3, 60], [-6, 40], [7, 40], [-8, 40], [9, 40], [-9.5, 42], [9.5, 42], [-4, 38], [4.5, 38], [-5, 38], [5.5, 38], [-3, 30], [3, 30], [-3, 30], [8, 44], [-8, 44], [4, 40], [-4, 40], [-8, 40], [9, 44], [-9, 44], [5, 40], [-5.5, 40, 0.95], [5, 38, 0.92], [-4.5, 36, 0.9], [8, 44], [-8, 44], [3, 30], [-3, 30], [7, 42]],
    tokens: [],
    lineRocks: [17],
    weaves: [13, 18, 24, 25],
    rockGates: [1, 3, 6, 8, 15, 20, 28],
  }),
  design("Beyond the summit", "The last word. Thirty gates, every trick, nothing to spare.", {
    baseWidth: 4.7, speed: 42.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [6, 40], [-8, 40], [9.5, 42], [-9.5, 42], [4, 38], [-5, 38], [3, 30], [-3, 30], [3, 30], [-8, 44], [8, 44], [-4, 40], [0, 40], [4, 40], [8, 40], [-9, 44], [9.5, 44], [-9.5, 44], [5, 40], [-6, 40, 0.95], [5, 38, 0.92], [-4.5, 36, 0.9], [8, 44], [-8, 44], [3, 30], [-3, 30], [3, 30], [-9, 42], [9, 42]],
    tokens: [],
    lineRocks: [12, 13, 14],
    weaves: [9, 15, 22],
    rockGates: [2, 10, 16, 23, 28],
  }),
  // The north face: ten levels of shaped snow, planned as a course. Each of
  // the first five teaches one shape on its own, in the order a skier can
  // learn them; the next three combine shapes with what came before; the
  // last two mix everything with rock. A band
  // runs from 12 m past one gate to 12 m before the next (10 m before the
  // rocks of a rock gate), so flags always stand on flat snow.
  //
  // 31 First bank: cambers only. Off-camber bands come first (the push fights
  // the traverse, so aim upslope early), then with-the-grain bands (the push
  // carries you past the flags, so hold back). Long bands, few rocks.
  design("First bank", "Banked snow drags you sideways. Aim upslope, into the tilt, and hold it through the band.", {
    baseWidth: 5.2, speed: 38.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [6, 52], [-6, 52], [6, 44], [-7, 52], [7, 52], [-4, 30], [4, 30], [-7, 52], [7, 52], [-6, 44], [6, 52], [-6, 52], [6, 44], [-8, 52], [8, 52], [-5, 44], [5, 44], [-7, 52], [7, 52]],
    tokens: [],
    slopes: [[0, -1], [1, 1], [3, 1], [4, -1], [7, 1], [8, -1], [10, 1], [11, -1], [13, -1], [14, 1], [17, 1], [18, -1], [19, 1]],
    weaves: [15],
    rockGates: [9, 12],
  }),
  // 32 Halfpipe: the dish is the signature, never the whole level. Dishes into
  // rock gates high on the walls, a staircase of line rocks back down a wall,
  // a camber and a crown for contrast, flicks and weaves between.
  design("Halfpipe", "Walls that pull you to the middle, rock gates high up them, a staircase back down. Climb on purpose.", {
    baseWidth: 5.1, speed: 39, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-6, 60], [7, 50], [-8, 50], [8, 44], [-3, 30], [3, 30], [-9, 50], [9.5, 50], [-9.5, 50], [5, 44], [1, 40], [-3, 40], [-7, 40], [8, 50], [-8, 50], [8, 50], [-4, 30], [4, 30], [-9, 50], [9, 50], [-9, 50], [6, 44], [-6, 44], [6, 44]],
    tokens: [],
    lineRocks: [9, 10, 11],
    slopes: [[0, 1, "dish"], [1, 1, "dish"], [5, -1], [6, 1, "dish"], [7, 1, "dish"], [12, 1, "crown"], [13, 1, "dish"], [14, 1, "dish"], [17, 1, "dish"], [18, 1], [19, 1, "dish"], [23, 1, "dish"]],
    weaves: [8, 22],
    rockGates: [2, 6, 7, 17, 19, 20],
  }),
  // 33 The ridge: the crown is the signature. Flank pairs where staying out
  // pays, crossings into rock gates, a blind crossing over a roller, cambers
  // that fight the crossing, a long 60-metre crown, and flicks between.
  design("The ridge", "A crown down the middle tips you off it. Hold a flank, cross it into rock gates, cross it blind.", {
    baseWidth: 5, speed: 39.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [-9.5, 50], [-4, 50], [4.5, 44], [9.5, 50], [-9.5, 50], [-3, 30], [3, 30], [-3, 30], [-8.5, 50], [8, 50], [-8, 50], [-3, 44], [-8, 50], [8, 60], [3, 50], [8.5, 50], [-8.5, 50], [-3, 30], [3.5, 30], [-9, 50], [9, 50], [-9, 50], [-4, 44], [5, 44], [-6, 44]],
    tokens: [],
    slopes: [[0, 1, "crown"], [1, 1, "crown"], [3, 1, "crown"], [4, 1, "crown"], [8, 1, "crown"], [9, 1, "roller"], [10, 1, "crown"], [12, -1], [13, 1, "crown"], [14, 1, "crown"], [15, 1], [16, 1, "crown"], [19, 1], [20, 1, "crown"], [21, 1, "roller"], [25, 1, "crown"]],
    weaves: [11, 23],
    rockGates: [2, 4, 10, 16, 22, 24],
  }),
  // 34 Terraces: the step is the signature. Rides and climbs into rock gates,
  // a rock-strewn staircase, a camber and a dish and a roller thrown in so
  // no two banks in a row ask the same thing.
  design("Terraces", "Two shelves and a bank between. Ride it down into rock gates, climb it against the push, and never twice the same way.", {
    baseWidth: 5, speed: 40, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-6, 60], [7, 48], [-7, 48], [7, 44], [2, 30], [-4, 30], [8, 50], [-8, 50], [-4, 40], [0, 40], [4, 40], [8, 40], [-7, 48], [7, 48], [-7, 48], [-2, 30], [4, 30], [-8, 48], [8, 50], [-8, 50], [-3, 44], [7, 48], [-7, 48], [7, 48], [-9, 44], [9, 44]],
    tokens: [],
    lineRocks: [7, 8, 9, 10],
    slopes: [[0, 1, "step"], [1, 1, "step"], [5, -1, "step"], [6, -1, "step"], [11, -1, "step"], [12, -1], [13, 1, "step"], [16, 1, "dish"], [17, 1, "step"], [18, 1, "step"], [20, 1, "roller"], [21, -1, "step"], [22, -1, "step"], [25, 1, "step"]],
    weaves: [19, 24],
    rockGates: [2, 5, 6, 17, 18, 23],
  }),
  // 35 Blind rollers: the roller is the signature. Knolls before hairpins,
  // knolls before rock gates you cannot see, flicks straight after a crest,
  // a staircase, a crown and two cambers so the crests never come alone.
  design("Blind rollers", "Crests hide the flags and the rocks behind them. Set your line before the top, every time.", {
    baseWidth: 4.9, speed: 40.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [6, 50], [-7, 50], [8, 44], [3, 30], [-3, 30], [-9, 50], [9.5, 50], [-9.5, 50], [-5, 40], [-1, 40], [4, 40], [8, 40], [-8, 50], [-2, 30], [5, 30], [-8, 50], [8, 50], [-9.5, 50], [9.5, 44], [4, 44], [-6, 50], [-1, 30], [5, 30], [-8, 50], [8, 50]],
    tokens: [],
    lineRocks: [8, 9, 10, 11],
    slopes: [[0, 1, "roller"], [1, 1, "roller"], [5, 1, "roller"], [6, 1, "roller"], [7, -1], [12, 1, "roller"], [15, 1, "crown"], [16, 1, "roller"], [17, 1, "roller"], [20, 1, "roller"], [23, 1], [24, 1, "roller"], [25, 1, "roller"]],
    weaves: [18],
    rockGates: [2, 6, 17, 19],
  }),
  // 36 Long traverse: camber mastery. Sixty-metre stretches where the skid
  // reaches full speed and carries past the band, a dish and a roller and a
  // crown on the same long stretches for contrast, a staircase, and four
  // banks in a row that run straight into rock gates.
  design("Long traverse", "Sixty-metre stretches: the skid builds to full speed and carries past the bank. Then four banks into rock gates.", {
    baseWidth: 4.9, speed: 41, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-3, 60], [7, 60], [-8, 60], [8, 60], [-8, 60], [4, 44], [-1, 30], [5, 30], [-8, 60], [8, 60], [-9.5, 60], [-5, 40], [-1, 40], [4, 40], [8.5, 40], [-6, 56], [6, 56], [-7, 56], [7, 56], [-3, 44], [-9, 60], [9, 60]],
    tokens: [],
    lineRocks: [10, 11, 12, 13],
    slopes: [[0, -1], [1, 1], [2, 1, "dish"], [3, -1], [7, 1], [8, 1, "roller"], [9, -1], [14, -1], [15, 1, "crown"], [16, -1], [17, 1], [19, -1], [20, 1], [21, -1]],
    weaves: [18],
    rockGates: [4, 14, 15, 16, 17],
  }),
  // 37 Switchbacks: crown into dish into crown, so one band throws you out to
  // a flank and the next pulls you in while the flags sit up the wall; rock
  // gates at the foot of both, a step and a roller and a camber for contrast,
  // a staircase and flicks between.
  design("Switchbacks", "A crown throws you out, the dish after it pulls you in, and the flags sit up the wall. Read the snow two bands ahead.", {
    baseWidth: 4.8, speed: 41.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-4, 60], [7, 50], [-8, 50], [8, 50], [3, 30], [-3, 30], [3, 30], [-8, 50], [8, 50], [-9.5, 50], [-5, 40], [-1, 40], [4, 40], [9, 50], [-8, 50], [8, 50], [-8, 50], [-3, 44], [7, 50], [-7, 50], [-2, 30], [4, 30], [-8, 50], [8, 50], [-8, 50], [8, 44]],
    tokens: [],
    lineRocks: [9, 10, 11],
    slopes: [[0, 1, "crown"], [1, 1, "dish"], [2, 1, "crown"], [6, 1, "dish"], [7, 1, "crown"], [8, 1, "dish"], [12, -1, "step"], [13, 1, "crown"], [14, 1, "dish"], [15, 1, "roller"], [17, 1, "crown"], [18, 1, "dish"], [21, 1], [22, 1, "crown"], [23, 1, "dish"], [25, 1, "crown"]],
    weaves: [16],
    rockGates: [2, 8, 17, 18, 24],
  }),
  // 38 Cornice: rollers into flicks you could not see, steps into rock gates
  // both ways, a dish into a rock gate, a crown, a camber, a staircase and
  // narrowing flicks, in no repeating order.
  design("Cornice", "A crest, then a flick you could not see. Steps into rock gates, both ways. Nothing here repeats.", {
    baseWidth: 4.8, speed: 42, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[3, 60], [-6, 50], [-1, 30], [5, 30], [-7, 50], [6, 50], [-8, 50], [-3, 30], [3, 30, 0.95], [-3, 30, 0.9], [-8.5, 50], [8, 50], [4, 40], [0, 40], [-4, 40], [-8, 40], [8, 50], [-8, 50], [-3, 30], [3, 30, 0.95], [8, 50], [-8, 50], [-3, 44], [7, 50], [-7, 50], [-2, 30], [4, 30, 0.95], [-8, 44]],
    tokens: [],
    lineRocks: [11, 12, 13, 14],
    slopes: [[0, 1, "roller"], [3, -1, "step"], [4, -1, "step"], [5, -1], [9, 1, "roller"], [10, 1, "dish"], [15, 1, "step"], [16, 1, "step"], [19, 1, "roller"], [20, 1, "crown"], [22, -1, "step"], [23, 1, "roller"], [27, 1, "roller"]],
    weaves: [21],
    rockGates: [4, 10, 16, 22, 26],
  }),
  // 39 Avalanche path: every shape paired with the rock feature that hurts it
  // most. Staircases with line rocks; a camber with the grain into a rock
  // gate; a dish before a staircase up its wall; a roller before a rock gate
  // you cannot see; a step whose high shelf holds the flags.
  design("Avalanche path", "Staircases, weaves and rock gates, each behind the shape of snow that makes it hardest.", {
    baseWidth: 4.7, speed: 42.5, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[-9, 60], [-5, 40], [-1, 40], [3, 40], [7, 40], [-6, 50], [6, 50], [-7, 50], [3, 30], [-3, 30], [3, 30], [-8, 50], [8, 50], [-9.5, 50], [5, 40], [1, 40], [-3, 40], [-7, 40], [8, 50], [-8, 50], [7, 50], [-3, 30], [3, 30], [-3, 30], [9, 50], [-9, 50], [6, 44], [-6, 44]],
    tokens: [],
    lineRocks: [0, 1, 2, 3, 14, 15, 16],
    slopes: [[4, -1], [5, 1, "dish"], [6, 1, "crown"], [10, 1, "roller"], [11, -1, "step"], [12, 1], [17, 1, "dish"], [18, 1, "crown"], [19, 1, "step"], [23, 1, "roller"], [24, -1], [27, 1, "dish"]],
    weaves: [25],
    rockGates: [4, 10, 11, 24, 26],
  }),
  // 40 North face: the whole course in order, tightened. Cambers, dishes,
  // crowns, a rock-strewn staircase, steps, rollers, narrowing flicks, and a
  // finale of one band of each shape, most of them into rock gates.
  design("North face", "Everything the north face taught, in order and tighter. Thirty gates, five shapes of snow, nothing to spare.", {
    baseWidth: 4.7, speed: 43, turnAngle: 0.96, pickupRadius: 1.8, detour: 5.6, tokenFraction: 0.45,
    fillRocks: true, parFactor: 1.2,
    gates: [[3, 60], [-6, 42], [6, 42], [-7, 50], [7, 44], [-8, 42], [8, 42], [-9.5, 50], [-3, 30], [3, 30, 0.95], [-3, 30, 0.92], [-8, 42], [8, 42], [-8, 50], [-4, 38], [0, 38], [4, 38], [8, 38], [-7, 42], [7, 42], [-6, 50], [7, 42], [-9.5, 42], [9.5, 50], [-3, 30], [3, 30, 0.95], [-3, 30, 0.92], [8, 40], [-8, 40], [8, 50]],
    tokens: [],
    lineRocks: [13, 14, 15, 16],
    slopes: [[0, 1], [1, 1], [2, -1], [4, 1, "dish"], [5, 1, "dish"], [6, 1, "dish"], [10, 1, "crown"], [11, 1, "crown"], [12, 1, "crown"], [17, -1, "step"], [18, -1, "step"], [19, 1, "step"], [20, 1, "roller"], [21, 1, "roller"], [22, 1, "roller"], [26, 1], [27, 1, "dish"], [28, 1, "crown"], [29, -1, "step"]],
    weaves: [3],
    rockGates: [2, 6, 12, 19, 22, 23, 28],
  }),
];
/** Each layout with its cast (see cast.ts): the level as it is played. */
export const LEVEL_DESIGNS: LevelDesign[] = LAYOUTS.map((layout, level) => ({ ...layout, ...CAST[level] }));
export const levelSettings = (level: number) =>
  LEVEL_DESIGNS[Math.max(0, Math.min(LEVEL_COUNT - 1, level))];

/**
 * How far sideways a skier can move over a forward distance from a straight
 * heading with full input, using the same steering dynamics as the run.
 */
export function lateralReach(distance: number, speed: number, turnAngle: number) {
  let heading = 0,
    x = 0,
    z = 0;
  const dt = 1 / 60;
  while (z < distance) {
    heading += (turnAngle - heading) * (1 - Math.exp(-STEER_RESPONSE * dt));
    x += Math.sin(heading) * speed * dt;
    z += Math.cos(heading) * speed * dt;
  }
  return x;
}

/** Builds the fixed course for a level from its authored design. */
export function buildCourse(level: number): Course {
  const S = levelSettings(level);
  const gates: Gate[] = [];
  let z = 0;
  const quick = new Set<number>();
  for (const [i, [x, gap, widthScale = 1]] of S.gates.entries()) {
    z += gap;
    if (i > 0 && gap < 36) quick.add(i);
    gates.push({
      x,
      z,
      width: S.baseWidth * widthScale,
      color: i % 2 ? "blue" : "red",
    });
  }
  const finishZ = gates[gates.length - 1].z + 60;
  const stretches: Stretch[] = gates.map((gate, i) => {
    const next = gates[i + 1] ?? { x: 0, z: finishZ };
    const length = next.z - gate.z;
    return {
      index: i,
      length,
      tokenZ: Math.round(gate.z + length * S.tokenFraction),
      lineX: gate.x + (next.x - gate.x) * S.tokenFraction,
      side: Math.sign(gate.x) || 1,
      swing: Math.abs(next.x - gate.x),
    };
  });
  const tokens: TokenSpot[] = S.tokens.map((index) => {
    const s = stretches[index];
    return {
      x: Math.round((s.lineX + s.side * S.detour) * 10) / 10,
      z: s.tokenZ,
      side: s.side,
      stretch: index,
    };
  });
  const hazards: Hazard[] = [];
  const rock = (x: number, zz: number, radius: number) =>
    hazards.push({ x: Math.round(x * 10) / 10, z: Math.round(zz), radius, kind: "rock" });
  for (const [i, spot] of tokens.entries()) {
    const s = stretches[spot.stretch];
    if (S.forkRocks) rock(s.lineX, s.tokenZ, FORK_ROCK_RADIUS);
    // A guard tree narrows the token line without blocking the way in: on the
    // inside when the approach from the previous gate is nearly straight,
    // otherwise on the outside where an overshoot would go. Never within 12
    // metres of a gate line.
    const approach = Math.abs(gates[spot.stretch].x - spot.x);
    const treeZ = Math.max(s.tokenZ - 8, gates[spot.stretch].z + 12);
    if (S.guards.includes(i) && treeZ <= s.tokenZ - 3)
      hazards.push({
        x: Math.round((spot.x + (approach <= 3 ? -1 : 1) * spot.side * 3.2) * 10) / 10,
        z: treeZ,
        radius: GUARD_TREE_RADIUS,
        kind: "tree",
      });
  }
  // Rock features line up with the gate they lead into, since a skier heads
  // for the next flags as soon as the last ones are behind.
  for (const index of S.weaves) {
    const s = stretches[index],
      next = gates[index + 1];
    for (const [k, dz] of [2 * WEAVE_STEP, WEAVE_STEP, 0].entries())
      rock(next.x + (k % 2 ? -1 : 1) * WEAVE_OFFSET * s.side, next.z - FEATURE_LEAD - dz, WIDE_ROCK_RADIUS);
  }
  for (const index of S.rockGates) {
    const next = gates[index + 1];
    for (const side of [-1, 1]) rock(next.x + side * ROCK_GATE_HALF, next.z - FEATURE_LEAD, WIDE_ROCK_RADIUS);
  }
  for (const index of S.wideRocks) {
    const s = stretches[index];
    rock(s.lineX + s.side * S.detour, s.tokenZ, WIDE_ROCK_RADIUS);
  }
  for (const index of S.lineRocks) {
    const gate = gates[index],
      next = gates[index + 1] ?? { x: 0, z: finishZ };
    rock((gate.x + next.x) / 2, (gate.z + next.z) / 2, FORK_ROCK_RADIUS);
  }
  if (S.fillRocks) {
    const used = new Set([
      ...S.tokens,
      ...S.weaves,
      ...S.rockGates,
      ...S.wideRocks,
      ...S.lineRocks,
      ...S.slopes.map(([index]) => index),
      // A stretch with ice or something that moves is left clear of stray rock.
      ...S.ice,
      ...S.movers.map(([index]) => index),
    ]);
    for (const s of stretches)
      if (!used.has(s.index) && s.index < stretches.length - 1 && s.length >= 30)
        rock(s.lineX + s.side * S.detour, s.tokenZ, WIDE_ROCK_RADIUS);
  }
  hazards.sort((a, b) => a.z - b.z);
  // A slope band fills its stretch between the gate margins, stopping short of
  // any rock in the stretch so the drift never carries a skier into one unseen.
  const slopes: Slope[] = S.slopes.map(([index, dir, kind = "camber"]) => {
    const gate = gates[index],
      next = gates[index + 1] ?? { x: 0, z: finishZ };
    const from = gate.z + SLOPE_MARGIN;
    let to = next.z - SLOPE_MARGIN;
    for (const h of hazards)
      if (h.z > gate.z && h.z < next.z) to = Math.min(to, h.z - SLOPE_ROCK_GAP);
    // Only a camber or a step has a side to fall toward.
    return { from, to, dir: kind === "camber" || kind === "step" ? dir : 1, kind, stretch: index };
  });
  slopes.sort((a, b) => a.from - b.from);
  const maxGateScore = gates.reduce((sum, _, i) => sum + 100 * Math.min(8, i + 1), 0);
  const speed = Math.round(S.speed * SPEED_SCALE * 10) / 10;
  const parTime = Math.round((finishZ / speed) * S.parFactor + 2);
  const t = level / (LEVEL_COUNT - 1);
  const extras = buildExtras(S, gates, stretches, tokens, hazards, finishZ, speed);
  // A Double on the course is part of what a good run scores, so the stars ask for most of what it adds.
  const doubled = extras.powers
    .filter((p) => p.kind === "double")
    .reduce(
      (sum, p) =>
        sum +
        gates.reduce((s, g, i) => s + (g.z > p.z && g.z <= p.z + DOUBLE_TIME * speed ? 100 * Math.min(8, i + 1) : 0), 0),
      0,
    );
  const starBase = maxGateScore + DOUBLE_SHARE * doubled;
  const starScores = STAR_FRACTIONS.first.map((first, i) => {
    const fraction = first + (STAR_FRACTIONS.last[i] - first) * t;
    return Math.round((fraction * starBase) / 50) * 50;
  }) as [number, number, number];
  void quick;
  return {
    ...extras,
    twist: S.twist,
    weather: S.weather,
    cratePowers: cratePowersFor(level),
    rivalPace: S.rivalPace,
    avalanchePace: S.avalanchePace,
    level,
    name: S.name,
    hint: S.hint,
    gates,
    finishZ,
    stretches,
    tokens,
    hazards,
    slopes,
    speed,
    turnAngle: S.turnAngle,
    pickupRadius: S.pickupRadius,
    parTime,
    timeBonusRate: S.timeBonusRate,
    maxGateScore,
    starScores,
  };
}
/** Crates start out holding only coins; the power-ups join them as the levels introduce each one. */
export const POWER_INTRO: Record<PowerKind, number> = { shield: 6, magnet: 7, double: 11 };
export function cratePowersFor(level: number): PowerKind[] {
  return (Object.keys(POWER_INTRO) as PowerKind[]).filter((kind) => level > POWER_INTRO[kind]);
}
/**
 * How far the snow is banked at a distance down the course: the sum of every
 * slope band's push there, eased in and out, so −1 to 1 with the sign giving
 * the direction of the drift. Zero on flat snow, which is everywhere else.
 */
export function slopeTilt(course: Pick<Course, "slopes">, z: number, ease = SLOPE_EASE) {
  let tilt = 0;
  for (const slope of course.slopes) {
    if (z <= slope.from || z >= slope.to) continue;
    const edge = Math.min(z - slope.from, slope.to - z);
    const t = Math.min(1, edge / ease);
    tilt += slope.dir * t * t * (3 - 2 * t);
  }
  return Math.max(-1, Math.min(1, tilt));
}
/** How far into a band a point is, eased at both ends: 0 outside, 1 in the middle. */
export function slopeWindow(slope: Pick<Slope, "from" | "to">, z: number) {
  if (z <= slope.from || z >= slope.to) return 0;
  const t = Math.min(1, Math.min(z - slope.from, slope.to - z) / SLOPE_EASE);
  return t * t * (3 - 2 * t);
}
/** The most rocks and trees any level places, so renderers can pool enough models. */
export function hazardPoolSizes() {
  let rocks = 0,
    trees = 0;
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const hazards = getCourse(level).hazards;
    rocks = Math.max(rocks, hazards.filter((h) => h.kind === "rock").length);
    trees = Math.max(trees, hazards.filter((h) => h.kind === "tree").length);
  }
  return { rocks, trees };
}
const cache = new Map<number, Course>();
export function getCourse(level: number) {
  const key = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(level)));
  let course = cache.get(key);
  if (!course) {
    course = buildCourse(key);
    cache.set(key, course);
  }
  return course;
}
