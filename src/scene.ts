import * as THREE from "three";
import { BULLSEYE_RADIUS, crossSlope, gateU, rivalLine, surfaceHeight, type Course, type Gate, type Run } from "./physics";
import { BANK_RATE } from "./levels";
import { Wolf } from "./character";
import { Environment } from "./environment";
import { SnowEffects } from "./effects";
import { Pickups } from "./pickups";
import { BIOMES, THEMES, type Theme } from "./themes";
import { Hazards } from "./hazards";
import { Terrain, groundHeight, layOnSnow, ribbon, snowTilt, worldAt } from "./terrain";
import { Props } from "./props";
import { Juice } from "./juice";
import { CHASM_REACH, RAMP_LIP, rampHeight, zoneAt } from "./extras";
import { faceHeight, trailAt, trailDir } from "./trail";
import type { Weather } from "./levels";
import { LAMP, lamp, lampMode } from "./lamp";
import { LAMP_REACH, VISIBILITY } from "./pilot";

function glowDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** What each weather does to the sky: how much it greys it, and how much of the far country it swallows. How far anyone can see in it is the pilot's number, `VISIBILITY`, and the fog is drawn to that. */
const AIR: Record<Weather, { grey: number; haze: number }> = {
  clear: { grey: 0, haze: 0 },
  snow: { grey: 0.3, haze: 0.9 },
  fog: { grey: 0.6, haze: 1 },
  blizzard: { grey: 0.75, haze: 1 },
};
const WHITE = new THREE.Color("#e9eff5");
/** The dark of a night run: what unlit distance fades to. */
const NIGHT_AIR = new THREE.Color("#000000");
/** Under the lamp the snow is white, whatever the moon made of it. */
const LAMP_SNOW = new THREE.Color("#f3f6ff");
const NEUTRAL = new THREE.Color("#ffffff"),
  NEUTRAL_GROUND = new THREE.Color("#9aa3b5");
const LANTERN = new THREE.Color("#ffb45a");

const SNOW = new THREE.Color("#eff6fe");
/** The modes in which the camera follows a run; in every other it frames the wolf at the start. */
const RUN_MODES = ["playing", "paused", "celebrating", "finished"];
/** How much more than the true bank angle the skier leans, so a bank reads at a glance. */
const BANK_LEAN = 1.6;
/** The chase camera: this far behind the skier along the line of travel and this far above the snow it stands over, looking at a point this far ahead and this far above the snow there. */
const CAMERA = {
  portrait: { back: 14.5, up: 8, ahead: 24, over: -1.2 },
  landscape: { back: 13.5, up: 6.6, ahead: 27, over: -0.4 },
};
/** Into a bend the camera draws back and up by as much as this, so the trail round the corner comes into the frame. */
const TURN_BACK = 8,
  TURN_UP = 4,
  /** And, held upright, it widens its view by this many degrees. */
  TURN_FOV = 5;
/** The camera leans its gaze toward where the trail goes next: this share of the angle, and never more than this (radians). The rest is the line of travel, which is what the thumb steers against. */
const LOOK_BIAS = 0.32,
  LOOK_BIAS_MAX = 0.3;
