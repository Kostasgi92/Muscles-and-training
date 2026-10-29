// Πόδια, γλουτοί, γάμπες.
import * as THREE from 'three';
import * as P from './props.js';
import {
  def, MOTIONS, SIDES, V, sg, other, FLOOR, MAT, D2R, lerp, smooth, X, Y, Z, over, under, Body, clamp,
  barFromHands, placeBar, inHand, kbInHands, rest, BACK, TRUNK, stand, onSurface, sit, trunk, armsFK, armsSag, armSag, dirToArm,
  armReach, feetPair, sway, breath, softExcess,
} from './lib.js';
import { barOnBack } from './ex-back-arms.js';

const dbPair = (props, env, o) => { env.db = { L: props.add('dbL', P.dumbbell(o)), R: props.add('dbR', P.dumbbell(o)) }; };
const dbUpdate = (props, B, k, env) => { for (const s of SIDES) inHand(env.db[s], B, s); };
// χέρια χαλαρά στο πλάι κρατώντας αλτήρες
const hangArms = (B, grip = 1, el = 8) => { for (const s of SIDES) { B.girdle(s, { elev: -2, prot: 0 }); B.arm(s, { plane: 94, elev: 5, rot: 0, elbow: el, pron: 88 }); B.fingers(s, grip); } };
const dbLoads = (B, kg = 12) => [{ p: B.grip('L'), kg }, { p: B.grip('R'), kg }];

// ===== Οπίσθιο κάθισμα (back squat)
def('squat', {
  view: { az: 40, el: 8 },
  base: { y: 0.85, pitch: 4, sp: [0, 0, 0], nk: [-4, 0, 0], stance: 0.36, toe: 18 },
  keys: {
    setup: { y: 0.85, pitch: 3 },
    brace: { y: 0.843, pitch: 6, sp: [-3, 0, 0] },
    bottom: { y: 0.47, pitch: 44, sp: [-2, 0, 0], nk: [-14, 0, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['brace', 0.9, 1, { act: 'iso' }], ['bottom', 2.1, 2, { act: 'ecc', lag: { pitch: -0.1 } }], ['brace', 1.4, 3, { act: 'con', hold: 0.35, lag: { pitch: 0.08 } }]],
  loop: 2,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225, 0.2] })); },
  pose(B, k, ctx) { stand(B, k, { t: ctx.t, upper: (B) => barOnBack(B, ctx.env), loads: () => [{ p: ctx.env.bar, kg: 70 }] }); },
  update(props, B, k, env) { placeBar(env.barObj, env.bar, env.barU); },
});

// ===== Εμπρόσθιο κάθισμα (front squat)
const FRONT = V(0, 1.398, 0.142);
// θέση «rack»: αγκώνες ψηλά μπροστά, η μπάρα πάνω στους ώμους, τα δάχτυλα από κάτω (καρπός σε έκταση)
const RACK = { plane: 88, elev: 82, rot: 14, elbow: 142, pron: 160, wrist: { flex: -74, dev: 0 } };
const RACK_HAND = { pron: RACK.pron, wrist: RACK.wrist };
def('front_squat', {
  view: { az: 52, el: 8 },
  base: { y: 0.85, pitch: 4, sp: [-3, 0, 0], nk: [0, 0, 0], stance: 0.34, toe: 16, el: 1 },
  keys: {
    setup: { y: 0.85, pitch: 3, el: 1 },
    brace: { y: 0.845, pitch: 5, sp: [-4, 0, 0] },
    bottom: { y: 0.44, pitch: 24, sp: [-4, 0, 0], nk: [-6, 0, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['brace', 0.9, 1, { act: 'iso' }], ['bottom', 2.1, 2, { act: 'ecc' }], ['brace', 1.4, 3, { act: 'con', hold: 0.35 }]],
  loop: 2,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225] })); },
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B) => {
        for (const s of SIDES) {
          B.girdle(s, { prot: 12, elev: 10 });
          B.arm(s, RACK);
          B.fingers(s, 0.55);
        }
        B.solve();
        const Rc = B.rot('chest');
        env.bar = B.pt('chest', FRONT);
        env.barU = V(1, 0, 0).applyQuaternion(Rc);
      },
      loads: () => [{ p: env.bar, kg: 60 }],
    });
  },
  update(props, B, k, env) { placeBar(env.barObj, env.bar, env.barU); },
});

// ===== Goblet squat
def('goblet_squat', {
  view: { az: 34, el: 8 },
  base: { y: 0.85, pitch: 4, sp: [-2, 0, 0], nk: [0, 0, 0], stance: 0.4, toe: 22 },
  keys: {
    setup: { y: 0.85, pitch: 3 },
    bottom: { y: 0.4, pitch: 20, sp: [-3, 0, 0], nk: [-4, 0, 0] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['bottom', 2.1, 1, { act: 'ecc' }], ['setup', 1.4, 2, { act: 'con', hold: 0.35 }]],
  loop: 1,
  setup(props, env) { env.db = props.add('db', P.dumbbell({ r: 0.07, handle: 0.12 })); },
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B) => {
        for (const s of SIDES) B.girdle(s, { prot: 8, elev: 0 });
        B.solve();
        const Rc = B.rot('chest');
        const c = B.pt('chest', V(0, 1.17, 0.27));
        const up = V(0, 1, 0).applyQuaternion(Rc);
        env.dbC = c; env.dbU = up;
        for (const s of SIDES) {
          B.reach(s, c.clone().addScaledVector(up, 0.055).add(V(sg(s) * 0.035, 0, 0).applyQuaternion(Rc)), { at: 'palm', pole: V(sg(s) * 0.35, -1, 0.2).applyQuaternion(Rc), hand: { palm: up.clone(), fingers: V(-sg(s), 0, 0.4).applyQuaternion(Rc) } });
          B.fingers(s, 0.5);
        }
      },
      loads: () => [{ p: env.dbC, kg: 20 }],
    });
  },
  update(props, B, k, env) { env.db.position.copy(env.dbC); env.db.quaternion.setFromUnitVectors(X, env.dbU); },
});

// ===== Βουλγάρικο κάθισμα
const BSS = { z0: -0.42, h: 0.44 };
def('bulgarian_split_squat', {
  view: { az: 72, el: 8 },
  balanceFront: true,
  base: { y: 0.82, pitch: 6, sp: [-2, 0, 0], nk: [0, 0, 0], z: -0.05 },
  keys: {
    setup: { y: 0.8, pitch: 4, z: -0.06 },
    bottom: { y: 0.5, pitch: 12, z: -0.08 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['bottom', 2.0, 1, { act: 'ecc' }], ['setup', 1.3, 2, { act: 'con', hold: 0.3 }]],
  loop: 1,
  setup(props, env) {
    props.add('bench', P.bench({ h: BSS.h, z0: BSS.z0, z1: BSS.z0 - 1.1 }));
    dbPair(props, env);
  },
  pose(B, k, ctx) {
    const front = V(0.11, FLOOR, 0.36);
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ L: { at: front, yaw: 6 } }),
      // περίπου 80% του βάρους στο μπροστινό πόδι: το κέντρο μάζας λίγο πίσω από αυτό
      target: () => V(0.06, 0, 0.17),
      upper: (B) => hangArms(B),
      after: (B) => {
        // πίσω πόδι: η ράχη του πέλματος πάνω στον πάγκο
        const qf = new THREE.Quaternion().setFromAxisAngle(X, 158 * D2R).premultiply(new THREE.Quaternion().setFromAxisAngle(Y, -4 * D2R));
        B.footTo('R', V(-0.12, BSS.h + 0.032, BSS.z0 - 0.06), qf, V(-0.09, 0.055, 0.095), V(-0.1, -0.2, 1));
        B.toes('R', -25);
      },
      loads: () => dbLoads(B, 10),
    });
  },
  update: dbUpdate,
});

// ===== Προβολές (lunge): εναλλάξ με το αριστερό και το δεξί πόδι
function stepFeet(k) {
  const L = k.fL, R = k.fR;
  return {
    L: { at: V(0.11 + (L[3] || 0), FLOOR + L[1], L[0]), yaw: 6, lift: L[2] || 0 },
    R: { at: V(-0.11 - (R[3] || 0), FLOOR + R[1], R[0]), yaw: 6, lift: R[2] || 0 },
  };
}
def('lunge', {
  view: { az: 76, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [-1, 0, 0], nk: [0, 0, 0], z: 0, fL: [0, 0, 0], fR: [0, 0, 0] },
  keys: {
    stand: {},
    airL: { y: 0.83, z: 0.14, fL: [0.4, 0.09, -10] },
    landL: { y: 0.79, z: 0.33, pitch: 4, fL: [0.78, 0, 0], fR: [0, 0, 25] },
    downL: { y: 0.47, z: 0.36, pitch: 6, fL: [0.78, 0, 0], fR: [0, 0, 52] },
    pushL: { y: 0.8, z: 0.24, pitch: 4, fL: [0.62, 0.05, 10], fR: [0, 0, 8] },
    airR: { y: 0.83, z: 0.14, fR: [0.4, 0.09, -10] },
    landR: { y: 0.79, z: 0.33, pitch: 4, fR: [0.78, 0, 0], fL: [0, 0, 25] },
    downR: { y: 0.47, z: 0.36, pitch: 6, fR: [0.78, 0, 0], fL: [0, 0, 52] },
    pushR: { y: 0.8, z: 0.24, pitch: 4, fR: [0.62, 0.05, 10], fL: [0, 0, 8] },
  },
  seq: [['stand', 1.0, 0, { act: 'setup' }],
    ['airL', 0.45, 0, { via: true, act: 'iso' }], ['landL', 0.45, 0, { act: 'iso' }], ['downL', 1.4, 1, { act: 'ecc', hold: 0.2 }], ['pushL', 0.7, 2, { act: 'con', via: true }], ['stand', 0.5, 2, { act: 'con', hold: 0.4 }],
    ['airR', 0.45, 0, { via: true, act: 'iso' }], ['landR', 0.45, 0, { act: 'iso' }], ['downR', 1.4, 1, { act: 'ecc', hold: 0.2 }], ['pushR', 0.7, 2, { act: 'con', via: true }], ['stand', 0.5, 2, { act: 'con', hold: 0.4 }]],
  loop: 1,
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, balance: false, softLegs: 0.008,
      feet: stepFeet,
      upper: (B) => { for (const s of SIDES) { B.girdle(s, { elev: -2 }); B.arm(s, { plane: 92, elev: 8, rot: 0, elbow: 14, pron: 80 }); B.fingers(s, 0.3); } },
    });
  },
});

