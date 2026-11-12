import { trailAt, trailHalf, type Trail } from "./trail";

/**
 * Everything on the slope that moves on its own: other skiers, deer, the
 * herd, snowcats, ploughs and falling rock. Each lives in trail coordinates
 * (s along the trail, u across it) and works on or across the racing line,
 * not beside it: it is there to be read and skied round. Each wakes when the
 * skier comes within its lead, so it is always met in the middle of its act;
 * where exactly in that act differs from run to run (a learner's turn, how
 * long a deer stares, where a snowcat has got to), within what can be read
 * from where it is and which way it is going.
 */
export type MoverKind = "skier" | "deer" | "snowcat" | "herd" | "plough" | "boulder";
export interface MoverSpec {
  kind: MoverKind;
  /** Where along the trail the skier meets it. */
  s: number;
  /** Learner, herd: its offset from the racing line. Deer: where it stops to look. Plough, boulder: its lane. Snowcat: the middle of its beat. */
  u: number;
  /** Which way it first moves across the slope. */
  dir: 1 | -1;
  /** The racing line it works about, as points down the trail. */
  line?: readonly { s: number; u: number }[];
}
export interface MoverState {
  kind: MoverKind;
  s: number;
  u: number;
  x: number;
  z: number;
  /** The way the trail runs where it is. */
  rot: number;
  radius: number;
  phase: "waiting" | "active" | "done";
  /** Seconds since it woke. */
  t: number;
  /** Which way it faces in the world, as a heading like the skier's (0 is straight down the fall line). */
  heading: number;
  /** How fast it is going, for its animation. */
  pace: number;
  /** How fast it is moving across the trail, in metres a second: what a skier reads to guess where it will be. */
  drift: number;
  /** It has been run into: it no longer hurts and plays its tumble. */
  hit: boolean;
  /** The skier has gone by it, so a close call has been judged. */
  passed: boolean;
  /** The nearest the skier has been while level with it, for judging a close call. */
  nearest: number;
  /** What this run rolled for it: a phase in its turn or beat, and how long a deer stares. */
  roll: number;
  stare: number;
  /** How long a deer takes to run in from the trees. */
  trot: number;
}

/** How a learner skis: this share of the course's cruising speed, in long steady traverses right across the racing line, this far either side of it, turning round at each end. `RATE` is turns of the head per second: a whole there-and-back takes 2π / RATE seconds. */
export const LEARNER_PACE = 0.42;
export const LEARNER_SWAY = 6;
export const LEARNER_RATE = 0.8;
/** A learner is first seen this far ahead, and so is met about this far past its start. */
export const LEARNER_LEAD = 110;
/** A deer breaks cover when the skier is this many seconds of cruising away. */
/** A deer breaks cover so as to reach the racing line this long before the skier does, at cruising speed. */
export const DEER_HEAD_TIME = 0.8;
/** It trots in for this long, stands on the line and stares for something between these, then bolts on across. */
export const DEER_TROT_TIME = 0.95;
export const DEER_STARE_MIN = 0.45;
export const DEER_STARE_MAX = 1.1;
export const DEER_BOLT_SPEED = 12;
/** It comes out of the trees at the edge of the trail, never out of thin air on the snow, and runs in at this pace. */
export const DEER_RUN_SPEED = 11;
/** Where a deer comes from: the tree line, on the side it is not going to. */
export const deerStart = (spec: MoverSpec, trail: Trail) => -spec.dir * (trailHalf(trail, spec.s) + 8);
/** How long its run in to the racing line takes: never less than DEER_TROT_TIME. */
export const deerTrot = (spec: MoverSpec, trail: Trail) => Math.max(DEER_TROT_TIME, Math.abs(spec.u - deerStart(spec, trail)) / DEER_RUN_SPEED);
/** A snowcat crawls across the trail and back at this speed, keeping this far from each edge. */
export const SNOWCAT_SPEED = 2.6;
export const SNOWCAT_MARGIN = 4;
export const SNOWCAT_LEAD = 170;
/** The snowcat is long across the slope: three circles this far apart. */
export const SNOWCAT_HALF = 1.3;
/** A deer of the herd runs down the trail with the skier, at this share of cruising speed, jinking this far across. */
export const HERD_PACE = 0.62;
export const HERD_SWAY = 1;
export const HERD_RATE = 1.5;
export const HERD_LEAD = 105;
/** Each of the herd breaks out of the trees and takes this long to reach its lane: nothing appears on the open snow. */
export const HERD_ENTRY_TIME = 2.4;
/** A plough grinds up the trail toward the skier at this speed, in the racing lane, and is seen from this far off. */
export const PLOUGH_SPEED = 3;
export const PLOUGH_LEAD = 190;
/** A boulder is announced this many seconds of cruising ahead, takes this long to fall, and lands within this of its mark. */
export const BOULDER_LEAD_TIME = 2.8;
export const BOULDER_FALL_TIME = 1.5;
export const BOULDER_SCATTER = 1.6;
export const MOVER_RADIUS: Record<MoverKind, number> = {
  skier: 0.75,
  deer: 0.8,
  snowcat: 1.45,
  herd: 0.8,
  plough: 1.7,
  boulder: 1.3,
};

