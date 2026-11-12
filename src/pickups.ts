import * as THREE from "three";
import { surfaceHeight, type Course, type Run } from "./physics";
import { MAX_TOKENS } from "./levels";
import { box, material, rod, shape } from "./geometry";
import { CRATE_FALL_TIME, CRATE_POOL_SIZE } from "./crates";
import { snowTilt } from "./terrain";
import { lampMode } from "./lamp";

// Gold glints in a lamp, and only in one.
const gold = lampMode(new THREE.MeshBasicMaterial({ color: "#ffc531", toneMapped: false }), { retro: 0.4, facing: 0 }),
  goldDeep = lampMode(new THREE.MeshBasicMaterial({ color: "#e09a12", toneMapped: false }), { retro: 0.4, facing: 0 }),
  goldPale = lampMode(new THREE.MeshBasicMaterial({ color: "#fff0a8", toneMapped: false }), { retro: 0.4, facing: 0 });
/** Round enough to read as a coin at any distance. */
const disc = new THREE.CylinderGeometry(1, 1, 1, 24);
const plank = material("#b98755"),
  band = material("#7a5435"),
  canopyRed = new THREE.MeshLambertMaterial({ color: "#e8483f", side: THREE.DoubleSide }),
  canopyWhite = new THREE.MeshLambertMaterial({ color: "#f6f8fb", side: THREE.DoubleSide }),
  cord = material("#5b6b78");

