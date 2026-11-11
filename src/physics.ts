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
  SLOPE_RAMP,
  STEER_RESPONSE,
  STEP_HALF,
  STEP_HEIGHT,
  getCourse,
  slopeWindow,
  type Course,
} from "./levels";
import { finishTimeBonus } from "./scoring";
import { CRATE_COINS, CRATE_POINTS } from "./crates";
import { createMover, moverGap, stepMover, touchesMover, type MoverKind, type MoverState } from "./movers";
import {
  AIR_POINTS,
  BOOST_FULL_BELOW,
  BOOST_SPEED,
  BOOST_TIME,
  CLEAR_HEIGHT,
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
import type { PowerKind } from "./levels";
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
  kind: "coin" | "power" | "shield" | "close" | "launch" | "land" | "wake" | "bump" | "rival-finish";
  x: number;
  z: number;
  value?: number;
  power?: PowerKind;
  mover?: MoverKind;
}
/** How much of the steering reaches the skis in the air. */
export const AIR_STEER = 0.3;
/** The fox eases off or digs in when this far ahead or behind. */
export const RIVAL_BAND = 28;
/** Once passed, he digs in when this far behind, so he stays on the tails of the wolf. */
export const RIVAL_CHASE = 10;
/** The fox starts this far down the course: he is there to be caught. */
export const RIVAL_HEAD_START = 22;
/** An avalanche starts this far behind, waits this long, and speeds up on a skier this far ahead. */
export const AVALANCHE_START = 45;
export const AVALANCHE_DELAY = 1.5;
export const AVALANCHE_BAND = 60;
/** While the skier is down, the slide piles up on itself and slows to this share of its pace. */
export const AVALANCHE_MERCY = 0.45;
/** A missed gate lets the avalanche gain this much at once. */
export const AVALANCHE_MISS_GAIN = 16;
/** Points for every metre of lead over the avalanche at the finish, up to 100 m. */
export const ESCAPE_POINTS_PER_METRE = 6;
export interface Run {
  level: number;
  course: Course;
  x: number;
  z: number;
  speed: number;
  heading: number;
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
  movers: MoverState[];
  closeCalls: number;
  points: Points;
  /** What happened this step, for sound and effects. Cleared every step. */
  fx: Fx[];
  /** The fox, on a race level. */
  rival: { x: number; z: number; done: boolean; time: number } | null;
  rivalBeaten: boolean;
  /** How far down the course the avalanche has come; NaN when there is none. */
  avalancheZ: number;
  caught: boolean;
}
export const COMBO_CAP = 8;
export const BULLSEYE_RADIUS = 1;
export { BULLSEYE_POINTS, CRASH_PENALTY };
/** Edge scenery that still tumbles a skier who wanders wide. */
export const OBSTACLES = Array.from({ length: 32 }, (_, i) => ({
  x: (i % 2 ? 1 : -1) * (17.5 + (i % 3) * 0.7),
  z: 105 + i * 40,
  radius: i % 3 === 0 ? 1.4 : 0.9,
  kind: i % 3 === 0 ? "rock" : "tree",
}));
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
/**
 * The slope drops 10 cm a metre with two gentle undulations whose periods
 * divide TERRAIN_PERIOD, so scenery built for one period can be moved on by
 * whole periods (and down by a tenth of that) and still sit on the snow.
 */
export const TERRAIN_PERIOD = 1800;
export const snowHeight = (z: number) =>
  -z * 0.1 +
  Math.sin((z * 2 * Math.PI) / 300) * 0.45 +
  Math.sin((z * 2 * Math.PI) / 100) * 0.15;
/**
 * How much higher (or, negative, lower) the snow is than the flat slope at a
 * point, because of a bank: the piste tilts about its centre line, high on
 * the side the bank pushes away from and sunk on the side it pushes toward,
 * and comes back level just inside the fences.
 */
