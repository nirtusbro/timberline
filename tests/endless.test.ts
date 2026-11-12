import { describe, expect, it } from "vitest";
import {
  ENDLESS_BY_NIGHT,
  ENDLESS_EASY,
  ENDLESS_HARD,
  ENDLESS_NIGHT_PACE,
  ENDLESS_SETTLE_SPEED,
  ENDLESS_SPEED_CREEP,
  ENDLESS_START_SPEED,
  ENDLESS_WARMUP,
  createEndlessCourse,
  endlessSettings,
  endlessSpeed,
  type EndlessCourse,
  type EndlessTheme,
} from "../src/endless";
import { COIN_CLEAR, FULL_WIDTH, LEAP_HALF, zoneAt } from "../src/extras";
import { GATE_MARGIN, SHOULDER, SLOPE_KINDS, SLOPE_MARGIN } from "../src/levels";
import { CRATES_PER_LIFE, ENDLESS_LIVES, createEndlessRun, cruiseAt, stepRun } from "../src/physics";
import { TRAIL_MAX_TURN, trailAt, trailDir, trailHalf, trailZ } from "../src/trail";
import { DT, coast, mean, put, ski, wander, winding } from "./helpers";

const far = (seed: number, untilS = 6000) => {
  const course = createEndlessCourse(seed);
  course.extend(untilS);
  return course;
};
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** A good many more, for rules that only now and then go wrong. */
const MANY = Array.from({ length: 80 }, (_, i) => i + 1);
/** Courses laid a good way down, made once: several rules are checked on the same ones. */
const laid = new Map<number, EndlessCourse>();
const course6 = (seed: number) => laid.get(seed) ?? laid.set(seed, far(seed, 6500)).get(seed)!;
const INTRO = 1 + ENDLESS_EASY.length + ENDLESS_HARD.length;
/** Every run has met everything by this far down (of seeds 1 to 200 the longest introductions end at 4218 m, seed 162; the shortest at 3839 m). */
const INTRO_WITHIN = 4500;
/** The gate above a place on the trail, and the gate below it. */
function about(course: EndlessCourse, s: number) {
  let i = 0;
  while (i < course.gates.length && course.gates[i].s < s) i++;
  return { above: course.gates[i - 1], below: course.gates[i], index: i };
}
/** How far the direction of the trail strays between two places. */
function bendOver(course: EndlessCourse, from: number, to: number) {
  let min = Infinity,
    max = -Infinity;
  for (let s = from; s <= to; s++) {
    const dir = trailDir(course.trail, s);
    min = Math.min(min, dir);
    max = Math.max(max, dir);
  }
  return max - min;
}

describe("the endless course", () => {
  it("is the same for a seed, in every particular, and different for another", () => {
    const a = far(7, 4000),
      b = far(7, 4000),
      c = far(8, 4000);
    expect(a.gates).toEqual(b.gates);
    expect(a.hazards).toEqual(b.hazards);
    expect(a.coins).toEqual(b.coins);
    expect(a.movers).toEqual(b.movers);
    expect(a.zones).toEqual(b.zones);
    expect(a.sections).toEqual(b.sections);
    expect(a.slopes).toEqual(b.slopes);
    expect(a.slopes.length).toBeGreaterThan(0);
    expect(a.trail.dir.slice(0, 4000)).toEqual(b.trail.dir.slice(0, 4000));
    expect(a.gates).not.toEqual(c.gates);
    expect(a.sections.map((section) => section.theme)).not.toEqual(c.sections.map((section) => section.theme));
    expect(a.trail.dir.slice(0, 2500)).not.toEqual(c.trail.dir.slice(0, 2500));
    expect(a.endless).toBe(true);
    expect(a.finishS).toBe(Infinity);
    expect(a.tokens).toHaveLength(0);
    // A run of a seed is a run of that course.
    expect(createEndlessRun(7).course.gates.slice(0, 8)).toEqual(a.gates.slice(0, 8));
  });
  it("keeps growing ahead of the skier, and is the same course however it is extended", () => {
    const whole = createEndlessCourse(3);
    const before = whole.gates.length;
    expect(whole.gates[before - 1].s).toBeGreaterThanOrEqual(600);
    whole.extend(5000);
    expect(whole.gates.length).toBeGreaterThan(before + 60);
    expect(whole.gates[whole.gates.length - 1].s).toBeGreaterThanOrEqual(5000);
    // The trail is always laid well beyond the last gate.
    expect(whole.trail.endS).toBeGreaterThan(whole.gates[whole.gates.length - 1].s + 300);
    // Built in one go or bit by bit: whatever the bits, the same gates, rock, zones, movers and sections come out.
    for (const step of [130, 430, 977]) {
      const piecemeal = createEndlessCourse(3);
      for (let s = 700; s < 5000; s += step) piecemeal.extend(s);
      piecemeal.extend(5000);
      const upTo = <T extends { s: number }>(list: T[]) => list.filter((item) => item.s < 4800);
      expect(upTo(piecemeal.gates)).toEqual(upTo(whole.gates));
      expect(upTo(piecemeal.hazards)).toEqual(upTo(whole.hazards));
      expect(upTo(piecemeal.zones)).toEqual(upTo(whole.zones));
      expect(upTo(piecemeal.movers)).toEqual(upTo(whole.movers));
      expect(upTo(piecemeal.coins)).toEqual(upTo(whole.coins));
      const sections = Math.min(piecemeal.sections.length, whole.sections.length);
      expect(piecemeal.sections.slice(0, sections)).toEqual(whole.sections.slice(0, sections));
    }
    // And a run builds it as it goes.
    const run = createEndlessRun(3);
    const had = run.course.gates.length;
    put(run, 900, 0);
    stepRun(run, 0, DT);
    expect(run.course.gates.length).toBeGreaterThan(had);
    expect(run.course.gates[run.course.gates.length - 1].s).toBeGreaterThanOrEqual(run.s + 600);
  });
  it("keeps winding all the way down: every kilometre of trail turns, strays across the mountain and still only goes down", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const course = course6(seed);
      for (let from = 0; from < 6000; from += 1000) {
        expect(winding(course.trail, from, from + 1000), `seed ${seed} from ${from}`).toBeGreaterThan(60);
        expect(wander(course.trail, from, from + 1000), `seed ${seed} from ${from}`).toBeGreaterThan(25);
      }
      for (let s = 0; s < 6000; s += 3) {
        expect(Math.abs(trailDir(course.trail, s))).toBeLessThanOrEqual(TRAIL_MAX_TURN + 1e-9);
        expect(trailZ(course.trail, s + 3)).toBeGreaterThan(trailZ(course.trail, s) + 1.5);
      }
    }
  });
});

