// Κορμός, μεταφορές, αυχένας.
import * as THREE from 'three';
import * as P from './props.js';
import {
  def, MOTIONS, SIDES, V, sg, other, FLOOR, MAT, D2R, lerp, smooth, X, Y, Z, over, under, Body, clamp,
  inHand, rest, BACK, TRUNK, stand, onSurface, plankSolve, hang, trunk, armsSag, armSag, dirToArm, armReach,
  feetPair, sway, breath, walkPath,
} from './lib.js';
import { quadruped } from './ex-legs.js';

const mat = (props, len = 1.9, z = 0) => props.add('mat', P.floorMat({ len, z }));
// χέρια σταυρωτά στο στήθος (παλάμες στους απέναντι ώμους)
function handsOnChest(B) {
  B.solve();
  const Rc = B.rot('chest');
  const fwd = V(0, 0, 1).applyQuaternion(Rc);
  for (const s of SIDES) {
    const T = B.pt('chest', V(-sg(s) * 0.085, 1.325 - (s === 'L' ? 0.0 : 0.035), 0.19)).addScaledVector(fwd, 0.02);
    B.girdle(s, { prot: 10, elev: 2 });
    B.reach(s, T, { at: 'palm', pole: V(sg(s) * 0.9, 0, 0.5).applyQuaternion(Rc), hand: { palm: fwd.clone().negate(), fingers: V(-sg(s), 0.45, 0).applyQuaternion(Rc).normalize() } });
    B.fingers(s, 0.2);
  }
}
// χέρια πίσω από το κεφάλι, αγκώνες ανοιχτοί
function handsBehindHead(B) {
  B.solve();
  const Rh = B.rot('head');
  for (const s of SIDES) {
    const T = B.pt('head', V(sg(s) * 0.035, 1.62, -0.075));
    B.girdle(s, { prot: -4, elev: 8 });
    B.reach(s, T, { at: 'palm', pole: V(sg(s), 0.05, -0.05).applyQuaternion(Rh), hand: { palm: V(0, 0, 1).applyQuaternion(Rh), fingers: V(-sg(s), 0.3, 0).applyQuaternion(Rh).normalize() } });
    B.fingers(s, 0.35);
  }
}
const armsAlongside = (B, prot = -4) => { for (const s of SIDES) { B.girdle(s, { prot }); B.arm(s, { plane: 84, elev: 14, rot: 0, elbow: 6, pron: 172 }); B.fingers(s, 0.05); } };

// ===== Σανίδα (plank) στους πήχεις
def('plank', {
  view: { az: 76, el: 12 },
  base: { hip: 0, sp: [0, 0, 0], nk: [-10, 0, 0] },
  keys: {
    setup: { hip: 16, sp: [4, 0, 0] },
    brace: { hip: 0, sp: [0, 0, 0] },
    hold: { hip: 0.5, sp: [0.5, 0, 0] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['brace', 1.0, 1, { act: 'iso' }], ['hold', 2.4, 2, { act: 'iso' }], ['brace', 2.4, 2, { act: 'iso' }]],
  loop: 2,
  setup: (props) => mat(props, 2.0, -0.3),
  pose(B, k, ctx) {
    plankSolve(B, { ...k, sp: [k.sp[0] - breath(ctx.t, 0.8), 0, 0] }, {
      toeZ: -1.02, surface: MAT,
      legs: (B, s, k) => B.leg(s, { flex: k.hip, abd: 4, knee: 2, df: 4 }),
      support: (B) => {
        for (const s of SIDES) {
          B.girdle(s, { prot: 6, elev: 0 });
          armSag(B, s, { flex: 98 - (0), abd: 2, rot: 0, elbow: 92, pron: 105, wflex: 0 });
          B.fingers(s, 0.6);
        }
        B.solve();
        const e = B.extreme(['forearm_L', 'forearm_R', 'twist_L', 'twist_R', 'hand_L', 'hand_R'], (x, y) => y);
        return e.v - MAT;
      },
    });
  },
});

// ===== Πλάγια σανίδα (στο δεξί πλευρό)
def('side_plank', {
  view: { az: -78, el: 14 },
  base: { up: 0 },
  keys: {
    setup: { up: 0 },
    up: { up: 1 },
    hold: { up: 1.01 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.2, 1, { act: 'con' }], ['hold', 2.6, 2, { act: 'iso' }], ['setup', 1.4, 2, { act: 'ecc', hold: 0.4 }]],
  loop: 1,
  setup: (props) => mat(props, 2.0, -0.3),
  pose(B, k, ctx) {
    const u = smooth(clamp(k.up, 0, 1));
    const base = new THREE.Quaternion().setFromAxisAngle(Z, 90 * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(X, -90 * D2R));
    const solveAt = (a) => {
      const q = new THREE.Quaternion().setFromAxisAngle(X, a * D2R).multiply(base);
      B.root(V(0, 1, 0), q);
      // γοφοί κάτω: πλάγια κάμψη προς το έδαφος
      B.spine(-breath(ctx.t, 0.6), -18 * (1 - u), 0);
      B.neck(0, 6 + 10 * (1 - u), 0);
      B.leg('R', { flex: 2, abd: 2, knee: 2, df: 4 });
      B.leg('L', { flex: 2, abd: -4, knee: 2, df: 4 });
      B.girdle('R', { elev: 8, prot: 4 });
      armSag(B, 'R', { flex: 0, abd: 90, rot: 0, elbow: 90, pron: 100 });
      B.fingers('R', 0.5);
      B.girdle('L', { elev: 0 });
      B.arm('L', { plane: 10, elev: lerp(20, 8, u), rot: 0, elbow: 60, pron: 60 });
      B.fingers('L', 0.1);
      B.solve();
      const f = B.extreme(['foot_R', 'toes_R', 'foot_L'], (x, y) => y);
      B.root(V(0, 1 - f.v + MAT, 0.62 - f.p.z), q);
      B.solve();
      const e = B.extreme(['forearm_R', 'twist_R', 'hand_R'], (x, y) => y);
      return e.v - MAT;
    };
    // ο πήχης στηρίζει πάντα το σώμα (στο έδαφος) με τα πόδια στο έδαφος· κάτω οι γοφοί «κρεμούν» (πλάγια κάμψη)
    let lo = 0, hi = 45;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (solveAt(m) > 0) hi = m; else lo = m; }
    solveAt((lo + hi) / 2);
    const hp = B.extreme(['pelvis', 'thigh_R'], (x, y) => y);
    if (hp.v < MAT) { B.rig.rootPos.y += MAT - hp.v; B.solve(); }
  },
});

