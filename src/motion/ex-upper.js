// Στήθος και ώμοι.
import * as THREE from 'three';
import * as P from './props.js';
import {
  def, MOTIONS, SIDES, V, sg, FLOOR, MAT, D2R, lerp, smooth, X, Y, Z, over, under, Body, clamp,
  barFromHands, placeBar, inHand, rest, BACK, stand, onSurface, sit, plankSolve, hang, armsFK, dirToArm,
  topReach, surfaceY, armReach, arc3, feetPair, sway,
} from './lib.js';

// ------------------------------------------------------------------ πάγκοι
const BENCH = { h: 0.44, z0: 0.36, z1: -0.86 };
const onBench = (bones = BACK) => ({ bones, n: Y, d: BENCH.h, region: (x, y, z) => Math.abs(x) < 0.17 && z < BENCH.z0 + 0.03 && z > BENCH.z1 - 0.03 });
const benchFeet = (B, z = 0.5, w = 0.27, yaw = 14) => { for (const s of SIDES) B.plant(s, V(sg(s) * w, FLOOR, z), { yaw, pole: V(sg(s) * 0.25, 0.25, 1) }); };
// κεκλιμένη πλάτη πάγκου: γωνία a (μοίρες από το οριζόντιο), αρχή στο zs, ύψος καθίσματος h
function inclinePlane(h, zs, a, t = 0.07) {
  const r = a * D2R;
  const n = V(0, Math.cos(r), Math.sin(r));
  // σημείο στην πάνω επιφάνεια της πλάτης (το κάτω άκρο της, πάνω από το τέλος του καθίσματος)
  const p = V(0, h + 0.02, zs).addScaledVector(n, 0.0);
  return { n, p, d: n.dot(p) };
}

// μπάρα πάνω από το στήθος: depth 0 = τεντωμένα χέρια, 1 = στο στήθος (στη θέση z = zb)
function pressBar(B, k, env, { w = 0.4, zb, pole, flex = -18, chest = ['chest', 'girdle_L', 'girdle_R'] }) {
  B.solve();
  const yTop = topReach(B, w, zb, 7);
  const yc = surfaceY(B, chest, 0, zb, 0.03) ?? yTop - 0.4;
  const c = V(0, lerp(yTop, yc + 0.032, k.depth), zb);
  env.bar = c;
  for (const s of SIDES) {
    B.reach(s, c.clone().add(V(sg(s) * w, 0, 0)), { pole: pole(s), hand: { axis: over(s, X), flex } });
    B.fingers(s, 1);
  }
}
const barSetup = (plates = [0.225, 0.16], len) => (props, env) => { env.barObj = props.add('bar', P.barbell({ plates, ...(len ? { len } : {}) })); };
const barUpdate = (props, B, k, env) => { const b = barFromHands(B); placeBar(env.barObj, b.c, b.u); };

// ===== Πιέσεις σε επίπεδο πάγκο
function flatPress(id, { w = 0.4, tuck = 0, bottomZ = -0.29, view = { az: 32, el: 24 } } = {}) {
  def(id, {
    view,
    base: { pitch: -90, z: 0.13, sp: [-14, 0, 0], nk: [6, 0, 0], depth: 0, bz: -0.39, scap: -6, fz: 0.5 },
    keys: {
      setup: { bz: -0.47, depth: 0.03, scap: -3 },
      top: { scap: -16 },
      bottom: { depth: 1, bz: bottomZ, scap: -16 },
    },
    seq: [['setup', 1.4, 0, { act: 'setup' }], ['top', 1.1, 1, { act: 'iso' }], ['bottom', 2.0, 2, { act: 'ecc' }], ['top', 1.15, 3, { act: 'con', hold: 0.35 }]],
    loop: 2,
    setup(props, env) {
      props.add('bench', P.bench({ h: BENCH.h, z0: BENCH.z0, z1: BENCH.z1 }));
      barSetup()(props, env);
    },
    pose(B, k, ctx) {
      onSurface(B, k, {
        t: ctx.t, breathe: 0.4,
        contacts: () => [onBench()],
        limbs: (B, k, ph) => {
          if (ph === 'pre') { for (const s of SIDES) B.girdle(s, { prot: k.scap, elev: -4 }); return; }
          if (ph !== 'post') return;
          benchFeet(B, k.fz);
          pressBar(B, k, ctx.env, { w, zb: k.bz, pole: (s) => V(sg(s) * (0.85 - tuck), -0.55, 0.45 + tuck * 1.2) });
        },
      });
    },
    update: barUpdate,
  });
}
flatPress('bench_press');
flatPress('close_grip_bench', { w: 0.2, tuck: 0.45, bottomZ: -0.27 });
// close-grip: 3 βήματα (ξάπλωσε/λαβή, κατέβασε, πίεσε)
Object.assign(MOTIONS.close_grip_bench, {
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['top', 1.0, 0, { act: 'iso' }], ['bottom', 2.0, 1, { act: 'ecc' }], ['top', 1.15, 2, { act: 'con', hold: 0.35 }]],
});

// ===== Κεκλιμένος πάγκος (incline bench press)
const INC = { h: 0.44, z0: 0.36, seat: 0.38, a: 35 };
INC.zs = INC.z0 - INC.seat;
INC.plane = inclinePlane(INC.h, INC.zs, INC.a);
def('incline_bench', {
  view: { az: 40, el: 18 },
  base: { pitch: -54, z: 0.1, sp: [-8, 0, 0], nk: [8, 0, 0], depth: 0, scap: -6, fz: 0.62 },
  keys: {
    setup: { depth: 0.02, scap: -4, fz: 0.66 },
    set: { scap: -16, fz: 0.6 },
    bottom: { depth: 1, scap: -16, fz: 0.6 },
  },
  seq: [['setup', 1.5, 0, { act: 'setup' }], ['set', 1.0, 1, { act: 'iso' }], ['bottom', 2.0, 2, { act: 'ecc' }], ['set', 1.15, 3, { act: 'con', hold: 0.35 }]],
  loop: 2,
  setup(props, env) {
    props.add('bench', P.bench({ h: INC.h, z0: INC.z0, incline: INC.a, seatLen: INC.seat }));
    barSetup()(props, env);
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4, iter: 2,
      contacts: () => [
        { bones: ['pelvis'], n: Y, d: INC.h, region: (x, y, z) => z > INC.zs - 0.05 },
        { bones: ['chest', 'girdle_L', 'girdle_R', 'spine2'], n: INC.plane.n, d: INC.plane.d },
      ],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) B.girdle(s, { prot: k.scap, elev: -2 }); return; }
        if (ph !== 'post') return;
        benchFeet(B, k.fz, 0.27, 12);
        // μπάρα κατακόρυφα πάνω από το πάνω μέρος του στήθους (κάτω από την κλείδα)
        const up = B.pt('chest', V(0, 1.335, 0.15));
        pressBar(B, k, ctx.env, { w: 0.39, zb: up.z, pole: (s) => V(sg(s) * 0.85, -0.5, 0.2) });
      },
    });
  },
  update: barUpdate,
});

