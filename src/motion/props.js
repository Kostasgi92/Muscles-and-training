// Όργανα γυμναστηρίου για την κίνηση των ασκήσεων: μπάρες, αλτήρες, πάγκοι, τροχαλίες, μηχανήματα.
// Απλά σχήματα (κύλινδροι, στρογγυλεμένα κουτιά) με ουδέτερα υλικά, ώστε να μην ανταγωνίζονται τα
// χρώματα των μυών. Μονάδες: μέτρα, ίδιο σύστημα με το μοντέλο (y πάνω).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#c3c8cf', metalness: 0.85, roughness: 0.3 }),
  frame: new THREE.MeshStandardMaterial({ color: '#4b525c', metalness: 0.55, roughness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: '#202328', metalness: 0.15, roughness: 0.7 }),
  plate: new THREE.MeshStandardMaterial({ color: '#2a2e34', metalness: 0.25, roughness: 0.6 }),
  pad: new THREE.MeshStandardMaterial({ color: '#30353d', metalness: 0.0, roughness: 0.55 }),
  mat: new THREE.MeshStandardMaterial({ color: '#5b6470', metalness: 0.0, roughness: 0.92, transparent: true, opacity: 0.55, depthWrite: false }),
  band: new THREE.MeshStandardMaterial({ color: '#2f80d6', metalness: 0.0, roughness: 0.55 }),
  ball: new THREE.MeshStandardMaterial({ color: '#4d8fd6', metalness: 0.0, roughness: 0.4 }),
  wood: new THREE.MeshStandardMaterial({ color: '#7d6550', metalness: 0.0, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: '#c9ced5', metalness: 0.0, roughness: 0.95, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  cable: new THREE.MeshStandardMaterial({ color: '#16191d', metalness: 0.3, roughness: 0.6 }),
  grip: new THREE.MeshStandardMaterial({ color: '#8f969f', metalness: 0.7, roughness: 0.5 }),
};

// ------------------------------------------------------------------ βασικά σχήματα
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
const CYL_LO = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
const SPH = new THREE.SphereGeometry(1, 24, 16);
const _y = V(0, 1, 0);

// κύλινδρος από το a στο b
export function tube(a, b, r, mat = MAT.frame, lo = false) {
  const m = new THREE.Mesh(lo ? CYL_LO : CYL, mat);
  setTube(m, a, b, r);
  return m;
}
export function setTube(m, a, b, r) {
  const d = V().subVectors(b, a);
  const len = Math.max(1e-4, d.length());
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_y, d.multiplyScalar(1 / len));
  m.scale.set(r, len, r);
  return m;
}
// κύλινδρος κατά μήκος του x (π.χ. μπάρα, ρολό): ομάδα, ώστε η περιστροφή της να μένει ελεύθερη
export function rod(len, r, mat = MAT.steel) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(CYL, mat);
  m.rotation.z = Math.PI / 2;
  m.scale.set(r, len, r);
  g.add(m);
  return g;
}
// στρογγυλεμένο κουτί με κέντρο c
export function box(w, h, d, c = V(), mat = MAT.pad, rad = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2, h / 2, d / 2)), mat);
  m.position.copy(c);
  return m;
}
export function ball(r, c = V(), mat = MAT.ball) {
  const m = new THREE.Mesh(SPH, mat);
  m.scale.setScalar(r);
  m.position.copy(c);
  return m;
}
function disc(r, w, mat, x = 0) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(CYL, mat);
  outer.rotation.z = Math.PI / 2;
  outer.scale.set(r, w, r);
  const hub = new THREE.Mesh(CYL, MAT.steel);
  hub.rotation.z = Math.PI / 2;
  hub.scale.set(r * 0.22, w * 1.08, r * 0.22);
  g.add(outer, hub);
  g.position.x = x;
  return g;
}

