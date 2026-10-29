// Τρισδιάστατη σκηνή: φόρτωση μοντέλου, ρεαλιστικά υλικά, επιλογή, στρώσεις, κάμερα.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { fetchAnatomy } from './anatomy.js';
import { __G } from './lang.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Χρώματα ιστών (sRGB)
const MUSCLE_BASE = new THREE.Color('#7d211b');
const TENDON = new THREE.Color('#ddd3bf');
const CLAY = new THREE.Color('#c09e93');
const HI_PRIMARY = new THREE.Color('#ff3b12');
const HI_SECONDARY = new THREE.Color('#ffb01f');
const HOVER = new THREE.Color('#ffd9b8');

const KIND_STYLE = {
  muscle: { roughness: 0.56, clearcoat: 0.12, clearcoatRoughness: 0.42, sheen: 0.4, sheenRoughness: 0.5, sheenColor: '#ff9a88', striation: 1 },
  connective: { tint: '#e0d6c4', roughness: 0.4, clearcoat: 0.18, clearcoatRoughness: 0.35, sheen: 0.3, sheenRoughness: 0.45, sheenColor: '#fff4e6', striation: 0.35 },
  bone: { tint: '#d8cbb0', roughness: 0.62, clearcoat: 0.05, clearcoatRoughness: 0.6, sheen: 0, striation: 0 },
  cartilage: { tint: '#c9d3d6', roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.2, sheenRoughness: 0.5, sheenColor: '#ffffff', striation: 0 },
  tooth: { tint: '#ebe3cf', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0, striation: 0 },
  sclera: { tint: '#efebe4', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, striation: 0 },
  iris: { tint: '#3d2a1f', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, striation: 0 },
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

// Κίνηση: ο σκελετός (src/rig.js) δίνει έναν μετασχηματισμό ανά κόκαλο ως διπλό τετραδόνιο·
// κάθε κορυφή αναμειγνύει έως 4 (dual quaternion skinning: χωρίς «ζάρωμα» στις αρθρώσεις).
export const MAX_BONES = 32;
const SKIN = {
  uSkin: { value: 0 },
  uBR: { value: new Float32Array(MAX_BONES * 4) },
  uBD: { value: new Float32Array(MAX_BONES * 4) },
};
const SHARED = {
  uLevelMask: { value: new THREE.Vector4(1, 0, 0, 0) },
  uClay: { value: CLAY.clone() },
  uTendon: { value: TENDON.clone() },
  uHoverColor: { value: HOVER.clone() },
  // πόσο «δουλεύουν» οι τονισμένοι μύες τη στιγμή αυτή (κίνηση άσκησης)
  uHiGain: { value: 1 },
  ...SKIN,
};

const SKIN_DECL = /* glsl */ `
attribute vec4 aSkinI;
attribute vec4 aSkinW;
uniform float uSkin;
uniform vec4 uBR[${MAX_BONES}];
uniform vec4 uBD[${MAX_BONES}];
void skinDQ(out vec4 br, out vec4 bd) {
  vec4 r0 = uBR[int(aSkinI.x)];
  br = r0 * aSkinW.x;
  bd = uBD[int(aSkinI.x)] * aSkinW.x;
  vec4 r = uBR[int(aSkinI.y)];
  float s = dot(r0, r) < 0.0 ? -1.0 : 1.0;
  br += r * (aSkinW.y * s); bd += uBD[int(aSkinI.y)] * (aSkinW.y * s);
  r = uBR[int(aSkinI.z)];
  s = dot(r0, r) < 0.0 ? -1.0 : 1.0;
  br += r * (aSkinW.z * s); bd += uBD[int(aSkinI.z)] * (aSkinW.z * s);
  r = uBR[int(aSkinI.w)];
  s = dot(r0, r) < 0.0 ? -1.0 : 1.0;
  br += r * (aSkinW.w * s); bd += uBD[int(aSkinI.w)] * (aSkinW.w * s);
  float l = length(br);
  br /= l; bd /= l;
}
vec3 dqPoint(vec4 r, vec4 d, vec3 p) {
  return p + 2.0 * cross(r.xyz, cross(r.xyz, p) + r.w * p) + 2.0 * (r.w * d.xyz - d.w * r.xyz + cross(r.xyz, d.xyz));
}
vec3 dqDir(vec4 r, vec3 n) { return n + 2.0 * cross(r.xyz, cross(r.xyz, n) + r.w * n); }
`;
const SKIN_NORMAL = /* glsl */ `
vec4 skR = vec4(0.0, 0.0, 0.0, 1.0), skD = vec4(0.0);
if (uSkin > 0.5) {
  skinDQ(skR, skD);
  objectNormal = dqDir(skR, objectNormal);
}
`;
const SKIN_POS = /* glsl */ `
if (uSkin > 0.5) transformed = dqPoint(skR, skD, transformed);
`;

const VERT_DECL = SKIN_DECL + /* glsl */ `
attribute vec4 aAO;
attribute float aTissue;
attribute vec4 aFiber;
uniform vec4 uLevelMask;
varying float vAO;
varying float vTissue;
varying vec3 vObjPos;
varying vec3 vObjN;
varying vec4 vFiber;
`;
const VERT_BODY = /* glsl */ `
vAO = dot(aAO, uLevelMask);
vTissue = aTissue;
vObjPos = position;
vObjN = normal;
vFiber = aFiber;
`;

const FRAG_DECL = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uTendon;
uniform vec3 uClay;
uniform vec3 uHiColor;
uniform vec3 uHoverColor;
uniform float uHi;
uniform float uHiGain;
uniform float uDim;
uniform float uHover;
uniform float uSelected;
uniform float uFade;
uniform float uStriation;
varying float vAO;
varying float vTissue;
varying vec3 vObjPos;
varying vec3 vObjN;
varying vec4 vFiber;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
float tendonMix = smoothstep(0.3, 0.7, vTissue);
float stri = 0.5;
float striH = 0.0;
float striFade = 0.0;
if (uStriation > 0.0) {
  // στερεή υφή: οι δέσμες ινών είναι ακτίνες που συγκλίνουν στην έκφυση/κατάφυση του μυός
  vec3 d = vObjPos - vFiber.xyz;
  float r = max(length(d), 1e-4);
  vec3 q = (d / r) * vFiber.w;
  vec3 q1 = q * 850.0;
  vec3 q2 = q * 190.0;
  float w1 = length(fwidth(q1));
  float w2 = length(fwidth(q2));
  float f1 = 1.0 - smoothstep(0.35, 1.1, w1);
  float f2 = 1.0 - smoothstep(0.35, 1.1, w2);
  float n1 = vnoise3(q1);
  float n2 = vnoise3(q2 + vec3(7.31, 1.7, 3.3));
  float fine = smoothstep(0.15, 0.85, n1);
  float coarse = smoothstep(0.2, 0.8, n2);
  striFade = max(f1, f2) * uStriation;
  stri = 0.5 + ((fine - 0.5) * f1 * 0.75 + (coarse - 0.5) * f2 * 0.6) * uStriation;
  striH = (fine * f1 * 0.35 + coarse * f2 * 1.0) * uStriation;
}
vec3 albedo = mix(uTint, uTendon, tendonMix);
albedo *= mix(0.8, 1.1, stri) * (1.0 - tendonMix * 0.7) + tendonMix * mix(0.94, 1.03, stri);
vec3 clay = uClay * mix(0.95, 1.03, stri);
albedo = mix(albedo, mix(clay, uTendon, tendonMix * 0.45), uDim * 0.86);
vec3 hiAlbedo = uHiColor * mix(0.84, 1.06, stri);
albedo = mix(albedo, mix(hiAlbedo, uTendon, tendonMix * 0.55), clamp(uHi * uHiGain, 0.0, 1.0));
albedo = mix(albedo, albedo * 1.12 + uHoverColor * 0.05, uHover);
diffuseColor.rgb = albedo;
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(mix(roughnessFactor, 0.36, tendonMix) + (0.5 - stri) * 0.18, 0.08, 1.0);
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
if (striFade > 0.0) {
  // bump mapping από τις παραγώγους του ύψους των ινών (όπως το perturbNormalArb του three.js)
  vec3 dpdx = dFdx(-vViewPosition);
  vec3 dpdy = dFdy(-vViewPosition);
  float h = striH * 0.00055 * (1.0 - tendonMix * 0.7);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
totalEmissiveRadiance += uHiColor * uHi * uHiGain * uHiGain * (0.07 + 0.32 * fres);
totalEmissiveRadiance += uHoverColor * uHover * (0.04 + 0.45 * fres);
totalEmissiveRadiance += uHiColor * uSelected * (0.05 + 0.55 * fres);
`;

const FRAG_AO = /* glsl */ `
float aoF = clamp(vAO, 0.0, 1.0);
aoF = aoF * aoF * (3.0 - 2.0 * aoF) * 0.35 + aoF * 0.65;
reflectedLight.indirectDiffuse *= aoF;
reflectedLight.indirectSpecular *= aoF * aoF;
reflectedLight.directDiffuse *= mix(1.0, aoF, 0.6);
reflectedLight.directSpecular *= mix(1.0, aoF, 0.8);
#if defined( USE_CLEARCOAT )
  clearcoatSpecularIndirect *= aoF;
  clearcoatSpecularDirect *= mix(1.0, aoF, 0.7);
#endif
#if defined( USE_SHEEN )
  sheenSpecularIndirect *= aoF;
  sheenSpecularDirect *= aoF;
#endif
`;

const FRAG_FADE = /* glsl */ `
#include <clipping_planes_fragment>
if (uFade < 0.999) {
  if (hash12(floor(gl_FragCoord.xy) + 0.37) > uFade) discard;
}
`;

function makeMaterial(kind, tint) {
  const st = KIND_STYLE[kind] ?? KIND_STYLE.muscle;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: st.roughness,
    metalness: 0,
    clearcoat: st.clearcoat,
    clearcoatRoughness: st.clearcoatRoughness ?? 0.4,
    sheen: st.sheen,
    sheenRoughness: st.sheenRoughness ?? 0.5,
    sheenColor: new THREE.Color(st.sheenColor ?? '#ffffff'),
    side: kind === 'connective' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const u = {
    uTint: { value: new THREE.Color(tint ?? st.tint ?? '#ffffff') },
    uHiColor: { value: HI_PRIMARY.clone() },
    uHi: { value: 0 },
    uDim: { value: 0 },
    uHover: { value: 0 },
    uSelected: { value: 0 },
    uFade: { value: 1 },
    uStriation: { value: st.striation },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>\n${SKIN_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${SKIN_POS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', FRAG_FADE)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', FRAG_AO);
  };
  mat.customProgramCacheKey = () => `anat-${st.sheen > 0 ? 's' : 'n'}-${st.clearcoat > 0 ? 'c' : 'n'}`;
  return mat;
}

const XRAY_VERT = SKIN_DECL + /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 objectNormal = normal;
  ${SKIN_NORMAL}
  vec3 transformed = position;
  ${SKIN_POS}
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vN = normalize(normalMatrix * objectNormal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const XRAY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  gl_FragColor = vec4(uColor, uAlpha * (0.22 + 0.78 * f));
  #include <colorspace_fragment>
}`;

function makeXrayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: HI_PRIMARY.clone() }, uAlpha: { value: 0.5 }, ...SKIN },
    vertexShader: XRAY_VERT,
    fragmentShader: XRAY_FRAG,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    side: THREE.FrontSide,
  });
}

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VIS_DIRS = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0.71, 0, 0.71], [-0.71, 0, 0.71], [0.71, 0, -0.71], [-0.71, 0, -0.71], [0, 1, 0.25]]
  .map((v) => new THREE.Vector3(...v).normalize());

