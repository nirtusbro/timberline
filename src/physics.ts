import { createCrates, stepCrates } from "./crates";
import {
  BANK_HALF_WIDTH,
  BANK_RATE,
  BULLSEYE_POINTS,
  CRASH_PENALTY,
  CROSS_SLOPE_MAX,
  CROWN_HEIGHT,
  DISH_HEIGHT,
  DISH_REACH,
  GRAVITY,
  ROLLER_HEIGHT,
  SLIP_ACCEL,
  SLIP_DRAG,
  SLIP_GRIP,
  SHOULDER,
  STEER_RESPONSE,
  GRIP,
  TOP_PACE,
  fallPace,
  STEP_HALF,
  STEP_HEIGHT,
  getCourse,
  slopeWindow,
  type Course,
} from "./levels";
import { finishTimeBonus } from "./scoring";
import { CRATE_COINS, CRATE_POINTS } from "./crates";
import { createMover, moverGap, stepMover, touchesMover, type MoverKind, type MoverState } from "./movers";
import { aside, faceHeight, locate, sAtZ, trailAt, trailDir, trailHalf, trailPitch } from "./trail";
import { seededRandom } from "./random";
import {
  AIR_POINTS,
  BOOST_FULL_BELOW,
  BOOST_SPEED,
  BOOST_TIME,
  CHASM_MIN_SPEED,
  CHASM_SWALLOW,
  CLEAR_HEIGHT,
  CHASM_FALL_TIME,
  CLOSE_CALL_GAP,
  CLOSE_CALL_POINTS,
  COIN_POINTS,
  COIN_REACH,
  DOUBLE_TIME,
  ICE_SPEED,
  ICE_STEER,
  JUMP_GRAVITY,
  MAGNET_REACH,
  MAGNET_TIME,
  POWER_REACH,
  RAMP_LIP,
  RIVAL_POINTS,
  jumpFor,
  zoneAt,
} from "./extras";
import type { Gate, PowerKind } from "./levels";
import { createEndlessCourse } from "./endless";
export type { Course, Gate, Hazard, TokenSpot } from "./levels";