export function createMover(spec: MoverSpec, trail: Trail, random: () => number = () => 0.5): MoverState {
  const roll = random(),
    stare = DEER_STARE_MIN + (DEER_STARE_MAX - DEER_STARE_MIN) * random();
  const m: MoverState = {
    kind: spec.kind,
    s: spec.s,
    u: spec.kind === "deer" ? deerStart(spec, trail) : spec.kind === "boulder" ? spec.u + (roll - 0.5) * 2 * BOULDER_SCATTER : spec.u,
    x: 0,
    z: 0,
    rot: 0,
    radius: MOVER_RADIUS[spec.kind],
    phase: "waiting",
    t: 0,
    heading: 0,
    pace: 0,
    drift: 0,
    hit: false,
    passed: false,
    nearest: Infinity,
    roll,
    stare,
    trot: spec.kind === "deer" ? deerTrot(spec, trail) : 0,
  };
  place(m, trail);
  return m;
}
function place(m: MoverState, trail: Trail) {
  const p = trailAt(trail, m.s, m.u);
  m.x = p.x;
  m.z = p.z;
  m.rot = p.dir;
}
/** How far short of a mover's meeting place the skier is when it wakes. */
export function moverLead(spec: MoverSpec, cruise: number, trail?: Trail) {
  if (spec.kind === "skier") return LEARNER_LEAD / (1 - LEARNER_PACE);
  if (spec.kind === "deer") return ((trail ? deerTrot(spec, trail) : DEER_TROT_TIME) + DEER_HEAD_TIME) * cruise;
  if (spec.kind === "herd") return HERD_LEAD / (1 - HERD_PACE);
  if (spec.kind === "plough") return PLOUGH_LEAD;
  if (spec.kind === "boulder") return BOULDER_LEAD_TIME * cruise;
  return SNOWCAT_LEAD;
}
const ease = (t: number) => t * t * (3 - 2 * t);
/** Where the racing line runs at a distance down the trail. */
export function lineAt(line: MoverSpec["line"], s: number) {
  if (!line || line.length < 2) return 0;
  let i = 1;
  while (i < line.length - 1 && line[i].s < s) i++;
  const a = line[i - 1],
    b = line[i];
  const t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1, b.s - a.s)));
  return a.u + (b.u - a.u) * t;
}
const triangle = (t: number) => 1 - Math.abs((((t % 2) + 2) % 2) - 1);

/**
 * Moves one mover on by a step. `skierS` is how far down the trail the skier
 * is and `cruise` the course's cruising speed there.
 */