export function bankHeight(course: Pick<Course, "slopes">, x: number, z: number) {
  let height = 0;
  for (const slope of course.slopes) {
    const w = slopeWindow(slope, z);
    if (w === 0) continue;
    if (slope.kind === "roller") {
      // A knoll across the whole piste, cresting halfway along the band; a
      // short band gets a lower knoll, so its faces are never steeper.
      const length = slope.to - slope.from;
      const t = Math.sin((Math.PI * (z - slope.from)) / length);
      height += ROLLER_HEIGHT * Math.min(1, length / 26) * t * t;
      continue;
    }
    // The sideways shapes come back level just inside the fences.
    const e = Math.min(1, Math.max(0, (BANK_HALF_WIDTH - Math.abs(x)) / 4));
    const edge = e * e * (3 - 2 * e);
    const reach = Math.min(x * x, DISH_REACH * DISH_REACH) / (DISH_REACH * DISH_REACH);
    let shape = 0;
    if (slope.kind === "camber") shape = -slope.dir * BANK_RATE * x;
    else if (slope.kind === "dish") shape = DISH_HEIGHT * reach;
    else if (slope.kind === "crown") shape = CROWN_HEIGHT * (1 - reach);
    else {
      // A step: the high shelf on the side the snow falls from, a bank across the middle.
      const s = Math.min(1, Math.max(0, (x * slope.dir + STEP_HALF) / (2 * STEP_HALF)));
      shape = STEP_HEIGHT * (0.5 - s * s * (3 - 2 * s));
    }
    height += shape * edge * w;
  }
  return height;
}
/** The height of the snow under a point of a course, banks included. */
export const surfaceHeight = (course: Pick<Course, "slopes">, x: number, z: number) =>
  snowHeight(z) + bankHeight(course, x, z);
/**
 * How steeply the snow falls away sideways under a point, as a multiple of a
 * full camber (positive toward +x), read off the surface itself so every
 * shape of bank drives the skis the way it looks. Capped: past a point the
 * edges bite no harder.
 */
export function crossSlope(course: Pick<Course, "slopes">, x: number, z: number) {
  if (!course.slopes.length) return 0;
  const fall = (bankHeight(course, x - 0.5, z) - bankHeight(course, x + 0.5, z)) / BANK_RATE;
  return Math.max(-CROSS_SLOPE_MAX, Math.min(CROSS_SLOPE_MAX, fall));
}
/**
 * How far sideways the skid will carry a skier between here and a point
 * ahead, given the slip already under way, the banks on the way and a steady
 * speed: the same slip dynamics as the run, walked a metre at a time. This is
 * what a skier reads off the snow ahead to know how far upslope to aim.
 */
export function driftAhead(
  course: Pick<Course, "slopes">,
  x: number,
  z: number,
  slip: number,
  speed: number,
  untilZ: number,
) {
  let drift = 0;
  const step = 1,
    dt = step / Math.max(5, speed),
    grip = 1 - Math.exp(-dt / SLIP_GRIP);
  for (let at = z; at < untilZ; at += step) {
    const terminal = crossSlope(course, x + drift, at + step / 2) * SLIP_ACCEL * SLIP_GRIP;
    slip += (terminal - slip) * grip;
    drift += slip * dt;
  }
  return drift;
}
/** Lives an endless run starts with; every miss or tumble costs one. */
export const ENDLESS_LIVES = 3;
/** Crates caught on an endless run that win an extra life. There is no cap. */
export const CRATES_PER_LIFE = 10;
/** Coins for a bullseye and for a gold token. */
export const BULLSEYE_COINS = 1;
export const TOKEN_COINS = 5;
/** How many stars a score earns against a course's three star scores. */
export const starsFor = (score: number, starScores: readonly number[]) =>
  starScores.filter((needed) => needed > 0 && score >= needed).length;
