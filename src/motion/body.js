// Το σώμα σε κίνηση, πάνω από τον σκελετό (../rig.js): ορθή και αντίστροφη κινηματική των άκρων,
// λαβές (το χέρι γύρω από μπάρα ή λαβή), πέλματα σταθερά στο έδαφος, επαφή με έδαφος/πάγκο και
// ισορροπία (το κέντρο μάζας πάνω από τα πέλματα).
//
// Σύστημα: y πάνω, το σώμα σε ηρεμία κοιτάζει +z, +x είναι η αριστερή του πλευρά. Γωνίες σε μοίρες,
// με τις συμβάσεις του ../pose.js. Οι τοπικές περιστροφές της δεξιάς πλευράς είναι ο καθρέφτης της
// αριστερής· στην αντίστροφη κινηματική κάθε πλευρά λύνεται κατευθείαν με τα δικά της δεδομένα.
import * as THREE from 'three';
import { qa, X, Y, Z, spineQ, girdleQ, shoulderQ, elbowQ, twistQ, wristQ, hipQ, kneeQ, ankleQ, restInfo } from '../pose.js';

const D2R = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// καθρέφτης ως προς x = 0: σημεία/κατευθύνσεις (−x) και άξονες περιστροφής (ψευδοδιανύσματα)
const mirP = (v) => V(-v.x, v.y, v.z);
const mirA = (v) => V(v.x, -v.y, -v.z);
const mirQ = (q) => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
export const SIDES = ['L', 'R'];

// προσημασμένη γωνία (rad) από το a στο b γύρω από τον άξονα n (όλα κάθετα στο n)
const signedAngle = (a, b, n) => Math.atan2(n.dot(V().crossVectors(a, b)), a.dot(b));

// περιστροφή που φέρνει το ζεύγος (a0, k0) στο (a, k) — και τα δύο ορθοκανονικοποιούνται πρώτα
export function frameQ(a0, k0, a, k) {
  const ortho = (u, w) => { const uu = u.clone().normalize(); const ww = w.clone().addScaledVector(uu, -w.dot(uu)).normalize(); return [uu, ww]; };
  const [u0, w0] = ortho(a0, k0), [u1, w1] = ortho(a, k);
  const m0 = new THREE.Matrix4().makeBasis(u0, w0, V().crossVectors(u0, w0));
  const m1 = new THREE.Matrix4().makeBasis(u1, w1, V().crossVectors(u1, w1));
  return Q().setFromRotationMatrix(m1.multiply(m0.transpose()));
}

// q = T·S, με T στροφή γύρω από τον άξονα n (twist) και S η υπόλοιπη (swing)
function twistSwing(q, n) {
  const inv = q.clone().invert();
  const d = inv.x * n.x + inv.y * n.y + inv.z * n.z;
  const t = new THREE.Quaternion(n.x * d, n.y * d, n.z * d, inv.w);
  if (t.lengthSq() < 1e-12) t.identity(); else t.normalize();
  const T = t.invert();
  const S = T.clone().invert().multiply(q);
  return { T, S, angle: 2 * Math.atan2(T.x * n.x + T.y * n.y + T.z * n.z, T.w) / D2R };
}

// Μάζες τμημάτων (κλάσματα της μάζας σώματος, de Leva 1996)
const SEG_MASS = { head: 0.0694, chest: 0.1596, spine2: 0.1633, pelvis: 0.1117, upperarm: 0.0271, forearm: 0.0162, hand: 0.0061, thigh: 0.1416, shank: 0.0433, foot: 0.0137 };
export const BODY_KG = 75;

