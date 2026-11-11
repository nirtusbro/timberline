/**
 * Everything on the slope that moves on its own: other skiers, deer and
 * the snowcat. Each one is a pure function of the time since it
 * woke up, and it wakes when the skier comes within its lead distance, so a
 * mover always meets the skier at about the same place and every run of a
 * level sees the same slope.
 */
export type MoverKind = "skier" | "deer" | "snowcat";
export interface MoverSpec {
  kind: MoverKind;
  /** Skier: the middle of the lane it weaves about. Deer: where it stops to look. Snowcat: where it starts. */
  x: number;
  /** Where along the course it is met: the z a skier at cruising speed reaches it. */
  z: number;
  /** Which way it first moves across the slope. */
  dir: 1 | -1;
}
export interface MoverState {
  kind: MoverKind;
  x: number;
  z: number;
  radius: number;
  phase: "waiting" | "active" | "done";
  /** Seconds since it woke. */
  t: number;
  /** Which way it faces, as a heading like the skier's (0 is straight down the slope). */
  heading: number;
  /** How fast it is going, for its animation. */
  pace: number;
  /** It has been run into: it no longer hurts and plays its tumble. */
  hit: boolean;
  /** The skier has gone by it, so a close call has been judged. */
  passed: boolean;
  /** The nearest the skier has been while level with it, for judging a close call. */
  nearest: number;
}

/** How a learner skis: this share of the course's cruising speed, in turns this wide and this slow. */
export const LEARNER_PACE = 0.42;
export const LEARNER_SWAY = 2.6;
export const LEARNER_RATE = 1.15;
/** A learner is first seen this far ahead, and so is met about this far past its start. */
export const LEARNER_LEAD = 110;
/** A deer breaks cover when the skier is this many seconds of cruising away. */
export const DEER_LEAD_TIME = 2.5;
export const DEER_EDGE = 21;
/** It trots in for this long, stands and stares for this long, then bolts. */
export const DEER_TROT_TIME = 0.95;
export const DEER_STARE_TIME = 0.55;
export const DEER_BOLT_SPEED = 13;
/** A snowcat crawls across the slope and back at this speed, between these edges. */
export const SNOWCAT_SPEED = 2.4;
export const SNOWCAT_REACH = 8.5;
export const SNOWCAT_LEAD = 170;
/** The snowcat is long across the slope: two circles this far either side of its middle. */
export const SNOWCAT_HALF = 1.3;

export const MOVER_RADIUS: Record<MoverKind, number> = {
  skier: 0.75,
  deer: 0.8,
  snowcat: 1.45,
};

export function createMover(spec: MoverSpec): MoverState {
  return {
    kind: spec.kind,
    x: spec.kind === "deer" ? -spec.dir * DEER_EDGE : spec.x,
    z: spec.z,
    radius: MOVER_RADIUS[spec.kind],
    phase: "waiting",
    t: 0,
    heading: 0,
    pace: 0,
    hit: false,
    passed: false,
    nearest: Infinity,
  };
}
/** How far short of a mover's meeting place the skier is when it wakes. */
export function moverLead(spec: MoverSpec, cruise: number) {
  if (spec.kind === "skier") return LEARNER_LEAD / (1 - LEARNER_PACE);
  if (spec.kind === "deer") return DEER_LEAD_TIME * cruise;
  return SNOWCAT_LEAD;
}
const ease = (t: number) => t * t * (3 - 2 * t);
const triangle = (t: number) => 1 - Math.abs((((t % 2) + 2) % 2) - 1);

/**
 * Moves one mover on by a step. `skierZ` is where the skier is and `cruise`
 * the course's cruising speed there.
 */
export function stepMover(m: MoverState, spec: MoverSpec, skierZ: number, cruise: number, dt: number, approach = cruise) {
  if (m.phase === "done") return;
  if (m.phase === "waiting") {
    if (skierZ < spec.z - moverLead(spec, approach)) return;
    m.phase = "active";
    m.t = 0;
    if (spec.kind === "skier") m.z = spec.z - (LEARNER_LEAD * LEARNER_PACE) / (1 - LEARNER_PACE);
  }
  m.t += dt;
  const t = m.t;
  if (spec.kind === "skier") {
    if (m.hit) {
      // Knocked over: slides to a stop where it fell.
      m.pace *= Math.exp(-3 * dt);
      m.z += m.pace * dt;
    } else {
      m.pace = cruise * LEARNER_PACE;
      m.z += m.pace * dt;
      m.x = spec.x + spec.dir * LEARNER_SWAY * Math.sin(t * LEARNER_RATE);
      m.heading = Math.atan2(spec.dir * LEARNER_SWAY * LEARNER_RATE * Math.cos(t * LEARNER_RATE), m.pace);
    }
    if (m.z < skierZ - 30) m.phase = "done";
  } else if (spec.kind === "deer") {
    const from = -spec.dir * DEER_EDGE;
    m.heading = (spec.dir * Math.PI) / 2;
    if (t < DEER_TROT_TIME) {
      m.x = from + (spec.x - from) * ease(t / DEER_TROT_TIME);
      m.pace = 1;
    } else if (t < DEER_TROT_TIME + DEER_STARE_TIME) {
      m.x = spec.x;
      m.pace = 0;
    } else {
      m.x = spec.x + spec.dir * DEER_BOLT_SPEED * (t - DEER_TROT_TIME - DEER_STARE_TIME);
      m.pace = 2;
      if (Math.abs(m.x) > DEER_EDGE + 3) m.phase = "done";
    }
    if (spec.z < skierZ - 20) m.phase = "done";
  } else {
    // The snowcat grooms across the slope and back, nose first.
    const span = 2 * SNOWCAT_REACH;
    const start = (spec.x * spec.dir + SNOWCAT_REACH) / span;
    const at = start + (SNOWCAT_SPEED * t) / span;
    m.x = spec.dir * (triangle(at) * span - SNOWCAT_REACH);
    m.heading = (spec.dir * (Math.floor(at) % 2 ? -1 : 1) * Math.PI) / 2;
    m.pace = SNOWCAT_SPEED;
    if (spec.z < skierZ - 25) m.phase = "done";
  }
}
/** Whether a skier at a point is touching a mover. */
export function touchesMover(m: MoverState, x: number, z: number, reach = 0.65) {
  if (m.phase !== "active" || m.hit) return false;
  if (Math.abs(m.z - z) > m.radius + reach + 0.2) return false;
  if (m.kind === "snowcat")
    return [-SNOWCAT_HALF, 0, SNOWCAT_HALF].some((o) => Math.hypot(m.x + o - x, m.z - z) < m.radius + reach);
  return Math.hypot(m.x - x, m.z - z) < m.radius + reach;
}
/** The sideways gap between a skier and the nearest part of a mover. */
export function moverGap(m: MoverState, x: number) {
  const half = m.kind === "snowcat" ? SNOWCAT_HALF : 0;
  return Math.max(0, Math.abs(m.x - x) - half) - m.radius;
}
