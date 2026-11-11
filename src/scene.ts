import * as THREE from "three";
import {
  BULLSEYE_RADIUS,
  TERRAIN_PERIOD,
  bankHeight,
  crossSlope,
  rivalLine,
  snowHeight,
  surfaceHeight,
  type Course,
  type Gate,
  type Run,
} from "./physics";
import { BANK_RATE } from "./levels";
import { Wolf } from "./character";
import { Environment } from "./environment";
import { SnowEffects } from "./effects";
import { Pickups } from "./pickups";
import { THEMES, type Theme } from "./themes";
import { Hazards } from "./hazards";
import { PISTE_HALF_WIDTH, Piste } from "./piste";
import { Props } from "./props";
import { Juice } from "./juice";
import { rampHeight } from "./extras";
import type { Weather } from "./levels";

/** How far the fog stands off in each weather, and how much of the sky it greys. */
const FOG: Record<Weather, { near: number; far: number; grey: number }> = {
  clear: { near: 150, far: 340, grey: 0 },
  snow: { near: 95, far: 270, grey: 0.25 },
  fog: { near: 26, far: 135, grey: 0.6 },
  blizzard: { near: 18, far: 105, grey: 0.75 },
};
const WHITE = new THREE.Color("#e9eff5");

const SNOW = new THREE.Color("#eff6fe");
/** The modes in which the camera follows a run; in every other it frames the wolf at the start. */
const RUN_MODES = ["playing", "paused", "celebrating", "finished"];
/** How much more than the true bank angle the skier leans, so a bank reads at a glance. */
const BANK_LEAN = 1.6;

export const mat = (color: THREE.ColorRepresentation) =>
  new THREE.MeshLambertMaterial({ color });
