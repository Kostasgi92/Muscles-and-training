// Παράγει το public/anatomy.bin από τα δεδομένα Z-Anatomy του πακέτου
// @authorod/svitylo-3d-anatomy-data (CC BY-SA 4.0, βασισμένα στο BodyParts3D).
//
//   node tools/build-anatomy.mjs [--error=0.0007] [--rays=40] [--out=public/anatomy.bin]
//
// Βήματα: αποκωδικοποίηση GLB (meshopt) → επιλογή δομών → συγχώνευση αριστερής/δεξιάς
// πλευράς ανά τμήμα μυός → συγκόλληση κορυφών → απλοποίηση → βελτιστοποίηση cache →
// ψήσιμο ambient occlusion για κάθε στρώση → συμπαγές δυαδικό αρχείο.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { MUSCLE_PARTS, CONNECTIVE, BONES, EYES } from './anatomy-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ERROR = Number(args.error ?? 0.0007); // απόλυτο σφάλμα απλοποίησης σε μέτρα
const RAYS = Number(args.rays ?? 40);
const OUT = path.resolve(root, args.out ?? 'public/anatomy.bin');
const LEVELS = 4; // 0..2 στρώσεις μυών, 3 = μόνο σκελετός

const dataDir = path.join(root, 'node_modules/@authorod/svitylo-3d-anatomy-data/releases/1.1.0');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
const tissueOfMaterial = manifest.materials.map((m) => (['tendon', 'fascia', 'ligament'].includes(m.kind) ? 1 : 0));

// ---------------------------------------------------------------- δομές
const structById = new Map(manifest.structures.map((s) => [s.id, s]));

function resolve(system, base) {
  const found = [];
  for (const [suffix, side] of [['_l', 'L'], ['_r', 'R'], ['', 'M']]) {
    const s = structById.get(`${system}.${base}${suffix}`);
    if (s && s.meshes?.length) found.push({ side, meshes: s.meshes, id: s.id });
  }
  return found;
}

const items = [];
for (const p of MUSCLE_PARTS) items.push({ ...p, id: `${p.unit}.${p.part}`, system: 'muscular' });
for (const c of CONNECTIVE) items.push({ ...c, kind: 'connective', system: 'muscular' });
for (const b of BONES) items.push({ ...b, kind: 'bone', depth: 3, system: 'skeletal' });
for (const e of EYES) items.push({ ...e, kind: 'eye', depth: 3, system: 'nervous' });

const neededMeshes = new Set();
let missing = 0;
for (const it of items) {
  it.sources = [];
  for (const base of it.s) {
    const r = resolve(it.system, base);
    if (!r.length) { console.warn(`  ! δεν βρέθηκε: ${it.system}.${base} (${it.id})`); missing++; }
    for (const x of r) { it.sources.push(x); x.meshes.forEach((m) => neededMeshes.add(m)); }
  }
}
console.log(`δομές: ${items.length} τμήματα, ${neededMeshes.size} πηγαία mesh, ${missing} ελλείψεις`);

// Έκφυση / κατάφυση κάθε μυός (σύστημα "insertions" του Z-Anatomy): οι ίνες συγκλίνουν προς τη
// μικρότερη από τις δύο περιοχές, ώστε η υφή να ακολουθεί την πραγματική πορεία των ινών.
const attachStructs = manifest.structures.filter((x) => x.system === 'insertions' && x.meshes?.length);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function attachments(structId) {
  const m = structId.match(/^[a-z]+\.(.+?)(_l|_r)?$/);
  const suf = m[2] ? esc(m[2]) : '(?:_l|_r)?';
  const out = { insertion: [], origin: [] };
  const tryBase = (b) => {
    for (const kind of ['insertion', 'origin']) {
      const re = new RegExp(`^insertions\\.${esc(b)}_${kind}(?:_\\d+)?${suf}$`);
      for (const x of attachStructs) if (re.test(x.id)) out[kind].push(...x.meshes);
    }
  };
  tryBase(m[1]);
  let parent = structById.get(structId)?.parent;
  while (parent && !out.insertion.length && !out.origin.length) {
    tryBase(parent.replace(/^[a-z]+\./, ''));
    parent = structById.get(parent)?.parent;
  }
  return out;
}
let withAttach = 0, srcCount = 0;
for (const it of items) {
  for (const src of it.sources) {
    srcCount++;
    src.attach = it.kind === 'muscle' ? attachments(src.id) : { insertion: [], origin: [] };
    if (src.attach.insertion.length || src.attach.origin.length) withAttach++;
    [...src.attach.insertion, ...src.attach.origin].forEach((mi) => neededMeshes.add(mi));
  }
}
console.log(`έκφυση/κατάφυση βρέθηκε για ${withAttach}/${srcCount} δομές`);