// ===== Κατηφορικός πάγκος (decline bench press)
const DEC = { a: 18, c: V(0, 0.5, -0.2), len: 1.2 };
DEC.n = V(0, Math.cos(DEC.a * D2R), -Math.sin(DEC.a * D2R));
DEC.d = DEC.n.dot(DEC.c) + 0.035;
def('decline_bench', {
  view: { az: 36, el: 22 },
  base: { pitch: -108, z: 0.12, sp: [-8, 0, 0], nk: [14, 0, 0], depth: 0, scap: -10 },
  keys: {
    setup: { depth: 0.02, scap: -6 },
    grip: { scap: -15 },
    bottom: { depth: 1, scap: -15 },
  },
  seq: [['setup', 1.5, 0, { act: 'setup' }], ['grip', 1.0, 1, { act: 'iso' }], ['bottom', 2.0, 2, { act: 'ecc' }], ['grip', 1.15, 3, { act: 'con', hold: 0.35 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    const pad = P.box(0.29, 0.07, DEC.len, DEC.c);
    pad.rotation.x = -DEC.a * D2R;
    g.add(pad);
    const top = DEC.c.clone().add(V(0, Math.sin(DEC.a * D2R), Math.cos(DEC.a * D2R)).multiplyScalar(DEC.len / 2));
    g.add(P.tube(V(0, 0.02, top.z - 0.05), V(0, top.y - 0.04, top.z - 0.05), 0.03));
    g.add(P.tube(V(0, 0.02, DEC.c.z - 0.45), V(0, DEC.c.y - 0.2, DEC.c.z - 0.45), 0.025));
    g.add(P.tube(V(0, 0.03, top.z + 0.25), V(0, 0.03, DEC.c.z - 0.55), 0.02));
    // στηρίγματα ποδιών: ρολά μπροστά από τις κνήμες
    g.add(P.tube(V(0, top.y - 0.05, top.z), V(0, 0.5, top.z + 0.32), 0.022));
    for (const [y, z] of [[0.66, top.z + 0.2], [0.42, top.z + 0.36]]) { const r = P.roller(0.32, 0.05); r.position.set(0, y, z); g.add(r); }
    props.add('bench', g);
    barSetup()(props, env);
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [{ bones: BACK, n: DEC.n, d: DEC.d }],
      limbs: (B, k, ph) => {
        if (ph === 'pre') {
          for (const s of SIDES) {
            B.girdle(s, { prot: k.scap, elev: -2 });
            B.leg(s, { flex: 16, abd: 6, knee: 96, df: -10 });
          }
          return;
        }
        if (ph !== 'post') return;
        const low = B.pt('chest', V(0, 1.215, 0.165));
        pressBar(B, k, ctx.env, { w: 0.4, zb: low.z, pole: (s) => V(sg(s) * 0.85, -0.55, 0.5) });
      },
    });
  },
  update: barUpdate,
});