export class Body {
  constructor(rig, meshes) {
    this.rig = rig;
    this.R = restInfo(rig);
    this.I = rig.idx;
    const P = (n) => rig.bones[rig.idx[n]].pivot.clone();
    const R = this.R;

    // ---------------- δεδομένα ηρεμίας ανά πλευρά (L από το μοντέλο, R καθρέφτης)
    const L = {};
    L.S = P('upperarm_L'); L.E = P('forearm_L'); L.W = P('hand_L'); L.M = P('fingers_L');
    L.a = L.E.clone().sub(L.S); L.b = L.W.clone().sub(L.E);
    L.eAx = R.elbowAxis.clone(); L.twAx = R.fa.clone();
    L.h0 = L.M.clone().sub(L.W).normalize();
    const fk = V(...rig.axes.fingers);
    L.k0 = fk.clone().addScaledVector(L.h0, -fk.dot(L.h0)).normalize();          // ωλένια → κερκιδική πλευρά
    L.n0 = V().crossVectors(L.h0, L.k0).normalize();                              // παλάμη
    L.grip = L.h0.clone().multiplyScalar(0.07).addScaledVector(L.n0, 0.03);        // κέντρο λαβής από τον καρπό
    L.palm = L.h0.clone().multiplyScalar(0.055).addScaledVector(L.n0, 0.021);      // κέντρο παλάμης (επιφάνεια)
    L.fAx = fk.clone();                                                            // άξονας κάμψης δαχτύλων
    L.H = P('thigh_L'); L.K = P('shank_L'); L.A = P('foot_L'); L.T = P('toes_L');
    L.la = L.K.clone().sub(L.H); L.lb = L.A.clone().sub(L.K);
    L.kAx = R.kneeAxis.clone();
    L.tAx = V(...rig.axes.toes);
    // πέλμα (από τα δείγματα επιφάνειας του μοντέλου): φτέρνα, μετατάρσια, άκρη δαχτύλων, ύψος πέλματος
    L.sole = 0.0084;
    L.heel = V(0.072, L.sole, -0.026);
    L.ball = V(0.098, L.sole, 0.124);
    L.toe = V(0.109, 0.013, 0.187);
    L.mid = L.heel.clone().lerp(L.ball, 0.5);
    const Rt = {};
    for (const k of ['S', 'E', 'W', 'M', 'a', 'b', 'h0', 'k0', 'n0', 'grip', 'palm', 'H', 'K', 'A', 'T', 'la', 'lb', 'heel', 'ball', 'toe', 'mid']) Rt[k] = mirP(L[k]);
    for (const k of ['eAx', 'twAx', 'fAx', 'kAx', 'tAx']) Rt[k] = mirA(L[k]);
    Rt.sole = L.sole;
    this.side = { L, R: Rt };

    // ---------------- κέντρα μάζας τμημάτων (θέση ηρεμίας, κόκαλο)
    const segs = [
      ['head', P('head').add(V(0, 0.065, 0.02)), SEG_MASS.head],
      ['chest', V(0, 1.29, 0.045), SEG_MASS.chest],
      ['spine2', V(0, 1.1, 0.05), SEG_MASS.spine2],
      ['pelvis', V(0, 0.9, 0.04), SEG_MASS.pelvis],
    ];
    for (const s of SIDES) {
      const d = this.side[s];
      segs.push(['upperarm_' + s, d.S.clone().addScaledVector(d.a, 0.42), SEG_MASS.upperarm]);
      segs.push(['forearm_' + s, d.E.clone().addScaledVector(d.b, 0.46), SEG_MASS.forearm]);
      segs.push(['hand_' + s, d.W.clone().addScaledVector(d.h0, 0.04), SEG_MASS.hand]);
      segs.push(['thigh_' + s, d.H.clone().addScaledVector(d.la, 0.41), SEG_MASS.thigh]);
      segs.push(['shank_' + s, d.K.clone().addScaledVector(d.lb, 0.44), SEG_MASS.shank]);
      segs.push(['foot_' + s, d.A.clone().lerp(d.T, 0.5).setY(0.04), SEG_MASS.foot]);
    }
    this.segs = segs.map(([b, p, m]) => ({ b: rig.idx[b], p, m }));

    this.buildSamples(meshes);
    this.handQ = { L: Q(), R: Q() };      // τελευταία παγκόσμια περιστροφή χεριού (για τη σύγκλιση της λαβής)
    this.gripAmt = { L: 0, R: 0 };
    this.reset();
  }

