import * as THREE from "three";
import { BANK_RATE, SHOULDER, worldOf, type Course } from "./levels";
import { bankHeight, surfaceHeight } from "./physics";
import { GRADE, faceHeight, sAtZ, trailAt, trailDir, trailHalf, trailX, type Trail } from "./trail";
import { ENDLESS_THEME_SPAN } from "./themes";
import { seeded } from "./geometry";
import { lampMode } from "./lamp";

/**
 * The mountain as it is drawn. The skiing knows only the face of the mountain
 * and the shaped snow of the trail; everything past the deep snow at the
 * trail's edge is scenery, and this file decides what the land does there:
 * `groundHeight` is the one answer to "how high is the ground here", for the
 * terrain mesh and for everything that stands on it.
 */

type Ground = Pick<Course, "trail" | "slopes" | "level" | "endless">;
const WORLDS = 5;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How far a point is from the groomed snow: metres from the nearest point of
 * the middle of the trail, less the half-width there. Negative on the trail,
 * `SHOULDER` where the deep snow ends. Good anywhere, round any bend.
 */
export function offTrail(t: Trail, x: number, z: number) {
  const px = t.px,
    pz = t.pz,
    half = t.half,
    last = px.length - 1,
    lead = t.lead;
  const s0 = sAtZ(t, z);
  const across = Math.abs(x - trailX(t, s0));
  // The trail never runs more than 55° off the fall line, so its nearest point is within this much trail of the point level with us.
  const reach = across * 1.75 + 10,
    step = Math.max(2, reach / 12);
  let best = Infinity,
    at = s0;
  for (let s = s0 - reach; s <= s0 + reach + 0.001; s += step) {
    const i = Math.max(0, Math.min(last, Math.round(s + lead)));
    const d = Math.hypot(x - px[i], z - pz[i]) - half[i];
    if (d < best) {
      best = d;
      at = s;
    }
  }
  const fine = Math.max(1, step / 4);
  for (let s = at - step + fine; s < at + step; s += fine) {
    const i = Math.max(0, Math.min(last, Math.round(s + lead)));
    const d = Math.hypot(x - px[i], z - pz[i]) - half[i];
    if (d < best) best = d;
  }
  return best;
}

/**
 * How the land lies beyond the trail in each world, as height over the plain
 * face of the mountain: `e` is metres past the edge of the deep snow, and at
 * e = 0 every one of these is zero and level, so the trail is untouched.
 */
