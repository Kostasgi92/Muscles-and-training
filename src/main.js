// Μυϊκός Χάρτης — ελεγκτής εφαρμογής: αναζήτηση, καρτέλες, πρόγραμμα, αξιολόγηση, σύνδεση με τη σκηνή.
import { __G, T } from './lang.js';
import { MUSCLES, DEPTH_LABEL } from './data/muscles.js';
import { EXERCISES } from './data/exercises.js';
import './data/lang-apply.js';
import { SearchIndex, CONFIDENT } from './search.js';
import { getSample, analyzeExercise, moreExercises, coachReview, ERROR_TEXT, HIDE_CODES } from './claude.js';
import { Viewer } from './viewer.js';
import { RULES, SCORED, BANDS, analyze, suggest, summaryText, verdict, bandForScore, fmt as nf } from './review.js';
import { TEMPLATES, PACKS } from './templates.js';

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
for (const e of custom) { e.ai = true; exById.set(e.id, e); window.__mxCustom && window.__mxCustom(e); }
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
  resolveCache.clear();
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
// τα ονόματα των αποθηκευμένων προγραμμάτων ψάχνονται σε κάθε σχεδίαση της αξιολόγησης
const resolveCache = new Map();
function resolveName(name) {
  if (!resolveCache.has(name)) resolveCache.set(name, resolveExercise(name));
  return resolveCache.get(name);
}

// ------------------------------------------------------------------ σκηνή
let viewer = null;
let modelReady = false;
const state = { mode: null, ex: null, unit: null, ctl: null, claudeOff: false, level: 0 };

// ιστορικό καρτελών για τη γραμμή «Πίσω» (addons/programs.js)
const navStack = [];
let navRestoring = false;
function navSnapshot() {
  const m = state.mode;
  return m === 'exercise' && state.ex ? { m, k: state.ex.id, sc: panel().scrollTop }
    : m === 'muscle' && state.unit ? { m, k: state.unit, side: state.side, sc: panel().scrollTop }
      : m === 'program' || m === 'review' ? { m, k: '', sc: panel().scrollTop } : null;
}
function navPush(key) {
  if (navRestoring) return;
  const s = navSnapshot();
  if (!s || `${s.m}:${s.k}` === key) return;
  navStack.push(s);
  if (navStack.length > 30) navStack.shift();
}
function navBack() {
  while (navStack.length) {
    const s = navStack.pop();
    navRestoring = true;
    try {
      if (s.m === 'exercise') {
        const e = exById.get(s.k);
        if (!e) continue;
        showExercise(e, { frame: true });
      } else if (s.m === 'muscle') {
        if (!MUSCLES[s.k]) continue;
        showMuscle(s.k, { frame: true, side: s.side });
      } else if (s.m === 'review') showReview();
      else showProgram();
      panel().scrollTop = s.sc || 0;
      return;
    } finally {
      navRestoring = false;
    }
  }
}
function navLabel() {
  const s = navStack[navStack.length - 1];
  if (!s) return '';
  if (s.m === 'muscle') return __G('Πίσω στον μυ «') + (MUSCLES[s.k]?.el ?? '') + '»';
  if (s.m === 'exercise') return __G('Πίσω στην άσκηση «') + (exById.get(s.k)?.el ?? '') + '»';
  if (s.m === 'review') return T('Back to the review', 'Πίσω στην αξιολόγηση');
  return __G('Πίσω στο πρόγραμμα');
}

// σύνδεση με τα addons (προγράμματα, κίνηση): window.__mxProgram
window.__mxProgram = {
  exById: (id) => exById.get(id) || null,
  get: () => userProgram.slice(),
  navDepth: () => navStack.length,
  navLabel,
  back: navBack,
  set(list) {
    userProgram = list.filter((e) => typeof e === 'string' && e.trim());
    store.set('mx.program', userProgram);
    renderChips();
  },
  show: () => showProgram(),
  empty() {
    navStack.length = 0;
    cancelClaude();
    state.mode = 'none';
    state.ex = null;
    state.unit = null;
    panel().innerHTML = '<article><div class="eyebrow"><span>' + __G('Αρχική') + '</span></div><h2>' + __G('Διάλεξε τι θες να δεις') + '</h2><p class="sub">' + __G('Γράψε μια άσκηση στην αναζήτηση, πάτα έναν μυ στο σώμα, ή άνοιξε «Προγράμματα» και διάλεξε ένα πρόγραμμά σου.') + '</p>'
      + `<div class="actions"><button type="button" class="btn" data-act="review">${T('Review my programs', 'Αξιολόγηση των προγραμμάτων μου')}</button></div></article>`;
    panel().querySelector('[data-act="review"]').addEventListener('click', () => showReview());
    markChips();
    applyModelState(false);
    renderChips();
  },
  find: (t) => { try { return resolveExercise(t); } catch { return null; } },
  // αξιολόγηση
  mode: () => state.mode,
  review: () => showReview(),
  leaveReview,
  onPrograms,
  flush: flushAll,
};

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
    loader.innerHTML = '<p class="msg">' + __G('Ο browser δεν υποστηρίζει WebGL, οπότε το τρισδιάστατο μοντέλο δεν μπορεί να εμφανιστεί. Η αναζήτηση και οι οδηγίες λειτουργούν κανονικά.') + '</p>';
    return;
  }
  const bytes = Number($('#app').dataset.anatomyBytes) || 0;
  try {
    await viewer.load('anatomy.txt', bytes, (p) => {
      $('#loadPct').textContent = `${Math.round(p * 100)}%`;
      $('#loadBar').style.width = `${p * 100}%`;
    });
  } catch (e) {
    loader.innerHTML = `<p class="msg">${__G('Το ανατομικό μοντέλο δεν φορτώθηκε (')}${esc(e.message ?? e)}${__G('). Ανανέωσε τη σελίδα για να ξαναδοκιμάσεις.')}</p>`;
    return;
  }
  loader.hidden = true;
  modelReady = true;
  for (const m of SCORED) for (const mesh of viewer.meshesFor(m.ids)) meshToScored.set(mesh.userData.id, m.id);
  // η καρτέλα μυός χρειάζεται το βάθος του μυός από το μοντέλο
  if (state.mode === 'muscle') showMuscle(state.unit, { frame: true, side: state.side });
  else applyModelState(true);
}

function applyModelState(frame) {
  if (!viewer || !modelReady) return;
  viewer.hoverGroup = state.mode === 'review' ? reviewHoverGroup : null;
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
  } else if (state.mode === 'review') {
    viewer.setHighlight(reviewHighlight(lastResult), { xray: false });
    viewer.setSelectedIds(rv.muscle ? scoredMeshIds(rv.muscle) : []);
    if (frame) viewer.setView('front');
  } else {
    viewer.setSelected(null);
    viewer.setHighlight(new Map());
  }
  renderLegend();
}

