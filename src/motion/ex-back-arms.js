// Πλάτη και χέρια.
import * as THREE from 'three';
import * as P from './props.js';
import {
  def, MOTIONS, SIDES, V, sg, FLOOR, MAT, D2R, lerp, smooth, X, Y, Z, over, under, Body, clamp,
  barFromHands, placeBar, inHand, rest, BACK, stand, onSurface, sit, plankSolve, hang, armsFK, armsSag, armSag, dirToArm,
  topReach, lowReach, surfaceY, armReach, feetPair, sway, trunk, kbInHands,
} from './lib.js';

const barUpdate = (props, B, k, env) => { const b = barFromHands(B); placeBar(env.barObj, b.c, b.u); };
const BENCH = { h: 0.44, z0: 0.36, z1: -0.86 };
const onBench = (bones = BACK) => ({ bones, n: Y, d: BENCH.h, region: (x, y, z) => Math.abs(x) < 0.17 && z < BENCH.z0 + 0.03 && z > BENCH.z1 - 0.03 });
const benchFeet = (B, z = 0.5, w = 0.27, yaw = 14) => { for (const s of SIDES) B.plant(s, V(sg(s) * w, FLOOR, z), { yaw, pole: V(sg(s) * 0.25, 0.25, 1) }); };

// ------------------------------------------------------------------ μπάρα σε κάμψη ισχίου
// Η μπάρα στα χέρια με τεντωμένους αγκώνες, στο z = zb (ή κάτω από τους ώμους). Με floorY η μπάρα
// ξεκινά από το έδαφος: όσο δεν την κρατά (hold < 1) μένει κάτω και τα χέρια πηγαίνουν προς αυτήν·
// μόλις την πιάσει, σηκώνεται εκεί όπου φτάνουν τα τεντωμένα χέρια.
function barHinge(B, k, ctx, o) {
  const env = ctx.env;
  const w = o.w ?? 0.24;
  // tz: πού πέφτει το κέντρο μάζας (σώμα + μπάρα) κατά μήκος του πέλματος — στο σήκωμα από το έδαφος
  // λίγο πίσω από το μέσο, ώστε η λεκάνη να μένει πίσω και οι κνήμες σχεδόν κάθετες
  const tz = k.tz ?? o.tz;
  stand(B, k, {
    t: ctx.t,
    feet: o.feet,
    target: tz === undefined ? undefined : () => V(0, 0, tz),
    upper: (B, k) => {
      for (const s of SIDES) B.girdle(s, { elev: k.gel ?? 0, prot: k.gpr ?? 0 });
      B.solve();
      const zb = o.zb ?? (B.pivot('upperarm_L').z + B.pivot('upperarm_R').z) / 2;
      const reachY = lowReach(B, w, zb, o.flex ?? 3);
      const hold = k.hold ?? 1;
      const held = hold >= 0.999;
      const by = o.floorY !== undefined ? Math.max(o.floorY, reachY) : reachY;
      const c = V(0, held ? by : o.floorY, zb);
      env.bar = c;
      env.reachY = reachY;
      env.barHeld = held;
      for (const s of SIDES) {
        let T = c.clone().add(V(sg(s) * w, 0, 0));
        if (!held) {
          // από τους μηρούς προς τη μπάρα στο έδαφος
          const thigh = B.pt('thigh_' + s, V(sg(s) * 0.095, 0.62, 0.115));
          T = thigh.lerp(T, smooth(hold));
        }
        B.reach(s, T, { pole: o.pole ? o.pole(s, k) : V(sg(s) * 0.2, 0.1, -1), hand: { axis: o.grip ? o.grip(s) : over(s, X), flex: o.wflex ?? 0 } });
        B.fingers(s, 0.25 + 0.75 * smooth(hold));
      }
    },
    loads: () => (env.barHeld && env.bar ? [{ p: env.bar, kg: o.kg ?? 80 }] : []),
  });
}
// θέσεις με «by» (ύψος μπάρας): βρίσκουμε το ύψος της λεκάνης ώστε τα τεντωμένα χέρια να φτάνουν
// ακριβώς τη μπάρα (μία φορά, πριν την αναπαραγωγή)
function solveBarKeys(B, keys, o) {
  for (const k of Object.values(keys)) {
    if (k.by === undefined) continue;
    let lo = 0.25, hi = 0.9;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) / 2;
      const env = {};
      B.reset();
      barHinge(B, { ...k, y: m, hold: 1 }, { t: 0, env }, { ...o, floorY: undefined });
      if (env.reachY > k.by) hi = m; else lo = m;
    }
    k.y = (lo + hi) / 2;
  }
  B.reset();
}

// ===== Άρση θανάτου (deadlift)
const DL = { floorY: 0.225, zb: 0.0 };
DL.o = { w: 0.235, zb: DL.zb, floorY: DL.floorY, kg: 100 };
def('deadlift', {
  view: { az: 68, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.26, toe: 8, hold: 0, tz: 0.012 },
  keys: {
    stand: { y: 0.85, pitch: 0, hold: 0, nk: [0, 0, 0] },
    grip: { y: 0.62, pitch: 74, sp: [10, 0, 0], nk: [-6, 0, 0], hold: 1, by: DL.floorY, tz: -0.025 },
    set: { y: 0.6, pitch: 66, sp: [-3, 0, 0], nk: [-18, 0, 0], hold: 1, by: DL.floorY + 0.004, tz: -0.035 },
    knee: { y: 0.7, pitch: 52, sp: [-3, 0, 0], nk: [-12, 0, 0], hold: 1, by: 0.47, tz: -0.015 },
    top: { y: 0.85, pitch: -2, sp: [-3, 0, 0], nk: [0, 0, 0], hold: 1, by: 0.779 },
  },
  seq: [['stand', 1.2, 0, { act: 'setup' }], ['grip', 1.8, 1, { act: 'setup' }], ['set', 1.0, 2, { act: 'iso' }], ['knee', 0.8, 3, { act: 'con', via: true }], ['top', 0.8, 3, { act: 'con', hold: 0.5 }],
    ['grip', 1.9, 1, { act: 'ecc' }], ['set', 0.7, 2, { act: 'iso' }], ['knee', 0.8, 3, { act: 'con', via: true }], ['top', 0.8, 3, { act: 'con', hold: 0.5 }]],
  loop: 5,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225, 0.225] })); },
  prepare(B, keys) { solveBarKeys(B, keys, DL.o); },
  pose(B, k, ctx) { barHinge(B, k, ctx, DL.o); },
  update(props, B, k, env) {
    const c = env.barHeld ? barFromHands(B).c : V(0, DL.floorY, DL.zb);
    placeBar(env.barObj, c, X);
  },
});

// ===== Ρουμάνικη άρση (RDL)
def('rdl', {
  view: { az: 70, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [-2, 0, 0], nk: [0, 0, 0], stance: 0.24, toe: 6, hold: 1 },
  keys: {
    stand: { y: 0.852, pitch: 0 },
    soft: { y: 0.836, pitch: 3 },
    bottom: { y: 0.808, pitch: 76, sp: [0, 0, 0], nk: [-8, 0, 0], gpr: 6 },
  },
  seq: [['stand', 1.2, 0, { act: 'setup' }], ['soft', 0.9, 1, { act: 'iso' }], ['bottom', 2.3, 2, { act: 'ecc' }], ['soft', 1.5, 3, { act: 'con', hold: 0.35 }]],
  loop: 2,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225] })); },
  pose(B, k, ctx) { barHinge(B, k, ctx, { w: 0.23, kg: 60 }); },
  update: barUpdate,
});