function relief(world: number, e: number, x: number, z: number) {
  // A slow swell, a few hundred metres from crest to crest, shared by every world.
  const swell = Math.sin(x * 0.019 + 1.7) * Math.cos(z * 0.015 + x * 0.004);
  const far = Math.max(0, e - 80);
  if (world === 0)
    // Sunny Side: open rolling ground, a soft bank at the edge of the piste, the hill falling gently away to either hand.
    return smooth(0, 14, e) * 0.9 + smooth(0, 120, e) * (2.5 + 6 * swell) - far * far * 0.00035;
  if (world === 1) {
    // Pinewood: a lumpy forest floor, the trail a little sunk in it.
    const hummock = Math.sin(x * 0.41 + z * 0.13) * Math.sin(z * 0.37 - x * 0.1);
    return smooth(0, 8, e) * (0.8 + 0.9 * hummock * (1 - 0.7 * smooth(20, 70, e))) + smooth(0, 90, e) * (5 + 4 * swell);
  }
  if (world === 2)
    // Blue River: the trail is the frozen river, sunk in its channel between steep banks.
    return smooth(0, 6, e) * (4.2 + 1.1 * Math.sin(z * 0.11 + x * 0.03)) + smooth(4, 70, e) * 3 * swell + far * 0.04;
  if (world === 3)
    // Granite Gorge: walls that stand tens of metres over the trail, and keep climbing behind.
    return (
      smooth(0, 24, e) * (26 + 9 * Math.sin(z * 0.045 + x * 0.02) + 4 * Math.sin(z * 0.13 + x * 0.05)) + smooth(10, 170, e) * (24 + 14 * swell)
    );
  // Midnight Face: an open face in big smooth swells, falling away into the dark.
  const roll = Math.sin(x * 0.011 + z * 0.004 + 0.6) + 0.6 * Math.sin(z * 0.012 - x * 0.007);
  return smooth(0, 20, e) * 0.6 + smooth(0, 80, e) * 9 * roll - far * far * 0.0003;
}
/** Which world's land lies at a distance down the mountain: one for a level, each in turn on the endless run. */
export function worldAt(course: Pick<Course, "level" | "endless">, z: number) {
  return course.endless ? Math.floor(Math.max(0, z) / ENDLESS_THEME_SPAN) % WORLDS : worldOf(course.level);
}
const BLEND = 70;
function reliefAt(course: Ground, e: number, x: number, z: number) {
  if (!course.endless) return relief(worldOf(course.level), e, x, z);
  // On the endless run one world's land runs into the next over a hundred metres or so.
  const at = Math.max(0, z) / ENDLESS_THEME_SPAN,
    k = Math.round(at),
    off = (at - k) * ENDLESS_THEME_SPAN;
  if (k === 0 || Math.abs(off) >= BLEND) return relief(Math.floor(at) % WORLDS, e, x, z);
  const t = smooth(-BLEND, BLEND, off);
  return relief((k - 1) % WORLDS, e, x, z) * (1 - t) + relief(k % WORLDS, e, x, z) * t;
}
/** What the last call of `groundHeight` found besides the height: how far past the edge of the deep snow the point is (negative on the trail). */
export const probe = { e: 0 };
/** The height of the ground anywhere: the snow of the trail where the skiing is, the lie of the land beyond it. */
export function groundHeight(course: Ground, x: number, z: number) {
  const e = (probe.e = offTrail(course.trail, x, z) - SHOULDER);
  const base = surfaceHeight(course, x, z);
  return e <= 0 ? base : base + reliefAt(course, e, x, z);
}
/** How far the snow falls per metre down the fall line at a world z, as an angle: what a disc lying on the snow is tipped by. */
export const snowTilt = (trail: Trail, z: number) => Math.atan(faceHeight(trail, z - 0.5) - faceHeight(trail, z + 0.5));

const basisX = new THREE.Vector3(),
  basisY = new THREE.Vector3(),
  basisZ = new THREE.Vector3(),
  basis = new THREE.Matrix4();
/** Lays an object on the snow at a point of the trail: its +y along the snow's normal, its +z down the heading given. */
export function layOnSnow(object: THREE.Object3D, course: Pick<Course, "trail" | "slopes">, x: number, z: number, yaw = 0, lift = 0) {
  const hx = surfaceHeight(course, x + 0.5, z) - surfaceHeight(course, x - 0.5, z),
    hz = surfaceHeight(course, x, z + 0.5) - surfaceHeight(course, x, z - 0.5);
  basisY.set(-hx, 1, -hz).normalize();
  basisZ.set(Math.sin(yaw), 0, Math.cos(yaw));
  basisZ.addScaledVector(basisY, -basisZ.dot(basisY)).normalize();
  basisX.crossVectors(basisY, basisZ);
  object.quaternion.setFromRotationMatrix(basis.makeBasis(basisX, basisY, basisZ));
  object.position.set(x, surfaceHeight(course, x, z) + lift, z);
}
/**
 * A strip of mesh laid on the snow in trail coordinates: from s0 to s1 down
 * the trail, and across it between the offsets `left(s)` and `right(s)`. Its
 * texture runs 0 to 1 across and 0 (at s0) to 1 down. Used for everything
 * painted on the snow: ice, hoofprints, the dark of a chasm.
 */
export function ribbon(
  course: Pick<Course, "trail" | "slopes">,
  s0: number,
  s1: number,
  left: (s: number) => number,
  right: (s: number) => number,
  material: THREE.Material,
  lift = 0.04,
  across = 8,
) {
  const along = Math.max(1, Math.ceil((s1 - s0) / 2));
  const positions: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  for (let i = 0; i <= along; i++) {
    const s = s0 + ((s1 - s0) * i) / along,
      a = left(s),
      b = right(s);
    for (let j = 0; j <= across; j++) {
      const p = trailAt(course.trail, s, a + ((b - a) * j) / across);
      positions.push(p.x, surfaceHeight(course, p.x, p.z) + lift, p.z);
      uvs.push(j / across, 1 - i / along);
    }
  }
  for (let i = 0; i < along; i++)
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j,
        b = a + across + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  return mesh;
}

