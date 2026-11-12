import { describe, expect, it } from "vitest";
import { BOOST_TIME, ICE_SPEED, ICE_STEER } from "../src/extras";
import { COMBO_LIMIT, SHOULDER, STEER_RESPONSE, getCourse } from "../src/levels";
import { BULLSEYE_POINTS, CARVE_SCRUB, CRASH_PENALTY, POWDER_PACE, createRun, cruiseAt, fallPace, gateU, stepRun, trailPace, type Run } from "../src/physics";
import { finishTimeBonus } from "../src/scoring";
import { trailAt, trailDir, trailHalf } from "../src/trail";
import { DT, bareCourse, coast, deg, put, rad, ski, startOn, zoneOn } from "./helpers";

/** Open snow as far as anyone could ski, straight down the fall line: nothing but the skis and the hill. */
const open = () => startOn(bareCourse({ half: 500 }));
/** A trail that swings round to run across the hill and stays there. */
const TRAVERSE = [{ len: 100 }, { len: 100, to: 35 }, { len: 1500 }];
/** A trail that bends one way, runs across the hill, and bends back the other. */
const bend = () =>
  bareCourse({
    legs: [{ len: 120 }, { len: 140, to: 36 }, { len: 160 }, { len: 160, to: -30 }, { len: 600 }],
    gates: [
      [260, 0],
      [420, 0],
      [580, 0],
      [700, 0],
    ],
    finishS: 760,
  });
/** How far the skis point off the way the trail runs where the skier is. */
const off = (run: Run) => run.heading - trailDir(run.course.trail, run.s);