function renderLegend() {
  const el = $('#legend');
  el.classList.toggle('rv-legend', state.mode === 'review');
  if (state.mode === 'exercise') {
    el.innerHTML = '<span><i class="dot p"></i>' + __G('Κύριοι μύες') + '</span><span><i class="dot s"></i>' + __G('Βοηθητικοί') + '</span><button type="button" class="clear" data-clear>' + __G('Φυσικά χρώματα') + '</button>';
    el.hidden = false;
  } else if (state.mode === 'program') {
    el.innerHTML = '<span>' + __G('Φόρτος προγράμματος') + '</span><span><small>' + __G('λίγος') + '</small><i class="ramp"></i><small>' + __G('πολύς') + '</small></span><button type="button" class="clear" data-clear>' + __G('Φυσικά χρώματα') + '</button>';
    el.hidden = false;
  } else if (state.mode === 'review') {
    const short = {
      top: T('Excellent 9–10', 'Άριστα 9–10'), good: T('Good 7–9', 'Καλά 7–9'), mid: T('Fair 4–7', 'Μέτρια 4–7'),
      low: T('Poor, below 4', 'Ελλιπώς <4'), excess: T('Too much, over 25 sets', 'Υπερβολικά >25 σετ'), none: T('Not trained', 'Καθόλου'),
    };
    el.innerHTML = `<span class="lg-title">${T('How well it is trained', 'Πόσο καλά δουλεύει')}</span>${Object.keys(short).map((b) => `<span><i class="dot" style="background:${BANDS[b].color}"></i>${short[b]}</span>`).join('')}<button type="button" class="clear" data-clear>${__G('Φυσικά χρώματα')}</button>`;
    el.hidden = false;
  } else if (state.mode === 'muscle') {
    el.innerHTML = '<button type="button" class="clear" data-clear>' + __G('Φυσικά χρώματα') + '</button>';
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
  const scored = state.mode === 'review' && lastResult ? lastResult.byId[meshToScored.get(d.id)] : null;
  if (scored) {
    html = `<b>${esc(scored.name)}</b>${nf(scored.score)}/10 · ${T(`${nf(scored.V)} sets/week · ${scored.hits}×/week`, `${nf(scored.V)} σετ/εβδ. · ${scored.hits}×/εβδ.`)}`;
  } else if (d.kind === 'muscle') {
    const m = MUSCLES[d.unit];
    const part = m?.parts?.[d.part];
    html = part && part !== m.el ? `<b>${esc(part)}</b>${esc(m.el)}` : `<b>${esc(m?.el ?? d.unit)}</b>${esc(m?.common ?? '')}`;
  } else if (d.kind === 'connective') html = `<b>${esc(d.name)}</b>${__G('Συνδετικός ιστός')}`;
  else if (d.kind === 'eye') html = `<b>${esc(d.name)}</b>`;
  else html = `<b>${esc(d.name)}</b>${__G('Οστό')}`;
  t.innerHTML = html;
  const r = $('#stage').getBoundingClientRect();
  t.style.left = `${Math.min(ev.clientX - r.left, r.width - 200)}px`;
  t.style.top = `${Math.min(ev.clientY - r.top, r.height - 60)}px`;
  t.hidden = false;
  $('#stage').style.cursor = d.kind === 'muscle' ? 'pointer' : '';
}

function onPick(hit) {
  hideTip();
  if (state.mode === 'review') {
    // στην αξιολόγηση ένα κλικ στο σώμα ανοίγει τον μυ στη λίστα «Μύες»
    const sid = hit ? meshToScored.get(hit.data.id) : null;
    rv.muscle = sid ?? null;
    if (sid) rv.tab = 'muscles';
    renderReview({ scrollTo: sid ? `[data-m="${sid}"]` : null });
    viewer.setSelectedIds(sid ? scoredMeshIds(sid) : []);
    return;
  }
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
  return userProgram.some((t) => resolveExercise(t)?.id === ex.id);
}

function showExercise(ex, { frame = true } = {}) {
  navPush('exercise:' + ex.id);
  cancelClaude();
  state.mode = 'exercise';
  state.ex = ex;
  state.unit = null;
  window.__mxSel && window.__mxSel('exercise', ex.el);
  const tags = [ex.eq ? `<span class="tag">${esc(ex.eq)}</span>` : '', ex.ai ? '<span class="tag ai">' + __G('Ανάλυση από Claude') + '</span>' : ''].join('');
  panel().innerHTML = `
    <article data-exid="${esc(ex.id)}">
      <div class="eyebrow"><span>${__G('Άσκηση')}</span>${tags}</div>
      <h2>${esc(ex.el)}</h2>
      ${ex.en && ex.en !== ex.el ? `<p class="sub">${esc(ex.en)}</p>` : ''}
      <h3>${__G('Κύριοι μύες')}</h3>
      <div class="mchips">${ex.p.map((id) => mchip(id, 'p')).join('')}</div>
      ${ex.s.length ? `<h3>${__G('Βοηθητικοί μύες')}</h3><div class="mchips">${ex.s.map((id) => mchip(id, 's')).join('')}</div>` : ''}
      ${ex.steps?.length ? `<h3>${__G('Πώς γίνεται')}</h3>${steps(ex.steps)}` : ''}
      <div class="two">
        ${ex.tips?.length ? `<div><h3>${__G('Συμβουλές')}</h3>${list(ex.tips)}</div>` : ''}
        ${ex.errs?.length ? `<div><h3>${__G('Συχνά λάθη')}</h3>${list(ex.errs, 'notes bad')}</div>` : ''}
      </div>
      <div class="actions">
        ${inProgram(ex) ? '' : '<button type="button" class="btn" data-act="add">' + __G('＋ Στο πρόγραμμά μου') + '</button>'}
        <button type="button" class="btn ghost" data-act="program">${__G('Όλο το πρόγραμμα στο σώμα')}</button>
      </div>
      ${ex.ai ? '<p class="disclaimer">' + __G('Η ανάλυση έγινε από το Claude και μπορεί να έχει ανακρίβειες.') + '</p>' : ''}
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
  navPush('muscle:' + unit);
  cancelClaude();
  state.mode = 'muscle';
  state.unit = unit;
  state.side = side;
  state.ex = null;
  window.__mxSel && window.__mxSel('muscle', unit);
  const depth = viewer && modelReady ? viewer.unitDepth(unit) : 0;
  const rows = exercisesFor(unit);
  const parts = Object.entries(m.parts ?? {});
  const exItem = ({ ex, role, ids }) => {
    const partNote = ids.some((i) => i.includes('.')) ? ` · ${ids.map((i) => label(i).main).join(', ')}` : '';
    return `<li><details>
      <summary><span class="nm">${esc(ex.el)}</span><span class="role ${role}">${role === 'p' ? __G('Κύριος') : __G('Βοηθητικός')}</span><span class="eqx">${esc(ex.eq || ex.en || '')}${esc(partNote)}${ex.ai ? ' · Claude' : ''}</span></summary>
      <div class="exbody" data-exid="${esc(ex.id)}">${steps(ex.steps)}${ex.tips?.length ? `<h3>${__G('Συμβουλή')}</h3>${list(ex.tips.slice(0, 2))}` : ''}
        <div class="actions"><button type="button" class="btn primary" data-ex="${esc(ex.id)}">${__G('Δείξε στο σώμα')}</button></div>
      </div></details></li>`;
  };
  const extraHtml = extra?.length ? `<h3>${__G('Νέες ιδέες από το Claude')}</h3><ul class="exlist">${extra.map((ex) => exItem({ ex, role: ex.p.some((i) => unitOf(i) === unit) ? 'p' : 's', ids: [] })).join('')}</ul>` : '';
  const prim = rows.filter((r) => r.role === 'p');
  const sec = rows.filter((r) => r.role === 's');
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>${__G('Μυς ·')} ${esc(m.region)}</span><span class="tag">${DEPTH_LABEL[Math.min(depth, 2)]}</span></div>
      <h2>${esc(m.el)}</h2>
      <p class="latin">${esc(m.la)}</p>
      ${m.common && m.common !== m.el ? `<p class="sub">${__G('Στο γυμναστήριο: «')}${esc(m.common)}»</p>` : ''}
      <p class="fn">${esc(m.fn)}</p>
      ${depth > state.level ? `<div class="deep-note"><span>${__G('Βρίσκεται κάτω από άλλους μύες· στο σώμα φαίνεται σαν λάμψη.')}</span><button type="button" class="btn" data-level="${depth}">${__G('Αφαίρεσε τις πάνω στρώσεις')}</button></div>` : ''}
      ${parts.length > 1 ? `<h3>${__G('Τμήματα')}</h3><div class="parts">${parts.map(([k, v]) => `<button type="button" class="part${part === k ? ' on' : ''}" data-part="${esc(unit)}.${esc(k)}">${esc(v)}</button>`).join('')}</div>` : ''}
      ${extraHtml}
      ${prim.length ? `<h3>${__G('Ασκήσεις όπου είναι κύριος μυς (')}${prim.length})</h3><ul class="exlist">${prim.map(exItem).join('')}</ul>` : ''}
      ${sec.length ? `<h3>${__G('Συμμετέχει επίσης σε (')}${sec.length})</h3><ul class="exlist">${sec.map(exItem).join('')}</ul>` : ''}
      ${!rows.length && !extra?.length ? '<p class="msg">' + __G('Δεν υπάρχουν ασκήσεις με βάρη για αυτόν τον μυ στη βάση.') + '</p>' : ''}
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
  row.innerHTML = '<button type="button" class="btn ghost" id="moreBtn">' + __G('Περισσότερες ασκήσεις από το Claude') + '</button>';
  $('#moreBtn').addEventListener('click', async () => {
    const ctl = new AbortController();
    state.ctl = ctl;
    row.innerHTML = '<div class="thinking"><i class="pulse"></i><span>' + __G('Το Claude ψάχνει ασκήσεις…') + '</span><button type="button" class="btn" id="stopBtn">' + __G('Διακοπή') + '</button></div>';
    $('#stopBtn').addEventListener('click', () => ctl.abort());
    try {
      const found = await moreExercises(unit, rows.map((r) => r.ex.el), { signal: ctl.signal });
      found.forEach(addCustom);
      if (state.unit === unit) showMuscle(unit, { frame: false, extra: found });
    } catch (e) {
      if (HIDE_CODES.has(e?.code)) state.claudeOff = true;
      if (state.unit !== unit) return;
      row.innerHTML = e?.code === 'cancelled' ? '' : `<p class="msg">${esc(ERROR_TEXT[e?.code] ?? __G('Κάτι πήγε στραβά. Δοκίμασε ξανά.'))}</p>`;
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
  for (const t of userProgram) {
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
  navPush('program:');
  cancelClaude();
  state.mode = 'program';
  state.ex = null;
  state.unit = null;
  window.__mxSel && window.__mxSel('program');
  const { unitScore, exs } = programHighlight();
  const rows = [...unitScore.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...unitScore.values());
  const gaps = MAJOR.filter((u) => !unitScore.has(u));
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>${__G('Το πρόγραμμά σου')}</span><span class="tag">${exs.length} ${__G('ασκήσεις')}</span></div>
      <h2>${__G('Ποιους μύες δουλεύει όλο το πρόγραμμα')}</h2>
      <p class="sub">${__G('Κύρια συμμετοχή = 1 πόντος, βοηθητική = ½. Όσο πιο κόκκινο στο σώμα, τόσο περισσότερη δουλειά.')}</p>
      <h3>${__G('Φόρτος ανά μυ')}</h3>
      <div class="load-rows">${rows.map(([u, sc]) => `<button type="button" class="load-row" data-unit="${esc(u)}"><span>${esc(MUSCLES[u]?.el ?? u)}</span><span class="meter"><i style="width:${(sc / max) * 100}%"></i></span><span class="n">${sc % 1 ? sc.toFixed(1) : sc}</span></button>`).join('')}</div>
      ${gaps.length ? `<h3>${__G('Μεγάλες μυϊκές ομάδες που λείπουν')}</h3><div class="mchips">${gaps.map((u) => `<button type="button" class="mchip s" data-unit="${esc(u)}">${esc(MUSCLES[u].common || MUSCLES[u].el)}</button>`).join('')}</div><p class="sub">${__G('Πάτα μια ομάδα για να δεις ασκήσεις που τη δουλεύουν.')}</p>` : '<p class="msg">' + __G('Το πρόγραμμα καλύπτει όλες τις μεγάλες μυϊκές ομάδες.') + '</p>'}
      <h3>${__G('Ασκήσεις')}</h3>
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
  window.__mxSel && window.__mxSel('program');
}

// όνομα για τα chips: όπως λέγεται η άσκηση στη γλώσσα της εφαρμογής
function displayName(t) {
  try { return resolveExercise(t)?.el || t; } catch { return t; }
}

function renderChips() {
  const box = $('#chips');
  const items = [
    ...(userProgram.length ? ['<button type="button" class="chip all" data-all="1">' + __G('Όλο το πρόγραμμα') + '</button>'] : []),
    ...userProgram.map((t, i) => `<span class="chip" role="group"><button type="button" class="chip-txt" data-q="${esc(t)}" style="all:unset;cursor:pointer">${esc(displayName(t))}</button><button type="button" class="x" data-rm="${i}" aria-label="${__G('Αφαίρεση')} ${esc(displayName(t))}">×</button></span>`),
  ];
  box.innerHTML = items.join('');
  box.querySelector('[data-all]')?.addEventListener('click', showProgram);
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

// ------------------------------------------------------------------ αξιολόγηση προγράμματος
// Βαθμολογεί τα αποθηκευμένα προγράμματα του χρήστη (addons/programs.js → window.__mxPrograms)
// με τους κανόνες του review.js. Οι αλλαγές από εδώ (σετ, φορές την εβδομάδα, ποια μετράνε στην
// εβδομάδα) γράφονται στο plan κάθε προγράμματος, μαζεμένες ανά ~0,7 s.
const BAND_INK = { none: '#14181f', low: '#ffffff', mid: '#14181f', good: '#14181f', top: '#0b2416', excess: '#ffffff' };
const pill = (score, band) => `<span class="rv-pill" style="background:${BANDS[band].color};color:${BAND_INK[band]}">${nf(score)}</span>`;
const meshToScored = new Map();
let lastResult = null;
const rv = { tab: 'programs', open: new Set(), opened: false, muscle: null, tips: false, allTips: false, target: null, coach: null, flash: '', sampleOK: false, sig: '' };
const progApi = () => window.__mxPrograms || null;
const pend = new Map();
const pendTimers = new Map();

function scoredMeshIds(id) {
  const m = SCORED.find((x) => x.id === id);
  return m && viewer && modelReady ? viewer.meshesFor(m.ids).map((x) => x.userData.id) : [];
}
function reviewHoverGroup(mesh) {
  const sid = meshToScored.get(mesh.userData.id);
  return sid ? new Set(scoredMeshIds(sid)) : new Set([mesh.userData.id]);
}
function reviewHighlight(result) {
  const vals = new Map();
  if (!viewer || !modelReady || !result) return vals;
  for (const m of result.muscles) {
    for (const mesh of viewer.meshesFor(m.ids)) vals.set(mesh.userData.id, { v: m.band === 'none' ? 0.85 : 0.97, color: BANDS[m.band].color });
  }
  return vals;
}

const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
function planOf(p) {
  const pl = p.plan && typeof p.plan === 'object' ? p.plan : {};
  return {
    perWeek: clampInt(pl.perWeek, 1, 6, 1),
    inWeek: pl.inWeek !== false,
    sets: (Array.isArray(pl.sets) ? pl.sets : []).filter((x) => x && typeof x.name === 'string').map((x) => ({ name: x.name, n: clampInt(x.n, 1, 20, 3) })),
  };
}
const setsOf = (plan, name) => plan.sets.find((x) => x.name === name)?.n ?? 3;

// τα αποθηκευμένα προγράμματα όπως τα θέλει το analyze(), μαζί με τις αλλαγές που δεν γράφτηκαν ακόμα
function reviewPrograms() {
  const api = progApi();
  if (!api) return [];
  return api.list().map((raw) => {
    const p = pend.has(raw.id) ? { ...raw, ...pend.get(raw.id) } : raw;
    const plan = planOf(p);
    const names = (Array.isArray(p.exercises) ? p.exercises : []).filter((x) => typeof x === 'string' && x.trim());
    return {
      id: p.id, name: String(p.name ?? ''), perWeek: plan.perWeek, active: plan.inWeek, plan, names,
      items: names.map((name, i) => ({ i, name, ex: resolveName(name)?.id ?? null, sets: setsOf(plan, name) })),
    };
  });
}

// fn({names, plan}) → {names?, plan?}: αλλαγή ενός προγράμματος, που γράφεται λίγο αργότερα
function changeProgram(id, fn) {
  const p = reviewPrograms().find((x) => x.id === id);
  if (!p) return null;
  const next = fn({ names: p.names.slice(), plan: { ...p.plan, sets: p.plan.sets.map((x) => ({ ...x })) } });
  const names = next.names ?? p.names;
  const plan = next.plan ?? p.plan;
  // στο plan μένουν τα σετ κάθε άσκησης που υπάρχει στη λίστα, ρητά
  plan.sets = [...new Set(names)].map((name) => ({ name, n: setsOf(plan, name) }));
  pend.set(id, { ...pend.get(id), plan, ...(next.names ? { exercises: names } : {}) });
  clearTimeout(pendTimers.get(id));
  pendTimers.set(id, setTimeout(() => flushProgram(id), 700));
  if (rv.coach?.status !== 'thinking') rv.coach = null;
  return p;
}
async function flushProgram(id) {
  clearTimeout(pendTimers.get(id));
  pendTimers.delete(id);
  const ch = pend.get(id);
  const api = progApi();
  if (!ch || !api) return;
  try {
    await api.patch(id, ch);
  } catch {
    rv.flash = T('A change could not be saved. Try again.', 'Μια αλλαγή δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
  }
  if (pend.get(id) === ch) pend.delete(id);
  if (state.mode === 'review') renderReview({ ifChanged: !rv.flash });
}
function flushAll() { for (const id of [...pend.keys()]) flushProgram(id); }
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

// τα προγράμματα άλλαξαν (εδώ, στην ενότητα «Προγράμματα» ή σε άλλη συσκευή)
function onPrograms() {
  if (state.mode === 'review') renderReview({ ifChanged: true });
}

function addExerciseTo(pid, exId, sets = 3) {
  const ex = exById.get(exId);
  if (!ex) return null;
  return changeProgram(pid, ({ names, plan }) => {
    const have = names.find((n) => resolveName(n)?.id === exId);
    if (have) {
      const cur = plan.sets.find((x) => x.name === have);
      if (cur) cur.n = Math.min(20, cur.n + sets);
      else plan.sets.push({ name: have, n: Math.min(20, 3 + sets) });
    } else {
      names.push(ex.el);
      plan.sets = plan.sets.filter((x) => x.name !== ex.el);
      plan.sets.push({ name: ex.el, n: sets });
    }
    return { names, plan };
  });
}

async function addTemplates(ids) {
  const api = progApi();
  if (!api || !api.ready()) return [];
  const taken = new Set(api.list().map((p) => p.name));
  const made = [];
  for (const id of ids) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) continue;
    const items = t.items.filter((it) => exById.has(it.ex));
    const names = items.map((it) => exById.get(it.ex).el);
    let name = t.name;
    for (let k = 2; taken.has(name); k++) name = `${t.name} ${k}`;
    taken.add(name);
    const pid = await api.create({ name, exercises: names, plan: { perWeek: t.perWeek, inWeek: true, sets: items.map((it, i) => ({ name: names[i], n: it.sets })) } });
    made.push({ id: pid, name, perWeek: t.perWeek });
  }
  return made;
}

function showReview({ frame = true } = {}) {
  navPush('review:');
  cancelClaude();
  state.mode = 'review';
  state.ex = null;
  state.unit = null;
  window.__mxSel && window.__mxSel('review');
  renderReview({ fresh: true });
  markChips();
  applyModelState(frame);
}

// «Χάρτης» ενώ φαίνεται η αξιολόγηση: πίσω στην προηγούμενη καρτέλα, αλλιώς στο πρόγραμμα/αρχική
function leaveReview() {
  if (state.mode !== 'review') return;
  flushAll();
  if (navStack.length) { navBack(); return; }
  navRestoring = true;
  try {
    if (userProgram.length) showProgram();
    else window.__mxProgram.empty();
  } finally {
    navRestoring = false;
  }
}

function muscleStatus(m) {
  if (m.V <= 0) return T(`Not trained. Target: at least ${m.min} sets a week, over 2 sessions.`, `Δεν δουλεύει. Στόχος: τουλάχιστον ${m.min} σετ την εβδομάδα, σε 2 προπονήσεις.`);
  const out = [];
  if (m.V < m.min) out.push(T(`${nf(m.V)} sets a week: about ${Math.ceil(m.min - m.V)} short of the ${m.min}-set target.`, `${nf(m.V)} σετ την εβδομάδα: λείπουν περίπου ${Math.ceil(m.min - m.V)} για τον στόχο των ${m.min}.`));
  else if (m.V <= RULES.max) out.push(T(`${nf(m.V)} sets a week: within the optimal ${m.min}–${RULES.max} range.`, `${nf(m.V)} σετ την εβδομάδα: μέσα στο βέλτιστο εύρος ${m.min}–${RULES.max}.`));
  else if (m.V <= RULES.excess) out.push(T(`${nf(m.V)} sets a week: a little above optimal, fine if you recover well.`, `${nf(m.V)} σετ την εβδομάδα: λίγο πάνω από το βέλτιστο, εντάξει αν αναρρώνεις καλά.`));
  else out.push(T(`${nf(m.V)} sets a week: a lot of volume for little extra benefit.`, `${nf(m.V)} σετ την εβδομάδα: πολύς όγκος με μικρό επιπλέον όφελος.`));
  out.push(m.hits >= 2 ? T(`Trained ${m.hits} times a week.`, `Δουλεύει ${m.hits} φορές την εβδομάδα.`)
    : m.hits === 1 ? T('Trained once a week (target: twice).', 'Δουλεύει 1 φορά την εβδομάδα (στόχος: 2).')
      : T('The sets are scattered: less than 1.5 in any session.', 'Τα σετ είναι σκόρπια: λιγότερα από 1,5 σε κάθε προπόνηση.'));
  if (m.maxS > RULES.sessionCap) out.push(T(`Up to ${nf(m.maxS)} sets in one session; above about 10 the returns drop.`, `Έως ${nf(m.maxS)} σετ σε μία προπόνηση· πάνω από ~10 η απόδοση πέφτει.`));
  return out.join(' ');
}

function vbar(m) {
  const S = 30;
  const pct = (x) => `${(Math.min(S, Math.max(0, x)) / S) * 100}%`;
  return `<div class="rv-vbar" role="img" aria-label="${esc(T(`${nf(m.V)} sets, target ${m.min} to ${RULES.max}`, `${nf(m.V)} σετ, στόχος ${m.min} έως ${RULES.max}`))}">
    <i class="rv-zone" style="left:${pct(m.min)};width:calc(${pct(RULES.max)} - ${pct(m.min)})"></i>
    <i class="rv-mark" style="left:${pct(m.V)};background:${BANDS[m.band].color}"></i>
  </div>
  <div class="rv-vticks"><span style="left:0">0</span><span style="left:${pct(m.min)}">${m.min}</span><span style="left:${pct(RULES.max)}">${RULES.max}</span><span style="left:100%">30+</span></div>`;
}

const perWeekLabel = (n) => T(`${n}× / week`, `${n}× / εβδ.`);
const setsWord = (n) => T(n === 1 ? 'set' : 'sets', 'σετ');

// ο χάρτης έχει πρόγραμμα (από «＋ Στο πρόγραμμά μου») που δεν είναι αποθηκευμένο
function mapProgramUnsaved(progs) {
  if (!userProgram.length) return false;
  const key = (names) => [...new Set(names.map((n) => resolveName(n)?.el ?? n))].sort().join('\u0001');
  const cur = key(userProgram);
  return !progs.some((p) => key(p.names) === cur);
}

function tabPrograms(progs) {
  const cards = progs.map((p) => {
    const open = rv.open.has(p.id);
    const known = p.items.filter((it) => it.ex);
    const unknown = p.items.length - known.length;
    const perSession = known.reduce((a, it) => a + it.sets, 0);
    const items = p.items.map((it) => {
      const ex = it.ex ? exById.get(it.ex) : null;
      const nm = ex ? ex.el : it.name;
      return ex ? `<li>
          <span class="rv-iname">${esc(nm)}${ex.ai ? ' <small>Claude</small>' : ''}</span>
          <span class="rv-stepper"><button type="button" data-dec="${it.i}" data-key="dec:${esc(p.id)}:${it.i}" aria-label="${esc(T(`Fewer sets of ${nm}`, `Λιγότερα σετ για ${nm}`))}">−</button><output aria-live="polite">${it.sets} <small>${setsWord(it.sets)}</small></output><button type="button" data-inc="${it.i}" data-key="inc:${esc(p.id)}:${it.i}" aria-label="${esc(T(`More sets of ${nm}`, `Περισσότερα σετ για ${nm}`))}">+</button></span>
          <button type="button" class="rv-x" data-rm="${it.i}" aria-label="${esc(T(`Remove ${nm}`, `Αφαίρεση ${nm}`))}">×</button>
        </li>`
        : `<li class="rv-unknown">
          <span class="rv-iname">${esc(nm)} <small>${T('not recognised, not counted', 'δεν αναγνωρίστηκε, δεν μετράει')}</small></span>
          <span></span>
          <button type="button" class="rv-x" data-rm="${it.i}" aria-label="${esc(T(`Remove ${nm}`, `Αφαίρεση ${nm}`))}">×</button>
        </li>`;
    }).join('');
    const meta = [
      T(`${known.length} ${known.length === 1 ? 'exercise' : 'exercises'}`, `${known.length} ${known.length === 1 ? 'άσκηση' : 'ασκήσεις'}`),
      T(`${perSession} sets per session`, `${perSession} σετ ανά προπόνηση`),
      p.active ? T(`${perSession * p.perWeek} sets a week`, `${perSession * p.perWeek} σετ την εβδομάδα`) : T('not in the week', 'εκτός εβδομάδας'),
      unknown ? T(`${unknown} not recognised`, `${unknown} δεν ${unknown === 1 ? 'αναγνωρίστηκε' : 'αναγνωρίστηκαν'}`) : '',
    ].filter(Boolean).join(' · ');
    return `<section class="rv-prog${p.active ? ' on' : ''}" data-pid="${esc(p.id)}">
      <div class="rv-phead">
        <input type="checkbox" id="rvon-${esc(p.id)}" data-on data-key="on:${esc(p.id)}" ${p.active ? 'checked' : ''}>
        <label for="rvon-${esc(p.id)}" class="rv-pname">${esc(p.name)}</label>
        <select data-week data-key="week:${esc(p.id)}" aria-label="${esc(T(`Times a week for ${p.name}`, `Φορές την εβδομάδα για ${p.name}`))}">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${n === p.perWeek ? ' selected' : ''}>${perWeekLabel(n)}</option>`).join('')}</select>
        <button type="button" class="rv-icon" data-toggle data-key="tog:${esc(p.id)}" aria-expanded="${open}" aria-label="${esc(open ? T(`Close ${p.name}`, `Κλείσιμο ${p.name}`) : T(`Edit sets of ${p.name}`, `Σετ και ασκήσεις του ${p.name}`))}">${open ? '▴' : '▾'}</button>
      </div>
      <p class="rv-pmeta">${meta}</p>
      ${open ? `<div class="rv-pbody">
        ${p.items.length ? `<ul class="rv-items">${items}</ul>` : `<p class="sub">${T('No exercises yet.', 'Δεν έχει ασκήσεις ακόμα.')}</p>`}
        <form class="rv-additem" data-add>
          <input list="rvExList" data-key="add:${esc(p.id)}" placeholder="${esc(T('Add an exercise…', 'Πρόσθεσε άσκηση…'))}" aria-label="${esc(T(`New exercise in ${p.name}`, `Νέα άσκηση στο ${p.name}`))}" enterkeyhint="done" autocomplete="off">
          <button type="submit" class="btn" aria-label="${esc(T('Add', 'Προσθήκη'))}">＋</button>
        </form>
        <div class="rv-addmsg" role="status"></div>
        <button type="button" class="rv-link" data-edit>${T('Rename it or edit the list in My programs', 'Μετονομασία ή αλλαγή της λίστας στα «Προγράμματα»')}</button>
      </div>` : ''}
    </section>`;
  }).join('');
  const tplSelect = `<select data-template data-key="template" aria-label="${esc(T('Add a coach template', 'Πρόσθεσε πρότυπο προπονητή'))}">
      <option value="">${T('Add a coach template…', 'Πρόσθεσε πρότυπο προπονητή…')}</option>
      <optgroup label="${esc(T('A complete week', 'Ολόκληρη εβδομάδα'))}">${PACKS.map((k) => `<option value="pack:${k.id}">${esc(k.name)} · ${esc(k.note)}</option>`).join('')}</optgroup>
      <optgroup label="${esc(T('One program', 'Ένα πρόγραμμα'))}">${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)} · ${perWeekLabel(t.perWeek)}</option>`).join('')}</optgroup>
    </select>`;
  return `
    <p class="sub">${T('Tick the programs you do in your week and how many times you do each. The scores and the colours on the body update straight away.', 'Τσέκαρε τα προγράμματα που κάνεις μέσα στην εβδομάδα και πόσες φορές το καθένα. Οι βαθμοί και τα χρώματα στο σώμα αλλάζουν αμέσως.')}</p>
    ${mapProgramUnsaved(progs) ? `<div class="rv-note"><span>${T(`The program on your map (${userProgram.length} exercises) is not saved, so it is not part of the review.`, `Το πρόγραμμα του χάρτη (${userProgram.length} ασκήσεις) δεν είναι αποθηκευμένο, οπότε δεν μετράει στην αξιολόγηση.`)}</span><button type="button" class="btn" data-savemap>${T('Save it', 'Αποθήκευσέ το')}</button></div>` : ''}
    <div class="rv-plist">${cards || `<p class="msg">${T('You have no saved programs yet. Add a coach template for a complete week, or create your own program.', 'Δεν έχεις ακόμα αποθηκευμένα προγράμματα. Πρόσθεσε ένα πρότυπο προπονητή για ολόκληρη εβδομάδα ή φτιάξε δικό σου πρόγραμμα.')}</p>`}</div>
    <div class="actions rv-actions">
      <button type="button" class="btn" data-new>${T('＋ New program', '＋ Νέο πρόγραμμα')}</button>
      ${tplSelect}
    </div>
    <datalist id="rvExList">${[...exById.values()].map((e) => `<option value="${esc(e.el)}"></option>`).join('')}</datalist>`;
}

function tabMuscles(result) {
  return `
    <p class="sub">${T('Sets a week (primary muscle = 1 set, secondary = ½) · times a week · score. Tap a muscle, here or on the body, for details.', 'Σετ την εβδομάδα (κύριος μυς = 1 σετ, βοηθητικός = ½) · φορές την εβδομάδα · βαθμός. Πάτα έναν μυ, εδώ ή πάνω στο σώμα, για λεπτομέρειες.')}</p>
    ${result.groups.map((g) => `
      <h3 class="rv-ghead" id="rvg-${g.id}"><span>${esc(g.name)}</span>${pill(g.score, g.band)}</h3>
      <ul class="rv-mrows">${g.muscles.map((m) => {
        const open = rv.muscle === m.id;
        return `<li>
          <button type="button" class="rv-mrow${open ? ' open' : ''}" data-m="${m.id}" data-key="m:${m.id}" aria-expanded="${open}">
            <i class="dot" style="background:${BANDS[m.band].color}"></i>
            <span class="rv-mname">${esc(m.name)}</span>
            <span class="rv-mnum">${nf(m.V)} <small>${setsWord(m.V)}</small></span>
            <span class="rv-mnum">${m.hits}×</span>
            ${pill(m.score, m.band)}
          </button>
          ${open ? `<div class="rv-mdetail">
            <p class="rv-mfull">${esc(m.full)}</p>
            ${vbar(m)}
            <p>${esc(muscleStatus(m))}</p>
            ${m.contrib.length ? `<ul class="rv-contrib">${m.contrib.map((c) => `<li><span>${esc(c.ex.el)} <small>· ${esc(c.program.name)} · ${c.sets} ${setsWord(c.sets)}${c.perWeek > 1 ? ` × ${c.perWeek}` : ''}${c.role < 1 ? T(' · secondary ½', ' · βοηθητικός ½') : ''}</small></span><b>${nf(c.weekly)}</b></li>`).join('')}</ul>` : ''}
            <div class="actions"><button type="button" class="btn" data-look="${m.id}">${T('Show on the body', 'Δες στο σώμα')}</button><button type="button" class="btn ghost" data-exs="${esc(unitOf(m.ids[0]))}">${T('Exercises for this muscle', 'Ασκήσεις για τον μυ')}</button></div>
          </div>` : ''}
        </li>`;
      }).join('')}</ul>`).join('')}`;
}

function actionLabel(a, progs) {
  if (a.type === 'add') return `＋ ${esc(exById.get(a.ex)?.el ?? a.ex)} · ${a.sets} ${setsWord(a.sets)}`;
  if (a.type === 'template') {
    const t = TEMPLATES.find((x) => x.id === a.id);
    return T(`＋ Template “${esc(t?.name)}” ${t?.perWeek ?? 1}×/week`, `＋ Πρότυπο «${esc(t?.name)}» ${t?.perWeek ?? 1}×/εβδ.`);
  }
  if (a.type === 'perweek') {
    const p = progs.find((x) => x.id === a.program);
    return T(`Do “${esc(p?.name)}” ${a.n}×/week`, `Κάνε το «${esc(p?.name)}» ${a.n}×/εβδ.`);
  }
  return '';
}

function coachHtml(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  let html = '';
  let inList = false;
  for (const l of lines) {
    const isItem = /^[-•*]\s+/.test(l) || /^\d+[.)]\s+/.test(l);
    const body = esc(l.replace(/^[-•*]\s+|^\d+[.)]\s+/, '').replace(/\*\*/g, ''));
    if (isItem && !inList) { html += '<ul class="notes">'; inList = true; }
    if (!isItem && inList) { html += '</ul>'; inList = false; }
    html += isItem ? `<li>${body}</li>` : `<p>${body}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