// ------------------------------------------------------------------ the mesh

/** A tile of terrain is this long down the fall line, with a row of vertices this often. */
const TILE = 60,
  ROW = 2.5,
  ROWS = TILE / ROW,
  TILES = 11,
  BEHIND = 240;
/** Vertices across the groomed snow, across each shoulder, and how far out past the shoulder the rest stand. */
const PISTE = 24,
  SIDE = 3,
  OUT = [3, 7, 12, 18, 25, 33, 43, 55, 70, 90, 115, 145, 185, 235, 300, 380, 470];
const COLS = (OUT.length + SIDE + 1) * 2 + PISTE + 1;
/** Column indices: where the left shoulder starts, the two copies of each edge of the piste. */
const C_SHOULDER_L = OUT.length,
  C_EDGE_L = C_SHOULDER_L + SIDE,
  C_PISTE_L = C_EDGE_L + 1,
  C_PISTE_R = C_PISTE_L + PISTE,
  C_EDGE_R = C_PISTE_R + 1,
  C_SHOULDER_R = C_EDGE_R + SIDE;
/** Metres of texture: the corduroy repeats this often across and along the trail. */
const WEAVE = 22;

const SNOW = new THREE.Color("#ebf2fb"),
  /** Snow that faces the sun: brighter than the flat, so a rise has a lit side as well as a shaded one. */
  BRIGHT = new THREE.Color("#ffffff"),
  SHADE = new THREE.Color("#8dadd0"),
  POWDER = new THREE.Color("#dfeaf6"),
  EDGE = new THREE.Color("#a9c2dc");
/** What shows where the land is too steep to hold snow, world by world. */
const ROCK = ["#b4c3d2", "#a9b5ac", "#86c8ee", "#8a7f8f", "#7f8fbf"].map((c) => new THREE.Color(c));
/**
 * A low sun off to one side and ahead of the skier, for shading the snow:
 * with the light from down the slope, the near face of every rise falls into
 * shade, so a roller reads as a hill before you are on it.
 */
const SUN = new THREE.Vector3(-0.5, 0.7, 0.5).normalize();
/** A chasm is a real trench cut across the trail, this deep; its floor is dark and the wall of its far side catches the light. */
const CHASM_DEPTH = 13;
const ABYSS = new THREE.Color("#0a1226"),
  FAR_WALL = new THREE.Color("#5d8fd6");
const FLAT_LIT = SUN.y;

