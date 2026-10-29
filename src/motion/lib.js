// Κοινά εργαλεία για τους ορισμούς κινήσεων: λαβές, επαφές με επιφάνειες, βασικές στάσεις (όρθια,
// ξαπλωμένη, καθιστή, σανίδα, κρέμασμα, τετραποδική) και βήματα/βάδισμα.
import * as THREE from 'three';
import { Body, SIDES, V, clamp } from './body.js';

export { Body, SIDES, V, clamp };
export const sg = (s) => (s === 'L' ? 1 : -1);
export const other = (s) => (s === 'L' ? 'R' : 'L');
export const FLOOR = 0.003;
export const MAT = 0.015;                 // πάνω επιφάνεια στρώματος
export const D2R = Math.PI / 180;
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
export const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export const MOTIONS = {};
export const def = (id, d) => { MOTIONS[id] = d; return d; };

// ------------------------------------------------------------------ λαβές
// u: άξονας της μπάρας/λαβής. Πρηνής (overhand): ο αντίχειρας προς τη μέση. Υπτία: προς τα έξω.
export const over = (s, u = X) => u.clone().multiplyScalar(-sg(s));
export const under = (s, u = X) => u.clone().multiplyScalar(sg(s));
// ανάσα: μικρή έκταση του θώρακα (μοίρες) με περίοδο ~4,5 s
export const breath = (t, a = 1) => Math.sin(t * 1.4) * 0.9 * a;
// ήπια ταλάντευση βάρους (για στάσεις που κρατιούνται)
export const sway = (t, a = 1) => Math.sin(t * 0.83) * 0.004 * a;

export const feetPair = (width = 0.22, yaw = 8, z = 0, x = 0) => ({
  L: { at: V(x + width / 2, FLOOR, z), yaw },
  R: { at: V(x - width / 2, FLOOR, z), yaw },
});

// ------------------------------------------------------------------ όργανα που ακολουθούν το σώμα
export function barFromHands(B) {
  const l = B.grip('L'), r = B.grip('R');
  return { c: l.clone().add(r).multiplyScalar(0.5), u: l.clone().sub(r).normalize() };
}
export function placeBar(obj, c, u) {
  if (!obj) return;
  obj.position.copy(c);
  obj.quaternion.setFromUnitVectors(X, u);
}
// αλτήρας στο χέρι: η λαβή κατά τον άξονα ωλένια → κερκιδική
export function inHand(obj, B, s, offset = 0) {
  if (!obj) return;
  const a = B.gripAxis(s);
  obj.position.copy(B.grip(s)).addScaledVector(a, offset);
  obj.quaternion.setFromUnitVectors(X, a);
}
// kettlebell στο χέρι: η λαβή κατά τον άξονα του χεριού, το σώμα προς την κατεύθυνση down
export function kbInHands(obj, c, axis, down) {
  const yv = down.clone().negate().addScaledVector(axis, down.dot(axis)).normalize();
  const m = new THREE.Matrix4().makeBasis(axis, yv, V().crossVectors(axis, yv));
  obj.position.copy(c);
  obj.quaternion.setFromRotationMatrix(m);
}

