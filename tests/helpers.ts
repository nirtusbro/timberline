import { FULL_WIDTH } from "../src/extras";
import { LEVEL_COUNT, gateAt, getCourse, hazardAt, type Course, type Gate, type Zone } from "../src/levels";
import type { MoverSpec } from "../src/movers";
import { createRun, runFor, stepRun, type Run } from "../src/physics";
import { SKILLS, createPilot } from "../src/pilot";
import { buildTrail, trailAt, trailDir, trailX, type Leg, type Trail } from "../src/trail";

/** The step every simulated run is skied at, unless a test is about the step itself. */
export const HZ = 120;
export const DT = 1 / HZ;
export const deg = (radians: number) => (radians * 180) / Math.PI;
export const rad = (degrees: number) => (degrees * Math.PI) / 180;
export const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
export const mean = (values: readonly number[]) => sum(values) / Math.max(1, values.length);
export const ALL_LEVELS = Array.from({ length: LEVEL_COUNT }, (_, level) => level);

/** A patch of ice, a kicker or a chasm laid on a trail by hand. Left wide, it spans the piste. */
export function zoneOn(trail: Trail, kind: Zone["kind"], s: number, length: number, u = 0, halfWidth = FULL_WIDTH): Zone {
  const p = trailAt(trail, s, u);
  return { kind, s, u, halfWidth, length, x: p.x, z: p.z, rot: p.dir };
}
export interface Bare {
  /** The trail, leg by leg; left out, it runs straight down the fall line. */
  legs?: Leg[];
  /** Half the width of open snow everywhere, overriding the legs. */
  half?: number;
  gates?: [s: number, u: number, width?: number, more?: Partial<Gate>][];
  rocks?: [s: number, u: number, radius?: number][];
  zones?: (trail: Trail) => Zone[];
  movers?: MoverSpec[];
  speed?: number;
  finishS?: number;
  more?: Partial<Course>;
}
/** A course with nothing on it but what a test puts there: no coins, no crates worth having, no weather. */
export function bareCourse({ legs = [{ len: 2400 }], half, gates = [], rocks = [], zones, movers = [], speed = 26, finishS = 2000, more = {} }: Bare = {}): Course {
  const trail = buildTrail(legs);
  if (half !== undefined) trail.half.fill(half);
  return {
    ...getCourse(0),
    name: "Test piste",
    hint: "",
    role: "test",
    trail,
    gates: gates.map(([s, u, width = 8, extra = {}], i) => ({ ...gateAt(trail, s, u, width, i), ...extra })),
    finishS,
    stretches: [],
    tokens: [],
    hazards: rocks.map(([s, u, radius = 1]) => hazardAt(trail, s, u, radius)).sort((a, b) => a.s - b.s),
    slopes: [],
    speed,
    turnAngle: 0.8,
    parTime: 1000,
    timeBonusRate: 0,
    starScores: [100, 200, 300],
    starBullseyes: 0,
    coins: [],
    zones: zones ? zones(trail) : [],
    powers: [],
    movers,
    twist: "",
    weather: "clear",
    night: false,
    cratePowers: [],
    ...more,
  };
}
/** A run of a course with no supply crates falling, so nothing but the skiing scores. */
export function startOn(course: Course, seed = 1): Run {
  const run = runFor(course, seed);
  run.crates.nextDrop = Infinity;
  return run;
}
/** Stands the skier at a place on the trail, pointing along it unless told otherwise. */
export function put(run: Run, s: number, u = 0, heading = trailDir(run.course.trail, s)) {
  const p = trailAt(run.course.trail, s, u);
  run.x = p.x;
  run.z = p.z;
  run.s = s;
  run.u = u;
  run.heading = heading;
  run.aim = heading;
  while (run.nextGate < run.course.gates.length && run.course.gates[run.nextGate].s < s) run.nextGate++;
  while (run.hazardCursor < run.course.hazards.length && run.course.hazards[run.hazardCursor].s < s - 6) run.hazardCursor++;
  return run;
}
/** Skis on for some seconds with the thumb held where it is (or where `input` says at each moment). Returns the events seen. */
export function coast(run: Run, seconds: number, input: number | ((run: Run) => number) = 0, hz = HZ) {
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds * hz) && !run.finished; i++) {
    stepRun(run, typeof input === "number" ? input : input(run), 1 / hz);
    if (run.event) events.push(run.event);
  }
  return events;
}
export type SkillName = keyof typeof SKILLS;
/** Skis a run to its end (or until `until` says stop) with a stand-in player at the controls. */
export function ski(run: Run, skill: SkillName, seed: number, until?: (run: Run) => boolean) {
  const pilot = createPilot(SKILLS[skill], seed);
  for (let i = 0; i < HZ * 300 && !run.finished && !until?.(run); i++) stepRun(run, pilot.steer(run, DT), DT);
  return run;
}
/** The seed of the n-th run of a level: the same for every pilot, so they are compared on the same movers. */
export const seedOf = (level: number, n: number) => level * 1000 + n;
/** One run of a campaign level by a stand-in player; `alter` may change the course first (say, clear its rocks). */
export function skiLevel(level: number, skill: SkillName, n: number, alter?: (course: Course) => Course) {
  const seed = seedOf(level, n);
  return ski(alter ? runFor(alter(getCourse(level)), seed) : createRun(level, seed), skill, seed);
}
/** The same course with nothing standing or moving on it: the walls of its narrows and the islands of its forks stay, since they are the trail. */
export const cleared = (course: Course): Course => ({ ...course, movers: [], hazards: course.hazards.filter((h) => h.wall) });
/** How much a trail turns between two places, in degrees, counting every bend both ways. */
export function winding(trail: Trail, from: number, to: number) {
  let total = 0;
  for (let s = from; s < to; s++) total += Math.abs(trailDir(trail, s + 1) - trailDir(trail, s));
  return deg(total);
}
/** How far the middle of a trail strays from side to side across the mountain between two places, in metres. */
export function wander(trail: Trail, from: number, to: number) {
  let min = Infinity,
    max = -Infinity;
  for (let s = from; s <= to; s++) {
    const x = trailX(trail, s);
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  return max - min;
}