/** A fat gold coin standing on edge, stamped with a paler disc on each face. */
function token() {
  const g = new THREE.Group();
  const coin = new THREE.Group();
  coin.name = "coin";
  shape(coin, disc, goldDeep, [0, 0, 0], [0.78, 0.16, 0.78], [Math.PI / 2, 0, 0]);
  shape(coin, disc, gold, [0, 0, 0], [0.68, 0.2, 0.68], [Math.PI / 2, 0, 0]);
  shape(coin, disc, goldPale, [0, 0, 0], [0.36, 0.22, 0.36], [Math.PI / 2, 0, 0]);
  g.add(coin);
  return g;
}
/** A wooden supply crate under a striped parachute. */
function crate() {
  const g = new THREE.Group();
  const size = 1.5;
  shape(g, box, plank, [0, size * 0.5, 0], [size, size, size]);
  for (const y of [0.2, 0.8])
    shape(g, box, band, [0, size * y, 0], [size * 1.04, size * 0.12, size * 1.04]);
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      shape(g, box, band, [x * size * 0.47, size * 0.5, z * size * 0.47], [size * 0.12, size * 1.02, size * 0.12]);
  const chute = new THREE.Group();
  chute.name = "chute";
  for (let i = 0; i < 6; i++) {
    const gore = new THREE.SphereGeometry(1, 3, 5, (i * Math.PI) / 3, Math.PI / 3, 0, Math.PI / 2);
    shape(chute, gore, i % 2 ? canopyWhite : canopyRed, [0, 4.1, 0], [2.3, 1.5, 2.3]);
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      rod(
        chute,
        new THREE.Vector3(x * size * 0.45, size, z * size * 0.45),
        new THREE.Vector3(x * 1.55, 4.2, z * 1.55),
        0.025,
        cord,
      );
  g.add(chute);
  return g;
}

/** The things to pick up on a slope: gold tokens placed by the level and crates dropped from the sky. */
export class Pickups {
  private tokens: THREE.Group[] = [];
  private tokenTimes = Array.from({ length: MAX_TOKENS }, () => -10);
  private tokenTaken = Array.from({ length: MAX_TOKENS }, () => false);
  private activeCourse: Course | null = null;
  private crates: { model: THREE.Group; marker: THREE.Mesh }[] = [];
  constructor(scene: THREE.Scene) {
    const ring = new THREE.RingGeometry(1.8, 2.15, 32);
    for (let i = 0; i < CRATE_POOL_SIZE; i++) {
      const model = crate();
      const marker = new THREE.Mesh(
        ring,
        new THREE.MeshBasicMaterial({
          color: "#f0a91e",
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      marker.rotation.x = -Math.PI / 2 + 0.1;
      model.visible = marker.visible = false;
      scene.add(model, marker);
      this.crates.push({ model, marker });
    }
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,200,70,.7)");
    grad.addColorStop(1, "rgba(255,200,70,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < MAX_TOKENS; i++) {
      const g = token();
      const glow = shape(
        g,
        new THREE.PlaneGeometry(4.4, 4.4),
        glowMat,
        [0, 0.05, 0],
        [1, 1, 1],
        [-Math.PI / 2 + 0.1, 0, 0],
      );
      glow.name = "glow";
      g.visible = false;
      scene.add(g);
      this.tokens.push(g);
    }
  }
  reset() {
    this.tokenTaken.fill(false);
    this.tokenTimes.fill(-10);
  }
  update(s: Run, time: number, playing: boolean) {
    if (this.activeCourse !== s.course) {
      this.activeCourse = s.course;
      this.tokens.forEach((group, i) => {
        const spot = s.course.tokens[i];
        group.userData.used = !!spot;
        if (!spot) return;
        group.position.set(spot.x, surfaceHeight(s.course, spot.x, spot.z), spot.z);
        group.getObjectByName("glow")!.rotation.x = -Math.PI / 2 + snowTilt(s.course.trail, spot.z);
      });
    }
    for (const [i, visual] of this.crates.entries()) {
      const item = s.crates.items[i];
      const visible = item.phase !== "inactive" && playing;
      visual.model.visible = visible;
      visual.marker.visible = visible && item.phase !== "collected";
      if (!visible) continue;
      const falling = item.phase === "falling";
      const collected = item.phase === "collected";
      const ground = surfaceHeight(s.course, item.x, item.z);
      const height = falling
        ? 28 * (1 - (item.age / CRATE_FALL_TIME) ** 2)
        : collected
          ? item.age * 6
          : 0.05;
      visual.model.position.set(item.x, ground + height, item.z);
      visual.model.rotation.set(
        falling ? Math.sin(item.age * 4) * 0.12 : 0,
        falling ? item.age * 0.8 : item.x,
        falling ? Math.cos(item.age * 3) * 0.1 : 0,
      );
      visual.model.scale.setScalar(collected ? Math.max(0, 1 - item.age / 0.5) : 1);
      // The parachute folds away in the moment after landing.
      const chute = visual.model.getObjectByName("chute")!;
      const fold = falling ? 1 : Math.max(0, 1 - item.age / 0.35);
      chute.visible = fold > 0 && !collected;
      chute.scale.set(fold, 0.4 + 0.6 * fold, fold);
      visual.marker.position.set(item.x, ground + 0.08, item.z);
      visual.marker.rotation.x = -Math.PI / 2 + snowTilt(s.course.trail, item.z);
      visual.marker.scale.setScalar(falling ? 1 + Math.sin(s.time * 8) * 0.12 : 1);
      (visual.marker.material as THREE.MeshBasicMaterial).opacity = falling ? 0.9 : 0.55;
    }
    for (let i = 0; i < this.tokens.length; i++) {
      const g = this.tokens[i];
      if (!g.userData.used || !playing) {
        g.visible = false;
        continue;
      }
      const taken = s.tokens[i] === true;
      if (taken && !this.tokenTaken[i]) this.tokenTimes[i] = time;
      this.tokenTaken[i] = taken;
      const age = time - this.tokenTimes[i];
      const spot = s.course.tokens[i];
      g.visible = spot.s > s.s - 12 && spot.s < s.s + 260 && (!taken || age < 0.42);
      if (!g.visible) continue;
      const coin = g.getObjectByName("coin")!;
      coin.rotation.y = time * 2.4 + i;
      coin.position.y = 1.25 + Math.sin(time * 2 + i) * 0.12;
      coin.scale.setScalar(1);
      if (taken) {
        coin.position.y += age * 5;
        coin.rotation.y = time * 14;
        coin.scale.setScalar(Math.max(0, 1 - age / 0.42));
      }
      g.getObjectByName("glow")!.visible = !taken;
    }
  }
}