/** Where the points of a run came from, before any doubling; `double` is what a Double added on top. */
export interface Points {
  gates: number;
  bullseyes: number;
  coins: number;
  air: number;
  close: number;
  crates: number;
  double: number;
  /** Beating the fox, or the lead held over an avalanche. */
  twist: number;
  time: number;
}
/** Something that happened this step that the screen and speakers should mark. */
export interface Fx {
  kind: "coin" | "power" | "shield" | "close" | "launch" | "land" | "wake" | "bump" | "rival-finish" | "swallow" | "fall";
  x: number;
  z: number;
  value?: number;
  power?: PowerKind;
  mover?: MoverKind;
}
/** How much of the steering reaches the skis in the air. */
export const AIR_STEER = 0.3;
/** The fox eases off or digs in when this far ahead or behind. */
export const RIVAL_BAND = 40;
/** He skis this far to one side of the middle of each gate, leaving the bullseye to the wolf. */
export const RIVAL_OFFSET = 1.7;
/** The fox's pace on ice and around a leap, as multiples of his usual. */
/** Every gate the wolf misses puts the fox this much further on. */
export const RIVAL_MISS_GAIN = 14;
export const RIVAL_ON_ICE = 0.86;
export const RIVAL_IN_AIR = 1.16;
/** Once passed, he digs in when this far behind, so he stays on the tails of the wolf. */
export const RIVAL_CHASE = 18;
/** The fox starts this far down the course: he is there to be caught. */
export const RIVAL_HEAD_START = 30;
/** Passed, he digs in: this much quicker for every metre he is behind, up to this much. He is never shaken off for good; a slip lets him back through. */
export const RIVAL_FIGHT = 0.02;
export const RIVAL_FIGHT_MOST = 0.28;
/** And over the last stretch of the course he gives it everything. */
export const RIVAL_KICK = 0.05;
/** An avalanche starts this far behind, waits this long, and speeds up on a skier this far ahead. */
export const AVALANCHE_START = 45;
export const AVALANCHE_DELAY = 1.5;
export const AVALANCHE_BAND = 48;
/** While the skier is down, the slide piles up on itself and slows to this share of its pace. */
export const AVALANCHE_MERCY = 0.6;
/** A missed gate lets the avalanche gain this much at once. */
export const AVALANCHE_MISS_GAIN = 9;
/** Points for every metre of lead over the avalanche at the finish, up to 45 m. */
export const ESCAPE_POINTS_PER_METRE = 12;
export interface Run {
  level: number;
  course: Course;
  /** Where the skier is in the world, and in trail coordinates: how far down the trail, and how far to one side of its middle. */
  x: number;
  z: number;
  s: number;
  u: number;
  speed: number;
  /** Which way the skis point, as an angle off the fall line. */
  heading: number;
  /** The line of travel the thumb steers away from, and the camera looks along: it follows the skis round. */
  aim: number;
  /** In the deep snow past the edge of the trail. */
  powder: boolean;
  /** Sideways skid across the piste in m/s (+x positive): driven by banked snow, bled by edge grip. */
  slip: number;
  time: number;
  nextGate: number;
  hits: number;
  misses: number;
  crashes: number;
  bullseyes: number;
  /** Indices of the gates whose bullseye was taken, so the scene can show them collected. */
  bullseyeGates: number[];
  combo: number;
  bestCombo: number;
  /** Points the last gate paid, bullseye and doubling included. */
  gateGain: number;
  score: number;
  gateBonus: number;
  timeBonus: number;
  /** Misses plus tumbles over the run. */
  strikes: number;
  /** Lives left on an endless run; it ends when they reach zero. */
  lives: number;
  /** Crates caught since the last life won, on an endless run. */
  cratesTowardLife: number;
  /** Set for the step in which a life was won. */
  lifeEvent: boolean;
  /** Index of the first hazard that could still be ahead, so checks stay cheap. */
  hazardCursor: number;
  /** Which of the course's gold tokens have been picked up, and how many. */
  tokens: boolean[];
  tokenCount: number;
  /** Index of the token picked up this step, or -1. */
  tokenEvent: number;
  /** Coins earned so far this run: bullseyes, tokens and crates. */
  coins: number;
  /** Stars earned, set at the finish: 0 to 3. */
  stars: number;
  crates: ReturnType<typeof createCrates>;
  crashTime: number;
  invincible: number;
  finished: boolean;
  passed: boolean;
  event: string;
  /** Height above the snow and upward speed, while in the air off a ramp. */
  y: number;
  vy: number;
  airborne: boolean;
  /** The jump under way is a leap over a chasm. */
  leap: boolean;
  airTime: number;
  jumps: number;
  /** Seconds left of carve boost, magnet and double; whether a shield is up. */
  boost: number;
  magnet: number;
  double: number;
  shield: boolean;
  onIce: boolean;
  coinTaken: boolean[];
  coinCursor: number;
  coinCount: number;
  powerTaken: boolean[];
  /** Where this run found the moving gates in their swing: a phase added to every one, rolled afresh each run. */
  gateShift: number;
  movers: MoverState[];
  /** Rolls what this run's movers do: where a learner is in its turn, how long a deer stares. */
  moverRandom: () => number;
  closeCalls: number;
  points: Points;
  /** What happened this step, for sound and effects. Cleared every step. */
  fx: Fx[];
  /** The fox, on a race level. */
  rival: { x: number; z: number; s: number; u: number; done: boolean; time: number } | null;
  rivalBeaten: boolean;
  /** How far down the trail the avalanche has come; NaN when there is none. */
  avalancheS: number;
  caught: boolean;
}
export const COMBO_CAP = 8;
export const BULLSEYE_RADIUS = 1;
export { BULLSEYE_POINTS, CRASH_PENALTY };
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
/**
 * How the skis answer. The thumb does not set a heading down a fixed slope:
 * it turns the skis away from where they are already going (`aim`, which the
 * camera looks along), and `aim` follows the skis round. So a flick is a
 * quick jink that comes back, and a thumb held over is a turn that keeps
 * turning: the way to follow a trail that bends.
 */
export const AIM_FOLLOW = 1.0;
/** Left alone, the skis find the fall line at this rate (per second, at right angles to it). */
export const FALL_LINE_SEEK = 0.16;
/** Pointed further across the hill than this, they come round much faster: nobody is left stalled across the slope. */
export const STALL_ANGLE = 0.9;
export const STALL_SEEK = 0.7;
export { GRIP };
export const TURN_MAX = 1.9;
/** The skis never point further off the fall line than this, nor the line of travel than that. */
export const HEADING_MAX = 1.38;
export const AIM_MAX = 1.22;
export { fallPace, TOP_PACE };
/** Nobody is left standing: below this the skier poles and skates. */
export const MIN_PACE = 9;
/** Turning hard scrubs speed: this many m/s lost each second with the skis held half a radian off the line of travel, and four times that at a whole one. A gentle arc costs next to nothing; a jammed turn costs a lot. */
export const CARVE_SCRUB = 6;
/** Speed builds at this rate (per second) and bleeds away at that: slower, so speed carried into a traverse lasts a while. */
export const SPEED_GAIN = 0.5;
export const SPEED_BLEED = 0.3;
/** Deep snow past the edge of the trail holds the skis to this share of their pace, quickly. */
export const POWDER_PACE = 0.8;
export const POWDER_DRAG = 1.6;
/** On ice the skis slide toward the fall line at this rate, whatever the thumb says. */
export const ICE_SLIDE = 0.3;
/**
 * How much higher (or, negative, lower) the snow is than the plain face of
 * the mountain at trail coordinates, because of a band of shaped snow: the
 * piste tilts about its middle, and comes back level toward its edges.
 */