describe("an endless course never stops getting harder", () => {
  it("has snow that gets faster for ever: quickly at first, then by a little every kilometre without end", () => {
    expect(endlessSpeed(0)).toBe(ENDLESS_START_SPEED);
    expect(endlessSpeed(-50)).toBe(ENDLESS_START_SPEED);
    for (let s = 0; s < 60000; s += 250) expect(endlessSpeed(s + 250)).toBeGreaterThan(endlessSpeed(s));
    // Most of the way to its settled pace by five kilometres.
    expect(endlessSpeed(5000)).toBeGreaterThan(ENDLESS_START_SPEED + (ENDLESS_SETTLE_SPEED - ENDLESS_START_SPEED) * 0.7);
    // Past that it creeps, and the creep does not die away: thirty kilometres on is thirty creeps faster.
    expect(endlessSpeed(50000) - endlessSpeed(20000)).toBeCloseTo(30 * ENDLESS_SPEED_CREEP, 1);
    expect(endlessSpeed(200000)).toBeGreaterThan(ENDLESS_SETTLE_SPEED + 150 * ENDLESS_SPEED_CREEP);
    expect(ENDLESS_SPEED_CREEP).toBeGreaterThan(0);
    // It is the speed a run is skied at.
    const run = createEndlessRun(1);
    expect(cruiseAt(run.course, 0)).toBeGreaterThan(ENDLESS_START_SPEED * 0.85);
    expect(cruiseAt(run.course, 0)).toBeLessThan(ENDLESS_START_SPEED * 1.2);
    expect(run.course.speedAt!(100)).toBe(endlessSpeed(100));
  });
  it("is set tighter the further down it is: less time between gates, narrower gates, wider swings, more in the way", () => {
    const at = [0, 1000, 5000, 15000, 40000].map(endlessSettings);
    for (let i = 1; i < at.length; i++) {
      expect(at[i].beat).toBeLessThan(at[i - 1].beat);
      expect(at[i].width).toBeLessThan(at[i - 1].width);
      expect(at[i].amplitude).toBeGreaterThan(at[i - 1].amplitude);
      expect(at[i].speed).toBeGreaterThan(at[i - 1].speed);
      expect(at[i].clutter).toBeGreaterThanOrEqual(at[i - 1].clutter);
      expect(at[i].blocked).toBeGreaterThan(at[i - 1].blocked);
      expect(at[i].mixed).toBeGreaterThan(at[i - 1].mixed);
      // Gates never closer than a skier can react to, however fast the snow.
      expect(at[i].gap).toBeGreaterThanOrEqual(40);
    }
    // Each closes on a limit that can still be skied: a gate is never narrower than the campaign's narrowest, nor quicker than its quickest.
    expect(at[4].width).toBeGreaterThan(5);
    expect(at[4].beat).toBeGreaterThan(1.2);
    expect(endlessSettings(500000).beat).toBeGreaterThanOrEqual(1.25 - 1e-9);
    // Past its first limit the beat goes on shortening, a little every kilometre, down to that floor.
    expect(endlessSettings(30000).beat).toBeLessThan(endlessSettings(20000).beat - 0.05);
    // More trees by the line, and late on a rock stretch more and more often has a second rock.
    expect(at[3].trees).toBeGreaterThan(at[1].trees);
    expect(endlessSettings(3000).second).toBe(0);
    expect(endlessSettings(20000).second).toBeGreaterThan(endlessSettings(8000).second);
    // Nothing in the way during the warm-up.
    expect(endlessSettings(ENDLESS_WARMUP - 1).clutter).toBe(0);
    expect(endlessSettings(ENDLESS_WARMUP - 1).trees).toBe(0);
  });
  it("is laid that way: later gates are narrower and come sooner, and there is more to ski round every kilometre", () => {
    for (const seed of [1, 2, 3]) {
      const course = far(seed, 16000);
      const stretch = (from: number, to: number) => {
        const gates = course.gates.filter((g) => g.s >= from && g.s < to && !g.drift);
        const times = gates.slice(1).map((g, i) => (g.s - gates[i].s) / endlessSpeed(g.s));
        const inTheWay = course.hazards.filter((h) => !h.wall && h.s >= from && h.s < to).length + course.movers.filter((m) => m.s >= from && m.s < to).length;
        return { width: mean(gates.map((g) => g.width)), beat: mean(times), inTheWay: (inTheWay * 1000) / (to - from) };
      };
      const first = stretch(0, 1000),
        fifth = stretch(4500, 6500),
        fifteenth = stretch(13000, 16000);
      expect(fifth.width).toBeLessThan(first.width - 1.5);
      expect(fifteenth.width).toBeLessThan(fifth.width);
      expect(fifth.beat).toBeLessThan(first.beat - 0.4);
      // (The time between gates has all but reached its limit by the fifth kilometre: from there it is the speed that tells.)
      expect(fifteenth.beat).toBeLessThan(fifth.beat + 0.08);
      expect(fifth.inTheWay).toBeGreaterThan(first.inTheWay * 1.5);
      expect(fifteenth.inTheWay).toBeGreaterThan(first.inTheWay * 1.5);
      // Late on, sections are about two things at once.
      const late = course.sections.filter((section) => section.from > 9000);
      expect(late.some((section) => section.also !== undefined)).toBe(true);
      expect(course.sections.slice(0, INTRO).every((section) => section.also === undefined)).toBe(true);
    }
  });
});

describe("what stands in the way on an endless course", () => {
  it("goes on mounting past the fifth kilometre, for every second skied and at every gate, and does not fall away after", () => {
    // Counted per second of skiing and per gate, not per kilometre: the faster the snow, the further apart in metres everything is.
    const seeds = [1, 2, 3, 4, 5, 6];
    const courses = seeds.map((seed) => far(seed, 26000));
    const inTheWay = (from: number, to: number) => {
      const rows = courses.map((course) => {
        const things = course.hazards.filter((h) => !h.wall && h.s >= from && h.s < to).length + course.movers.filter((m) => m.s >= from && m.s < to).length;
        let seconds = 0;
        for (let s = from; s < to; s += 10) seconds += 10 / endlessSpeed(s);
        return { perSecond: things / seconds, perGate: things / course.gates.filter((gate) => gate.s >= from && gate.s < to).length };
      });
      return { perSecond: mean(rows.map((row) => row.perSecond)), perGate: mean(rows.map((row) => row.perGate)) };
    };
    const first = inTheWay(0, 1000),
      fifth = inTheWay(4500, 6500),
      fifteenth = inTheWay(13000, 16000),
      last = inTheWay(22000, 26000);
    // (Measured over these six runs: 0.21, 1.11, 1.53 and 1.58 a second; 0.62, 1.84, 2.15 and 2.09 a gate.)
    expect(fifth.perSecond).toBeGreaterThan(first.perSecond * 2.5);
    expect(fifteenth.perSecond).toBeGreaterThan(fifth.perSecond * 1.15);
    expect(fifteenth.perGate).toBeGreaterThan(fifth.perGate * 1.05);
    // From there it holds: a little more every second as the snow quickens, about the same at every gate.
    expect(last.perSecond).toBeGreaterThan(fifteenth.perSecond * 0.92);
    expect(last.perGate).toBeGreaterThan(fifteenth.perGate * 0.88);
  });
});

