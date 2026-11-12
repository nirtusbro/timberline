import type { MoverKind, MoverSpec } from "./movers";
import { buildExtras, type ExtrasDesign } from "./extras";
import { CAMPAIGN } from "./campaign";
import { buildTrail, trailAt, trailDir, trailHalf, trailPitch, type Leg, type Trail } from "./trail";
import { seededRandom } from "./random";

/** Levels come in worlds of eight: five places, each with its own scenery, snow and company. */
export const WORLD_SIZE = 8;
export const WORLDS = [
  { name: "Sunny Side", blurb: "The resort at breakfast. Broad sweeping pistes, learners, kickers.", starsToUnlock: 0 },
  { name: "Pinewood", blurb: "Trails that wind between the trees, and what lives there.", starsToUnlock: 10 },
  { name: "Blue River", blurb: "A frozen river in its channel: ice, bends and gates that never stand still.", starsToUnlock: 22 },
  { name: "Granite Gorge", blurb: "Rock walls, ploughs, falling stone and gaps to leap.", starsToUnlock: 34 },
  { name: "Midnight Face", blurb: "Shaped snow in the dark, by the light of one lamp.", starsToUnlock: 46 },
] as const;
export const WORLD_COUNT = WORLDS.length;
export const LEVEL_COUNT = WORLD_COUNT * WORLD_SIZE;
export const worldOf = (level: number) =>
  Math.max(0, Math.min(WORLD_COUNT - 1, Math.floor(level / WORLD_SIZE)));
export const MAX_GATES = 36;
/** Gold tokens a level can hold: optional pickups off the racing line, worth coins. */
export const MAX_TOKENS = 4;
/** Longest course any level can produce, along its trail. */
export const MAX_COURSE_LENGTH = 1900;
export const STEER_RESPONSE = 4.4;
/** The edges only grip so hard: the skis can turn no faster than this many m/s² of sideways pull allows, so a fast skier turns wide. */
export const GRIP = 21;
/**
 * Gravity only pulls down the fall line: skis pointed this far off it settle to this share of the pace they would
 * have straight down. Thirty degrees across costs a fifth, forty-five two fifths, sixty nearly two thirds: a line
 * that stays nearer the fall line is a faster line.
 */
export const fallPace = (angle: number) => (Number.isFinite(angle) ? 1 : 1);
/** Skis left pointing straight down the fall line run this much faster than the course's cruising speed, in the end. */
export const TOP_PACE = 1;
/**
 * The hardest turn a course setter may ask for at a gate, by world, as a share
 * of what the edges can give at cruising speed. A gate that would ask more is
 * moved toward the line between its neighbours until it does not.
 */
export const DEMAND_CAP = [0.62, 0.78, 0.95, 1.2, 1.3] as const;
/** And the least a course may ask on average: a course that asks less has its gates set wider until it does, or until they reach the edge of the snow. */
export const DEMAND_FLOOR = [0.26, 0.4, 0.5, 0.62, 0.68] as const;
/** Gates keep this far inside the edge of the open snow. */
export const GATE_MARGIN = 4;

