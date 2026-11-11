import type { Coin, Gate, Hazard, MoverKind, PowerKind, PowerSpot, Stretch, TokenSpot, Twist, Weather, Zone } from "./levels";
import { SNOWCAT_LEAD, SNOWCAT_REACH, SNOWCAT_SPEED, type MoverSpec } from "./movers";

/**
 * What a level has beyond flags and rock, as authored: each list names the
 * stretches (gate n to gate n+1) that hold a thing, and the builder places it
 * on that stretch's racing line by the same rules everywhere, so a ramp or an
 * ice sheet always reads the same way.
 */
export interface ExtrasDesign {
  /** Stretches with a trail of coins down the racing line (bending out to the gold token, if the stretch has one). */
  coins: number[];
  /** Stretches with a jump on the racing line and coins hung in the air beyond it. A rock on the line is what it jumps. */
  ramps: number[];
  /** Stretches glazed with ice from just past the gate to just short of the next. */
  ice: number[];
  /** Power-ups floating on the racing line: the stretch and what it holds. */
  powers: [stretch: number, kind: PowerKind][];
  /**
   * Things that move: the stretch where the skier meets it, what it is, where
   * across the slope (for a deer, where it stops to stare; left out, the
   * racing line) and which way it first goes (left out, toward the next gate).
   */
  movers: [stretch: number, kind: MoverKind, x?: number, dir?: 1 | -1][];
  /** A level with its own rule: a race against the fox, a run from an avalanche, a slope of gold. */
  twist: Twist;
  weather: Weather;
  rivalPace: number;
  avalanchePace: number;
}
export const EXTRAS_BASE: ExtrasDesign = {
  coins: [],
  ramps: [],
  ice: [],
  powers: [],
  movers: [],
  twist: "",
  weather: "clear",
  rivalPace: 0.9,
  avalanchePace: 0.86,
};

/** Small coins: this many points and one coin each, picked up within this reach (wider with a magnet). */
export const COIN_POINTS = 10;
export const COIN_REACH = 1.5;
export const MAGNET_REACH = 7;
/** How long each power-up lasts; a shield lasts until it is used. */
export const MAGNET_TIME = 9;
export const DOUBLE_TIME = 8;
export const POWER_REACH = 2.2;
/** A ramp: this long and half this wide, with a lip this high. */
export const RAMP_LENGTH = 7;
export const RAMP_HALF = 2.4;
export const RAMP_LIP = 1.1;
/** A jump aims to carry about this far, for between these times in the air. */
export const JUMP_REACH = 25;
export const JUMP_MIN_TIME = 0.5;
export const JUMP_MAX_TIME = 0.8;
export const JUMP_GRAVITY = 22;
/** Points for landing a jump. */
export const AIR_POINTS = 100;
/** Above this height the skier clears rocks, trees, deer and learners. */
export const CLEAR_HEIGHT = 0.9;
/** A bullseye fires a carve boost: this much extra speed that fades over this long. Chained bullseyes keep it lit. */
export const BOOST_TIME = 1.8;
export const BOOST_SPEED = 4;
/** The boost is whole on courses that cruise below this speed, and shrinks in proportion above it. */
export const BOOST_FULL_BELOW = 28;
/** An ice sheet is half this wide. On it the skis answer the steering this much and run this much faster. */
export const ICE_HALF = 7;
export const ICE_STEER = 0.3;
export const ICE_SPEED = 3;
/** Ice starts this far past a gate and stops this far short of the next. */
export const ICE_LEAD = 12;
export const ICE_TAIL = 12;
/** Skimming a rock, tree or mover this closely without touching it pays this. */
export const CLOSE_CALL_GAP = 1.0;
export const CLOSE_CALL_POINTS = 50;
/** A deer stops to stare this far short of the racing line. */
export const DEER_STANDOFF = 6;
/** A learner weaves about a lane this far off the racing line; a snowcat is this far off it when the skier arrives. */
export const LEARNER_BERTH = 5;
export const SNOWCAT_BERTH = 6.5;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** Beating the fox to the line pays this. */
export const RIVAL_POINTS = 1000;