// ===== Προβολές με περπάτημα (walking lunge): η κάμερα ακολουθεί
def('walking_lunge', {
  view: { az: 76, el: 8 },
  follow: true,
  base: { y: 0.8, pitch: 4, sp: [-1, 0, 0], nk: [0, 0, 0], z: 0.36, fL: [0.78, 0, 0], fR: [0, 0, 25] },
  keys: {
    startL: { y: 0.79, z: 0.33, fL: [0.78, 0, 0], fR: [0, 0, 25] },
    downL: { y: 0.47, z: 0.36, pitch: 6, fL: [0.78, 0, 0], fR: [0, 0, 52] },
    upL: { y: 0.8, z: 0.68, pitch: 2, fL: [0.78, 0, 0], fR: [0.5, 0.1, -6] },
    landR: { y: 0.79, z: 1.11, pitch: 4, fL: [0.78, 0, 25], fR: [1.56, 0, 0] },
    downR: { y: 0.47, z: 1.14, pitch: 6, fL: [0.78, 0, 52], fR: [1.56, 0, 0] },
    upR: { y: 0.8, z: 1.46, pitch: 2, fR: [1.56, 0, 0], fL: [1.28, 0.1, -6] },
    landL: { y: 0.79, z: 1.89, pitch: 4, fR: [1.56, 0, 25], fL: [2.34, 0, 0] },
  },
  seq: [['startL', 1.0, 0, { act: 'setup' }], ['downL', 1.3, 1, { act: 'ecc', hold: 0.15 }], ['upL', 0.6, 2, { act: 'con', via: true }], ['landR', 0.6, 2, { act: 'con' }],
    ['downR', 1.3, 1, { act: 'ecc', hold: 0.15 }], ['upR', 0.6, 3, { act: 'con', via: true }], ['landL', 0.6, 3, { act: 'con' }]],
  loop: 1,
  wrap: 1.56,
  setup: (props, env) => dbPair(props, env),
  pose(B, k, ctx) {
    stand(B, k, { t: ctx.t, balance: false, softLegs: 0.008, feet: stepFeet, upper: (B) => hangArms(B), loads: () => dbLoads(B) });
  },
  update: dbUpdate,
});

// ===== Πλάγια προβολή
def('lateral_lunge', {
  view: { az: 12, el: 8 },
  base: { y: 0.85, pitch: 2, sp: [0, 0, 0], nk: [0, 0, 0], x: 0, z: 0, fL: [0, 0, 0, 0], fR: [0, 0, 0, 0], roll: 0 },
  keys: {
    stand: {},
    outL: { y: 0.82, x: 0.2, fL: [0, 0, 0, 0.5] },
    downL: { y: 0.56, x: 0.4, z: -0.12, pitch: 32, roll: -4, fL: [0, 0, 0, 0.5] },
    outR: { y: 0.82, x: -0.2, fR: [0, 0, 0, 0.5] },
    downR: { y: 0.56, x: -0.4, z: -0.12, pitch: 32, roll: 4, fR: [0, 0, 0, 0.5] },
    airL: { y: 0.84, x: 0.1, fL: [0, 0.07, 0, 0.25] },
    airR: { y: 0.84, x: -0.1, fR: [0, 0.07, 0, 0.25] },
  },
  seq: [['stand', 1.0, 0, { act: 'setup' }], ['airL', 0.4, 0, { via: true }], ['outL', 0.4, 0, { act: 'iso' }], ['downL', 1.4, 1, { act: 'ecc', hold: 0.25 }], ['airL', 0.8, 2, { act: 'con', via: true }], ['stand', 0.4, 2, { act: 'con', hold: 0.3 }],
    ['airR', 0.4, 0, { via: true }], ['outR', 0.4, 0, { act: 'iso' }], ['downR', 1.4, 1, { act: 'ecc', hold: 0.25 }], ['airR', 0.8, 2, { act: 'con', via: true }], ['stand', 0.4, 2, { act: 'con', hold: 0.3 }]],
  loop: 1,
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, balance: false, softLegs: 0.008,
      feet: (k) => ({
        L: { at: V(0.11 + k.fL[3] * 1, FLOOR + k.fL[1], k.fL[0]), yaw: 10 + k.fL[3] * 20, pole: V(0.5, 0, 1) },
        R: { at: V(-0.11 - k.fR[3] * 1, FLOOR + k.fR[1], k.fR[0]), yaw: 10 + k.fR[3] * 20, pole: V(-0.5, 0, 1) },
      }),
      upper: (B, k) => {
        const d = Math.min(1, Math.max(0, (0.85 - k.y) / 0.29));
        for (const s of SIDES) { B.girdle(s, { elev: 0, prot: 6 * d }); B.arm(s, { plane: 92, elev: lerp(8, 62, d), rot: 0, elbow: lerp(14, 70, d), pron: 80 }); B.fingers(s, 0.3); }
      },
    });
  },
});

// ===== Ανεβάσματα σε κουτί (step-up)
const STEP = { h: 0.42, z: 0.4 };
def('step_up', {
  view: { az: 74, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], z: 0, fL: [0, 0, 0], fR: [0, 0, 0] },
  keys: {
    stand: {},
    place: { y: 0.83, z: 0.05, pitch: 3, fL: [0.38, STEP.h, 0] },
    up: { y: 0.85 + STEP.h, z: 0.38, pitch: 0, fL: [0.38, STEP.h, 0], fR: [0.38, STEP.h, 0] },
    mid: { y: 0.98, z: 0.22, pitch: 12, fL: [0.38, STEP.h, 0], fR: [0.12, 0.2, 10] },
    down: { y: 0.83, z: 0.05, pitch: 3, fL: [0.38, STEP.h, 0], fR: [0, 0, 0] },
  },
  seq: [['stand', 1.0, 0, { act: 'setup' }], ['place', 1.0, 0, { act: 'setup' }], ['mid', 0.8, 1, { act: 'con', via: true }], ['up', 0.7, 1, { act: 'con', hold: 0.3 }], ['mid', 0.9, 2, { act: 'ecc', via: true }], ['down', 0.9, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 2,
  setup(props) { props.add('box', P.step({ w: 0.6, h: STEP.h, d: 0.42, c: V(0, 0, STEP.z + 0.04) })); },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, balance: false,
      feet: (k) => ({ L: { at: V(0.11, FLOOR + k.fL[1], k.fL[0]), yaw: 6, lift: k.fL[2] }, R: { at: V(-0.11, FLOOR + k.fR[1], k.fR[0]), yaw: 6, lift: k.fR[2] } }),
      upper: (B) => { for (const s of SIDES) { B.girdle(s, { elev: -2 }); B.arm(s, { plane: 94, elev: 8, rot: 0, elbow: 16, pron: 80 }); B.fingers(s, 0.3); } },
    });
  },
});

