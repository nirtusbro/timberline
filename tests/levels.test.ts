import { describe, expect, it } from "vitest";
import {
  LEVEL_COUNT,
  LEVEL_DESIGNS,
  MAX_GATES,
  MAX_COURSE_LENGTH,
  MAX_TOKENS,
  TOKEN_LEVELS,
  SLIP_ACCEL,
  SLIP_GRIP,
  SLOPE_EASE,
  SLOPE_KINDS,
  SLOPE_LEVELS,
  SLOPE_MARGIN,
  SLOPE_ROCK_GAP,
  WORLDS,
  WORLD_COUNT,
  WORLD_SIZE,
  buildCourse,
  getCourse,
  hazardPoolSizes,
  levelSettings,
  slopeTilt,
  worldOf,
} from "../src/levels";
import { BULLSEYE_COINS, TOKEN_COINS, createRun, driftAhead, stepRun } from "../src/physics";
import { CRATE_COINS, CRATE_POINTS } from "../src/crates";
import { drive } from "./helpers";

const authored = (level: number) => LEVEL_DESIGNS[level].tokens;
/** The least room a relaxed line leaves inside any flag, now that bullseyes add speed. */
const MARGIN = 0.15;

describe("forty hand-placed levels on four mountains", () => {
  it("groups the levels into mountains of ten that open with stars", () => {
    expect(WORLD_COUNT * WORLD_SIZE).toBe(LEVEL_COUNT);
    expect(new Set(WORLDS.map((w) => w.name)).size).toBe(WORLD_COUNT);
    expect(WORLDS[0].starsToUnlock).toBe(0);
    for (let w = 1; w < WORLD_COUNT; w++) {
      expect(WORLDS[w].starsToUnlock).toBeGreaterThan(WORLDS[w - 1].starsToUnlock);
      // One star a level on the mountains before is never enough, three always is.
      expect(WORLDS[w].starsToUnlock).toBeGreaterThan(w * WORLD_SIZE);
      expect(WORLDS[w].starsToUnlock).toBeLessThanOrEqual(w * WORLD_SIZE * 2);
    }
    expect(worldOf(0)).toBe(0);
    expect(worldOf(WORLD_SIZE)).toBe(1);
    expect(worldOf(LEVEL_COUNT - 1)).toBe(WORLD_COUNT - 1);
    expect(worldOf(SLOPE_LEVELS)).toBe(WORLD_COUNT - 1);
  });
  it("builds forty fixed courses, each with its own name, gold and star scores", () => {
    const layouts = new Set<string>();
    expect(LEVEL_DESIGNS).toHaveLength(LEVEL_COUNT);
    expect(new Set(LEVEL_DESIGNS.map((d) => d.name)).size).toBe(LEVEL_COUNT);
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const course = getCourse(level),
        design = LEVEL_DESIGNS[level];
      expect(course.level).toBe(level);
      expect(course.name).toBe(design.name);
      expect(course.hint.length).toBeGreaterThan(10);
      expect(course.hint).not.toMatch(/lamp|present|birthday/i);
      expect(course.tokens.length).toBe(level < TOKEN_LEVELS ? MAX_TOKENS : 0);
      const [one, two, three] = course.starScores;
      expect(one).toBeGreaterThan(0);
      expect(two).toBeGreaterThan(one);
      expect(three).toBeGreaterThan(two);
      // Three stars never ask for more than every gate, plus a share of what a Double on the course adds.
      if (!course.powers.some((p) => p.kind === "double")) expect(three).toBeLessThanOrEqual(course.maxGateScore);
      expect(three).toBeLessThanOrEqual(course.maxGateScore * 1.35);
      for (const score of course.starScores) expect(score % 50).toBe(0);
      if (design.fillRocks) {
        // The rock mountains: a rock (or, on the north face, a bank) in every stretch.
        expect(course.hazards.length + course.slopes.length).toBeGreaterThanOrEqual(course.gates.length - 1);
        for (const s of course.stretches)
          if (s.index < course.stretches.length - 1)
            expect(
              course.hazards.some((h) => h.z > course.gates[s.index].z && h.z < course.gates[s.index].z + s.length) ||
                course.slopes.some((slope) => slope.stretch === s.index) ||
                // Ice and anything that moves have their stretch to themselves.
                design.ice.includes(s.index) ||
                design.movers.some(([index]) => index === s.index),
            ).toBe(true);
      }
      expect(course).toEqual(buildCourse(level));
      expect(course.gates.length).toBe(design.gates.length);
      expect(course.gates.length).toBeLessThanOrEqual(MAX_GATES);
      expect(course.finishZ).toBeLessThanOrEqual(MAX_COURSE_LENGTH);
      layouts.add(course.gates.map((g) => `${g.x},${g.z}`).join(";"));
      for (let i = 1; i < course.gates.length; i++) {
        const gap = course.gates[i].z - course.gates[i - 1].z;
        expect(gap).toBeGreaterThanOrEqual(30);
        expect(gap).toBeLessThanOrEqual(60);
      }
      for (const gate of course.gates) {
        expect(Math.abs(gate.x)).toBeLessThanOrEqual(9.5);
        expect(gate.width).toBeGreaterThanOrEqual(4.2);
      }
      // No stretch carries more than one feature; a slope may share its stretch with a rock gate only.
      const used = [...authored(level), ...design.weaves, ...design.rockGates, ...design.wideRocks, ...design.lineRocks];
      expect(new Set(used).size).toBe(used.length);
      for (const index of used) expect(index).toBeLessThan(course.gates.length);
      const sloped = design.slopes.map(([index]) => index);
      expect(new Set(sloped).size).toBe(sloped.length);
      const withRocks = new Set([...authored(level), ...design.weaves, ...design.wideRocks, ...design.lineRocks]);
      for (const index of sloped) {
        expect(index).toBeLessThan(course.gates.length);
        expect(withRocks.has(index)).toBe(false);
      }
    }
    expect(layouts.size).toBe(LEVEL_COUNT);
    expect(getCourse(-5)).toBe(getCourse(0));
    expect(getCourse(500)).toBe(getCourse(LEVEL_COUNT - 1));
  });
  it("never lets two gates be taken in a straight line unless a rock sits between them", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level),
        design = LEVEL_DESIGNS[level];
      const onLine = new Set([
        ...(design.forkRocks ? authored(level) : []),
        ...design.lineRocks,
        ...design.rockGates,
        ...design.weaves,
      ]);
      for (let i = 0; i + 1 < c.gates.length; i++) {
        const a = c.gates[i],
          b = c.gates[i + 1];
        const overlap = (a.width + b.width) / 2 - Math.abs(b.x - a.x);
        if (overlap > 0) expect(onLine.has(i)).toBe(true);
        expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it("gets harder from the first level to the last", () => {
    for (let level = 1; level < LEVEL_COUNT; level++) {
      const a = levelSettings(level - 1),
        b = levelSettings(level);
      // The last two mountains each restart a little slower than the one before, then climb again.
      if (level !== 2 * WORLD_SIZE && level !== SLOPE_LEVELS) expect(b.speed).toBeGreaterThan(a.speed);
      expect(b.baseWidth).toBeLessThanOrEqual(a.baseWidth + 0.5);
    }
    expect(levelSettings(LEVEL_COUNT - 1).baseWidth).toBeLessThan(levelSettings(0).baseWidth * 0.7);
    const first = getCourse(0),
      last = getCourse(LEVEL_COUNT - 1);
    expect(first.hazards).toHaveLength(0);
    expect(last.hazards.length).toBeGreaterThan(25);
    expect(last.gates.length).toBe(MAX_GATES);
    expect(last.starScores[0]).toBeGreaterThan(first.starScores[2]);
    expect(last.speed).toBeGreaterThan(first.speed * 1.7);
    // The bar for each star rises as a share of the maximum, too.
    for (let i = 0; i < 3; i++)
      expect(last.starScores[i] / last.maxGateScore).toBeGreaterThan(first.starScores[i] / first.maxGateScore);
    expect(LEVEL_DESIGNS.filter((d) => d.weaves.length).length).toBeGreaterThanOrEqual(5);
    expect(LEVEL_DESIGNS.filter((d) => d.rockGates.length).length).toBeGreaterThanOrEqual(10);
    expect(LEVEL_DESIGNS.filter((d) => d.gates.some(([, gap]) => gap < 36)).length).toBeGreaterThanOrEqual(8);
  });
  it("keeps every gate and token reachable, and three stars within reach of a clean run", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level);
      const plain = createRun(level);
      const a = drive(plain);
      expect(plain.finished).toBe(true);
      expect(a.crashes).toBe(0);
      expect(plain.hits).toBe(c.gates.length);
      expect(plain.tokenCount).toBe(c.tokens.length);
      expect(a.worstMargin).toBeGreaterThan(MARGIN);
      expect(plain.points.gates).toBe(c.maxGateScore);
      expect(plain.points.crates).toBe(plain.crates.collected * CRATE_POINTS);
      expect(plain.coins).toBe(
        plain.tokenCount * TOKEN_COINS +
          plain.bullseyes * BULLSEYE_COINS +
          plain.crates.collected * CRATE_COINS +
          plain.coinCount,
      );
      expect(plain.time).toBeGreaterThan(15);
      expect(plain.time).toBeLessThan(45);
      expect(plain.stars).toBe(3);
      expect(plain.passed).toBe(true);
    }
  });
  it("leaves room for mistakes: one missed gate mid-course still clears every level", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const run = createRun(level);
      const c = run.course,
        skip = Math.floor(c.gates.length / 2);
      // Ski for the flags, but go wide of the middle gate.
      let missed = false;
      const original = c.gates[skip];
      for (let tick = 0; tick < 120 * 90 && !run.finished; tick++) {
        if (!missed && run.nextGate === skip && run.z > original.z - 1) {
          run.x = original.x + original.width / 2 + 1.5;
          missed = true;
        }
        const target = c.gates[run.nextGate] ?? { x: 0, z: c.finishZ };
        stepRun(run, Math.max(-1, Math.min(1, (target.x - run.x) * 0.18 - run.heading * 0.8)), 1 / 120);
      }
      expect(run.finished).toBe(true);
      expect(run.misses).toBeGreaterThanOrEqual(1);
      if (run.misses === 1 && run.crashes === 0) expect(run.stars).toBeGreaterThanOrEqual(1);
    }
  });
  it("keeps a straight, un-steered line from earning a star on any level", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const run = createRun(level);
      for (let i = 0; i < 120 * 120 && !run.finished; i++) stepRun(run, 0, 1 / 120);
      expect(run.finished).toBe(true);
      expect(run.stars).toBe(0);
      expect(run.passed).toBe(false);
    }
  });
  it("fixes every element of a level, crate drops included", () => {
    for (const level of [0, 9, 19, 39]) {
      const a = createRun(level),
        b = createRun(level);
      expect(a.crates.seed).toBe(b.crates.seed);
      for (let i = 0; i < 120 * 40 && !a.finished; i++) {
        stepRun(a, 0.1, 1 / 120);
        stepRun(b, 0.1, 1 / 120);
      }
      expect(a.crates.items).toEqual(b.crates.items);
    }
    expect(createRun(0).crates.seed).not.toBe(createRun(1).crates.seed);
  });
  it("reports pool sizes that fit the rockiest level, so every hazard is drawn", () => {
    const pools = hazardPoolSizes();
    let maxRocks = 0;
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const hazards = getCourse(level).hazards;
      const rocks = hazards.filter((h) => h.kind === "rock").length;
      maxRocks = Math.max(maxRocks, rocks);
      expect(rocks).toBeLessThanOrEqual(pools.rocks);
      expect(hazards.filter((h) => h.kind === "tree").length).toBeLessThanOrEqual(pools.trees);
    }
    expect(pools.rocks).toBe(maxRocks);
    expect(pools.rocks).toBeGreaterThan(28);
  });
  it("keeps hazards clear of gate lines and tokens beside a fork rock", () => {
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level);
      for (const hazard of c.hazards)
        for (const gate of c.gates)
          expect(Math.abs(hazard.z - gate.z)).toBeGreaterThanOrEqual(12);
      for (const spot of c.tokens) {
        const stretch = c.stretches[spot.stretch];
        expect(spot.z).toBe(stretch.tokenZ);
        // No rock or tree ever sits on a token.
        for (const hazard of c.hazards)
          expect(Math.hypot(hazard.x - spot.x, hazard.z - spot.z)).toBeGreaterThan(hazard.radius + 1.5);
        expect(Math.abs(spot.x - stretch.lineX)).toBeGreaterThanOrEqual(4.4);
        if (levelSettings(level).forkRocks)
          expect(
            c.hazards.some(
              (h) => h.kind === "rock" && h.z === spot.z && Math.abs(h.x - stretch.lineX) < 0.06,
            ),
          ).toBe(true);
      }
      expect(c.hazards.filter((h) => h.kind === "tree").length).toBe(LEVEL_DESIGNS[level].guards.length);
    }
  });
});