function texture(paint: (ctx: CanvasRenderingContext2D, rand: () => number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  paint(ctx, seeded(77));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function hollows(ctx: CanvasRenderingContext2D, rand: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = rand() * 256,
      y = rand() * 256,
      r = 14 + rand() * 30;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(140,175,210,${alpha})`);
      g.addColorStop(1, "rgba(140,175,210,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}
/** Groomed snow: corduroy down the trail, crossed by scuffs and soft hollows. */
const groomed = () =>
  texture((ctx, rand) => {
    hollows(ctx, rand, 26, 0.16);
    ctx.fillStyle = "rgba(110,150,195,.075)";
    for (let x = 0; x < 256; x += 8) ctx.fillRect(x, 0, 3, 256);
    ctx.strokeStyle = "rgba(110,150,195,.2)";
    ctx.lineCap = "round";
    for (let i = 0; i < 20; i++) {
      const x = rand() * 256,
        y = rand() * 256;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 14, y + 4 + rand() * 6, x + 26 + rand() * 20, y + rand() * 5);
      ctx.stroke();
    }
  });
/** Snow nobody has skied: soft pillows and wind-scoops, no lines. */
const untracked = () =>
  texture((ctx, rand) => {
    hollows(ctx, rand, 60, 0.22);
    for (let i = 0; i < 40; i++) {
      const x = rand() * 256,
        y = rand() * 256,
        r = 5 + rand() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

interface Tile {
  mesh: THREE.Mesh;
  k: number;
  /** How far the trail had been laid when the tile was shaped: an endless trail grows, and a tile shaped past its end is shaped again. */
  laid: number;
  whole: boolean;
}
/**
 * The snow: a heightfield in tiles that leapfrog down the mountain ahead of
 * the skier. Every row of a tile runs level across the mountain and is
 * centred on the trail where it crosses that row, with a fine mesh over the
 * groomed snow and the deep snow beside it, and a coarse one out to the
 * horizon. A tile is shaped once, when it is moved on.
 */
export class Terrain {
  /** The groomed snow and the snow beyond it: their colours tint the mountain to the light. */
  readonly materials = [
    // Snow lit at a graze is dim and a bank that faces the lamp is bright: by a headlamp, that is how the shape of the snow is read.
    lampMode(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, map: groomed() }), { facing: 0.7 }),
    lampMode(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, map: untracked() }), { facing: 0.7 }),
  ];
  private tiles: Tile[] = [];
  private course: Course | null = null;
  // Scratch for one tile: two more rows than it has, so every row has a neighbour to take its slope from.
  private xs = new Float32Array((ROWS + 3) * COLS);
  private hs = new Float32Array((ROWS + 3) * COLS);
  private ds = new Float32Array((ROWS + 3) * COLS);
  private pits = new Float32Array((ROWS + 3) * COLS);
  private lit = new Float32Array((ROWS + 3) * COLS);
  private rowS = new Float32Array(ROWS + 3);
  private rowX = new Float32Array(ROWS + 3);
  private rowDir = new Float32Array(ROWS + 3);
  constructor(scene: THREE.Scene) {
    const index: number[] = [];
    const quads = (from: number, to: number) => {
      for (let r = 0; r < ROWS; r++)
        for (let c = from; c < to; c++) {
          const a = r * COLS + c,
            b = a + COLS;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
    };
    quads(C_PISTE_L, C_PISTE_R);
    const pisteCount = index.length;
    quads(0, C_EDGE_L);
    quads(C_EDGE_R, COLS - 1);
    for (let i = 0; i < TILES; i++) {
      const geo = new THREE.BufferGeometry();
      const count = (ROWS + 1) * COLS;
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      geo.setIndex(index);
      geo.addGroup(0, pisteCount, 0);
      geo.addGroup(pisteCount, index.length - pisteCount, 1);
      const mesh = new THREE.Mesh(geo, this.materials);
      mesh.name = "terrain";
      scene.add(mesh);
      this.tiles.push({ mesh, k: NaN, laid: 0, whole: false });
    }
  }
  /** Moves on whatever tiles have fallen far enough behind a point of the mountain. One tile at most is shaped per call unless `all`. */
  update(course: Course, z: number, all = false) {
    if (this.course !== course) {
      this.course = course;
      for (const tile of this.tiles) tile.k = NaN;
      all = true;
    }
    const base = Math.floor((z - BEHIND) / TILE);
    let budget = all ? TILES : 1;
    // Nearest first, so if several are owed the far ones wait.
    for (let k = base; k < base + TILES && budget > 0; k++) {
      let tile = this.tiles.find((t) => t.k === k);
      if (tile && (tile.whole || course.trail.endS === tile.laid)) continue;
      tile ??= this.tiles.find((t) => Number.isNaN(t.k) || t.k < base || t.k >= base + TILES);
      if (!tile) break;
      this.shape(tile, k, course);
      budget--;
    }
  }
  /** The world x at which the snow of a row is `target` metres off the trail, on one side: found by the secant rule from a first guess. */
  private edge(trail: Trail, z: number, cx: number, side: number, target: number, guess: number) {
    let x0 = cx + side * guess,
      d0 = offTrail(trail, x0, z) - target,
      x1 = x0 - side * d0,
      d1 = offTrail(trail, x1, z) - target;
    for (let k = 0; k < 4 && Math.abs(d1) > 0.02 && d1 !== d0; k++) {
      const x = x1 - (d1 * (x1 - x0)) / (d1 - d0);
      x0 = x1;
      d0 = d1;
      x1 = x;
      d1 = offTrail(trail, x1, z) - target;
    }
    return x1;
  }
  private shape(tile: Tile, k: number, course: Course) {
    const trail = course.trail,
      { xs, hs, ds, pits, rowS, rowX, rowDir } = this;
    const chasms = course.zones.filter((zone) => zone.kind === "chasm");
    tile.k = k;
    tile.laid = trail.endS;
    // The tile is whole if the trail had been laid well past it; else it will be shaped again when the trail has grown.
    tile.whole = !course.endless || trail.pz[trail.pz.length - 1] > (k + 1) * TILE + 250;
    const z0 = k * TILE;
    for (let r = 0; r < ROWS + 3; r++) {
      const z = z0 + (r - 1) * ROW,
        s = sAtZ(trail, z),
        cx = trailX(trail, s),
        dir = trailDir(trail, s),
        level = trailHalf(trail, s) / Math.max(0.5, Math.cos(dir)),
        o = r * COLS;
      rowS[r] = s;
      rowX[r] = cx;
      rowDir[r] = dir;
      const pisteL = this.edge(trail, z, cx, -1, 0, level),
        pisteR = this.edge(trail, z, cx, 1, 0, level),
        shoulderL = Math.min(pisteL - 1, this.edge(trail, z, cx, -1, SHOULDER, cx - pisteL + SHOULDER)),
        shoulderR = Math.max(pisteR + 1, this.edge(trail, z, cx, 1, SHOULDER, pisteR - cx + SHOULDER));
      for (let j = 0; j < OUT.length; j++) {
        xs[o + j] = shoulderL - OUT[OUT.length - 1 - j];
        xs[o + C_SHOULDER_R + 1 + j] = shoulderR + OUT[j];
      }
      for (let j = 0; j <= SIDE; j++) {
        xs[o + C_SHOULDER_L + j] = shoulderL + ((pisteL - shoulderL) * j) / SIDE;
        xs[o + C_EDGE_R + j] = pisteR + ((shoulderR - pisteR) * j) / SIDE;
      }
      for (let j = 0; j <= PISTE; j++) xs[o + C_PISTE_L + j] = pisteL + ((pisteR - pisteL) * j) / PISTE;
      const face = faceHeight(trail, z);
      for (let c = 0; c < COLS; c++) {
        const x = xs[o + c];
        let h = face + bankHeight(course, x, z);
        // Between the outer edges of the two shoulders the snow is exactly what the skiing knows; only past them does the land do as it likes.
        const outer = c < C_SHOULDER_L || c > C_SHOULDER_R;
        const d = outer ? offTrail(trail, x, z) : c >= C_PISTE_L && c <= C_PISTE_R ? -1 : SHOULDER * 0.5;
        if (outer && d > SHOULDER) h += reliefAt(course, d - SHOULDER, x, z);
        // A chasm: the snow drops away between its lip and its far side, right across the trail and into the banks.
        let pit = 0,
          wall = 0;
        if (chasms.length && d < SHOULDER + 5) {
          const along = s + (x - cx) * Math.sin(dir);
          for (const zone of chasms) {
            const a = along - zone.s - 0.3,
              b = zone.s + zone.length - along;
            if (a <= 0 || b <= 0) continue;
            pit = Math.min(1, a / 1.2, b / 1.2) * (outer ? smooth(SHOULDER + 5, SHOULDER, d) : 1);
            wall = Math.max(0, 1 - b / 5);
          }
          h -= pit * CHASM_DEPTH;
        }
        pits[o + c] = pit;
        this.lit[o + c] = wall;
        // Slopes are read off the height with the fall of the mountain taken out.
        hs[o + c] = h + GRADE * z;
        ds[o + c] = d;
      }
    }
    const geo = tile.mesh.geometry,
      pos = geo.attributes.position as THREE.BufferAttribute,
      color = geo.attributes.color as THREE.BufferAttribute,
      uv = geo.attributes.uv as THREE.BufferAttribute;
    const world = worldAt(course, z0 + TILE / 2),
      rock = ROCK[world];
    for (let r = 0; r <= ROWS; r++) {
      const o = (r + 1) * COLS,
        z = z0 + r * ROW,
        cos = Math.cos(rowDir[r + 1]),
        sin = Math.sin(rowDir[r + 1]);
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c,
          x = xs[o + c],
          h = hs[o + c],
          d = ds[o + c];
        pos.setXYZ(i, x, h - GRADE * z, z);
        // The slope across, from the neighbours in the row (the two copies of an edge stand on the same spot, so each looks to its own side).
        let a = c > 0 && c !== C_PISTE_L && c !== C_EDGE_R ? c - 1 : c,
          b = c < COLS - 1 && c !== C_PISTE_R && c !== C_EDGE_L ? c + 1 : c;
        if (a === b) (a = Math.max(0, c - 1)), (b = Math.min(COLS - 1, c + 1));
        const hx = (hs[o + b] - hs[o + a]) / Math.max(0.01, xs[o + b] - xs[o + a]);
        // The slope down the mountain, from the rows either side, allowing for the way each row is shifted along with the trail.
        const up = o - COLS + c,
          down = o + COLS + c,
          hz = (hs[down] - hs[up] - hx * (xs[down] - xs[up])) / (2 * ROW);
        const steep = Math.hypot(hx, hz);
        const lit = (-hx * SUN.x + SUN.y - hz * SUN.z) / Math.hypot(hx, 1, hz);
        let mix = Math.min(1, Math.max(0, (FLAT_LIT - lit) * 5));
        const piste = c >= C_PISTE_L && c <= C_PISTE_R;
        let cr: number, cg: number, cb: number;
        if (piste) {
          // Sunk snow lies a little in shadow.
          const sunk = Math.max(0, -bankHeight(course, x, z));
          mix = Math.min(1, mix + Math.min(1, sunk / (BANK_RATE * 10)) * 0.35);
          // A face turned to the sun is brighter than the flat, one turned from it darker: that is all there is to read a roller by.
          const glint = Math.min(1, Math.max(0, (lit - FLAT_LIT) * 5)) * (1 - mix);
          cr = SNOW.r + (SHADE.r - SNOW.r) * mix + (BRIGHT.r - SNOW.r) * glint;
          cg = SNOW.g + (SHADE.g - SNOW.g) * mix + (BRIGHT.g - SNOW.g) * glint;
          cb = SNOW.b + (SHADE.b - SNOW.b) * mix + (BRIGHT.b - SNOW.b) * glint;
          const dx = x - rowX[r + 1];
          uv.setXY(i, (dx * cos) / WEAVE, (rowS[r + 1] + dx * sin) / WEAVE);
        } else {
          // Deep snow is duller than groomed, and the cut where the groomer stopped is a hard line of shadow.
          const cut = c === C_EDGE_L || c === C_EDGE_R ? 1 : 0;
          const base = cut ? EDGE : POWDER;
          const m = Math.min(1, mix * 1.1);
          cr = base.r + (SHADE.r - base.r) * m;
          cg = base.g + (SHADE.g - base.g) * m;
          cb = base.b + (SHADE.b - base.b) * m;
          if (d > SHOULDER) {
            // Past the deep snow: bare rock or ice where the land is steep, darker on the faces turned from the sun.
            const bare = smooth(0.5, 1.05, steep);
            const light = 0.72 + 0.4 * Math.max(0, lit);
            cr += (rock.r * light - cr) * bare;
            cg += (rock.g * light - cg) * bare;
            cb += (rock.b * light - cb) * bare;
          }
          uv.setXY(i, x / 26, z / 26);
        }
        const pit = pits[o + c];
        if (pit > 0) {
          // Down in a chasm it is dark, but for the far wall, which faces the light.
          const wall = this.lit[o + c] * 0.85,
            dark = Math.min(1, pit * 1.6);
          cr += (ABYSS.r + (FAR_WALL.r - ABYSS.r) * wall - cr) * dark;
          cg += (ABYSS.g + (FAR_WALL.g - ABYSS.g) * wall - cg) * dark;
          cb += (ABYSS.b + (FAR_WALL.b - ABYSS.b) * wall - cb) * dark;
        }
        color.setXYZ(i, cr, cg, cb);
      }
    }
    pos.needsUpdate = color.needsUpdate = uv.needsUpdate = true;
    geo.computeBoundingSphere();
  }
}