// ------------------------------------------------------------------ επαφές
// Μετακινεί τη λεκάνη ώστε κάθε επαφή {bones, n (κάθετος της επιφάνειας προς το σώμα), d, region}
// να ακουμπά: min(n·x) στα δείγματα των bones = d. Έως τρεις επαφές με διαφορετικούς κάθετους.
export function rest(B, contacts) {
  B.solve();
  const D = contacts.map((c) => {
    const e = B.extreme(c.bones, (x, y, z) => c.n.x * x + c.n.y * y + c.n.z * z, c.region);
    return Number.isFinite(e.v) ? c.d - e.v : 0;
  });
  let shift;
  if (contacts.length === 1) shift = contacts[0].n.clone().multiplyScalar(D[0]);
  else {
    // d = Σ a_i n_i με n_j·d = D_j
    const n = contacts.map((c) => c.n);
    const m = n.length;
    const G = n.map((a) => n.map((b) => a.dot(b)));
    // απαλοιφή Gauss
    const A = G.map((row, i) => [...row, D[i]]);
    for (let i = 0; i < m; i++) {
      let p = i;
      for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      for (let r = 0; r < m; r++) if (r !== i && Math.abs(A[i][i]) > 1e-9) { const f = A[r][i] / A[i][i]; for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c]; }
    }
    shift = V();
    for (let i = 0; i < m; i++) shift.addScaledVector(n[i], Math.abs(A[i][i]) > 1e-9 ? A[i][m] / A[i][i] : 0);
  }
  B.rig.rootPos.add(shift);
  B.solve();
  return shift;
}
export const TRUNK = ['pelvis', 'spine1', 'spine2', 'chest'];
export const BACK = ['pelvis', 'spine1', 'spine2', 'chest', 'girdle_L', 'girdle_R', 'head'];
export const floorC = (bones = BACK, d = FLOOR, region) => ({ bones, n: Y, d, region });

// κορμός: προσανατολισμός λεκάνης, σπονδυλική στήλη, αυχένας (με ανάσα)
export function trunk(B, k, pos, { t = 0, breathe = 0.6 } = {}) {
  B.root(pos, Body.trunkQ(k.pitch || 0, k.yaw || 0, k.roll || 0));
  const sp = k.sp || [0, 0, 0], nk = k.nk || [0, 0, 0];
  B.spine(sp[0] - breath(t, breathe), sp[1], sp[2]);
  B.neck(nk[0], nk[1], nk[2]);
}

// ------------------------------------------------------------------ όρθια στάση
// Πέλματα σταθερά, λεκάνη στο ύψος k.y (χαμηλώνει όσο χρειάζεται για να φτάνουν τα πόδια) και
// μετακίνηση μπρος-πίσω ώστε το κέντρο μάζας (με τα βάρη) να πέφτει πάνω από τα πέλματα.
export function stand(B, k, o = {}) {
  const feet = o.feet ? o.feet(k) : feetPair(k.stance ?? 0.22, k.toe ?? 8);
  let tgt = o.target ? o.target(k) : null;
  if (!tgt) {
    const pts = SIDES.filter((s) => feet[s] && !feet[s].light).map((s) => (feet[s].at || V(feet[s].step.x, 0, feet[s].step.z)).clone().add(V(0, 0, 0.012)));
    tgt = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / Math.max(1, pts.length));
  }
  let dx = 0, dz = 0, hy = k.y ?? 0.852;
  // softLegs: «μαλακό» όριο τεντώματος των ποδιών (m) — όσο ένα πόδι πλησιάζει το πλήρες τέντωμα, η
  // λεκάνη χαμηλώνει ομαλά (ασυμπτωτικά), ώστε το γόνατο να μην «κλειδώνει» απότομα (π.χ. στο πάτημα
  // του βαδίσματος), ενώ τα πέλματα μένουν ακριβώς στη θέση τους
  const SOFT = o.softLegs ?? 0;
  const softEx = (r) => softExcess(r, SOFT);
  const place = () => {
    trunk(B, k, V((k.x || 0) + dx + (o.sway ? sway(o.t || 0, o.sway) : 0), hy, (k.z || 0) + dz), o);
    // πρώτα τα πόδια, μετά τα χέρια: στόχοι των χεριών πάνω στο σώμα (π.χ. στους μηρούς) θέλουν
    // τα πόδια ήδη στη θέση τους
    let ex = 0;
    for (const s of SIDES) {
      const f = feet[s];
      if (f) ex = Math.max(ex, softEx(f.step ? stepFoot(B, s, f.step) : B.plant(s, f.at, f)));
      else if (o.free?.[s]) B.leg(s, typeof o.free[s] === 'function' ? o.free[s](k) : o.free[s]);
    }
    o.upper?.(B, k);
    o.after?.(B, k);
    B.solve();
    return ex;
  };
  // σε κάθε βήμα: πρώτα το ύψος ώστε τα πόδια να φτάνουν (σε έγκυρη στάση), μετά η ισορροπία πάνω σε
  // αυτή τη στάση — έτσι το κέντρο μάζας αλλάζει ομαλά και η λύση δεν «πηδά» από καρέ σε καρέ
  for (let it = 0; it < 8; it++) {
    // το ύψος ξαναβρίσκεται από την αρχή σε κάθε βήμα (η ισορροπία μπορεί να έφερε τα πόδια πιο κοντά)
    hy = k.y ?? 0.852;
    let ex = place();
    for (let j = 0; j < 6 && ex > 2e-6; j++) { hy -= ex + 1e-6; ex = place(); }
    if (o.balance === false) break;
    const c = B.com(o.loads ? o.loads(B, k) : []);
    const ez = o.balanceZ === false ? 0 : tgt.z - c.z, exx = o.balanceX ? tgt.x - c.x : 0;
    if (Math.abs(ez) < 5e-4 && Math.abs(exx) < 5e-4) break;
    dz += ez * 1.3; dx += exx * 1.3;
  }
  // μερική ισορροπία (π.χ. όσο ξεκινά το βάδισμα): η μετατόπιση μόνο κατά balanceMix
  if (o.balanceMix != null && o.balanceMix < 1 && (dx || dz)) {
    dx *= o.balanceMix; dz *= o.balanceMix;
    place();
  }
}

