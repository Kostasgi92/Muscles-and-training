/* Progressive-overload log, scoring and suggestions for the program review.
   Log = list of "levels": {id, ex, kg, sets, reps, since:"YYYY-MM-DD", at}. The newest level of an exercise is its current one.
   Stored in this browser (localStorage "mx.log") and, when available, privately per user in the artifact db (doc "__log"). */
(() => {
  'use strict';
  const EL = window.__mxLang === 'el';
  const T = (en, el) => (EL ? el : en);
  const KEY = 'mx.log';
  const READY_DAYS = 14, STALL_DAYS = 28;
  const LOWER = ['quads', 'hamstrings', 'glute_max', 'glute_med', 'calves', 'erectors', 'adductors', 'iliopsoas'];
  const GROUPS = {
    chest: ['chest', 'pec_minor'], back: ['lats', 'trapezius', 'rhomboids', 'teres_major', 'erectors'],
    shoulders: ['deltoid', 'rotator_cuff'], biceps: ['biceps', 'brachialis'], triceps: ['triceps'],
    quads: ['quads'], hamstrings: ['hamstrings'], glutes: ['glute_max', 'glute_med'], calves: ['calves'],
    core: ['rectus_abd', 'ext_oblique', 'int_oblique', 'transversus'],
  };
  const GNAME = {
    chest: T('chest', 'στήθος'), back: T('back', 'πλάτη'), shoulders: T('shoulders', 'ώμοι'), biceps: T('biceps', 'δικέφαλα'),
    triceps: T('triceps', 'τρικέφαλα'), quads: T('quads', 'τετρακέφαλοι'), hamstrings: T('hamstrings', 'οπίσθιοι μηριαίοι'),
    glutes: T('glutes', 'γλουτοί'), calves: T('calves', 'γάμπες'), core: T('core', 'κορμός/κοιλιακοί'),
  };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const SUGGEST = {
    chest: 'Bench press', back: 'Lat pulldown', shoulders: 'Lateral raise', biceps: 'Barbell curl', triceps: 'Cable pushdown',
    quads: 'Squat', hamstrings: 'Romanian deadlift', glutes: 'Hip thrust', calves: 'Calf raise', core: 'Plank',
  };

  /* ------------------------------------------------------------ store */
  const valid = (e) => e && typeof e.ex === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.since || '') &&
    Number.isFinite(+e.kg) && +e.kg >= 0 && Number.isFinite(+e.sets) && +e.sets > 0 && Number.isFinite(+e.reps) && +e.reps > 0;
  const clean = (e) => ({ id: String(e.id || Math.random().toString(36).slice(2, 10)), ex: e.ex, kg: +e.kg, sets: Math.round(+e.sets), reps: Math.round(+e.reps), since: e.since, at: +e.at || Date.now() });
  let entries = [];
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(a)) entries = a.filter(valid).map(clean); } catch (e) { entries = []; }
  const listeners = [];
  const emit = () => listeners.slice().forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  let cloudDoc = null;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) { /* ignore */ }
    if (cloudDoc) cloudDoc.set({ entries, createdAt: 0, updatedAt: Date.now() }).catch(() => {});
  }
  async function initCloud() {
    try {
      if (!(window.claude && typeof window.claude.use === 'function')) return;
      const db = await window.claude.use('db');
      const user = await window.claude.use('user');
      const uid = db && user ? await user.id() : null;
      if (!db || !uid) return;
      const doc = db.doc('data/users/' + uid + '/__log');
      cloudDoc = doc;
      doc.onSnapshot((snap) => {
        if (snap.exists) {
          const d = snap.data() || {};
          const remote = (Array.isArray(d.entries) ? d.entries : []).filter(valid).map(clean);
          if (JSON.stringify(remote) !== JSON.stringify(entries)) {
            entries = remote;
            try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) { /* ignore */ }
            emit();
          }
        } else if (entries.length) {
          doc.set({ entries, createdAt: 0, updatedAt: Date.now() }).catch(() => {});
        }
      }, () => {});
    } catch (e) { /* local only */ }
  }

  /* ------------------------------------------------------------ helpers */
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const daysSince = (s) => Math.max(0, Math.round((parse(today()) - parse(s)) / 86400000));
  const fmtDate = (s) => { try { return parse(s).toLocaleDateString(EL ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } };
  const fmtKg = (k) => (k === 0 ? T('bodyweight', 'σωματικό βάρος') : (Math.round(k * 100) / 100) + ' kg');
  const lvlText = (l) => fmtKg(l.kg) + ' · ' + l.sets + ' × ' + l.reps;
  const hist = (id) => entries.filter((e) => e.ex === id).sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.at - b.at));
  const gid = (m) => String(m).split('.')[0];
  const isLower = (ex) => (ex.p || []).some((m) => LOWER.includes(gid(m)));

  function status(ex) {
    const h = hist(ex.id);
    if (!h.length) return null;
    const cur = h[h.length - 1];
    const days = daysSince(cur.since);
    const kind = days >= STALL_DAYS ? 'stalled' : days >= READY_DAYS ? 'ready' : 'fresh';
    const inc = isLower(ex) ? 5 : 2.5;
    let target;
    if (cur.kg === 0) target = { kg: 0, sets: cur.sets, reps: cur.reps + 2 };
    else if (cur.reps >= 10) target = { kg: cur.kg + inc, sets: cur.sets, reps: Math.max(6, cur.reps - 2) };
    else target = { kg: cur.kg, sets: cur.sets, reps: cur.reps + 1 };
    const raised = h.length > 1 && (cur.kg > h[h.length - 2].kg || (cur.kg === h[h.length - 2].kg && cur.reps > h[h.length - 2].reps));
    return { cur, days, kind, target, raised, history: h, readyOn: READY_DAYS - days };
  }
  const targetText = (t) => (t.kg === 0 ? t.sets + ' × ' + t.reps : fmtKg(t.kg) + ' · ' + t.sets + ' × ' + t.reps);

  function add(ex, kg, sets, reps, since) {
    const e = clean({ ex, kg, sets, reps, since });
    if (!valid(e)) return false;
    entries.push(e); persist(); emit(); return true;
  }
  function remove(id) { entries = entries.filter((e) => e.id !== id); persist(); emit(); }


  /* ------------------------------------------------------------ overload score (0-10) */
  const exName = (ex) => (EL ? (ex.el || ex.en) : (ex.en || ex.el)) || ex.id;
  function overload(programs, exMap) {
    const w = new Map();
    (programs || []).filter((p) => p.active !== false).forEach((p) => (p.items || []).forEach((it) => {
      if (it && it.ex && it.sets > 0 && exMap.get(it.ex)) w.set(it.ex, (w.get(it.ex) || 0) + it.sets);
    }));
    let tot = 0, logged = 0, health = 0;
    const items = [];
    w.forEach((sets, id) => {
      const ex = exMap.get(id); const st = status(ex);
      tot += sets;
      let hv = 0;
      if (st) {
        logged += sets;
        hv = st.raised || st.kind === 'fresh' ? 1 : st.kind === 'ready' ? 0.7 : st.days >= 42 ? 0.1 : 0.4;
        health += sets * hv;
      }
      items.push({ ex: id, name: exName(ex), kind: st ? st.kind : 'none', days: st ? st.days : 0, target: st ? targetText(st.target) : '', cur: st ? lvlText(st.cur) : '', sets });
    });
    const n = items.length;
    const score = tot ? 10 * (0.5 * (logged / tot) + 0.5 * (logged ? health / logged : 0)) : 0;
    return {
      score, items, n,
      logged: items.filter((x) => x.kind !== 'none').length,
      ready: items.filter((x) => x.kind === 'ready'),
      stalled: items.filter((x) => x.kind === 'stalled'),
      unlogged: items.filter((x) => x.kind === 'none').sort((a, b) => b.sets - a.sets),
    };
  }
  const names = (a, k) => a.slice(0, k).map((x) => x.name).join(', ') + (a.length > k ? '…' : '');
  function tips(ov) {
    const out = [];
    if (!ov || !ov.n) return out;
    if (ov.stalled.length) out.push({ kind: 'overload', title: T(`${ov.stalled.length} ${ov.stalled.length === 1 ? 'lift has' : 'lifts have'} stalled`, `${ov.stalled.length} ${ov.stalled.length === 1 ? 'άσκηση έχει' : 'ασκήσεις έχουν'} κολλήσει`),
      text: T(`No progression for 4+ weeks on ${names(ov.stalled, 3)}. Add weight or a rep (next: ${ov.stalled[0].target}), or take a lighter week and rebuild.`, `Καμία πρόοδος εδώ και 4+ εβδομάδες σε: ${names(ov.stalled, 3)}. Πρόσθεσε κιλά ή επανάληψη (επόμενο: ${ov.stalled[0].target}) ή κάνε μια ελαφριά εβδομάδα και ξαναχτίσε.`),
      actions: [{ type: 'progress', ex: ov.stalled[0].ex }] });
    if (ov.ready.length) out.push({ kind: 'overload', title: T(`Time to progress: ${names(ov.ready, 2)}`, `Ώρα για αύξηση: ${names(ov.ready, 2)}`),
      text: T(`You have held the same load for 2+ weeks. If every set felt clean, go to ${ov.ready[0].target}.`, `Κρατάς το ίδιο φορτίο 2+ εβδομάδες. Αν όλα τα σετ ήταν καθαρά, πήγαινε σε ${ov.ready[0].target}.`),
      actions: [{ type: 'progress', ex: ov.ready[0].ex }] });
    if (ov.unlogged.length) out.push({ kind: 'overload', title: ov.logged ? T(`${ov.unlogged.length} ${ov.unlogged.length === 1 ? 'exercise has' : 'exercises have'} no logged weights`, `${ov.unlogged.length} ${ov.unlogged.length === 1 ? 'άσκηση χωρίς' : 'ασκήσεις χωρίς'} καταγραφή κιλών`) : T('Start tracking progressive overload', 'Ξεκίνα την καταγραφή προόδου φορτίου'),
      text: T(`Log the weight, sets, reps and start date for ${names(ov.unlogged, 3)}. Without it the app cannot tell you when to move up, and the plan loses up to 12% of its score.`, `Κατέγραψε κιλά, σετ, επαναλήψεις και ημερομηνία έναρξης για: ${names(ov.unlogged, 3)}. Χωρίς αυτά η εφαρμογή δεν μπορεί να σου πει πότε να ανέβεις και το πρόγραμμα χάνει έως και 12% του βαθμού.`),
      actions: [{ type: 'progress', ex: ov.unlogged[0].ex }] });
    return out;
  }
  function coachLines(ov) {
    if (!ov || !ov.n) return [];
    const l = [T(`Progressive overload ${Math.round(ov.score * 10) / 10}/10: ${ov.logged} of ${ov.n} exercises logged.`, `Πρόοδος φορτίου ${Math.round(ov.score * 10) / 10}/10: ${ov.logged} από ${ov.n} ασκήσεις καταγεγραμμένες.`)];
    ov.items.filter((x) => x.kind !== 'none').forEach((x) => l.push(`${x.name}: ${x.cur}, ${x.days} ${T('days at this level', 'μέρες σε αυτό το φορτίο')} (${x.kind})`));
    if (ov.unlogged.length) l.push(T('Not logged: ', 'Χωρίς καταγραφή: ') + ov.unlogged.map((x) => x.name).join(', '));
    return l;
  }
  const sig = () => entries.map((e) => e.id + e.since + e.kg + e.sets + e.reps).join('|') + '@' + today();

  /* ------------------------------------------------------------ Progress tab */
  const openSet = new Set();
  function mountTab(host, programs) {
    if (!host) return;
    const m = window.__mxProgram;
    const seen = new Set(); const rows = [];
    (programs || []).filter((p) => p.active !== false).forEach((p) => (p.items || []).forEach((it) => {
      const ex = m && m.exById(it.ex);
      if (ex && !seen.has(ex.id)) { seen.add(ex.id); rows.push(ex); }
    }));
    host.replaceChildren();
    host.appendChild(h('p', { class: 'pg-intro', text: T('Log the weight, sets and reps you lift now and the day you started with them. The review uses this to tell you when to move up.', 'Κατέγραψε τα κιλά, τα σετ και τις επαναλήψεις που κάνεις τώρα και την ημέρα που ξεκίνησες. Η αξιολόγηση το χρησιμοποιεί για να σου πει πότε να ανέβεις.') }));
    if (!rows.length) { host.appendChild(h('p', { class: 'pg-sub', text: T('Tick a program with exercises to track its progression.', 'Τσέκαρε ένα πρόγραμμα με ασκήσεις για να παρακολουθείς την πρόοδο.') })); return; }
    rows.forEach((ex) => {
      const wrap = h('div', { class: 'pg-row', 'data-pgex': ex.id });
      wrap.appendChild(h('h4', { class: 'pg-name', text: exName(ex) }));
      mountExercise(wrap, ex, openSet.has(ex.id) || api.focus === ex.id);
      const d = wrap.querySelector('details');
      d.addEventListener('toggle', () => { if (d.open) openSet.add(ex.id); else openSet.delete(ex.id); });
      host.appendChild(wrap);
    });
    api.focus = null;
  }

  const css = `
.pg{margin-top:6px}
.pg>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-2);font-weight:700;margin:22px 0 8px}
.pg>summary::-webkit-details-marker{display:none}
.pg>summary::before{content:"▸";font-size:.8rem}
.pg[open]>summary::before{content:"▾"}
.exbody .pg>summary{margin:14px 0 6px}
.pg-st{font-size:.7rem;letter-spacing:.03em;text-transform:none;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--ink)}
.pg-st.ready{background:var(--second-soft);border-color:var(--second)}
.pg-st.stalled{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.pg-st.fresh{background:var(--surface-2)}
.pg-box{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:12px}
.pg-cur{font-size:1.05rem;font-weight:700;margin:0}
.pg-sub{margin:2px 0 0;font-size:.84rem;color:var(--ink-2)}
.pg-next{margin:8px 0 0;font-size:.88rem}
.pg-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.pg-form label{display:block;font-size:.74rem;color:var(--ink-2);margin-bottom:3px}
.pg-form input{width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);font-size:.95rem}
.pg-form input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.pg-form .wide{grid-column:1/-1}
.pg-form .btn{grid-column:1/-1;justify-content:center}
.pg-hint{margin:6px 0 0;font-size:.76rem;color:var(--ink-2)}
.pg-err{margin:6px 0 0;font-size:.82rem;color:var(--danger,#b3261e);font-weight:600}
.pg-hist{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:4px;font-size:.84rem}
.pg-hist li{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--line);padding-top:4px}
.pg-hist .d{color:var(--ink-2);min-width:92px}
.pg-hist .v{flex:1;font-variant-numeric:tabular-nums}
.pg-hist .chg{color:var(--accent);font-weight:700}
.pg-hist button{border:none;background:none;color:var(--ink-2);padding:0 4px}
.pg-hist button:hover{color:var(--accent)}
.pg-row{margin:0 0 6px;border-top:1px solid var(--line)}
.pg-row:first-of-type{border-top:none}
.pg-name{margin:12px 0 0;font-size:.98rem}
.pg-intro{font-size:.88rem;color:var(--ink-2);margin:0 0 6px}
.pg-row .pg>summary{margin:6px 0 8px}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  const stLabel = { fresh: T('On track', 'Στην ώρα'), ready: T('Ready to progress', 'Έτοιμος για αύξηση'), stalled: T('Stalled', 'Στασιμότητα') };

  /* ------------------------------------------------------------ exercise section */
  function mountExercise(host, ex, open) {
    const det = h('details', { class: 'pg' });
    if (open) det.open = true;
    const body = h('div');
    let draft = { kg: '', sets: '', reps: '', since: today(), err: '' };
    let seeded = false;
    function render() {
      const st = status(ex);
      const sum = h('summary', {}, T('Progression', 'Πρόοδος φορτίου'),
        st ? h('span', { class: 'pg-st ' + st.kind, text: stLabel[st.kind] }) : null);
      det.replaceChildren(sum, body);
      body.replaceChildren();
      const box = h('div', { class: 'pg-box' });
      if (st) {
        box.appendChild(h('p', { class: 'pg-cur', text: lvlText(st.cur) }));
        box.appendChild(h('p', { class: 'pg-sub', text: T(`since ${fmtDate(st.cur.since)} · ${st.days} ${st.days === 1 ? 'day' : 'days'} at this level`, `από ${fmtDate(st.cur.since)} · ${st.days} ${st.days === 1 ? 'μέρα' : 'μέρες'} σε αυτό το φορτίο`) }));
        box.appendChild(h('p', { class: 'pg-next', text: st.kind === 'fresh'
          ? T(`Stay here ${st.readyOn} more ${st.readyOn === 1 ? 'day' : 'days'}, then aim for ${targetText(st.target)}.`, `Μείνε εδώ ακόμα ${st.readyOn} ${st.readyOn === 1 ? 'μέρα' : 'μέρες'} και μετά στόχευσε ${targetText(st.target)}.`)
          : st.kind === 'ready'
            ? T(`Time to progress if every set felt clean: ${targetText(st.target)}.`, `Ώρα να ανέβεις αν όλα τα σετ ήταν καθαρά: ${targetText(st.target)}.`)
            : T(`No change for ${st.days} days. Move up to ${targetText(st.target)}, or deload and rebuild.`, `Καμία αλλαγή εδώ και ${st.days} μέρες. Ανέβα σε ${targetText(st.target)} ή κάνε ελαφριά εβδομάδα και ξαναχτίσε.`) }));
      } else {
        box.appendChild(h('p', { class: 'pg-sub', text: T('No level logged yet. Add the weight, sets and reps you use now, and the day you started with them.', 'Δεν υπάρχει καταγραφή. Πρόσθεσε τα κιλά, τα σετ και τις επαναλήψεις που κάνεις τώρα και την ημέρα που ξεκίνησες.') }));
      }
      if (!seeded && st) { draft.kg = String(st.cur.kg); draft.sets = String(st.cur.sets); draft.reps = String(st.cur.reps); seeded = true; }
      const inp = (id, label, type, key, extra) => h('div', { class: extra && extra.wide ? 'wide' : '' },
        h('label', { for: id, text: label }),
        h('input', Object.assign({ id, type, value: draft[key], oninput: (e) => { draft[key] = e.target.value; } }, extra && extra.attrs)));
      const uid = 'pg' + Math.random().toString(36).slice(2, 7);
      const form = h('form', { class: 'pg-form', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        const kg = Number(String(draft.kg).replace(',', '.')), sets = Number(draft.sets), reps = Number(draft.reps);
        if (!(kg >= 0) || draft.kg === '' || !(sets >= 1) || !(reps >= 1) || !draft.since) { draft.err = T('Enter kilos (0 for bodyweight), sets, reps and the start date.', 'Συμπλήρωσε κιλά (0 για σωματικό βάρος), σετ, επαναλήψεις και ημερομηνία έναρξης.'); render(); return; }
        if (draft.since > today()) { draft.err = T('The start date cannot be in the future.', 'Η ημερομηνία έναρξης δεν μπορεί να είναι στο μέλλον.'); render(); return; }
        add(ex.id, kg, sets, reps, draft.since);
        draft = { kg: String(kg), sets: String(sets), reps: String(reps), since: today(), err: '' };
      } },
        inp(uid + 'k', T('Weight (kg)', 'Βάρος (kg)'), 'number', 'kg', { attrs: { min: '0', step: '0.25', inputmode: 'decimal' } }),
        inp(uid + 's', T('Sets', 'Σετ'), 'number', 'sets', { attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
        inp(uid + 'r', T('Reps', 'Επαναλήψεις'), 'number', 'reps', { attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
        inp(uid + 'd', T('Started lifting this on', 'Ξεκίνησα με αυτό στις'), 'date', 'since', { wide: true, attrs: { max: today() } }),
        h('button', { class: 'btn primary', type: 'submit', text: st ? T('Save new level', 'Αποθήκευση νέου φορτίου') : T('Save level', 'Αποθήκευση φορτίου') }));
      box.appendChild(form);
      if (draft.err) box.appendChild(h('p', { class: 'pg-err', role: 'alert', text: draft.err }));
      box.appendChild(h('p', { class: 'pg-hint', text: T(`Add a new level each time you move up. After ${READY_DAYS} days at one level the app tells you it is time to progress.`, `Πρόσθεσε νέο φορτίο κάθε φορά που ανεβαίνεις. Μετά από ${READY_DAYS} μέρες στο ίδιο φορτίο η εφαρμογή σου λέει πότε να ανέβεις.`) }));
      if (st) {
        const rows = st.history.slice().reverse().map((e, i, arr) => {
          const prev = arr[i + 1];
          let chg = '';
          if (prev) { const dk = e.kg - prev.kg; const dr = e.reps - prev.reps; chg = dk ? (dk > 0 ? '+' : '') + Math.round(dk * 100) / 100 + ' kg' : dr ? (dr > 0 ? '+' : '') + dr + ' ' + T('reps', 'επ.') : ''; }
          return h('li', {}, h('span', { class: 'd', text: fmtDate(e.since) }), h('span', { class: 'v', text: lvlText(e) }), h('span', { class: 'chg', text: chg }),
            h('button', { type: 'button', 'aria-label': T('Delete this entry', 'Διαγραφή καταχώρησης'), onclick: () => remove(e.id), text: '×' }));
        });
        box.appendChild(h('ul', { class: 'pg-hist' }, rows));
      }
      body.appendChild(box);
    }
    const sub = () => { if (!det.isConnected) { const i = listeners.indexOf(sub); if (i >= 0) listeners.splice(i, 1); return; } const f = det.querySelector('input:focus'); if (!f) render(); };
    listeners.push(sub);
    render();
    host.appendChild(det);
  }


  /* ------------------------------------------------------------ mounting (exercise panel) */
  function scan() {
    const panel = document.getElementById('panel');
    const m = window.__mxProgram;
    if (!panel || !m || !m.exById) return;
    panel.querySelectorAll('[data-exid]').forEach((node) => {
      if (node.dataset.pgDone) return;
      const ex = m.exById(node.dataset.exid);
      if (!ex) return;
      node.dataset.pgDone = '1';
      const isArticle = node.tagName === 'ARTICLE';
      const holder = h('div');
      const before = isArticle ? node.querySelector(':scope > .actions') : null;
      if (before) node.insertBefore(holder, before); else node.appendChild(holder);
      mountExercise(holder, ex, false);
    });
  }
  let queued = false;
  const queue = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; try { scan(); } catch (e) { /* ignore */ } }); };
  // any change of the log re-scores the review
  listeners.push(() => { try { window.__mxProgram && window.__mxProgram.onPrograms && window.__mxProgram.onPrograms(); } catch (e) { /* ignore */ } });
  function start() {
    const panel = document.getElementById('panel');
    if (panel && window.MutationObserver) new MutationObserver(queue).observe(panel, { childList: true, subtree: true });
    scan();
    initCloud();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  const api = { overload, tips, coachLines, sig, mountTab, status, add, remove, focus: null, onChange: (f) => listeners.push(f), entries: () => entries.slice() };
  window.__mxProg = api;
})();