export const VIEWS = {
  front: new THREE.Vector3(0, 0.08, 1),
  back: new THREE.Vector3(0, 0.08, -1),
  left: new THREE.Vector3(1, 0.06, 0.05),
  right: new THREE.Vector3(-1, 0.06, 0.05),
  three: new THREE.Vector3(0.62, 0.12, 0.78),
};

export class Viewer {
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.meshes = [];
    this.byUnit = new Map();
    this.byId = new Map();
    this.level = 0;
    this.fades = [];
    this.anim = null;
    this.dirty = true;
    this.hoverUnit = null;
    this.hoverMesh = null;
    this.selectedUnit = null;
    this.hiValues = new Map();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', __G('Τρισδιάστατο μοντέλο ανθρώπινου σώματος με τους μύες'));
    renderer.domElement.setAttribute('role', 'img');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;

    const camera = new THREE.PerspectiveCamera(26, 1, 0.02, 60);
    this.camera = camera;
    scene.add(camera);
    // Φώτα στερεωμένα στην κάμερα: ίδιος φωτισμός από κάθε γωνία
    const key = new THREE.DirectionalLight('#fff0e4', 2.3);
    key.position.set(-1.3, 1.6, 1.4);
    const fill = new THREE.DirectionalLight('#dde6ff', 0.65);
    fill.position.set(1.6, 0.2, 0.9);
    const rim = new THREE.DirectionalLight('#ffffff', 1.5);
    rim.position.set(0.9, 1.1, -1.6);
    const rim2 = new THREE.DirectionalLight('#ffe6dc', 0.9);
    rim2.position.set(-1.4, -0.2, -1.2);
    for (const l of [key, fill, rim, rim2]) { camera.add(l); l.target.position.set(0, 0, -3); camera.add(l.target); }
    scene.add(new THREE.HemisphereLight('#fff5ee', '#5a4643', 0.35));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: makeGroundTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    ground.scale.set(0.75, 0.42, 1);
    ground.renderOrder = -1;
    scene.add(ground);
    this.ground = ground;