// ---------------------------------------------------------------- αποκωδικοποίηση GLB
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const meshGeo = new Map(); // meshIndex -> {pos: number[], tissue: number[], idx: number[]}
let flipped = 0, triTotal = 0;
for (const chunk of manifest.chunks) {
  let needed = false;
  for (let m = chunk.meshStart; m < chunk.meshStart + chunk.meshCount; m++) if (neededMeshes.has(m)) { needed = true; break; }
  if (!needed) continue;
  const doc = await io.read(path.join(dataDir, chunk.files.standard.path));
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mat = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const posA = prim.getAttribute('POSITION');
      const idA = prim.getAttribute('_ID');
      const pa = posA.getArray();
      const norm = posA.getNormalized();
      const ct = posA.getComponentType();
      const scale = !norm ? 1 : ct === 5122 ? 1 / 32767 : ct === 5120 ? 1 / 127 : ct === 5123 ? 1 / 65535 : 1 / 255;
      const ids = idA.getArray();
      const n = posA.getCount();
      // κάθετα διανύσματα της πηγής: χρησιμοποιούνται μόνο για να διορθωθεί η φορά των τριγώνων
      // (τα καθρεφτισμένα δεξιά mesh έχουν ανεστραμμένη φορά)
      const nrmA = prim.getAttribute('NORMAL');
      const na = nrmA?.getArray();
      const nScale = !nrmA ? 0 : !nrmA.getNormalized() ? 1 : nrmA.getComponentType() === 5122 ? 1 / 32767 : 1 / 127;
      const world = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = Math.max(-1, pa[i * 3] * scale), y = Math.max(-1, pa[i * 3 + 1] * scale), z = Math.max(-1, pa[i * 3 + 2] * scale);
        world[i * 3] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
        world[i * 3 + 1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
        world[i * 3 + 2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
      }
      const index = prim.getIndices().getArray();
      const local = new Map(); // meshIndex -> Map(oldVertex -> newVertex)
      for (let t = 0; t < index.length; t += 3) {
        const a = index[t];
        const mi = ids[a * 2];
        if (!neededMeshes.has(mi)) continue;
        let order = [0, 1, 2];
        if (na) {
          const i0 = index[t] * 3, i1 = index[t + 1] * 3, i2 = index[t + 2] * 3;
          const e1x = world[i1] - world[i0], e1y = world[i1 + 1] - world[i0 + 1], e1z = world[i1 + 2] - world[i0 + 2];
          const e2x = world[i2] - world[i0], e2y = world[i2 + 1] - world[i0 + 1], e2z = world[i2 + 2] - world[i0 + 2];
          const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
          const sx = na[i0] + na[i1] + na[i2], sy = na[i0 + 1] + na[i1 + 1] + na[i2 + 1], sz = na[i0 + 2] + na[i1 + 2] + na[i2 + 2];
          // ο πίνακας του κόμβου έχει μόνο ομοιόμορφη κλίμακα/μετατόπιση, άρα τα κάθετα δεν αλλάζουν κατεύθυνση
          if ((fx * sx + fy * sy + fz * sz) * nScale < 0) { order = [0, 2, 1]; flipped++; }
          triTotal++;
        }
        let g = meshGeo.get(mi);
        if (!g) { g = { pos: [], tissue: [], idx: [] }; meshGeo.set(mi, g); }
        let remap = local.get(mi);
        if (!remap) { remap = new Map(); local.set(mi, remap); }
        for (const k of order) {
          const v = index[t + k];
          let nv = remap.get(v);
          if (nv === undefined) {
            nv = g.pos.length / 3;
            remap.set(v, nv);
            g.pos.push(world[v * 3], world[v * 3 + 1], world[v * 3 + 2]);
            g.tissue.push(tissueOfMaterial[ids[v * 2 + 1]] ?? 0);
          }
          g.idx.push(nv);
        }
      }
    }
  }
}
console.log(`αποκωδικοποιήθηκαν ${meshGeo.size} mesh, διορθώθηκε η φορά σε ${flipped}/${triTotal} τρίγωνα`);

