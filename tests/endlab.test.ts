import { it } from "vitest";
import { writeFileSync } from "node:fs";
import type { EndlessCourse } from "../src/endless";
import { createEndlessRun, stepRun } from "../src/physics";
import { createPilot, SKILLS } from "../src/pilot";
import { DT } from "./helpers";

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
// A bench for the endless run: how far each stand-in player gets, and what takes the lives.
it.skipIf(!env.ENDLAB)("endless bench", () => {
  const seeds = Number(env.SEEDS ?? 10);
  const out: string[] = [];
  for (const skill of ["novice", "average", "expert", "blind"] as const) {
    const dist: number[] = [];
    const lost: Record<string, number> = {};
    const met: Record<string, number> = {};
    for (let n = 1; n <= seeds; n++) {
      const run = createEndlessRun(n * 7919);
      const pilot = createPilot(SKILLS[skill], n);
      const course = run.course as EndlessCourse;
      for (let i = 0; i < 120 * 1500 && !run.finished; i++) {
        stepRun(run, pilot.steer(run, DT), DT);
        if (run.event === "crash" || run.event === "miss") {
          const sec = course.sections.find((x) => run.s >= x.from && run.s < x.to);
          const key = (sec?.theme ?? "?") + ":" + run.event;
          lost[key] = (lost[key] ?? 0) + 1;
          if (env.DETAIL === skill) {
            const h = course.hazards.filter((x) => Math.abs(x.s - run.s) < 6).map((x) => x.kind + "@" + x.s + "/" + x.u);
            const m = run.movers.filter((x) => Math.abs(x.s - run.s) < 6).map((x) => x.kind + "@" + x.s.toFixed(0) + "/" + x.u.toFixed(1));
            const z = course.zones.filter((x) => run.s > x.s - 40 && run.s < x.s + x.length + 40).map((x) => x.kind + (x.leap ? "L" : "") + "@" + x.s + "/" + x.u);
            const half = course.trail.half[Math.round(run.s) + course.trail.lead];
            out.push(`  ${key} seed ${n} s ${run.s.toFixed(0)} u ${run.u.toFixed(1)} half ${half.toFixed(0)} v ${run.speed.toFixed(0)} air ${run.airborne} | ${h.join(" ")} | ${m.join(" ")} | ${z.join(" ")}`);
          }
        }
      }
      for (const sec of course.sections) if (sec.to < run.s) met[sec.theme] = (met[sec.theme] ?? 0) + 1;
      dist.push(Math.round(run.s));
    }
    dist.sort((a, b) => a - b);
    out.push(`${skill}: median ${dist[dist.length >> 1]}  all ${dist.join(" ")}`);
    out.push(
      "  lost per section met: " +
        Object.keys(met)
          .sort()
          .map((t) => `${t} ${(((lost[t + ":crash"] ?? 0) + (lost[t + ":miss"] ?? 0)) / met[t]).toFixed(2)} (c${lost[t + ":crash"] ?? 0}/m${lost[t + ":miss"] ?? 0}/${met[t]})`)
          .join(", "),
    );
  }
  writeFileSync(env.OUT ?? "endless.txt", out.join("\n") + "\n");
  console.log(out.join("\n"));
});