/** Everything about a level is fixed, crate drops included, so a run seeds from the level. */
export const levelSeed = (level: number) => (level * 7919 + 101) >>> 0;
export function createRun(level = 0, seed = levelSeed(level)): Run {
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
  return {
    level: course.level,
    course,
    x: 0,
    z: 0,
    speed: course.speed * 0.5,
    heading: 0,
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
    movers: [],
    closeCalls: 0,
    points: blankPoints(),
    fx: [],
    rival: course.twist === "rival" ? { x: rivalLine(course, RIVAL_HEAD_START), z: RIVAL_HEAD_START, done: false, time: 0 } : null,
    rivalBeaten: false,
    avalancheZ: course.twist === "avalanche" ? -AVALANCHE_START : NaN,
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
const hits = (s: Run, o: { x: number; z: number; radius: number }) =>
  Math.abs(o.z - s.z) < o.radius + 0.6 &&
  Math.hypot(o.x - s.x, o.z - s.z) < o.radius + 0.65;
/** The cruising speed of a course at a distance down it. */
export const cruiseAt = (c: Course, z: number) =>
  c.speedAt ? c.speedAt(z) : c.speed * (1 + SLOPE_RAMP * clamp(z / c.finishZ, 0, 1));
/** Where the line of the fox runs at a distance down the course: gate centre to gate centre, eased. */
export function rivalLine(c: Course, z: number) {
  const gates = c.gates;
  let i = 0;
  while (i < gates.length && gates[i].z < z) i++;
  const a = i === 0 ? { x: 3.5, z: 0 } : gates[i - 1],
    b = gates[i] ?? { x: 0, z: c.finishZ };
  const t = clamp((z - a.z) / Math.max(1, b.z - a.z), 0, 1);
  return a.x + (b.x - a.x) * t * t * (3 - 2 * t);
}
export function stepRun(s: Run, input: number, dt: number) {
  s.event = "";
  s.tokenEvent = -1;
  s.gateBonus = 0;
  s.lifeEvent = false;
  s.crates.event = false;
  s.fx.length = 0;
  if (s.finished || dt <= 0) return;
  const c = s.course;
  // An endless course keeps building itself well ahead of the skier.
  c.extend?.(s.z + 600);
  dt = Math.min(dt, 0.05);
  s.time += dt;
  s.invincible = Math.max(0, s.invincible - dt);
  s.boost = Math.max(0, s.boost - dt);
  // On a gold rush the magnet never runs down.
  if (c.twist !== "goldrush") s.magnet = Math.max(0, s.magnet - dt);
  s.double = Math.max(0, s.double - dt);
  const oldX = s.x,
    oldZ = s.z,
    oldSpeed = s.speed,
    oldHeading = s.heading;
  const cruise = cruiseAt(c, s.z);
  s.onIce = !s.airborne && s.crashTime === 0 && zoneAt(c.zones, "ice", s.x, s.z) !== undefined;
  if (s.crashTime > 0) {
    s.crashTime = Math.max(0, s.crashTime - dt);
    s.speed += (4 - s.speed) * (1 - Math.exp(-5 * dt));
    s.x += (clamp(s.x, -13, 13) - s.x) * (1 - Math.exp(-6 * dt));
    s.heading *= Math.exp(-8 * dt);
    // A tumbling skier digs in: the skid dies away quickly.
    s.slip *= Math.exp(-dt / SLIP_GRIP);
    if (s.crashTime === 0) s.invincible = 2;
  } else {
    // In the air or on ice the skis barely answer; the line was set before.
    const grip = s.airborne ? AIR_STEER : s.onIce ? ICE_STEER : 1;
    s.heading +=
      (clamp(input, -1, 1) * c.turnAngle - s.heading) *
      (1 - Math.exp(-STEER_RESPONSE * grip * dt));
    // A carve boost is extra speed that fades as it runs out: a big kick on
    // gentle slopes, a smaller one where the snow is already fast.
    const surge = BOOST_SPEED * Math.min(1, BOOST_FULL_BELOW / cruise) * Math.min(1, s.boost / (BOOST_TIME * 0.5));
    const targetSpeed =
      cruise -
      Math.abs(s.heading) * (s.airborne ? 0 : s.onIce ? 2 : 6) +
      Math.sin(s.z * 0.015) * 0.8 +
      surge +
      (s.onIce ? ICE_SPEED : 0);
    s.speed += (targetSpeed - s.speed) * (1 - Math.exp(-(s.boost > 0 && targetSpeed > s.speed ? 3.2 : 1.1) * dt));
    // Banked snow: gravity across the tilt drives the skis into a sideslip
    // that builds while the bank lasts, and edge grip bleeds it away, so the
    // skid keeps carrying the skier for a moment after the bank ends. The
    // heading stays put; it takes an upslope aim to hold a line.
    const terminal = s.airborne ? 0 : crossSlope(c, s.x, s.z) * SLIP_ACCEL * SLIP_GRIP;
    s.slip += (terminal - s.slip) * (1 - Math.exp(-dt / SLIP_GRIP));
    // Skidding sideways scrubs speed.
    s.speed = Math.max(0, s.speed - SLIP_DRAG * Math.abs(s.slip) * dt);
    s.x +=
      (Math.sin(oldHeading) * oldSpeed + Math.sin(s.heading) * s.speed) *
      dt *
      0.5 +
      s.slip * dt;
  }
  s.z +=
    (Math.cos(oldHeading) * oldSpeed + Math.cos(s.heading) * s.speed) *
    dt *
    0.5;
  if (s.crashTime === 0 && !s.airborne) {
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
    }
  } else if (s.crashTime === 0)
    for (const zone of c.zones) {
      if (zone.z > s.z) break;
      const lip = zone.z + zone.length;
      if (zone.kind !== "ramp" || oldZ >= lip || s.z < lip || Math.abs(s.x - zone.x) > zone.halfWidth) continue;
      s.airborne = true;
      s.airTime = 0;
      s.y = RAMP_LIP;
      s.vy = jumpFor(s.speed).vy;
      s.fx.push({ kind: "launch", x: s.x, z: s.z });
    }
  const flying = s.airborne && s.y > CLEAR_HEIGHT;
  const safe = s.invincible > 0 || s.crashTime > 0;
  const closeCall = (x: number, z: number) => {
    s.closeCalls++;
    s.fx.push({ kind: "close", x, z, value: award(s, "close", CLOSE_CALL_POINTS) });
  };
  // Hazards are sorted by z; skip those already behind and stop past the skier.
  while (
    s.hazardCursor < c.hazards.length &&
    c.hazards[s.hazardCursor].z < s.z - 4
  )
    s.hazardCursor++;
  let struck = false;
  for (let i = s.hazardCursor; i < c.hazards.length && c.hazards[i].z < s.z + 4; i++) {
    const h = c.hazards[i];
    if (flying) continue;
    if (hits(s, h)) {
      struck = true;
      break;
    }
    // Going by within a metre of it is a close call.
    if (!safe && oldZ < h.z && s.z >= h.z && Math.abs(h.x - s.x) - h.radius - 0.65 < CLOSE_CALL_GAP)
      closeCall(h.x, h.z);
  }
  // Movers wake as the skier comes within their lead, and are judged the same way.
  while (s.movers.length < c.movers.length) s.movers.push(createMover(c.movers[s.movers.length]));
  for (let i = 0; i < s.movers.length; i++) {
    const m = s.movers[i];
    if (m.phase === "done") continue;
    const was = m.phase;
    // A boosted skier wakes things from further off, so they are always met at the same moment of their act.
    stepMover(m, c.movers[i], s.z, cruise, dt, Math.max(cruise, s.speed));
    if (was === "waiting" && m.phase === "active") s.fx.push({ kind: "wake", x: m.x, z: m.z, mover: m.kind });
    if (m.phase !== "active" || m.hit) continue;
    if (!flying && !safe && !struck && touchesMover(m, s.x, s.z)) {
      struck = true;
      m.hit = true;
      s.fx.push({ kind: "bump", x: m.x, z: m.z, mover: m.kind });
      continue;
    }
    if (Math.abs(m.z - s.z) < 1.2) m.nearest = Math.min(m.nearest, moverGap(m, s.x) - 0.65);
    if (!m.passed && s.z > m.z + 1.2) {
      m.passed = true;
      if (!safe && !flying && m.nearest < CLOSE_CALL_GAP) closeCall(m.x, m.z);
      // Clearing a mover in the air is its own small triumph.
      else if (flying && Math.abs(m.x - s.x) < m.radius + 1.5) closeCall(m.x, m.z);
    }
  }
  if (!safe && (struck || Math.abs(s.x) > 20 || (!flying && OBSTACLES.some((o) => hits(s, o))))) {
    if (s.shield) {
      // The shield takes the knock: no tumble, no lost combo, a moment of grace.
      s.shield = false;
      s.invincible = 1.6;
      s.speed *= 0.85;
      s.x = clamp(s.x, -19, 19);
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
      if (
        s.tokens[i] ||
        token.z < oldZ - c.pickupRadius ||
        token.z > s.z + c.pickupRadius ||
        sweep(token.x, token.z) >= c.pickupRadius
      )
        continue;
      // Tokens are worth coins, not points, so the best score never depends on them.
      s.tokens[i] = true;
      s.tokenCount++;
      s.coins += TOKEN_COINS;
      s.tokenEvent = i;
    }
    // Coins are sorted by z: only those within reach of this step are looked at.
    const reach = s.magnet > 0 ? MAGNET_REACH : COIN_REACH;
    while (s.coinCursor < c.coins.length && c.coins[s.coinCursor].z < oldZ - MAGNET_REACH) s.coinCursor++;
    for (let i = s.coinCursor; i < c.coins.length && c.coins[i].z <= s.z + reach; i++) {
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
      if (s.powerTaken[i] || power.z < oldZ - POWER_REACH || power.z > s.z + POWER_REACH) continue;
      if (sweep(power.x, power.z) >= POWER_REACH) continue;
      s.powerTaken[i] = true;
      grantPower(s, power.kind);
    }
  }
  stepCrates(s, oldX, oldZ, dt, c.gates, c.finishZ, c.hazards);
  if (s.crates.event) {
    award(s, "crates", CRATE_POINTS);
    s.coins += CRATE_COINS;
    // Once the levels have introduced a power-up, crates may hold it.
    if (c.cratePowers.length) grantPower(s, c.cratePowers[s.crates.collected % c.cratePowers.length]);
  }
  // On the endless run every tenth crate caught wins a life, with no cap.
  if (c.endless && s.crates.event && ++s.cratesTowardLife >= CRATES_PER_LIFE) {
    s.cratesTowardLife = 0;
    s.lives++;
    s.lifeEvent = true;
  }
  while (s.nextGate < c.gates.length && s.z >= c.gates[s.nextGate].z) {
    const gate = c.gates[s.nextGate];
    const t = clamp((gate.z - oldZ) / Math.max(0.001, s.z - oldZ), 0, 1);
    const crossingX = oldX + (s.x - oldX) * t;
    const offset = Math.abs(crossingX - gate.x);
    if (offset <= gate.width / 2 && s.crashTime === 0) {
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
      s.strikes++;
      s.lives--;
      if (s.event !== "crash") s.event = "miss";
      // Skipping the course is no way to outrun an avalanche: every gate missed lets it gain.
      if (!Number.isNaN(s.avalancheZ))
        s.avalancheZ = Math.max(s.avalancheZ, Math.min(s.avalancheZ + AVALANCHE_MISS_GAIN, s.z - 6));
    }
    s.nextGate++;
  }
  if (s.rival && !s.rival.done) {
    // The fox starts ahead and skis the gate line at his own pace, easing off
    // when far ahead and digging in once passed, so the race is alive to the end.
    const r = s.rival;
    const gap = r.z - s.z;
    const band = gap > RIVAL_BAND ? 0.9 : gap < -RIVAL_CHASE ? 1.06 : 1;
    r.z += cruiseAt(c, r.z) * c.rivalPace * band * Math.min(1, 0.5 + s.time / 2.5) * dt;
    r.x = rivalLine(c, r.z);
    if (r.z >= c.finishZ) {
      r.z = c.finishZ;
      r.done = true;
      r.time = s.time;
      s.fx.push({ kind: "rival-finish", x: r.x, z: r.z });
    }
  }
  if (!Number.isNaN(s.avalancheZ)) {
    // The avalanche never tires. It holds back at the start.
    const gap = s.z - s.avalancheZ;
    // Far behind, it picks up pace; while the skier is down it piles up on itself and slows.
    const base = cruise * c.avalanchePace;
    const speed =
      s.time < AVALANCHE_DELAY
        ? 0
        : s.crashTime > 0
          ? base * AVALANCHE_MERCY
          : gap > AVALANCHE_BAND
            ? base * 1.12
            : base;
    s.avalancheZ += speed * dt;
    if (s.avalancheZ >= s.z - 1.5) {
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
  if (s.z >= c.finishZ) {
    s.z = c.finishZ;
    s.finished = true;
    s.airborne = false;
    s.y = 0;
    if (s.rival && !s.rival.done) {
      s.rivalBeaten = true;
      award(s, "twist", RIVAL_POINTS);
    }
    if (!Number.isNaN(s.avalancheZ))
      award(s, "twist", Math.round(clamp(s.z - s.avalancheZ, 0, 100) / 5) * 5 * ESCAPE_POINTS_PER_METRE);
    s.timeBonus = finishTimeBonus(s.time, c.parTime, c.timeBonusRate);
    award(s, "time", s.timeBonus);
    // One star passes the level; missed gates only cost their points and the combo.
    s.stars = starsFor(s.score, c.starScores);
    s.passed = s.stars > 0;
    s.event = "finish";
  }
}