export interface Gate {
  /** Where the middle of the gate stands in trail coordinates, and in the world; `rot` is the way the trail runs there. */
  s: number;
  u: number;
  x: number;
  z: number;
  rot: number;
  width: number;
  color: "red" | "blue";
  /** A moving gate slides from side to side about u and never stops: this far, this fast (radians a second), from this phase. A `saw` keeps a steady pace and turns on the spot at each end. */
  drift?: { amp: number; rate: number; phase: number; saw?: boolean };
  /** A fork: a second opening at this u. Passing through either counts. */
  alt?: number;
}
export interface Stretch {
  index: number;
  length: number;
  /** Where a token would sit along the stretch and the direct line there. */
  tokenS: number;
  lineU: number;
  side: number;
  swing: number;
}
export interface TokenSpot {
  s: number;
  u: number;
  x: number;
  z: number;
  side: number;
  stretch: number;
}
export interface Hazard {
  s: number;
  u: number;
  x: number;
  z: number;
  radius: number;
  kind: "rock" | "tree";
  /** Part of a wall that lines a narrow stretch, rather than something standing on the piste. */
  wall?: boolean;
}
/**
 * A band of shaped snow between `from` and `to` along the trail, eased in and
 * out over SLOPE_EASE metres at each end: `camber` tilts the whole piste one
 * way; `dish` curves it up into walls either side that pull toward the
 * middle; `crown` raises a ridge down the middle that tips the skier off to
 * either side; `roller` is a knoll across the piste that hides what lies
 * behind it; `step` splits the piste into two shelves with a bank between.
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
/** Metres over which banked snow eases in and out at each end of a slope. */
export const SLOPE_EASE = 8;
/** Slopes keep this far from the gate lines either side of their stretch. */
export const SLOPE_MARGIN = 9;
/** Slopes end this far before any rock in their stretch. */
export const SLOPE_ROCK_GAP = 10;
/** How far a camber rises per metre across: the piste tilts about its centre line. */
export const BANK_RATE = 0.16;
/** Shaped snow returns to flat over the 4 m before this far from the middle of the trail. */
export const BANK_HALF_WIDTH = 21;
export const DISH_HEIGHT = 1.6;
export const CROWN_HEIGHT = 1.4;
export const DISH_REACH = 14;
/** A roller's crest stands this high above the piste. */
export const ROLLER_HEIGHT = 2.4;
export const STEP_HEIGHT = 1.6;
export const STEP_HALF = 4;
/** The steepest cross-slope the skis feel, as a multiple of a full camber. */
export const CROSS_SLOPE_MAX = 1.25;
/** Past the edge of the open snow lies this much deep powder, which drags; past that, the trees or the rock. */
export const SHOULDER = 7;
/** A gate as authored: offset from the middle of the trail, distance along it from the gate before, width scale. */
export type GateSpec = [u: number, gap: number, widthScale?: number];
/** A slope as authored: the stretch it lies in, the way it falls, and its shape (a camber if unsaid). */
export type SlopeSpec = [stretch: number, dir: 1 | -1, kind?: SlopeKind];
/** A patch of the piste that changes how the skis run: see extras.ts. */
export type ZoneKind = "ice" | "ramp" | "chasm";
export interface Zone {
  kind: ZoneKind;
  /** Where it starts along the trail, the middle of it across the trail, and its size; then the same start in the world. */
  s: number;
  u: number;
  halfWidth: number;
  length: number;
  x: number;
  z: number;
  rot: number;
  /** The kicker at the lip of a chasm: the only way across. Miss it and the skier goes into the gap. */
  leap?: boolean;
  /** A sheet of ice is not a rectangle: it is these rounded patches, and only on them are the skis on ice. The rest of the zone is its bounds. */
  blobs?: { s: number; u: number; r: number }[];
}
export type PowerKind = "magnet" | "shield" | "double";
export interface PowerSpot {
  kind: PowerKind;
  s: number;
  u: number;
  x: number;
  z: number;
}
export interface Coin {
  s: number;
  u: number;
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
  /** What this level asks of the skier, shown on its card. */
  hint: string;
  /** What the level is for in its world: the first two teach, the last is the boss. */
  role: "teach" | "twist" | "test" | "breather" | "race" | "boss";
  /** The way the trail goes down the mountain, leg by leg. */
  path: Leg[];
  gates: GateSpec[];
  baseWidth: number;
  speed: number;
  turnAngle: number;
  pickupRadius: number;
  /** How far off the direct line a token sits, and how far along its stretch. */
  detour: number;
  tokenFraction: number;
  /** Stretches (gate index to the next gate) holding the gold tokens, each wide of the line with a fork rock on the line beside it. */
  tokens: number[];
  forkRocks: boolean;
  /** Token indexes (0–3) that get a guard tree on the token side. */
  guards: number[];
  /** Stretches with a rock that pinches the direct line: close beside it, on the inside of the turn. */
  wideRocks: number[];
  /** Stretches with a rock on the direct line halfway along. */
  lineRocks: number[];
  /** Stretches that end in a rock gate: two rocks to thread on the way to the next flags. */
  rockGates: number[];
  /** Stretches that end in a weave: three rocks alternating sides on the way in. */
  weaves: number[];
  /** Stretches strewn with a field of rocks across the direct line, with gaps to thread. */
  fields: number[];
  /** Stretches holding a band of shaped snow, and which way each band pushes. */
  slopes: SlopeSpec[];
  /** Moving gates: the gate, how far it slides either way, how fast, and whether at a steady pace. */
  drifts: [gate: number, amp: number, rate: number, saw?: boolean][];
  /** Forks: the gate and where its second opening stands. */
  forks: [gate: number, alt: number][];
  /** Narrows: stretches walled in on both sides, and how far each wall stands from the racing line. */
  narrows: [stretch: number, half: number][];
  /** Gates found too hard where they stand, when the level was skied by the stand-in players: each is set nearer the line between its neighbours, and a little wider. */
  soften: number[];
  /** Par time as a multiple of the course length at cruising speed. */
  parFactor: number;
  /** Points per second under par. Sprint levels pay far more for speed. */
  timeBonusRate: number;
}
export interface Course {
  level: number;
  name: string;
  hint: string;
  role: LevelDesign["role"] | "endless";
  /** Set on the endless course, which generates itself ahead of the skier. */
  endless?: boolean;
  /** An endless course builds itself this far; told where the skier is, it also knows what the light and the weather are there. */
  extend?: (untilS: number, here?: number) => void;
  speedAt?: (s: number) => number;
  /** The way down the mountain. */
  trail: Trail;
  gates: Gate[];
  /** How far along the trail the finish line is. */
  finishS: number;
  stretches: Stretch[];
  tokens: TokenSpot[];
  /** Sorted by s. */
  hazards: Hazard[];
  /** Bands of shaped snow, sorted by s. */
  slopes: Slope[];
  speed: number;
  turnAngle: number;
  pickupRadius: number;
  parTime: number;
  timeBonusRate: number;
  maxGateScore: number;
  /** Scores that earn one, two and three stars. One star passes the level. */
  starScores: [number, number, number];
  /** Bullseyes the third star asks for, on top of every gate. */
  starBullseyes: number;
  /** Small coins, sorted by s. */
  coins: Coin[];
  /** Ice sheets, ramps and chasms, sorted by s. */
  zones: Zone[];
  powers: PowerSpot[];
  movers: MoverSpec[];
  twist: Twist;
  weather: Weather;
  /** A night run: nothing shows but what the headlamp lights. */
  night: boolean;
  /** What a supply crate can hold on this course. */
  cratePowers: PowerKind[];
  /** The rival's pace as a share of cruising speed, on a race level. */
  rivalPace: number;
  /** The avalanche's pace as a share of cruising speed, on an avalanche level. */
  avalanchePace: number;
}
export const BULLSEYE_POINTS = 50;
/** Points lost on every tumble, on top of the broken combo and the lost speed. */
export const CRASH_PENALTY = 300;
export const COMBO_LIMIT = 8;
export const FORK_ROCK_RADIUS = 1.2;
export const GUARD_TREE_RADIUS = 0.9;
export const WIDE_ROCK_RADIUS = 1;
export const ROCK_GATE_HALF = 3.8;
export const WEAVE_OFFSET = 3.8;
export const WEAVE_STEP = 9;
/** A pinch rock stands this far from the direct line, on the inside of the turn. */
export const PINCH_OFFSET = 2.7;
/** Rock features sit this far before the gate they lead into, on that gate's line. */
export const FEATURE_LEAD = 14;
/** Walls of a narrow stretch: a tree or a rock this often, starting and stopping this far from the flags. */
export const WALL_STEP = 7;
export const WALL_MARGIN = 5;
export const WALL_RADIUS = 0.9;
/** The island between the two openings of a fork runs this far up the slope from it. */
export const FORK_ISLAND = 34;
/** A field of rocks: this many, no two closer than this, so there is always a way through. */
export const FIELD_ROCKS = 6;
export const FIELD_SPACING = 7;
/**
 * What the stars ask, said in gates: one star forgives one gate in four
 * missed on the first level and one in six on the last; two stars forgive
 * one; three want every gate and a share of them threaded through the
 * bullseye, rising from three in ten to half (moving gates are not counted,
 * nor the gate a jump lands by). The third star is checked as that (no gate
 * missed, that many bullseyes), not as a score. Each is turned into a score
 * by skiing the course in the head with exactly those misses, so a star
 * means the same thing on a short level as on a long one. Coins, jumps and
 * time come on top and can make up a little, never a missed gate.
 */
