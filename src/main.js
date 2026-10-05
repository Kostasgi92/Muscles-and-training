// Μυϊκός Χάρτης — ελεγκτής εφαρμογής: αναζήτηση, καρτέλες, πρόγραμμα, σύνδεση με τη σκηνή.
import { MUSCLES, DEPTH_LABEL } from './data/muscles.js';
import { EXERCISES, PROGRAM } from './data/exercises.js';
import { SearchIndex, CONFIDENT } from './search.js';
import { getSample, analyzeExercise, moreExercises, ERROR_TEXT, HIDE_CODES } from './claude.js';
import { Viewer } from './viewer.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* χωρίς αποθήκευση */ } },
};

const PRIMARY = '#ff3b12';
const SECONDARY = '#ffb01f';

// ------------------------------------------------------------------ δεδομένα
const exById = new Map(EXERCISES.map((e) => [e.id, e]));
let custom = store.get('mx.custom', []).filter((e) => e && e.id && Array.isArray(e.p));
for (const e of custom) { e.ai = true; exById.set(e.id, e); }
let userProgram = store.get('mx.program', []).filter((x) => typeof x === 'string');

const index = new SearchIndex();
const indexExercise = (e) => index.add({ type: 'exercise', id: e.id, title: e.el, sub: e.en, aliases: [e.el, e.en, ...(e.aka ?? [])], ref: e });
EXERCISES.forEach(indexExercise);
custom.forEach(indexExercise);
for (const [id, m] of Object.entries(MUSCLES)) {
  index.add({ type: 'muscle', id, title: m.el, sub: m.common, aliases: [m.el, m.common, m.la, ...(m.aka ?? []), ...Object.values(m.parts ?? {})], ref: m });
}

function addCustom(ex) {
  exById.set(ex.id, ex);
  custom = [ex, ...custom.filter((c) => c.id !== ex.id)].slice(0, 80);
  store.set('mx.custom', custom);
  indexExercise(ex);
}

const unitOf = (id) => id.split('.')[0];
function label(id) {
  const [u, p] = id.split('.');
  const m = MUSCLES[u];
  if (!m) return { main: id, sub: '' };
  return p ? { main: m.parts?.[p] ?? p, sub: m.el } : { main: m.el, sub: m.common !== m.el ? m.common : '' };
}

function exercisesFor(unit) {
  const out = [];
  for (const ex of exById.values()) {
    const pr = ex.p.filter((id) => unitOf(id) === unit);
    const se = ex.s.filter((id) => unitOf(id) === unit);
    if (pr.length) out.push({ ex, role: 'p', ids: pr });
    else if (se.length) out.push({ ex, role: 's', ids: se });
  }
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === 'p' ? -1 : 1) || (a.ex.ai ? 1 : 0) - (b.ex.ai ? 1 : 0));
}

function resolveExercise(text) {
  const r = index.search(text, 4).filter((x) => x.type === 'exercise');
  return r[0] && r[0].score >= CONFIDENT ? r[0].ref : null;
}

// ------------------------------------------------------------------ σκηνή
let viewer = null;
let modelReady = false;
const state = { mode: null, ex: null, unit: null, ctl: null, claudeOff: false, level: 0 };

function highlightForExercise(ex) {
  const vals = new Map();
  if (!viewer) return vals;
  const put = (ids, v, color) => {
    for (const m of viewer.meshesFor(ids)) {
      const cur = vals.get(m.userData.id);
      if (!cur || cur.v < v) vals.set(m.userData.id, { v, color });
    }
  };
  put(ex.s, 0.62, SECONDARY);
  put(ex.p, 1, PRIMARY);
  return vals;
}

