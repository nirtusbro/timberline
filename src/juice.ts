import * as THREE from "three";
import { snowHeight, surfaceHeight, type Run } from "./physics";
import type { Weather } from "./levels";
import { POWER_COLORS } from "./props";
import { sphere } from "./geometry";

const SPARKS = 420,
  FLAKES = 1100,
  STREAKS = 46,
  RINGS = 8,
  POLES = 26,
  BILLOWS = 90,
  CHUNKS = 16,
  SHADOW_REACH = 46;
/** How hard it snows in each weather, as a share of the flakes, and how hard the wind blows them. */
const SNOWFALL: Record<Weather, { amount: number; wind: number; fall: number }> = {
  clear: { amount: 0.06, wind: 0.6, fall: 1.6 },
  snow: { amount: 0.5, wind: 2, fall: 3.2 },
  fog: { amount: 0.16, wind: 0.6, fall: 1.4 },
  blizzard: { amount: 1, wind: 11, fall: 5 },
};
const dummy = new THREE.Object3D();
const tint = new THREE.Color();
function dot(soft = true) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(soft ? 0.4 : 0.7, "rgba(255,255,255,.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const wrap = (v: number, centre: number, span: number) =>
  centre + ((((v - centre + span / 2) % span) + span) % span) - span / 2;

/**
 * The feel of a run: sparks when something is collected, rings where the
 * skier lands, falling snow, streaks of speed, the glow of each power-up
 * about the skier, the poles that mark the piste, and the avalanche.
 */
export class Juice {
  private sparkPos = new Float32Array(SPARKS * 3).fill(-10000);
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkCol = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private sparkGeo = new THREE.BufferGeometry();
  private sparkCursor = 0;
  private flakePos = new Float32Array(FLAKES * 3);
  private flakeGeo = new THREE.BufferGeometry();
  private flakes: THREE.Points;
  private amount = 0;
  private streakPos = new Float32Array(STREAKS * 6);
  private streakSeed = new Float32Array(STREAKS * 3);
  private streakGeo = new THREE.BufferGeometry();
  private streaks: THREE.LineSegments;
  private rings: { mesh: THREE.Mesh; age: number }[] = [];
  private poles: THREE.InstancedMesh;
  private poleCaps: THREE.InstancedMesh;
  private bubble: THREE.Mesh;
  private aura: THREE.Mesh;
  private halo: THREE.Mesh;
  private billows: THREE.InstancedMesh;
  private billowSeed = new Float32Array(BILLOWS * 4);
  private wall: THREE.Mesh;
  private shadow: THREE.Mesh;
  private chunks: THREE.InstancedMesh;
  private chunkSeed = new Float32Array(CHUNKS * 4);
  private trail = 0;
  /** Camera shake still to play out, in metres. */
  shake = 0;
  constructor(scene: THREE.Scene) {
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute("color", new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.27,
        map: dot(false),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sparks.frustumCulled = false;
    sparks.renderOrder = 3;
    scene.add(sparks);
    for (let i = 0; i < FLAKES; i++)
      this.flakePos.set([Math.random() * 70 - 35, Math.random() * 34, Math.random() * 110], i * 3);
    this.flakeGeo.setAttribute("position", new THREE.BufferAttribute(this.flakePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flakes = new THREE.Points(
      this.flakeGeo,
      new THREE.PointsMaterial({ size: 0.22, map: dot(), color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.flakes.frustumCulled = false;
    scene.add(this.flakes);
    for (let i = 0; i < STREAKS; i++) {
      const a = Math.random() * Math.PI * 2,
        r = 5 + Math.random() * 9;
      this.streakSeed.set([Math.cos(a) * r * 1.5, Math.abs(Math.sin(a)) * r * 0.7 + 0.6, Math.random() * 70], i * 3);
    }
    this.streakGeo.setAttribute("position", new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.streaks = new THREE.LineSegments(
      this.streakGeo,
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.rings.push({ mesh, age: 9 });
    }
    // Piste poles: orange on the right, blue on the left, every twenty metres. They are what speed is read against.
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6);
    poleGeo.translate(0, 0.95, 0);
    this.poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), POLES * 2);
    const capGeo = new THREE.SphereGeometry(0.17, 8, 6);
    capGeo.translate(0, 1.95, 0);
    this.poleCaps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), POLES * 2);
    for (let i = 0; i < POLES * 2; i++) {
      this.poles.setColorAt(i, tint.set(i % 2 ? "#ff7a1a" : "#2f8fe0"));
      this.poleCaps.setColorAt(i, tint.set(i % 2 ? "#ffb060" : "#7cc1ff"));
    }
    this.poles.frustumCulled = this.poleCaps.frustumCulled = false;
    scene.add(this.poles, this.poleCaps);
    // What the skier wears while a power-up runs.
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: POWER_COLORS.shield, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }),
    );
    const flat = (color: string, inner: number) => {
      const geo = new THREE.RingGeometry(inner, inner + 0.42, 40);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      m.renderOrder = 2;
      return m;
    };
    this.aura = flat(POWER_COLORS.magnet, 1.5);
    this.halo = flat(POWER_COLORS.double, 1.0);
    this.bubble.visible = this.aura.visible = this.halo.visible = false;
    scene.add(this.bubble, this.aura, this.halo);
    // The avalanche: a rolling front of billows with a wall of white behind.
    this.billows = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial({ color: "#f6faff", emissive: "#8fa6c4", emissiveIntensity: 0.35 }), BILLOWS);
    for (let i = 0; i < BILLOWS; i++)
      this.billowSeed.set([Math.random() * 64 - 32, Math.random(), Math.random() * 6.28, 2.6 + Math.random() * 3.4], i * 4);
    this.billows.frustumCulled = false;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 46), new THREE.MeshBasicMaterial({ color: "#eef4fb", toneMapped: false }));
    // The front is behind the camera, so the skier knows it by its shadow,
    // which creeps down the piste ahead of it, and by the boulders of snow it
    // throws past him.
    const shade = document.createElement("canvas");
    shade.width = 4;
    shade.height = 64;
    const sctx = shade.getContext("2d")!;
    const fall = sctx.createLinearGradient(0, 0, 0, 64);
    fall.addColorStop(0, "rgba(255,255,255,1)");
    fall.addColorStop(0.45, "rgba(255,255,255,.7)");
    fall.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = fall;
    sctx.fillRect(0, 0, 4, 64);
    const shadowGeo = new THREE.PlaneGeometry(44, SHADOW_REACH, 8, 23);
    shadowGeo.rotateX(-Math.PI / 2);
    shadowGeo.translate(0, 0, SHADOW_REACH / 2);
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: "#35527c", map: new THREE.CanvasTexture(shade), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    );
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.chunks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#8aa3c6", emissiveIntensity: 0.5, flatShading: true }),
      CHUNKS,
    );
    for (let i = 0; i < CHUNKS; i++)
      this.chunkSeed.set([(i % 2 ? 1 : -1) * (3.5 + Math.random() * 13), Math.random() * 85, 0.4 + Math.random() * 0.8, 8 + Math.random() * 14], i * 4);
    this.chunks.frustumCulled = false;
    this.billows.visible = this.wall.visible = this.shadow.visible = this.chunks.visible = false;
    scene.add(this.billows, this.wall, this.shadow, this.chunks);
  }
  reset() {
    this.sparkPos.fill(-10000);
    this.sparkLife.fill(0);
    this.sparkGeo.attributes.position.needsUpdate = true;
    for (const r of this.rings) r.mesh.visible = false;
    this.shake = 0;
  }
  /** A spray of sparks of one colour from a point. */
  burst(x: number, y: number, z: number, color: string, count = 12, speed = 5, forward = 0) {
    tint.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.sparkCursor;
      this.sparkCursor = (i + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2,
        up = 0.3 + Math.random() * 0.9,
        v = speed * (0.5 + Math.random() * 0.7);
      this.sparkPos.set([x, y, z], i * 3);
      this.sparkVel.set([Math.cos(a) * v, up * v, Math.sin(a) * v * 0.6 + forward], i * 3);
      this.sparkCol.set([tint.r, tint.g, tint.b], i * 3);
      this.sparkLife[i] = 0.4 + Math.random() * 0.35;
    }
  }
  /** A ring that spreads across the snow from a point and fades. */
  ring(x: number, y: number, z: number, color: string, size = 1) {
    const r = this.rings.reduce((a, b) => (a.age > b.age ? a : b));
    r.age = 0;
    r.mesh.position.set(x, y + 0.06, z);
    r.mesh.userData.size = size;
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.mesh.visible = true;
  }
  update(s: Run, dt: number, time: number, camera: THREE.Camera, weather: Weather, running: boolean, snowTint: THREE.Color) {
    const playing = running && !s.finished;
    // Sparks.
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      const b = i * 3;
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[b + 1] = -10000;
        continue;
      }
      this.sparkPos[b] += this.sparkVel[b] * dt;
      this.sparkPos[b + 1] += this.sparkVel[b + 1] * dt;
      this.sparkPos[b + 2] += this.sparkVel[b + 2] * dt;
      this.sparkVel[b + 1] -= 11 * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
    // Rings.
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / 0.5;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar((1 + t * 4.5) * (r.mesh.userData.size as number));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t) * (1 - t);
    }
    // Snowfall lives in a box that travels with the camera, so it never runs out.
    const fall = SNOWFALL[weather];
    this.amount += (fall.amount - this.amount) * Math.min(1, dt * 1.5);
    const cx = camera.position.x,
      cy = camera.position.y,
      cz = camera.position.z;
    for (let i = 0; i < FLAKES; i++) {
      const b = i * 3;
      this.flakePos[b] = wrap(this.flakePos[b] + (fall.wind + Math.sin(time * 1.3 + i) * 0.8) * dt, cx, 70);
      this.flakePos[b + 1] = wrap(this.flakePos[b + 1] - (fall.fall + (i % 5) * 0.3) * dt, cy + 6, 34);
      this.flakePos[b + 2] = wrap(this.flakePos[b + 2], cz + 52, 110);
    }
    this.flakeGeo.attributes.position.needsUpdate = true;
    this.flakeGeo.setDrawRange(0, Math.round(FLAKES * this.amount));
    (this.flakes.material as THREE.PointsMaterial).size = weather === "blizzard" ? 0.3 : 0.22;
    // Streaks of speed: lines that rush past the camera, brighter the faster the run.
    const rush = playing && s.crashTime === 0 ? Math.max(0, (s.speed - 34) / 26) + (s.boost > 0 ? 0.55 : 0) : 0;
    const streakMat = this.streaks.material as THREE.LineBasicMaterial;
    streakMat.opacity += (Math.min(0.5, rush * 0.42) - streakMat.opacity) * Math.min(1, dt * 6);
    this.streaks.visible = streakMat.opacity > 0.01;
    if (this.streaks.visible)
      for (let i = 0; i < STREAKS; i++) {
        const b = i * 3;
        this.streakSeed[b + 2] = (((this.streakSeed[b + 2] - s.speed * 1.4 * dt) % 70) + 70) % 70;
        const x = cx + this.streakSeed[b],
          z = cz - 4 + this.streakSeed[b + 2],
          y = snowHeight(z) + this.streakSeed[b + 1],
          len = 1.5 + s.speed * 0.09;
        this.streakPos.set([x, y, z, x, y - len * 0.1, z + len], i * 6);
      }
    this.streakGeo.attributes.position.needsUpdate = true;
    // Poles keep pace with the skier, twenty metres apart.
    const first = Math.floor((s.z - 30) / 20);
    for (let i = 0; i < POLES; i++) {
      const z = (first + i) * 20;
      for (const side of [0, 1]) {
        dummy.position.set(side ? 13.6 : -13.6, snowHeight(z), z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.poles.setMatrixAt(i * 2 + side, dummy.matrix);
        this.poleCaps.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.poles.instanceMatrix.needsUpdate = this.poleCaps.instanceMatrix.needsUpdate = true;
    this.poles.visible = this.poleCaps.visible = running;
    // Power-ups about the skier.
    const ground = surfaceHeight(s.course, s.x, s.z);
    const feet = ground + s.y;
    this.bubble.visible = playing && s.shield;
    this.bubble.position.set(s.x, feet + 1.1, s.z);
    this.bubble.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
    const fade = (left: number) => (left < 2 ? 0.35 + 0.65 * Math.abs(Math.sin(left * 9)) : 1);
    this.aura.visible = playing && s.magnet > 0;
    this.aura.position.set(s.x, ground + 0.07, s.z);
    this.aura.scale.setScalar(1 + ((time * 1.6) % 1) * 3.4);
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - ((time * 1.6) % 1)) * fade(s.magnet);
    this.halo.visible = playing && s.double > 0;
    this.halo.position.set(s.x, feet + 2.75 + Math.sin(time * 4) * 0.06, s.z);
    this.halo.rotation.y = time * 3;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade(s.double);
    // A boost leaves a hot trail off the skis; a double leaves violet glitter.
    if (playing && dt > 0) {
      this.trail += dt;
      if (this.trail > 0.03) {
        this.trail = 0;
        if (s.boost > 0 && s.crashTime === 0) this.burst(s.x, feet + 0.25, s.z - 1.1, s.boost > 1 ? "#ffd23c" : "#ff8a2a", 2, 1.6, -5);
        if (s.double > 0 && Math.random() < 0.4) this.burst(s.x, feet + 1.4, s.z - 0.5, POWER_COLORS.double, 1, 1.5, -3);
      }
    }
    // The avalanche.
    const slide = !Number.isNaN(s.avalancheZ) && running;
    this.billows.visible = this.wall.visible = this.shadow.visible = this.chunks.visible = slide;
    if (slide) {
      const front = s.avalancheZ;
      (this.wall.material as THREE.MeshBasicMaterial).color.set("#eef4fb").multiply(snowTint);
      this.wall.position.set(0, snowHeight(front - 9) + 16, front - 9);
      for (let i = 0; i < BILLOWS; i++) {
        const b = i * 4,
          row = this.billowSeed[b + 1],
          phase = this.billowSeed[b + 2],
          size = this.billowSeed[b + 3];
        const z = front - row * 9 + Math.sin(time * 2.4 + phase) * 1.2,
          roll = Math.sin(time * 3.1 + phase * 2);
        dummy.position.set(this.billowSeed[b], snowHeight(z) + size * 0.5 + row * 7 + roll * 0.7, z);
        dummy.scale.setScalar(size * (1 + roll * 0.14));
        dummy.rotation.set(time * 1.3 + phase, phase, 0);
        dummy.updateMatrix();
        this.billows.setMatrixAt(i, dummy.matrix);
      }
      this.billows.instanceMatrix.needsUpdate = true;
      // Snow thrown ahead of the front, and a rumble through the camera as it closes.
      if (playing && dt > 0 && Math.random() < 0.7)
        this.burst(Math.random() * 44 - 22, snowHeight(front) + 1.5, front + 1, "#ffffff", 2, 5, 9);
      const gap = s.z - front;
      const near = Math.max(0, 1 - gap / 70);
      const presence = Math.max(0, Math.min(1, 1 - (gap - 20) / 90));
      // The shadow lies on the snow, banks and all: its vertices are laid on the surface each frame.
      this.shadow.position.set(0, 0, front - 4);
      const lay = this.shadow.geometry.attributes.position;
      for (let i = 0; i < lay.count; i++)
        lay.setY(i, surfaceHeight(s.course, lay.getX(i), lay.getZ(i) + front - 4) + 0.07);
      lay.needsUpdate = true;
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * near;
      // Boulders of snow bound out of the front and on down the slope, each in its own lane clear of the skier's.
      for (let i = 0; i < CHUNKS; i++) {
        const b = i * 4,
          size = this.chunkSeed[b + 2],
          ahead = (this.chunkSeed[b + 1] + time * this.chunkSeed[b + 3]) % 85,
          // They come from behind the camera and bound on down the slope, however far back the front is.
          z = s.z - 24 + ahead,
          hop = Math.abs(Math.sin(time * 4.2 + i * 1.7)) * (1.2 + size);
        dummy.position.set(this.chunkSeed[b], snowHeight(z) + size * 0.7 + hop, z);
        // One about to bound through the skier is dropped: they are scenery, and must never look like a hit.
        const through = Math.abs(this.chunkSeed[b] - s.x) < 2.6 && Math.abs(z - s.z) < 9;
        // The nearer the slide, the more of them and the bigger.
        const shown = i < 4 + 12 * presence;
        dummy.scale.setScalar(through || !shown ? 0 : size * (0.55 + 0.4 * presence) * Math.min(1, (85 - ahead) / 20));
        dummy.rotation.set(time * 6 + i, i, time * 3);
        dummy.updateMatrix();
        this.chunks.setMatrixAt(i, dummy.matrix);
      }
      this.chunks.instanceMatrix.needsUpdate = true;
      if (playing) this.shake = Math.max(this.shake, Math.max(0, 1 - gap / 55) * 0.28);
      // The front itself is behind the camera, so what the skier sees of it is
      // what it throws ahead: chunks of snow hurtling past on both sides, thicker the nearer it is.
      if (playing && dt > 0)
        for (let n = 0; n < 3; n++)
          if (Math.random() < near * near * 1.2) {
            const side = Math.random() < 0.5 ? -1 : 1;
            this.burst(s.x + side * (2.5 + Math.random() * 13), snowHeight(s.z) + 0.4 + Math.random() * 3, s.z - 9 + Math.random() * 6, "#ffffff", 2, 3, s.speed + 10 + Math.random() * 16);
          }
    }
    this.shake *= Math.exp(-7 * dt);
  }
}
