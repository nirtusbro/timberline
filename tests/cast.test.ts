import { describe, expect, it } from "vitest";
import { LEVEL_COUNT, LEVEL_DESIGNS, POWER_INTRO, WORLD_SIZE, cratePowersFor, getCourse, worldOf } from "../src/levels";
import { CAST } from "../src/cast";
import {
  AIR_POINTS,
  CLEAR_HEIGHT,
  CLOSE_CALL_POINTS,
  COIN_POINTS,
  DOUBLE_TIME,
  MAGNET_REACH,
  RAMP_LIP,
  RIVAL_POINTS,
  jumpFor,
  rampHeight,
  zoneAt,
} from "../src/extras";
import { DEER_STARE_TIME, DEER_TROT_TIME, createMover, moverLead, stepMover } from "../src/movers";
import { cruiseAt, createRun, grantPower, rivalLine, stepRun, type Run } from "../src/physics";
import { CRATE_POINTS } from "../src/crates";
import { drive } from "./helpers";

const advance = (run: Run, seconds: number, input = 0) => {
  for (let i = 0; i < seconds * 120 && !run.finished; i++) stepRun(run, input, 1 / 120);
};
const levelsWith = (test: (level: number) => boolean) =>
  Array.from({ length: LEVEL_COUNT }, (_, i) => i).filter(test);

describe("the cast of each level", () => {
  it("gives every level a cast, and every special level a name of its own", () => {
    expect(CAST).toHaveLength(LEVEL_COUNT);
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const c = getCourse(level),
        d = LEVEL_DESIGNS[level];
      expect(c.hint.length).toBeGreaterThan(20);
      // Everything placed lies on the course, in order down it.
      for (const list of [c.coins, c.zones, c.powers, c.movers])
        for (let i = 0; i < list.length; i++) {
          expect(list[i].z).toBeGreaterThan(0);
          expect(list[i].z).toBeLessThan(c.finishZ);
          expect(Math.abs(list[i].x)).toBeLessThanOrEqual(13);
          if (i) expect(list[i].z).toBeGreaterThanOrEqual(list[i - 1].z);
        }
      // Each authored stretch exists, and nothing new shares a stretch with something else new.
      const stretches = [...d.ramps, ...d.ice, ...d.powers.map(([s]) => s), ...d.movers.map(([s]) => s)];
      for (const s of [...stretches, ...d.coins]) expect(s).toBeLessThan(c.gates.length);
      expect(new Set(stretches).size, c.name).toBe(stretches.length);
      // Coins and power-ups never sit inside rock.
      for (const coin of c.coins.filter((coin) => coin.y === 0))
        for (const h of c.hazards) expect(Math.hypot(h.x - coin.x, h.z - coin.z)).toBeGreaterThan(h.radius + 1.2);
      for (const power of c.powers)
        for (const h of c.hazards) expect(Math.hypot(h.x - power.x, h.z - power.z)).toBeGreaterThan(h.radius + 2);
    }
  });
  it("introduces one thing at a time, on the mountain it belongs to", () => {
    const first = (test: (level: number) => boolean) => levelsWith(test)[0];
    const has = (kind: string) => (level: number) => getCourse(level).movers.some((m) => m.kind === kind);
    const zone = (kind: string) => (level: number) => getCourse(level).zones.some((z) => z.kind === kind);
    const power = (kind: string) => (level: number) => getCourse(level).powers.some((p) => p.kind === kind);
    // The first level has only coins; each new thing arrives on a later level than the last.
    const firsts = [
      first((l) => getCourse(l).coins.length > 0),
      first(has("skier")),
      first((l) => getCourse(l).twist === "rival"),
      first(zone("ramp")),
      first(power("shield")),
      first(power("magnet")),
      first(has("deer")),
      first(power("double")),
      first(zone("ice")),
      first((l) => getCourse(l).twist === "avalanche"),
      first(has("snowcat")),
    ];
    expect(firsts[0]).toBe(0);
    for (let i = 1; i < firsts.length; i++) expect(firsts[i]).toBeGreaterThan(firsts[i - 1]);
    expect(getCourse(0).movers.length + getCourse(0).zones.length + getCourse(0).powers.length).toBe(0);
    // Ice lies only on the second mountain and banked snow only on the fourth.
    for (const level of levelsWith(zone("ice"))) expect(worldOf(level)).toBe(1);
    for (const level of levelsWith((l) => getCourse(l).slopes.length > 0)) expect(worldOf(level)).toBe(3);
    for (const level of levelsWith(has("snowcat"))) expect(worldOf(level)).toBe(2);
    // The fox races once on every mountain; an avalanche ends the second and the last.
    expect(levelsWith((l) => getCourse(l).twist === "rival").map(worldOf)).toEqual([0, 1, 2, 3]);
    expect(levelsWith((l) => getCourse(l).twist === "avalanche")).toEqual([2 * WORLD_SIZE - 1, LEVEL_COUNT - 1]);
    // Crates hold a power-up only once a level has introduced it.
    for (const kind of ["shield", "magnet", "double"] as const) {
      expect(first(power(kind))).toBe(POWER_INTRO[kind]);
      expect(cratePowersFor(POWER_INTRO[kind])).not.toContain(kind);
      expect(cratePowersFor(POWER_INTRO[kind] + 1)).toContain(kind);
    }
    expect(getCourse(0).cratePowers).toEqual([]);
  });
  it("makes no two neighbouring levels the same kind of thing", () => {
    const signature = (level: number) => {
      const c = getCourse(level);
      return [
        c.twist,
        c.weather,
        [...new Set(c.movers.map((m) => m.kind))].sort().join("+"),
        [...new Set(c.zones.map((z) => z.kind))].sort().join("+"),
        [...new Set(c.powers.map((p) => p.kind))].sort().join("+"),
        [...new Set(c.slopes.map((s) => s.kind))].sort().join("+"),
      ].join("|");
    };
    // The first two levels are the tutorial pair (coins, then gold); everywhere else neighbours differ.
    for (let level = 2; level < LEVEL_COUNT; level++) expect(signature(level), `level ${level + 1}`).not.toBe(signature(level - 1));
  });
});