async function initViewer() {
  const stage = $('#stage');
  const loader = $('#loader');
  try {
    viewer = new Viewer(stage, { onHover, onPick, onInteract: hideTip });
    window.__mx = { viewer, state };
  } catch (e) {
    loader.innerHTML = '<p class="msg">Ο browser δεν υποστηρίζει WebGL, οπότε το τρισδιάστατο μοντέλο δεν μπορεί να εμφανιστεί. Η αναζήτηση και οι οδηγίες λειτουργούν κανονικά.</p>';
    return;
  }
  const bytes = Number($('#app').dataset.anatomyBytes) || 0;
  try {
    await viewer.load('anatomy.txt', bytes, (p) => {
      $('#loadPct').textContent = `${Math.round(p * 100)}%`;
      $('#loadBar').style.width = `${p * 100}%`;
    });
  } catch (e) {
    loader.innerHTML = `<p class="msg">Το ανατομικό μοντέλο δεν φορτώθηκε (${esc(e.message ?? e)}). Ανανέωσε τη σελίδα για να ξαναδοκιμάσεις.</p>`;
    return;
  }
  loader.hidden = true;
  modelReady = true;
  // η καρτέλα μυός χρειάζεται το βάθος του μυός από το μοντέλο
  if (state.mode === 'muscle') showMuscle(state.unit, { frame: true, side: state.side });
  else applyModelState(true);
}

function applyModelState(frame) {
  if (!viewer || !modelReady) return;
  if (state.mode === 'exercise') {
    viewer.setSelected(null);
    viewer.setHighlight(highlightForExercise(state.ex));
    if (frame) viewer.frameMeshes(viewer.meshesFor(state.ex.p));
  } else if (state.mode === 'muscle') {
    const vals = new Map();
    for (const m of viewer.meshesFor([state.unit])) vals.set(m.userData.id, { v: 1, color: PRIMARY });
    viewer.setHighlight(vals);
    viewer.setSelected(state.unit);
    if (frame) viewer.focusUnit(state.unit, state.side);
  } else if (state.mode === 'program') {
    viewer.setSelected(null);
    viewer.setHighlight(programHighlight().vals);
    if (frame) viewer.setView('three');
  } else {
    viewer.setSelected(null);
    viewer.setHighlight(new Map());
  }
  renderLegend();
}

function renderLegend() {
  const el = $('#legend');
  if (state.mode === 'exercise') {
    el.innerHTML = '<span><i class="dot p"></i>Κύριοι μύες</span><span><i class="dot s"></i>Βοηθητικοί</span><button type="button" class="clear" data-clear>Φυσικά χρώματα</button>';
    el.hidden = false;
  } else if (state.mode === 'program') {
    el.innerHTML = '<span>Φόρτος προγράμματος</span><span><small>λίγος</small><i class="ramp"></i><small>πολύς</small></span><button type="button" class="clear" data-clear>Φυσικά χρώματα</button>';
    el.hidden = false;
  } else if (state.mode === 'muscle') {
    el.innerHTML = '<button type="button" class="clear" data-clear>Φυσικά χρώματα</button>';
    el.hidden = false;
  } else el.hidden = true;
  el.querySelector('[data-clear]')?.addEventListener('click', clearHighlight);
}

function clearHighlight() {
  if (!viewer) return;
  viewer.setSelected(null);
  viewer.setHighlight(new Map());
  $('#legend').hidden = true;
}

// ------------------------------------------------------------------ tooltip & επιλογή στο μοντέλο
const tip = () => $('#tip');
function hideTip() { tip().hidden = true; }
function onHover(hit, ev) {
  const t = tip();
  if (!hit || !ev) { t.hidden = true; $('#stage').style.cursor = ''; return; }
  const d = hit.data;
  let html;
  if (d.kind === 'muscle') {
    const m = MUSCLES[d.unit];
    const part = m?.parts?.[d.part];
    html = part && part !== m.el ? `<b>${esc(part)}</b>${esc(m.el)}` : `<b>${esc(m?.el ?? d.unit)}</b>${esc(m?.common ?? '')}`;
  } else if (d.kind === 'connective') html = `<b>${esc(d.name)}</b>Συνδετικός ιστός`;
  else if (d.kind === 'eye') html = `<b>${esc(d.name)}</b>`;
  else html = `<b>${esc(d.name)}</b>Οστό`;
  t.innerHTML = html;
  const r = $('#stage').getBoundingClientRect();
  t.style.left = `${Math.min(ev.clientX - r.left, r.width - 200)}px`;
  t.style.top = `${Math.min(ev.clientY - r.top, r.height - 60)}px`;
  t.hidden = false;
  $('#stage').style.cursor = d.kind === 'muscle' ? 'pointer' : '';
}

