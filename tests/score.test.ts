import { describe, expect, it } from "vitest";
import { AIR_POINTS, COIN_POINTS, DOUBLE_TIME, RIVAL_POINTS } from "../src/extras";
import { TOP_PACE, getCourse } from "../src/levels";
import { BULLSEYE_POINTS, ESCAPE_POINTS_PER_METRE, createRun, grantPower, starsFor, stepRun, trailPace } from "../src/physics";
import { finishTimeBonus } from "../src/scoring";
import { ALL_LEVELS, DT, bareCourse, coast, put, ski, startOn, zoneOn } from "./helpers";

/** Stands a run of a level just short of the line, every gate behind it, at a given time on the clock. */
function nearTheLine(level: number, time: number) {
  const run = createRun(level, 1);
  run.crates.nextDrop = Infinity;
  put(run, run.course.finishS - 0.2);
  run.nextGate = run.course.gates.length;
  run.time = time;
  run.speed = 24;
  return run;
}

describe("the time bonus", () => {
  it("pays for every second under par, at the level's rate, and never takes anything away", () => {
    expect(finishTimeBonus(30)).toBe(3000);
    expect(finishTimeBonus(40.5)).toBe(2475);
    expect(finishTimeBonus(90)).toBe(0);
    expect(finishTimeBonus(120)).toBe(0);
    expect(finishTimeBonus(20, 32)).toBe(600);
    expect(finishTimeBonus(35, 32)).toBe(0);
    expect(finishTimeBonus(20, 32, 250)).toBe(3000);
  });
  it("is added once, at the line, on top of what the run already earned", () => {
    const c = getCourse(0);
    const run = nearTheLine(0, c.parTime - 8);
    run.score = 1200;
    coast(run, 0.1);
    expect(run.finished).toBe(true);
    expect(run.timeBonus).toBe(finishTimeBonus(run.time, c.parTime, c.timeBonusRate));
    expect(run.timeBonus).toBeGreaterThan(7.9 * c.timeBonusRate);
    expect(run.score).toBe(1200 + run.timeBonus);
    expect(run.points.time).toBe(run.timeBonus);
    coast(run, 1);
    expect(run.score).toBe(1200 + run.timeBonus);
    expect(createRun(0, 1).timeBonus).toBe(0);
  });
  it("is nothing until the line is crossed, and nothing for a run over par", () => {
    const run = createRun(0, 1);
    run.crates.nextDrop = Infinity;
    coast(run, 0.5);
    expect(run.timeBonus).toBe(0);
    expect(run.score).toBe(0);
    const slow = nearTheLine(0, getCourse(0).parTime + 3);
    coast(slow, 0.1);
    expect(slow.finished).toBe(true);
    expect(slow.timeBonus).toBe(0);
  });
  it("sets every level a par that a clean run beats and a slow one does not", () => {
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      // Par is the time to follow the trail at the pace the trail gives, and a little: slower where it runs across the hill.
      let follow = 0;
      for (let s = 0; s < c.finishS; s += 2) follow += 2 / trailPace(c, s);
      expect(c.parTime / follow, c.name).toBeGreaterThan(0.97);
      expect(c.parTime / follow, c.name).toBeLessThan(1.4);
      // Never less than skiing its length flat out down the fall line would take.
      expect(c.parTime, c.name).toBeGreaterThan(c.finishS / (c.speed * TOP_PACE * 1.2));
      expect(c.timeBonusRate).toBeGreaterThan(0);
    }
    // The sprint levels pay far more for speed than the rest.
    const rates = ALL_LEVELS.map((level) => getCourse(level).timeBonusRate);
    expect(Math.max(...rates)).toBeGreaterThanOrEqual(Math.min(...rates) * 2);
  });
  it("can be won by skiing well: an expert comes in under par on most levels, by seconds, not by half the course", () => {
    const levels = [0, 4, 9, 18, 28, 34];
    const margins = levels.map((level) => {
      const run = ski(createRun(level, level * 1000), "expert", level * 1000);
      expect(run.finished).toBe(true);
      expect(run.timeBonus).toBe(finishTimeBonus(run.time, run.course.parTime, run.course.timeBonusRate));
      return run.course.parTime - run.time;
    });
    expect(margins.filter((margin) => margin > 0).length).toBeGreaterThanOrEqual(3);
    for (const margin of margins) expect(margin).toBeLessThan(15);
  });
});

