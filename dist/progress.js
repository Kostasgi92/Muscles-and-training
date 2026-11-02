/* Progressive-overload log, scoring and suggestions for the program review.
   The Progress tab mirrors the Programs tab exactly: the same training days (programs), the same exercises in the
   same order, and the same number of sets, which can only be changed in the Programs tab. Each set has its own row.
   Log = list of "levels": {id, pid, ex, since:"YYYY-MM-DD", at, sets:[{kg, reps}]}.
     pid = the program (training day) it belongs to · ex = exercise id, or "n:<name>" for a name the app does not recognise.
     Levels without pid (older logs, or logged before the exercise was in a program) count for every day with that exercise.
   The newest level of an exercise on a day is its current one.
   Stored in this browser (localStorage "mx.log") and, when available, privately per user in the artifact db (doc "__log"). */
(() => {
  'use strict';
  const EL = window.__mxLang === 'el';
  const T = (en, el) => (EL ? el : en);
  const KEY = 'mx.log';
  const READY_DAYS = 14, STALL_DAYS = 28;
  const LOWER = ['quads', 'hamstrings', 'glute_max', 'glute_med', 'calves', 'erectors', 'adductors', 'iliopsoas'];

  /* ------------------------------------------------------------ store */
  const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s || '');
  const okSet = (s) => s && Number.isFinite(+s.kg) && +s.kg >= 0 && Number.isFinite(+s.reps) && +s.reps >= 1;
  // παλιά μορφή {kg, sets, reps} → ίδια σετ
  function upgrade(e) {
    if (!e || typeof e.ex !== 'string' || !isDate(e.since)) return null;
    let sets = Array.isArray(e.sets) ? e.sets.filter(okSet) : null;
    if (!sets && Number.isFinite(+e.sets) && +e.sets > 0 && okSet(e)) sets = Array.from({ length: Math.min(20, Math.round(+e.sets)) }, () => ({ kg: +e.kg, reps: +e.reps }));
    if (!sets || !sets.length) return null;
    return {
      id: String(e.id || Math.random().toString(36).slice(2, 10)), ex: e.ex, pid: typeof e.pid === 'string' && e.pid ? e.pid : null,
      since: e.since, at: +e.at || Date.now(), sets: sets.slice(0, 20).map((s) => ({ kg: Math.round(+s.kg * 100) / 100, reps: Math.round(+s.reps) })),
    };
  }
  let entries = [];
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(a)) entries = a.map(upgrade).filter(Boolean); } catch (e) { entries = []; }
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
          const remote = (Array.isArray(d.entries) ? d.entries : []).map(upgrade).filter(Boolean);
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
  const nk = (k) => (Math.round(k * 100) / 100).toLocaleString(EL ? 'el-GR' : 'en-US', { maximumFractionDigits: 2 });
  const setsWord = (n) => T(n === 1 ? 'set' : 'sets', 'σετ');
  // «60 kg × 10 / 10 / 9» όταν τα κιλά είναι ίδια, αλλιώς «60×10 · 57,5×8 kg»· σωματικό βάρος: «10 / 10 / 9 επ.»
  function setsText(sets) {
    if (!sets || !sets.length) return '';
    const kgs = sets.map((s) => s.kg);
    if (kgs.every((k) => k === 0)) return sets.map((s) => s.reps).join(' / ') + ' ' + T('reps (bodyweight)', 'επ. (σωματικό βάρος)');
    if (kgs.every((k) => k === kgs[0])) return nk(kgs[0]) + ' kg × ' + sets.map((s) => s.reps).join(' / ');
    return sets.map((s) => nk(s.kg) + '×' + s.reps).join(' · ') + ' kg';
  }
  const gid = (m) => String(m).split('.')[0];
  const isLower = (ex) => !!ex && (ex.p || []).some((m) => LOWER.includes(gid(m)));
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyOf = (it) => (it.ex ? it.ex : 'n:' + norm(it.name));
  const exName = (ex) => (EL ? (ex.el || ex.en) : (ex.en || ex.el)) || ex.id;
  const exOf = (id) => { const m = window.__mxProgram; return id && m && m.exById ? m.exById(id) : null; };
  const itemName = (it) => { const ex = exOf(it.ex); return ex ? exName(ex) : it.name; };

  const hist = (key, pid) => entries.filter((e) => e.ex === key && (!e.pid || e.pid === pid))
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.at - b.at));
  // μέτρο για «ανέβηκε;»: μέση εκτιμώμενη 1RM ανά σετ (Epley), για σωματικό βάρος οι επαναλήψεις
  const power = (sets) => (sets.every((s) => s.kg === 0) ? sets.reduce((a, s) => a + s.reps, 0) / sets.length : sets.reduce((a, s) => a + s.kg * (1 + s.reps / 30), 0) / sets.length);
  // ίδιος αριθμός σετ με το πρόγραμμα: κόβει ή επαναλαμβάνει το τελευταίο σετ
  const fit = (sets, n) => Array.from({ length: n }, (_, i) => ({ ...(sets[Math.min(i, sets.length - 1)] || { kg: 0, reps: 8 }) }));

  // επόμενος στόχος για n σετ: +1 επανάληψη στα σετ, ή όταν όλα φτάνουν τις 10, +κιλά και −2 επαναλήψεις
  function nextTarget(cur, n, ex) {
    const s = fit(cur.sets, n);
    const inc = isLower(ex) ? 5 : 2.5;
    if (s.every((x) => x.kg === 0)) return s.map((x) => ({ kg: 0, reps: x.reps + 1 }));
    const minR = Math.min(...s.map((x) => x.reps));
    if (minR >= 10) { const top = Math.max(...s.map((x) => x.kg)); return s.map(() => ({ kg: top + inc, reps: Math.max(6, minR - 2) })); }
    return s.map((x) => ({ kg: x.kg, reps: x.reps + 1 }));
  }

  // κατάσταση μιας άσκησης σε μία μέρα προπόνησης. occ = {pid, key, ex (id|null), sets (από το πρόγραμμα)}
  function status(occ) {
    const h = hist(occ.key, occ.pid);
    if (!h.length) return null;
    const cur = h[h.length - 1];
    const days = daysSince(cur.since);
    const kind = days >= STALL_DAYS ? 'stalled' : days >= READY_DAYS ? 'ready' : 'fresh';
    const prev = h.length > 1 ? h[h.length - 2] : null;
    const raised = !!prev && power(cur.sets) > power(prev.sets) * 1.002;
    return { cur, prev, days, kind, raised, history: h, readyOn: READY_DAYS - days, target: nextTarget(cur, occ.sets, exOf(occ.ex)) };
  }
  // 0…1: πόσο καλά προχωράει (null = χωρίς καταγραφή)
  function healthOf(st) { return !st ? null : st.raised || st.kind === 'fresh' ? 1 : st.kind === 'ready' ? 0.7 : st.days >= 42 ? 0.1 : 0.4; }
  const health = (pid, exId, sets) => healthOf(status({ pid, key: exId, ex: exId, sets: sets || 3 }));

  function add(occ, sets, since) {
    const e = upgrade({ ex: occ.key, pid: occ.pid || null, since, sets });
    if (!e) return false;
    entries.push(e); persist(); emit(); return true;
  }
  function remove(id) { entries = entries.filter((e) => e.id !== id); persist(); emit(); }

  // όλες οι ασκήσεις όλων των ημερών, όπως στην καρτέλα Προγράμματα (ίδια σειρά, και όσες δεν αναγνωρίστηκαν)
  function occurrences(programs) {
    const out = [];
    (programs || []).forEach((p) => (p.items || []).forEach((it) => out.push({ pid: p.id, program: p, key: keyOf(it), ex: it.ex || null, name: it.name, sets: it.sets, i: it.i })));
    return out;
  }

  /* ------------------------------------------------------------ overload score (0-10) */
  function overload(programs, exMap) {
    let tot = 0, logged = 0, hsum = 0;
    const items = [];
    (programs || []).filter((p) => p.active !== false).forEach((p) => (p.items || []).forEach((it) => {
      const ex = it.ex && exMap.get(it.ex);
      if (!ex || !(it.sets > 0)) return;
      const occ = { pid: p.id, key: it.ex, ex: it.ex, sets: it.sets };
      const st = status(occ);
      const w = it.sets * (p.perWeek || 1);
      tot += w;
      const hv = healthOf(st);
      if (hv != null) { logged += w; hsum += w * hv; }
      items.push({ ex: it.ex, pid: p.id, day: p.name, name: exName(ex), kind: st ? st.kind : 'none', days: st ? st.days : 0, target: st ? setsText(st.target) : '', cur: st ? setsText(st.cur.sets) : '', sets: it.sets, w });
    }));
    const score = tot ? 10 * (0.5 * (logged / tot) + 0.5 * (logged ? hsum / logged : 0)) : 0;
    return {
      score, items, n: items.length,
      logged: items.filter((x) => x.kind !== 'none').length,
      ready: items.filter((x) => x.kind === 'ready'),
      stalled: items.filter((x) => x.kind === 'stalled'),
      unlogged: items.filter((x) => x.kind === 'none').sort((a, b) => b.w - a.w),
    };
  }
  const label = (x) => `${x.name} (${x.day})`;
  const names = (a, k) => a.slice(0, k).map(label).join(', ') + (a.length > k ? '…' : '');
  function tips(ov) {
    const out = [];
    if (!ov || !ov.n) return out;
    if (ov.stalled.length) out.push({ kind: 'overload', title: T(`${ov.stalled.length} ${ov.stalled.length === 1 ? 'lift has' : 'lifts have'} stalled`, `${ov.stalled.length} ${ov.stalled.length === 1 ? 'άσκηση έχει' : 'ασκήσεις έχουν'} κολλήσει`),
      text: T(`No progression for 4+ weeks on ${names(ov.stalled, 3)}. Add weight or a rep (next: ${ov.stalled[0].target}), or take a lighter week and rebuild.`, `Καμία πρόοδος εδώ και 4+ εβδομάδες σε: ${names(ov.stalled, 3)}. Πρόσθεσε κιλά ή επανάληψη (επόμενο: ${ov.stalled[0].target}) ή κάνε μια ελαφριά εβδομάδα και ξαναχτίσε.`),
      actions: [{ type: 'progress', ex: ov.stalled[0].ex, pid: ov.stalled[0].pid }] });
    if (ov.ready.length) out.push({ kind: 'overload', title: T(`Time to progress: ${names(ov.ready, 2)}`, `Ώρα για αύξηση: ${names(ov.ready, 2)}`),
      text: T(`You have held the same load for 2+ weeks. If every set felt clean, go to ${ov.ready[0].target}.`, `Κρατάς το ίδιο φορτίο 2+ εβδομάδες. Αν όλα τα σετ ήταν καθαρά, πήγαινε σε ${ov.ready[0].target}.`),
      actions: [{ type: 'progress', ex: ov.ready[0].ex, pid: ov.ready[0].pid }] });
    if (ov.unlogged.length) out.push({ kind: 'overload', title: ov.logged ? T(`${ov.unlogged.length} ${ov.unlogged.length === 1 ? 'exercise has' : 'exercises have'} no logged weights`, `${ov.unlogged.length} ${ov.unlogged.length === 1 ? 'άσκηση χωρίς' : 'ασκήσεις χωρίς'} καταγραφή κιλών`) : T('Start tracking progressive overload', 'Ξεκίνα την καταγραφή προόδου φορτίου'),
      text: T(`Log the weight and reps of each set and the start date for ${names(ov.unlogged, 3)}. Without it the app cannot tell you when to move up, and the muscles these exercises train lose part of their score.`, `Κατέγραψε τα κιλά και τις επαναλήψεις κάθε σετ και την ημερομηνία έναρξης για: ${names(ov.unlogged, 3)}. Χωρίς αυτά η εφαρμογή δεν μπορεί να σου πει πότε να ανέβεις και οι μύες που δουλεύουν αυτές οι ασκήσεις χάνουν μέρος του βαθμού τους.`),
      actions: [{ type: 'progress', ex: ov.unlogged[0].ex, pid: ov.unlogged[0].pid }] });
    return out;
  }
  function coachLines(ov) {
    if (!ov || !ov.n) return [];
    const l = [T(`Progressive overload ${Math.round(ov.score * 10) / 10}/10: ${ov.logged} of ${ov.n} exercises logged.`, `Πρόοδος φορτίου ${Math.round(ov.score * 10) / 10}/10: ${ov.logged} από ${ov.n} ασκήσεις καταγεγραμμένες.`)];
    ov.items.filter((x) => x.kind !== 'none').forEach((x) => l.push(`${label(x)}: ${x.cur}, ${x.days} ${T('days at this level', 'μέρες σε αυτό το φορτίο')} (${x.kind})`));
    if (ov.unlogged.length) l.push(T('Not logged: ', 'Χωρίς καταγραφή: ') + ov.unlogged.map(label).join(', '));
    return l;
  }
  const sig = () => entries.map((e) => e.id + e.since + (e.pid || '') + JSON.stringify(e.sets)).join('|') + '@' + today();

  /* ------------------------------------------------------------ DOM */
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
  const perWeekText = (p) => (p.active === false ? T('not in the week', 'εκτός εβδομάδας') : T(`${p.perWeek}× a week`, `${p.perWeek}× την εβδομάδα`));

  /* ------------------------------------------------------------ Progress tab: ίδιες μέρες, ασκήσεις και σετ με την καρτέλα Προγράμματα */
  const openSet = new Set();
  const drafts = new Map();     // πρόχειρα φορμών (pid|key) που επιβιώνουν από τα re-render
  function mountTab(host, programs) {
    if (!host) return;
    host.replaceChildren();
    host.appendChild(h('p', { class: 'pg-intro', text: T('The same training days, exercises and number of sets as the Programs tab. Log the weight and reps of every set and the day you started with them; change the number of sets only in the Programs tab.', 'Οι ίδιες μέρες προπόνησης, ασκήσεις και αριθμός σετ με την καρτέλα Προγράμματα. Κατέγραψε τα κιλά και τις επαναλήψεις κάθε σετ και την ημέρα που ξεκίνησες· τον αριθμό των σετ τον αλλάζεις μόνο στην καρτέλα Προγράμματα.') }));
    if (!(programs || []).length) { host.appendChild(h('p', { class: 'pg-sub', text: T('You have no programs yet. Create them in the Programs section.', 'Δεν έχεις ακόμα προγράμματα. Φτιάξε τα στην ενότητα «Προγράμματα».') })); return; }
    programs.forEach((p) => {
      const day = h('section', { class: 'pg-day' + (p.active === false ? ' off' : ''), 'data-pgday': p.id });
      const total = (p.items || []).reduce((a, it) => a + it.sets, 0);
      day.appendChild(h('h3', { class: 'pg-dayname' }, h('span', { text: p.name }), h('small', { text: `${perWeekText(p)} · ${(p.items || []).length} ${T('exercises', 'ασκήσεις')} · ${total} ${setsWord(total)}` })));
      if (!(p.items || []).length) day.appendChild(h('p', { class: 'pg-sub', text: T('No exercises in this program.', 'Δεν έχει ασκήσεις.') }));
      (p.items || []).forEach((it) => {
        const occ = { pid: p.id, program: p, key: keyOf(it), ex: it.ex || null, name: it.name, sets: it.sets };
        const wrap = h('div', { class: 'pg-row', 'data-pgex': occ.key, 'data-pgpid': p.id });
        wrap.appendChild(h('h4', { class: 'pg-name' }, itemName(it), it.ex ? null : h('small', { text: T(' · not recognised, not scored', ' · δεν αναγνωρίστηκε, δεν βαθμολογείται') })));
        const k = p.id + '|' + occ.key;
        mountOcc(wrap, occ, openSet.has(k) || (api.focus && api.focus.ex === occ.key && (!api.focus.pid || api.focus.pid === p.id)));
        const d = wrap.querySelector('details');
        d.addEventListener('toggle', () => { if (d.open) openSet.add(k); else openSet.delete(k); });
        day.appendChild(wrap);
      });
      host.appendChild(day);
    });
    api.focus = null;
  }

  // μία άσκηση σε μία μέρα: τρέχον φορτίο ανά σετ, στόχος, φόρμα με σταθερό αριθμό σετ, ιστορικό
  function mountOcc(host, occ, open) {
    const det = h('details', { class: 'pg' });
    if (open) det.open = true;
    const body = h('div');
    const dk = occ.pid + '|' + occ.key;
    function getDraft(st) {
      let d = drafts.get(dk);
      const n = occ.sets;
      if (!d) {
        const base = st ? fit(st.cur.sets, n) : Array.from({ length: n }, () => ({ kg: '', reps: '' }));
        d = { rows: base.map((s) => ({ kg: String(s.kg), reps: String(s.reps), touched: false })), since: today(), err: '' };
        drafts.set(dk, d);
      }
      // ο αριθμός των σετ ακολουθεί πάντα την καρτέλα Προγράμματα
      if (d.rows.length !== n) {
        const last = d.rows[d.rows.length - 1] || { kg: '', reps: '' };
        d.rows = Array.from({ length: n }, (_, i) => d.rows[i] || { kg: last.kg, reps: last.reps, touched: false });
      }
      return d;
    }
    function render() {
      const ex = exOf(occ.ex);
      const st = status(occ);
      const sum = h('summary', {}, T('Progression', 'Πρόοδος φορτίου'), h('span', { class: 'pg-fixed', text: `${occ.sets} ${setsWord(occ.sets)}` }),
        st ? h('span', { class: 'pg-st ' + st.kind, text: stLabel[st.kind] }) : null);
      det.replaceChildren(sum, body);
      body.replaceChildren();
      const box = h('div', { class: 'pg-box' });
      if (st) {
        box.appendChild(h('p', { class: 'pg-cur', text: setsText(st.cur.sets) }));
        box.appendChild(h('p', { class: 'pg-sub', text: T(`since ${fmtDate(st.cur.since)} · ${st.days} ${st.days === 1 ? 'day' : 'days'} at this level`, `από ${fmtDate(st.cur.since)} · ${st.days} ${st.days === 1 ? 'μέρα' : 'μέρες'} σε αυτό το φορτίο`) }));
        if (st.cur.sets.length !== occ.sets) box.appendChild(h('p', { class: 'pg-sub', text: T(`Logged with ${st.cur.sets.length} ${setsWord(st.cur.sets.length)}; the Programs tab now has ${occ.sets}.`, `Καταγράφηκε με ${st.cur.sets.length} σετ· η καρτέλα Προγράμματα έχει τώρα ${occ.sets}.`) }));
        const tgt = setsText(st.target);
        box.appendChild(h('p', { class: 'pg-next', text: st.kind === 'fresh'
          ? T(`Stay here ${st.readyOn} more ${st.readyOn === 1 ? 'day' : 'days'}, then aim for ${tgt}.`, `Μείνε εδώ ακόμα ${st.readyOn} ${st.readyOn === 1 ? 'μέρα' : 'μέρες'} και μετά στόχευσε ${tgt}.`)
          : st.kind === 'ready'
            ? T(`Time to progress if every set felt clean: ${tgt}.`, `Ώρα να ανέβεις αν όλα τα σετ ήταν καθαρά: ${tgt}.`)
            : T(`No change for ${st.days} days. Move up to ${tgt}, or deload and rebuild.`, `Καμία αλλαγή εδώ και ${st.days} μέρες. Ανέβα σε ${tgt} ή κάνε ελαφριά εβδομάδα και ξαναχτίσε.`) }));
      } else {
        box.appendChild(h('p', { class: 'pg-sub', text: T('No level logged yet. Add the weight and reps of each set you do now, and the day you started with them.', 'Δεν υπάρχει καταγραφή. Πρόσθεσε τα κιλά και τις επαναλήψεις κάθε σετ που κάνεις τώρα και την ημέρα που ξεκίνησες.') }));
      }
      const d = getDraft(st);
      const uid = 'pg' + Math.random().toString(36).slice(2, 7);
      const rows = d.rows.map((r, i) => {
        const kgIn = h('input', { id: `${uid}k${i}`, type: 'number', min: '0', step: '0.25', inputmode: 'decimal', value: r.kg, 'aria-label': T(`Set ${i + 1} weight (kg)`, `Σετ ${i + 1} βάρος (kg)`),
          oninput: (e) => { r.kg = e.target.value; r.touched = true; if (i === 0) mirror('kg'); } });
        const repIn = h('input', { id: `${uid}r${i}`, type: 'number', min: '1', step: '1', inputmode: 'numeric', value: r.reps, 'aria-label': T(`Set ${i + 1} reps`, `Σετ ${i + 1} επαναλήψεις`),
          oninput: (e) => { r.reps = e.target.value; r.touched = true; if (i === 0) mirror('reps'); } });
        return h('div', { class: 'pg-set' }, h('span', { class: 'pg-setn', text: T(`Set ${i + 1}`, `Σετ ${i + 1}`) }), kgIn, h('span', { class: 'pg-x', text: 'kg ×' }), repIn, h('span', { class: 'pg-x', text: T('reps', 'επ.') }));
      });
      // τα σετ που δεν άγγιξες ακολουθούν το 1ο σετ
      function mirror(field) {
        d.rows.forEach((r, i) => {
          if (i === 0 || r.touched) return;
          r[field] = d.rows[0][field];
          const inp = body.querySelector(`#${uid}${field === 'kg' ? 'k' : 'r'}${i}`);
          if (inp) inp.value = r[field];
        });
      }
      const dateIn = h('input', { id: uid + 'd', type: 'date', value: d.since, max: today(), oninput: (e) => { d.since = e.target.value; } });
      const form = h('form', { class: 'pg-form', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        const sets = d.rows.map((r) => ({ kg: Number(String(r.kg).replace(',', '.')), reps: Number(r.reps) }));
        if (d.rows.some((r) => r.kg === '' || r.reps === '') || sets.some((s) => !(s.kg >= 0) || !(s.reps >= 1))) { d.err = T('Enter kilos (0 for bodyweight) and reps for every set, and the start date.', 'Συμπλήρωσε κιλά (0 για σωματικό βάρος) και επαναλήψεις σε κάθε σετ και την ημερομηνία έναρξης.'); render(); return; }
        if (!isDate(d.since) || d.since > today()) { d.err = T('The start date cannot be in the future.', 'Η ημερομηνία έναρξης δεν μπορεί να είναι στο μέλλον.'); render(); return; }
        add(occ, sets, d.since);
        drafts.set(dk, { rows: sets.map((s) => ({ kg: String(s.kg), reps: String(s.reps), touched: false })), since: today(), err: '' });
      } },
        h('p', { class: 'pg-fixednote', text: T(`${occ.sets} ${setsWord(occ.sets)}, as in the Programs tab`, `${occ.sets} σετ, όπως στην καρτέλα Προγράμματα`) }),
        h('div', { class: 'pg-sets' }, rows),
        h('div', { class: 'pg-date' }, h('label', { for: uid + 'd', text: T('Started lifting this on', 'Ξεκίνησα με αυτό στις') }), dateIn),
        h('button', { class: 'btn primary', type: 'submit', text: st ? T('Save new level', 'Αποθήκευση νέου φορτίου') : T('Save level', 'Αποθήκευση φορτίου') }));
      box.appendChild(form);
      if (d.err) { box.appendChild(h('p', { class: 'pg-err', role: 'alert', text: d.err })); d.err = ''; }
      box.appendChild(h('p', { class: 'pg-hint', text: T(`Add a new level each time you move up. After ${READY_DAYS} days at one level the app tells you it is time to progress.`, `Πρόσθεσε νέο φορτίο κάθε φορά που ανεβαίνεις. Μετά από ${READY_DAYS} μέρες στο ίδιο φορτίο η εφαρμογή σου λέει πότε να ανέβεις.`) }));
      if (st) {
        const items = st.history.slice().reverse().map((e, i, arr) => {
          const prev = arr[i + 1];
          let chg = '';
          if (prev) { const dp = power(e.sets) - power(prev.sets); chg = Math.abs(dp) < 0.05 ? '' : dp > 0 ? '▲' : '▼'; }
          return h('li', {}, h('span', { class: 'd', text: fmtDate(e.since) }), h('span', { class: 'v', text: setsText(e.sets) + (e.pid ? '' : T(' · all days', ' · όλες οι μέρες')) }), h('span', { class: 'chg', text: chg }),
            h('button', { type: 'button', 'aria-label': T('Delete this entry', 'Διαγραφή καταχώρησης'), onclick: () => remove(e.id), text: '×' }));
        });
        box.appendChild(h('ul', { class: 'pg-hist' }, items));
      }
      body.appendChild(box);
    }
    const sub = () => { if (!det.isConnected) { const i = listeners.indexOf(sub); if (i >= 0) listeners.splice(i, 1); return; } const f = det.querySelector('input:focus'); if (!f) render(); };
    listeners.push(sub);
    render();
    host.appendChild(det);
  }

  const css = `
.pg{margin-top:6px}
.pg>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-2);font-weight:700;margin:22px 0 8px}
.pg>summary::-webkit-details-marker{display:none}
.pg>summary::before{content:"▸";font-size:.8rem}
.pg[open]>summary::before{content:"▾"}
.exbody .pg>summary{margin:14px 0 6px}
.pg-st,.pg-fixed{font-size:.7rem;letter-spacing:.03em;text-transform:none;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--ink)}
.pg-fixed{background:var(--surface);font-variant-numeric:tabular-nums}
.pg-st.ready{background:var(--second-soft);border-color:var(--second)}
.pg-st.stalled{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.pg-st.fresh{background:var(--surface-2)}
.pg-box{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:12px}
.pg-cur{font-size:1.05rem;font-weight:700;margin:0;font-variant-numeric:tabular-nums}
.pg-sub{margin:2px 0 0;font-size:.84rem;color:var(--ink-2)}
.pg-next{margin:8px 0 0;font-size:.88rem}
.pg-form{margin-top:12px}
.pg-fixednote{margin:0 0 6px;font-size:.78rem;color:var(--ink-2);font-weight:600}
.pg-sets{display:grid;gap:6px}
.pg-set{display:grid;grid-template-columns:52px minmax(0,1fr) auto minmax(0,1fr) auto;align-items:center;gap:6px}
.pg-setn{font-size:.78rem;color:var(--ink-2);font-weight:600}
.pg-x{font-size:.76rem;color:var(--ink-2)}
.pg-form input{width:100%;min-width:0;padding:8px 10px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font-size:.95rem}
.pg-form input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.pg-date{margin-top:10px}
.pg-date label{display:block;font-size:.74rem;color:var(--ink-2);margin-bottom:3px}
.pg-form .btn{margin-top:10px;width:100%;justify-content:center}
.pg-hint{margin:6px 0 0;font-size:.76rem;color:var(--ink-2)}
.pg-err{margin:6px 0 0;font-size:.82rem;color:var(--danger,#b3261e);font-weight:600}
.pg-hist{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:4px;font-size:.84rem}
.pg-hist li{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--line);padding-top:4px}
.pg-hist .d{color:var(--ink-2);min-width:92px;flex-shrink:0}
.pg-hist .v{flex:1;min-width:0;font-variant-numeric:tabular-nums}
.pg-hist .chg{color:var(--accent);font-weight:700}
.pg-hist button{border:none;background:none;color:var(--ink-2);padding:0 4px}
.pg-hist button:hover{color:var(--accent)}
.pg-day{margin:0 0 14px;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface)}
.pg-day.off{opacity:.8}
.pg-dayname{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 4px;font-size:1rem}
.pg-dayname small{font-size:.78rem;color:var(--ink-2);font-weight:500}
.pg-row{margin:0;border-top:1px solid var(--line)}
.pg-day .pg-row:first-of-type{border-top:none}
.pg-name{margin:10px 0 0;font-size:.95rem}
.pg-name small{font-weight:500;color:var(--ink-2)}
.pg-intro{font-size:.88rem;color:var(--ink-2);margin:0 0 10px}
.pg-row .pg>summary{margin:6px 0 8px}
.pg-card-day{margin:14px 0 0;font-size:.82rem;font-weight:700}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  /* ------------------------------------------------------------ κάρτα άσκησης (χάρτης): μία ενότητα για κάθε μέρα που την περιέχει */
  function mountCard(holder, ex) {
    const m = window.__mxProgram;
    const progs = m && m.programs ? m.programs() : [];
    const occs = occurrences(progs).filter((o) => o.ex === ex.id);
    holder.replaceChildren();
    if (!occs.length) {
      const legacy = hist(ex.id, null);
      const det = h('details', { class: 'pg' }, h('summary', {}, T('Progression', 'Πρόοδος φορτίου')),
        h('div', { class: 'pg-box' }, h('p', { class: 'pg-sub', text: T('Add this exercise to a program in the Programs section to log its progression. The number of sets comes from the Programs tab of the review.', 'Πρόσθεσε την άσκηση σε ένα πρόγραμμα στην ενότητα «Προγράμματα» για να καταγράφεις την πρόοδό της. Ο αριθμός των σετ έρχεται από την καρτέλα Προγράμματα της αξιολόγησης.') }),
          legacy.length ? h('ul', { class: 'pg-hist' }, legacy.slice().reverse().map((e) => h('li', {}, h('span', { class: 'd', text: fmtDate(e.since) }), h('span', { class: 'v', text: setsText(e.sets) })))) : null));
      holder.appendChild(det);
      return;
    }
    occs.forEach((o) => {
      if (occs.length > 1) holder.appendChild(h('p', { class: 'pg-card-day', text: o.program.name }));
      mountOcc(holder, o, false);
    });
  }
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
      const holder = h('div', { class: 'pg-holder' });
      holder.__ex = ex;
      const before = isArticle ? node.querySelector(':scope > .actions') : null;
      if (before) node.insertBefore(holder, before); else node.appendChild(holder);
      mountCard(holder, ex);
    });
  }
  // οι κάρτες ασκήσεων ακολουθούν τις αλλαγές των προγραμμάτων (μέρες, σετ)
  let lastProgSig = '';
  function refreshCards() {
    const m = window.__mxProgram;
    const progs = m && m.programs ? m.programs() : [];
    const s = JSON.stringify(progs.map((p) => [p.id, p.name, p.items.map((it) => [it.ex, it.sets])]));
    if (s === lastProgSig) return;
    lastProgSig = s;
    document.querySelectorAll('#panel .pg-holder').forEach((holder) => { if (holder.__ex && !holder.querySelector('input:focus')) mountCard(holder, holder.__ex); });
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

  const api = { overload, tips, coachLines, sig, mountTab, status, health, occurrences, add, remove, refreshCards, focus: null, onChange: (f) => listeners.push(f), entries: () => entries.slice(), setsText };
  window.__mxProg = api;
})();
