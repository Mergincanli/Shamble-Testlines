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

/** The measuring grid's colours (a prototype blockout look, not the Art's): the base of a gridded surface. */
export const GRID_COLOURS: Record<string, string> = {
  grey: '#A6A6A6',
  dark: '#707070',
  orange: '#D98C42',
  blue: '#6A93C9',
  green: '#8DB463',
  purple: '#A07CBC',
};
export type GridGroup = 'ground' | 'blocks' | 'room';

/** The grid's fixed look (in the Export): line widths, how dark the lines are, where the thin ones fade. */
export const GRID_LOOK = {
  thick_line_m: 0.04,
  thick_line_min_px: 2,
  thick_line_shade: 0.36,
  thin_line_m: 0.012,
  thin_line_min_px: 1,
  thin_line_shade: 0.74,
  thin_lines_fade_from_px: 10,
  thin_lines_gone_at_px: 5,
};

/** Shared values of every gridded material: on or off, the thin step, and each surface group's colour. */
export const GRID = {
  on: { value: 1 },
  minor: { value: 0.5 },
  base: {
    ground: { value: new THREE.Color(GRID_COLOURS.grey) },
    blocks: { value: new THREE.Color(GRID_COLOURS.orange) },
    room: { value: new THREE.Color(GRID_COLOURS.blue) },
  } as Record<GridGroup, { value: THREE.Color }>,
};

const GRID_VERT_HEAD = `
varying vec3 vGridPos;
varying vec3 vGridN;
`;
const GRID_VERT_BODY = `
vGridPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vGridN = normalize(mat3(modelMatrix) * objectNormal);
`;
const glf = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const GRID_FRAG_HEAD = `
#define GONE ${glf(GRID_LOOK.thin_lines_gone_at_px)}
#define FROM ${glf(GRID_LOOK.thin_lines_fade_from_px)}
#define THIN_HALF ${glf(GRID_LOOK.thin_line_m / 2)}
#define THIN_PX ${glf(GRID_LOOK.thin_line_min_px)}
#define THICK_HALF ${glf(GRID_LOOK.thick_line_m / 2)}
#define THICK_PX ${glf(GRID_LOOK.thick_line_min_px)}
#define THIN_SHADE ${glf(GRID_LOOK.thin_line_shade)}
#define THICK_SHADE ${glf(GRID_LOOK.thick_line_shade)}
varying vec3 vGridPos;
varying vec3 vGridN;
uniform float uGridOn;
uniform float uGridMinor;
uniform vec3 uGridBase;
// Lines every 'step' world units: 1 on a line, 0 between, at least minPx pixels wide (antialiased).
float gridLines(vec2 p, float step, float halfW, float minPx) {
  vec2 d = abs(fract(p / step - 0.5) - 0.5) * step;
  vec2 fw = max(fwidth(p), vec2(1e-6));
  vec2 w = max(vec2(halfW), fw * minPx * 0.5);
  vec2 l = 1.0 - smoothstep(w, w + fw, d);
  return max(l.x, l.y);
}
`;
const GRID_FRAG_BODY = `
if (uGridOn > 0.5) {
  // World-space projection by the face's main direction, so the lines meet across every surface.
  vec3 an = abs(normalize(vGridN));
  vec2 p = (an.y >= an.x && an.y >= an.z) ? vGridPos.xz : (an.x >= an.z ? vGridPos.zy : vGridPos.xy);
  vec2 fwp = fwidth(p);
  float px = max(max(fwp.x, fwp.y), 1e-6);
  // Thin lines fade out where they would be closer than GONE..FROM pixels.
  float fade = clamp((uGridMinor / px - GONE) / (FROM - GONE), 0.0, 1.0);
  float minor = gridLines(p, uGridMinor, THIN_HALF, THIN_PX) * fade;
  float major = gridLines(p, 1.0, THICK_HALF, THICK_PX);
  vec3 c = uGridBase;
  c = mix(c, c * THIN_SHADE, minor);
  c = mix(c, c * THICK_SHADE, major);
  diffuseColor.rgb = c;
}
`;

/** How many boxes and upright cylinders the vision rule's sight test can take on a surface (see sight.ts). */
export const VISION_MAX_BOXES = 64;
export const VISION_MAX_CYLS = 4;
/**
 * The vision rule's cone, shared by every gridded surface: on or off, how white, the eyes, the facing on the ground,
 * the cosine of half the cone (below -1.5: all round), and what blocks sight (filled by sight.ts each frame).
 */