    this.root = new THREE.Group();
    scene.add(this.root);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.28;
    controls.maxDistance = 6.5;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.target.set(0, 0.9, 0.03);
    controls.addEventListener('change', () => { this.dirty = true; });
    controls.addEventListener('start', () => { this.cancelAnim(); this.handlers.onInteract?.(); });
    this.controls = controls;
    this.setView('three', true);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.pointer = new THREE.Vector2();
    this.bindPointer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  async load(url, expectedBytes, onProgress) {
    const data = await fetchAnatomy(url, expectedBytes, onProgress);
    for (const m of data.meshes) this.addMesh(m);
    this.buildTrees();
    this.dirty = true;
    return data.header;
  }

  addMesh(m) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    geo.computeVertexNormals();
    geo.setAttribute('aAO', new THREE.BufferAttribute(m.aoData, 4, true));
    geo.setAttribute('aTissue', new THREE.BufferAttribute(m.tissue, 1, true));
    const segInfo = [];
    for (const s of m.segs) {
      let r2 = 0;
      for (let i = s.start; i < s.start + s.count; i++) {
        const px = m.position[i * 3] - s.center[0], py = m.position[i * 3 + 1] - s.center[1], pz = m.position[i * 3 + 2] - s.center[2];
        r2 = Math.max(r2, px * px + py * py + pz * pz);
      }
      // η κατεύθυνση «προς τα έξω» υπολογίζεται μετά τη φόρτωση, από το πλησιέστερο οστό (computeOutward)
      segInfo.push({ side: s.side, start: s.start, center: new THREE.Vector3(...s.center), radius: Math.sqrt(r2), outward: new THREE.Vector3(0, 0, 1), count: s.count });
    }
    geo.setAttribute('aFiber', new THREE.BufferAttribute(m.fiber, 4));
    geo.computeBoundingSphere();