// ===== Πρέσα ποδιών 45° (leg press)
const LPR = { a: 45, back: 50, seatH: 0.5, hip: V(0, 0.6, -0.05) };
def('leg_press', {
  view: { az: 78, el: 14 },
  base: { d: 0.86, sp: [0, 0, 0], nk: [8, 0, 0] },
  keys: {
    setup: { d: 0.86 },
    feet: { d: 0.84 },
    down: { d: 0.5 },
    up: { d: 0.84 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['feet', 0.9, 1, { act: 'iso' }], ['down', 2.0, 2, { act: 'ecc' }], ['up', 1.3, 3, { act: 'con', hold: 0.3 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    const r = LPR.a * D2R;
    const rail = V(0, Math.sin(r), Math.cos(r));
    g.add(P.tube(LPR.hip.clone().add(V(0.32, -0.45, 0.2)), LPR.hip.clone().add(V(0.32, -0.45, 0.2)).addScaledVector(rail, 1.5), 0.03));
    g.add(P.tube(LPR.hip.clone().add(V(-0.32, -0.45, 0.2)), LPR.hip.clone().add(V(-0.32, -0.45, 0.2)).addScaledVector(rail, 1.5), 0.03));
    const seatB = P.box(0.42, 0.08, 0.4, LPR.hip.clone().add(V(0, -0.14, 0.05)));
    seatB.rotation.x = -0.25;
    g.add(seatB);
    const backB = P.box(0.42, 0.08, 0.75, V());
    const rb = LPR.back * D2R;
    backB.rotation.x = rb;
    backB.position.copy(LPR.hip.clone().add(V(0, -0.1 + Math.sin(rb) * 0.4, -0.1 - Math.cos(rb) * 0.4)));
    g.add(backB);
    g.add(P.box(0.5, 0.04, 1.6, V(0, 0.02, 0.35), P.MAT.frame, 0.01));
    g.add(P.tube(V(0, 0.03, -0.1), LPR.hip.clone().add(V(0, -0.2, 0)), 0.04));
    props.add('machine', g);
    env.plat = props.add('plat', P.box(0.62, 0.05, 0.46, V(), P.MAT.frame, 0.01));
  },
  pose(B, k, ctx) {
    const rb = LPR.back * D2R;
    B.root(LPR.hip.clone(), Body.trunkQ(-(90 - LPR.back) + 0, 0, 0));
    B.spine(k.sp[0] - breath(ctx.t, 0.4), 0, 0);
    B.neck(k.nk[0], 0, 0);
    // πλάτη στο μαξιλάρι
    const nb = V(0, Math.cos(rb), Math.sin(rb));
    rest(B, [{ bones: ['chest', 'girdle_L', 'girdle_R', 'spine2'], n: nb, d: nb.dot(LPR.hip.clone().add(V(0, -0.06, -0.1))) }]);
    const r = LPR.a * D2R;
    const rail = V(0, Math.sin(r), Math.cos(r));
    const base = LPR.hip.clone().add(V(0, -0.12, 0.08));
    const pc = base.clone().addScaledVector(rail, k.d);
    ctx.env.pc = pc;
    const qf = new THREE.Quaternion().setFromAxisAngle(X, -(90 + LPR.a) * D2R);
    for (const s of SIDES) B.footTo(s, pc.clone().add(V(sg(s) * 0.13, 0, 0)), qf.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(rail, sg(s) * 8 * D2R)), B.side[s].mid, V(sg(s) * 0.3, 0.6, 0.4));
    for (const s of SIDES) {
      B.girdle(s, { elev: 0, prot: 0 });
      B.arm(s, { plane: 50, elev: 26, rot: 0, elbow: 50, pron: 90 });
      B.fingers(s, 1);
    }
  },
  update(props, B, k, env) {
    const r = LPR.a * D2R;
    env.plat.position.copy(env.pc).add(V(0, Math.sin(r) * 0.03, Math.cos(r) * 0.03));
    env.plat.rotation.x = (90 - LPR.a) * D2R;
  },
});

// ===== Hack squat (μηχάνημα)
const HS = { a: 45 };
def('hack_squat', {
  view: { az: 76, el: 10 },
  base: { s: 0, sp: [0, 0, 0], nk: [4, 0, 0] },
  keys: {
    setup: { s: 0 },
    down: { s: 0.5 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['down', 2.1, 1, { act: 'ecc', hold: 0.2 }], ['setup', 1.4, 2, { act: 'con', hold: 0.3 }]],
  loop: 1,
  setup(props, env) {
    const g = new THREE.Group();
    const a = HS.a * D2R;
    const up = V(0, Math.cos(a), -Math.sin(a));
    for (const x of [-0.3, 0.3]) g.add(P.tube(V(x, 0.15, 0.3), V(x, 0.15, 0.3).addScaledVector(up, 2.0), 0.035));
    const plat = P.box(0.7, 0.05, 0.5, V(0, 0.16, 0.42), P.MAT.frame, 0.01);
    plat.rotation.x = -0.25;
    g.add(plat);
    g.add(P.box(0.8, 0.04, 1.6, V(0, 0.02, -0.2), P.MAT.frame, 0.01));
    props.add('machine', g);
    env.pad = props.add('pad', P.box(0.4, 0.75, 0.08, V()));
    env.sh = SIDES.map((s) => props.add('sh' + s, P.roller(0.16, 0.05)));
  },
  pose(B, k, ctx) {
    const a = HS.a * D2R;
    const down = V(0, -Math.cos(a), Math.sin(a));
    const p0 = V(0, 0.9, -0.05);
    B.root(p0.clone().addScaledVector(down, k.s * 0.62), Body.trunkQ(-HS.a + 12, 0, 0));
    B.spine(k.sp[0] - breath(ctx.t, 0.4), 0, 0);
    B.neck(k.nk[0], 0, 0);
    for (const s of SIDES) {
      B.plant(s, V(sg(s) * 0.15, 0.2, 0.38), { yaw: 12, pitch: -14, pole: V(sg(s) * 0.25, 0.4, 1) });
      B.girdle(s, { elev: 10, prot: 2 });
      B.arm(s, { plane: 70, elev: 50, rot: 30, elbow: 110, pron: 90 });
      B.fingers(s, 1);
    }
    ctx.env.root = B.rig.rootPos.clone();
  },
  update(props, B, k, env) {
    const Rc = B.rot('chest');
    const n = V(0, 0, 1).applyQuaternion(Rc);
    const upv = V(0, 1, 0).applyQuaternion(Rc);
    const back = B.pt('chest', V(0, 1.15, -0.1));
    env.pad.position.copy(back).addScaledVector(n, -0.05);
    env.pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0).applyQuaternion(Rc), upv, n));
    SIDES.forEach((s, i) => {
      const sh = B.pt('girdle_' + s, V(sg(s) * 0.13, 1.43, 0.0));
      env.sh[i].position.copy(sh).add(V(0, 0.04, 0));
      env.sh[i].quaternion.setFromUnitVectors(X, n);
    });
  },
});