describe("the sections of an endless course", () => {
  it("run end to end down the trail, each about something other than the one before", () => {
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      expect(course.sections[0].from).toBe(0);
      for (const [i, section] of course.sections.entries()) {
        expect(section.to).toBeGreaterThan(section.from + 100);
        if (!i) continue;
        const before = course.sections[i - 1];
        expect(section.from).toBe(before.to);
        expect(section.theme, `seed ${seed} section ${i}`).not.toBe(before.theme);
        if (section.also !== undefined) {
          expect(section.also).not.toBe(section.theme);
          // The second thing is never one that needs trail of its own.
          expect(["leap", "kickers", "plain"]).not.toContain(section.also);
        }
      }
      expect(course.sections[course.sections.length - 1].to).toBe(course.trail.endS);
    }
  });
  it("open with nothing but flags, then bring in everything once, the gentler things first, before anything comes round again", () => {
    const orders = new Set<string>();
    for (const seed of SEEDS) {
      const course = course6(seed);
      expect(course.sections.length, `seed ${seed}`).toBeGreaterThan(INTRO);
      const themes = course.sections.slice(0, INTRO).map((section) => section.theme);
      expect(themes[0]).toBe("plain");
      expect(course.sections[0].to).toBeGreaterThanOrEqual(ENDLESS_WARMUP - 50);
      expect([...themes.slice(1, 1 + ENDLESS_EASY.length)].sort()).toEqual([...ENDLESS_EASY].sort());
      expect([...themes.slice(1 + ENDLESS_EASY.length)].sort()).toEqual([...ENDLESS_HARD].sort());
      expect(new Set(themes).size).toBe(INTRO);
      // "plain" is the warm-up and never comes back.
      expect(course.sections.slice(1).every((section) => section.theme !== "plain")).toBe(true);
      orders.add(themes.join(" "));
      // All of it within the first four and a half kilometres.
      expect(course.sections[INTRO - 1].to, `seed ${seed}`).toBeLessThan(INTRO_WITHIN);
    }
    // In an order of its own on every run.
    expect(orders.size).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });
  /** What a course has not shown by the end of its introductory sections, of all the things the mountain has. */
  const unmet = (seed: number) => {
    const course = seed <= 8 ? course6(seed) : far(seed, 5000);
    const end = course.sections[INTRO - 1].to;
    const zones = course.zones.filter((zone) => zone.s < end),
      gates = course.gates.filter((gate) => gate.s < end + 60),
      movers = course.movers.filter((mover) => mover.s < end);
    const has: Record<string, boolean> = {
      kicker: zones.some((zone) => zone.kind === "ramp" && !zone.leap),
      "leap kicker": zones.some((zone) => zone.kind === "ramp" && zone.leap === true),
      chasm: zones.some((zone) => zone.kind === "chasm"),
      ice: zones.some((zone) => zone.kind === "ice" && (zone.blobs?.length ?? 0) >= 2),
      "moving gate": gates.some((gate) => gate.drift),
      fork: gates.some((gate) => gate.alt !== undefined),
      rock: course.hazards.some((h) => h.kind === "rock" && h.s < end),
      tree: course.hazards.some((h) => h.kind === "tree" && h.s < end),
      "shaped snow": course.slopes.some((slope) => slope.from < end),
      fog: course.sections.slice(0, INTRO).some((section) => section.light === "fog"),
      night: course.sections.slice(0, INTRO).some((section) => section.light === "night"),
    };
    for (const kind of ["skier", "deer", "herd", "snowcat", "plough", "boulder"]) has[kind] = movers.some((mover) => mover.kind === kind);
    return Object.keys(has)
      .filter((thing) => !has[thing])
      .map((thing) => {
        const theme = ({ skier: "learners", plough: "ploughs", boulder: "boulders", fork: "forks", "moving gate": "rails", kicker: "kickers", "leap kicker": "leap", chasm: "leap", "shaped snow": "shaped" } as Record<string, string>)[thing] ?? thing;
        const section = course.sections.slice(0, INTRO).find((sec) => sec.theme === theme);
        return `seed ${seed}: no ${thing}${section ? ` in its section, ${section.from.toFixed(0)} to ${section.to.toFixed(0)} m` : ` by ${end.toFixed(0)} m`}`;
      });
  };
  it("show what they are about, always: by the end of the introductions every run has held every thing the mountain has", () => {
    expect(Array.from({ length: 120 }, (_, i) => i + 1).flatMap(unmet)).toEqual([]);
  });
  it("put each thing in the section that is about it, and start as they mean to go on", () => {
    const sectionOf = (course: EndlessCourse, s: number) => course.sections.find((section) => s >= section.from && s < section.to)!;
    const themeOf: Record<string, EndlessTheme> = { skier: "learners", deer: "deer", herd: "herd", snowcat: "snowcat", plough: "ploughs", boulder: "boulders" };
    const stray: string[] = [];
    for (const seed of SEEDS) {
      const course = course6(seed);
      const is = (s: number, theme: EndlessTheme) => {
        // What a stretch carries is decided by the section its lower gate stands in.
        const { below } = about(course, s);
        const section = sectionOf(course, below?.s ?? s);
        return section.theme === theme || section.also === theme;
      };
      for (const mover of course.movers) if (!is(mover.s, themeOf[mover.kind])) stray.push(`seed ${seed}: a ${mover.kind} at ${mover.s} in a section about ${sectionOf(course, mover.s).theme}`);
      for (const zone of course.zones) {
        const theme: EndlessTheme = zone.kind === "ice" ? "ice" : zone.kind === "chasm" || zone.leap ? "leap" : "kickers";
        if (!is(zone.s + zone.length / 2, theme)) stray.push(`seed ${seed}: ${zone.kind} at ${zone.s.toFixed(0)} in a section about ${sectionOf(course, zone.s).theme}`);
      }
      for (const gate of course.gates) {
        if (gate.drift && !is(gate.s, "rails")) stray.push(`seed ${seed}: a moving gate at ${gate.s} in a section about ${sectionOf(course, gate.s).theme}`);
        if (gate.alt !== undefined && !is(gate.s, "forks")) stray.push(`seed ${seed}: a fork at ${gate.s} in a section about ${sectionOf(course, gate.s).theme}`);
      }
    }
    expect(stray).toEqual([]);
  });
});