// Οι καθρεφτισμένες δομές (στην πηγή συνήθως οι αριστερές) είναι "από μέσα προς τα έξω":
// αρνητικός προσημασμένος όγκος. Τις γυρίζουμε ώστε όλες να έχουν φορά προς τα έξω.
function signedVolume(meshList) {
  let v = 0;
  for (const mi of meshList) {
    const g = meshGeo.get(mi);
    if (!g) continue;
    const P = g.pos, I = g.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
  }
  return v / 6;
}
function flipMeshes(meshList) {
  for (const mi of meshList) {
    const g = meshGeo.get(mi);
    if (!g) continue;
    for (let t = 0; t < g.idx.length; t += 3) { const x = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = x; }
  }
}
{
  const bySrc = new Map();
  for (const it of items) for (const src of it.sources) bySrc.set(src.id, src);
  const done = new Set();
  let nFlip = 0;
  for (const [id, src] of bySrc) {
    if (done.has(id)) continue;
    const base = id.replace(/_(l|r)$/, '');
    const L = bySrc.get(`${base}_l`), R = bySrc.get(`${base}_r`);
    if (L && R) {
      const vl = signedVolume(L.meshes), vr = signedVolume(R.meshes);
      if (vl * vr < 0) {
        // ζεύγος με αντίθετη φορά: γυρίζουμε αυτό με τον αρνητικό όγκο
        if (vl < 0) { flipMeshes(L.meshes); nFlip++; } else { flipMeshes(R.meshes); nFlip++; }
      } else if (vl < 0 && vr < 0) { flipMeshes(L.meshes); flipMeshes(R.meshes); nFlip += 2; }
      done.add(L.id); done.add(R.id);
    } else {
      if (signedVolume(src.meshes) < 0) { flipMeshes(src.meshes); nFlip++; }
      done.add(id);
    }
  }
  console.log(`αντιστράφηκαν ${nFlip} δομές με εσωτερική φορά`);
}