describe("the skis", () => {
  it("pick up speed down the hill and carry the skier through the world", () => {
    const run = createRun(0, 1);
    const start = { speed: run.speed, z: run.z };
    coast(run, 1.5);
    expect(run.speed).toBeGreaterThan(start.speed + 3);
    expect(run.z).toBeGreaterThan(start.z + 15);
    expect(run.s).toBeGreaterThan(15);
    expect(run.time).toBeCloseTo(1.5, 5);
  });
  it("come round progressively: a thumb moved over turns them, it does not put them somewhere", () => {
    const run = open();
    stepRun(run, 1, DT);
    expect(run.heading).toBeGreaterThan(0);
    expect(run.heading).toBeLessThan(0.05);
    expect(Math.abs(run.x)).toBeLessThan(0.01);
    const first = run.heading;
    coast(run, 0.3, 1);
    expect(run.heading).toBeGreaterThan(first * 8);
    expect(run.heading).toBeLessThan(run.course.turnAngle);
    const left = open();
    coast(left, 0.3, -1);
    expect(left.heading).toBeLessThan(-0.1);
    expect(left.x).toBeLessThan(0);
  });
  it("follow the trail with the thumb centred: straight on is wherever the trail is going", () => {
    const run = startOn(bend());
    let widest = 0,
      astray = 0;
    for (let i = 0; i < 120 * 60 && !run.finished; i++) {
      stepRun(run, 0, DT);
      widest = Math.max(widest, Math.abs(run.u));
      astray = Math.max(astray, Math.abs(off(run)));
      // The line of travel is the trail's, wherever on the mountain that points.
      expect(run.aim).toBeCloseTo(trailDir(run.course.trail, run.s), 2);
    }
    expect(run.finished).toBe(true);
    // Round both bends on the middle of the piste, give or take the width of a gate, with the skis never far off the trail's line.
    expect(widest).toBeLessThan(4);
    expect(astray).toBeLessThan(0.15);
    expect(run.powder).toBe(false);
    expect(run.crashes).toBe(0);
    expect(run.hits).toBe(4);
    // And the trail did bend: it took him a long way across the hill.
    expect(Math.abs(trailAt(run.course.trail, 420).x)).toBeGreaterThan(40);
  });
  it("hold an angle off the trail for as long as the thumb is held over, and no more: they do not keep turning", () => {
    for (const thumb of [1, 0.5, -0.7]) {
      const run = open();
      const angle = thumb * run.course.turnAngle;
      coast(run, 1.5, thumb);
      expect(run.heading).toBeCloseTo(angle, 2);
      const settled = run.heading;
      coast(run, 3, thumb);
      expect(run.heading).toBeCloseTo(settled, 2);
      expect(Math.abs(run.heading)).toBeLessThanOrEqual(Math.abs(angle) + 1e-6);
    }
    // Half a thumb is half the angle.
    const full = open(),
      half = open();
    coast(full, 2, 1);
    coast(half, 2, 0.5);
    expect(half.heading / full.heading).toBeCloseTo(0.5, 2);
    // More thumb than there is counts as all of it.
    const over = open();
    coast(over, 2, 3);
    expect(over.heading).toBeCloseTo(full.heading, 6);
    // On a trail that runs across the hill the angle is held off the trail, not off the fall line.
    const across = put(startOn(bareCourse({ legs: TRAVERSE, half: 300 })), 300);
    coast(across, 2, 0.5);
    expect(off(across)).toBeCloseTo(0.5 * across.course.turnAngle, 2);
    expect(deg(across.heading)).toBeGreaterThan(35 + 20);
  });
  it("come back to the trail's line within half a second of the thumb letting go", () => {
    const run = open();
    coast(run, 2, 1);
    const held = run.heading;
    expect(held).toBeGreaterThan(0.6);
    coast(run, 0.5);
    expect(run.heading).toBeGreaterThan(0);
    expect(run.heading).toBeLessThan(held * 0.15);
    coast(run, 0.5);
    expect(run.heading).toBeLessThan(held * 0.02);
    // A flick is a jink: over and back, a little way to one side and no change of course.
    const flick = open();
    coast(flick, 0.2, 1);
    const peak = flick.heading;
    expect(peak).toBeGreaterThan(0.1);
    coast(flick, 1);
    expect(Math.abs(flick.heading)).toBeLessThan(peak * 0.02);
    expect(flick.x).toBeGreaterThan(0.3);
    expect(flick.x).toBeLessThan(6);
  });
  it("answer the same at any speed: there is no wider turn for going faster", () => {
    const turned = (speed: number) => {
      const run = open();
      const seen: number[] = [];
      for (let i = 0; i < 60; i++) {
        run.speed = speed;
        stepRun(run, 1, DT);
        seen.push(run.heading);
      }
      return seen;
    };
    const slow = turned(10),
      fast = turned(38);
    for (let i = 0; i < slow.length; i++) expect(fast[i]).toBeCloseTo(slow[i], 9);
    // The rate is the steering response and nothing else: after one time constant, 63% of the way there.
    const run = open();
    coast(run, 1 / STEER_RESPONSE, 1);
    expect(run.heading / run.course.turnAngle).toBeCloseTo(1 - Math.exp(-1), 1);
  });
  it("keep the same pace whichever way the trail runs: across the hill is as fast as down it", () => {
    const settled = (legs: { len: number; to?: number }[]) => {
      const run = put(startOn(bareCourse({ legs })), 300);
      const speeds: number[] = [];
      for (let i = 0; i < 120 * 14; i++) {
        stepRun(run, 0, DT);
        if (i > 120 * 6) speeds.push(run.speed);
      }
      return { mean: speeds.reduce((a, b) => a + b, 0) / speeds.length, min: Math.min(...speeds), max: Math.max(...speeds), run };
    };
    const down = settled([{ len: 2400 }]),
      across = settled(TRAVERSE),
      other = settled([{ len: 100 }, { len: 100, to: -50 }, { len: 1500 }]);
    const cruise = cruiseAt(down.run.course, 300);
    // Cruising speed, with a ripple of under a metre a second either way.
    for (const s of [down, across, other]) {
      expect(s.mean).toBeGreaterThan(cruise - 0.6);
      expect(s.mean).toBeLessThan(cruise + 0.6);
      expect(s.min).toBeGreaterThan(cruise - 1.2);
      expect(s.max).toBeLessThan(cruise + 1.2);
    }
    expect(Math.abs(across.mean - down.mean)).toBeLessThan(0.5);
    expect(Math.abs(other.mean - down.mean)).toBeLessThan(0.5);
    // Nothing is taken off for the angle of the trail, anywhere.
    for (const angle of [0, 20, 45, 70]) expect(fallPace(rad(angle))).toBe(1);
    const c = across.run.course;
    for (const s of [0, 150, 400]) expect(trailPace(c, s)).toBe(cruiseAt(c, s));
  });
  it("lose a little speed in a hard carve, and get it back when let run", () => {
    const run = open();
    coast(run, 6);
    const running = run.speed;
    coast(run, 5, 1);
    const carving = run.speed;
    // A full thumb held costs about the scrub for the angle it holds: real, and nothing like a stop.
    const cost = run.course.turnAngle * CARVE_SCRUB;
    expect(running - carving).toBeGreaterThan(cost * 0.6);
    expect(running - carving).toBeLessThan(cost * 1.4);
    expect(carving).toBeGreaterThan(running * 0.65);
    // Half a thumb costs about half as much.
    const gentle = open();
    coast(gentle, 6);
    coast(gentle, 5, 0.5);
    expect(running - gentle.speed).toBeGreaterThan((running - carving) * 0.3);
    expect(running - gentle.speed).toBeLessThan((running - carving) * 0.7);
    coast(run, 5);
    expect(run.speed).toBeGreaterThan(running - 2);
    // A slalom thrown from edge to edge is slower than one let run.
    const hard = open();
    coast(hard, 6);
    for (let k = 0; k < 10; k++) coast(hard, 1, k % 2 ? -1 : 1);
    expect(hard.speed).toBeLessThan(running - 1.5);
  });
  it("ski the same line at 30 and at 120 steps a second", () => {
    const thumb = (run: Run) => 0.25 + Math.sin(run.time * 1.7) * 0.6;
    const coarse = startOn(bareCourse({ legs: TRAVERSE, half: 500 })),
      fine = startOn(bareCourse({ legs: TRAVERSE, half: 500 }));
    coast(coarse, 8, thumb, 30);
    coast(fine, 8, thumb, 120);
    expect(coarse.time).toBeCloseTo(fine.time, 5);
    expect(Math.abs(fine.u)).toBeGreaterThan(10);
    expect(Math.abs(coarse.x - fine.x)).toBeLessThan(2.5);
    expect(Math.abs(coarse.z - fine.z)).toBeLessThan(2.5);
    expect(Math.abs(coarse.u - fine.u)).toBeLessThan(2.5);
    expect(Math.abs(coarse.speed - fine.speed)).toBeLessThan(0.6);
    expect(Math.abs(coarse.heading - fine.heading)).toBeLessThan(0.06);
  });
});