describe("the north face: banked snow", () => {
  it("puts slopes only on the last ten levels, between the gate margins and clear of rocks", () => {
    let bands = 0;
    const kindLevels = new Map<string, number>();
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level),
        design = LEVEL_DESIGNS[level];
      if (level < SLOPE_LEVELS) {
        expect(c.slopes).toHaveLength(0);
        continue;
      }
      expect(c.slopes.length).toBeGreaterThanOrEqual(6);
      expect(c.slopes.map((s) => s.stretch).sort((a, b) => a - b)).toEqual(
        design.slopes.map(([index]) => index).sort((a, b) => a - b),
      );
      for (const slope of c.slopes) {
        bands++;
        const gate = c.gates[slope.stretch],
          next = c.gates[slope.stretch + 1] ?? { z: c.finishZ };
        expect(slope.from).toBe(gate.z + SLOPE_MARGIN);
        expect(slope.to).toBeLessThanOrEqual(next.z - SLOPE_MARGIN);
        // Long enough to matter: at least fourteen metres of bank.
        expect(slope.to - slope.from).toBeGreaterThanOrEqual(14);
        expect(Math.abs(slope.dir)).toBe(1);
        for (const h of c.hazards)
          expect(h.z <= slope.from - SLOPE_ROCK_GAP || h.z >= slope.to + SLOPE_ROCK_GAP).toBe(true);
        for (const g of c.gates)
          expect(g.z <= slope.from - SLOPE_MARGIN || g.z >= slope.to + SLOPE_MARGIN).toBe(true);
      }
      // Bands never overlap, and each pushes at full tilt in its middle and not at all at its ends.
      for (let i = 1; i < c.slopes.length; i++)
        expect(c.slopes[i].from).toBeGreaterThanOrEqual(c.slopes[i - 1].to);
      for (const slope of c.slopes) {
        // Full tilt in the middle of any band long enough for both eases; at least most of it in the shortest.
        const mid = slopeTilt(c, (slope.from + slope.to) / 2);
        expect(Math.sign(mid)).toBe(slope.dir);
        expect(Math.abs(mid)).toBeGreaterThanOrEqual(slope.to - slope.from >= 2 * SLOPE_EASE ? 1 : 0.8);
        expect(slopeTilt(c, slope.from)).toBe(0);
        expect(slopeTilt(c, slope.to)).toBe(0);
        expect(Math.abs(slopeTilt(c, slope.from + 2))).toBeGreaterThan(0);
        expect(Math.abs(slopeTilt(c, slope.from + 2))).toBeLessThan(1);
      }
      // A camber or step falls to one side; the other shapes have no side.
      for (const s of c.slopes)
        if (s.kind !== "camber" && s.kind !== "step") expect(s.dir).toBe(1);
      for (const kind of new Set(c.slopes.map((s) => s.kind))) kindLevels.set(kind, (kindLevels.get(kind) ?? 0) + 1);
    }
    expect(bands).toBeGreaterThanOrEqual(100);
    // Every shape of bank appears on at least two levels, and the last two levels mix them all.
    for (const kind of SLOPE_KINDS) expect(kindLevels.get(kind) ?? 0).toBeGreaterThanOrEqual(2);
    for (const level of [LEVEL_COUNT - 2, LEVEL_COUNT - 1])
      expect(new Set(getCourse(level).slopes.map((s) => s.kind)).size).toBe(SLOPE_KINDS.length);
    // Cambers fall both ways somewhere on the ladder.
    const cambers = getCourse(SLOPE_LEVELS).slopes.filter((s) => s.kind === "camber");
    expect(cambers.some((s) => s.dir === 1) && cambers.some((s) => s.dir === -1)).toBe(true);
    expect(getCourse(LEVEL_COUNT - 1).slopes.length).toBeGreaterThanOrEqual(12);
  });
  it("skids an un-steered skier down a bank, building up, carrying past its end and scrubbing speed", () => {
    const run = createRun(SLOPE_LEVELS);
    // The first camber that is followed by flat snow, so the skid can die away on its own.
    const slope = run.course.slopes.find(
      (s) => s.kind === "camber" && !run.course.slopes.some((o) => o.stretch === s.stretch + 1),
    )!;
    expect(slope).toBeDefined();
    run.x = 0;
    run.z = slope.from - 1;
    run.speed = run.course.speed;
    run.nextGate = run.course.gates.findIndex((g) => g.z > slope.from);
    const terminal = SLIP_ACCEL * SLIP_GRIP;
    let peak = 0,
      speedIn = 0;
    while (run.z < slope.to + 1 && !run.finished) {
      stepRun(run, 0, 1 / 120);
      peak = Math.max(peak, Math.abs(run.slip));
      if (run.z < (slope.from + slope.to) / 2) speedIn = run.speed;
    }
    expect(run.crashes).toBe(0);
    expect(run.heading).toBe(0);
    // The slip builds toward its terminal value and is still under way at the end of the bank.
    expect(Math.sign(run.slip)).toBe(slope.dir);
    expect(peak).toBeGreaterThan(terminal * 0.5);
    expect(peak).toBeLessThan(terminal);
    expect(Math.sign(run.x)).toBe(slope.dir);
    const atEnd = Math.abs(run.x),
      slipAtEnd = Math.abs(run.slip);
    expect(atEnd).toBeGreaterThan(1);
    expect(atEnd).toBeLessThan(4);
    // Skidding has cost speed against a skier on flat snow at the same point.
    const flat = createRun(SLOPE_LEVELS);
    flat.course = { ...flat.course, slopes: [] };
    flat.z = slope.from - 1;
    flat.speed = flat.course.speed;
    flat.nextGate = run.nextGate;
    while (flat.z < (slope.from + slope.to) / 2) stepRun(flat, 0, 1 / 120);
    expect(speedIn).toBeLessThan(flat.speed);
    expect(flat.x).toBe(0);
    // Past the bank the skid carries on and dies away: more drift, then none.
    let carried = 0;
    for (let i = 0; i < 120 && !run.finished; i++) {
      stepRun(run, 0, 1 / 120);
      carried = Math.abs(run.x) - atEnd;
    }
    expect(carried).toBeGreaterThan(slipAtEnd * SLIP_GRIP * 0.6);
    expect(Math.abs(run.slip)).toBeLessThan(slipAtEnd * 0.2);
    // The predictor matches the run: from the bank's start, it foresees the drift to its end.
    const foreseen = driftAhead(run.course, 0, slope.from - 1, 0, run.course.speed, slope.to + 1);
    expect(Math.abs(foreseen - slope.dir * atEnd)).toBeLessThan(0.5);
  });
  it("counters the drift with an upslope aim, so every north-face level stays passable", () => {
    for (let level = SLOPE_LEVELS; level < LEVEL_COUNT; level++) {
      const run = createRun(level);
      const { crashes, worstMargin } = drive(run);
      expect(run.stars).toBe(3);
      expect(crashes).toBe(0);
      expect(worstMargin).toBeGreaterThan(MARGIN);
    }
  });
});