describe("an endless course is fair", () => {
  /** Anything but flags and coins standing above a place on the trail, over many runs. */
  const before = (limit: number) => {
    const early: string[] = [];
    for (const seed of MANY) {
      const course = seed <= 8 ? course6(seed) : far(seed, 1000);
      for (const h of course.hazards) if (h.s < limit) early.push(`seed ${seed}: a ${h.kind} at ${h.s}`);
      for (const m of course.movers) if (m.s < limit) early.push(`seed ${seed}: a ${m.kind} at ${m.s}`);
      for (const zone of course.zones) if (zone.s < limit) early.push(`seed ${seed}: ${zone.kind} at ${zone.s.toFixed(0)}`);
      for (const gate of course.gates) if (gate.s < limit && (gate.drift || gate.alt !== undefined)) early.push(`seed ${seed}: a trick gate at ${gate.s}`);
    }
    return early;
  };
  it("never lays a coin on the snow within reach of a rock or a tree, and still lays plenty", () => {
    for (const seed of SEEDS) {
      const course = course6(seed);
      const onSnow = course.coins.filter((coin) => coin.y === 0);
      expect(onSnow.length).toBeGreaterThan(40);
      for (const coin of onSnow) expect(course.hazards.some((h) => Math.hypot(h.u - coin.u, h.s - coin.s) < h.radius + COIN_CLEAR - 0.2)).toBe(false);
    }
  });
  it("warms up on nothing but flags and coins for the whole of its first ENDLESS_WARMUP metres", () => {
    expect(before(ENDLESS_WARMUP)).toEqual([]);
    for (const seed of SEEDS) {
      const course = course6(seed);
      // The first gates are wide and near the middle.
      expect(course.gates[0].s).toBeGreaterThanOrEqual(60);
      expect(course.gates[0].width).toBeGreaterThan(8.5);
      expect(Math.abs(course.gates[0].u)).toBeLessThan(5);
      // And the warm-up is not the whole run: things begin soon after it.
      const firstThing = Math.min(...course.hazards.map((h) => h.s), ...course.movers.map((m) => m.s), ...course.zones.map((zone) => zone.s));
      expect(firstThing).toBeLessThan(ENDLESS_WARMUP + 250);
    }
  });
  it("stands its gates in order on the open snow, never closer than a skier can react to", () => {
    for (const seed of SEEDS) {
      const course = course6(seed);
      for (const [i, gate] of course.gates.entries()) {
        const half = trailHalf(course.trail, gate.s);
        expect(Math.abs(gate.u), `seed ${seed} gate at ${gate.s}`).toBeLessThanOrEqual(half - GATE_MARGIN + 0.06);
        expect(Math.abs(gate.u) + gate.width / 2, `seed ${seed} gate at ${gate.s}`).toBeLessThanOrEqual(half);
        const at = trailAt(course.trail, gate.s, gate.u);
        expect(Math.hypot(gate.x - at.x, gate.z - at.z)).toBeLessThan(1e-6);
        expect(gate.rot).toBeCloseTo(trailDir(course.trail, gate.s), 9);
        if (i) expect(gate.s - course.gates[i - 1].s, `seed ${seed} gate at ${gate.s}`).toBeGreaterThanOrEqual(36);
      }
    }
  });
  it("never asks for a swing across the trail that the time between two gates does not allow", () => {
    const wild: string[] = [];
    let swings = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (let i = 1; i < course.gates.length; i++) {
        const gate = course.gates[i],
          prev = course.gates[i - 1];
        const S = endlessSettings(prev.s);
        // The less of a full gap there is, the less of a full swing; a gate's width and a bit is always allowed (a quick flick is exactly that).
        const across = Math.abs(gate.u - prev.u);
        const most = Math.max(S.width + 0.6, 7, S.swing * Math.min(1, ((gate.s - prev.s) / S.gap) ** 2));
        swings++;
        if (across > most + 0.6) wild.push(`seed ${seed}: ${gate.drift ? "moving " : ""}${gate.alt !== undefined ? "fork " : ""}gate at ${gate.s} (after ${prev.drift ? "a moving" : "a plain"} one) is ${across.toFixed(1)} m across from the one ${gate.s - prev.s} m above it; ${most.toFixed(1)} is the most there is time for`);
      }
    }
    expect(swings).toBeGreaterThan(1000);
    expect(wild).toEqual([]);
  });
  it("keeps the whole rail of every moving gate on the piste, and keeps them moving", () => {
    let rails = 0,
      saws = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const [i, gate] of course.gates.entries()) {
        if (!gate.drift) continue;
        rails++;
        if (gate.drift.saw) saws++;
        const half = trailHalf(course.trail, gate.s);
        expect(Math.abs(gate.u) + gate.drift.amp + gate.width / 2, `seed ${seed} gate at ${gate.s}`).toBeLessThanOrEqual(half - GATE_MARGIN + 0.11);
        // It slides far enough that it cannot simply be ignored, and no faster than it can be led.
        expect(gate.drift.amp, `seed ${seed} gate at ${gate.s}`).toBeGreaterThanOrEqual(gate.width / 2 + 0.4);
        const peak = gate.drift.saw ? (gate.drift.amp * gate.drift.rate * 2) / Math.PI : gate.drift.amp * gate.drift.rate;
        expect(peak).toBeLessThanOrEqual(11.5);
        expect(peak).toBeGreaterThan(3);
        // Never two in a row, and never a fork as well.
        expect(course.gates[i - 1].drift).toBeUndefined();
        expect(gate.alt).toBeUndefined();
      }
    }
    expect(rails).toBeGreaterThan(20);
    expect(saws).toBeGreaterThan(5);
    expect(rails - saws).toBeGreaterThan(5);
  });
  it("lays every leap on a straight of trail with nothing else on it: a kicker on the racing line, the gap right across, and a clear landing", () => {
    const faults: string[] = [];
    let leaps = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const [k, lip] of course.zones.entries()) {
        if (lip.kind !== "ramp" || !lip.leap) continue;
        leaps++;
        const where = `seed ${seed}: the leap at ${lip.s}`;
        const chasm = course.zones[k + 1];
        if (chasm?.kind !== "chasm" || Math.abs(chasm.s - (lip.s + lip.length)) > 1e-6) {
          faults.push(`${where} has no chasm at its lip`);
          continue;
        }
        if (chasm.halfWidth < FULL_WIDTH) faults.push(`${where}: the gap does not span the trail`);
        if (lip.halfWidth !== LEAP_HALF) faults.push(`${where}: kicker half-width ${lip.halfWidth}`);
        // The trail does not bend from the foot of the kicker to well past the far side.
        const bend = bendOver(course, lip.s, chasm.s + 40);
        if (bend > 1e-6) faults.push(`${where}: the trail bends ${((bend * 180) / Math.PI).toFixed(2)} degrees under it`);
        // The kicker is on the piste, on the line from the gate above to the gate below.
        const { above, below } = about(course, chasm.s);
        const line = above.u + ((below.u - above.u) * (chasm.s - above.s)) / (below.s - above.s);
        if (Math.abs(lip.u - line) > 0.6) faults.push(`${where}: kicker at u ${lip.u}, racing line at ${line.toFixed(1)}`);
        if (Math.abs(lip.u) + lip.halfWidth > trailHalf(course.trail, lip.s) - 1) faults.push(`${where}: kicker hangs off the piste`);
        // Room to line up for it and room to land: the gate above is well back, the gate below well past the gap.
        if (lip.s - above.s < 30) faults.push(`${where}: only ${(lip.s - above.s).toFixed(0)} m of run-in`);
        if (below.s - (chasm.s + chasm.length) < 30) faults.push(`${where}: only ${(below.s - chasm.s - chasm.length).toFixed(0)} m to land in`);
        // And nothing else on the stretch: no rock, no tree, nothing that moves, no ice, no trick gate at either end of it.
        for (const h of course.hazards) if (h.s > above.s && h.s < below.s) faults.push(`${where}: a ${h.kind} at ${h.s} on the leap's stretch`);
        for (const m of course.movers) if (m.s > above.s - 5 && m.s < below.s + 5) faults.push(`${where}: a ${m.kind} at ${m.s} on the leap's stretch`);
        for (const zone of course.zones) if (zone !== lip && zone !== chasm && zone.s + zone.length > above.s && zone.s < below.s) faults.push(`${where}: ${zone.kind} at ${zone.s.toFixed(0)} on the leap's stretch`);
        if (below.drift || below.alt !== undefined) faults.push(`${where}: lands into a trick gate`);
      }
    }
    expect(leaps).toBeGreaterThanOrEqual(SEEDS.length);
    expect(faults).toEqual([]);
  });
  it("lays every kicker on a straight of trail too, on the racing line, with at most the rock it is there to fly", () => {
    const faults: string[] = [];
    let kickers = 0,
      rocks = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const ramp of course.zones) {
        if (ramp.kind !== "ramp" || ramp.leap) continue;
        kickers++;
        const where = `seed ${seed}: the kicker at ${ramp.s}`;
        const lip = ramp.s + ramp.length;
        const bend = bendOver(course, ramp.s, lip + 30);
        if (bend > 1e-6) faults.push(`${where}: the trail bends ${((bend * 180) / Math.PI).toFixed(2)} degrees under its flight`);
        const { above, below } = about(course, lip);
        const line = above.u + ((below.u - above.u) * (lip - ramp.length / 2 - above.s)) / (below.s - above.s);
        if (Math.abs(ramp.u - line) > 0.6) faults.push(`${where}: at u ${ramp.u}, racing line at ${line.toFixed(1)}`);
        if (Math.abs(ramp.u) + ramp.halfWidth > trailHalf(course.trail, ramp.s) - 1) faults.push(`${where}: hangs off the piste`);
        // Nothing on the stretch but one rock just past the lip, under the flight.
        const onIt = course.hazards.filter((h) => h.s > above.s && h.s < below.s);
        rocks += onIt.length;
        for (const h of onIt) if (h.s < lip + 3 || h.s > lip + 16 || Math.abs(h.u - ramp.u) > 2.5) faults.push(`${where}: a ${h.kind} at ${h.s}, ${h.u} is not under the flight`);
        if (onIt.length > 1) faults.push(`${where}: ${onIt.length} rocks on its stretch`);
        for (const m of course.movers) if (m.s > above.s - 5 && m.s < below.s + 5) faults.push(`${where}: a ${m.kind} at ${m.s} on its stretch`);
        // The landing is before the next flags.
        if (below.s - lip < 30) faults.push(`${where}: only ${(below.s - lip).toFixed(0)} m from lip to the next gate`);
      }
    }
    expect(kickers).toBeGreaterThanOrEqual(SEEDS.length * 2);
    // More often than not there is a rock to fly.
    expect(rocks).toBeGreaterThan(kickers * 0.4);
    expect(faults).toEqual([]);
  });
  it("keeps rocks and trees out of every gate opening, on the piste, and in order", () => {
    const faults: string[] = [];
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      expect(course.hazards.length).toBeGreaterThan(80);
      for (const [i, h] of course.hazards.entries()) {
        if (i) expect(h.s).toBeGreaterThanOrEqual(course.hazards[i - 1].s);
        // On the piste, or at worst in the deep snow at its edge.
        if (Math.abs(h.u) >= trailHalf(course.trail, h.s) + SHOULDER) faults.push(`seed ${seed}: a ${h.kind} at ${h.s}, ${h.u} stands out among the scenery`);
      }
      let from = 0;
      for (const gate of course.gates) {
        while (from < course.hazards.length && course.hazards[from].s < gate.s - 8) from++;
        for (let i = from; i < course.hazards.length && course.hazards[i].s < gate.s + 8; i++) {
          const h = course.hazards[i];
          // Wherever a moving gate is on its rail, and through either side of a fork.
          const reach = gate.width / 2 + h.radius + (gate.drift?.amp ?? 0);
          for (const u of gate.alt === undefined ? [gate.u] : [gate.u, gate.alt])
            if (Math.abs(h.u - u) < reach) faults.push(`seed ${seed}: a ${h.kind} at ${h.s}, ${h.u} in the opening of the gate at ${gate.s}, ${u}${gate.drift ? " (moving)" : ""}`);
        }
      }
      for (const coin of course.coins) if (coin.y === 0 && course.hazards.some((h) => Math.hypot(h.u - coin.u, h.s - coin.s) < h.radius + 1)) faults.push(`seed ${seed}: a coin at ${coin.s}, ${coin.u} in a rock`);
    }
    expect(faults).toEqual([]);
  });
  it("splits a fork round an island of trees, with both openings on the snow and the gold in the far one", () => {
    const faults: string[] = [];
    let forks = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const [i, gate] of course.gates.entries()) {
        if (gate.alt === undefined) continue;
        forks++;
        const where = `seed ${seed}: the fork at ${gate.s}`;
        const half = trailHalf(course.trail, gate.s);
        if (Math.abs(gate.alt) + gate.width / 2 > half - 1.9) faults.push(`${where}: its far opening at ${gate.alt} hangs off the piste (${half.toFixed(1)} to the edge)`);
        if (Math.abs(gate.alt - gate.u) < gate.width + 2) faults.push(`${where}: its openings at ${gate.u} and ${gate.alt} run together`);
        const prev = course.gates[i - 1];
        const island = course.hazards.filter((h) => h.wall && h.s < gate.s && h.s > prev.s && Math.abs(h.u) < 0.5);
        if (island.length < 2) faults.push(`${where}: an island of ${island.length} trees`);
        if (island.some((h) => gate.s - h.s < 8)) faults.push(`${where}: the island runs right up to the flags`);
        // Nothing but the island on the way in to either opening.
        for (const h of course.hazards) if (!h.wall && h.s > gate.s - 30 && h.s < gate.s + 8) faults.push(`${where}: a ${h.kind} at ${h.s}, ${h.u} on the way in`);
        if (!course.coins.some((coin) => Math.abs(coin.s - gate.s) < 8 && Math.abs(coin.u - gate.alt!) < 0.2)) faults.push(`${where}: no gold in the far opening`);
      }
    }
    expect(forks).toBeGreaterThanOrEqual(SEEDS.length);
    expect(faults).toEqual([]);
  });
  it("lays its ice in rounded patches on the trail, between two gates, and its zones in order down the hill", () => {
    const faults: string[] = [];
    let sheets = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const [k, zone] of course.zones.entries()) {
        if (k && zone.s < course.zones[k - 1].s) faults.push(`seed ${seed}: ${zone.kind} at ${zone.s.toFixed(0)} is listed after ${course.zones[k - 1].kind} at ${course.zones[k - 1].s.toFixed(0)}`);
        if (zone.kind !== "ice") continue;
        sheets++;
        const where = `seed ${seed}: the ice at ${zone.s.toFixed(0)}`;
        const blobs = zone.blobs ?? [];
        if (blobs.length < 2) faults.push(`${where} has ${blobs.length} patches`);
        const { above, below } = about(course, zone.s + zone.length / 2);
        for (const blob of blobs) {
          if (Math.abs(blob.u) + blob.r > trailHalf(course.trail, blob.s) + SHOULDER) faults.push(`${where}: a patch at ${blob.s}, ${blob.u} (r ${blob.r}) runs off into the trees`);
          if (blob.s - blob.r < above.s || blob.s + blob.r > below.s) faults.push(`${where}: a patch at ${blob.s} (r ${blob.r}) lies under a gate`);
          if (zoneAt(course.zones, "ice", blob.u, blob.s) === undefined) faults.push(`${where}: no ice in the middle of its patch at ${blob.s}`);
        }
        // Some of it is on the racing line: it is there to be skied, not to be looked at.
        if (!blobs.some((blob) => Math.abs(blob.u - (above.u + ((below.u - above.u) * (blob.s - above.s)) / (below.s - above.s))) < blob.r)) faults.push(`${where}: none of it is on the racing line`);
      }
    }
    expect(sheets).toBeGreaterThan(SEEDS.length * 4);
    expect(faults).toEqual([]);
  });
  it("puts what moves on the racing line or across it, with a clear stretch round it, and gives the herd lanes that fit the trail", () => {
    const faults: string[] = [];
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const course = far(seed, 12000);
      for (const m of course.movers) {
        kinds.add(m.kind);
        const where = `seed ${seed}: the ${m.kind} at ${m.s}`;
        const { above, below } = about(course, m.s);
        const half = trailHalf(course.trail, m.s);
        const line = above.u + ((below.u - above.u) * (m.s - above.s)) / (below.s - above.s);
        if (Math.abs(m.u) > half - 2) faults.push(`${where}: its mark at ${m.u} is off the piste`);
        if ((m.kind === "deer" || m.kind === "plough") && Math.abs(m.u - line) > 0.6) faults.push(`${where}: at ${m.u}, racing line at ${line.toFixed(1)}`);
        if (m.kind === "boulder" && Math.abs(m.u - line) > 4.6) faults.push(`${where}: at ${m.u}, racing line at ${line.toFixed(1)}`);
        // Never on a stretch with rock on the line as well (a tree beside it may stand).
        for (const h of course.hazards) if (h.kind === "rock" && !h.wall && h.s > above.s && h.s < below.s) faults.push(`${where}: shares its stretch with a rock at ${h.s}, ${h.u}`);
        // Never on a stretch with a jump.
        for (const zone of course.zones) if (zone.kind !== "ice" && zone.s + zone.length > above.s && zone.s < below.s) faults.push(`${where}: shares its stretch with a ${zone.kind} at ${zone.s}`);
      }
    }
    expect([...kinds].sort()).toEqual(["boulder", "deer", "herd", "plough", "skier", "snowcat"]);
    expect(faults).toEqual([]);
  });
});