describe("the trail", () => {
  it("is left by steering off it: a thumb held over runs into the deep snow and then the trees", () => {
    const run = startOn(bend());
    let powder = false;
    for (let i = 0; i < 120 * 6 && !run.crashes; i++) {
      stepRun(run, 0.6, DT);
      powder ||= run.powder;
    }
    expect(powder).toBe(true);
    expect(run.crashes).toBe(1);
  });
  it("can be skied by a stand-in player, bends and all", () => {
    const run = ski(startOn(bend()), "average", 3);
    expect(run.finished).toBe(true);
    expect(run.crashes).toBe(0);
    expect(run.hits).toBe(4);
  });
  it("is edged with deep snow that drags the skis down", () => {
    const course = bareCourse();
    const half = trailHalf(course.trail, 100);
    const piste = put(startOn(course), 100, half - 3),
      deep = put(startOn(course), 100, half + 3);
    piste.speed = deep.speed = cruiseAt(course, 100);
    coast(piste, 2.5);
    coast(deep, 2.5);
    expect(piste.powder).toBe(false);
    expect(deep.powder).toBe(true);
    expect(deep.crashes).toBe(0);
    expect(deep.speed).toBeLessThan(piste.speed * (POWDER_PACE + 0.1));
    expect(deep.speed).toBeGreaterThan(piste.speed * (POWDER_PACE - 0.1));
    expect(POWDER_PACE).toBeLessThan(0.95);
  });
  it("ends in a tumble past the deep snow, and stands the skier back on the piste pointing down the trail", () => {
    const course = bareCourse({ legs: TRAVERSE });
    const half = trailHalf(course.trail, 400);
    for (const side of [-1, 1]) {
      const run = put(startOn(course), 400, side * (half + SHOULDER + 0.5), 0);
      run.score = 1000;
      const events = coast(run, 0.05);
      expect(events).toContain("crash");
      expect(run.crashes).toBe(1);
      expect(run.crashTime).toBeGreaterThan(0);
      coast(run, 1.2);
      expect(run.crashTime).toBe(0);
      expect(Math.abs(run.u)).toBeLessThanOrEqual(half - 2);
      expect(run.heading).toBeCloseTo(trailDir(course.trail, run.s), 1);
      expect(deg(run.heading)).toBeGreaterThan(25);
      // And lets him ski on.
      const s = run.s;
      coast(run, 1);
      expect(run.crashes).toBe(1);
      expect(run.s).toBeGreaterThan(s + 5);
    }
  });
  it("leaves the shoulder itself skiable: slow, but no tumble", () => {
    const course = bareCourse();
    const half = trailHalf(course.trail, 100);
    const run = put(startOn(course), 100, half + SHOULDER - 1);
    coast(run, 1);
    expect(run.crashes).toBe(0);
  });
});