// πόσο πρέπει να χαμηλώσει η λεκάνη ώστε το πόδι (αποτέλεσμα plant) να μένει μέσα στο «μαλακό» όριο
// τεντώματος soft (m) — 0 όταν το γόνατο είναι αρκετά λυγισμένο
// (χωρίς soft: σκληρό όριο λίγο πριν το πλήρες τέντωμα, ώστε το γόνατο να μένει σταθερά ~3° λυγισμένο
// αντί να τρέμει γύρω από το «κλείδωμα»)
export function softExcess(r, soft) {
  if (!r) return 0;
  if (r.D === undefined) return r.excess;
  if (!soft) return Math.max(0, r.D - (r.maxLen - 4e-4));
  const x = r.D - (r.maxLen - soft);
  return x <= 0 ? 0 : x - soft * (1 - Math.exp(-x / soft));
}

// ------------------------------------------------------------------ ξαπλωμένος / καθιστός σε επιφάνειες
// Θέση λεκάνης (x, z) και προσανατολισμός από το k· οι επαφές contacts(B) ορίζουν το ύψος (και ό,τι
// άλλο). limbs(B, k, 'pre') πριν τις επαφές (άκρα σε ορθή κινηματική), 'post' μετά (π.χ. πέλματα).
export function onSurface(B, k, o) {
  trunk(B, k, V(k.x || 0, k.y ?? 1, k.z || 0), o);
  o.limbs?.(B, k, 'pre');
  for (let i = 0; i < (o.iter || 1); i++) {
    rest(B, o.contacts(B, k));
    o.limbs?.(B, k, 'mid');
  }
  o.limbs?.(B, k, 'post');
  B.solve();
}

// κάθισμα με ή χωρίς πλάτη: λεκάνη στο κάθισμα (ύψος h), πλάτη στο στήριγμα (κάθετος nb, σημείο pb)
export function sit(B, k, o) {
  const contacts = () => {
    const c = [{ bones: ['pelvis'], n: Y, d: o.h, region: o.seatRegion }];
    if (o.back) c.push({ bones: ['chest', 'spine2', 'girdle_L', 'girdle_R'], n: o.back.n, d: o.back.n.dot(o.back.p) });
    return c;
  };
  onSurface(B, k, { ...o, contacts, iter: o.back ? 2 : 1 });
}