export const VISION = {
  on: { value: 0 },
  white: { value: 0.35 },
  eye: { value: new THREE.Vector3() },
  aim: { value: new THREE.Vector2(0, 1) },
  cosHalf: { value: -2 },
  margin: { value: 0.02 },
  near: { value: 0.3 },
  boxMin: { value: Array.from({ length: VISION_MAX_BOXES }, () => new THREE.Vector3()) },
  boxMax: { value: Array.from({ length: VISION_MAX_BOXES }, () => new THREE.Vector3()) },
  /** x: 0 a box, 1 a ramp along x, 2 a ramp along z; y: low; z: high; w: top. */
  boxRamp: { value: Array.from({ length: VISION_MAX_BOXES }, () => new THREE.Vector4()) },
  boxCount: { value: 0 },
  /** x, z, radius, and (cylY) bottom and top. */
  cyl: { value: Array.from({ length: VISION_MAX_CYLS }, () => new THREE.Vector3()) },
  cylY: { value: Array.from({ length: VISION_MAX_CYLS }, () => new THREE.Vector2()) },
  cylCount: { value: 0 },
};
const VISION_FRAG_HEAD = `
uniform float uVisOn;
uniform float uVisWhite;
uniform vec3 uVisEye;
uniform vec2 uVisAim;
uniform float uVisCosHalf;
uniform float uVisMargin;
uniform float uVisNear;
uniform vec3 uVisBoxMin[${VISION_MAX_BOXES}];
uniform vec3 uVisBoxMax[${VISION_MAX_BOXES}];
uniform vec4 uVisBoxRamp[${VISION_MAX_BOXES}];
uniform int uVisBoxCount;
uniform vec3 uVisCyl[${VISION_MAX_CYLS}];
uniform vec2 uVisCylY[${VISION_MAX_CYLS}];
uniform int uVisCylCount;
// The same sight test as sight.ts, from this surface point p toward the eyes (cut short at the surface).
bool visBlocked(vec3 p, vec3 e) {
  vec3 d = e - p;
  float len = length(d);
  if (len < 1e-4) return false;
  float t0 = uVisMargin / len;
  float t1 = 1.0 - 1e-4;
  if (t1 <= t0) return false;
  vec3 dd = d;
  if (abs(dd.x) < 1e-6) dd.x = 1e-6;
  if (abs(dd.y) < 1e-6) dd.y = 1e-6;
  if (abs(dd.z) < 1e-6) dd.z = 1e-6;
  vec3 inv = 1.0 / dd;
  for (int i = 0; i < ${VISION_MAX_BOXES}; i++) {
    if (i >= uVisBoxCount) break;
    vec3 ta = (uVisBoxMin[i] - p) * inv;
    vec3 tb = (uVisBoxMax[i] - p) * inv;
    vec3 tlo = min(ta, tb);
    vec3 thi = max(ta, tb);
    float lo = max(max(tlo.x, tlo.y), max(tlo.z, t0));
    float hi = min(min(thi.x, thi.y), min(thi.z, t1));
    if (lo >= hi) continue;
    vec4 r = uVisBoxRamp[i];
    if (r.x < 0.5) return true;
    float ca = r.x < 1.5 ? p.x + dd.x * lo : p.z + dd.z * lo;
    float cb = r.x < 1.5 ? p.x + dd.x * hi : p.z + dd.z * hi;
    float ha = r.w * clamp((ca - r.y) / (r.z - r.y), 0.0, 1.0);
    float hb = r.w * clamp((cb - r.y) / (r.z - r.y), 0.0, 1.0);
    if (min(p.y + dd.y * lo - ha, p.y + dd.y * hi - hb) < 0.0) return true;
  }
  for (int i = 0; i < ${VISION_MAX_CYLS}; i++) {
    if (i >= uVisCylCount) break;
    vec3 c = uVisCyl[i];
    vec2 f = p.xz - c.xy;
    float a = dot(d.xz, d.xz);
    float lo = t0;
    float hi = t1;
    if (a < 1e-12) {
      if (dot(f, f) > c.z * c.z) continue;
    } else {
      float b = 2.0 * dot(f, d.xz);
      float k = dot(f, f) - c.z * c.z;
      float disc = b * b - 4.0 * a * k;
      if (disc < 0.0) continue;
      float q = sqrt(disc);
      lo = max(lo, (-b - q) / (2.0 * a));
      hi = min(hi, (-b + q) / (2.0 * a));
      if (lo >= hi) continue;
    }
    float ya = p.y + d.y * lo;
    float yb = p.y + d.y * hi;
    if (max(ya, yb) > uVisCylY[i].x && min(ya, yb) < uVisCylY[i].y) return true;
  }
  return false;
}
`;
// After the lighting: the surfaces your soldier sees, inside the cone, lightened toward white.
const VISION_FRAG_BODY = `
if (uVisOn > 0.5 && uVisWhite > 0.0) {
  vec2 v = vGridPos.xz - uVisEye.xz;
  float lv = length(v);
  bool inside = uVisCosHalf < -1.5 || lv < uVisNear || dot(v / lv, uVisAim) >= uVisCosHalf;
  if (inside && !visBlocked(vGridPos, uVisEye)) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uVisWhite);
}
`;

/**
 * A surface that carries the measuring grid: the same flat shading as toon(), in its Art colour when the grid is
 * off, and in its group's grid colour with lines laid in world space when it is on (a thick dark line every
 * metre, thinner lighter lines at the thin step). It also shows the vision rule's cone (VISION above). A new
 * material each call, so soldiers and guns are untouched.
 */
export function gridToon(hex: string, group: GridGroup): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradient });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGridOn = GRID.on;
    sh.uniforms.uGridMinor = GRID.minor;
    sh.uniforms.uGridBase = GRID.base[group];
    sh.uniforms.uVisOn = VISION.on;
    sh.uniforms.uVisWhite = VISION.white;
    sh.uniforms.uVisEye = VISION.eye;
    sh.uniforms.uVisAim = VISION.aim;
    sh.uniforms.uVisCosHalf = VISION.cosHalf;
    sh.uniforms.uVisMargin = VISION.margin;
    sh.uniforms.uVisNear = VISION.near;
    sh.uniforms.uVisBoxMin = VISION.boxMin;
    sh.uniforms.uVisBoxMax = VISION.boxMax;
    sh.uniforms.uVisBoxRamp = VISION.boxRamp;
    sh.uniforms.uVisBoxCount = VISION.boxCount;
    sh.uniforms.uVisCyl = VISION.cyl;
    sh.uniforms.uVisCylY = VISION.cylY;
    sh.uniforms.uVisCylCount = VISION.cylCount;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GRID_VERT_HEAD)
      .replace('#include <project_vertex>', '#include <project_vertex>' + GRID_VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GRID_FRAG_HEAD + VISION_FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>' + GRID_FRAG_BODY)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>' + VISION_FRAG_BODY);
  };
  m.customProgramCacheKey = () => 'grid-toon-2';
  return m;
}

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
