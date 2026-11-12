/**
 * The trail: the line a course takes down the mountain. The mountain is a
 * broad face that falls away along +z (the fall line); a trail wanders across
 * it, traversing, sweeping and doubling back, never climbing. Everything on a
 * course is authored in trail coordinates: `s`, the distance along the middle
 * of the trail, and `u`, the distance to one side of it (positive toward +x
 * when the trail points straight down the fall line). The skier, though, is
 * moved through the world itself, so a bend in the trail is a real bend: the
 * skis have to be turned to follow it.
 */
export interface Leg {
  /** Metres of trail. */
  len: number;
  /** The direction the trail has come round to by the end of the leg, in degrees off the fall line (+ toward +x). */
  to?: number;
  /** Half the width of open snow by the end of the leg, in metres. */
  half?: number;
  /** How steep the mountain is by the end of the leg, as a multiple of the usual: more is faster. */
  pitch?: number;
}
/** Metres of trail laid above the start, and below the last authored leg. */
export const TRAIL_LEAD = 90;
export const TRAIL_TAIL = 320;
/** The trail never turns further off the fall line than this (radians). */
export const TRAIL_MAX_TURN = 0.96;
/** How far the mountain drops per metre down the fall line at the usual pitch. */
export const GRADE = 0.2;
export const DEFAULT_HALF = 20;

export interface Trail {
  /** Samples every metre of s, the first at s = -lead. */
  lead: number;
  px: number[];
  pz: number[];
  dir: number[];
  half: number[];
  pitch: number[];
  /** Samples every metre of world z, the first at z = zMin: the s of the middle of the trail there, and the height of the mountain. */
  zMin: number;
  sByZ: number[];
  hByZ: number[];
  /** Where the laying of the trail has got to. */
  endS: number;
  endDir: number;
  endHalf: number;
  endPitch: number;
}
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function createTrail(): Trail {
  const trail: Trail = {
    lead: TRAIL_LEAD,
    px: [0],
    pz: [-TRAIL_LEAD],
    dir: [0],
    half: [DEFAULT_HALF],
    pitch: [1],
    zMin: -TRAIL_LEAD,
    sByZ: [-TRAIL_LEAD],
    hByZ: [TRAIL_LEAD * GRADE],
    endS: -TRAIL_LEAD,
    endDir: 0,
    endHalf: DEFAULT_HALF,
    endPitch: 1,
  };
  extendTrail(trail, { len: TRAIL_LEAD });
  return trail;
}
/** Lays another leg on the end of a trail. */
export function extendTrail(trail: Trail, leg: Leg) {
  const fromDir = trail.endDir,
    toDir = leg.to === undefined ? fromDir : clamp((leg.to * Math.PI) / 180, -TRAIL_MAX_TURN, TRAIL_MAX_TURN),
    fromHalf = trail.endHalf,
    toHalf = leg.half ?? fromHalf,
    fromPitch = trail.endPitch,
    toPitch = leg.pitch ?? fromPitch;
  const n = Math.max(1, Math.round(leg.len));
  for (let k = 1; k <= n; k++) {
    const t = ease(k / n),
      last = trail.px.length - 1,
      before = trail.dir[last],
      dir = fromDir + (toDir - fromDir) * t,
      mid = (before + dir) / 2;
    const x = trail.px[last] + Math.sin(mid),
      z = trail.pz[last] + Math.cos(mid);
    trail.px.push(x);
    trail.pz.push(z);
    trail.dir.push(dir);
    trail.half.push(fromHalf + (toHalf - fromHalf) * t);
    trail.pitch.push(fromPitch + (toPitch - fromPitch) * t);
    // Fill the tables kept by world z for every whole metre this step went past.
    const s = trail.endS + k;
    for (;;) {
      const nextZ = trail.zMin + trail.sByZ.length;
      if (nextZ > z) break;
      const f = (nextZ - trail.pz[last]) / Math.max(1e-6, z - trail.pz[last]);
      const pitch = trail.pitch[last] + (trail.pitch[last + 1] - trail.pitch[last]) * f;
      trail.sByZ.push(s - 1 + f);
      // Steeper snow is faster snow: the grade goes with the square of the pace it gives.
      const grade = GRADE * pitch * pitch;
      const prev = trail.hByZ[trail.hByZ.length - 1];
      trail.hByZ.push(prev - grade);
    }
  }
  trail.endS += n;
  trail.endDir = toDir;
  trail.endHalf = toHalf;
  trail.endPitch = toPitch;
}
/**
 * Lays a trail from its legs. `straights` are spans of s over which the
 * trail must not bend (a leap, a sheet of ice: nobody can steer there): a leg
 * that would be turning through one holds its direction across it and
 * finishes its turn on the far side, so the trail comes out that much longer.
 */