describe("ice", () => {
  const sheet = (ice: boolean) =>
    bareCourse({ legs: TRAVERSE, half: 80, zones: (trail) => (ice ? [zoneOn(trail, "ice", 280, 500)] : []) });
  it("barely lets the skis be steered", () => {
    const turned = (ice: boolean) => {
      const run = put(startOn(sheet(ice)), 300);
      const from = run.heading;
      coast(run, 0.4, 1);
      expect(run.onIce).toBe(ice);
      return run.heading - from;
    };
    const snow = turned(false),
      ice = turned(true);
    expect(snow).toBeGreaterThan(0.15);
    expect(ice).toBeGreaterThan(0);
    expect(ice).toBeLessThan(snow * (ICE_STEER + 0.25));
  });
  it("is fast, and holds whatever line the skier brought onto it", () => {
    const slide = (ice: boolean, thumb: number) => {
      const run = put(startOn(sheet(ice)), 300);
      run.speed = cruiseAt(run.course, 300);
      coast(run, 1.8, thumb);
      return run;
    };
    const snow = slide(false, 0),
      ice = slide(true, 0);
    // Faster than the snow beside it, by about the ice's own bonus.
    expect(ice.speed).toBeGreaterThan(snow.speed + ICE_SPEED * 0.5);
    expect(ice.speed).toBeLessThan(snow.speed + ICE_SPEED * 1.3);
    // Left alone it runs on down the trail: nothing drags it off to one side.
    expect(Math.abs(ice.u)).toBeLessThan(0.5);
    expect(off(ice)).toBeCloseTo(0, 2);
    // A thumb held over gets a skier across the snow far sooner than across the ice.
    const snowHeld = slide(false, 0.5),
      iceHeld = slide(true, 0.5);
    expect(snowHeld.u).toBeGreaterThan(8);
    expect(iceHeld.u).toBeGreaterThan(0.5);
    expect(iceHeld.u).toBeLessThan(snowHeld.u * 0.9);
  });
});