// ------------------------------------------------------------------ ελεύθερα βάρη
// Μπάρα κατά μήκος του τοπικού x, κέντρο στη μέση. plates: ακτίνες δίσκων ανά πλευρά.
export function barbell({ len = 2.05, plates = [0.225], sleeve = 0.43, r = 0.0135, oneSided = false } = {}) {
  const g = new THREE.Group();
  const shaft = len - 2 * sleeve;
  g.add(rod(shaft, r, MAT.steel));
  for (const s of oneSided ? [1] : [-1, 1]) {
    const sl = rod(sleeve, 0.025, MAT.steel);
    sl.position.x = s * (shaft / 2 + sleeve / 2);
    g.add(sl);
    const col = rod(0.02, 0.04, MAT.steel);
    col.position.x = s * (shaft / 2 + 0.01);
    g.add(col);
    let x = shaft / 2 + 0.03;
    for (const pr of plates) {
      const w = pr > 0.2 ? 0.055 : pr > 0.14 ? 0.035 : 0.025;
      g.add(disc(pr, w, MAT.plate, s * (x + w / 2)));
      x += w + 0.004;
    }
  }
  return g;
}
// Αλτήρας: λαβή κατά μήκος του τοπικού x, κέντρο στη λαβή.
export function dumbbell({ r = 0.06, handle = 0.13, w = 0.055 } = {}) {
  const g = new THREE.Group();
  g.add(rod(handle + 0.02, 0.016, MAT.grip));
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 6, 1), MAT.black);
    head.rotation.z = Math.PI / 2;
    head.position.x = s * (handle / 2 + w / 2);
    g.add(head);
  }
  return g;
}
// Kettlebell: κέντρο στη λαβή, το σώμα του προς τα −y.
export function kettlebell({ r = 0.1 } = {}) {
  const g = new THREE.Group();
  g.add(ball(r, V(0, -0.135, 0), MAT.black));
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 10, 24, Math.PI), MAT.black);
  h.position.y = -0.06;
  g.add(h);
  return g;
}
// Δίσκος βαρών στο επίπεδο yz (άξονας x)
export function plate(r = 0.2) { return disc(r, 0.04, MAT.plate); }

// ------------------------------------------------------------------ πάγκοι, στηρίγματα
// Πάγκος: μαξιλάρι κατά μήκος z. seat: κάθισμα (z από z0 έως zs), back: πλάτη με κλίση (μοίρες,
// 0 = οριζόντια) από το zs έως το z1. Η πλάτη ανεβαίνει προς τα −z.
export function bench({ h = 0.44, z0 = 0.35, z1 = -0.85, w = 0.29, incline = 0, seatLen = 0.38, decline = 0, legs = true } = {}) {
  const g = new THREE.Group();
  const t = 0.07;
  if (!incline && !decline) {
    const len = z0 - z1;
    g.add(box(w, t, len, V(0, h - t / 2, (z0 + z1) / 2)));
  } else if (incline) {
    // κάθισμα οριζόντιο, πλάτη υπό γωνία από το τέλος του καθίσματος
    const zs = z0 - seatLen;
    g.add(box(w, t, seatLen, V(0, h - t / 2, (z0 + zs) / 2)));
    const bl = 0.86, a = incline * Math.PI / 180;
    const back = box(w, t, bl, V(), MAT.pad);
    back.position.set(0, h - t / 2 + Math.sin(a) * bl / 2 + 0.02, zs - Math.cos(a) * bl / 2);
    back.rotation.x = a;
    g.add(back);
    g.userData.back = { a, zs, h };
    g.add(tube(V(0, 0.05, zs - 0.15), V(0, h - 0.04 + Math.sin(a) * 0.35, zs - Math.cos(a) * 0.35), 0.022));
  } else {
    // κατηφορικός: το κεφάλι χαμηλά στο −z
    const len = z0 - z1, a = decline * Math.PI / 180;
    const p = box(w, t, len, V(0, h - t / 2, (z0 + z1) / 2));
    p.rotation.x = a;
    g.add(p);
  }
  if (legs) {
    for (const z of [z0 - 0.08, z1 + 0.1]) {
      const zz = Math.min(z0, Math.max(z1, z));
      const hh = decline ? h + Math.sin(decline * Math.PI / 180) * (zz - (z0 + z1) / 2) : h;
      g.add(tube(V(0, 0.03, zz), V(0, hh - t, zz), 0.024));
      g.add(tube(V(-w * 0.62, 0.025, zz), V(w * 0.62, 0.025, zz), 0.02));
    }
    g.add(tube(V(0, 0.07, z0 - 0.08), V(0, 0.07, z1 + 0.1), 0.02));
  }
  return g;
}
// Στρώμα γυμναστικής
export function floorMat({ len = 1.9, w = 0.62, z = 0, x = 0, rotY = 0 } = {}) {
  const m = box(w, 0.012, len, V(x, 0.006, z), MAT.mat, 0.005);
  m.rotation.y = rotY;
  m.renderOrder = -1;
  return m;
}
// Μονόζυγο κατά μήκος x στο ύψος y, στη θέση z
export function pullupBar({ y = 2.25, z = 0, w = 1.4 } = {}) {
  const g = new THREE.Group();
  const bar = rod(w, 0.016, MAT.steel);
  bar.position.set(0, y, z);
  g.add(bar);
  for (const s of [-1, 1]) {
    g.add(tube(V(s * w / 2, 0, z), V(s * w / 2, y + 0.06, z), 0.03));
    g.add(tube(V(s * w / 2, 0.015, z - 0.35), V(s * w / 2, 0.015, z + 0.35), 0.025));
  }
  return g;
}
// Δίζυγο: δύο παράλληλες μπάρες κατά μήκος z, στο ύψος y, απόσταση sep
export function dipBars({ y = 1.2, sep = 0.56, z = 0, len = 0.6 } = {}) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(tube(V(s * sep / 2, y, z - len / 2), V(s * sep / 2, y, z + len / 2), 0.02, MAT.steel));
    for (const zz of [z - len / 2 + 0.04, z + len / 2 - 0.04]) g.add(tube(V(s * (sep / 2 + 0.03), 0, zz), V(s * sep / 2, y, zz), 0.024));
  }
  return g;
}
// Κουτί/σκαλί
export function step({ w = 0.5, h = 0.4, d = 0.42, c = V() } = {}) {
  return box(w, h, d, V(c.x, h / 2, c.z), MAT.wood, 0.015);
}
export function wall({ z = -0.3, w = 1.6, h = 2.0 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.wall);
  m.position.set(0, h / 2, z);
  return m;
}

