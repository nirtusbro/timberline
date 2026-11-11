import { describe, expect, it } from "vitest";
import { createRun, stepRun } from "../src/physics";
import {
  CRATE_FIRST_DROP,
  CRATE_MIN_GAP,
  CRATE_GAP_SPREAD,
  CRATE_COINS,
  CRATE_POINTS,
} from "../src/crates";
const ticksUntilFirstDrop = Math.ceil(CRATE_FIRST_DROP * 120) + 30;

describe("supply crates", () => {
  it("drops ahead with time to react, clear of flags and the slope edges", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const run = createRun(19, seed);
      for (let i = 0; i < ticksUntilFirstDrop; i++) stepRun(run, 0, 1 / 120);
      const crate = run.crates.items.find((item) => item.phase === "falling")!;
      expect(crate).toBeDefined();
      expect(crate.z - run.z).toBeGreaterThan(run.speed * 2);
      expect(Math.abs(crate.x)).toBeLessThanOrEqual(11);
      expect(run.course.gates.every((gate) => Math.abs(gate.z - crate.z) >= 12)).toBe(true);
    }
  });
  it("uses fresh random positions, reproducible for a given seed", () => {
    const runs = [createRun(5, 42), createRun(5, 42), createRun(5, 43)];
    for (const run of runs)
      for (let i = 0; i < ticksUntilFirstDrop; i++) stepRun(run, 0, 1 / 120);
    expect(runs[0].crates.items).toEqual(runs[1].crates.items);
    expect(runs[0].crates.items).not.toEqual(runs[2].crates.items);
  });
  it("drops only a few well-spaced crates in a run", () => {
    expect(CRATE_FIRST_DROP).toBeGreaterThanOrEqual(5);
    expect(CRATE_MIN_GAP).toBeGreaterThanOrEqual(9);
    for (let seed = 1; seed <= 30; seed++) {
      const run = createRun(0, seed);
      const dropTimes: number[] = [];
      let falling = 0;
      for (let i = 0; i < 120 * 120 && !run.finished; i++) {
        stepRun(run, 0, 1 / 120);
        const now = run.crates.items.filter((item) => item.phase === "falling").length;
        if (now > falling) dropTimes.push(run.time);
        falling = now;
      }
      expect(run.finished).toBe(true);
      expect(dropTimes.length).toBeGreaterThanOrEqual(1);
      expect(dropTimes.length).toBeLessThanOrEqual(4);
      for (let i = 1; i < dropTimes.length; i++) {
        const gap = dropTimes[i] - dropTimes[i - 1];
        expect(gap).toBeGreaterThanOrEqual(CRATE_MIN_GAP - 0.05);
        expect(gap).toBeLessThanOrEqual(CRATE_MIN_GAP + CRATE_GAP_SPREAD + 0.05);
      }
    }
  });
  it("collects a landed crate exactly once, for points and coins, without altering combo", () => {
    const run = createRun(0);
    Object.assign(run.crates.items[0], { phase: "landed", x: 0, z: 0.2, age: 0 });
    run.combo = 3;
    stepRun(run, 0, 1 / 120);
    expect(run.crates.event).toBe(true);
    expect(run.crates.collected).toBe(1);
    expect(run.score).toBe(CRATE_POINTS);
    expect(run.coins).toBe(CRATE_COINS);
    expect(run.combo).toBe(3);
    for (let i = 0; i < 60; i++) stepRun(run, 0, 1 / 120);
    expect(run.score).toBe(CRATE_POINTS);
    expect(run.coins).toBe(CRATE_COINS);
    expect(run.crates.event).toBe(false);
  });
  it("does not collect airborne crates, distant crates, or crates during a tumble", () => {
    for (const variant of ["airborne", "distant", "crash"]) {
      const run = createRun(0);
      Object.assign(run.crates.items[0], {
        phase: variant === "airborne" ? "falling" : "landed",
        x: variant === "distant" ? 10 : 0,
        z: 0.2,
        age: 0,
      });
      if (variant === "crash") run.crashTime = 1;
      stepRun(run, 0, 1 / 120);
      expect(run.crates.collected).toBe(0);
    }
  });
  it("lands a crate, retires missed crates, and resets the pool for replay", () => {
    const run = createRun(0);
    const crate = run.crates.items[0];
    Object.assign(crate, { phase: "falling", x: 10, z: 110, age: 0 });
    run.crates.nextDrop = 100;
    for (let i = 0; i < 240; i++) stepRun(run, 0, 1 / 120);
    expect(crate.phase).toBe("landed");
    for (let i = 0; i < 600; i++) stepRun(run, 0, 1 / 120);
    expect(crate.phase).toBe("inactive");
    expect(createRun(0).crates.items.every((item) => item.phase === "inactive")).toBe(true);
  });
  it("never drops beyond the finish and freezes crates after finishing", () => {
    const run = createRun(0);
    run.z = run.course.finishZ - 2;
    run.crates.nextDrop = 0;
    for (let i = 0; i < 120; i++) stepRun(run, 0, 1 / 120);
    expect(run.crates.items.every((item) => item.phase === "inactive")).toBe(true);
    const snapshot = JSON.stringify(run.crates);
    stepRun(run, 0, 1 / 120);
    expect(JSON.stringify(run.crates)).toBe(snapshot);
  });
});