describe("light and weather on an endless course", () => {
  it("brings in fog and night in the introductions: fog on the last of the gentle sections, one night on a section fit for the dark", () => {
    for (const seed of MANY) {
      const course = far(seed, 4600);
      const intro = course.sections.slice(0, INTRO);
      expect(intro.length, `seed ${seed}`).toBe(INTRO);
      expect(intro[ENDLESS_EASY.length].light, `seed ${seed}`).toBe("fog");
      const nights = intro.filter((section) => section.light === "night");
      expect(nights.length, `seed ${seed}`).toBe(1);
      expect(ENDLESS_BY_NIGHT).toContain(nights[0].theme);
      expect(ENDLESS_HARD as readonly string[]).toContain(nights[0].theme);
      // Nothing else in the introductions is lit, and the warm-up is clear day.
      expect(intro.filter((section) => section.light !== undefined).length).toBe(2);
      expect(intro[0].light).toBeUndefined();
    }
  });
  it("keeps the dark for what is fair to meet in it, never lights two sections running, and saves the blizzard for late", () => {
    const faults: string[] = [];
    const seen = { night: 0, fog: 0, blizzard: 0, clear: 0 };
    for (const seed of SEEDS) {
      const course = far(seed, 30000);
      for (const [i, section] of course.sections.entries()) {
        seen[section.light ?? "clear"]++;
        const where = `seed ${seed}: the section at ${section.from.toFixed(0)} m (${section.theme}${section.also ? " and " + section.also : ""})`;
        if (section.light === "night" && (!ENDLESS_BY_NIGHT.includes(section.theme) || (section.also !== undefined && !ENDLESS_BY_NIGHT.includes(section.also)))) faults.push(`${where} is by night`);
        if (section.light && i && course.sections[i - 1].light) faults.push(`${where} is in ${section.light} straight after one in ${course.sections[i - 1].light}`);
        if (section.light === "blizzard" && section.from < 8000) faults.push(`${where} is in a blizzard`);
      }
    }
    expect(faults).toEqual([]);
    // All of them do come, and most of the run is still clear day.
    expect(seen.night).toBeGreaterThan(SEEDS.length);
    expect(seen.fog).toBeGreaterThan(SEEDS.length);
    expect(seen.blizzard).toBeGreaterThan(0);
    expect(seen.clear).toBeGreaterThan(seen.night + seen.fog + seen.blizzard);
    // The herd, the leap, a field of rock and falling boulders are never met in the dark.
    for (const theme of ["herd", "leap", "fields", "boulders"]) expect(ENDLESS_BY_NIGHT).not.toContain(theme);
  });
  /** A run of a seed stood in the middle of the first section in a given light, and stepped once. */
  const standIn = (seed: number, light: "night" | "fog" | undefined) => {
    const run = createEndlessRun(seed);
    run.crates.nextDrop = Infinity;
    run.course.extend!(6000);
    const sections = (run.course as EndlessCourse).sections;
    const section = sections.find((sec, i) => i > 0 && sec.light === light)!;
    put(run, (section.from + section.to) / 2);
    run.nextGate = run.course.gates.length;
    stepRun(run, 0, DT);
    return { run, section };
  };
  it("is the light of the section the skier is in: night falls and lifts, and the fog comes down, as he skis into them", () => {
    for (const seed of [1, 2, 3, 4]) {
      // A course nobody is on yet is in clear daylight.
      const fresh = createEndlessCourse(seed);
      expect(fresh.night).toBe(false);
      expect(fresh.weather).toBe("clear");
      const night = standIn(seed, "night").run;
      expect(night.course.night).toBe(true);
      expect(night.course.weather).toBe("clear");
      const fog = standIn(seed, "fog").run;
      expect(fog.course.night).toBe(false);
      expect(fog.course.weather).toBe("fog");
      const day = standIn(seed, undefined).run;
      expect(day.course.night).toBe(false);
      expect(day.course.weather).toBe("clear");
      // The same run, skied on out of the dark into the next section: the light changes with him.
      const { run, section } = standIn(seed, "night");
      put(run, section.to + 5);
      run.nextGate = run.course.gates.length;
      stepRun(run, 0, DT);
      expect(run.course.night).toBe(false);
      // And one run's light is not another's.
      expect(night.course.night).toBe(true);
    }
  });
  it("is skied a little slower by night, easing into the dark and out of it, while the snow itself never slows", () => {
    for (const seed of [1, 2, 3, 4]) {
      const course = far(seed, 12000);
      const nights = course.sections.filter((section) => section.light === "night");
      expect(nights.length).toBeGreaterThan(0);
      for (const section of nights) {
        const mid = (section.from + section.to) / 2;
        expect(course.speedAt(mid)).toBeCloseTo(endlessSpeed(mid) * ENDLESS_NIGHT_PACE, 9);
        // At either end it is the pace of the day, and it comes down and goes up without a step.
        expect(course.speedAt(section.from + 0.01)).toBeCloseTo(endlessSpeed(section.from), 1);
        expect(course.speedAt(section.to - 0.01)).toBeCloseTo(endlessSpeed(section.to), 1);
        expect(course.speedAt(section.from + 30)).toBeGreaterThan(course.speedAt(section.from + 60));
        expect(course.speedAt(section.from + 30)).toBeLessThan(endlessSpeed(section.from + 30));
        for (let s = section.from - 20; s < section.to + 20; s += 2) expect(Math.abs(course.speedAt(s + 2) - course.speedAt(s))).toBeLessThan(0.3);
      }
      // Everywhere else, fog included, it is the pace of the snow.
      for (const section of course.sections) if (section.light !== "night") expect(course.speedAt((section.from + section.to) / 2)).toBe(endlessSpeed((section.from + section.to) / 2));
    }
    expect(ENDLESS_NIGHT_PACE).toBeLessThan(1);
    expect(ENDLESS_NIGHT_PACE).toBeGreaterThan(0.75);
    // It is the pace the skier actually gets.
    const { run } = standIn(2, "night");
    expect(cruiseAt(run.course, run.s) / run.course.trail.pitch[Math.round(run.s + run.course.trail.lead)]).toBeCloseTo(endlessSpeed(run.s) * ENDLESS_NIGHT_PACE, 0);
  });
});

