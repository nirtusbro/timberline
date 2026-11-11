import { describe, expect, it } from "vitest";
import {
  LEVEL_COUNT,
  LEVEL_DESIGNS,
  SLOPE_LEVELS,
  SPEED_SCALE,
  getCourse,
  lateralReach,
  type LevelDesign,
} from "../src/levels";
import { bankHeight, createRun } from "../src/physics";
import { drive } from "./helpers";

/**
 * What a stretch asks of the skier, as a name: the shape of snow on it, or
 * the rock feature that ends it, or a flick, or nothing at all.
 */
function stretchFeature(design: LevelDesign, index: number) {
  const slope = design.slopes.find(([i]) => i === index);
  if (slope) return slope[2] ?? "camber";
  if (design.rockGates.includes(index)) return "rockGate";
  if (design.weaves.includes(index)) return "weave";
  if (design.lineRocks.includes(index)) return "lineRock";
  if (design.wideRocks.includes(index)) return "wideRock";
  const gap = design.gates[index + 1]?.[1] ?? 60;
  return gap <= 32 ? "flick" : "plain";
}
/** A read of a level's design: what is in it, how it flows, how much it asks. */
export function analyse(level: number) {
  const design = LEVEL_DESIGNS[level],
    course = getCourse(level);
  const features = course.stretches.map((s) => stretchFeature(design, s.index));
  // The longest run of consecutive stretches asking the same thing.
  let longestRun = 1,
    run = 1;
  for (let i = 1; i < features.length; i++) {
    run = features[i] === features[i - 1] ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  }
  // The longest run of the same shape of snow, ignoring flat stretches between.
  const shapes = course.slopes.map((s) => s.kind);
  let longestShapeRun = shapes.length ? 1 : 0;
  run = 1;
  for (let i = 1; i < shapes.length; i++) {
    run = shapes[i] === shapes[i - 1] ? run + 1 : 1;
    longestShapeRun = Math.max(longestShapeRun, run);
  }
  // How much of the skier's reach each stretch takes: the sideways move it
  // asks against the sideways distance full steering could cover over it.
  const speed = design.speed * SPEED_SCALE;
  const demands = course.gates.slice(0, -1).map((gate, i) => {
    const next = course.gates[i + 1];
    return Math.abs(next.x - gate.x) / lateralReach(next.z - gate.z, speed, design.turnAngle);
  });
  const gaps = course.gates.slice(1).map((g, i) => g.z - course.gates[i].z);
  const swings = course.gates.slice(1).map((g, i) => Math.abs(g.x - course.gates[i].x));
  // The steepest the snow rises along the run on the lines a skier uses (the
  // centre and the gate lines), sampled every metre: a wall here is felt as a
  // jolt and cannot be read from the approach.
  let steepest = 0;
  for (const slope of course.slopes)
    for (const x of [-9.5, -6, 0, 6, 9.5])
      for (let z = slope.from - 2; z <= slope.to + 2; z++)
        steepest = Math.max(steepest, Math.abs(bankHeight(course, x, z + 0.5) - bankHeight(course, x, z - 0.5)));
  const run_ = createRun(level);
  const sweep = drive(run_);
  return {
    level: level + 1,
    name: design.name,
    gates: course.gates.length,
    length: course.finishZ,
    hazards: course.hazards.length,
    bands: course.slopes.length,
    kinds: [...new Set(features)].filter((f) => f !== "plain"),
    shapes: [...new Set(shapes)],
    longestRun,
    longestShapeRun,
    flicks: gaps.filter((g) => g <= 32).length,
    hairpins: swings.filter((s) => s >= 14).length,
    longStretches: gaps.filter((g) => g >= 50).length,
    distinctGaps: new Set(gaps).size,
    meanDemand: demands.reduce((a, b) => a + b, 0) / demands.length,
    maxDemand: Math.max(...demands),
    steepest,
    margin: sweep.worstMargin,
    crashes: sweep.crashes,
    passed: run_.passed,
    time: run_.time,
  };
}