    let kind = m.kind;
    let tint;
    if (kind === 'bone' || kind === 'eye') kind = m.tissue ?? (kind === 'eye' ? 'sclera' : 'bone');
    if (kind === 'muscle') {
      const h = hash(m.id);
      tint = MUSCLE_BASE.clone().offsetHSL((h - 0.5) * 0.018, (h - 0.5) * 0.08, (hash(m.id + 'l') - 0.5) * 0.07);
    }
    const mat = makeMaterial(kind, tint);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { ...m, position: undefined, index: undefined, tissue: undefined, fiber: undefined, fibers: undefined, aoData: undefined, segs: segInfo, fade: 1, styleKind: kind };
    mesh.renderOrder = 0;
    this.root.add(mesh);
    this.meshes.push(mesh);
    this.byId.set(m.id, mesh);
    if (m.unit) {
      if (!this.byUnit.has(m.unit)) this.byUnit.set(m.unit, []);
      this.byUnit.get(m.unit).push(mesh);
    }
  }

  buildTrees() {
    // BVH για γρήγορο picking και για τον υπολογισμό ορατότητας
    for (const m of this.meshes) m.geometry.computeBoundsTree();
  }

  // ---------------------------------------------------------------- κίνηση (σκελετός)
  attachRig(rig) {
    for (const m of this.meshes) {
      const s = rig.skin.get(m.userData.id);
      if (!s) continue;
      m.geometry.setAttribute('aSkinI', new THREE.BufferAttribute(s.si, 4, false));
      m.geometry.setAttribute('aSkinW', new THREE.BufferAttribute(s.sw, 4, true));
      // σε κίνηση το σώμα φεύγει από τη θέση ηρεμίας: χωρίς περικοπή με βάση τα όρια ηρεμίας
      m.frustumCulled = false;
    }
    this.rig = rig;
  }

  // ο σκελετός έχει λυθεί (rig.solve().writeDQ()): το μοντέλο παίρνει τη στάση του
  showPose(rig) {
    SKIN.uBR.value.set(rig.dqR);
    SKIN.uBD.value.set(rig.dqD);
    SKIN.uSkin.value = 1;
    this.posed = true;
    this.dirty = true;
  }

  restPose() {
    SKIN.uSkin.value = 0;
    this.posed = false;
    this.dirty = true;
  }

  setHiGain(g) { SHARED.uHiGain.value = g; this.dirty = true; }

  // Από ποιες κατευθύνσεις φαίνεται ένα τμήμα (με τις στρώσεις του επιπέδου level): ακτίνες από
  // έξω προς δείγματα της επιφάνειάς του. Αποθηκεύεται ανά επίπεδο.
  segVisibility(mesh, seg, level) {
    seg.vis ??= {};
    if (seg.vis[level]) return seg.vis[level];
    const blockers = this.meshes.filter((m) => this.isShown(m, level));
    const P = mesh.geometry.attributes.position.array, N = mesh.geometry.attributes.normal.array;
    const step = Math.max(1, Math.floor(seg.count / 30));
    const scores = new Float32Array(VIS_DIRS.length);
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = true;
    const p = new THREE.Vector3(), n = new THREE.Vector3(), o = new THREE.Vector3(), nd = new THREE.Vector3();
    for (let i = seg.start; i < seg.start + seg.count; i += step) {
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      VIS_DIRS.forEach((d, k) => {
        const f = n.dot(d);
        if (f < 0.2) return;
        o.copy(p).addScaledVector(d, 2.4);
        rc.set(o, nd.copy(d).negate());
        rc.near = 0;
        rc.far = 2.45;
        const hit = rc.intersectObjects(blockers, false)[0];
        if (hit && hit.object === mesh && hit.distance > 2.4 - 0.012) scores[k] += f;
      });
    }
    seg.vis[level] = scores;
    return scores;
  }

  // Κατεύθυνση από την οποία φαίνεται καλύτερα το τμήμα (για βαθιούς μύες: σαν να έχουν αφαιρεθεί οι πάνω στρώσεις)
  segOutward(mesh, seg) {
    const own = mesh.userData.kind === 'muscle' || mesh.userData.kind === 'connective' ? mesh.userData.depth : 0;
    const level = Math.min(2, Math.max(this.level, own));
    const sc = this.segVisibility(mesh, seg, level);
    const v = new THREE.Vector3();
    VIS_DIRS.forEach((d, k) => v.addScaledVector(d, sc[k]));
    if (v.lengthSq() < 1e-6) v.set(seg.center.x, 0, seg.center.z - 0.02);
    return v.normalize();
  }

  isShown(mesh, level = this.level) {
    const d = mesh.userData.depth;
    const k = mesh.userData.kind;
    if (k === 'muscle' || k === 'connective') return level < 3 && d >= level;
    return true;
  }

  setLevel(level) {
    level = Math.max(0, Math.min(3, level));
    const from = this.level;
    this.level = level;
    const mask0 = SHARED.uLevelMask.value.clone();
    const mask1 = new THREE.Vector4(level === 0 ? 1 : 0, level === 1 ? 1 : 0, level === 2 ? 1 : 0, level === 3 ? 1 : 0);
    const starts = this.meshes.map((m) => m.material.userData.u.uFade.value);
    const targets = this.meshes.map((m) => (this.isShown(m) ? 1 : 0));
    this.meshes.forEach((m, i) => { if (targets[i] > 0) m.visible = true; });
    const dur = reduceMotion() || from === level ? 0 : 520;
    this.fades.push({
      t0: performance.now(), dur,
      tick: (k) => {
        const e = ease(k);
        SHARED.uLevelMask.value.lerpVectors(mask0, mask1, e);
        this.meshes.forEach((m, i) => {
          const v = starts[i] + (targets[i] - starts[i]) * e;
          m.material.userData.u.uFade.value = v;
          if (k >= 1 && targets[i] === 0) m.visible = false;
        });
        this.syncXray();
      },
    });
  }

  // values: Map(meshId -> {v: 0..1, color}) — 0.5 περίπου για βοηθητικούς, 1 για κύριους
  // xray: false → χωρίς «λάμψη» για καλυμμένους μύες (π.χ. στον χάρτη αξιολόγησης)
  setHighlight(values, { xray = true } = {}) {
    this.hiValues = values;
    this.xrayOn = xray;
    const any = values.size > 0;
    for (const m of this.meshes) {
      const u = m.material.userData.u;
      const h = values.get(m.userData.id);
      const isMuscle = m.userData.kind === 'muscle' || m.userData.kind === 'connective';
      const target = h ? h.v : 0;
      const dim = any && isMuscle && !h ? 1 : 0;
      if (h) u.uHiColor.value.set(h.color);
      this.animateUniform(u.uHi, target);
      this.animateUniform(u.uDim, dim * (m.userData.kind === 'connective' ? 0.6 : 1));
    }
    this.syncXray();
    this.dirty = true;
  }

  animateUniform(uniform, target, dur = 380) {
    const from = uniform.value;
    if (Math.abs(from - target) < 1e-3) { uniform.value = target; return; }
    if (reduceMotion()) { uniform.value = target; return; }
    this.fades.push({ t0: performance.now(), dur, tick: (k) => { uniform.value = from + (target - from) * ease(k); } });
  }

  // Ακτινογραφία: όσοι στοχευμένοι/επιλεγμένοι μύες βρίσκονται κάτω από άλλες στρώσεις φαίνονται ως
  // λάμψη, μόνο από την πλευρά του σώματος που βλέπει η κάμερα (όχι διαμπερώς από την άλλη πλευρά).
  syncXray() {
    const cam = this.camera.position;
    const toCam = new THREE.Vector3();
    for (const m of this.meshes) {
      const h = this.hiValues.get(m.userData.id);
      const sel = this.selectedIds?.has(m.userData.id);
      const deep = m.userData.kind === 'muscle' && (m.userData.depth > this.level || (h && h.v >= 0.99) || (sel && !h));
      let want = (h || sel) && deep && m.visible && m.material.userData.u.uFade.value > 0.5;
      if (this.xrayOn === false && !sel) want = false;
      if (want) {
        want = m.userData.segs.some((s) => this.segOutward(m, s).dot(toCam.subVectors(cam, s.center).normalize()) > 0.2);
      }
      if (want && !m.userData.xray) {
        const x = new THREE.Mesh(m.geometry, makeXrayMaterial());
        x.renderOrder = 10;
        x.raycast = () => {};
        m.add(x);
        m.userData.xray = x;
      }
      if (m.userData.xray) {
        m.userData.xray.visible = !!want;
        if (want) {
          const c = h ? h.color : HI_PRIMARY;
          m.userData.xray.material.uniforms.uColor.value.set(c);
          m.userData.xray.material.uniforms.uAlpha.value = h ? 0.3 + 0.32 * h.v : 0.45;
        }
      }
    }
    this.xrayCam = cam.clone();
  }

  setSelected(unit) {
    this.selectedUnit = unit;
    this.setSelectedIds(unit ? (this.byUnit.get(unit) ?? []).map((m) => m.userData.id) : []);
  }

  // επιλογή με λίστα mesh (π.χ. ένας «μυς» της αξιολόγησης που αποτελείται από τμήματα πολλών μυών)
  setSelectedIds(ids) {
    this.selectedIds = new Set(ids);
    if (!this.selectedIds.size) this.selectedUnit = null;
    for (const m of this.meshes) this.animateUniform(m.material.userData.u.uSelected, this.selectedIds.has(m.userData.id) ? 1 : 0, 260);
    this.syncXray();
  }

  setHover(mesh) {
    const unit = mesh?.userData.unit ?? null;
    const id = mesh?.userData.id ?? null;
    if (id === this.hoverMesh) return;
    this.hoverMesh = id;
    // hoverGroup: προαιρετική συνάρτηση που ορίζει ποια mesh φωτίζονται μαζί (αλλιώς όλο το unit)
    const group = mesh && this.hoverGroup ? this.hoverGroup(mesh) : null;
    for (const m of this.meshes) {
      const on = group ? group.has(m.userData.id) : unit ? m.userData.unit === unit : m.userData.id === id;
      m.material.userData.u.uHover.value = on && mesh ? (m.userData.id === id ? 1 : 0.55) : 0;
    }
    this.hoverUnit = unit;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- κάμερα
  cancelAnim() { this.anim = null; }

  flyTo(target, position, dur = 900) {
    const c = this.controls;
    if (reduceMotion()) dur = 0;
    const t0 = c.target.clone(), p0 = this.camera.position.clone();
    // σφαιρική παρεμβολή γύρω από τον στόχο για ομαλή περιστροφή
    const off0 = p0.clone().sub(t0), off1 = position.clone().sub(target);
    const r0 = off0.length(), r1 = off1.length();
    const q = new THREE.Quaternion().setFromUnitVectors(off0.clone().normalize(), off1.clone().normalize());
    const qi = new THREE.Quaternion();
    this.anim = {
      start: performance.now(), dur,
      step: (k) => {
        const e = ease(k);
        c.target.lerpVectors(t0, target, e);
        qi.identity().slerp(q, e);
        const dir = off0.clone().normalize().applyQuaternion(qi);
        this.camera.position.copy(c.target).addScaledVector(dir, r0 + (r1 - r0) * e);
      },
    };
    this.dirty = true;
  }

  setView(name, instant = false) {
    const dir = VIEWS[name]?.clone().normalize() ?? VIEWS.three.clone().normalize();
    const aspect = this.camera.aspect || 1;
    const fitH = 1.95, fitW = 1.15;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(fitH / 2 / Math.tan(vfov / 2), fitW / 2 / (Math.tan(vfov / 2) * aspect)) * 1.04;
    const target = new THREE.Vector3(0, 0.89, 0.03);
    const pos = target.clone().addScaledVector(dir, dist);
    if (instant) {
      this.controls.target.copy(target);
      this.camera.position.copy(pos);
      this.controls.update();
      this.dirty = true;
    } else this.flyTo(target, pos, 950);
  }

  focusUnit(unit, sideHint) {
    const ms = (this.byUnit.get(unit) ?? []).filter((m) => m.visible || m.userData.depth >= 0);
    if (!ms.length) return;
    const camDir = this.camera.position.clone().sub(this.controls.target).normalize();
    // διαλέγουμε την πλευρά (αριστερή/δεξιά) που βλέπει καλύτερα η κάμερα, ή αυτή που πατήθηκε
    const bySide = { L: [], R: [], M: [] };
    for (const m of ms) for (const s of m.userData.segs) { s.out = this.segOutward(m, s); bySide[s.side].push(s); }
    let side = sideHint;
    if (!side || !bySide[side].length) {
      const score = (arr) => arr.reduce((a, s) => a + s.out.dot(camDir) * s.count, 0);
      side = bySide.L.length && bySide.R.length ? (score(bySide.L) >= score(bySide.R) ? 'L' : 'R') : bySide.L.length ? 'L' : bySide.R.length ? 'R' : 'M';
    }
    const segs = [...bySide[side], ...bySide.M];
    if (!segs.length) return;
    const center = new THREE.Vector3();
    const outward = new THREE.Vector3();
    let total = 0;
    for (const s of segs) { center.addScaledVector(s.center, s.count); outward.addScaledVector(s.out, s.count); total += s.count; }
    center.divideScalar(total);
    let radius = 0;
    for (const s of segs) radius = Math.max(radius, s.center.distanceTo(center) + s.radius);
    outward.normalize();
    // αν ο μυς ήδη φαίνεται από την τρέχουσα γωνία, κρατάμε περίπου την ίδια κατεύθυνση
    const dir = camDir.dot(outward) > 0.25 ? camDir.clone().lerp(outward, 0.35).normalize() : outward.clone().lerp(camDir, 0.15).normalize();
    dir.y = Math.max(-0.35, Math.min(0.55, dir.y));
    dir.normalize();
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = Math.max(radius * 1.25, 0.16);
    const dist = Math.min(3.2, Math.max(0.5, fit / Math.tan(vfov / 2) / Math.min(1, this.camera.aspect * 1.1)));
    this.flyTo(center, center.clone().addScaledVector(dir, dist), 1000);
  }

  meshesFor(ids) {
    const out = new Set();
    for (const id of ids) {
      if (id.includes('.')) { const m = this.byId.get(id); if (m) out.add(m); }
      else for (const m of this.byUnit.get(id) ?? []) out.add(m);
    }
    return [...out];
  }

  unitDepth(unit) {
    const ms = this.byUnit.get(unit) ?? [];
    return ms.length ? Math.min(...ms.map((m) => m.userData.depth)) : 0;
  }

  // Κάδρο ώστε να φαίνονται οι δοσμένοι μύες: διαλέγουμε την πλευρά από την οποία φαίνεται
  // η μεγαλύτερη επιφάνειά τους και το ύψος (πάνω/κάτω κορμός) όπου βρίσκονται.
  frameMeshes(meshes, { close = false } = {}) {
    if (!meshes.length) { this.setView('three'); return; }
    const segs = [];
    for (const m of meshes) for (const s of m.userData.segs) segs.push(s);
    // σκορ ανά κατεύθυνση = πόση επιφάνεια των μυών φαίνεται από εκεί
    const total8 = new Float32Array(VIS_DIRS.length);
    for (const m of meshes) {
      const own = m.userData.kind === 'muscle' ? m.userData.depth : 0;
      for (const s of m.userData.segs) {
        const sc = this.segVisibility(m, s, Math.min(2, Math.max(this.level, own)));
        sc.forEach((v, k) => { total8[k] += v * Math.max(0.03, s.radius); });
      }
    }
    let best = VIEWS.three.clone().normalize(), bestScore = 0;
    // οι λοξές γωνίες (3/4) δείχνουν καλύτερα τον όγκο: μικρό μπόνους
    VIS_DIRS.forEach((d, k) => {
      if (k === 8) return;
      const sc = total8[k] * (Math.abs(d.x) > 0.5 && Math.abs(d.x) < 0.9 ? 1.12 : 1);
      if (sc > bestScore) { bestScore = sc; best = d.clone(); }
    });
    let ymin = Infinity, ymax = -Infinity, cx = 0, cz = 0, total = 0, rmax = 0;
    for (const s of segs) {
      ymin = Math.min(ymin, s.center.y - s.radius * 0.8);
      ymax = Math.max(ymax, s.center.y + s.radius * 0.8);
      cx += s.center.x * s.count; cz += s.center.z * s.count; total += s.count;
      rmax = Math.max(rmax, s.radius);
    }
    const height = close ? Math.max((ymax - ymin) * 1.35, rmax * 2.6, 0.32) : Math.min(1.95, Math.max((ymax - ymin) * 1.75, 1.12));
    const cy = Math.min(1.75 - height / 2 + 0.05, Math.max(height / 2 - 0.02, (ymin + ymax) / 2));
    const target = close ? new THREE.Vector3(cx / total, cy, cz / total) : new THREE.Vector3(0, cy, 0.03);
    const dir = best.clone();
    dir.y = 0.1;
    dir.normalize();
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(height / 2 / Math.tan(vfov / 2), (height * 0.62) / 2 / (Math.tan(vfov / 2) * this.camera.aspect)) * 1.04;
    this.flyTo(target, target.clone().addScaledVector(dir, dist), 1000);
  }

  // ---------------------------------------------------------------- pointer
  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    let moveQueued = false;
    let lastEvent = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved < 6 && quick) {
        const hit = this.pick(e);
        this.handlers.onPick?.(hit);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      lastEvent = e;
      if (moveQueued) return;
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        if (down) return;
        const hit = this.pick(lastEvent);
        this.setHover(hit?.mesh ?? null);
        this.handlers.onHover?.(hit, lastEvent);
      });
    });
    el.addEventListener('pointerleave', () => { this.setHover(null); this.handlers.onHover?.(null); });
  }

  pick(e) {
    // σε στάση άσκησης οι θέσεις διαφέρουν από αυτές του BVH: χωρίς επιλογή με κλικ
    if (!this.meshes.length || this.posed) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates = this.meshes.filter((m) => m.visible && m.material.userData.u.uFade.value > 0.5);
    const hits = this.raycaster.intersectObjects(candidates, false);
    if (!hits.length) return null;
    const h = hits[0];
    const side = h.point.x > 0.004 ? 'L' : h.point.x < -0.004 ? 'R' : 'M';
    return { mesh: h.object, data: h.object.userData, point: h.point, side };
  }

  // ---------------------------------------------------------------- render
  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.anim) {
      const k = this.anim.dur ? Math.min(1, (now - this.anim.start) / this.anim.dur) : 1;
      this.anim.step(k);
      if (k >= 1) this.anim = null;
      this.dirty = true;
    }
    if (this.fades.length) {
      this.fades = this.fades.filter((f) => {
        const k = f.dur ? Math.min(1, (now - f.t0) / f.dur) : 1;
        f.tick(k);
        return k < 1;
      });
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    if (this.onFrame) this.onFrame(now);
    if (!this.dirty) return;
    if (this.hiValues.size || this.selectedIds?.size) {
      if (!this.xrayCam || this.xrayCam.distanceToSquared(this.camera.position) > 0.0025) this.syncXray();
    }
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  // Προβολή ενός σημείου στην οθόνη (για ετικέτες)
  project(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, behind: p.z > 1 };
  }
}

export const COLORS = { primary: HI_PRIMARY, secondary: HI_SECONDARY };
