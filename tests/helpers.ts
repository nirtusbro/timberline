import { clamp, cruiseAt, driftAhead, stepRun, type Run } from "../src/physics";
import { ROCK_GATE_HALF } from "../src/levels";
import { SNOWCAT_HALF, stepMover } from "../src/movers";

/**
 * A relaxed steering controller using only normal input: aim at the next gate
 * or pickup with a proportional turn and a little heading damping, steer
 * around any rock or tree that sits on that aim line, pass behind anything
 * that moves, and aim upslope of the target by the drift a bank on the way
 * will add, the way a player would.
 */
export function drive(run: Run, gain = 0.18, damping = 0.8, dodge = false) {
  const c = run.course;
  // A rock gate (two rocks level with each other, a gap apart) is threaded
  // through its middle, so the gap is a waypoint on the way to the flags.
  const gaps = c.hazards.flatMap((a) =>
    c.hazards
      .filter((b) => b.z === a.z && Math.abs(b.x - a.x - 2 * ROCK_GATE_HALF) < 0.2)
      .map((b) => ({ x: (a.x + b.x) / 2, z: a.z, gate: false })),
  );
  const targets = [
    ...c.gates.map((g) => ({ x: g.x, z: g.z, gate: true })),
    ...c.tokens.map((s) => ({ x: s.x, z: s.z, gate: false })),
    // A Double is worth going for; the other power-ups are taken if they are on the way.
    ...c.powers.filter((s) => s.kind === "double").map((s) => ({ x: s.x, z: s.z, gate: false })),
    ...gaps,
  ].sort((a, b) => a.z - b.z);
  let next = 0,
    crashes = 0,
    worstMargin = Infinity,
    minLead = Infinity;
  for (let tick = 0; tick < 120 * 180 && !run.finished; tick++) {
    while (next < targets.length && run.z >= targets[next].z) next++;
    const target = targets[next] ?? { x: 0, z: c.finishZ, gate: true };
    // The skid under way and the banks between here and the target will carry
    // the skier sideways; a skier reads that off the snow ahead and aims upslope.
    const driftTo = (z: number) => driftAhead(c, run.x, run.z, run.slip, run.speed, z);
    let aimX = target.x - driftTo(target.z);
    // Swerve around the nearest hazard that the current aim line would hit,
    // passing it on whichever side keeps closer to the target.
    // Where the current line will be when it reaches a hazard: converging on
    // the aim point over roughly 25 metres, and carried by any bank on the way.
    const pathX = (z: number) =>
      run.x + (aimX - run.x) * clamp((z - run.z) / 25, 0, 1) + driftTo(z);
    const blocker = run.airborne
      ? undefined
      : c.hazards
          .filter(
            (h) =>
              h.z > run.z + 2 &&
              h.z < Math.min(run.z + 30, target.z + 4) &&
              Math.abs(h.x - pathX(h.z)) < h.radius + 1.7 &&
              // A rock with a ramp before it is jumped, not dodged.
              !c.zones.some(
                (zone) =>
                  zone.kind === "ramp" &&
                  zone.z + zone.length > run.z &&
                  zone.z < h.z &&
                  h.z - zone.z < 22 &&
                  Math.abs(zone.x - h.x) < 2.5,
              ),
          )
          .sort((a, b) => a.z - b.z)[0];
    if (blocker) {
      const side =
        Math.sign(run.x - blocker.x) || Math.sign(target.x - blocker.x) || 1;
      aimX = blocker.x + side * (blocker.radius + 2.3);
    }
    // Movers: look ahead to where each one will be when the skier draws level
    // with it, and if that is on the line, go round behind it.
    for (let i = 0; dodge && i < run.movers.length; i++) {
      const m = run.movers[i];
      if (m.phase !== "active" || m.hit || m.z < run.z + 1 || m.z > run.z + 45) continue;
      const ghost = { ...m };
      let z = run.z;
      for (let k = 0; k < 40 && z < ghost.z; k++) {
        stepMover(ghost, c.movers[i], z, cruiseAt(c, z), 0.05);
        z += run.speed * 0.05;
      }
      const half = (m.kind === "snowcat" ? SNOWCAT_HALF : 0) + m.radius + 1.3;
      if (Math.abs(ghost.x - pathX(ghost.z)) > half) continue;
      // Behind a deer or a cat is the side it came from; round a learner, the nearer side.
      const moving = Math.sign(ghost.x - m.x);
      const side = m.kind === "skier" || !moving ? Math.sign(run.x - ghost.x) || 1 : -moving;
      aimX = ghost.x + side * (half + 0.6);
    }
    const dx = aimX - run.x;
    const prevX = run.x,
      prevZ = run.z;
    stepRun(run, clamp(dx * gain - run.heading * damping, -1, 1), 1 / 120);
    if (run.event === "crash") crashes++;
    if (!Number.isNaN(run.avalancheZ) && run.time > 3) minLead = Math.min(minLead, run.z - run.avalancheZ);
    for (const g of c.gates)
      if (prevZ < g.z && run.z >= g.z) {
        const t = (g.z - prevZ) / (run.z - prevZ);
        const cx = prevX + (run.x - prevX) * t;
        worstMargin = Math.min(worstMargin, g.width / 2 - Math.abs(cx - g.x));
      }
  }
  return { crashes, worstMargin, minLead };
}