/** The height of a ramp's snow above the piste at a point: a wedge that rises to its lip. */
export function rampHeight(zones: readonly Zone[], x: number, z: number) {
  for (const zone of zones) {
    if (zone.kind !== "ramp" || z < zone.z || z > zone.z + zone.length + 0.6) continue;
    const across = Math.abs(x - zone.x);
    if (across > zone.halfWidth) continue;
    const along = Math.min(1, (z - zone.z) / zone.length);
    // Rounded shoulders, so the wedge reads as packed snow rather than a box.
    const shoulder = Math.min(1, (zone.halfWidth - across) / 0.5);
    return z > zone.z + zone.length ? 0 : RAMP_LIP * along * along * shoulder;
  }
  return 0;
}
/** The zone of a kind under a point, if any. */
export function zoneAt(zones: readonly Zone[], kind: Zone["kind"], x: number, z: number) {
  for (const zone of zones)
    if (
      zone.kind === kind &&
      z >= zone.z &&
      z <= zone.z + zone.length &&
      Math.abs(x - zone.x) <= zone.halfWidth
    )
      return zone;
  return undefined;
}
/** How long a jump launched at a speed stays in the air, and the upward speed that gives it. */
export function jumpFor(speed: number) {
  const time = Math.max(JUMP_MIN_TIME, Math.min(JUMP_MAX_TIME, JUMP_REACH / Math.max(1, speed)));
  return { time, vy: ((JUMP_GRAVITY / 2) * time * time - RAMP_LIP) / time };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Places a level's coins, zones, power-ups and movers from its authored lists. */
export function buildExtras(
  design: ExtrasDesign,
  gates: readonly Gate[],
  stretches: readonly Stretch[],
  tokens: readonly TokenSpot[],
  hazards: readonly Hazard[],
  finishZ: number,
  speed: number,
) {
  const coins: Coin[] = [],
    zones: Zone[] = [],
    powers: PowerSpot[] = [],
    movers: MoverSpec[] = [];
  const ends = (index: number) => {
    const from = gates[index],
      to = gates[index + 1] ?? { x: gates[index].x * 0.4, z: finishZ - 20 };
    return { from, to, length: to.z - from.z };
  };
  const lineX = (index: number, z: number) => {
    const { from, to, length } = ends(index);
    return from.x + ((to.x - from.x) * (z - from.z)) / length;
  };
  /** Coins every few metres along a path, never on a rock. */
  const trail = (points: [x: number, z: number][], spacing = 4.5) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const [ax, az] = points[i],
        [bx, bz] = points[i + 1];
      const count = Math.max(1, Math.round((bz - az) / spacing));
      for (let k = 0; k < count; k++) {
        const f = k / count,
          x = ax + (bx - ax) * f,
          z = az + (bz - az) * f;
        if (hazards.some((h) => Math.hypot(h.x - x, h.z - z) < h.radius + 1.6)) continue;
        coins.push({ x: round(x), z: round(z), y: 0 });
      }
    }
  };
  const rampAt = new Map<number, Zone>();
  for (const index of design.ramps) {
    const { from, length } = ends(index);
    // The lip sits 9 m short of a rock on the line, or 30% of the way along.
    const rock = hazards.find(
      (h) => h.z > from.z + 18 && h.z < from.z + length - 8 && Math.abs(h.x - lineX(index, h.z)) < 1.5,
    );
    const lip = rock ? rock.z - 8 : from.z + Math.max(16, length * 0.32);
    const zone: Zone = {
      kind: "ramp",
      x: round(lineX(index, lip - RAMP_LENGTH / 2)),
      z: Math.round(lip - RAMP_LENGTH),
      halfWidth: RAMP_HALF,
      length: RAMP_LENGTH,
    };
    zones.push(zone);
    rampAt.set(index, zone);
    // Coins hang along the flight of a jump taken at cruising speed down the line.
    const { time, vy } = jumpFor(speed);
    for (let k = 1; k <= 5; k++) {
      const t = (time * k) / 6,
        z = lip + speed * t;
      coins.push({
        x: round(lineX(index, z)),
        z: round(z),
        y: round(RAMP_LIP + vy * t - (JUMP_GRAVITY / 2) * t * t),
      });
    }
  }
  for (const index of design.ice) {
    const { from, length } = ends(index);
    const z = from.z + ICE_LEAD,
      span = length - ICE_LEAD - ICE_TAIL;
    zones.push({ kind: "ice", x: round(lineX(index, z + span / 2)), z, halfWidth: ICE_HALF, length: span });
  }
  const paved = design.twist === "goldrush";
  for (const index of design.coins) {
    const { from, to, length } = ends(index);
    if (paved) {
      for (const offset of [-1.6, 1.6])
        trail(
          [
            [lineX(index, from.z + length * 0.2) + offset, from.z + length * 0.2],
            [lineX(index, to.z - length * 0.2) + offset, to.z - length * 0.2],
          ],
          3.2,
        );
      continue;
    }
    const token = tokens.find((t) => t.stretch === index);
    if (token)
      // Out to the gold and back: the trail shows the wide line.
      trail([
        [from.x + (token.x - from.x) * 0.3, from.z + (token.z - from.z) * 0.3],
        [token.x - (token.x - from.x) * 0.12, token.z - 4.5],
      ]);
    else
      trail([
        [lineX(index, from.z + length * 0.28), from.z + length * 0.28],
        [lineX(index, to.z - length * 0.24), to.z - length * 0.24],
      ]);
  }
  for (const [index, kind] of design.powers) {
    const { from, length } = ends(index);
    const z = Math.round(from.z + length * 0.55);
    // On the racing line, or beside the rock if one sits there.
    let x = lineX(index, z);
    const rock = hazards.find((h) => Math.hypot(h.x - x, h.z - z) < h.radius + 2.6);
    if (rock) x = rock.x + (Math.sign(x - rock.x) || Math.sign(from.x) || 1) * (rock.radius + 3);
    powers.push({ kind, x: round(x), z });
  }
  for (const [index, kind, x, dir] of design.movers) {
    const { from, to, length } = ends(index);
    const z = Math.round(from.z + length * (kind === "deer" ? 0.6 : 0.5));
    const toward = (dir ?? (Math.sign(to.x - from.x) || 1)) as 1 | -1;
    // Left to itself, a mover is placed so that a skier who holds the racing
    // line at cruising speed goes by it untouched, but only just: a deer stops
    // short of the line to stare and bolts across it early; a snowcat has just
    // crawled off the line when the skier arrives; a learner wobbles beside it.
    const line = lineX(index, z);
    let lane = line,
      way = toward;
    if (kind === "deer") lane = line - toward * DEER_STANDOFF;
    else if (kind === "skier") lane = line - toward * LEARNER_BERTH;
    else if (x === undefined) {
      way = -toward as 1 | -1;
      lane = clamp(line - toward * (SNOWCAT_BERTH - (SNOWCAT_SPEED * SNOWCAT_LEAD) / speed), -SNOWCAT_REACH, SNOWCAT_REACH);
    }
    movers.push({ kind, z, x: x ?? round(lane), dir: x === undefined ? way : toward });
  }
  coins.sort((a, b) => a.z - b.z);
  zones.sort((a, b) => a.z - b.z);
  powers.sort((a, b) => a.z - b.z);
  movers.sort((a, b) => a.z - b.z);
  return { coins, zones, powers, movers };
}