describe("gates", () => {
  const WIDTH = 8;
  /** Gates down a traverse, so that across the trail and across the screen are different things. */
  const course = (gates: [number, number][], more = {}) =>
    bareCourse({ legs: TRAVERSE, gates: gates.map(([s, u]) => [s, u, WIDTH]), more });
  /** Skis through the gate line at u, and says what happened there. */
  const cross = (run: Run, u: number) => {
    const gate = run.course.gates[run.nextGate];
    put(run, gate.s - 0.3, u);
    return coast(run, 0.1);
  };
  it("are judged across the trail where they stand, however the trail lies on the hill", () => {
    const gate = course([[400, 5]]).gates[0];
    // The gate stands square to a trail that runs 35 degrees off the fall line.
    expect(deg(gate.rot)).toBeCloseTo(35, 0);
    const inside = startOn(course([[400, 5]]));
    expect(cross(inside, 5 + WIDTH / 2 - 0.3)).toEqual(["gate"]);
    // That skier was more than half a gate from its middle measured level across the mountain; it is the trail that counts.
    expect((WIDTH / 2 - 0.3) / Math.cos(gate.rot)).toBeGreaterThan(WIDTH / 2);
    const outside = startOn(course([[400, 5]]));
    expect(cross(outside, 5 + WIDTH / 2 + 0.3)).toEqual(["miss"]);
    const other = startOn(course([[400, 5]]));
    expect(cross(other, 5 - WIDTH / 2 - 0.3)).toEqual(["miss"]);
  });
  it("count once each, and pay more the longer the string of them", () => {
    const run = startOn(course(Array.from({ length: 10 }, (_, i): [number, number] => [300 + i * 40, 0])));
    let expected = 0;
    for (let i = 0; i < 10; i++) {
      // Wide of the bullseye every time, so only the gate pays.
      expect(cross(run, 2.5)).toEqual(["gate"]);
      expected += 100 * Math.min(COMBO_LIMIT, i + 1);
      expect(run.hits).toBe(i + 1);
      expect(run.combo).toBe(Math.min(COMBO_LIMIT, i + 1));
      expect(run.score).toBe(expected);
      // Skiing on past it pays nothing more.
      coast(run, 0.2);
      expect(run.hits).toBe(i + 1);
      expect(run.score).toBe(expected);
    }
    expect(run.bestCombo).toBe(COMBO_LIMIT);
    expect(run.bullseyes).toBe(0);
    expect(run.misses).toBe(0);
  });
  it("pay extra through the bullseye, with a coin and a burst of speed", () => {
    const run = startOn(course([[400, -3]]));
    expect(cross(run, -3.4)).toEqual(["gate"]);
    expect(run.bullseyes).toBe(1);
    expect(run.bullseyeGates).toEqual([0]);
    expect(run.score).toBe(100 + BULLSEYE_POINTS);
    expect(run.coins).toBe(1);
    expect(run.boost).toBeGreaterThan(BOOST_TIME - 0.2);
  });
  it("break the string when missed, and cost nothing else: the run goes on", () => {
    const run = startOn(course([300, 340, 380, 420, 460].map((s): [number, number] => [s, 0])));
    cross(run, 2.5);
    cross(run, 2.5);
    expect(run.score).toBe(300);
    expect(cross(run, 9)).toEqual(["miss"]);
    expect(run.misses).toBe(1);
    expect(run.combo).toBe(0);
    expect(run.score).toBe(300);
    expect(run.crashes).toBe(0);
    expect(run.finished).toBe(false);
    // The next gate starts the count again from one.
    cross(run, 2.5);
    expect(run.score).toBe(400);
    expect(run.hits).toBe(3);
  });
  it("cannot be taken in a tumble, but tumbling through between the flags is not a gate missed", () => {
    const tumble = (u: number) => {
      const run = startOn(course([[400, 0]]));
      put(run, 399.7, u);
      run.crashTime = 0.5;
      run.speed = 20;
      run.score = 500;
      coast(run, 0.1);
      return run;
    };
    const through = tumble(1);
    expect(through.nextGate).toBe(1);
    expect(through.hits).toBe(0);
    expect(through.misses).toBe(0);
    expect(through.score).toBe(500);
    expect(through.bullseyes).toBe(0);
    // Tumbling past outside the flags is a miss like any other.
    const wide = tumble(WIDTH / 2 + 1.5);
    expect(wide.hits).toBe(0);
    expect(wide.misses).toBe(1);
  });
});