function onPick(hit) {
  hideTip();
  if (hit?.data.kind === 'muscle') {
    showMuscle(hit.data.unit, { side: hit.side, frame: false, part: hit.data.part });
  } else if (!hit) {
    clearHighlight();
  }
}

// ------------------------------------------------------------------ καρτέλες
const panel = () => $('#panel');

function mchip(id, role) {
  const l = label(id);
  return `<button type="button" class="mchip ${role}" data-unit="${esc(unitOf(id))}">${esc(l.main)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ''}</button>`;
}
const list = (arr, cls = 'notes') => (arr?.length ? `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const steps = (arr) => (arr?.length ? `<ol class="steps">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '');

function inProgram(ex) {
  return [...PROGRAM, ...userProgram].some((t) => resolveExercise(t)?.id === ex.id);
}

function showExercise(ex, { frame = true } = {}) {
  cancelClaude();
  state.mode = 'exercise';
  state.ex = ex;
  state.unit = null;
  const tags = [ex.eq ? `<span class="tag">${esc(ex.eq)}</span>` : '', ex.ai ? '<span class="tag ai">Ανάλυση από Claude</span>' : ''].join('');
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>Άσκηση</span>${tags}</div>
      <h2>${esc(ex.el)}</h2>
      ${ex.en && ex.en !== ex.el ? `<p class="sub">${esc(ex.en)}</p>` : ''}
      <h3>Κύριοι μύες</h3>
      <div class="mchips">${ex.p.map((id) => mchip(id, 'p')).join('')}</div>
      ${ex.s.length ? `<h3>Βοηθητικοί μύες</h3><div class="mchips">${ex.s.map((id) => mchip(id, 's')).join('')}</div>` : ''}
      ${ex.steps?.length ? `<h3>Πώς γίνεται</h3>${steps(ex.steps)}` : ''}
      <div class="two">
        ${ex.tips?.length ? `<div><h3>Συμβουλές</h3>${list(ex.tips)}</div>` : ''}
        ${ex.errs?.length ? `<div><h3>Συχνά λάθη</h3>${list(ex.errs, 'notes bad')}</div>` : ''}
      </div>
      <div class="actions">
        ${inProgram(ex) ? '' : '<button type="button" class="btn" data-act="add">＋ Στο πρόγραμμά μου</button>'}
        <button type="button" class="btn ghost" data-act="program">Όλο το πρόγραμμα στο σώμα</button>
      </div>
      ${ex.ai ? '<p class="disclaimer">Η ανάλυση έγινε από το Claude και μπορεί να έχει ανακρίβειες.</p>' : ''}
    </article>`;
  bindMuscleChips(panel());
  panel().querySelector('[data-act="add"]')?.addEventListener('click', () => { addToProgram(ex); showExercise(ex, { frame: false }); });
  panel().querySelector('[data-act="program"]').addEventListener('click', () => showProgram());
  panel().scrollTop = 0;
  markChips();
  applyModelState(frame);
}

function bindMuscleChips(root) {
  root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => showMuscle(b.dataset.unit, { frame: true })));
}

function showMuscle(unit, { side, frame = true, part, extra } = {}) {
  const m = MUSCLES[unit];
  if (!m) return;
  cancelClaude();
  state.mode = 'muscle';
  state.unit = unit;
  state.side = side;
  state.ex = null;
  const depth = viewer && modelReady ? viewer.unitDepth(unit) : 0;
  const rows = exercisesFor(unit);
  const parts = Object.entries(m.parts ?? {});
  const exItem = ({ ex, role, ids }) => {
    const partNote = ids.some((i) => i.includes('.')) ? ` · ${ids.map((i) => label(i).main).join(', ')}` : '';
    return `<li><details>
      <summary><span class="nm">${esc(ex.el)}</span><span class="role ${role}">${role === 'p' ? 'Κύριος' : 'Βοηθητικός'}</span><span class="eqx">${esc(ex.eq || ex.en || '')}${esc(partNote)}${ex.ai ? ' · Claude' : ''}</span></summary>
      <div class="exbody">${steps(ex.steps)}${ex.tips?.length ? `<h3>Συμβουλή</h3>${list(ex.tips.slice(0, 2))}` : ''}
        <div class="actions"><button type="button" class="btn primary" data-ex="${esc(ex.id)}">Δείξε στο σώμα</button></div>
      </div></details></li>`;
  };
  const extraHtml = extra?.length ? `<h3>Νέες ιδέες από το Claude</h3><ul class="exlist">${extra.map((ex) => exItem({ ex, role: ex.p.some((i) => unitOf(i) === unit) ? 'p' : 's', ids: [] })).join('')}</ul>` : '';
  const prim = rows.filter((r) => r.role === 'p');
  const sec = rows.filter((r) => r.role === 's');
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>Μυς · ${esc(m.region)}</span><span class="tag">${DEPTH_LABEL[Math.min(depth, 2)]}</span></div>
      <h2>${esc(m.el)}</h2>
      <p class="latin">${esc(m.la)}</p>
      ${m.common && m.common !== m.el ? `<p class="sub">Στο γυμναστήριο: «${esc(m.common)}»</p>` : ''}
      <p class="fn">${esc(m.fn)}</p>
      ${depth > state.level ? `<div class="deep-note"><span>Βρίσκεται κάτω από άλλους μύες· στο σώμα φαίνεται σαν λάμψη.</span><button type="button" class="btn" data-level="${depth}">Αφαίρεσε τις πάνω στρώσεις</button></div>` : ''}
      ${parts.length > 1 ? `<h3>Τμήματα</h3><div class="parts">${parts.map(([k, v]) => `<button type="button" class="part${part === k ? ' on' : ''}" data-part="${esc(unit)}.${esc(k)}">${esc(v)}</button>`).join('')}</div>` : ''}
      ${extraHtml}
      ${prim.length ? `<h3>Ασκήσεις όπου είναι κύριος μυς (${prim.length})</h3><ul class="exlist">${prim.map(exItem).join('')}</ul>` : ''}
      ${sec.length ? `<h3>Συμμετέχει επίσης σε (${sec.length})</h3><ul class="exlist">${sec.map(exItem).join('')}</ul>` : ''}
      ${!rows.length && !extra?.length ? '<p class="msg">Δεν υπάρχουν ασκήσεις με βάρη για αυτόν τον μυ στη βάση.</p>' : ''}
      <div class="actions" id="aiRow"></div>
    </article>`;
  const root = panel();
  root.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => showExercise(exById.get(b.dataset.ex), { frame: true })));
  root.querySelector('[data-level]')?.addEventListener('click', (e) => setLevel(Number(e.currentTarget.dataset.level)));
  root.querySelectorAll('[data-part]').forEach((b) => {
    const mesh = () => viewer?.byId.get(b.dataset.part);
    b.addEventListener('mouseenter', () => viewer?.setHover(mesh() ?? null));
    b.addEventListener('mouseleave', () => viewer?.setHover(null));
    b.addEventListener('focus', () => viewer?.setHover(mesh() ?? null));
    b.addEventListener('blur', () => viewer?.setHover(null));
    b.addEventListener('click', () => { const ms = mesh(); if (ms) viewer.frameMeshes([ms], { close: true }); });
  });
  root.scrollTop = 0;
  markChips();
  applyModelState(frame);
  offerMoreIdeas(unit, rows);
}

