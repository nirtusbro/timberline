import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { LEVEL_COUNT, LEVEL_DESIGNS, getCourse } from "../src/levels";
import { createRun, stepRun } from "../src/physics";
import { SKILLS, createPilot } from "../src/pilot";

/**
 * The balance sheet: every level skied many times by stand-in players of
 * different skill (and one who looks at nothing but the flags), with where
 * they miss and fall. Run with BALANCE=1 (and SEEDS=n, LEVELS=a-b); writes
 * bots.txt. Not part of the ordinary test run.
 */
const SEEDS = Number(process.env.SEEDS ?? 24);
const [FROM, TO] = (process.env.LEVELS ?? `1-${LEVEL_COUNT}`).split("-").map(Number);
it.runIf(process.env.BALANCE)("balance sheet", { timeout: 3600000 }, () => {
  const out: string[] = [];
  for (let level = FROM - 1; level < (TO || FROM); level++) {
    const c = getCourse(level),
      d = LEVEL_DESIGNS[level];
    let line = `${String(level + 1).padStart(2)} ${c.name.padEnd(18)} ${d.role.padEnd(8)} v${c.speed.toFixed(1)} w${d.baseWidth.toFixed(1)} n${String(c.gates.length).padStart(2)} L${Math.round(c.finishS)}`;
    let notes = "";
    for (const skill of Object.values(SKILLS)) {
      let clear = 0,
        stars = 0,
        three = 0,
        crashes = 0,
        misses = 0,
        time = 0,
        caught = 0,
        beaten = 0,
        off = 0,
        steps = 0;
      const missAt = c.gates.map(() => 0);
      const crashAt = new Map<number, number>();
      for (let seed = 0; seed < SEEDS; seed++) {
        const run = createRun(level, level * 1000 + seed);
        const pilot = createPilot(skill, level * 1000 + seed);
        for (let i = 0; i < 120 * 300 && !run.finished; i++) {
          const gate = run.nextGate;
          stepRun(run, pilot.steer(run, 1 / 120), 1 / 120);
          steps++;
          if (Math.abs(run.heading) > 0.44) off++;
          if (run.event === "miss" || (run.nextGate > gate && run.event === "crash")) missAt[gate]++;
          if (run.event === "crash") {
            const bin = Math.floor(run.s / 50) * 50;
            crashAt.set(bin, (crashAt.get(bin) ?? 0) + 1);
          }
        }
        clear += run.passed ? 1 : 0;
        stars += run.stars;
        three += run.stars === 3 ? 1 : 0;
        crashes += run.crashes;
        misses += run.misses;
        time += run.time;
        caught += run.caught ? 1 : 0;
        beaten += run.rivalBeaten ? 1 : 0;
      }
      const pct = (n: number) => String(Math.round((n / SEEDS) * 100)).padStart(3);
      line += ` | ${skill.name[0]} clr${pct(clear)}% ★${(stars / SEEDS).toFixed(1)} 3★${pct(three)}% cr${(crashes / SEEDS).toFixed(1)} ms${(misses / SEEDS).toFixed(1)}`;
      if (c.twist === "rival") line += ` fox${pct(beaten)}%`;
      if (c.twist === "avalanche") line += ` bur${pct(caught)}%`;
      if (skill.name === "average") {
        line += ` t${(time / SEEDS).toFixed(0)} turn${Math.round((off / steps) * 100)}%`;
        const worstGates = missAt
          .map((n, i) => [n / SEEDS, i] as const)
          .filter(([share]) => share >= 0.3)
          .sort((a, b) => b[0] - a[0])
          .slice(0, 4)
          .map(([share, i]) => `g${i}:${Math.round(share * 100)}%`);
        const worstFalls = [...crashAt]
          .filter(([, n]) => n / SEEDS >= 0.25)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([z, n]) => `s${z}:${Math.round((n / SEEDS) * 100)}%`);
        if (worstGates.length || worstFalls.length) notes = `   avg misses ${worstGates.join(" ") || "-"} · falls ${worstFalls.join(" ") || "-"}`;
      }
    }
    out.push(line + notes);
    console.log(line + notes);
  }
  writeFileSync(process.env.OUT ?? "bots.txt", out.join("\n"));
});