describe("moving gates", () => {
  const moving = () => bareCourse({ gates: [[400, 0, 7, { drift: { amp: 6, rate: 1.2, phase: 0 } }]] });
  /** The moment the gate is at the far end of its rail. */
  const PEAK = Math.PI / 2 / 1.2;
  it("never stand still: wherever a gate is, it is somewhere else a moment later, right up to the skier's arrival", () => {
    for (const level of [17, 21, 23, 38, 39]) {
      const course = getCourse(level);
      const run = createRun(level, 5);
      const drifting = course.gates.filter((gate) => gate.drift);
      expect(drifting.length).toBeGreaterThan(0);
      const seen = new Map(drifting.map((gate) => [gate, [] as number[]]));
      ski(run, "expert", 5, (r) => {
        const gate = r.course.gates[r.nextGate];
        // Every step of the last second and a half before each moving gate.
        if (gate?.drift && gate.s - r.s < r.speed * 1.5) seen.get(gate)!.push(gateU(gate, r.time, r.gateShift));
        return false;
      });
      for (const [gate, track] of seen) {
        expect(track.length).toBeGreaterThan(60);
        // It moved in every quarter second of the approach, the last one included: nothing locks it.
        for (let from = 0; from + 30 <= track.length; from += 30) {
          const window = track.slice(from, from + 30);
          expect(Math.max(...window) - Math.min(...window)).toBeGreaterThan(0.02);
        }
        const last = track.slice(-30);
        expect(Math.max(...last) - Math.min(...last)).toBeGreaterThan(0.02);
        expect(new Set(track.map((u) => u.toFixed(4))).size).toBeGreaterThan(track.length * 0.9);
        // And it stays on its rail.
        for (const u of track) expect(Math.abs(u - gate.u)).toBeLessThanOrEqual(gate.drift!.amp + 1e-9);
      }
    }
  });
  it("slide from end to end of the rail, a saw at a steady pace", () => {
    const sine = moving().gates[0];
    const sawGate = { ...sine, drift: { ...sine.drift!, saw: true } };
    const span = (gate: typeof sine) => {
      const us = Array.from({ length: 2000 }, (_, i) => gateU(gate, i * 0.01));
      return { min: Math.min(...us), max: Math.max(...us), steps: us.slice(1).map((u, i) => Math.abs(u - us[i])) };
    };
    for (const gate of [sine, sawGate]) {
      const { min, max } = span(gate);
      expect(max).toBeGreaterThan(5.95);
      expect(min).toBeLessThan(-5.95);
      expect(max).toBeLessThanOrEqual(6 + 1e-9);
    }
    const steps = span(sawGate).steps;
    const pace = Math.max(...steps);
    expect(steps.filter((step) => Math.abs(step - pace) < 1e-6).length).toBeGreaterThan(steps.length * 0.95);
    expect(gateU({ ...sine, drift: undefined }, 3)).toBe(sine.u);
  });
  it("are met at a different point of their swing on every run, and the same point on the same run", () => {
    const shifts = Array.from({ length: 10 }, (_, seed) => createRun(17, seed).gateShift);
    expect(new Set(shifts.map((shift) => shift.toFixed(3))).size).toBeGreaterThanOrEqual(9);
    for (const shift of shifts) {
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(Math.PI * 2 + 1e-9);
    }
    expect(createRun(17, 4).gateShift).toBe(shifts[4]);
    const gate = moving().gates[0];
    const at = shifts.map((shift) => gateU(gate, 10, shift));
    expect(Math.max(...at) - Math.min(...at)).toBeGreaterThan(6);
    // The shift is the only thing that differs: the rail is the course's.
    for (const u of at) expect(Math.abs(u)).toBeLessThanOrEqual(6 + 1e-9);
    // And it is the run's own shift a crossing is judged by.
    const run = put(startOn(moving()), 399.9, gateU(gate, PEAK + DT, 2));
    run.gateShift = 2;
    run.time = PEAK;
    run.speed = 26;
    expect(coast(run, 0.05)).toEqual(["gate"]);
    expect(Math.abs(gateU(gate, PEAK + DT, 2) - gateU(gate, PEAK + DT, 0))).toBeGreaterThan(4);
  });
  it("are judged where they are at the moment the skier crosses", () => {
    const arrive = (time: number, u: number) => {
      const run = startOn(moving());
      put(run, 399.9, u);
      run.gateShift = 0;
      run.time = time;
      run.speed = 26;
      const events = coast(run, 0.05);
      return { events, run };
    };
    const gate = moving().gates[0];
    const there = gateU(gate, PEAK);
    expect(there).toBeCloseTo(6, 3);
    // Through where it is: a hit, and a bullseye.
    const hit = arrive(PEAK, there);
    expect(hit.events).toEqual(["gate"]);
    expect(hit.run.bullseyes).toBe(1);
    // Through the middle of its rail while it is at the far end: nothing there.
    expect(arrive(PEAK, gate.u).events).toEqual(["miss"]);
    // Through where it was a second ago: it did not wait.
    const was = gateU(gate, PEAK - 1);
    expect(Math.abs(was - there)).toBeGreaterThan(3.5);
    expect(arrive(PEAK, was).events).toEqual(["miss"]);
    // The same place a second earlier would have done.
    expect(arrive(PEAK - 1, was).events).toEqual(["gate"]);
  });
});