async function offerMoreIdeas(unit, rows) {
  const sample = await getSample();
  const row = $('#aiRow');
  if (!sample || state.claudeOff || !row || state.unit !== unit) return;
  row.innerHTML = '<button type="button" class="btn ghost" id="moreBtn">Περισσότερες ασκήσεις από το Claude</button>';
  $('#moreBtn').addEventListener('click', async () => {
    const ctl = new AbortController();
    state.ctl = ctl;
    row.innerHTML = '<div class="thinking"><i class="pulse"></i><span>Το Claude ψάχνει ασκήσεις…</span><button type="button" class="btn" id="stopBtn">Διακοπή</button></div>';
    $('#stopBtn').addEventListener('click', () => ctl.abort());
    try {
      const found = await moreExercises(unit, rows.map((r) => r.ex.el), { signal: ctl.signal });
      found.forEach(addCustom);
      if (state.unit === unit) showMuscle(unit, { frame: false, extra: found });
    } catch (e) {
      if (HIDE_CODES.has(e?.code)) state.claudeOff = true;
      if (state.unit !== unit) return;
      row.innerHTML = e?.code === 'cancelled' ? '' : `<p class="msg">${esc(ERROR_TEXT[e?.code] ?? 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')}</p>`;
      if (e?.code === 'cancelled') offerMoreIdeas(unit, rows);
    } finally {
      if (state.ctl === ctl) state.ctl = null;
    }
  });
}