// ===== Μηχάνημα: εκτάσεις γονάτων, κάμψεις (καθιστός/πρηνής)
const LE = { h: 0.5, back: 14 };
function machineSeat(B, k, ctx, legs, arms, back = LE.back, h = LE.h) {
  sit(B, k, {
    t: ctx.t, h,
    back: back === null ? null : { n: V(0, Math.sin(back * D2R), Math.cos(back * D2R)), p: V(0, h + 0.3, -0.16) },
    limbs: (B, k, ph) => {
      if (ph === 'pre') { legs(B, k); arms(B, k); }
    },
  });
}
const sideHandles = (B, y, z) => { for (const s of SIDES) { B.reach(s, V(sg(s) * 0.27, y, z), { pole: V(sg(s), -0.2, -0.4), hand: { axis: V(0, 0, 1), flex: 0 } }); B.fingers(s, 1); } };
function legLever(env, props, len = 0.42) {
  env.lever = props.add('lever', P.lever({ len, side: 0.22, pad: P.roller(0.3, 0.055) }));
}
// μοχλός με άξονα στο γόνατο και μαξιλάρι στον αστράγαλο
function setLever(env, B, front = true) {
  const kn = B.pivot('shank_L').add(B.pivot('shank_R')).multiplyScalar(0.5);
  const an = B.pivot('foot_L').add(B.pivot('foot_R')).multiplyScalar(0.5);
  const sk = an.clone().sub(kn);
  const len = sk.length();
  env.lever.position.copy(kn);
  const ang = Math.atan2(sk.z, -sk.y);
  env.lever.userData.setAngle(-ang + 0);
  const arm = env.lever.children[0];
  arm.rotation.x = Math.atan2(-sk.z, -sk.y);
  arm.children[2].position.y = -(len + 0.02);
  arm.children[2].position.z = front ? 0.07 : -0.07;
}
def('leg_extension', {
  view: { az: 76, el: 10 },
  base: { pitch: -LE.back, z: 0.0, sp: [-2, 0, 0], nk: [6, 0, 0], kn: 88 },
  keys: {
    setup: { kn: 90 },
    hold: { kn: 88 },
    up: { kn: 6 },
    top: { kn: 5 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['hold', 0.8, 1, { act: 'iso' }], ['up', 1.2, 2, { act: 'con' }], ['top', 0.9, 3, { act: 'iso' }], ['hold', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    props.add('seat', P.seat({ h: LE.h, z: 0.12, zb: -0.16, back: LE.back, backH: 0.7, depth: 0.46 }));
    legLever(env, props);
  },
  pose(B, k, ctx) {
    machineSeat(B, k, ctx, (B, k) => { for (const s of SIDES) B.leg(s, { flex: 86 - LE.back, abd: 4, knee: k.kn, df: 4 }); }, () => {});
    B.solve();
    const hip = B.pivot('pelvis');
    sideHandles(B, hip.y - 0.02, hip.z + 0.05);
  },
  update(props, B, k, env) { setLever(env, B, true); },
});
def('seated_leg_curl', {
  view: { az: 76, el: 12 },
  base: { pitch: -LE.back, z: 0.0, sp: [-2, 0, 0], nk: [6, 0, 0], kn: 8 },
  keys: {
    setup: { kn: 8 },
    curl: { kn: 102 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['curl', 1.2, 1, { act: 'con', hold: 0.35 }], ['setup', 2.0, 2, { act: 'ecc', hold: 0.2 }]],
  loop: 1,
  setup(props, env) {
    props.add('seat', P.seat({ h: LE.h, z: 0.12, zb: -0.16, back: LE.back, backH: 0.7, depth: 0.46 }));
    legLever(env, props);
    env.thighPad = props.add('thighPad', P.roller(0.36, 0.05));
  },
  pose(B, k, ctx) {
    machineSeat(B, k, ctx, (B, k) => { for (const s of SIDES) B.leg(s, { flex: 88 - LE.back, abd: 4, knee: k.kn, df: 2 }); }, () => {});
    B.solve();
    const hip = B.pivot('pelvis');
    sideHandles(B, hip.y + 0.02, hip.z + 0.06);
  },
  update(props, B, k, env) {
    setLever(env, B, false);
    const t = B.pt('thigh_L', V(0, 0.55, 0.12)).add(B.pt('thigh_R', V(0, 0.55, 0.12))).multiplyScalar(0.5);
    env.thighPad.position.copy(t).add(V(0, 0.06, 0));
  },
});
def('lying_leg_curl', {
  view: { az: 78, el: 14 },
  base: { pitch: 90, z: 0.13, sp: [0, 0, 0], nk: [-12, 0, 0], kn: 4 },
  keys: {
    setup: { kn: 4 },
    pad: { kn: 6 },
    curl: { kn: 118 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['pad', 0.8, 1, { act: 'iso' }], ['curl', 1.3, 2, { act: 'con', hold: 0.3 }], ['pad', 2.1, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    const pad = P.box(0.36, 0.08, 1.15, V(0, 0.66, 0.3));
    g.add(pad);
    g.add(P.tube(V(0, 0.02, 0.6), V(0, 0.62, 0.6), 0.035));
    g.add(P.tube(V(0, 0.02, -0.15), V(0, 0.6, -0.15), 0.035));
    g.add(P.box(0.5, 0.04, 1.3, V(0, 0.02, 0.15), P.MAT.frame, 0.01));
    props.add('bench', g);
    legLever(env, props, 0.4);
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3,
      contacts: () => [{ bones: ['pelvis', 'spine1', 'spine2', 'chest', 'thigh_L', 'thigh_R'], n: Y, d: 0.7, region: (x, y, z) => z > -0.28 }],
      limbs: (B, k, ph) => {
        if (ph === 'pre') {
          for (const s of SIDES) {
            B.leg(s, { flex: -6, abd: 3, knee: k.kn, df: -20 });
            B.girdle(s, { elev: 8, prot: 6 });
            B.arm(s, { plane: 100, elev: 120, rot: 0, elbow: 70, pron: 170 });
            B.fingers(s, 1);
          }
        }
      },
    });
  },
  update(props, B, k, env) { setLever(env, B, false); },
});

// ===== Κάμψεις με μπάλα (ball leg curl)
const BALL_R = 0.32;
def('ball_leg_curl', {
  view: { az: 74, el: 14 },
  base: { lift: 0, hip: 38, kn: 2 },
  keys: {
    setup: { lift: 0, hip: 38, kn: 2 },
    bridge: { lift: 1, hip: 8, kn: 2 },
    curl: { lift: 1.15, hip: 62, kn: 104 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['bridge', 1.1, 1, { act: 'con' }], ['curl', 1.4, 2, { act: 'con', hold: 0.3 }], ['bridge', 2.0, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 2,
  setup(props, env) {
    props.add('mat', P.floorMat({ len: 1.9, z: 0.0 }));
    env.ball = props.add('ball', P.ball(BALL_R));
  },
  pose(B, k, ctx) {
    // ώμοι στο έδαφος, η λεκάνη ανεβαίνει στρέφοντας τον κορμό γύρω τους· η μπάλα ακουμπά στις φτέρνες
    const lift = clamp(k.lift, 0, 1.2);
    trunk(B, { pitch: -90 - lift * 24, sp: [-2 * lift, 0, 0], nk: [6 + 8 * lift, 0, 0] }, V(0, 1, 0), { t: ctx.t, breathe: 0.3 });
    for (const s of SIDES) {
      B.leg(s, { flex: k.hip, abd: 4, knee: k.kn, df: 8 });
      B.girdle(s, { elev: 0, prot: 0 });
      B.arm(s, { plane: 70, elev: 30, rot: 0, elbow: 6, pron: 175 });
      B.fingers(s, 0.05);
    }
    rest(B, [{ bones: ['chest', 'girdle_L', 'girdle_R', 'head'], n: Y, d: MAT }]);
    const pv = B.extreme(['pelvis'], (x, y) => y);
    if (pv.v < MAT) { B.rig.rootPos.y += MAT - pv.v; B.solve(); }
    // το κέντρο της μπάλας πέρα από τις φτέρνες, ώστε η επιφάνειά της να τις αγγίζει
    const h = B.foot('L', 'heel').add(B.foot('R', 'heel')).multiplyScalar(0.5);
    const cy = MAT + BALL_R;
    const dy = clamp(h.y - 0.012 - cy, -BALL_R, BALL_R);
    ctx.env.ballAt = V(0, cy, h.z + Math.sqrt(Math.max(0, BALL_R * BALL_R - dy * dy)) - 0.01);
  },
  update(props, B, k, env) { env.ball.position.copy(env.ballAt); },
});

// ===== Nordic curl
def('nordic_curl', {
  view: { az: 80, el: 10 },
  base: { th: 0, hands: 0, sp: [0, 0, 0], nk: [0, 0, 0], hip: 0 },
  keys: {
    kneel: { th: 0, hands: 0 },
    lean: { th: 52, hands: 0.3 },
    catch: { th: 72, hands: 1, hip: 10 },
    push: { th: 40, hands: 0.2, hip: 4 },
  },
  seq: [['kneel', 1.3, 0, { act: 'setup' }], ['lean', 2.4, 1, { act: 'ecc' }], ['catch', 0.9, 2, { act: 'ecc', hold: 0.3 }], ['push', 1.0, 3, { act: 'con', via: true }], ['kneel', 1.3, 3, { act: 'con', hold: 0.4 }]],
  loop: 1,
  setup(props) {
    props.add('mat', P.floorMat({ len: 2.0, z: 0.3 }));
    const r = P.roller(0.42, 0.06);
    r.position.set(0, 0.16, -0.43);
    props.add('roller', r);
    props.add('post', P.box(0.12, 0.2, 0.12, V(0, 0.1, -0.52), P.MAT.frame, 0.01));
  },
  pose(B, k, ctx) {
    // γόνατα στο έδαφος (z = 0), κνήμες πίσω, αστράγαλοι κάτω από το ρολό
    const th = k.th * D2R;
    const lth = B.side.L.la.length();
    const knee = V(0, MAT + 0.075, 0.0);
    B.root(knee.clone().add(V(0, Math.cos(th) * lth, Math.sin(th) * lth)), Body.trunkQ(k.th + k.hip, 0, 0));
    B.spine(k.sp[0] - breath(ctx.t, 0.3), 0, 0);
    B.neck(k.nk[0] - k.th * 0.15, 0, 0);
    const qf = new THREE.Quaternion().setFromAxisAngle(X, 168 * D2R);
    for (const s of SIDES) B.footTo(s, V(sg(s) * 0.1, MAT + 0.075, -0.42), qf, B.side[s].A, V(0, -1, 0.15));
    for (const s of SIDES) B.toes(s, 0);
    // χέρια: έτοιμα μπροστά από το στήθος → στο έδαφος
    B.solve();
    const u = smooth(clamp(k.hands, 0, 1));
    for (const s of SIDES) {
      B.girdle(s, { prot: 8, elev: 0 });
      B.arm(s, { plane: 96, elev: 30, rot: 10, elbow: 100, pron: 120 });
      B.fingers(s, lerp(0.2, -0.25, u));
      if (u < 0.001) continue;
      B.solve();
      const S = B.pivot('upperarm_' + s);
      const floorP = V(sg(s) * 0.25, MAT + 0.003, S.z + 0.1);
      const ready = B.palm(s);
      const Rh = B.rot('hand_' + s);
      const palmFK = B.side[s].n0.clone().applyQuaternion(Rh), fingFK = B.side[s].h0.clone().applyQuaternion(Rh);
      B.reach(s, ready.lerp(floorP, u), {
        at: 'palm', pole: 'keep', poleTo: V(sg(s) * 0.6, 0.3, -0.7), poleU: u,
        hand: { palm: palmFK.lerp(V(0, -1, 0), u).normalize(), fingers: fingFK.lerp(V(sg(s) * 0.1, 0.1, 1).normalize(), u).normalize() },
      });
    }
  },
});

// ===== Hip thrust και γλουτιαία γέφυρα
const HT = { h: 0.42, edge: -0.08 };
def('hip_thrust', {
  view: { az: 78, el: 10 },
  base: { lift: 0, sp: [0, 0, 0], nk: [12, 0, 0] },
  keys: {
    setup: { lift: 0 },
    feet: { lift: 0.02 },
    top: { lift: 1, nk: [22, 0, 0] },
    squeeze: { lift: 1.03, nk: [22, 0, 0] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['feet', 0.8, 1, { act: 'setup' }], ['top', 1.2, 2, { act: 'con' }], ['squeeze', 0.9, 3, { act: 'iso' }], ['feet', 1.8, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const b = P.bench({ h: HT.h, z0: 0.3, z1: -0.3, legs: true });
    b.rotation.y = Math.PI / 2;
    b.position.z = HT.edge - 0.15;
    props.add('bench', b);
    env.barObj = props.add('bar', P.barbell({ plates: [0.225] }));
  },
  pose(B, k, ctx) {
    const lift = clamp(k.lift, 0, 1.05);
    const ang = lerp(42, -2, lift);
    trunk(B, { pitch: -90 + ang, sp: [lerp(4, -4, lift), 0, 0], nk: k.nk }, V(0, 0.5, 0.2), { t: ctx.t, breathe: 0.3 });
    // το πάνω μέρος της πλάτης (κάτω γωνίες ωμοπλατών) ακουμπά στην άκρη του πάγκου και γυρίζει γύρω της
    B.solve();
    const back = B.pt('chest', V(0, 1.235, -0.078));
    B.rig.rootPos.add(V(0, HT.h + 0.006, HT.edge - 0.035).sub(back));
    B.solve();
    { const p = B.pivot('pelvis'); if (p.y < MAT + 0.12) { B.rig.rootPos.y += MAT + 0.12 - p.y; B.solve(); } }
    for (const s of SIDES) B.plant(s, V(sg(s) * 0.17, FLOOR, 0.62), { yaw: 12, pole: V(sg(s) * 0.3, 0.6, 1) });
    B.solve();
    const bar = B.pt('pelvis', V(0, 0.82, 0.19)).add(V(0, 0.035, 0));
    ctx.env.bar = bar;
    for (const s of SIDES) {
      B.girdle(s, { prot: 6 });
      B.reach(s, bar.clone().add(V(sg(s) * 0.32, 0, 0)), { pole: V(sg(s), -0.2, -0.3), hand: { axis: over(s, X), flex: 0 } });
      B.fingers(s, 1);
    }
  },
  update(props, B, k, env) { placeBar(env.barObj, env.bar, X); },
});
def('glute_bridge', {
  view: { az: 76, el: 12 },
  base: { lift: 0, nk: [6, 0, 0] },
  keys: {
    setup: { lift: 0 },
    up: { lift: 1, nk: [16, 0, 0] },
    squeeze: { lift: 1.03, nk: [16, 0, 0] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['up', 1.2, 1, { act: 'con' }], ['squeeze', 0.9, 2, { act: 'iso' }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props) { props.add('mat', P.floorMat({ len: 1.9, z: 0.0 })); },
  pose(B, k, ctx) {
    const lift = clamp(k.lift, 0, 1.05);
    trunk(B, { pitch: -90 - lift * 28, sp: [-3 * lift, 0, 0], nk: k.nk }, V(0, 0.5, -0.05), { t: ctx.t, breathe: 0.3 });
    for (const s of SIDES) { B.girdle(s, { prot: -4 }); B.arm(s, { plane: 80, elev: 22, rot: 0, elbow: 4, pron: 172 }); B.fingers(s, 0.05); }
    rest(B, [{ bones: ['chest', 'girdle_L', 'girdle_R', 'head'], n: Y, d: MAT }]);
    const pv = B.extreme(['pelvis'], (x, y) => y);
    if (pv.v < MAT) { B.rig.rootPos.y += MAT - pv.v; B.solve(); }
    for (const s of SIDES) B.plant(s, V(sg(s) * 0.14, MAT, 0.55), { yaw: 6, pole: V(sg(s) * 0.15, 1, 0.3) });
  },
});

// ===== Kickback γλουτών σε τροχαλία
const CK = { z: 0.6 };
def('cable_kickback', {
  view: { az: 80, el: 8 },
  frameProps: false,
  base: { y: 0.85, pitch: 14, sp: [0, 0, 0], nk: [-6, 0, 0], ext: 0 },
  keys: {
    setup: { pitch: 2, ext: 0 },
    lean: { pitch: 16, ext: 0 },
    back: { pitch: 16, ext: 1 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['lean', 0.9, 1, { act: 'iso' }], ['back', 1.2, 2, { act: 'con', hold: 0.35 }], ['lean', 1.8, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const t = P.cableTower({ x: 0.08, z: CK.z + 0.12, y: 0.12, face: V(0, 0, -1) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.cable = props.add('cable', P.line(0.004));
    props.add('bar', (() => { const r = P.rod(0.5, 0.016, P.MAT.steel); r.position.set(0, 1.18, CK.z + 0.04); return r; })());
  },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ R: { at: V(-0.12, FLOOR, 0.05), yaw: 6 } }),
      target: () => V(-0.09, 0, 0.06),
      balanceX: true,
      free: { L: (k) => ({ flex: lerp(2, -32, smooth(k.ext)), abd: 4, knee: lerp(32, 12, k.ext), df: lerp(6, -10, k.ext) }) },
      upper: (B) => {
        B.solve();
        for (const s of SIDES) { B.girdle(s, { prot: 6 }); B.reach(s, V(sg(s) * 0.2, 1.18, CK.z + 0.04), { pole: V(sg(s), -0.6, -0.2), hand: { axis: over(s, X), flex: 0 } }); B.fingers(s, 1); }
      },
    });
  },
  update(props, B, k, env) { P.setLine(env.cable, env.pulley, B.pt('foot_L', V(0.08, 0.09, 0.0))); },
});

// ===== Απαγωγοί / προσαγωγοί σε μηχάνημα
function hipMachine(id, { abduct }) {
  def(id, {
    view: { az: 8, el: 22 },
    base: { pitch: -16, z: 0.0, sp: [-2, 0, 0], nk: [4, 0, 0], ab: abduct ? 2 : 40 },
    keys: abduct ? { setup: { ab: 2 }, open: { ab: 38 }, hold: { ab: 38.5 } } : { setup: { ab: 40 }, close: { ab: 2 }, hold: { ab: 1.5 } },
    seq: abduct
      ? [['setup', 1.3, 0, { act: 'setup' }], ['open', 1.2, 1, { act: 'con' }], ['hold', 0.9, 2, { act: 'iso' }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.2 }]]
      : [['setup', 1.3, 0, { act: 'setup' }], ['close', 1.2, 1, { act: 'con', hold: 0.4 }], ['setup', 2.0, 2, { act: 'ecc', hold: 0.2 }]],
    loop: 1,
    setup(props, env) {
      props.add('seat', P.seat({ h: 0.5, z: 0.1, zb: -0.16, back: 16, backH: 0.72, depth: 0.44 }));
      env.pads = SIDES.map((s) => props.add('pad' + s, (() => { const g = new THREE.Group(); const p = P.box(0.06, 0.2, 0.24, V(), P.MAT.pad, 0.025); g.add(p); return g; })()));
      env.arms = SIDES.map((s) => props.add('arm' + s, P.tube(V(), V(0, 1, 0), 0.02)));
    },
    pose(B, k, ctx) {
      machineSeat(B, k, ctx, (B, k) => { for (const s of SIDES) B.leg(s, { flex: 76, abd: k.ab, rot: 0, knee: 88, df: 6 }); }, () => {}, 16);
      B.solve();
      const hip = B.pivot('pelvis');
      sideHandles(B, hip.y - 0.0, hip.z + 0.0);
    },
    update(props, B, k, env) {
      SIDES.forEach((s, i) => {
        const kn = B.pt('thigh_' + s, V(sg(s) * (abduct ? 0.135 : 0.03), 0.5, 0.06));
        env.pads[i].position.copy(kn);
        const d = B.pivot('shank_' + s).sub(B.pivot('thigh_' + s)).normalize();
        env.pads[i].quaternion.setFromUnitVectors(Z, d);
        P.setTube(env.arms[i], V(sg(s) * 0.05, 0.3, kn.z), kn.clone().add(V(0, -0.08, 0)), 0.02);
      });
    },
  });
}
hipMachine('hip_abduction', { abduct: true });
hipMachine('hip_adduction', { abduct: false });

// ===== Clamshell (στο πλάι)
def('clamshell', {
  view: { az: -70, el: 34 },
  base: { open: 0 },
  keys: {
    setup: { open: 0 },
    open: { open: 1 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['open', 1.2, 1, { act: 'con', hold: 0.4 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props, env) {
    props.add('mat', P.floorMat({ len: 1.9, z: -0.15 }));
    env.band = props.add('band', P.line(0.008, P.MAT.band));
  },
  pose(B, k, ctx) {
    // στο δεξί πλευρό: το κεφάλι προς −z, το μπροστινό μέρος του σώματος κοιτάζει −x
    const q = new THREE.Quaternion().setFromAxisAngle(Z, 90 * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(X, -90 * D2R));
    B.root(V(0, 0.5, 0), q);
    B.spine(-breath(ctx.t, 0.3), 0, 0);
    B.neck(4, -10, 0);
    const u = smooth(k.open);
    B.leg('R', { flex: 48, abd: 0, rot: 0, knee: 92, df: 0 });
    B.leg('L', { flex: 46, abd: lerp(0, 30, u), rot: lerp(0, -30, u), knee: 92, df: 0 });
    B.girdle('R', { elev: 16, prot: 0 });
    B.arm('R', { plane: 90, elev: 160, rot: 0, elbow: 20, pron: 90 });
    B.fingers('R', 0.2);
    B.girdle('L', { prot: 10 });
    B.arm('L', { plane: 100, elev: 40, rot: 0, elbow: 60, pron: 175 });
    B.fingers('L', 0.1);
    rest(B, [{ bones: ['pelvis', 'chest', 'thigh_R', 'girdle_R', 'upperarm_R', 'head'], n: Y, d: MAT }]);
    // το αριστερό χέρι στηρίζεται στο στρώμα μπροστά από το στήθος
    const S = B.pivot('upperarm_L');
    B.reach('L', V(S.x - 0.22, MAT + 0.006, S.z + 0.12), { at: 'palm', pole: V(0, 1, 0.3), hand: { palm: V(0, -1, 0), fingers: V(0, 0.12, -1).normalize() } });
    B.fingers('L', -0.25);
  },
  update(props, B, k, env) {
    P.setLine(env.band, B.pt('thigh_L', V(0.14, 0.52, 0.06)), B.pt('thigh_R', V(-0.14, 0.52, 0.06)));
  },
});

// ===== Τετραποδική στάση (fire hydrant, bird dog)
export function quadruped(B, k, ctx, o = {}) {
  const handsZ = o.handsZ;
  const solveAt = (pitch) => {
    trunk(B, { pitch, yaw: 0, sp: k.sp || [0, 0, 0], nk: k.nk || [-14, 0, 0] }, V(0, 0.5, 0), { t: ctx.t, breathe: 0.3 });
    for (const s of SIDES) {
      const leg = (o.leg && o.leg(s, k, pitch)) || { flex: 90 - (pitch - 80), abd: 2, knee: 92, df: -65 };
      B.leg(s, leg);
      B.toes(s, 0);
    }
    const kneeBones = SIDES.filter((s) => !(o.leg && o.leg(s, k, pitch) && o.leg(s, k, pitch).free)).map((s) => 'shank_' + s);
    rest(B, [{ bones: kneeBones, n: Y, d: MAT, region: (x, y, z) => true }]);
    let worst = -Infinity;
    for (const s of SIDES) {
      if (o.arm && o.arm(s, k)) continue;
      const S = B.pivot('upperarm_' + s);
      worst = Math.max(worst, S.y - (MAT + armReach(B, s, 4) - 0.035));
    }
    return worst;
  };
  let lo = 60, hi = 100;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (solveAt(m) > 0) lo = m; else hi = m; }
  solveAt((lo + hi) / 2);
  B.solve();
  for (const s of SIDES) {
    const fk = o.arm && o.arm(s, k);
    B.girdle(s, { prot: 4, elev: 0 });
    const S = B.pivot('upperarm_' + s);
    const floorP = V(sg(s) * 0.17, MAT + 0.003, handsZ ?? S.z + 0.04);
    if (fk) {
      // χέρι που σηκώνεται: από τη στήριξη στο έδαφος προς τη θέση της ορθής κινηματικής
      armSag(B, s, fk.pose);
      B.solve();
      const up = B.palm(s);
      const Rh = B.rot('hand_' + s);
      const palmFK = B.side[s].n0.clone().applyQuaternion(Rh), fingFK = B.side[s].h0.clone().applyQuaternion(Rh);
      B.reach(s, floorP.clone().lerp(up, fk.u), {
        at: 'palm', pole: 'keep', poleTo: V(sg(s) * 0.3, 0.1, -1), poleU: 1 - fk.u,
        hand: { palm: V(0, -1, 0).lerp(palmFK, fk.u).normalize(), fingers: V(sg(s) * 0.1, 0.1, 1).normalize().lerp(fingFK, fk.u).normalize() },
      });
      B.fingers(s, lerp(-0.25, 0.1, fk.u));
      continue;
    }
    B.reach(s, floorP, { at: 'palm', pole: V(sg(s) * 0.3, 0.1, -1), hand: { palm: V(0, -1, 0), fingers: V(sg(s) * 0.1, 0.1, 1).normalize() } });
    B.fingers(s, -0.25);
  }
}
def('fire_hydrant', {
  view: { az: 20, el: 26 },
  base: { ab: 0, sp: [0, 0, 0], nk: [-16, 0, 0] },
  keys: {
    setup: { ab: 0 },
    up: { ab: 1 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.1, 1, { act: 'con', hold: 0.35 }], ['setup', 1.7, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props) { props.add('mat', P.floorMat({ len: 1.6, z: 0.2 })); },
  pose(B, k, ctx) {
    const env = ctx.env;
    if (env.hz === undefined) { quadruped(B, { ...k, ab: 0 }, ctx); env.hz = B.pivot('upperarm_L').z + 0.04; B.reset(); }
    quadruped(B, k, ctx, {
      handsZ: env.hz,
      leg: (s, k, pitch) => (s === 'L' && k.ab > 0.02 ? { flex: 90 - (pitch - 80) - 8 * smooth(k.ab), abd: 55 * smooth(k.ab), rot: -8 * smooth(k.ab), knee: 92, df: -65, free: true } : null),
    });
  },
});

// ===== Monster walk (πλάγια βήματα με λάστιχο)
def('monster_walk', {
  view: { az: 16, el: 12 },
  base: { y: 0.79, pitch: 16, sp: [0, 0, 0], nk: [-6, 0, 0], x: 0, fL: [0.15, 0], fR: [-0.15, 0] },
  keys: {
    band: { y: 0.85, pitch: 2, x: 0, fL: [0.12, 0], fR: [-0.12, 0] },
    set: { x: 0, fL: [0.15, 0], fR: [-0.15, 0] },
    l1: { x: 0.06, fL: [0.39, 0.05], fR: [-0.15, 0] },
    l1b: { x: 0.12, fL: [0.39, 0], fR: [-0.15, 0] },
    l2: { x: 0.2, fL: [0.39, 0], fR: [0.03, 0.04] },
    l2b: { x: 0.24, fL: [0.39, 0], fR: [0.09, 0] },
    r1: { x: 0.18, fL: [0.39, 0], fR: [-0.15, 0.05] },
    r1b: { x: 0.12, fL: [0.39, 0], fR: [-0.15, 0] },
    r2: { x: 0.04, fL: [0.21, 0.04], fR: [-0.15, 0] },
    r2b: { x: 0, fL: [0.15, 0], fR: [-0.15, 0] },
  },
  seq: [['band', 1.2, 0, { act: 'setup' }], ['set', 1.0, 1, { act: 'iso' }],
    ['l1', 0.45, 1, { act: 'con' }], ['l1b', 0.35, 1, { act: 'iso' }], ['l2', 0.45, 1, { act: 'con' }], ['l2b', 0.35, 1, { act: 'iso' }],
    ['r1', 0.45, 2, { act: 'con' }], ['r1b', 0.35, 2, { act: 'iso' }], ['r2', 0.45, 2, { act: 'con' }], ['r2b', 0.35, 2, { act: 'iso' }]],
  loop: 2,
  setup(props, env) { env.band = props.add('band', P.line(0.009, P.MAT.band)); env.band2 = props.add('band2', P.line(0.009, P.MAT.band)); },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, balance: false,
      feet: (k) => ({ L: { at: V(k.fL[0], FLOOR + k.fL[1], 0.0), yaw: 8, pole: V(0.3, 0, 1) }, R: { at: V(k.fR[0], FLOOR + k.fR[1], 0.0), yaw: 8, pole: V(-0.3, 0, 1) } }),
      upper: (B) => { for (const s of SIDES) { B.girdle(s, { prot: 6 }); B.arm(s, { plane: 96, elev: 30, rot: 10, elbow: 84, pron: 90 }); B.fingers(s, 0.6); } },
    });
  },
  update(props, B, k, env) {
    P.setLine(env.band, B.pt('thigh_L', V(0.13, 0.5, 0.07)), B.pt('thigh_R', V(-0.13, 0.5, 0.07)));
    P.setLine(env.band2, B.pt('thigh_L', V(0.11, 0.5, 0.0)), B.pt('thigh_R', V(-0.11, 0.5, 0.0)));
  },
});

// ===== Ρουμάνικη άρση σε ένα πόδι
def('single_leg_rdl', {
  view: { az: 64, el: 10 },
  base: { y: 0.845, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], hip: 0 },
  keys: {
    stand: { y: 0.84, pitch: 0, hip: 0 },
    tilt: { y: 0.8, pitch: 78, hip: 1, nk: [-10, 0, 0] },
  },
  seq: [['stand', 1.4, 0, { act: 'setup' }], ['tilt', 2.2, 1, { act: 'ecc' }], ['stand', 1.5, 2, { act: 'con', hold: 0.4 }]],
  loop: 1,
  setup(props, env) { env.db = props.add('db', P.dumbbell()); },
  pose(B, k, ctx) {
    const foot = V(-0.1, FLOOR, 0.0);
    stand(B, k, {
      t: ctx.t, balanceX: true,
      feet: () => ({ R: { at: foot, yaw: 6, pole: V(-0.1, 0, 1) } }),
      target: () => foot.clone().add(V(0, 0, 0.012)),
      free: { L: (k) => ({ flex: lerp(12, -4, smooth(k.hip)), abd: 3, knee: lerp(40, 6, smooth(k.hip)), df: lerp(8, -12, k.hip) }) },
      upper: (B, k) => {
        B.solve();
        const S = B.pivot('upperarm_L');
        B.girdle('L', { prot: 6 * k.hip });
        const L = armReach(B, 'L', 5);
        B.reach('L', V(S.x - 0.02, S.y - L, S.z + 0.02), { pole: V(0.3, 0, -1), hand: { axis: V(0, 0, 1), flex: 0 } });
        B.fingers('L', 1);
        B.arm('R', { plane: 40, elev: lerp(10, 40, k.hip), rot: 0, elbow: 20, pron: 90 });
        B.fingers('R', 0.2);
      },
      loads: () => [{ p: B.grip('L'), kg: 16 }],
    });
  },
  update(props, B, k, env) { inHand(env.db, B, 'L'); },
});

// ===== Wall sit
const WALL = -0.3;
def('wall_sit', {
  view: { az: 76, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0] },
  keys: {
    lean: { y: 0.84, pitch: -5 },
    down: { y: 0.49, pitch: -2 },
    hold: { y: 0.488, pitch: -2 },
  },
  seq: [['lean', 1.4, 0, { act: 'setup' }], ['down', 2.0, 1, { act: 'ecc' }], ['hold', 3.2, 2, { act: 'iso' }], ['lean', 1.6, 2, { act: 'con', hold: 0.4 }]],
  loop: 1,
  setup(props) { props.add('wall', P.wall({ z: WALL, w: 1.4, h: 2.0 })); },
  pose(B, k, ctx) {
    // όρθιος στον τοίχο: η λεκάνη όσο ψηλά φτάνουν τα πόδια, με μαλακά γόνατα (όχι απότομο «κλείδωμα»)
    let y = k.y;
    for (let it = 0; it < 6; it++) {
      trunk(B, k, V(0, y, 0), { t: ctx.t, breathe: 0.6 });
      for (const s of SIDES) { B.girdle(s, { prot: -2 }); B.arm(s, { plane: 70, elev: 16, rot: 0, elbow: 30, pron: 60 }); B.fingers(s, 0.2); }
      rest(B, [{ bones: ['chest', 'pelvis', 'spine2', 'girdle_L', 'girdle_R'], n: Z, d: WALL }]);
      let ex = 0;
      for (const s of SIDES) ex = Math.max(ex, softExcess(B.plant(s, V(sg(s) * 0.15, FLOOR, 0.2), { yaw: 8, pole: V(sg(s) * 0.15, 0, 1) }), 0.01));
      if (ex < 1e-4) break;
      y -= ex * 1.05 + 2e-4;
    }
  },
});

// ===== Kettlebell swing
def('kettlebell_swing', {
  view: { az: 72, el: 8 },
  base: { y: 0.84, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.36, toe: 14, arm: -10, held: 1, g: 1 },
  keys: {
    setup: { y: 0.85, pitch: 0, nk: [0, 0, 0], arm: 4, held: 0, g: 0 },
    grip: { y: 0.78, pitch: 76, nk: [-30, 0, 0], arm: 100, held: 0, g: 1 },
    hike: { y: 0.75, pitch: 62, nk: [-18, 0, 0], arm: 12, held: 1, g: 1 },
    snap: { y: 0.85, pitch: -3, nk: [0, 0, 0], arm: 62, held: 1 },
    float: { y: 0.852, pitch: -4, nk: [0, 0, 0], arm: 88, held: 1 },
    fall: { y: 0.83, pitch: 10, nk: [-4, 0, 0], arm: 20, held: 1 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['grip', 1.2, 1, { act: 'setup' }], ['hike', 0.7, 1, { act: 'iso' }], ['snap', 0.42, 2, { act: 'con', ease: 'out' }], ['float', 0.3, 2, { act: 'iso', ease: 'sine' }], ['fall', 0.42, 3, { act: 'ecc', ease: 'in', via: true }], ['hike', 0.4, 3, { act: 'ecc' }]],
  loop: 3,
  setup(props, env) {
    env.kb = props.add('kb', P.kettlebell());
    env.kbRest = V(0, 0.235, 0.38);
  },
  // το ύψος της λεκάνης στη θέση «grip» ώστε τα χέρια να φτάνουν τη λαβή στο έδαφος· εκεί μπαίνει το kettlebell
  prepare(B, keys, env) {
    const k = { ...keys.setup, ...keys.grip };
    let lo = 0.4, hi = 0.86;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) / 2;
      B.reset();
      this.pose(B, { ...k, y: m }, { t: 0, env: { kbRest: env.kbRest, probe: true } });
      const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
      if (c.y > 0.235) hi = m; else lo = m;
    }
    keys.grip.y = (lo + hi) / 2;
    B.reset();
    this.pose(B, { ...k, y: keys.grip.y }, { t: 0, env: { kbRest: env.kbRest, probe: true } });
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    env.kbRest = V(c.x, 0.235, c.z);
    B.reset();
  },
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B, k) => {
        B.solve();
        const Rc = B.rot('chest');
        for (const s of SIDES) {
          B.girdle(s, { prot: 6, elev: 0 });
          armSag(B, s, { flex: k.arm, abd: -12, rot: 0, elbow: 4, pron: 168, wflex: 0 });
          B.fingers(s, lerp(0.2, 1, k.g));
        }
        void Rc;
      },
      loads: () => (ctx.env.probe || k.held < 0.5 ? [] : [{ p: B.grip('L'), kg: 16 }]),
    });
  },
  update(props, B, k, env) {
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    const fa = B.pivot('hand_L').sub(B.pivot('forearm_L')).add(B.pivot('hand_R').sub(B.pivot('forearm_R'))).normalize();
    if (k.held <= 0.001) kbInHands(env.kb, env.kbRest, X, V(0, -1, 0));
    else kbInHands(env.kb, c, X, fa.lerp(V(0, -1, 0), 1 - k.held).normalize());
  },
});

// ===== Power clean
const PCL = { floorY: 0.225 };
def('power_clean', {
  view: { az: 64, el: 8 },
  base: { y: 0.6, pitch: 48, sp: [-3, 0, 0], nk: [-12, 0, 0], stance: 0.27, toe: 8, bar: [0, PCL.floorY, 0], rack: 0, heel: 0 },
  keys: {
    set: { y: 0.58, pitch: 50, bar: [0, PCL.floorY, 0] },
    knee: { y: 0.7, pitch: 46, bar: [0, 0.48, 0.0] },
    hip: { y: 0.82, pitch: 18, bar: [0, 0.68, 0.02], nk: [-4, 0, 0] },
    ext: { y: 0.895, pitch: -6, bar: [0, 0.98, 0.03], heel: 26, nk: [2, 0, 0] },
    catch: { y: 0.71, pitch: 10, rack: 1, heel: 0, nk: [0, 0, 0], bar: [0, 1.25, 0.16] },
    stand: { y: 0.85, pitch: 0, rack: 1, nk: [0, 0, 0], bar: [0, 1.4, 0.16] },
    drop: { y: 0.84, pitch: 3, rack: 0, bar: [0, 1.12, 0.3], nk: [0, 0, 0] },
    hang: { y: 0.83, pitch: 6, rack: 0, bar: [0, 0.76, 0.03], nk: [0, 0, 0] },
  },
  seq: [['set', 1.4, 0, { act: 'setup' }], ['knee', 0.9, 1, { act: 'con' }], ['hip', 0.35, 2, { act: 'con', via: true }], ['ext', 0.3, 2, { act: 'con', ease: 'out' }], ['catch', 0.38, 3, { act: 'con', ease: 'out' }], ['stand', 1.0, 3, { act: 'con', hold: 0.5 }],
    ['drop', 0.5, 0, { act: 'ecc', via: true }], ['hang', 0.6, 0, { act: 'ecc' }], ['set', 1.4, 0, { act: 'ecc', hold: 0.4 }]],
  loop: 1,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225] })); },
  // στο πρώτο τράβηγμα τα χέρια είναι τεντωμένα: το ύψος της λεκάνης ώστε να φτάνουν τη μπάρα
  prepare(B, keys) {
    for (const n of ['set', 'knee', 'hip', 'hang']) {
      const k = { ...keys.stand, ...keys[n] };
      let lo = 0.3, hi = 0.9;
      for (let i = 0; i < 22; i++) {
        const m = (lo + hi) / 2;
        B.reset();
        cleanPose(B, { ...k, y: m }, { t: 0, env: {} });
        if (lowReachAt(B, 0.25, k.bar[2]) > k.bar[1]) hi = m; else lo = m;
      }
      keys[n].y = (lo + hi) / 2;
    }
    B.reset();
  },
  pose(B, k, ctx) { cleanPose(B, k, ctx); },
  update(props, B, k, env) { placeBar(env.barObj, env.bar, X); },
});
function lowReachAt(B, w, z) {
  let y = -Infinity;
  for (const s of SIDES) {
    const S = B.pivot('upperarm_' + s);
    const L = armReach(B, s, 3);
    y = Math.max(y, S.y - Math.sqrt(Math.max(0.0001, L * L - (sg(s) * w - S.x) ** 2 - (z - S.z) ** 2)));
  }
  return y;
}
function cleanPose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      feet: (k) => ({ L: { at: V(0.135, FLOOR, 0), yaw: 8, lift: k.heel }, R: { at: V(-0.135, FLOOR, 0), yaw: 8, lift: k.heel } }),
      upper: (B, k) => {
        const r = smooth(clamp(k.rack, 0, 1));
        const I = B.I;
        const ARM = ['upperarm', 'forearm', 'twist', 'hand'];
        // 1) τράβηγμα: τα χέρια στη μπάρα (αντίστροφη κινηματική)
        let pull = null;
        if (r < 0.999) {
          for (const s of SIDES) {
            B.girdle(s, { elev: lerp(0, 10, r) + 14 * smooth(clamp(k.heel / 20, 0, 1)), prot: lerp(0, 12, r) });
            B.reach(s, V(...k.bar).add(V(sg(s) * 0.25, 0, 0)), { pole: V(sg(s) * 0.25, -0.2, -1), hand: { axis: over(s, X), flex: 0 } });
          }
          pull = {};
          for (const s of SIDES) for (const b of ARM) pull[b + s] = B.rig.local[I[b + '_' + s]].clone();
        }
        // 2) θέση rack (ορθή κινηματική) και ανάμειξη των δύο
        for (const s of SIDES) {
          B.girdle(s, { elev: lerp(0, 10, r) + 14 * smooth(clamp(k.heel / 20, 0, 1)), prot: lerp(0, 12, r) });
          B.arm(s, RACK);
          B.fingers(s, lerp(1, 0.55, r));
          if (pull) for (const b of ARM) { const q = B.rig.local[I[b + '_' + s]]; q.copy(pull[b + s].clone().slerp(q, r)); }
        }
        B.solve();
        const rackP = B.pt('chest', FRONT);
        const hands = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
        env.bar = hands.lerp(rackP, smooth(clamp((r - 0.4) / 0.6, 0, 1)));
      },
      loads: () => [{ p: env.bar, kg: 60 }],
    });
}