const targetOf = (progs) => {
  const act = progs.filter((p) => p.active);
  return act.some((p) => p.id === rv.target) ? rv.target : act[0]?.id ?? progs[0]?.id ?? null;
};

function tabTips(result, progs) {
  if (!rv.tips) {
    return `
      <p class="sub">${T('The suggestions come from the analysis: what is missing for the rule of 10 sets, for training each muscle twice a week and for balance between muscles.', 'Οι προτάσεις βγαίνουν από την ανάλυση: τι λείπει για τον κανόνα των 10 σετ, για τη συχνότητα 2 φορές την εβδομάδα και για την ισορροπία ανάμεσα στους μύες.')}</p>
      <div class="actions"><button type="button" class="btn primary" data-showtips>${T('Give me suggestions to improve', 'Δώσε μου προτάσεις βελτίωσης')}</button></div>`;
  }
  const tips = suggest(result, progs, exById);
  const shown = rv.allTips ? tips : tips.slice(0, 6);
  const target = targetOf(progs);
  const coach = rv.coach;
  return `
    ${progs.length && tips.some((t) => t.actions.some((a) => a.type === 'add')) ? `<div class="rv-target"><label for="rvTarget">${T('Exercises you add go to', 'Οι ασκήσεις που προσθέτεις πηγαίνουν στο')}</label><select id="rvTarget" data-tiptarget data-key="target">${progs.map((p) => `<option value="${esc(p.id)}"${p.id === target ? ' selected' : ''}>${esc(p.name)}${p.active ? '' : T(' (not in the week)', ' (εκτός εβδομάδας)')}</option>`).join('')}</select></div>` : ''}
    ${tips.length ? `<ol class="rv-suggs">${shown.map((t, i) => `
      <li class="rv-sugg kind-${t.kind}">
        <div class="rv-sugg-head">${t.muscle ? pill(t.muscle.score, t.muscle.band) : ''}<b>${esc(t.title)}</b></div>
        <p>${esc(t.text)}</p>
        ${t.actions.length ? `<div class="rv-sugg-actions">${t.actions.map((a, j) => `<button type="button" class="btn" data-act="${a.type}" data-ex="${esc(a.ex ?? '')}" data-sets="${a.sets ?? ''}" data-id="${esc(a.id ?? '')}" data-program="${esc(a.program ?? '')}" data-n="${a.n ?? ''}" data-key="act:${i}:${j}">${actionLabel(a, progs)}</button>`).join('')}</div>` : ''}
      </li>`).join('')}</ol>
      ${tips.length > shown.length ? `<button type="button" class="rv-link" data-alltips>${T(`All suggestions (${tips.length})`, `Όλες οι προτάσεις (${tips.length})`)}</button>` : ''}`
    : `<p class="msg">${T('Nothing important to change: the program meets the goal for every muscle.', 'Δεν βρήκα κάτι σημαντικό να αλλάξεις. Το πρόγραμμα καλύπτει τον στόχο για όλους τους μύες.')}</p>`}
    ${rv.sampleOK && !state.claudeOff && result.weeklySessions ? `<div class="rv-coach">
      <h3>${T('A coach’s opinion from Claude', 'Γνώμη προπονητή από το Claude')}</h3>
      ${coach?.status === 'thinking' ? `<div class="thinking"><i class="pulse"></i><span>${T('Claude is studying your program…', 'Το Claude μελετά το πρόγραμμα…')}</span><button type="button" class="btn" data-coachstop>${__G('Διακοπή')}</button></div>` : ''}
      <div class="rv-coach-out" id="rvCoachOut">${coach?.text ? coachHtml(coach.text) : ''}</div>
      ${coach?.msg ? `<p class="msg">${esc(coach.msg)}</p>` : ''}
      ${coach?.status !== 'thinking' ? `<button type="button" class="btn ghost" data-coach>${coach?.text ? T('Ask for a new opinion', 'Ζήτα νέα γνώμη') : T('Ask for an opinion on the whole program', 'Ζήτα γνώμη για όλο το πρόγραμμα')}</button>` : ''}
    </div>` : ''}
    <div class="rv-principles">
      <h3>${T('What else growth needs', 'Τι άλλο χρειάζεται για ανάπτυξη')}</h3>
      <ul class="notes">
        <li>${T('Progressive overload: every 1–2 weeks a little more weight or 1–2 more reps.', 'Προοδευτική επιβάρυνση: κάθε 1–2 εβδομάδες λίγο περισσότερο βάρος ή 1–2 επαναλήψεις.')}</li>
        <li>${T('Effort: end sets 0–3 reps short of failure, in the 6–30 rep range.', 'Ένταση: τα σετ να τελειώνουν 0–3 επαναλήψεις πριν την αποτυχία, με 6–30 επαναλήψεις.')}</li>
        <li>${T('Rest 2–3 minutes on the big lifts, 1–2 on isolation exercises.', 'Ανάπαυση 2–3 λεπτά στις βασικές ασκήσεις, 1–2 στις απομονωμένες.')}</li>
        <li>${T('Protein 1.6–2.2 g per kg of body weight a day, and 7–9 hours of sleep.', 'Πρωτεΐνη 1,6–2,2 g ανά κιλό σωματικού βάρους την ημέρα και 7–9 ώρες ύπνος.')}</li>
      </ul>
    </div>`;
}

