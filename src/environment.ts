import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SHOULDER, type Course } from "./levels";
import { surfaceHeight } from "./physics";
import { faceHeight, sAtZ, trailAt, trailDir, trailHalf } from "./trail";
import { groundHeight, probe, ribbon, worldAt } from "./terrain";
import { BIOMES, type Theme } from "./themes";
import { box, cone, cylinder, material, pebble, seeded, shape, sphere } from "./geometry";
import { lampMode } from "./lamp";

const dummy = new THREE.Object3D();
/** A rounder stone than the pebble, for drifts of snow and the heads of lamps. */
const mound = new THREE.IcosahedronGeometry(1, 1);
const target = new THREE.Vector3();
const scratchA = new THREE.Color(),
  scratchB = new THREE.Color();
const pine = material("#326c64"),
  snow = material("#eaf4fc"),
  wood = material("#a77f61");
const stone = material("#8396a6");
const glow = new THREE.MeshBasicMaterial({ color: "#ffe9a8", toneMapped: false });
const rockWall = new THREE.MeshLambertMaterial({ color: "#8a7f8f", flatShading: true });
const iceMat = new THREE.MeshLambertMaterial({ color: "#bfe6f7", emissive: "#3f9fd0", emissiveIntensity: 0.25, flatShading: true });

/** The scenery sets a chunk can show; each world shows its own mix. */
export type Scenery = "woods" | "thicket" | "fence" | "lamps" | "cabins" | "walls" | "spires";
export interface Biome {
  show: Scenery[];
  pine: string;
  stone: string;
  peak: string;
  peakSnow: string;
  /** How tall the far peaks stand: rolling hills, needles, a wall. */
  skyline: number;
}
/** Scenery is laid in chunks this long down the fall line, this many of them, the first this far behind the skier. */
const CHUNK = 80,
  CHUNKS = 8,
  BEHIND = 170;
/** The most of each thing one chunk can hold. */
const TREES = 76,
  ROCKS = 6,
  BUSHES = 10,
  POSTS = 40,
  LAMPS = 8,
  SLABS = 26,
  BANKS = 34,
  SHARDS = 10;

/**
 * One instanced mesh for the whole mountain. Each chunk keeps its own run of
 * instances, and whenever a chunk is dressed again the runs are packed end to
 * end, so only what stands on the mountain is ever drawn.
 */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private kept: Float32Array;
  private used = new Array<number>(CHUNKS).fill(0);
  /** Meshes that share this one's instances: the parts of one thing. */
  private with: THREE.InstancedMesh[] = [];
  constructor(scene: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, readonly per: number, share?: Pool) {
    this.mesh = new THREE.InstancedMesh(geometry, mat, per * CHUNKS);
    this.kept = share ? share.kept : new Float32Array(per * CHUNKS * 16);
    if (share) {
      this.mesh.instanceMatrix = share.mesh.instanceMatrix;
      share.with.push(this.mesh);
    }
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  /** Starts a chunk's run again from empty. */
  begin(slot: number) {
    this.used[slot] = 0;
  }
  /** Keeps the next instance of a chunk from the shared dummy. Returns false when the chunk has no more. */
  add(slot: number) {
    const n = this.used[slot];
    if (n >= this.per) return false;
    dummy.updateMatrix();
    dummy.matrix.toArray(this.kept, (slot * this.per + n) * 16);
    this.used[slot] = n + 1;
    return true;
  }
  /** Packs every chunk's run into the mesh. */
  end() {
    const out = this.mesh.instanceMatrix.array as Float32Array;
    let count = 0;
    for (let slot = 0; slot < CHUNKS; slot++) {
      const from = slot * this.per * 16;
      out.set(this.kept.subarray(from, from + this.used[slot] * 16), count * 16);
      count += this.used[slot];
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [this.mesh, ...this.with]) {
      mesh.count = count;
      mesh.visible = count > 0;
    }
  }
}
function put(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(rx, ry, rz);
}
/** A pine in three pieces that share one set of instances: trunk, boughs, and the snow on them. */
function pineParts() {
  const trunk = new THREE.CylinderGeometry(0.19, 0.19, 2.2, 5, 1, true).translate(0, 1.1, 0);
  // Seen from above and beside, never from below: the boughs need no undersides.
  const boughs: THREE.BufferGeometry[] = [],
    caps: THREE.BufferGeometry[] = [];
  for (let level = 0; level < 3; level++) {
    const radius = 2.05 - level * 0.48,
      height = 3 - level * 0.35,
      y = 2.7 + level * 1.45;
    boughs.push(new THREE.ConeGeometry(radius, height, 7, 1, true).translate(0, y, 0));
    caps.push(new THREE.ConeGeometry(radius * 0.86, height * 0.77, 7, 1, true).translate(0, y + height * 0.155, 0));
  }
  return { trunk, boughs: mergeGeometries(boughs), caps: mergeGeometries(caps) };
}
/** How thickly each world is wooded: a tree this often along each edge of the trail (0 for none), this many in the next forty metres, this many beyond, and how tall. */
const WOODS = [
  { edge: 15, near: 14, far: 16, tall: [0.7, 1.9] },
  { edge: 5.5, near: 26, far: 14, tall: [1.25, 2.6] },
  { edge: 0, near: 3, far: 8, tall: [0.7, 1.5] },
  { edge: 0, near: 3, far: 7, tall: [0.8, 1.7] },
  { edge: 34, near: 5, far: 9, tall: [0.8, 1.9] },
];