describe("coins and power-ups", () => {
  it("pays ten points and a coin for each small coin, and only within reach", () => {
    const run = createRun(0);
    const coin = run.course.coins[0];
    run.x = coin.x + 3;
    run.z = coin.z - 0.5;
    advance(run, 0.1);
    expect(run.coinCount).toBe(0);
    const near = createRun(0);
    near.x = coin.x + 0.8;
    near.z = coin.z - 0.5;
    stepRun(near, 0, 1 / 120);
    while (near.z < coin.z + 2) stepRun(near, 0, 1 / 120);
    expect(near.coinTaken[0]).toBe(true);
    expect(near.points.coins).toBeGreaterThanOrEqual(COIN_POINTS);
    expect(near.coins).toBeGreaterThanOrEqual(1);
  });
  it("lets a magnet pull in coins well wide of the skier", () => {
    const run = createRun(0);
    const coin = run.course.coins[0];
    run.x = coin.x + MAGNET_REACH - 1.5;
    run.z = coin.z - 1;
    grantPower(run, "magnet");
    advance(run, 0.2);
    expect(run.coinTaken[0]).toBe(true);
    expect(run.magnet).toBeGreaterThan(0);
  });
  it("lets a shield take one knock without a tumble or a lost combo", () => {
    const level = levelsWith((l) => getCourse(l).hazards.length > 0)[0];
    const run = createRun(level);
    const rock = run.course.hazards[0];
    run.x = rock.x;
    run.z = rock.z - 2;
    run.combo = 4;
    run.nextGate = run.course.gates.findIndex((g) => g.z > rock.z);
    grantPower(run, "shield");
    advance(run, 0.3);
    expect(run.crashes).toBe(0);
    expect(run.shield).toBe(false);
    expect(run.combo).toBe(4);
    expect(run.invincible).toBeGreaterThan(0);
    // The second knock is a tumble.
    const bare = createRun(level);
    bare.x = rock.x;
    bare.z = rock.z - 2;
    advance(bare, 0.3);
    expect(bare.crashes).toBe(1);
  });
  it("doubles what a gate pays while a Double runs, and itemises the bonus", () => {
    const run = createRun(0);
    const gate = run.course.gates[0];
    run.x = gate.x + 2;
    run.z = gate.z - 1;
    grantPower(run, "double");
    advance(run, 0.2);
    expect(run.hits).toBe(1);
    expect(run.points.gates).toBe(100);
    expect(run.points.double).toBe(100);
    expect(run.score).toBe(200);
    run.double = 0.01;
    advance(run, 0.1);
    expect(run.double).toBe(0);
    expect(DOUBLE_TIME).toBeLessThanOrEqual(10);
  });
  it("puts the power-up of a crate in the tally, in turn", () => {
    const level = POWER_INTRO.double + 1;
    const run = createRun(level);
    Object.assign(run.crates.items[0], { phase: "landed", x: 0, z: 0.2, age: 0 });
    stepRun(run, 0, 1 / 120);
    expect(run.points.crates).toBe(CRATE_POINTS);
    expect(run.fx.some((f) => f.kind === "power")).toBe(true);
    expect(run.shield || run.magnet > 0 || run.double > 0).toBe(true);
  });
});