// ------------------------------------------------------------------ σανίδα (push-up / plank)
// Σώμα σε ευθεία γραμμή πάνω στα δάχτυλα των ποδιών (στο toeZ): η κλίση βρίσκεται ώστε το σημείο
// στήριξης των χεριών (ώμοι ή πήχεις) να είναι στο σωστό ύψος. support(B) → ύψος που πρέπει να είναι 0.
export function plankSolve(B, k, { toeZ = -0.98, support, legs, toes = 62, surface = FLOOR, lo = 30, hi = 100, feet }) {
  const solveAt = (pitch) => {
    const q = Body.trunkQ(pitch, k.yaw || 0, k.roll || 0);
    B.root(V(k.x || 0, 1, 0), q);
    const sp = k.sp || [0, 0, 0], nk = k.nk || [0, 0, 0];
    B.spine(sp[0], sp[1], sp[2]);
    B.neck(nk[0], nk[1], nk[2]);
    for (const s of SIDES) {
      if (legs) legs(B, s, k); else B.leg(s, { flex: k.hip ?? 0, abd: 3, knee: k.knee ?? 2, df: k.df ?? 2 });
      B.toes(s, toes);
    }
    B.solve();
    const bones = (feet && feet(k)) || ['toes_L', 'toes_R', 'foot_L', 'foot_R'];
    const toe = B.extreme(bones, (x, y) => y);
    // οριζόντια θέση από σταθερό σημείο (μύτες των ποδιών που στηρίζουν), όχι από το χαμηλότερο
    // δείγμα: αυτό μπορεί να «πηδά» από σημείο σε σημείο του πέλματος και να τινάζει το σώμα
    const sides = SIDES.filter((s) => bones.some((b) => b.endsWith('_' + s)));
    const tz = sides.reduce((a, s) => a + B.foot(s, 'toe').z, 0) / Math.max(1, sides.length);
    B.root(V(k.x || 0, 1 - toe.v + surface, toeZ - (sides.length ? tz : toe.p.z)), q);
    B.solve();
    return support(B);
  };
  let a = lo, b = hi;
  for (let i = 0; i < 16; i++) {
    const m = (a + b) / 2;
    if (solveAt(m) > 0) a = m; else b = m;
  }
  solveAt((a + b) / 2);
}

// ------------------------------------------------------------------ κρέμασμα από μπάρα
// Χέρια στη μπάρα (σημεία hands(s)), το σώμα κρέμεται: χαμηλότερη θέση όπου τα χέρια φτάνουν (τεντωμένα)
// έως την πάνω θέση (yTop). k.lift 0 → 1.
export function hang(B, k, o) {
  const q = Body.trunkQ(k.pitch || 0, k.yaw || 0, k.roll || 0);
  const pose = (y) => {
    trunk(B, k, V(k.x || 0, y, k.z ?? 0), { t: o.t, breathe: 0.3 });
    o.legs ? o.legs(B, k) : SIDES.forEach((s) => B.leg(s, { flex: k.hip ?? 8, abd: 2, knee: k.knee ?? 10, df: -18 }));
    let worst = 0;
    for (const s of SIDES) {
      B.girdle(s, { elev: k.gel ?? 20, prot: k.gpr ?? 0 });
      const r = B.reach(s, o.hand(s), { pole: o.pole(s, k), hand: o.grip(s, k), at: o.at || 'grip' });
      worst = Math.max(worst, r.excess);
      B.fingers(s, o.fingers ?? 1);
    }
    return worst;
  };
  void q;
  let lo = o.yMin ?? 0.2, hi = o.yMax ?? 2.2;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (pose(m) > 1e-4) lo = m; else hi = m; }
  const yHang = hi + (o.slack ?? 0.004);
  const yTop = o.yTop != null ? o.yTop : yHang;
  const y = o.down ? lerp(yHang, yTop, k.lift) : lerp(yHang, yTop, k.lift);
  pose(y);
  return { yHang, y };
}

