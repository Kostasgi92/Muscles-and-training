// Σκελετός κίνησης (rig) για το ανατομικό μοντέλο: κέντρα αρθρώσεων από τα οστά και βάρη δέρματος
// (skin weights) για κάθε κορυφή, ώστε το μοντέλο να μπορεί να εκτελεί ασκήσεις.
//
//   node tools/build-rig.mjs        → public/rig.bin
//
// Κανόνες βαρών:
//  • Οστά: άκαμπτα, κάθε κομμάτι (συνεκτική συνιστώσα) ανήκει σε ένα κόκαλο του σκελετού.
//  • Μύες/συνδετικός ιστός: ακολουθούν τα πλησιέστερα οστά ανάμεσα σε όσα πράγματι γεφυρώνουν
//    (π.χ. ο δικέφαλος: ωμική ζώνη, βραχιόνιο, αντιβράχιο) — έτσι ένα χέρι δίπλα στον μηρό δεν
//    «τραβάει» μυς του μηρού. Βάρος = exp(-(d - dmin)/σ).
//  • Κορμός: το μέρος που ακολουθεί τη σπονδυλική στήλη μοιράζεται ανάλογα με το ύψος (φέτες).
//  • Εξομάλυνση πάνω στο πλέγμα, έως 4 επιρροές ανά κορυφή, κβάντιση σε bytes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { parseAnatomy } from '../src/anatomy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bytes = new Uint8Array(fs.readFileSync(path.join(root, 'public/anatomy.bin')));
if (bytes[0] === 0x1f) bytes = new Uint8Array(zlib.gunzipSync(bytes));
const { meshes } = parseAnatomy(bytes);
const byId = Object.fromEntries(meshes.map((m) => [m.id, m]));

// ------------------------------------------------------------------ βοηθητικά
const P = (m, i) => [m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]];
const avg = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const mirror = (p) => [-p[0], p[1], p[2]];
const r4 = (p) => p.map((v) => +v.toFixed(4));

function components(m) {
  const n = m.nv, parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < m.index.length; i += 3) { const a = find(m.index[i]); parent[find(m.index[i + 1])] = a; parent[find(m.index[i + 2])] = a; }
  const g = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(i); }
  const vset = [...g.values()];
  const owner = new Int32Array(n);
  vset.forEach((ix, k) => ix.forEach((i) => { owner[i] = k; }));
  const tris = vset.map(() => []);
  for (let t = 0; t < m.index.length; t += 3) tris[owner[m.index[t]]].push(m.index[t], m.index[t + 1], m.index[t + 2]);
  return vset.map((ix, k) => {
    const pts = ix.map((i) => P(m, i));
    return { ix, tris: tris[k], pts, c: avg(pts), mn: [0, 1, 2].map((d) => Math.min(...pts.map((p) => p[d]))), mx: [0, 1, 2].map((d) => Math.max(...pts.map((p) => p[d]))) };
  });
}
const COMPS = {};
const comps = (id) => (COMPS[id] ??= components(byId[id]));
const left = (cs) => cs.filter((c) => c.c[0] > 0);