export function stepMover(m: MoverState, spec: MoverSpec, trail: Trail, skierS: number, cruise: number, dt: number, approach = cruise) {
  if (m.phase === "done") return;
  if (m.phase === "waiting") {
    if (skierS < spec.s - moverLead(spec, approach, trail)) return;
    m.phase = "active";
    m.t = 0;
    if (spec.kind === "skier") m.s = spec.s - (LEARNER_LEAD * LEARNER_PACE) / (1 - LEARNER_PACE);
    if (spec.kind === "herd") m.s = spec.s - (HERD_LEAD * HERD_PACE) / (1 - HERD_PACE);
    // The plough will have ground this far up the trail by the time the skier reaches it.
    if (spec.kind === "plough") m.s = spec.s + (PLOUGH_SPEED * PLOUGH_LEAD) / Math.max(10, approach);
  }
  m.t += dt;
  const t = m.t,
    half = trailHalf(trail, m.s);
  const before = m.u;
  let turn = 0;
  if (spec.kind === "skier" || spec.kind === "herd") {
    const learner = spec.kind === "skier";
    if (m.hit) {
      // Knocked over: slides to a stop where it fell.
      m.pace *= Math.exp(-3 * dt);
      m.s += m.pace * dt;
    } else {
      const sway = learner ? LEARNER_SWAY : HERD_SWAY,
        rate = learner ? LEARNER_RATE : HERD_RATE,
        at = t * rate + m.roll * Math.PI * 2;
      m.pace = cruise * (learner ? LEARNER_PACE : HERD_PACE);
      m.s += m.pace * dt;
      const room = half - 2;
      // A learner holds a traverse and turns at the end of it; a deer jinks.
      const wave = learner ? triangle(at / Math.PI + 0.5) * 2 - 1 : Math.sin(at);
      const slope = learner ? (Math.cos(at) >= 0 ? 2 / Math.PI : -2 / Math.PI) : Math.cos(at);
      m.u = Math.max(-room, Math.min(room, lineAt(spec.line, m.s) + spec.u + spec.dir * sway * wave));
      if (!learner && t < HERD_ENTRY_TIME) {
        // Out of the trees on the side its lane is nearer to, and down across the snow to it.
        const from = (spec.u < 0 || (spec.u === 0 && spec.dir < 0) ? -1 : 1) * (half + 8);
        m.u = from + (m.u - from) * ease(t / HERD_ENTRY_TIME);
      }
      turn = Math.atan2(spec.dir * sway * rate * slope, m.pace);
    }
    if (m.s < skierS - 30) m.phase = "done";
  } else if (spec.kind === "plough") {
    m.pace = PLOUGH_SPEED;
    m.s -= PLOUGH_SPEED * dt;
    turn = Math.PI;
    if (m.s < skierS - 25) m.phase = "done";
  } else if (spec.kind === "boulder") {
    // It falls where its ring has been waiting, and stays there.
    m.pace = t < BOULDER_FALL_TIME ? 1 : 0;
    if (spec.s < skierS - 20) m.phase = "done";
  } else if (spec.kind === "deer") {
    const from = deerStart(spec, trail);
    turn = (spec.dir * Math.PI) / 2;
    if (t < m.trot) {
      // A steady run in, easing only as it pulls up.
      const f = t / m.trot;
      m.u = from + (spec.u - from) * (f < 0.7 ? f * 1.15 : 0.805 + 0.195 * ease((f - 0.7) / 0.3));
      m.pace = 1;
    } else if (t < m.trot + m.stare) {
      m.u = spec.u;
      m.pace = 0;
    } else {
      m.u = spec.u + spec.dir * DEER_BOLT_SPEED * (t - m.trot - m.stare);
      m.pace = 2;
      if (Math.abs(m.u) > half + 6) m.phase = "done";
    }
    if (spec.s < skierS - 20) m.phase = "done";
  } else {
    // The snowcat grooms across the trail and back, nose first, from wherever this run found it.
    const reach = Math.max(3, half - SNOWCAT_MARGIN),
      span = 2 * reach;
    const at = m.roll * 2 + (SNOWCAT_SPEED * t) / span;
    m.u = spec.u + spec.dir * (triangle(at) * span - reach);
    turn = (spec.dir * (Math.floor(at) % 2 ? -1 : 1) * Math.PI) / 2;
    m.pace = SNOWCAT_SPEED;
    if (spec.s < skierS - 25) m.phase = "done";
  }
  m.drift = dt > 0 ? (m.u - before) / dt : 0;
  place(m, trail);
  m.heading = m.rot + turn;
}
/** Whether a skier at a point of the world is touching a mover. */
export function touchesMover(m: MoverState, x: number, z: number, reach = 0.65) {
  if (m.phase !== "active" || m.hit) return false;
  // A boulder still in the air hurts no one.
  if (m.kind === "boulder" && m.t < BOULDER_FALL_TIME) return false;
  if (m.kind === "snowcat") {
    const cos = Math.cos(m.rot),
      sin = Math.sin(m.rot);
    return [-SNOWCAT_HALF, 0, SNOWCAT_HALF].some((o) => Math.hypot(m.x + o * cos - x, m.z - o * sin - z) < m.radius + reach);
  }
  return Math.hypot(m.x - x, m.z - z) < m.radius + reach;
}
/** The sideways gap between a skier at u and the nearest part of a mover. */
export function moverGap(m: MoverState, u: number) {
  const half = m.kind === "snowcat" ? SNOWCAT_HALF : 0;
  return Math.max(0, Math.abs(m.u - u) - half) - m.radius;
}
