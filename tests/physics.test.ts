import { describe, expect, it } from "vitest";
import {
  createRun,
  stepRun,
  OBSTACLES,
  starsFor,
  type Run,
} from "../src/physics";
import { drive } from "./helpers";

function advance(run: Run, seconds: number, input = 0, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt);
  return run;
}
const clear = (run: Run) => {
  run.course = { ...run.course, hazards: [] };
  return run;
};

describe("skiing", () => {
  it("accelerates downhill and travels through the world", () => {
    const s = advance(clear(createRun(0)), 3);
    expect(s.z).toBeGreaterThan(25);
    expect(s.speed).toBeGreaterThan(12);
    expect(s.x).toBe(0);
  });
  it("steering changes heading progressively, not character position instantly", () => {
    const s = clear(createRun(0));
    stepRun(s, 1, 1 / 60);
    expect(s.heading).toBeGreaterThan(0);
    expect(s.heading).toBeLessThan(0.1);
    expect(s.x).toBeLessThan(0.1);
    advance(s, 1, 1);
    expect(s.x).toBeGreaterThan(2);
  });
  it("hard carving costs speed and releasing returns to downhill", () => {
    const straight = advance(clear(createRun(0)), 2);
    const turn = advance(clear(createRun(0)), 2, 0.7);
    expect(turn.speed).toBeLessThan(straight.speed);
    const heading = turn.heading;
    advance(turn, 1, 0);
    expect(Math.abs(turn.heading)).toBeLessThan(heading * 0.25);
  });
  it("has comparable trajectories at 30 and 120 simulation steps per second", () => {
    const slow = advance(clear(createRun(0)), 1.5, 0.25, 1 / 30);
    const fast = advance(clear(createRun(0)), 1.5, 0.25, 1 / 120);
    expect(Math.abs(slow.z - fast.z)).toBeLessThan(0.3);
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(0.15);
  });
  it("awards each crossed gate only once and builds combo", () => {
    const s = createRun(0);
    const gates = s.course.gates;
    for (let i = 0; i < 4; i++) {
      s.x = gates[i].x;
      s.z = gates[i].z - 0.1;
      s.speed = 18;
      s.heading = 0;
      stepRun(s, 0, 1 / 60);
    }
    expect(s.hits).toBe(4);
    expect(s.combo).toBe(4);
    expect(s.bullseyes).toBe(4);
    expect(s.bullseyeGates).toEqual([0, 1, 2, 3]);
    expect(s.score).toBe(1200);
    stepRun(s, 0, 1 / 60);
    expect(s.score).toBe(1200);
  });
  it("missing a gate breaks combo but the run continues", () => {
    const s = createRun(0);
    const gate = s.course.gates[0];
    s.combo = 3;
    s.x = gate.x + 8;
    s.z = gate.z - 0.1;
    s.speed = 18;
    stepRun(s, 0, 1 / 60);
    expect(s.combo).toBe(0);
    expect(s.nextGate).toBe(1);
    expect(s.finished).toBe(false);
  });
  it("automatically recovers after a boundary crash", () => {
    const s = createRun(0);
    s.x = 22;
    stepRun(s, 0, 1 / 60);
    expect(s.crashTime).toBeGreaterThan(0);
    advance(s, 2);
    expect(s.crashTime).toBe(0);
    expect(Math.abs(s.x)).toBeLessThan(18);
    expect(s.speed).toBeGreaterThan(4);
  });
  it("finishes, freezes the timer and awards stars by score", () => {
    const s = createRun(0);
    s.nextGate = s.course.gates.length;
    s.z = s.course.finishZ - 0.1;
    s.speed = 18;
    s.time = s.course.parTime + 5;
    stepRun(s, 0, 1 / 60);
    expect(s.finished).toBe(true);
    expect(s.stars).toBe(0);
    expect(s.passed).toBe(false);
    expect(s.timeBonus).toBe(0);
    const time = s.time;
    advance(s, 1);
    expect(s.time).toBe(time);
    const [one, two, three] = s.course.starScores;
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    expect(three).toBeLessThanOrEqual(s.course.maxGateScore);
    expect(s.course.powers.some((p) => p.kind === "double")).toBe(false);
    for (const [score, stars] of [[one - 50, 0], [one, 1], [two - 50, 1], [two, 2], [three, 3], [three * 2, 3]]) {
      const run = createRun(0);
      run.nextGate = run.course.gates.length;
      run.z = run.course.finishZ - 0.1;
      run.score = score;
      run.time = run.course.parTime + 5;
      stepRun(run, 0, 1 / 60);
      expect(run.stars).toBe(stars);
      expect(run.passed).toBe(stars > 0);
      expect(starsFor(score, run.course.starScores)).toBe(stars);
    }
  });
  it("passes on score alone: a missed gate costs its points and the combo, not the level", () => {
    const s = createRun(0);
    const gate = s.course.gates[0];
    s.x = gate.x + 8;
    s.z = gate.z - 0.1;
    s.speed = 18;
    s.combo = 4;
    stepRun(s, 0, 1 / 60);
    expect(s.misses).toBe(1);
    expect(s.combo).toBe(0);
    s.nextGate = s.course.gates.length;
    s.z = s.course.finishZ - 0.1;
    s.score = s.course.starScores[1];
    s.time = s.course.parTime + 5;
    stepRun(s, 0, 1 / 60);
    expect(s.finished).toBe(true);
    expect(s.passed).toBe(true);
    expect(s.stars).toBe(2);
  });
  it("charges 300 points for a tumble, never below zero", () => {
    const s = createRun(0);
    s.score = 1000;
    s.x = 22;
    stepRun(s, 0, 1 / 60);
    expect(s.crashes).toBe(1);
    expect(s.score).toBe(700);
    const broke = createRun(0);
    broke.x = 22;
    stepRun(broke, 0, 1 / 60);
    expect(broke.score).toBe(0);
  });
  it("colliding with an edge rock triggers a recoverable tumble", () => {
    const rock = OBSTACLES.find((o) => o.kind === "rock")!;
    const s = createRun(0);
    s.x = rock.x;
    s.z = rock.z - 0.1;
    s.speed = 15;
    s.nextGate = s.course.gates.findIndex((g) => g.z > rock.z);
    stepRun(s, 0, 1 / 60);
    expect(s.event).toBe("crash");
    advance(s, 2);
    expect(s.crashTime).toBe(0);
    expect(s.finished).toBe(false);
  });
  it("allows every gate to be reached by steering within the normal input range", () => {
    for (const level of [0, 5, 10, 15, 19]) {
      const s = createRun(level, 42);
      const { crashes } = drive(s);
      expect(s.finished).toBe(true);
      expect(crashes).toBe(0);
      expect(s.hits).toBe(s.course.gates.length);
      expect(s.tokenCount).toBe(s.course.tokens.length);
      // Every gate in an unbroken combo; the rest of the score is itemised beside it.
      expect(s.points.gates).toBe(s.course.maxGateScore);
      expect(s.points.bullseyes).toBe(s.bullseyes * 50);
      const p = s.points;
      expect(s.score).toBe(p.gates + p.bullseyes + p.coins + p.air + p.close + p.crates + p.double + p.twist + p.time);
      expect(s.time).toBeGreaterThan(15);
      expect(s.time).toBeLessThan(45);
    }
  });
  it("does not punish missed gates with a forced restart", () => {
    const s = advance(createRun(12), 110);
    expect(s.finished).toBe(true);
    expect(s.hits).toBeLessThan(s.course.gates.length);
    expect(s.time).toBeGreaterThan(20);
    expect(s.time).toBeLessThan(90);
  });
  it("keeps collision feedback when a tumble also crosses a missed gate", () => {
    const s = createRun(0);
    const gate = s.course.gates[3];
    s.x = 22;
    s.z = gate.z - 0.1;
    s.nextGate = 3;
    s.speed = 18;
    stepRun(s, 0, 1 / 60);
    expect(s.crashTime).toBeGreaterThan(0);
    expect(s.nextGate).toBe(4);
    expect(s.event).toBe("crash");
  });
});