/** Beyond that it turns its head, without moving: the skier slides a little to the outside of the bend and the inside opens up. */
const LOOK_PAN = 0.34,
  LOOK_PAN_MAX = 0.15;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

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
/** A gate as drawn: two poles and their flags, which stand upright, and what lies on the snow between them. */
interface GateView {
  index: number;
  s: number;
  /** Where across the trail this opening stands (a fork has two); a moving gate slides about it. */
  u: number;
  moving: boolean;
  uprights: THREE.Group;
  flat: THREE.Group;
  /** What stays put: the line on the snow of a gate that stands still, the rail of one that moves. */
  fixed: THREE.Object3D | null;
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
  /** The way the camera faces, as an angle off the fall line: the line of travel, lightly smoothed. */
  yaw = 0;
  private sky = new THREE.Color();
  private sight: number = VISIBILITY.clear;
  private haze = 0;
  private fogGrey = 0;
  private lantern = new THREE.Sprite(
    lampMode(new THREE.SpriteMaterial({ map: glowDot(), color: "#ffd77a", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), { source: true }),
  );
  /** Where the headlamp points: the way the skis do, a moment behind them. */
  private lampHeading = 0;
  private lampPitch = 0;
  private lampHead = new THREE.Vector3();
  private lampDir = new THREE.Vector3();
  private sightFrom = new THREE.Vector3();
  private turn = 0;
  private pan = 0;
  private fovKick = 0;
  private dark = 0;
  private rivalHeading = 0;
  private scratch = new THREE.Vector3();
  private hemi = new THREE.HemisphereLight("#f5fbff", "#98afca", 1.8);
  private sun = new THREE.DirectionalLight("#fff8df", 2.5);
  hazards: Hazards;
  terrain: Terrain;
  shadow: THREE.Mesh;
  gates: GateView[] = [];
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  /** How far the snow under the skier stands above the plain face of the mountain, smoothed, so a knoll lifts the view without a jolt. */
  private rise = NaN;
  private sink = 0;
  private wasRunning = false;
  private wasFinished = false;
  private settle = 0;
  private baseFov = 55;
  private scratchColor = new THREE.Color();
  private activeCourse: Course | null = null;
  private builtGates = 0;
  private flagTextures: THREE.CanvasTexture[];
  private gateMaterials = new Map<string, THREE.Material>();
  private pose = { crashTime: 0, heading: 0, airborne: false, boost: 0, speed: 0, passed: false, finished: false };
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
    this.sun.position.set(-50, 90, -25);
    this.scene.add(this.hemi, this.sun);
    this.terrain = new Terrain(this.scene);
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
    // Turn first, then pitch and lean about the skier's own axes: he points every way across the mountain now.
    this.skier.rotation.order = "YXZ";
    this.rival.root.rotation.order = "YXZ";
    this.scene.add(this.skier);
    this.shadow = mesh(
      new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: "#6586b3",
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.scene.add(this.shadow);
    this.environment = new Environment(this.scene);
    this.effects = new SnowEffects(this.scene);
    this.pickups = new Pickups(this.scene);
    this.props = new Props(this.scene);
    this.juice = new Juice(this.scene);
    this.rival.setColors("#2f7d5b", "#f2b63a", "#f2b63a", "#f5c518", "#223b4b");
    this.rival.root.visible = false;
    this.lantern.scale.setScalar(2.6);
    this.lantern.position.set(0.6, 2.3, 0);
    this.rival.root.add(this.lantern);
    const bulb = mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMode(new THREE.MeshBasicMaterial({ color: "#ffe28a", toneMapped: false }), { source: true }), 0.6, 2.3, 0);
    this.lantern.userData.bulb = bulb;
    this.rival.root.add(bulb);
    this.scene.add(this.rival.root);
    this.hazards = new Hazards(this.scene);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  private dropGate(view: GateView) {
    for (const object of [view.uprights, view.flat, view.fixed]) {
      if (!object) continue;
      this.scene.remove(object);
      object.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        if (obj.userData.own) (obj.material as THREE.Material).dispose();
      });
    }
  }
  private clearGates() {
    for (const view of this.gates) this.dropGate(view);
    this.gates = [];
    this.builtGates = 0;
  }
  /** Builds flags as they come within reach and drops those left behind, so any course length works. */
  private syncGates(course: Course, s: number) {
    while (this.gates.length && this.gates[0].s < s - 60) this.dropGate(this.gates.shift()!);
    while (this.builtGates < course.gates.length && course.gates[this.builtGates].s < s + 430) {
      const i = this.builtGates++;
      this.buildGate(i, course.gates[i], course);
      // A fork is two openings; the second is a gate of its own to look at.
      if (course.gates[i].alt !== undefined) this.buildGate(i, course.gates[i], course, course.gates[i].alt);
    }
  }
  /** A material shared by every gate of its kind: there are only a handful of kinds. */
  private gateMaterial(key: string, make: () => THREE.Material) {
    let m = this.gateMaterials.get(key);
    if (!m) this.gateMaterials.set(key, (m = make()));
    return m;
  }
  /** Stands a gate's poles on the snow where its opening is now, and lays its marks on the snow between them. */
  private placeGate(view: GateView, gate: Gate, course: Course, u: number) {
    const at = trailAt(course.trail, gate.s, u),
      ground = surfaceHeight(course, at.x, at.z),
      cos = Math.cos(gate.rot),
      sin = Math.sin(gate.rot);
    view.uprights.position.set(at.x, ground, at.z);
    view.uprights.rotation.y = gate.rot;
    for (const child of view.uprights.children) {
      // Each pole stands on the snow under its own foot: across a traverse one is well below the other.
      const side = child.userData.side as number,
        reach = (side * gate.width) / 2;
      child.position.y = surfaceHeight(course, at.x + reach * cos, at.z - reach * sin) - ground + (child.userData.lift as number);
    }
    layOnSnow(view.flat, course, at.x, at.z, gate.rot);
  }
  private buildGate(i: number, gate: Gate, course: Course, u = gate.u) {
    const flagTextures = this.flagTextures;
    const moving = gate.drift !== undefined && u === gate.u;
    // Flags glow a little of their own colour, so they still read at dusk. Poles and cloth are retro-reflective: on a
    // night run they are as dark as anything else until the headlamp finds them, and then they flare.
    const hue = moving ? "#ffb300" : gate.color === "red" ? "#eb474a" : "#208bd5";
    const color = this.gateMaterial(
      `pole ${hue}`,
      () => lampMode(new THREE.MeshLambertMaterial({ color: hue, emissive: hue, emissiveIntensity: 0.35 }), { retro: 2.2, facing: 0 }),
    ) as THREE.MeshLambertMaterial;
    const cloth = this.gateMaterial(
      `flag ${i % 2}`,
      () =>
        lampMode(
          new THREE.MeshLambertMaterial({
            map: flagTextures[i % 2],
            emissive: "#ffffff",
            emissiveMap: flagTextures[i % 2],
            emissiveIntensity: 0.35,
            side: THREE.DoubleSide,
          }),
          { retro: 1.3, facing: 0 },
        ),
    );
    const uprights = new THREE.Group(),
      flat = new THREE.Group();
    for (const side of [-1, 1]) {
      const pole = mesh(new THREE.CylinderGeometry(0.085, 0.11, 3.6, 6), color, (side * gate.width) / 2, 0);
      pole.userData.side = side;
      pole.userData.lift = 1.4;
      uprights.add(pole);
      const flag = mesh(new THREE.PlaneGeometry(1.45, 1.2, 5, 1), cloth, side * (gate.width / 2 - 0.76), 0);
      flag.userData.flag = true;
      flag.userData.side = side;
      flag.userData.lift = 2.5;
      uprights.add(flag);
    }
    const lineMaterial = this.gateMaterial(
      `line ${hue}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: hue,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
    );
    let fixed: THREE.Object3D | null = null;
    if (moving) {
      const line = mesh(new THREE.PlaneGeometry(gate.width, 0.34), lineMaterial, 0, 0.03);
      line.rotation.x = -Math.PI / 2;
      flat.add(line);
    } else fixed = ribbon(course, gate.s - 0.17, gate.s + 0.17, () => u - gate.width / 2, () => u + gate.width / 2, lineMaterial, 0.035, 8);
    // The bullseye zone is a hot spot on the snow: a glowing coral disc
    // stamped with a snowflake and two thin white arcs circling it, the way
    // games mark a sweet spot. Skiing through it collects it.
    const bullseye = new THREE.Group();
    bullseye.userData.bullseye = true;
    const lie = (size: number, material: THREE.Material, y: number) => {
      const m = mesh(new THREE.PlaneGeometry(size, size), material, 0, y);
      m.rotation.x = -Math.PI / 2;
      m.userData.own = true;
      return m;
    };
    const overlay = (map: THREE.Texture, opacity: number) =>
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
    const pool = lie(BULLSEYE_RADIUS * 2.1, overlay(this.glowTextures.pool, 0.9), 0.04);
    pool.userData.pool = true;
    bullseye.add(pool);
    bullseye.add(lie(BULLSEYE_RADIUS * 1.3, overlay(this.glowTextures.flake, 0.95), 0.05));
    const arcs = new THREE.Group();
    arcs.position.y = 0.045;
    arcs.userData.arcs = true;
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    for (const start of [0.35, Math.PI + 0.35]) {
      const arc = mesh(new THREE.RingGeometry(BULLSEYE_RADIUS * 1.12, BULLSEYE_RADIUS * 1.2, 32, 1, start, 2.2), arcMaterial);
      arc.rotation.x = -Math.PI / 2;
      arcs.add(arc);
    }
    arcs.children[0].userData.own = true;
    bullseye.add(arcs);
    bullseye.traverse((part) => {
      if (part instanceof THREE.Mesh) part.userData.baseOpacity = (part.material as THREE.MeshBasicMaterial).opacity;
    });
    flat.add(bullseye);
    if (moving && gate.drift) {
      // The rail a moving gate rides: it shows how far the flags go either way. It lies across the trail and stays put.
      const reach = gate.drift.amp * 2 + gate.width;
      const rail = new THREE.Group();
      const steel = this.gateMaterial("rail", () => new THREE.MeshBasicMaterial({ color: "#12324a", toneMapped: false }));
      const stop = this.gateMaterial("stop", () => lampMode(new THREE.MeshBasicMaterial({ color: "#ffc531", toneMapped: false }), { retro: 1.5 }));
      rail.add(mesh(new THREE.BoxGeometry(reach, 0.22, 0.7), steel, 0, 0.14));
      for (const side of [-1, 1]) rail.add(mesh(new THREE.BoxGeometry(0.5, 1.5, 0.9), stop, (side * reach) / 2, 0.45));
      layOnSnow(rail, course, gate.x, gate.z, gate.rot);
      fixed = rail;
    }
    const view: GateView = { index: i, s: gate.s, u, moving, uprights, flat, fixed };
    this.placeGate(view, gate, course, u);
    this.scene.add(uprights, flat);
    if (fixed) this.scene.add(fixed);
    this.gates.push(view);
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
    const theme = this.theme,
      dark = this.dark;
    // Weather greys the sky; on a night run there is no light in the air at all.
    this.sky.copy(theme.sky).lerp(this.scratchColor.copy(WHITE).multiply(theme.snow), this.fogGrey);
    this.sky.lerp(NIGHT_AIR, dark);
    this.renderer.setClearColor(this.sky);
    // Under the lamp things are their own colours: the moonlight that tints the night's theme is gone.
    this.hemi.color.copy(theme.hemiSky).lerp(NEUTRAL, dark);
    this.hemi.groundColor.copy(theme.hemiGround).lerp(NEUTRAL_GROUND, dark);
    this.hemi.intensity = theme.hemiIntensity + (1.7 - theme.hemiIntensity) * dark;
    this.sun.color.copy(theme.sun).lerp(NEUTRAL, dark);
    this.sun.intensity = theme.sunIntensity + (1.6 - theme.sunIntensity) * dark;
    for (const material of this.terrain.materials) material.color.copy(theme.snow).lerp(LAMP_SNOW, dark);
    this.environment.applyTheme(theme, this.sky, Math.max(this.fogGrey, this.haze), dark);
  }
  /** Where a point of the slope falls on the screen, in CSS pixels. */
  project(x: number, y: number, z: number) {
    const v = this.scratch.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ahead: v.z < 1 };
  }
  update(s: Run, dt: number, mode: string, elapsed: number) {
    const running = RUN_MODES.includes(mode);
    const course = s.course,
      trail = course.trail;
    const air = AIR[running ? this.weather : "clear"];
    let sight: number = VISIBILITY[running ? this.weather : "clear"],
      grey = air.grey,
      haze = air.haze;
    // A night run: the dark comes down as the run starts, and after that only the headlamp lights anything.
    const night = running && course.night;
    this.dark = dt === 0 ? (night ? this.dark : 0) : Math.max(0, Math.min(1, this.dark + (night ? dt / 1.1 : -dt / 0.5)));
    this.environment.setBiome(BIOMES[worldAt(course, s.z)], dt === 0);
    // An avalanche closing in takes the light with it: the sky greys and the far slope goes.
    if (running && !s.finished && !Number.isNaN(s.avalancheS)) {
      const near = Math.max(0, Math.min(1, 1 - (s.s - s.avalancheS - 12) / 50));
      sight += (Math.min(sight, 170) - sight) * near;
      grey = Math.max(grey, near * 0.7);
      haze = Math.max(haze, near);
    }
    const ease = dt === 0 ? 1 : 1 - Math.exp(-3 * dt);
    this.sight += (sight - this.sight) * ease;
    this.haze += (haze - this.haze) * ease;
    this.fogGrey += (grey - this.fogGrey) * ease;
    this.applyTheme();
    if (this.activeCourse !== course) {
      this.activeCourse = course;
      this.clearGates();
    }
    this.syncGates(course, s.s);
    this.terrain.update(course, s.z, dt === 0);
    // Off the lip of a ramp the skier is in the air; on it, he rides the wedge up.
    const lift = s.airborne ? s.y : rampHeight(course.zones, s.u, s.s);
    const face = faceHeight(trail, s.z);
    const snow = surfaceHeight(course, s.x, s.z);
    const surface = snow + lift;
    // The camera rides the shape of the snow under the skier, smoothed, so a
    // roller's crest lifts the view and hides what lies beyond it without a jolt.
    const rise = surface - lift * 0.65 - face;
    if (dt === 0 || Number.isNaN(this.rise)) this.rise = rise;
    else this.rise += (rise - this.rise) * (1 - Math.exp(-4 * dt));
    const y = face + this.rise;
    // In the deep snow at the edge of the trail he rides lower, up to the shins in it.
    this.sink += ((running && s.powder && s.crashTime === 0 ? 0.28 : 0) - this.sink) * (dt === 0 ? 1 : 1 - Math.exp(-9 * dt));
    this.skier.position.set(s.x, surface + 0.03 - this.sink, s.z);
    const sinH = Math.sin(s.heading),
      cosH = Math.cos(s.heading);
    // The skier tips forward down whatever slope the skis are pointed along, and on
    // shaped snow leans downhill with the bank, exaggerated a little.
    const pitch = Math.atan(surfaceHeight(course, s.x - sinH * 0.5, s.z - cosH * 0.5) - surfaceHeight(course, s.x + sinH * 0.5, s.z + cosH * 0.5));
    const lean = -Math.atan(crossSlope(course, s.u, s.s) * BANK_RATE) * BANK_LEAN;
    this.skier.rotation.set(
      s.crashTime > 0 ? Math.sin(s.crashTime * 8) * 1.6 : s.airborne ? -0.12 - s.vy * 0.035 : pitch * 0.6,
      s.heading,
      s.crashTime > 0 ? Math.sin(s.crashTime * 7) * 1.7 : lean,
    );
    // The skier blinks while the grace after a knock lasts.
    this.skier.visible = !(running && s.invincible > 0 && s.crashTime === 0 && Math.sin(elapsed * 38) > 0.35);
    const portrait = this.camera.aspect < 0.8;
    let snap = dt === 0;
    if (mode === "finished") {
      // The results sheet takes the lower half: the camera swings round in
      // front of the wolf, down the trail from him, and holds him in the upper half of the screen.
      const dir = trailDir(trail, s.s),
        sin = Math.sin(dir),
        cos = Math.cos(dir);
      const place = (v: THREE.Vector3, across: number, down: number, up: number) => v.set(s.x + across * cos + down * sin, y + up, s.z - across * sin + down * cos);
      this.skier.scale.setScalar(1.15);
      this.skier.rotation.set(0, dir, 0);
      place(this.desired, portrait ? 2.6 : 5, portrait ? 13 : 9, 3.2);
      place(this.look, portrait ? 0 : 3.5, 0, portrait ? -3.3 : 0.6);
      if (!this.wasFinished) snap = true;
      this.yaw = dir;
    } else if (!running) {
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
      // The mountain is steep: the camera stands uphill of the wolf, so it is lifted by what the snow rises between them.
      const uphill = faceHeight(trail, s.z + (menuPortrait ? -12 : -9)) - face - (menuPortrait ? 1.2 : 0.9);
      this.desired.set(
        menuPortrait ? 7 : 6,
        y + (menuPortrait ? 5.5 : 4) + uphill,
        s.z + (menuPortrait ? -12 : -9),
      );
      this.look.set(
        menuPortrait ? -1 : wideLookX,
        y + (gear ? -0.4 : menuPortrait ? 0.7 : 1.8),
        s.z + (menuPortrait ? 4 : 5),
      );
      this.skier.rotation.set(0, 2.7, 0);
      this.skier.scale.setScalar(menuPortrait ? 1.25 : 1.3);
      this.skier.position.z += 1.8;
      this.skier.position.y = surfaceHeight(course, s.x, s.z + 1.8) + 0.03;
      this.yaw = 0;
    } else {
      this.skier.scale.setScalar(1);
      // The camera rides the trail, not the skis: it stands behind the skier on the line of the trail and looks down
      // it, so the slope ahead holds still on the screen while the skier moves across it, and a bend comes round at the
      // pace the trail turns. It follows the skier across the trail by about two thirds, as it always did.
      const base = portrait ? CAMERA.portrait : CAMERA.landscape,
        view = base;
      const from = trailAt(trail, s.s - view.back, s.u * 0.62),
        to = trailAt(trail, s.s + view.ahead, s.u * 0.66);
      this.yaw = Math.atan2(to.x - from.x, to.z - from.z);
      this.pan = 0;
      this.turn = 0;
      const cx = from.x,
        cz = from.z,
        lx = to.x,
        lz = to.z;
      let cy = faceHeight(trail, cz) + this.rise + view.up + (s.airborne && s.leap ? s.y * 1.1 + 1.5 : 0);
      // Close under a wall or a bank, the camera rises over the ground it would otherwise be inside.
      cy = Math.max(cy, groundHeight(course, cx, cz) + 2.4, groundHeight(course, (cx + s.x) / 2, (cz + s.z) / 2) + 1.6);
      this.desired.set(cx, cy, cz);
      this.look.set(lx, faceHeight(trail, lz) + this.rise * 0.5 + view.over, lz);
    }
    if (running && !this.wasRunning) this.settle = 0.7;
    this.settle = Math.max(0, this.settle - dt);
    this.wasRunning = running;
    this.wasFinished = mode === "finished";
    if (snap) this.camera.position.copy(this.desired);
    else if (running && mode !== "finished" && this.settle === 0) {
      // The camera keeps station behind the skier exactly, and only its height is eased.
      this.camera.position.x = this.desired.x;
      this.camera.position.z = this.desired.z;
      this.camera.position.y += (this.desired.y - this.camera.position.y) * (1 - Math.exp(-12 * dt));
    } else this.camera.position.lerp(this.desired, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(this.look);
    if (running) {
      // A little roll into the turn, a kick of field of view on a boost, and whatever shake is owed.
      if (mode !== "finished") this.camera.rotateZ(-(s.heading - s.aim) * 0.05);
      const shake = this.juice.shake;
      if (shake > 0.002 && mode !== "paused") {
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
      }
    }
    const kick = (running && s.boost > 0 && s.crashTime === 0 ? 5 : 0) + (running && mode !== "finished" && this.camera.aspect < 0.8 ? TURN_FOV * this.turn : 0);
    this.fovKick += (kick - this.fovKick) * (dt === 0 ? 1 : 1 - Math.exp(-5 * dt));
    if (Math.abs(this.camera.fov - this.baseFov - this.fovKick) > 0.01) {
      this.camera.fov = this.baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    }
    for (const view of this.gates) {
      const visible = view.s > s.s - 1 && view.s < s.s + 330;
      view.uprights.visible = view.flat.visible = visible;
      if (view.fixed) view.fixed.visible = visible;
      if (!visible) continue;
      // A moving gate slides along its rail and never stops; the rail stays put.
      if (view.moving) this.placeGate(view, course.gates[view.index], course, gateU(course.gates[view.index], s.time, s.gateShift));
      for (const child of view.flat.children) {
        if (!child.userData.bullseye) continue;
        // The hot spot lives: the disc breathes and the arcs circle it. Once
        // taken, it bursts outward and fades, like a pickup being collected.
        const collected = s.bullseyeGates.includes(view.index);
        if (collected && child.userData.collectedAt === undefined) child.userData.collectedAt = elapsed;
        if (!collected) child.userData.collectedAt = undefined;
        const t = collected ? Math.min(1, (elapsed - child.userData.collectedAt) / 0.45) : 0;
        child.visible = t < 1;
        if (!child.visible) continue;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4 + view.s);
        child.scale.setScalar(1 + 0.8 * t);
        child.traverse((part) => {
          if (part instanceof THREE.Mesh) (part.material as THREE.MeshBasicMaterial).opacity = part.userData.baseOpacity * (1 - t) * (1 - t);
        });
        for (const part of child.children) {
          if (part.userData.pool) part.scale.setScalar(0.96 + 0.06 * pulse);
          else if (part.userData.arcs) part.rotation.y = elapsed * 0.9;
        }
      }
      for (const child of view.uprights.children) {
        if (!child.userData.flag) continue;
        const p = (child as THREE.Mesh).geometry.attributes.position;
        for (let j = 0; j < p.count; j++) p.setZ(j, Math.sin(p.getX(j) * 4 + elapsed * 4 + view.s) * 0.055);
        p.needsUpdate = true;
      }
    }
    // The skier's shadow lies on the snow under him, wherever that is; over a chasm there is nothing for it to lie on.
    const over = zoneAt(course.zones, "chasm", s.u, s.s) !== undefined;
    this.shadow.visible = !over;
    layOnSnow(this.shadow, course, s.x + 0.35, s.z + 0.4, s.heading, 0.03);
    const shrink = s.airborne ? 1 / (1 + s.y * 0.3) : 1;
    this.shadow.scale.set(1.1 * shrink, 1, 1.7 * shrink);
    // The fox.
    const fox = this.rival.root;
    fox.visible = running && s.rival !== null;
    this.lantern.visible = (this.lantern.userData.bulb as THREE.Object3D).visible = fox.visible && course.night;
    if (s.rival) {
      const r = s.rival;
      // He faces the way his line runs through the world: down the trail, and across it toward his next gate.
      const a = trailAt(trail, r.s - 1.5, rivalLine(course, r.s - 1.5)),
        b = trailAt(trail, r.s + 1.5, rivalLine(course, r.s + 1.5));
      const facing = Math.atan2(b.x - a.x, b.z - a.z);
      this.rivalHeading += wrapAngle(facing - this.rivalHeading) * (dt === 0 ? 1 : 1 - Math.exp(-8 * dt));
      // Over a chasm he flies: off the lip and down in one long arc.
      let flight = 0;
      for (const zone of course.zones) {
        const from = zone.s + zone.length;
        if (zone.kind === "ramp" && zone.leap && r.s > from && r.s < from + CHASM_REACH) flight = Math.sin(((r.s - from) / CHASM_REACH) * Math.PI) * 3.4 + RAMP_LIP * (1 - (r.s - from) / CHASM_REACH);
      }
      fox.position.set(r.x, surfaceHeight(course, r.x, r.z) + 0.03 + flight, r.z);
      fox.rotation.set(0.12 * Math.cos(this.rivalHeading), this.rivalHeading, 0);
      // His lantern is a real lamp: it lights the snow and the rock round him, and that is all it lights.
      if (this.lantern.visible)
        lamp.glow(fox.position.x + 0.6 * Math.cos(this.rivalHeading), fox.position.y + 2.3, fox.position.z - 0.6 * Math.sin(this.rivalHeading), LANTERN, 2.4, 14);
      this.pose.crashTime = 0;
      this.pose.heading = wrapAngle(this.rivalHeading - trailDir(trail, r.s));
      this.pose.boost = 0;
      this.pose.airborne = flight > 0;
      this.pose.passed = true;
      this.rival.animate(this.pose, elapsed + 1.7, r.done ? "finished" : "playing");
    }
    // The wolf leans by how far the skis are turned off the line of travel, not by where on the mountain they point.
    this.pose.crashTime = s.crashTime;
    this.pose.heading = running ? s.heading - s.aim : 0;
    this.pose.airborne = s.airborne;
    this.pose.boost = s.boost;
    this.pose.speed = s.speed;
    this.pose.passed = s.passed;
    this.pose.finished = s.finished;
    this.character.animate(this.pose, elapsed, mode);
    this.hazards.update(s);
    this.environment.update(course, s.x, s.z);
    this.pickups.update(s, elapsed, running);
    this.props.update(s, elapsed, running);
    this.juice.update(s, mode === "paused" ? 0 : dt, elapsed, this.camera, this.yaw, running ? this.weather : "clear", running, this.theme.snow);
    this.effects.update(s, mode === "paused" ? 0 : dt, mode === "playing");
    // The headlamp: on the skier's head, pointed where the skis point and down the slope they are on.
    const k = dt === 0 ? 1 : 1 - Math.exp(-9 * dt);
    this.lampHeading += wrapAngle(s.heading - this.lampHeading) * k;
    this.lampPitch += (pitch + LAMP.tip - this.lampPitch) * k;
    const lh = this.lampHeading,
      lp = this.lampPitch;
    this.lampDir.set(Math.sin(lh) * Math.cos(lp), -Math.sin(lp), Math.cos(lh) * Math.cos(lp));
    this.lampHead.set(s.x + Math.sin(lh) * 0.3, surface + LAMP.height, s.z + Math.cos(lh) * 0.3);
    this.sightFrom.set(this.skier.position.x, this.skier.position.y + 1, this.skier.position.z);
    lamp.update(this.camera, this.dark, this.lampHead, this.lampDir, Math.min(LAMP_REACH, this.sight), this.sightFrom, this.sky, this.sight, this.haze);
    this.renderer.render(this.scene, this.camera);
  }
}
void snowTilt;
void SNOW;