export const STAR_MISS_EVERY = { first: 4, last: 6 } as const;
export const STAR_BULLSEYES = { first: 0.3, last: 0.5 } as const;

export const LEVEL_DESIGNS: LevelDesign[] = CAMPAIGN;
if (LEVEL_DESIGNS.length !== LEVEL_COUNT) throw new Error(`The campaign has ${LEVEL_DESIGNS.length} levels, not ${LEVEL_COUNT}`);
export const levelSettings = (level: number) =>
  LEVEL_DESIGNS[Math.max(0, Math.min(LEVEL_COUNT - 1, level))];

/** What the gates alone pay if these ones are missed: the combo starts again after each. */
export function gateScore(count: number, missed: (index: number) => boolean) {
  let combo = 0,
    score = 0;
  for (let i = 0; i < count; i++) {
    if (missed(i)) combo = 0;
    else score += 100 * (combo = Math.min(COMBO_LIMIT, combo + 1));
  }
  return score;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
/** A rock or a tree at trail coordinates, placed in the world. */
export function hazardAt(trail: Trail, s: number, u: number, radius: number, kind: Hazard["kind"] = "rock", wall = false): Hazard {
  const p = trailAt(trail, s, u);
  const h: Hazard = { s: round1(s), u: round1(u), x: p.x, z: p.z, radius, kind };
  if (wall) h.wall = true;
  return h;
}
export function gateAt(trail: Trail, s: number, u: number, width: number, index: number): Gate {
  const p = trailAt(trail, s, u);
  return { s, u, x: p.x, z: p.z, rot: p.dir, width, color: index % 2 ? "blue" : "red" };
}

/**
 * How hard each gate asks the skis to turn, as a share of what the edges can
 * give at cruising speed: the turn from the line in to the line out, over the
 * time there is for it. Over 1 cannot be skied without slowing; 0.3 is a
 * comfortable swing; 0.6 is hard work.
 */
export function gateDemands(trail: Trail, gates: readonly Gate[], speed: number) {
  const start = trailAt(trail, 0, 0);
  return gates.map((g, i) => {
    const a = gates[i - 1] ?? start,
      b = gates[i + 1] ?? trailAt(trail, g.s + 60, g.u * 0.5);
    const turn = Math.atan2(b.x - g.x, b.z - g.z) - Math.atan2(g.x - a.x, g.z - a.z);
    // The pace a skier will be carrying there: what the line in allows, and never much less, since speed is slow to bleed away.
    const v = speed * trailPitch(trail, g.s) * TOP_PACE * 1.08,
      len = (Math.hypot(g.x - a.x, g.z - a.z) + Math.hypot(b.x - g.x, b.z - g.z)) / 2;
    return (Math.abs(turn) * v * v) / (GRIP * len);
  });
}
/** Builds the fixed course for a level from its authored design. */
export function buildCourse(level: number): Course {
  const S = levelSettings(level);
  // Where nobody can steer, the trail runs straight: the flight of every leap and every kicker.
  const marks: number[] = [];
  for (let at = 0, i = 0; i < S.gates.length; i++) marks.push((at += S.gates[i][1]));
  const straights = [
    ...S.chasms.map((i): [number, number] => [marks[i] + 8, (marks[i + 1] ?? marks[i] + 60) + 4]),
    // A kicker and its flight: from a little before the ramp to the landing.
    ...S.ramps.map((i): [number, number] => {
      const mid = (marks[i] + (marks[i + 1] ?? marks[i] + 60)) / 2;
      return [mid - 20, mid + 20];
    }),
  ];
  const trail = buildTrail(S.path, straights);
  const speed = S.speed;
  const gates: Gate[] = [];
  let s = 0;
  for (const [i, [u, gap, widthScale = 1]] of S.gates.entries()) {
    s += gap;
    // No gate stands outside the open snow, whatever the trail does there.
    const room = trailHalf(trail, s) - GATE_MARGIN;
    gates.push(gateAt(trail, s, Math.max(-room, Math.min(room, u)), Math.round(S.baseWidth * widthScale * 10) / 10, i));
  }
  // The course setter's rule: no gate asks for a sharper turn than its world allows.
  // A gate that asks too much is drawn in toward the line between its neighbours, and they a little toward it;
  // it never changes sides, and a fork or a moving gate stays where it was put.
  const fixed = new Set<number>([...S.forks.map(([i]) => i), ...S.drifts.map(([i]) => i)]);
  const nudge = (i: number, toward: number, share: number) => {
    const g = gates[i];
    if (!g || fixed.has(i)) return;
    let u = g.u + (toward - g.u) * share;
    if (g.u !== 0 && Math.sign(u) !== Math.sign(g.u)) u = Math.sign(g.u) * 0.4;
    gates[i] = gateAt(trail, g.s, u, g.width, i);
  };
  // A course that asks too little is set wider, a tenth at a time.
  const mean = () => {
    const asked = gateDemands(trail, gates, speed);
    return asked.reduce((sum, d) => sum + d, 0) / Math.max(1, asked.length - 1);
  };
  const floored = !S.night && S.weather !== "fog" && S.weather !== "blizzard" && S.role !== "teach";
  for (let pass = 0; floored && pass < 5 && mean() < DEMAND_FLOOR[worldOf(level)]; pass++)
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (fixed.has(i)) continue;
      const room = trailHalf(trail, g.s) - GATE_MARGIN;
      gates[i] = gateAt(trail, g.s, Math.max(-room, Math.min(room, g.u * 1.09)), g.width, i);
    }
  for (let pass = 0; pass < 40; pass++) {
    const asked = gateDemands(trail, gates, speed);
    let moved = false;
    for (let i = 0; i < gates.length; i++) {
      if (asked[i] <= DEMAND_CAP[worldOf(level)]) continue;
      const before = gates[i - 1]?.u ?? 0,
        after = gates[i + 1]?.u ?? gates[i].u * 0.5,
        here = gates[i].u;
      // Usually the gate is drawn in toward the line between its neighbours. Where that line is already through it
      // (the bend of the trail itself is what asks too much), it is set to whichever side eases the turn.
      if (Math.abs(here - (before + after) / 2) > 1.2) {
        nudge(i, (before + after) / 2, 0.15);
        nudge(i - 1, here, 0.08);
        nudge(i + 1, here, 0.08);
      } else if (!fixed.has(i)) {
        const room = trailHalf(trail, gates[i].s) - GATE_MARGIN;
        let best = asked[i],
          at = here;
        for (const step of [-1.2, 1.2]) {
          const u = Math.max(-room, Math.min(room, here + step));
          const trial = [...gates];
          trial[i] = gateAt(trail, gates[i].s, u, gates[i].width, i);
          const d = gateDemands(trail, trial, speed)[i];
          if (d < best) {
            best = d;
            at = u;
          }
        }
        if (at === here) continue;
        gates[i] = gateAt(trail, gates[i].s, at, gates[i].width, i);
      }
      moved = true;
    }
    // And no gate is further across the trail from the one before than the skis can get in the time there is:
    // a swing from one edge to the other needs room, whatever the angles say.
    for (let i = 1; i < gates.length; i++) {
      const a = gates[i - 1],
        b = gates[i];
      const v = speed * trailPitch(trail, b.s) * TOP_PACE,
        most = 0.85 * GRIP * ((b.s - a.s) / v) ** 2 * 0.25;
      const over = Math.abs(b.u - a.u) - most;
      if (over <= 0.3) continue;
      const mid = (a.u + b.u) / 2,
        half = most / 2;
      if (!fixed.has(i - 1) && !fixed.has(i)) {
        gates[i - 1] = gateAt(trail, a.s, mid + Math.sign(a.u - b.u) * half, a.width, i - 1);
        gates[i] = gateAt(trail, b.s, mid - Math.sign(a.u - b.u) * half, b.width, i);
      } else if (!fixed.has(i)) gates[i] = gateAt(trail, b.s, a.u + Math.sign(b.u - a.u) * most, b.width, i);
      else if (!fixed.has(i - 1)) gates[i - 1] = gateAt(trail, a.s, b.u + Math.sign(a.u - b.u) * most, a.width, i - 1);
      moved = true;
    }
    if (!moved) break;
  }
  for (const i of S.soften) {
    const g = gates[i];
    if (!g) continue;
    const u = fixed.has(i) ? g.u : g.u + (((gates[i - 1]?.u ?? 0) + (gates[i + 1]?.u ?? g.u * 0.5)) / 2 - g.u) * 0.5;
    gates[i] = gateAt(trail, g.s, u, Math.round(g.width * 1.2 * 10) / 10, i);
  }
  // Whatever was moved, no gate ends up nearer the edge of the open snow than a gate may stand.
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i],
      room = trailHalf(trail, g.s) - GATE_MARGIN;
    if (Math.abs(g.u) > room) gates[i] = gateAt(trail, g.s, Math.sign(g.u) * room, g.width, i);
  }
  for (const [index, amp, rate, saw] of S.drifts) {
    // A rail never carries its flags off the open snow: where the trail is narrow the swing is shorter.
    const g = gates[index],
      reach = Math.max(2.5, trailHalf(trail, g.s) - 1 - g.width / 2 - Math.abs(g.u));
    // Too little room for a swing worth the name: the gate stands still.
    if (Math.min(amp, reach) < g.width / 2 + 0.5) continue;
    gates[index].drift = { amp: Math.min(amp, reach), rate, phase: (index * 2.4) % (Math.PI * 2), ...(saw ? { saw } : {}) };
  }
  for (const [index, alt] of S.forks) gates[index].alt = alt;
  const finishS = gates[gates.length - 1].s + 60;
  if (finishS > trail.endS - 200) throw new Error(`${S.name}: the trail (${trail.endS - 320} m) is shorter than its gates (${finishS} m)`);
  const stretches: Stretch[] = gates.map((gate, i) => {
    const next = gates[i + 1] ?? { u: 0, s: finishS };
    const length = next.s - gate.s;
    return {
      index: i,
      length,
      tokenS: Math.round(gate.s + length * S.tokenFraction),
      lineU: gate.u + (next.u - gate.u) * S.tokenFraction,
      side: Math.sign(gate.u) || 1,
      swing: Math.abs(next.u - gate.u),
    };
  });
  const tokens: TokenSpot[] = S.tokens.map((index) => {
    const st = stretches[index];
    const u = round1(st.lineU + st.side * S.detour);
    return { ...trailAt(trail, st.tokenS, u), s: st.tokenS, u, side: st.side, stretch: index };
  });
  const hazards: Hazard[] = [];
  const rock = (u: number, ss: number, radius: number) => hazards.push(hazardAt(trail, Math.round(ss), u, radius));
  for (const [i, spot] of tokens.entries()) {
    const st = stretches[spot.stretch];
    if (S.forkRocks) rock(st.lineU, st.tokenS, FORK_ROCK_RADIUS);
    // A guard tree narrows the token line without blocking the way in.
    const approach = Math.abs(gates[spot.stretch].u - spot.u);
    const treeS = Math.max(st.tokenS - 8, gates[spot.stretch].s + 12);
    if (S.guards.includes(i) && treeS <= st.tokenS - 3)
      hazards.push(hazardAt(trail, treeS, spot.u + (approach <= 3 ? -1 : 1) * spot.side * 3.2, GUARD_TREE_RADIUS, "tree"));
  }
  const ends = (index: number) => ({ gate: gates[index], next: gates[index + 1] ?? { u: 0, s: finishS } });
  // Rock features line up with the gate they lead into, since a skier heads
  // for the next flags as soon as the last ones are behind.
  for (const index of S.weaves) {
    const st = stretches[index],
      { next } = ends(index);
    for (const [k, ds] of [2 * WEAVE_STEP, WEAVE_STEP, 0].entries())
      rock(next.u + (k % 2 ? -1 : 1) * WEAVE_OFFSET * st.side, next.s - FEATURE_LEAD - ds, WIDE_ROCK_RADIUS);
  }
  for (const index of S.rockGates) {
    const { next } = ends(index);
    for (const side of [-1, 1]) rock(next.u + side * ROCK_GATE_HALF, next.s - FEATURE_LEAD, WIDE_ROCK_RADIUS);
  }
  // A pinch: a rock beside the direct line, on the side a corner-cutter would take.
  for (const index of S.wideRocks) {
    const { gate, next } = ends(index);
    const mid = (gate.s + next.s) / 2,
      line = (gate.u + next.u) / 2;
    const inside = Math.sign(next.u - gate.u) || 1;
    rock(line + inside * PINCH_OFFSET, mid + 3, WIDE_ROCK_RADIUS);
    rock(line - inside * (PINCH_OFFSET + 4.4), mid - 6, WIDE_ROCK_RADIUS);
  }
  for (const index of S.lineRocks) {
    const { gate, next } = ends(index);
    rock((gate.u + next.u) / 2, (gate.s + next.s) / 2, FORK_ROCK_RADIUS);
  }
  // A field: rocks strewn either side of the direct line and on it, never two so close that nothing fits between.
  for (const index of S.fields) {
    // Never on the stretch a leap lands into: nobody can steer in the air.
    if (S.chasms.includes(index) || S.chasms.includes(index - 1)) continue;
    const { gate, next } = ends(index);
    const random = seededRandom(level * 131 + index * 17, 0x6b43a9b5);
    const length = next.s - gate.s;
    // A field with a kicker before it is no deeper than a jump is long.
    const flown = S.ramps.includes(index);
    const from = flown ? 0.36 : 0.4,
      depth = flown ? 9 / length : 0.36;
    const placed: { s: number; u: number }[] = [];
    for (let tries = 0; tries < 60 && placed.length < FIELD_ROCKS; tries++) {
      const f = from + random() * depth,
        ss = gate.s + length * f,
        // The first two go on the line itself; the rest fall around it.
        u = gate.u + (next.u - gate.u) * f + (placed.length < 2 ? (random() - 0.5) * 1.6 : (random() - 0.5) * 17);
      if (placed.some((p) => Math.hypot(p.s - ss, p.u - u) < (flown ? 3.4 : FIELD_SPACING))) continue;
      placed.push({ s: ss, u });
      rock(u, ss, 0.9 + random() * 0.35);
    }
  }
  // Narrows: a wall either side of the racing line, so the corridor wanders
  // with the course. Trees in the woods, ice on the river, rock in the gorge: the scene decides.
  const wallKind: Hazard["kind"] = worldOf(level) === 3 || worldOf(level) === 2 ? "rock" : "tree";
  for (const [index, half] of S.narrows) {
    const { gate, next } = ends(index);
    for (let at = gate.s + WALL_MARGIN; at <= next.s - WALL_MARGIN; at += WALL_STEP) {
      const line = gate.u + ((next.u - gate.u) * (at - gate.s)) / (next.s - gate.s);
      for (const side of [-1, 1]) hazards.push(hazardAt(trail, Math.round(at), line + side * half, WALL_RADIUS, wallKind, true));
    }
  }
  // Forks: an island of trees between the two openings, running back up the slope.
  for (const [index, alt] of S.forks) {
    const gate = gates[index];
    const mid = (gate.u + alt) / 2;
    // The island stops short of the flags, so both openings are seen whichever side the skier is on.
    for (let back = 9; back <= FORK_ISLAND; back += 6) hazards.push(hazardAt(trail, Math.round(gate.s - back), mid, WALL_RADIUS, "tree", true));
  }
  hazards.sort((a, b) => a.s - b.s);
  // A slope band fills its stretch between the gate margins, stopping short of
  // any rock standing in the stretch so the drift never carries a skier into one unseen.
  const slopes: Slope[] = S.slopes.map(([index, dir, kind = "camber"]) => {
    const { gate, next } = ends(index);
    const from = gate.s + SLOPE_MARGIN;
    let to = next.s - SLOPE_MARGIN;
    for (const h of hazards) if (!h.wall && h.s > gate.s && h.s < next.s) to = Math.min(to, h.s - SLOPE_ROCK_GAP);
    return { from, to: Math.max(to, from + 1), dir: kind === "camber" || kind === "step" ? dir : 1, kind, stretch: index };
  });
  slopes.sort((a, b) => a.from - b.from);
  const count = gates.length;
  const maxGateScore = gateScore(count, () => false);
  // Par is the time a skier who simply follows the trail at its own pace would take, with a little grace.
  let follow = 0;
  for (let at = 0; at < finishS; at += 5) follow += 5 / Math.max(9, speed * trailPitch(trail, at) * TOP_PACE * (0.25 + 0.75 * fallPace(trailDir(trail, at))));
  const parTime = Math.round(follow * S.parFactor + 2);
  const t = level / (LEVEL_COUNT - 1);
  const extras = buildExtras(S, trail, gates, stretches, tokens, hazards, finishS, speed);
  // Never fewer than two misses forgiven, or one star would ask as much as two.
  const every = Math.max(3, Math.min(Math.floor(count / 2), Math.round(STAR_MISS_EVERY.first + (STAR_MISS_EVERY.last - STAR_MISS_EVERY.first) * t)));
  // Moving gates do not count toward the bullseyes asked, nor does the gate a kicker or a leap lands by: that line was set in the air.
  const flown = new Set(extras.zones.filter((zone) => zone.kind === "ramp").map((zone) => gates.find((gate) => gate.s > zone.s)));
  const still = gates.filter((gate) => !gate.drift && !flown.has(gate)).length;
  const bullseyes = Math.ceil((STAR_BULLSEYES.first + (STAR_BULLSEYES.last - STAR_BULLSEYES.first) * t) * still);
  const round = (n: number) => Math.round(n / 50) * 50;
  const starScores: [number, number, number] = [
    round(gateScore(count, (i) => i % every === every - 1)),
    round(gateScore(count, (i) => i === Math.floor(count / 2))),
    round(maxGateScore + bullseyes * BULLSEYE_POINTS),
  ];
  return {
    ...extras,
    twist: S.twist,
    weather: S.weather,
    night: S.night,
    cratePowers: cratePowersFor(level),
    rivalPace: S.rivalPace,
    avalanchePace: S.avalanchePace,
    level,
    name: S.name,
    hint: S.hint,
    role: S.role,
    trail,
    gates,
    finishS,
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
    starBullseyes: bullseyes,
  };
}
/** Crates start out holding only coins; the power-ups join them once a level has shown each one. */
export function cratePowersFor(level: number): PowerKind[] {
  const seen: PowerKind[] = [];
  for (let i = 0; i < level; i++)
    for (const [, kind] of LEVEL_DESIGNS[i].powers) if (!seen.includes(kind)) seen.push(kind);
  return seen;
}
/** How far into a band a point is, eased at both ends: 0 outside, 1 in the middle. */
export function slopeWindow(slope: Pick<Slope, "from" | "to">, s: number) {
  if (s <= slope.from || s >= slope.to) return 0;
  const t = Math.min(1, Math.min(s - slope.from, slope.to - s) / SLOPE_EASE);
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