// ===== Άρση sumo
const SUMO = {
  w: 0.165, zb: DL.zb, floorY: DL.floorY, kg: 100,
  feet: () => ({ L: { at: V(0.37, FLOOR, 0.0), yaw: 36, pole: V(0.6, 0, 0.8) }, R: { at: V(-0.37, FLOOR, 0.0), yaw: 36, pole: V(-0.6, 0, 0.8) } }),
};
def('sumo_deadlift', {
  view: { az: 34, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.74, toe: 36, hold: 0, tz: 0.012 },
  keys: {
    stand: { y: 0.84, pitch: 0, hold: 0 },
    grip: { y: 0.5, pitch: 50, sp: [10, 0, 0], nk: [-6, 0, 0], hold: 1, by: DL.floorY, tz: -0.02 },
    set: { y: 0.49, pitch: 46, sp: [-4, 0, 0], nk: [-14, 0, 0], hold: 1, by: DL.floorY + 0.004, tz: -0.035 },
    knee: { y: 0.66, pitch: 30, sp: [-3, 0, 0], nk: [-8, 0, 0], hold: 1, by: 0.48, tz: -0.015 },
    top: { y: 0.84, pitch: -2, sp: [-3, 0, 0], hold: 1, by: 0.735 },
  },
  seq: [['stand', 1.2, 0, { act: 'setup' }], ['grip', 1.8, 1, { act: 'setup' }], ['set', 1.0, 2, { act: 'iso' }], ['knee', 0.8, 3, { act: 'con', via: true }], ['top', 0.8, 3, { act: 'con', hold: 0.5 }],
    ['grip', 1.9, 1, { act: 'ecc' }], ['set', 0.7, 2, { act: 'iso' }], ['knee', 0.8, 3, { act: 'con', via: true }], ['top', 0.8, 3, { act: 'con', hold: 0.5 }]],
  loop: 5,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225, 0.225] })); },
  prepare(B, keys) { solveBarKeys(B, keys, SUMO); },
  pose(B, k, ctx) { barHinge(B, k, ctx, SUMO); },
  update(props, B, k, env) {
    const c = env.barHeld ? barFromHands(B).c : V(0, DL.floorY, DL.zb);
    placeBar(env.barObj, c, X);
  },
});

// ===== Έλξεις (pull-up / chin-up)
function pullup(id, { w, grip, pole, view, topDrop = 0.6 }) {
  def(id, {
    view,
    frameProps: false,
    base: { lift: 0, pitch: -2, sp: [0, 0, 0], nk: [0, 0, 0], gel: 26, gpr: 0, hip: 6, knee: 12 },
    keys: {
      hang: { lift: 0, gel: 30 },
      set: { lift: 0.07, gel: 6, gpr: -6, sp: [-4, 0, 0] },
      top: { lift: 1, gel: -2, gpr: -14, pitch: -10, sp: [-8, 0, 0], nk: [-8, 0, 0], hip: 14, knee: 20 },
    },
    seq: [['hang', 1.2, 0, { act: 'setup' }], ['set', 0.9, 1, { act: 'con' }], ['top', 1.4, 2, { act: 'con', hold: 0.35 }], ['set', 2.1, 3, { act: 'ecc', hold: 0.25 }]],
    loop: 2,
    setup(props) { props.add('bar', P.pullupBar({ y: 2.3, w: 1.5 })); },
    pose(B, k, ctx) {
      hang(B, k, { t: ctx.t, hand: (s) => V(sg(s) * w, 2.3, 0), yTop: 2.3 - topDrop, pole: (s) => pole(s), grip: (s) => ({ axis: grip(s), flex: -6 }) });
    },
  });
}
pullup('pull_up', { w: 0.37, grip: (s) => over(s, X), pole: (s) => V(sg(s) * 0.85, -0.6, -0.15), view: { az: 150, el: 6 } });
pullup('chin_up', { w: 0.19, grip: (s) => under(s, X), pole: (s) => V(sg(s) * 0.35, -0.6, 0.55), view: { az: 38, el: 6 } });

// ===== Έλξεις τροχαλίας (lat pulldown)
const LP = { h: 0.47, py: 2.3 };
def('lat_pulldown', {
  view: { az: 140, el: 10 },
  frameProps: false,
  base: { pitch: -8, z: 0.0, sp: [0, 0, 0], nk: [-4, 0, 0], p: 0, gel: 22 },
  keys: {
    setup: { p: 0, pitch: -4, gel: 24 },
    lean: { p: 0, pitch: -14, sp: [-6, 0, 0], gel: 20 },
    down: { p: 1, pitch: -18, sp: [-9, 0, 0], nk: [-10, 0, 0], gel: -4 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['lean', 0.9, 1, { act: 'iso' }], ['down', 1.3, 2, { act: 'con', hold: 0.35 }], ['lean', 2.1, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    g.add(P.seat({ h: LP.h, z: 0.02, back: null, depth: 0.42 }));
    g.add(P.box(0.14, 2.45, 0.14, V(0, 1.225, -0.55), P.MAT.frame, 0.01));
    g.add(P.tube(V(0, 2.38, -0.55), V(0, 2.38, 0.08), 0.035));
    g.add(P.tube(V(0, 0.85, -0.5), V(0, 0.72, 0.22), 0.03));
    const kp = P.roller(0.42, 0.055); kp.position.set(0, 0.72, 0.24); g.add(kp);
    props.add('machine', g);
    env.cable = props.add('cable', P.line(0.004));
    env.barObj = props.add('bar', P.rod(1.15, 0.015, P.MAT.steel));
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: LP.h,
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) B.leg(s, { flex: 98, abd: 8, knee: 92 }); return; }
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.17, FLOOR, 0.46), { yaw: 8, pole: V(sg(s) * 0.1, 0.3, 1) });
        B.solve();
        const w = 0.42;
        const zt = B.pivot('head').z + 0.04;
        const yTop = topReach(B, w, zt, 5);
        const chest = B.pt('chest', V(0, 1.36, 0.17));
        const p = smooth(k.p);
        const c = V(0, lerp(yTop, chest.y + 0.03, k.p), lerp(zt, chest.z + 0.03, p));
        ctx.env.bar = c;
        for (const s of SIDES) {
          B.girdle(s, { elev: k.gel, prot: lerp(0, -10, p) });
          B.reach(s, c.clone().add(V(sg(s) * w, 0, 0)), { pole: V(sg(s), -0.5, -0.25), hand: { axis: over(s, X), flex: -6 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const b = barFromHands(B);
    placeBar(env.barObj, b.c, b.u);
    P.setLine(env.cable, V(0, LP.py, 0.08), b.c);
  },
});

// ===== Κωπηλατική με μπάρα σε κάμψη (barbell row)
function rowBar(B, k, ctx, { w = 0.25, kg = 50 }) {
  const env = ctx.env;
  stand(B, k, {
    t: ctx.t,
    upper: (B, k) => {
      B.solve();
      const p = smooth(k.p ?? 0);
      for (const s of SIDES) B.girdle(s, { elev: 0, prot: lerp(8, -14, p) });
      B.solve();
      const zs = (B.pivot('upperarm_L').z + B.pivot('upperarm_R').z) / 2;
      const hangY = lowReach(B, w, zs + 0.02, 4);
      const navel = B.pt('pelvis', V(0, 1.03, 0.2));
      const c = V(0, lerp(hangY, navel.y - 0.02, p), lerp(zs + 0.02, navel.z + 0.03, p));
      env.bar = c;
      for (const s of SIDES) {
        B.reach(s, c.clone().add(V(sg(s) * w, 0, 0)), { pole: V(sg(s) * 0.45, 0.35, -1), hand: { axis: over(s, X), flex: 0 } });
        B.fingers(s, 1);
      }
    },
    loads: () => (env.bar ? [{ p: env.bar, kg }] : []),
  });
}
def('barbell_row', {
  view: { az: 64, el: 10 },
  base: { y: 0.85, pitch: 0, sp: [-2, 0, 0], nk: [0, 0, 0], stance: 0.26, toe: 6, p: 0 },
  keys: {
    stand: { y: 0.85, pitch: 0, p: 0 },
    hinge: { y: 0.8, pitch: 52, nk: [-14, 0, 0], p: 0 },
    pull: { y: 0.8, pitch: 52, nk: [-14, 0, 0], p: 1 },
  },
  seq: [['stand', 1.0, 0, { act: 'setup' }], ['hinge', 1.5, 0, { act: 'setup' }], ['hinge', 0.7, 1, { act: 'iso' }], ['pull', 1.1, 2, { act: 'con', hold: 0.3 }], ['hinge', 1.8, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 3,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.225] })); },
  pose(B, k, ctx) { rowBar(B, k, ctx, {}); },
  update: barUpdate,
});

