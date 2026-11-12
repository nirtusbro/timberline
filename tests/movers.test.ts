import { describe, expect, it } from "vitest";
import { LEVEL_DESIGNS, SHOULDER, getCourse } from "../src/levels";
import {
  BOULDER_FALL_TIME,
  BOULDER_SCATTER,
  DEER_BOLT_SPEED,
  DEER_HEAD_TIME,
  DEER_RUN_SPEED,
  DEER_STARE_MAX,
  DEER_STARE_MIN,
  DEER_TROT_TIME,
  HERD_ENTRY_TIME,
  HERD_LEAD,
  HERD_PACE,
  HERD_SWAY,
  LEARNER_PACE,
  LEARNER_SWAY,
  PLOUGH_SPEED,
  SNOWCAT_HALF,
  SNOWCAT_MARGIN,
  SNOWCAT_SPEED,
  createMover,
  deerStart,
  deerTrot,
  moverLead,
  stepMover,
  touchesMover,
  type MoverSpec,
  type MoverState,
} from "../src/movers";
import { createRun, stepRun } from "../src/physics";
import { buildTrail, trailAt, trailHalf } from "../src/trail";
import { ALL_LEVELS, DT, bareCourse, coast, put, startOn } from "./helpers";

const CRUISE = 26;
/** A trail that swings across the hill, so that along it and down the mountain are not the same thing. */
const trail = buildTrail([{ len: 200 }, { len: 150, to: 30 }, { len: 1500 }]);
const half = (s: number) => trailHalf(trail, s);
/**
 * Plays a mover out against a skier who comes down the trail at cruising
 * speed from where it wakes, and keeps what it did at every step.
 */
function watch(spec: MoverSpec, roll = 0.5, seconds = 14, stare = roll) {
  const rolls = [roll, stare];
  const m = createMover(spec, trail, () => rolls.shift() ?? 0.5);
  const track: { t: number; s: number; u: number; drift: number; skier: number; phase: MoverState["phase"]; touch: boolean }[] = [];
  let skier = spec.s - moverLead(spec, CRUISE, trail) - 5;
  for (let i = 0; i < seconds * 120; i++) {
    skier += CRUISE * DT;
    stepMover(m, spec, trail, skier, CRUISE, DT);
    const on = trailAt(trail, m.s, m.u);
    if (m.phase !== "waiting") track.push({ t: m.t, s: m.s, u: m.u, drift: m.drift, skier, phase: m.phase, touch: touchesMover(m, on.x, on.z) });
  }
  return { m, track, active: track.filter((p) => p.phase === "active") };
}
const spec = (kind: MoverSpec["kind"], more: Partial<MoverSpec> = {}): MoverSpec => ({ kind, s: 700, u: 0, dir: 1, ...more });

