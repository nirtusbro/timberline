import { describe, expect, it } from "vitest";
import { TOKEN_COINS, createRun, stepRun } from "../src/physics";
import { getCourse, LEVEL_COUNT, MAX_TOKENS, TOKEN_LEVELS } from "../src/levels";

describe("gold tokens", () => {
  it("leaves clear skiing space between each gate and its optional bonus", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level);
      // Four tokens a level on the first two mountains; the rock mountains have none.
      expect(c.tokens.length).toBe(level < TOKEN_LEVELS ? MAX_TOKENS : 0);
      for (const token of c.tokens) {
        expect(token.z).toBeGreaterThanOrEqual(c.gates[token.stretch].z + 14);
        expect(token.z).toBeLessThan((c.gates[token.stretch + 1]?.z ?? c.finishZ) - 15);
        expect(Math.abs(token.x)).toBeLessThan(17);
      }
      const stretches = c.tokens.map((s) => s.stretch);
      expect(new Set(stretches).size).toBe(stretches.length);
      expect([...stretches].sort((a, b) => a - b)).toEqual(stretches);
    }
  });
  it("does not award a pickup just for approaching the center of a gate", () => {
    const s = createRun(0);
    s.x = s.course.gates[0].x;
    s.z = s.course.gates[0].z - 4.2;
    s.speed = 18;
    stepRun(s, 0, 1 / 60);
    expect(s.tokenCount).toBe(0);
  });
  it("collects a token on its line once, for coins and no points", () => {
    for (const level of [0, 9, 19]) {
      const s = createRun(level);
      const token = s.course.tokens[0];
      s.x = token.x;
      s.z = token.z - 0.2;
      s.nextGate = s.course.gates.findIndex((gate) => gate.z > token.z);
      s.speed = 18;
      stepRun(s, 0, 1 / 60);
      expect(s.tokenCount).toBe(1);
      expect(s.tokens[0]).toBe(true);
      expect(s.coins).toBe(TOKEN_COINS);
      expect(s.score).toBe(0);
      expect(s.tokenEvent).toBe(0);
      stepRun(s, 0, 1 / 60);
      expect(s.tokenCount).toBe(1);
      expect(s.coins).toBe(TOKEN_COINS);
      expect(s.score).toBe(0);
      expect(s.tokenEvent).toBe(-1);
    }
  });
  it("does not collect a pickup when passing wide of it", () => {
    const s = createRun(0);
    const token = s.course.tokens[0];
    s.x = token.x + token.side * 3;
    s.z = token.z - 0.2;
    s.nextGate = s.course.gates.findIndex((gate) => gate.z > token.z);
    s.speed = 18;
    stepRun(s, 0, 1 / 60);
    expect(s.tokenCount).toBe(0);
    expect(s.score).toBe(0);
  });
  it("does not collect during a tumble", () => {
    const s = createRun(0);
    const token = s.course.tokens[0];
    s.x = token.x;
    s.z = token.z - 0.2;
    s.nextGate = s.course.gates.findIndex((gate) => gate.z > token.z);
    s.crashTime = 0.5;
    stepRun(s, 0, 1 / 60);
    expect(s.tokenCount).toBe(0);
  });
  it("starts each replay with every pickup available again", () => {
    const s = createRun(0);
    const token = s.course.tokens[0];
    s.x = token.x;
    s.z = token.z - 0.2;
    s.nextGate = s.course.gates.findIndex((gate) => gate.z > token.z);
    stepRun(s, 0, 1 / 60);
    const replay = createRun(0);
    expect(replay.tokenCount).toBe(0);
    expect(replay.tokens.some(Boolean)).toBe(false);
    expect(s.tokens[0]).toBe(true);
  });
});
