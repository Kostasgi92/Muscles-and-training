// Σκελετός κίνησης του ανατομικού μοντέλου (βλ. tools/build-rig.mjs): φόρτωση, ορθή κινηματική
// και μετασχηματισμοί ως διπλά τετραδόνια (dual quaternions) για το skinning στον shader.
import * as THREE from 'three';
import { gunzipSync } from 'fflate';

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { /* πέφτουμε στην υλοποίηση JS */ }
  }
  return gunzipSync(bytes);
}

export async function fetchRig(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // όπως το anatomy.txt: base64 όταν σερβίρεται ως κείμενο
  if (bytes[0] !== 0x1f && bytes[0] !== 0x52) {
    const bin = atob(new TextDecoder().decode(bytes).replace(/\s+/g, ''));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  return parseRig(bytes);
}

export function parseRig(bytes) {
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIG1') throw new Error('rig');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)).replace(/\0+$/, ''));
  let o = 8 + hlen;
  const skin = new Map();
  for (const m of header.meshes) {
    const si = bytes.slice(o, o + m.nv * 4); o += m.nv * 4;
    const sw = bytes.slice(o, o + m.nv * 4); o += m.nv * 4;
    skin.set(m.id, { si, sw });
  }
  return new Rig(header, skin);
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Rig {
  constructor(header, skin) {
    this.bones = header.bones.map((b) => ({ name: b.name, parent: b.parent, pivot: new THREE.Vector3(...b.pivot) }));
    this.idx = Object.fromEntries(this.bones.map((b, i) => [b.name, i]));
    this.axes = header.axes;
    this.skin = skin;
    const n = this.bones.length;
    this.local = this.bones.map(() => new THREE.Quaternion());
    this.rootPos = this.bones[0].pivot.clone();
    this.rootQuat = new THREE.Quaternion();
    this.Rw = this.bones.map(() => new THREE.Quaternion());
    this.Pw = this.bones.map(() => new THREE.Vector3());
    this.dqR = new Float32Array(n * 4);
    this.dqD = new Float32Array(n * 4);
  }

  reset() {
    for (const q of this.local) q.identity();
    this.rootPos.copy(this.bones[0].pivot);
    this.rootQuat.identity();
  }

  // ορθή κινηματική: παγκόσμια περιστροφή (Rw) και θέση κέντρου (Pw) κάθε κόκαλου
  solve() {
    const { bones, local, Rw, Pw } = this;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      if (b.parent < 0) {
        Rw[i].copy(this.rootQuat).multiply(local[i]);
        Pw[i].copy(this.rootPos);
      } else {
        const p = b.parent;
        Rw[i].copy(Rw[p]).multiply(local[i]);
        Pw[i].copy(b.pivot).sub(bones[p].pivot).applyQuaternion(Rw[p]).add(Pw[p]);
      }
    }
    return this;
  }

  // σημείο του σώματος (θέση ηρεμίας) που κινείται με το κόκαλο i
  point(i, rest, out = new THREE.Vector3()) {
    return out.copy(rest).sub(this.bones[i].pivot).applyQuaternion(this.Rw[i]).add(this.Pw[i]);
  }

  // κατεύθυνση (θέση ηρεμίας) που στρέφεται με το κόκαλο i
  dir(i, rest, out = new THREE.Vector3()) {
    return out.copy(rest).applyQuaternion(this.Rw[i]);
  }

  // x' = R (x − pivot) + P  →  διπλό τετραδόνιο (r, ½·t·r) με t = P − R·pivot
  writeDQ() {
    const { bones, Rw, Pw, dqR, dqD } = this;
    for (let i = 0; i < bones.length; i++) {
      const r = Rw[i];
      _v.copy(bones[i].pivot).applyQuaternion(r);
      const tx = Pw[i].x - _v.x, ty = Pw[i].y - _v.y, tz = Pw[i].z - _v.z;
      dqR[i * 4] = r.x; dqR[i * 4 + 1] = r.y; dqR[i * 4 + 2] = r.z; dqR[i * 4 + 3] = r.w;
      // ½ (t, 0) ⊗ r
      dqD[i * 4] = 0.5 * (tx * r.w + ty * r.z - tz * r.y);
      dqD[i * 4 + 1] = 0.5 * (-tx * r.z + ty * r.w + tz * r.x);
      dqD[i * 4 + 2] = 0.5 * (tx * r.y - ty * r.x + tz * r.w);
      dqD[i * 4 + 3] = 0.5 * (-tx * r.x - ty * r.y - tz * r.z);
    }
    return this;
  }
}

// καθρέφτης περιστροφής ως προς το επίπεδο x = 0 (αριστερή ↔ δεξιά πλευρά)
export const mirrorQ = (q) => _q.set(q.x, -q.y, -q.z, q.w).clone();
