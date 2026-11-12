import * as THREE from "three";

/**
 * The light and the air, as one piece of shader that every material in the
 * game is compiled with. It does two jobs, both from the fragment's place in
 * view space:
 *
 * The headlamp. On a night run nothing is lit but what a lamp on the skier's
 * head would light: a cone along the way the skis point, falling off with the
 * square of the distance and dying at its reach; a small pool of spill round
 * the skier; a trace of ambient close by; and whatever real lamps there are
 * (the fox's lantern, a snowcat's beacon), each a pool of its own. A
 * fragment's colour is multiplied by that light. Nothing is exempt but the
 * sky and the lamps themselves, so a flag sixty metres off is as dark as the
 * snow it stands on. A retro-reflector (`retro`) throws the beam back
 * harder, and only the beam.
 *
 * The air. Fog is measured in a straight line from the skier, whichever way
 * the camera faces, and is whole at the distance the weather lets anyone see;
 * the sky and the far country go by `haze` instead, since they are past any
 * distance.
 */

/** How many lamps other than the skier's can burn at once. */
export const GLOWS = 6;

/** How a material takes the light. Put it in `material.userData.lamp` before the material is first drawn. */
export interface LampMode {
  /** Sky: never lit or darkened by the lamp, and swallowed by haze rather than by distance. */
  sky?: boolean;
  /** The far country: a silhouette at night, swallowed by haze. */
  far?: boolean;
  /** A lamp: it shines whatever the light on it. */
  source?: boolean;
  /** A retro-reflector: this many times more of the beam comes back off it. */
  retro?: number;
  /** A speck in the air (a snowflake, spray): unlit it is not there at all, rather than a black dot. */
  veil?: boolean;
  /** How much the angle of the surface to the lamp matters, 0 to 1: snow lit at a graze is dim, a bank that faces the lamp is bright. */
  facing?: number;
}
/** Marks a material with how it takes the light. Returns the material. */
export function lampMode<T extends THREE.Material>(material: T, mode: LampMode): T {
  material.userData.lamp = { ...(material.userData.lamp as LampMode | undefined), ...mode };
  return material;
}

const glowPos = Array.from({ length: GLOWS }, () => new THREE.Vector4(0, 0, 0, 1));
const glowCol = Array.from({ length: GLOWS }, () => new THREE.Vector3());
/** The uniforms every material shares: set once a frame by `Lamp.update`. */
const shared = {
  uNight: { value: 0 },
  uLampPos: { value: new THREE.Vector3() },
  uLampDir: { value: new THREE.Vector3(0, 0, -1) },
  uLampCol: { value: new THREE.Vector3(1, 1, 1) },
  /** cos of the outer half-angle, cos of the inner, the reach, the distance at which the beam is at half strength. */
  uLampCone: { value: new THREE.Vector4(0.74, 0.91, 60, 16) },
  /** Ambient, the strength of the spill, its radius, the strength of the beam. */
  uLampAmb: { value: new THREE.Vector4(0.03, 0.9, 10, 6) },
  uGlowPos: { value: glowPos },
  uGlowCol: { value: glowCol },
  uSkierV: { value: new THREE.Vector3() },
  uAirCol: { value: new THREE.Vector3(1, 1, 1) },
  /** Where the fog starts, where it is whole, how much of the sky it takes. */
  uAir: { value: new THREE.Vector4(120, 400, 0, 0) },
};

