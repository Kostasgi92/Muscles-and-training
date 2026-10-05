// Worker για το ψήσιμο ambient occlusion ανά κορυφή με three-mesh-bvh.
import { parentPort, workerData } from 'node:worker_threads';
import { BufferGeometry, BufferAttribute, Ray, Vector3, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const { pos, nrm, idx, ao, from, to, rays, seed } = workerData;
const MAX_DIST = 0.12; // m: τοπική απόκρυψη (σχισμές ανάμεσα σε μύες, μασχάλη, γόνατο)

const geo = new BufferGeometry();
geo.setAttribute('position', new BufferAttribute(pos, 3));
geo.setIndex(new BufferAttribute(idx, 1));
const bvh = new MeshBVH(geo, { targetLeafSize: 8 });

// Σταθερό σετ κατευθύνσεων με κατανομή συνημιτόνου (Hammersley), περιστρέφεται τυχαία ανά κορυφή
let s = seed * 9301 + 49297;
const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const dirs = [];
for (let i = 0; i < rays; i++) {
  let bits = i;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  const u = (i + 0.5) / rays, v = bits / 4294967296;
  const r = Math.sqrt(u), phi = 2 * Math.PI * v;
  dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
}

const ray = new Ray();
const n = new Vector3(), t1 = new Vector3(), t2 = new Vector3(), d = new Vector3();
for (let v = from; v < to; v++) {
  n.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
  if (n.lengthSq() < 0.5) { ao[v] = 1; continue; }
  // ορθοκανονική βάση με τυχαία περιστροφή γύρω από το κάθετο
  t1.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
  t2.crossVectors(n, t1);
  const a = rand() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
  let occ = 0;
  for (const [x, y, z] of dirs) {
    const rx = x * ca - y * sa, ry = x * sa + y * ca;
    d.set(0, 0, 0).addScaledVector(t1, rx).addScaledVector(t2, ry).addScaledVector(n, z).normalize();
    ray.origin.set(pos[v * 3] + n.x * 2e-4, pos[v * 3 + 1] + n.y * 2e-4, pos[v * 3 + 2] + n.z * 2e-4);
    ray.direction.copy(d);
    const hit = bvh.raycastFirst(ray, DoubleSide, 0, MAX_DIST);
    if (hit) occ += 1 - Math.pow(hit.distance / MAX_DIST, 1.5);
  }
  ao[v] = 1 - occ / rays;
}
parentPort.postMessage(true);
