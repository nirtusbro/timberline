import { describe, expect, it } from "vitest";
import { createRun, stepRun } from "../src/physics";
import {
  FORK_ROCK_RADIUS,
  GUARD_TREE_RADIUS,
  LEVEL_COUNT,
  getCourse,
  levelSettings,
} from "../src/levels";

describe("course hazards", () => {
  it("puts a fork rock on the direct line beside every authored token once rocks begin", () => {
    let forks = 0;
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level);
      for (const spot of c.tokens) {
        const stretch = c.stretches[spot.stretch];
        const rock = c.hazards.find(
          (h) => h.kind === "rock" && h.radius === FORK_ROCK_RADIUS && h.z === spot.z,
        );
        if (!levelSettings(level).forkRocks) expect(rock).toBeUndefined();
        else {
          forks++;
          expect(rock).toBeDefined();
          expect(Math.abs(rock!.x - stretch.lineX)).toBeLessThan(0.06);
          expect(Math.abs(spot.x - rock!.x)).toBeGreaterThanOrEqual(4.4);
        }
      }
    }
    expect(forks).toBeGreaterThan(60);
  });
  it("guards some tokens with a tree on the token side, never in the approach", () => {
    let trees = 0;
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level);
      for (const tree of c.hazards.filter((h) => h.kind === "tree")) {
        trees++;
        expect(tree.radius).toBe(GUARD_TREE_RADIUS);
        const spot = c.tokens.find(
          (s) => tree.z < s.z && tree.z >= s.z - 8.01 && Math.abs(tree.x - s.x) < 4,
        )!;
        expect(spot).toBeDefined();
        expect(Math.abs(tree.x - spot.x)).toBeGreaterThan(2.5);
        expect(tree.z).toBeGreaterThanOrEqual(c.gates[spot.stretch].z + 12);
        expect(tree.z).toBeLessThanOrEqual(spot.z - 3);
      }
      if (level < 3) expect(c.hazards.some((h) => h.kind === "tree")).toBe(false);
    }
    expect(trees).toBeGreaterThan(3);
  });
  it("adds more wide rocks as levels rise", () => {
    const rocks = (from: number, to: number) => {
      let total = 0;
      for (let level = from; level < to; level++)
        total += getCourse(level).hazards.filter((h) => h.kind === "rock").length;
      return total;
    };
    expect(rocks(0, 4)).toBeLessThan(rocks(8, 12));
    expect(rocks(0, 4)).toBeLessThan(rocks(16, 20));
  });
  it("tumbles on a fork rock, breaks the combo and recovers", () => {
    const run = createRun(10);
    const rock = run.course.hazards.find((h) => h.radius === FORK_ROCK_RADIUS)!;
    run.x = rock.x;
    run.z = rock.z - 0.2;
    run.speed = 20;
    run.combo = 5;
    run.nextGate = run.course.gates.findIndex((gate) => gate.z > rock.z);
    stepRun(run, 0, 1 / 60);
    expect(run.event).toBe("crash");
    expect(run.combo).toBe(0);
    for (let i = 0; i < 180; i++) stepRun(run, 0, 1 / 60);
    expect(run.crashTime).toBe(0);
    expect(run.finished).toBe(false);
  });
  it("keeps crate landings clear of hazards", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const run = createRun(10 + (seed % 10), seed);
      const landings = new Set<string>();
      for (let i = 0; i < 120 * 90 && !run.finished; i++) {
        stepRun(run, 0, 1 / 120);
        for (const crate of run.crates.items)
          if (crate.phase !== "inactive") landings.add(`${crate.x},${crate.z}`);
      }
      expect(landings.size).toBeGreaterThan(0);
      for (const key of landings) {
        const [x, z] = key.split(",").map(Number);
        for (const hazard of run.course.hazards)
          expect(Math.abs(hazard.z - z) >= 6 || Math.abs(hazard.x - x) >= 4).toBe(true);
      }
    }
  });
});