  // Δείγματα της επιφάνειας του σώματος (ένα ανά κελί 1,8 cm) με τα δύο κύρια κόκαλά τους:
  // για επαφές με έδαφος/πάγκο και για αποστάσεις από τα όργανα.
  buildSamples(meshes) {
    const cell = 0.018;
    const seen = new Set();
    const pos = [], b0 = [], b1 = [], w0 = [];
    for (const m of meshes) {
      const g = m.geometry;
      const si = g.attributes.aSkinI?.array, sw = g.attributes.aSkinW?.array;
      if (!si) continue;
      const p = g.attributes.position.array;
      for (let i = 0, n = p.length / 3; i < n; i++) {
        const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2];
        const key = (Math.floor(x / cell) + 200) + 400 * ((Math.floor(y / cell) + 200) + 400 * (Math.floor(z / cell) + 200));
        if (seen.has(key)) continue;
        seen.add(key);
        let ba = 0, wa = -1, bb = 0, wb = -1;
        for (let k = 0; k < 4; k++) {
          const w = sw[4 * i + k], b = si[4 * i + k];
          if (w > wa) { bb = ba; wb = wa; ba = b; wa = w; } else if (w > wb) { bb = b; wb = w; }
        }
        pos.push(x, y, z); b0.push(ba); b1.push(bb); w0.push(wa / Math.max(1, wa + Math.max(0, wb)));
      }
    }
    this.sp = new Float32Array(pos);
    this.sb0 = Uint8Array.from(b0);
    this.sb1 = Uint8Array.from(b1);
    this.sw0 = Float32Array.from(w0);
    this.sn = b0.length;
    this.sx = new Float32Array(pos.length);   // θέσεις στη τρέχουσα στάση
    // δείγματα ανά κύριο κόκαλο
    this.byBone = this.rig.bones.map(() => []);
    for (let i = 0; i < this.sn; i++) this.byBone[this.sb0[i]].push(i);
    this.byBone = this.byBone.map((a) => Uint32Array.from(a));
  }

  reset() {
    this.rig.reset();
    this.gripAmt.L = this.gripAmt.R = 0;
    return this;
  }

  get local() { return this.rig.local; }
  b(name) { return this.I[name]; }
  set(name, q) { this.rig.local[this.I[name]].copy(q); return this; }
  // πλευρά: τοπική περιστροφή που δίνεται για την αριστερή πλευρά
  setS(name, s, qL) { this.rig.local[this.I[name + '_' + s]].copy(s === 'R' ? mirQ(qL) : qL); return this; }

  solve() { this.rig.solve(); return this; }
  // σημείο του σώματος (θέση ηρεμίας) στη τρέχουσα στάση
  pt(bone, rest, out = V()) { return this.rig.point(typeof bone === 'string' ? this.I[bone] : bone, rest, out); }
  pivot(bone) { return this.rig.Pw[typeof bone === 'string' ? this.I[bone] : bone].clone(); }
  rot(bone) { return this.rig.Rw[typeof bone === 'string' ? this.I[bone] : bone].clone(); }

  // ---------------------------------------------------------------- κορμός
  // προσανατολισμός λεκάνης: στροφή (yaw, αριστερά +), κλίση μπροστά (pitch +), πλάγια κλίση (roll, αριστερά +)
  static trunkQ(pitch = 0, yaw = 0, roll = 0) {
    return qa(Y, yaw).multiply(qa(X, pitch)).multiply(qa(Z, -roll));
  }
  root(pos, q) { this.rig.rootPos.copy(pos); if (q) this.rig.rootQuat.copy(q); return this; }
  // σπονδυλική στήλη: κάμψη (+ μπροστά, − έκταση/καμάρα), πλάγια κάμψη, στροφή
  spine(flex = 0, lat = 0, rot = 0) {
    this.set('spine1', spineQ(flex * 0.3, lat * 0.3, rot * 0.12));
    this.set('spine2', spineQ(flex * 0.35, lat * 0.35, rot * 0.28));
    this.set('chest', spineQ(flex * 0.35, lat * 0.35, rot * 0.6));
    return this;
  }
  neck(flex = 0, lat = 0, rot = 0) {
    this.set('neck', spineQ(flex * 0.55, lat * 0.55, rot * 0.45));
    this.set('head', spineQ(flex * 0.45, lat * 0.45, rot * 0.55));
    return this;
  }

  // ---------------------------------------------------------------- άκρα, ορθή κινηματική
  girdle(s, o = {}) { this.setS('girdle', s, girdleQ(o)); return this; }
  // ώμος (plane, elev, rot), αγκώνας, πρηνισμός, καρπός — όπως στο pose.js
  arm(s, o = {}) {
    if (o.girdle) this.girdle(s, o.girdle);
    const gl = this.rig.local[this.I['girdle_' + s]];
    const gq = s === 'R' ? mirQ(gl) : gl.clone();
    this.setS('upperarm', s, shoulderQ(this.R, o, gq));
    this.setS('forearm', s, elbowQ(this.R, o.elbow ?? 8));
    this.setS('twist', s, twistQ(this.R, o.pron ?? 10));
    this.setS('hand', s, wristQ(this.R, o.wrist || {}));
    return this;
  }
  leg(s, o = {}) {
    this.setS('thigh', s, hipQ(o));
    this.setS('shank', s, kneeQ(this.R, o.knee ?? 0));
    this.setS('foot', s, ankleQ(o));
    if (o.toes !== undefined) this.toes(s, o.toes);
    return this;
  }
  toes(s, ext) { this.setS('toes', s, qa(this.side.L.tAx, -ext)); return this; }
  // δάχτυλα χεριού: grip 0 (ανοιχτό) … 1 (κλειστή γροθιά γύρω από λαβή)
  fingers(s, grip = 0, o = {}) {
    const d = this.side.L;
    const g = clamp(grip, -0.3, 1.2);
    this.gripAmt[s] = g;
    this.setS('fingers', s, qa(d.fAx, -(o.mcp ?? 62) * g));
    this.setS('tips', s, qa(d.fAx, -(o.pip ?? 88) * Math.max(0, g)));
    // αντίχειρας: αντίθεση προς την παλάμη και κάμψη γύρω από τη λαβή· με ανοιχτή παλάμη (g < 0) λίγο προς τα έξω
    this.setS('thumb', s, qa(d.h0, (o.opp ?? 48) * g * (g < 0 ? 0.9 : 1)).multiply(qa(d.k0, -(o.th ?? 18) * Math.max(0, g))));
    return this;
  }

  // ---------------------------------------------------------------- αντίστροφη κινηματική
  // Αλυσίδα δύο τμημάτων με άρθρωση-μεντεσέ (άξονας ax, ίσως λοξός ως προς τα τμήματα):
  // ρίζα S, στόχος T (κόσμος), a/b διανύσματα ηρεμίας, κάμψη από f0 έως f1, πόλος = προς τα πού
  // «δείχνει» η άρθρωση (π.χ. ο αγκώνας προς τα πίσω, το γόνατο μπροστά).
  static hinge(S, T, a, b, ax, rest0, f0, f1, pole) {
    const w = (f) => a.clone().add(b.clone().applyQuaternion(qa(ax, f - rest0)));
    const D = T.distanceTo(S);
    let flex;
    if (D >= w(f0).length()) flex = f0;
    else if (D <= w(f1).length()) flex = f1;
    else {
      let lo = f0, hi = f1;
      for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (w(m).length() > D) lo = m; else hi = m; }
      flex = (lo + hi) / 2;
    }
    const d = T.clone().sub(S);
    if (d.lengthSq() < 1e-10) d.set(0, -1, 0);
    d.normalize();
    const wr = w(flex).normalize();
    // ο άξονας της άρθρωσης κάθετος στο επίπεδο (πόλος, S→T): απευθείας αντιστοίχιση πλαισίων (χωρίς
    // την αστάθεια της ελάχιστης περιστροφής όταν η αρχική και η τελική κατεύθυνση είναι αντίθετες)
    const pp = pole.clone().addScaledVector(d, -pole.dot(d));
    let R;
    if (pp.lengthSq() > 1e-8) {
      const eStar = V().crossVectors(pp, d).normalize();
      R = frameQ(wr, ax, d, eStar);
    } else R = Q().setFromUnitVectors(wr, d);
    const maxLen = w(f0).length();
    return { R, flex, reach: D <= maxLen + 1e-4, excess: Math.max(0, D - maxLen) };
  }

  // Χέρι: το σημείο λαβής πάει στο T. hand = { axis: κερκιδική κατεύθυνση (λαβή μπάρας), flex: κάμψη καρπού }
  //   ή { palm: κατεύθυνση παλάμης, fingers: κατεύθυνση δαχτύλων } ή { pron, wrist } (ορθή κινηματική).
  // at: 'grip' (κέντρο λαβής) ή 'palm' (επιφάνεια παλάμης, για στήριξη).
  // pole: κατεύθυνση (κόσμος) ή 'keep' = όπως είναι τώρα ο βραχίονας (για ομαλή μετάβαση από ορθή
  // κινηματική), με προαιρετικό poleTo/poleU για σταδιακή αλλαγή. hand: 'keep' = ο καρπός μένει ως έχει.
  reach(s, T, { pole = V(0, 0, -1), hand = {}, at = 'grip', girdle, poleTo, poleU = 0 } = {}) {
    const d = this.side[s], rig = this.rig, I = this.I;
    if (girdle) this.girdle(s, girdle);
    rig.solve();
    const gI = I['girdle_' + s];
    const Sw = rig.Pw[I['upperarm_' + s]].clone();
    const Rg = rig.Rw[gI];
    if (pole === 'keep') {
      // ο άξονας του αγκώνα όπως είναι τώρα· με poleTo, στροφή του άξονα (όχι του πόλου) προς τον νέο
      const dd = T.clone().sub(Sw).normalize();
      const eK = d.eAx.clone().applyQuaternion(rig.Rw[I['upperarm_' + s]]);
      eK.addScaledVector(dd, -eK.dot(dd));
      if (eK.lengthSq() < 1e-8) eK.set(1, 0, 0);
      eK.normalize();
      let e = eK;
      if (poleTo && poleU > 0) {
        const pp = poleTo.clone().addScaledVector(dd, -poleTo.dot(dd));
        if (pp.lengthSq() > 1e-8) {
          const eT = V().crossVectors(pp, dd).normalize();
          const q = Q().setFromUnitVectors(eK, eT);
          e = eK.clone().applyQuaternion(Q().slerp(q, Math.min(1, poleU)));
        }
      }
      pole = V().crossVectors(dd, e);
      if (pole.lengthSq() < 1e-8) pole.set(0, 0, -1);
      pole.normalize();
    }
    const keepHand = hand === 'keep';
    if (keepHand) this.handQ[s].copy(rig.Rw[I['hand_' + s]]);
    const off0 = at === 'palm' ? d.palm : at === 'wrist' ? V() : d.grip;
    let off = off0.clone().applyQuaternion(this.handQ[s]);
    let res = null;
    const keepTw = keepHand ? rig.local[I['twist_' + s]].clone() : null, keepH = keepHand ? rig.local[I['hand_' + s]].clone() : null;
    for (let it = 0; it < (at === 'palm' ? 9 : 5); it++) {
      const Wt = T.clone().sub(off);
      res = Body.hinge(Sw, Wt, d.a, d.b, d.eAx, this.R.elbowRest, 0, 148, pole);
      const elbowL = qa(d.eAx, res.flex - this.R.elbowRest);
      rig.local[I['upperarm_' + s]].copy(Rg.clone().invert().multiply(res.R));
      rig.local[I['forearm_' + s]].copy(elbowL);
      const Rf = res.R.clone().multiply(elbowL);
      // προσανατολισμός χεριού
      let Qh = null;
      if (keepHand) {
        rig.local[I['twist_' + s]].copy(keepTw);
        rig.local[I['hand_' + s]].copy(keepH);
      } else if (hand.axis) {
        const k = hand.axis.clone().normalize();
        const fa = d.twAx.clone().applyQuaternion(Rf);    // κατεύθυνση αντιβραχίου (για R: −άξονας)
        if (s === 'R') fa.negate();
        let h = fa.addScaledVector(k, -fa.dot(k)).normalize();
        const n = (s === 'L' ? V().crossVectors(h, k) : V().crossVectors(k, h)).normalize();
        const fl = (hand.flex ?? 0) * D2R;
        h = h.clone().multiplyScalar(Math.cos(fl)).addScaledVector(n, Math.sin(fl)).normalize();
        Qh = frameQ(d.h0, d.k0, h, k);
      } else if (hand.palm) {
        Qh = frameQ(d.n0, d.h0, hand.palm.clone().normalize(), (hand.fingers || V(0, 0, 1)).clone().normalize());
      }
      if (Qh) {
        const rel = Rf.clone().invert().multiply(Qh);
        const { T: tw, S: sw, angle } = twistSwing(rel, d.twAx);
        // ο πρηνισμός μετριέται στο [−90°, 270°): η ασυνέχεια μένει μακριά από το φυσιολογικό εύρος
        const a360 = ((((angle + 90) % 360) + 360) % 360) - 90;
        const pr = clamp(a360, hand.pronMin ?? -25, hand.pronMax ?? 195);
        const twQ = qa(d.twAx, pr);
        // καρπός: ό,τι απομένει (με όριο)
        const rest = twQ.clone().invert().multiply(rel);
        const ang = 2 * Math.acos(clamp(Math.abs(rest.w), 0, 1)) / D2R;
        if (ang > 85) rest.slerp(Q(), 1 - 85 / ang);
        if (hand.mix && hand.mix.u > 0) {
          // σταδιακή μετάβαση προς σταθερό πρηνισμό/καρπό (π.χ. από τη λαβή της μπάρας στη θέση rack)
          const f = hand.mix.fk, u = Math.min(1, hand.mix.u);
          const fT = twistQ(this.R, f.pron ?? 10), fH = wristQ(this.R, f.wrist || {});
          twQ.slerp(s === 'R' ? mirQ(fT) : fT, u);
          rest.slerp(s === 'R' ? mirQ(fH) : fH, u);
        }
        rig.local[I['twist_' + s]].copy(twQ);
        rig.local[I['hand_' + s]].copy(rest);
        void tw; void sw;
      } else if (!keepHand) {
        rig.local[I['twist_' + s]].copy(s === 'R' ? mirQ(twistQ(this.R, hand.pron ?? 10)) : twistQ(this.R, hand.pron ?? 10));
        rig.local[I['hand_' + s]].copy(s === 'R' ? mirQ(wristQ(this.R, hand.wrist || {})) : wristQ(this.R, hand.wrist || {}));
      }
      const Rh = Rf.clone().multiply(rig.local[I['twist_' + s]]).multiply(rig.local[I['hand_' + s]]);
      this.handQ[s].copy(Rh);
      off = off0.clone().applyQuaternion(Rh);
    }
    rig.solve();
    return res;
  }

  // Πόδι: το πέλμα στο έδαφος. at = σημείο αναφοράς στο έδαφος (κάτω από το μέσο του πέλματος, ή
  // ref: 'ball'|'heel'|'toe'), yaw = στροφή των δαχτύλων προς τα έξω (+), lift = ανύψωση φτέρνας
  // γύρω από τα μετατάρσια (+) ή γωνία του πέλματος, pole = προς τα πού δείχνει το γόνατο.
  // θέση του αστραγάλου για το πέλμα στο at (ίδιοι κανόνες με το plant)
  ankleFor(s, at, { yaw = 0, lift = 0, pitch = 0, roll = 0, ref = 'mid', pivot = 'auto' } = {}) {
    const d = this.side[s];
    const sg = s === 'L' ? 1 : -1;
    const yawQ = qa(Y, sg * yaw);
    const ang = lift + pitch;
    const Qf = yawQ.clone().multiply(qa(X, ang).multiply(qa(Z, -sg * roll)));
    const refRest = ref === 'ball' ? d.ball : ref === 'heel' ? d.heel : ref === 'toe' ? d.toe : d.mid;
    const piv = pivot === 'ball' ? d.ball : pivot === 'heel' ? d.heel : ang >= 0 ? d.ball : d.heel;
    return { At: at.clone().add(piv.clone().sub(refRest).applyQuaternion(yawQ)).add(d.A.clone().sub(piv).applyQuaternion(Qf)), Qf, piv };
  }

  // ankleAt: ο αστράγαλος ακριβώς εκεί (πόδι στον αέρα, π.χ. αιώρηση στο βάδισμα)
  plant(s, at, { yaw = 0, lift = 0, pitch = 0, roll = 0, ref = 'mid', pole, toes = true, pivot = 'auto', ankleAt } = {}) {
    const d = this.side[s], rig = this.rig, I = this.I;
    rig.solve();
    const sg = s === 'L' ? 1 : -1;
    const yawQ = qa(Y, sg * yaw);
    // κλίση του πέλματος (+ = δάχτυλα κάτω): με τη φτέρνα πάνω γυρίζει γύρω από τα μετατάρσια,
    // με τα δάχτυλα πάνω γύρω από τη φτέρνα. Το at είναι πάντα η θέση του σημείου ref με επίπεδο πέλμα.
    const ang = lift + pitch;
    let At, Qf, piv;
    if (ankleAt) {
      Qf = yawQ.clone().multiply(qa(X, ang).multiply(qa(Z, -sg * roll)));
      At = ankleAt.clone();
      piv = null;
    } else ({ At, Qf, piv } = this.ankleFor(s, at, { yaw, lift, pitch, roll, ref, pivot }));
    const Hw = rig.Pw[I['thigh_' + s]].clone();
    const fwd = V(0, 0, 1).applyQuaternion(yawQ);
    const res = Body.hinge(Hw, At, d.la, d.lb, d.kAx, this.R.kneeRest, 0, 158, pole || fwd.clone().add(V(sg * 0.15, 0, 0)));
    const kneeL = qa(d.kAx, res.flex - this.R.kneeRest);
    const Rp = rig.Rw[I.pelvis];
    rig.local[I['thigh_' + s]].copy(Rp.clone().invert().multiply(res.R));
    rig.local[I['shank_' + s]].copy(kneeL);
    const Rs = res.R.clone().multiply(kneeL);
    rig.local[I['foot_' + s]].copy(Rs.clone().invert().multiply(Qf));
    // τα δάχτυλα μένουν στο έδαφος όταν σηκώνεται η φτέρνα
    if (toes === true) rig.local[I['toes_' + s]].copy(qa(d.tAx, (piv === d.ball ? -ang : 0) * 0.95));
    else if (typeof toes === 'number') rig.local[I['toes_' + s]].copy(qa(d.tAx, -toes));
    rig.solve();
    return res;
  }

  // Πόδι σε σημείο (π.χ. γόνατο ή φτέρνα πάνω σε πάγκο/μπάλα): το σημείο του ποδιού ref (θέση ηρεμίας,
  // στο κόκαλο foot) πάει στο T, με το πέλμα στραμμένο κατά Qf.
  footTo(s, T, Qf, refRest, pole) {
    const d = this.side[s], rig = this.rig, I = this.I;
    rig.solve();
    const At = T.clone().add(d.A.clone().sub(refRest).applyQuaternion(Qf));
    const Hw = rig.Pw[I['thigh_' + s]].clone();
    const res = Body.hinge(Hw, At, d.la, d.lb, d.kAx, this.R.kneeRest, 0, 158, pole);
    const kneeL = qa(d.kAx, res.flex - this.R.kneeRest);
    rig.local[I['thigh_' + s]].copy(rig.Rw[I.pelvis].clone().invert().multiply(res.R));
    rig.local[I['shank_' + s]].copy(kneeL);
    rig.local[I['foot_' + s]].copy(res.R.clone().multiply(kneeL).invert().multiply(Qf));
    rig.solve();
    return res;
  }

  // σημεία: λαβή/παλάμη του χεριού, πέλμα
  grip(s, out = V()) { return this.pt('hand_' + s, this.side[s].W.clone().add(this.side[s].grip), out); }
  palm(s, out = V()) { return this.pt('hand_' + s, this.side[s].W.clone().add(this.side[s].palm), out); }
  // κατεύθυνση λαβής (ωλένια → κερκιδική) στον κόσμο
  gripAxis(s) { return this.side[s].k0.clone().applyQuaternion(this.rig.Rw[this.I['hand_' + s]]); }
  foot(s, which = 'mid', out = V()) { return this.pt('foot_' + s, this.side[s][which], out); }

  // ---------------------------------------------------------------- μάζα, επαφές
  // κέντρο μάζας (σώμα 75 kg + φορτία {p, kg})
  com(loads = []) {
    const c = V(); let m = 0;
    const tmp = V();
    for (const s of this.segs) { this.rig.point(s.b, s.p, tmp); c.addScaledVector(tmp, s.m * BODY_KG); m += s.m * BODY_KG; }
    for (const l of loads) { if (!l || !l.p) continue; c.addScaledVector(l.p, l.kg); m += l.kg; }
    return c.multiplyScalar(1 / m);
  }

  // μετασχηματίζει τα δείγματα των κοκάλων bones (λίστα δεικτών) στη τρέχουσα στάση
  _xform(bones) {
    const { rig, sp, sx, sb0, sb1, sw0 } = this;
    const m = this._mats || (this._mats = rig.bones.map(() => new Float32Array(12)));
    for (let i = 0; i < rig.bones.length; i++) {
      const e = new THREE.Matrix4().makeRotationFromQuaternion(rig.Rw[i]).elements;
      const p = rig.bones[i].pivot, P = rig.Pw[i], M = m[i];
      M[0] = e[0]; M[1] = e[1]; M[2] = e[2]; M[3] = e[4]; M[4] = e[5]; M[5] = e[6]; M[6] = e[8]; M[7] = e[9]; M[8] = e[10];
      M[9] = P.x - (e[0] * p.x + e[4] * p.y + e[8] * p.z);
      M[10] = P.y - (e[1] * p.x + e[5] * p.y + e[9] * p.z);
      M[11] = P.z - (e[2] * p.x + e[6] * p.y + e[10] * p.z);
    }
    const out = [];
    for (const b of bones) {
      const list = this.byBone[b];
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        const x = sp[3 * i], y = sp[3 * i + 1], z = sp[3 * i + 2];
        const A = m[sb0[i]], B = m[sb1[i]], w = sw0[i], u = 1 - w;
        sx[3 * i] = w * (A[0] * x + A[3] * y + A[6] * z + A[9]) + u * (B[0] * x + B[3] * y + B[6] * z + B[9]);
        sx[3 * i + 1] = w * (A[1] * x + A[4] * y + A[7] * z + A[10]) + u * (B[1] * x + B[4] * y + B[7] * z + B[10]);
        sx[3 * i + 2] = w * (A[2] * x + A[5] * y + A[8] * z + A[11]) + u * (B[2] * x + B[5] * y + B[8] * z + B[11]);
        out.push(i);
      }
    }
    return out;
  }
  bones(names) { return names.map((n) => this.I[n]).filter((i) => i !== undefined); }
  // ελάχιστο της συνάρτησης f(x,y,z) στα δείγματα των κοκάλων (π.χ. ύψος → σημείο επαφής)
  extreme(names, f = (x, y) => y, filter = null) {
    const ids = this._xform(this.bones(names));
    let best = Infinity, bi = -1;
    const sx = this.sx;
    for (const i of ids) {
      const x = sx[3 * i], y = sx[3 * i + 1], z = sx[3 * i + 2];
      if (filter && !filter(x, y, z)) continue;
      const v = f(x, y, z);
      if (v < best) { best = v; bi = i; }
    }
    return { v: best, p: bi < 0 ? null : V(this.sx[3 * bi], this.sx[3 * bi + 1], this.sx[3 * bi + 2]) };
  }
  // όλο το σώμα: όρια (για το κάδρο της κάμερας και τη σκιά)
  bounds(box = new THREE.Box3()) {
    const ids = this._xform(this.rig.bones.map((_, i) => i));
    const sx = this.sx;
    box.makeEmpty();
    const v = V();
    for (const i of ids) box.expandByPoint(v.set(sx[3 * i], sx[3 * i + 1], sx[3 * i + 2]));
    return box;
  }
}

export const BONES_TRUNK = ['pelvis', 'spine1', 'spine2', 'chest'];
export const BONES_BACK = ['pelvis', 'spine1', 'spine2', 'chest', 'girdle_L', 'girdle_R', 'head', 'neck'];
export { V, Q, clamp, mirQ, mirP, mirA, D2R };