export function shapeHeight(course: Pick<Course, "slopes">, u: number, s: number) {
  let height = 0;
  for (const slope of course.slopes) {
    const w = slopeWindow(slope, s);
    if (w === 0) continue;
    if (slope.kind === "roller") {
      // A knoll across the whole piste, cresting halfway along the band; a
      // short band gets a lower knoll, so its faces are never steeper.
      const length = slope.to - slope.from;
      const t = Math.sin((Math.PI * (s - slope.from)) / length);
      // It dies away into the deep snow either side of the trail.
      const off = Math.min(1, Math.max(0, (BANK_HALF_WIDTH + 14 - Math.abs(u)) / 10));
      height += ROLLER_HEIGHT * Math.min(1, length / 26) * t * t * off * off * (3 - 2 * off);
      continue;
    }
    // The sideways shapes come back level toward the edge.
    const e = Math.min(1, Math.max(0, (BANK_HALF_WIDTH - Math.abs(u)) / 4));
    const edge = e * e * (3 - 2 * e);
    const reach = Math.min(u * u, DISH_REACH * DISH_REACH) / (DISH_REACH * DISH_REACH);
    let shape = 0;
    if (slope.kind === "camber") shape = -slope.dir * BANK_RATE * u;
    else if (slope.kind === "dish") shape = DISH_HEIGHT * reach;
    else if (slope.kind === "crown") shape = CROWN_HEIGHT * (1 - reach);
    else {
      // A step: the high shelf on the side the snow falls from, a bank across the middle.
      const st = Math.min(1, Math.max(0, (u * slope.dir + STEP_HALF) / (2 * STEP_HALF)));
      shape = STEP_HEIGHT * (0.5 - st * st * (3 - 2 * st));
    }
    height += shape * edge * w;
  }
  return height;
}
/** The same at a point of the world. Shapes are laid level across the mountain, so this is good near the trail and far from it. */
export function bankHeight(course: Pick<Course, "slopes" | "trail">, x: number, z: number) {
  if (!course.slopes.length) return 0;
  return shapeHeight(course, aside(course.trail, x, z), sAtZ(course.trail, z));
}
/** The height of the snow under a point of the world: the face of the mountain, and any shaping of the piste on it. */
export const surfaceHeight = (course: Pick<Course, "slopes" | "trail">, x: number, z: number) =>
  faceHeight(course.trail, z) + bankHeight(course, x, z);
/**
 * How steeply shaped snow falls away across the trail under a point, as a
 * multiple of a full camber (positive toward +u), read off the surface
 * itself so every shape drives the skis the way it looks. Capped: past a
 * point the edges bite no harder.
 */
export function crossSlope(course: Pick<Course, "slopes">, u: number, s: number) {
  if (!course.slopes.length) return 0;
  const fall = (shapeHeight(course, u - 0.5, s) - shapeHeight(course, u + 0.5, s)) / BANK_RATE;
  return Math.max(-CROSS_SLOPE_MAX, Math.min(CROSS_SLOPE_MAX, fall));
}
/**
 * How far sideways the skid will carry a skier between here and a point
 * further down the trail, given the slip already under way, the banks on the
 * way and a steady speed. This is what a skier reads off the snow ahead to
 * know how far upslope to aim.
 */
export function driftAhead(course: Pick<Course, "slopes">, u: number, s: number, slip: number, speed: number, untilS: number) {
  if (!course.slopes.length) return 0;
  let drift = 0;
  const step = 1,
    dt = step / Math.max(5, speed),
    grip = 1 - Math.exp(-dt / SLIP_GRIP);
  for (let at = s; at < untilS; at += step) {
    const terminal = crossSlope(course, u + drift, at + step / 2) * SLIP_ACCEL * SLIP_GRIP;
    slip += (terminal - slip) * grip;
    drift += slip * dt;
  }
  return drift;
}
/** Lives an endless run starts with; every miss or tumble costs one. */
export const ENDLESS_LIVES = 3;
/** Crates caught on an endless run that win an extra life. There is no cap. */
export const CRATES_PER_LIFE = 5;
/** Coins for a bullseye and for a gold token. */
export const BULLSEYE_COINS = 1;
export const TOKEN_COINS = 5;
/** How many stars a score earns against a course's three star scores. */
export const starsFor = (score: number, starScores: readonly number[]) =>
  starScores.filter((needed) => needed > 0 && score >= needed).length;
