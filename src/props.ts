import * as THREE from "three";
import { box, cone, cylinder, material, shape, sphere } from "./geometry";
import { surfaceHeight, type Course, type Run } from "./physics";
import { RAMP_LIP } from "./extras";
import { BOULDER_FALL_TIME, SNOWCAT_MARGIN, type MoverKind, type MoverState } from "./movers";
import { SHOULDER, type PowerKind, type Zone } from "./levels";
import { trailAt, trailHalf } from "./trail";
import { layOnSnow, ribbon, snowTilt } from "./terrain";
import { lamp, lampMode } from "./lamp";

/** The colour each power-up wears everywhere: on the slope, in the HUD, in the effects. */
export const POWER_COLORS: Record<PowerKind, string> = {
  magnet: "#ff4d6d",
  shield: "#27c4f5",
  double: "#a45cff",
};
const COIN_POOL = 220;
const AHEAD = 300;
const dummy = new THREE.Object3D();
const basic = (color: string, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, height = size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = height;
  paint(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Draws a power-up's badge: used on the slope here and, as a data URL, in the HUD. */
export function paintPowerIcon(ctx: CanvasRenderingContext2D, kind: PowerKind, size: number) {
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(50 * u, 50 * u, 46 * u, 0, Math.PI * 2);
  ctx.fillStyle = POWER_COLORS[kind];
  ctx.fill();
  ctx.lineWidth = 6 * u;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "magnet") {
    // A horseshoe magnet, poles up.
    ctx.lineWidth = 15 * u;
    ctx.beginPath();
    ctx.moveTo(32 * u, 30 * u);
    ctx.lineTo(32 * u, 52 * u);
    ctx.arc(50 * u, 52 * u, 18 * u, Math.PI, 0, true);
    ctx.lineTo(68 * u, 30 * u);
    ctx.lineCap = "butt";
    ctx.stroke();
    ctx.fillStyle = POWER_COLORS.magnet;
    ctx.fillRect(23 * u, 36 * u, 18 * u, 4 * u);
    ctx.fillRect(59 * u, 36 * u, 18 * u, 4 * u);
  } else if (kind === "shield") {
    ctx.beginPath();
    ctx.moveTo(50 * u, 22 * u);
    ctx.lineTo(74 * u, 31 * u);
    ctx.quadraticCurveTo(74 * u, 66 * u, 50 * u, 80 * u);
    ctx.quadraticCurveTo(26 * u, 66 * u, 26 * u, 31 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = POWER_COLORS.shield;
    ctx.lineWidth = 6 * u;
    ctx.beginPath();
    ctx.moveTo(39 * u, 50 * u);
    ctx.lineTo(47 * u, 59 * u);
    ctx.lineTo(62 * u, 41 * u);
    ctx.stroke();
  } else {
    ctx.font = `900 ${46 * u}px "Nunito Variable", "Trebuchet MS", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×2", 50 * u, 53 * u);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ models

const LEARNER_SUITS = ["#ffb300", "#ff6f91", "#3ecf8e", "#5aa9ff", "#c77dff"];
/** Reflective tape, and the back of an animal's eye: dull by day, and by night bright in the beam of a lamp and nowhere else. */
const reflective = lampMode(new THREE.MeshLambertMaterial({ color: "#e9eef2" }), { retro: 4, facing: 0 }),
  eyeShine = lampMode(new THREE.MeshLambertMaterial({ color: "#3a2a1c" }), { retro: 40, facing: 0 }),
  paleCoat = lampMode(new THREE.MeshLambertMaterial({ color: "#e9d6b8" }), { retro: 1.2 });
/** A lamp that is lit: it shows whatever the light on it. */
const lit = (color: string) => lampMode(basic(color), { source: true });
const BEACON = new THREE.Color("#ffb020"),
  HEADLIGHT = new THREE.Color("#fff1c4");
/** A learner: a small hare in a bright bib, skis in a snowplough, arms out for balance. */
function learner(index: number) {
  const g = new THREE.Group();
  const suit = material(LEARNER_SUITS[index % LEARNER_SUITS.length]),
    fur = material("#f3ead9"),
    dark = material("#2b3a4a"),
    pink = material("#f2a7a0"),
    ski = material("#3c4f66");
  const body = new THREE.Group();
  body.name = "body";
  g.add(body);
  for (const side of [-1, 1]) {
    const s = shape(g, box, ski, [side * 0.3, 0.05, 0.1], [0.16, 0.05, 1.7]);
    s.rotation.y = -side * 0.28;
    shape(body, sphere, suit, [side * 0.2, 0.42, 0], [0.17, 0.36, 0.19]);
    const arm = shape(body, sphere, suit, [side * 0.5, 1.0, 0.05], [0.3, 0.1, 0.12]);
    arm.name = side < 0 ? "armL" : "armR";
    shape(body, sphere, dark, [side * 0.78, 1.0, 0.05], [0.1, 0.1, 0.1]);
  }
  shape(body, sphere, suit, [0, 0.9, 0], [0.36, 0.44, 0.3]);
  shape(body, box, material("#ffffff"), [0, 0.95, 0.27], [0.3, 0.26, 0.03]);
  // A reflective patch on the back of the bib, which is the side a faster skier sees.
  shape(body, box, reflective, [0, 0.98, -0.29], [0.36, 0.3, 0.03]);
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 1.45, 0.03);
  body.add(head);
  shape(head, sphere, fur, [0, 0.12, 0], [0.33, 0.31, 0.3]);
  for (const side of [-1, 1]) {
    shape(head, sphere, fur, [side * 0.14, 0.62, -0.05], [0.09, 0.34, 0.07], [0, 0, -side * 0.18]);
    shape(head, sphere, pink, [side * 0.14, 0.62, -0.0], [0.045, 0.24, 0.03], [0, 0, -side * 0.18]);
    shape(head, sphere, dark, [side * 0.13, 0.17, 0.27], [0.045, 0.06, 0.03]);
  }
  shape(head, sphere, pink, [0, 0.07, 0.3], [0.05, 0.04, 0.04]);
  // Seen mostly from behind: a helmet stripe and a round tail make it read at a glance.
  shape(head, sphere, suit, [0, 0.2, -0.04], [0.345, 0.27, 0.31]);
  shape(body, sphere, fur, [0, 0.62, -0.3], [0.13, 0.13, 0.13]);
  return g;
}
/** A deer: long legs that gallop, a head that turns to stare. */
function deer() {
  const g = new THREE.Group();
  const coat = material("#a9744a"),
    belly = paleCoat,
    dark = material("#4a3324"),
    antler = material("#e8dcc4");
  const body = new THREE.Group();
  body.name = "body";
  g.add(body);
  shape(body, sphere, coat, [0, 1.25, 0], [0.42, 0.44, 0.95]);
  shape(body, sphere, belly, [0, 1.08, 0], [0.34, 0.3, 0.8]);
  shape(body, sphere, belly, [0, 1.42, -0.92], [0.14, 0.18, 0.12]);
  for (const [i, [x, z]] of [
    [-0.24, 0.62],
    [0.24, 0.62],
    [-0.24, -0.62],
    [0.24, -0.62],
  ].entries()) {
    const leg = new THREE.Group();
    leg.name = `leg${i}`;
    leg.position.set(x, 1.0, z);
    shape(leg, cylinder, coat, [0, -0.45, 0], [0.085, 0.9, 0.085]);
    shape(leg, cylinder, dark, [0, -0.93, 0], [0.09, 0.14, 0.09]);
    body.add(leg);
  }
  const neck = new THREE.Group();
  neck.name = "neck";
  neck.position.set(0, 1.5, 0.75);
  body.add(neck);
  shape(neck, cylinder, coat, [0, 0.35, 0.12], [0.17, 0.8, 0.17], [0.35, 0, 0]);
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.82, 0.28);
  neck.add(head);
  shape(head, sphere, coat, [0, 0, 0.08], [0.2, 0.2, 0.32]);
  shape(head, sphere, dark, [0, -0.04, 0.4], [0.08, 0.07, 0.07]);
  for (const side of [-1, 1]) {
    shape(head, sphere, eyeShine, [side * 0.16, 0.06, 0.16], [0.05, 0.06, 0.05]);
    shape(head, sphere, coat, [side * 0.24, 0.16, -0.08], [0.13, 0.07, 0.05], [0, 0, side * 0.5]);
    shape(head, cylinder, antler, [side * 0.14, 0.42, -0.06], [0.03, 0.55, 0.03], [0, 0, -side * 0.35]);
    shape(head, cylinder, antler, [side * 0.27, 0.5, -0.06], [0.025, 0.28, 0.025], [0, 0, -side * 1.1]);
    shape(head, cylinder, antler, [side * 0.2, 0.68, -0.06], [0.025, 0.22, 0.025], [0, 0, side * 0.5]);
  }
  return g;
}
/** A snowcat: a red groomer on black tracks, blade out front, beacon on the roof. Local +Z is forward. */
function snowcat() {
  const g = new THREE.Group();
  const red = material("#e2382f"),
    deep = material("#a8241f"),
    black = material("#252b33"),
    glass = material("#9fd3ee"),
    steel = material("#b8c4cf");
  for (const side of [-1, 1]) {
    shape(g, box, black, [side * 1.0, 0.4, 0], [0.6, 0.8, 3.7]);
    shape(g, cylinder, black, [side * 1.0, 0.4, 1.85], [0.4, 0.6, 0.4], [0, 0, Math.PI / 2]);
    shape(g, cylinder, black, [side * 1.0, 0.4, -1.85], [0.4, 0.6, 0.4], [0, 0, Math.PI / 2]);
  }
  shape(g, box, red, [0, 1.0, -0.2], [1.9, 0.75, 3.1]);
  shape(g, box, deep, [0, 1.5, -1.1], [1.7, 0.3, 1.2]);
  shape(g, box, red, [0, 1.85, 0.35], [1.6, 1.0, 1.5]);
  shape(g, box, glass, [0, 1.95, 1.12], [1.35, 0.6, 0.05]);
  for (const side of [-1, 1]) shape(g, box, glass, [side * 0.81, 1.95, 0.35], [0.05, 0.6, 1.1]);
  shape(g, box, steel, [0, 0.45, 2.45], [3.3, 0.9, 0.16], [0.25, 0, 0]);
  shape(g, box, steel, [0, 0.25, -2.3], [3.1, 0.12, 0.7]);
  const beacon = shape(g, sphere, lit("#ffb020"), [0, 2.5, 0.2], [0.2, 0.2, 0.2]);
  beacon.name = "beacon";
  const halo = new THREE.Sprite(
    lampMode(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffb020", transparent: true, depthWrite: false, toneMapped: false }), { source: true }),
  );
  halo.name = "halo";
  halo.position.set(0, 2.5, 0.2);
  g.add(halo);
  for (const side of [-1, 1]) shape(g, sphere, lit("#fff6c9"), [side * 0.6, 1.25, 1.36], [0.14, 0.14, 0.05]);
  return g;
}
let glow: THREE.Texture | undefined;
function glowTexture() {
  return (glow ??= canvasTexture(64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }));
}
/** A boulder off the gorge wall, and the ring on the snow that says where it will land. */
function boulder() {
  const g = new THREE.Group();
  const rock = new THREE.Group();
  rock.name = "rock";
  shape(rock, new THREE.IcosahedronGeometry(1, 0), material("#7b7088"), [0, 0, 0], [1.5, 1.3, 1.4]);
  g.add(rock);
  const flat = (geo: THREE.BufferGeometry, color: string, opacity: number, y: number) => {
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    m.position.y = y;
    m.renderOrder = 2;
    return m;
  };
  const ring = new THREE.Group();
  ring.name = "ring";
  ring.add(flat(new THREE.RingGeometry(1.7, 2.4, 36), "#ffd400", 1, 0.09));
  ring.add(flat(new THREE.RingGeometry(2.4, 2.65, 36), "#14263d", 1, 0.09));
  const shadow = flat(new THREE.CircleGeometry(1.5, 28), "#14263d", 0.6, 0.08);
  shadow.name = "shadow";
  g.add(ring, shadow);
  return g;
}
/** A chasm: the trail simply stops, and starts again on the far side of a dark drop. */
function chasm(course: Course, zone: Zone, floor: THREE.Material, wall: THREE.Material) {
  // The drop itself is cut into the mountain (see the terrain); here are only its markers.
  const g = new THREE.Group();
  const trail = course.trail;
  void floor;
  void wall;
  // Tall hazard posts at the four corners, so the gap is known for what it is from far up the slope.
  const post = lampMode(basic("#ffd400"), { retro: 2.5, facing: 0 }),
    stripe = basic("#14263d");
  for (const s of [zone.s, zone.s + zone.length])
    for (const side of [-1, 1]) {
      const p = trailAt(trail, s, side * (trailHalf(trail, s) - 3.5)),
        y = surfaceHeight(course, p.x, p.z);
      shape(g, cylinder, post, [p.x, y + 2.6, p.z], [0.16, 5.2, 0.16]);
      for (const h of [1.2, 2.6, 4]) shape(g, cylinder, stripe, [p.x, y + h, p.z], [0.17, 0.5, 0.17]);
      shape(g, cone, post, [p.x, y + 5.7, p.z], [0.7, 1, 0.7]);
    }
  return g;
}
/** A floating power-up: its badge in a bubble, turning, with a pool of its colour on the snow. */
function powerUp(kind: PowerKind) {
  const g = new THREE.Group();
  const badge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture(128, (ctx, size) => paintPowerIcon(ctx, kind, size)),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  badge.name = "badge";
  badge.scale.setScalar(1.7);
  g.add(badge);
  const bubble = shape(g, sphere, basic("#ffffff", 0.22), [0, 0, 0], [1.25, 1.25, 1.25]);
  bubble.name = "bubble";
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: POWER_COLORS[kind],
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2 + 0.2;
  pool.name = "pool";
  g.add(pool);
  return g;
}

// ------------------------------------------------------------------ zones

/**
 * A sheet of ice as it lies on a slope: a scatter of rounded patches that run into one another, each with a ragged
 * edge and a pale rim of wind-packed snow, drawn exactly where the skis will find it slick.
 */
function icePatches(course: Course, zone: Zone, glaze: THREE.Material, rim: THREE.Material, sheen: THREE.Material) {
  const group = new THREE.Group();
  const trail = course.trail;
  for (const [k, blob] of (zone.blobs ?? []).entries()) {
    for (const [layer, material, grow, lift] of [
      [0, rim, 1.09, 0.036],
      [1, glaze, 1, 0.046],
      // A pale sheen on the up-slope half of each patch: the sky in it.
      [2, sheen, 0.5, 0.054],
    ] as const) {
      const positions: number[] = [],
        uvs: number[] = [],
        index: number[] = [];
      const ring = 30;
      const at = (s: number, u: number) => {
        const p = trailAt(trail, s, u);
        positions.push(p.x, surfaceHeight(course, p.x, p.z) + lift, p.z);
      };
      const cs = layer === 2 ? blob.s - blob.r * 0.3 : blob.s;
      at(cs, blob.u);
      uvs.push(0.5 + blob.u / 11, 0.5 + cs / 11);
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2;
        // The edge wanders in and out a little, differently on every patch.
        const wobble = 1 + 0.1 * Math.sin(a * 3 + k * 1.7) + 0.06 * Math.sin(a * 5 + k * 0.9);
        const r = blob.r * grow * wobble;
        at(cs + Math.cos(a) * r * (layer === 2 ? 0.6 : 1), blob.u + Math.sin(a) * r);
        // The glaze is mapped by where it lies on the slope, so its streaks run on from patch to patch.
        uvs.push(0.5 + (Math.sin(a) * r + blob.u) / 11, 0.5 + (Math.cos(a) * r + blob.s) / 11);
        index.push(0, 1 + i, 1 + ((i + 1) % ring));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(index);
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = layer;
      group.add(mesh);
    }
  }
  return group;
}
const iceTexture = () => {
  const texture = canvasTexture(256, (ctx) => {
    // Clear hard ice: deep blue where the snow has been scoured off it, paler where a skin of frost is left.
    ctx.fillStyle = "#58b4ea";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 22; i++) {
      const x = (i * 89) % 256,
        y = (i * 151) % 256,
        r = 26 + ((i * 37) % 44);
      for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, i % 3 ? "rgba(190,232,255,.75)" : "rgba(22,104,186,.8)");
        g.addColorStop(1, "rgba(150,215,250,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    // Long pale streaks down the slope, where the wind has polished it, and a few hairline cracks across.
    ctx.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const x = (i * 61) % 256,
        y = (i * 113) % 256,
        len = 40 + ((i * 29) % 90);
      ctx.strokeStyle = "rgba(245,252,255," + (0.5 + (i % 4) * 0.12) + ")";
      ctx.lineWidth = 2 + (i % 3) * 1.5;
      for (const oy of [0, -256]) {
        ctx.beginPath();
        ctx.moveTo(x, y + oy);
        ctx.lineTo(x + ((i % 5) - 2) * 3, y + oy + len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(10,62,124,.8)";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 7; i++) {
      let x = (i * 43) % 256,
        y = (i * 97) % 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += 14 + ((i + k) % 3) * 9;
        y += ((i * 7 + k * 5) % 21) - 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Glints.
    ctx.fillStyle = "rgba(255,255,255,.9)";
    for (let i = 0; i < 16; i++) ctx.fillRect((i * 71) % 256, (i * 131) % 256, 4, 4);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
};
const rampTexture = () =>
  canvasTexture(128, (ctx) => {
    ctx.fillStyle = "#f4f9ff";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 13;
    ctx.lineJoin = "miter";
    // Chevrons pointing down the slope (the texture's top edge is the lip).
    for (const y of [104, 68, 32]) {
      ctx.beginPath();
      ctx.moveTo(26, y);
      ctx.lineTo(64, y - 24);
      ctx.lineTo(102, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff7a1a";
    ctx.fillRect(0, 0, 128, 7);
  });
/** The lip of a chasm: packed snow with an orange edge and arrows, tiled across the whole trail. */
const lipTexture = () => {
  const t = rampTexture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
};
const bandTexture = (color: string, mark: (ctx: CanvasRenderingContext2D) => void) =>
  canvasTexture(256, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 64);
    mark(ctx);
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.3, "rgba(0,0,0,1)");
    g.addColorStop(0.7, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 64);
  }, 64);
/** A ramp: a wedge of packed snow rising to an orange lip, with a pole either side. It lies down the trail, tipped to the snow under it. */
function ramp(course: Course, zone: Zone, top: THREE.Material, side: THREE.Material, pole: THREE.Material) {
  const g = new THREE.Group();
  // The lip of a chasm is as wide as the trail and its deep snow together.
  const whole = false;
  const w = whole ? trailHalf(course.trail, zone.s + zone.length) + SHOULDER + 2 : zone.halfWidth,
    l = zone.length,
    steps = 8,
    tiles = whole ? Math.round(w / 3.3) : 1;
  const positions: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  // The top follows the same curve the skier rides: height rises with the square of the distance along.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      y = RAMP_LIP * t * t;
    positions.push(-w, y, t * l, w, y, t * l);
    uvs.push(0, t, tiles, t);
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  topGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  topGeo.setIndex(index);
  topGeo.computeVertexNormals();
  g.add(new THREE.Mesh(topGeo, top));
  // Sides and back: simple skirts down to the snow.
  const skirt: number[] = [],
    skirtIndex: number[] = [];
  for (const sx of [-w, w])
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      skirt.push(sx, RAMP_LIP * t * t, t * l, sx, -0.6, t * l);
    }
  for (let s = 0; s < 2; s++)
    for (let i = 0; i < steps; i++) {
      const a = (s * (steps + 1) + i) * 2;
      skirtIndex.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  const base = skirt.length / 3;
  skirt.push(-w, RAMP_LIP, l, w, RAMP_LIP, l, -w, -0.6, l, w, -0.6, l);
  skirtIndex.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  skirtGeo.setIndex(skirtIndex);
  g.add(new THREE.Mesh(skirtGeo, side));
  for (const sx of [-1, 1]) {
    shape(g, cylinder, pole, [sx * (w + 0.25), 1.2, l], [0.07, 2.4, 0.07]);
    shape(g, cone, pole, [sx * (w + 0.25), 2.75, l], [0.28, 0.5, 0.28], [Math.PI, 0, 0]);
  }
  // The wedge lies on the snow, pointing down the trail: a traverse tips it sideways as well as forward.
  layOnSnow(g, course, zone.x, zone.z, zone.rot, 0.02);
  return g;
}
/** A roadside warning: a yellow diamond on a post. */
function sign(mat: THREE.Material, post: THREE.Material) {
  const g = new THREE.Group();
  shape(g, cylinder, post, [0, 1.1, 0], [0.07, 2.2, 0.07]);
  const face = shape(g, box, mat, [0, 2.5, 0], [1.25, 1.25, 0.06]);
  face.rotation.z = Math.PI / 4;
  return g;
}

/**
 * Everything on a course beyond flags, rock and gold: small coins, power-ups,
 * ice and ramps, the things that move, and the marks on the snow that warn of
 * them. Static pieces are built once per course; the rest are pooled.
 */
export class Props {
  private coins: THREE.InstancedMesh;
  private coinFaces: THREE.InstancedMesh;
  private coinCursor = 0;
  private coinTakenAt: number[] = [];
  private course: Course | null = null;
  private statics = new THREE.Group();
  private powers: { model: THREE.Group; kind: PowerKind }[] = [];
  private powerTakenAt: number[] = [];
  private movers: { model: THREE.Group; kind: MoverKind }[] = [];
  private materials = {
    ice: new THREE.MeshBasicMaterial({ map: iceTexture(), transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false }),
    iceRim: new THREE.MeshBasicMaterial({ color: "#f4fbff", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    iceSheen: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }),
    rampTop: new THREE.MeshBasicMaterial({ map: rampTexture(), toneMapped: false, side: THREE.DoubleSide }),
    rampSide: new THREE.MeshBasicMaterial({ color: "#b9d2e8", toneMapped: false, side: THREE.DoubleSide }),
    pole: lampMode(basic("#ff7a1a"), { retro: 2, facing: 0 }),
    lipTop: new THREE.MeshBasicMaterial({ map: lipTexture(), toneMapped: false, side: THREE.DoubleSide }),
    abyss: basic("#0a1226"),
    abyssWall: new THREE.MeshBasicMaterial({ color: "#5d8fd6", toneMapped: false }),
    rib: new THREE.LineBasicMaterial({ color: "#3f78c9", transparent: true, opacity: 0.75, toneMapped: false }),
    hoof: new THREE.MeshBasicMaterial({
      map: bandTexture("rgba(214,120,40,.62)", (ctx) => {
        // Hoofprints: pairs of dark dashes marching across.
        ctx.fillStyle = "rgba(110,60,25,.9)";
        for (let x = 6; x < 256; x += 20) {
          const y = (x / 20) % 2 ? 24 : 38;
          ctx.beginPath();
          ctx.ellipse(x, y, 3.2, 5, 0.3, 0, Math.PI * 2);
          ctx.ellipse(x + 6, y, 3.2, 5, -0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
    cord: new THREE.MeshBasicMaterial({
      map: bandTexture("rgba(90,140,200,.5)", (ctx) => {
        ctx.fillStyle = "rgba(255,255,255,.7)";
        for (let y = 4; y < 64; y += 6) ctx.fillRect(0, y, 256, 2);
      }),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
    signDeer: new THREE.MeshBasicMaterial({
      map: canvasTexture(64, (ctx) => {
        ctx.fillStyle = "#ffcc1a";
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = 5;
        ctx.strokeRect(4, 4, 56, 56);
        ctx.save();
        ctx.translate(32, 32);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = "#2a2a2a";
        ctx.font = "900 34px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", 0, 2);
        ctx.restore();
      }),
      toneMapped: false,
    }),
    post: material("#6b7785"),
  };
  constructor(private scene: THREE.Scene) {
    // A fat little coin; a paler disc on each face makes the spin read.
    const coinGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 14);
    coinGeo.rotateX(Math.PI / 2);
    this.coins = new THREE.InstancedMesh(coinGeo, lampMode(basic("#f2a81d"), { retro: 0.3, facing: 0 }), COIN_POOL);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    const faceGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 14);
    faceGeo.rotateX(Math.PI / 2);
    this.coinFaces = new THREE.InstancedMesh(faceGeo, lampMode(basic("#ffe07a"), { retro: 0.3, facing: 0 }), COIN_POOL);
    this.coinFaces.frustumCulled = false;
    this.coinFaces.count = 0;
    scene.add(this.coins, this.coinFaces, this.statics);
  }
  reset() {
    this.coinCursor = 0;
    this.coinTakenAt.length = 0;
    this.powerTakenAt.length = 0;
  }
  private laid = new WeakSet<object>();
  /** Builds whatever stands on the course and has not been built yet: all of it for a level, the newest of it for an endless run. */
  private lay(course: Course) {
    const trail = course.trail;
    for (const zone of course.zones) {
      if (this.laid.has(zone)) continue;
      this.laid.add(zone);
      const piece =
        zone.kind === "ice"
          ? icePatches(course, zone, this.materials.ice, this.materials.iceRim, this.materials.iceSheen)
          : zone.kind === "chasm"
            ? chasm(course, zone, this.materials.abyss, this.materials.abyssWall)
            : ramp(course, zone, zone.leap ? this.materials.lipTop : this.materials.rampTop, this.materials.rampSide, this.materials.pole);
      piece.userData.s = zone.s + zone.length / 2;
      this.statics.add(piece);
    }
    // The marks that warn of movers: a hoofprint trail where deer cross, a corduroy band where a snowcat works.
    for (const spec of course.movers) {
      if (this.laid.has(spec)) continue;
      this.laid.add(spec);
      if (spec.kind !== "deer" && spec.kind !== "snowcat") continue;
      const deerHere = spec.kind === "deer";
      const half = trailHalf(trail, spec.s),
        reach = deerHere ? half + 3 : Math.max(3, half - SNOWCAT_MARGIN) + 2.5,
        deep = deerHere ? 2.1 : 2.6;
      if (!deerHere) {
        const band = ribbon(course, spec.s - deep, spec.s + deep, () => -reach, () => reach, this.materials.cord, 0.045, 20);
        band.userData.s = spec.s;
        this.statics.add(band);
      }
      if (deerHere)
        for (const side of [-1, 1]) {
          // A warning sign at each edge of the trail, a little before the crossing, faced up the trail.
          const p = trailAt(trail, spec.s - 3, side * (half - 1.5));
          const s = sign(this.materials.signDeer, this.materials.post);
          s.position.set(p.x, surfaceHeight(course, p.x, p.z), p.z);
          s.rotation.y = p.dir;
          s.userData.s = spec.s;
          this.statics.add(s);
        }
    }
  }
  private build(course: Course) {
    this.course = course;
    for (const child of [...this.statics.children]) {
      this.statics.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.laid = new WeakSet();
    this.lay(course);
    // Pooled models, enough of each kind for this course; an endless one never has more than a few of a kind in sight.
    const need = (kind: MoverKind) => (course.endless ? (kind === "herd" ? 6 : 4) : course.movers.filter((m) => m.kind === kind).length);
    for (const kind of ["skier", "deer", "snowcat", "herd", "plough", "boulder"] as const) {
      const have = this.movers.filter((m) => m.kind === kind).length;
      for (let i = have; i < Math.min(8, need(kind)); i++) {
        const model =
          kind === "skier" ? learner(i) : kind === "deer" || kind === "herd" ? deer() : kind === "boulder" ? boulder() : snowcat();
        model.visible = false;
        this.scene.add(model);
        this.movers.push({ model, kind });
      }
    }
    for (const kind of ["magnet", "shield", "double"] as const) {
      const have = this.powers.filter((p) => p.kind === kind).length;
      for (let i = have; i < course.powers.filter((p) => p.kind === kind).length; i++) {
        const model = powerUp(kind);
        model.visible = false;
        this.scene.add(model);
        this.powers.push({ model, kind });
      }
    }
  }
  update(s: Run, time: number, playing: boolean) {
    const c = s.course;
    if (this.course !== c) this.build(c);
    else if (c.endless) {
      this.lay(c);
      // And what is long behind is taken away again.
      for (const child of [...this.statics.children])
        if ((child.userData.s as number) < s.s - 160) {
          this.statics.remove(child);
          child.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
          });
        }
    }
    this.statics.visible = playing;
    for (const child of this.statics.children) {
      const at = child.userData.s as number,
        span = (child.userData.span as number | undefined) ?? 0;
      child.visible = at + span > s.s - 60 && at - span < s.s + AHEAD + 40;
    }
    // Coins: draw those in view, spinning; one just taken flies up to the skier and shrinks.
    if (this.coinCursor > c.coins.length) this.coinCursor = 0;
    while (this.coinCursor > 0 && c.coins[this.coinCursor - 1].s >= s.s - 14) this.coinCursor--;
    while (this.coinCursor < c.coins.length && c.coins[this.coinCursor].s < s.s - 14) this.coinCursor++;
    let n = 0;
    const skierY = surfaceHeight(c, s.x, s.z) + s.y + 1;
    if (playing)
      for (let i = this.coinCursor; i < c.coins.length && c.coins[i].s < s.s + AHEAD && n < COIN_POOL; i++) {
        const coin = c.coins[i];
        let x = coin.x,
          y = surfaceHeight(c, coin.x, coin.z) + coin.y + 0.95 + Math.sin(time * 3 + coin.z * 0.4) * 0.07,
          z = coin.z,
          scale = 1;
        if (s.coinTaken[i]) {
          const at = (this.coinTakenAt[i] ??= time);
          const t = (time - at) / 0.22;
          if (t >= 1) continue;
          x += (s.x - x) * t;
          y += (skierY - y) * t + Math.sin(t * Math.PI) * 0.8;
          z += (s.z - z) * t;
          scale = 1 - t * 0.7;
        } else if (s.magnet > 0) {
          // A magnet tugs at coins before it takes them.
          const d = Math.hypot(coin.x - s.x, coin.z - s.z);
          if (d < 13) {
            const pull = (1 - d / 13) * 0.35;
            x += (s.x - x) * pull;
            z += (s.z - z) * pull;
          }
        }
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, time * 3.2 + coin.z * 0.35, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        this.coinFaces.setMatrixAt(n, dummy.matrix);
        this.coins.setMatrixAt(n++, dummy.matrix);
      }
    this.coins.count = this.coinFaces.count = n;
    this.coins.instanceMatrix.needsUpdate = this.coinFaces.instanceMatrix.needsUpdate = true;
    // Power-ups.
    const used: Record<string, number> = {};
    for (const p of this.powers) p.model.visible = false;
    if (playing)
      c.powers.forEach((spot, i) => {
        if (spot.s < s.s - 12 || spot.s > s.s + AHEAD) return;
        const k = (used[spot.kind] = (used[spot.kind] ?? 0) + 1);
        const p = this.powers.filter((q) => q.kind === spot.kind)[k - 1];
        if (!p) return;
        let t = 0;
        if (s.powerTaken[i]) {
          t = (time - (this.powerTakenAt[i] ??= time)) / 0.3;
          if (t >= 1) return;
        }
        const ground = surfaceHeight(c, spot.x, spot.z);
        p.model.visible = true;
        p.model.position.set(spot.x, ground, spot.z);
        const bob = 1.5 + Math.sin(time * 2.2 + i) * 0.14 + t * 2.5;
        const badge = p.model.getObjectByName("badge")!,
          bubble = p.model.getObjectByName("bubble")!,
          pool = p.model.getObjectByName("pool")!;
        badge.position.y = bubble.position.y = bob;
        badge.scale.setScalar(1.7 * (1 + t * 0.8));
        (badge as THREE.Sprite).material.opacity = 1 - t;
        bubble.scale.setScalar(1.25 * (1 + Math.sin(time * 4 + i) * 0.04 + t * 1.2));
        pool.position.y = 0.09;
        pool.rotation.x = -Math.PI / 2 + snowTilt(c.trail, spot.z);
        pool.visible = t === 0;
        pool.scale.setScalar(1 + Math.sin(time * 4 + i) * 0.08);
      });
    // Movers.
    const count: Record<string, number> = {};
    for (const m of this.movers) m.model.visible = false;
    if (playing)
      s.movers.forEach((m, i) => {
        if (m.phase !== "active" || m.s < s.s - 30 || m.s > s.s + AHEAD) return;
        const k = (count[m.kind] = (count[m.kind] ?? 0) + 1);
        const visual = this.movers.filter((q) => q.kind === m.kind)[k - 1];
        if (!visual) return;
        const g = visual.model;
        g.visible = true;
        g.position.set(m.x, surfaceHeight(c, m.x, m.z) + 0.02, m.z);
        if (m.kind === "skier") this.poseLearner(g, m, time, i);
        else if (m.kind === "herd") {
          g.scale.setScalar(1.3);
          this.poseDeer(g, { ...m, pace: m.hit ? 0 : 2, t: 99 }, s, time + i);
          if (m.hit) g.rotation.z = 1.4;
        } else if (m.kind === "boulder") {
          // It hangs over its ring, falls, and lands with the ring gone.
          const fall = Math.min(1, m.t / BOULDER_FALL_TIME);
          const rockMesh = g.getObjectByName("rock")!,
            ring = g.getObjectByName("ring")!;
          rockMesh.position.y = 1.1 + 34 * (1 - fall * fall);
          rockMesh.rotation.set(fall * 5, fall * 3, 0);
          ring.visible = fall < 1;
          ring.scale.setScalar(1 + Math.sin(time * 14) * 0.08);
          // Its shadow grows under it as it comes down.
          const shadow = g.getObjectByName("shadow")!;
          shadow.visible = fall < 1;
          shadow.scale.setScalar(0.2 + fall * 0.9);
          // Ring and shadow lie on the snow, which is steep.
          ring.rotation.x = shadow.rotation.x = snowTilt(c.trail, m.z);
        }
        else if (m.kind === "deer") {
          // Drawn larger than life, so it reads from a hundred metres up the slope.
          g.scale.setScalar(1.55);
          this.poseDeer(g, m, s, time);
        }
        else {
          // A machine sits square on the snow, nose the way it is going.
          layOnSnow(g, c, m.x, m.z, m.heading, 0.02);
          const flash = 0.5 + 0.5 * Math.sin(time * 9);
          g.getObjectByName("halo")!.scale.setScalar(1.2 + flash * 2.6);
          g.position.y += Math.sin(time * 22) * 0.012;
          // Its beacon and its headlights are lamps: by night they light the snow round the machine and ahead of it.
          if (c.night) {
            const sin = Math.sin(m.heading),
              cos = Math.cos(m.heading);
            lamp.glow(g.position.x, g.position.y + 3, g.position.z, BEACON, 0.6 + 1.6 * flash, 12);
            lamp.glow(g.position.x + sin * 6, g.position.y + 1.6, g.position.z + cos * 6, HEADLIGHT, 2.2, 13);
          }
        }
      });
  }
  private poseLearner(g: THREE.Group, m: MoverState, time: number, i: number) {
    const body = g.getObjectByName("body")!;
    g.rotation.set(0, m.heading, 0);
    if (m.hit) {
      // Sat down in the snow, arms up, a little dazed.
      body.rotation.set(-1.1, 0, 0);
      body.position.set(0, -0.25, -0.3);
      return;
    }
    body.position.set(0, 0, 0);
    body.rotation.set(0.12, 0, -m.heading * 0.5 + Math.sin(time * 5 + i) * 0.07);
    g.getObjectByName("armL")!.rotation.z = Math.sin(time * 6 + i) * 0.35;
    g.getObjectByName("armR")!.rotation.z = Math.sin(time * 6 + i + 2) * 0.35;
  }
  private poseDeer(g: THREE.Group, m: MoverState, s: Run, time: number) {
    const staring = m.t >= m.trot && m.t < m.trot + m.stare;
    g.rotation.set(0, m.heading, 0);
    const stride = staring ? 0 : m.pace > 1 ? 17 : 11;
    const reach = staring ? 0 : m.pace > 1 ? 0.95 : 0.55;
    for (let i = 0; i < 4; i++)
      g.getObjectByName(`leg${i}`)!.rotation.x = Math.sin(time * stride + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.5) * reach;
    const body = g.getObjectByName("body")!;
    body.position.y = staring ? 0 : Math.abs(Math.sin(time * stride)) * (m.pace > 1 ? 0.4 : 0.15);
    body.rotation.x = staring ? 0 : Math.sin(time * stride) * 0.09;
    // Standing, it turns its head up the slope to look straight at the skier.
    const head = g.getObjectByName("neck")!;
    const toSkier = Math.atan2(s.x - m.x, s.z - m.z) - m.heading;
    head.rotation.y = staring ? Math.atan2(Math.sin(toSkier), Math.cos(toSkier)) * 0.85 : 0;
    head.rotation.x = staring ? -0.25 : 0.2;
  }
}