// fresh: νέα καρτέλα (πάνω-πάνω) · ifChanged: μόνο αν άλλαξαν τα δεδομένα · scrollTo/focus: επιλογείς
function renderReview({ fresh = false, ifChanged = false, scrollTo = null, focus = null } = {}) {
  const api = progApi();
  const ready = !!api && api.ready();
  const progs = ready ? reviewPrograms() : [];
  const sig = JSON.stringify([ready, userProgram, progs.map((p) => [p.id, p.name, p.perWeek, p.active, p.items.map((it) => [it.name, it.ex, it.sets])])]);
  if (ifChanged && !fresh && sig === rv.sig && $('#panel > article.review')) return;
  rv.sig = sig;
  if (ready && !rv.opened) {
    rv.opened = true;
    if (progs.length) rv.open.add(progs[0].id);
  }
  const result = analyze(progs, exById);
  lastResult = ready ? result : null;

  // η γραμμή «Πίσω» (addons/programs.js) μένει: αλλάζει μόνο το περιεχόμενο του <article>
  let art = $('#panel > article.review');
  const ae = document.activeElement;
  const keep = !fresh && art && ae && art.contains(ae) && ae.dataset.key
    ? { key: ae.dataset.key, value: ae.tagName === 'INPUT' && ae.type !== 'checkbox' ? ae.value : null, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const prevScroll = panel().scrollTop;
  const pageScroll = window.scrollY;
  if (fresh || !art) {
    panel().innerHTML = '<article class="review"></article>';
    art = $('#panel > article.review');
    art.addEventListener('click', onReviewClick);
    art.addEventListener('change', onReviewChange);
    art.addEventListener('submit', onReviewSubmit);
  }
  const eyebrow = `<div class="eyebrow"><span>${T('Program review', 'Αξιολόγηση προγράμματος')}</span><span class="tag">${T('Goal: muscle growth', 'Στόχος: μυϊκή ανάπτυξη')}</span></div>`;
  if (!ready) {
    art.innerHTML = `${eyebrow}<h2>${T('Your programs', 'Τα προγράμματά σου')}</h2><div class="thinking"><i class="pulse"></i><span>${T('Loading your programs…', 'Φόρτωση των προγραμμάτων σου…')}</span></div>`;
    if (state.mode === 'review') applyModelState(false);
    return;
  }
  const ob = bandForScore(result.overall);
  const tabs = [['programs', T('Programs', 'Προγράμματα')], ['muscles', T('Muscles', 'Μύες')], ['tips', T('Suggestions', 'Προτάσεις')]];
  const nSess = result.weeklySessions;
  art.innerHTML = `
    ${eyebrow}
    <div class="rv-head">
      <div class="rv-ring" style="--p:${result.overall / 10};--c:${BANDS[ob].color}" role="img" aria-label="${esc(T(`Overall score ${nf(result.overall)} out of 10`, `Συνολικός βαθμός ${nf(result.overall)} στα 10`))}"><b>${nf(result.overall)}</b><small>/10</small></div>
      <div class="rv-headtxt">
        <h2>${esc(verdict(result.overall))}</h2>
        <p class="sub">${T(`${nSess} ${nSess === 1 ? 'session' : 'sessions'} a week · ${result.weeklySets} sets · ${result.onTarget} of ${result.muscles.length} muscles on target`, `${nSess} ${nSess === 1 ? 'προπόνηση' : 'προπονήσεις'} την εβδομάδα · ${result.weeklySets} σετ · ${result.onTarget} από ${result.muscles.length} μύες στον στόχο`)}</p>
      </div>
    </div>
    ${rv.flash ? `<p class="rv-flash" role="status">${esc(rv.flash)}</p>` : ''}
    <div class="rv-subs">
      <div><span>${T('Volume', 'Όγκος')}</span>${pill(result.sub.volume, bandForScore(result.sub.volume))}</div>
      <div><span>${T('Frequency', 'Συχνότητα')}</span>${pill(result.sub.frequency, bandForScore(result.sub.frequency))}</div>
      <div><span>${T('Balance', 'Ισορροπία')}</span>${pill(result.sub.balance, bandForScore(result.sub.balance))}</div>
    </div>
    <div class="rv-gbars">${result.groups.map((g) => `
      <button type="button" class="rv-gbar" data-group="${g.id}" data-key="g:${g.id}">
        <span class="rv-gname">${esc(g.name)}</span>
        <span class="rv-track"><i style="width:${g.score * 10}%;background:${BANDS[g.band].color}"></i></span>
        <b>${nf(g.score)}</b>
      </button>`).join('')}</div>
    <div class="rv-tabs" role="tablist" aria-label="${esc(T('Review', 'Αξιολόγηση'))}">${tabs.map(([id, name]) => `<button type="button" role="tab" id="rvtab-${id}" aria-selected="${rv.tab === id}" aria-controls="rvTabpanel" data-tab="${id}" data-key="tab:${id}">${name}</button>`).join('')}</div>
    <div class="rv-tabpanel" id="rvTabpanel" role="tabpanel" aria-labelledby="rvtab-${rv.tab}">
      ${rv.tab === 'programs' ? tabPrograms(progs) : rv.tab === 'muscles' ? tabMuscles(result) : tabTips(result, progs)}
    </div>
    <details class="rv-method">
      <summary>${T('How the score works', 'Πώς βγαίνει ο βαθμός')}</summary>
      <ul class="notes">
        <li>${T('We count hard sets (6–30 reps, ending 0–3 reps short of failure). The primary muscle of an exercise gets 1 set, a secondary muscle ½.', 'Μετράμε σκληρά σετ (6–30 επαναλήψεις, 0–3 πριν την αποτυχία). Ο κύριος μυς μιας άσκησης παίρνει 1 σετ, ο βοηθητικός ½.')}</li>
        <li>${T('Volume, the rule of 10: each muscle group needs at least 10 sets a week, ideally 10–20. Below that the score drops in proportion (6 sets = 6/10). The small assisting muscles (rotator cuff, forearms, shins, hip flexors, front delts, upper traps, obliques, brachialis) need at least 6.', 'Όγκος, ο κανόνας του 10: κάθε μυϊκή ομάδα θέλει τουλάχιστον 10 σετ την εβδομάδα, ιδανικά 10–20. Με λιγότερα ο βαθμός πέφτει αναλογικά (6 σετ = 6/10). Οι μικροί βοηθητικοί μύες (στροφικό πέταλο, πήχεις, κνήμη, καμπτήρες ισχίου, μπροστινός ώμος, άνω τραπεζοειδής, λοξοί, βραχιόνιος) θέλουν τουλάχιστον 6.')}</li>
        <li>${T('Frequency: each muscle at least twice a week (a session counts when it gives the muscle 1.5 sets or more).', 'Συχνότητα: κάθε μυς τουλάχιστον 2 φορές την εβδομάδα (μια προπόνηση μετράει αν δίνει ≥1,5 σετ στον μυ).')}</li>
        <li>${T('Distribution: up to about 10 sets for the same muscle in one session.', 'Κατανομή: έως ~10 σετ για τον ίδιο μυ σε μία προπόνηση.')}</li>
        <li>${T('Muscle score = 70% volume + 25% frequency + 5% distribution. Group score = average of its muscles, with the big muscles counting three times.', 'Βαθμός μυός = 70% όγκος + 25% συχνότητα + 5% κατανομή. Ομάδα = μέσος όρος των μυών της, με τους μεγάλους μύες να μετράνε τριπλά.')}</li>
        <li>${T('Overall score = 85% the muscles + 15% balance (push/pull, quads/hamstrings, upper/lower body).', 'Συνολικός βαθμός = 85% οι μύες + 15% ισορροπία (ώθηση/έλξη, τετρακέφαλοι/οπίσθιοι, άνω/κάτω σώμα).')}</li>
      </ul>
    </details>`;
  rv.flash = '';
  if (fresh) panel().scrollTop = 0;
  else {
    panel().scrollTop = prevScroll;
    if (Math.abs(window.scrollY - pageScroll) > 2) window.scrollTo(0, pageScroll);
  }
  const want = (focus && art.querySelector(focus)) || (keep && art.querySelector(`[data-key="${CSS.escape(keep.key)}"]`));
  if (want) {
    if (keep && keep.value !== null && want.dataset.key === keep.key) {
      want.value = keep.value;
      try { want.setSelectionRange(keep.s, keep.e); } catch { /* όχι πεδίο κειμένου */ }
    }
    want.focus({ preventScroll: true });
  }
  if (scrollTo) art.querySelector(scrollTo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (modelReady && state.mode === 'review') viewer.setHighlight(reviewHighlight(result), { xray: false });
}

function programOf(el) {
  const id = el.closest('[data-pid]')?.dataset.pid;
  return id ? reviewPrograms().find((p) => p.id === id) ?? null : null;
}

async function onReviewClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  const p = programOf(t);
  const api = progApi();
  if (d.tab) { rv.tab = d.tab; renderReview(); return; }
  if (d.group) { rv.tab = 'muscles'; renderReview({ scrollTo: `#rvg-${d.group}` }); return; }
  if ('toggle' in d && p) {
    if (rv.open.has(p.id)) rv.open.delete(p.id); else rv.open.add(p.id);
    renderReview();
    return;
  }
  if (('inc' in d || 'dec' in d) && p) {
    const i = Number(d.inc ?? d.dec);
    const name = p.names[i];
    if (name === undefined) return;
    changeProgram(p.id, ({ plan }) => {
      const cur = plan.sets.find((x) => x.name === name);
      const n = Math.min(20, Math.max(1, (cur?.n ?? 3) + ('inc' in d ? 1 : -1)));
      if (cur) cur.n = n; else plan.sets.push({ name, n });
      return { plan };
    });
    renderReview();
    return;
  }
  if ('rm' in d && p) {
    const i = Number(d.rm);
    changeProgram(p.id, ({ names }) => ({ names: names.filter((_, k) => k !== i) }));
    renderReview({ focus: `[data-pid="${CSS.escape(p.id)}"] .rv-additem input` });
    return;
  }
  if ('edit' in d && p) { flushAll(); api?.openEdit(p.id); return; }
  if ('new' in d) { flushAll(); api?.openNew(''); return; }
  if ('savemap' in d) { api?.openNew(userProgram.join('\n')); return; }
  if (d.m) {
    rv.muscle = rv.muscle === d.m ? null : d.m;
    viewer?.setSelectedIds(rv.muscle ? scoredMeshIds(rv.muscle) : []);
    renderReview();
    return;
  }
  if (d.look) {
    viewer?.setSelectedIds(scoredMeshIds(d.look));
    const m = SCORED.find((x) => x.id === d.look);
    if (viewer && modelReady && m) viewer.frameMeshes(viewer.meshesFor(m.ids));
    return;
  }
  if (d.exs) { showMuscle(d.exs, { frame: true }); return; }
  if ('showtips' in d) { rv.tips = true; renderReview({ focus: '.rv-sugg-actions .btn, [data-coach]' }); return; }
  if ('alltips' in d) { rv.allTips = true; renderReview(); return; }
  if ('coach' in d) { runCoach(); return; }
  if ('coachstop' in d) { cancelClaude(); return; }
  if (d.act) {
    const progs = reviewPrograms();
    if (d.act === 'add') {
      const pid = targetOf(progs);
      const prog = pid ? addExerciseTo(pid, d.ex, Number(d.sets) || 3) : null;
      if (prog) rv.flash = T(`Added ${exById.get(d.ex)?.el} · ${d.sets} sets to “${prog.name}”.`, `Προστέθηκε: ${exById.get(d.ex)?.el} · ${d.sets} σετ στο «${prog.name}».`);
    } else if (d.act === 'template') {
      t.disabled = true;
      try {
        const made = await addTemplates([d.id]);
        if (made[0]) rv.flash = T(`Added the template “${made[0].name}”, ${made[0].perWeek}× a week. You will find it under Programs.`, `Προστέθηκε το πρότυπο «${made[0].name}» ${made[0].perWeek}×/εβδ. Το βρίσκεις στα Προγράμματα.`);
      } catch {
        rv.flash = T('The template could not be added. Try again.', 'Το πρότυπο δεν προστέθηκε. Δοκίμασε ξανά.');
      }
    } else if (d.act === 'perweek') {
      const prog = changeProgram(d.program, ({ plan }) => ({ plan: { ...plan, perWeek: Number(d.n) || 2, inWeek: true } }));
      if (prog) rv.flash = T(`“${prog.name}” is now ${Number(d.n) || 2} times a week.`, `Το «${prog.name}» μπήκε ${Number(d.n) || 2} φορές την εβδομάδα.`);
    }
    if (state.mode === 'review') renderReview({ focus: '[data-tiptarget], .rv-sugg-actions .btn' });
  }
}

async function onReviewChange(e) {
  const t = e.target;
  const p = programOf(t);
  if ('on' in t.dataset && p) {
    changeProgram(p.id, ({ plan }) => ({ plan: { ...plan, inWeek: t.checked } }));
    renderReview();
    return;
  }
  if ('week' in t.dataset && p) {
    changeProgram(p.id, ({ plan }) => ({ plan: { ...plan, perWeek: clampInt(t.value, 1, 6, 1) } }));
    renderReview();
    return;
  }
  if ('template' in t.dataset && t.value) {
    const v = t.value;
    t.disabled = true;
    const ids = v.startsWith('pack:') ? TEMPLATES.filter((x) => x.pack === v.slice(5)).map((x) => x.id) : [v];
    try {
      const made = await addTemplates(ids);
      made.forEach((x) => x.id && rv.open.add(x.id));
      if (made.length) {
        rv.flash = T(`Added ${made.map((x) => `“${x.name}” ${x.perWeek}×/week`).join(', ')}.`, `Προστέθηκαν: ${made.map((x) => `«${x.name}» ${x.perWeek}×/εβδ.`).join(', ')}.`);
      }
    } catch {
      rv.flash = T('The template could not be added. Try again.', 'Το πρότυπο δεν προστέθηκε. Δοκίμασε ξανά.');
    }
    if (state.mode === 'review') renderReview({ focus: '[data-template]' });
    return;
  }
  if ('tiptarget' in t.dataset) rv.target = t.value;
}

async function onReviewSubmit(e) {
  const form = e.target.closest('form[data-add]');
  if (!form) return;
  e.preventDefault();
  const p = programOf(form);
  const input = form.querySelector('input');
  const msg = form.parentElement.querySelector('.rv-addmsg');
  const q = input.value.trim();
  if (!p || !q) return;
  let ex = resolveExercise(q);
  if (!ex) {
    const sample = state.claudeOff ? null : await getSample();
    if (!sample) {
      const sugg = index.search(q, 6).filter((r) => r.type === 'exercise').slice(0, 3);
      msg.innerHTML = `<p class="msg">${esc(T(`“${q}” was not found.`, `Δεν βρέθηκε το «${q}».`))}${sugg.length ? ' ' + T('Did you mean:', 'Μήπως εννοείς:') : ''}</p>${sugg.length ? `<div class="mchips">${sugg.map((r) => `<button type="button" class="mchip s" data-addex="${esc(r.id)}">${esc(r.title)}</button>`).join('')}</div>` : ''}`;
      msg.querySelectorAll('[data-addex]').forEach((b) => b.addEventListener('click', () => {
        addExerciseTo(p.id, b.dataset.addex, 3);
        renderReview({ focus: `[data-pid="${CSS.escape(p.id)}"] .rv-additem input` });
      }));
      return;
    }
    msg.innerHTML = `<div class="thinking"><i class="pulse"></i><span>${T('Not in the database, so I am asking Claude…', 'Δεν υπάρχει στη βάση· τη ρωτάω στο Claude…')}</span></div>`;
    try {
      const r = await analyzeExercise(q, {});
      if (!r.recognized) { msg.innerHTML = `<p class="msg">${esc(T(`Claude did not recognise “${q}” as an exercise.`, `Το Claude δεν αναγνώρισε το «${q}» ως άσκηση.`))}</p>`; return; }
      addCustom(r.exercise);
      ex = r.exercise;
    } catch (err) {
      if (HIDE_CODES.has(err?.code)) state.claudeOff = true;
      msg.innerHTML = `<p class="msg">${esc(ERROR_TEXT[err?.code] ?? __G('Δεν ήταν δυνατή η ανάλυση αυτή τη στιγμή.'))}</p>`;
      return;
    }
  }
  addExerciseTo(p.id, ex.id, 3);
  input.value = '';
  if (state.mode === 'review') renderReview({ focus: `[data-pid="${CSS.escape(p.id)}"] .rv-additem input` });
}

async function runCoach() {
  if (!lastResult) return;
  cancelClaude();
  const ctl = new AbortController();
  state.ctl = ctl;
  const again = !!rv.coach?.text;
  rv.coach = { status: 'thinking', text: '' };
  renderReview({ scrollTo: '.rv-coach' });
  try {
    const text = await coachReview(summaryText(lastResult, reviewPrograms(), exById), {
      signal: ctl.signal,
      again,
      onText: ({ text: t }) => { rv.coach.text = t; const out = $('#rvCoachOut'); if (out) out.innerHTML = coachHtml(t); },
    });
    rv.coach = { status: 'done', text };
  } catch (err) {
    if (HIDE_CODES.has(err?.code)) state.claudeOff = true;
    rv.coach = { status: 'error', text: err?.text ?? '', msg: err?.code === 'cancelled' ? '' : ERROR_TEXT[err?.code] ?? T('An opinion is not available right now.', 'Δεν ήταν δυνατή η γνώμη αυτή τη στιγμή.') };
  } finally {
    if (state.ctl === ctl) state.ctl = null;
    if (state.mode === 'review' && rv.tab === 'tips') renderReview();
  }
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
      <div class="eyebrow"><span>${__G('Νέα άσκηση')}</span><span class="tag ai">Claude</span></div>
      <h2>${esc(q)}</h2>
      <p class="sub">${__G('Δεν υπάρχει στη βάση, οπότε τη ρωτάω στο Claude.')}</p>
      <div class="thinking"><i class="pulse"></i><span>${__G('Αναλύω ποιους μύες δουλεύει…')}</span><button type="button" class="btn" id="stopBtn">${__G('Διακοπή')}</button></div>
      <div class="stream" id="stream"></div>
    </article>`;
  $('#stopBtn').addEventListener('click', () => ctl.abort());
  try {
    const r = await analyzeExercise(q, { signal: ctl.signal, onText: ({ text }) => { const s = $('#stream'); if (s) s.textContent = text; } });
    if (state.ctl !== ctl) return;
    state.ctl = null;
    if (!r.recognized) { renderNotFound(q, results, __G('Το Claude δεν το αναγνώρισε ως σωματική άσκηση.')); return; }
    addCustom(r.exercise);
    showExercise(r.exercise, { frame: true });
  } catch (e) {
    if (state.ctl === ctl) state.ctl = null;
    if (HIDE_CODES.has(e?.code)) state.claudeOff = true;
    if (e?.code === 'cancelled') { renderNotFound(q, results); return; }
    renderNotFound(q, results, ERROR_TEXT[e?.code] ?? __G('Δεν ήταν δυνατή η ανάλυση αυτή τη στιγμή.'));
  }
}

function renderNotFound(q, results, message) {
  state.mode = 'none';
  state.ex = null;
  state.unit = null;
  const sugg = results.slice(0, 6);
  panel().innerHTML = `
    <article>
      <div class="eyebrow"><span>${__G('Αναζήτηση')}</span></div>
      <h2>${__G('Δεν βρέθηκε «')}${esc(q)}»</h2>
      ${message ? `<p class="msg">${esc(message)}</p>` : '<p class="sub">' + __G('Δοκίμασε πιο απλή περιγραφή, ελληνικά ή αγγλικά (π.χ. «κωπηλατική», «lat pulldown»), ή πάτα έναν μυ στο σώμα.') + '</p>'}
      ${sugg.length ? `<h3>${__G('Μήπως εννοείς')}</h3><div class="mchips">${sugg.map((r, i) => `<button type="button" class="mchip s" data-i="${i}">${esc(r.title)} <small>${r.type === 'muscle' ? __G('μυς') : __G('άσκηση')}</small></button>`).join('')}</div>` : ''}
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
  ul.innerHTML = suggestions.map((r, i) => `<li role="option" id="sg${i}" aria-selected="${i === active}" data-i="${i}"><span class="kind">${r.type === 'muscle' ? __G('Μυς') : __G('Άσκηση')}</span><span class="nm">${esc(r.title)}</span><span class="sub">${esc(r.sub || '')}</span></li>`).join('');
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
  else if (hash === 'review') showReview();
  else {
    const s = store.get('mx.sel', null);
    const t = s && s.kind === 'exercise' && typeof s.name === 'string' ? resolveExercise(s.name) : null;
    if (s && s.kind === 'review') showReview();
    else if (s && s.kind === 'program' && userProgram.length) showProgram();
    else if (t) { $('#exInput').value = s.name; showExercise(t, { frame: false }); }
    else if (s && s.kind === 'muscle' && MUSCLES[s.id]) showMuscle(s.id, { frame: false });
    else window.__mxProgram.empty();
  }
  getSample().then((s) => {
    rv.sampleOK = !!s;
    if (s && state.mode === 'review' && rv.tab === 'tips' && rv.tips) renderReview();
  });
  initViewer();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
