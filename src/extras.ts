import type { Coin, Gate, Hazard, MoverKind, PowerKind, PowerSpot, Stretch, TokenSpot, Twist, Weather, Zone } from "./levels";
import type { MoverSpec } from "./movers";
import { trailAt, trailHalf, type Trail } from "./trail";

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
  /** Stretches crossed by a chasm: the whole piste kicks up into a lip, and everyone flies. */
  chasms: number[];
  /** Stretches glazed with ice from just past the gate to just short of the next. */
  ice: number[];
  /** Power-ups floating on the racing line: the stretch and what it holds. */
  powers: [stretch: number, kind: PowerKind][];
  /** Things that move: the stretch where the skier meets it, what it is, and which way it first goes (left out, toward the next gate). */
  movers: [stretch: number, kind: MoverKind, dir?: 1 | -1][];
  /** A level with its own rule: a race against the fox, a run from an avalanche, a slope of gold. */
  twist: Twist;
  weather: Weather;
  /** A night run. */
  night: boolean;
  rivalPace: number;
  avalanchePace: number;
}
export const EXTRAS_BASE: ExtrasDesign = {
  coins: [],
  ramps: [],
  chasms: [],
  ice: [],
  powers: [],
  movers: [],
  twist: "",
  weather: "clear",
  night: false,
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
export const RAMP_HALF = 1.9;
export const RAMP_LIP = 1.1;
/** A jump aims to carry about this far, for between these times in the air. */
export const JUMP_REACH = 25;
export const JUMP_MIN_TIME = 0.5;
export const JUMP_MAX_TIME = 0.8;
export const JUMP_GRAVITY = 22;
/** A chasm is this long, and its lip throws a skier this far, for up to this long in the air. */
export const CHASM_LENGTH = 20;
export const CHASM_REACH = 36;
export const CHASM_MAX_TIME = 1.15;
/** Whatever went before, a skier leaves a chasm's lip at no less than this share of cruising speed. */
export const CHASM_MIN_SPEED = 0.8;
/** A lip this wide is the whole piste: the lip of a chasm. */
export const FULL_WIDTH = 60;
/** The kicker at the lip of a chasm is half this wide: it has to be aimed for. */
export const LEAP_HALF = 4.2;
/** Going into the gap costs this long before the skier is back on his skis on the far side. */
export const CHASM_FALL_TIME = 1.7;
/** Clearing a chasm with an avalanche behind drops this much of the slide into it. */
export const CHASM_SWALLOW = 28;
/** Points for landing a jump. */
export const AIR_POINTS = 250;
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
/** Beating the fox to the line pays this. */
export const RIVAL_POINTS = 1000;

/** The height of a ramp's snow above the piste at trail coordinates: a wedge that rises to its lip. */
export function rampHeight(zones: readonly Zone[], u: number, s: number) {
  for (const zone of zones) {
    if (zone.kind !== "ramp" || s < zone.s || s > zone.s + zone.length + 0.6) continue;
    const across = Math.abs(u - zone.u);
    if (across > zone.halfWidth) continue;
    const along = Math.min(1, (s - zone.s) / zone.length);
    // Rounded shoulders, so the wedge reads as packed snow rather than a box.
    const shoulder = Math.min(1, (zone.halfWidth - across) / 0.5);
    return s > zone.s + zone.length ? 0 : RAMP_LIP * along * along * shoulder;
  }
  return 0;
}
/** The zone of a kind under a point of the trail, if any. */
export function zoneAt(zones: readonly Zone[], kind: Zone["kind"], u: number, s: number) {
  for (const zone of zones)
    if (zone.kind === kind && s >= zone.s && s <= zone.s + zone.length && Math.abs(u - zone.u) <= zone.halfWidth) {
      if (zone.blobs && !zone.blobs.some((b) => Math.hypot(b.s - s, b.u - u) <= b.r)) continue;
      return zone;
    }
  return undefined;
}
/** How long a jump launched at a speed stays in the air, and the upward speed that gives it. */
export function jumpFor(speed: number, chasm = false) {
  const time = Math.max(
    JUMP_MIN_TIME,
    Math.min(chasm ? CHASM_MAX_TIME : JUMP_MAX_TIME, (chasm ? CHASM_REACH : JUMP_REACH) / Math.max(1, speed)),
  );
  return { time, vy: ((JUMP_GRAVITY / 2) * time * time - RAMP_LIP) / time };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A sheet of ice down a stretch that starts at a gate and runs this long: patches strung down the racing line,
 * each a different size and a little to one side or the other of it, running into one another here and leaving
 * a tongue of snow between them there. The same stretch and seed always give the same sheet.
 */
export function iceSheet(trail: Trail, fromS: number, length: number, lineAt: (s: number) => number, seedOf: number): Zone {
  const s = fromS + ICE_LEAD,
    span = length - ICE_LEAD - ICE_TAIL;
  const blobs: { s: number; u: number; r: number }[] = [];
  let seed = (seedOf * 2654435761) >>> 0;
  const roll = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let at = s + 5; at < s + span - 3; ) {
    const r = 4.2 + roll() * 3.4;
    const u = lineAt(at) + (roll() - 0.5) * 6;
    blobs.push({ s: round(at), u: round(u), r: round(r) });
    // More often than not another patch lies beside it, to one side or the other, and sometimes one on each.
    for (const side of [-1, 1])
      if (roll() < 0.6) {
        const beside = 3.4 + roll() * 2.6;
        blobs.push({ s: round(at + (roll() - 0.5) * 6), u: round(u + side * (r + beside * (0.5 + roll() * 0.7))), r: round(beside) });
      }
    at += r * (0.75 + roll() * 0.6);
  }
  // No patch lies out in the deep snow: each is drawn back onto the trail.
  for (const b of blobs) {
    const room = Math.max(0, trailHalf(trail, b.s) - b.r * 0.6);
    b.u = round(Math.max(-room, Math.min(room, b.u)));
  }
  const lo = Math.min(...blobs.map((b) => b.u - b.r)),
    hi = Math.max(...blobs.map((b) => b.u + b.r));
  const first = Math.min(...blobs.map((b) => b.s - b.r)),
    end = Math.max(...blobs.map((b) => b.s + b.r));
  const p = trailAt(trail, first, (lo + hi) / 2);
  return { kind: "ice", s: first, u: (lo + hi) / 2, halfWidth: (hi - lo) / 2, length: end - first, x: p.x, z: p.z, rot: p.dir, blobs };
}

/**
 * Places a level's coins, zones, power-ups and movers from its authored
 * lists. Coins run down the direct line from gate to gate; what moves is put
 * on that line or across it, never politely beside it.
 */
export function buildExtras(
  design: ExtrasDesign,
  trail: Trail,
  gates: readonly Gate[],
  stretches: readonly Stretch[],
  tokens: readonly TokenSpot[],
  hazards: readonly Hazard[],
  finishS: number,
  speed: number,
) {
  const coins: Coin[] = [],
    zones: Zone[] = [],
    powers: PowerSpot[] = [],
    movers: MoverSpec[] = [];
  void stretches;
  const ends = (index: number) => {
    const from = gates[index],
      to = gates[index + 1] ?? { u: gates[index].u * 0.4, s: finishS - 20 };
    return { from, to, length: to.s - from.s };
  };
  const lineU = (index: number, s: number) => {
    const { from, to, length } = ends(index);
    return from.u + ((to.u - from.u) * (s - from.s)) / length;
  };
  const coin = (u: number, s: number, y = 0) => coins.push({ ...trailAt(trail, s, u), s: round(s), u: round(u), y });
  const zone = (kind: Zone["kind"], s: number, u: number, halfWidth: number, length: number) => {
    const p = trailAt(trail, s, u);
    zones.push({ kind, s, u, halfWidth, length, x: p.x, z: p.z, rot: p.dir });
  };
  /** Coins every few metres along a path, never on a rock. */
  const trailOf = (points: [u: number, s: number][], spacing = 4.5) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const [au, as] = points[i],
        [bu, bs] = points[i + 1];
      const count = Math.max(1, Math.round((bs - as) / spacing));
      for (let k = 0; k < count; k++) {
        const f = k / count,
          u = au + (bu - au) * f,
          s = as + (bs - as) * f;
        if (hazards.some((h) => Math.hypot(h.u - u, h.s - s) < h.radius + 1.6)) continue;
        coin(u, s);
      }
    }
  };
  for (const index of design.ramps) {
    const { from, length } = ends(index);
    // The lip sits 8 m short of the first rock on or near the line, or a third of the way along.
    const rock = hazards.find((h) => h.s > from.s + 14 && h.s < from.s + length - 8 && Math.abs(h.u - lineU(index, h.s)) < 2.4);
    const lip = rock ? rock.s - 8 : from.s + Math.max(16, length * 0.32);
    zone("ramp", Math.round(lip - RAMP_LENGTH), round(lineU(index, lip - RAMP_LENGTH / 2)), RAMP_HALF, RAMP_LENGTH);
    // Coins hang along the flight of a jump taken at cruising speed down the line.
    const { time, vy } = jumpFor(speed);
    for (let k = 1; k <= 5; k++) {
      const t = (time * k) / 6,
        s = lip + speed * t;
      coin(lineU(index, s), s, round(RAMP_LIP + vy * t - (JUMP_GRAVITY / 2) * t * t));
    }
  }
  for (const index of design.chasms) {
    const { from, length } = ends(index);
    // A long clear run-up, then the lip; the far side has room to land before the flags.
    const lip = Math.round(from.s + Math.max(24, length * 0.42));
    // One kicker on the racing line throws the skier across; either side of it the snow simply ends.
    zone("ramp", lip - RAMP_LENGTH, round(lineU(index, lip)), LEAP_HALF, RAMP_LENGTH);
    zones[zones.length - 1].leap = true;
    zone("chasm", lip, 0, FULL_WIDTH, CHASM_LENGTH);
    const { time, vy } = jumpFor(speed, true);
    for (let k = 1; k <= 6; k++) {
      const t = (time * k) / 7,
        s = lip + speed * t;
      coin(lineU(index, s), s, round(RAMP_LIP + vy * t - (JUMP_GRAVITY / 2) * t * t));
    }
  }
  for (const index of design.ice) {
    const { from, length } = ends(index);
    zones.push(iceSheet(trail, from.s, length, (s) => lineU(index, s), index));
  }
  const paved = design.twist === "goldrush";
  for (const index of design.coins) {
    const { from, to, length } = ends(index);
    if (paved) {
      for (const offset of [-1.6, 1.6])
        trailOf(
          [
            [lineU(index, from.s + length * 0.2) + offset, from.s + length * 0.2],
            [lineU(index, to.s - length * 0.2) + offset, to.s - length * 0.2],
          ],
          3.2,
        );
      continue;
    }
    const token = tokens.find((t) => t.stretch === index);
    if (token)
      // Out to the gold and back: the trail shows the wide line.
      trailOf([
        [from.u + (token.u - from.u) * 0.3, from.s + (token.s - from.s) * 0.3],
        [token.u - (token.u - from.u) * 0.12, token.s - 4.5],
      ]);
    else
      trailOf([
        [lineU(index, from.s + length * 0.28), from.s + length * 0.28],
        [lineU(index, to.s - length * 0.24), to.s - length * 0.24],
      ]);
  }
  for (const [index, kind] of design.powers) {
    const { from, length } = ends(index);
    const s = Math.round(from.s + length * 0.55);
    // On the racing line, or beside the rock if one sits there.
    let u = lineU(index, s);
    const rock = hazards.find((h) => Math.hypot(h.u - u, h.s - s) < h.radius + 2.6);
    if (rock) u = rock.u + (Math.sign(u - rock.u) || Math.sign(from.u) || 1) * (rock.radius + 3);
    powers.push({ kind, ...trailAt(trail, s, u), s, u: round(u) });
  }
  // The racing line, gate to gate: what a learner or the herd works about.
  const line = [{ s: 0, u: gates[0].u * 0.5 }, ...gates.map((gate) => ({ s: gate.s, u: gate.u })), { s: finishS, u: 0 }];
  let herd = 0;
  for (const [index, kind, dir] of design.movers) {
    const { from, to, length } = ends(index);
    // Whatever blocks the line stands well down its stretch: there is room after the flags to see it and choose a side.
    const at = kind === "deer" ? 0.6 : kind === "plough" || kind === "boulder" ? 0.45 : 0.5;
    const s = Math.round(from.s + length * at);
    const toward = (dir ?? (Math.sign(to.u - from.u) || 1)) as 1 | -1;
    const spec: MoverSpec = { kind, s, u: 0, dir: toward };
    if (kind === "skier") {
      // A learner traverses about the middle of the trail, whatever the flags do.
    } else if (kind === "herd") {
      // The herd runs three abreast, more or less, and each jinks about its own lane.
      // Each keeps a lane of its own about the middle of the trail, whatever the flags do.
      spec.u = [-4.5, 4.5, 0][herd++ % 3];
    } else if (kind !== "snowcat") spec.u = round(lineU(index, s));
    movers.push(spec);
  }
  // The far side of a fork is the one with the gold in it.
  for (const gate of gates)
    if (gate.alt !== undefined)
      trailOf(
        [
          [gate.alt, gate.s - 16],
          [gate.alt, gate.s + 6],
        ],
        3.6,
      );
  coins.sort((a, b) => a.s - b.s);
  zones.sort((a, b) => a.s - b.s);
  powers.sort((a, b) => a.s - b.s);
  movers.sort((a, b) => a.s - b.s);
  return { coins, zones, powers, movers };
}
