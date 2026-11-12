import { driftAhead, gateU, type Run } from "./physics";
import { seededRandom } from "./random";
import { SNOWCAT_HALF } from "./movers";
import { trailAt, trailDir, trailHalf } from "./trail";

/**
 * A stand-in for a person at the controls, for balancing levels: not a
 * perfect line, but someone who sees a thing a moment late, aims a little
 * off, cannot see through fog or past the reach of a headlamp, and has to
 * guess where a moving thing will be. Several of them, of different skill,
 * ski every level many times over; what they manage is the measure of how
 * hard it is.
 *
 * It is still a model. It tells apart a level most people would clear from
 * one most would not; it does not say whether the level is fun.
 */
export interface Skill {
  name: string;
  /** Seconds between seeing and doing. */
  delay: number;
  /** How far off the middle of a gate the aim typically lands, in metres. */
  aimError: number;
  /** How far down the trail things are noticed at all, in clear air. */
  sight: number;
  /** The chance, at each gate, of a lapse: a late start on the next turn. */
  lapse: number;
  /** How much of a bank's drift is read off the snow and allowed for. */
  read: number;
  /** How much room is left round a rock, in metres beyond touching it. */
  berth: number;
  /** How well the place a moving thing will be is judged: 0 aims at where it is, 1 at where it will be. */
  lead: number;
  /** Whether rocks, trees and things that move are looked at, at all. */
  wary: boolean;
}
export const SKILLS: Record<"novice" | "average" | "expert" | "blind", Skill> = {
  novice: { name: "novice", delay: 0.34, aimError: 1.5, sight: 60, lapse: 0.1, read: 0.35, berth: 1.5, lead: 0.3, wary: true },
  average: { name: "average", delay: 0.24, aimError: 1.0, sight: 80, lapse: 0.04, read: 0.7, berth: 1.2, lead: 0.65, wary: true },
  expert: { name: "expert", delay: 0.15, aimError: 0.5, sight: 110, lapse: 0.01, read: 0.95, berth: 1.3, lead: 0.92, wary: true },
  /** An average hand that looks at nothing but the flags: what it suffers is the measure of whether the obstacles matter. */
  blind: { name: "blind", delay: 0.24, aimError: 1.0, sight: 80, lapse: 0.04, read: 0.7, berth: 1.2, lead: 0.65, wary: false },
};
/** How far each weather lets anyone see, and how far a headlamp throws. */
export const VISIBILITY = { clear: 400, snow: 95, fog: 50, blizzard: 42 } as const;
export const LAMP_REACH = 48;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** The pilot never steers at a point nearer than this: closer in, it looks through to what comes next. */
const PURSUIT = 15;

