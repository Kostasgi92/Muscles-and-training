// Ανατομικές γωνίες → περιστροφές του σκελετού (src/rig.js), και αντίστροφη κινηματική (IK).
//
// Σύστημα: y πάνω, z μπροστά (το σώμα κοιτάζει +z), x αριστερά. Όλες οι γωνίες σε μοίρες και
// μετρημένες από την ανατομική θέση (όρθιος, χέρια στο πλάι, παλάμες μπροστά). Οι τύποι γράφονται για
// την αριστερή πλευρά· η δεξιά παίρνει τον καθρέφτη της περιστροφής ως προς το επίπεδο x = 0.
//
//  κορμός:  flex (μπροστά +), lat (κλίση αριστερά +), rot (στροφή αριστερά +)
//  ώμος:    plane (0 = στο πλάι, 90 = μπροστά), elev (από κάτω προς τα πάνω), rot (έξω στροφή +)
//  ωμική ζώνη: elev (ανύψωση +), prot (προς τα εμπρός +, απαγωγή ωμοπλατών −)
//  αγκώνας: flex · αντιβράχιο: pron (0 = παλάμη μπροστά, 90 = ουδέτερη, 170 = πρηνισμός)
//  καρπός:  flex (προς την παλάμη +), dev (κερκιδική απόκλιση +) · χέρι: grip (0…1)
//  ισχίο:   flex, abd, rot (έσω στροφή +) · γόνατο: flex · ποδοκνημική: df (ραχιαία κάμψη +), inv
//  δάχτυλα ποδιού: ext (έκταση +)
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);
export const qa = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * D2R);
export const mirrorQ = (q) => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
export const mirrorV = (v) => new THREE.Vector3(-v.x, v.y, v.z);
const mul = (...qs) => qs.reduce((a, b) => a.multiply(b), new THREE.Quaternion());

// περιστροφή που φέρνει το ορθοκανονικό ζεύγος (a0, k0) στο (a, k)
export function alignFrames(a0, k0, a, k) {
  const m0 = new THREE.Matrix4().makeBasis(a0, k0, new THREE.Vector3().crossVectors(a0, k0));
  const kk = k.clone().sub(a.clone().multiplyScalar(k.dot(a))).normalize();
  const m1 = new THREE.Matrix4().makeBasis(a, kk, new THREE.Vector3().crossVectors(a, kk));
  return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
}

// Γεωμετρία ηρεμίας που χρειάζεται η κίνηση (αριστερή πλευρά)
export function restInfo(rig) {
  const P = (n) => rig.bones[rig.idx[n]].pivot.clone();
  const dir = (a, b) => b.clone().sub(a).normalize();
  const sh = P('upperarm_L'), el = P('forearm_L'), wr = P('hand_L'), mcp = P('fingers_L');
  const hip = P('thigh_L'), kn = P('shank_L'), an = P('foot_L'), mtp = P('toes_L');
  const ua = dir(sh, el), fa = dir(el, wr), hd = dir(wr, mcp);
  const th = dir(hip, kn), sk = dir(kn, an);
  const elbowAxis = new THREE.Vector3().crossVectors(fa, Z).normalize();     // ≈ −x: κάμψη φέρνει το αντιβράχιο μπροστά
  const wristAxis = new THREE.Vector3().crossVectors(hd, Z).normalize();
  const kneeAxis = new THREE.Vector3().crossVectors(Z, th).normalize();      // ≈ +x: κάμψη φέρνει την κνήμη πίσω
  // προσημασμένη γωνία από a σε b γύρω από τον άξονα (κάμψη +)
  const signed = (a, b, axis) => Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(axis), a.dot(b)) / D2R;
  return {
    ua, fa, hd, th, sk, elbowAxis, wristAxis, kneeAxis,
    elbowRest: signed(ua, fa, elbowAxis), kneeRest: signed(th, sk, kneeAxis),
    lenUA: el.distanceTo(sh), lenFA: wr.distanceTo(el), lenTh: kn.distanceTo(hip), lenSk: an.distanceTo(kn),
    // πέλμα: από τον αστράγαλο στη γραμμή των μεταταρσίων, και η κάτω επιφάνεια (για το έδαφος)
    footFwd: new THREE.Vector3(mtp.x - an.x, 0, mtp.z - an.z).normalize(),
    ankleH: an.y, mtp, ankle: an,
    toesAxis: new THREE.Vector3(...rig.axes.toes),
    fingersAxis: new THREE.Vector3(...rig.axes.fingers),
  };
}

const g = (o, k, d = 0) => (o && o[k] !== undefined ? o[k] : d);

// ------------------------------------------------------------------ τοπικές περιστροφές (αριστερή πλευρά)
export function spineQ(flex, lat, rot) { return mul(qa(Y, rot), qa(X, flex), qa(Z, -lat)); }
export function girdleQ(o) { return mul(qa(Y, -g(o, 'prot')), qa(Z, g(o, 'elev'))); }
export function armDir(plane, elev) {
  const e = elev * D2R, p = plane * D2R;
  return new THREE.Vector3(Math.sin(e) * Math.cos(p), -Math.cos(e), Math.sin(e) * Math.sin(p));
}
// ώμος στο πλαίσιο του θώρακα: (plane, elev) δίνουν την κατεύθυνση του βραχιονίου, rot τη στροφή γύρω του
export function shoulderQ(R, o, girdle) {
  const d = armDir(g(o, 'plane'), g(o, 'elev', 10));
  const swing = new THREE.Quaternion().setFromUnitVectors(R.ua, d);
  return girdle.clone().invert().multiply(qa(d, -g(o, 'rot'))).multiply(swing);
}
export const elbowQ = (R, flex) => qa(R.elbowAxis, flex - R.elbowRest);
export const twistQ = (R, pron) => qa(R.fa, pron);
export const wristQ = (R, o) => mul(qa(R.wristAxis, g(o, 'flex')), qa(Z, g(o, 'dev')));
export const hipQ = (o) => mul(qa(X, -g(o, 'flex')), qa(Z, g(o, 'abd')), qa(Y, -g(o, 'rot')));
export const kneeQ = (R, flex) => qa(R.kneeAxis, flex - R.kneeRest);
export const ankleQ = (o) => mul(qa(X, -g(o, 'df')), qa(Z, -g(o, 'inv')));

// ------------------------------------------------------------------ IK δύο τμημάτων
// Από τη ρίζα S προς τον στόχο T, με μήκη l1, l2· ο μεσαίος σύνδεσμος (γόνατο/αγκώνας) γέρνει προς τον πόλο.
export function twoBone(S, T, l1, l2, pole) {
  const d = T.clone().sub(S);
  let D = d.length();
  const u = d.clone().normalize();
  D = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, D));
  const cosA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
  v.normalize();
  const M = S.clone().addScaledVector(u, cosA * l1).addScaledVector(v, sinA * l1);
  const end = S.clone().addScaledVector(u, D);
  return { M, end, reach: d.length() <= l1 + l2 };
}