// ------------------------------------------------------------------ βάδισμα
// Βάδισμα με πραγματικά βήματα (στον κόσμο): ph = 0 … N κύκλοι, ξεκινά και τελειώνει με τα πόδια
// παράλληλα (μισό το πρώτο και το τελευταίο βήμα). Βήμα j (άρτιο: αριστερό, περιττό: δεξί) στο
// [j/2, (j+1)/2]: το πόδι φεύγει με ανασηκωμένη φτέρνα, αιωρείται με μηδενική ταχύτητα στις άκρες
// και πατά με τη φτέρνα· ανάμεσα, διπλή στήριξη ds. Η λεκάνη επιταχύνει στον πρώτο μισό κύκλο και
// επιβραδύνει στον τελευταίο. Επιστρέφει πέλματα, θέση λεκάνης (root) και ταχύτητα v (0…1).
export function walkSteps(ph, N, { S = 1, w = 0.2, lift = 0.06, ds = 0.06 } = {}) {
  ph = clamp(ph, 0, N);
  const n = 2 * N;
  const F = (j) => (j < 0 ? 0 : j >= n - 1 ? (N - 0.5) * S : ((j + 1) * S) / 2);
  const a = (j) => j / 2 + ds, b = (j) => (j + 1) / 2 - ds;
  const len = (j) => F(j) - F(j - 2);
  const out = {};
  for (const s of SIDES) {
    let j = (s === 'L' ? 0 : 1) - 2;
    while (j + 2 < n && a(j + 2) <= ph) j += 2;
    const full = (i) => len(i) > 0.75 * S;
    let z, y = 0, pitch = 0, swing = null;
    if (j >= 0 && ph < b(j)) {
      // αιώρηση: ο αστράγαλος από τη θέση απογείωσης (φτέρνα πάνω) στη θέση πατήματος (φτέρνα κάτω)
      const u = (ph - a(j)) / (b(j) - a(j));
      swing = { u, from: F(j - 2), to: F(j), p0: j === 0 ? 10 : full(j) ? 40 : 24, land: full(j) ? -10 : -5, lift: lift * Math.sqrt(len(j) / S) };
      z = F(j - 2) + len(j) * u;
    } else {
      z = F(j);
      if (j >= 0 && ph < b(j) + ds) pitch = (full(j) ? -10 : -5) * (1 - smooth((ph - b(j)) / ds));
      const nx = j + 2;
      if (nx < n) {
        // ανασήκωμα της φτέρνας πριν φύγει το πόδι
        const t0 = Math.max(0, a(nx) - 0.22);
        if (ph > t0) pitch = (nx === 0 ? 10 : full(nx) ? 40 : 24) * smooth((ph - t0) / (a(nx) - t0));
      }
    }
    out[s] = { x: sg(s) * w / 2, z, y, pitch, swing };
  }
  const q = N - ph;
  out.root = ph <= 0.5 && ph <= N / 2 ? S * ph * ph : q <= 0.5 ? (N - 0.5) * S - S * q * q : S * (ph - 0.25);
  const v = Math.min(1, 2 * ph, 2 * q);
  out.v = v;
  // κορμός: χαμηλά στη διπλή στήριξη, πλάγια προς το πόδι στήριξης, στροφή της λεκάνης προς το πόδι
  // που αιωρείται· τα χέρια αιωρούνται αντίθετα από τα πόδια της ίδιας πλευράς
  out.bob = -0.012 * Math.cos(4 * Math.PI * ph) * v;
  out.sway = -0.018 * Math.sin(2 * Math.PI * ph) * v;
  out.rot = -5 * Math.sin(2 * Math.PI * (ph - 0.19)) * v;
  out.armL = -16 * Math.sin(2 * Math.PI * (ph - 0.19)) * v;
  out.armR = -out.armL;
  return out;
}
// πέλμα βαδίσματος (από walkSteps) στο σώμα: στη στήριξη πατά, στην αιώρηση ο αστράγαλος ακολουθεί
// ομαλή τροχιά ελάχιστου τραντάγματος από την απογείωση στο πάτημα, με τη μύτη να κατεβαίνει νωρίς
export function stepFoot(B, s, q, { yaw = 6 } = {}) {
  const sw = q.swing;
  if (!sw) return B.plant(s, V(q.x, FLOOR + q.y, q.z), { yaw, pitch: q.pitch, pivot: q.pitch >= 0 ? 'ball' : 'heel' });
  const u = sw.u;
  const e = u * u * u * (10 + u * (6 * u - 15));
  const P0 = B.ankleFor(s, V(q.x, FLOOR, sw.from), { yaw, pitch: sw.p0, pivot: 'ball' }).At;
  const P1 = B.ankleFor(s, V(q.x, FLOOR, sw.to), { yaw, pitch: sw.land, pivot: 'heel' }).At;
  const P = P0.lerp(P1, e);
  P.y += sw.lift * Math.sin(Math.PI * u) ** 1.4;
  const pitch = lerp(sw.p0, sw.land, smooth(Math.min(1, u / 0.75)));
  return B.plant(s, null, { yaw, pitch, ankleAt: P, toes: sw.p0 * 0.95 * (1 - smooth(Math.min(1, u / 0.35))) });
}
// πολλά κομμάτια βαδίσματος στη σειρά: segs = [[ph0, ph1], …] (κύκλοι), με στάση ανάμεσα
export function walkPath(ph, segs, o = {}) {
  let z0 = 0;
  for (let i = 0; i < segs.length; i++) {
    const [p0, p1] = segs[i];
    if (ph <= p1 || i === segs.length - 1) {
      const r = walkSteps(ph - p0, p1 - p0, o);
      r.root += z0;
      for (const s of SIDES) {
        r[s].z += z0;
        if (r[s].swing) { r[s].swing.from += z0; r[s].swing.to += z0; }
      }
      return r;
    }
    z0 += (p1 - p0 - 0.5) * (o.S ?? 1);
  }
  return null;
}

