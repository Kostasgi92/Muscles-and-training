/* Movement animation: Claude designs a few key poses for a simple side-view figure (joint angles),
   this file renders and animates them. Saved per exercise in this browser (localStorage "mx.motion"). */
(() => {
  'use strict';
  const EL = window.__mxLang === 'el';
  const T = (en, el) => (EL ? el : en);
  const KEY = 'mx.motion';
  const W = 160, H = 140, FLOOR = 124, BENCH_TOP = 110;
  const LEN = { torso: 30, head: 14, upper: 17, fore: 15, thigh: 24, shin: 23, foot: 9 };
  const NS = 'http://www.w3.org/2000/svg';

  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

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
      return o;
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
  const D = (a) => { const r = (a * Math.PI) / 180; return [Math.sin(r), Math.cos(r)]; };
  const add = (p, a, l) => { const d = D(a); return [p[0] + d[0] * l, p[1] + d[1] * l]; };
  function joints(f) {
    const hip = f.hip.slice();
    const sh = add(hip, f.torso, LEN.torso);
    const head = add(sh, f.head, LEN.head);
    const limb = (a, b, c, l1, l2) => { const m = add(a, b[0], l1); return [m, add(m, b[1], l2)]; };
    const [elbow, wrist] = limb(sh, f.arm, 0, LEN.upper, LEN.fore);
    const [elbow2, wrist2] = limb(sh, f.arm2 || f.arm, 0, LEN.upper, LEN.fore);
    const [knee, ankle] = limb(hip, f.leg, 0, LEN.thigh, LEN.shin);
    const [knee2, ankle2] = limb(hip, f.leg2 || f.leg, 0, LEN.thigh, LEN.shin);
    return {
      hip, sh, head, elbow, wrist, elbow2, wrist2, knee, ankle, knee2, ankle2,
      toe: add(ankle, f.foot, LEN.foot), toe2: add(ankle2, f.leg2 ? f.foot : f.foot, LEN.foot),
    };
  }
  const shift = (j, dx, dy) => { const o = {}; for (const k in j) o[k] = [j[k][0] + dx, j[k][1] + dy]; return o; };

  /* world = joints for each keyframe, grounded according to `plant`, then centred */
  function buildWorld(spec) {
    const surface = spec.bench ? BENCH_TOP : FLOOR;
    const raw = spec.frames.map(joints);
    const ref = raw[0];
    const out = raw.map((j, i) => {
      if (spec.plant === 'feet') {
        const bottom = Math.max(j.ankle[1] + 2, j.toe[1], j.ankle2[1] + 2, j.toe2[1]);
        return shift(j, ref.ankle[0] - j.ankle[0], surface - bottom);
      }
      if (spec.plant === 'hands') {
        const b0 = Math.max(ref.wrist[1] + 3, ref.wrist2[1] + 3, ref.toe[1] + 2, ref.ankle[1] + 3, ref.knee[1] + 3, ref.hip[1] + 3, ref.head[1] + 7);
        const dy0 = spec.bar ? Math.min(0, FLOOR - b0) : FLOOR - Math.max(ref.wrist[1] + 3, ref.toe[1] + 2, ref.ankle[1] + 3);
        const dyc = Math.min(dy0, FLOOR - b0);
        return shift(j, ref.wrist[0] - j.wrist[0], ref.wrist[1] - j.wrist[1] + dyc);
      }
      if (spec.plant === 'body') {
        const torsoBottom = Math.max(j.head[1] + 7, j.sh[1] + 4, j.hip[1] + 4);
        let dy = surface - torsoBottom;
        const limbBottom = Math.max(j.knee[1] + 3, j.ankle[1] + 3, j.toe[1] + 2, j.knee2[1] + 3, j.ankle2[1] + 3);
        if (limbBottom + dy > FLOOR) dy = FLOOR - limbBottom;
        return shift(j, ref.hip[0] - j.hip[0], dy);
      }
      return j;
    });
    // centre horizontally over every frame
    let lo = 1e9, hi = -1e9;
    out.forEach((j) => { for (const k in j) { lo = Math.min(lo, j[k][0]); hi = Math.max(hi, j[k][0]); } });
    const cx = (lo + hi) / 2, dx = 80 - cx;
    const scale = Math.min(1, 140 / Math.max(1, hi - lo + 24));
    return { frames: out.map((j) => shift(j, dx, 0)), dx, scale, surface };
  }

  function lerpJ(a, b, t) {
    const o = {};
    for (const k in a) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
    return o;
  }
  const ease = (t) => t * t * (3 - 2 * t);

  /* ------------------------------------------------------------ drawing */
  const el = (n, a, kids) => {
    const e = document.createElementNS(NS, n);
    for (const k in a || {}) e.setAttribute(k, a[k]);
    (kids || []).forEach((c) => e.appendChild(c));
    return e;
  };
  const poly = (pts, w, cls) => el('polyline', { points: pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), 'stroke-width': w, class: cls, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

  function makeFigure(spec, world) {
    const g = el('g', { transform: 'translate(' + (80 - 80 * world.scale) + ' ' + (world.surface - world.surface * world.scale) + ') scale(' + world.scale + ')' });
    const pg = el('g'); const body = el('g');
    g.appendChild(pg); g.appendChild(body);
    const sx = (v) => v + world.dx;
    // static props + ground
    pg.appendChild(el('line', { x1: -40, y1: FLOOR + 2, x2: 200, y2: FLOOR + 2, class: 'mm-floor', 'stroke-width': 2 }));
    if (spec.bench) {
      const f0 = world.frames[0];
      const bx1 = Math.min(f0.head[0], f0.hip[0], f0.sh[0]) - 8, bx2 = Math.max(f0.head[0], f0.hip[0], f0.sh[0]) + 8;
      pg.appendChild(el('rect', { x: bx1, y: BENCH_TOP, width: bx2 - bx1, height: FLOOR - BENCH_TOP + 2, rx: 3, class: 'mm-prop' }));
    }
    if (spec.bar) {
      const w0 = world.frames[0].wrist;
      pg.appendChild(el('line', { x1: w0[0] - 22, y1: w0[1], x2: w0[0] + 22, y2: w0[1], class: 'mm-prop-l', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }
    spec.props.forEach((p) => {
      if (p.t === 'line') pg.appendChild(el('line', { x1: sx(p.x1), y1: p.y1, x2: sx(p.x2), y2: p.y2, class: 'mm-prop-l', 'stroke-width': p.w, 'stroke-linecap': 'round' }));
      if (p.t === 'rect') pg.appendChild(el('rect', { x: sx(p.x), y: p.y, width: p.w, height: p.h, rx: 2, class: 'mm-prop' }));
      if (p.t === 'circle') pg.appendChild(el('circle', { cx: sx(p.x), cy: p.y, r: p.r, class: 'mm-prop' }));
    });
    const cable = spec.cable ? el('line', { class: 'mm-cable', 'stroke-width': 1.6 }) : null;
    if (cable) { cable.setAttribute('x1', sx(spec.cable[0])); cable.setAttribute('y1', spec.cable[1]); pg.appendChild(cable); }

    const farArm = poly([[0, 0], [0, 0], [0, 0]], 4.5, 'mm-far');
    const farLeg = poly([[0, 0], [0, 0], [0, 0], [0, 0]], 5.5, 'mm-far');
    const torso = poly([[0, 0], [0, 0]], 8, 'mm-near');
    const leg = poly([[0, 0], [0, 0], [0, 0], [0, 0]], 5.5, 'mm-near');
    const arm = poly([[0, 0], [0, 0], [0, 0]], 4.5, 'mm-near');
    const head = el('circle', { r: 7, class: 'mm-head' });
    let impl = null;
    if (spec.implement.type === 'barbell') impl = el('g', {}, [el('circle', { r: 10, class: 'mm-weight' }), el('circle', { r: 2.2, class: 'mm-hub' })]);
    else if (spec.implement.type === 'dumbbell') impl = el('circle', { r: 4.5, class: 'mm-weight' });
    else if (spec.implement.type === 'ball') impl = el('circle', { r: 10, class: 'mm-weight' });
    else if (spec.implement.type === 'kettlebell') impl = el('g', {}, [el('circle', { r: 6.5, class: 'mm-weight', cy: 3 }), el('path', { d: 'M-4 -1 q4 -9 8 0', class: 'mm-kbh', fill: 'none', 'stroke-width': 2 })]);
    [farArm, farLeg, torso, leg, arm, head].forEach((n) => body.appendChild(n));
    if (impl) body.appendChild(impl);

    function draw(j) {
      const P = (p) => p;
      farArm.setAttribute('points', [j.sh, j.elbow2, j.wrist2].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      farLeg.setAttribute('points', [j.hip, j.knee2, j.ankle2, j.toe2].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      torso.setAttribute('points', [j.hip, j.sh].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      leg.setAttribute('points', [j.hip, j.knee, j.ankle, j.toe].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      arm.setAttribute('points', [j.sh, j.elbow, j.wrist].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      head.setAttribute('cx', j.head[0].toFixed(1)); head.setAttribute('cy', j.head[1].toFixed(1));
      if (impl) {
        const at = spec.implement.at === 'shoulders' ? j.sh : spec.implement.at === 'hips' ? j.hip : j.wrist;
        impl.setAttribute('transform', 'translate(' + at[0].toFixed(1) + ' ' + at[1].toFixed(1) + ')');
        if (impl.tagName === 'circle') { impl.setAttribute('cx', 0); impl.setAttribute('cy', 0); }
      }
      if (cable) { cable.setAttribute('x2', j.wrist[0].toFixed(1)); cable.setAttribute('y2', j.wrist[1].toFixed(1)); }
      void P;
    }
    return { g, draw };
  }

  /* ------------------------------------------------------------ player */
  function makePlayer(spec, host, captionEl, playBtn) {
    const world = buildWorld(spec);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'mm-svg', 'aria-label': T('Movement animation', 'Κινητική απεικόνιση') });
    const fig = makeFigure(spec, world);
    svg.appendChild(fig.g);
    host.appendChild(svg);
    const n = world.frames.length;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = !reduce, t0 = performance.now(), phase = 0, raf = 0;
    const labels = spec.frames.map((f) => f.label);
    function frameAt(p) { // p in [0,1): frame0 -> frame1 ... -> frame0
      const seg = ((p % 1) + 1) % 1 * n; const i = Math.min(n - 1, Math.floor(seg)); const k = ease(seg - Math.floor(seg));
      return { j: lerpJ(world.frames[i], world.frames[(i + 1) % n], k), near: k < 0.5 ? i : (i + 1) % n };
    }
    function paint() {
      const f = frameAt(phase);
      fig.draw(f.j);
      if (captionEl) captionEl.textContent = labels[f.near] || '';
    }
    function tick(now) {
      if (!svg.isConnected) return;
      if (playing) { phase = ((((performance.now() - t0) / 1000 / spec.seconds) % 1) + 1) % 1; paint(); }
      raf = requestAnimationFrame(tick);
    }
    function setPlaying(v) {
      playing = v;
      t0 = performance.now() - phase * spec.seconds * 1000;
      if (playBtn) { playBtn.textContent = v ? '⏸' : '▶'; playBtn.setAttribute('aria-label', v ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή')); }
    }
    playBtn && playBtn.addEventListener('click', () => setPlaying(!playing));
    setPlaying(playing);
    paint();
    raf = requestAnimationFrame(tick);
    return { destroy() { cancelAnimationFrame(raf); } };
  }

  /* ------------------------------------------------------------ prompt */
  function buildPrompt(ex) {
    const name = EL ? (ex.el || ex.en) : (ex.el || ex.en);
    const steps = (ex.steps || []).map((s, i) => (i + 1) + '. ' + s).join('\n');
    return `You animate gym exercises with a simple side-view stick figure. Reply ONLY with a JSON object.

EXERCISE: ${name}${ex.en && ex.en !== name ? ' (' + ex.en + ')' : ''}
Equipment: ${ex.eq || 'unknown'}
Instructions:
${steps || '(none given, use standard technique)'}

THE FIGURE: seen from the side, facing RIGHT (+x). Canvas 160 wide x 140 tall, y grows downwards, the floor is y=124.
Bone lengths are fixed: torso 30, upper arm 17, forearm 15, thigh 24, shin 23. You only choose ANGLES in degrees.
Every angle is the direction a segment points, measured from "straight down", turning toward the front (right):
 0 = down, 90 = forward/right (horizontal), 180 = up, -90 (or 270) = backward/left (horizontal).
Reference values:
 torso (hip -> shoulder): standing upright 180; leaning 45 deg forward 135; lying on your back with the head on the left -90; plank/push-up body about 110.
 head (shoulder -> head): usually the same as the torso.
 arm = [upper arm (shoulder -> elbow), forearm (elbow -> wrist)]: hanging down [0,0]; arms straight forward [90,90]; straight overhead [180,180]; elbow bent 90 deg with the upper arm down and forearm forward [0,90]; hands at the shoulders with elbows pointing down [0,170].
 leg = [thigh (hip -> knee), shin (knee -> ankle)]: standing [0,0]; sitting [90,0]; bottom of a squat [80,-15]; knee bent with the heel toward the glute (lying/standing leg curl) shin goes backward, e.g. [0,-120].
 foot (ankle -> toe): flat on the floor 90.

JSON:
{"frames":[ {"label":"short caption (max 3 words, ${EL ? 'in Greek' : 'in English'})","hip":[x,y],"torso":0,"head":0,"arm":[0,0],"leg":[0,0],"foot":90}, ... ],
 "plant":"feet|hands|body|none",
 "bench":false,
 "bar":false,
 "implement":{"type":"barbell|dumbbell|kettlebell|ball|none","at":"hands|shoulders|hips"},
 "cable":null,
 "props":[],
 "seconds":3}

RULES
- 2 to 4 key poses that describe ONE repetition: start position, the main positions, and the animation returns to the first pose by itself. The first pose is the start position.
- hip is [x,y] in canvas units (the figure is centred and grounded automatically, so approximate values like [80,80] are fine).
- Check every angle before you answer: the segment direction is (sin a, cos a) with +x to the right and +y DOWN. So a segment pointing down and to the LEFT has a negative angle (e.g. -69), while one pointing up and to the left is below -90 (e.g. -111). A leg stretched out behind a plank/push-up body is [-69,-69] while the torso is about 111.
- "plant" says what stays fixed: "feet" = standing/seated work, feet stay on the floor (squat, deadlift, curls, presses, lunges); "hands" = hands stay in place (push-up, pull-up, dips, planks on hands); "body" = lying on the floor or on a bench: the back/hips rest on the surface and stay there (bench press, crunches, hip thrust, leg raises); feet may rest on the floor; "none" = nothing is pinned.
- "bar": true when the hands hold a fixed horizontal bar (pull-up, chin-up, dip bars, hanging leg raise, inverted row). The bar is drawn through the hands at the first pose, so use plant "hands" and make the first pose the hang/start position with the arms where they should be.
- "bench": true when the exercise is done lying or seated on a bench (the bench is drawn for you). Otherwise false.
- "implement": what is held. "at": "hands" for dumbbells, bars held in front, kettlebells; "shoulders" for a barbell on the back or racked on the front shoulders; "hips" for a bar resting on the hips.
- "cable": [x,y] of the pulley, only for cable exercises (a line is drawn from the pulley to the hand), otherwise null.
- "props": optional extras (max 4), each {"t":"line","x1":0,"y1":0,"x2":0,"y2":0,"w":3} or {"t":"rect","x":0,"y":0,"w":10,"h":10} or {"t":"circle","x":0,"y":0,"r":5}. Use for a pull-up bar or a box. With plant "hands" on a bar the bar must be at the wrist height of the first pose. For almost every exercise leave props empty.
- Make the poses anatomically realistic: joints that cannot bend that way do not. Keep the torso straight where the technique says so. Arms and legs move together unless the exercise is alternating (then you may add "arm2"/"leg2" for the far limb).
- Make the largest differences between poses visible: use the real range of motion of this exercise.
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
.motion{margin-top:6px}
.motion h3{margin-top:22px}
.mm-box{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:10px 10px 8px}
.mm-svg{display:block;width:100%;max-height:230px;height:auto}
.mm-floor{stroke:var(--line)}
.mm-prop{fill:var(--line);stroke:var(--ink-2);stroke-width:1}
.mm-prop-l{stroke:var(--ink-2)}
.mm-cable{stroke:var(--ink-2);stroke-dasharray:3 2}
.mm-near{stroke:var(--ink)}
.mm-far{stroke:var(--ink-2);opacity:.45}
.mm-head{fill:var(--ink)}
.mm-weight{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2.2}
.mm-hub{fill:var(--accent)}
.mm-kbh{stroke:var(--accent)}
.mm-bar{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.mm-cap{flex:1;min-width:0;font-weight:600;font-size:.88rem}
.mm-bar .btn{padding:6px 10px;font-size:.8rem}
.mm-hint{margin:0 0 8px;font-size:.86rem;color:var(--ink-2)}
.mm-err{margin:8px 0 0;font-size:.84rem;color:var(--danger,#b3261e)}
.mm-note{margin:6px 0 0;font-size:.76rem;color:var(--ink-2)}
.mm-gen{display:inline-flex;align-items:center;gap:8px}
.mm-gen .pulse{width:8px;height:8px}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const players = new Map();
  function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = text; b.addEventListener('click', fn); return b; }

  function mount(host, ex) {
    const wrap = document.createElement('div'); wrap.className = 'motion';
    const h3 = document.createElement('h3'); h3.textContent = T('Movement', 'Κίνηση');
    wrap.appendChild(h3);
    const body = document.createElement('div'); wrap.appendChild(body);
    let busy = null;

    function view() {
      players.get(wrap)?.destroy(); players.delete(wrap);
      body.replaceChildren();
      const spec = normalize(store[ex.id]);
      if (spec) {
        const box = document.createElement('div'); box.className = 'mm-box';
        const stage = document.createElement('div'); box.appendChild(stage);
        const bar = document.createElement('div'); bar.className = 'mm-bar';
        const play = btn('⏸', '', () => {});
        const cap = document.createElement('span'); cap.className = 'mm-cap';
        const regen = btn(T('Regenerate', 'Νέα απεικόνιση'), '', () => run());
        const del = btn(T('Remove', 'Διαγραφή'), '', () => { delete store[ex.id]; save(); view(); });
        bar.append(play, cap, regen, del); box.appendChild(bar); body.appendChild(box);
        players.set(wrap, makePlayer(spec, stage, cap, play));
        const note = document.createElement('p'); note.className = 'mm-note';
        note.textContent = T('Drawn by Claude as a simplified figure; check the instructions for the exact technique.', 'Σχεδιάστηκε από το Claude ως απλοποιημένη φιγούρα· για την ακριβή τεχνική δες τις οδηγίες.');
        body.appendChild(note);
      } else {
        const p = document.createElement('p'); p.className = 'mm-hint';
        p.textContent = T('Generate a short looping animation of this movement.', 'Δημιούργησε μια σύντομη κινούμενη απεικόνιση αυτής της κίνησης.');
        body.appendChild(p);
        body.appendChild(btn(T('✨ Generate animation', '✨ Δημιουργία animation'), 'primary', () => run()));
      }
    }
    async function run() {
      if (busy) return;
      busy = new AbortController();
      players.get(wrap)?.destroy(); players.delete(wrap);
      body.replaceChildren();
      const th = document.createElement('div'); th.className = 'thinking';
      const pu = document.createElement('span'); pu.className = 'pulse';
      const tx = document.createElement('span'); tx.textContent = T('Claude is drawing the movement…', 'Το Claude σχεδιάζει την κίνηση…');
      th.append(pu, tx); body.appendChild(th);
      try {
        const spec = await generate(ex, busy.signal);
        store[ex.id] = spec; save();
        busy = null; view();
      } catch (e) {
        busy = null; view();
        const er = document.createElement('p'); er.className = 'mm-err'; er.setAttribute('role', 'alert');
        er.textContent = e && e.message === 'unavailable'
          ? T('Claude is not available on this page.', 'Το Claude δεν είναι διαθέσιμο σε αυτή τη σελίδα.')
          : T('Could not generate the animation. Try again.', 'Δεν δημιουργήθηκε το animation. Δοκίμασε ξανά.');
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
  window.__mxMotion = { normalize, buildWorld, buildPrompt, store: () => store };
})();