// σφαίρα ελαχίστων τετραγώνων: |p|² = 2c·p + (r² − |c|²)
function sphere(pts) {
  const M = Array.from({ length: 4 }, () => new Array(5).fill(0));
  for (const p of pts) {
    const a = [2 * p[0], 2 * p[1], 2 * p[2], 1], b = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
    for (let r = 0; r < 4; r++) { M[r][4] += a[r] * b; for (let c = 0; c < 4; c++) M[r][c] += a[r] * a[c]; }
  }
  for (let i = 0; i < 4; i++) {
    let p = i;
    for (let r = i + 1; r < 4; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 4; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 5; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.slice(0, 3).map((row, i) => row[4] / row[i]);
}
const lowest = (pts) => pts.reduce((a, p) => (p[1] < a[1] ? p : a));
const highest = (pts) => pts.reduce((a, p) => (p[1] > a[1] ? p : a));

// ------------------------------------------------------------------ κέντρα αρθρώσεων (αριστερή πλευρά, +x)
const femur = left(comps('femur'))[0];
const hipC = sphere(femur.pts.filter((p) => p[1] > 0.835 && p[0] < 0.095));
const kneeC = sphere(femur.pts.filter((p) => p[1] < femur.mn[1] + 0.045 && p[2] < 0.03));
const tib = left(comps('tibia'))[0], fib = left(comps('fibula'))[0];
const ankleC = (() => { const m = mid(lowest(tib.pts), lowest(fib.pts)); return [m[0], m[1] + 0.004, m[2] + 0.002]; })();
const footCs = left(comps('foot_bones'));
const isToe = (c) => c.c[2] > 0.128 || (c.c[0] > 0.13 && c.c[2] > 0.118);
const metatarsals = footCs.filter((c) => !isToe(c) && c.mx[2] > 0.105 && c.mx[2] - c.mn[2] > 0.035);
const mtpHeads = metatarsals.map((c) => c.pts.reduce((a, p) => (p[2] > a[2] ? p : a)));
const mtpC = (() => { const a = avg(mtpHeads); return [a[0], Math.max(0.018, a[1] - 0.004), a[2] - 0.006]; })();
const bigToeHead = mtpHeads.reduce((a, p) => (p[0] < a[0] ? p : a)), smallToeHead = mtpHeads.reduce((a, p) => (p[0] > a[0] ? p : a));
const hum = left(comps('humerus'))[0];
const shoulderC = sphere(hum.pts.filter((p) => p[1] > 1.355 && p[0] < 0.185));
const elbowC = (() => { const d = hum.pts.filter((p) => p[1] < hum.mn[1] + 0.022); const a = avg(d); return [a[0], hum.mn[1] + 0.013, a[2]]; })();
const rad = left(comps('radius'))[0], uln = left(comps('ulna'))[0];
const wristC = (() => { const r = avg(rad.pts.filter((p) => p[1] < rad.mn[1] + 0.012)), u = avg(uln.pts.filter((p) => p[1] < uln.mn[1] + 0.012)); const m = mid(r, u); return [m[0], m[1] - 0.006, m[2]]; })();
const handCs = left(comps('hand_bones'));
const isThumb = (c) => c.c[0] > 0.295 && c.c[1] > 0.775;
const handClass = (c) => (isThumb(c) ? 'thumb' : c.c[1] > 0.79 ? 'hand' : c.c[1] > 0.745 ? 'fingers' : 'tips');
const metacarpals = handCs.filter((c) => handClass(c) === 'hand' && c.mx[1] - c.mn[1] > 0.045);
const mcpHeads = metacarpals.map((c) => lowest(c.pts));
const mcpC = (() => { const a = avg(mcpHeads); return [a[0], a[1] + 0.004, a[2] + 0.004]; })();
const proxPh = handCs.filter((c) => handClass(c) === 'fingers');
const pipC = (() => { const a = avg(proxPh.map((c) => lowest(c.pts))); return [a[0], a[1] + 0.003, a[2] + 0.003]; })();
const thumbMeta = handCs.filter(isThumb).reduce((a, c) => (c.c[1] > a.c[1] ? c : a));
const cmcC = (() => { const h = highest(thumbMeta.pts); return [h[0], h[1] - 0.004, h[2]]; })();
const clav = left(comps('clavicle'))[0];
const scC = (() => { const m = clav.pts.reduce((a, p) => (p[0] < a[0] ? p : a)); return [m[0] + 0.006, m[1], m[2] - 0.004]; })();
// σπόνδυλοι: κέντρο του σώματος (πρόσθιο μισό) κάθε σπονδύλου
const bodyOf = (c) => { const zm = (c.mn[2] + c.mx[2]) / 2; return avg(c.pts.filter((p) => p[2] > zm)); };
const lumb = comps('lumbar').slice().sort((a, b) => a.c[1] - b.c[1]);      // L5 … L1
const thor = comps('thoracic').slice().sort((a, b) => a.c[1] - b.c[1]);    // T12 … T1
const cerv = comps('cervical').slice().sort((a, b) => a.c[1] - b.c[1]);    // C7 … C1
const disc = (a, b) => { const p = mid(bodyOf(a), bodyOf(b)); return [0, p[1], p[2]]; };
const spine1C = (() => { const b = bodyOf(lumb[0]); return [0, lumb[0].mn[1] + 0.004, b[2]]; })();   // L5/S1
const spine2C = disc(lumb[2], lumb[3]);                                                          // L3/L2
const chestC = disc(lumb[4], thor[0]);                                                           // L1/T12
const neckC = disc(thor[11], cerv[0]);                                                           // T1/C7
const headC = (() => { const b = bodyOf(cerv[6]); return [0, cerv[6].mx[1] + 0.002, b[2]]; })();     // C1/κρανίο
const pelvisC = [0, hipC[1], hipC[2]];

// ------------------------------------------------------------------ ο σκελετός
// Κάθε κόκαλο: γονέας, κέντρο περιστροφής (στη θέση ηρεμίας). Η πλευρά L είναι +x, η R καθρέφτης.
const B = [];
const bone = (name, parent, pivot) => { B.push({ name, parent: parent === null ? -1 : B.findIndex((b) => b.name === parent), pivot: r4(pivot) }); };
bone('pelvis', null, pelvisC);
bone('spine1', 'pelvis', spine1C);
bone('spine2', 'spine1', spine2C);
bone('chest', 'spine2', chestC);
bone('neck', 'chest', neckC);
bone('head', 'neck', headC);
for (const [s, f] of [['L', (p) => p], ['R', mirror]]) {
  bone('girdle_' + s, 'chest', f(scC));
  bone('upperarm_' + s, 'girdle_' + s, f(shoulderC));
  bone('forearm_' + s, 'upperarm_' + s, f(elbowC));
  bone('twist_' + s, 'forearm_' + s, f(elbowC));
  bone('hand_' + s, 'twist_' + s, f(wristC));
  bone('fingers_' + s, 'hand_' + s, f(mcpC));
  bone('tips_' + s, 'fingers_' + s, f(pipC));
  bone('thumb_' + s, 'hand_' + s, f(cmcC));
  bone('thigh_' + s, 'pelvis', f(hipC));
  bone('shank_' + s, 'thigh_' + s, f(kneeC));
  bone('foot_' + s, 'shank_' + s, f(ankleC));
  bone('toes_' + s, 'foot_' + s, f(mtpC));
}
const BI = Object.fromEntries(B.map((b, i) => [b.name, i]));
// άξονες που χρειάζεται η κίνηση: δάχτυλα ποδιού (γραμμή μεταταρσοφαλαγγικών), δάχτυλα χεριού (κεφαλές μετακαρπίων)
const AXES = {
  toes: r4((() => { const d = [smallToeHead[0] - bigToeHead[0], 0, smallToeHead[2] - bigToeHead[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); })()),
  fingers: r4((() => { const a = mcpHeads.reduce((x, p) => (p[0] > x[0] ? p : x)), b = mcpHeads.reduce((x, p) => (p[0] < x[0] ? p : x)); const d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); })()),
};

// ------------------------------------------------------------------ άκαμπτα οστά: κομμάτι → κόκαλο
const sideOf = (x) => (x >= 0 ? 'L' : 'R');
const RIGID = {
  skull: () => 'head', mandible: () => 'head', teeth: () => 'head', nose_cart: () => 'head', sclera: () => 'head', iris: () => 'head',
  larynx: () => 'neck',
  cervical: () => 'neck',
  thoracic: () => 'chest', ribs: () => 'chest', costal_cart: () => 'chest', sternum: () => 'chest',
  lumbar: (c) => (c.c[1] < spine2C[1] ? 'spine1' : 'spine2'),
  sacrum: () => 'pelvis', pelvis: () => 'pelvis',
  clavicle: (c) => 'girdle_' + sideOf(c.c[0]), scapula: (c) => 'girdle_' + sideOf(c.c[0]),
  humerus: (c) => 'upperarm_' + sideOf(c.c[0]),
  ulna: (c) => 'forearm_' + sideOf(c.c[0]),
  radius: (c) => 'twist_' + sideOf(c.c[0]),
  hand_bones: (c) => handClass({ ...c, c: [Math.abs(c.c[0]), c.c[1], c.c[2]] }) + '_' + sideOf(c.c[0]),
  femur: (c) => 'thigh_' + sideOf(c.c[0]),
  patella: (c) => ['thigh_' + sideOf(c.c[0]), 'shank_' + sideOf(c.c[0])],
  tibia: (c) => 'shank_' + sideOf(c.c[0]), fibula: (c) => 'shank_' + sideOf(c.c[0]),
  foot_bones: (c) => (isToe({ c: [Math.abs(c.c[0]), c.c[1], c.c[2]] }) ? 'toes_' : 'foot_') + sideOf(c.c[0]),
};

// ------------------------------------------------------------------ στόχοι απόστασης (BVH ανά κόκαλο)
// Για κάθε κόκαλο του σκελετού, τα τρίγωνα των οστών του. Η επιγονατίδα είναι κοινός στόχος μηρού/κνήμης.
const targetTris = new Map();
const addTris = (name, m, c) => {
  if (!targetTris.has(name)) targetTris.set(name, { pos: [], idx: [] });
  const t = targetTris.get(name), base = t.pos.length / 3, map = new Map();
  for (const i of c.ix) { map.set(i, base + map.size); t.pos.push(...P(m, i)); }
  for (const i of c.tris) t.idx.push(map.get(i));
};
for (const [id, f] of Object.entries(RIGID)) {
  if (!byId[id]) continue;
  for (const c of comps(id)) {
    const owner = f(c);
    if (id === 'patella') addTris('patella_' + sideOf(c.c[0]), byId[id], c);
    else addTris(owner, byId[id], c);
  }
}
const BVHS = new Map();
for (const [name, t] of targetTris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
  g.setIndex(t.idx);
  BVHS.set(name, new MeshBVH(g));
}
const TARGET_BONES = (name) => (name.startsWith('patella_') ? [['thigh_' + name.slice(-1), 0.5], ['shank_' + name.slice(-1), 0.5]] : [[name, 1]]);

// ------------------------------------------------------------------ ποια οστά γεφυρώνει κάθε μυς
// a: αξονικά (κορμός/κεφάλι), s: ανά πλευρά. height: το αξονικό μερίδιο μοιράζεται με το ύψος.
const AX = ['pelvis', 'spine1', 'spine2', 'chest', 'neck', 'head'];
const C = (a, s, height = false) => ({ a, s, height });
const TRUNK = ['pelvis', 'spine1', 'spine2', 'chest'];
const CANDS = {
  chest: C(['chest'], ['girdle', 'upperarm']), pec_minor: C(['chest'], ['girdle']), serratus: C(['chest'], ['girdle']), intercostals: C(['chest'], []),
  deltoid: C([], ['girdle', 'upperarm']), rotator_cuff: C([], ['girdle', 'upperarm']), teres_major: C([], ['girdle', 'upperarm']),
  trapezius: C(['chest', 'neck', 'head'], ['girdle'], true), lats: C(TRUNK, ['girdle', 'upperarm'], true), rhomboids: C(['chest', 'neck'], ['girdle'], true), levator_scap: C(['neck', 'head'], ['girdle'], true),
  erectors: C(AX, [], true), multifidus: C(AX, [], true), quadratus_lumb: C(TRUNK, [], true),
  scm: C(['chest', 'neck', 'head'], ['girdle'], true), splenius: C(['chest', 'neck', 'head'], [], true), scalenes: C(['chest', 'neck'], [], true), hyoid: C(['neck', 'head', 'chest'], ['girdle']),
  jaw: C(['head'], []), face: C(['head'], []),
  biceps: C([], ['girdle', 'upperarm', 'forearm', 'twist']), brachialis: C([], ['upperarm', 'forearm']), coracobrachialis: C([], ['girdle', 'upperarm']), triceps: C([], ['girdle', 'upperarm', 'forearm']),
  brachioradialis: C([], ['upperarm', 'forearm', 'twist']), forearm_flex: C([], ['upperarm', 'forearm', 'twist', 'hand', 'fingers', 'tips', 'thumb']), forearm_ext: C([], ['upperarm', 'forearm', 'twist', 'hand', 'fingers', 'tips', 'thumb']),
  hand: C([], ['hand', 'fingers', 'tips', 'thumb']),
  rectus_abd: C(TRUNK, [], true), ext_oblique: C(TRUNK, [], true), int_oblique: C(TRUNK, [], true), transversus: C(TRUNK, [], true),
  iliopsoas: C(['pelvis', 'spine1', 'spine2', 'chest'], ['thigh'], true),
  glute_max: C(['pelvis', 'spine1'], ['thigh'], true), glute_med: C(['pelvis'], ['thigh']), glute_min: C(['pelvis'], ['thigh']), tfl: C(['pelvis'], ['thigh', 'shank', 'patella']), hip_rotators: C(['pelvis'], ['thigh']),
  quads: C(['pelvis'], ['thigh', 'shank', 'patella']), sartorius: C(['pelvis'], ['thigh', 'shank']), adductors: C(['pelvis'], ['thigh', 'shank']), hamstrings: C(['pelvis'], ['thigh', 'shank']),
  calves: C([], ['thigh', 'shank', 'foot']), tib_ant: C([], ['shank', 'foot', 'toes']), fibularis: C([], ['shank', 'foot']), deep_calf: C([], ['thigh', 'shank', 'foot', 'toes']), foot: C([], ['foot', 'toes']),
  // συνδετικός ιστός (id)
  linea_alba: C(TRUNK, [], true), inguinal: C(['pelvis'], ['thigh']), tlf: C(TRUNK, [], true), patellar_ret: C([], ['thigh', 'shank', 'patella']),
  wrist_ret: C([], ['forearm', 'twist', 'hand']), ankle_ret: C([], ['shank', 'foot']), palmar_apo: C([], ['hand', 'fingers', 'thumb']), plantar_apo: C([], ['foot', 'toes']),
};

// μοίρασμα του αξονικού βάρους σε φέτες: όρια στα κέντρα περιστροφής της σπονδυλικής στήλης
const CUTS = [spine1C[1], spine2C[1], chestC[1], neckC[1], headC[1]];
const W_CUT = 0.022;
function slices(y) {
  const up = CUTS.map((c) => { const t = Math.min(1, Math.max(0, (y - (c - W_CUT)) / (2 * W_CUT))); return t * t * (3 - 2 * t); });
  const w = [1 - up[0]];
  for (let i = 0; i < 4; i++) w.push(up[i] - up[i + 1]);
  w.push(up[4]);
  return w;   // pelvis, spine1, spine2, chest, neck, head
}

// ------------------------------------------------------------------ βάρη
const SIGMA = 0.010;
const tmp = new THREE.Vector3(), hit = { point: new THREE.Vector3(), distance: 0 };
const out = [];
let stats = { muscleV: 0, rigidV: 0 };
for (const m of meshes) {
  const n = m.nv;
  const W = Array.from({ length: n }, () => new Map());   // bone index → weight
  const rigidFn = RIGID[m.id];
  if (rigidFn) {
    for (const c of comps(m.id)) {
      const owner = rigidFn(c);
      const list = Array.isArray(owner) ? owner.map((o) => [o, 1 / owner.length]) : [[owner, 1]];
      for (const i of c.ix) for (const [o, w] of list) W[i].set(BI[o], w);
    }
    stats.rigidV += n;
  } else {
    const spec = CANDS[m.unit] ?? CANDS[m.id];
    if (!spec) throw new Error('χωρίς υποψήφια οστά: ' + m.id);
    for (let i = 0; i < n; i++) {
      const p = P(m, i);
      const side = p[0] > 0.0005 ? 'L' : p[0] < -0.0005 ? 'R' : null;
      const targets = [...spec.a, ...(side ? spec.s.map((s) => s + '_' + side) : [])];
      const d = targets.map((t) => { BVHS.get(t).closestPointToPoint(tmp.set(...p), hit); return hit.distance; });
      const dmin = Math.min(...d);
      const raw = new Map();
      targets.forEach((t, k) => {
        const w = Math.exp(-(d[k] - dmin) / SIGMA);
        if (w < 0.01) return;
        for (const [b, f] of TARGET_BONES(t)) raw.set(BI[b], (raw.get(BI[b]) ?? 0) + w * f);
      });
      if (spec.height) {
        // το αξονικό μερίδιο σε φέτες καθ' ύψος, μόνο στα αξονικά οστά που επιτρέπονται για τον μυ
        let A = 0;
        for (const a of AX) if (raw.has(BI[a])) { A += raw.get(BI[a]); raw.delete(BI[a]); }
        if (A > 0) {
          const sl = slices(p[1]);
          const allowed = AX.map((a, k) => (spec.a.includes(a) ? sl[k] : 0));
          let s = allowed.reduce((x, y) => x + y, 0);
          if (s < 1e-6) {
            // καμία επιτρεπτή φέτα σε αυτό το ύψος: όλο στο πλησιέστερο επιτρεπτό αξονικό κόκαλο
            const gap = (k) => { const lo = k ? CUTS[k - 1] : -Infinity, hi = k < 5 ? CUTS[k] : Infinity; return p[1] < lo ? lo - p[1] : p[1] > hi ? p[1] - hi : 0; };
            const k = spec.a.map((a) => AX.indexOf(a)).reduce((best, k2) => (gap(k2) < gap(best) ? k2 : best));
            allowed[k] = 1; s = 1;
          }
          allowed.forEach((v, k) => { if (v > 0) raw.set(BI[AX[k]], (raw.get(BI[AX[k]]) ?? 0) + (A * v) / s); });
        }
      }
      W[i] = raw;
    }
    // εξομάλυνση πάνω στο πλέγμα: το βάρος κάθε κορυφής πλησιάζει τον μέσο όρο των γειτόνων της
    const nb = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < m.index.length; t += 3) {
      const a = m.index[t], b = m.index[t + 1], c = m.index[t + 2];
      nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    for (let it = 0; it < 3; it++) {
      const next = W.map((w, i) => {
        const acc = new Map();
        const norm = (mp) => { let s = 0; for (const v of mp.values()) s += v; return s || 1; };
        const si = norm(w);
        for (const [b, v] of w) acc.set(b, (acc.get(b) ?? 0) + 0.5 * v / si);
        const k = nb[i].size;
        for (const j of nb[i]) { const sj = norm(W[j]); for (const [b, v] of W[j]) acc.set(b, (acc.get(b) ?? 0) + (0.5 * v) / sj / k); }
        return acc;
      });
      for (let i = 0; i < n; i++) W[i] = next[i];
    }
    stats.muscleV += n;
  }
  // έως 4 επιρροές, άθροισμα 255
  const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const top = [...W[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).filter(([, v]) => v > 0.004);
    const s = top.reduce((x, [, v]) => x + v, 0) || 1;
    let q = top.map(([b, v]) => [b, Math.round((v / s) * 255)]);
    const diff = 255 - q.reduce((x, [, v]) => x + v, 0);
    if (q.length) q[0][1] += diff; else q = [[0, 255]];
    q.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v; });
  }
  out.push({ id: m.id, nv: n, si, sw });
}

// ------------------------------------------------------------------ εγγραφή: RIG1 + JSON + bytes, gzip
const header = { bones: B, axes: AXES, meshes: out.map((o) => ({ id: o.id, nv: o.nv })) };
const hjson = Buffer.from(JSON.stringify(header));
const pad = (4 - ((8 + hjson.length) % 4)) % 4;
const parts = [Buffer.from('RIG1'), Buffer.alloc(4), hjson, Buffer.alloc(pad)];
parts[1].writeUInt32LE(hjson.length + pad);
for (const o of out) parts.push(Buffer.from(o.si), Buffer.from(o.sw));
const raw = Buffer.concat(parts);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.writeFileSync(path.join(root, 'public/rig.bin'), gz);
console.log(`bones ${B.length}, vertices: muscles ${stats.muscleV}, bones ${stats.rigidV} → public/rig.bin ${(raw.length / 1024).toFixed(0)} KB, gzip ${(gz.length / 1024).toFixed(0)} KB`);
console.log(B.map((b, i) => `${i} ${b.name} ← ${b.parent >= 0 ? B[b.parent].name : '-'} @ ${b.pivot.join(', ')}`).join('\n'));