export function buildTrail(legs: readonly Leg[], straights: readonly [from: number, to: number][] = []) {
  const trail = createTrail();
  const spans = [...straights].sort((a, b) => a[0] - b[0]);
  for (const leg of legs) {
    let left = leg.len;
    const fromDir = (trail.endDir * 180) / Math.PI,
      fromHalf = trail.endHalf,
      fromPitch = trail.endPitch;
    const part = (len: number) => {
      // The share of the whole leg done once this part is laid.
      const done = (leg.len - left + len) / leg.len;
      extendTrail(trail, {
        len,
        to: leg.to === undefined ? undefined : fromDir + (leg.to - fromDir) * done,
        half: leg.half === undefined ? undefined : fromHalf + (leg.half - fromHalf) * done,
        pitch: leg.pitch === undefined ? undefined : fromPitch + (leg.pitch - fromPitch) * done,
      });
      left -= len;
    };
    while (left > 0.5) {
      const span = spans.find(([from, to]) => to > trail.endS + 0.5 && from < trail.endS + left);
      if (!span || leg.to === undefined) {
        part(left);
        break;
      }
      if (span[0] > trail.endS + 0.5) part(Math.min(left, span[0] - trail.endS));
      if (trail.endS >= span[0] - 0.5) extendTrail(trail, { len: span[1] - trail.endS });
    }
  }
  // The run-out past the finish straightens toward the fall line.
  extendTrail(trail, { len: 120, to: (trail.endDir * 90) / Math.PI });
  extendTrail(trail, { len: TRAIL_TAIL - 120, to: 0 });
  return trail;
}
function sample(values: readonly number[], at: number) {
  const f = clamp(at, 0, values.length - 1.001),
    i = Math.floor(f);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
}
export const trailX = (t: Trail, s: number) => sample(t.px, s + t.lead);
export const trailZ = (t: Trail, s: number) => sample(t.pz, s + t.lead);
export const trailDir = (t: Trail, s: number) => sample(t.dir, s + t.lead);
export const trailHalf = (t: Trail, s: number) => sample(t.half, s + t.lead);
export const trailPitch = (t: Trail, s: number) => sample(t.pitch, s + t.lead);
/** The s of the middle of the trail level with a world z. */
export const sAtZ = (t: Trail, z: number) => sample(t.sByZ, z - t.zMin);
/** The height of the plain mountain at a world z, before any shaping of the snow. */
export const faceHeight = (t: Trail, z: number) => {
  const at = z - t.zMin;
  // Above the first sample and below the last the face carries on at the usual grade.
  if (at < 0) return t.hByZ[0] - at * GRADE;
  const over = at - (t.hByZ.length - 1);
  if (over > 0) return t.hByZ[t.hByZ.length - 1] - over * GRADE;
  return sample(t.hByZ, at) + Math.sin((z * 2 * Math.PI) / 300) * 0.45 + Math.sin((z * 2 * Math.PI) / 100) * 0.15;
};
/** How the trail bends at s, in radians a metre (+ toward +x). */
export const trailCurve = (t: Trail, s: number) => (trailDir(t, s + 4) - trailDir(t, s - 4)) / 8;
/** The point of the world at trail coordinates, and the way the trail runs there. */
export function trailAt(t: Trail, s: number, u = 0) {
  const dir = trailDir(t, s);
  return { x: trailX(t, s) + u * Math.cos(dir), z: trailZ(t, s) - u * Math.sin(dir), dir };
}
/** The world x of trail coordinates, alone: for hot loops. */
export const worldX = (t: Trail, s: number, u: number) => trailX(t, s) + u * Math.cos(trailDir(t, s));
export const worldZ = (t: Trail, s: number, u: number) => trailZ(t, s) - u * Math.sin(trailDir(t, s));
const found = { s: 0, u: 0 };
/**
 * The trail coordinates of a point of the world, by walking in from a guess
 * (the point's last s, or, failing that, the s level with it). Returns a
 * shared object: read it before the next call.
 */
export function locate(t: Trail, x: number, z: number, guess = sAtZ(t, z)) {
  let s = guess,
    u = 0;
  for (let k = 0; k < 4; k++) {
    const dir = trailDir(t, s),
      dx = x - trailX(t, s),
      dz = z - trailZ(t, s),
      sin = Math.sin(dir),
      cos = Math.cos(dir);
    u = dx * cos - dz * sin;
    const along = dx * sin + dz * cos;
    if (Math.abs(along) < 0.002) break;
    // On the inside of a bend a metre of trail is less than a metre of snow.
    s += along / clamp(1 - trailCurve(t, s) * u, 0.4, 2.5);
  }
  found.s = s;
  found.u = u;
  return found;
}
/** How far to one side of the trail a point is, measured level across the mountain: cheap, and good anywhere, near the trail or far. */
export function aside(t: Trail, x: number, z: number) {
  const s = sAtZ(t, z);
  return (x - trailX(t, s)) * Math.cos(trailDir(t, s));
}