describe("shaped snow on an endless course", () => {
  it("lies between two gates, clear of both, with nothing standing or moving on its stretch", () => {
    const faults: string[] = [];
    const kinds = new Set<string>();
    let bands = 0;
    for (const seed of SEEDS) {
      const course = far(seed, 14000);
      for (const [k, slope] of course.slopes.entries()) {
        bands++;
        kinds.add(slope.kind);
        const where = `seed ${seed}: the ${slope.kind} at ${slope.from}`;
        if (k && slope.from < course.slopes[k - 1].to) faults.push(`${where} overlaps the band before it`);
        const above = course.gates[slope.stretch],
          below = course.gates[slope.stretch + 1];
        if (!above || !below) {
          faults.push(`${where} names stretch ${slope.stretch}, which has no gates`);
          continue;
        }
        if (Math.abs(slope.from - (above.s + SLOPE_MARGIN)) > 1e-6 || Math.abs(slope.to - (below.s - SLOPE_MARGIN)) > 1e-6) faults.push(`${where} runs ${slope.from} to ${slope.to}, its gates stand at ${above.s} and ${below.s}`);
        if (slope.to - slope.from < 20) faults.push(`${where} is only ${(slope.to - slope.from).toFixed(0)} m long`);
        if (slope.dir !== 1 && slope.dir !== -1) faults.push(`${where} falls toward ${slope.dir}`);
        if (slope.kind !== "camber" && slope.kind !== "step" && slope.dir !== 1) faults.push(`${where} has a side`);
        for (const h of course.hazards) if (h.s > above.s && h.s < below.s) faults.push(`${where}: a ${h.kind} at ${h.s} on its stretch`);
        for (const m of course.movers) if (m.s > above.s && m.s < below.s) faults.push(`${where}: a ${m.kind} at ${m.s} on its stretch`);
        for (const zone of course.zones) if (zone.s + zone.length > above.s && zone.s < below.s) faults.push(`${where}: ${zone.kind} at ${zone.s.toFixed(0)} on its stretch`);
        // It is in a section about shaped snow.
        const section = course.sections.find((sec) => below.s >= sec.from && below.s < sec.to)!;
        if (section.theme !== "shaped" && section.also !== "shaped") faults.push(`${where} is in a section about ${section.theme}`);
      }
    }
    expect(bands).toBeGreaterThan(SEEDS.length * 3);
    // Every shape the campaign has, by turns.
    expect([...kinds].sort()).toEqual([...SLOPE_KINDS].sort());
    expect(faults).toEqual([]);
  });
  it("is felt: a camber on an endless run carries a skier who does nothing down across the trail", () => {
    const course = far(3, 14000);
    const slope = course.slopes.find((band) => band.kind === "camber" && band.to - band.from > 30)!;
    expect(slope).toBeDefined();
    const run = createEndlessRun(3);
    run.crates.nextDrop = Infinity;
    run.course.extend!(14000);
    put(run, slope.from + 2, 0);
    run.nextGate = run.course.gates.length;
    run.speed = 20;
    let slip = 0;
    for (let i = 0; i < 240 && run.s < slope.to - 2; i++) {
      stepRun(run, 0, DT);
      if (Math.abs(run.slip) > Math.abs(slip)) slip = run.slip;
    }
    expect(Math.abs(slip)).toBeGreaterThan(1);
    expect(Math.sign(slip)).toBe(slope.dir);
  });
  it("is forgotten once it is well behind the skier, and kept on a course nobody is skiing", () => {
    const kept = far(5, 14000);
    expect(kept.slopes.length).toBeGreaterThan(3);
    const first = kept.slopes[0];
    const run = createEndlessRun(5);
    run.course.extend!(14000);
    expect(run.course.slopes).toEqual(kept.slopes);
    // Skied to well past the first band: it is gone, and everything not yet 400 m behind is still there.
    put(run, first.to + 600);
    run.nextGate = run.course.gates.length;
    stepRun(run, 0, DT);
    expect(run.course.slopes).not.toContainEqual(first);
    expect(run.course.slopes).toEqual(kept.slopes.filter((slope) => slope.to >= run.s - 400.5));
    for (const slope of run.course.slopes) expect(slope.to).toBeGreaterThanOrEqual(run.s - 401);
  });
});