const PARS_VERTEX = /* glsl */ `
varying vec3 vLampV;
`;
const PARS_FRAGMENT = /* glsl */ `
varying vec3 vLampV;
uniform float uNight;
uniform vec3 uLampPos;
uniform vec3 uLampDir;
uniform vec3 uLampCol;
uniform vec4 uLampCone;
uniform vec4 uLampAmb;
uniform vec4 uGlowPos[${GLOWS}];
uniform vec3 uGlowCol[${GLOWS}];
uniform vec3 uSkierV;
uniform vec3 uAirCol;
uniform vec4 uAir;
uniform vec4 uLampMat;
uniform vec2 uLampFx;
vec3 lampLight(vec3 p, vec3 faceN) {
  vec3 to = p - uLampPos;
  float d = length(to) + 1e-4;
  vec3 l = to / d;
  // How squarely the surface faces the lamp.
  float nn = dot(faceN, faceN);
  float facing = nn > 0.0 ? sqrt(abs(dot(faceN, l)) / sqrt(nn)) : 1.0;
  float shade = mix(1.0, facing, uLampFx.y);
  float cone = smoothstep(uLampCone.x, uLampCone.y, dot(l, uLampDir));
  float r = d / uLampCone.z;
  float r2 = r * r;
  float window = clamp(1.0 - r2 * r2 * r2, 0.0, 1.0);
  float fall = 1.0 / (1.0 + (d * d) / (uLampCone.w * uLampCone.w));
  float beam = uLampAmb.w * cone * fall * window * window;
  // Round the skier, snow lit by the beam lights the rest a little.
  float spill = uLampAmb.y * exp(-(d * d) / (uLampAmb.z * uLampAmb.z));
  float ambient = uLampAmb.x * (1.0 - smoothstep(0.3, 1.0, r));
  vec3 light = uLampCol * (beam * (shade + uLampMat.y) + spill) + vec3(0.75, 0.85, 1.0) * ambient;
  for (int i = 0; i < ${GLOWS}; i++) {
    vec3 g = p - uGlowPos[i].xyz;
    float reach2 = uGlowPos[i].w * uGlowPos[i].w;
    float g2 = dot(g, g);
    float w = clamp(1.0 - g2 / reach2, 0.0, 1.0);
    light += uGlowCol[i] * (w * w / (1.0 + g2 / (0.03 * reach2)));
  }
  // Bright light rolls off rather than clipping; a reflector may flare past white.
  float top = 1.15 + uLampMat.y;
  return top * (1.0 - exp(-light / top));
}
`;
const LIGHT_FRAGMENT = /* glsl */ `
{
  vec3 lampN = cross(dFdx(vLampV), dFdy(vLampV));
  if (uNight > 0.0) {
    vec3 lampL = mix(vec3(uLampMat.w), lampLight(vLampV, lampN), uLampMat.x);
    if (uLampFx.x > 0.5) {
      // A speck in the air: its light is its opacity.
      float seen = clamp(max(lampL.r, max(lampL.g, lampL.b)), 0.0, 1.0);
      gl_FragColor.a *= mix(1.0, seen, uNight);
      lampL /= max(seen, 1e-3);
    }
    gl_FragColor.rgb *= mix(vec3(1.0), lampL, uNight);
  }
}
#include <tonemapping_fragment>
`;
const AIR_FRAGMENT = /* glsl */ `
{
  float airFog = mix(smoothstep(uAir.x, uAir.y, length(vLampV - uSkierV)), uAir.z, uLampMat.z);
  if (uLampFx.x > 0.5) gl_FragColor.a *= 1.0 - airFog;
  else gl_FragColor.rgb = mix(gl_FragColor.rgb, uAirCol, airFog);
}
`;