describe("a learner", () => {
  it("waits until the skier is in sight, then is found part-way through a turn", () => {
    const s = spec("skier");
    const m = createMover(s, trail, () => 0.3);
    stepMover(m, s, trail, s.s - moverLead(s, CRUISE) - 30, CRUISE, DT);
    expect(m.phase).toBe("waiting");
    stepMover(m, s, trail, s.s - moverLead(s, CRUISE) + 1, CRUISE, DT);
    expect(m.phase).toBe("active");
    // Ahead of the skier, above the place they will meet.
    expect(m.s).toBeLessThan(s.s);
    expect(m.s).toBeGreaterThan(s.s - moverLead(s, CRUISE) + 60);
  });
  it("makes long steady traverses right across the racing line, turning round at each end", () => {
    const { active } = watch(spec("skier"));
    const us = active.map((p) => p.u);
    expect(Math.max(...us)).toBeCloseTo(LEARNER_SWAY, 0);
    expect(Math.min(...us)).toBeCloseTo(-LEARNER_SWAY, 0);
    // It crosses the middle of the trail again and again.
    const crossings = us.filter((u, i) => i > 0 && Math.sign(u) !== Math.sign(us[i - 1])).length;
    expect(crossings).toBeGreaterThanOrEqual(2);
    // Steady: nearly all the time it is going across at one pace, one way or the other.
    const pace = Math.max(...active.map((p) => Math.abs(p.drift)));
    expect(pace).toBeGreaterThan(2);
    expect(pace).toBeLessThan(5);
    const steady = active.filter((p) => Math.abs(Math.abs(p.drift) - pace) < 0.05).length;
    expect(steady / active.length).toBeGreaterThan(0.95);
    expect(active.some((p) => p.drift > 0)).toBe(true);
    expect(active.some((p) => p.drift < 0)).toBe(true);
  });
  it("skis on down the trail slower than anyone racing, and is caught about where the course says", () => {
    const { active } = watch(spec("skier"));
    const speed = (active[240].s - active[0].s) / 2;
    expect(speed).toBeCloseTo(CRUISE * LEARNER_PACE, 0);
    const met = active.find((p) => p.skier >= p.s)!;
    expect(met).toBeDefined();
    expect(Math.abs(met.s - 700)).toBeLessThan(12);
    // Left behind, it is forgotten.
    expect(watch(spec("skier")).m.phase).toBe("done");
  });
  it("is somewhere different in its turn on every run", () => {
    const at = [0.05, 0.3, 0.55, 0.8].map((roll) => {
      const { active } = watch(spec("skier"), roll);
      return active.find((p) => p.skier >= p.s)!.u;
    });
    expect(Math.max(...at) - Math.min(...at)).toBeGreaterThan(LEARNER_SWAY * 0.5);
  });
  it("traverses about the middle of the trail on every level it is on, with the racing line inside its sweep", () => {
    let learners = 0;
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      for (const m of c.movers) {
        if (m.kind !== "skier") continue;
        learners++;
        expect(m.u).toBe(0);
        let i = 0;
        while (i < c.gates.length && c.gates[i].s < m.s) i++;
        const a = c.gates[i - 1],
          b = c.gates[i];
        const line = a.u + ((b.u - a.u) * (m.s - a.s)) / (b.s - a.s);
        expect(Math.abs(line)).toBeLessThan(LEARNER_SWAY);
        expect(trailHalf(c.trail, m.s) - 2).toBeGreaterThan(LEARNER_SWAY * 0.8);
      }
    }
    expect(learners).toBeGreaterThanOrEqual(10);
  });
});