export function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
export class SkiScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.2, 1300);
  character = new Wolf();
  /** The light to draw the next frame in; set it before update. */
  theme: Theme = THEMES[0];
  skier = this.character.root;
  environment: Environment;
  effects: SnowEffects;
  pickups: Pickups;
  props: Props;
  juice: Juice;
  /** Rusty the fox, who races the wolf on some levels. */
  rival = new Wolf({ fur: "#d9622b", light: "#f08a4b", cream: "#fff6ea" });
  /** The weather to draw the next frame in. */
  weather: Weather = "clear";
  private sky = new THREE.Color();
  private fogNear = 150;
  private fogFar = 340;
  private fogGrey = 0;
  private fovKick = 0;
  private rivalHeading = 0;
  private scratch = new THREE.Vector3();
  private hemi = new THREE.HemisphereLight("#f5fbff", "#98afca", 1.8);
  private sun = new THREE.DirectionalLight("#fff8df", 2.5);
  private snowMaterial = new THREE.MeshBasicMaterial({ color: SNOW, toneMapped: false });
  hazards: Hazards;
  piste: Piste;
  shadow: THREE.Mesh;
  gateGroups: THREE.Group[] = [];
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  /** The snow height the camera rides, smoothed so a knoll lifts the view without a jolt. */
  private groundY = NaN;
  private baseFov = 55;
  private scratchColor = new THREE.Color();
  private activeCourse: Course | null = null;
  private builtGates = 0;
  private groundTiles: THREE.Group[] = [];
  private flagTextures: THREE.CanvasTexture[];
  /** Textures for the bullseye marker: a glowing coral disc and a white snowflake stamp. */
  private glowTextures: { pool: THREE.CanvasTexture; flake: THREE.CanvasTexture };
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor("#b8dded");
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.fog = new THREE.Fog("#b8dded", 140, 330);
    this.sun.position.set(-50, 90, -25);
    this.scene.add(this.hemi, this.sun);
    // Two ground tiles, each one terrain period long, leapfrog down the slope
    // so the snow never ends however far a run goes. Each is the flat snow
    // either side of the piste; the piste itself is a finer strip that can
    // bank with the course.
    const snowMaterial = this.snowMaterial;
    const sides = [-1, 1].map((side) => {
      const half = new THREE.PlaneGeometry(500 - PISTE_HALF_WIDTH, TERRAIN_PERIOD, 10, 216);
      half.rotateX(-Math.PI / 2);
      half.translate(side * (PISTE_HALF_WIDTH + (500 - PISTE_HALF_WIDTH) / 2), 0, TERRAIN_PERIOD / 2);
      const pos = half.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, snowHeight(pos.getZ(i)) - 0.035);
      return half;
    });
    for (let i = 0; i < 2; i++) {
      const ground = new THREE.Group();
      for (const half of sides) ground.add(mesh(half, snowMaterial));
      this.scene.add(ground);
      this.groundTiles.push(ground);
    }
    this.flagTextures = ["#e83e48", "#167bc6"].map((color) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.translate(64, 64);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -31);
        ctx.moveTo(0, -21);
        ctx.lineTo(-9, -29);
        ctx.moveTo(0, -21);
        ctx.lineTo(9, -29);
        ctx.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    const glow = (size: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      paint(c.getContext("2d")!);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    this.glowTextures = {
      // A crisp coral disc, just soft enough at the rim not to shimmer.
      pool: glow(128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255, 106, 72, 1)");
        g.addColorStop(0.9, "rgba(255, 106, 72, 1)");
        g.addColorStop(1, "rgba(255, 106, 72, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }),
      // The same snowflake the flags wear, white on nothing, to stamp the disc.
      flake: glow(128, (ctx) => {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.translate(64, 64);
        for (let i = 0; i < 6; i++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -38);
          ctx.moveTo(0, -26);
          ctx.lineTo(-11, -36);
          ctx.moveTo(0, -26);
          ctx.lineTo(11, -36);
          ctx.stroke();
        }
      }),
    };
    this.scene.add(this.skier);
    this.shadow = mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({
        color: "#6586b3",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2 + 0.1;
    this.shadow.scale.set(1.1, 1.7, 1);
    this.scene.add(this.shadow);
    this.environment = new Environment(this.scene);
    this.effects = new SnowEffects(this.scene);
    this.pickups = new Pickups(this.scene);
    this.props = new Props(this.scene);
    this.juice = new Juice(this.scene);
    this.rival.setColors("#2f7d5b", "#f2b63a", "#f2b63a", "#f5c518", "#223b4b");
    this.rival.root.visible = false;
    this.scene.add(this.rival.root);
    this.hazards = new Hazards(this.scene);
    this.piste = new Piste(this.scene);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  /** Rebuilds the flags for a course; each level has its own layout. */
  private dropGate(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
  }
  private clearGates() {
    for (const group of this.gateGroups) this.dropGate(group);
    this.gateGroups = [];
    this.builtGates = 0;
  }
  /** Builds flags as they come within reach and drops those left behind, so any course length works. */
  private syncGates(course: Course, z: number) {
    while (this.gateGroups.length && this.gateGroups[0].position.z < z - 60)
      this.dropGate(this.gateGroups.shift()!);
    while (
      this.builtGates < course.gates.length &&
      course.gates[this.builtGates].z < z + 420
    ) {
      const i = this.builtGates++;
      this.buildGate(i, course.gates[i], course);
    }
  }
  private buildGate(i: number, gate: Gate, course: Course) {
    const flagTextures = this.flagTextures;
    {
      const group = new THREE.Group();
      group.position.set(gate.x, snowHeight(gate.z), gate.z);
      // Flags glow a little of their own colour, so they still read at dusk and at night.
      const hue = gate.color === "red" ? "#eb474a" : "#208bd5";
      const color = new THREE.MeshLambertMaterial({ color: hue, emissive: hue, emissiveIntensity: 0.35 });
      for (const side of [-1, 1]) {
        group.add(
          mesh(
            new THREE.CylinderGeometry(0.085, 0.11, 3.2, 6),
            color,
            (side * gate.width) / 2,
            1.6,
          ),
        );
        const flag = mesh(
          new THREE.PlaneGeometry(1.45, 1.2, 5, 1),
          new THREE.MeshLambertMaterial({
            map: flagTextures[i % 2],
            emissive: "#ffffff",
            emissiveMap: flagTextures[i % 2],
            emissiveIntensity: 0.35,
            side: THREE.DoubleSide,
          }),
          side * (gate.width / 2 - 0.76),
          2.5,
        );
        flag.userData.flag = true;
        group.add(flag);
      }
      const line = mesh(
        new THREE.PlaneGeometry(gate.width, 0.34),
        new THREE.MeshBasicMaterial({
          color: color.color,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        }),
        0,
        0.025,
      );
      line.rotation.x = -Math.PI / 2;
      group.add(line);
      // The bullseye zone is a hot spot on the snow: a glowing coral disc
      // stamped with a snowflake and two thin white arcs circling it, the way
      // games mark a sweet spot. Skiing through it collects it.
      const bullseye = new THREE.Group();
      bullseye.position.y = bankHeight(course, gate.x, gate.z);
      bullseye.userData.bullseye = true;
      const flat = (size: number, material: THREE.Material, y: number) => {
        const m = mesh(new THREE.PlaneGeometry(size, size), material, 0, y);
        m.rotation.x = -Math.PI / 2;
        return m;
      };
      const overlay = (map: THREE.Texture, opacity: number) =>
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity,
          depthWrite: false,
          toneMapped: false,
        });
      const pool = flat(BULLSEYE_RADIUS * 2.1, overlay(this.glowTextures.pool, 0.9), 0.04);
      pool.userData.pool = true;
      bullseye.add(pool);
      bullseye.add(flat(BULLSEYE_RADIUS * 1.3, overlay(this.glowTextures.flake, 0.95), 0.05));
      const arcs = new THREE.Group();
      arcs.position.y = 0.045;
      arcs.userData.arcs = true;
      const arcMaterial = new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      });
      for (const start of [0.35, Math.PI + 0.35]) {
        const arc = mesh(
          new THREE.RingGeometry(BULLSEYE_RADIUS * 1.12, BULLSEYE_RADIUS * 1.2, 32, 1, start, 2.2),
          arcMaterial,
        );
        arc.rotation.x = -Math.PI / 2;
        arcs.add(arc);
      }
      bullseye.add(arcs);
      bullseye.traverse((part) => {
        if (part instanceof THREE.Mesh)
          part.userData.baseOpacity = (part.material as THREE.MeshBasicMaterial).opacity;
      });
      group.add(bullseye);
      group.userData.index = i;
      this.scene.add(group);
      this.gateGroups.push(group);
    }
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.baseFov = this.camera.aspect < 0.8 ? 59 : 49;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  reset() {
    this.effects.reset();
    this.pickups.reset();
    this.props.reset();
    this.juice.reset();
    // Flags left behind were dropped; a fresh run rebuilds them from the start.
    this.activeCourse = null;
  }
  private applyTheme() {
    const theme = this.theme;
    // Weather greys the sky and draws the fog in.
    this.sky.copy(theme.sky).lerp(this.scratchColor.copy(WHITE).multiply(theme.snow), this.fogGrey);
    this.renderer.setClearColor(this.sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky);
    fog.near = this.fogNear;
    fog.far = this.fogFar;
    this.hemi.color.copy(theme.hemiSky);
    this.hemi.groundColor.copy(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity;
    this.sun.color.copy(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    this.snowMaterial.color.copy(SNOW).multiply(theme.snow);
    this.piste.material.color.copy(theme.snow);
    this.environment.applyTheme(theme);
  }
  /** Where a point of the slope falls on the screen, in CSS pixels. */
  project(x: number, y: number, z: number) {
    const v = this.scratch.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ahead: v.z < 1 };
  }
  update(s: Run, dt: number, mode: string, elapsed: number) {
    const running = RUN_MODES.includes(mode);
    let weather = FOG[running ? this.weather : "clear"];
    // An avalanche closing in takes the light with it: the sky greys and the far slope goes.
    if (running && !Number.isNaN(s.avalancheZ)) {
      const near = Math.max(0, Math.min(1, 1 - (s.z - s.avalancheZ - 12) / 50));
      weather = {
        near: weather.near + (30 - weather.near) * near,
        far: weather.far + (150 - weather.far) * near,
        grey: Math.max(weather.grey, near * 0.7),
      };
    }
    const ease = dt === 0 ? 1 : 1 - Math.exp(-3 * dt);
    this.fogNear += (weather.near - this.fogNear) * ease;
    this.fogFar += (weather.far - this.fogFar) * ease;
    this.fogGrey += (weather.grey - this.fogGrey) * ease;
    this.applyTheme();
    if (this.activeCourse !== s.course) {
      this.activeCourse = s.course;
      this.clearGates();
      this.environment.setFinish(s.course.finishZ);
    }
    this.syncGates(s.course, s.z);
    const base = Math.floor((s.z - 300) / TERRAIN_PERIOD);
    this.groundTiles.forEach((ground, i) => {
      const k = base + i;
      ground.position.set(0, -0.1 * k * TERRAIN_PERIOD, k * TERRAIN_PERIOD);
    });
    // The camera rides the snow under the skier, smoothed, so a roller's crest
    // lifts the view and hides what lies beyond it without a jolt.
    // Off the lip of a ramp the skier is in the air; on it, he rides the wedge up.
    const lift = s.airborne ? s.y : rampHeight(s.course.zones, s.x, s.z);
    const surface = surfaceHeight(s.course, s.x, s.z) + lift;
    if (dt === 0 || Number.isNaN(this.groundY)) this.groundY = surface;
    else this.groundY += (surface - lift * 0.65 - this.groundY) * (1 - Math.exp(-4 * dt));
    const y = this.groundY;
    this.skier.position.set(s.x, surface + 0.03, s.z);
    this.skier.rotation.y = s.heading;
    // On shaped snow the skier leans downhill with the local slope, exaggerated
    // a little, and pitches up a rise and over a crest.
    const lean = -Math.atan(crossSlope(s.course, s.x, s.z) * BANK_RATE) * BANK_LEAN;
    const pitch = Math.atan(bankHeight(s.course, s.x, s.z + 0.5) - bankHeight(s.course, s.x, s.z - 0.5));
    this.skier.rotation.z =
      s.crashTime > 0 ? Math.sin(s.crashTime * 7) * 1.7 : lean;
    this.skier.rotation.x =
      s.crashTime > 0 ? Math.sin(s.crashTime * 8) * 1.6 : s.airborne ? -0.12 - s.vy * 0.035 : 0.1 - pitch;
    // The skier blinks while the grace after a knock lasts.
    this.skier.visible = !(running && s.invincible > 0 && s.crashTime === 0 && Math.sin(elapsed * 38) > 0.35);
    const portrait = this.camera.aspect < 0.8;
    if (!running) {
      const menuPortrait = this.camera.aspect <= 1.25;
      // In the gear shop the wolf stands in the upper half, above the sheet of gear.
      const gear = mode === "gear" && menuPortrait;
      // Keep the skier at roughly three quarters of the screen in wide menus.
      const wideLookX =
        6 +
        14 *
          Math.tan(
            Math.atan2(-6, 10.8) +
              Math.atan(
                0.5 *
                  Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
                  this.camera.aspect,
              ),
          );
      this.desired.set(
        menuPortrait ? 7 : 6,
        y + (menuPortrait ? 5.5 : 4),
        s.z + (menuPortrait ? -12 : -9),
      );
      this.look.set(
        menuPortrait ? -1 : wideLookX,
        y + (gear ? -4.8 : menuPortrait ? 2.4 : 1.8),
        s.z + (menuPortrait ? 4 : 5),
      );
      this.skier.rotation.y = 2.7;
      this.skier.scale.setScalar(menuPortrait ? 1.25 : 1.3);
      this.skier.position.z += 1.8;
      this.skier.position.y = snowHeight(s.z + 1.8) + 0.03;
    } else {
      this.skier.scale.setScalar(1);
      // Lower and closer than a broadcast camera, looking well down the
      // course: the skier sits in the lower third and the flags ahead are large.
      this.desired.set(
        s.x * 0.62,
        y + (portrait ? 8 : 6.6),
        s.z - (portrait ? 14.5 : 13.5),
      );
      this.look.set(
        s.x * 0.66,
        y + (portrait ? -1.2 : -0.4),
        s.z + (portrait ? 24 : 27),
      );
    }
    if (dt === 0) this.camera.position.copy(this.desired);
    else {
      // The camera keeps up down the slope exactly and trails a little across it.
      const k = 1 - Math.exp(-6 * dt);
      this.camera.position.x += (this.desired.x - this.camera.position.x) * k;
      this.camera.position.y += (this.desired.y - this.camera.position.y) * k;
      this.camera.position.z = running
        ? this.desired.z
        : this.camera.position.z + (this.desired.z - this.camera.position.z) * k;
    }
    this.camera.lookAt(this.look);
    if (running) {
      // A little roll into the turn, a kick of field of view on a boost, and whatever shake is owed.
      this.camera.rotation.z += -s.heading * 0.045;
      const shake = this.juice.shake;
      if (shake > 0.002 && mode !== "paused") {
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
      }
    }
    const kick = running && s.boost > 0 && s.crashTime === 0 ? 5 : 0;
    this.fovKick += (kick - this.fovKick) * (dt === 0 ? 1 : 1 - Math.exp(-5 * dt));
    if (Math.abs(this.camera.fov - this.baseFov - this.fovKick) > 0.01) {
      this.camera.fov = this.baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    }
    for (const gate of this.gateGroups) {
      gate.visible = gate.position.z > s.z - 12 && gate.position.z < s.z + 290;
      if (gate.visible)
        for (const child of gate.children) {
          if (child.userData.bullseye) {
            // The hot spot lives: the disc breathes and the arcs circle it. Once
            // taken, it bursts outward and fades, like a pickup being collected.
            const collected = s.bullseyeGates.includes(gate.userData.index);
            if (collected && child.userData.collectedAt === undefined)
              child.userData.collectedAt = elapsed;
            if (!collected) child.userData.collectedAt = undefined;
            const t = collected ? Math.min(1, (elapsed - child.userData.collectedAt) / 0.45) : 0;
            child.visible = t < 1;
            if (!child.visible) continue;
            const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4 + gate.position.z);
            child.scale.setScalar(1 + 0.8 * t);
            child.traverse((part) => {
              if (part instanceof THREE.Mesh)
                (part.material as THREE.MeshBasicMaterial).opacity =
                  part.userData.baseOpacity * (1 - t) * (1 - t);
            });
            for (const part of child.children) {
              if (part.userData.pool) part.scale.setScalar(0.96 + 0.06 * pulse);
              else if (part.userData.arcs) part.rotation.y = elapsed * 0.9;
            }
          }
          if (child.userData.flag) {
            const p = (child as THREE.Mesh).geometry.attributes.position;
            for (let j = 0; j < p.count; j++)
              p.setZ(
                j,
                Math.sin(p.getX(j) * 4 + elapsed * 4 + gate.position.z) * 0.055,
              );
            p.needsUpdate = true;
          }
        }
    }
    this.shadow.position.set(
      s.x + 0.35,
      this.skier.position.y - (s.airborne ? s.y : 0) + 0.025,
      this.skier.position.z + 0.4,
    );
    const shrink = s.airborne ? 1 / (1 + s.y * 0.3) : 1;
    this.shadow.scale.set(1.1 * shrink, 1.7 * shrink, 1);
    // The fox.
    const fox = this.rival.root;
    fox.visible = running && s.rival !== null;
    if (s.rival) {
      const r = s.rival;
      const ahead = rivalLine(s.course, r.z + 1.5) - rivalLine(s.course, r.z - 1.5);
      this.rivalHeading += (Math.atan2(ahead, 3) - this.rivalHeading) * (dt === 0 ? 1 : 1 - Math.exp(-8 * dt));
      fox.position.set(r.x, surfaceHeight(s.course, r.x, r.z) + 0.03, r.z);
      fox.rotation.set(0.1, this.rivalHeading, 0);
      this.rival.animate(
        { crashTime: 0, heading: this.rivalHeading, boost: 0, airborne: false },
        elapsed + 1.7,
        r.done ? "finished" : "playing",
      );
    }
    this.character.animate(s, elapsed, mode);
    this.hazards.update(s);
    this.piste.update(s);
    this.environment.update(s.z);
    this.pickups.update(s, elapsed, running);
    this.props.update(s, elapsed, running);
    this.juice.update(s, mode === "paused" ? 0 : dt, elapsed, this.camera, running ? this.weather : "clear", running, this.theme.snow);
    this.effects.update(s, mode === "paused" ? 0 : dt, mode === "playing");
    this.renderer.render(this.scene, this.camera);
  }
}