// ------------------------------------------------------------------ χέρια
// Ορθή κινηματική των χεριών από πίνακες στα keys: a = [plane, elev, rot, elbow, pron, wristFlex, wristDev]
// (ή aL/aR), g = [elev, prot] της ωμικής ζώνης, f = πόσο κλειστά τα δάχτυλα. Με «ρυθμό» ωμοπλάτης:
// όσο το χέρι ανεβαίνει πάνω από ~35°, η ωμική ζώνη ανυψώνεται λίγο.
export function armsFK(B, k, o = {}) {
  for (const s of o.sides || SIDES) {
    const a = k['a' + s] || k.a;
    if (!a) continue;
    const g = k['g' + s] || k.g || [0, 0];
    const auto = o.rhythm === false ? 0 : 0.14 * Math.max(0, a[1] - 35);
    B.girdle(s, { elev: g[0] + auto, prot: g[1] });
    B.arm(s, { plane: a[0], elev: a[1], rot: a[2] || 0, elbow: a[3] ?? 8, pron: a[4] ?? 10, wrist: { flex: a[5] || 0, dev: a[6] || 0 } });
    B.fingers(s, k['f' + s] ?? k.f ?? o.grip ?? 0.12);
  }
}
// κατεύθυνση (κόσμος) → γωνίες ώμου (plane, elev) στο πλαίσιο του θώρακα (για το δεξί χέρι κατοπτρικά)
export function dirToArm(B, d, s = 'L') {
  B.solve();
  const l = d.clone().normalize().applyQuaternion(B.rot('chest').invert());
  if (s === 'R') l.x = -l.x;
  const elev = Math.acos(clamp(-l.y, -1, 1)) / D2R;
  const plane = Math.atan2(l.z, l.x) / D2R;
  return { plane, elev };
}
// αυτόματη ανύψωση ωμικής ζώνης για στόχο χεριού T (κόσμος)
export function rhythmFor(B, s, T) {
  B.solve();
  const S = B.pivot('upperarm_' + s);
  const { elev } = dirToArm(B, T.clone().sub(S));
  return 0.14 * Math.max(0, elev - 35);
}
// μήκος ώμου → λαβής με σχεδόν τεντωμένο αγκώνα
export function armReach(B, s, flex = 6) {
  const d = B.side[s];
  const w = d.a.clone().add(d.b.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(d.eAx, (flex - B.R.elbowRest) * D2R)));
  return w.add(d.grip.clone().multiplyScalar(0.92)).length();
}
// ύψος της επιφάνειας του σώματος (κόκαλα bones) κοντά στο (x, z)
export function surfaceY(B, bones, x, z, r = 0.035) {
  const e = B.extreme(bones, (px, py) => -py, (px, py, pz) => Math.abs(px - x) < r * 2.2 && Math.abs(pz - z) < r);
  return e.p ? -e.v : null;
}
// ψηλότερο σημείο στο οποίο φτάνουν τα δύο χέρια με σχεδόν τεντωμένους αγκώνες, πάνω από τη γραμμή (x=±w, z)
export function topReach(B, w, z, flex = 7) {
  B.solve();
  let y = Infinity;
  for (const s of SIDES) {
    const S = B.pivot('upperarm_' + s);
    const L = armReach(B, s, flex);
    const lat = sg(s) * w - S.x, dz = z - S.z;
    y = Math.min(y, S.y + Math.sqrt(Math.max(0.0001, L * L - lat * lat - dz * dz)));
  }
  return y;
}
// χαμηλότερο σημείο (κάτω από τους ώμους) όπου φτάνουν τα χέρια με τεντωμένους αγκώνες
export function lowReach(B, w, z, flex = 4) {
  B.solve();
  let y = -Infinity;
  for (const s of SIDES) {
    const S = B.pivot('upperarm_' + s);
    const L = armReach(B, s, flex);
    const lat = sg(s) * w - S.x, dz = z - S.z;
    y = Math.max(y, S.y - Math.sqrt(Math.max(0.0001, L * L - lat * lat - dz * dz)));
  }
  return y;
}
// τόξο κατεύθυνσης: από a σε b μέσω c (για ομαλή στροφή του άξονα λαβής)
export function arc3(a, c, b, u) {
  const q = (x, y, t) => x.clone().multiplyScalar(1 - t).addScaledVector(y, t);
  const v = u < 0.5 ? q(a, c, u * 2) : q(c, b, (u - 0.5) * 2);
  return v.normalize();
}