// ===== Πιέσεις με αλτήρες σε πάγκο
def('db_bench', {
  view: { az: 34, el: 22 },
  base: { pitch: -90, z: 0.13, sp: [-10, 0, 0], nk: [6, 0, 0], lb: 1, depth: 1, wd: 0.3, scap: -12, fz: 0.5 },
  keys: {
    sit: { pitch: 6, z: 0.24, sp: [6, 0, 0], nk: [-4, 0, 0], lb: 0, depth: 1, scap: 0, fz: 0.62 },
    lie: { lb: 1, depth: 1 },
    top: { depth: 0, wd: 0.17 },
    bottom: { depth: 1, wd: 0.31 },
  },
  seq: [['sit', 1.3, 0, { act: 'setup' }], ['lie', 1.6, 0, { act: 'setup', lag: { lb: 0.25 } }], ['top', 1.2, 1, { act: 'con', hold: 0.3 }], ['bottom', 1.9, 2, { act: 'ecc' }], ['top', 1.15, 3, { act: 'con', hold: 0.35 }]],
  loop: 3,
  setup(props, env) {
    props.add('bench', P.bench({ h: BENCH.h, z0: BENCH.z0, z1: BENCH.z1 }));
    env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) };
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [onBench()],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) B.girdle(s, { prot: k.scap, elev: -3 }); return; }
        if (ph !== 'post') return;
        benchFeet(B, k.fz, 0.26, 12);
        B.solve();
        const Rc = B.rot('chest');
        for (const s of SIDES) {
          // πάνω στον μηρό (καθιστός) → δίπλα στο στήθος / πάνω από τους ώμους (ξαπλωμένος)
          const onThigh = B.pt('thigh_' + s, V(sg(s) * 0.07, 0.56, 0.11)).add(V(0, 0.07, 0));
          const S = B.pivot('upperarm_' + s);
          const chestY = (surfaceY(B, ['chest'], sg(s) * 0.1, S.z + 0.08, 0.04) ?? S.y + 0.15) + 0.05;
          const zc = S.z + 0.075;
          const L = armReach(B, s, 8);
          const lat = sg(s) * k.wd - S.x;
          const yTop = S.y + Math.sqrt(Math.max(0.01, L * L - lat * lat - (zc - S.z) ** 2));
          const pressed = V(sg(s) * k.wd, lerp(yTop, chestY, k.depth), zc);
          const T = onThigh.lerp(pressed, smooth(k.lb));
          // άξονας λαβής στο πλαίσιο του θώρακα: ουδέτερη λαβή στους μηρούς → πρηνής δίπλα στο στήθος
          const ax = over(s, X).lerp(V(0, 0.2, 1), 1 - smooth(k.lb)).normalize().applyQuaternion(Rc);
          const poleW = V(sg(s) * 0.9, -0.55, 0.15);
          const pole = poleW.clone().applyQuaternion(Rc).lerp(poleW, smooth(k.lb)).normalize();
          B.reach(s, T, { pole, hand: { axis: ax, flex: -6 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Μηχάνημα πιέσεων στήθους
const CP = { h: 0.47, back: 12 };
def('machine_chest_press', {
  view: { az: 58, el: 14 },
  base: { pitch: -CP.back, z: 0.1, sp: [-4, 0, 0], nk: [6, 0, 0], ext: 0, scap: -4 },
  keys: {
    setup: { ext: 0, scap: 0 },
    set: { ext: 0, scap: -14 },
    out: { ext: 1, scap: -6 },
    back: { ext: 0, scap: -14 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['set', 1.0, 1, { act: 'iso' }], ['out', 1.2, 2, { act: 'con', hold: 0.3 }], ['back', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    g.add(P.seat({ h: CP.h, z: 0.08, zb: -0.13, back: CP.back, backH: 0.72 }));
    g.add(P.box(0.12, 1.75, 0.12, V(0, 0.875, -0.42), P.MAT.frame, 0.01));
    g.add(P.tube(V(0, 1.65, -0.42), V(0, 1.65, -0.18), 0.03));
    props.add('machine', g);
    env.levers = SIDES.map((s) => { const t = P.tube(V(), V(0, 1, 0), 0.022); props.add('lev' + s, t); return t; });
    env.handles = SIDES.map((s) => props.add('h' + s, P.rod(0.15, 0.017, P.MAT.black)));
  },
  pose(B, k, ctx) {
    const nb = V(0, Math.sin(CP.back * D2R), Math.cos(CP.back * D2R));
    sit(B, k, {
      t: ctx.t, h: CP.h,
      back: { n: nb, p: V(0, CP.h + 0.3, -0.13 - 0.04) },
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) B.girdle(s, { prot: k.scap, elev: 0 }); return; }
        if (ph !== 'post') return;
        for (const s of SIDES) B.plant(s, V(sg(s) * 0.17, FLOOR, 0.5), { yaw: 8 });
        B.solve();
        const mid = B.pt('chest', V(0, 1.27, 0.17));
        for (const s of SIDES) {
          const S = B.pivot('upperarm_' + s);
          const L = armReach(B, s, 12);
          const x = sg(s) * 0.25, y = mid.y;
          const zOut = S.z + Math.sqrt(Math.max(0.01, L * L - (x - S.x) ** 2 - (y - S.y) ** 2));
          const zIn = mid.z + 0.02;
          B.reach(s, V(x, y, lerp(zIn, zOut, k.ext)), { pole: V(sg(s) * 0.9, -0.6, -0.2), hand: { axis: over(s, X), flex: -10 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    SIDES.forEach((s, i) => {
      const g = B.grip(s);
      env.handles[i].position.copy(g);
      P.setTube(env.levers[i], V(sg(s) * 0.34, 1.65, -0.18), g.clone().add(V(sg(s) * 0.09, 0, 0)), 0.022);
    });
  },
});

// ===== Ανοίγματα με αλτήρες (dumbbell fly)
def('db_fly', {
  view: { az: 26, el: 30 },
  base: { pitch: -90, z: 0.13, sp: [-8, 0, 0], nk: [6, 0, 0], a: [90, 90, 0, 6, 92], g: [-4, -10], f: 1 },
  keys: {
    setup: { a: [92, 90, 0, 6, 92] },
    lock: { a: [92, 90, 0, 22, 92], g: [-4, -14] },
    open: { a: [-4, 98, 4, 26, 92], g: [-4, -18] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['lock', 0.9, 1, { act: 'iso' }], ['open', 2.1, 2, { act: 'ecc' }], ['lock', 1.4, 3, { act: 'con', hold: 0.3 }]],
  loop: 2,
  setup(props, env) {
    props.add('bench', P.bench({ h: BENCH.h, z0: BENCH.z0, z1: BENCH.z1 }));
    env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) };
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [onBench()],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { armsFK(B, k, { rhythm: false }); return; }
        if (ph === 'post') benchFeet(B, 0.5);
      },
    });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Τροχαλίες χιαστί (cable crossover)
const CC = { x: 1.05, y: 1.95, z: -0.2 };
def('cable_crossover', {
  view: { az: 40, el: 12 },
  frameProps: false,
  base: { y: 0.84, pitch: 14, sp: [2, 0, 0], nk: [-6, 0, 0], a: [12, 98, 6, 26, 95, 0], g: [2, -8], f: 1 },
  keys: {
    stand: { pitch: 4, a: [14, 92, 6, 18, 95, 0] },
    lean: { pitch: 14, a: [12, 98, 6, 26, 95, 0] },
    close: { a: [101, 54, -4, 20, 95, 0], g: [0, 8] },
  },
  seq: [['stand', 1.2, 0, { act: 'setup' }], ['lean', 1.0, 1, { act: 'iso' }], ['close', 1.3, 2, { act: 'con', hold: 1.0 }], ['lean', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    env.towers = SIDES.map((s) => { const t = P.cableTower({ x: sg(s) * CC.x, z: CC.z, y: CC.y, face: V(-sg(s), 0, 0.2).normalize() }); props.add('tower' + s, t.obj); return t; });
    env.cables = SIDES.map((s) => props.add('cab' + s, P.line(0.004)));
    env.handles = SIDES.map((s) => props.add('hd' + s, P.handle()));
  },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ L: { at: V(0.13, FLOOR, 0.2), yaw: 6 }, R: { at: V(-0.12, FLOOR, -0.18), yaw: 10, lift: 18 } }),
      upper: (B, k) => armsFK(B, k),
    });
  },
  update(props, B, k, env) {
    SIDES.forEach((s, i) => {
      const g = B.grip(s);
      inHand(env.handles[i], B, s);
      P.setLine(env.cables[i], env.towers[i].pulley, g);
    });
  },
});

// ===== Pec deck
const PD = { h: 0.47 };
def('pec_deck', {
  view: { az: 18, el: 20 },
  base: { pitch: -4, z: 0.08, sp: [-3, 0, 0], nk: [4, 0, 0], a: [-4, 86, 0, 14, 92, 0], g: [0, -10], f: 1 },
  keys: {
    setup: { a: [2, 86, 0, 12, 92, 0] },
    set: { a: [-4, 86, 0, 16, 92, 0], g: [-2, -12] },
    close: { a: [84, 86, 0, 16, 92, 0], g: [-2, 6] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['set', 0.9, 1, { act: 'iso' }], ['close', 1.3, 2, { act: 'con', hold: 0.4 }], ['set', 2.1, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const g = new THREE.Group();
    g.add(P.seat({ h: PD.h, z: 0.08, zb: -0.12, back: 4, backH: 0.75 }));
    g.add(P.box(0.6, 0.08, 0.1, V(0, 1.72, -0.25), P.MAT.frame, 0.01));
    g.add(P.box(0.1, 1.72, 0.1, V(0, 0.86, -0.3), P.MAT.frame, 0.01));
    props.add('machine', g);
    env.arms = SIDES.map((s) => props.add('arm' + s, P.tube(V(), V(0, 1, 0), 0.02)));
    env.handles = SIDES.map((s) => props.add('hd' + s, P.rod(0.14, 0.018, P.MAT.black)));
    env.drops = SIDES.map((s) => props.add('drop' + s, P.tube(V(), V(0, 1, 0), 0.018)));
  },
  pose(B, k, ctx) {
    sit(B, k, {
      t: ctx.t, h: PD.h,
      back: { n: V(0, 0.07, 1).normalize(), p: V(0, PD.h + 0.3, -0.16) },
      limbs: (B, k, ph) => {
        if (ph === 'pre') { armsFK(B, k, { rhythm: false }); return; }
        if (ph === 'post') for (const s of SIDES) B.plant(s, V(sg(s) * 0.16, FLOOR, 0.48), { yaw: 8 });
      },
    });
  },
  update(props, B, k, env) {
    SIDES.forEach((s, i) => {
      const g = B.grip(s);
      const h = env.handles[i];
      h.position.copy(g);
      h.quaternion.setFromUnitVectors(X, Y);
      const piv = V(sg(s) * 0.2, 1.72, -0.18);
      const top = g.clone().setY(1.72);
      P.setTube(env.arms[i], piv, top, 0.02);
      P.setTube(env.drops[i], top, g.clone().add(V(0, 0.08, 0)), 0.018);
    });
  },
});

// ===== Κάμψεις (push-up) και κάμψεις ωμοπλατών
function pushBody(B, k, env, { scapOnly = false } = {}) {
  const hz = env.hz;
  const handsAt = (B, s) => V(sg(s) * k.hw, MAT, hz + 0.02);
  const arms = (B) => {
    for (const s of SIDES) {
      B.girdle(s, { prot: k.scap, elev: 0 });
      B.reach(s, handsAt(B, s), { at: 'palm', pole: V(sg(s) * 0.7, 0.35, -0.75), hand: { palm: V(0, -1, 0), fingers: V(sg(s) * 0.12, 0.1, 1).normalize() } });
      B.fingers(s, -0.25);
    }
  };
  plankSolve(B, k, {
    toeZ: -0.98, surface: MAT,
    support: (B) => {
      for (const s of SIDES) B.girdle(s, { prot: k.scap, elev: 0 });
      B.solve();
      if (scapOnly || k.sh === undefined) {
        // τεντωμένα χέρια με τις παλάμες ακριβώς στο πάτωμα: θετικό = οι παλάμες «αιωρούνται» (ψηλά)
        arms(B);
        return Math.max(B.palm('L').y, B.palm('R').y) - MAT - 5e-4;
      }
      const sh = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
      return sh.y - k.sh;
    },
  });
  arms(B);
}
function pushInit(B, k, env) {
  if (env.hz !== undefined) return;
  plankSolve(B, { ...k, scap: 0 }, { toeZ: -0.98, surface: MAT, support: (B) => { B.solve(); return B.pivot('upperarm_L').y - 0.6; } });
  env.hz = B.pivot('upperarm_L').z;
  B.reset();
}
def('push_up', {
  view: { az: 72, el: 12 },
  // πάνω: χέρια τεντωμένα αλλά όχι «κλειδωμένα» (~9° στον αγκώνα), παλάμες στο πάτωμα
  base: { sh: 0.56, sp: [0, 0, 0], nk: [-10, 0, 0], hw: 0.27, scap: 0, hip: 0 },
  keys: {
    setup: { sh: 0.56, scap: 4, hip: 8, sp: [2, 0, 0] },
    brace: { sh: 0.56, scap: 2, hip: 0 },
    bottom: { sh: 0.2, scap: -12, nk: [-14, 0, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['brace', 0.9, 1, { act: 'iso' }], ['bottom', 1.7, 2, { act: 'ecc' }], ['brace', 1.1, 3, { act: 'con', hold: 0.3 }]],
  loop: 2,
  setup(props) { props.add('mat', P.floorMat({ len: 2.0, z: -0.25 })); },
  pose(B, k, ctx) { pushInit(B, k, ctx.env); pushBody(B, k, ctx.env); },
});
def('scap_push_up', {
  view: { az: 112, el: 30 },
  base: { sp: [0, 0, 0], nk: [-10, 0, 0], hw: 0.25, scap: 0, hip: 0 },
  keys: {
    setup: { scap: 0 },
    sink: { scap: -15 },
    push: { scap: 17, sp: [3, 0, 0] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['sink', 1.4, 1, { act: 'ecc', hold: 0.3 }], ['push', 1.2, 2, { act: 'con', hold: 0.4 }], ['sink', 1.4, 1, { act: 'ecc', hold: 0.3 }]],
  loop: 2,
  setup(props) { props.add('mat', P.floorMat({ len: 2.0, z: -0.25 })); },
  pose(B, k, ctx) { pushInit(B, k, ctx.env); pushBody(B, k, ctx.env, { scapOnly: true }); },
});

// ===== Βυθίσεις σε δίζυγο (dips)
const DIP = { y: 1.24, sep: 0.5 };
def('dips', {
  view: { az: 62, el: 8 },
  frameProps: false,
  base: { lift: 1, pitch: 4, sp: [2, 0, 0], nk: [6, 0, 0], gel: -6, gpr: 0, hip: 18, knee: 72 },
  keys: {
    top: { lift: 1, pitch: 4 },
    lean: { lift: 1, pitch: 16, sp: [6, 0, 0] },
    bottom: { lift: 0, pitch: 26, sp: [8, 0, 0], gel: 6, gpr: 8, hip: 32, knee: 80 },
  },
  seq: [['top', 1.3, 0, { act: 'iso' }], ['lean', 1.0, 1, { act: 'iso' }], ['bottom', 1.8, 2, { act: 'ecc' }], ['lean', 1.15, 3, { act: 'con', hold: 0.3 }]],
  loop: 2,
  setup(props) { props.add('bars', P.dipBars({ y: DIP.y, sep: DIP.sep, z: 0.02, len: 0.65 })); },
  pose(B, k, ctx) {
    const pose = (y) => {
      const q = Body.trunkQ(k.pitch, 0, 0);
      B.root(V(0, y, -0.02), q);
      B.spine(k.sp[0], 0, 0);
      B.neck(k.nk[0], 0, 0);
      for (const s of SIDES) B.leg(s, { flex: k.hip, abd: 3, knee: k.knee, df: -20, rot: 0 });
      let ex = 0;
      for (const s of SIDES) {
        B.girdle(s, { elev: k.gel, prot: k.gpr });
        const r = B.reach(s, V(sg(s) * DIP.sep / 2, DIP.y + 0.012, 0.02), { pole: V(sg(s) * 0.25, 0.1, -1), hand: { axis: V(0, 0, 1), flex: -12 } });
        ex = Math.max(ex, r.excess);
        B.fingers(s, 1);
      }
      return ex;
    };
    // πάνω: ψηλότερη θέση με τεντωμένα χέρια· κάτω: ώμοι στο ύψος των αγκώνων
    let lo = DIP.y - 0.9, hi = DIP.y + 0.3;
    for (let i = 0; i < 15; i++) { const m = (lo + hi) / 2; if (pose(m) > 1e-4) hi = m; else lo = m; }
    const yTop = lo - 0.004;
    pose(lerp(yTop - 0.3, yTop, k.lift));
  },
});

// ===== Pullover με αλτήρα
def('pullover', {
  view: { az: 62, el: 20 },
  base: { pitch: -90, z: 0.13, sp: [-6, 0, 0], nk: [4, 0, 0], ang: 92, el: 22 },
  keys: {
    setup: { ang: 90, el: 18 },
    lower: { ang: 150, el: 24, sp: [-10, 0, 0] },
    stretch: { ang: 178, el: 26, sp: [-14, 0, 0] },
    up: { ang: 92, el: 22 },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['lower', 1.4, 1, { act: 'ecc', via: true }], ['stretch', 0.9, 2, { act: 'ecc', hold: 0.4 }], ['up', 1.8, 3, { act: 'con', hold: 0.3 }], ['lower', 1.4, 1, { act: 'ecc', via: true }], ['stretch', 0.9, 2, { act: 'ecc', hold: 0.4 }], ['up', 1.8, 3, { act: 'con', hold: 0.3 }]],
  loop: 4,
  setup(props, env) {
    props.add('bench', P.bench({ h: BENCH.h, z0: BENCH.z0, z1: BENCH.z1 }));
    env.db = props.add('db', P.dumbbell({ r: 0.075, handle: 0.12 }));
  },
  pose(B, k, ctx) {
    onSurface(B, k, {
      t: ctx.t, breathe: 0.4,
      contacts: () => [onBench()],
      limbs: (B, k, ph) => {
        if (ph === 'pre') { for (const s of SIDES) B.girdle(s, { elev: 0.12 * Math.max(0, k.ang - 40), prot: -4 }); return; }
        if (ph !== 'post') return;
        benchFeet(B, 0.5);
        B.solve();
        const c = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
        const L = armReach(B, 'L', k.el) * 0.96;
        // κατεύθυνση: από πάνω από το στήθος (+y) προς πίσω από το κεφάλι (−z)
        const a = k.ang * D2R;
        const d = V(0, Math.sin(a), Math.cos(a));
        const T = c.clone().addScaledVector(d, L);
        ctx.env.dbAt = { T, d };
        for (const s of SIDES) {
          B.reach(s, T.clone().add(V(sg(s) * 0.03, 0, 0)).addScaledVector(d, -0.02), { at: 'palm', pole: V(sg(s), 0.1, 0), hand: { palm: d.clone(), fingers: V(-sg(s), 0, 0).addScaledVector(d, 0.3) } });
          B.fingers(s, 0.55);
        }
      },
    });
  },
  update(props, B, k, env) {
    const { T, d } = env.dbAt;
    env.db.position.copy(T).addScaledVector(d, -0.055);
    env.db.quaternion.setFromUnitVectors(X, d);
  },
});

// ===== Πιέσεις ώμων όρθιος με μπάρα (overhead press)
def('ohp', {
  view: { az: 80, el: 6 },
  base: { y: 0.848, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.24, toe: 6, p: 0, back: 0 },
  keys: {
    rack: { p: 0 },
    brace: { p: 0, sp: [-2, 0, 0] },
    face: { p: 0.42, nk: [-16, 0, 0], sp: [-5, 0, 0], back: 1 },
    top: { p: 1, nk: [-6, 0, 0], sp: [-3, 0, 0] },
    through: { p: 1, nk: [6, 0, 0], sp: [-1, 0, 0] },
    down: { p: 0, sp: [-2, 0, 0] },
  },
  seq: [['rack', 1.2, 0, { act: 'setup' }], ['brace', 0.9, 1, { act: 'iso' }], ['face', 0.6, 2, { act: 'con', via: true }], ['top', 0.7, 2, { act: 'con' }], ['through', 0.5, 3, { act: 'iso', hold: 0.3 }], ['down', 1.8, 3, { act: 'ecc', hold: 0.25 }],
    ['face', 0.6, 2, { act: 'con', via: true }], ['top', 0.7, 2, { act: 'con' }], ['through', 0.5, 3, { act: 'iso', hold: 0.3 }], ['down', 1.8, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 6,
  setup: barSetup([0.225]),
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B, k) => {
        B.solve();
        const rack = B.pt('chest', V(0, 1.405, 0.128));
        const S = B.pivot('upperarm_L').add(B.pivot('upperarm_R')).multiplyScalar(0.5);
        const w = 0.27;
        const topY = topReach(B, w, S.z - 0.012, 4);
        const p = smooth(k.p);
        // η μπάρα ανεβαίνει κατακόρυφα· πάνω από το πρόσωπο, πάνω από τους ώμους στο τέλος
        const zb = lerp(rack.z, S.z - 0.012, smooth(clamp((k.p - 0.25) / 0.75, 0, 1)));
        const c = V(0, lerp(rack.y, topY, k.p), zb);
        env.bar = c;
        for (const s of SIDES) {
          const g = 0.14 * Math.max(0, 70 + 100 * p - 35);
          B.girdle(s, { elev: g * 0.9, prot: 4 });
          const pole = V(sg(s) * lerp(0.35, 1, p), lerp(-1, -0.25, p), lerp(0.8, 0.05, p));
          B.reach(s, c.clone().add(V(sg(s) * w, 0, 0)), { pole, hand: { axis: over(s, X), flex: lerp(-35, -12, p) } });
          B.fingers(s, 1);
        }
      },
      loads: () => [{ p: env.bar, kg: 40 }],
    });
  },
  update: barUpdate,
});

// ===== Καθιστές πιέσεις ώμων με αλτήρες
const UPB = { h: 0.46, back: 8 };
function uprightBench(props) {
  props.add('bench', P.seat({ h: UPB.h, z: 0.06, zb: -0.14, back: UPB.back, backH: 0.78, w: 0.3, depth: 0.36 }));
}
const sitUpright = (B, k, ctx, limbs) => sit(B, k, {
  t: ctx.t, h: UPB.h,
  back: { n: V(0, Math.sin(UPB.back * D2R), Math.cos(UPB.back * D2R)), p: V(0, UPB.h + 0.3, -0.14 - 0.04) },
  limbs: (B, k, ph) => {
    if (ph === 'post') for (const s of SIDES) B.plant(s, V(sg(s) * 0.2, FLOOR, 0.45), { yaw: 12 });
    limbs(B, k, ph);
  },
});
def('db_shoulder_press', {
  view: { az: 30, el: 8 },
  base: { pitch: -UPB.back, z: 0.06, sp: [-2, 0, 0], nk: [2, 0, 0], p: 0 },
  keys: {
    setup: { p: 0 },
    set: { p: 0.0 },
    top: { p: 1 },
    down: { p: 0 },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['set', 0.8, 1, { act: 'iso' }], ['top', 1.2, 2, { act: 'con', hold: 0.3 }], ['down', 2.0, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 2,
  setup(props, env) { uprightBench(props); env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) }; },
  pose(B, k, ctx) {
    sitUpright(B, k, ctx, (B, k, ph) => {
      if (ph !== 'post') return;
      B.solve();
      for (const s of SIDES) {
        const S = B.pivot('upperarm_' + s);
        const p = smooth(k.p);
        const wx = lerp(0.3, 0.135, p);
        const L = armReach(B, s, 8);
        const lat = sg(s) * wx - S.x;
        const yTop = S.y + Math.sqrt(Math.max(0.01, L * L - lat * lat - 0.03 * 0.03));
        const T = V(sg(s) * wx, lerp(S.y + 0.13, yTop, k.p), S.z + lerp(0.06, 0.03, p));
        B.girdle(s, { elev: 0.14 * Math.max(0, lerp(85, 170, p) - 35), prot: 2 });
        B.reach(s, T, { pole: V(sg(s), -0.35, lerp(0.45, 0.1, p)), hand: { axis: over(s, X), flex: -10 } });
        B.fingers(s, 1);
      }
    });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});
def('arnold_press', {
  view: { az: 30, el: 8 },
  base: { pitch: -UPB.back, z: 0.06, sp: [-2, 0, 0], nk: [2, 0, 0], a: [90, 72, 0, 148, 2, 0], g: [2, 8], f: 1 },
  keys: {
    setup: { a: [90, 72, 0, 148, 2, 0], g: [2, 8] },
    turn: { a: [40, 112, 34, 104, 60, 0], g: [8, 2] },
    top: { a: [24, 168, 0, 10, 4, 0], g: [20, 0] },
    down: { a: [90, 72, 0, 148, 2, 0], g: [2, 8] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['turn', 0.8, 1, { act: 'con', via: true }], ['top', 0.7, 2, { act: 'con', hold: 0.4 }], ['turn', 1.0, 3, { act: 'ecc', via: true }], ['down', 1.0, 3, { act: 'ecc', hold: 0.3 }],
    ['turn', 0.8, 1, { act: 'con', via: true }], ['top', 0.7, 2, { act: 'con', hold: 0.4 }], ['turn', 1.0, 3, { act: 'ecc', via: true }], ['down', 1.0, 3, { act: 'ecc', hold: 0.3 }]],
  loop: 5,
  setup(props, env) { uprightBench(props); env.db = { L: props.add('dbL', P.dumbbell()), R: props.add('dbR', P.dumbbell()) }; },
  pose(B, k, ctx) {
    sitUpright(B, k, ctx, (B, k, ph) => { if (ph === 'pre') armsFK(B, k, { rhythm: false }); });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Ανυψώσεις με αλτήρες (πλάγιες, εμπρός, scaption, ανασηκώσεις ώμων)
function dbStanding(id, d) {
  def(id, {
    view: d.view || { az: 28, el: 6 },
    base: { y: 0.849, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.24, toe: 7, f: 1, ...d.base },
    keys: d.keys,
    seq: d.seq,
    loop: d.loop ?? 2,
    setup(props, env) { env.db = { L: props.add('dbL', P.dumbbell(d.db)), R: props.add('dbR', P.dumbbell(d.db)) }; },
    pose(B, k, ctx) {
      stand(B, k, { t: ctx.t, sway: 0.5, upper: (B, k) => armsFK(B, k, { rhythm: d.rhythm }), loads: () => [{ p: B.grip('L'), kg: 8 }, { p: B.grip('R'), kg: 8 }] });
    },
    update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
  });
}
dbStanding('lateral_raise', {
  db: { r: 0.045, handle: 0.12, w: 0.04 },
  base: { a: [16, 8, -4, 12, 90, 0] },
  keys: {
    setup: { a: [16, 8, -4, 10, 90, 0] },
    lean: { pitch: 7, a: [18, 10, -8, 16, 90, 0] },
    up: { pitch: 7, a: [22, 88, -12, 18, 90, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['lean', 0.9, 1, { act: 'iso' }], ['up', 1.1, 2, { act: 'con', hold: 0.2, lag: { a: 0.04 } }], ['lean', 2.5, 3, { act: 'ecc', hold: 0.25 }]],
});
dbStanding('front_raise', {
  view: { az: 62, el: 6 },
  db: { r: 0.045, handle: 0.12, w: 0.04 },
  base: { a: [92, 10, 0, 10, 172, 0] },
  keys: {
    setup: { a: [92, 8, 0, 8, 172, 0] },
    up: { a: [90, 100, 0, 12, 172, 0], nk: [-3, 0, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['up', 1.2, 1, { act: 'con', hold: 0.5 }], ['setup', 2.2, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
});
dbStanding('scaption', {
  view: { az: 38, el: 6 },
  db: { r: 0.042, handle: 0.12, w: 0.035 },
  base: { a: [30, 8, 12, 6, 92, 0] },
  keys: {
    setup: { a: [30, 8, 12, 6, 92, 0] },
    up: { a: [32, 90, 14, 8, 92, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['up', 1.2, 1, { act: 'con', hold: 0.3 }], ['setup', 2.2, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
});
dbStanding('shrug', {
  view: { az: 30, el: 10, zoom: 1.7, ty: 0.32 },
  base: { a: [90, 4, 0, 4, 92, 0], g: [-2, 0] },
  rhythm: false,
  keys: {
    setup: { g: [-3, 0] },
    up: { g: [28, -2] },
    hold: { g: [28.5, -3] },
    down: { g: [-3, 0] },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['up', 0.9, 1, { act: 'con' }], ['hold', 1.0, 2, { act: 'iso' }], ['down', 1.8, 3, { act: 'ecc', hold: 0.3 }]],
  loop: 1,
});

// ===== Ανοίγματα σε κάμψη (rear delt fly)
def('rear_delt_fly', {
  view: { az: 150, el: 22 },
  base: { y: 0.8, pitch: 70, sp: [0, 0, 0], nk: [-18, 0, 0], stance: 0.26, toe: 8, a: [92, 70, 0, 16, 92, 0], g: [0, 6], f: 1 },
  keys: {
    stand: { y: 0.848, pitch: 0, nk: [0, 0, 0], a: [92, 6, 0, 10, 92, 0] },
    hinge: {},
    open: { a: [-6, 90, -8, 18, 92, 0], g: [-2, -16] },
  },
  seq: [['stand', 1.0, 0, { act: 'setup' }], ['hinge', 1.4, 0, { act: 'setup' }], ['open', 1.1, 1, { act: 'con' }], ['open', 0.35, 2, { act: 'iso' }], ['hinge', 2.0, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 2,
  setup(props, env) { env.db = { L: props.add('dbL', P.dumbbell({ r: 0.045, w: 0.04 })), R: props.add('dbR', P.dumbbell({ r: 0.045, w: 0.04 })) }; },
  pose(B, k, ctx) {
    stand(B, k, { t: ctx.t, upper: (B, k) => armsFK(B, k, { rhythm: false }), loads: () => [{ p: B.grip('L'), kg: 6 }, { p: B.grip('R'), kg: 6 }] });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Face pull
const FP = { z: 1.05, y: 1.62 };
def('face_pull', {
  view: { az: 52, el: 12 },
  frameProps: false,
  base: { y: 0.846, pitch: -3, sp: [0, 0, 0], nk: [0, 0, 0], p: 0 },
  keys: {
    setup: { p: 0, pitch: 0 },
    grip: { p: 0, pitch: -3 },
    pull: { p: 1, pitch: -4 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['grip', 0.9, 1, { act: 'iso' }], ['pull', 1.3, 2, { act: 'con', hold: 0.5 }], ['grip', 2.0, 3, { act: 'ecc', hold: 0.2 }]],
  loop: 2,
  setup(props, env) {
    const t = P.cableTower({ x: 0, z: FP.z + 0.12, y: FP.y, face: V(0, 0, -1) });
    props.add('tower', t.obj);
    env.pulley = t.pulley;
    env.rope = props.add('rope', P.rope());
    env.cable = props.add('cable', P.line(0.004));
  },
  pose(B, k, ctx) {
    stand(B, k, {
      t: ctx.t,
      feet: () => ({ L: { at: V(0.12, FLOOR, 0.08), yaw: 6 }, R: { at: V(-0.12, FLOOR, -0.12), yaw: 8 } }),
      upper: (B, k) => {
        B.solve();
        const p = smooth(k.p);
        for (const s of SIDES) {
          const S = B.pivot('upperarm_' + s);
          // αρχή με ελαφρά λυγισμένους αγκώνες (~20°, όχι κλειδωμένους): ομαλό ξεκίνημα της έλξης
          // (με τον καρπό στραμμένο για το σχοινί, η πραγματική εμβέλεια είναι ~2,5 cm μικρότερη)
          const L = armReach(B, s, 18) - 0.042;
          const ext = V(sg(s) * 0.07, FP.y - 0.06, S.z + Math.sqrt(Math.max(0.01, L * L - (FP.y - 0.06 - S.y) ** 2 - (sg(s) * 0.07 - S.x) ** 2)));
          const ear = B.pt('head', V(sg(s) * 0.15, 1.6, 0.0));
          const T = ext.clone().lerp(ear, p);
          B.girdle(s, { elev: 6 + 4 * p, prot: lerp(8, -16, p) });
          B.reach(s, T, { pole: V(sg(s), lerp(-0.6, 0.15, p), lerp(-0.2, -0.6, p)), hand: { axis: V(0, 0.1, -1).normalize(), flex: 0 } });
          B.fingers(s, 1);
        }
      },
    });
  },
  update(props, B, k, env) {
    const l = B.grip('L'), r = B.grip('R');
    const hook = env.pulley.clone().lerp(l.clone().add(r).multiplyScalar(0.5), 0.88);
    const dir = hook.clone().sub(env.pulley).normalize();
    const hk = l.clone().add(r).multiplyScalar(0.5).addScaledVector(dir, -0.28);
    env.rope.userData.set(hk, l, r);
    P.setLine(env.cable, env.pulley, hk);
  },
});

// ===== Κωπηλατική όρθια (upright row)
def('upright_row', {
  view: { az: 40, el: 6 },
  base: { y: 0.849, pitch: 2, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.24, p: 0 },
  keys: {
    setup: { p: 0, pitch: 0 },
    up: { p: 1, pitch: 3 },
  },
  seq: [['setup', 1.2, 0, { act: 'setup' }], ['up', 1.2, 1, { act: 'con', via: true }], ['up', 0.4, 2, { act: 'con', hold: 0.3 }], ['setup', 2.0, 3, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup: barSetup([0.16], 1.6),
  pose(B, k, ctx) {
    const env = ctx.env;
    stand(B, k, {
      t: ctx.t,
      upper: (B, k) => {
        B.solve();
        const p = smooth(k.p);
        const w = 0.17;
        const lowY = (() => { let y = -Infinity; for (const s of SIDES) { const S = B.pivot('upperarm_' + s); const L = armReach(B, s, 6); y = Math.max(y, S.y - Math.sqrt(Math.max(0.01, L * L - (sg(s) * w - S.x) ** 2 - 0.0225))); } return y; })();
        const front = B.pt('chest', V(0, 1.3, 0.19));
        const c = V(0, lerp(lowY, front.y + 0.04, k.p), lerp(B.pivot('upperarm_L').z + 0.15, front.z + 0.045, p));
        env.bar = c;
        for (const s of SIDES) {
          B.girdle(s, { elev: 4 + 14 * p, prot: 4 });
          B.reach(s, c.clone().add(V(sg(s) * w, 0, 0)), { pole: V(sg(s), lerp(-0.4, 0.7, p), -0.25), hand: { axis: over(s, X), flex: lerp(0, 25, p) } });
          B.fingers(s, 1);
        }
      },
      loads: () => [{ p: env.bar, kg: 25 }],
    });
  },
  update: barUpdate,
});

// ===== Στροφές ώμου με λάστιχο
function rotation(id, { ext }) {
  const anchor = V(ext ? -0.72 : 0.72, 1.0, 0.24);
  def(id, {
    view: { az: 10, el: 18 },
    base: { y: 0.85, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.26, rot: ext ? -30 : 42 },
    keys: ext
      ? { setup: { rot: -30 }, out: { rot: 50 } }
      : { setup: { rot: 42 }, out: { rot: -55 } },
    seq: [['setup', 1.3, 0, { act: 'setup' }], ['out', 1.2, 1, { act: 'con', hold: 0.3 }], ['setup', 2.0, 2, { act: 'ecc', hold: 0.2 }]],
    loop: 1,
    setup(props, env) {
      const post = new THREE.Group();
      post.add(P.tube(V(anchor.x, 0, anchor.z), V(anchor.x, 1.2, anchor.z), 0.03));
      post.add(P.box(0.4, 0.03, 0.4, V(anchor.x, 0.015, anchor.z), P.MAT.frame, 0.01));
      props.add('post', post);
      env.band = props.add('band', P.line(0.007, P.MAT.band));
    },
    pose(B, k, ctx) {
      stand(B, k, {
        t: ctx.t, sway: 0.4,
        upper: (B, k) => {
          B.arm('L', { plane: 92, elev: 6, rot: k.rot, elbow: 90, pron: 90, wrist: { flex: 0 } });
          B.fingers('L', 1);
          B.arm('R', { plane: 90, elev: 6, rot: 0, elbow: 12, pron: 70 });
          B.fingers('R', 0.15);
        },
      });
    },
    update(props, B, k, env) { P.setLine(env.band, anchor, B.grip('L')); },
  });
}
rotation('ext_rotation', { ext: true });
rotation('int_rotation', { ext: false });

// ===== Y-raise σε κεκλιμένο πάγκο (μπρούμυτα)
const YR = { h: 0.44, z0: 0.36, seat: 0.38, a: 38 };
YR.zs = YR.z0 - YR.seat;
def('y_raise', {
  view: { az: 70, el: 20 },
  base: { pitch: 51, yaw: 180, z: 0.14, y: 0.95, sp: [0, 0, 0], nk: [-6, 0, 0], up: 0 },
  keys: {
    setup: { up: 0 },
    up: { up: 1, nk: [-10, 0, 0] },
  },
  seq: [['setup', 1.4, 0, { act: 'setup' }], ['up', 1.3, 1, { act: 'con', hold: 0.4 }], ['setup', 2.1, 2, { act: 'ecc', hold: 0.25 }]],
  loop: 1,
  setup(props, env) {
    props.add('bench', P.bench({ h: YR.h, z0: YR.z0, incline: YR.a, seatLen: YR.seat }));
    env.db = { L: props.add('dbL', P.dumbbell({ r: 0.04, w: 0.035 })), R: props.add('dbR', P.dumbbell({ r: 0.04, w: 0.035 })) };
  },
  pose(B, k, ctx) {
    const pl = inclinePlane(YR.h, YR.zs, YR.a);
    onSurface(B, k, {
      t: ctx.t, breathe: 0.3, iter: 2,
      contacts: () => [{ bones: ['chest', 'spine2', 'spine1'], n: pl.n, d: pl.d + 0.0 }],
      limbs: (B, k, ph) => {
        if (ph === 'pre') return;
        if (ph === 'post') {
          for (const s of SIDES) B.plant(s, V(sg(s) * 0.13, FLOOR, 0.82), { yaw: 4, lift: 32, pole: V(0, 0, 1) });
          B.solve();
          const hang = dirToArm(B, V(0, -1, 0));
          for (const s of SIDES) {
            const u = smooth(k.up);
            B.girdle(s, { elev: lerp(-6, 12, u), prot: lerp(10, -12, u) });
            B.arm(s, { plane: lerp(hang.plane, 32, u), elev: lerp(hang.elev, 158, u), rot: lerp(0, 20, u), elbow: 6, pron: 92 });
            B.fingers(s, 1);
          }
        }
      },
    });
  },
  update(props, B, k, env) { for (const s of SIDES) inHand(env.db[s], B, s); },
});

// ===== Band pull-apart
def('band_pull_apart', {
  view: { az: 22, el: 14 },
  base: { y: 0.849, pitch: 0, sp: [0, 0, 0], nk: [0, 0, 0], stance: 0.24, a: [92, 90, 0, 4, 172, 0], g: [2, 8], f: 1 },
  keys: {
    setup: { a: [94, 90, 0, 4, 172, 0], g: [2, 8] },
    apart: { a: [-4, 90, 2, 4, 172, 0], g: [0, -16] },
  },
  seq: [['setup', 1.3, 0, { act: 'setup' }], ['apart', 1.1, 1, { act: 'con', hold: 0.4 }], ['setup', 1.8, 2, { act: 'ecc', hold: 0.2 }]],
  loop: 1,
  setup(props, env) { env.band = props.add('band', P.line(0.007, P.MAT.band)); },
  pose(B, k, ctx) { stand(B, k, { t: ctx.t, upper: (B, k) => armsFK(B, k, { rhythm: false }) }); },
  update(props, B, k, env) {
    const l = B.grip('L'), r = B.grip('R');
    P.setLine(env.band, l.clone().add(B.gripAxis('L').multiplyScalar(-0.04)), r.clone().add(B.gripAxis('R').multiplyScalar(-0.04)));
  },
});
