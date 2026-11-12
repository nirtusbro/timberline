import { it } from "vitest";
import { createRun, stepRun } from "../src/physics";
import { SKILLS, createPilot } from "../src/pilot";
/** A bench for looking at one level closely: LAB=1 LEVEL=n SKILL=expert. Prints every tumble and missed gate with what was near. */
it.runIf(process.env.LAB)("lab", () => {
  const level = Number(process.env.LEVEL ?? 2);
  const out: string[] = [];
  for (let seed = 0; seed < Number(process.env.SEEDS ?? 4); seed++) {
    const run = createRun(level, level * 1000 + seed);
    const pilot = createPilot(SKILLS[(process.env.SKILL ?? "expert") as "expert"], level * 1000 + seed);
    for (let i = 0; i < 120 * 300 && !run.finished; i++) {
      const air = run.airborne;
      stepRun(run, pilot.steer(run, 1 / 120), 1 / 120);
      if (run.event === "crash") {
        const h = run.course.hazards.filter((x) => Math.abs(x.s - run.s) < 4).map((x) => `rock(${x.s.toFixed(0)},${x.u.toFixed(1)})`);
        const m = run.movers.filter((x) => x.phase === "active" && Math.abs(x.s - run.s) < 4).map((x) => `${x.kind}(${x.s.toFixed(0)},${x.u.toFixed(1)},d${x.drift.toFixed(1)})`);
        const z = run.course.zones.filter((x) => run.s > x.s - 40 && run.s < x.s + x.length + 40).map((x) => `${x.kind}@${x.s}`);
        out.push(`seed ${seed} CRASH s${run.s.toFixed(0)} u${run.u.toFixed(1)} v${run.speed.toFixed(0)} ${air ? "air" : ""} ${h.join(" ")} ${m.join(" ")} ${z.join(" ")}`);
      }
      if (run.event === "miss") {
        const g = run.course.gates[run.nextGate - 1];
        out.push(`seed ${seed} MISS g${run.nextGate - 1} s${g.s} gate u${g.u.toFixed(1)} skier u${run.u.toFixed(1)} v${run.speed.toFixed(0)} ${run.onIce ? "ice" : ""}`);
      }
    }
    out.push(`seed ${seed} done t${run.time.toFixed(1)} stars${run.stars} ${run.caught ? "BURIED" : ""} ${run.rival ? (run.rivalBeaten ? "fox beaten" : "fox won") : ""}`);
  }
  console.log(out.join("\n"));
});
import { getCourse } from "../src/levels";
import { trailDir } from "../src/trail";
/** GATES=1 LEVEL=n: lists a level's gates with the trail direction and what stands in each stretch. */
it.runIf(process.env.GATES)("gates", () => {
  const c = getCourse(Number(process.env.LEVEL ?? 0));
  const rows = c.gates.map((g, i) => {
    const next = c.gates[i + 1]?.s ?? c.finishS;
    const h = c.hazards.filter((x) => x.s >= g.s && x.s < next && !x.wall).map((x) => `r(${(x.s - g.s).toFixed(0)},${x.u.toFixed(1)})`);
    const z = c.zones.filter((x) => x.s >= g.s && x.s < next).map((x) => `${x.kind}(${(x.s - g.s).toFixed(0)}+${x.length.toFixed(0)},u${x.u})`);
    const sl = c.slopes.filter((x) => x.from >= g.s && x.from < next).map((x) => `${x.kind}${x.dir}`);
    const m = c.movers.filter((x) => x.s >= g.s && x.s < next).map((x) => `${x.kind}(${(x.s - g.s).toFixed(0)},${x.u})`);
    return `g${i} s${g.s} u${g.u.toFixed(1)} w${g.width} dir${((trailDir(c.trail, g.s) * 180) / Math.PI).toFixed(0)} gap${(next - g.s).toFixed(0)} ${g.drift ? "MOVES" : ""} ${[...h, ...z, ...sl, ...m].join(" ")}`;
  });
  console.log(rows.join("\n"));
});
import { LEVEL_COUNT, gateDemands } from "../src/levels";
const demands = (level: number) => gateDemands(getCourse(level).trail, getCourse(level).gates, getCourse(level).speed);
it.runIf(process.env.DEMAND)("demand", () => {
  const out: string[] = [];
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const d = demands(level);
    const worst = d.map((x, i) => [x, i] as const).sort((p, q) => q[0] - p[0]).slice(0, 4);
    out.push(`${String(level + 1).padStart(2)} ${getCourse(level).name.padEnd(18)} mean ${(d.reduce((p, q) => p + q, 0) / d.length).toFixed(2)} max ${worst.map(([x, i]) => `g${i}:${x.toFixed(2)}`).join(" ")}`);
  }
  console.log(out.join("\n"));
});
import { writeFileSync } from "node:fs";
import { LEVEL_DESIGNS } from "../src/levels";
it.runIf(process.env.MEANS)("means", () => {
  writeFileSync(process.env.MEANS!, JSON.stringify(LEVEL_DESIGNS.map((d, level) => ({ role: d.role, mean: demands(level).reduce((p, q) => p + q, 0) / demands(level).length }))));
});
it.runIf(process.env.FEEL)("feel", () => {
  const out: string[] = [];
  for (const level of [0, 4, 8, 16, 26, 32, 39]) {
    const idle = createRun(level, 1);
    for (let i = 0; i < 120 * 300 && !idle.finished; i++) stepRun(idle, 0, 1 / 120);
    const run = createRun(level, 1);
    const pilot = createPilot(SKILLS.expert, 1);
    let n = 0, sum = 0, sq = 0, off = 0, head = 0, minX = 0, maxX = 0;
    for (let i = 0; i < 120 * 300 && !run.finished; i++) {
      stepRun(run, pilot.steer(run, 1 / 120), 1 / 120);
      if (run.time < 4) continue;
      n++; sum += run.speed; sq += run.speed * run.speed; head += Math.abs(run.heading);
      if (Math.abs(run.heading) > 0.44) off++;
      minX = Math.min(minX, run.x); maxX = Math.max(maxX, run.x);
    }
    const mean = sum / n;
    out.push(`L${level + 1} idle: ${idle.hits}/${idle.course.gates.length} gates, ${idle.crashes} falls | expert: speed ${mean.toFixed(1)} sd ${(Math.sqrt(sq / n - mean * mean) / mean * 100).toFixed(0)}% mean|heading| ${((head / n) * 180 / Math.PI).toFixed(0)}deg, ${Math.round(off / n * 100)}% of time >25deg off fall line, world x range ${minX.toFixed(0)}..${maxX.toFixed(0)} m`);
  }
  console.log(out.join("\n"));
});
/** TRACE=1 LEVEL=n SKILL=x FROM=s TO=s: prints the skier and the pilot's aim between two points of the trail. */
it.runIf(process.env.TRACE)("trace", () => {
  const level = Number(process.env.LEVEL ?? 0);
  const run = createRun(level, level * 1000);
  const pilot = createPilot(SKILLS[(process.env.SKILL ?? "expert") as "expert"], level * 1000);
  const out: string[] = [];
  for (let i = 0; i < 120 * 300 && !run.finished && run.s < Number(process.env.TO); i++) {
    const input = pilot.steer(run, 1 / 120);
    stepRun(run, input, 1 / 120);
    if (run.s > Number(process.env.FROM) && i % 12 === 0) {
      const m = run.movers.filter((x) => x.phase === "active" && x.s > run.s - 3 && x.s < run.s + 80).map((x) => `${x.kind}(${x.s.toFixed(0)},${x.u.toFixed(1)},t${x.t.toFixed(1)})`);
      out.push(`t${run.time.toFixed(1)} s${run.s.toFixed(0)} u${run.u.toFixed(1)} v${run.speed.toFixed(0)} in${input.toFixed(2)} pt(${pilot.debug.point.s.toFixed(0)},${pilot.debug.point.u.toFixed(1)})${pilot.debug.blocked ? "B" : ""} gate${run.nextGate}@${run.course.gates[run.nextGate]?.s},${run.course.gates[run.nextGate]?.u.toFixed(1)} half${trailHalf(run.course.trail, run.s).toFixed(0)} ${run.event} ${m.join(" ")}`);
    }
  }
  console.log(out.join("\n"));
});
import { trailHalf } from "../src/trail";
/** SOFT=<file>: finds, per level, the gates the expert misses in most runs, and writes them out. */
it.runIf(process.env.SOFT)("soft", { timeout: 600000 }, () => {
  const found: Record<number, number[]> = {};
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const c = getCourse(level);
    const missed = c.gates.map(() => 0);
    const seeds = 8;
    for (let seed = 0; seed < seeds; seed++) {
      const run = createRun(level, level * 1000 + seed + 50);
      const pilot = createPilot(SKILLS.expert, level * 1000 + seed + 50);
      for (let i = 0; i < 120 * 300 && !run.finished; i++) {
        const gate = run.nextGate;
        stepRun(run, pilot.steer(run, 1 / 120), 1 / 120);
        if (run.event === "miss") missed[gate]++;
      }
    }
    const hard = missed.map((n, i) => (n / seeds >= 0.5 ? i : -1)).filter((i) => i >= 0);
    if (hard.length) found[level] = hard;
  }
  writeFileSync(process.env.SOFT!, JSON.stringify(found));
});
/** SPREAD=1: how far across the trail the gates stand, and what a skier who never steers takes of them. */
it.runIf(process.env.SPREAD)("spread", () => {
  const out: string[] = [];
  for (let w = 0; w < 5; w++) {
    let u = 0, n = 0, hits = 0, gates = 0, step = 0, steps = 0;
    for (let level = w * 8; level < w * 8 + 8; level++) {
      const c = getCourse(level);
      c.gates.forEach((g, i) => { u += Math.abs(g.u); n++; if (i) { step += Math.abs(g.u - c.gates[i - 1].u); steps++; } });
      const run = createRun(level, 7);
      for (let i = 0; i < 120 * 300 && !run.finished; i++) stepRun(run, 0, 1 / 120);
      hits += run.hits; gates += c.gates.length;
    }
    out.push(`W${w + 1} mean |u| ${(u / n).toFixed(1)} m, mean gate-to-gate swing ${(step / steps).toFixed(1)} m, no-steer takes ${Math.round(hits / gates * 100)}% of gates`);
  }
  console.log(out.join("\n"));
});
/** ACE=1: can the fox be beaten at all? A near-perfect hand (every gate through the middle) on each race. */
it.runIf(process.env.ACE)("ace", () => {
  const ace = { ...SKILLS.expert, name: "ace", delay: 0.08, aimError: 0.15, lapse: 0 };
  const out: string[] = [];
  for (const level of [7, 15, 23, 30, 37]) {
    let won = 0, bulls = 0, falls = 0, margin = 0;
    const n = 8;
    for (let seed = 0; seed < n; seed++) {
      const run = createRun(level, seed + 900);
      const pilot = createPilot(ace, seed + 900);
      for (let i = 0; i < 120 * 300 && !run.finished; i++) stepRun(run, pilot.steer(run, 1 / 120), 1 / 120);
      won += run.rivalBeaten ? 1 : 0; bulls += run.bullseyes / run.course.gates.length; falls += run.crashes;
      margin += run.rival ? run.s - run.rival.s : 0;
    }
    out.push(`L${level + 1} ace beats fox ${won}/${n}, bullseyes ${(bulls / n * 100).toFixed(0)}% of gates, tumbles ${(falls / n).toFixed(1)}, mean margin at finish ${(margin / n).toFixed(0)} m`);
  }
  console.log(out.join("\n"));
});
