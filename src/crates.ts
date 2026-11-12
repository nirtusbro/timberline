import type { Run } from "./physics";
import { trailAt, trailHalf } from "./trail";

/**
 * Supply crates: now and then one parachutes onto the slope ahead. Ski
 * through it once it has landed for points and coins; a missed crate costs
 * nothing.
 */
export const CRATE_POINTS = 200;
export const CRATE_COINS = 5;
export const CRATE_FALL_TIME = 1.8;
export const CRATE_POOL_SIZE = 2;
// A handful of drops per run: the first after a few seconds, then well spaced.
export const CRATE_FIRST_DROP = 5.5;
export const CRATE_MIN_GAP = 9;
export const CRATE_GAP_SPREAD = 5;
export interface Crate {
  phase: "inactive" | "falling" | "landed" | "collected";
  x: number;
  z: number;
  /** How far down the trail it lands. */
  s: number;
  age: number;
}
export function createCrates(seed: number) {
  return {
    seed: seed >>> 0,
    nextDrop: CRATE_FIRST_DROP,
    collected: 0,
    event: false,
    items: Array.from({ length: CRATE_POOL_SIZE }, (): Crate => ({
      phase: "inactive",
      x: 0,
      z: 0,
      s: 0,
      age: 0,
    })),
  };
}
// A run owns its random stream so rendering/frame rate cannot change its drops.
function random(state: ReturnType<typeof createCrates>) {
  state.seed = (Math.imul(1664525, state.seed) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
export function stepCrates(
  run: Run,
  oldX: number,
  oldZ: number,
  dt: number,
) {
  const { gates, finishS, hazards, trail } = run.course;
  const state = run.crates;
  for (const crate of state.items) {
    if (crate.phase === "inactive") continue;
    crate.age += dt;
    if (crate.phase === "falling" && crate.age >= CRATE_FALL_TIME) {
      crate.phase = "landed";
      crate.age = 0;
    }
    if (crate.phase === "landed" && run.crashTime === 0) {
      const dx = run.x - oldX,
        dz = run.z - oldZ;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((crate.x - oldX) * dx + (crate.z - oldZ) * dz) /
            (dx * dx + dz * dz || 1),
        ),
      );
      if (Math.hypot(crate.x - oldX - t * dx, crate.z - oldZ - t * dz) < 2.3) {
        crate.phase = "collected";
        crate.age = 0;
        state.collected++;
        state.event = true;
      }
    }
    if (
      crate.s < run.s - 15 ||
      (crate.phase === "landed" && crate.age > 12) ||
      (crate.phase === "collected" && crate.age > 0.5)
    )
      crate.phase = "inactive";
  }
  if (run.time < state.nextDrop) return;
  state.nextDrop =
    run.time + CRATE_MIN_GAP + random(state) * CRATE_GAP_SPREAD;
  const slot = state.items.find((crate) => crate.phase === "inactive");
  if (!slot) return;
  let s = run.s + Math.max(85, run.speed * (3.2 + random(state) * 0.5));
  for (const gate of gates) if (Math.abs(s - gate.s) < 12) s = gate.s + 12;
  if (s > finishS - 18) return;
  // Never where there is no snow to land on, or where the skier will be in the air: a lip, a gap, the flight beyond either.
  if (run.course.zones.some((zone) => zone.kind !== "ice" && s > zone.s - 14 && s < zone.s + zone.length + 46)) return;
  // Nor on the mark of something that is about to be there.
  if (run.course.movers.some((m) => Math.abs(m.s - s) < 10)) return;
  // Land on the open snow, clear of rocks and trees, so no pickup ever needs a tumble.
  const room = Math.min(11, trailHalf(trail, s) - 4);
  const blocked = (u: number) => hazards.some((hazard) => Math.abs(hazard.s - s) < 6 && Math.abs(hazard.u - u) < 4);
  let u = (random(state) * 2 - 1) * room;
  if (blocked(u)) {
    const rolled = u;
    u =
      [-0.8, -0.4, 0, 0.4, 0.8]
        .map((share) => share * room)
        .sort((a, b) => Math.abs(a - rolled) - Math.abs(b - rolled))
        .find((candidate) => !blocked(candidate)) ?? NaN;
    // Nowhere clear to land: no crate this time.
    if (Number.isNaN(u)) return;
  }
  const at = trailAt(trail, s, u);
  Object.assign(slot, { phase: "falling", x: at.x, z: at.z, s, age: 0 });
}