describe("a deer", () => {
  const deer = (dir: 1 | -1 = 1, u = 2) => spec("deer", { dir, u });
  it("waits in the trees, runs out to the racing line, stands there staring, then bolts on across", () => {
    for (const dir of [1, -1] as const) {
      const s = deer(dir);
      const hidden = createMover(s, trail, () => 0.5);
      expect(hidden.phase).toBe("waiting");
      // It starts among the trees, well past the deep snow at the edge of the trail, on the side it is not going to.
      expect(hidden.u).toBe(deerStart(s, trail));
      expect(hidden.u * dir).toBeLessThan(-(half(s.s) + SHOULDER));
      const { track, m } = watch(s, 0.5, 9);
      const stare = DEER_STARE_MIN + (DEER_STARE_MAX - DEER_STARE_MIN) * 0.5;
      // The run in takes as long as the distance does at a deer's pace: the further the line from the trees, the longer it is seen coming.
      expect(m.trot).toBe(deerTrot(s, trail));
      expect(m.trot).toBeCloseTo(Math.abs(s.u - deerStart(s, trail)) / DEER_RUN_SPEED, 6);
      expect(m.trot).toBeGreaterThan(DEER_TROT_TIME);
      // Running in from the side it will leave by the other of, never backwards, never faster than a deer runs (give or take).
      const trot = track.filter((p) => p.t < m.trot - 0.02);
      expect(trot[0].u * dir).toBeLessThan(-(half(s.s) + SHOULDER));
      for (let i = 1; i < trot.length; i++) {
        expect((trot[i].u - trot[i - 1].u) * dir).toBeGreaterThanOrEqual(0);
        expect(Math.abs(trot[i].drift)).toBeLessThan(DEER_RUN_SPEED * 1.3);
      }
      // It is out of the trees and on the open snow for most of that run: nobody is surprised by it.
      const inSight = trot.filter((p) => Math.abs(p.u) < half(s.s)).length / 120;
      expect(inSight).toBeGreaterThan(1);
      // Standing on its mark, in the way.
      const standing = track.filter((p) => p.t > m.trot + 0.02 && p.t < m.trot + stare - 0.02);
      expect(standing.length).toBeGreaterThan(30);
      for (const p of standing) {
        expect(p.u).toBeCloseTo(s.u, 6);
        expect(p.drift).toBeCloseTo(0, 6);
        expect(p.touch).toBe(true);
      }
      // Bolting on the way it was going, fast, and gone.
      const bolt = track.filter((p) => p.t > m.trot + stare + 0.02 && p.phase === "active");
      expect(bolt.length).toBeGreaterThan(20);
      for (const p of bolt.slice(1)) expect(p.drift * dir).toBeCloseTo(DEER_BOLT_SPEED, 1);
      expect(m.phase).toBe("done");
      // Well clear of the line it stood on, and still going.
      expect((m.u - s.u) * dir).toBeGreaterThan(8);
    }
  });
  it("stares for a different length of time on every run", () => {
    const stares = Array.from({ length: 12 }, (_, seed) => {
      const run = createRun(9, seed);
      stepRun(run, 0, DT);
      expect(run.movers.length).toBe(run.course.movers.length);
      return run.movers.find((m) => m.kind === "deer")!.stare;
    });
    for (const stare of stares) {
      expect(stare).toBeGreaterThanOrEqual(DEER_STARE_MIN);
      expect(stare).toBeLessThanOrEqual(DEER_STARE_MAX);
    }
    expect(new Set(stares.map((stare) => stare.toFixed(3))).size).toBeGreaterThanOrEqual(10);
    expect(Math.max(...stares) - Math.min(...stares)).toBeGreaterThan((DEER_STARE_MAX - DEER_STARE_MIN) * 0.5);
    // The same run is the same deer.
    const again = createRun(9, 3);
    stepRun(again, 0, DT);
    expect(again.movers.find((m) => m.kind === "deer")!.stare).toBe(stares[3]);
  });
  it("stops on the racing line of every level it is on", () => {
    let deerSeen = 0;
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      for (const m of c.movers) {
        if (m.kind !== "deer") continue;
        deerSeen++;
        let i = 0;
        while (i < c.gates.length && c.gates[i].s < m.s) i++;
        const a = c.gates[i - 1],
          b = c.gates[i] ?? { s: c.finishS - 20, u: a.u * 0.4 };
        expect(m.u).toBeCloseTo(a.u + ((b.u - a.u) * (m.s - a.s)) / (b.s - a.s), 0);
      }
    }
    expect(deerSeen).toBeGreaterThanOrEqual(8);
  });
  /** Whether a skier who holds the racing line at cruising speed and does nothing about the deer runs into it, for a given length of stare (0 to 1). */
  const struck = (stare: number) => {
    const course = bareCourse({ movers: [spec("deer", { u: 0 })] });
    const run = put(startOn(course), 600);
    run.speed = course.speed;
    // Rolls: the first is the deer's place in its act, the second its stare.
    const rolls = [0.5, stare];
    run.moverRandom = () => rolls.shift() ?? 0.5;
    coast(run, 6);
    return run.crashes > 0;
  };
  it("is still in the way when a skier who does nothing about it arrives", () => {
    expect([0, 0.25, 0.5, 0.75, 1].some(struck)).toBe(true);
  });
  it("gives a skier time to act: it is seen for two seconds and more, and is on the line a moment before he gets there", () => {
    for (const s of [deer(1, 2), deer(-1, 2), deer(1, -9), deer(1, 10)]) {
      const lead = moverLead(s, CRUISE, trail);
      expect(lead).toBeCloseTo((deerTrot(s, trail) + DEER_HEAD_TIME) * CRUISE, 6);
      // Seen coming for a good two seconds, never for so long that it is old news.
      expect(lead / CRUISE).toBeGreaterThan(2);
      expect(lead / CRUISE).toBeLessThan(5);
      // Against a skier at cruising speed it has pulled up on its mark with most of a second to spare.
      const { track } = watch(s, 0.5, 9, 1);
      const arrived = track.find((p) => p.skier >= s.s)!;
      const stopped = track.find((p) => p.u === s.u)!;
      expect(arrived.t - stopped.t).toBeGreaterThan(DEER_HEAD_TIME * 0.8);
      expect(arrived.t - stopped.t).toBeLessThan(DEER_HEAD_TIME * 1.3);
    }
    expect(DEER_HEAD_TIME).toBeGreaterThan(0.4);
    // With its longest stare it is still standing there when he arrives; with its shortest it has just gone.
    expect(DEER_STARE_MAX).toBeGreaterThan(DEER_HEAD_TIME);
    expect(DEER_STARE_MIN).toBeLessThan(DEER_HEAD_TIME);
  });
  it("comes out of the trees on every level it is on, never out of thin air on the snow", () => {
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      for (const m of c.movers) {
        if (m.kind !== "deer") continue;
        const from = Math.abs(deerStart(m, c.trail));
        expect(from).toBeGreaterThanOrEqual(trailHalf(c.trail, m.s) + SHOULDER);
        const seen = moverLead(m, c.speed, c.trail) / c.speed;
        expect(seen, c.name).toBeGreaterThan(1.7);
        expect(seen, c.name).toBeLessThan(6);
      }
    }
  });
});

