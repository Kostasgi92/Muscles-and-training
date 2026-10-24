/* Movement animation: Claude designs a few key poses for a side-view figure (joint angles), this file
   turns them into a jointed, muscled mannequin and animates it. Joint ANGLES are interpolated (so arms
   and legs keep their length), the feet/hands/back stay planted on every frame, the exercise's working
   muscles are coloured on the body, the path of the main moving point is traced and the turnaround
   position is shown as a faint silhouette. Saved per exercise in this browser (localStorage "mx.motion"). */
(() => {
  'use strict';
  const EL = window.__mxLang === 'el';
  const T = (en, el) => (EL ? el : en);
  const KEY = 'mx.motion';
  const W = 160, H = 140, FLOOR = 124, BENCH_TOP = 102;   // a bench about 40 cm high
  const LEN = { torso: 30, head: 14, upper: 17, fore: 15, thigh: 24, shin: 23, foot: 9 };
  const NS = 'http://www.w3.org/2000/svg';
  const FAR = [-1.3, -1.1];          // far-side limbs: a little behind and up, for depth
  const HOLD = 0.07;                 // share of each transition spent resting on a key pose

  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------ angles */
  const rel = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;   // b relative to a, in [-180, 180)
  // as written when the poses say so (0 → 180 is a forward raise), the short way round otherwise
  const lerpA = (a, b, t) => a + (Math.abs(b - a) <= 180 ? b - a : rel(a, b)) * t;

  // joints that cannot bend that way do not: knee only backwards, limited neck and ankle
  function anatomical(o) {
    const knee = (leg) => { const r = Math.min(8, Math.max(-160, rel(leg[0], leg[1]))); return [leg[0], leg[0] + r]; };
    o.leg = knee(o.leg);
    if (o.leg2) o.leg2 = knee(o.leg2);
    const h = rel(o.torso, o.head);
    if (Math.abs(h) > 60) o.head = o.torso + Math.sign(h) * 60;
    const f = rel(o.leg[1], o.foot);
    if (f < 20 || f > 140) o.foot = o.leg[1] + 90;
    else o.foot = o.leg[1] + Math.min(125, Math.max(35, f));
    return o;
  }

  /* ------------------------------------------------------------ validation */
  const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const pair = (a, d) => (Array.isArray(a) && a.length >= 2 ? [num(a[0], d[0], -720, 720), num(a[1], d[1], -720, 720)] : d);
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.frames) || raw.frames.length < 2) return null;
    const frames = raw.frames.slice(0, 5).map((f) => {
      const torso = num(f.torso, 180, -720, 720);
      const o = {
        hip: pair(f.hip, [80, 80]),
        torso,
        head: num(f.head, torso, -720, 720),
        arm: pair(f.arm, [0, 0]),
        leg: pair(f.leg, [0, 0]),
        foot: num(f.foot, 90, -720, 720),
        label: typeof f.label === 'string' ? f.label.slice(0, 28) : '',
      };
      if (Array.isArray(f.arm2)) o.arm2 = pair(f.arm2, o.arm);
      if (Array.isArray(f.leg2)) o.leg2 = pair(f.leg2, o.leg);
      o.hip = [num(f.hip && f.hip[0], 80, -200, 360), num(f.hip && f.hip[1], 80, -200, 360)];
      return anatomical(o);
    });
    const impl = raw.implement && typeof raw.implement === 'object' ? raw.implement : {};
    const props = (Array.isArray(raw.props) ? raw.props : []).slice(0, 8).map((p) => {
      if (!p || typeof p !== 'object') return null;
      const c = (v) => num(v, 0, -200, 360);
      if (p.t === 'line') return { t: 'line', x1: c(p.x1), y1: c(p.y1), x2: c(p.x2), y2: c(p.y2), w: num(p.w, 3, 1, 12) };
      if (p.t === 'rect') return { t: 'rect', x: c(p.x), y: c(p.y), w: num(p.w, 10, 1, 200), h: num(p.h, 10, 1, 200) };
      if (p.t === 'circle') return { t: 'circle', x: c(p.x), y: c(p.y), r: num(p.r, 5, 1, 40) };
      return null;
    }).filter(Boolean);
    return {
      frames,
      plant: ['feet', 'hands', 'body', 'none'].includes(raw.plant) ? raw.plant : 'feet',
      bench: !!raw.bench,
      bar: !!raw.bar,
      barDir: ['across', 'along'].includes(raw.barDir) ? raw.barDir : null,
      implement: {
        type: ['barbell', 'dumbbell', 'kettlebell', 'ball', 'none'].includes(impl.type) ? impl.type : 'none',
        at: ['hands', 'shoulders', 'hips'].includes(impl.at) ? impl.at : 'hands',
      },
      cable: Array.isArray(raw.cable) && raw.cable.length >= 2 ? [num(raw.cable[0], 0, -200, 360), num(raw.cable[1], 0, -200, 360)] : null,
      props,
      seconds: num(raw.seconds, 3, 1.5, 6),
    };
  }

  /* ------------------------------------------------------------ kinematics */
  const add = (p, a, l) => { const r = (a * Math.PI) / 180; return [p[0] + Math.sin(r) * l, p[1] + Math.cos(r) * l]; };
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
  // a pose as numbers: hip x, hip y, torso, head, arm, far arm, leg, far leg, foot
  const vec = (f) => {
    const a2 = f.arm2 || f.arm, l2 = f.leg2 || f.leg;
    return [f.hip[0], f.hip[1], f.torso, f.head, f.arm[0], f.arm[1], a2[0], a2[1], f.leg[0], f.leg[1], l2[0], l2[1], f.foot];
  };
  const mix = (a, b, t) => a.map((v, i) => (i < 2 ? v + (b[i] - v) * t : lerpA(v, b[i], t)));
  function joints(q) {
    const hip = [q[0], q[1]];
    const sh = add(hip, q[2], LEN.torso);
    const elbow = add(sh, q[4], LEN.upper), elbow2 = add(sh, q[6], LEN.upper);
    const knee = add(hip, q[8], LEN.thigh), knee2 = add(hip, q[10], LEN.thigh);
    const ankle = add(knee, q[9], LEN.shin), ankle2 = add(knee2, q[11], LEN.shin);
    return {
      hip, sh, head: add(sh, q[3], LEN.head),
      elbow, wrist: add(elbow, q[5], LEN.fore), elbow2, wrist2: add(elbow2, q[7], LEN.fore),
      knee, ankle, knee2, ankle2,
      toe: add(ankle, q[12], LEN.foot), toe2: add(ankle2, q[11] + rel(q[9], q[12]), LEN.foot),
    };
  }
  const shiftJ = (j, dx, dy) => { const o = {}; for (const k in j) o[k] = [j[k][0] + dx, j[k][1] + dy]; return o; };

  // heel and ball of the shoe sole — the points that touch the floor
  function sole(ankle, toe) {
    const [ux, uy] = unit(ankle, toe), s = [-uy, ux];
    return [[ankle[0] - ux * 2.6 + s[0] * 2.8, ankle[1] - uy * 2.6 + s[1] * 2.8], [ankle[0] + ux * 7.4 + s[0] * 2.7, ankle[1] + uy * 7.4 + s[1] * 2.7]];
  }

  /* ------------------------------------------------------------ body shapes */
  // half-thickness of each segment along its length (t: 0 = proximal joint, 1 = distal), front and back
  const prof = (pts) => (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) { const [t0, r0] = pts[i - 1], [t1, r1] = pts[i]; return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0); }
    }
    return pts[pts.length - 1][1];
  };
  const SHAPE = {
    torso: { side: -1, ta: -0.17, tb: 1.06, f: prof([[-0.17, 3.2], [0.04, 5.5], [0.3, 6.3], [0.55, 6.1], [0.76, 7.0], [0.92, 6.1], [1.06, 3.2]]), b: prof([[-0.17, 4.4], [-0.04, 7.7], [0.14, 6.4], [0.36, 4.9], [0.6, 5.8], [0.82, 6.6], [0.97, 5.6], [1.06, 3.6]]) },
    neck: { side: -1, ta: 0, tb: 0.8, f: prof([[0, 3.3], [0.5, 2.7], [0.8, 2.6]]), b: prof([[0, 3.6], [0.5, 2.9], [0.8, 2.7]]) },
    thigh: { side: 1, f: prof([[0, 5.0], [0.3, 5.4], [0.75, 4.2], [1, 3.5]]), b: prof([[0, 5.6], [0.25, 5.2], [0.7, 4.0], [1, 3.3]]) },
    shin: { side: 1, f: prof([[0, 3.2], [0.25, 2.8], [1, 1.8]]), b: prof([[0, 3.3], [0.28, 4.4], [0.62, 2.8], [1, 1.7]]) },
    upper: { side: 1, f: prof([[0, 3.0], [0.55, 3.2], [1, 2.3]]), b: prof([[0, 3.2], [0.35, 3.4], [1, 2.3]]) },
    fore: { side: 1, f: prof([[0, 2.4], [0.2, 2.75], [1, 1.6]]), b: prof([[0, 2.5], [0.18, 2.85], [1, 1.5]]) },
    delt: { side: 1, ta: -0.15, tb: 1, f: prof([[-0.15, 3.0], [0.4, 4.4], [1, 2.6]]), b: prof([[-0.15, 3.2], [0.35, 4.6], [1, 2.7]]) },
    hand: { side: 1, f: prof([[0, 2.0], [0.5, 2.3], [1, 1.5]]), b: prof([[0, 1.9], [0.5, 2.2], [1, 1.4]]) },
  };

  // a segment from A to B with its own axis (u) and front normal (n); bulgeF/bulgeB swell the middle of the front/back
  function seg(A, B, shape, bulgeF = 0, bulgeB = 0) {
    const [ux, uy, L] = unit(A, B);
    const n = shape.side > 0 ? [uy, -ux] : [-uy, ux];
    const ta = shape.ta ?? 0, tb = shape.tb ?? 1;
    const bump = (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    return {
      u: [ux, uy], n, ta, tb,
      fr: (t) => shape.f(t) * (1 + bulgeF * bump(t)),
      bk: (t) => shape.b(t) * (1 + bulgeB * bump(t)),
      pt: (t, off) => [A[0] + ux * t * L + n[0] * off, A[1] + uy * t * L + n[1] * off],
    };
  }
  function capPts(s, t, dir, pts) {
    const f = s.fr(t), b = s.bk(t), r = (f + b) / 2, c = s.pt(t, (f - b) / 2);
    for (let i = 1; i < 4; i++) {
      const a = (i / 4) * Math.PI, cn = dir > 0 ? Math.cos(a) : -Math.cos(a), cu = Math.sin(a) * dir;
      pts.push([c[0] + (s.n[0] * cn + s.u[0] * cu) * r, c[1] + (s.n[1] * cn + s.u[1] * cu) * r]);
    }
  }
  function outline(s, N = 8) {
    const pts = [];
    for (let i = 0; i <= N; i++) { const t = s.ta + ((s.tb - s.ta) * i) / N; pts.push(s.pt(t, s.fr(t))); }
    capPts(s, s.tb, 1, pts);
    for (let i = N; i >= 0; i--) { const t = s.ta + ((s.tb - s.ta) * i) / N; pts.push(s.pt(t, -s.bk(t))); }
    capPts(s, s.ta, -1, pts);
    return pts;
  }
  // a muscle belly: a spindle hugging the front (side 1) or back (-1) edge, or across the middle (0)
  function belly(s, side, t0, t1, d, shift = 0, N = 7) {
    const out = [], inn = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N, w = Math.sin((Math.PI * i) / N), f = s.fr(t), b = s.bk(t);
      let o, k;
      if (side > 0) { o = f - 0.5; k = o - f * d * w; }
      else if (side < 0) { o = -(b - 0.5); k = o + b * d * w; }
      else { const c = (f - b) / 2 + (shift * (f + b)) / 2, h = ((f + b) / 2) * d * w; o = c + h; k = c - h; }
      out.push(s.pt(t, o));
      if (i > 0 && i < N) inn.push(s.pt(t, k));
    }
    return out.concat(inn.reverse());
  }
  function shoe(ankle, toe) {
    const [ux, uy] = unit(ankle, toe), s = [-uy, ux];
    const P = (a, b) => [ankle[0] + ux * a + s[0] * b, ankle[1] + uy * a + s[1] * b];
    return [P(-2.9, 0.5), P(-2.7, 2.7), P(1.5, 3.0), P(7.4, 2.7), P(9.7, 1.8), P(9.7, 0.3), P(6.4, -1.2), P(2.8, -2.3), P(0.8, -3.1), P(-2.3, -2.5)];
  }
  function headGeo(sh, head) {
    const [ux, uy] = unit(sh, head), f = [-uy, ux];
    const c = [head[0] + ux * 0.6, head[1] + uy * 0.6];
    const P = (a, b) => [c[0] + ux * a + f[0] * b, c[1] + uy * a + f[1] * b];
    const skull = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * 2 * Math.PI, a = 7.0 * Math.cos(t);
      let b = 5.9 * Math.sin(t);
      if (b > 0 && a < 0) b += 1.2 * Math.sin(t) * (-a / 7);   // jaw and chin forward
      skull.push(P(a, b));
    }
    return { skull, nose: [P(1.4, 5.6), P(-0.4, 7.7), P(-1.9, 5.9)], eye: P(1.7, 3.7), ear: P(-0.2, -0.9), u: [ux, uy] };
  }
  // smooth closed path through the points (Catmull-Rom)
  const fx = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  function smooth(pts) {
    const n = pts.length;
    let d = 'M' + fx(pts[0]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + fx([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + fx([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + fx(p2);
    }
    return d + 'Z';
  }
  // all the segments of one body pose (far limbs shifted for depth)
  function segments(j) {
    const F = (p) => [p[0] + FAR[0], p[1] + FAR[1]];
    const flex = (a, b, c) => { const u = unit(a, b), v = unit(b, c); return Math.max(0, 1 - (u[0] * v[0] + u[1] * v[1])) / 2; };
    const arm = (sh, el, wr, far) => {
      const s = far ? F(sh) : sh, e = far ? F(el) : el, w = far ? F(wr) : wr;
      const [ux, uy] = unit(e, w);
      return {
        upper: seg(s, e, SHAPE.upper, 0.22 * flex(s, e, w)),
        delt: seg([s[0] - unit(s, e)[0] * 1.2, s[1] - unit(s, e)[1] * 1.2], [s[0] + unit(s, e)[0] * 8.2, s[1] + unit(s, e)[1] * 8.2], SHAPE.delt),
        fore: seg(e, w, SHAPE.fore),
        hand: seg(w, [w[0] + ux * 4.6, w[1] + uy * 4.6], SHAPE.hand),
      };
    };
    const leg = (hip, kn, an, toe, far) => {
      const h = far ? F(hip) : hip, k = far ? F(kn) : kn, a = far ? F(an) : an, t = far ? F(toe) : toe;
      const tip = rel(Math.atan2(an[0] - kn[0], an[1] - kn[1]) * 57.2958, Math.atan2(toe[0] - an[0], toe[1] - an[1]) * 57.2958);
      return { thigh: seg(h, k, SHAPE.thigh), shin: seg(k, a, SHAPE.shin, 0, Math.max(0, (75 - tip) / 160)), foot: shoe(a, t) };
    };
    return {
      torso: seg(j.hip, j.sh, SHAPE.torso),
      neck: seg(j.sh, j.head, SHAPE.neck),
      head: headGeo(j.sh, j.head),
      arm: arm(j.sh, j.elbow, j.wrist, false), arm2: arm(j.sh, j.elbow2, j.wrist2, true),
      leg: leg(j.hip, j.knee, j.ankle, j.toe, false), leg2: leg(j.hip, j.knee2, j.ankle2, j.toe2, true),
    };
  }

  /* ------------------------------------------------------------ working muscles on the figure */
  // id → [segment, side (1 front, -1 back, 0 middle), t0, t1, depth, shift]; 'hip' = torso drawn over the near thigh
  const MUSCLE = {
    chest: [['torso', 1, 0.6, 0.98, 0.62]], 'chest.clav': [['torso', 1, 0.78, 1.03, 0.55]], 'chest.stern': [['torso', 1, 0.6, 0.94, 0.6]], 'chest.abd': [['torso', 1, 0.55, 0.78, 0.5]],
    pec_minor: [['torso', 1, 0.72, 0.95, 0.35]], serratus: [['torso', 0, 0.5, 0.78, 0.5, 0.35]], intercostals: [['torso', 0, 0.45, 0.8, 0.5, 0.1]],
    deltoid: [['delt', 0, 0, 0.95, 0.9]], 'deltoid.front': [['delt', 1, -0.05, 0.95, 0.85]], 'deltoid.side': [['delt', 0, 0.02, 0.95, 0.75]], 'deltoid.rear': [['delt', -1, -0.05, 0.95, 0.85]],
    rotator_cuff: [['torso', -1, 0.76, 0.98, 0.45]], teres_major: [['torso', -1, 0.66, 0.86, 0.45]],
    trapezius: [['torso', -1, 0.6, 1.05, 0.5], ['neck', -1, 0, 0.7, 0.8]], 'trapezius.upper': [['torso', -1, 0.86, 1.06, 0.55], ['neck', -1, 0, 0.75, 0.85]],
    'trapezius.middle': [['torso', -1, 0.72, 0.96, 0.4]], 'trapezius.lower': [['torso', -1, 0.52, 0.8, 0.35]],
    lats: [['torso', -1, 0.36, 0.86, 0.6]], rhomboids: [['torso', -1, 0.7, 0.93, 0.32]],
    levator_scap: [['neck', -1, 0.1, 0.8, 0.6]], splenius: [['neck', -1, 0.1, 0.8, 0.6]], scm: [['neck', 1, 0.05, 0.8, 0.7]], scalenes: [['neck', 0, 0.1, 0.75, 0.5]],
    erectors: [['torso', -1, 0.02, 0.62, 0.38]], multifidus: [['torso', -1, 0, 0.45, 0.3]], quadratus_lumb: [['torso', -1, 0.08, 0.4, 0.35]],
    rectus_abd: [['torso', 1, 0.06, 0.62, 0.45]], ext_oblique: [['torso', 0, 0.12, 0.6, 0.55, 0.2]], int_oblique: [['torso', 0, 0.12, 0.6, 0.5, 0.2]], transversus: [['torso', 0, 0.06, 0.5, 0.45, 0.3]],
    iliopsoas: [['hip', 1, -0.04, 0.16, 0.6]], glute_max: [['hip', -1, -0.17, 0.22, 0.72]], glute_med: [['hip', 0, 0, 0.2, 0.55, -0.15]], glute_min: [['hip', 0, 0.02, 0.16, 0.4, -0.1]], hip_rotators: [['hip', -1, -0.08, 0.1, 0.4]],
    tfl: [['thigh', 1, 0, 0.3, 0.6]], quads: [['thigh', 1, 0.05, 0.95, 0.85]], 'quads.rf': [['thigh', 1, 0.05, 0.9, 0.6]], sartorius: [['thigh', 1, 0, 1, 0.3]],
    adductors: [['thigh', 0, 0.02, 0.7, 0.5]], hamstrings: [['thigh', -1, 0.1, 0.97, 0.85]],
    calves: [['shin', -1, 0.04, 0.62, 0.95]], 'calves.sol': [['shin', -1, 0.25, 0.85, 0.7]], 'calves.achilles': [['shin', -1, 0.6, 1, 0.5]], deep_calf: [['shin', -1, 0.3, 0.85, 0.5]],
    tib_ant: [['shin', 1, 0.05, 0.78, 0.65]], fibularis: [['shin', 0, 0.1, 0.8, 0.45]],
    biceps: [['upper', 1, 0.12, 0.92, 0.88]], brachialis: [['upper', 1, 0.5, 0.98, 0.55]], coracobrachialis: [['upper', 1, 0, 0.5, 0.45]], triceps: [['upper', -1, 0.06, 0.92, 0.88]],
    brachioradialis: [['fore', 1, 0, 0.62, 0.7]], forearm_flex: [['fore', 1, 0.04, 0.82, 0.85]], forearm_ext: [['fore', -1, 0.04, 0.82, 0.85]], hand: [['hand', 0, 0.05, 0.95, 0.85]],
  };
  const LIMB = new Set(['thigh', 'shin', 'upper', 'fore', 'hand', 'delt']);
  function muscleRegions(ex) {
    const out = new Map();   // one entry per drawn region; main muscles win over assisting ones
    const put = (ids, role) => (ids || []).forEach((id) => {
      const list = MUSCLE[id] || MUSCLE[String(id).split('.')[0]];
      (list || []).forEach((r) => { const k = r.join(); if (!out.has(k) || role === 'p') out.set(k, { r, role }); });
    });
    put(ex && ex.s, 's');
    put(ex && ex.p, 'p');
    return [...out.values()];
  }

  /* ------------------------------------------------------------ drawing */
  const el = (n, a, kids) => {
    const e = document.createElementNS(NS, n);
    for (const k in a || {}) e.setAttribute(k, a[k]);
    (kids || []).forEach((c) => e.appendChild(c));
    return e;
  };

  // the figure: layers in drawing order, every part a path updated each frame
  function makeBody(layers, regions, ghost) {
    const parts = [];
    const add = (layer, cls, geo) => { const p = el('path', { class: cls }); layer.appendChild(p); parts.push({ p, geo }); };
    const skin = (far) => (ghost ? 'mm-ghost' : far ? 'mm-skin mm-far' : 'mm-skin');
    const isLeg = (name) => name === 'thigh' || name === 'shin';
    const layerOf = (name, far) => (name === 'hip' ? 'hipm' : far ? 'far' : !LIMB.has(name) ? 'torso' : isLeg(name) ? 'leg' : 'arm');
    const segOf = (S, name, far) => (name === 'hip' || name === 'torso' ? S.torso : name === 'neck' ? S.neck : S[(isLeg(name) ? 'leg' : 'arm') + (far ? '2' : '')][name]);
    // coloured muscles go right after their segment, assisting first so the main ones stay on top
    const regionsOn = (name, far) => {
      if (ghost) return;
      regions.filter((x) => x.r[0] === name).sort((a, b) => (a.role === 'p') - (b.role === 'p')).forEach(({ r, role }) => {
        const [, side, t0, t1, d, shift] = r;
        add(layers[layerOf(name, far)], 'mm-ms mm-ms-' + role + (far ? ' mm-far' : ''), (S) => smooth(belly(segOf(S, name, far), side, t0, t1, d, shift || 0)));
      });
    };
    const limbSet = (far) => {
      const L = layers[far ? 'far' : 'leg'], A = layers[far ? 'far' : 'arm'], lk = far ? 'leg2' : 'leg', ak = far ? 'arm2' : 'arm';
      const legPart = () => {
        add(L, skin(far), (S) => smooth(outline(S[lk].thigh))); regionsOn('thigh', far);
        add(L, skin(far), (S) => smooth(outline(S[lk].shin))); regionsOn('shin', far);
        add(L, skin(far) + ' mm-shoe', (S) => smooth(S[lk].foot));
      };
      const armPart = () => {
        add(A, skin(far), (S) => smooth(outline(S[ak].upper))); regionsOn('upper', far);
        add(A, skin(far), (S) => smooth(outline(S[ak].delt))); regionsOn('delt', far);
        add(A, skin(far), (S) => smooth(outline(S[ak].fore))); regionsOn('fore', far);
        add(A, skin(far), (S) => smooth(outline(S[ak].hand, 4))); regionsOn('hand', far);
      };
      return { legPart, armPart };
    };
    const far = limbSet(true), near = limbSet(false);
    far.legPart();
    far.armPart();
    add(layers.torso, skin(false), (S) => smooth(outline(S.torso, 12))); regionsOn('torso', false);
    add(layers.torso, skin(false), (S) => smooth(outline(S.neck, 4))); regionsOn('neck', false);
    add(layers.torso, skin(false), (S) => smooth(S.head.skull));
    if (!ghost) {
      add(layers.torso, 'mm-skin', (S) => smooth(S.head.nose));
      const eye = el('circle', { r: 0.75, class: 'mm-eye' }); layers.torso.appendChild(eye);
      const ear = el('ellipse', { rx: 1.3, ry: 2.0, class: 'mm-ear' }); layers.torso.appendChild(ear);
      parts.push({ geo: (S) => {
        eye.setAttribute('cx', S.head.eye[0].toFixed(2)); eye.setAttribute('cy', S.head.eye[1].toFixed(2));
        ear.setAttribute('transform', 'translate(' + fx(S.head.ear).replace(' ', ',') + ') rotate(' + (Math.atan2(S.head.u[1], S.head.u[0]) * 57.2958 + 90).toFixed(1) + ')');
      } });
    }
    near.legPart();
    regionsOn('hip', false);
    near.armPart();
    return {
      draw(j) {
        const S = segments(j);
        for (const part of parts) { const d = part.geo(S); if (part.p) part.p.setAttribute('d', d); }
      },
    };
  }

  /* ------------------------------------------------------------ world: grounding, framing, trail */
  function grounder(spec, ref) {
    if (spec.plant === 'feet') {
      const r = sole(ref.ankle, ref.toe)[1];
      return (j) => {
        const pts = [...sole(j.ankle, j.toe), ...sole(j.ankle2, j.toe2)];
        const low = Math.max(...pts.map((p) => p[1]));
        return shiftJ(j, r[0] - sole(j.ankle, j.toe)[1][0], FLOOR - low);
      };
    }
    if (spec.plant === 'hands') {
      const soles = [...sole(ref.ankle, ref.toe), ...sole(ref.ankle2, ref.toe2)].map((p) => p[1]);
      const b0 = Math.max(ref.wrist[1] + 3, ref.wrist2[1] + 3, ...soles, ref.knee[1] + 4, ref.hip[1] + 7, ref.head[1] + 7);
      const dy0 = spec.bar ? Math.min(0, FLOOR - b0) : FLOOR - Math.max(ref.wrist[1] + 3, ...soles, ref.knee[1] + 3.5);
      const dyc = Math.min(dy0, FLOOR - b0), w0 = ref.wrist;
      return (j) => shiftJ(j, w0[0] - j.wrist[0], w0[1] - j.wrist[1] + dyc);
    }
    if (spec.plant === 'body') {
      const surface = spec.bench ? BENCH_TOP : FLOOR, x0 = ref.hip[0];
      return (j) => {
        const torso = outline(seg(j.hip, j.sh, SHAPE.torso), 10);
        let dy = surface - Math.max(...torso.map((p) => p[1]), j.head[1] + 6.8);
        const soles = [...sole(j.ankle, j.toe), ...sole(j.ankle2, j.toe2)].map((p) => p[1]);
        const limbs = Math.max(j.knee[1] + 3.5, j.knee2[1] + 3.5, ...soles, j.elbow[1] + 3, j.wrist[1] + 2.5);
        if (limbs + dy > FLOOR) dy = FLOOR - limbs;
        return shiftJ(j, x0 - j.hip[0], dy);
      };
    }
    return (j) => j;
  }

  // where the held weight sits
  function implAnchor(j, spec) {
    if (spec.implement.at === 'hands') { const [ux, uy] = unit(j.elbow, j.wrist); return [j.wrist[0] + ux * 2.2, j.wrist[1] + uy * 2.2]; }
    const [ux, uy] = unit(j.hip, j.sh), ant = [-uy, ux];
    if (spec.implement.at === 'hips') return [j.hip[0] + ant[0] * 7.5 + ux * 2, j.hip[1] + ant[1] * 7.5 + uy * 2];
    // bar on the shoulders: racked in front when the hands are in front of the chest, else on the upper back
    const front = (j.wrist[0] - j.sh[0]) * ant[0] + (j.wrist[1] - j.sh[1]) * ant[1] > 2;
    const k = front ? 5.5 : -6;
    return [j.sh[0] + ant[0] * k, j.sh[1] + ant[1] * k];
  }

  function buildWorld(spec) {
    const keys = spec.frames.map(vec), n = keys.length;
    const ref = joints(keys[0]);
    const ground = grounder(spec, ref);
    const pose = (q) => ground(joints(q));
    // p in [0, 1): pose 0 → 1 → … → back to 0, resting briefly on each key pose
    const at = (p) => {
      const s = (((p % 1) + 1) % 1) * n, i = Math.min(n - 1, Math.floor(s));
      let t = Math.min(1, Math.max(0, (s - i - HOLD) / (1 - 2 * HOLD)));
      t = t * t * (3 - 2 * t);
      return { q: mix(keys[i], keys[(i + 1) % n], t), near: t < 0.5 ? i : (i + 1) % n };
    };
    const S = 72, samples = [];
    for (let i = 0; i < S; i++) samples.push(pose(at(i / S).q));
    const hasImpl = spec.implement.type !== 'none';
    // framing: everything that is drawn, on every sampled frame
    let lo = 1e9, hi = -1e9, top = 1e9;
    const grow = (p, r) => { lo = Math.min(lo, p[0] - r); hi = Math.max(hi, p[0] + r); top = Math.min(top, p[1] - r); };
    samples.forEach((j) => {
      for (const k in j) grow(j[k], k === 'head' ? 8 : 6);
      if (hasImpl) grow(implAnchor(j, spec), spec.implement.type === 'barbell' ? 11 : 8);
    });
    if (spec.cable) grow(spec.cable, 4);
    if (spec.bar) { const w = pose(keys[0]).wrist; grow([w[0] - 24, w[1]], 2); grow([w[0] + 24, w[1]], 2); }
    const dx = 80 - (lo + hi) / 2;
    // view box cropped to the whole movement (fixed aspect ratio, floor at the bottom) so the figure is as large as it can be
    const A = W / H, m = 5;
    let vx = lo + dx - m, vw = hi - lo + 2 * m, vh = FLOOR + 7 - Math.min(top - m, FLOOR - 70);
    if (vw / vh < A) { vx -= (vh * A - vw) / 2; vw = vh * A; } else vh = vw / A;
    const view = [vx, FLOOR + 7 - vh, vw, vh];
    const sh = (j) => shiftJ(j, dx, 0);
    const world = samples.map(sh);
    const keyPoses = keys.map((q) => sh(pose(q)));
    // the turnaround: the key pose furthest from the start, drawn faintly
    const dist = (a, b) => Object.keys(a).reduce((s, k) => s + Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]), 0);
    let ghost = 0;
    keyPoses.forEach((j, i) => { if (dist(j, keyPoses[0]) > dist(keyPoses[ghost], keyPoses[0])) ghost = i; });
    // the trail: the path of the weight when it moves (the "bar path"), else of the joint that travels most
    const pathOf = (f) => world.map(f);
    const lenOf = (pts) => pts.reduce((s, p, i) => s + Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]), 0);
    const cands = ['wrist', 'ankle', 'knee', 'hip', 'sh'].map((k) => ({ k, pts: pathOf((j) => j[k]) }));
    cands.forEach((c) => { c.len = lenOf(c.pts); });
    let best = cands.reduce((a, b) => (b.len > a.len ? b : a));
    if (hasImpl) {
      const c = { k: 'impl', pts: pathOf((j) => implAnchor(j, spec)) };
      c.len = lenOf(c.pts);
      if (c.len > 15) best = c;
    }
    const trailPoint = (j) => (best.k === 'impl' ? implAnchor(j, spec) : j[best.k]);
    return { at, pose: (q) => sh(pose(q)), keyPoses, ghost: ghost === 0 ? null : keyPoses[ghost], trail: best.len > 12 ? best.pts : null, trailPoint, dx, view };
  }

  /* ------------------------------------------------------------ scene */
  function makeScene(spec, world, regions) {
    const [vx, vy, vw] = world.view;
    const g = el('g');
    const layer = (cls) => { const l = el('g', cls ? { class: cls } : {}); g.appendChild(l); return l; };
    const bg = layer(), ghostL = layer('mm-ghosts'), trailL = layer();
    const layers = { far: layer(), torso: layer(), leg: layer(), hipm: layer(), arm: layer() };
    const fg = layer();
    const sx = (v) => v + world.dx;
    const f0 = world.keyPoses[0];

    // floor and its soft shadow
    bg.appendChild(el('line', { x1: vx, y1: FLOOR + 3, x2: vx + vw, y2: FLOOR + 3, class: 'mm-floor' }));
    const shadow = el('ellipse', { class: 'mm-shadow', cy: FLOOR + 3, ry: 2.4 });
    bg.appendChild(shadow);

    // bench: a padded top on two legs, right under where the body rests in the first pose
    if (spec.bench) {
      const rest = Math.max(...outline(seg(f0.hip, f0.sh, SHAPE.torso), 10).map((p) => p[1]));
      let x1, x2;
      if (spec.plant === 'feet') { x1 = f0.hip[0] - 11; x2 = f0.hip[0] + 9; }   // seated: under the hips
      else { x1 = Math.min(f0.head[0], f0.hip[0], f0.sh[0]) - 8; x2 = Math.max(f0.head[0], f0.hip[0], f0.sh[0]) + 8; }
      const y = Math.min(FLOOR - 8, Math.max(BENCH_TOP - 16, rest));
      bg.appendChild(el('rect', { x: x1 + 4, y: y + 3, width: 3, height: FLOOR + 3 - y - 3, class: 'mm-frame' }));
      bg.appendChild(el('rect', { x: x2 - 7, y: y + 3, width: 3, height: FLOOR + 3 - y - 3, class: 'mm-frame' }));
      bg.appendChild(el('rect', { x: x1, y, width: x2 - x1, height: 4, rx: 2, class: 'mm-pad' }));
    }
    // fixed bar: a pull-up bar runs across the body (seen end-on), dip bars run along it
    if (spec.bar) {
      const w = f0.wrist, across = spec.barDir ? spec.barDir === 'across' : f0.wrist[1] < f0.sh[1] - 4;
      if (across) {   // the bar end-on, on a bracket from the wall behind
        bg.appendChild(el('path', { d: 'M' + (w[0] - 2) + ' ' + (w[1] - 1) + ' L' + (w[0] - 14) + ' ' + (w[1] - 9) + ' L' + (w[0] - 14) + ' ' + vy, class: 'mm-frame-l', fill: 'none' }));
        fg.appendChild(el('circle', { cx: w[0], cy: w[1], r: 3, class: 'mm-barend' }));
      } else {
        bg.appendChild(el('line', { x1: w[0] - 24, y1: w[1] + 1, x2: w[0] + 24, y2: w[1] + 1, class: 'mm-frame-l', 'stroke-width': 3 }));
        [-20, 20].forEach((o) => bg.appendChild(el('line', { x1: w[0] + o, y1: w[1] + 2, x2: w[0] + o, y2: FLOOR + 3, class: 'mm-frame-l' })));
      }
    }
    spec.props.forEach((p) => {
      if (p.t === 'line') bg.appendChild(el('line', { x1: sx(p.x1), y1: p.y1, x2: sx(p.x2), y2: p.y2, class: 'mm-frame-l', 'stroke-width': p.w }));
      if (p.t === 'rect') bg.appendChild(el('rect', { x: sx(p.x), y: p.y, width: p.w, height: p.h, rx: 2, class: 'mm-pad' }));
      if (p.t === 'circle') bg.appendChild(el('circle', { cx: sx(p.x), cy: p.y, r: p.r, class: 'mm-pad' }));
    });
    let cable = null, handle = null;
    if (spec.cable) {
      const c = [sx(spec.cable[0]), spec.cable[1]];
      bg.appendChild(el('circle', { cx: c[0], cy: c[1], r: 3.6, class: 'mm-pulley' }));
      bg.appendChild(el('circle', { cx: c[0], cy: c[1], r: 1, class: 'mm-hub' }));
      cable = el('line', { x1: c[0], y1: c[1], class: 'mm-cable' });
      handle = el('line', { class: 'mm-handle' });
      layers.far.before(cable);
      fg.appendChild(handle);
    }

    // the turnaround position, faintly, and the path of the moving point
    if (world.ghost) makeBody({ far: ghostL, torso: ghostL, leg: ghostL, hipm: ghostL, arm: ghostL }, [], true).draw(world.ghost);
    let arrow = null;
    if (world.trail) {
      trailL.appendChild(el('polyline', { points: world.trail.concat([world.trail[0]]).map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), class: 'mm-trail' }));
      arrow = el('path', { d: 'M3.2 0 L-2 2.6 L-1 0 L-2 -2.6 Z', class: 'mm-arrow' });
      fg.appendChild(arrow);
    }

    const body = makeBody(layers, regions, false);

    // what is held
    let impl = null;
    const t = spec.implement.type;
    if (t === 'barbell') impl = el('g', {}, [el('circle', { r: 11, class: 'mm-plate' }), el('circle', { r: 7.4, class: 'mm-plate-in' }), el('circle', { r: 2.3, class: 'mm-hub' })]);
    else if (t === 'dumbbell') impl = el('g', {}, [el('rect', { x: -4.6, y: -4.6, width: 9.2, height: 9.2, rx: 3, class: 'mm-plate' }), el('circle', { r: 1.5, class: 'mm-hub' })]);
    else if (t === 'ball') impl = el('g', {}, [el('circle', { r: 9, class: 'mm-ball' }), el('path', { d: 'M-9 0 Q0 -5 9 0 M0 -9 Q4 0 0 9', class: 'mm-seam' })]);
    else if (t === 'kettlebell') impl = el('g', {}, [el('path', { d: 'M-3.2 -1 Q-3.6 -6 0 -6.2 Q3.6 -6 3.2 -1', class: 'mm-kbh' }), el('circle', { r: 6, cy: 4.6, class: 'mm-plate' })]);
    if (impl) fg.appendChild(impl);

    function draw(j, p) {
      body.draw(j);
      if (impl) {
        const a = implAnchor(j, spec);
        let rot = 0;
        if (t === 'kettlebell') { const [ux, uy] = unit(j.elbow, j.wrist); rot = Math.atan2(-ux, uy) * 57.2958; }
        impl.setAttribute('transform', 'translate(' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ') rotate(' + rot.toFixed(1) + ')');
      }
      if (cable) {
        const a = implAnchor(j, { implement: { at: 'hands' } });
        cable.setAttribute('x2', a[0].toFixed(2)); cable.setAttribute('y2', a[1].toFixed(2));
        const [ux, uy] = unit([+cable.getAttribute('x1'), +cable.getAttribute('y1')], a);
        handle.setAttribute('x1', (a[0] - uy * 3.4).toFixed(2)); handle.setAttribute('y1', (a[1] + ux * 3.4).toFixed(2));
        handle.setAttribute('x2', (a[0] + uy * 3.4).toFixed(2)); handle.setAttribute('y2', (a[1] - ux * 3.4).toFixed(2));
      }
      // shadow: under the body, darker the closer it is to the floor
      const xs = [j.hip[0], j.ankle[0], j.toe[0], j.sh[0]];
      const lowY = Math.max(j.hip[1], j.ankle[1], j.toe[1], j.knee[1], j.sh[1], j.wrist[1]);
      shadow.setAttribute('cx', ((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(2));
      shadow.setAttribute('rx', Math.max(12, (Math.max(...xs) - Math.min(...xs)) / 2 + 8).toFixed(2));
      shadow.style.opacity = Math.max(0.25, 1 - (FLOOR - lowY) / 60).toFixed(2);
      if (arrow) {
        // a small arrow just ahead on the path shows which way the movement is going
        const a = world.trailPoint(world.pose(world.at(p + 0.012).q)), b = world.trailPoint(world.pose(world.at(p + 0.03).q));
        const v = Math.hypot(b[0] - a[0], b[1] - a[1]);
        arrow.style.opacity = Math.min(1, v / 1.2).toFixed(2);
        arrow.setAttribute('transform', 'translate(' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ') rotate(' + (Math.atan2(b[1] - a[1], b[0] - a[0]) * 57.2958).toFixed(1) + ')');
      }
    }
    return { g, draw };
  }

  /* ------------------------------------------------------------ player */
  // drawn icons: the ⏸ character is missing from many fonts
  const ICON_PAUSE = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5 L10.5 6 L3 10.5 Z" fill="currentColor"/></svg>';
  function makePlayer(spec, host, ctl, regions) {
    const world = buildWorld(spec);
    const svg = el('svg', { viewBox: world.view.map((v) => v.toFixed(2)).join(' '), role: 'img', class: 'mm-svg', 'aria-label': T('Movement animation', 'Κινητική απεικόνιση') });
    const scene = makeScene(spec, world, regions);
    svg.appendChild(scene.g);
    host.appendChild(svg);
    const n = spec.frames.length;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = !reduce, phase = 0, last = performance.now(), raf = 0, speed = 1;
    function paint() {
      const f = world.at(phase);
      scene.draw(world.pose(f.q), phase);
      if (ctl.range && document.activeElement !== ctl.range) ctl.range.value = String(Math.round(phase * 1000));
      ctl.chips.forEach((c, i) => c.setAttribute('aria-pressed', String(i === f.near)));
    }
    function tick(now) {
      if (!svg.isConnected) return;
      if (playing) { phase = (phase + (now - last) / 1000 / spec.seconds * speed) % 1; paint(); }
      last = now;
      raf = requestAnimationFrame(tick);
    }
    function setPlaying(v) {
      playing = v;
      last = performance.now();
      ctl.play.innerHTML = v ? ICON_PAUSE : ICON_PLAY;
      ctl.play.setAttribute('aria-label', v ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'));
    }
    ctl.play.addEventListener('click', () => setPlaying(!playing));
    ctl.range.addEventListener('input', () => { setPlaying(false); phase = Number(ctl.range.value) / 1000; paint(); });
    ctl.slow.addEventListener('click', () => {
      speed = speed === 1 ? 0.5 : 1;
      ctl.slow.setAttribute('aria-pressed', String(speed !== 1));
    });
    ctl.chips.forEach((c, i) => c.addEventListener('click', () => { setPlaying(false); phase = i / n; paint(); }));
    setPlaying(playing);
    paint();
    raf = requestAnimationFrame(tick);
    return { destroy() { cancelAnimationFrame(raf); } };
  }

  /* ------------------------------------------------------------ prompt */
  function buildPrompt(ex) {
    const name = EL ? (ex.el || ex.en) : (ex.el || ex.en);
    const steps = (ex.steps || []).map((s, i) => (i + 1) + '. ' + s).join('\n');
    return `You animate gym exercises with a side-view human figure. Reply ONLY with a JSON object.

EXERCISE: ${name}${ex.en && ex.en !== name ? ' (' + ex.en + ')' : ''}
Equipment: ${ex.eq || 'unknown'}
Instructions:
${steps || '(none given, use standard technique)'}

THE FIGURE: seen from the side, facing RIGHT (+x). Canvas 160 wide x 140 tall, y grows downwards, the floor is y=124.
Bone lengths are fixed: torso 30, upper arm 17, forearm 15, thigh 24, shin 23, foot 9. You only choose ANGLES in degrees.
Every angle is the direction a segment points, measured from "straight down", turning toward the front (right):
 0 = down, 90 = forward/right (horizontal), 180 = up, -90 (or 270) = backward/left (horizontal).
Reference values:
 torso (hip -> shoulder): standing upright 180; leaning 45 deg forward 135; lying on your back with the head on the left -90; lying face down with the head on the right 90; plank/push-up body about 110.
 head (shoulder -> head): usually the same as the torso (it may tilt up to 30 deg).
 arm = [upper arm (shoulder -> elbow), forearm (elbow -> wrist)]: hanging down [0,0]; arms straight forward [90,90]; straight overhead [180,180]; elbow bent 90 deg with the upper arm down and forearm forward [0,90]; hands at the shoulders with elbows pointing down [0,160].
 leg = [thigh (hip -> knee), shin (knee -> ankle)]: standing [0,0]; sitting [90,0]; bottom of a squat [80,-15]; knee bent with the heel toward the glute (lying/standing leg curl) the shin goes backward, e.g. [0,-120].
 foot (ankle -> toe): flat on the floor 90; on the toes (calf raise top) about 45. The foot always points to the FRONT side of the shin: when the shin points up (legs raised while lying on the back) the foot is about -90.

JSON:
{"frames":[ {"label":"short caption (max 3 words, ${EL ? 'in Greek' : 'in English'})","hip":[x,y],"torso":0,"head":0,"arm":[0,0],"leg":[0,0],"foot":90}, ... ],
 "plant":"feet|hands|body|none",
 "bench":false,
 "bar":false,
 "barDir":"across|along",
 "implement":{"type":"barbell|dumbbell|kettlebell|ball|none","at":"hands|shoulders|hips"},
 "cable":null,
 "props":[],
 "seconds":3}

RULES
- 2 to 4 key poses that describe ONE repetition: the start position, the turnaround (the end of the range of motion) and, when it helps to understand the path, one in-between pose. The animation returns to the first pose by itself. The first pose is the start position.
- hip is [x,y] in canvas units (the figure is centred and grounded automatically, so approximate values like [80,80] are fine).
- Check every angle before you answer: the segment direction is (sin a, cos a) with +x to the right and +y DOWN. So a segment pointing down and to the LEFT has a negative angle (e.g. -69), while one pointing up and to the left is below -90 (e.g. -111). A leg stretched out behind a plank/push-up body is [-69,-69] while the torso is about 111.
- Joints: the knee only bends so that the shin goes BACKWARD relative to the thigh (shin angle = thigh angle minus 0 to 150); the elbow only bends so that the forearm goes FORWARD relative to the upper arm (forearm angle = upper arm angle plus 0 to 150).
- "plant" says what stays fixed: "feet" = standing/seated work, feet stay on the floor (squat, deadlift, curls, presses, lunges, seated machines); "hands" = hands stay in place (push-up, pull-up, dips, planks on hands); "body" = lying on the floor or on a bench: the back/hips rest on the surface and stay there (bench press, crunches, hip thrust, leg raises, lying leg curl); feet may rest on the floor; "none" = nothing is pinned.
- "bar": true when the hands hold a fixed bar (pull-up, chin-up, dip bars, hanging leg raise, inverted row). Use plant "hands" and make the first pose the hang/start position. "barDir": "across" for a bar that runs across the body from side to side (pull-up, chin-up, hanging, inverted row); "along" for parallel dip bars.
- "bench": true when the exercise is done lying or seated on a bench (the bench is drawn for you). Otherwise false.
- "implement": what is held. "at": "hands" for dumbbells, bars held in the hands, kettlebells; "shoulders" for a barbell on the back or racked on the front shoulders; "hips" for a bar resting on the hips.
- "cable": [x,y] of the pulley, only for cable exercises (a cable is drawn from the pulley to the hand), otherwise null.
- "props": optional extras (max 4), each {"t":"line","x1":0,"y1":0,"x2":0,"y2":0,"w":3} or {"t":"rect","x":0,"y":0,"w":10,"h":10} or {"t":"circle","x":0,"y":0,"r":5}. Use for a box or a machine pad. For almost every exercise leave props empty.
- Make the poses anatomically realistic and true to good technique: keep the back straight where the technique says so, keep the heels down in squats, the bar close to the body in deadlifts. Arms and legs move together unless the exercise is alternating (then you may add "arm2"/"leg2" for the far limb).
- Use the real range of motion of this exercise, so the difference between the poses is easy to see.
- seconds: 2 to 5, the duration of one repetition.`;
  }

  async function generate(ex, signal) {
    const sample = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null;
    if (!sample) throw new Error('unavailable');
    const raw = await sample.json(buildPrompt(ex), { signal });
    const spec = normalize(raw && (raw.motion || raw));
    if (!spec) throw new Error('invalid');
    return spec;
  }

  /* ------------------------------------------------------------ UI */
  const css = `
.motion{margin-top:6px;--mm-skin:#eadfd4;--mm-skin-far:#c9b9ab;--mm-edge:#5d4d42;--mm-p:#ef4a22;--mm-s:#f5a623;--mm-metal:#3f4650;--mm-ghost:#161a20}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .motion{--mm-skin:#d9c6b4;--mm-skin-far:#8f7e70;--mm-edge:#231c17;--mm-metal:#aab3bd;--mm-ghost:#ebe8e3}}
:root[data-theme="dark"] .motion{--mm-skin:#d9c6b4;--mm-skin-far:#8f7e70;--mm-edge:#231c17;--mm-metal:#aab3bd;--mm-ghost:#ebe8e3}
.motion h3{margin-top:22px}
.mm-box{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:8px 10px 10px}
.mm-svg{display:block;width:100%;max-height:300px;height:auto}
.mm-floor{stroke:var(--line);stroke-width:1.4}
.mm-shadow{fill:var(--mm-ghost);fill-opacity:.13}
.mm-skin{fill:var(--mm-skin);stroke:var(--mm-edge);stroke-width:.7;stroke-linejoin:round}
.mm-skin.mm-far{fill:var(--mm-skin-far)}
.mm-shoe{fill:var(--mm-edge)}
.mm-skin.mm-shoe.mm-far{fill:var(--mm-edge);opacity:.75}
.mm-eye{fill:var(--mm-edge)}
.mm-ear{fill:none;stroke:var(--mm-edge);stroke-width:.55}
.mm-ms{stroke:none}
.mm-ms-p{fill:var(--mm-p);fill-opacity:.92}
.mm-ms-s{fill:var(--mm-s);fill-opacity:.85}
.mm-ms.mm-far{fill-opacity:.55}
.mm-ghosts{opacity:.11}
.mm-ghost{fill:var(--mm-ghost);stroke:none}
.mm-trail{fill:none;stroke:var(--accent);stroke-width:1;stroke-dasharray:.4 2.2;stroke-linecap:round;opacity:.75}
.mm-arrow{fill:var(--accent);stroke:var(--surface);stroke-width:.7;stroke-linejoin:round}
.mm-pad{fill:var(--mm-metal);fill-opacity:.55;stroke:var(--mm-metal);stroke-width:.6}
.mm-frame{fill:var(--mm-metal);fill-opacity:.45}
.mm-frame-l{stroke:var(--mm-metal);stroke-width:1.8;stroke-linecap:round;opacity:.7}
.mm-barend{fill:var(--mm-metal);stroke:var(--surface-2);stroke-width:.6}
.mm-plate{fill:var(--mm-metal);fill-opacity:.22;stroke:var(--mm-metal);stroke-width:1.5}
.mm-plate-in{fill:none;stroke:var(--mm-metal);stroke-width:.7;opacity:.6}
.mm-hub{fill:var(--mm-metal)}
.mm-ball{fill:var(--mm-s);fill-opacity:.45;stroke:var(--mm-metal);stroke-width:1.2}
.mm-seam{fill:none;stroke:var(--mm-metal);stroke-width:.6;opacity:.7}
.mm-kbh{fill:none;stroke:var(--mm-metal);stroke-width:1.8}
.mm-pulley{fill:none;stroke:var(--mm-metal);stroke-width:1.4}
.mm-cable{stroke:var(--mm-metal);stroke-width:.8;stroke-dasharray:2 1.2}
.mm-handle{stroke:var(--mm-metal);stroke-width:1.6;stroke-linecap:round}
.mm-ctl{display:flex;align-items:center;gap:8px;margin-top:6px}
.mm-ctl .btn{padding:6px 10px;font-size:.8rem;flex:none}
.mm-ctl .btn[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.mm-ctl .mm-play{width:34px;justify-content:center;padding:6px 0}
.mm-range{flex:1;min-width:0;accent-color:var(--accent)}
.mm-poses{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.mm-pose{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:4px 10px;font-size:.8rem;font-weight:600}
.mm-pose b{font-variant-numeric:tabular-nums;color:var(--ink-2);margin-right:5px}
.mm-pose[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}
.mm-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;margin-top:8px}
.mm-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.78rem;color:var(--ink-2)}
.mm-legend span{display:inline-flex;align-items:center;gap:6px}
.mm-legend i{width:10px;height:10px;border-radius:50%;display:inline-block}
.mm-acts{display:flex;gap:6px}
.mm-acts .btn{padding:5px 9px;font-size:.78rem}
.mm-hint{margin:0 0 8px;font-size:.86rem;color:var(--ink-2)}
.mm-err{margin:8px 0 0;font-size:.84rem;color:var(--danger,#b3261e)}
.mm-note{margin:6px 0 0;font-size:.76rem;color:var(--ink-2)}
.mm-gen{display:inline-flex;align-items:center;gap:8px}
.mm-gen .pulse{width:8px;height:8px}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const players = new Map();
  function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = text; b.addEventListener('click', fn); return b; }
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  function mount(host, ex) {
    const wrap = h('div', 'motion');
    wrap.appendChild(h('h3', '', T('Movement', 'Κίνηση')));
    const body = h('div'); wrap.appendChild(body);
    let busy = null;
    const regions = muscleRegions(ex);

    function view() {
      players.get(wrap)?.destroy(); players.delete(wrap);
      body.replaceChildren();
      const spec = normalize(store[ex.id]);
      if (spec) {
        const box = h('div', 'mm-box');
        const stage = h('div'); box.appendChild(stage);
        // play/pause, scrubber through one repetition, slow motion
        const ctlRow = h('div', 'mm-ctl');
        const play = btn('', 'mm-play', () => {});
        const range = document.createElement('input');
        Object.assign(range, { type: 'range', min: 0, max: 999, value: 0, className: 'mm-range' });
        range.setAttribute('aria-label', T('Position in the repetition', 'Σημείο της επανάληψης'));
        const slow = btn(T('Slow', 'Αργά'), '', () => {});
        slow.setAttribute('aria-pressed', 'false');
        slow.title = T('Half speed', 'Μισή ταχύτητα');
        ctlRow.append(play, range, slow);
        box.appendChild(ctlRow);
        // the key poses: the current one is highlighted, a click shows it
        const poses = h('div', 'mm-poses');
        const chips = spec.frames.map((f, i) => {
          const c = h('button', 'mm-pose'); c.type = 'button';
          c.append(h('b', '', String(i + 1)), document.createTextNode(f.label || T('Pose', 'Θέση') + ' ' + (i + 1)));
          c.setAttribute('aria-pressed', 'false');
          poses.appendChild(c);
          return c;
        });
        box.appendChild(poses);
        const foot = h('div', 'mm-foot');
        const legend = h('div', 'mm-legend');
        if (regions.some((x) => x.role === 'p')) { const s = h('span'); const i = h('i'); i.style.background = 'var(--mm-p)'; s.append(i, T('Main muscles', 'Κύριοι μύες')); legend.appendChild(s); }
        if (regions.some((x) => x.role === 's')) { const s = h('span'); const i = h('i'); i.style.background = 'var(--mm-s)'; s.append(i, T('Assisting', 'Βοηθητικοί')); legend.appendChild(s); }
        const acts = h('div', 'mm-acts');
        acts.append(btn(T('Regenerate', 'Νέα απεικόνιση'), '', () => run()), btn(T('Remove', 'Διαγραφή'), '', () => { delete store[ex.id]; save(); view(); }));
        foot.append(legend, acts);
        box.appendChild(foot);
        body.appendChild(box);
        players.set(wrap, makePlayer(spec, stage, { play, range, slow, chips }, regions));
        body.appendChild(h('p', 'mm-note', T('Drawn by Claude from key poses; the dotted line is the path of the moving point and the faint outline is the end position. Check the instructions for the exact technique.',
          'Σχεδιάστηκε από το Claude με βάση βασικές θέσεις· η διακεκομμένη γραμμή είναι η διαδρομή του σημείου που κινείται και το αχνό περίγραμμα η τελική θέση. Για την ακριβή τεχνική δες τις οδηγίες.')));
      } else {
        body.appendChild(h('p', 'mm-hint', T('Generate a short looping animation of this movement.', 'Δημιούργησε μια σύντομη κινούμενη απεικόνιση αυτής της κίνησης.')));
        body.appendChild(btn(T('✨ Generate animation', '✨ Δημιουργία animation'), 'primary', () => run()));
      }
    }
    async function run() {
      if (busy) return;
      busy = new AbortController();
      players.get(wrap)?.destroy(); players.delete(wrap);
      body.replaceChildren();
      const th = h('div', 'thinking');
      th.append(h('span', 'pulse'), h('span', '', T('Claude is drawing the movement…', 'Το Claude σχεδιάζει την κίνηση…')));
      body.appendChild(th);
      try {
        const spec = await generate(ex, busy.signal);
        store[ex.id] = spec; save();
        busy = null; view();
      } catch (e) {
        busy = null; view();
        const er = h('p', 'mm-err', e && e.message === 'unavailable'
          ? T('Claude is not available on this page.', 'Το Claude δεν είναι διαθέσιμο σε αυτή τη σελίδα.')
          : T('Could not generate the animation. Try again.', 'Δεν δημιουργήθηκε το animation. Δοκίμασε ξανά.'));
        er.setAttribute('role', 'alert');
        body.appendChild(er);
      }
    }
    view();
    host.after(wrap);
  }

  function scan() {
    const panel = document.getElementById('panel');
    if (!panel) return;
    const m = window.__mxProgram;
    if (!m || !m.exById) return;
    panel.querySelectorAll('[data-exid]').forEach((node) => {
      if (node.dataset.mmDone) return;
      const ex = m.exById(node.dataset.exid);
      if (!ex) return;
      node.dataset.mmDone = '1';
      const steps = node.querySelector('.steps');
      const anchor = steps || node.querySelector('.mchips:last-of-type') || node.firstElementChild;
      if (!anchor) return;
      const holder = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('motion') ? null : anchor;
      if (holder) mount(holder, ex);
    });
  }
  let queued = false;
  const queue = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; try { scan(); } catch (e) { /* ignore */ } }); };
  function start() {
    const panel = document.getElementById('panel');
    if (!panel || !window.MutationObserver) return;
    new MutationObserver(queue).observe(panel, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.__mxMotion = { normalize, buildWorld, buildPrompt, muscleRegions, store: () => store };
})();