export class Environment {
  private mountainMat!: THREE.MeshLambertMaterial;
  private peakMat!: THREE.MeshLambertMaterial;
  private biome: Biome | null = null;
  private settled = false;
  private peaks = new THREE.Group();
  mountains = new THREE.Group();
  private finishGroup = new THREE.Group();
  private startGroup = new THREE.Group();
  private course: Course | null = null;
  /** Which stretch of the mountain each chunk is dressed as, and whether the trail had been laid past it when it was. */
  private slots = Array.from({ length: CHUNKS }, () => ({ k: NaN, whole: false, laid: 0 }));
  private trunks: Pool;
  private boughs: Pool;
  private caps: Pool;
  private stones: Pool;
  private stoneCaps: Pool;
  private bushes: Pool;
  private posts: Pool;
  private rails: Pool;
  private railCaps: Pool;
  private lampPosts: Pool;
  private lampHeads: Pool;
  private slabs: Pool;
  private ledges: Pool;
  private banks: Pool;
  private bankSnow: Pool;
  private shards: Pool;
  private pools: Pool[];
  private cabins: { group: THREE.Group; k: number }[] = [];
  private cloud = lampMode(
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    { far: true },
  );
  private starField = lampMode(
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
    { sky: true, veil: true },
  );
  private auroraGlow!: THREE.MeshBasicMaterial;
  private skyDome!: THREE.Mesh;
  private skyHeights!: Float32Array;
  private skyKey = "";
  private ridges: THREE.MeshBasicMaterial[] = [];
  private banner!: THREE.Mesh;
  private finishPoles: THREE.Mesh[] = [];
  private finishLine: THREE.Mesh | null = null;
  private checker!: THREE.MeshBasicMaterial;
  constructor(private scene: THREE.Scene) {
    const parts = pineParts();
    const group = new THREE.Group();
    group.name = "scenery";
    scene.add(group);
    this.trunks = new Pool(group, parts.trunk, wood, TREES);
    this.boughs = new Pool(group, parts.boughs, pine, TREES, this.trunks);
    this.caps = new Pool(group, parts.caps, snow, TREES, this.trunks);
    this.stones = new Pool(group, pebble, stone, ROCKS);
    this.stoneCaps = new Pool(group, pebble, snow, ROCKS);
    this.bushes = new Pool(group, mound, snow, BUSHES);
    this.posts = new Pool(group, box, wood, POSTS);
    this.rails = new Pool(group, box, wood, POSTS * 2);
    this.railCaps = new Pool(group, box, snow, POSTS);
    this.lampPosts = new Pool(group, cylinder, wood, LAMPS);
    this.lampHeads = new Pool(group, mound, glow, LAMPS);
    this.slabs = new Pool(group, pebble, rockWall, SLABS);
    this.ledges = new Pool(group, pebble, snow, SLABS);
    this.banks = new Pool(group, pebble, iceMat, BANKS);
    this.bankSnow = new Pool(group, pebble, snow, BANKS);
    this.shards = new Pool(group, cone, iceMat, SHARDS);
    this.pools = [
      this.trunks,
      this.stones,
      this.stoneCaps,
      this.bushes,
      this.posts,
      this.rails,
      this.railCaps,
      this.lampPosts,
      this.lampHeads,
      this.slabs,
      this.ledges,
      this.banks,
      this.bankSnow,
      this.shards,
    ];
    for (let i = 0; i < 2; i++) {
      const cabin = this.cabin();
      cabin.visible = false;
      scene.add(cabin);
      this.cabins.push({ group: cabin, k: NaN });
    }
    this.backdrop();
    scene.add(this.mountains);
    this.finish(scene);
    this.startSign(scene);
  }
  /** Dresses the mountain as one of the worlds: the colours of its trees, its rock and its far peaks. */
  setBiome(biome: Biome, snap = false) {
    // One world's colours run into the next over a second or so, rather than snapping where an endless run crosses between them.
    const k = snap || this.biome === null ? 1 : 0.035;
    if (this.biome === biome && this.settled) return;
    this.settled = this.biome === biome && Math.abs(this.peaks.scale.y - biome.skyline) < 0.003;
    this.biome = biome;
    pine.color.lerp(scratchA.set(biome.pine), k);
    stone.color.lerp(scratchA.set(biome.stone), k);
    this.peaks.scale.y += (biome.skyline - this.peaks.scale.y) * k;
    this.mountainMat.color.lerp(scratchA.set(biome.peak), k);
    this.peakMat.color.lerp(scratchA.set(biome.peakSnow), k);
  }
  /**
   * The far country, which travels with the skier, and is what says how high
   * this is: a sky that pales toward the true horizon, which stands well above
   * the edge of the falling snow; ranges of hills below that horizon, across a
   * valley, each paler than the one in front; and beyond them the great peaks,
   * tallest up the mountain behind.
   */
  private backdrop() {
    const rand = seeded(1984);
    // The sky: a dome coloured by how high each part of it stands.
    const dome = new THREE.SphereGeometry(1240, 24, 16);
    const heights = dome.attributes.position;
    this.skyHeights = new Float32Array(heights.count);
    for (let i = 0; i < heights.count; i++) this.skyHeights[i] = Math.asin(heights.getY(i) / 1240);
    dome.setAttribute("color", new THREE.BufferAttribute(new Float32Array(heights.count * 3), 3));
    this.skyDome = new THREE.Mesh(dome, lampMode(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false }), { sky: true }));
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.mountains.add(this.skyDome);
    // Three ranges of hills, one behind another.
    const STEPS = 120;
    for (let layer = 0; layer < 3; layer++) {
      const distance = 600 + layer * 85,
        positions: number[] = [],
        index: number[] = [];
      const p1 = rand() * 6,
        p2 = rand() * 6,
        p3 = rand() * 6;
      for (let i = 0; i <= STEPS; i++) {
        const angle = (i / STEPS) * Math.PI * 2,
          down = (Math.cos(angle) + 1) / 2,
          // Whole numbers of waves, so the ring closes on itself.
          jag = Math.sin(angle * 7 + p1) * 0.5 + Math.sin(angle * 13 + p2) * 0.3 + Math.sin(angle * 29 + p3) * 0.2,
          // Below the skier down the valley, climbing round to stand above him up the mountain.
          top = -82 + layer * 36 + (1 - down) * 190 + jag * (34 + layer * 12),
          x = Math.sin(angle) * distance,
          z = Math.cos(angle) * distance;
        positions.push(x, top, z, x, -420, z);
        if (i < STEPS) {
          const a = i * 2;
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(index);
      // By night the hills are shapes against the stars and nothing more.
      const material = lampMode(new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), { far: true });
      const ridge = new THREE.Mesh(geo, material);
      ridge.frustumCulled = false;
      ridge.renderOrder = -6 - layer;
      this.ridges.push(material);
      this.mountains.add(ridge);
    }
    const mountainMat = (this.mountainMat = lampMode(new THREE.MeshLambertMaterial({ color: "#8cb3ce", flatShading: true }), { far: true }));
    const peakMat = (this.peakMat = lampMode(new THREE.MeshLambertMaterial({ color: "#f0f6fd", flatShading: true }), { far: true }));
    const COUNT = 26;
    for (let i = 0; i < COUNT; i++) {
      const angle = ((i + rand() * 0.6) / COUNT) * Math.PI * 2,
        // 1 looking down the valley, 0 looking back up the mountain.
        down = (Math.cos(angle) + 1) / 2,
        distance = 880 + rand() * 130,
        radius = 110 + rand() * 80,
        // Below, the peaks stand across a deep valley, their feet far under the skier; above, the mountain itself goes on up.
        base = 40 - 300 * down - rand() * 50,
        height = (1 - down) * (300 + rand() * 220) + down * (300 + rand() * 260),
        x = Math.sin(angle) * distance,
        z = Math.cos(angle) * distance;
      const mountain = shape(this.peaks, cone, mountainMat, [x, base + height / 2, z], [radius, height, radius * 0.8], [0, i * 0.5, 0]);
      shape(this.peaks, cone, peakMat, [x, base + height * 0.77, z], [radius * 0.48, height * 0.48, radius * 0.8 * 0.48], [0, mountain.rotation.y, 0]);
    }
    this.mountains.add(this.peaks);
    const cloud = this.cloud;
    // High cloud, all the way round.
    for (let i = 0; i < 11; i++)
      for (let j = 0; j < 4; j++) {
        const angle = (i / 11) * Math.PI * 2 + j * 0.03 + rand() * 0.2;
        shape(
          this.mountains,
          sphere,
          cloud,
          [Math.sin(angle) * 720, 230 + (i % 3) * 34 + Math.sin(j) * 7, Math.cos(angle) * 720],
          [38, 8 + (j % 2) * 7, 38],
        );
      }
    // Stars and an aurora; only the night lights them.
    const starSpots: number[] = [];
    for (let i = 0; i < 420; i++) {
      const angle = rand() * Math.PI * 2,
        up = 0.08 + rand() * 0.9,
        flat = Math.sqrt(1 - up * up);
      starSpots.push(Math.sin(angle) * flat * 1000, up * 1000, Math.cos(angle) * flat * 1000);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starSpots, 3));
    const stars = new THREE.Points(starGeometry, this.starField);
    stars.frustumCulled = false;
    stars.renderOrder = -2;
    this.mountains.add(stars);
    const curtain = document.createElement("canvas");
    curtain.width = 256;
    curtain.height = 128;
    const paint = curtain.getContext("2d")!;
    for (let x = 0; x < 256; x++) {
      // Rays of uneven height and strength, fading upward from a bright hem.
      const ray = 0.45 + 0.55 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037 + 1));
      const fade = paint.createLinearGradient(0, 128, 0, 128 - 128 * ray);
      fade.addColorStop(0, "rgba(120,255,190,0)");
      fade.addColorStop(0.12, `rgba(110,255,180,${0.55 * ray})`);
      fade.addColorStop(0.6, `rgba(120,160,255,${0.22 * ray})`);
      fade.addColorStop(1, "rgba(170,120,255,0)");
      paint.fillStyle = fade;
      paint.fillRect(x, 0, 1, 128);
    }
    const curtainTexture = new THREE.CanvasTexture(curtain);
    curtainTexture.colorSpace = THREE.SRGBColorSpace;
    this.auroraGlow = lampMode(
      new THREE.MeshBasicMaterial({
        map: curtainTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      { sky: true, veil: true },
    );
    for (const [angle, y, width, turn] of [
      [-0.38, 270, 760, 0.18],
      [0.42, 320, 680, -0.22],
      [1.9, 300, 700, 0.2],
      [-2.1, 290, 720, -0.15],
    ]) {
      const band = shape(
        this.mountains,
        new THREE.PlaneGeometry(width, 260),
        this.auroraGlow,
        [Math.sin(angle) * 690, y, Math.cos(angle) * 690],
        [1, 1, 1],
        [0, Math.PI + angle + turn, 0],
      );
      band.renderOrder = -1;
    }
  }
  private cabin() {
    const g = new THREE.Group();
    // The hill falls away under it, so it stands on a footing of stone.
    shape(g, box, stone, [0, -1.4, 0], [5.5, 3, 4.7]);
    shape(g, box, material("#9d6c4c"), [0, 1.9, 0], [5.2, 3.8, 4.4]);
    for (let i = 0; i < 7; i++) shape(g, box, material("#81553d"), [0, 0.5 + i * 0.44, -2.22], [5.3, 0.08, 0.06]);
    for (const side of [-1, 1]) {
      shape(g, box, material("#634a3d"), [side * 1.6, 4.4, 0], [3.9, 0.23, 5.6], [0, 0, -side * 0.52]);
      shape(g, box, snow, [side * 1.6, 4.59, 0], [4, 0.25, 5.65], [0, 0, -side * 0.52]);
      shape(g, box, material("#ffe1a0"), [side * 1.5, 2, -2.23], [0.9, 1.15, 0.04]);
      shape(g, box, wood, [side * 1.5, 2, -2.28], [0.06, 1.2, 0.04]);
      shape(g, box, wood, [side * 1.5, 2, -2.28], [0.95, 0.06, 0.04]);
    }
    shape(g, box, material("#5a463b"), [0, 1.25, -2.24], [0.9, 2.5, 0.1]);
    shape(g, box, stone, [1.2, 5.4, 1], [0.65, 1.8, 0.65]);
    shape(g, box, snow, [1.2, 6.3, 1], [0.8, 0.2, 0.8]);
    shape(g, box, wood, [0, 0.23, -3], [6, 0.3, 1.5]);
    return g;
  }
  /** The finish: two poles at the edges of the trail, a chequered banner between their heads and a chequered line on the snow. */
  private finish(scene: THREE.Scene) {
    const group = this.finishGroup;
    group.visible = false;
    scene.add(group);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 16;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 32; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#2e80b2" : "#f2f9ff";
        ctx.fillRect(i * 8, j * 8, 8, 8);
      }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    this.checker = lampMode(new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }), { retro: 1.5 });
    const blue = material("#2e80b2");
    for (let i = 0; i < 2; i++) {
      const pole = shape(group, cylinder, blue, [0, 0, 0], [0.26, 8, 0.26]);
      shape(pole, sphere, material("#f2f9ff"), [0, 0.52, 0], [1.3, 0.045, 1.3]);
      this.finishPoles.push(pole);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.banner = new THREE.Mesh(geo, this.checker);
    this.banner.frustumCulled = false;
    group.add(this.banner);
  }
  private startSign(scene: THREE.Scene) {
    const group = this.startGroup;
    scene.add(group);
    shape(group, box, wood, [0, 1.1, 0], [0.18, 2.4, 0.18]);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#245d66";
    ctx.fillRect(0, 0, 512, 180);
    ctx.fillStyle = "#f2f7ef";
    ctx.textAlign = "center";
    ctx.font = "bold 54px sans-serif";
    ctx.fillText("TIMBERLINE", 256, 82);
    ctx.font = "26px sans-serif";
    ctx.fillText("SLALOM START · 1,850 M", 256, 131);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    shape(
      group,
      new THREE.PlaneGeometry(4, 1.4),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      [0, 2.3, -0.02],
      [1, 1, 1],
      [0, Math.PI, 0],
    );
  }
  /** Stands the start sign and the finish where this course has them. */
  private setCourse(course: Course) {
    const trail = course.trail;
    this.startGroup.position.set(-11, surfaceHeight(course, -11, 8), 8);
    const finite = Number.isFinite(course.finishS);
    this.finishGroup.visible = finite;
    if (this.finishLine) {
      this.finishGroup.remove(this.finishLine);
      this.finishLine.geometry.dispose();
      this.finishLine = null;
    }
    if (!finite) return;
    const s = course.finishS,
      half = trailHalf(trail, s);
    const pos = this.banner.geometry.attributes.position as THREE.BufferAttribute;
    [-1, 1].forEach((side, i) => {
      const p = trailAt(trail, s, side * half),
        y = surfaceHeight(course, p.x, p.z);
      this.finishPoles[i].position.set(p.x, y + 4, p.z);
      // The banner hangs between the heads of the poles, level with neither if the trail crosses the hill.
      pos.setXYZ(i, p.x, y + 6.2, p.z);
      pos.setXYZ(i + 2, p.x, y + 7.9, p.z);
    });
    pos.needsUpdate = true;
    this.finishLine = ribbon(course, s, s + 2.8, () => -half, () => half, this.checker, 0.05, 16);
    this.finishGroup.add(this.finishLine);
  }
  /**
   * Colours the sky and the far hills from the colour the weather has made of
   * the air (which is also the colour the snow fades to with distance): that
   * colour low down, paler at the true horizon, deeper overhead.
   */
  private paintSky(air: THREE.Color, peak: THREE.Color, haze: number, night: number, zenith: THREE.Color) {
    // In fog or a blizzard the far country is gone.
    this.peaks.visible = haze < 0.45;
    const key = air.getHexString() + peak.getHexString() + haze.toFixed(2) + night.toFixed(3);
    if (key === this.skyKey) return;
    this.skyKey = key;
    // A bright sky pales a good deal toward the horizon; a dark one only glows a little there.
    const light = (air.r + air.g + air.b) / 3;
    const pale = scratchA.copy(air).lerp(scratchB.set("#ffffff"), (0.08 + 0.4 * light * light) * (1 - night)),
      deep = scratchB.copy(air).multiplyScalar(0.74);
    const color = this.skyDome.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < color.count; i++) {
      const at = this.skyHeights[i];
      // Up to five degrees under the horizon the sky is the colour of the far snow, so the mountain melts into it.
      const low = Math.max(0, Math.min(1, (at + 0.09) / 0.1)),
        high = Math.max(0, Math.min(1, (at - 0.01) / 0.75));
      const r = air.r + (pale.r - air.r) * low,
        g = air.g + (pale.g - air.g) * low,
        b = air.b + (pale.b - air.b) * low;
      // On a night run the dark of the ground runs up into a sky that is only deep blue well overhead.
      const up = night * Math.max(0, Math.min(1, (at - 0.04) / 0.7));
      const dr = r + (deep.r - r) * high,
        dg = g + (deep.g - g) * high,
        db = b + (deep.b - b) * high;
      color.setXYZ(i, dr + (zenith.r * 0.5 - dr) * up, dg + (zenith.g * 0.5 - dg) * up, db + (zenith.b * 0.5 - db) * up);
    }
    color.needsUpdate = true;
    // Each range of hills is the colour of the far peaks seen through more air.
    this.ridges.forEach((material, layer) => material.color.copy(peak).multiplyScalar(0.82).lerp(air, Math.min(1, 0.38 + layer * 0.2 + haze * 1.6)));
  }
  /** Lights the sky to a theme: cloud colour, and the stars and aurora of the night. */
  applyTheme(theme: Theme, air: THREE.Color = theme.sky, haze = 0, night = 0) {
    this.paintSky(air, this.mountainMat.color, haze, night, theme.sky);
    this.cloud.color.copy(theme.cloud);
    // No cloud is lit on a night run.
    this.cloud.opacity = theme.cloudOpacity * (1 - night);
    this.cloud.visible = night < 0.99;
    this.starField.opacity = theme.stars * 0.9;
    this.starField.visible = theme.stars > 0.01;
    this.auroraGlow.opacity = theme.aurora * 0.85;
    this.auroraGlow.visible = theme.aurora > 0.01;
  }
  /** Dresses one chunk of the mountain: everything that stands beside the trail between two levels of it. */
  private lay(slot: number, k: number, course: Course) {
    const trail = course.trail,
      z0 = k * CHUNK,
      z1 = z0 + CHUNK,
      sA = sAtZ(trail, z0),
      sB = sAtZ(trail, z1),
      world = worldAt(course, z0 + CHUNK / 2),
      show = BIOMES[world].show,
      woods = WOODS[world],
      rand = seeded((k * 7919 + 1013) >>> 0);
    for (const pool of this.pools) pool.begin(slot);
    /** A point beside the trail: `off` metres past the edge of the deep snow at s, on one side. Null if a bend puts it nearer the trail than `clear`. */
    const beside = (s: number, side: number, off: number, clear = 1) => {
      const p = trailAt(trail, s, side * (trailHalf(trail, s) + SHOULDER + off));
      const y = groundHeight(course, p.x, p.z);
      return probe.e < clear ? null : { x: p.x, y, z: p.z, dir: p.dir, e: probe.e };
    };
    const along = () => sA + rand() * (sB - sA);
    const side = () => (rand() < 0.5 ? -1 : 1);
    const tree = (p: { x: number; y: number; z: number } | null, tall: number) => {
      if (!p) return;
      // Sunk a little, so a tree on steep ground does not show its foot.
      put(p.x, p.y - 0.35 * tall, p.z, tall, tall, tall, 0, rand() * 6, 0);
      this.trunks.add(slot);
    };
    const height = () => woods.tall[0] + rand() * (woods.tall[1] - woods.tall[0]);
    // The edge of the wood stands right at the edge of the trail, so the trail's width is the gap between the trees.
    if (woods.edge)
      for (let s = Math.ceil(sA / woods.edge) * woods.edge; s < sB; s += woods.edge)
        for (const sd of [-1, 1]) {
          if (world === 0 && rand() < 0.35) continue;
          tree(beside(s + rand() * woods.edge * 0.6, sd, 1.2 + rand() * (world === 1 ? 3 : 6), 1.2), height() * (world === 1 ? 1 : 0.8));
        }
    for (let i = 0; i < woods.near; i++) tree(beside(along(), side(), 5 + rand() * rand() * 36, 3), height());
    for (let i = 0; i < woods.far; i++) tree(beside(along(), side(), 40 + rand() * 180, 20), height() * 1.15);
    // Boulders and drifts of snow along the edge, everywhere.
    for (let i = 0; i < ROCKS; i++) {
      const p = beside(along(), side(), 1.5 + rand() * 22, 1.5);
      if (!p) continue;
      const r = 1 + rand() * 1.4;
      put(p.x, p.y + r * 0.35, p.z, r * 1.3, r, r, 0, rand() * 6, 0);
      this.stones.add(slot);
      put(p.x - 0.12, p.y + r * 0.88, p.z, r * 1.25, r * 0.46, r * 0.99, 0, dummy.rotation.y, 0);
      this.stoneCaps.add(slot);
    }
    for (let i = 0; i < BUSHES; i++) {
      const p = beside(along(), side(), 0.4 + rand() * 5, 0.3);
      if (!p) continue;
      const r = 0.6 + rand() * 0.8;
      put(p.x, p.y + r * 0.3, p.z, r * 1.5, r * 0.8, r * 1.3);
      this.bushes.add(slot);
    }
    if (show.includes("fence")) {
      // A rail fence along the far side of the deep snow, both sides.
      const STEP = 8;
      for (let s = Math.ceil(sA / STEP) * STEP; s < sB; s += STEP)
        for (const sd of [-1, 1]) {
          const a = beside(s, sd, 0.4, -1),
            b = beside(s + STEP, sd, 0.4, -1);
          if (!a || !b) continue;
          put(a.x, a.y + 0.65, a.z, 0.2, 1.45, 0.24, 0, a.dir, 0);
          this.posts.add(slot);
          const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          for (const [pool, lift, thick] of [
            [this.rails, 0.4, 0.14],
            [this.rails, 0.95, 0.14],
            [this.railCaps, 1.04, 0.08],
          ] as const) {
            dummy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, (a.z + b.z) / 2);
            dummy.lookAt(target.set(b.x, b.y + lift, b.z));
            dummy.scale.set(thick === 0.08 ? 0.19 : 0.14, thick, length);
            pool.add(slot);
          }
        }
    }
    if (show.includes("lamps")) {
      const STEP = 40;
      for (let s = Math.ceil(sA / STEP) * STEP; s < sB; s += STEP) {
        const p = beside(s, Math.round(s / STEP) % 2 ? 1 : -1, 1, 0);
        if (!p) continue;
        put(p.x, p.y + 1.6, p.z, 0.09, 3.2, 0.09);
        this.lampPosts.add(slot);
        put(p.x, p.y + 3.35, p.z, 0.32, 0.4, 0.32);
        this.lampHeads.add(slot);
      }
    }
    if (show.includes("walls")) {
      // The gorge: slabs of rock standing at the foot of each wall, stepped and snow-topped.
      const STEP = 11;
      for (let s = Math.ceil(sA / STEP) * STEP; s < sB; s += STEP)
        for (const sd of [-1, 1]) {
          const p = beside(s + rand() * 5, sd, 4 + rand() * 7, 3);
          if (!p) continue;
          const h = 9 + rand() * 13,
            turn = rand() * 3;
          put(p.x, p.y + h * 0.25, p.z, 6 + rand() * 3, h, 8 + rand() * 3, 0, turn, sd * 0.12);
          this.slabs.add(slot);
          // Snow lies on its shoulders, sunk into the rock rather than balanced on its point.
          put(p.x - sd * 0.4, p.y + h * 0.25 + h * 0.6, p.z, dummy.scale.x * 0.72, h * 0.3, dummy.scale.z * 0.72, 0, turn, sd * 0.12);
          this.ledges.add(slot);
        }
    }
    if (show.includes("spires")) {
      // The river's banks: a broken wall of ice along either edge of the channel, and shards standing out of the flat white above.
      const STEP = 8.5;
      for (let s = Math.ceil(sA / STEP) * STEP; s < sB; s += STEP)
        for (const sd of [-1, 1]) {
          const p = beside(s + rand() * 3, sd, 1.2 + rand() * 1.6, 0.6);
          if (!p) continue;
          const h = 2.4 + rand() * 2.8;
          put(p.x, p.y + h * 0.2, p.z, 2.6 + rand(), h, 6.5, 0, p.dir + rand() * 0.4, -sd * 0.2);
          this.banks.add(slot);
          put(p.x + sd * 0.4, p.y + h * 0.2 + h * 0.8, p.z, 2.4, 0.7, 6, 0, p.dir, 0);
          this.bankSnow.add(slot);
        }
      for (let i = 0; i < SHARDS; i++) {
        const p = beside(along(), side(), 7 + rand() * 40, 5);
        if (!p) continue;
        const h = 2.5 + rand() * 7;
        put(p.x, p.y + h * 0.42, p.z, 0.8 + rand() * 1.4, h, 0.8 + rand() * 1.4, (rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
        this.shards.add(slot);
      }
    }
    for (const pool of this.pools) pool.end();
    // A cabin now and then, on the resort's own mountain, set back from the trail and turned to face it.
    const cabin = this.cabins[(((k / 4) % 2) + 2) % 2];
    if (cabin && k % 4 === 0) {
      const sd = k % 8 === 0 ? -1 : 1,
        p = show.includes("cabins") ? beside((sA + sB) / 2, sd, 13, 9) : null;
      cabin.k = k;
      cabin.group.visible = p !== null;
      if (p) {
        cabin.group.position.set(p.x, p.y + 0.6, p.z);
        cabin.group.rotation.y = p.dir + sd * 0.6;
      }
    }
  }
  /** Keeps the scenery laid round a point of the mountain, and the far country centred on it. */
  update(course: Course, x: number, z: number) {
    let all = false;
    if (this.course !== course) {
      this.course = course;
      this.setCourse(course);
      for (const slot of this.slots) slot.k = NaN;
      for (const cabin of this.cabins) cabin.group.visible = false;
      all = true;
    }
    const base = Math.floor((z - BEHIND) / CHUNK);
    let budget = all ? CHUNKS : 1;
    for (let k = base; k < base + CHUNKS && budget > 0; k++) {
      const index = ((k % CHUNKS) + CHUNKS) % CHUNKS,
        slot = this.slots[index];
      if (slot.k === k && (slot.whole || slot.laid === course.trail.endS)) continue;
      slot.k = k;
      slot.laid = course.trail.endS;
      slot.whole = !course.endless || course.trail.pz[course.trail.pz.length - 1] > (k + 1) * CHUNK + 250;
      this.lay(index, k, course);
      budget--;
    }
    this.mountains.position.set(x, faceHeight(course.trail, z), z);
  }
}
void trailDir;