describe("a snowcat", () => {
  it("beats across the trail and back, from edge to edge, at a crawl", () => {
    // Watched from up the hill for a while, by a skier who stays where he is.
    const s = spec("snowcat");
    const m = createMover(s, trail, () => 0.2);
    const active: { u: number; drift: number; s: number }[] = [];
    for (let i = 0; i < 120 * 40; i++) {
      stepMover(m, s, trail, s.s - 100, CRUISE, DT);
      active.push({ u: m.u, drift: m.drift, s: m.s });
    }
    const reach = half(700) - SNOWCAT_MARGIN;
    const us = active.map((p) => p.u);
    expect(Math.max(...us)).toBeGreaterThan(reach - 0.5);
    expect(Math.min(...us)).toBeLessThan(-reach + 0.5);
    expect(Math.max(...us.map(Math.abs))).toBeLessThanOrEqual(reach + 1e-6);
    // Both ways, at one speed, and it stays level across the trail.
    expect(active.some((p) => p.drift > 0)).toBe(true);
    expect(active.some((p) => p.drift < 0)).toBe(true);
    const moving = active.filter((p) => Math.abs(Math.abs(p.drift) - SNOWCAT_SPEED) < 0.05).length;
    expect(moving / active.length).toBeGreaterThan(0.95);
    for (const p of active) expect(p.s).toBe(700);
    // It crosses the middle of the trail: there is no lane it leaves alone.
    expect(us.some((u) => Math.abs(u) < 0.5)).toBe(true);
  });
  it("is long across the slope: its ends hurt as much as its middle", () => {
    const s = spec("snowcat");
    const m = createMover(s, trail, () => 0.25);
    stepMover(m, s, trail, s.s - 50, CRUISE, DT);
    for (const off of [-SNOWCAT_HALF - 1.5, 0, SNOWCAT_HALF + 1.5]) {
      const p = trailAt(trail, m.s, m.u + off);
      expect(touchesMover(m, p.x, p.z)).toBe(true);
    }
    const clear = trailAt(trail, m.s, m.u + SNOWCAT_HALF + 4);
    expect(touchesMover(m, clear.x, clear.z)).toBe(false);
  });
  it("is somewhere different on its beat on every run", () => {
    const at = [0.1, 0.35, 0.6, 0.85].map((roll) => watch(spec("snowcat"), roll, 3).active[100].u);
    expect(new Set(at.map((u) => u.toFixed(1))).size).toBe(4);
  });
});

describe("a plough", () => {
  it("grinds up the trail toward the skier in the racing lane, and never leaves it", () => {
    const s = spec("plough", { u: -3 });
    const { active, m } = watch(s, 0.5, 9);
    for (let i = 1; i < active.length; i++) expect(active[i].s).toBeLessThan(active[i - 1].s);
    expect((active[0].s - active[120].s) / 1).toBeCloseTo(PLOUGH_SPEED, 1);
    for (const p of active) expect(p.u).toBe(-3);
    // It started below the meeting place and has climbed to it as the skier arrives.
    expect(active[0].s).toBeGreaterThan(s.s + 10);
    const met = active.find((p) => p.skier >= p.s)!;
    expect(Math.abs(met.s - s.s)).toBeLessThan(6);
    // It faces up the hill.
    expect(Math.cos(m.heading - m.rot)).toBeCloseTo(-1, 6);
  });
  it("stands in the racing lane of every level it is on", () => {
    let ploughs = 0;
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      for (const m of c.movers) {
        if (m.kind !== "plough") continue;
        ploughs++;
        let i = 0;
        while (i < c.gates.length && c.gates[i].s < m.s) i++;
        const a = c.gates[i - 1],
          b = c.gates[i];
        expect(m.u).toBeCloseTo(a.u + ((b.u - a.u) * (m.s - a.s)) / (b.s - a.s), 0);
      }
    }
    expect(ploughs).toBeGreaterThanOrEqual(4);
  });
});

