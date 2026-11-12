import { describe, expect, it } from "vitest";
import { CRATE_COINS, CRATE_FALL_TIME, CRATE_FIRST_DROP, CRATE_GAP_SPREAD, CRATE_MIN_GAP, CRATE_POINTS, CRATE_POOL_SIZE, type Crate } from "../src/crates";
import { getCourse } from "../src/levels";
import { createRun, stepRun, type Run } from "../src/physics";
import { locate, trailAt, trailHalf } from "../src/trail";
import { DT, coast, put, seedOf, ski } from "./helpers";

/** Skis a level with a stand-in player and notes every crate at the moment it is dropped. */
function drops(level: number, n: number) {
  const run = createRun(level, seedOf(level, n));
  const seen: { crate: Crate; at: number; from: number; speed: number; u: number }[] = [];
  const falling = new Set<Crate>();
  ski(run, "average", seedOf(level, n), (r) => {
    for (const crate of r.crates.items) {
      if (crate.phase === "falling" && !falling.has(crate)) {
        falling.add(crate);
        seen.push({ crate: { ...crate }, at: r.time, from: r.s, speed: r.speed, u: locate(r.course.trail, crate.x, crate.z, crate.s).u });
      } else if (crate.phase !== "falling") falling.delete(crate);
    }
    return false;
  });
  return { run, seen };
}
/** A crate lying on the snow just in front of the skier, or a little to one side. */
function lay(run: Run, aside = 0, phase: Crate["phase"] = "landed") {
  const at = trailAt(run.course.trail, run.s + 2, run.u + aside);
  Object.assign(run.crates.items[0], { phase, x: at.x, z: at.z, s: run.s + 2, age: 0 });
  run.crates.nextDrop = Infinity;
}

