import { describe, expect, it } from "vitest";
import {
  ENDLESS_RAMP,
  ENDLESS_START_SPEED,
  ENDLESS_TOP_SPEED,
  createEndlessCourse,
} from "../src/endless";
import { clamp, createEndlessRun, createRun, stepRun, ENDLESS_LIVES, CRATES_PER_LIFE, TERRAIN_PERIOD, snowHeight } from "../src/physics";

/** Drives an endless run with the relaxed controller for a distance. */
function driveEndless(run: ReturnType<typeof createEndlessRun>, untilZ: number) {
  const c = run.course;
  let crashes = 0,
    misses = 0;
  for (let tick = 0; tick < 120 * 600 && !run.finished && run.z < untilZ; tick++) {
    const target = c.gates.find((g) => g.z > run.z) ?? { x: 0, z: run.z + 50 };
    let aimX = target.x;
    const pathX = (z: number) => run.x + (aimX - run.x) * clamp((z - run.z) / 25, 0, 1);
    const blocker = c.hazards
      .filter((h) => h.z > run.z + 2 && h.z < Math.min(run.z + 30, target.z + 4) && Math.abs(h.x - pathX(h.z)) < h.radius + 1.7)
      .sort((a, b) => a.z - b.z)[0];
    if (blocker) aimX = blocker.x + (Math.sign(run.x - blocker.x) || Math.sign(target.x - blocker.x) || 1) * (blocker.radius + 2.3);
    stepRun(run, clamp((aimX - run.x) * 0.18 - run.heading * 0.8, -1, 1), 1 / 120);
    if (run.event === "crash") crashes++;
    if (run.event === "miss") misses++;
  }
  return { crashes, misses };
}