describe("a boulder", () => {
  it("comes down near its mark, a little differently every run", () => {
    const landings = [0, 0.2, 0.5, 0.8, 0.999].map((roll) => createMover(spec("boulder", { u: 3 }), trail, () => roll).u);
    for (const u of landings) expect(Math.abs(u - 3)).toBeLessThanOrEqual(BOULDER_SCATTER + 1e-9);
    expect(Math.max(...landings) - Math.min(...landings)).toBeGreaterThan(BOULDER_SCATTER);
    // Once it is announced it does not wander: the ring on the snow is where it lands.
    const { active } = watch(spec("boulder", { u: 3 }), 0.8, 4);
    for (const p of active) expect(p.u).toBe(active[0].u);
  });
  it("is harmless until it lands, and a rock in the road from then on", () => {
    const { active } = watch(spec("boulder"), 0.5, 4);
    expect(active.filter((p) => p.t < BOULDER_FALL_TIME - 0.01).every((p) => !p.touch)).toBe(true);
    expect(active.filter((p) => p.t > BOULDER_FALL_TIME + 0.01).every((p) => p.touch)).toBe(true);
    expect(active.filter((p) => p.t < BOULDER_FALL_TIME).length).toBeGreaterThan(100);
    // In a run: through the ring before the rock arrives is free; a moment later it is a tumble.
    const through = (startBefore: number) => {
      const course = bareCourse({ movers: [spec("boulder", { u: 0 })] });
      const run = put(startOn(course), 700 - startBefore);
      run.speed = course.speed;
      run.moverRandom = () => 0.5;
      coast(run, 4);
      return run.crashes;
    };
    // Woken a second's skiing from the mark, the skier is under it before it lands.
    expect(through(BOULDER_FALL_TIME * 26 * 0.6)).toBe(0);
    // Woken from further off than it takes to fall, he finds it lying there.
    expect(through(BOULDER_FALL_TIME * 26 * 1.5)).toBe(1);
  });
});

describe("the herd", () => {
  const LANES = [-4.5, 4.5, 0];
  const herd = (u: number, dir: 1 | -1 = 1) => watch(spec("herd", { u, dir }), 0.4, 14).active;
  it("breaks out of the trees ahead of the skier, each deer easing down across the snow to a lane of its own", () => {
    for (const lane of LANES)
      for (const dir of [1, -1] as const) {
        const active = herd(lane, dir);
        const side = lane < 0 || (lane === 0 && dir < 0) ? -1 : 1;
        // First seen at the tree line, on the side its lane is nearer to, a long way down the trail from the skier.
        expect(active[0].u * side).toBeGreaterThan(half(active[0].s) + SHOULDER);
        expect(active[0].s - active[0].skier).toBeGreaterThan(HERD_LEAD * 0.9);
        // It comes in steadily, never back toward the trees, and is in its lane when its entry is over.
        const entry = active.filter((p) => p.t < HERD_ENTRY_TIME);
        for (let i = 1; i < entry.length; i++) expect((entry[i].u - entry[i - 1].u) * side).toBeLessThanOrEqual(0.02);
        const settled = active.find((p) => p.t >= HERD_ENTRY_TIME)!;
        expect(Math.abs(settled.u - lane)).toBeLessThanOrEqual(HERD_SWAY + 1e-6);
        // All of which happens before the skier is anywhere near it.
        expect(settled.s - settled.skier).toBeGreaterThan(40);
      }
    expect(HERD_ENTRY_TIME).toBeGreaterThan(1);
  });
  it("runs down the trail with the skier, each deer jinking about its lane", () => {
    for (const lane of LANES) {
      const active = herd(lane);
      expect((active[240].s - active[0].s) / 2).toBeCloseTo(CRUISE * HERD_PACE, 0);
      const us = active.filter((p) => p.t > HERD_ENTRY_TIME + 0.05).map((p) => p.u - lane);
      expect(us.length).toBeGreaterThan(300);
      expect(Math.max(...us)).toBeGreaterThan(HERD_SWAY * 0.9);
      expect(Math.min(...us)).toBeLessThan(-HERD_SWAY * 0.9);
      expect(Math.max(...us.map(Math.abs))).toBeLessThanOrEqual(HERD_SWAY + 1e-6);
      // The skier does catch it up.
      expect(active.some((p) => p.skier >= p.s)).toBe(true);
    }
    // Slower than the skier, so they are overtaken, not followed.
    expect(HERD_PACE).toBeLessThan(0.8);
    expect(HERD_PACE).toBeGreaterThan(LEARNER_PACE);
  });
});

