import * as THREE from "three";
import { BANK_RATE, type Course } from "./levels";
import { TERRAIN_PERIOD, bankHeight, snowHeight, type Run } from "./physics";
import { seeded } from "./geometry";

/** The piste between the fences: this wide, so the flat ground tiles can stop short of it. */
export const PISTE_HALF_WIDTH = 22;
/** Metres between vertices across and along the piste. */
const GRID = 2;
const GLINTS = 700;
const snow = new THREE.Color("#eff6fe"),
  shade = new THREE.Color("#9dbcd8");
/**
 * A low sun off to one side and ahead of the skier, for shading the shaped
 * snow: with the light from down the slope, the near face of every rise
 * falls into shade, so a roller reads as a hill before you are on it.
 */
const SUN = new THREE.Vector3(-0.5, 0.7, 0.5).normalize();
const FLAT_LIT = SUN.y;

/** Groomed snow: faint corduroy down the slope, crossed by scuffs and soft hollows that tile every 22 m. */
function groomed() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(77);
  for (let i = 0; i < 26; i++) {
    const x = rand() * 256,
      y = rand() * 256,
      r = 14 + rand() * 30;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, "rgba(140,175,210,.16)");
      g.addColorStop(1, "rgba(140,175,210,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  ctx.fillStyle = "rgba(120,160,200,.06)";
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
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((PISTE_HALF_WIDTH * 2) / 22, TERRAIN_PERIOD / 22);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/**
 * The snow of the piste itself, as two fine tiles a terrain period long that
 * leapfrog down the slope like the ground. Unlike the flat ground either side,
 * a tile is shaped to the course under it: where a level banks the snow, the
 * surface really tilts, sinking on the low side and rising on the high one,
 * with the trough shaded as if in shadow. Sparkle glints ride on the surface.
 */
export class Piste {
  private tiles: THREE.Mesh[] = [];
  private glints: THREE.LineSegments[] = [];
  private glintSpots: number[] = [];
  private course: Course | null = null;
  /** The material of the snow: its colour tints the whole piste to the light of the mountain. */
  readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, map: groomed() });
  constructor(scene: THREE.Scene) {
    const material = this.material;
    const glintMaterial = new THREE.LineBasicMaterial({
      color: "#aec8dd",
      transparent: true,
      opacity: 0.19,
    });
    const rand = seeded(2026);
    for (let i = 0; i < GLINTS; i++) this.glintSpots.push((rand() - 0.5) * 38, rand() * TERRAIN_PERIOD);
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.PlaneGeometry(
        PISTE_HALF_WIDTH * 2,
        TERRAIN_PERIOD,
        PISTE_HALF_WIDTH,
        TERRAIN_PERIOD / GRID,
      );
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, TERRAIN_PERIOD / 2);
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3),
      );
      const tile = new THREE.Mesh(geometry, material);
      tile.frustumCulled = false;
      tile.userData.period = NaN;
      scene.add(tile);
      this.tiles.push(tile);
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(GLINTS * 6), 3));
      const glint = new THREE.LineSegments(lines, glintMaterial);
      glint.frustumCulled = false;
      scene.add(glint);
      this.glints.push(glint);
    }
  }
  update(s: Run) {
    const base = Math.floor((s.z - 300) / TERRAIN_PERIOD);
    this.tiles.forEach((tile, i) => {
      const k = base + i;
      const glint = this.glints[i];
      if (tile.userData.period !== k || this.course !== s.course) {
        tile.userData.period = k;
        this.shape(tile, glint, k, s.course);
      }
      tile.position.set(0, -0.1 * k * TERRAIN_PERIOD, k * TERRAIN_PERIOD);
      glint.position.copy(tile.position);
    });
    this.course = s.course;
  }
  /** Sets a tile's heights and shading for one terrain period of a course. */
  private shape(tile: THREE.Mesh, glint: THREE.LineSegments, k: number, course: Course) {
    const pos = tile.geometry.attributes.position,
      color = tile.geometry.attributes.color;
    const offset = k * TERRAIN_PERIOD;
    const bank = (x: number, z: number) => bankHeight(course, x, z + offset);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const b = bank(x, z);
      pos.setY(i, snowHeight(z) - 0.035 + b);
      // Shade the snow as the low sun would: faces turned away from it darken,
      // faces toward it stay bright, and sunk snow lies a little in shadow.
      const hx = (bank(x + 1, z) - bank(x - 1, z)) / 2,
        hz = (bank(x, z + 1) - bank(x, z - 1)) / 2;
      const n = 1 / Math.hypot(hx, 1, hz);
      const lit = (-hx * SUN.x + SUN.y + -hz * SUN.z) * n;
      const mix = Math.min(
        1,
        Math.max(0, (FLAT_LIT - lit) * 3.5) + Math.min(1, Math.max(0, -b) / (BANK_RATE * 10)) * 0.35,
      );
      color.setXYZ(
        i,
        snow.r + (shade.r - snow.r) * mix,
        snow.g + (shade.g - snow.g) * mix,
        snow.b + (shade.b - snow.b) * mix,
      );
    }
    pos.needsUpdate = true;
    color.needsUpdate = true;
    tile.geometry.computeBoundingSphere();
    const lines = glint.geometry.attributes.position;
    for (let i = 0; i < GLINTS; i++) {
      const x = this.glintSpots[i * 2],
        z = this.glintSpots[i * 2 + 1];
      lines.setXYZ(i * 2, x, snowHeight(z) + bank(x, z) + 0.014, z);
      lines.setXYZ(i * 2 + 1, x + 0.04, snowHeight(z + 1.4) + bank(x, z + 1.4) + 0.014, z + 1.4);
    }
    lines.needsUpdate = true;
  }
}