// ---------------------------------------------------------------- συναρμολόγηση τμημάτων
function weld(pos, tissue, src, idx) {
  const key = new Map();
  const remap = new Uint32Array(pos.length / 3);
  const outPos = [], outT = [], outCount = [], outSrc = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const k = `${Math.round(pos[i * 3] * 1e6)},${Math.round(pos[i * 3 + 1] * 1e6)},${Math.round(pos[i * 3 + 2] * 1e6)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = outPos.length / 3;
      key.set(k, j);
      outPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      outT.push(0); outCount.push(0); outSrc.push(src[i]);
    }
    outT[j] += tissue[i]; outCount[j]++;
    remap[i] = j;
  }
  const outIdx = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]];
    if (a !== b && b !== c && a !== c) outIdx.push(a, b, c);
  }
  return { pos: Float32Array.from(outPos), tissue: Float32Array.from(outT.map((v, i) => v / outCount[i])), src: Uint8Array.from(outSrc), idx: Uint32Array.from(outIdx) };
}

function simplify(g, errorAbs) {
  const before = g.idx.length / 3;
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(g.idx, g.pos, 3, g.tissue, 1, [0.5], null, 0, errorAbs, ['ErrorAbsolute', 'Prune']);
  // compaction + βελτιστοποίηση vertex cache / fetch
  const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
  const pos = new Float32Array(unique * 3), tissue = new Float32Array(unique), src = new Uint8Array(unique);
  for (let i = 0; i < remap.length; i++) {
    const j = remap[i];
    if (j === 0xffffffff) continue;
    pos[j * 3] = g.pos[i * 3]; pos[j * 3 + 1] = g.pos[i * 3 + 1]; pos[j * 3 + 2] = g.pos[i * 3 + 2];
    tissue[j] = g.tissue[i];
    src[j] = g.src[i];
  }
  return { pos, tissue, src, idx, before };
}

function pcaAxis(pos, start, count) {
  let cx = 0, cy = 0, cz = 0;
  for (let i = start; i < start + count; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= count; cy /= count; cz /= count;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = start; i < start + count; i++) {
    const x = pos[i * 3] - cx, y = pos[i * 3 + 1] - cy, z = pos[i * 3 + 2] - cz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  let v = [0.3, 0.9, 0.2];
  for (let it = 0; it < 64; it++) {
    const nx = xx * v[0] + xy * v[1] + xz * v[2];
    const ny = xy * v[0] + yy * v[1] + yz * v[2];
    const nz = xz * v[0] + yz * v[1] + zz * v[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    v = [nx / l, ny / l, nz / l];
  }
  return { axis: v.map((x) => +x.toFixed(4)), center: [cx, cy, cz] };
}

function centroidOf(meshList) {
  let x = 0, y = 0, z = 0, n = 0;
  for (const mi of meshList) {
    const g = meshGeo.get(mi);
    if (!g) continue;
    for (let i = 0; i < g.pos.length; i += 3) { x += g.pos[i]; y += g.pos[i + 1]; z += g.pos[i + 2]; n++; }
  }
  if (!n) return null;
  x /= n; y /= n; z /= n;
  let r = 0;
  for (const mi of meshList) {
    const g = meshGeo.get(mi);
    if (!g) continue;
    for (let i = 0; i < g.pos.length; i += 3) r += (g.pos[i] - x) ** 2 + (g.pos[i + 1] - y) ** 2 + (g.pos[i + 2] - z) ** 2;
  }
  return { c: [x, y, z], spread: Math.sqrt(r / n) };
}

// σημείο σύγκλισης ινών + τυπική απόσταση (για την κλίμακα της υφής).
// Υποψήφια: κατάφυση, έκφυση και ένα μακρινό σημείο στον κύριο άξονα (παράλληλες ίνες).
// Κρατάμε αυτό του οποίου οι ακτίνες μένουν εφαπτόμενες στην επιφάνεια του μυός.
function fiberSource(src, pos, nrm) {
  const n = pos.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  const { axis } = pcaAxis(pos, 0, n);
  let ext = 0;
  for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs((pos[i * 3] - cx) * axis[0] + (pos[i * 3 + 1] - cy) * axis[1] + (pos[i * 3 + 2] - cz) * axis[2]));
  const score = (P) => {
    let sum = 0;
    const step = Math.max(1, Math.floor(n / 4000));
    let cnt = 0;
    for (let i = 0; i < n; i += step) {
      const dx = pos[i * 3] - P[0], dy = pos[i * 3 + 1] - P[1], dz = pos[i * 3 + 2] - P[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      sum += Math.abs((dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2]) / l);
      cnt++;
    }
    return sum / cnt;
  };
  const cands = [];
  const I = centroidOf(src.attach.insertion), O = centroidOf(src.attach.origin);
  if (I) cands.push({ p: I.c, s: score(I.c), att: true });
  if (O) cands.push({ p: O.c, s: score(O.c), att: true });
  const far = [cx + axis[0] * ext * 6, cy + axis[1] * ext * 6, cz + axis[2] * ext * 6];
  const farC = { p: far, s: score(far), att: false };
  let best = cands.sort((a, b) => a.s - b.s)[0];
  if (!best || (best.s > 0.42 && best.s > farC.s + 0.08)) best = farC;
  const point = best.p;
  let L = 0;
  for (let i = 0; i < n; i++) L += Math.hypot(pos[i * 3] - point[0], pos[i * 3 + 1] - point[1], pos[i * 3 + 2] - point[2]);
  return { f: [...point.map((v) => +v.toFixed(4)), +(L / n).toFixed(4)], att: best.att };
}

const out = [];
let triBefore = 0, triAfter = 0, fromAttach = 0;
for (const it of items) {
  const segs = [];
  const fibers = [];
  let pos = [], tissue = [], fsrc = [], idx = [];
  let vOff = 0;
  for (const side of ['L', 'R', 'M']) {
    const sources = it.sources.filter((x) => x.side === side);
    if (!sources.length) continue;
    const merged = { pos: [], tissue: [], src: [], idx: [] };
    for (const src of sources) {
      const own = [], ownIdx = [];
      for (const mi of src.meshes) {
        const g = meshGeo.get(mi);
        if (!g) continue;
        const b = own.length / 3;
        for (const v of g.pos) own.push(v);
        for (const v of g.idx) ownIdx.push(v + b);
      }
      if (!own.length) continue;
      const fi = fibers.length;
      const fs = fiberSource(src, own, normals(own, ownIdx));
      fibers.push(fs.f);
      if (fs.att) fromAttach++;
      for (const mi of src.meshes) {
        const g = meshGeo.get(mi);
        if (!g) continue;
        const base = merged.pos.length / 3;
        for (const v of g.pos) merged.pos.push(v);
        for (const t of g.tissue) { merged.tissue.push(it.tendon || it.kind === 'connective' ? 1 : t); merged.src.push(fi); }
        for (const v of g.idx) merged.idx.push(v + base);
      }
    }
    if (!merged.idx.length) continue;
    const welded = weld(merged.pos, merged.tissue, merged.src, merged.idx);
    const err = it.kind === 'eye' ? ERROR * 0.5 : it.kind === 'bone' ? ERROR * 1.25 : ERROR;
    const sm = simplify(welded, err);
    triBefore += sm.before; triAfter += sm.idx.length / 3;
    const count = sm.pos.length / 3;
    segs.push({ side, start: vOff, count, ...pcaAxis(sm.pos, 0, count) });
    for (const v of sm.pos) pos.push(v);
    for (const t of sm.tissue) tissue.push(t);
    for (const f of sm.src) fsrc.push(f);
    for (const v of sm.idx) idx.push(v + vOff);
    vOff += count;
  }
  if (!idx.length) { console.warn(`  ! κενό τμήμα ${it.id}`); continue; }
  out.push({ it, pos: Float32Array.from(pos), tissue: Float32Array.from(tissue), fsrc: Uint8Array.from(fsrc), fibers, idx: Uint32Array.from(idx), segs });
}
console.log(`τρίγωνα: ${triBefore} → ${triAfter} (σφάλμα ${ERROR * 1000} mm), ίνες από έκφυση/κατάφυση: ${fromAttach}`);

// ---------------------------------------------------------------- κάθετα διανύσματα (όπως στο three.js: σταθμισμένα με εμβαδόν)
function normals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
for (const o of out) o.nrm = normals(o.pos, o.idx);

// ---------------------------------------------------------------- ambient occlusion ανά στρώση
const visibleAt = (o, L) => (o.it.kind === 'muscle' || o.it.kind === 'connective' ? (L < 3 && o.it.depth >= L) : true);

async function bakeLevel(L) {
  const vis = out.filter((o) => visibleAt(o, L));
  let nv = 0, nt = 0;
  for (const o of vis) { nv += o.pos.length / 3; nt += o.idx.length / 3; }
  const sPos = new Float32Array(new SharedArrayBuffer(nv * 12));
  const sNrm = new Float32Array(new SharedArrayBuffer(nv * 12));
  const sIdx = new Uint32Array(new SharedArrayBuffer(nt * 12));
  const sAO = new Float32Array(new SharedArrayBuffer(nv * 4));
  let vo = 0, to = 0;
  const offsets = [];
  for (const o of vis) {
    sPos.set(o.pos, vo * 3); sNrm.set(o.nrm, vo * 3);
    for (let i = 0; i < o.idx.length; i++) sIdx[to * 3 + i] = o.idx[i] + vo;
    offsets.push(vo);
    vo += o.pos.length / 3; to += o.idx.length / 3;
  }
  const workers = Math.max(1, os.cpus().length);
  const per = Math.ceil(nv / workers);
  await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(path.join(here, 'ao-worker.mjs'), {
      workerData: { pos: sPos, nrm: sNrm, idx: sIdx, ao: sAO, from: w * per, to: Math.min(nv, (w + 1) * per), rays: RAYS, seed: L * 101 + w },
    });
    wk.on('message', res); wk.on('error', rej);
  })));
  vis.forEach((o, i) => {
    const n = o.pos.length / 3;
    if (!o.ao) o.ao = new Uint8Array(n * LEVELS).fill(255);
    const raw = sAO.subarray(offsets[i], offsets[i] + n);
    const sm = smooth(raw, o.idx, n, 2);
    for (let v = 0; v < n; v++) o.ao[v * LEVELS + L] = Math.round(Math.max(0, Math.min(1, sm[v])) * 255);
  });
  console.log(`  AO στρώση ${L}: ${nv} κορυφές, ${nt} τρίγωνα`);
}

function smooth(values, idx, n, iterations) {
  let cur = Float32Array.from(values);
  for (let k = 0; k < iterations; k++) {
    const sum = new Float32Array(n), cnt = new Float32Array(n);
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
        sum[a] += cur[b]; cnt[a]++; sum[b] += cur[a]; cnt[b]++;
      }
    }
    const next = new Float32Array(n);
    for (let v = 0; v < n; v++) next[v] = cnt[v] ? 0.5 * cur[v] + 0.5 * (sum[v] / cnt[v]) : cur[v];
    cur = next;
  }
  return cur;
}

const t0 = Date.now();
for (let L = 0; L < LEVELS; L++) await bakeLevel(L);
// Οι στρώσεις όπου ένα mesh δεν φαίνεται παίρνουν την τιμή της πλησιέστερης ορατής (καλύτερη συμπίεση)
for (const o of out) {
  const n = o.pos.length / 3;
  const shown = [...Array(LEVELS).keys()].filter((L) => visibleAt(o, L));
  for (let L = 0; L < LEVELS; L++) {
    if (shown.includes(L)) continue;
    const src = shown.reduce((best, s) => (Math.abs(s - L) < Math.abs(best - L) ? s : best), shown[0]);
    for (let v = 0; v < n; v++) o.ao[v * LEVELS + L] = o.ao[v * LEVELS + src];
  }
}
console.log(`AO σε ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- εγγραφή
const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
for (const o of out) for (let i = 0; i < o.pos.length; i++) { const c = i % 3; bmin[c] = Math.min(bmin[c], o.pos[i]); bmax[c] = Math.max(bmax[c], o.pos[i]); }
const size = bmax.map((v, i) => v - bmin[i]);

const blobs = [];
let offset = 0;
const pushBlob = (typed) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { blobs.push(new Uint8Array(pad)); offset += pad; }
  const at = offset;
  blobs.push(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength));
  offset += typed.byteLength;
  return at;
};

