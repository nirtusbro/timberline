import * as THREE from "three";
import { surfaceHeight, type Run } from "./physics";
import { SLIP_ACCEL, SLIP_GRIP } from "./levels";

const TRACKS = 900,
  PARTICLES = 110;
export class SnowEffects {
  private positions = new Float32Array(TRACKS * 2 * 3);
  private trackGeometry = new THREE.BufferGeometry();
  private cursor = 0;
  private previous = [new THREE.Vector3(), new THREE.Vector3()];
  private lastZ = -100;
  private particles = new Float32Array(PARTICLES * 3);
  private velocities = new Float32Array(PARTICLES * 3);
  private life = new Float32Array(PARTICLES);
  private particleGeometry = new THREE.BufferGeometry();
  private particleCursor = 0;
  private emit = 0;
  constructor(scene: THREE.Scene) {
    this.positions.fill(-10000);
    this.trackGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const tracks = new THREE.LineSegments(
      this.trackGeometry,
      new THREE.LineBasicMaterial({
        color: "#87accb",
        transparent: true,
        opacity: 0.33,
      }),
    );
    tracks.frustumCulled = false;
    scene.add(tracks);
    const sprite = document.createElement("canvas");
    sprite.width = 32;
    sprite.height = 32;
    const ctx = sprite.getContext("2d")!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    this.particles.fill(-10000);
    this.particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particles, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const points = new THREE.Points(
      this.particleGeometry,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 0.3,
        map: new THREE.CanvasTexture(sprite),
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
    );
    points.frustumCulled = false;
    scene.add(points);
  }
  reset() {
    this.positions.fill(-10000);
    this.particles.fill(-10000);
    this.life.fill(0);
    this.lastZ = -100;
    this.cursor = 0;
    this.trackGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.position.needsUpdate = true;
  }
  update(s: Run, dt: number, active: boolean) {
    if (active && s.z - this.lastZ > 0.18 && s.crashTime === 0) {
      const reset = s.z - this.lastZ > 3;
      for (let side = 0; side < 2; side++) {
        const offset = side === 0 ? -0.3 : 0.3;
        const x =
          s.x + Math.cos(s.heading) * offset - Math.sin(s.heading) * 0.8;
        const z =
          s.z - Math.sin(s.heading) * offset - Math.cos(s.heading) * 0.8;
        const p = this.previous[side];
        const y = surfaceHeight(s.course, x, z) + 0.025;
        if (!reset) {
          const base = this.cursor * 6;
          this.positions.set([p.x, p.y, p.z, x, y, z], base);
          this.cursor = (this.cursor + 1) % TRACKS;
        }
        p.set(x, y, z);
      }
      this.lastZ = s.z;
      this.trackGeometry.attributes.position.needsUpdate = true;
    }
    if (active) {
      // Skidding sideways throws snow too, more the faster the skid, and it flies the way the skis slide.
      const skid = s.crashTime > 0 ? 0 : s.slip / (SLIP_ACCEL * SLIP_GRIP);
      this.emit +=
        dt * (s.crashTime > 0 ? 130 : 8 + Math.abs(s.heading) * 90 + Math.abs(skid) * 50);
      while (this.emit >= 1) {
        this.emit--;
        const i = this.particleCursor;
        this.particleCursor = (i + 1) % PARTICLES;
        const b = i * 3;
        this.particles.set(
          [
            s.x + (Math.random() - 0.5) * 0.8,
            surfaceHeight(s.course, s.x, s.z) + 0.17,
            s.z - 0.55,
          ],
          b,
        );
        this.velocities.set(
          [
            -s.heading * 5 + skid * 3 + (Math.random() - 0.5) * 3,
            1 + Math.random() * 2,
            -2 - Math.random() * 3,
          ],
          b,
        );
        this.life[i] = 0.35 + Math.random() * 0.5;
      }
    }
    for (let i = 0; i < PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const b = i * 3;
      if (this.life[i] <= 0) {
        this.particles[b + 1] = -10000;
        continue;
      }
      this.particles[b] += this.velocities[b] * dt;
      this.particles[b + 1] += this.velocities[b + 1] * dt;
      this.particles[b + 2] += this.velocities[b + 2] * dt;
      this.velocities[b + 1] -= 4 * dt;
    }
    this.particleGeometry.attributes.position.needsUpdate = true;
  }
}