describe("anything that comes out of the woods", () => {
  it("is first seen among the trees, never out of thin air on the open snow: every deer and every deer of the herd, on every level", () => {
    let deer = 0,
      herdDeer = 0;
    for (const level of ALL_LEVELS) {
      const c = getCourse(level);
      for (const m of c.movers) {
        if (m.kind !== "deer" && m.kind !== "herd") continue;
        if (m.kind === "deer") deer++;
        else herdDeer++;
        for (const roll of [0.05, 0.5, 0.95]) {
          const state = createMover(m, c.trail, () => roll);
          // The first moment it can be seen: the step on which the skier comes within its lead.
          const cruise = c.speed;
          let skier = m.s - moverLead(m, cruise, c.trail) - 3;
          for (let i = 0; i < 600 && state.phase === "waiting"; i++) {
            skier += cruise * DT;
            stepMover(state, m, c.trail, skier, cruise, DT);
          }
          expect(state.phase, `${c.name}: the ${m.kind} at ${m.s}`).toBe("active");
          const edge = trailHalf(c.trail, state.s);
          expect(Math.abs(state.u), `${c.name}: the ${m.kind} at ${m.s} is first seen ${(edge - Math.abs(state.u)).toFixed(1)} m inside the piste`).toBeGreaterThanOrEqual(edge + SHOULDER * 0.9);
          // And well ahead of the skier, not under his skis.
          expect(state.s - skier).toBeGreaterThan(25);
        }
      }
    }
    expect(deer).toBeGreaterThanOrEqual(12);
    expect(herdDeer).toBeGreaterThanOrEqual(5);
  });
});

describe("what moves, from run to run", () => {
  it("does something different every run, on a course that never changes", () => {
    for (const level of [2, 9, 26, 29]) {
      const runs = [11, 12, 13].map((seed) => {
        const run = createRun(level, seed);
        stepRun(run, 0, DT);
        return run;
      });
      expect(runs[0].course).toBe(runs[1].course);
      expect(runs[0].course.movers).toBe(runs[2].course.movers);
      expect(runs[0].course.gates).toBe(runs[1].course.gates);
      const rolls = runs.map((run) => run.movers.map((m) => `${m.roll.toFixed(4)}/${m.stare.toFixed(4)}`).join(" "));
      expect(new Set(rolls).size).toBe(3);
      // The same seed is the same run.
      const again = createRun(level, 11);
      stepRun(again, 0, DT);
      expect(again.movers).toEqual(runs[0].movers);
    }
  });
  it("is on every level that says so, as many as it says, and never on the first", () => {
    for (const level of ALL_LEVELS) expect(getCourse(level).movers.length).toBe(LEVEL_DESIGNS[level].movers.length);
    // Nothing moves on the first level; from the second on there is usually something.
    expect(getCourse(0).movers).toHaveLength(0);
    const kinds = new Set(ALL_LEVELS.flatMap((level) => getCourse(level).movers.map((m) => m.kind)));
    expect([...kinds].sort()).toEqual(["boulder", "deer", "herd", "plough", "skier", "snowcat"]);
  });
  it("knocks the skier down once and is then out of it: a learner run into does not hurt twice", () => {
    const course = bareCourse({ movers: [spec("skier")] });
    const run = startOn(course);
    run.moverRandom = () => 0.5;
    put(run, 700 - moverLead(course.movers[0], 26) + 2);
    let bumps = 0;
    for (let i = 0; i < 120 * 30 && run.s < 900; i++) {
      // Steer straight at wherever the learner is about to be.
      const m = run.movers[0];
      stepRun(run, m && m.phase === "active" && !m.hit && m.s > run.s ? Math.max(-1, Math.min(1, (m.u + m.drift * 0.35 - run.u) * 0.5)) : 0, DT);
      bumps += run.fx.filter((fx) => fx.kind === "bump").length;
    }
    expect(bumps).toBe(1);
    expect(run.crashes).toBe(1);
    expect(run.movers[0].hit).toBe(true);
  });
});
