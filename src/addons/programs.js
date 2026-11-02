/* Μυϊκός Χάρτης — ενότητα «Προγράμματα»: δημιουργία, επεξεργασία και διαγραφή προγραμμάτων.
   Αποθήκευση: ιδιωτικά ανά χρήστη στο db του artifact όταν είναι διαθέσιμο, αλλιώς στον browser.
   Συνδέεται με τον χάρτη μέσω του window.__mxProgram (get / set / show / find / review) και δίνει
   στην αξιολόγηση τα αποθηκευμένα προγράμματα μέσω του window.__mxPrograms.
   Κάθε πρόγραμμα: { name, exercises: [ονόματα], plan?: { perWeek, inWeek, sets: [{ name, n }] } } —
   το plan το γράφει η αξιολόγηση (σετ ανά άσκηση, φορές την εβδομάδα, αν μετράει στην εβδομάδα). */
(() => {
var __G=window.__mxG||(s=>s);
  'use strict';

  const $ = (id) => document.getElementById(id);
  const mx = () => window.__mxProgram || null;
  const T = (en, el) => (window.__mxLang === 'en' ? en : el);

  // μικρό DOM helper: όλο το κείμενο του χρήστη μπαίνει με textContent, ποτέ με innerHTML
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  let store = null;
  let programs = [];
  let loaded = false;
  let editingId = null;       // 'new' | id | null
  let draft = null;           // κατάσταση φόρμας, επιβιώνει τα re-render όσο πληκτρολογείς
  let confirmDeleteId = null;
  let saving = false;
  let statusTimer = null;
  let view = 'map';

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  // τι δείχνει ο χάρτης (δεν επανέρχεται στο άνοιγμα: ο χάρτης είναι η αρχική σελίδα, μόνο με το σώμα)
  let sel = { kind: null };
  let shownIds = [];              // τα προγράμματα που στάλθηκαν στον χάρτη με «Δείξε στον χάρτη»
  const mapPick = new Set();      // τσεκαρισμένα προγράμματα για τον χάρτη
  let drillUntil = 0;

  // κλικ μέσα στην καρτέλα, στα chips ή στο σώμα = περιήγηση μέσα στο πρόγραμμα, δεν αλλάζει την επιλογή
  ['pointerdown', 'pointerup', 'click'].forEach((t) =>
    document.addEventListener(t, (e) => {
      if (e.target.closest && e.target.closest('#panel, #chips, #stage')) drillUntil = performance.now() + 1500;
    }, true));

  window.__mxSel = (kind, v) => {
    // ο χάρτης άλλαξε καρτέλα: το κουμπί «Αξιολόγηση» μένει πατημένο μόνο όσο φαίνεται η αξιολόγηση
    if (view !== 'programs') {
      const want = kind === 'review' ? 'review' : 'map';
      if (view !== want) { view = want; pressView(); }
    }
    // «Καθαρισμός χάρτη»: ξεχνά και τα προγράμματα του χάρτη και τις επιλογές
    if (!kind) { sel = { kind: null }; shownIds = []; mapPick.clear(); drillUntil = 0; updateShowBtn(); if (view === 'programs') renderPrograms(); applyNav(); return; }
    if ((sel.kind === 'program' || sel.kind === 'review') && kind !== sel.kind && performance.now() < drillUntil) return;
    sel = kind === 'exercise' ? { kind, name: v } : kind === 'muscle' ? { kind, id: v } : { kind };
    applyNav();
  };

  function applyNav() {
    const m = mx();
    const nav = document.querySelector('nav.program');
    const cur = m ? m.get() : [];
    nav.hidden = view === 'programs' || !(sel.kind === 'program' && cur.length);
    // τα ονόματα των προγραμμάτων που φαίνονται στον χάρτη
    const names = shownIds.map((id) => programs.find((q) => q.id === id)).filter(Boolean).map((q) => q.name);
    document.querySelector('.program-label').textContent = names.length ? names.join(' + ') : (__G("\u03a4\u03bf \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03ac \u03c3\u03bf\u03c5"));
  }

  function setStatus(msg) {
    $('pvStatus').textContent = msg || '';
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => { $('pvStatus').textContent = ''; }, 4000);
  }

  /* ---------------------------------------------------------- προβολές */
  function pressView() {
    document.querySelectorAll('#viewToggle [data-v]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.v === view)));
  }

  // v: 'map' | 'review' | 'programs'. Η αξιολόγηση είναι κατάσταση του χάρτη (σώμα + καρτέλα).
  // user: πάτημα στα κουμπιά προβολής — μόνο τότε το «Χάρτης» βγάζει τον χάρτη από την αξιολόγηση.
  function setView(v, user) {
    const prog = v === 'programs';
    const m = mx();
    // άνοιγμα των «Προγραμμάτων» = ένα βήμα στο ιστορικό (το «Πίσω» του κινητού γυρίζει στον χάρτη)
    if (prog && view !== 'programs' && m && m.histPush) m.histPush();
    view = v;
    document.querySelector('.main').hidden = prog;
    $('programsView').hidden = !prog;
    if (m && m.mode) {
      if (prog && m.flush) m.flush();
      const inReview = m.mode() === 'review';
      if (v === 'review' && !inReview) m.review();
      else if (v === 'map' && user && inReview) m.leaveReview();
    }
    applyNav();
    pressView();
    if (prog) renderPrograms();
  }

  /* ---------------------------------------------------------- αποθήκευση */
  function localStore() {
    const KEY = 'mx.programs';
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(list)) list = [];
    } catch (e) { list = []; }
    let cb = () => {};
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } };
    return {
      mode: 'local',
      subscribe(fn) { cb = fn; fn(list.slice()); return () => {}; },
      async save(p) {
        const now = Date.now();
        const i = list.findIndex((x) => x.id === p.id);
        let id = p.id;
        if (i >= 0) {
          list[i] = { ...list[i], name: p.name, exercises: p.exercises, updatedAt: now };
          if (p.plan) list[i].plan = p.plan;
        } else {
          id = 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6);
          list.push({ id, name: p.name, exercises: p.exercises, createdAt: now, updatedAt: now, ...(p.plan ? { plan: p.plan } : {}) });
        }
        persist(); cb(list.slice());
        return id;
      },
      async patch(id, ch) {
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) return;
        list[i] = { ...list[i], ...ch, updatedAt: Date.now() };
        persist(); cb(list.slice());
      },
      async remove(id) { list = list.filter((x) => x.id !== id); persist(); cb(list.slice()); },
    };
  }

  async function makeStore() {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const db = await window.claude.use('db');
        const user = await window.claude.use('user');
        const uid = db && user ? await user.id() : null;
        if (db && uid) {
          const col = db.collection('data/users/' + uid);
          return {
            mode: 'cloud',
            subscribe(fn) {
              return col.orderBy('createdAt', 'asc').onSnapshot(
                (snap) => fn(snap.docs.filter((d) => !String(d.id).startsWith('__')).map((d) => ({ id: d.id, ...d.data() }))),
                () => { setStatus((__G("\u0394\u03b5\u03bd \u03c6\u03bf\u03c1\u03c4\u03ce\u03b8\u03b7\u03ba\u03b1\u03bd \u03c4\u03b1 \u03c0\u03c1\u03bf\u03b3\u03c1\u03ac\u03bc\u03bc\u03b1\u03c4\u03b1."))); fn([]); },
              );
            },
            async save(p) {
              const ref = p.id ? col.doc(p.id) : col.doc();
              const body = {
                name: p.name,
                exercises: p.exercises,
                createdAt: p.createdAt || Date.now(),
                updatedAt: Date.now(),
              };
              if (p.plan) body.plan = p.plan;
              await ref.set(body);
              return ref.id;
            },
            // συγχώνευση: αλλάζει μόνο τα πεδία που δίνονται (π.χ. plan από την αξιολόγηση)
            async patch(id, ch) { await col.doc(id).update({ ...ch, updatedAt: Date.now() }); },
            async remove(id) { await col.doc(id).delete(); },
          };
        }
      }
    } catch (e) { /* πέφτει στην τοπική αποθήκευση */ }
    return localStore();
  }

  /* ---------------------------------------------------------- βοηθητικά */
  function canonicalNames(p) {
    const m = mx();
    const names = p.exercises.map((ex) => {
      const hit = m ? m.find(ex) : null;
      return hit ? hit.el : ex;
    });
    return [...new Set(names)];
  }
  const keyOf = (arr) => arr.join('\u0001');

  // οι ασκήσεις όλων των επιλεγμένων προγραμμάτων μαζί (χωρίς διπλές), με τη σειρά των προγραμμάτων
  function unionNames(ids) {
    const out = [];
    ids.map((id) => programs.find((q) => q.id === id)).filter(Boolean).forEach((p) => canonicalNames(p).forEach((n) => { if (!out.includes(n)) out.push(n); }));
    return out;
  }
  function showOnMap(ids) {
    const m = mx();
    if (!m) { setStatus((__G("\u039f \u03c7\u03ac\u03c1\u03c4\u03b7\u03c2 \u03b4\u03b5\u03bd \u03b5\u03af\u03bd\u03b1\u03b9 \u03ad\u03c4\u03bf\u03b9\u03bc\u03bf\u03c2 \u03b1\u03ba\u03cc\u03bc\u03b1. \u0394\u03bf\u03ba\u03af\u03bc\u03b1\u03c3\u03b5 \u03be\u03b1\u03bd\u03ac \u03c3\u03b5 \u03bb\u03af\u03b3\u03bf."))); return; }
    ids = ids.filter((id) => programs.some((q) => q.id === id));
    if (!ids.length) return;
    shownIds = ids;
    m.set(unionNames(ids), ids);
    sel = { kind: 'program' };
    setView('map');
    m.show();
  }
  // ένα πρόγραμμα του χάρτη άλλαξε ή διαγράφηκε: ο χάρτης δείχνει την τρέχουσα μορφή του
  function syncMap() {
    const m = mx();
    if (!m || !shownIds.length) return;
    const ids = shownIds.filter((id) => programs.some((q) => q.id === id));
    const names = unionNames(ids);
    if (keyOf(names) === keyOf(m.get()) && ids.length === shownIds.length) return;
    shownIds = ids;
    m.set(names, ids);
    if (!ids.length) { if (sel.kind === 'program') { sel = { kind: null }; m.empty(); } }
    else if (sel.kind === 'program' && view !== 'programs' && m.mode && m.mode() === 'program') m.show();
    applyNav();
  }

  function showExercise(text) {
    setView('map');
    $('exInput').value = text;
    const form = $('searchForm');
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }

  /* ---------------------------------------------------------- φόρμα */
  // o: { name, append: [{name, sets}], sets: {όνομα: σετ}, plan, returnTo: 'review', note }
  function openForm(p, presetText, o) {
    o = o || {};
    draft = p
      ? { id: p.id, name: p.name, text: p.exercises.join('\n'), createdAt: p.createdAt, error: '' }
      : { id: null, name: o.name || '', text: presetText || '', createdAt: null, error: '' };
    draft.setsHint = Object.assign({}, o.sets || {});
    draft.planHint = o.plan || null;
    draft.returnTo = o.returnTo || null;
    draft.note = o.note || '';
    (o.append || []).forEach((a) => {
      const lines = draft.text.split('\n').map((x) => x.trim()).filter(Boolean);
      if (!lines.includes(a.name)) lines.push(a.name);
      draft.text = lines.join('\n');
      if (a.sets) draft.setsHint[a.name] = a.sets;
    });
    if (!editingId && mx() && mx().histPush) mx().histPush();
    editingId = p ? p.id : 'new';
    confirmDeleteId = null;
    renderPrograms();
    const first = document.querySelector('#pvList .pform input');
    if (first) first.focus();
  }

  function closeForm() {
    const back = draft && draft.returnTo;
    draft = null; editingId = null; saving = false;
    renderPrograms();
    if (back === 'review') { setView('review'); return; }
    $('pvNew').focus();
  }

  // σετ ανά άσκηση για τη νέα λίστα: ίδιο όνομα → ίδια άσκηση με άλλο όνομα (μετονομασία) → υπόδειξη → 3
  function planFor(exercises, prevPlan, hint, planHint) {
    const m = mx();
    const idOf = (n) => { const hit = m && m.find ? m.find(n) : null; return hit ? hit.id : null; };
    const old = (prevPlan && Array.isArray(prevPlan.sets) ? prevPlan.sets : []).filter((x) => x && typeof x.name === 'string');
    const base = Object.assign({}, prevPlan || {}, planHint || {});
    const loose = (n) => (m && m.findLoose ? m.findLoose(n) : null);
    const sets = [...new Set(exercises)].map((name) => {
      if (hint && hint[name]) return { name, n: hint[name] };
      const same = old.find((x) => x.name === name);
      if (same) return { name, n: same.n };
      const id = idOf(name) || loose(name);
      const moved = id ? (old.find((x) => idOf(x.name) === id) || old.find((x) => !exercises.includes(x.name) && loose(x.name) === id)) : null;
      return { name, n: moved ? moved.n : 3 };
    });
    return { perWeek: base.perWeek || 1, inWeek: base.inWeek !== false, sets };
  }

  async function submitForm() {
    if (saving) return;
    const name = draft.name.trim();
    const exercises = draft.text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!name) { draft.error = (__G("\u0394\u03ce\u03c3\u03b5 \u03ad\u03bd\u03b1 \u03cc\u03bd\u03bf\u03bc\u03b1 \u03c3\u03c4\u03bf \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1.")); renderPrograms(); return; }
    if (!exercises.length) { draft.error = (__G("\u03a0\u03c1\u03cc\u03c3\u03b8\u03b5\u03c3\u03b5 \u03c4\u03bf\u03c5\u03bb\u03ac\u03c7\u03b9\u03c3\u03c4\u03bf\u03bd \u03bc\u03af\u03b1 \u03ac\u03c3\u03ba\u03b7\u03c3\u03b7.")); renderPrograms(); return; }
    saving = true; draft.error = ''; renderPrograms();
    try {
      const prev = draft.id ? programs.find((q) => q.id === draft.id) : null;
      const plan = planFor(exercises, prev && prev.plan, draft.setsHint, draft.planHint);
      await queued(draft.id || 'new', () => store.save({ id: draft.id, name, exercises, createdAt: draft.createdAt, plan }));
      const wasNew = !draft.id;
      closeForm();
      setStatus(wasNew ? (__G("\u03a4\u03bf \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1 \u03b4\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03ae\u03b8\u03b7\u03ba\u03b5.")) : (__G("\u039f\u03b9 \u03b1\u03bb\u03bb\u03b1\u03b3\u03ad\u03c2 \u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03cd\u03c4\u03b7\u03ba\u03b1\u03bd.")));
    } catch (e) {
      saving = false;
      draft.error = (__G("\u0394\u03b5\u03bd \u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03cd\u03c4\u03b7\u03ba\u03b5. \u0394\u03bf\u03ba\u03af\u03bc\u03b1\u03c3\u03b5 \u03be\u03b1\u03bd\u03ac."));
      renderPrograms();
    }
  }

  async function doDelete(id) {
    try {
      await store.remove(id);
      mapPick.delete(id);
      confirmDeleteId = null;
      setStatus((__G("\u03a4\u03bf \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1 \u03b4\u03b9\u03b1\u03b3\u03c1\u03ac\u03c6\u03b7\u03ba\u03b5.")));
      renderPrograms();
    } catch (e) {
      setStatus((__G("\u0394\u03b5\u03bd \u03b4\u03b9\u03b1\u03b3\u03c1\u03ac\u03c6\u03b7\u03ba\u03b5. \u0394\u03bf\u03ba\u03af\u03bc\u03b1\u03c3\u03b5 \u03be\u03b1\u03bd\u03ac.")));
    }
  }

  function formCard() {
    const nameInput = h('input', {
      type: 'text', id: 'pfName', value: draft.name, maxlength: '60', autocomplete: 'off',
      placeholder: (__G("\u03c0.\u03c7. Push, \u03a0\u03cc\u03b4\u03b9\u03b1, \u03a0\u03bb\u03ac\u03c4\u03b7\u2026")),
      oninput: (e) => { draft.name = e.target.value; },
    });
    const area = h('textarea', {
      id: 'pfEx', value: draft.text, rows: '7', spellcheck: 'false',
      placeholder: (__G("\u039c\u03af\u03b1 \u03ac\u03c3\u03ba\u03b7\u03c3\u03b7 \u03b1\u03bd\u03ac \u03b3\u03c1\u03b1\u03bc\u03bc\u03ae, \u03c0.\u03c7.")+"\nBench press\n"+__G("\u039a\u03b1\u03b8\u03af\u03c3\u03bc\u03b1\u03c4\u03b1")+"\nSkull crusher"),
      oninput: (e) => { draft.text = e.target.value; },
    });
    return h('div', {
      class: 'pcard pform',
      onkeydown: (e) => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); closeForm(); } },
    },
      draft.note ? h('p', { class: 'pform-note', role: 'status', text: draft.note }) : null,
      h('div', { class: 'field' }, h('label', { for: 'pfName', text: (__G("\u038c\u03bd\u03bf\u03bc\u03b1 \u03c0\u03c1\u03bf\u03b3\u03c1\u03ac\u03bc\u03bc\u03b1\u03c4\u03bf\u03c2")) }), nameInput),
      h('div', { class: 'field' },
        h('label', { for: 'pfEx', text: (__G("\u0391\u03c3\u03ba\u03ae\u03c3\u03b5\u03b9\u03c2")) }), area,
        h('p', { class: 'field-hint', text: (__G("\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac \u03ae \u03b1\u03b3\u03b3\u03bb\u03b9\u03ba\u03ac. \u038c\u03c3\u03b5\u03c2 \u03b4\u03b5\u03bd \u03b1\u03bd\u03b1\u03b3\u03bd\u03c9\u03c1\u03b9\u03c3\u03c4\u03bf\u03cd\u03bd \u03b8\u03b1 \u03c6\u03b1\u03af\u03bd\u03bf\u03bd\u03c4\u03b1\u03b9 \u03bc\u03b5 \u03b4\u03b9\u03b1\u03ba\u03b5\u03ba\u03bf\u03bc\u03bc\u03ad\u03bd\u03bf \u03c0\u03b5\u03c1\u03af\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1.")) })),
      draft.error ? h('p', { class: 'form-error', role: 'alert', text: draft.error }) : null,
      h('div', { class: 'pactions' },
        h('button', {
          class: 'btn primary', type: 'button', disabled: saving, onclick: submitForm,
          text: saving ? (__G("\u0391\u03c0\u03bf\u03b8\u03ae\u03ba\u03b5\u03c5\u03c3\u03b7\u2026")) : (__G("\u0391\u03c0\u03bf\u03b8\u03ae\u03ba\u03b5\u03c5\u03c3\u03b7")),
        }),
        h('button', { class: 'btn', type: 'button', disabled: saving, onclick: closeForm, text: (__G("\u0386\u03ba\u03c5\u03c1\u03bf")) })));
  }

  /* ---------------------------------------------------------- κάρτα προγράμματος */
  function programCard(p) {
    const m = mx();
    const known = p.exercises.map((ex) => (m ? !!m.find(ex) : true));
    const unknownCount = known.filter((k) => !k).length;
    const n = p.exercises.length;

    const chips = h('div', { class: 'chips' });
    p.exercises.forEach((ex, i) => {
      chips.appendChild(h('button', {
        class: 'chip' + (known[i] ? '' : ' unknown'), type: 'button',
        title: known[i] ? (__G("\u0394\u03b5\u03c2 \u03b1\u03c5\u03c4\u03ae \u03c4\u03b7\u03bd \u03ac\u03c3\u03ba\u03b7\u03c3\u03b7 \u03c3\u03c4\u03bf\u03bd \u03c7\u03ac\u03c1\u03c4\u03b7")) : (__G("\u0394\u03b5\u03bd \u03b1\u03bd\u03b1\u03b3\u03bd\u03c9\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5 \u03c3\u03c4\u03b7 \u03b2\u03ac\u03c3\u03b7 \u03b1\u03c3\u03ba\u03ae\u03c3\u03b5\u03c9\u03bd\u00b7 \u03c0\u03ac\u03c4\u03b1 \u03b3\u03b9\u03b1 \u03b1\u03bd\u03b1\u03b6\u03ae\u03c4\u03b7\u03c3\u03b7")),
        onclick: () => showExercise(ex), text: (known[i] && m.find(ex) && m.find(ex).el) || ex,
      }));
    });

    let actions;
    if (confirmDeleteId === p.id) {
      actions = h('div', { class: 'pactions' },
        h('span', { class: 'confirm-text bad', text: (__G("\u039d\u03b1 \u03b4\u03b9\u03b1\u03b3\u03c1\u03b1\u03c6\u03b5\u03af \u03c4\u03bf \u00ab")) + p.name + '»' + (window.__mxLang === 'en' ? '?' : ';') }),
        h('button', { class: 'btn danger solid', type: 'button', onclick: () => doDelete(p.id), text: (__G("\u039d\u03b1\u03b9, \u03b4\u03b9\u03b1\u03b3\u03c1\u03b1\u03c6\u03ae")) }),
        h('button', { class: 'btn', type: 'button', onclick: () => { confirmDeleteId = null; renderPrograms(); }, text: (__G("\u0386\u03ba\u03c5\u03c1\u03bf")) }));
    } else {
      actions = h('div', { class: 'pactions' },
        h('button', { class: 'btn', type: 'button', onclick: () => openForm(p), text: (__G("\u0395\u03c0\u03b5\u03be\u03b5\u03c1\u03b3\u03b1\u03c3\u03af\u03b1")) }),
        h('button', { class: 'btn danger', type: 'button', onclick: () => { confirmDeleteId = p.id; renderPrograms(); }, text: (__G("\u0394\u03b9\u03b1\u03b3\u03c1\u03b1\u03c6\u03ae")) }));
    }

    const meta = n + (n === 1 ? (" "+__G("\u03ac\u03c3\u03ba\u03b7\u03c3\u03b7")) : (" "+__G("\u03b1\u03c3\u03ba\u03ae\u03c3\u03b5\u03b9\u03c2"))) +
      (unknownCount ? ' · ' + unknownCount + (unknownCount === 1 ? (" "+__G("\u03b4\u03b5\u03bd \u03b1\u03bd\u03b1\u03b3\u03bd\u03c9\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5")) : (" "+__G("\u03b4\u03b5\u03bd \u03b1\u03bd\u03b1\u03b3\u03bd\u03c9\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b1\u03bd"))) : '');

    // επιλογή για τον χάρτη: όσα τσεκάρεις εμφανίζονται μαζί με «Δείξε στον χάρτη»
    const pickId = 'pick-' + p.id;
    const pick = h('label', { class: 'ppick', for: pickId },
      h('input', { type: 'checkbox', id: pickId, checked: mapPick.has(p.id), onchange: (e) => { if (e.target.checked) mapPick.add(p.id); else mapPick.delete(p.id); updateShowBtn(); } }),
      h('span', { text: T('Show on map', 'Στον χάρτη') }));
    return h('article', { class: 'pcard' + (mapPick.has(p.id) ? ' picked' : '') },
      h('div', { class: 'phead' }, h('h3', { text: p.name }), pick),
      h('p', { class: 'pmeta', text: meta }),
      chips, actions);
  }

  // «Δείξε στον χάρτη»: όλες οι ασκήσεις των τσεκαρισμένων προγραμμάτων μαζί στο σώμα
  let showBtn = null;
  function updateShowBtn() {
    if (!showBtn) return;
    const n = [...mapPick].filter((id) => programs.some((q) => q.id === id)).length;
    showBtn.disabled = !n;
    showBtn.textContent = n ? T(`Show on map (${n})`, `Δείξε στον χάρτη (${n})`) : T('Show on map', 'Δείξε στον χάρτη');
    document.querySelectorAll('#pvList .pcard').forEach((c) => { const cb = c.querySelector('.ppick input'); if (cb) c.classList.toggle('picked', cb.checked); });
  }

  /* ---------------------------------------------------------- render */
  function renderPrograms() {
    const root = $('pvList');
    root.replaceChildren();

    // το πρόγραμμα που επεξεργαζόμουν διαγράφηκε αλλού: κλείσε τη φόρμα
    if (editingId && editingId !== 'new' && !programs.some((p) => p.id === editingId)) {
      editingId = null; draft = null; saving = false;
    }

    $('pvSaveCurrent').hidden = true;
    $('pvNew').disabled = !store || editingId === 'new';
    updateShowBtn();

    if (editingId === 'new') root.appendChild(formCard());
    if (!loaded) { root.appendChild(h('p', { class: 'pempty', text: (__G("\u03a6\u03cc\u03c1\u03c4\u03c9\u03c3\u03b7\u2026")) })); return; }
    if (!programs.length && editingId !== 'new') {
      root.appendChild(h('p', { class: 'pempty', text: (__G("\u0394\u03b5\u03bd \u03ad\u03c7\u03b5\u03b9\u03c2 \u03c6\u03c4\u03b9\u03ac\u03be\u03b5\u03b9 \u03b1\u03ba\u03cc\u03bc\u03b1 \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1. \u03a0\u03ac\u03c4\u03b1 \u00ab\u039d\u03ad\u03bf \u03c0\u03c1\u03cc\u03b3\u03c1\u03b1\u03bc\u03bc\u03b1\u00bb \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03be\u03b5\u03ba\u03b9\u03bd\u03ae\u03c3\u03b5\u03b9\u03c2.")) }));
      return;
    }
    programs.forEach((p) => root.appendChild(p.id === editingId ? formCard() : programCard(p)));
  }

  /* ---------------------------------------------------------- εκκίνηση */
  document.querySelectorAll('#viewToggle [data-v]').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.v, true)));
  $('pvNew').addEventListener('click', () => openForm(null));
  showBtn = h('button', { type: 'button', class: 'btn primary', id: 'pvShowMap', disabled: true, onclick: () => showOnMap(programs.filter((q) => mapPick.has(q.id)).map((q) => q.id)) });
  $('pvNew').classList.remove('primary');
  $('pvNew').parentElement.appendChild(showBtn);
  updateShowBtn();
  $('pvSaveCurrent').addEventListener('click', () => {
    const m = mx();
    openForm(null, m ? m.get().join('\n') : '');
  });
  // μια αναζήτηση από την κορυφή πρέπει πάντα να οδηγεί στον χάρτη
  $('searchForm').addEventListener('submit', () => setView('map'));
  // «Πίσω» του κινητού στα «Προγράμματα»: κλείνει φόρμα ή επιβεβαίωση, αλλιώς γυρίζει στον χάρτη
  if (mx() && mx().onBack) mx().onBack(() => {
    if (view !== 'programs') return false;
    if (editingId) closeForm();
    else if (confirmDeleteId) { confirmDeleteId = null; renderPrograms(); }
    else setView('map');
    return true;
  });

  // γραμμή «Πίσω» πάνω από την καρτέλα, όσο υπάρχει προηγούμενη προβολή
  const panel = $('panel');
  function syncBack() {
    const m = mx();
    const n = m && m.navDepth ? m.navDepth() : 0;
    const bar = panel.querySelector(':scope > .backbar');
    if (!n) { if (bar) bar.remove(); return; }
    if (bar) return;
    panel.insertBefore(
      h('div', { class: 'backbar' },
        h('button', { class: 'btn', type: 'button', onclick: () => mx().back(), text: '\u2190 ' + m.navLabel() })),
      panel.firstChild);
  }
  if (panel && window.MutationObserver) new MutationObserver(syncBack).observe(panel, { childList: true });
  syncBack();

  /* ---------------------------------------------------------- API για την αξιολόγηση */
  // μία εγγραφή τη φορά ανά πρόγραμμα (κανόνας του db), με τη σειρά που ζητήθηκαν
  const writes = new Map();
  function queued(id, fn) {
    const next = (writes.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    writes.set(id, next);
    const done = () => { if (writes.get(id) === next) writes.delete(id); };
    next.then(done, done);
    return next;
  }
  const notify = () => { const m = mx(); if (m && m.onPrograms) m.onPrograms(); };
  const cleanNames = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 60) : []);

  window.__mxPrograms = {
    list: () => programs.slice(),
    ready: () => loaded && !!store,
    // ch: { exercises?, plan? } — αλλάζει μόνο αυτά τα πεδία
    patch(id, ch) {
      if (!store) return Promise.reject(new Error('not ready'));
      const body = {};
      if (ch.exercises) body.exercises = cleanNames(ch.exercises);
      if (ch.plan) body.plan = ch.plan;
      // στο cloud η λίστα ενημερώνεται αμέσως εδώ, ώστε φόρμα και κάρτες να βλέπουν την αλλαγή
      if (store.mode === 'cloud') { programs = programs.map((p) => (p.id === id ? { ...p, ...body } : p)); notify(); }
      return queued(id, () => store.patch(id, body));
    },
    create(p) {
      if (!store) return Promise.reject(new Error('not ready'));
      return queued('new', () => store.save({ name: String(p.name || '').trim().slice(0, 60) || '—', exercises: cleanNames(p.exercises), plan: p.plan }));
    },
    openNew(text, o) { setView('programs'); openForm(null, text || '', o); },
    openEdit(id, o) { const p = programs.find((q) => q.id === id); if (p) { setView('programs'); openForm(p, '', o); } },
    view: () => view,
    show() { setView('programs'); },
  };

  // πρότυπα προπονητή: εδώ, στην ενότητα «Προγράμματα», που είναι η μόνη που προσθέτει ή αφαιρεί ασκήσεις
  (function templatePicker() {
    const m = mx();
    const tp = m && m.templates ? m.templates() : null;
    const box = document.querySelector('#programsView .pv-actions');
    if (!tp || !box) return;
    const sel = h('select', { id: 'pvTemplate', class: 'pv-template', 'aria-label': T('Add a coach template', 'Πρόσθεσε πρότυπο προπονητή') },
      h('option', { value: '', text: T('Add a coach template…', 'Πρόσθεσε πρότυπο προπονητή…') }),
      h('optgroup', { label: T('A complete week', 'Ολόκληρη εβδομάδα') }, tp.packs.map((k) => h('option', { value: 'pack:' + k.id, text: k.name + ' · ' + k.note }))),
      h('optgroup', { label: T('One program', 'Ένα πρόγραμμα') }, tp.list.map((t) => h('option', { value: t.id, text: t.name + ' · ' + t.perWeek + T('× / week', '× / εβδ.') }))));
    sel.addEventListener('change', async () => {
      const v = sel.value;
      sel.value = '';
      if (!v || !store) return;
      if (v.startsWith('pack:')) {
        sel.disabled = true;
        try {
          const made = await m.addTemplates(tp.packs.find((k) => 'pack:' + k.id === v).ids);
          setStatus(T('Added: ', 'Προστέθηκαν: ') + made.map((x) => x.name).join(', '));
        } catch (e) { setStatus(T('The template could not be added. Try again.', 'Το πρότυπο δεν προστέθηκε. Δοκίμασε ξανά.')); }
        sel.disabled = false;
        return;
      }
      const t = tp.list.find((x) => x.id === v);
      if (!t) return;
      const sets = {};
      t.items.forEach((it) => { sets[it.name] = it.sets; });
      openForm(null, t.items.map((it) => it.name).join('\n'), { name: t.name, sets, plan: { perWeek: t.perWeek, inWeek: true } });
    });
    box.insertBefore(sel, box.firstChild);
  })();

  const chipsEl = $('chips');
  if (chipsEl && window.MutationObserver) new MutationObserver(applyNav).observe(chipsEl, { childList: true });
  // ο χάρτης μπορεί να ξεκίνησε ήδη στην αξιολόγηση (επιλογή της προηγούμενης επίσκεψης)
  if (mx() && mx().mode && mx().mode() === 'review') { view = 'review'; pressView(); }
  applyNav();
  renderPrograms();
  makeStore().then((s) => {
    store = s;
    if (s.mode === 'local') $('pvNote').textContent = (__G("\u03a4\u03b1 \u03c0\u03c1\u03bf\u03b3\u03c1\u03ac\u03bc\u03bc\u03b1\u03c4\u03b1 \u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03cd\u03bf\u03bd\u03c4\u03b1\u03b9 \u03bc\u03cc\u03bd\u03bf \u03c3\u03b5 \u03b1\u03c5\u03c4\u03cc\u03bd \u03c4\u03bf\u03bd browser."));
    s.subscribe((list) => {
      programs = list;
      loaded = true;
      if (confirmDeleteId && !programs.some((p) => p.id === confirmDeleteId)) confirmDeleteId = null;
      [...mapPick].forEach((id) => { if (!programs.some((p) => p.id === id)) mapPick.delete(id); });
      syncMap();
      applyNav();
      renderPrograms();
      notify();
    });
  });
})();