// ===== Κωπηλατική με αλτήρα (one-arm dumbbell row)
const DBR = { x: -0.13, h: 0.44 };
def('db_row', {
  view: { az: 62, el: 14 },
  base: { p: 0, sp: [0, 0, 0], nk: [-12, 0, 0] },
  keys: {
    setup: { p: 0 },
    hang: { p: 0, gpr: 8 },
    pull: { p: 1, gpr: -14 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['hang', 0.9, 1, { act: 'iso' }], ['pull', 1.2, 2, { act: 'con', hold: 0.35 }], ['hang', 2.0, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 2,
  setup(props, env) {
    const b = P.bench({ h: DBR.h, z0: 0.42, z1: -0.62 });
    b.position.x = DBR.x;
    props.add('bench', b);
    env.db = props.add('db', P.dumbbell());
  },
  pose(B, k, ctx) {
    const handBench = V(DBR.x - 0.02, DBR.h + 0.004, 0.36);
    const solveAt = (pitch) => {
      B.root(V(0.02, 0.9, -0.12), Body.trunkQ(pitch, -4, 4));
      B.spine(k.sp[0], 0, 0);
      B.neck(k.nk[0], 0, 0);
      B.leg('R', { flex: 96 - (pitch - 82), abd: -4, knee: 94, df: -35 });
      B.leg('L', { flex: 20, abd: 10, knee: 12 });
      rest(B, [{ bones: ['shank_R'], n: Y, d: DBR.h, region: (x, y, z) => Math.abs(x - DBR.x) < 0.16 }]);
      const S = B.pivot('upperarm_R');
      return S.distanceTo(handBench) - (armReach(B, 'R', 10) - 0.012);
    };
    let lo = 55, hi = 100;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (solveAt(m) > 0) lo = m; else hi = m; }
    solveAt((lo + hi) / 2);
    B.plant('L', V(0.3, FLOOR, -0.32), { yaw: 10 });
    B.girdle('R', { prot: 6 });
    B.reach('R', handBench, { at: 'palm', pole: V(-0.4, 0.3, -1), hand: { palm: V(0, -1, 0), fingers: V(-0.15, 0, 1) } });
    B.fingers('R', 0);
    B.girdle('L', { prot: k.gpr ?? 0, elev: 0 });
    B.solve();
    const S = B.pivot('upperarm_L');
    const L = armReach(B, 'L', 6);
    const hangP = S.clone().add(V(0.02, -L, 0.03));
    const hip = B.pt('pelvis', V(0.15, 0.9, 0.12));
    const p = smooth(k.p);
    const T = hangP.lerp(hip, p);
    B.reach('L', T, { pole: V(0.25, 0.2, -1), hand: { axis: V(0, 0, 1), flex: 0 } });
    B.fingers('L', 1);
  },
  update(props, B, k, env) { inHand(env.db, B, 'L'); },
});

// ===== Κωπηλατική καθιστός σε τροχαλία (seated cable row)
const SCR = { h: 0.3, plateZ: 0.86, py: 0.42 };
def('seated_cable_row', {
  view: { az: 68, el: 12 },
  base: { pitch: 0, z: 0.0, sp: [0, 0, 0], nk: [0, 0, 0], p: 0, gpr: 0 },
  keys: {
    setup: { p: 0, pitch: 6, gpr: 8 },
    grip: { p: 0, pitch: 2, sp: [-3, 0, 0], gpr: 10 },
    pull: { p: 1, pitch: -4, sp: [-6, 0, 0], gpr: -16 },
    reach: { p: 0, pitch: 4, sp: [0, 0, 0], gpr: 14 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['grip', 0.9, 1, { act: 'iso' }], ['pull', 1.2, 2, { act: 'con', hold: 0.4 }], ['reach', 2.0, 3, { act: 'ecc', hold: 0.2 }], ['pull', 1.2, 2, { act: 'con', hold: 0.4 }], ['reach', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 4,
  setup(props, env) {
    const g = new THREE.Group();
    g.add(P.box(0.32, 0.08, 1.3, V(0, SCR.h - 0.04, 0.2), P.MAT.pad));
    g.add(P.box(0.1, SCR.h - 0.08, 1.2, V(0, (SCR.h - 0.08) / 2, 0.2), P.MAT.frame, 0.01));
    const plate = P.box(0.42, 0.3, 0.04, V(0, 0.27, SCR.plateZ), P.MAT.frame, 0.01);
    plate.rotation.x = -0.2;
    g.add(plate);
    g.add(P.box(0.14, 0.9, 0.14, V(0, 0.45, SCR.plateZ + 0.2), P.MAT.frame, 0.01));
    props.add('machine', g);
    env.cable = props.add('cable', P.line(0.004));
    env.handle = props.add('handle', P.rod(0.16, 0.017, P.MAT.black));
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: SCR.h,
      limbs: (B, k, ph) => {
        if (ph === 'pre') return;
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.12, 0.13, SCR.plateZ - 0.12), { yaw: 4, pitch: -62, pole: V(sg(s) * 0.15, 1, 0.3) });
        B.solve();
        const p = smooth(k.p);
        const zs = B.pivot('upperarm_L').z;
        const L = armReach(B, 'L', 6);
        const y0 = 0.62;
        const S = B.pivot('upperarm_L');
        const zOut = zs + Math.sqrt(Math.max(0.01, L * L - (S.y - y0) ** 2 - (0.06 - S.x) ** 2));
        const belly = B.pt('pelvis', V(0, 1.02, 0.2));
        const c = V(0, lerp(y0, belly.y, p), lerp(zOut, belly.z + 0.04, p));
        ctx.env.h = c;
        for (const s of SIDES) {
          B.girdle(s, { elev: 0, prot: k.gpr });
          B.reach(s, c.clone().add(V(sg(s) * 0.045, 0, 0)), { pole: V(sg(s) * 0.4, -0.3, -1), hand: { axis: V(0, 1, 0.05), flex: 0 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    env.handle.position.copy(c);
    env.handle.quaternion.setFromUnitVectors(X, Y);
    P.setLine(env.cable, V(0, SCR.py, SCR.plateZ + 0.12), c);
  },
});

// ===== T-bar row (landmine)
const TB = { anchor: V(0, 0.04, -1.15) };
def('t_bar_row', {
  view: { az: 72, el: 12 },
  base: { y: 0.76, pitch: 50, sp: [0, 0, 0], nk: [-14, 0, 0], stance: 0.34, toe: 10, p: 0, lift: 1 },
  keys: {
    setup: { y: 0.66, pitch: 56, lift: 0, nk: [-10, 0, 0] },
    lift: { y: 0.76, pitch: 50, lift: 1 },
    pull: { p: 1, pitch: 48 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['lift', 1.2, 1, { act: 'con' }], ['pull', 1.2, 2, { act: 'con', hold: 0.35 }], ['lift', 1.9, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    env.barObj = props.add('bar', P.barbell({ len: 1.6, sleeve: 0.3, plates: [0.225], oneSided: true }));
    const base = P.box(0.25, 0.04, 0.25, V(0, 0.02, TB.anchor.z), P.MAT.frame, 0.01);
    props.add('base', base);
    env.handle = props.add('vh', P.rod(0.14, 0.017, P.MAT.black));
  },
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B, k) => {
        B.solve();
        const p = smooth(k.p);
        for (const s of SIDES) B.girdle(s, { elev: 0, prot: lerp(8, -14, p) });
        B.solve();
        const S = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
        const L = armReach(B, 'L', 5);
        const hangP = V(0, S.y - Math.sqrt(Math.max(0.01, L * L - 0.0016)), S.z + 0.04);
        const chest = B.pt('chest', V(0, 1.2, 0.2));
        const c = hangP.lerp(V(0, chest.y - 0.03, chest.z + 0.06), p);
        if (k.lift < 1) c.y = Math.min(c.y, lerp(0.2, c.y, k.lift));
        env.h = c;
        for (const s of SIDES) {
          B.reach(s, c.clone().add(V(sg(s) * 0.05, 0, 0)), { pole: V(sg(s) * 0.5, 0.3, -1), hand: { axis: V(0, 0, 1), flex: 0 } });
          B.fingers(s, 1);
        }
      },
      loads: () => [{ p: env.h, kg: 35 }],
    });
  },
  update(props, B, k, env) {
    const c = B.grip('L').add(B.grip('R')).multiplyScalar(0.5);
    const d = c.clone().sub(TB.anchor).normalize();
    const mid = TB.anchor.clone().addScaledVector(d, 0.8);
    env.barObj.position.copy(mid);
    env.barObj.quaternion.setFromUnitVectors(X, d);
    env.handle.position.copy(c);
    env.handle.quaternion.setFromUnitVectors(X, V(0, 0, 1).addScaledVector(d, -d.z).normalize());
  },
});

// ===== Ανάποδη κωπηλατική (inverted row)
const IR = { y: 0.95 };
def('inverted_row', {
  view: { az: 70, el: 14 },
  frameProps: false,
  base: { lift: 0, sp: [0, 0, 0], nk: [6, 0, 0], gpr: 6 },
  keys: {
    hang: { lift: 0, gpr: 8 },
    pull: { lift: 1, gpr: -16, nk: [10, 0, 0] },
  },
  seq: [['hang', 1.3, 0, { act: 'setup' }], ['pull', 1.2, 1, { act: 'con', hold: 0.35 }], ['hang', 2.0, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props) {
    const g = new THREE.Group();
    const bar = P.rod(1.4, 0.016, P.MAT.steel); bar.position.set(0, IR.y, 0.0); g.add(bar);
    for (const s of [-1, 1]) g.add(P.tube(V(s * 0.7, 0, 0), V(s * 0.7, IR.y + 0.08, 0), 0.03));
    props.add('rack', g);
  },
  pose(B, k, ctx) {
    const heelZ = -1.22;
    const solveAt = (ang) => {
      // σώμα ίσιο, κεφάλι προς +z, φτέρνες στο έδαφος
      const q = Body.trunkQ(-90 + ang, 180, 0);
      B.root(V(0, 1, 0), q);
      B.spine(k.sp[0], 0, 0);
      B.neck(k.nk[0], 0, 0);
      for (const s of SIDES) { B.leg(s, { flex: 0, abd: 3, knee: 2, df: 8 }); B.girdle(s, { prot: k.gpr, elev: 6 }); }
      B.solve();
      const heel = B.extreme(['foot_L', 'foot_R'], (x, y) => y);
      B.root(V(0, 1 - heel.v + FLOOR, heelZ - heel.p.z + 0), q);
      B.solve();
    };
    const armsOk = () => {
      let worst = -Infinity;
      for (const s of SIDES) { const S = B.pivot('upperarm_' + s); worst = Math.max(worst, S.distanceTo(V(sg(s) * 0.3, IR.y, 0.0)) - armReach(B, s, 4)); }
      return worst;
    };
    const chestGap = () => { const c = B.pt('chest', V(0, 1.27, 0.19)); return (IR.y - 0.03) - c.y; };
    // κάτω: τα χέρια μόλις τεντωμένα· πάνω: το στήθος σχεδόν στη μπάρα
    let lo = 5, hi = 60;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; solveAt(m); if (armsOk() > 0) lo = m; else hi = m; }
    const aBot = hi;
    lo = 5; hi = 60;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; solveAt(m); if (chestGap() > 0) lo = m; else hi = m; }
    const aTop = lo;
    solveAt(lerp(aBot, Math.max(aBot, aTop), k.lift));
    for (const s of SIDES) {
      B.reach(s, V(sg(s) * 0.3, IR.y, 0.0), { pole: V(sg(s) * 0.5, -1, -0.3), hand: { axis: over(s, X), flex: -6 } });
      B.fingers(s, 1);
    }
  },
});

// ===== Έλξη τροχαλίας με τεντωμένα χέρια (straight-arm pulldown)
const SAP = { z: 0.78, y: 2.1 };
def('straight_arm_pulldown', {
  view: { az: 72, el: 8 },
  frameProps: false,
  base: { y: 0.83, pitch: 22, sp: [0, 0, 0], nk: [-10, 0, 0], stance: 0.26, s: [118, 6, 0, 6, 172, 0], g: [10, 6], f: 1 },
  keys: {
    setup: { pitch: 4, nk: [0, 0, 0], s: [128, 6, 0, 6, 172, 0], g: [14, 6] },
    lean: { pitch: 24, s: [112, 6, 0, 6, 172, 0], g: [10, 6] },
    down: { pitch: 26, s: [8, 4, 0, 6, 172, 0], g: [-4, -10] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['lean', 1.0, 1, { act: 'iso' }], ['down', 1.3, 2, { act: 'con', hold: 0.35 }], ['lean', 2.1, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const t = P.cableTower({ x: 0, z: SAP.z + 0.15, y: SAP.y, face: V(0, 0, -1) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.cable = props.add('cable', P.line(0.004));
    env.barObj = props.add('bar', P.rod(0.62, 0.015, P.MAT.steel));
  },
  pose(B, k, ctx) {
    stand(B, k, { t: ctx.t, feet: () => feetPair(0.26, 8, -0.05), upper: (B, k) => armsSag(B, k, { rhythm: false }), loads: () => [] });
  },
  update(props, B, k, env) {
    const b = barFromHands(B);
    placeBar(env.barObj, b.c, b.u);
    P.setLine(env.cable, env.pulley, b.c);
  },
});

// ===== Υπερεκτάσεις (45°)
const HX = { hip: V(0, 0.79, 0.06), a: 45 };
def('hyperextension', {
  view: { az: 76, el: 8 },
  base: { tilt: 0, sp: [0, 0, 0], nk: [0, 0, 0] },
  keys: {
    setup: { tilt: 0, sArms: 0 },
    cross: { tilt: 0, sArms: 1 },
    down: { tilt: 72, sp: [2, 0, 0], nk: [6, 0, 0], sArms: 1 },
    up: { tilt: -2, sp: [-3, 0, 0], nk: [-4, 0, 0], sArms: 1 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['cross', 0.9, 1, { act: 'setup' }], ['down', 2.0, 2, { act: 'ecc' }], ['up', 1.3, 3, { act: 'con', hold: 0.5 }], ['down', 2.0, 2, { act: 'ecc' }], ['up', 1.3, 3, { act: 'con', hold: 0.5 }]],
  loop: 4,
  setup(props) {
    const g = new THREE.Group();
    const a = HX.a * D2R;
    const dir = V(0, Math.sin(a), Math.cos(a));       // κατά μήκος των ποδιών, προς τα πάνω-μπρος
    const pad = P.box(0.34, 0.08, 0.32, HX.hip.clone().add(V(0, -0.1, -0.06)), P.MAT.pad);
    pad.rotation.x = -a;
    g.add(pad);
    const foot = HX.hip.clone().addScaledVector(dir, -0.86);
    const fp = P.box(0.36, 0.03, 0.3, foot.clone().add(V(0, -0.04, 0.05)), P.MAT.frame, 0.01);
    fp.rotation.x = a;
    g.add(fp);
    const roll = P.roller(0.34, 0.045); roll.position.copy(foot.clone().add(V(0, 0.06, -0.06))); g.add(roll);
    g.add(P.tube(V(0, 0.03, foot.z - 0.2), V(0, 0.03, HX.hip.z + 0.25), 0.03));
    g.add(P.tube(V(0, 0.03, HX.hip.z + 0.2), HX.hip.clone().add(V(0, -0.15, -0.05)), 0.03));
    g.add(P.tube(V(0, 0.03, foot.z - 0.15), foot.clone().add(V(0, -0.05, 0)), 0.03));
    props.add('bench', g);
  },
  pose(B, k, ctx) {
    const a = HX.a * D2R;
    const dir = V(0, Math.sin(a), Math.cos(a));
    B.root(HX.hip.clone(), Body.trunkQ(HX.a + k.tilt, 0, 0));
    B.spine(k.sp[0], 0, 0);
    B.neck(k.nk[0], 0, 0);
    for (const s of SIDES) {
      const foot = HX.hip.clone().addScaledVector(dir, -0.835).add(V(sg(s) * 0.1, 0, 0));
      B.plant(s, foot, { pitch: HX.a - 2, yaw: 4, pole: V(0, -0.3, 1) });
      const u = smooth(k.sArms ?? 0);
      B.girdle(s, { prot: 10 * u });
      armSag(B, s, { flex: lerp(8, 70, u), abd: lerp(4, -32, u), rot: lerp(0, 30, u), elbow: lerp(8, 128, u), pron: lerp(60, 90, u) });
      B.fingers(s, 0.3);
    }
  },
});

// ===== Good morning
const BAR_BACK = V(0, 1.432, -0.072);
function barOnBack(B, env, w = 0.37) {
  for (const s of SIDES) B.girdle(s, { prot: -10, elev: 6 });
  B.solve();
  const Rc = B.rot('chest');
  const c = B.pt('chest', BAR_BACK);
  env.bar = c;
  env.barU = V(1, 0, 0).applyQuaternion(Rc);
  for (const s of SIDES) {
    B.reach(s, c.clone().addScaledVector(env.barU, sg(s) * w), { pole: V(sg(s) * 0.2, -1, -0.5).applyQuaternion(Rc), hand: { axis: over(s, env.barU), flex: -20 } });
    B.fingers(s, 1);
  }
}
export { barOnBack, BAR_BACK };
def('good_morning', {
  view: { az: 68, el: 8 },
  base: { y: 0.85, pitch: 0, sp: [-2, 0, 0], nk: [0, 0, 0], stance: 0.28, toe: 8 },
  keys: {
    stand: { y: 0.85, pitch: 0 },
    bottom: { y: 0.81, pitch: 78, sp: [0, 0, 0], nk: [-10, 0, 0] },
  },
  seq: [['stand', 1.3, 0, { act: 'setup' }], ['bottom', 2.2, 1, { act: 'ecc' }], ['bottom', 0.5, 2, { act: 'iso' }], ['stand', 1.5, 3, { act: 'con', hold: 0.35 }]],
  loop: 1,
  setup(props, env) { env.barObj = props.add('bar', P.barbell({ plates: [0.2] })); },
  pose(B, k, ctx) {
    stand(B, k, { t: ctx.t, upper: (B) => barOnBack(B, ctx.env), loads: () => [{ p: ctx.env.bar, kg: 40 }] });
  },
  update(props, B, k, env) { placeBar(env.barObj, env.bar, env.barU); },
});

// ===== Superman
def('superman', {
  view: { az: 64, el: 18 },
  base: { pitch: 90, z: -0.1, sp: [0, 0, 0], nk: [-4, 0, 0], up: 0 },
  keys: {
    setup: { up: 0 },
    lift: { up: 1, sp: [-16, 0, 0], nk: [-12, 0, 0] },
    hold: { up: 1.02, sp: [-16.5, 0, 0], nk: [-12, 0, 0] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['lift', 1.2, 1, { act: 'con' }], ['hold', 2.2, 2, { act: 'iso' }], ['setup', 1.4, 2, { act: 'ecc', hold: 0.4 }]],
  loop: 1,
  setup(props) { props.add('mat', P.floorMat({ len: 2.2, z: 0.05 })); },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [{ bones: ['pelvis', 'spine1', 'spine2', 'chest'], n: Y, d: MAT }],
      limbs: (B, k, ph) => {
        if (ph !== 'pre') return;
        const u = clamp(k.up, 0, 1.1);
        for (const s of SIDES) {
          B.girdle(s, { elev: 14, prot: -4 * u });
          armSag(B, s, { flex: 172 + 18 * u, abd: 10, rot: 0, elbow: 6, pron: 175 });
          B.fingers(s, 0.05);
          B.leg(s, { flex: -14 * u, abd: 5, knee: 2, df: -45 });
        }
      },
    });
  },
});

// ===== Κάμψεις δικεφάλων
function curl(id, { bar = true, pron = 4, alt = false, view = { az: 58, el: 6 }, plates = [0.14], len = 1.3 } = {}) {
  const keys = alt
    ? { setup: { elL: 10, elR: 10, shL: 3, shR: 3 }, upL: { elL: 140, shL: 14, elR: 10, shR: 3 }, upR: { elR: 140, shR: 14, elL: 10, shL: 3 } }
    : { setup: { el: 10, sh: 4 }, pin: { el: 12, sh: 3 }, top: { el: 142, sh: 15 } };
  def(id, {
    view,
    base: { y: 0.848, pitch: 0, sp: [0, 0, 0], nk: [4, 0, 0], el: 10, sh: 4, stance: 0.24, toe: 8 },
    keys,
    seq: alt
      ? [['setup', 1.2, 0, { act: 'setup' }], ['upL', 1.2, 1, { act: 'con', hold: 0.35 }], ['setup', 1.9, 2, { act: 'ecc', hold: 0.15 }], ['upR', 1.2, 1, { act: 'con', hold: 0.35 }], ['setup', 1.9, 2, { act: 'ecc', hold: 0.15 }]]
      : [['setup', 1.2, 0, { act: 'setup' }], ['pin', 0.8, 1, { act: 'iso' }], ['top', 1.15, 2, { act: 'con', hold: 0.3, lag: { sh: 0.25 } }], ['pin', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
    loop: alt ? 1 : 2,
    setup(props, env) {
      if (bar) env.barObj = props.add('bar', P.barbell({ len, sleeve: 0.24, plates }));
      else env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) };
    },
    pose(B, k, ctx) {
      stand(B, k, {
        t: ctx.t, sway: 0.4,
        upper: (B, k) => {
          for (const s of SIDES) {
            const el = k['el' + s] ?? k.el, sh = k['sh' + s] ?? k.sh;
            B.girdle(s, { prot: -4, elev: 0 });
            const pr = typeof pron === 'function' ? pron(el) : pron;
            B.arm(s, { plane: bar ? 92 : 96, elev: sh, rot: bar ? 4 : 2, elbow: el, pron: pr, wrist: { flex: bar ? 6 : 4 } });
            B.fingers(s, 1);
          }
        },
        loads: () => [{ p: B.grip('L'), kg: 12 }, { p: B.grip('R'), kg: 12 }],
      });
    },
    update(props, B, k, env) {
      if (bar) { const b = barFromHands(B); placeBar(env.barObj, b.c, b.u); }
      else for (const s of SIDES) inHand(env.db[s], B, s);
    },
  });
}
curl('barbell_curl', { bar: true });
curl('reverse_curl', { bar: true, pron: 168, plates: [0.12] });
curl('db_curl', { bar: false, alt: true, pron: 6 });
curl('hammer_curl', { bar: false, pron: 88, view: { az: 64, el: 6 } });
// τα βήματα 2–3 της σφυροκάμψης: λύγισε (με το ίδιο κράτημα), ανέβα ως τους ώμους και κατέβα
Object.assign(MOTIONS.hammer_curl, { seq: [['setup', 1.2, 0, { act: 'setup' }], ['pin', 0.6, 0, { act: 'iso' }], ['top', 1.15, 1, { act: 'con', hold: 0.3, lag: { sh: 0.25 } }], ['pin', 2.0, 2, { act: 'ecc', hold: 0.2 }]] });
Object.assign(MOTIONS.reverse_curl, { seq: [['setup', 1.2, 0, { act: 'setup' }], ['pin', 0.6, 0, { act: 'iso' }], ['top', 1.15, 1, { act: 'con', hold: 0.3, lag: { sh: 0.25 } }], ['pin', 2.0, 2, { act: 'ecc', hold: 0.2 }]] });

// ===== Κάμψεις σε πάγκο Scott (preacher curl)
const PC = { h: 0.56, padY: 1.02, padZ: 0.3, a: 50 };
def('preacher_curl', {
  view: { az: 70, el: 12 },
  base: { pitch: 8, z: -0.08, sp: [4, 0, 0], nk: [6, 0, 0], el: 22 },
  keys: {
    setup: { el: 22 },
    start: { el: 18 },
    top: { el: 128 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['start', 0.8, 1, { act: 'iso' }], ['top', 1.3, 2, { act: 'con', hold: 0.3 }], ['start', 2.1, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    g.add(P.seat({ h: PC.h, z: -0.06, back: null, depth: 0.32 }));
    g.add(P.box(0.5, 0.04, 0.5, V(0, 0.02, 0.15), P.MAT.frame, 0.01));
    props.add('bench', g);
    env.pad = props.add('pad', P.box(0.44, 0.06, 0.3, V()));
    env.post = props.add('post', P.tube(V(), V(0, 1, 0), 0.035));
    env.barObj = props.add('bar', P.barbell({ len: 1.2, sleeve: 0.22, plates: [0.12] }));
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: PC.h,
      limbs: (B, k, ph) => {
        if (ph === 'pre') {
          for (const s of SIDES) {
            B.girdle(s, { prot: 10, elev: 8 });
            B.arm(s, { plane: 98, elev: 58, rot: 6, elbow: k.el, pron: 8, wrist: { flex: 4 } });
            B.fingers(s, 1);
          }
          return;
        }
        if (ph === 'post') for (const s of SIDES) B.plant(s, V(sg(s) * 0.2, FLOOR, 0.28), { yaw: 10 });
      },
    });
  },
  update(props, B, k, env) {
    barUpdate(props, B, k, env);
    // το μαξιλάρι κάτω από τους βραχίονες (ακολουθεί τη θέση τους)
    const a = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
    const e = B.pivot('forearm_L').add(B.pivot('forearm_R')).multiplyScalar(0.5);
    const d = e.clone().sub(a).normalize();
    const nrm = V().crossVectors(X, d).normalize();
    if (nrm.y > 0) nrm.negate();
    const c = a.clone().lerp(e, 0.62).addScaledVector(nrm, 0.075);
    env.pad.position.copy(c);
    env.pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, nrm.clone().negate(), V().crossVectors(X, nrm.clone().negate())));
    P.setTube(env.post, V(0, 0.03, c.z + 0.05), c.clone().addScaledVector(nrm, 0.05), 0.035);
  },
});

// ===== Κάμψεις σε κεκλιμένο πάγκο (incline curl)
const ICB = { h: 0.44, z0: 0.36, seat: 0.38, a: 55 };
ICB.zs = ICB.z0 - ICB.seat;
def('incline_curl', {
  view: { az: 70, el: 10 },
  base: { pitch: -34, z: 0.1, sp: [-4, 0, 0], nk: [10, 0, 0], el: 6 },
  keys: {
    setup: { el: 6 },
    top: { el: 132 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['top', 1.3, 1, { act: 'con', hold: 0.3 }], ['setup', 2.3, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup(props, env) {
    props.add('bench', P.bench({ h: ICB.h, z0: ICB.z0, incline: ICB.a, seatLen: ICB.seat }));
    env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) };
  },
  pose(B, k, ctx) {
    const r = ICB.a * D2R, n = V(0, Math.cos(r), Math.sin(r));
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4, iter: 2,
      contacts: () => [
        { bones: ['pelvis'], n: Y, d: ICB.h, region: (x, y, z) => z > ICB.zs - 0.05 },
        { bones: ['chest', 'girdle_L', 'girdle_R', 'spine2'], n, d: n.dot(V(0, ICB.h + 0.02, ICB.zs)) },
      ],
      limbs: (B, k, ph) => {
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.22, FLOOR, 0.66), { yaw: 12 });
        B.solve();
        const d = dirToArm(B, V(0, -1, -0.12));
        for (const s of SIDES) {
          B.girdle(s, { prot: -12, elev: -4 });
          B.arm(s, { plane: d.plane, elev: d.elev, rot: 4, elbow: k.el, pron: 6 });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Κάμψη συγκέντρωσης (concentration curl)
def('concentration_curl', {
  view: { az: 24, el: 16 },
  base: { pitch: 34, z: 0.0, sp: [8, 0, 0], nk: [12, 0, 0], el: 8 },
  keys: {
    setup: { el: 8 },
    top: { el: 132 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['top', 1.3, 1, { act: 'con', hold: 0.5 }], ['setup', 2.2, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props, env) {
    props.add('bench', P.bench({ h: 0.44, z0: 0.2, z1: -0.9 }));
    env.db = props.add('db', P.dumbbell());
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: 0.44, seatRegion: (x, y, z) => z < 0.22,
      limbs: (B, k, ph) => {
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.3, FLOOR, 0.46), { yaw: 24, pole: V(sg(s) * 0.6, 0, 0.8) });
        B.solve();
        // ο αγκώνας ακουμπά στην εσωτερική πλευρά του αριστερού μηρού, κοντά στο γόνατο
        const elbowAt = B.pt('thigh_L', V(0.03, 0.55, 0.075));
        const S = B.pivot('upperarm_L');
        const d = dirToArm(B, elbowAt.clone().sub(S));
        B.girdle('L', { prot: 14, elev: -4 });
        B.arm('L', { plane: d.plane, elev: d.elev, rot: -22, elbow: k.el, pron: 4 });
        B.fingers('L', 1);
        const knee = B.pt('thigh_R', V(-0.08, 0.5, 0.1));
        B.girdle('R', { prot: 8 });
        B.reach('R', knee.add(V(0, 0.02, 0)), { at: 'palm', pole: V(-1, -0.2, -0.3), hand: { palm: V(0, -1, 0), fingers: V(-0.3, 0, 1) } });
        B.fingers('R', 0.25);
      },
    });
  },
  update(props, B, k, env) { inHand(env.db, B, 'L'); },
});

// ===== Skull crusher
def('skull_crusher', {
  view: { az: 70, el: 18 },
  base: { pitch: -90, z: 0.13, sp: [-6, 0, 0], nk: [4, 0, 0], s: [90, -6, 6, 4, 160, -6], g: [0, -4], f: 1 },
  keys: {
    setup: { s: [90, -6, 6, 4, 160, -6] },
    tilt: { s: [104, -6, 6, 4, 160, -6] },
    down: { s: [106, -6, 6, 112, 160, -4] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['tilt', 0.9, 1, { act: 'iso' }], ['down', 1.9, 2, { act: 'ecc' }], ['tilt', 1.2, 3, { act: 'con', hold: 0.3 }]],
  loop: 2,
  setup(props, env) {
    props.add('bench', P.bench({ h: BENCH.h, z0: BENCH.z0, z1: BENCH.z1 }));
    env.barObj = props.add('bar', P.barbell({ len: 1.2, sleeve: 0.22, plates: [0.12] }));
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [onBench()],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { armsSag(B, k, { rhythm: false }); return; }
        if (ph === 'post') benchFeet(B, 0.5);
      },
    });
  },
  update: barUpdate,
});

// ===== Εκτάσεις τρικεφάλων σε τροχαλία (pushdown)
const PDN = { z: 0.48, y: 2.05 };
def('cable_pushdown', {
  view: { az: 66, el: 8 },
  frameProps: false,
  base: { y: 0.845, pitch: 10, sp: [2, 0, 0], nk: [-6, 0, 0], stance: 0.26, s: [-4, 6, 0, 90, 168, -4], g: [0, -2], f: 1 },
  keys: {
    setup: { pitch: 4, s: [8, 6, 0, 110, 168, -4] },
    pin: { s: [-4, 6, 0, 90, 168, -4] },
    lock: { s: [-6, 5, 0, 2, 168, 0] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['pin', 0.9, 1, { act: 'iso' }], ['lock', 1.1, 2, { act: 'con', hold: 0.35 }], ['pin', 1.9, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const t = P.cableTower({ x: 0, z: PDN.z + 0.12, y: PDN.y, face: V(0, 0, -1) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.cable = props.add('cable', P.line(0.004));
    env.barObj = props.add('bar', P.rod(0.46, 0.015, P.MAT.steel));
  },
  pose(B, k, ctx) { stand(B, k, { t: ctx.t, feet: () => feetPair(0.26, 8, -0.02), upper: (B, k) => armsSag(B, k, { rhythm: false }) }); },
  update(props, B, k, env) {
    const b = barFromHands(B);
    placeBar(env.barObj, b.c, b.u);
    P.setLine(env.cable, env.pulley, b.c);
  },
});

// ===== Εκτάσεις τρικεφάλων πάνω από το κεφάλι
def('overhead_triceps', {
  view: { az: 62, el: 6 },
  base: { y: 0.848, pitch: 0, sp: [-3, 0, 0], nk: [0, 0, 0], stance: 0.26, s: [172, -12, 0, 8, 90, -10], g: [14, 0], f: 0.55 },
  keys: {
    setup: { s: [172, -12, 0, 8, 90, -10] },
    down: { s: [168, -10, 0, 124, 90, -18] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['down', 1.9, 1, { act: 'ecc' }], ['setup', 1.2, 2, { act: 'con', hold: 0.35 }]],
  loop: 1,
  setup(props, env) { env.db = props.add('db', P.dumbbell({ r: 0.075, handle: 0.12 })); },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, sway: 0.3,
      upper: (B, k) => {
        for (const s of SIDES) {
          const a = k.s;
          B.girdle(s, { elev: a[0] > 150 ? 18 : 8, prot: 0 });
          armSag(B, s, { flex: a[0], abd: a[1], rot: a[2], elbow: a[3], pron: a[4], wflex: a[5] });
          B.fingers(s, k.f);
        }
      },
      loads: () => [{ p: B.palm('L'), kg: 15 }],
    });
  },
  update(props, B, k, env) {
    const l = B.palm('L'), r = B.palm('R');
    const c = l.clone().add(r).multiplyScalar(0.5);
    // ο αλτήρας κατακόρυφος στα χέρια, κατά μήκος των πήχεων
    const fa = B.pivot('hand_L').sub(B.pivot('forearm_L')).add(B.pivot('hand_R').sub(B.pivot('forearm_R'))).normalize();
    env.db.position.copy(c).addScaledVector(fa, 0.02);
    env.db.quaternion.setFromUnitVectors(X, fa);
  },
});

// ===== Βυθίσεις σε πάγκο (bench dips)
const BD = { h: 0.44, edge: -0.18 };
def('bench_dips', {
  view: { az: 64, el: 10 },
  base: { lift: 1, pitch: -4, sp: [0, 0, 0], nk: [4, 0, 0], gel: 0, gpr: 0 },
  keys: {
    top: { lift: 1, gel: 2 },
    bottom: { lift: 0, pitch: 4, gel: 14, gpr: -6, sp: [4, 0, 0] },
  },
  seq: [['top', 1.4, 0, { act: 'setup' }], ['bottom', 1.8, 1, { act: 'ecc' }], ['top', 1.2, 2, { act: 'con', hold: 0.35 }]],
  loop: 1,
  setup(props) { props.add('bench', P.bench({ h: BD.h, z0: BD.edge, z1: BD.edge - 1.1 })); },
  pose(B, k, ctx) {
    const pose = (y) => {
      B.root(V(0, y, BD.edge + 0.12), Body.trunkQ(k.pitch, 0, 0));
      B.spine(k.sp[0], 0, 0);
      B.neck(k.nk[0], 0, 0);
      for (const s of SIDES) {
        B.girdle(s, { elev: k.gel, prot: k.gpr });
      }
      B.solve();
      let ex = 0;
      for (const s of SIDES) {
        const r = B.reach(s, V(sg(s) * 0.2, BD.h + 0.005, BD.edge - 0.03), { at: 'palm', pole: V(sg(s) * 0.15, 0.1, -1), hand: { palm: V(0, -1, 0), fingers: V(0, 0, 1) } });
        ex = Math.max(ex, r.excess);
        B.fingers(s, 0.25);
      }
      for (const s of SIDES) {
        const qf = Body.trunkQ(0, 0, 0).multiply(new THREE.Quaternion().setFromAxisAngle(X, -12 * D2R));
        B.footTo(s, V(sg(s) * 0.11, FLOOR + 0.004, 0.78), qf, B.side[s].heel, V(0, 1, 0.2));
      }
      return ex;
    };
    let lo = 0.1, hi = 1.2;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (pose(m) > 1e-4) hi = m; else lo = m; }
    const yTop = lo - 0.004;
    pose(lerp(yTop - 0.28, yTop, k.lift));
  },
});

// ===== Kickback τρικεφάλων
def('kickback', {
  view: { az: 76, el: 12 },
  base: { y: 0.79, pitch: 70, sp: [0, 0, 0], nk: [-14, 0, 0], el: 92, sh: -8 },
  keys: {
    setup: { el: 92, sh: -8 },
    ext: { el: 4, sh: -14 },
    hold: { el: 3, sh: -14.5 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['ext', 1.0, 1, { act: 'con' }], ['hold', 1.0, 2, { act: 'iso' }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.2 }]],
  loop: 1,
  setup(props, env) { env.db = props.add('db', P.dumbbell({ r: 0.05 })); },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ L: { at: V(0.13, FLOOR, -0.22), yaw: 8 }, R: { at: V(-0.13, FLOOR, 0.3), yaw: 8 } }),
      upper: (B, k) => {
        B.girdle('L', { prot: -6 });
        armSag(B, 'L', { flex: k.sh, abd: 6, rot: 0, elbow: k.el, pron: 90 });
        B.fingers('L', 1);
        B.solve();
        const knee = B.pt('thigh_R', V(-0.085, 0.5, 0.11));
        B.reach('R', knee, { at: 'palm', pole: V(-0.6, 0.1, -0.4), hand: { palm: V(0, -1, 0), fingers: V(0.1, -0.2, 1) } });
        B.fingers('R', 0.3);
      },
      loads: () => [{ p: B.grip('L'), kg: 8 }],
    });
  },
  update(props, B, k, env) { inHand(env.db, B, 'L'); },
});

// ===== Κάμψεις καρπών (wrist curl / reverse)
function wristCurl(id, { reverse = false }) {
  def(id, {
    view: { az: 84, el: 16, focus: 'hand_L', fb: 0.32 },
    base: { pitch: 30, z: 0.0, sp: [10, 0, 0], nk: [16, 0, 0], wf: reverse ? 30 : -40, fg: reverse ? 1 : 0.4 },
    keys: reverse
      ? { setup: { wf: 32, fg: 1 }, up: { wf: -52, fg: 1 } }
      : { setup: { wf: -12, fg: 0.95 }, roll: { wf: -48, fg: 0.35 }, up: { wf: 58, fg: 1 } },
    seq: reverse
      ? [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.1, 1, { act: 'con', hold: 0.35 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.2 }]]
      : [['setup', 1.2, 0, { act: 'setup' }], ['roll', 1.3, 1, { act: 'ecc' }], ['up', 1.1, 2, { act: 'con', hold: 0.35 }], ['roll', 1.6, 1, { act: 'ecc', hold: 0.15 }], ['up', 1.1, 2, { act: 'con', hold: 0.35 }]],
    loop: reverse ? 1 : 3,
    setup(props, env) {
      props.add('bench', P.bench({ h: 0.44, z0: 0.2, z1: -0.9 }));
      env.barObj = props.add('bar', P.barbell({ len: 1.0, sleeve: 0.16, plates: [0.075] }));
    },
    pose(B, k, ctx) {
      sit(B, k, {
        t: ctx.t, h: 0.44, seatRegion: (x, y, z) => z < 0.22,
        limbs: (B, k, ph) => {
          if (ph !== 'post') return;
          for (const s of SIDES) B.plant(s, V(sg(s) * 0.19, FLOOR, 0.5), { yaw: 10 });
          B.solve();
          for (const s of SIDES) {
            const T = B.pt('shank_' + s, V(sg(s) * 0.07, 0.47, 0.18));
            B.girdle(s, { prot: 12 });
            B.reach(s, T, { at: 'wrist', pole: V(sg(s) * 0.2, -0.2, -1), hand: { pron: reverse ? 172 : 2, wrist: { flex: k.wf } } });
            B.fingers(s, k.fg);
          }
        },
      });
    },
    update(props, B, k, env) {
      const b = barFromHands(B);
      // η μπάρα κυλά προς τα δάχτυλα όταν ανοίγουν
      const roll = reverse ? 0 : (1 - clamp(k.fg, 0, 1)) * 0.04;
      const fd = B.pivot('fingers_L').sub(B.pivot('hand_L')).normalize();
      placeBar(env.barObj, b.c.clone().addScaledVector(fd, roll), b.u);
    },
  });
}
wristCurl('wrist_curl', {});
wristCurl('reverse_wrist_curl', { reverse: true });

// ===== Σφιγκτήρας χεριού
def('hand_gripper', {
  view: { az: 40, el: 14, zoom: 3.2, focus: 'hand_L' },
  base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [10, 0, 0], g: 0.45 },
  keys: {
    setup: { g: 0.42 },
    close: { g: 1.0 },
    hold: { g: 1.02 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['close', 0.9, 1, { act: 'con' }], ['hold', 1.0, 2, { act: 'iso' }], ['setup', 1.6, 2, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
  setup(props, env) { env.gr = props.add('gripper', P.gripper()); },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t, sway: 0.3,
      upper: (B, k) => {
        B.arm('L', { plane: 96, elev: 14, rot: 8, elbow: 92, pron: 90, wrist: { flex: 4 } });
        B.fingers('L', k.g, { mcp: 70, pip: 82 });
        B.arm('R', { plane: 90, elev: 5, rot: 0, elbow: 12, pron: 70 });
        B.fingers('R', 0.15);
      },
    });
  },
  update(props, B, k, env) {
    const g = B.grip('L');
    const ax = B.gripAxis('L');
    const hd = B.pivot('fingers_L').sub(B.pivot('hand_L')).normalize();
    const m = new THREE.Matrix4().makeBasis(hd, ax, hd.clone().cross(ax).normalize());
    env.gr.position.copy(g).addScaledVector(ax, 0.045);
    env.gr.quaternion.setFromRotationMatrix(m);
    env.gr.userData.set(lerp(0.42, 0.04, clamp((k.g - 0.42) / 0.58, 0, 1)));
  },
});