/** The layout of a level is fixed; what moves on it is rolled afresh each run, from the run's seed. */
export const levelSeed = (level: number) => (level * 7919 + 101) >>> 0;
export function createRun(level = 0, seed = Math.floor(Math.random() * 4294967296)): Run {
  return runFor(getCourse(level), seed);
}
/** A run of the endless course; every run is a fresh course from its seed. */
export function createEndlessRun(seed = Math.floor(Math.random() * 4294967296)): Run {
  return runFor(createEndlessCourse(seed), seed);
}
const blankPoints = (): Points => ({
  gates: 0,
  bullseyes: 0,
  coins: 0,
  air: 0,
  close: 0,
  crates: 0,
  double: 0,
  twist: 0,
  time: 0,
});
export function runFor(course: Course, seed: number): Run {
  const start = trailAt(course.trail, 0, 0);
  return {
    level: course.level,
    course,
    x: start.x,
    z: start.z,
    s: 0,
    u: 0,
    speed: cruiseAt(course, 0) * 0.5,
    heading: start.dir,
    aim: start.dir,
    powder: false,
    slip: 0,
    time: 0,
    nextGate: 0,
    hits: 0,
    misses: 0,
    crashes: 0,
    strikes: 0,
    lives: ENDLESS_LIVES,
    cratesTowardLife: 0,
    lifeEvent: false,
    hazardCursor: 0,
    bullseyes: 0,
    bullseyeGates: [],
    combo: 0,
    bestCombo: 0,
    gateGain: 0,
    score: 0,
    gateBonus: 0,
    timeBonus: 0,
    tokens: course.tokens.map(() => false),
    tokenCount: 0,
    tokenEvent: -1,
    coins: 0,
    stars: 0,
    crates: createCrates(seed),
    crashTime: 0,
    invincible: 0,
    finished: false,
    passed: false,
    event: "",
    y: 0,
    vy: 0,
    airborne: false,
    leap: false,
    airTime: 0,
    jumps: 0,
    boost: 0,
    magnet: course.twist === "goldrush" ? MAGNET_TIME : 0,
    double: 0,
    shield: false,
    onIce: false,
    coinTaken: [],
    coinCursor: 0,
    coinCount: 0,
    powerTaken: course.powers.map(() => false),
    gateShift: seededRandom(seed >>> 0, 0x7a3d91)() * Math.PI * 2,
    movers: [],
    moverRandom: seededRandom(seed >>> 0, 0x2c1b3c6d),
    closeCalls: 0,
    points: blankPoints(),
    fx: [],
    rival:
      course.twist === "rival"
        ? { ...trailAt(course.trail, RIVAL_HEAD_START, rivalLine(course, RIVAL_HEAD_START)), s: RIVAL_HEAD_START, u: rivalLine(course, RIVAL_HEAD_START), done: false, time: 0 }
        : null,
    rivalBeaten: false,
    avalancheS: course.twist === "avalanche" ? -AVALANCHE_START : NaN,
    caught: false,
  };
}
/** Adds points under a heading of the tally, doubled while a Double is running. Returns what was added. */
function award(s: Run, key: keyof Points, base: number) {
  s.points[key] += base;
  const doubled = s.double > 0 && key !== "time" && key !== "twist";
  if (doubled) s.points.double += base;
  const total = doubled ? base * 2 : base;
  s.score += total;
  return total;
}
/** Switches a power-up on. */
export function grantPower(s: Run, kind: PowerKind) {
  if (kind === "magnet") s.magnet = MAGNET_TIME;
  else if (kind === "double") s.double = DOUBLE_TIME;
  else s.shield = true;
  s.fx.push({ kind: "power", x: s.x, z: s.z, power: kind });
}
const hits = (s: Run, o: { x: number; z: number; radius: number }) => Math.hypot(o.x - s.x, o.z - s.z) < o.radius + 0.65;
const saw = (t: number) => {
  const p = (((t / (2 * Math.PI)) % 1) + 1) % 1;
  return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
};
/** Where across the trail the middle of a gate is at a moment: a moving gate slides from side to side, and never stops. */
export const gateU = (gate: Gate, time: number, shift = 0) =>
  gate.drift
    ? gate.u + gate.drift.amp * (gate.drift.saw ? saw(time * gate.drift.rate + gate.drift.phase + shift) : Math.sin(time * gate.drift.rate + gate.drift.phase + shift))
    : gate.u;