// ===== Κοιλιακοί: crunch, sit-up, reverse crunch, bicycle
def('crunch', {
  view: { az: 64, el: 20 },
  base: { pitch: -90, z: 0.2, sp: [0, 0, 0], nk: [6, 0, 0] },
  keys: {
    setup: { sp: [0, 0, 0], nk: [6, 0, 0] },
    up: { sp: [34, 0, 0], nk: [18, 0, 0], pitch: -93 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.1, 1, { act: 'con', hold: 0.45 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup: (props) => mat(props, 1.9, -0.2),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: BACK, n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.14, MAT, 0.62), { yaw: 4, pole: V(sg(s) * 0.15, 1, 0.2) });
        handsOnChest(B);
      },
    });
  },
});
def('sit_up', {
  view: { az: 66, el: 14 },
  base: { pitch: -90, z: 0.2, sp: [0, 0, 0], nk: [6, 0, 0] },
  keys: {
    down: { pitch: -90, sp: [0, 0, 0], nk: [6, 0, 0] },
    curl: { pitch: -80, sp: [36, 0, 0], nk: [20, 0, 0] },
    up: { pitch: -24, sp: [16, 0, 0], nk: [8, 0, 0] },
    roll1: { pitch: -58, sp: [40, 0, 0], nk: [16, 0, 0] },
    roll2: { pitch: -84, sp: [26, 0, 0], nk: [14, 0, 0] },
  },
  seq: [['down', 1.4, 0, { act: 'setup' }], ['curl', 0.7, 1, { act: 'con', via: true }], ['up', 0.9, 1, { act: 'con', hold: 0.3 }], ['roll1', 1.0, 2, { act: 'ecc', via: true }], ['roll2', 0.9, 2, { act: 'ecc', via: true }], ['down', 0.7, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup: (props) => mat(props, 1.9, -0.2),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: BACK, n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.14, MAT, 0.6), { yaw: 4, pole: V(sg(s) * 0.15, 1, 0.2) });
        handsOnChest(B);
      },
    });
  },
});
def('reverse_crunch', {
  view: { az: 72, el: 16 },
  base: { c: 0, nk: [4, 0, 0] },
  keys: {
    setup: { c: 0 },
    curl: { c: 1 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['curl', 1.2, 1, { act: 'con', hold: 0.4 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup: (props) => mat(props, 1.9, -0.2),
  pose(B, k, ctx) {
    const d = 38 * smooth(k.c);
    onSurface(B, { pitch: -90 - d, sp: [d, 0, 0], nk: k.nk, z: 0.15 }, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: ['chest', 'girdle_L', 'girdle_R', 'head', 'spine2'], n: Y, d: MAT }],
      limbs: (B, kk, ph) => {
        if (ph !== 'pre') return;
        for (const s of SIDES) B.leg(s, { flex: 96 + 14 * smooth(k.c), abd: 4, knee: 98, df: -20 });
        armsAlongside(B);
      },
    });
    const pv = B.extreme(['pelvis'], (x, y) => y);
    if (pv.v < MAT) { B.rig.rootPos.y += MAT - pv.v; B.solve(); }
  },
});
def('bicycle_crunch', {
  view: { az: 52, el: 26 },
  base: { pitch: -91, z: 0.15, sp: [24, 0, 0], nk: [16, 0, 0], hL: [60, 70], hR: [60, 70] },
  keys: {
    setup: { sp: [8, 0, 0], nk: [8, 0, 0], hL: [70, 80], hR: [70, 80] },
    left: { sp: [28, 0, -34], hR: [112, 108], hL: [38, 10] },
    right: { sp: [28, 0, 34], hL: [112, 108], hR: [38, 10] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['left', 1.2, 1, { act: 'con', hold: 0.25 }], ['right', 1.5, 2, { act: 'con', hold: 0.25 }], ['left', 1.5, 2, { act: 'con', hold: 0.25 }]],
  loop: 2,
  setup: (props) => mat(props, 1.9, -0.2),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.2,
      contacts: () => [{ bones: ['pelvis', 'spine1', 'spine2'], n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) { const h = k['h' + s]; B.leg(s, { flex: h[0], abd: 4, knee: h[1], df: -10 }); } return; }
        if (ph === 'post') handsBehindHead(B);
      },
    });
  },
});

