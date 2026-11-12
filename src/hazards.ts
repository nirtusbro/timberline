import * as THREE from "three";
import { cone, cylinder, material, pebble, shape, sphere } from "./geometry";
import { surfaceHeight, type Run } from "./physics";
import { layOnSnow, worldAt } from "./terrain";
import { trailDir } from "./trail";
import { hazardPoolSizes } from "./levels";
import { lampMode } from "./lamp";

const pine = material("#2f6a55"),
  snow = material("#eaf4fc"),
  wood = material("#a77f61"),
  bark = material("#7d5a3f"),
  cut = material("#e2c08f"),
  // Dark rock under a white cap: against snow it is the dark that is seen first.
  stone = material("#55626f"),
  granite = material("#5d5266");
/** The ice that walls the river in. */
const serac = new THREE.MeshLambertMaterial({ color: "#bfe6f7", emissive: "#3f9fd0", emissiveIntensity: 0.3, flatShading: true });
/** A reflector: what a rock or a trunk wears on a night run. It is dark until the headlamp finds it, and then it throws the beam back. */
const reflector = lampMode(new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false }), { retro: 2.2, facing: 0 });
// Pools for the hazards within view: enough for the rockiest level outright,
// and for the densest stretch the endless run can generate.
const sizes = hazardPoolSizes();
const ROCK_POOL = Math.max(48, Math.min(90, sizes.rocks)),
  TREE_POOL = Math.max(20, Math.min(90, sizes.trees)),
  LOG_POOL = 14;
const BEHIND = 15,
  AHEAD = 300;
/** Everything that can be hit sits in a dark footprint on the snow, so it is seen for what it is at speed. */
const FOOTPRINTS = ROCK_POOL + TREE_POOL + LOG_POOL + 180;
function footprintTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const lie = new THREE.Object3D();

function mark(g: THREE.Group, y: number) {
  // Two of them, a hand apart: big enough to be read from across the dark.
  const m = new THREE.Group();
  shape(m, sphere, reflector, [-0.35, y, -0.5], [0.22, 0.22, 0.22]);
  shape(m, sphere, reflector, [0.35, y, -0.5], [0.22, 0.22, 0.22]);
  m.name = "reflector";
  g.add(m);
}
function rock(mat = stone) {
  const g = new THREE.Group();
  shape(g, pebble, mat, [0, 0.45, 0], [1.3, 1, 1]);
  shape(g, pebble, snow, [-0.12, 0.98, 0], [1.25, 0.46, 0.99]);
  mark(g, 1.5);
  return g;
}
/** A slab of the gorge wall: tall, narrow, snow on its head. */
function pillar(mat: THREE.Material = granite) {
  const g = new THREE.Group();
  shape(g, pebble, mat, [0, 1.9, 0], [1.25, 3.6, 1.25], [0, 0.6, 0.08]);
  shape(g, pebble, snow, [0, 3.75, 0], [1.05, 0.5, 1.05]);
  mark(g, 2.2);
  return g;
}
function tree(s = 0.78) {
  const g = new THREE.Group();
  shape(g, cylinder, wood, [0, s * 1.1, 0], [s * 0.19, s * 2.2, s * 0.19]);
  for (let level = 0; level < 3; level++) {
    const radius = (2.05 - level * 0.48) * s,
      height = (3 - level * 0.35) * s,
      y = (2.7 + level * 1.45) * s;
    shape(g, cone, pine, [0, y, 0], [radius, height, radius]);
    shape(
      g,
      cone,
      snow,
      [0, y + height * 0.155, 0],
      [radius * 0.86, height * 0.77, radius * 0.86],
    );
  }
  mark(g, 1.3);
  return g;
}
/** A pile of cut logs, lying across the trail: what a rock on the line is in the woods. */
function logs() {
  const g = new THREE.Group();
  for (const [x, y, r] of [
    [-0.45, 0.4, 0.4],
    [0.45, 0.4, 0.4],
    [0, 1.05, 0.38],
  ]) {
    shape(g, cylinder, bark, [0, y, x], [r, 2.7, r], [0, 0, Math.PI / 2]);
    for (const end of [-1, 1]) shape(g, cylinder, cut, [end * 1.36, y, x], [r * 0.82, 0.05, r * 0.82], [0, 0, Math.PI / 2]);
  }
  shape(g, cylinder, snow, [0, 1.42, 0], [0.3, 2.5, 0.2], [0, 0, Math.PI / 2]);
  mark(g, 1.7);
  return g;
}
/**
 * Pooled rocks, trees and log piles for the hazards inside the course. Each
 * frame the hazards near the skier are mapped onto the pools, so a course of
 * any length, including the endless one, draws every hazard that can be hit.
 * What a hazard looks like depends on where it is: a rock on the line is a
 * pile of logs in the woods, and the wall of a narrow stretch is tall pines
 * there and pillars of granite in the gorge.
 */
