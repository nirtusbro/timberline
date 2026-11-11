import { describe, expect, it } from "vitest";
import { createRun, stepRun, COMBO_CAP } from "../src/physics";
import { SLOPE_RAMP, getCourse } from "../src/levels";

describe("precision and pressure", () => {
  it("awards a bullseye bonus only through the middle of a gate", () => {
    const centre = createRun(0, 1),
      edge = createRun(0, 1);
    const gate = centre.course.gates[0];
    centre.x = gate.x;
    edge.x = gate.x + 2.5;
    for (const run of [centre, edge]) {
      run.z = gate.z - 0.1;
      run.speed = 18;
      stepRun(run, 0, 1 / 60);
    }
    expect(centre.hits).toBe(1);
    expect(centre.bullseyes).toBe(1);
    expect(centre.gateBonus).toBe(50);
    expect(centre.score).toBe(150);
    expect(edge.hits).toBe(1);
    expect(edge.bullseyes).toBe(0);
    expect(edge.gateBonus).toBe(0);
    expect(edge.score).toBe(100);
    stepRun(centre, 0, 1 / 60);
    expect(centre.gateBonus).toBe(0);
  });
  it("builds the combo up to ×8", () => {
    expect(COMBO_CAP).toBe(8);
    const run = createRun(12, 1);
    const gates = run.course.gates;
    for (let i = 0; i < 10; i++) {
      run.x = gates[i].x;
      run.z = gates[i].z - 0.1;
      run.speed = 18;
      run.heading = 0;
      run.nextGate = i;
      stepRun(run, 0, 1 / 60);
    }
    expect(run.hits).toBe(10);
    expect(run.combo).toBe(8);
  });
  it("tightens the gates within a level and steepens the slope toward the finish", () => {
    const course = getCourse(3);
    const last = course.gates[course.gates.length - 1];
    expect(last.width).toBeLessThan(course.gates[0].width * 0.9);
    expect(last.width).toBeGreaterThan(course.gates[0].width * 0.7);
    expect(SLOPE_RAMP).toBeGreaterThan(0.05);
    const early = createRun(3, 1),
      late = createRun(3, 1);
    for (const run of [early, late]) run.course = { ...run.course, hazards: [] };
    // Same phase of the gentle undulation so only the ramp differs.
    late.z = (2 * Math.PI) / 0.015;
    for (let i = 0; i < 600; i++) {
      stepRun(early, 0, 1 / 120);
      stepRun(late, 0, 1 / 120);
    }
    expect(late.speed).toBeGreaterThan(early.speed * 1.025);
  });
});