// ===== Γάμπες
const CALF = { h: 0.12 };
def('calf_raise', {
  view: { az: 70, el: 10, zoom: 1.15 },
  // ψηλότερα από όσο φτάνουν τα πόδια: η λεκάνη ανεβαίνει και κατεβαίνει μαζί με τις φτέρνες (τεντωμένα γόνατα)
  base: { y: 1.05 + CALF.h, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], heel: 0 },
  keys: {
    setup: { heel: 0 },
    low: { heel: -16 },
    high: { heel: 30 },
    hold: { heel: 30.5 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['low', 1.4, 1, { act: 'ecc', hold: 0.3 }], ['high', 1.0, 2, { act: 'con' }], ['hold', 0.9, 3, { act: 'iso' }], ['low', 1.9, 3, { act: 'ecc', hold: 0.3 }]],
  loop: 2,
  setup(props) {
    props.add('step', P.step({ w: 0.7, h: CALF.h, d: 0.36, c: V(0, 0, 0.22) }));
    props.add('post', P.tube(V(-0.45, 0, 0.25), V(-0.45, 1.3, 0.25), 0.02));
  },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      feet: (k) => ({ L: { at: V(0.11, CALF.h + 0.002, 0.065), ref: 'ball', pivot: 'ball', lift: k.heel, yaw: 4 }, R: { at: V(-0.11, CALF.h + 0.002, 0.065), ref: 'ball', pivot: 'ball', lift: k.heel, yaw: 4 } }),
      target: () => V(0, 0, 0.06),
      upper: (B) => {
        B.solve();
        B.reach('R', V(-0.45, 1.05, 0.22), { pole: V(-0.5, -1, -0.2), hand: { axis: V(0, 1, 0), flex: 0 } });
        B.fingers('R', 1);
        B.arm('L', { plane: 92, elev: 6, rot: 0, elbow: 12, pron: 80 });
        B.fingers('L', 0.2);
      },
    });
  },
});
def('seated_calf_raise', {
  view: { az: 72, el: 10, zoom: 1.2 },
  base: { pitch: 6, z: 0.0, sp: [4, 0, 0], nk: [6, 0, 0], heel: 0 },
  keys: {
    setup: { heel: 0 },
    low: { heel: -18 },
    high: { heel: 30 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['low', 1.4, 1, { act: 'ecc', hold: 0.3 }], ['high', 1.1, 2, { act: 'con', hold: 0.5 }], ['low', 1.9, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 2,
  setup(props, env) {
    props.add('seat', P.seat({ h: 0.48, z: 0.0, back: null, depth: 0.42 }));
    props.add('block', P.step({ w: 0.5, h: 0.1, d: 0.16, c: V(0, 0, 0.56) }));
    env.pad = props.add('pad', P.roller(0.44, 0.055));
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: 0.48,
      limbs: (B, k, ph) => {
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.12, 0.1 + 0.002, 0.53), { ref: 'ball', pivot: 'ball', lift: k.heel, yaw: 4, pole: V(0, 0.4, 1) });
        B.solve();
        for (const s of SIDES) {
          const kn = B.pt('thigh_' + s, V(sg(s) * 0.07, 0.5, 0.05));
          B.reach(s, kn.add(V(0, 0.1, 0.03)), { pole: V(sg(s), -0.3, -0.5), hand: { axis: over(s, X), flex: 0 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const t = B.pt('thigh_L', V(0, 0.5, 0.06)).add(B.pt('thigh_R', V(0, 0.5, 0.06))).multiplyScalar(0.5);
    env.pad.position.copy(t).add(V(0, 0.07, 0));
  },
});
def('tibialis_raise', {
  view: { az: 64, el: 8, focus: 'shank_L', fb: 0.5 },
  base: { y: 0.84, pitch: -9, sp: [0, 0, 0], nk: [4, 0, 0], toe: 0 },
  keys: {
    setup: { toe: 0 },
    up: { toe: -26 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.0, 1, { act: 'con', hold: 0.4 }], ['setup', 1.6, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup(props) { props.add('wall', P.wall({ z: WALL, w: 1.4, h: 2.0 })); },
  pose(B, k, ctx) {
    trunk(B, k, V(0, k.y, 0), { t: ctx.t, breathe: 0.4 });
    for (const s of SIDES) { B.arm(s, { plane: 80, elev: 8, rot: 0, elbow: 10, pron: 70 }); B.fingers(s, 0.15); }
    rest(B, [{ bones: ['chest', 'girdle_L', 'girdle_R', 'pelvis'], n: Z, d: WALL }]);
    for (const s of SIDES) B.plant(s, V(sg(s) * 0.12, FLOOR, WALL + 0.3 + 0.075), { yaw: 4, pitch: k.toe, pivot: 'heel' });
  },
});
def('ankle_eversion', {
  view: { az: 20, el: 30, zoom: 2.2, focus: 'foot_L' },
  base: { ev: 0 },
  keys: {
    setup: { ev: 6 },
    out: { ev: -24 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['out', 1.1, 1, { act: 'con', hold: 0.35 }], ['setup', 1.6, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props, env) {
    props.add('mat', P.floorMat({ len: 1.8, z: 0.2 }));
    const post = new THREE.Group();
    post.add(P.tube(V(-0.35, 0, 0.92), V(-0.35, 0.35, 0.92), 0.025));
    props.add('post', post);
    env.band = props.add('band', P.line(0.007, P.MAT.band));
  },
  pose(B, k, ctx) {
    trunk(B, { pitch: -8, sp: [6, 0, 0], nk: [18, 0, 0] }, V(0, 0.4, 0), { t: ctx.t, breathe: 0.4 });
    for (const s of SIDES) B.leg(s, { flex: 84, abd: 6, knee: 3, df: 6, inv: s === 'L' ? k.ev : 0 });
    for (const s of SIDES) { B.girdle(s, { elev: 6, prot: -6 }); B.arm(s, { plane: 30, elev: 30, rot: 0, elbow: 6, pron: 160 }); B.fingers(s, 0); }
    rest(B, [{ bones: ['pelvis', 'thigh_L', 'thigh_R', 'shank_L', 'shank_R'], n: Y, d: MAT }]);
    B.solve();
    for (const s of SIDES) { const S = B.pivot('upperarm_' + s); B.reach(s, V(sg(s) * 0.25, MAT + 0.003, S.z - 0.2), { at: 'palm', pole: V(sg(s), 0.2, 0.3), hand: { palm: V(0, -1, 0), fingers: V(sg(s) * 0.3, 0, -1) } }); }
  },
  update(props, B, k, env) { P.setLine(env.band, V(-0.35, 0.28, 0.92), B.pt('foot_L', V(0.07, 0.05, 0.1))); },
});
def('short_foot', {
  view: { az: 34, el: 26, zoom: 2.4, focus: 'foot_L' },
  base: { a: 0 },
  keys: {
    setup: { a: 0 },
    pull: { a: 1 },
    hold: { a: 1.03 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['pull', 1.0, 1, { act: 'con' }], ['hold', 2.6, 2, { act: 'iso' }], ['setup', 1.0, 2, { act: 'rest', hold: 0.6 }]],
  loop: 1,
  setup(props) { props.add('bench', P.bench({ h: 0.44, z0: 0.15, z1: -0.9 })); },
  pose(B, k, ctx) {
    sit(B, { pitch: 2, z: 0, sp: [4, 0, 0], nk: [16, 0, 0] }, {
      t: ctx.t, h: 0.44, seatRegion: (x, y, z) => z < 0.17,
      limbs: (B, kk, ph) => {
        if (ph !== 'post') return;
        const a = clamp(k.a, 0, 1.05);
        for (const s of SIDES) {
          const act = s === 'L' ? a : 0;
          B.plant(s, V(sg(s) * 0.14, FLOOR, 0.5), { yaw: 8, roll: 4 * act, toes: -3 * act });
        }
        for (const s of SIDES) { B.arm(s, { plane: 84, elev: 22, rot: 0, elbow: 50, pron: 160 }); B.fingers(s, 0.2); }
      },
    });
  },
});