const meshes = [];
for (const o of out) {
  const n = o.pos.length / 3;
  // ποσοτικοποίηση θέσεων σε int16 στο συνολικό bounding box, με delta κωδικοποίηση
  const q = new Uint16Array(n * 3);
  const prev = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(((o.pos[i * 3 + c] - bmin[c]) / size[c]) * 65535);
      q[i * 3 + c] = (v - prev[c]) & 0xffff;
      prev[c] = v;
    }
  }
  const idx32 = n > 65535;
  const index = idx32 ? new Uint32Array(o.idx) : new Uint16Array(o.idx.length);
  if (!idx32) {
    // delta (mod 2^16) των δεικτών
    let p = 0;
    for (let i = 0; i < o.idx.length; i++) { index[i] = (o.idx[i] - p) & 0xffff; p = o.idx[i]; }
  }
  const tissue = Uint8Array.from(o.tissue, (t) => Math.round(t * 255));
  const it = o.it;
  // κέντρο και ακτίνα για το "πέταγμα" της κάμερας
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += o.pos[i * 3]; cy += o.pos[i * 3 + 1]; cz += o.pos[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  meshes.push({
    id: it.id, kind: it.kind, unit: it.unit ?? null, part: it.part ?? null, depth: it.depth,
    name: it.name ?? null, tissue: it.tissue ?? null,
    nv: n, nt: o.idx.length / 3, idx32,
    segs: o.segs.map((s) => ({ side: s.side, start: s.start, count: s.count, axis: s.axis, center: s.center.map((v) => +v.toFixed(4)) })),
    fibers: o.fibers,
    center: [cx, cy, cz].map((v) => +v.toFixed(4)),
    pos: pushBlob(q), tissueAt: pushBlob(tissue), fiberAt: pushBlob(o.fsrc), ao: pushBlob(o.ao), index: pushBlob(index),
  });
}