// ===== Ανυψώσεις ποδιών
def('hanging_leg_raise', {
  view: { az: 66, el: 6 },
  frameProps: false,
  base: { lift: 0, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], gel: 24, legs: 0 },
  keys: {
    hang: { legs: 0 },
    up: { legs: 1, pitch: -12, sp: [18, 0, 0], nk: [6, 0, 0], gel: 18 },
  },
  seq: [['hang', 1.4, 0, { act: 'setup' }], ['up', 1.3, 1, { act: 'con', hold: 0.4 }], ['hang', 2.0, 2, { act: 'ecc', hold: 0.4 }]],
  loop: 1,
  setup(props) { props.add('bar', P.pullupBar({ y: 2.3, w: 1.5 })); },
  pose(B, k, ctx) {
    const u = smooth(k.legs);
    hang(B, k, {
      t: ctx.t, hand: (s) => V(sg(s) * 0.36, 2.3, 0), pole: (s) => V(sg(s) * 0.85, -0.6, -0.15), grip: (s) => ({ axis: over(s, X), flex: -6 }),
      legs: (B) => { for (const s of SIDES) B.leg(s, { flex: lerp(4, 96, u), abd: 3, knee: lerp(6, 24, u), df: -12 }); },
    });
  },
});
def('lying_leg_raise', {
  view: { az: 70, el: 14 },
  base: { pitch: -90, z: 0.1, sp: [0, 0, 0], nk: [4, 0, 0], hip: 6 },
  keys: {
    setup: { hip: 0 },
    up: { hip: 90, sp: [3, 0, 0] },
    low: { hip: 8 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['low', 0.6, 0, { act: 'iso' }], ['up', 1.4, 1, { act: 'con', hold: 0.3 }], ['low', 2.2, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 2,
  setup: (props) => mat(props, 1.9, -0.1),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: BACK, n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'pre') return;
        for (const s of SIDES) B.leg(s, { flex: k.hip, abd: 2, knee: 2, df: -10 });
        armsAlongside(B);
      },
    });
  },
});

// ===== Russian twist
def('russian_twist', {
  view: { az: 30, el: 16 },
  base: { tw: 0 },
  keys: {
    setup: { tw: 0, lean: 0.7 },
    lean: { tw: 0, lean: 1 },
    left: { tw: 1, lean: 1 },
    right: { tw: -1, lean: 1 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['lean', 0.8, 0, { act: 'iso' }], ['left', 0.9, 1, { act: 'con', hold: 0.15 }], ['right', 1.3, 2, { act: 'con', hold: 0.15 }], ['left', 1.3, 2, { act: 'con', hold: 0.15 }]],
  loop: 3,
  setup(props, env) { mat(props, 1.6, 0.1); env.plate = props.add('plate', P.plate(0.15)); },
  pose(B, k, ctx) {
    const tw = k.tw;
    const lean = 45 * (k.lean ?? 1);
    trunk(B, { pitch: -lean, sp: [2, 0, 38 * tw], nk: [10, 0, 22 * tw] }, V(0, 0.5, 0), { t: ctx.t, breathe: 0.3 });
    for (const s of SIDES) B.leg(s, { flex: 70 + lean * 0.6, abd: 10, knee: 92, df: -6 });
    rest(B, [{ bones: ['pelvis', 'spine1'], n: Y, d: MAT }]);
    for (const s of SIDES) B.plant(s, V(sg(s) * 0.13, MAT + 0.002, 0.58), { yaw: 6, pitch: -14, pole: V(sg(s) * 0.4, 1, 0.3) });
    B.solve();
    const c = B.pt('chest', V(0, 1.12, 0.36));
    ctx.env.plateAt = c;
    ctx.env.plateU = V(1, 0, 0).applyQuaternion(B.rot('chest'));
    for (const s of SIDES) {
      B.girdle(s, { prot: 12 });
      B.reach(s, c.clone().addScaledVector(ctx.env.plateU, sg(s) * 0.15), { at: 'palm', pole: V(sg(s), -0.6, -0.2), hand: { palm: ctx.env.plateU.clone().multiplyScalar(-sg(s)), fingers: V(0, 1, 0) } });
      B.fingers(s, 0.4);
    }
  },
  update(props, B, k, env) { env.plate.position.copy(env.plateAt); env.plate.quaternion.setFromUnitVectors(X, V(0, 0, 1).applyQuaternion(B.rot('chest'))); },
});

// ===== Ροδάκι κοιλιακών (ab wheel)
def('ab_wheel', {
  view: { az: 74, el: 12 },
  base: { th: 0, hip: 74, sp: [6, 0, 0], nk: [-8, 0, 0] },
  keys: {
    kneel: { th: 0, hip: 74, sp: [6, 0, 0] },
    out: { th: 52, hip: 18, sp: [2, 0, 0], nk: [-10, 0, 0] },
  },
  seq: [['kneel', 1.4, 0, { act: 'setup' }], ['out', 2.0, 1, { act: 'ecc', hold: 0.3 }], ['kneel', 1.5, 2, { act: 'con', hold: 0.3 }]],
  loop: 1,
  setup(props, env) { mat(props, 2.2, 0.4); env.wheel = props.add('wheel', P.abWheel()); },
  pose(B, k, ctx) {
    const th = k.th * D2R;
    const lth = B.side.L.la.length();
    const knee = V(0, MAT + 0.075, 0.0);
    B.root(knee.clone().add(V(0, Math.cos(th) * lth, Math.sin(th) * lth)), Body.trunkQ(k.th + k.hip, 0, 0));
    B.spine(k.sp[0] - breath(ctx.t, 0.3), 0, 0);
    B.neck(k.nk[0], 0, 0);
    const qf = new THREE.Quaternion().setFromAxisAngle(X, 168 * D2R);
    for (const s of SIDES) { B.footTo(s, V(sg(s) * 0.1, MAT + 0.075, -0.42), qf, B.side[s].A, V(0, -1, 0.15)); B.toes(s, 0); }
    B.solve();
    // ο τροχός εκεί που φτάνουν τα τεντωμένα χέρια
    const S = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
    const L = armReach(B, 'L', 4);
    const hy = MAT + 0.09;
    const wz = S.z + Math.sqrt(Math.max(0.0004, L * L - (S.y - hy) ** 2 - 0.0016));
    ctx.env.wheelAt = V(0, hy, wz);
    for (const s of SIDES) {
      B.girdle(s, { prot: 8, elev: 0.14 * Math.max(0, (k.th + k.hip) - 35) * 0.5 });
      B.reach(s, V(sg(s) * 0.13, hy, wz), { pole: V(sg(s) * 0.3, 0.6, -1), hand: { axis: over(s, X), flex: -6 } });
      B.fingers(s, 1);
    }
  },
  update(props, B, k, env) { env.wheel.position.copy(env.wheelAt); },
});

// ===== Dead bug, hollow hold
def('dead_bug', {
  view: { az: 58, el: 26 },
  base: { pitch: -90, z: 0.15, sp: [0, 0, 0], nk: [6, 0, 0], aL: 90, aR: 90, hL: 90, hR: 90, kL: 90, kR: 90 },
  keys: {
    setup: { pitch: -90, sp: [0, 0, 0] },
    press: { pitch: -94, sp: [4, 0, 0] },
    extL: { pitch: -94, sp: [4, 0, 0], aR: 168, hL: 16, kL: 6 },
    extR: { pitch: -94, sp: [4, 0, 0], aL: 168, hR: 16, kR: 6 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['press', 0.9, 1, { act: 'iso' }], ['extL', 1.6, 2, { act: 'ecc', hold: 0.2 }], ['press', 1.3, 3, { act: 'con', hold: 0.2 }], ['extR', 1.6, 2, { act: 'ecc', hold: 0.2 }], ['press', 1.3, 3, { act: 'con', hold: 0.2 }]],
  loop: 2,
  setup: (props) => mat(props, 1.9, -0.1),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: BACK, n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'pre') return;
        for (const s of SIDES) {
          B.leg(s, { flex: k['h' + s], abd: 3, knee: k['k' + s], df: -10 });
          B.girdle(s, { prot: 6, elev: 0.1 * Math.max(0, k['a' + s] - 90) });
          armSag(B, s, { flex: k['a' + s], abd: 2, rot: 0, elbow: 4, pron: 90 });
          B.fingers(s, 0.15);
        }
      },
    });
  },
});
def('hollow_hold', {
  view: { az: 68, el: 14 },
  base: { pitch: -90, z: 0.1, sp: [0, 0, 0], nk: [0, 0, 0], h: 0, a: 172 },
  keys: {
    setup: { pitch: -90, sp: [0, 0, 0], h: 0 },
    press: { pitch: -96, sp: [6, 0, 0], h: 0 },
    hollow: { pitch: -98, sp: [20, 0, 0], nk: [12, 0, 0], h: 22, a: 172 },
    hold: { pitch: -98, sp: [20.5, 0, 0], nk: [12, 0, 0], h: 21, a: 172 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['press', 0.9, 0, { act: 'iso' }], ['hollow', 1.2, 1, { act: 'con' }], ['hold', 2.6, 2, { act: 'iso' }], ['hollow', 1.4, 2, { act: 'iso' }]],
  loop: 3,
  setup: (props) => mat(props, 2.0, -0.2),
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [{ bones: ['pelvis', 'spine1', 'spine2', 'chest', 'girdle_L', 'girdle_R', 'shank_L', 'shank_R', 'foot_L', 'foot_R'], n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'pre') return;
        for (const s of SIDES) {
          B.leg(s, { flex: k.h, abd: 2, knee: 2, df: -20 });
          B.girdle(s, { prot: 4, elev: 16 });
          armSag(B, s, { flex: k.a, abd: 6, rot: 0, elbow: 4, pron: 90 });
          B.fingers(s, 0.1);
        }
      },
    });
  },
});