describe("supply crates", () => {
  it("come down ahead with time to reach them, on the open snow, clear of the flags", () => {
    let count = 0;
    for (const level of [0, 6, 11, 13, 19, 24, 29, 33, 39])
      for (let n = 0; n < 3; n++) {
        const { run, seen } = drops(level, n);
        const c = run.course;
        for (const { crate, from, speed, u } of seen) {
          count++;
          // Far enough ahead to see it fall and get across to it.
          expect(crate.s - from).toBeGreaterThanOrEqual(84);
          expect((crate.s - from) / Math.max(speed, 1)).toBeGreaterThan(CRATE_FALL_TIME + 0.5);
          // On the piste, well in from the deep snow.
          expect(Math.abs(u)).toBeLessThanOrEqual(trailHalf(c.trail, crate.s) - 3.5);
          expect(Math.abs(u)).toBeLessThanOrEqual(11.5);
          // Not in a gate, and never beyond the finish.
          for (const gate of c.gates) expect(Math.abs(gate.s - crate.s), `${c.name}: crate at ${crate.s}`).toBeGreaterThanOrEqual(11.5);
          expect(crate.s).toBeLessThanOrEqual(c.finishS - 18);
        }
      }
    expect(count).toBeGreaterThan(30);
  });
  /** Every crate dropped over a good many runs, and those that came down within reach of a rock or a tree. */
  const amongRocks = () => {
    let count = 0;
    const onRock: string[] = [];
    for (const level of [3, 7, 11, 13, 24, 27, 29, 33, 37, 39])
      for (let n = 0; n < 4; n++) {
        const { run, seen } = drops(level, n);
        for (const { crate, u } of seen) {
          count++;
          for (const h of run.course.hazards)
            if (Math.hypot(h.s - crate.s, h.u - u) < h.radius + 2.3) onRock.push(`${run.course.name}: crate at ${crate.s.toFixed(0)}, ${u.toFixed(1)} by a ${h.kind} at ${h.s}, ${h.u}`);
        }
      }
    return { count, onRock };
  };
  it("land clear of rocks and trees, nearly always", () => {
    const { count, onRock } = amongRocks();
    expect(count).toBeGreaterThan(40);
    expect(onRock.length).toBeLessThanOrEqual(count * 0.06);
  });
  // Known fault, reported: where a rock gate stands in a narrow part of the trail every place the crate tries is taken, and it falls
  // back on the first one it rolled, rock or no rock: on The Narrows two of four runs drop a crate on the rock gate at 610 m
  // (one 1.3 m from a rock, one 0.2 m).
  it("never land on a rock or a tree, or so near one that picking it up means a tumble", () => {
    expect(amongRocks().onRock).toEqual([]);
  });
  it("never come down on a kicker, in a chasm, under a flight or on the mark of something that moves", () => {
    let count = 0;
    for (const level of [3, 11, 25, 26, 27, 29, 30, 31])
      for (let n = 0; n < 3; n++) {
        const { run, seen } = drops(level, n);
        const c = run.course;
        for (const { crate } of seen) {
          count++;
          for (const zone of c.zones) if (zone.kind !== "ice") expect(crate.s <= zone.s - 13.9 || crate.s >= zone.s + zone.length + 45.9, `${c.name}: crate at ${crate.s} by a ${zone.kind} at ${zone.s}`).toBe(true);
          for (const m of c.movers) expect(Math.abs(m.s - crate.s), `${c.name}: crate at ${crate.s} on the ${m.kind}'s mark`).toBeGreaterThanOrEqual(9.9);
        }
      }
    expect(count).toBeGreaterThan(8);
  });
  it("fall where the run's seed says, whatever the frame rate", () => {
    const first = (seed: number, hz: number) => {
      const run = createRun(5, seed);
      for (let i = 0; i < (CRATE_FIRST_DROP + 0.3) * hz; i++) stepRun(run, 0, 1 / hz);
      return run.crates.items.find((item) => item.phase === "falling")!;
    };
    const a = first(42, 120),
      b = first(42, 120),
      other = first(43, 120);
    expect(a).toBeDefined();
    expect({ x: a.x, z: a.z, s: a.s }).toEqual({ x: b.x, z: b.z, s: b.s });
    expect(Math.hypot(a.x - other.x, a.z - other.z)).toBeGreaterThan(0.5);
    // At 30 steps a second the skier is a hair somewhere else, and the crate is still within a few metres of the same spot.
    const coarse = first(42, 30);
    expect(Math.hypot(a.x - coarse.x, a.z - coarse.z)).toBeLessThan(4);
  });
  it("are few and well spaced: the first after a few seconds, then one every ten or so", () => {
    expect(CRATE_FIRST_DROP).toBeGreaterThanOrEqual(4);
    expect(CRATE_MIN_GAP).toBeGreaterThanOrEqual(7);
    for (const level of [0, 12, 20])
      for (let n = 0; n < 3; n++) {
        const { run, seen } = drops(level, n);
        expect(run.finished).toBe(true);
        expect(seen.length).toBeGreaterThanOrEqual(1);
        expect(seen.length).toBeLessThanOrEqual(6);
        expect(seen[0].at).toBeGreaterThanOrEqual(CRATE_FIRST_DROP - 0.02);
        expect(seen[0].at).toBeLessThan(CRATE_FIRST_DROP + 0.1);
        for (let i = 1; i < seen.length; i++) expect(seen[i].at - seen[i - 1].at).toBeGreaterThanOrEqual(CRATE_MIN_GAP - 0.05);
        // Never more in play than the pool holds.
        expect(run.crates.items).toHaveLength(CRATE_POOL_SIZE);
      }
    expect(CRATE_GAP_SPREAD).toBeGreaterThan(0);
  });
  it("pay points and coins once when skied through, and leave the string of gates alone", () => {
    const run = put(createRun(0, 1), 30);
    lay(run);
    run.combo = 3;
    let events = 0;
    for (let i = 0; i < 60; i++) {
      stepRun(run, 0, DT);
      if (run.crates.event) events++;
    }
    expect(events).toBe(1);
    expect(run.crates.collected).toBe(1);
    expect(run.points.crates).toBe(CRATE_POINTS);
    expect(run.score).toBe(CRATE_POINTS);
    expect(run.coins).toBe(CRATE_COINS);
    expect(run.combo).toBe(3);
    expect(run.lives).toBe(3);
    coast(run, 1);
    expect(run.score).toBe(CRATE_POINTS);
    expect(run.crates.items[0].phase).toBe("inactive");
  });
  it("cannot be had while still in the air, from too far to one side, or in a tumble", () => {
    for (const variant of ["falling", "wide", "tumbling"] as const) {
      const run = put(createRun(0, 1), 30);
      lay(run, variant === "wide" ? 5 : 0, variant === "falling" ? "falling" : "landed");
      if (variant === "falling") run.crates.items[0].age = -5;
      if (variant === "tumbling") run.crashTime = 1;
      coast(run, 0.3);
      expect(run.crates.collected, variant).toBe(0);
      expect(run.score, variant).toBe(0);
    }
    // Within a couple of metres is near enough.
    const near = put(createRun(0, 1), 30);
    lay(near, 1.8);
    coast(near, 0.3);
    expect(near.crates.collected).toBe(1);
  });
  it("land after their fall, wait a while, and are cleared away once missed", () => {
    const run = put(createRun(0, 1), 30);
    const crate = run.crates.items[0];
    lay(run, 9, "falling");
    crate.s = run.s + 60;
    Object.assign(crate, trailAt(run.course.trail, crate.s, 9));
    coast(run, CRATE_FALL_TIME - 0.1);
    expect(crate.phase).toBe("falling");
    coast(run, 0.2);
    expect(crate.phase).toBe("landed");
    // Skied past: gone, and it cost nothing.
    coast(run, 6);
    expect(run.s).toBeGreaterThan(crate.s + 15);
    expect(crate.phase).toBe("inactive");
    expect(run.points.crates).toBe(0);
    expect(run.crates.collected).toBe(0);
    expect(createRun(0, 1).crates.items.every((item) => item.phase === "inactive")).toBe(true);
  });
  it("hold a power-up once the levels have shown one, and only coins before that", () => {
    expect(getCourse(0).cratePowers).toEqual([]);
    const early = put(createRun(0, 1), 30);
    lay(early);
    coast(early, 0.3);
    expect(early.shield || early.magnet > 0 || early.double > 0).toBe(false);
    const late = getCourse(39);
    expect(late.cratePowers.length).toBeGreaterThanOrEqual(2);
    const run = put(createRun(39, 1), 30);
    lay(run);
    coast(run, 0.3);
    expect(run.crates.collected).toBe(1);
    expect(run.shield || run.magnet > 0 || run.double > 0).toBe(true);
  });
  it("stop falling near the finish, and nothing changes once the run is over", () => {
    const run = createRun(0, 1);
    put(run, run.course.finishS - 60);
    run.nextGate = run.course.gates.length;
    run.crates.nextDrop = 0;
    coast(run, 0.5);
    expect(run.crates.items.every((item) => item.phase === "inactive")).toBe(true);
    coast(run, 20);
    expect(run.finished).toBe(true);
    const snapshot = JSON.stringify(run.crates);
    coast(run, 1);
    stepRun(run, 0, DT);
    expect(JSON.stringify(run.crates)).toBe(snapshot);
  });
});