describe("north-face level design", () => {
  const reads = Array.from({ length: LEVEL_COUNT - SLOPE_LEVELS }, (_, i) => analyse(SLOPE_LEVELS + i));
  it("prints a design report for reading", () => {
    const lines = reads.map(
      (r) =>
        `${r.level} ${r.name.padEnd(15)} gates ${r.gates} len ${r.length} rocks ${String(r.hazards).padStart(2)} bands ${String(r.bands).padStart(2)} ` +
        `shapes ${r.shapes.join("/").padEnd(30)} kinds ${r.kinds.length} run ${r.longestRun}/${r.longestShapeRun} ` +
        `flicks ${r.flicks} hairpins ${r.hairpins} long ${r.longStretches} gaps ${r.distinctGaps} ` +
        `demand ${r.meanDemand.toFixed(2)}/${r.maxDemand.toFixed(2)} steepest ${r.steepest.toFixed(2)} margin ${r.margin.toFixed(2)} crashes ${r.crashes} ${r.passed ? "pass" : "FAIL"} ${r.time.toFixed(1)}s`,
    );
    console.info(lines.join("\n"));
  });
  it("mixes at least four kinds of challenge on every level and never repeats one more than four times running", () => {
    // Four in a row is a staircase of line rocks; anything longer is a drill, not a level.
    for (const r of reads) {
      expect(r.kinds.length, `${r.name}: ${r.kinds.join(", ")}`).toBeGreaterThanOrEqual(4);
      expect(r.longestRun, `${r.name} repeats a feature ${r.longestRun} times running`).toBeLessThanOrEqual(4);
    }
    // Across the ladder, most levels mix shapes of snow; a single-shape level is the exception, not the rule.
    expect(reads.filter((r) => r.shapes.length >= 3).length).toBeGreaterThanOrEqual(8);
  });
  it("changes rhythm on every level: quick flicks, long stretches, at least one hairpin, several spacings", () => {
    for (const r of reads) {
      expect(r.flicks, `${r.name} flicks`).toBeGreaterThanOrEqual(2);
      expect(r.longStretches, `${r.name} long stretches`).toBeGreaterThanOrEqual(3);
      expect(r.hairpins, `${r.name} hairpins`).toBeGreaterThanOrEqual(1);
      expect(r.distinctGaps, `${r.name} spacings`).toBeGreaterThanOrEqual(3);
    }
  });
  it("asks a lot of the skier everywhere: these levels come after thirty others", () => {
    for (const r of reads) {
      // Reach is huge at these speeds, so even a hairpin takes under half of it;
      // the rocks and the snow are what make the stretches hard. These floors
      // catch a level that has gone soft on swings, not one that is merely long.
      expect(r.meanDemand, `${r.name} mean demand`).toBeGreaterThanOrEqual(0.18);
      expect(r.maxDemand, `${r.name} max demand`).toBeGreaterThanOrEqual(0.25);
      expect(r.hazards, `${r.name} rocks`).toBeGreaterThanOrEqual(10);
      expect(r.bands, `${r.name} bands`).toBeGreaterThanOrEqual(10);
      // No shape of snow rises steeper than about 19° along the run: steeper
      // reads as a wall, jolts the ride and cannot be seen coming.
      expect(r.steepest, `${r.name} steepest rise`).toBeLessThanOrEqual(0.35);
      // Passable with care, never comfortable: the sweep's worst gate margin stays under 1.4 m.
      expect(r.passed, `${r.name} passable`).toBe(true);
      expect(r.crashes, `${r.name} tumbles`).toBe(0);
      expect(r.margin, `${r.name} worst margin`).toBeGreaterThan(0.15);
      expect(r.margin, `${r.name} too easy`).toBeLessThan(1.4);
    }
  });
});