// ------------------------------------------------------------------ τροχαλίες, λάστιχα
// Πύργος τροχαλίας: κολόνα στο (x, z), τροχαλία στο ύψος y. Επιστρέφει { obj, pulley (σημείο), set(a, b) }.
export function cableTower({ x = 0, z = -0.6, y = 1.9, face = V(0, 0, 1) } = {}) {
  const g = new THREE.Group();
  g.add(box(0.16, 2.1, 0.16, V(x, 1.05, z), MAT.frame, 0.01));
  const pulley = V(x, y, z).addScaledVector(face, 0.12);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), MAT.steel);
  wheel.position.copy(pulley);
  wheel.lookAt(pulley.clone().add(V(face.z, 0, -face.x)));
  g.add(wheel);
  g.add(tube(V(x, y, z), pulley, 0.012, MAT.frame));
  return { obj: g, pulley };
}
// Δυναμική γραμμή (συρματόσχοινο ή λάστιχο) ανάμεσα σε δύο σημεία
export function line(r = 0.004, mat = MAT.cable) {
  const m = new THREE.Mesh(CYL_LO, mat);
  m.userData.r = r;
  m.frustumCulled = false;
  return m;
}
export function setLine(m, a, b) { return setTube(m, a, b, m.userData.r); }

// Λαβή τροχαλίας (D) κατά μήκος x
export function handle() {
  const g = new THREE.Group();
  g.add(rod(0.13, 0.016, MAT.black));
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 16, Math.PI), MAT.steel);
  arc.rotation.x = Math.PI / 2;
  arc.rotation.z = Math.PI;
  g.add(arc);
  return g;
}
// Σχοινί τροχαλίας: δύο άκρα (σημεία) που ενώνονται στον κρίκο
export function rope() {
  const g = new THREE.Group();
  const a = line(0.013, MAT.black), b = line(0.013, MAT.black);
  const ring = ball(0.025, V(), MAT.steel);
  g.add(a, b, ring);
  g.userData.set = (hook, l, r) => { ring.position.copy(hook); setLine(a, hook, l); setLine(b, hook, r); };
  return g;
}

