// Φόρτωση και αποκωδικοποίηση του anatomy.bin (βλ. tools/build-anatomy.mjs).
import { gunzipSync } from 'fflate';

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {
      // πέφτουμε στην υλοποίηση JS
    }
  }
  return gunzipSync(bytes);
}

export async function fetchAnatomy(url, expectedBytes, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || expectedBytes || 0;
  let bytes;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(Math.min(0.98, received / total));
    }
    bytes = new Uint8Array(received);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  // το artifact σερβίρει μόνο κείμενο/γνωστούς τύπους, γι' αυτό το αρχείο μπορεί να είναι base64 (.txt)
  if (bytes[0] !== 0x1f && bytes[0] !== 0x4d) {
    const bin = atob(new TextDecoder().decode(bytes).replace(/\s+/g, ''));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  if (bytes.byteOffset !== 0) bytes = bytes.slice();
  return parseAnatomy(bytes);
}

export function parseAnatomy(bytes) {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'MAP1') throw new Error('Μη έγκυρο αρχείο ανατομίας');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)));
  let base = 8 + hlen;
  base += (4 - (base % 4)) % 4;
  const buf = bytes.buffer;
  const { min, max } = header.bounds;
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  const meshes = header.meshes.map((m) => {
    const n = m.nv;
    const q = new Uint16Array(buf, base + m.pos, n * 3);
    const position = new Float32Array(n * 3);
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < n; i++) {
      px = (px + q[i * 3]) & 0xffff;
      py = (py + q[i * 3 + 1]) & 0xffff;
      pz = (pz + q[i * 3 + 2]) & 0xffff;
      position[i * 3] = min[0] + (px / 65535) * size[0];
      position[i * 3 + 1] = min[1] + (py / 65535) * size[1];
      position[i * 3 + 2] = min[2] + (pz / 65535) * size[2];
    }
    let index;
    if (m.idx32) {
      index = new Uint32Array(buf, base + m.index, m.nt * 3).slice();
    } else {
      const d = new Uint16Array(buf, base + m.index, m.nt * 3);
      index = new Uint16Array(d.length);
      let p = 0;
      for (let i = 0; i < d.length; i++) { p = (p + d[i]) & 0xffff; index[i] = p; }
    }
    const tissue = new Uint8Array(buf, base + m.tissueAt, n).slice();
    const fiberIdx = new Uint8Array(buf, base + m.fiberAt, n);
    const fiber = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const f = m.fibers[fiberIdx[i]] ?? m.fibers[0];
      fiber[i * 4] = f[0]; fiber[i * 4 + 1] = f[1]; fiber[i * 4 + 2] = f[2]; fiber[i * 4 + 3] = f[3];
    }
    const ao = new Uint8Array(buf, base + m.ao, n * header.levels).slice();
    return { ...m, position, index, tissue, fiber, aoData: ao };
  });
  return { header, meshes };
}
