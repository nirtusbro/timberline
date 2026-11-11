import * as THREE from "three";
import { cone, cylinder, material, pebble, shape } from "./geometry";
import { snowHeight, type Run } from "./physics";
import { hazardPoolSizes } from "./levels";

const pine = material("#326c64"),
  snow = material("#eaf4fc"),
  wood = material("#a77f61"),
  stone = material("#8396a6");
// Pools for the hazards within view: enough for the rockiest level outright,
// and for the densest stretch the endless run can generate.
const sizes = hazardPoolSizes();
const ROCK_POOL = Math.max(48, sizes.rocks),
  TREE_POOL = Math.max(20, sizes.trees);
const BEHIND = 15,
  AHEAD = 260;

function rock() {
  const g = new THREE.Group();
  shape(g, pebble, stone, [0, 0.45, 0], [1.3, 1, 1]);
  shape(g, pebble, snow, [-0.12, 0.98, 0], [1.25, 0.46, 0.99]);
  return g;
}
function tree() {
  const g = new THREE.Group(),
    s = 0.78;
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
  return g;
}
/**
 * Pooled rocks and trees for the hazards inside the course. Each frame the
 * hazards near the skier are mapped onto the pools, so a course of any length,
 * including the endless one, draws every hazard that can be hit.
 */
export class Hazards {
  private rocks: THREE.Group[] = [];
  private trees: THREE.Group[] = [];
  private cursor = 0;
  private active: Run["course"] | null = null;
  constructor(scene: THREE.Scene) {
    for (let i = 0; i < ROCK_POOL + TREE_POOL; i++) {
      const g = i < ROCK_POOL ? rock() : tree();
      g.visible = false;
      scene.add(g);
      (i < ROCK_POOL ? this.rocks : this.trees).push(g);
    }
  }
  update(s: Run) {
    const hazards = s.course.hazards;
    if (this.active !== s.course || this.cursor > hazards.length) {
      this.active = s.course;
      this.cursor = 0;
    }
    // Hazards are sorted by z: back up or skip ahead to the first one still in view.
    while (this.cursor > 0 && hazards[this.cursor - 1].z >= s.z - BEHIND) this.cursor--;
    while (this.cursor < hazards.length && hazards[this.cursor].z < s.z - BEHIND) this.cursor++;
    let rocks = 0,
      trees = 0;
    for (let i = this.cursor; i < hazards.length && hazards[i].z < s.z + AHEAD; i++) {
      const hazard = hazards[i];
      const g = hazard.kind === "rock" ? this.rocks[rocks++] : this.trees[trees++];
      if (!g) continue;
      g.position.set(hazard.x, snowHeight(hazard.z), hazard.z);
      g.rotation.y = hazard.x * 0.7 + hazard.z;
      if (hazard.kind === "rock") g.scale.setScalar(hazard.radius);
      g.visible = true;
    }
    for (let i = rocks; i < ROCK_POOL; i++) this.rocks[i].visible = false;
    for (let i = trees; i < TREE_POOL; i++) this.trees[i].visible = false;
  }
}