// ===== Bird dog
def('bird_dog', {
  view: { az: 64, el: 22 },
  base: { aL: 0, lR: 0, aR: 0, lL: 0 },
  keys: {
    setup: {},
    reachA: { aR: 1, lL: 1 },
    holdA: { aR: 1.01, lL: 1.01 },
    reachB: { aL: 1, lR: 1 },
    holdB: { aL: 1.01, lR: 1.01 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['reachA', 1.2, 1, { act: 'con' }], ['holdA', 1.8, 2, { act: 'iso' }], ['setup', 1.1, 2, { act: 'ecc' }], ['reachB', 1.2, 1, { act: 'con' }], ['holdB', 1.8, 2, { act: 'iso' }], ['setup', 1.1, 2, { act: 'ecc' }]],
  loop: 1,
  setup: (props) => mat(props, 1.7, 0.15),
  pose(B, k, ctx) {
    const env = ctx.env;
    if (env.hz === undefined) { quadruped(B, { sp: [0, 0, 0], nk: [-14, 0, 0] }, ctx); env.hz = B.pivot('upperarm_L').z + 0.04; B.reset(); }
    quadruped(B, { sp: [0, 0, 0], nk: [-14 + 6 * Math.max(k.aL, k.aR), 0, 0] }, ctx, {
      handsZ: env.hz,
      leg: (s, k2, pitch) => {
        const u = smooth(clamp(k['l' + s], 0, 1));
        return u > 0.001 ? { flex: lerp(90 - (pitch - 80), -14, u), abd: 2, knee: lerp(92, 4, u), df: lerp(-65, -15, u), free: true } : null;
      },
      arm: (s) => {
        const u = smooth(clamp(k['a' + s], 0, 1));
        return u > 0.001 ? { u, pose: { flex: 172, abd: 3, rot: 0, elbow: 6, pron: 90 } } : null;
      },
    });
  },
});

// ===== Pallof press, woodchop
const PAL = { x: 0.95, y: 1.22 };
def('pallof_press', {
  view: { az: -30, el: 30 },
  frameProps: false,
  base: { y: 0.82, pitch: 2, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.36, toe: 8, p: 0 },
  keys: {
    setup: { p: 0 },
    out: { p: 1 },
    hold: { p: 1.0 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['out', 1.0, 1, { act: 'con' }], ['hold', 1.8, 2, { act: 'iso' }], ['setup', 1.1, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup(props, env) {
    const t = P.cableTower({ x: PAL.x + 0.12, z: 0.25, y: PAL.y, face: V(-1, 0, 0) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.cable = props.add('cable', P.line(0.004));
    env.handle = props.add('handle', P.rod(0.13, 0.017, P.MAT.black));
  },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      upper: (B, k) => {
        B.solve();
        const p = smooth(clamp(k.p, 0, 1));
        const ch = B.pt('chest', V(0, 1.24, 0.25));
        const S = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
        const L = armReach(B, 'L', 6);
        const out = V(0, ch.y, S.z + Math.sqrt(Math.max(0.01, L * L - (ch.y - S.y) ** 2 - 0.03)));
        const c = ch.lerp(out, p);
        ctx.env.h = c;
        for (const s of SIDES) {
          B.girdle(s, { prot: 6 * p });
          B.reach(s, c.clone().add(V(sg(s) * 0.045, 0, 0)), { pole: V(sg(s), -1, -0.2), hand: { axis: V(0, 1, 0.1).normalize(), flex: 0 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    env.handle.position.copy(c);
    env.handle.quaternion.setFromUnitVectors(X, Y);
    P.setLine(env.cable, env.pulley, c);
  },
});
const WC = { x: 0.95, y: 2.0, z: 0.15 };
def('woodchop', {
  view: { az: 14, el: 10 },
  frameProps: false,
  base: { y: 0.84, pitch: 4, sp: [0, 0, 40], yaw: 16, nk: [0, 0, 20], stance: 0.44, p: 0 },
  keys: {
    setup: { p: 0, sp: [0, 0, 40], yaw: 16, nk: [0, 0, 20] },
    chop: { p: 1, y: 0.79, pitch: 18, sp: [8, 0, -40], yaw: -18, nk: [6, 0, -20] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['chop', 1.1, 1, { act: 'con', hold: 0.3 }], ['setup', 1.9, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props, env) {
    const t = P.cableTower({ x: WC.x + 0.12, z: WC.z, y: WC.y, face: V(-1, 0, 0) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.cable = props.add('cable', P.line(0.004));
    env.handle = props.add('handle', P.rod(0.13, 0.017, P.MAT.black));
  },
  pose(B, k, ctx) {
    const p = smooth(clamp(k.p, 0, 1));
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ L: { at: V(0.22, FLOOR, 0), yaw: 10 }, R: { at: V(-0.22, FLOOR, 0), yaw: lerp(10, 40, p), lift: 22 * p } }),
      upper: (B, k) => {
        // χέρια σχεδόν τεντωμένα και ενωμένα· την κίνηση στο πλάι την κάνει η στροφή του κορμού
        for (const s of SIDES) {
          B.girdle(s, { prot: 8, elev: lerp(12, 0, p) });
          armSag(B, s, { flex: lerp(128, 34, p), abd: s === 'L' ? lerp(-16, -26, p) : lerp(-26, -16, p), rot: 0, elbow: 14, pron: 92, wflex: 0 });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    env.handle.position.copy(c);
    env.handle.quaternion.setFromUnitVectors(X, B.grip('L').sub(B.grip('R')).normalize());
    P.setLine(env.cable, env.pulley, c);
  },
});

// ===== Mountain climbers
def('mountain_climbers', {
  view: { az: 70, el: 14 },
  base: { hL: [4, 0], hR: [4, 0], sp: [0, 0, 0], nk: [-12, 0, 0] },
  keys: {
    setup: { hL: [0, 0], hR: [0, 0] },
    mid: { hL: [4, 0], hR: [4, 0] },
    liftL: { hL: [34, 96], hR: [5, 0] },
    inL: { hL: [106, 136], hR: [6, 0] },
    liftR: { hR: [34, 96], hL: [5, 0] },
    inR: { hR: [106, 136], hL: [6, 0] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['mid', 0.4, 0, { act: 'iso' }],
    ['liftL', 0.16, 1, { act: 'con', via: true }], ['inL', 0.18, 1, { act: 'con' }], ['liftL', 0.16, 1, { act: 'con', via: true }], ['mid', 0.16, 2, { act: 'iso' }],
    ['liftR', 0.16, 1, { act: 'con', via: true }], ['inR', 0.18, 1, { act: 'con' }], ['liftR', 0.16, 1, { act: 'con', via: true }], ['mid', 0.16, 2, { act: 'iso' }]],
  loop: 2,
  setup: (props) => mat(props, 2.0, -0.25),
  pose(B, k, ctx) {
    const env = ctx.env;
    const handsAt = (s) => V(sg(s) * 0.27, MAT, env.hz + 0.02);
    const straight = (B) => {
      let worst = -Infinity;
      for (const s of SIDES) { const S = B.pivot('upperarm_' + s); worst = Math.max(worst, B.side[s].a.length() + B.side[s].b.length() + 0.07 - S.distanceTo(handsAt(s))); }
      return -worst;
    };
    if (env.hz === undefined) {
      plankSolve(B, { sp: [0, 0, 0], nk: [-12, 0, 0] }, { toeZ: -0.98, surface: MAT, support: (B) => { B.solve(); return B.pivot('upperarm_L').y - 0.62; } });
      env.hz = B.pivot('upperarm_L').z;
      B.reset();
    }
    plankSolve(B, k, {
      toeZ: -0.98, surface: MAT,
      legs: (B, s, k) => { const h = k['h' + s]; B.leg(s, { flex: h[0], abd: 4, knee: h[1] + 2, df: lerp(4, -10, smooth(h[0] / 40)) }); },
      feet: (k) => (k.hL[0] < k.hR[0] - 1 ? ['toes_L', 'foot_L'] : k.hR[0] < k.hL[0] - 1 ? ['toes_R', 'foot_R'] : null),
      support: (B) => { for (const s of SIDES) B.girdle(s, { prot: 6 }); B.solve(); return straight(B); },
    });
    for (const s of SIDES) {
      B.girdle(s, { prot: 6 });
      B.reach(s, handsAt(s), { at: 'palm', pole: V(sg(s) * 0.7, 0.35, -0.75), hand: { palm: V(0, -1, 0), fingers: V(sg(s) * 0.12, 0.1, 1).normalize() } });
      B.fingers(s, -0.25);
    }
  },
});

// ===== Πλάγιες κάμψεις με αλτήρα (με αλλαγή χεριού)
def('side_bend', {
  view: { az: 12, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.3, hand: 0, pass: 0 },
  keys: {
    setup: { hand: 0 },
    downL: { sp: [2, 26, 0], nk: [0, 6, 0], hand: 0 },
    upL: { sp: [0, -4, 0], hand: 0 },
    pass: { sp: [2, 0, 0], hand: 0.5, pass: 1 },
    holdR: { hand: 1, pass: 0 },
    downR: { sp: [2, -26, 0], nk: [0, -6, 0], hand: 1 },
    upR: { sp: [0, 4, 0], hand: 1 },
    passB: { sp: [2, 0, 0], hand: 0.5, pass: 1 },
    holdL: { hand: 0, pass: 0 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['downL', 1.5, 1, { act: 'ecc' }], ['upL', 1.3, 1, { act: 'con', hold: 0.2 }], ['downL', 1.5, 1, { act: 'ecc' }], ['upL', 1.3, 1, { act: 'con', hold: 0.2 }],
    ['pass', 0.9, 2, { act: 'rest' }], ['holdR', 0.9, 2, { act: 'rest' }], ['downR', 1.5, 1, { act: 'ecc' }], ['upR', 1.3, 1, { act: 'con', hold: 0.2 }], ['downR', 1.5, 1, { act: 'ecc' }], ['upR', 1.3, 1, { act: 'con', hold: 0.2 }],
    ['passB', 0.9, 2, { act: 'rest' }], ['holdL', 0.9, 2, { act: 'rest' }]],
  loop: 1,
  setup(props, env) { env.db = props.add('db', P.dumbbell()); },
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t, balanceX: true,
      upper: (B, k) => {
        const pass = smooth(clamp(k.pass, 0, 1));
        // τα χέρια κρέμονται με τη βαρύτητα (ο αλτήρας γλιστρά στο πλάι του μηρού), όχι μαζί με τον κορμό
        for (const s of SIDES) {
          B.girdle(s, { elev: 0 });
          const d = dirToArm(B, V(sg(s) * 0.05, -1, 0.03), s);
          B.arm(s, { plane: d.plane, elev: d.elev, rot: 0, elbow: 8, pron: 88 });
          B.fingers(s, 1);
        }
        // το ελεύθερο χέρι στη μέση (παλάμη στη λαγόνια ακρολοφία, αγκώνας προς τα έξω)
        for (const s of SIDES) {
          const free = s === 'L' ? clamp((k.hand - 0.5) * 2, 0, 1) : clamp((0.5 - k.hand) * 2, 0, 1);
          const u = smooth(free) * (1 - pass);
          if (u < 0.001) continue;
          B.solve();
          const P0 = B.palm(s);
          const P1 = B.pt('pelvis', V(sg(s) * 0.143, 1.0, 0.035));
          const T = P0.lerp(P1, u).add(V(sg(s) * 0.05 * Math.sin(Math.PI * u), 0, 0));
          B.reach(s, T, {
            at: 'palm', pole: 'keep', poleTo: V(sg(s), 0, -0.55), poleU: u,
            hand: { palm: V(-sg(s), 0, 0), fingers: V(0, -0.35, 1), mix: { fk: { pron: 88 }, u: 1 - u } },
          });
          B.fingers(s, lerp(1, 0.15, u));
        }
        if (pass > 0.001) {
          B.solve();
          const front = B.pt('pelvis', V(0, 0.98, 0.24));
          for (const s of SIDES) {
            const fk = B.grip(s);
            B.reach(s, fk.lerp(front.clone().add(V(sg(s) * 0.07, 0, 0)), pass), { pole: 'keep', hand: 'keep' });
          }
        }
        B.solve();
        env.dbHand = k.hand;
      },
      loads: () => [{ p: B.grip(k.hand < 0.5 ? 'L' : 'R'), kg: 20 }],
    });
  },
  update(props, B, k, env) {
    const h = clamp(env.dbHand, 0, 1);
    if (h <= 0.01) inHand(env.db, B, 'L');
    else if (h >= 0.99) inHand(env.db, B, 'R');
    else {
      const l = B.grip('L'), r = B.grip('R');
      env.db.position.copy(l.lerp(r, smooth(h)));
      env.db.quaternion.setFromUnitVectors(X, V(0, 0, 1));
    }
  },
});

// ===== Βάδισμα με βάρη (farmer's walk, suitcase carry): η κάμερα ακολουθεί
const GAIT = { S: 1.0, w: 0.2, lift: 0.06 };
// k.ph: φάση βαδίσματος (κύκλοι, κομμάτια segs), k.pick: χέρια προς τα βάρη στο έδαφος,
// k.held: τα βάρη στα χέρια (≥ 0,5), k.hand: 0 = το βάρος στο αριστερό, 1 = στο δεξί (μόνο για ένα βάρος),
// k.pass: τα χέρια μπροστά για αλλαγή χεριού.
function walkPose(B, k, ctx, { both = true, kg = 24, segs }) {
  const env = ctx.env;
  const g = walkPath(k.ph || 0, segs, GAIT);
  const v = g.v;
  env.zRoot = g.root;
  const kk = { ...k, x: g.sway, z: g.root + (k.z || 0), y: (k.y ?? 0.85) + g.bob - 0.02 * v, yaw: g.rot * 0.5, sp: [k.sp?.[0] ?? 0, k.sp?.[1] ?? 0, -g.rot * 0.9] };
  const loadedSide = (s) => both || (s === 'L' ? (k.hand ?? 0) < 0.5 : (k.hand ?? 0) >= 0.5);
  // ισορροπία όσο στέκεται· σβήνει μόλις ξεκινά το βάδισμα
  const bal = 1 - smooth(clamp(v * 4, 0, 1));
  stand(B, kk, {
    t: ctx.t, balance: bal > 0.001, balanceMix: bal,
    feet: () => ({ L: { step: g.L }, R: { step: g.R } }),
    upper: (B) => {
      const pick = smooth(clamp(k.pick ?? 0, 0, 1)), pass = smooth(clamp(k.pass ?? 0, 0, 1));
      for (const s of SIDES) {
        const loaded = loadedSide(s);
        B.girdle(s, { elev: loaded ? -3 : 0, prot: 0 });
        if (loaded) B.arm(s, { plane: 92, elev: 4, rot: 0, elbow: 6, pron: 86 });
        else {
          // το ελεύθερο χέρι αιωρείται αντίθετα από το πόδι της ίδιας πλευράς
          const swing = s === 'L' ? g.armL : g.armR;
          armSag(B, s, { flex: swing, abd: 7, rot: 0, elbow: 16 + Math.max(0, swing) * 0.6, pron: 86 });
        }
        B.fingers(s, loaded ? 1 : lerp(0.25, 1, pass));
      }
      if (pick > 0.001 || pass > 0.001) {
        B.solve();
        const front = B.pt('pelvis', V(0, 0.98, 0.24));
        for (const s of SIDES) {
          const fk = B.grip(s);
          let T = fk;
          if (pick > 0.001) T = fk.clone().lerp(V(sg(s) * 0.28, 0.065, g.root + 0.04), pick);
          if (pass > 0.001) T = T.clone().lerp(front.clone().add(V(sg(s) * 0.06, 0, 0)), pass);
          B.reach(s, T, { pole: 'keep', hand: 'keep' });
        }
      }
    },
    loads: () => SIDES.filter(loadedSide).map((s) => ({ p: B.grip(s), kg })),
  });
}
function weightAt(obj, B, s, env, k) {
  if ((k.held ?? 1) >= 0.5) inHand(obj, B, s);
  else { obj.position.set(sg(s) * 0.28, 0.065, env.zRoot + 0.04); obj.quaternion.setFromUnitVectors(X, V(0, 0, 1)); }
}
def('farmers_walk', {
  view: { az: 62, el: 10 },
  follow: true,
  base: { ph: 0, pick: 0, held: 1, y: 0.85, pitch: 0, sp: [-2, 0, 0], nk: [0, 0, 0] },
  keys: {
    stand: { ph: 0, pick: 0, held: 0 },
    down: { ph: 0, pick: 1, held: 0, y: 0.55, pitch: 34, sp: [0, 0, 0], nk: [-10, 0, 0] },
    grab: { ph: 0, pick: 1, held: 1, y: 0.55, pitch: 34, sp: [0, 0, 0], nk: [-10, 0, 0] },
    up: { ph: 0, pick: 0, held: 1 },
    walked: { ph: 3, held: 1 },
    set: { ph: 3, pick: 1, held: 1, y: 0.55, pitch: 34, sp: [0, 0, 0], nk: [-10, 0, 0] },
    release: { ph: 3, pick: 1, held: 0, y: 0.55, pitch: 34, sp: [0, 0, 0], nk: [-10, 0, 0] },
    done: { ph: 3, pick: 0, held: 0 },
  },
  // μικρά, γρήγορα βήματα (≈ 2 βήματα/δευτ.)
  seq: [['stand', 1.0, 0, { act: 'setup' }], ['down', 1.3, 0, { act: 'ecc' }], ['grab', 0.25, 0, { act: 'iso' }], ['up', 1.3, 0, { act: 'con', hold: 0.3 }],
    ['walked', 3.2, 1, { act: 'iso', ease: 'lin', hold: 0.3 }],
    ['set', 1.3, 2, { act: 'ecc' }], ['release', 0.25, 2, { act: 'iso' }], ['done', 1.2, 2, { act: 'rest', hold: 0.4 }]],
  loop: 1,
  setup(props, env) { env.db = { L: props.add('dbL', P.dumbbell({ r: 0.07, w: 0.07 })), R: props.add('dbR', P.dumbbell({ r: 0.07, w: 0.07 })) }; },
  pose(B, k, ctx) { walkPose(B, k, ctx, { both: true, segs: [[0, 3]] }); },
  update(props, B, k, env) { for (const s of SIDES) weightAt(env.db[s], B, s, env, k); },
});
// αρχή και τέλος στο ίδιο σημείο του κύκλου (ph ακέραιο): η επανάληψη ξεκινά από ph = 0 και η κάμερα
// ακολουθεί το σώμα, οπότε το άλμα πίσω δεν φαίνεται
def('suitcase_carry', {
  view: { az: 30, el: 10 },
  follow: true,
  base: { ph: 0, hand: 0, pass: 0, y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0] },
  keys: {
    stand: { ph: 0, hand: 0 },
    walked: { ph: 2, hand: 0 },
    passL: { ph: 2, hand: 0, pass: 1 },
    passR: { ph: 2, hand: 1, pass: 1 },
    holdR: { ph: 2, hand: 1, pass: 0 },
    walkedR: { ph: 4, hand: 1 },
    passR2: { ph: 4, hand: 1, pass: 1 },
    passL2: { ph: 4, hand: 0, pass: 1 },
    end: { ph: 4, hand: 0, pass: 0 },
  },
  seq: [['stand', 1.3, 0, { act: 'setup' }], ['walked', 2.3, 1, { act: 'iso', ease: 'lin', hold: 0.3 }],
    ['passL', 0.8, 2, { act: 'rest' }], ['passR', 0.4, 2, { act: 'rest' }], ['holdR', 0.8, 2, { act: 'rest', hold: 0.2 }],
    ['walkedR', 2.3, 1, { act: 'iso', ease: 'lin', hold: 0.3 }],
    ['passR2', 0.8, 2, { act: 'rest' }], ['passL2', 0.4, 2, { act: 'rest' }], ['end', 0.8, 2, { act: 'rest', hold: 0.2 }]],
  loop: 1,
  setup(props, env) { env.db = props.add('kb', P.kettlebell({ r: 0.1 })); },
  pose(B, k, ctx) { walkPose(B, k, ctx, { both: false, segs: [[0, 2], [2, 4]] }); },
  update(props, B, k, env) {
    const h = clamp(k.hand ?? 0, 0, 1);
    const l = B.grip('L'), r = B.grip('R');
    const c = h <= 0.01 ? l : h >= 0.99 ? r : l.clone().lerp(r, smooth(h));
    const s = h < 0.5 ? 'L' : 'R';
    const fa = B.pivot('hand_' + s).sub(B.pivot('forearm_' + s)).normalize();
    const down = fa.lerp(V(0, -1, 0), 0.3).normalize();
    const m = new THREE.Matrix4().makeBasis(V(0, 0, 1), down.clone().negate(), V(0, 0, 1).cross(down.clone().negate()).normalize());
    env.db.position.copy(c);
    env.db.quaternion.setFromRotationMatrix(m);
  },
});

// ===== Stomach vacuum
def('stomach_vacuum', {
  view: { az: 50, el: 6, zoom: 1.5, focus: 'spine2' },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], g: 0 },
  keys: {
    setup: { sp: [0, 0, 0], g: 0 },
    inhale: { sp: [-5, 0, 0], g: 5, nk: [-3, 0, 0] },
    exhale: { sp: [5, 0, 0], g: -3, nk: [3, 0, 0] },
    hold: { sp: [4.5, 0, 0], g: -3, nk: [3, 0, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['inhale', 1.4, 1, { act: 'rest' }], ['exhale', 2.0, 1, { act: 'iso' }], ['hold', 3.0, 2, { act: 'iso' }], ['setup', 1.4, 2, { act: 'rest', hold: 0.4 }]],
  loop: 1,
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, breathe: 0,
      upper: (B, k) => { for (const s of SIDES) { B.girdle(s, { elev: k.g, prot: -k.g * 0.4 }); B.arm(s, { plane: 70, elev: 22, rot: 10, elbow: 70, pron: 60 }); B.fingers(s, 0.2); } B.solve(); for (const s of SIDES) { const hip = B.pt('pelvis', V(sg(s) * 0.16, 0.97, 0.05)); B.reach(s, hip, { at: 'palm', pole: V(sg(s), 0, -0.4), hand: { palm: V(-sg(s), 0, 0), fingers: V(0, -0.3, 1).normalize() } }); } },
    });
  },
});

// ===== Αυχένας: κάμψη (ανάσκελα) και έκταση (μπρούμυτα) με το κεφάλι έξω από τον πάγκο
const NB = { h: 0.44, z0: 0.6, z1: -0.5 };
function neck(id, { prone }) {
  def(id, {
    view: { az: 74, el: 12, zoom: 1.5, focus: 'neck' },
    base: { n: 0 },
    keys: prone ? { setup: { n: 46 }, up: { n: -2 } } : { setup: { n: -14 }, up: { n: 46 } },
    seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.4, 1, { act: 'con', hold: 0.4 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.3 }]],
    loop: 1,
    setup(props) { props.add('bench', P.bench({ h: NB.h, z0: NB.z0, z1: NB.z1 })); },
    pose(B, k, ctx) {
      const q = prone ? Body.trunkQ(90, 180, 0) : Body.trunkQ(-90, 0, 0);
      B.root(V(0, 0.9, 0.42), q);
      B.spine(-breath(ctx.t, 0.3), 0, 0);
      B.neck(k.n, 0, 0);
      for (const s of SIDES) {
        B.girdle(s, { prot: prone ? 4 : -4 });
        B.arm(s, { plane: prone ? 90 : 84, elev: prone ? 40 : 14, rot: 0, elbow: prone ? 30 : 6, pron: 170 });
        B.fingers(s, 0.2);
        B.leg(s, { flex: prone ? 4 : 2, abd: 3, knee: 3, df: prone ? -40 : -10 });
      }
      rest(B, [{ bones: ['pelvis', 'spine1', 'spine2', 'chest', 'girdle_L', 'girdle_R', 'thigh_L', 'thigh_R'], n: Y, d: NB.h, region: (x, y, z) => z > NB.z1 + 0.01 }]);
      // ώμοι στην άκρη του πάγκου: σπρώχνουμε το σώμα ώστε το κεφάλι να είναι έξω
      const sh = B.pivot('neck');
      const dz = (NB.z1 + 0.04) - sh.z;
      B.rig.rootPos.z += dz;
      B.solve();
      rest(B, [{ bones: ['pelvis', 'spine1', 'spine2', 'chest', 'girdle_L', 'girdle_R', 'thigh_L', 'thigh_R'], n: Y, d: NB.h, region: (x, y, z) => z > NB.z1 + 0.01 }]);
    },
  });
}
neck('neck_flexion', { prone: false });
neck('neck_extension', { prone: true });