describe("carve boost, ice and jumps", () => {
  it("fires a carve boost on a bullseye: more speed, for a moment", () => {
    const boosted = createRun(0),
      plain = createRun(0);
    const gate = boosted.course.gates[0];
    for (const [run, offset] of [[boosted, 0], [plain, 2.5]] as const) {
      run.x = gate.x + offset;
      run.z = gate.z - 1;
      run.speed = run.course.speed;
      advance(run, 0.8);
    }
    expect(boosted.bullseyes).toBe(1);
    expect(plain.bullseyes).toBe(0);
    expect(boosted.speed).toBeGreaterThan(plain.speed + 2);
    advance(boosted, 1.2);
    expect(boosted.boost).toBe(0);
  });
  it("dulls the steering on ice, so a line set late is a line missed", () => {
    const level = levelsWith((l) => getCourse(l).zones.some((z) => z.kind === "ice"))[0];
    const course = getCourse(level);
    const ice = course.zones.find((z) => z.kind === "ice")!;
    expect(ice.length).toBeGreaterThanOrEqual(14);
    const turn = (onIce: boolean) => {
      const run = createRun(level);
      run.x = ice.x;
      run.z = onIce ? ice.z + 1 : ice.z - 40;
      run.speed = course.speed;
      run.nextGate = course.gates.length;
      const from = run.x;
      advance(run, 0.4, 1);
      expect(run.onIce).toBe(onIce);
      return Math.abs(run.x - from);
    };
    expect(turn(true)).toBeLessThan(turn(false) * 0.6);
    // Ice never lies under a flag.
    for (const level of levelsWith((l) => getCourse(l).zones.some((z) => z.kind === "ice")))
      for (const gate of getCourse(level).gates)
        expect(zoneAt(getCourse(level).zones, "ice", gate.x, gate.z)).toBeUndefined();
  });
  it("launches off the lip of a ramp, over the rock beyond it, for air points", () => {
    const level = levelsWith((l) => getCourse(l).zones.some((z) => z.kind === "ramp"))[0];
    const course = getCourse(level);
    const ramp = course.zones.find((z) => z.kind === "ramp")!;
    const rock = course.hazards.find((h) => h.z > ramp.z && h.z < ramp.z + 30 && Math.abs(h.x - ramp.x) < 2);
    expect(rock).toBeDefined();
    expect(rampHeight(course.zones, ramp.x, ramp.z + ramp.length - 0.01)).toBeCloseTo(RAMP_LIP, 1);
    expect(rampHeight(course.zones, ramp.x + ramp.halfWidth + 1, ramp.z + 3)).toBe(0);
    const run = createRun(level);
    run.x = ramp.x;
    run.z = ramp.z - 1;
    run.speed = course.speed;
    run.nextGate = course.gates.findIndex((g) => g.z > ramp.z);
    let peak = 0,
      launched = false;
    for (let i = 0; i < 240 && run.jumps === 0; i++) {
      stepRun(run, 0, 1 / 120);
      launched ||= run.airborne;
      peak = Math.max(peak, run.y);
    }
    expect(launched).toBe(true);
    expect(peak).toBeGreaterThan(CLEAR_HEIGHT + 0.5);
    expect(run.crashes).toBe(0);
    expect(run.z).toBeGreaterThan(rock!.z);
    expect(run.points.air).toBe(AIR_POINTS);
    // A jump never carries much past its landing zone, however fast the snow.
    for (const speed of [25, 35, 50]) {
      const { time } = jumpFor(speed);
      expect(time * speed).toBeLessThanOrEqual(30);
      expect(time).toBeGreaterThanOrEqual(0.5);
    }
    // Missing the ramp to one side means meeting the rock on the ground.
    const wide = createRun(level);
    wide.x = ramp.x + ramp.halfWidth + 0.8;
    wide.z = ramp.z - 1;
    advance(wide, 0.5);
    expect(wide.airborne).toBe(false);
  });
  it("pays a close call for skimming a rock, and nothing for a wide berth", () => {
    const level = levelsWith((l) => getCourse(l).hazards.length > 0)[0];
    const rock = getCourse(level).hazards[0];
    const pass = (gap: number) => {
      const run = createRun(level);
      run.x = rock.x + rock.radius + 0.65 + gap;
      run.z = rock.z - 2;
      run.nextGate = run.course.gates.length;
      advance(run, 0.3);
      expect(run.crashes).toBe(0);
      return run.points.close;
    };
    expect(pass(0.4)).toBe(CLOSE_CALL_POINTS);
    expect(pass(2.5)).toBe(0);
  });
});