describe("the tally", () => {
  it("counts stars against the three scores of the course", () => {
    expect(starsFor(0, [100, 200, 300])).toBe(0);
    expect(starsFor(99, [100, 200, 300])).toBe(0);
    expect(starsFor(100, [100, 200, 300])).toBe(1);
    expect(starsFor(250, [100, 200, 300])).toBe(2);
    expect(starsFor(300, [100, 200, 300])).toBe(3);
    // The endless course has no stars to win.
    expect(starsFor(99999, [0, 0, 0])).toBe(0);
  });
  it("keeps what each kind of thing paid, and adds up to the score", () => {
    for (const level of [3, 11, 25]) {
      const run = ski(createRun(level, 77), "expert", 77);
      const p = run.points;
      // Tumbles take points off the score but not off the record of what was earned.
      const earned = p.gates + p.bullseyes + p.coins + p.air + p.close + p.crates + p.double + p.twist + p.time;
      expect(run.score).toBeLessThanOrEqual(earned);
      if (run.crashes === 0) expect(run.score).toBe(earned);
      expect(p.gates).toBeGreaterThan(0);
      expect(p.bullseyes).toBe(run.bullseyes * BULLSEYE_POINTS);
      expect(p.coins).toBe(run.coinCount * COIN_POINTS);
      expect(p.air).toBe(run.jumps * AIR_POINTS);
      expect(run.jumps).toBeGreaterThan(0);
    }
  });
  it("doubles what is earned while a Double runs, and nothing after", () => {
    const course = () =>
      bareCourse({
        gates: [
          [300, 0],
          [600, 0],
        ],
      });
    const run = put(startOn(course()), 299.7, 2.5);
    grantPower(run, "double");
    coast(run, 0.1);
    expect(run.score).toBe(200);
    expect(run.points.gates).toBe(100);
    expect(run.points.double).toBe(100);
    run.double = 0;
    put(run, 599.7, 2.5);
    coast(run, 0.1);
    expect(run.score).toBe(200 + 200);
    expect(DOUBLE_TIME).toBeGreaterThan(3);
  });
  it("pays for landing a jump off a kicker", () => {
    const run = put(startOn(bareCourse({ zones: (trail) => [zoneOn(trail, "ramp", 300, 7, 0, 3)] })), 290);
    run.speed = 26;
    let launched = false;
    for (let i = 0; i < 240; i++) {
      stepRun(run, 0, DT);
      launched ||= run.airborne;
    }
    expect(launched).toBe(true);
    expect(run.airborne).toBe(false);
    expect(run.jumps).toBe(1);
    expect(run.score).toBe(AIR_POINTS);
    // Wide of the kicker there is no jump.
    const wide = put(startOn(bareCourse({ zones: (trail) => [zoneOn(trail, "ramp", 300, 7, 0, 3)] })), 290, 6);
    wide.speed = 26;
    coast(wide, 2);
    expect(wide.jumps).toBe(0);
  });
  it("pays a thousand for beating the fox, and for every metre kept ahead of the avalanche", () => {
    const race = nearTheLine(7, 500);
    coast(race, 0.1);
    expect(race.rivalBeaten).toBe(true);
    expect(race.points.twist).toBe(RIVAL_POINTS);
    const boss = nearTheLine(31, 500);
    boss.avalancheS = boss.s - 30;
    coast(boss, 0.1);
    expect(boss.finished).toBe(true);
    expect(boss.caught).toBe(false);
    expect(boss.points.twist).toBeGreaterThanOrEqual(25 * ESCAPE_POINTS_PER_METRE);
    expect(boss.points.twist).toBeLessThanOrEqual(35 * ESCAPE_POINTS_PER_METRE);
    const close = nearTheLine(31, 500);
    close.avalancheS = close.s - 6;
    coast(close, 0.1);
    expect(close.points.twist).toBeLessThan(boss.points.twist);
  });
});