describe("endless mode", () => {
  it("builds the same course for a seed and a different one for another", () => {
    const a = createEndlessCourse(7),
      b = createEndlessCourse(7),
      c = createEndlessCourse(8);
    a.extend(2000);
    b.extend(2000);
    c.extend(2000);
    expect(a.gates).toEqual(b.gates);
    expect(a.hazards).toEqual(b.hazards);
    expect(a.gates).not.toEqual(c.gates);
    expect(a.endless).toBe(true);
    expect(a.tokens).toHaveLength(0);
    expect(a.finishZ).toBe(Infinity);
  });
  it("keeps growing ahead of the skier and gets harder with distance", () => {
    const course = createEndlessCourse(3);
    const before = course.gates.length;
    course.extend(5000);
    expect(course.gates.length).toBeGreaterThan(before + 80);
    expect(course.gates[course.gates.length - 1].z).toBeGreaterThanOrEqual(5000);
    const early = course.gates.filter((g) => g.z < 600),
      late = course.gates.filter((g) => g.z > ENDLESS_RAMP + 500);
    const avgGap = (gs: typeof early) => (gs[gs.length - 1].z - gs[0].z) / (gs.length - 1);
    expect(avgGap(late)).toBeLessThan(avgGap(early) - 10);
    expect(late[0].width).toBeLessThan(early[0].width - 3);
    expect(course.speedAt(0)).toBe(ENDLESS_START_SPEED);
    expect(course.speedAt(2000)).toBeGreaterThan(ENDLESS_START_SPEED + 5);
    expect(course.speedAt(1e6)).toBe(ENDLESS_TOP_SPEED);
    const lateHazards = course.hazards.filter((h) => h.z > ENDLESS_RAMP + 500 && h.z < ENDLESS_RAMP + 1500).length;
    const earlyHazards = course.hazards.filter((h) => h.z < 1000).length;
    expect(lateHazards).toBeGreaterThan(earlyHazards);
    expect(course.hazards.some((h) => h.kind === "tree")).toBe(true);
  });
  it("never lines up two gates unless a rock sits between them, and keeps hazards off gate lines", () => {
    for (const seed of [1, 2, 3]) {
      const course = createEndlessCourse(seed);
      course.extend(4000);
      for (let i = 1; i < course.gates.length; i++) {
        const a = course.gates[i - 1],
          b = course.gates[i];
        expect(b.z - a.z).toBeGreaterThanOrEqual(30);
        const overlap = (a.width + b.width) / 2 - Math.abs(b.x - a.x);
        if (overlap > 0) {
          const between = course.hazards.some(
            (h) => h.z > a.z + 10 && h.z < b.z - 10 && Math.abs(h.x - (a.x + b.x) / 2) < 3,
          );
          expect(between).toBe(true);
        }
      }
      for (let i = 1; i < course.hazards.length; i++)
        expect(course.hazards[i].z).toBeGreaterThanOrEqual(course.hazards[i - 1].z);
      for (const h of course.hazards)
        for (const g of course.gates) expect(Math.abs(h.z - g.z)).toBeGreaterThanOrEqual(12);
    }
  });
  it("lets a relaxed line ski the first two kilometres clean", () => {
    for (const seed of [1, 2]) {
      const run = createEndlessRun(seed);
      const { crashes, misses } = driveEndless(run, 2000);
      expect(run.z).toBeGreaterThanOrEqual(2000);
      expect(crashes).toBe(0);
      expect(misses).toBe(0);
      expect(run.finished).toBe(false);
      expect(run.hits).toBeGreaterThan(30);
      expect(run.tokenCount).toBe(0);
    }
  });
  it("ends the run after three misses or tumbles", () => {
    const run = createEndlessRun(5);
    for (let i = 0; i < 120 * 300 && !run.finished; i++) stepRun(run, 0, 1 / 120);
    expect(run.finished).toBe(true);
    expect(run.lives).toBe(0);
    expect(run.strikes).toBe(ENDLESS_LIVES);
    expect(run.misses + run.crashes).toBe(ENDLESS_LIVES);
    expect(run.passed).toBe(false);
    expect(run.timeBonus).toBe(0);
    const distance = run.z;
    stepRun(run, 0, 1 / 120);
    expect(run.z).toBe(distance);
  });
  it("wins a life for every ten crates caught, with no cap", () => {
    const run = createEndlessRun(9);
    run.lives = 1;
    const catchCrate = () => {
      Object.assign(run.crates.items[0], { phase: "landed", x: run.x, z: run.z + 0.3, age: 0 });
      stepRun(run, 0, 1 / 120);
      expect(run.crates.event).toBe(true);
    };
    for (let i = 0; i < CRATES_PER_LIFE - 1; i++) catchCrate();
    expect(run.lives).toBe(1);
    expect(run.cratesTowardLife).toBe(CRATES_PER_LIFE - 1);
    expect(run.lifeEvent).toBe(false);
    catchCrate();
    expect(run.lives).toBe(2);
    expect(run.lifeEvent).toBe(true);
    expect(run.cratesTowardLife).toBe(0);
    stepRun(run, 0, 1 / 120);
    expect(run.lifeEvent).toBe(false);
    for (let i = 0; i < CRATES_PER_LIFE; i++) catchCrate();
    expect(run.lives).toBe(3);
    // Ten more crates on a full three lives earn a fourth, and so on.
    for (let i = 0; i < CRATES_PER_LIFE; i++) catchCrate();
    expect(run.lives).toBe(4);
    expect(run.lifeEvent).toBe(true);
    for (let i = 0; i < CRATES_PER_LIFE; i++) catchCrate();
    expect(run.lives).toBe(5);
    expect(run.crates.collected).toBe(4 * CRATES_PER_LIFE);
    // A run with spare lives survives more than three strikes.
    run.lives = 4;
    run.strikes = 0;
    while (run.strikes < 3 && !run.finished) stepRun(run, 0, 1 / 120);
    expect(run.strikes).toBe(3);
    expect(run.lives).toBe(1);
    expect(run.finished).toBe(false);
    // Crates count for points on the levels too, but lives are endless only.
    const level = createRun(0);
    Object.assign(level.crates.items[0], { phase: "landed", x: 0, z: 0.3, age: 0 });
    level.strikes = 1;
    level.lives = 1;
    for (let i = 0; i < CRATES_PER_LIFE; i++) {
      Object.assign(level.crates.items[0], { phase: "landed", x: level.x, z: level.z + 0.3, age: 0 });
      stepRun(level, 0, 1 / 120);
    }
    expect(level.strikes).toBe(1);
    expect(level.lives).toBe(1);
    expect(level.cratesTowardLife).toBe(0);
  });
  it("keeps the snow periodic so scenery can be recycled", () => {
    for (const z of [0, 37, 250, 999]) {
      expect(snowHeight(z + TERRAIN_PERIOD)).toBeCloseTo(snowHeight(z) - TERRAIN_PERIOD * 0.1, 6);
    }
  });
});
