import * as THREE from "three";
import { surfaceHeight, type Run } from "./physics";
import { SHOULDER, type Weather } from "./levels";
import { faceHeight, trailAt, trailHalf } from "./trail";
import { snowTilt } from "./terrain";
import { POWER_COLORS } from "./props";
import { sphere } from "./geometry";
import { lampMode } from "./lamp";

const SPARKS = 420,
  FLAKES = 1300,
  FLAKE_BOX = 90,
  STREAKS = 46,
  RINGS = 8,
  POLES = 24,
  POLE_STEP = 20,
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
  private tilt = 0.2;
  private shadowLie: Float32Array;
  /** Camera shake still to play out, in metres. */
  shake = 0;
  constructor(scene: THREE.Scene) {
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute("color", new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.Points(
      this.sparkGeo,
      lampMode(
        new THREE.PointsMaterial({
          size: 0.27,
          map: dot(false),
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
        { veil: true },
      ),
    );
    sparks.frustumCulled = false;
    sparks.renderOrder = 3;
    scene.add(sparks);
    for (let i = 0; i < FLAKES; i++)
      this.flakePos.set([Math.random() * FLAKE_BOX, Math.random() * 34, Math.random() * FLAKE_BOX], i * 3);
    this.flakeGeo.setAttribute("position", new THREE.BufferAttribute(this.flakePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flakes = new THREE.Points(
      this.flakeGeo,
      // A flake in the beam is a bright speck; out of it, it is not there.
      lampMode(new THREE.PointsMaterial({ size: 0.22, map: dot(), color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), { veil: true, retro: 1.5 }),
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
      lampMode(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), { veil: true }),
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
    // Piste poles: orange down one edge of the groomed snow, blue down the other, every twenty metres of trail.
    // They are what speed is read against, and what says where the trail goes next.
    // By night and in fog they are the breadcrumbs: each wears a reflective band, dark until the lamp finds it.
    const poleGeo = new THREE.CylinderGeometry(0.095, 0.095, 2.5, 6);
    poleGeo.translate(0, 1.25, 0);
    this.poles = new THREE.InstancedMesh(poleGeo, lampMode(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), { retro: 2, facing: 0 }), POLES * 2);
    const capGeo = new THREE.SphereGeometry(0.26, 8, 6);
    capGeo.translate(0, 2.58, 0);
    this.poleCaps = new THREE.InstancedMesh(capGeo, lampMode(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), { retro: 3.5, facing: 0 }), POLES * 2);
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
    this.shadowLie = (shadowGeo.attributes.position.array as Float32Array).slice();
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        color: "#35527c",
        map: new THREE.CanvasTexture(shade),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.chunks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#8aa3c6", emissiveIntensity: 0.5, flatShading: true }),
      CHUNKS,
    );
    for (let i = 0; i < CHUNKS; i++)
      this.chunkSeed.set([(i % 2 ? 1 : -1) * (10.5 + Math.random() * 8), Math.random() * 85, 0.4 + Math.random() * 0.8, 8 + Math.random() * 14], i * 4);
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
  /** A spray of sparks of one colour from a point, carried `forward` metres a second along a heading. */
  burst(x: number, y: number, z: number, color: string, count = 12, speed = 5, forward = 0, heading = 0) {
    const fx = Math.sin(heading) * forward,
      fz = Math.cos(heading) * forward;
    tint.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.sparkCursor;
      this.sparkCursor = (i + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2,
        up = 0.3 + Math.random() * 0.9,
        v = speed * (0.5 + Math.random() * 0.7);
      this.sparkPos.set([x, y, z], i * 3);
      this.sparkVel.set([Math.cos(a) * v * 0.8 + fx, up * v, Math.sin(a) * v * 0.8 + fz], i * 3);
      this.sparkCol.set([tint.r, tint.g, tint.b], i * 3);
      this.sparkLife[i] = 0.4 + Math.random() * 0.35;
    }
  }
  /** A ring that spreads across the snow from a point and fades. */
  ring(x: number, y: number, z: number, color: string, size = 1) {
    const r = this.rings.reduce((a, b) => (a.age > b.age ? a : b));
    r.age = 0;
    r.mesh.position.set(x, y + 0.08, z);
    r.mesh.rotation.x = this.tilt;
    r.mesh.userData.size = size;
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.mesh.visible = true;
  }
  update(s: Run, dt: number, time: number, camera: THREE.Camera, yaw: number, weather: Weather, running: boolean, snowTint: THREE.Color) {
    const playing = running && !s.finished;
    const course = s.course,
      trail = course.trail;
    this.tilt = snowTilt(trail, s.z);
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
    // Snowfall lives in a box that travels ahead of the camera, whichever way it faces, so it never runs out.
    const fall = SNOWFALL[weather];
    this.amount += (fall.amount - this.amount) * Math.min(1, dt * 1.5);
    const sinY = Math.sin(yaw),
      cosY = Math.cos(yaw);
    const cx = camera.position.x,
      cy = camera.position.y,
      cz = camera.position.z;
    const boxX = cx + sinY * FLAKE_BOX * 0.42,
      boxZ = cz + cosY * FLAKE_BOX * 0.42,
      // The box rides the mountain down with the view: its middle is a little below the camera.
      boxY = cy - 2;
    for (let i = 0; i < FLAKES; i++) {
      const b = i * 3;
      this.flakePos[b] = wrap(this.flakePos[b] + (fall.wind + Math.sin(time * 1.3 + i) * 0.8) * dt, boxX, FLAKE_BOX);
      this.flakePos[b + 1] = wrap(this.flakePos[b + 1] - (fall.fall + (i % 5) * 0.3) * dt, boxY, 34);
      this.flakePos[b + 2] = wrap(this.flakePos[b + 2], boxZ, FLAKE_BOX);
    }
    this.flakeGeo.attributes.position.needsUpdate = true;
    this.flakeGeo.setDrawRange(0, Math.round(FLAKES * this.amount));
    (this.flakes.material as THREE.PointsMaterial).size = weather === "blizzard" ? 0.3 : 0.22;
    // Streaks of speed: lines that rush past the camera the way it faces, brighter the faster the run.
    // Not by night: a line of light hanging in the dark is lit by nothing.
    const rush = playing && s.crashTime === 0 && !course.night ? Math.max(0, (s.speed - 34) / 26) + (s.boost > 0 ? 0.55 : 0) : 0;
    const streakMat = this.streaks.material as THREE.LineBasicMaterial;
    streakMat.opacity += (Math.min(0.5, rush * 0.42) - streakMat.opacity) * Math.min(1, dt * 6);
    this.streaks.visible = streakMat.opacity > 0.01;
    if (this.streaks.visible)
      for (let i = 0; i < STREAKS; i++) {
        const b = i * 3;
        this.streakSeed[b + 2] = (((this.streakSeed[b + 2] - s.speed * 1.4 * dt) % 70) + 70) % 70;
        const across = this.streakSeed[b],
          along = this.streakSeed[b + 2] - 4,
          x = cx + across * cosY + along * sinY,
          z = cz - across * sinY + along * cosY,
          len = 1.5 + s.speed * 0.09,
          x1 = x + sinY * len,
          z1 = z + cosY * len;
        this.streakPos.set([x, faceHeight(trail, z) + this.streakSeed[b + 1], z, x1, faceHeight(trail, z1) + this.streakSeed[b + 1], z1], i * 6);
      }
    this.streakGeo.attributes.position.needsUpdate = true;
    // Poles keep pace with the skier down both edges of the groomed snow, twenty metres of trail apart.
    // Where sight is short they stand twice as close, so there are always a few in view to show where the trail bends.
    const step = course.night || weather === "fog" || weather === "blizzard" ? POLE_STEP / 2 : POLE_STEP;
    const first = Math.floor((s.s - 40) / step);
    for (let i = 0; i < POLES; i++) {
      const at = (first + i) * step,
        half = trailHalf(trail, at);
      for (const side of [0, 1]) {
        const p = trailAt(trail, at, side ? half : -half);
        dummy.position.set(p.x, surfaceHeight(course, p.x, p.z) - 0.1, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Number.isFinite(course.finishS) && at > course.finishS + 40 ? 0 : 1);
        dummy.updateMatrix();
        this.poles.setMatrixAt(i * 2 + side, dummy.matrix);
        this.poleCaps.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.poles.instanceMatrix.needsUpdate = this.poleCaps.instanceMatrix.needsUpdate = true;
    this.poles.visible = this.poleCaps.visible = running;
    // Power-ups about the skier.
    const ground = surfaceHeight(course, s.x, s.z);
    const feet = ground + s.y;
    const sinH = Math.sin(s.heading),
      cosH = Math.cos(s.heading);
    this.bubble.visible = playing && s.shield;
    this.bubble.position.set(s.x, feet + 1.1, s.z);
    this.bubble.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
    const fade = (left: number) => (left < 2 ? 0.35 + 0.65 * Math.abs(Math.sin(left * 9)) : 1);
    this.aura.visible = playing && s.magnet > 0;
    this.aura.position.set(s.x, ground + 0.1, s.z);
    this.aura.rotation.x = this.tilt;
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
        if (s.boost > 0 && s.crashTime === 0)
          this.burst(s.x - sinH * 1.1, feet + 0.25, s.z - cosH * 1.1, s.boost > 1 ? "#ffd23c" : "#ff8a2a", 2, 1.6, -5, s.heading);
        if (s.double > 0 && Math.random() < 0.4) this.burst(s.x - sinH * 0.5, feet + 1.4, s.z - cosH * 0.5, POWER_COLORS.double, 1, 1.5, -3, s.heading);
      }
    }
    // The avalanche comes down the trail: everything of it is laid out along the trail and across it.
    const slide = !Number.isNaN(s.avalancheS) && running;
    this.billows.visible = this.wall.visible = this.shadow.visible = this.chunks.visible = slide;
    if (slide) {
      const front = s.avalancheS,
        reach = trailHalf(trail, front) + SHOULDER;
      (this.wall.material as THREE.MeshBasicMaterial).color.set("#eef4fb").multiply(snowTint);
      const back = trailAt(trail, front - 9, 0);
      this.wall.position.set(back.x, surfaceHeight(course, back.x, back.z) + 16, back.z);
      this.wall.rotation.y = back.dir;
      this.wall.scale.x = (reach + 14) / 70;
      for (let i = 0; i < BILLOWS; i++) {
        const b = i * 4,
          row = this.billowSeed[b + 1],
          phase = this.billowSeed[b + 2],
          size = this.billowSeed[b + 3];
        const p = trailAt(trail, front - row * 9 + Math.sin(time * 2.4 + phase) * 1.2, (this.billowSeed[b] / 32) * reach),
          roll = Math.sin(time * 3.1 + phase * 2);
        dummy.position.set(p.x, surfaceHeight(course, p.x, p.z) + size * 0.5 + row * 7 + roll * 0.7, p.z);
        dummy.scale.setScalar(size * (1 + roll * 0.14));
        dummy.rotation.set(time * 1.3 + phase, phase, 0);
        dummy.updateMatrix();
        this.billows.setMatrixAt(i, dummy.matrix);
      }
      this.billows.instanceMatrix.needsUpdate = true;
      // Snow thrown ahead of the front, and a rumble through the camera as it closes.
      if (playing && dt > 0 && Math.random() < 0.7) {
        const p = trailAt(trail, front + 1, (Math.random() * 2 - 1) * reach);
        this.burst(p.x, surfaceHeight(course, p.x, p.z) + 1.5, p.z, "#ffffff", 2, 5, 9, p.dir);
      }
      const gap = s.s - front;
      const near = Math.max(0, 1 - gap / 70);
      const presence = Math.max(0, Math.min(1, 1 - (gap - 20) / 90));
      // The shadow lies on the snow down the trail ahead of the front, banks and all: its vertices are laid on the surface each frame.
      const lay = this.shadow.geometry.attributes.position,
        lie = this.shadowLie;
      for (let i = 0; i < lay.count; i++) {
        const sv = front - 4 + lie[i * 3 + 2],
          p = trailAt(trail, sv, (lie[i * 3] / 22) * (trailHalf(trail, sv) + SHOULDER));
        lay.setXYZ(i, p.x, surfaceHeight(course, p.x, p.z) + 0.07, p.z);
      }
      lay.needsUpdate = true;
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * near;
      // Boulders of snow bound out of the front and on down the trail, each in its own lane clear of the skier's.
      for (let i = 0; i < CHUNKS; i++) {
        const b = i * 4,
          size = this.chunkSeed[b + 2],
          ahead = (this.chunkSeed[b + 1] + time * this.chunkSeed[b + 3]) % 85,
          // They come from behind the camera and bound on down the slope, however far back the front is.
          sv = s.s - 24 + ahead,
          u = (this.chunkSeed[b] / 20) * (trailHalf(trail, sv) - 1.5),
          p = trailAt(trail, sv, u),
          hop = Math.abs(Math.sin(time * 4.2 + i * 1.7)) * (1.2 + size);
        dummy.position.set(p.x, surfaceHeight(course, p.x, p.z) + size * 0.7 + hop, p.z);
        // One about to bound through the skier is dropped: they are scenery, and must never look like a hit.
        const through = Math.abs(u - s.u) < 2.6 && Math.abs(sv - s.s) < 9;
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
            const p = trailAt(trail, s.s - 9 + Math.random() * 6, s.u + side * (2.5 + Math.random() * 13));
            this.burst(p.x, surfaceHeight(course, p.x, p.z) + 0.4 + Math.random() * 3, p.z, "#ffffff", 2, 3, s.speed + 10 + Math.random() * 16, p.dir);
          }
    }
    this.shake *= Math.exp(-7 * dt);
  }
}
