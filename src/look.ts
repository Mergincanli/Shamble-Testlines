// The stand-in look: flat comic shading in three steps, a warm sun with a cool soft shadow, and a black ink
// line drawn from an inverted hull. Colours come from the Art texts in the game's repository (appendix A4,
// A5 part C, A7). Using them here decides nothing: this is a sandbox stand-in, kept small on purpose.
import * as THREE from 'three';

/** Palette A base colours and the sun and shadow colours (appendix A7, sheet 3; yard use from A5 part C). */
export const PAL = {
  street: '#B8AD98',
  grass: '#A7B58F',
  worn: '#B0B194',
  stone: '#D0C2A2',
  plaster: '#E6DDC8',
  timber: '#4A3A2E',
  sun: '#FFF4DC',
  shadow: '#98A2B8',
  ink: '#000000',
};

export type Faction = 'soviets' | 'allies' | 'empire';
export const FACTIONS: Faction[] = ['soviets', 'allies', 'empire'];
export const FACTION_NAMES: Record<Faction, string> = { soviets: 'Soviets', allies: 'Allies', empire: 'Empire' };

/** The soldier's four flat colours per faction (appendix A4; working names). */
export const UNIFORM: Record<Faction, { coat: string; top: string; trim: string; dark: string }> = {
  soviets: { coat: '#A72123', top: '#D41414', trim: '#8F6F30', dark: '#4D4843' },
  allies: { coat: '#235DBD', top: '#1F6FF0', trim: '#FFFD82', dark: '#4D4843' },
  empire: { coat: '#F5F3EA', top: '#890089', trim: '#8F6F30', dark: '#4D4843' },
};

/**
 * Three shading steps from the light's angle: in shade (facing away), a middle step, and full sun.
 * The palette's "in sun" value is base x sun colour and its "in shade" value is base x shadow colour, so the
 * ambient light carries the shadow colour and the sun adds the difference on top.
 */
function makeGradient(): THREE.DataTexture {
  // dot(N, L) from -1 to 1 maps to 0..1 across 20 texels. Facing away (dot < 0): shade. Facing the sun at a
  // slant (0 <= dot < 0.7): the middle step. Facing it squarely (dot >= 0.7, which includes flat ground and
  // the tops of blocks under this sun): full sun. So the three faces of a block seen from above read apart.
  const data = new Uint8Array(20);
  for (let i = 0; i < 20; i++) data[i] = i < 10 ? 0 : i < 17 ? 128 : 255;
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const gradient = makeGradient();
const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(hex: string): THREE.MeshToonMaterial {
  let m = toonCache.get(hex);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradient });
    toonCache.set(hex, m);
  }
  return m;
}

/** Shared by every ink material: the drawing buffer size, so line widths stay in screen pixels. */
const inkShared = { uRes: { value: new THREE.Vector2(1920, 1080) } };

export function setInkResolution(w: number, h: number) {
  inkShared.uRes.value.set(w, h);
}

/**
 * Ink line from an inverted hull: back faces pushed out along averaged normals by a fixed number of screen
 * pixels (given at 1080p and scaled with the screen's height).
 */
export function inkMaterial(widthAt1080: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uRes: inkShared.uRes, uWidth: { value: widthAt1080 }, uColor: { value: new THREE.Color(PAL.ink) } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform vec2 uRes;
      uniform float uWidth;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 nv = normalize(normalMatrix * normal);
        vec2 dir = (projectionMatrix * vec4(nv, 0.0)).xy;
        float len = length(dir);
        dir = len > 1e-6 ? dir / len : vec2(0.0);
        float px = uWidth * uRes.y / 1080.0;
        clip.xy += dir * px * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}

/** Line widths in px at 1080p. The Art sheet's proposals (units 4.8, buildings 3.6); nothing is decided here. */
export const INK_UNIT = inkMaterial(4.8);
export const INK_BLOCK = inkMaterial(3.6);

export function addLights(scene: THREE.Scene) {
  const shadowLin = new THREE.Color(PAL.shadow);
  const sunLin = new THREE.Color(PAL.sun);
  // three.js divides diffuse light by pi, so lights carry pi to land exactly on the palette values.
  const ambient = new THREE.AmbientLight(shadowLin, Math.PI);
  const sunAdd = new THREE.Color(
    Math.max(0, sunLin.r - shadowLin.r),
    Math.max(0, sunLin.g - shadowLin.g),
    Math.max(0, sunLin.b - shadowLin.b),
  );
  const sun = new THREE.DirectionalLight(sunAdd, Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const cam = sun.shadow.camera;
  cam.left = -32;
  cam.right = 32;
  cam.top = 32;
  cam.bottom = -32;
  cam.near = 1;
  cam.far = 160;
  scene.add(ambient, sun, sun.target);
  // The sun sits behind and to the left of the default camera, high up.
  const sunDir = new THREE.Vector3(-0.35, 1.25, 0.95).normalize();
  return {
    sun,
    /** Keep the shadow area centred on the soldier. */
    follow(x: number, y: number, z: number) {
      sun.target.position.set(x, y, z);
      sun.position.set(x + sunDir.x * 70, y + sunDir.y * 70, z + sunDir.z * 70);
    },
  };
}