/** The cruising speed of a course at a distance down its trail: what a skier pointed straight down the fall line settles to. Steeper pitches are faster. */
export const cruiseAt = (c: Course, s: number) => (c.speedAt ? c.speedAt(s) : c.speed) * trailPitch(c.trail, s);
/** How fast a skier who simply follows the trail gets along it there: slower where it cuts across the fall line. */
export const trailPace = (c: Course, s: number) => cruiseAt(c, s);
/** Where across the trail the line of the fox runs at a distance down it: gate centre to gate centre, eased. */
export function rivalLine(c: Course, s: number) {
  const gates = c.gates;
  let i = 0;
  while (i < gates.length && gates[i].s < s) i++;
  const side = (g: Gate) => g.alt ?? g.u;
  const a = i === 0 ? { u: 3.5, s: 0 } : { u: side(gates[i - 1]), s: gates[i - 1].s },
    b = gates[i] ? { u: side(gates[i]), s: gates[i].s } : { u: 0, s: c.finishS };
  const t = clamp((s - a.s) / Math.max(1, b.s - a.s), 0, 1);
  return a.u + (b.u - a.u) * t * t * (3 - 2 * t);
}
export function stepRun(s: Run, input: number, dt: number) {
  s.event = "";
  s.tokenEvent = -1;
  s.gateBonus = 0;
  s.lifeEvent = false;
  s.crates.event = false;
  s.fx.length = 0;
  if (s.finished || dt <= 0) return;
  const c = s.course,
    trail = c.trail;
  // An endless course keeps building itself well ahead of the skier.
  c.extend?.(s.s + 600, s.s);
  dt = Math.min(dt, 0.05);
  s.time += dt;
  s.invincible = Math.max(0, s.invincible - dt);
  s.boost = Math.max(0, s.boost - dt);
  // On a gold rush the magnet never runs down.
  if (c.twist !== "goldrush") s.magnet = Math.max(0, s.magnet - dt);
  s.double = Math.max(0, s.double - dt);
  const oldX = s.x,
    oldZ = s.z,
    oldS = s.s,
    oldU = s.u,
    oldSpeed = s.speed,
    oldHeading = s.heading;
  const cruise = cruiseAt(c, s.s),
    half = trailHalf(trail, s.s),
    along = trailDir(trail, s.s);
  s.onIce = !s.airborne && s.crashTime === 0 && zoneAt(c.zones, "ice", s.u, s.s) !== undefined;
  s.powder = !s.airborne && Math.abs(s.u) > half;
  let slipX = 0,
    slipZ = 0;
  if (s.crashTime > 0) {
    s.crashTime = Math.max(0, s.crashTime - dt);
    s.speed += (4 - s.speed) * (1 - Math.exp(-5 * dt));
    // A tumbling skier slides back onto the trail and comes up pointing down it.
    const back = (clamp(s.u, -(half - 3), half - 3) - s.u) * (1 - Math.exp(-6 * dt));
    slipX = back * Math.cos(along);
    slipZ = -back * Math.sin(along);
    const k = 1 - Math.exp(-8 * dt);
    s.heading += (along - s.heading) * k;
    s.aim += (along - s.aim) * k;
    // A tumbling skier digs in: the skid dies away quickly.
    s.slip *= Math.exp(-dt / SLIP_GRIP);
    // A moment of grace on getting up: enough to clear what was hit, not enough to plough on through the next thing.
    if (s.crashTime === 0) s.invincible = 1.1;
  } else {
    // In the air or on ice the skis barely answer; the line was set before.
    const grip = s.airborne ? AIR_STEER : s.onIce ? ICE_STEER : 1;
    // The thumb turns the skis off the way the trail runs, and letting go brings them back to it: the trail is what
    // "straight on" means, wherever on the mountain it is heading. The skis answer at once and always the same way.
    s.aim = along;
    s.heading += (along + clamp(input, -1, 1) * c.turnAngle - s.heading) * (1 - Math.exp(-STEER_RESPONSE * grip * dt));
    // A carve boost is extra speed that fades as it runs out: a big kick on
    // gentle slopes, a smaller one where the snow is already fast.
    const surge = BOOST_SPEED * Math.min(1, BOOST_FULL_BELOW / cruise) * Math.min(1, s.boost / (BOOST_TIME * 0.5));
    // The pace is the slope's, less a little for skis turned hard across the trail.
    let target = cruise - Math.abs(s.heading - along) * (s.airborne ? 0 : s.onIce ? 2 : CARVE_SCRUB) + Math.sin(s.s * 0.015) * 0.8 + surge + (s.onIce ? ICE_SPEED : 0);
    if (s.powder) target *= POWDER_PACE;
    s.speed += (target - s.speed) * (1 - Math.exp(-(s.boost > 0 && target > s.speed ? 3.2 : s.powder && target < s.speed ? POWDER_DRAG : 1.1) * dt));
    // Banked snow: gravity across the tilt drives the skis into a sideslip
    // that builds while the bank lasts, and edge grip bleeds it away, so the
    // skid keeps carrying the skier for a moment after the bank ends.
    // Shaped snow lies level across the mountain: it is felt where it is drawn.
    const terminal = s.airborne || !c.slopes.length ? 0 : crossSlope(c, aside(trail, s.x, s.z), sAtZ(trail, s.z)) * SLIP_ACCEL * SLIP_GRIP;
    s.slip += (terminal - s.slip) * (1 - Math.exp(-dt / SLIP_GRIP));
    // Skidding sideways scrubs speed.
    s.speed = Math.max(0, s.speed - SLIP_DRAG * Math.abs(s.slip) * dt);
    slipX = s.slip * dt * Math.cos(along);
    slipZ = -s.slip * dt * Math.sin(along);
  }
  s.x += (Math.sin(oldHeading) * oldSpeed + Math.sin(s.heading) * s.speed) * dt * 0.5 + slipX;
  s.z += (Math.cos(oldHeading) * oldSpeed + Math.cos(s.heading) * s.speed) * dt * 0.5 + slipZ;
  const here = locate(trail, s.x, s.z, oldS);
  // The way is down: a skier turned right across the mountain still counts as where he got to.
  s.s = here.s;
  s.u = here.u;
  if (s.crashTime === 0 && !s.airborne && c.slopes.length) {
    // Height is speed: dropping into the trough of a bank gives a little
    // back, climbing onto its crest takes some away.
    const rise = bankHeight(c, s.x, s.z) - bankHeight(c, oldX, oldZ);
    s.speed = Math.max(0, s.speed - (GRAVITY * rise) / Math.max(5, s.speed));
  }
  // Jumps: leaving the lip of a ramp launches the skier; gravity brings him down.
  if (s.airborne) {
    s.airTime += dt;
    s.vy -= JUMP_GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
      s.airborne = false;
      s.jumps++;
      s.fx.push({ kind: "land", x: s.x, z: s.z, value: award(s, "air", AIR_POINTS) });
      // With an avalanche behind, the chasm just cleared swallows the front of it.
      if (s.leap && !Number.isNaN(s.avalancheS)) {
        s.avalancheS -= CHASM_SWALLOW;
        s.fx.push({ kind: "swallow", x: s.x, z: s.z });
      }
      s.leap = false;
    }
  } else
    for (const zone of c.zones) {
      // A tumbling skier still goes off the lip of a chasm; only an ordinary ramp is missed.
      if (s.crashTime > 0 && !zone.leap) continue;
      if (zone.s > s.s) break;
      const lip = zone.s + zone.length;
      if (zone.kind !== "ramp" || oldS >= lip || s.s < lip || Math.abs(s.u - zone.u) > zone.halfWidth) continue;
      // The lip of a chasm spans the piste and throws further; nobody leaves it too slowly to clear.
      s.leap = zone.leap === true;
      if (s.leap) {
        s.speed = Math.max(s.speed, cruise * CHASM_MIN_SPEED);
        // The kicker throws even a tumbling skier back onto his skis.
        s.crashTime = 0;
      }
      s.airborne = true;
      s.airTime = 0;
      s.y = RAMP_LIP;
      s.vy = jumpFor(s.speed, s.leap).vy;
      s.fx.push({ kind: "launch", x: s.x, z: s.z });
    }
  // Missed the kicker: over the edge and into the gap. It costs a tumble and the time it takes to climb out on the far side.
  if (!s.airborne) {
    const gap = zoneAt(c.zones, "chasm", s.u, s.s);
    if (gap) {
      const out = trailAt(trail, gap.s + gap.length + 5, clamp(s.u, -(half - 3), half - 3));
      s.x = out.x;
      s.z = out.z;
      s.s = gap.s + gap.length + 5;
      s.u = clamp(s.u, -(half - 3), half - 3);
      s.heading = out.dir;
      s.speed = 4;
      s.slip = 0;
      s.invincible = 0;
      if (s.crashTime === 0) {
        s.combo = 0;
        s.boost = 0;
        s.crashes++;
        s.strikes++;
        s.lives--;
        s.score = Math.max(0, s.score - CRASH_PENALTY);
        s.event = "crash";
      }
      s.crashTime = CHASM_FALL_TIME;
      s.fx.push({ kind: "fall", x: out.x, z: out.z });
    }
  }
  const flying = s.airborne && s.y > CLEAR_HEIGHT;
  const safe = s.invincible > 0 || s.crashTime > 0;
  const closeCall = (x: number, z: number) => {
    s.closeCalls++;
    s.fx.push({ kind: "close", x, z, value: award(s, "close", CLOSE_CALL_POINTS) });
  };
  // Hazards are sorted by s; skip those already behind and stop past the skier.
  while (s.hazardCursor < c.hazards.length && c.hazards[s.hazardCursor].s < s.s - 6) s.hazardCursor++;
  let struck = false;
  for (let i = s.hazardCursor; i < c.hazards.length && c.hazards[i].s < s.s + 6; i++) {
    const h = c.hazards[i];
    if (flying) continue;
    if (hits(s, h)) {
      struck = true;
      break;
    }
    // Going by within a metre of it is a close call.
    if (!safe && oldS < h.s && s.s >= h.s && Math.abs(h.u - s.u) - h.radius - 0.65 < CLOSE_CALL_GAP) closeCall(h.x, h.z);
  }
  // Movers wake as the skier comes within their lead, and are judged the same way.
  while (s.movers.length < c.movers.length) s.movers.push(createMover(c.movers[s.movers.length], trail, s.moverRandom));
  for (let i = 0; i < s.movers.length; i++) {
    const m = s.movers[i];
    if (m.phase === "done") continue;
    const was = m.phase;
    stepMover(m, c.movers[i], trail, s.s, cruise, dt, cruise);
    if (was === "waiting" && m.phase === "active") s.fx.push({ kind: "wake", x: m.x, z: m.z, mover: m.kind, value: Math.sign(m.u - s.u) });
    if (m.phase !== "active" || m.hit) continue;
    if (!flying && !safe && !struck && touchesMover(m, s.x, s.z)) {
      struck = true;
      m.hit = true;
      s.fx.push({ kind: "bump", x: m.x, z: m.z, mover: m.kind });
      continue;
    }
    if (Math.abs(m.s - s.s) < 1.2) m.nearest = Math.min(m.nearest, moverGap(m, s.u) - 0.65);
    if (!m.passed && s.s > m.s + 1.2) {
      m.passed = true;
      if (!safe && !flying && m.nearest < CLOSE_CALL_GAP) closeCall(m.x, m.z);
      // Clearing a mover in the air is its own small triumph.
      else if (flying && Math.abs(m.u - s.u) < m.radius + 1.5) closeCall(m.x, m.z);
    }
  }
  // Past the deep snow at the edge of the trail stand the trees, or the rock.
  if (!safe && (struck || (!s.airborne && Math.abs(s.u) > half + SHOULDER))) {
    if (s.shield) {
      // The shield takes the knock: no tumble, no lost combo, a moment of grace.
      s.shield = false;
      s.invincible = 0.9;
      s.speed *= 0.85;
      s.fx.push({ kind: "shield", x: s.x, z: s.z });
    } else {
      s.crashTime = 1.1;
      s.combo = 0;
      s.boost = 0;
      s.crashes++;
      s.strikes++;
      s.lives--;
      s.airborne = false;
      s.y = 0;
      s.score = Math.max(0, s.score - CRASH_PENALTY);
      s.event = "crash";
    }
  }
  const dx = s.x - oldX,
    dz = s.z - oldZ,
    lengthSquared = dx * dx + dz * dz;
  /** How near the step just taken came to a point on the snow. */
  const sweep = (px: number, pz: number) => {
    const t = lengthSquared > 0 ? clamp(((px - oldX) * dx + (pz - oldZ) * dz) / lengthSquared, 0, 1) : 0;
    return Math.hypot(px - (oldX + t * dx), pz - (oldZ + t * dz));
  };
  if (s.crashTime === 0) {
    for (let i = 0; i < c.tokens.length; i++) {
      const token = c.tokens[i];
      if (s.tokens[i] || Math.abs(token.s - s.s) > c.pickupRadius + 2 || sweep(token.x, token.z) >= c.pickupRadius) continue;
      // Tokens are worth coins, not points, so the best score never depends on them.
      s.tokens[i] = true;
      s.tokenCount++;
      s.coins += TOKEN_COINS;
      s.tokenEvent = i;
    }
    // Coins are sorted by s: only those within reach of this step are looked at.
    const reach = s.magnet > 0 ? MAGNET_REACH : COIN_REACH;
    while (s.coinCursor < c.coins.length && c.coins[s.coinCursor].s < oldS - MAGNET_REACH - 2) s.coinCursor++;
    for (let i = s.coinCursor; i < c.coins.length && c.coins[i].s <= s.s + reach + 2; i++) {
      const coin = c.coins[i];
      if (s.coinTaken[i] || sweep(coin.x, coin.z) >= reach) continue;
      // A coin hung over a jump can only be taken from the air (or by a magnet).
      if (s.magnet === 0 && Math.abs(coin.y - s.y) > 1.7) continue;
      s.coinTaken[i] = true;
      s.coinCount++;
      s.coins++;
      award(s, "coins", COIN_POINTS);
      s.fx.push({ kind: "coin", x: coin.x, z: coin.z, value: i });
    }
    for (let i = 0; i < c.powers.length; i++) {
      const power = c.powers[i];
      if (s.powerTaken[i] || Math.abs(power.s - s.s) > POWER_REACH + 2) continue;
      if (sweep(power.x, power.z) >= POWER_REACH) continue;
      s.powerTaken[i] = true;
      grantPower(s, power.kind);
    }
  }
  stepCrates(s, oldX, oldZ, dt);
  if (s.crates.event) {
    award(s, "crates", CRATE_POINTS);
    s.coins += CRATE_COINS;
    // Once the levels have introduced a power-up, crates may hold it.
    if (c.cratePowers.length) grantPower(s, c.cratePowers[s.crates.collected % c.cratePowers.length]);
  }
  // On the endless run every fifth crate caught wins a life, with no cap.
  if (c.endless && s.crates.event && ++s.cratesTowardLife >= CRATES_PER_LIFE) {
    s.cratesTowardLife = 0;
    s.lives++;
    s.lifeEvent = true;
  }
  while (s.nextGate < c.gates.length && s.s >= c.gates[s.nextGate].s) {
    const gate = c.gates[s.nextGate];
    const t = clamp((gate.s - oldS) / Math.max(0.001, s.s - oldS), 0, 1);
    const crossingU = oldU + (s.u - oldU) * t;
    // A fork counts through either opening; the bullseye is in whichever was taken. A moving gate is judged where it is at this moment.
    const offset = Math.min(Math.abs(crossingU - gateU(gate, s.time, s.gateShift)), gate.alt === undefined ? Infinity : Math.abs(crossingU - gate.alt));
    const through = offset <= gate.width / 2;
    if (through && s.crashTime > 0) {
      // Tumbled through between the flags: no points, the combo is already gone, but it is not a gate missed.
      s.nextGate++;
      continue;
    }
    if (through) {
      s.hits++;
      s.combo = Math.min(COMBO_CAP, s.combo + 1);
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      let gained = award(s, "gates", 100 * s.combo);
      if (offset <= BULLSEYE_RADIUS) {
        s.bullseyes++;
        s.bullseyeGates.push(s.nextGate);
        s.gateBonus = BULLSEYE_POINTS;
        gained += award(s, "bullseyes", BULLSEYE_POINTS);
        s.coins += BULLSEYE_COINS;
        // The reward for a perfect gate is speed: a carve boost.
        s.boost = BOOST_TIME;
      }
      s.gateGain = gained;
      s.event = "gate";
    } else {
      s.combo = 0;
      s.misses++;
      if (s.crashTime === 0) {
        s.strikes++;
        s.lives--;
      }
      if (s.event !== "crash") s.event = "miss";
      // A race is run through the gates: going round one hands the fox a length or two.
      if (s.rival && !s.rival.done) s.rival.s += RIVAL_MISS_GAIN;
      // Skipping the course is no way to outrun an avalanche: every gate missed lets it gain.
      if (!Number.isNaN(s.avalancheS)) s.avalancheS = Math.max(s.avalancheS, Math.min(s.avalancheS + AVALANCHE_MISS_GAIN, s.s - 6));
    }
    s.nextGate++;
  }
  if (s.rival && !s.rival.done) {
    // The fox starts ahead and skis the gate line at his own pace. He eases a
    // little when far ahead and digs in a little when well behind, no more:
    // he is beaten by skiing better than he does, and he does not wait.
    const r = s.rival;
    const gap = r.s - s.s;
    const band =
      (gap > RIVAL_BAND ? 0.95 : gap < 0 ? 1 + Math.min(RIVAL_FIGHT_MOST, -gap * RIVAL_FIGHT) : 1) + (r.s > c.finishS * 0.82 ? RIVAL_KICK : 0);
    // He has his habits: on ice he slides wide and loses time; over a chasm he flies like he was born to it.
    const habit =
      zoneAt(c.zones, "ice", r.u, r.s) !== undefined
        ? RIVAL_ON_ICE
        : c.zones.some((zone) => zone.kind === "chasm" && r.s > zone.s - 12 && r.s < zone.s + 46)
          ? RIVAL_IN_AIR
          : 1;
    r.s += trailPace(c, r.s) * c.rivalPace * band * habit * Math.min(1, 0.5 + s.time / 2.5) * dt;
    r.u = rivalLine(c, r.s) + RIVAL_OFFSET;
    if (r.s >= c.finishS) {
      r.s = c.finishS;
      r.done = true;
      r.time = s.time;
      s.fx.push({ kind: "rival-finish", x: r.x, z: r.z });
    }
    const at = trailAt(trail, r.s, r.u);
    r.x = at.x;
    r.z = at.z;
  }
  if (!Number.isNaN(s.avalancheS)) {
    // The avalanche comes down the trail at its own pace and never tires. It
    // holds back at the start, piles up on itself a little while the skier
    // is down, and will not be left far behind; otherwise it does not care
    // how the run is going. Time lost is lead lost.
    const gap = s.s - s.avalancheS;
    const base = trailPace(c, Math.max(0, s.avalancheS)) * c.avalanchePace;
    const speed =
      s.time < AVALANCHE_DELAY ? 0 : s.crashTime > 0 ? base * AVALANCHE_MERCY : gap > AVALANCHE_BAND ? base * 1.3 : base;
    s.avalancheS += speed * dt;
    if (s.avalancheS >= s.s - 1.5) {
      s.caught = true;
      s.finished = true;
      s.passed = false;
      s.stars = 0;
      s.event = "finish";
      return;
    }
  }
  if (c.endless && s.lives <= 0) {
    // Out of lives: the endless run is over where it stands.
    s.finished = true;
    s.passed = false;
    s.event = "finish";
    return;
  }
  if (s.s >= c.finishS) {
    s.finished = true;
    s.airborne = false;
    s.y = 0;
    if (s.rival && !s.rival.done) {
      s.rivalBeaten = true;
      award(s, "twist", RIVAL_POINTS);
    }
    if (!Number.isNaN(s.avalancheS))
      award(s, "twist", Math.round(clamp(s.s - s.avalancheS, 0, 45) / 5) * 5 * ESCAPE_POINTS_PER_METRE);
    s.timeBonus = finishTimeBonus(s.time, c.parTime, c.timeBonusRate);
    award(s, "time", s.timeBonus);
    // One star passes the level; missed gates only cost their points and the combo.
    s.stars = starsFor(s.score, c.starScores);
    // The third star is for a clean sheet: every gate taken, no tumble, enough gates through the bullseye, and on a race, the fox beaten.
    if (s.misses > 0 || s.crashes > 0 || s.bullseyes < c.starBullseyes || (s.rival && !s.rivalBeaten)) s.stars = Math.min(s.stars, 2);
    // A star of any kind is for a course skied: at least half its gates taken, whatever else was picked up on the way down.
    if (s.hits * 2 < c.gates.length) s.stars = 0;
    // The second star forgives one gate, wherever it was missed, and no more.
    if (s.misses > 1) s.stars = Math.min(s.stars, 1);
    s.passed = s.stars > 0;
    s.event = "finish";
  }
}