describe("an endless run", () => {
  it("is the same run for the same seed and the same hand", () => {
    const a = ski(createEndlessRun(21), "average", 21, (run) => run.s > 1500),
      b = ski(createEndlessRun(21), "average", 21, (run) => run.s > 1500);
    expect(a.s).toBe(b.s);
    expect(a.score).toBe(b.score);
    expect(a.time).toBe(b.time);
    expect(a.lives).toBe(b.lives);
  });
  it("starts with three lives and ends where the third is lost, with no stars and no pass", () => {
    expect(ENDLESS_LIVES).toBe(3);
    for (const seed of [5, 6, 7]) {
      const run = createEndlessRun(seed);
      expect(run.lives).toBe(ENDLESS_LIVES);
      // Nobody at the controls: he rides the middle of the trail, and the flags to either side of it go by.
      coast(run, 180);
      expect(run.finished).toBe(true);
      expect(run.passed).toBe(false);
      expect(run.stars).toBe(0);
      expect(run.lives).toBe(0);
      expect(run.strikes).toBe(ENDLESS_LIVES);
      expect(run.misses + run.crashes).toBeGreaterThanOrEqual(ENDLESS_LIVES);
      // The gates swing wide enough that doing nothing does not last long.
      expect(run.s).toBeLessThan(1500);
      const frozen = run.s;
      coast(run, 1);
      expect(run.s).toBe(frozen);
    }
  });
  it("takes a life for a missed gate and a life for a tumble, and one only for a gate missed in a tumble", () => {
    const miss = createEndlessRun(9);
    const gate = miss.course.gates[0];
    put(miss, gate.s - 0.3, gate.u + gate.width);
    coast(miss, 0.05);
    expect(miss.misses).toBe(1);
    expect(miss.lives).toBe(ENDLESS_LIVES - 1);
    const fall = createEndlessRun(9);
    put(fall, gate.s - 0.3, gate.u < 0 ? 40 : -40);
    coast(fall, 0.05);
    expect(fall.crashes).toBe(1);
    expect(fall.misses).toBe(1);
    expect(fall.lives).toBe(ENDLESS_LIVES - 1);
    expect(fall.finished).toBe(false);
  });
  it("takes a life for missing the kicker of a leap and going into the gap", () => {
    const course = far(11, 6000);
    const lip = course.zones.find((zone) => zone.kind === "ramp" && zone.leap)!;
    const run = createEndlessRun(11);
    run.course.extend!(6000);
    run.crates.nextDrop = Infinity;
    put(run, lip.s + lip.length - 0.4, lip.u + LEAP_HALF + 3);
    run.speed = cruiseAt(run.course, run.s);
    const events = coast(run, 0.3);
    expect(events).toContain("crash");
    expect(run.crashes).toBe(1);
    expect(run.lives).toBe(ENDLESS_LIVES - 1);
    expect(run.s).toBeGreaterThan(lip.s + lip.length + 20);
    // On the kicker he flies it and keeps his lives.
    const clean = createEndlessRun(11);
    clean.course.extend!(6000);
    put(clean, lip.s + lip.length - 0.4, lip.u);
    clean.speed = cruiseAt(clean.course, clean.s);
    coast(clean, 0.3);
    expect(clean.airborne).toBe(true);
    expect(clean.lives).toBe(ENDLESS_LIVES);
  });
  it("wins a life for every few crates caught, with no cap", () => {
    const run = createEndlessRun(4);
    run.crates.nextDrop = Infinity;
    let lives = 0;
    for (let k = 1; k <= CRATES_PER_LIFE * 3; k++) {
      // A crate lying on the snow just ahead.
      put(run, run.s, 0);
      const ahead = trailAt(run.course.trail, run.s + 1.5, run.u);
      Object.assign(run.crates.items[0], { phase: "landed", x: ahead.x, z: ahead.z, s: run.s + 1.5, age: 0 });
      let won = false;
      for (let i = 0; i < 40 && run.crates.collected < k; i++) {
        stepRun(run, 0, DT);
        won ||= run.lifeEvent;
      }
      expect(run.crates.collected).toBe(k);
      expect(won).toBe(k % CRATES_PER_LIFE === 0);
      if (won) lives++;
      expect(run.lives).toBe(ENDLESS_LIVES + lives);
      run.nextGate = run.course.gates.length;
    }
    expect(lives).toBe(3);
  });
  const PILOT_SEEDS = [1, 2, 3, 4, 5, 6];
  const reaches = (skill: "novice" | "average" | "expert" | "blind") => PILOT_SEEDS.map((seed) => ski(createEndlessRun(seed), skill, seed, (run) => run.s > 9000).s);
  it("can be skied a good way by someone who looks where he is going, and less far by someone who does not", () => {
    const average = reaches("average"),
      blind = reaches("blind");
    // Anyone who can ski gets through the warm-up and into the first things, on every run.
    for (const [k, s] of average.entries()) expect(s, `seed ${PILOT_SEEDS[k]}`).toBeGreaterThan(ENDLESS_WARMUP + 200);
    expect(mean(average)).toBeGreaterThan(900);
    // It is what stands and moves on the trail that ends runs, not just flags: ignoring it ends one sooner.
    expect(mean(blind)).toBeLessThan(mean(average) * 0.85);
    // The warm-up has nothing to ignore: the blind skier gets through that too.
    for (const s of blind) expect(s).toBeGreaterThan(ENDLESS_WARMUP);
    // And it does end: nobody skis it for ever.
    expect(Math.max(...average)).toBeLessThan(9000);
  });
  it("can be skied further by a better skier than a worse one", () => {
    const novice = mean(reaches("novice")),
      expert = mean(reaches("expert"));
    expect(expert).toBeGreaterThan(novice);
  });
});