// ------------------------------------------------------------------ μηχανήματα (απλοποιημένα)
// Κάθισμα με πλάτη: κάθισμα στο ύψος h, πλάτη πίσω από το z = zb με κλίση back (μοίρες από την κατακόρυφο)
export function seat({ h = 0.46, z = 0.1, zb = -0.12, back = 8, backH = 0.62, w = 0.36, depth = 0.4, base = true } = {}) {
  const g = new THREE.Group();
  g.add(box(w, 0.08, depth, V(0, h - 0.04, z)));
  if (back !== null) {
    const a = back * Math.PI / 180;
    const bp = box(w, backH, 0.08, V(0, h + backH / 2 + 0.03, zb - 0.05));
    bp.position.z -= Math.sin(a) * backH / 2;
    bp.position.y = h + Math.cos(a) * backH / 2 + 0.03;
    bp.rotation.x = -a;
    g.add(bp);
  }
  if (base) {
    g.add(tube(V(0, 0.02, z), V(0, h - 0.08, z), 0.035));
    g.add(box(0.5, 0.04, 0.6, V(0, 0.02, z - 0.05), MAT.frame, 0.01));
  }
  return g;
}
// Ρολό με αφρώδες κάλυμμα κατά μήκος x
export function roller(len = 0.3, r = 0.055) {
  const g = new THREE.Group();
  g.add(rod(len, r, MAT.pad));
  g.add(rod(len + 0.06, 0.012, MAT.steel));
  return g;
}
// Μοχλός μηχανήματος: περιστρέφεται γύρω από τον άξονα x που περνά από το pivot.
// Το παιδί του στερεώνεται σε απόσταση len κατά μήκος της κατεύθυνσης του μοχλού (τοπικό −y).
export function lever({ pivot = V(), len = 0.45, side = 0.24, pad = null } = {}) {
  const g = new THREE.Group();
  g.position.copy(pivot);
  const arm = new THREE.Group();
  g.add(arm);
  arm.add(tube(V(side, 0, 0), V(side, -len, 0), 0.02));
  arm.add(tube(V(side, 0, 0), V(side + 0.05, 0, 0), 0.04, MAT.frame));
  if (pad) { pad.position.y = -len; arm.add(pad); }
  g.userData.setAngle = (rad) => { arm.rotation.x = rad; };
  return g;
}
// Ροδάκι κοιλιακών: τροχός στο επίπεδο yz με λαβές κατά x
export function abWheel() {
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 28), MAT.black);
  w.rotation.z = Math.PI / 2;
  g.add(w);
  g.add(rod(0.36, 0.014, MAT.steel));
  for (const s of [-1, 1]) { const h = rod(0.1, 0.018, MAT.pad); h.position.x = s * 0.13; g.add(h); }
  return g;
}
// Σφιγκτήρας χεριού: δύο λαβές που ανοίγουν/κλείνουν
export function gripper() {
  const g = new THREE.Group();
  const a = new THREE.Group(), b = new THREE.Group();
  a.add(tube(V(0, 0, 0), V(0, -0.1, 0), 0.011, MAT.black));
  b.add(tube(V(0, 0, 0), V(0, -0.1, 0), 0.011, MAT.black));
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 14), MAT.steel);
  spring.rotation.y = Math.PI / 2;
  g.add(a, b, spring);
  g.userData.set = (open) => { a.rotation.x = open; b.rotation.x = -open; };
  return g;
}

// συλλογή οργάνων μιας άσκησης: προσθέτει/αφαιρεί από τη σκηνή
export class PropSet {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    this.items = {};
  }
  add(name, obj) { this.items[name] = obj; this.group.add(obj); return obj; }
  get(name) { return this.items[name]; }
  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => { if (o.geometry && o.geometry !== CYL && o.geometry !== CYL_LO && o.geometry !== SPH) o.geometry.dispose(); });
    }
    this.items = {};
  }
  dispose() { this.clear(); this.group.parent?.remove(this.group); }
}