describe("things that move", () => {
  it("wakes each mover at its lead and meets a cruising skier at its place", () => {
    for (const kind of ["skier", "deer", "snowcat"] as const) {
      const spec = { kind, x: 0, z: 400, dir: 1 as const };
      const m = createMover(spec);
      const cruise = 30;
      stepMover(m, spec, 400 - moverLead(spec, cruise) - 1, cruise, 1 / 120);
      expect(m.phase).toBe("waiting");
      let z = 400 - moverLead(spec, cruise);
      while (z < m.z - 0.2 && m.phase !== "done") {
        stepMover(m, spec, z, cruise, 1 / 120);
        z += cruise / 120;
      }
      expect(m.phase).toBe("active");
      // A learner has skied on from where it started; the others hold their line across the slope.
      expect(Math.abs(m.z - 400)).toBeLessThan(kind === "skier" ? 3 : 0.01);
    }
  });
  it("has a deer trot out, stand and stare, then bolt the same way", () => {
    const spec = { kind: "deer" as const, x: 2, z: 300, dir: -1 as const };
    const m = createMover(spec);
    expect(m.x).toBeGreaterThan(15);
    const at = (t: number) => {
      while (m.t < t) stepMover(m, spec, 300 - 5, 30, 1 / 120);
      return m.x;
    };
    stepMover(m, spec, 300 - moverLead(spec, 30), 30, 1 / 120);
    expect(at(DEER_TROT_TIME + 0.1)).toBeCloseTo(2, 5);
    expect(m.pace).toBe(0);
    expect(at(DEER_TROT_TIME + DEER_STARE_TIME + 0.5)).toBeLessThan(-2);
  });
  it("lets a skier who holds the racing line through every level untouched by anything that moves", () => {
    for (const level of levelsWith((l) => getCourse(l).movers.length > 0)) {
      const run = createRun(level);
      const { crashes } = drive(run);
      expect(crashes, getCourse(level).name).toBe(0);
      // Every mover came out to play.
      expect(run.movers.every((m) => m.phase !== "waiting"), getCourse(level).name).toBe(true);
    }
  });
  it("tumbles a skier who runs into a mover, once", () => {
    const level = levelsWith((l) => getCourse(l).movers.some((m) => m.kind === "skier"))[0];
    const run = createRun(level);
    const spec = run.course.movers.find((m) => m.kind === "skier")!;
    run.z = spec.z - moverLead(spec, cruiseAt(run.course, spec.z)) + 1;
    run.nextGate = run.course.gates.length;
    let bumped = false;
    for (let i = 0; i < 120 * 12 && run.crashes === 0 && !run.finished; i++) {
      const m = run.movers[run.course.movers.indexOf(spec)];
      // Steer straight at it.
      stepRun(run, m ? Math.max(-1, Math.min(1, (m.x - run.x) * 0.4 - run.heading)) : 0, 1 / 120);
      bumped ||= run.fx.some((f) => f.kind === "bump");
    }
    expect(run.crashes).toBe(1);
    expect(bumped).toBe(true);
    expect(run.movers[run.course.movers.indexOf(spec)].hit).toBe(true);
  });
});