const header = {
  version: 1, levels: LEVELS,
  bounds: { min: bmin.map((v) => +v.toFixed(5)), max: bmax.map((v) => +v.toFixed(5)) },
  source: 'Z-Anatomy (CC BY-SA 4.0), βασισμένο στο BodyParts3D © The Database Center for Life Science; μέσω @authorod/svitylo-3d-anatomy-data 1.1.0',
  meshes,
};
const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
const pre = Buffer.alloc(8);
pre.write('MAP1', 0, 'ascii');
pre.writeUInt32LE(headerBytes.length, 4);
const headPad = Buffer.alloc((4 - ((8 + headerBytes.length) % 4)) % 4);
const body = Buffer.concat(blobs.map((b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength)));
const file = Buffer.concat([pre, headerBytes, headPad, body]);
const gz = zlib.gzipSync(file, { level: 9 });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, gz);

const totV = meshes.reduce((a, m) => a + m.nv, 0), totT = meshes.reduce((a, m) => a + m.nt, 0);
console.log(`εγγράφηκε ${path.relative(root, OUT)}: ${meshes.length} mesh, ${totV} κορυφές, ${totT} τρίγωνα, ${(file.length / 1e6).toFixed(2)} MB → gzip ${(gz.length / 1e6).toFixed(2)} MB`);