/** Makes a pilot for one run. Call `steer` once a step; it returns the input to give the skis. */
export function createPilot(skill: Skill, seed: number) {
  const random = seededRandom(seed >>> 0, 0x51ed270b);
  // Three uniform rolls make a bell curve near enough for an aim error.
  const bell = () => (random() + random() + random() - 1.5) * 2;
  const line: number[] = [];
  let aimedGate = -1,
    aimOffset = 0,
    lapseUntil = 0,
    wobble = 0,
    // The line chosen round whatever is in the way: how far to one side of the plain line, and where along the trail.
    swerve = 0,
    swerveAt = 0,
    planned = -1,
    // Where in the next gate to go through, when the middle of it would leave no way round what stands beyond.
    entry = 0,
    entryGate = -1;
  // Where each of the herd has mostly been.
  const lanes = new Map<object, number>();
  const debug = { point: { s: 0, u: 0 }, blocked: false };
  return {
    debug,
    steer(run: Run, dt: number) {
      const c = run.course,
        trail = c.trail;
      // Nothing is seen further off than the weather allows, or, at night, than the lamp reaches.
      const far = Math.min(skill.sight, VISIBILITY[c.weather], c.night ? LAMP_REACH : Infinity);
      // A new gate to aim for: pick where in it the aim will land, and perhaps dither.
      if (run.nextGate !== aimedGate) {
        aimedGate = run.nextGate;
        const gate = c.gates[aimedGate];
        aimOffset = gate ? clamp(bell() * skill.aimError, -gate.width * 0.6, gate.width * 0.6) : 0;
        if (entryGate !== aimedGate) entry = 0;
        if (random() < skill.lapse) lapseUntil = run.time + 0.25 + random() * 0.3;
      }
      const gate = c.gates[run.nextGate];
      const speed = Math.max(8, run.speed);
      /** Where a gate is aimed at: where it will be on arrival, as well as that can be judged; the nearer opening of a fork. */
      const mark = (g: (typeof c.gates)[number], offset: number) => {
        const when = (g.s - run.s) / speed;
        const now = gateU(g, run.time, run.gateShift),
          then = gateU(g, run.time + when, run.gateShift);
        const u = now + (then - now) * skill.lead;
        return (g.alt !== undefined && Math.abs(g.alt - run.u) < Math.abs(u - run.u) ? g.alt : u) + offset;
      };
      // The next flags, if they can be seen; if not, the middle of the trail as far as can be.
      const goal = { s: Math.min(c.finishS + 30, run.s + Math.min(far, 45)), u: 0 };
      let seen = false;
      if (gate && gate.s - run.s <= far) {
        goal.s = gate.s;
        goal.u = mark(gate, aimOffset) + entry;
        seen = true;
      } else if (!gate) goal.s = c.finishS + 30;
      // A leap before the flags: it is the kicker that is steered for, or there are no flags.
      const kicker = c.zones.find((zone) => zone.leap && zone.s + zone.length > run.s && zone.s < goal.s && zone.s - run.s <= far);
      if (kicker && !run.airborne) {
        goal.s = kicker.s + kicker.length;
        goal.u = kicker.u + clamp(aimOffset * 0.5, -1.5, 1.5);
      }
      // And what comes after them.
      const after = c.gates[run.nextGate + 1];
      const next = seen && after ? { s: after.s, u: after.s - run.s <= far ? mark(after, 0) : goal.u * 0.5 } : { s: goal.s + 40, u: goal.u * 0.5 };
      goal.u -= skill.read * driftAhead(c, run.u, run.s, run.slip, run.speed, Math.min(goal.s, run.s + far));
      // Ice on a traverse slides the skis toward the fall line: a practised hand goes in high.
      for (const zone of c.zones) {
        if (zone.kind !== "ice" || zone.s + zone.length < run.s || zone.s > goal.s || zone.s - run.s > far) continue;
        const from = Math.max(run.s, zone.s),
          to = Math.min(goal.s, zone.s + zone.length);
        if (to <= from) continue;
        const lost = Math.sin(trailDir(trail, (from + to) / 2)) * (1 - Math.exp((-0.4 * (to - from)) / speed));
        goal.u += skill.read * lost * ((to - from) * 0.5 + (goal.s - to) * 0.8);
      }
      // The plain line: to the flags, and on from them toward the next.
      const plain = (s: number) =>
        s <= goal.s
          ? run.u + (goal.u - run.u) * clamp((s - run.s) / Math.max(1, goal.s - run.s), 0, 1)
          : goal.u + (next.u - goal.u) * clamp((s - goal.s) / Math.max(1, next.s - goal.s), 0, 1);
      // A swerve is a bulge in that line, to one side, about a place along the trail.
      const reach = Math.max(16, speed * 0.75);
      const bulge = (s: number, at: number) => {
        // What stands beyond the flags is swerved for beyond the flags: the line through them is left alone.
        const span = at > goal.s + 2 && s <= at ? Math.max(4, Math.min(reach, at - goal.s)) : reach;
        const t = Math.abs(s - at) / span;
        return t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * t);
      };
      if (skill.wary && !run.airborne && run.time >= planned) {
        planned = run.time + 0.08;
        const horizon = Math.min(far, Math.max(40, speed * 1.9));
        // Everything in the way, or that will be: where along the trail it is met, where across, how much room it needs, and which way it is going.
        const things: { s: number; u: number; half: number; going: number }[] = [];
        for (let i = run.hazardCursor; i < c.hazards.length; i++) {
          const h = c.hazards[i];
          if (h.s > run.s + horizon) break;
          if (h.s < run.s + 1) continue;
          // A rock with a kicker before it is flown, not dodged, if the skier is lined up for the kicker.
          if (c.zones.some((zone) => zone.kind === "ramp" && zone.s + zone.length > run.s && zone.s < h.s && h.s - zone.s < 36 && Math.abs(zone.u - plain(zone.s + zone.length)) < zone.halfWidth - 0.5))
            continue;
          things.push({ s: h.s, u: h.u, half: h.radius + 0.65 + skill.berth, going: 0 });
        }
        for (const [index, m] of run.movers.entries()) {
          if (m.phase !== "active" || m.hit || m.s < run.s + 1 || m.s - run.s > Math.min(far, m.kind === "boulder" ? 90 : 70)) continue;
          const along = m.kind === "plough" ? -m.pace : m.kind === "skier" || m.kind === "herd" ? m.pace : 0;
          const when = (m.s - run.s) / Math.max(5, run.speed - along);
          if (when > 2.6) continue;
          let going = m.drift;
          let there = m.u + going * when * skill.lead;
          if (m.kind === "deer" && m.pace < 2) {
            // A deer that has not bolted yet will be standing on the racing line, or just leaving it the way it was going:
            // that much is learned the first time. The only safe side is the one it came from.
            const stop = c.movers[index].u;
            there = m.u + (stop - m.u) * Math.max(0.5, skill.lead);
            going = Math.sign(Math.sin(m.heading - m.rot)) * 4;
          }
          let half = (m.kind === "snowcat" ? SNOWCAT_HALF : 0) + m.radius + 0.65 + skill.berth;
          if (m.kind === "herd") {
            // A deer of the herd jinks about a lane: it is the lane that is given room, not the deer of the moment.
            const was = lanes.get(m) ?? m.u;
            const lane = was + (m.u - was) * 0.1;
            lanes.set(m, lane);
            there = lane;
            going = 0;
            half += 1;
          }
          // The less sure where it will be, the more room it is given.
          half += Math.abs(going) * when * (1.15 - skill.lead) * 0.5;
          things.push({ s: m.s + along * when, u: there, half, going });
          // Something being caught up slowly is in the way where it is now, too, all the while it is being passed.
          if (along > 0 && m.s - run.s < 30) things.push({ s: m.s, u: m.kind === "herd" ? there : m.u, half, going });
        }
        const cost = (k: number, at: number) => {
          let n = Math.abs(k) * 0.5 + (Math.sign(k) !== Math.sign(swerve) || Math.abs(at - swerveAt) > 12 ? 1.5 : 0);
          for (const t of things) {
            const u = plain(t.s) + k * bulge(t.s, at);
            const gap = Math.abs(u - t.u);
            if (gap < t.half) n += 60 + (t.half - gap) * 20;
            // Across the bows of something that is crossing is no place to be.
            else if (t.going && Math.sign(u - t.u) === Math.sign(t.going) && gap < t.half + Math.abs(t.going) * 0.7) n += 25;
          }
          // The flags still count, and so does staying on the snow.
          if (gate && seen) {
            const off = Math.abs(plain(goal.s) + k * bulge(goal.s, at) - (goal.u - aimOffset - entry)) - (gate.width / 2 - 0.9);
            if (off > 0) n += 30 + off * 6;
          }
          for (let s = at - reach / 2; s <= at + reach / 2; s += reach / 2) {
            const over = Math.abs(plain(s) + k * bulge(s, at)) - (trailHalf(trail, s) - 1.5);
            if (over > 0) n += 40 + over * 8;
          }
          return n;
        };
        let best = cost(0, swerveAt),
          pick = 0,
          pickAt = swerveAt;
        // Is anything actually standing on the plain line?
        const blocked = things.some((t) => Math.abs(plain(t.s) - t.u) < t.half + (t.going ? Math.abs(t.going) * 0.7 : 0));
        if (!blocked) best = 0;
        if (best >= 25) {
          // Something is in the way of the plain line: try going round each thing, either side, near and wide.
          for (const t of things) {
            if (Math.abs(plain(t.s) - t.u) > t.half + 6) continue;
            for (const side of [-1, 1])
              for (const extra of [0.4, 2.2, 4.5]) {
                const k = t.u + side * (t.half + extra) - plain(t.s);
                const n = cost(k, t.s);
                if (n < best) {
                  best = n;
                  pick = k;
                  pickAt = t.s;
                }
              }
          }
        }
        // Still no clean way through, and the flags are yet to come: go through them to one side, to open the line beyond. A practised hand thinks of this; a beginner does not.
        if (best >= 25 && gate && seen && skill.lead > 0.5 && goal.s - run.s > 12) {
          const was = entry,
            base = goal.u - entry;
          for (const e of [gate.width / 2 - 1.3, -(gate.width / 2 - 1.3)]) {
            goal.u = base + e;
            entry = e;
            let found = Infinity,
              k = 0,
              at = 0;
            for (const t of things) {
              if (Math.abs(plain(t.s) - t.u) > t.half + 6) continue;
              for (const side of [0, -1, 1]) {
                const tryK = side ? t.u + side * (t.half + 0.6) - plain(t.s) : 0;
                const n = cost(tryK, t.s) + 2;
                if (n < found) {
                  found = n;
                  k = tryK;
                  at = t.s;
                }
              }
            }
            // Only a clean way through is worth giving up the middle of the gate for.
            if (found < 25) {
              best = found;
              pick = k;
              pickAt = at;
              entryGate = aimedGate;
              break;
            }
            entry = was;
            goal.u = base + was;
          }
        }
        swerve = pick;
        swerveAt = pickAt;
      }
      if (!skill.wary || run.airborne) swerve = 0;
      // Steer for a point a little way down the chosen line.
      // The better the skier, the further down the line the eyes are: a turn begun early is a turn the edges can hold.
      let ahead = run.s + Math.max(PURSUIT, speed * (0.45 + 0.4 * skill.lead));
      // With the flags inside that reach, it is the flags that are steered for, until they are all but underfoot.
      if (seen && goal.s < ahead) ahead = Math.max(goal.s, run.s + PURSUIT);
      const point = { s: ahead, u: plain(ahead) + swerve * bulge(ahead, swerveAt) };
      debug.point = point;
      debug.blocked = swerve !== 0;
      const room = trailHalf(trail, point.s) - 1;
      const at = trailAt(trail, point.s, clamp(point.u, -room, room));
      const want = Math.atan2(at.x - run.x, at.z - run.z);
      // What is seen is acted on a reaction time later: the plan lags, the hand that follows it does not.
      line.push(run.time < lapseUntil ? (line[line.length - 1] ?? want) : want);
      const lag = Math.round(skill.delay / dt);
      while (line.length > lag + 1) line.shift();
      // And the hand is never quite still: a slow wobble, larger in the less practised.
      wobble += (bell() * skill.aimError * 0.035 - wobble) * Math.min(1, dt * 2.5);
      return clamp((line[0] - run.aim) / c.turnAngle + wobble, -1, 1);
    },
  };
}