describe("the fox and the avalanche", () => {
  const races = levelsWith((l) => getCourse(l).twist === "rival"),
    slides = levelsWith((l) => getCourse(l).twist === "avalanche");
  it("runs the fox down the gate line", () => {
    const course = getCourse(races[0]);
    for (const gate of course.gates) expect(rivalLine(course, gate.z)).toBeCloseTo(gate.x, 5);
  });
  it("lets a clean run beat the fox by a little, and a sloppy one lose to him", () => {
    for (const level of races) {
      const clean = createRun(level);
      drive(clean);
      expect(clean.rivalBeaten, getCourse(level).name).toBe(true);
      expect(clean.points.twist).toBe(RIVAL_POINTS);
      // The fox was close: within 90 m of the line when the wolf crossed it.
      expect(clean.course.finishZ - clean.rival!.z).toBeLessThan(90);
      // Standing about loses the race, however the fox eases off.
      const slow = createRun(level);
      for (let i = 0; i < 120 * 200 && !slow.finished; i++) {
        const target = slow.course.gates[slow.nextGate] ?? { x: 0 };
        // Weave wastefully between the flags.
        stepRun(slow, Math.sin(slow.time * 5) * 0.9 + Math.max(-1, Math.min(1, (target.x - slow.x) * 0.05)), 1 / 120);
      }
      expect(slow.rivalBeaten).toBe(false);
      expect(slow.points.twist).toBe(0);
    }
  });
  it("lets a clean run outrun the avalanche with room to spare, and buries one that dawdles", () => {
    for (const level of slides) {
      const clean = createRun(level);
      const { minLead } = drive(clean);
      expect(clean.caught).toBe(false);
      expect(clean.passed).toBe(true);
      expect(minLead).toBeGreaterThan(30);
      expect(clean.points.twist).toBeGreaterThan(0);
      // A skier who keeps falling over is caught, for all that the slide slows while he is down.
      const clumsy = createRun(level);
      let tumbles = 0;
      for (let i = 0; i < 120 * 200 && !clumsy.finished; i++) {
        if (clumsy.crashTime === 0 && clumsy.invincible === 0 && clumsy.z > 150 + tumbles * 60) {
          clumsy.x = 21;
          tumbles++;
        }
        const target = clumsy.course.gates[clumsy.nextGate] ?? { x: 0 };
        stepRun(clumsy, Math.max(-1, Math.min(1, (target.x - clumsy.x) * 0.18 - clumsy.heading * 0.8)), 1 / 120);
      }
      expect(clumsy.caught, getCourse(level).name).toBe(true);
      expect(clumsy.stars).toBe(0);
      expect(clumsy.passed).toBe(false);
    }
  });
});