// ------------------------------------------------------------------ πρόγραμμα
const MAJOR = ['chest', 'deltoid', 'lats', 'trapezius', 'rhomboids', 'rotator_cuff', 'biceps', 'triceps', 'forearm_flex', 'rectus_abd', 'ext_oblique', 'transversus', 'erectors', 'glute_max', 'glute_med', 'quads', 'hamstrings', 'adductors', 'calves', 'tib_ant'];

function programExercises() {
  const seen = new Set();
  const out = [];
  for (const t of [...PROGRAM, ...userProgram]) {
    const ex = resolveExercise(t);
    if (ex && !seen.has(ex.id)) { seen.add(ex.id); out.push(ex); }
  }
  return out;
}

function programHighlight() {
  const exs = programExercises();
  const meshScore = new Map();
  const unitScore = new Map();
  for (const ex of exs) {
    const unitRole = new Map();
    for (const [ids, w] of [[ex.s, 0.5], [ex.p, 1]]) {
      for (const id of ids) unitRole.set(unitOf(id), Math.max(unitRole.get(unitOf(id)) ?? 0, w));
      if (viewer && modelReady) for (const m of viewer.meshesFor(ids)) meshScore.set(m.userData.id, (meshScore.get(m.userData.id) ?? 0) + w);
    }
    for (const [u, w] of unitRole) unitScore.set(u, (unitScore.get(u) ?? 0) + w);
  }
  const max = Math.max(1, ...meshScore.values());
  const vals = new Map();
  const a = hexToRgb(SECONDARY), b = hexToRgb(PRIMARY);
  for (const [id, sc] of meshScore) {
    const k = Math.min(1, sc / max);
    const c = a.map((x, i) => Math.round(x + (b[i] - x) * k));
    vals.set(id, { v: 0.55 + 0.45 * k, color: `rgb(${c.join(',')})` });
  }
  return { vals, unitScore, exs };
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function showProgram() {
  cancelClaude();
  state.mode = 'program';
  state.ex = null;
  state.unit = null;
  const { unitScore, exs } = programHighlight();
  const rows = [...unitScore.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...unitScore.values());
  const gaps = MAJOR.filter((u) => !unitScore.has(u));
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>Το πρόγραμμά σου</span><span class="tag">${exs.length} ασκήσεις</span></div>
      <h2>Ποιους μύες δουλεύει όλο το πρόγραμμα</h2>
      <p class="sub">Κύρια συμμετοχή = 1 πόντος, βοηθητική = ½. Όσο πιο κόκκινο στο σώμα, τόσο περισσότερη δουλειά.</p>
      <h3>Φόρτος ανά μυ</h3>
      <div class="load-rows">${rows.map(([u, sc]) => `<button type="button" class="load-row" data-unit="${esc(u)}"><span>${esc(MUSCLES[u]?.el ?? u)}</span><span class="meter"><i style="width:${(sc / max) * 100}%"></i></span><span class="n">${sc % 1 ? sc.toFixed(1) : sc}</span></button>`).join('')}</div>
      ${gaps.length ? `<h3>Μεγάλες μυϊκές ομάδες που λείπουν</h3><div class="mchips">${gaps.map((u) => `<button type="button" class="mchip s" data-unit="${esc(u)}">${esc(MUSCLES[u].common || MUSCLES[u].el)}</button>`).join('')}</div><p class="sub">Πάτα μια ομάδα για να δεις ασκήσεις που τη δουλεύουν.</p>` : '<p class="msg">Το πρόγραμμα καλύπτει όλες τις μεγάλες μυϊκές ομάδες.</p>'}
      <h3>Ασκήσεις</h3>
      <div class="mchips">${exs.map((ex) => `<button type="button" class="chip" data-ex="${esc(ex.id)}">${esc(ex.el)}</button>`).join('')}</div>
    </article>`;
  bindMuscleChips(panel());
  panel().querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => showExercise(exById.get(b.dataset.ex))));
  panel().scrollTop = 0;
  markChips();
  applyModelState(true);
}

function addToProgram(ex) {
  if (inProgram(ex)) return;
  userProgram = [...userProgram, ex.el];
  store.set('mx.program', userProgram);
  renderChips();
}

function renderChips() {
  const box = $('#chips');
  const items = [
    '<button type="button" class="chip all" data-all="1">Όλο το πρόγραμμα</button>',
    ...PROGRAM.map((t) => `<button type="button" class="chip" data-q="${esc(t)}">${esc(t)}</button>`),
    ...userProgram.map((t, i) => `<span class="chip" role="group"><button type="button" class="chip-txt" data-q="${esc(t)}" style="all:unset;cursor:pointer">${esc(t)}</button><button type="button" class="x" data-rm="${i}" aria-label="Αφαίρεση ${esc(t)}">×</button></span>`),
  ];
  box.innerHTML = items.join('');
  box.querySelector('[data-all]').addEventListener('click', showProgram);
  box.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { $('#exInput').value = b.dataset.q; run(b.dataset.q); }));
  box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    userProgram = userProgram.filter((_, i) => i !== Number(b.dataset.rm));
    store.set('mx.program', userProgram);
    renderChips();
  }));
  markChips();
}

function markChips() {
  document.querySelectorAll('#chips [data-q]').forEach((b) => {
    const on = state.mode === 'exercise' && resolveExercise(b.dataset.q)?.id === state.ex?.id;
    (b.classList.contains('chip-txt') ? b.parentElement : b).setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#chips [data-all]')?.setAttribute('aria-pressed', state.mode === 'program' ? 'true' : 'false');
}

// ------------------------------------------------------------------ αναζήτηση
function cancelClaude() {
  if (state.ctl) { state.ctl.abort(); state.ctl = null; }
}

async function run(query) {
  const q = query.trim();
  closeSuggest();
  if (!q) return;
  const results = index.search(q, 8);
  const best = results[0];
  if (best && best.score >= CONFIDENT) { open(best); return; }
  await askClaude(q, results);
}

function open(item) {
  if (item.type === 'exercise') showExercise(item.ref, { frame: true });
  else showMuscle(item.id, { frame: true });
}

async function askClaude(q, results) {
  const sample = state.claudeOff ? null : await getSample();
  if (!sample) { renderNotFound(q, results); return; }
  cancelClaude();
  const ctl = new AbortController();
  state.ctl = ctl;
  state.mode = 'thinking';
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>Νέα άσκηση</span><span class="tag ai">Claude</span></div>
      <h2>${esc(q)}</h2>
      <p class="sub">Δεν υπάρχει στη βάση, οπότε τη ρωτάω στο Claude.</p>
      <div class="thinking"><i class="pulse"></i><span>Αναλύω ποιους μύες δουλεύει…</span><button type="button" class="btn" id="stopBtn">Διακοπή</button></div>
      <div class="stream" id="stream"></div>
    </article>`;
  $('#stopBtn').addEventListener('click', () => ctl.abort());
  try {
    const r = await analyzeExercise(q, { signal: ctl.signal, onText: ({ text }) => { const s = $('#stream'); if (s) s.textContent = text; } });
    if (state.ctl !== ctl) return;
    state.ctl = null;
    if (!r.recognized) { renderNotFound(q, results, 'Το Claude δεν το αναγνώρισε ως σωματική άσκηση.'); return; }
    addCustom(r.exercise);
    showExercise(r.exercise, { frame: true });
  } catch (e) {
    if (state.ctl === ctl) state.ctl = null;
    if (HIDE_CODES.has(e?.code)) state.claudeOff = true;
    if (e?.code === 'cancelled') { renderNotFound(q, results); return; }
    renderNotFound(q, results, ERROR_TEXT[e?.code] ?? 'Δεν ήταν δυνατή η ανάλυση αυτή τη στιγμή.');
  }
}

function renderNotFound(q, results, message) {
  state.mode = 'none';
  state.ex = null;
  state.unit = null;
  const sugg = results.slice(0, 6);
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>Αναζήτηση</span></div>
      <h2>Δεν βρέθηκε «${esc(q)}»</h2>
      ${message ? `<p class="msg">${esc(message)}</p>` : '<p class="sub">Δοκίμασε πιο απλή περιγραφή, ελληνικά ή αγγλικά (π.χ. «κωπηλατική», «lat pulldown»), ή πάτα έναν μυ στο σώμα.</p>'}
      ${sugg.length ? `<h3>Μήπως εννοείς</h3><div class="mchips">${sugg.map((r, i) => `<button type="button" class="mchip s" data-i="${i}">${esc(r.title)} <small>${r.type === 'muscle' ? 'μυς' : 'άσκηση'}</small></button>`).join('')}</div>` : ''}
    </article>`;
  panel().querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => open(sugg[Number(b.dataset.i)])));
  markChips();
  applyModelState(false);
}

// προτάσεις κατά την πληκτρολόγηση
let suggestions = [];
let active = -1;
function renderSuggest() {
  const ul = $('#suggest');
  const input = $('#exInput');
  if (!suggestions.length) { closeSuggest(); return; }
  ul.innerHTML = suggestions.map((r, i) => `<li role="option" id="sg${i}" aria-selected="${i === active}" data-i="${i}"><span class="kind">${r.type === 'muscle' ? 'Μυς' : 'Άσκηση'}</span><span class="nm">${esc(r.title)}</span><span class="sub">${esc(r.sub || '')}</span></li>`).join('');
  ul.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', active >= 0 ? `sg${active}` : '');
  ul.querySelectorAll('li').forEach((li) => li.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const it = suggestions[Number(li.dataset.i)];
    input.value = it.title;
    closeSuggest();
    open(it);
  }));
}
function closeSuggest() {
  $('#suggest').hidden = true;
  $('#exInput').setAttribute('aria-expanded', 'false');
  suggestions = [];
  active = -1;
}

function bindSearch() {
  const input = $('#exInput');
  input.addEventListener('input', () => {
    suggestions = input.value.trim().length >= 2 ? index.search(input.value, 7) : [];
    active = -1;
    renderSuggest();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); active = (active + 1) % suggestions.length; renderSuggest(); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); active = (active - 1 + suggestions.length) % suggestions.length; renderSuggest(); }
    else if (e.key === 'Escape') closeSuggest();
    else if (e.key === 'Enter' && active >= 0 && suggestions[active]) {
      e.preventDefault();
      const it = suggestions[active];
      input.value = it.title;
      closeSuggest();
      open(it);
    }
  });
  input.addEventListener('blur', () => setTimeout(closeSuggest, 120));
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
}

// ------------------------------------------------------------------ χειριστήρια σκηνής
function setLevel(L) {
  state.level = L;
  document.querySelectorAll('#layerSeg [data-level]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === L)));
  viewer?.setLevel(L);
  if (state.mode === 'muscle') {
    const note = panel().querySelector('.deep-note');
    if (note && viewer && viewer.unitDepth(state.unit) <= L) note.remove();
  }
}

function bindControls() {
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewer?.setView(b.dataset.view)));
  document.querySelectorAll('#layerSeg [data-level]').forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.level))));
}

// ------------------------------------------------------------------ εκκίνηση
function start() {
  renderChips();
  bindSearch();
  bindControls();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && exById.has(hash)) showExercise(exById.get(hash), { frame: true });
  else if (hash && MUSCLES[hash]) showMuscle(hash, { frame: true });
  else {
    const first = resolveExercise(PROGRAM[0]) ?? EXERCISES[0];
    $('#exInput').value = PROGRAM[0];
    showExercise(first, { frame: false });
  }
  initViewer();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