export class Hazards {
  private rocks: THREE.Group[] = [];
  private pillars: THREE.Group[] = [];
  private seracs: THREE.Group[] = [];
  private trees: THREE.Group[] = [];
  private logPiles: THREE.Group[] = [];
  private cursor = 0;
  private active: Run["course"] | null = null;
  private footprints: THREE.InstancedMesh;
  /** Where each hazard's footprint lies: worked out once, since rock does not move. */
  private lies = new WeakMap<object, THREE.Matrix4>();
  constructor(scene: THREE.Scene) {
    this.footprints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: "#1b3352",
        map: footprintTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      FOOTPRINTS,
    );
    this.footprints.frustumCulled = false;
    this.footprints.renderOrder = 1;
    this.footprints.count = 0;
    scene.add(this.footprints);
    const fill = (pool: THREE.Group[], count: number, make: () => THREE.Group) => {
      for (let i = 0; i < count; i++) {
        const g = make();
        g.visible = false;
        scene.add(g);
        pool.push(g);
      }
    };
    fill(this.rocks, ROCK_POOL, () => rock());
    fill(this.pillars, 90, () => pillar());
    fill(this.seracs, 90, () => pillar(serac));
    fill(this.trees, TREE_POOL, () => tree());
    fill(this.logPiles, LOG_POOL, logs);
  }
  update(s: Run) {
    const hazards = s.course.hazards;
    if (this.active !== s.course || this.cursor > hazards.length) {
      this.active = s.course;
      this.cursor = 0;
    }
    const course = s.course;
    const world = course.endless ? 0 : worldAt(course, s.z);
    const night = s.course.night;
    // Hazards are sorted by s: back up or skip ahead to the first one still in view.
    while (this.cursor > 0 && hazards[this.cursor - 1].s >= s.s - BEHIND) this.cursor--;
    while (this.cursor < hazards.length && hazards[this.cursor].s < s.s - BEHIND) this.cursor++;
    const used = new Map<THREE.Group[], number>();
    let prints = 0;
    for (let i = this.cursor; i < hazards.length && hazards[i].s < s.s + AHEAD; i++) {
      const hazard = hazards[i];
      const pool =
        hazard.kind === "tree"
          ? this.trees
          : hazard.wall
            ? world === 2
              ? this.seracs
              : this.pillars
            : world === 1 && hazard.radius > 1.1
              ? this.logPiles
              : this.rocks;
      const n = used.get(pool) ?? 0;
      const g = pool[n];
      if (!g) continue;
      used.set(pool, n + 1);
      g.position.set(hazard.x, surfaceHeight(course, hazard.x, hazard.z) - 0.05, hazard.z);
      // A pile of logs lies across the trail; everything else is turned any way, the same way every time.
      g.rotation.y = pool === this.logPiles ? trailDir(course.trail, hazard.s) + (hazard.s % 2 ? 0.25 : -0.25) : hazard.u * 0.7 + hazard.s;
      // The trees of a wall stand taller than a tree that guards a token.
      g.scale.setScalar(pool === this.rocks ? hazard.radius : pool === this.trees && hazard.wall ? 1.5 + ((hazard.s * 7) % 5) * 0.1 : 1);
      g.getObjectByName("reflector")!.visible = night;
      g.visible = true;
      if (prints < FOOTPRINTS) {
        let at = this.lies.get(hazard);
        if (!at) {
          const reach = pool === this.rocks ? hazard.radius * 2 : pool === this.logPiles ? 2.5 : pool === this.trees ? 1.7 * g.scale.x : 2.1;
          // It lies a little downhill of the thing, as its shadow would.
          layOnSnow(lie, course, hazard.x - 0.25, hazard.z + 0.3, 0, 0.05);
          lie.scale.set(reach, 1, reach);
          lie.updateMatrix();
          this.lies.set(hazard, (at = lie.matrix.clone()));
        }
        this.footprints.setMatrixAt(prints++, at);
      }
    }
    this.footprints.count = prints;
    this.footprints.instanceMatrix.needsUpdate = true;
    for (const pool of [this.rocks, this.pillars, this.seracs, this.trees, this.logPiles])
      for (let i = used.get(pool) ?? 0; i < pool.length; i++) pool[i].visible = false;
  }
}
