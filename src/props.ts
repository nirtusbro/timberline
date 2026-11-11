import * as THREE from "three";
import { box, cone, cylinder, material, shape, sphere } from "./geometry";
import { snowHeight, surfaceHeight, type Course, type Run } from "./physics";
import { RAMP_LIP } from "./extras";
import { DEER_EDGE, DEER_STARE_TIME, DEER_TROT_TIME, SNOWCAT_REACH, type MoverKind, type MoverState } from "./movers";
import type { PowerKind, Zone } from "./levels";

/** The colour each power-up wears everywhere: on the slope, in the HUD, in the effects. */
export const POWER_COLORS: Record<PowerKind, string> = {
  magnet: "#ff4d6d",
  shield: "#27c4f5",
  double: "#a45cff",
};
const COIN_POOL = 220;
const AHEAD = 240;
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
    belly = material("#e9d6b8"),
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
    shape(head, sphere, dark, [side * 0.16, 0.06, 0.16], [0.04, 0.05, 0.04]);
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
  const beacon = shape(g, sphere, basic("#ffb020"), [0, 2.5, 0.2], [0.2, 0.2, 0.2]);
  beacon.name = "beacon";
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffb020", transparent: true, depthWrite: false, toneMapped: false }),
  );
  halo.name = "halo";
  halo.position.set(0, 2.5, 0.2);
  g.add(halo);
  for (const side of [-1, 1]) shape(g, sphere, basic("#fff6c9"), [side * 0.6, 1.25, 1.36], [0.14, 0.14, 0.05]);
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
  pool.rotation.x = -Math.PI / 2 + 0.1;
  pool.name = "pool";
  g.add(pool);
  return g;
}

// ------------------------------------------------------------------ zones