describe("the score and the stars", () => {
  /** A run of the first level stood just short of the line with a given record behind it. */
  const atTheLine = (level: number, record: Partial<Run>) => {
    const run = createRun(level, 1);
    run.crates.nextDrop = Infinity;
    const c = run.course;
    put(run, c.finishS - 0.3);
    run.nextGate = c.gates.length;
    Object.assign(run, { hits: c.gates.length, bullseyes: c.starBullseyes, score: c.starScores[2], time: c.parTime + 5, speed: 20, ...record });
    coast(run, 0.2);
    expect(run.finished).toBe(true);
    return run;
  };
  it("end the run at the line, stop the clock and pay for every second under par", () => {
    const c = getCourse(0);
    const run = atTheLine(0, { time: c.parTime - 10.004, score: 1200 });
    expect(run.timeBonus).toBe(finishTimeBonus(run.time, c.parTime, c.timeBonusRate));
    expect(run.timeBonus).toBeGreaterThan(9.9 * c.timeBonusRate);
    expect(run.timeBonus).toBeLessThanOrEqual(10 * c.timeBonusRate);
    expect(run.points.time).toBe(run.timeBonus);
    expect(run.score).toBe(1200 + run.timeBonus);
    const frozen = { time: run.time, score: run.score, s: run.s };
    coast(run, 1);
    expect({ time: run.time, score: run.score, s: run.s }).toEqual(frozen);
    expect(atTheLine(0, { time: c.parTime + 30, score: 1200 }).timeBonus).toBe(0);
  });
  it("give three stars for a clean sheet: every gate, no tumble, enough bullseyes", () => {
    for (const level of [0, 12, 20, 33]) {
      const c = getCourse(level);
      expect(atTheLine(level, {}).stars).toBe(3);
      expect(atTheLine(level, {}).passed).toBe(true);
      if (c.starBullseyes > 0) expect(atTheLine(level, { bullseyes: c.starBullseyes - 1 }).stars).toBe(2);
    }
  });
  it("take the third star for a single tumble, however good the score", () => {
    for (const level of [0, 12, 20, 33]) {
      const run = atTheLine(level, { crashes: 1, score: 999999 });
      expect(run.stars).toBe(2);
      expect(run.passed).toBe(true);
    }
  });
  it("take the third star for one missed gate and the second for two", () => {
    for (const level of [0, 12, 20, 33]) {
      expect(atTheLine(level, { misses: 1, score: 999999 }).stars).toBe(2);
      expect(atTheLine(level, { misses: 2, score: 999999 }).stars).toBe(1);
      expect(atTheLine(level, { misses: 5, score: 999999 }).stars).toBe(1);
    }
  });
  it("pass the level on one star's score and fail it below that", () => {
    const c = getCourse(0);
    const scraped = atTheLine(0, { score: c.starScores[0], misses: 2 });
    expect(scraped.stars).toBe(1);
    expect(scraped.passed).toBe(true);
    const short = atTheLine(0, { score: c.starScores[0] - 50, misses: 2 });
    expect(short.stars).toBe(0);
    expect(short.passed).toBe(false);
    expect(atTheLine(0, { score: c.starScores[1], misses: 1 }).stars).toBe(2);
    expect(atTheLine(0, { score: c.starScores[1] - 50, misses: 1 }).stars).toBe(1);
  });
  it("give no star of any kind for a course not skied: half the gates at least, whatever else was picked up", () => {
    for (const level of [0, 12, 20, 33]) {
      const gates = getCourse(level).gates.length;
      const enough = Math.ceil(gates / 2);
      expect(atTheLine(level, { hits: enough, misses: gates - enough, score: 999999 }).stars).toBe(1);
      const few = atTheLine(level, { hits: enough - 1, misses: gates - enough + 1, score: 999999 });
      expect(few.stars).toBe(0);
      expect(few.passed).toBe(false);
    }
  });
  it("keep the third star of a race for whoever beats the fox", () => {
    const level = 7;
    const won = atTheLine(level, {});
    expect(won.rivalBeaten).toBe(true);
    expect(won.stars).toBe(3);
    const lost = createRun(level, 1);
    lost.rival!.done = true;
    const c = lost.course;
    put(lost, c.finishS - 0.3);
    lost.nextGate = c.gates.length;
    Object.assign(lost, { hits: c.gates.length, bullseyes: c.starBullseyes, score: 999999, speed: 20 });
    coast(lost, 0.2);
    expect(lost.finished).toBe(true);
    expect(lost.rivalBeaten).toBe(false);
    expect(lost.stars).toBe(2);
  });
  it("charge for a tumble: points, the string of gates and the speed, never below nothing", () => {
    const rocky = () => bareCourse({ rocks: [[300, 0, 1.2]] });
    const run = put(startOn(rocky()), 296);
    Object.assign(run, { score: 1000, combo: 5, speed: 26 });
    const events = coast(run, 0.4);
    expect(events).toEqual(["crash"]);
    expect(run.crashes).toBe(1);
    expect(run.score).toBe(1000 - CRASH_PENALTY);
    expect(run.combo).toBe(0);
    expect(run.speed).toBeLessThan(15);
    // Up again after a moment, and not knocked down twice by the same rock.
    coast(run, 2.5);
    expect(run.crashTime).toBe(0);
    expect(run.crashes).toBe(1);
    expect(run.s).toBeGreaterThan(305);
    const poor = put(startOn(rocky()), 296);
    Object.assign(poor, { score: 120, speed: 26 });
    coast(poor, 0.4);
    expect(poor.score).toBe(0);
  });
  it("let a shield take one knock: no tumble, no points lost, and the shield is gone", () => {
    const run = put(startOn(bareCourse({ rocks: [[300, 0, 1.2]] })), 296);
    Object.assign(run, { score: 1000, combo: 5, speed: 26, shield: true });
    coast(run, 0.4);
    expect(run.crashes).toBe(0);
    expect(run.score).toBeGreaterThanOrEqual(1000);
    expect(run.combo).toBe(5);
    expect(run.shield).toBe(false);
  });
  it("skim past a rock for a close call, and through it for a tumble", () => {
    const pass = (u: number) => {
      const run = put(startOn(bareCourse({ rocks: [[300, 0, 1]] })), 296, u);
      run.speed = 26;
      coast(run, 0.4);
      return run;
    };
    expect(pass(0.8).crashes).toBe(1);
    const near = pass(2.2);
    expect(near.crashes).toBe(0);
    expect(near.closeCalls).toBe(1);
    expect(near.score).toBeGreaterThan(0);
    const wide = pass(4);
    expect(wide.crashes).toBe(0);
    expect(wide.closeCalls).toBe(0);
  });
});