// Χέρι στο οβελιαίο επίπεδο: κάμψη ώμου flex (0 = κάτω, 90 = μπροστά, 180 = πάνω, >180 πίσω από το
// κεφάλι), μικρή απαγωγή abd, στροφή rot — χωρίς ασυνέχεια πάνω από το κεφάλι.
export function armSag(B, s, o = {}) {
  const gl = B.rig.local[B.I['girdle_' + s]];
  const gq = s === 'R' ? new THREE.Quaternion(gl.x, -gl.y, -gl.z, gl.w) : gl.clone();
  const R = B.R;
  const q = gq.clone().invert()
    .multiply(new THREE.Quaternion().setFromAxisAngle(X, -(o.flex || 0) * D2R))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z, (o.abd || 0) * D2R))
    .multiply(new THREE.Quaternion().setFromAxisAngle(R.ua, -(o.rot || 0) * D2R));
  B.setS('upperarm', s, q);
  B.setS('forearm', s, new THREE.Quaternion().setFromAxisAngle(R.elbowAxis, ((o.elbow ?? 8) - R.elbowRest) * D2R));
  B.setS('twist', s, new THREE.Quaternion().setFromAxisAngle(R.fa, (o.pron ?? 10) * D2R));
  B.setS('hand', s, new THREE.Quaternion().setFromAxisAngle(R.wristAxis, (o.wflex || 0) * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(Z, (o.wdev || 0) * D2R)));
  return B;
}
// χέρια από keys: s = [flex, abd, rot, elbow, pron, wflex] (ή sL/sR), g = [elev, prot]
export function armsSag(B, k, o = {}) {
  for (const s of o.sides || SIDES) {
    const a = k['s' + s] || k.s;
    if (!a) continue;
    const g = k['g' + s] || k.g || [0, 0];
    const auto = o.rhythm === false ? 0 : 0.14 * Math.max(0, Math.min(a[0], 175) - 35);
    B.girdle(s, { elev: g[0] + auto, prot: g[1] });
    armSag(B, s, { flex: a[0], abd: a[1], rot: a[2], elbow: a[3], pron: a[4], wflex: a[5] });
    B.fingers(s, k['f' + s] ?? k.f ?? o.grip ?? 0.12);
  }
}