function hook(this: THREE.Material, shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
  if (!shader.fragmentShader.includes("#include <fog_fragment>") || !shader.vertexShader.includes("#include <fog_vertex>")) return;
  const mode = (this.userData.lamp ?? {}) as LampMode;
  const backdrop = mode.sky || mode.far;
  const mesh = (this as THREE.Material & { isMeshBasicMaterial?: boolean; isMeshLambertMaterial?: boolean }).isMeshBasicMaterial || (this as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial;
  Object.assign(shader.uniforms, shared, {
    // How much of the lamp's rule applies, the gain of a reflector, whether it is past all distance, and what it is multiplied by at night when the lamp does not rule it.
    uLampMat: { value: new THREE.Vector4(backdrop || mode.source ? 0 : 1, mode.retro ?? 0, backdrop ? 1 : 0, mode.far ? 0 : 1) },
    uLampFx: { value: new THREE.Vector2(mode.veil ? 1 : 0, mesh && !mode.veil ? (mode.facing ?? 0.35) : 0) },
  });
  shader.vertexShader = shader.vertexShader
    .replace("#include <fog_pars_vertex>", PARS_VERTEX)
    .replace("#include <fog_vertex>", "vLampV = mvPosition.xyz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <fog_pars_fragment>", PARS_FRAGMENT)
    .replace("#include <tonemapping_fragment>", LIGHT_FRAGMENT)
    .replace("#include <fog_fragment>", AIR_FRAGMENT);
}
// Every material there is or will be: flags are built as they come into reach, pools grow, and none of them may be missed.
(THREE.Material.prototype as { onBeforeCompile: unknown }).onBeforeCompile = hook;

/** One lamp besides the skier's: where it is in the world, its colour times its strength, and how far it throws. */
export interface Glow {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  strength: number;
  reach: number;
}
const scratch = new THREE.Vector3(),
  outColor = new THREE.Color();
/** The numbers of the headlamp: see the report at the head of this file. */
export const LAMP = {
  /** Half-angles of the cone, in degrees: full strength inside the first, nothing outside the second. */
  inner: 24,
  outer: 42,
  /** Metres at which the beam is down to half. */
  half: 16,
  strength: 6,
  /** The lamp sits this far above the snow, and is tipped this far below the line of the skis (radians). */
  height: 1.75,
  tip: 0.07,
  spill: 0.34,
  spillRadius: 7,
  ambient: 0.007,
};

export const lamp = {
  /** The lamps that burn this frame besides the skier's; filled by whoever owns them, emptied by `update`. */
  glows: [] as Glow[],
  glow(x: number, y: number, z: number, color: THREE.Color, strength: number, reach: number) {
    this.glows.push({ x, y, z, color, strength, reach });
  },
  /**
   * Sets the light and the air for the frame about to be drawn. The camera must be where it will be drawn from.
   * `head` is the lamp in the world and `dir` the way it points; `skier` the point sight is measured from.
   */
  update(
    camera: THREE.Camera,
    night: number,
    head: THREE.Vector3,
    dir: THREE.Vector3,
    reach: number,
    skier: THREE.Vector3,
    air: THREE.Color,
    sight: number,
    haze: number,
  ) {
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse;
    shared.uNight.value = night;
    shared.uLampPos.value.copy(head).applyMatrix4(view);
    shared.uLampDir.value.copy(dir).transformDirection(view);
    shared.uLampCone.value.set(Math.cos((LAMP.outer * Math.PI) / 180), Math.cos((LAMP.inner * Math.PI) / 180), reach, LAMP.half);
    shared.uLampAmb.value.set(LAMP.ambient, LAMP.spill, LAMP.spillRadius, LAMP.strength);
    shared.uSkierV.value.copy(skier).applyMatrix4(view);
    // Colours drawn without lighting are handed over in the space of the screen, as three's own fog colour is.
    air.getRGB(outColor, THREE.SRGBColorSpace);
    shared.uAirCol.value.set(outColor.r, outColor.g, outColor.b);
    shared.uAir.value.set(sight * 0.3, sight, haze, 0);
    // The nearest lamps to the skier are the ones that burn.
    const glows = this.glows;
    if (glows.length > GLOWS) glows.sort((a, b) => (a.x - skier.x) ** 2 + (a.z - skier.z) ** 2 - ((b.x - skier.x) ** 2 + (b.z - skier.z) ** 2));
    for (let i = 0; i < GLOWS; i++) {
      const g = glows[i];
      if (!g) {
        glowCol[i].set(0, 0, 0);
        glowPos[i].set(0, 0, 0, 1);
        continue;
      }
      scratch.set(g.x, g.y, g.z).applyMatrix4(view);
      glowPos[i].set(scratch.x, scratch.y, scratch.z, g.reach);
      glowCol[i].set(g.color.r * g.strength, g.color.g * g.strength, g.color.b * g.strength);
    }
    glows.length = 0;
  },
};
