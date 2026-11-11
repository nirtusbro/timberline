import { describe, expect, it } from "vitest";
import { createRun, stepRun } from "../src/physics";
import { finishTimeBonus } from "../src/scoring";

describe("finish time scoring", () => {
  it("awards 50 points per second under par, never negative", () => {
    expect(finishTimeBonus(30)).toBe(3000);
    expect(finishTimeBonus(40.5)).toBe(2475);
    expect(finishTimeBonus(90)).toBe(0);
    expect(finishTimeBonus(120)).toBe(0);
    expect(finishTimeBonus(20, 32)).toBe(600);
    expect(finishTimeBonus(35, 32)).toBe(0);
    expect(finishTimeBonus(20, 32, 250)).toBe(3000);
  });
  it("adds the bonus once at the finish against the level's par and retains run points", () => {
    const run = createRun(0);
    const par = run.course.parTime;
    run.nextGate = run.course.gates.length;
    run.z = run.course.finishZ - 0.001;
    run.time = par - 10.01;
    run.score = 1200;
    stepRun(run, 0, 0.01);
    expect(run.timeBonus).toBe(500);
    expect(run.score).toBe(1700);
    stepRun(run, 0, 0.01);
    expect(run.score).toBe(1700);
    expect(createRun(0).timeBonus).toBe(0);
  });
  it("awards no time points before finishing", () => {
    const run = createRun(0);
    for (let i = 0; i < 60; i++) stepRun(run, 0, 1 / 120);
    expect(run.timeBonus).toBe(0);
    expect(run.score).toBe(0);
  });
});