/** A strip of snow-hugging plane between two distances, textured edge to edge. */
function decal(x: number, from: number, to: number, halfWidth: number, mat: THREE.Material, lift = 0.03, course?: Course) {
  const segments = Math.max(1, Math.ceil((to - from) / 2));
  const geo = new THREE.PlaneGeometry(halfWidth * 2, to - from, 4, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, 0, (from + to) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setY(i, (course ? surfaceHeight(course, pos.getX(i), pos.getZ(i)) : snowHeight(pos.getZ(i))) + lift);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  return m;
}
const iceTexture = () =>
  canvasTexture(256, (ctx) => {
    // Hard blue ice: soft-edged, streaked with scratches and a few bright glints.
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, "#a8dcf7");
    g.addColorStop(0.5, "#7fc6ee");
    g.addColorStop(1, "#b6e6fb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.lineCap = "round";
    for (let i = 0; i < 46; i++) {
      const x = (i * 97) % 256,
        y = (i * 53) % 256,
        len = 18 + ((i * 31) % 50);
      ctx.strokeStyle = i % 3 ? "rgba(255,255,255,.55)" : "rgba(70,140,190,.35)";
      ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ((i % 7) - 3) * 2, y + len);
      ctx.stroke();
    }
    // Fade the rim so the sheet melts into the snow.
    ctx.globalCompositeOperation = "destination-in";
    const rim = ctx.createLinearGradient(0, 0, 256, 0);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(0.1, "rgba(0,0,0,1)");
    rim.addColorStop(0.9, "rgba(0,0,0,1)");
    rim.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, 256, 256);
    const ends = ctx.createLinearGradient(0, 0, 0, 256);
    ends.addColorStop(0, "rgba(0,0,0,0)");
    ends.addColorStop(0.06, "rgba(0,0,0,1)");
    ends.addColorStop(0.94, "rgba(0,0,0,1)");
    ends.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ends;
    ctx.fillRect(0, 0, 256, 256);
  });
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
/** A ramp: a wedge of packed snow rising to an orange lip, with a pole either side. */
function ramp(zone: Zone, top: THREE.Material, side: THREE.Material, pole: THREE.Material) {
  const g = new THREE.Group();
  const w = zone.halfWidth,
    l = zone.length,
    steps = 8;
  const positions: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  // The top follows the same curve the skier rides: height rises with the square of the distance along.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      y = RAMP_LIP * t * t;
    positions.push(-w, y, t * l, w, y, t * l);
    uvs.push(0, t, 1, t);
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
  g.position.set(zone.x, snowHeight(zone.z + l / 2) + 0.02, zone.z);
  // Tip the wedge to lie along the slope.
  g.rotation.x = Math.atan2(snowHeight(zone.z) - snowHeight(zone.z + l), l);
  g.position.y = snowHeight(zone.z) + 0.02;
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
    ice: new THREE.MeshBasicMaterial({ map: iceTexture(), transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }),
    rampTop: new THREE.MeshBasicMaterial({ map: rampTexture(), toneMapped: false, side: THREE.DoubleSide }),
    rampSide: new THREE.MeshBasicMaterial({ color: "#b9d2e8", toneMapped: false, side: THREE.DoubleSide }),
    pole: basic("#ff7a1a"),
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
    this.coins = new THREE.InstancedMesh(coinGeo, basic("#f2a81d"), COIN_POOL);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    const faceGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 14);
    faceGeo.rotateX(Math.PI / 2);
    this.coinFaces = new THREE.InstancedMesh(faceGeo, basic("#ffe07a"), COIN_POOL);
    this.coinFaces.frustumCulled = false;
    this.coinFaces.count = 0;
    scene.add(this.coins, this.coinFaces, this.statics);
  }
  reset() {
    this.coinCursor = 0;
    this.coinTakenAt.length = 0;
    this.powerTakenAt.length = 0;
  }
  private build(course: Course) {
    this.course = course;
    for (const child of [...this.statics.children]) {
      this.statics.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    for (const zone of course.zones) {
      const piece =
        zone.kind === "ice"
          ? decal(zone.x, zone.z, zone.z + zone.length, zone.halfWidth, this.materials.ice, 0.03, course)
          : ramp(zone, this.materials.rampTop, this.materials.rampSide, this.materials.pole);
      piece.userData.z = zone.z + zone.length / 2;
      this.statics.add(piece);
    }
    // The marks that warn of movers: a hoofprint trail where deer cross, a corduroy band where a snowcat works.
    for (const spec of course.movers) {
      if (spec.kind === "skier") continue;
      const deerHere = spec.kind === "deer";
      const half = deerHere ? DEER_EDGE : SNOWCAT_REACH + 2.5;
      const band = new THREE.PlaneGeometry(half * 2, deerHere ? 4.2 : 5.2, 20, 1);
      band.rotateX(-Math.PI / 2);
      const pos = band.attributes.position;
      for (let i = 0; i < pos.count; i++)
        pos.setY(i, surfaceHeight(course, pos.getX(i), spec.z + pos.getZ(i)) - snowHeight(spec.z) + 0.035);
      const mesh = new THREE.Mesh(band, deerHere ? this.materials.hoof : this.materials.cord);
      mesh.position.set(0, snowHeight(spec.z), spec.z);
      mesh.renderOrder = 1;
      mesh.userData.z = spec.z;
      this.statics.add(mesh);
      if (deerHere)
        for (const side of [-1, 1]) {
          const s = sign(this.materials.signDeer, this.materials.post);
          s.position.set(side * 15.5, snowHeight(spec.z - 3), spec.z - 3);
          s.userData.z = spec.z;
          this.statics.add(s);
        }
    }
    // Pooled models, enough of each kind for this course.
    const need = (kind: MoverKind) => course.movers.filter((m) => m.kind === kind).length;
    for (const kind of ["skier", "deer", "snowcat"] as const) {
      const have = this.movers.filter((m) => m.kind === kind).length;
      for (let i = have; i < Math.min(8, need(kind)); i++) {
        const model = kind === "skier" ? learner(i) : kind === "deer" ? deer() : snowcat();
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
    this.statics.visible = playing;
    for (const child of this.statics.children) {
      const at = child.userData.z as number;
      child.visible = at > s.z - 60 && at < s.z + AHEAD + 40;
    }
    // Coins: draw those in view, spinning; one just taken flies up to the skier and shrinks.
    if (this.coinCursor > c.coins.length) this.coinCursor = 0;
    while (this.coinCursor > 0 && c.coins[this.coinCursor - 1].z >= s.z - 14) this.coinCursor--;
    while (this.coinCursor < c.coins.length && c.coins[this.coinCursor].z < s.z - 14) this.coinCursor++;
    let n = 0;
    const skierY = surfaceHeight(c, s.x, s.z) + s.y + 1;
    if (playing)
      for (let i = this.coinCursor; i < c.coins.length && c.coins[i].z < s.z + AHEAD && n < COIN_POOL; i++) {
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
        if (spot.z < s.z - 12 || spot.z > s.z + AHEAD) return;
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
        pool.position.y = 0.06;
        pool.visible = t === 0;
        pool.scale.setScalar(1 + Math.sin(time * 4 + i) * 0.08);
      });
    // Movers.
    const count: Record<string, number> = {};
    for (const m of this.movers) m.model.visible = false;
    if (playing)
      s.movers.forEach((m, i) => {
        if (m.phase !== "active" || m.z < s.z - 25 || m.z > s.z + AHEAD) return;
        const k = (count[m.kind] = (count[m.kind] ?? 0) + 1);
        const visual = this.movers.filter((q) => q.kind === m.kind)[k - 1];
        if (!visual) return;
        const g = visual.model;
        g.visible = true;
        g.position.set(m.x, surfaceHeight(c, m.x, m.z) + 0.02, m.z);
        if (m.kind === "skier") this.poseLearner(g, m, time, i);
        else if (m.kind === "deer") {
          // Drawn larger than life, so it reads from a hundred metres up the slope.
          g.scale.setScalar(1.55);
          this.poseDeer(g, m, s, time);
        }
        else {
          g.rotation.y = m.heading;
          const flash = 0.5 + 0.5 * Math.sin(time * 9);
          g.getObjectByName("halo")!.scale.setScalar(1.2 + flash * 2.6);
          g.position.y += Math.sin(time * 22) * 0.012;
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
    const staring = m.t >= DEER_TROT_TIME && m.t < DEER_TROT_TIME + DEER_STARE_TIME;
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
