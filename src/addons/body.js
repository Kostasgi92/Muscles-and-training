/* Body data and goals for the program review.
   profile = {sex: 'm'|'f'|'', age, ageOn: "YYYY-MM-DD", height (cm)}
   entries = [{id, date: "YYYY-MM-DD", at, w (kg), fat (%), mus (% skeletal muscle), m: {neck, shoulders, chest, arm, forearm, waist, hips, thigh, calf} (cm)}]
   goals   = {w, fat, mus, date, setOn}
   Stored in this browser (localStorage "mx.body") and, when available, privately per user in the artifact db (doc "__body").
   window.__mxBody: computed metrics, a 0–10 "fit to goals" score for the review, suggestions, coach lines and the two tabs. */
(() => {
  'use strict';
  const EL = window.__mxLang === 'el';
  const T = (en, el) => (EL ? el : en);
  const KEY = 'mx.body';

  // ------------------------------------------------------------ fields
  const MEAS = [
    ['neck', T('Neck', 'Λαιμός'), T('just below the Adam’s apple', 'κάτω από το «μήλο του Αδάμ»')],
    ['shoulders', T('Shoulders', 'Ώμοι'), T('around the widest point', 'γύρω από το φαρδύτερο σημείο')],
    ['chest', T('Chest', 'Στήθος'), T('at nipple level, arms relaxed', 'στο ύψος των θηλών, χέρια χαλαρά')],
    ['arm', T('Arm / biceps', 'Μπράτσο / δικέφαλος'), T('flexed, at the peak of the biceps', 'σφιγμένος, στην κορυφή του δικεφάλου')],
    ['forearm', T('Forearm', 'Πήχης'), T('at the widest point', 'στο φαρδύτερο σημείο')],
    ['waist', T('Waist', 'Μέση'), T('at the navel, relaxed, after breathing out', 'στο ύψος του αφαλού, χαλαρά, μετά την εκπνοή')],
    ['hips', T('Hips / glutes', 'Λεκάνη / γλουτοί'), T('at the widest point of the glutes', 'στο φαρδύτερο σημείο των γλουτών')],
    ['thigh', T('Thigh', 'Μηρός'), T('halfway between hip and knee', 'στη μέση ανάμεσα σε λεκάνη και γόνατο')],
    ['calf', T('Calf', 'Γάμπα'), T('at the widest point', 'στο φαρδύτερο σημείο')],
  ];
  const MKEYS = MEAS.map((x) => x[0]);
  // περιφέρειες που μεγαλώνουν με τη μυϊκή ανάπτυξη → μύες της αξιολόγησης (review.js SCORED ids)
  const MEAS_MUSCLES = { arm: ['biceps', 'triceps'], chest: ['chest'], shoulders: ['delt_side', 'delt_rear'], thigh: ['quads', 'hamstrings'], hips: ['glutes'], calf: ['calves'], forearm: ['forearms'] };

  // ------------------------------------------------------------ store
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s || '');
  const cleanEntry = (e) => {
    const m = {};
    MKEYS.forEach((k) => { const v = num(e.m && e.m[k]); if (v) m[k] = v; });
    return { id: String(e.id || Math.random().toString(36).slice(2, 10)), date: e.date, at: +e.at || Date.now(), w: num(e.w), fat: num(e.fat), mus: num(e.mus), m };
  };
  const hasData = (e) => e.w || e.fat || e.mus || Object.keys(e.m).length;
  const cleanAll = (d) => {
    d = d || {};
    const p = d.profile || {};
    const g = d.goals || {};
    return {
      profile: { sex: p.sex === 'm' || p.sex === 'f' ? p.sex : '', age: num(p.age), ageOn: isDate(p.ageOn) ? p.ageOn : null, height: num(p.height) },
      entries: (Array.isArray(d.entries) ? d.entries : []).filter((e) => e && isDate(e.date)).map(cleanEntry).filter(hasData),
      goals: { w: num(g.w), fat: num(g.fat), mus: num(g.mus), waist: num(g.waist), date: isDate(g.date) ? g.date : null, setOn: isDate(g.setOn) ? g.setOn : null },
    };
  };
  let data = cleanAll(null);
  try { data = cleanAll(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { /* ignore */ }
  const listeners = [];
  const emit = () => listeners.slice().forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  let cloudDoc = null;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    if (cloudDoc) cloudDoc.set(Object.assign({ createdAt: 0, updatedAt: Date.now() }, data)).catch(() => {});
    emit();
  }
  async function initCloud() {
    try {
      if (!(window.claude && typeof window.claude.use === 'function')) return;
      const db = await window.claude.use('db');
      const user = await window.claude.use('user');
      const uid = db && user ? await user.id() : null;
      if (!db || !uid) return;
      const doc = db.doc('data/users/' + uid + '/__body');
      cloudDoc = doc;
      doc.onSnapshot((snap) => {
        if (snap.exists) {
          const remote = cleanAll(snap.data());
          if (JSON.stringify(remote) !== JSON.stringify(data)) {
            data = remote;
            try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
            emit();
          }
        } else if (data.entries.length || data.profile.height || data.goals.w) {
          doc.set(Object.assign({ createdAt: 0, updatedAt: Date.now() }, data)).catch(() => {});
        }
      }, () => {});
    } catch (e) { /* local only */ }
  }

  // ------------------------------------------------------------ helpers
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const fmtDate = (s) => { try { return parse(s).toLocaleDateString(EL ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } };
  const nf = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(EL ? 'el-GR' : 'en-US', { maximumFractionDigits: d });
  const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + nf(Math.abs(x), d);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const sorted = () => data.entries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at));
  const getv = (e, k) => (k === 'w' || k === 'fat' || k === 'mus' ? e[k] : e.m[k]) || null;
  // σειρά τιμών ενός μεγέθους [{date, v}] με χρονική σειρά
  const series = (k) => sorted().filter((e) => getv(e, k)).map((e) => ({ date: e.date, v: getv(e, k) }));
  const latest = (k) => { const s = series(k); return s.length ? s[s.length - 1] : null; };
  // ρυθμός μεταβολής ανά εβδομάδα στις τελευταίες ~6 εβδομάδες (ελάχιστα τετράγωνα), αν καλύπτουν ≥ 10 μέρες
  function rate(k, windowDays = 42) {
    const s = series(k);
    if (s.length < 2) return null;
    const end = s[s.length - 1].date;
    const pts = s.filter((p) => days(p.date, end) <= windowDays);
    const use = pts.length >= 2 ? pts : s.slice(-2);
    const span = days(use[0].date, end);
    if (span < 10) return null;
    const xs = use.map((p) => days(use[0].date, p.date) / 7), ys = use.map((p) => p.v);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    return sxx ? { perWeek: sxy / sxx, weeks: span / 7 } : null;
  }

  const age = () => {
    const p = data.profile;
    if (!p.age) return null;
    return p.ageOn ? p.age + Math.floor(days(p.ageOn, today()) / 365.25) : p.age;
  };

  // ------------------------------------------------------------ metrics
  function navyFat(sex, h, m) {
    if (!h || !m.neck || !m.waist) return null;
    if (sex === 'm' && m.waist > m.neck) return 495 / (1.0324 - 0.19077 * Math.log10(m.waist - m.neck) + 0.15456 * Math.log10(h)) - 450;
    if (sex === 'f' && m.hips && m.waist + m.hips > m.neck) return 495 / (1.29579 - 0.35004 * Math.log10(m.waist + m.hips - m.neck) + 0.221 * Math.log10(h)) - 450;
    return null;
  }
  const activity = (sessions) => (sessions >= 6 ? [1.725, T('6+ workouts a week', '6+ προπονήσεις την εβδομάδα')] : sessions >= 3 ? [1.55, T('3–5 workouts a week', '3–5 προπονήσεις την εβδομάδα')] : sessions >= 1 ? [1.375, T('1–2 workouts a week', '1–2 προπονήσεις την εβδομάδα')] : [1.2, T('no workouts in the week', 'χωρίς προπονήσεις στην εβδομάδα')]);

  // όλα τα υπολογισμένα μεγέθη από τις πιο πρόσφατες τιμές
  function metrics(sessions = 0) {
    const p = data.profile;
    const W = latest('w'), F = latest('fat'), M = latest('mus');
    const meas = {};
    MKEYS.forEach((k) => { const l = latest(k); if (l) meas[k] = l; });
    const mv = Object.fromEntries(Object.entries(meas).map(([k, l]) => [k, l.v]));
    const h = p.height, hm = h ? h / 100 : null, a = age(), w = W ? W.v : null;
    const out = { W, F, M, meas, age: a, height: h, sex: p.sex };
    if (w && hm) {
      out.bmi = w / (hm * hm);
      out.bmiCat = out.bmi < 18.5 ? ['under', T('underweight', 'λιποβαρής')] : out.bmi < 25 ? ['normal', T('normal', 'φυσιολογικό')] : out.bmi < 30 ? ['over', T('overweight', 'υπέρβαρος')] : ['obese', T('obese', 'παχυσαρκία')];
    }
    const navy = !F ? navyFat(p.sex, h, mv) : null;
    const fat = F ? F.v : navy;
    out.fat = fat; out.fatEstimated = !F && navy != null;
    if (w && fat != null) { out.fatKg = (w * fat) / 100; out.lbm = w - out.fatKg; }
    if (w && M) out.musKg = (w * M.v) / 100;
    if (out.lbm && hm) { out.ffmi = out.lbm / (hm * hm); out.ffmiN = out.ffmi + 6.1 * (1.8 - hm); }
    if (w && h && a) {
      const s = p.sex === 'm' ? 5 : p.sex === 'f' ? -161 : -78;
      out.bmrMifflin = 10 * w + 6.25 * h - 5 * a + s;
    }
    if (out.lbm) out.bmrKatch = 370 + 21.6 * out.lbm;
    out.bmr = out.bmrKatch && !out.fatEstimated ? out.bmrKatch : out.bmrMifflin || out.bmrKatch || null;
    out.bmrFormula = out.bmr && out.bmr === out.bmrKatch ? 'Katch–McArdle' : 'Mifflin–St Jeor';
    const [fac, facLabel] = activity(sessions);
    if (out.bmr) { out.tdee = out.bmr * fac; out.activity = facLabel; }
    if (mv.waist && mv.hips) {
      out.whr = mv.waist / mv.hips;
      out.whrRisk = out.whr >= (p.sex === 'f' ? 0.85 : 0.9);
    }
    if (mv.waist && h) {
      out.whtr = mv.waist / h;
      out.whtrCat = out.whtr < 0.5 ? ['ok', T('healthy', 'υγιές')] : out.whtr < 0.6 ? ['warn', T('increased risk', 'αυξημένος κίνδυνος')] : ['high', T('high risk', 'υψηλός κίνδυνος')];
    }
    const fr = p.sex === 'f' ? [21, 33] : [8, 20];
    if (fat != null) out.fatCat = fat < fr[0] ? ['low', T('very lean', 'πολύ χαμηλό')] : fat <= fr[1] ? ['ok', T('healthy range', 'υγιές εύρος')] : fat <= fr[1] + 5 ? ['warn', T('above healthy', 'πάνω από το υγιές')] : ['high', T('high', 'υψηλό')];
    out.fatRange = fr;
    return out;
  }

  // ------------------------------------------------------------ goals
  function goalInfo(mt) {
    const g = data.goals;
    const w = mt.W ? mt.W.v : null;
    const out = { set: !!(g.w || g.fat || g.mus || g.waist), g };
    const curWaist = mt.meas.waist ? mt.meas.waist.v : null;
    // στόχος μέσης μικρότερος από τη σημερινή = λιγότερο κοιλιακό λίπος
    const waistDown = !!(g.waist && curWaist && g.waist < curWaist - 1);
    out.dWaist = g.waist && curWaist ? g.waist - curWaist : null;
    if (g.w && g.fat) out.fatKg = (g.w * g.fat) / 100;
    if (g.w && g.mus) out.musKg = (g.w * g.mus) / 100;
    let type = null;
    if (out.set && w) {
      const dW = g.w ? g.w - w : 0;
      const dF = g.fat && mt.fat != null ? g.fat - mt.fat : 0;
      const dMk = out.musKg && mt.musKg ? out.musKg - mt.musKg : 0;
      if (dW <= -1.5 || (dF <= -2 && dW <= 0.5)) type = Math.abs(dW) <= 1.5 && dMk > 0.5 ? 'recomp' : 'cut';
      else if (dW >= 1.5) type = 'bulk';
      else if (dF <= -1 || dMk >= 0.5 || waistDown) type = 'recomp';
      else type = 'maintain';
    } else if (out.set) type = g.w ? null : (g.waist && !g.fat && !g.mus ? 'cut' : 'recomp');
    // χωρίς στόχους: τι θα πρότεινε ένας προπονητής από τα δεδομένα (ο στόχος της εφαρμογής είναι η μυϊκή ανάπτυξη)
    if (!type) {
      if (mt.fat != null && mt.fatCat && (mt.fatCat[0] === 'warn' || mt.fatCat[0] === 'high')) type = 'cut';
      else if (mt.whtrCat && mt.whtrCat[0] !== 'ok') type = 'cut';
      else if (mt.bmiCat && mt.bmiCat[0] === 'under') type = 'bulk';
      else if (mt.W) type = 'build';
      out.inferred = !!type;
    }
    out.type = type;
    out.dW = g.w && w ? g.w - w : null;
    out.dF = g.fat && mt.fat != null ? g.fat - mt.fat : null;
    out.dFkg = out.fatKg != null && mt.fatKg != null ? out.fatKg - mt.fatKg : null;
    out.dM = g.mus && mt.M ? g.mus - mt.M.v : null;
    out.dMkg = out.musKg != null && mt.musKg != null ? out.musKg - mt.musKg : null;
    if (g.date && out.dW != null) {
      const wk = days(today(), g.date) / 7;
      out.weeksLeft = wk;
      if (wk > 0.5) out.needPerWeek = out.dW / wk;
    }
    return out;
  }
  const TYPE = {
    cut: [T('Fat loss', 'Απώλεια λίπους'), T('Lose fat while keeping your muscle.', 'Χάσε λίπος κρατώντας τους μύες σου.')],
    bulk: [T('Muscle gain (bulk)', 'Μυϊκή ανάπτυξη (όγκος)'), T('Gain weight slowly, mostly as muscle.', 'Πάρε βάρος σιγά, κυρίως μύες.')],
    recomp: [T('Recomposition', 'Ανασύνθεση σώματος'), T('Same weight, less fat and more muscle.', 'Ίδιο βάρος, λιγότερο λίπος και περισσότεροι μύες.')],
    maintain: [T('Maintenance', 'Διατήρηση'), T('Keep your current shape and strength.', 'Κράτα τη σημερινή σου φόρμα και δύναμη.')],
    build: [T('Muscle growth', 'Μυϊκή ανάπτυξη'), T('Build muscle at a stable weight or a slow gain.', 'Χτίσε μύες με σταθερό βάρος ή αργή αύξηση.')],
  };

  // ------------------------------------------------------------ fit of the training plan to body & goals (0–10)
  // ctx (από review.js): {sessions, volume, overload, maxSession, groups: [{id, score}], muscles: {id: {V, min, name}}}
  function fit(ctx) {
    const mt = metrics(ctx.sessions);
    const gi = goalInfo(mt);
    if (!gi.type || !ctx.sessions) return null;
    const t = gi.type;
    const S = ctx.sessions;
    const reasons = [];
    const sess = t === 'maintain' ? (S >= 2 ? 10 : 6) : t === 'cut' ? (S >= 3 ? 10 : S === 2 ? 6.5 : 3.5) : (S >= 4 ? 10 : S === 3 ? 9 : S === 2 ? 6.5 : 3.5);
    reasons.push([sess, T(`${S} ${S === 1 ? 'workout' : 'workouts'} a week`, `${S} ${S === 1 ? 'προπόνηση' : 'προπονήσεις'} την εβδομάδα`), sess >= 9 ? T('enough for this goal', 'αρκετές για τον στόχο') : T(t === 'cut' ? 'aim for at least 3 to keep muscle and burn more' : 'aim for 3–4 to grow', t === 'cut' ? 'στόχευσε τουλάχιστον 3, για να κρατήσεις μύες και να καις περισσότερο' : 'στόχευσε 3–4 για ανάπτυξη')]);
    // ο όγκος ήδη μετριέται με τον στόχο σετ του στόχου σου (review.js GOAL_SETS)
    const vol = ctx.volume;
    reasons.push([vol, T('Weekly volume', 'Εβδομαδιαίος όγκος'), t === 'cut' ? T('during fat loss about 7 hard sets per big muscle keep it', 'στην απώλεια λίπους ~7 σκληρά σετ ανά μεγάλο μυ αρκούν για να τον κρατήσεις') : t === 'maintain' ? T('about 6 hard sets per big muscle keep your shape', '~6 σκληρά σετ ανά μεγάλο μυ κρατούν τη φόρμα σου') : T('growth needs ~10+ hard sets per muscle', 'η ανάπτυξη θέλει ~10+ σκληρά σετ ανά μυ')]);
    const ov = ctx.overload == null ? 5 : ctx.overload;
    reasons.push([ov, T('Progressive overload', 'Πρόοδος φορτίου'), t === 'cut' ? T('keeping your loads protects muscle in a deficit', 'η διατήρηση των φορτίων προστατεύει τους μύες στο έλλειμμα') : T('more load over time is what drives growth', 'η αύξηση φορτίου με τον καιρό φέρνει την ανάπτυξη')]);
    let align;
    if (t === 'cut') {
      const legs = (ctx.groups || []).filter((g) => g.id === 'legs' || g.id === 'hips' || g.id === 'back');
      const big = legs.length ? legs.reduce((a, g) => a + g.score, 0) / legs.length : vol;
      reasons.push([big, T('Big muscle groups (legs, back)', 'Μεγάλες μυϊκές ομάδες (πόδια, πλάτη)'), T('they burn the most energy', 'καίνε την περισσότερη ενέργεια')]);
      align = 0.3 * sess + 0.3 * vol + 0.2 * ov + 0.2 * big;
    } else align = 0.35 * sess + 0.4 * vol + 0.25 * ov;
    let ageAdj = 0;
    if (mt.age >= 45 && ctx.maxSession > 25) { ageAdj = -0.8; reasons.push([5, T(`Long sessions at ${mt.age}`, `Μεγάλες προπονήσεις στα ${mt.age}`), T('over 25 hard sets in one session makes recovery harder', 'πάνω από 25 σκληρά σετ σε μία προπόνηση δυσκολεύουν την αποκατάσταση')]); }
    // πορεία προς τον στόχο (από τις μετρήσεις)
    let trend = null;
    const rw = rate('w'), rf = rate('fat'), rm = rate('mus');
    const w = mt.W ? mt.W.v : null;
    if (rw && w) {
      const pct = (100 * rw.perWeek) / w;
      const fatDown = rf && rf.perWeek < -0.05, musUp = rm && rm.perWeek > 0.03, fatUp = rf && rf.perWeek > 0.12;
      if (t === 'cut') trend = pct <= -0.5 && pct >= -1 ? 10 : (pct < -0.25 && pct > -0.5) || (pct < -1 && pct >= -1.5) ? 7.5 : pct < -1.5 ? 5 : pct <= 0 ? 5 : 2;
      else if (t === 'bulk') trend = pct >= 0.1 && pct <= 0.5 ? (fatUp ? 7.5 : 10) : pct > 0.5 && pct <= 0.8 ? 6.5 : pct > 0.8 ? 4 : pct > -0.1 ? 6 : 2;
      else if (t === 'recomp' || t === 'build') trend = Math.abs(pct) <= 0.3 ? (fatDown || musUp ? 10 : fatUp ? 5 : 7.5) : pct > 0.3 && pct <= 0.6 ? (fatUp ? 5 : 7.5) : pct < -0.3 ? (t === 'build' ? 5 : 6.5) : 4;
      else trend = Math.abs(pct) <= 0.25 ? 10 : 6;
      reasons.push([trend, T(`Weight ${sgn(pct, 2)}% a week`, `Βάρος ${sgn(pct, 2)}% την εβδομάδα`), trendText(t, pct)]);
    }
    const score = clamp((trend == null ? align : 0.65 * align + 0.35 * trend) + ageAdj, 0, 10);
    return { score, type: t, inferred: gi.inferred, reasons, mt, gi };
  }
  function trendText(t, pct) {
    if (t === 'cut') return pct > 0 ? T('moving away from the goal: check calories', 'απομακρύνεσαι από τον στόχο: έλεγξε τις θερμίδες') : pct < -1 ? T('faster than 1% a week risks muscle loss', 'πιο γρήγορα από 1% την εβδομάδα κινδυνεύεις να χάσεις μύες') : pct > -0.5 ? T('slower than the ideal 0.5–1% a week', 'πιο αργά από το ιδανικό 0,5–1% την εβδομάδα') : T('ideal pace (0.5–1% a week)', 'ιδανικός ρυθμός (0,5–1% την εβδομάδα)');
    if (t === 'bulk') return pct < 0 ? T('losing weight while trying to gain', 'χάνεις βάρος ενώ θέλεις να πάρεις') : pct > 0.5 ? T('above 0.5% a week much of the gain is fat', 'πάνω από 0,5% την εβδομάδα μεγάλο μέρος είναι λίπος') : pct < 0.1 ? T('too slow to support growth', 'πολύ αργά για να στηρίξει ανάπτυξη') : T('ideal pace (0.1–0.5% a week)', 'ιδανικός ρυθμός (0,1–0,5% την εβδομάδα)');
    if (t === 'maintain') return Math.abs(pct) <= 0.25 ? T('stable, as intended', 'σταθερό, όπως θέλεις') : T('drifting from your weight', 'απομακρύνεσαι από το βάρος σου');
    return Math.abs(pct) <= 0.3 ? T('stable weight, right for recomposition', 'σταθερό βάρος, σωστό για ανασύνθεση') : pct > 0 ? T('gaining: watch the fat percentage', 'ανεβαίνεις: πρόσεχε το ποσοστό λίπους') : T('losing weight: eat a bit more to build muscle', 'χάνεις βάρος: φάε λίγο περισσότερο για να χτίσεις μύες');
  }

  // περιφέρειες που δεν μεγαλώνουν (≥ 6 εβδομάδες) ενώ ο στόχος είναι ανάπτυξη
  function stagnant() {
    const out = [];
    Object.keys(MEAS_MUSCLES).forEach((k) => {
      const s = series(k);
      if (s.length < 2) return;
      const a = s[0], b = s[s.length - 1];
      if (days(a.date, b.date) < 42) return;
      if (b.v - a.v <= 0.2) out.push({ key: k, name: MEAS.find((x) => x[0] === k)[1], muscles: MEAS_MUSCLES[k], from: a, to: b });
    });
    return out;
  }

  // προτάσεις για το review.js: {kind:'body', title, text, actions:[{type:'tab', id}] | muscles}
  function tips(ctx, f) {
    const out = [];
    const mt = f ? f.mt : metrics(ctx.sessions);
    if (!data.entries.length || !data.profile.height) {
      out.push({ kind: 'body', title: T('Add your body data', 'Πρόσθεσε τα στοιχεία σώματος'), text: T('With your age, height, weight and body-fat and muscle percentages, the review also judges whether the plan fits your body and goals.', 'Με την ηλικία, το ύψος, το βάρος και τα ποσοστά λίπους και μυών, η αξιολόγηση κρίνει και αν το πρόγραμμα ταιριάζει στο σώμα και στους στόχους σου.'), actions: [{ type: 'tab', id: 'body' }] });
      return out;
    }
    if (!(data.goals.w || data.goals.fat || data.goals.mus || data.goals.waist)) out.push({ kind: 'body', title: T('Set your goals', 'Όρισε τους στόχους σου'), text: T('Add your target weight and body-fat and muscle percentages. The score then checks the plan against your real goal instead of a general one.', 'Πρόσθεσε το βάρος και τα ποσοστά λίπους και μυών που θέλεις. Ο βαθμός τότε ελέγχει το πρόγραμμα με βάση τον δικό σου στόχο, όχι έναν γενικό.'), actions: [{ type: 'tab', id: 'goals' }] });
    if (!f) return out;
    const t = f.type, kcal = mt.tdee;
    const w = mt.W ? mt.W.v : null;
    if (t === 'cut' && w) out.push({ kind: 'body', title: T('Fat loss: how to eat and move', 'Απώλεια λίπους: διατροφή και κίνηση'), text: (kcal ? T(`About ${Math.round((kcal - 450) / 50) * 50} kcal a day (≈450 below your estimated ${Math.round(kcal / 50) * 50} kcal maintenance). `, `Περίπου ${Math.round((kcal - 450) / 50) * 50} kcal την ημέρα (≈450 κάτω από τις ~${Math.round(kcal / 50) * 50} kcal συντήρησης). `) : '') + T(`Protein ${Math.round(w * 2)}–${Math.round(w * 2.4)} g a day, keep lifting heavy, 8,000–10,000 steps and 1–3 short cardio sessions a week.`, `Πρωτεΐνη ${Math.round(w * 2)}–${Math.round(w * 2.4)} g την ημέρα, συνέχισε τα βαριά σετ, 8.000–10.000 βήματα και 1–3 σύντομες αερόβιες προπονήσεις την εβδομάδα.`), actions: [] });
    if ((t === 'bulk' || t === 'build' || t === 'recomp') && w) out.push({ kind: 'body', title: t === 'bulk' ? T('Muscle gain: how to eat', 'Μυϊκή ανάπτυξη: διατροφή') : t === 'recomp' ? T('Recomposition: how to eat', 'Ανασύνθεση: διατροφή') : T('Growth: how to eat', 'Ανάπτυξη: διατροφή'), text: (kcal ? (t === 'bulk' ? T(`About ${Math.round((kcal + 250) / 50) * 50} kcal a day (≈250 above maintenance). `, `Περίπου ${Math.round((kcal + 250) / 50) * 50} kcal την ημέρα (≈250 πάνω από τη συντήρηση). `) : T(`About ${Math.round(kcal / 50) * 50} kcal a day (maintenance). `, `Περίπου ${Math.round(kcal / 50) * 50} kcal την ημέρα (συντήρηση). `)) : '') + T(`Protein ${Math.round(w * 1.6)}–${Math.round(w * 2.2)} g a day and 7–9 hours of sleep.`, `Πρωτεΐνη ${Math.round(w * 1.6)}–${Math.round(w * 2.2)} g την ημέρα και 7–9 ώρες ύπνος.`), actions: [] });
    const rw = rate('w');
    if (rw && w) {
      const pct = (100 * rw.perWeek) / w;
      const off = (t === 'cut' && (pct > -0.25 || pct < -1.2)) || (t === 'bulk' && (pct < 0.05 || pct > 0.6)) || ((t === 'recomp' || t === 'maintain') && Math.abs(pct) > 0.4);
      if (off) out.push({ kind: 'body', title: T(`Weight ${sgn(rw.perWeek, 2)} kg a week`, `Βάρος ${sgn(rw.perWeek, 2)} kg την εβδομάδα`), text: trendText(t, pct).replace(/^./, (c) => c.toUpperCase()) + '.', actions: [] });
    }
    if (mt.whtrCat && mt.whtrCat[0] !== 'ok') out.push({ kind: 'body', title: T(`Waist-to-height ${nf(mt.whtr, 2)}`, `Μέση προς ύψος ${nf(mt.whtr, 2)}`), text: T('Above 0.5 means more belly fat and a higher health risk. Reducing it comes before the look: a mild calorie deficit and more daily movement.', 'Πάνω από 0,5 σημαίνει περισσότερο κοιλιακό λίπος και αυξημένο κίνδυνο για την υγεία. Η μείωσή του προηγείται της εμφάνισης: μικρό θερμιδικό έλλειμμα και περισσότερη καθημερινή κίνηση.'), actions: [] });
    if (mt.age >= 40) out.push({ kind: 'body', title: T(`At ${mt.age}: recovery and joints`, `Στα ${mt.age}: αποκατάσταση και αρθρώσεις`), text: T('Warm up 5–10 minutes with lighter sets, leave ~48 hours before training the same muscle hard again, and keep loading the legs: leg strength protects bones and balance with age.', 'Ζέσταμα 5–10 λεπτά με ελαφρύτερα σετ, ~48 ώρες πριν δουλέψεις ξανά έντονα τον ίδιο μυ και συνέχισε να φορτώνεις τα πόδια: η δύναμη των ποδιών προστατεύει τα οστά και την ισορροπία με τα χρόνια.'), actions: [] });
    if (t === 'bulk' || t === 'build' || t === 'recomp') stagnant().forEach((s) => out.push({ kind: 'body', stag: s, title: T(`${s.name}: no growth in ${Math.round(days(s.from.date, s.to.date) / 7)} weeks`, `${s.name}: χωρίς αύξηση εδώ και ${Math.round(days(s.from.date, s.to.date) / 7)} εβδομάδες`), text: T(`${nf(s.from.v)} → ${nf(s.to.v)} cm.`, `${nf(s.from.v)} → ${nf(s.to.v)} cm.`), actions: [] }));
    return out;
  }

  function coachLines(ctx, f) {
    const mt = f ? f.mt : metrics(ctx.sessions);
    if (!mt.W && !data.profile.height) return [];
    const l = [T('Body data:', 'Στοιχεία σώματος:')];
    const p = data.profile;
    l.push([p.sex ? (p.sex === 'm' ? T('man', 'άνδρας') : T('woman', 'γυναίκα')) : null, mt.age ? T(`${mt.age} years`, `${mt.age} ετών`) : null, p.height ? `${p.height} cm` : null].filter(Boolean).join(', '));
    if (mt.W) l.push(T(`Weight ${nf(mt.W.v)} kg (${mt.W.date})`, `Βάρος ${nf(mt.W.v)} kg (${mt.W.date})`) + (mt.bmi ? `, BMI ${nf(mt.bmi)}` : '') + (mt.fat != null ? T(`, body fat ${nf(mt.fat)}%`, `, λίπος ${nf(mt.fat)}%`) + (mt.fatEstimated ? T(' (estimated)', ' (εκτίμηση)') : '') : '') + (mt.M ? T(`, muscle ${nf(mt.M.v)}%`, `, μύες ${nf(mt.M.v)}%`) : '') + (mt.bmr ? `, BMR ${Math.round(mt.bmr)} kcal` : ''));
    const ms = MEAS.filter(([k]) => mt.meas[k]).map(([k, n]) => `${n} ${nf(mt.meas[k].v)}`);
    if (ms.length) l.push(T('Measurements (cm): ', 'Μετρήσεις (cm): ') + ms.join(', '));
    ['w', 'fat', 'mus', 'waist', 'arm'].forEach((k) => { const r = rate(k); if (r) l.push(`${k}: ${sgn(r.perWeek, 2)}/${T('week', 'εβδ.')} (${nf(r.weeks)} ${T('weeks', 'εβδ.')})`); });
    const g = data.goals;
    if (g.w || g.fat || g.mus || g.waist) l.push(T('Goals: ', 'Στόχοι: ') + [g.w ? T(`weight ${nf(g.w)} kg`, `βάρος ${nf(g.w)} kg`) : null, g.fat ? T(`body fat ${nf(g.fat)}%`, `λίπος ${nf(g.fat)}%`) : null, g.mus ? T(`muscle ${nf(g.mus)}%`, `μύες ${nf(g.mus)}%`) : null, g.waist ? T(`waist ${nf(g.waist)} cm`, `μέση ${nf(g.waist)} cm`) : null, g.date ? T(`by ${g.date}`, `έως ${g.date}`) : null].filter(Boolean).join(', '));
    if (f) l.push(T(`Goal type: ${TYPE[f.type][0]}${f.inferred ? ' (inferred)' : ''}, fit to goals ${nf(f.score)}/10`, `Είδος στόχου: ${TYPE[f.type][0]}${f.inferred ? ' (εκτίμηση)' : ''}, ταίριασμα με τους στόχους ${nf(f.score)}/10`));
    return l;
  }

  // ο στόχος (ορισμένος ή προτεινόμενος από τις μετρήσεις) για τους στόχους σετ ανά μυ
  function goalType() { const gi = goalInfo(metrics(0)); return gi.type ? { type: gi.type, inferred: !!gi.inferred, label: TYPE[gi.type][0] } : null; }
  // πορεία της περιφέρειας που αντιστοιχεί σε έναν μυ (≥ 6 εβδομάδες μετρήσεων)
  function muscleTrend(mid) {
    const k = Object.keys(MEAS_MUSCLES).find((x) => MEAS_MUSCLES[x].includes(mid));
    if (!k) return null;
    const s = series(k);
    if (s.length < 2) return null;
    const a = s[0], b = s[s.length - 1];
    const wk = days(a.date, b.date) / 7;
    if (wk < 6) return null;
    const d = b.v - a.v;
    return { key: k, name: MEAS.find((x) => x[0] === k)[1], from: a, to: b, weeks: Math.round(wk), delta: d, state: d <= 0.2 ? 'flat' : 'grow' };
  }
  const sig = () => JSON.stringify(data).length + ':' + data.entries.map((e) => e.id + e.date).join('|') + JSON.stringify(data.profile) + JSON.stringify(data.goals) + '@' + today();
  const goalLabel = (ctx) => { const mt = metrics(ctx ? ctx.sessions : 0); const gi = goalInfo(mt); return gi.type ? TYPE[gi.type][0] + (gi.inferred ? T(' (suggested)', ' (πρόταση)') : '') : null; };

  // ------------------------------------------------------------ DOM
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
  const uid = () => 'bd' + Math.random().toString(36).slice(2, 7);
  const field = (label, input, hint, cls) => { const id = input.id || (input.id = uid()); return h('div', { class: 'bd-f' + (cls ? ' ' + cls : '') }, h('label', { for: id, text: label }), input, hint ? h('small', { text: hint }) : null); };
  // κείμενο με δεκαδικό πληκτρολόγιο: δέχεται και «15,5» και «15.5» (το type=number πετάει το κόμμα → 155)
  const shown = (v) => (v == null || v === '' ? '' : EL ? String(v).replace('.', ',') : String(v));
  const numInput = (value, oninput, attrs) => { const a = Object.assign({}, attrs || {}); delete a.step; delete a.min; return h('input', Object.assign({ type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: shown(value), oninput: (e) => oninput(e.target.value) }, a)); };
  // έλεγχος ενός πεδίου: κενό = εντάξει, αλλιώς αριθμός μέσα στα όρια
  const badNum = (raw, lo, hi) => String(raw ?? '').trim() !== '' && !(num(raw) >= lo && num(raw) <= hi);
  const MUS_HINT = T('as your scale shows it: skeletal muscle (~30–45%) or muscle mass (~70–80%)', 'όπως τη δείχνει η ζυγαριά: σκελετικοί μύες (~30–45%) ή μυϊκή μάζα (~70–80%)');
  const card = (label, value, sub, cls) => h('div', { class: 'bd-card' + (cls ? ' ' + cls : '') }, h('span', { class: 'bd-l', text: label }), h('b', { text: value }), sub ? h('small', { text: sub }) : null);

  // πρόχειρα που επιβιώνουν από τα re-render της αξιολόγησης
  const draft = { profile: null, entry: null, goals: null, msg: '', gmsg: '', pmsg: '', showMeas: false };
  const blankEntry = () => ({ date: today(), w: '', fat: '', mus: '', m: {} });

  function mountTab(host, ctx) {
    if (!host) return;
    host.replaceChildren();
    const mt = metrics(ctx.sessions);
    host.appendChild(h('p', { class: 'sub', text: T('Your details, weight, body composition and measurements, each with the date you took them. The review uses them to judge whether the plan fits your body and goals.', 'Τα στοιχεία σου, το βάρος, η σύσταση σώματος και οι περιφέρειες, το καθένα με την ημερομηνία μέτρησης. Η αξιολόγηση τα χρησιμοποιεί για να κρίνει αν το πρόγραμμα ταιριάζει στο σώμα και στους στόχους σου.') }));

    // --- προφίλ
    const p = draft.profile || (draft.profile = { sex: data.profile.sex, age: age() ?? '', height: data.profile.height ?? '' });
    const sexSel = h('select', { onchange: (e) => { p.sex = e.target.value; } },
      h('option', { value: '', text: T('Choose…', 'Επίλεξε…') }), h('option', { value: 'm', text: T('Man', 'Άνδρας') }), h('option', { value: 'f', text: T('Woman', 'Γυναίκα') }));
    sexSel.value = p.sex || '';
    const prof = h('form', { class: 'bd-box bd-grid3', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const a = num(p.age), hgt = num(p.height);
      if (p.age !== '' && (!a || a < 10 || a > 100)) { draft.pmsg = T('Enter an age between 10 and 100.', 'Γράψε ηλικία από 10 έως 100.'); return rerender(); }
      if (p.height !== '' && (!hgt || hgt < 100 || hgt > 250)) { draft.pmsg = T('Enter your height in cm (100–250).', 'Γράψε το ύψος σε εκατοστά (100–250).'); return rerender(); }
      data.profile = { sex: p.sex || '', age: a ? Math.round(a) : null, ageOn: a ? today() : null, height: hgt };
      draft.profile = null; draft.pmsg = T('Saved.', 'Αποθηκεύτηκε.');
      persist();
    } },
      h('h3', { class: 'bd-h', text: T('About you', 'Στοιχεία') }),
      field(T('Sex', 'Φύλο'), sexSel, T('for BMR and healthy ranges', 'για τον BMR και τα υγιή όρια')),
      field(T('Age', 'Ηλικία'), numInput(p.age, (v) => { p.age = v; }, { step: '1', inputmode: 'numeric' })),
      field(T('Height (cm)', 'Ύψος (cm)'), numInput(p.height, (v) => { p.height = v; }, { step: '0.5' })),
      h('button', { class: 'btn primary bd-wide', type: 'submit', text: T('Save details', 'Αποθήκευση στοιχείων') }),
      draft.pmsg ? h('p', { class: 'bd-msg bd-wide', role: 'status', text: draft.pmsg }) : null);
    draft.pmsg = '';
    host.appendChild(prof);

    // --- σημερινή εικόνα
    if (mt.W || mt.fat != null || Object.keys(mt.meas).length) {
      const cards = h('div', { class: 'bd-cards' });
      const dsub = (l) => (l ? fmtDate(l.date) : '');
      if (mt.W) cards.appendChild(card(T('Weight', 'Βάρος'), nf(mt.W.v) + ' kg', dsub(mt.W)));
      if (mt.bmi) cards.appendChild(card('BMI', nf(mt.bmi), mt.bmiCat[1] + (mt.bmiCat[0] === 'over' && mt.ffmiN >= 21 ? T(' · muscular build', ' · μυώδης σωματότυπος') : ''), 'c-' + (mt.bmiCat[0] === 'normal' ? 'ok' : mt.bmiCat[0] === 'obese' ? 'high' : 'warn')));
      if (mt.bmr) cards.appendChild(card('BMR', Math.round(mt.bmr) + ' kcal', mt.bmrFormula));
      if (mt.tdee) cards.appendChild(card(T('Maintenance', 'Συντήρηση'), '~' + Math.round(mt.tdee / 10) * 10 + ' kcal', mt.activity));
      if (mt.fat != null) cards.appendChild(card(T('Body fat', 'Λίπος'), nf(mt.fat) + '%' + (mt.fatKg ? ' · ' + nf(mt.fatKg) + ' kg' : ''), (mt.fatEstimated ? T('estimate from measurements (US Navy) · ', 'εκτίμηση από περιφέρειες (US Navy) · ') : dsub(mt.F) + ' · ') + mt.fatCat[1], 'c-' + mt.fatCat[0]));
      if (mt.M) cards.appendChild(card(T('Muscle', 'Μύες'), nf(mt.M.v) + '%' + (mt.musKg ? ' · ' + nf(mt.musKg) + ' kg' : ''), dsub(mt.M)));
      if (mt.lbm) cards.appendChild(card(T('Lean mass', 'Άλιπη μάζα'), nf(mt.lbm) + ' kg', mt.ffmiN ? 'FFMI ' + nf(mt.ffmiN) : ''));
      if (mt.whr) cards.appendChild(card(T('Waist / hips', 'Μέση / λεκάνη'), nf(mt.whr, 2), mt.whrRisk ? T('above the healthy limit', 'πάνω από το υγιές όριο') : T('healthy', 'υγιές'), mt.whrRisk ? 'c-warn' : 'c-ok'));
      if (mt.whtr) cards.appendChild(card(T('Waist / height', 'Μέση / ύψος'), nf(mt.whtr, 2), mt.whtrCat[1], 'c-' + mt.whtrCat[0]));
      host.appendChild(h('h3', { class: 'bd-h2', text: T('Now', 'Σήμερα') }));
      host.appendChild(cards);
      if (!data.profile.height || !mt.age || !data.profile.sex) host.appendChild(h('p', { class: 'bd-hint', text: T('Add your sex, age and height above for BMI, BMR and the healthy ranges.', 'Συμπλήρωσε φύλο, ηλικία και ύψος παραπάνω για BMI, BMR και τα υγιή όρια.') }));
      // μεταβολές
      const rows = [['w', T('Weight', 'Βάρος'), 'kg'], ['fat', T('Body fat', 'Λίπος'), '%'], ['mus', T('Muscle', 'Μύες'), '%']].concat(MEAS.map(([k, n]) => [k, n, 'cm']))
        .map(([k, n, u]) => { const s = series(k); if (!s.length) return null; const last = s[s.length - 1], prev = s[s.length - 2], first = s[0];
          return h('tr', {}, h('th', { scope: 'row', text: n }), h('td', { text: nf(last.v) + ' ' + u }),
            h('td', { class: 'chg', text: prev ? sgn(last.v - prev.v) : '–' }), h('td', { class: 'chg', text: s.length > 1 ? sgn(last.v - first.v) : '–' })); }).filter(Boolean);
      if (rows.length) host.appendChild(h('div', { class: 'bd-tablewrap' }, h('table', { class: 'bd-table' },
        h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: T('Latest', 'Τελευταία') }), h('th', { text: T('vs previous', 'από προηγ.') }), h('th', { text: T('since start', 'από αρχή') }))),
        h('tbody', {}, rows))));
    }

    // --- νέα μέτρηση
    const en = draft.entry || (draft.entry = blankEntry());
    const measBox = h('details', { class: 'bd-meas', ontoggle: (e) => { draft.showMeas = e.target.open; } },
      h('summary', { text: T('Measurements (cm)', 'Περιφέρειες (cm)') }),
      h('div', { class: 'bd-grid3' }, MEAS.map(([k, n, hint]) => field(n, numInput(en.m[k], (v) => { en.m[k] = v; }, { step: '0.1' }), hint))));
    if (draft.showMeas) measBox.open = true;
    const form = h('form', { class: 'bd-box', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      if (!isDate(en.date) || en.date > today()) { draft.msg = T('Choose a date that is not in the future.', 'Διάλεξε ημερομηνία που δεν είναι στο μέλλον.'); return rerender(); }
      const c = cleanEntry({ date: en.date, w: en.w, fat: en.fat, mus: en.mus, m: en.m });
      if (!hasData(c)) { draft.msg = T('Fill in at least one value.', 'Συμπλήρωσε τουλάχιστον μία τιμή.'); return rerender(); }
      const errs = [];
      if (badNum(en.w, 25, 300)) errs.push(T('weight 25–300 kg', 'βάρος 25–300 kg'));
      if (badNum(en.fat, 3, 70)) errs.push(T('body fat 3–70%', 'λίπος 3–70%'));
      if (badNum(en.mus, 10, 90)) errs.push(T('muscle 10–90%', 'μύες 10–90%'));
      MKEYS.forEach((k) => { if (badNum(en.m[k], 10, 250)) errs.push(MEAS.find((x) => x[0] === k)[1] + ' 10–250 cm'); });
      if (errs.length) { draft.msg = T('Check: ', 'Έλεγξε: ') + errs.join(', ') + '.'; return rerender(); }
      data.entries.push(c);
      draft.entry = blankEntry(); draft.msg = T('Measurement saved.', 'Η μέτρηση αποθηκεύτηκε.'); draft.showMeas = false;
      persist();
    } },
      h('h3', { class: 'bd-h', text: T('New measurement', 'Νέα μέτρηση') }),
      h('div', { class: 'bd-grid3' },
        field(T('Date', 'Ημερομηνία'), h('input', { type: 'date', value: en.date, max: today(), oninput: (e) => { en.date = e.target.value; } }), null, 'bd-wide'),
        field(T('Weight (kg)', 'Βάρος (kg)'), numInput(en.w, (v) => { en.w = v; }, { step: '0.1' })),
        field(T('Body fat (%)', 'Λίπος (%)'), numInput(en.fat, (v) => { en.fat = v; }, { step: '0.1' })),
        field(T('Muscle (%)', 'Μύες (%)'), numInput(en.mus, (v) => { en.mus = v; }, { step: '0.1' }), MUS_HINT)),
      measBox,
      h('button', { class: 'btn primary', type: 'submit', text: T('Save measurement', 'Αποθήκευση μέτρησης') }),
      draft.msg ? h('p', { class: 'bd-msg', role: 'status', text: draft.msg }) : null,
      h('p', { class: 'bd-hint', text: T('Weigh and measure in the morning, before eating. You can fill in only what you measured that day.', 'Ζυγίσου και μετρήσου το πρωί, πριν φας. Συμπλήρωσε μόνο ό,τι μέτρησες εκείνη τη μέρα.') }));
    draft.msg = '';
    host.appendChild(form);

    // --- ιστορικό
    const list = sorted().reverse();
    if (list.length) {
      host.appendChild(h('h3', { class: 'bd-h2', text: T('History', 'Ιστορικό') }));
      host.appendChild(h('ul', { class: 'bd-hist' }, list.map((e) => {
        const parts = [e.w ? nf(e.w) + ' kg' : null, e.fat ? T('fat ', 'λίπος ') + nf(e.fat) + '%' : null, e.mus ? T('muscle ', 'μύες ') + nf(e.mus) + '%' : null]
          .concat(MEAS.filter(([k]) => e.m[k]).map(([k, n]) => n + ' ' + nf(e.m[k])));
        return h('li', {}, h('span', { class: 'd', text: fmtDate(e.date) }), h('span', { class: 'v', text: parts.filter(Boolean).join(' · ') }),
          h('button', { type: 'button', 'aria-label': T('Delete this measurement', 'Διαγραφή μέτρησης'), text: '×', onclick: () => { data.entries = data.entries.filter((x) => x.id !== e.id); persist(); } }));
      })));
    }
    function rerender() { mountTab(host, ctx); }
  }

  function mountGoals(host, ctx, f) {
    if (!host) return;
    host.replaceChildren();
    const mt = metrics(ctx.sessions);
    const gi = goalInfo(mt);
    host.appendChild(h('p', { class: 'sub', text: T('What you want to reach. The kilos follow from the target weight and percentages; you can type either.', 'Τι θέλεις να πετύχεις. Τα κιλά βγαίνουν από το βάρος-στόχο και τα ποσοστά· μπορείς να γράψεις όποιο από τα δύο.') }));
    const g = draft.goals || (draft.goals = { w: data.goals.w ?? '', fat: data.goals.fat ?? '', mus: data.goals.mus ?? '', waist: data.goals.waist ?? '', fatKg: '', musKg: '', date: data.goals.date ?? '' });
    const syncKg = () => {
      const w = num(g.w);
      if (w && num(g.fat)) g.fatKg = shown(Math.round(w * num(g.fat)) / 100);
      if (w && num(g.mus)) g.musKg = shown(Math.round(w * num(g.mus)) / 100);
    };
    if (g.fatKg === '' && g.musKg === '') syncKg();
    const inputs = {};
    const upd = () => { ['fatKg', 'musKg', 'fat', 'mus'].forEach((k) => { if (inputs[k] && document.activeElement !== inputs[k]) inputs[k].value = g[k]; }); };
    inputs.w = numInput(g.w, (v) => { g.w = v; syncKg(); upd(); }, { step: '0.1' });
    inputs.fat = numInput(g.fat, (v) => { g.fat = v; syncKg(); upd(); }, { step: '0.1' });
    inputs.fatKg = numInput(g.fatKg, (v) => { g.fatKg = v; const w = num(g.w); if (w && num(v)) g.fat = shown(Math.round((1000 * num(v)) / w) / 10); upd(); }, { step: '0.1' });
    inputs.mus = numInput(g.mus, (v) => { g.mus = v; syncKg(); upd(); }, { step: '0.1' });
    inputs.musKg = numInput(g.musKg, (v) => { g.musKg = v; const w = num(g.w); if (w && num(v)) g.mus = shown(Math.round((1000 * num(v)) / w) / 10); upd(); }, { step: '0.1' });
    const now = (v, u) => (v != null ? T('now ', 'τώρα ') + nf(v) + u : null);
    const form = h('form', { class: 'bd-box', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const w = num(g.w), fat = num(g.fat), mus = num(g.mus);
      const errs = [];
      if (badNum(g.w, 25, 300)) errs.push(T('target weight 25–300 kg', 'βάρος-στόχος 25–300 kg'));
      if (badNum(g.fat, 3, 70)) errs.push(T('body fat 3–70%', 'λίπος 3–70%'));
      if (badNum(g.mus, 10, 90)) errs.push(T('muscle 10–90%', 'μύες 10–90%'));
      if (badNum(g.waist, 40, 200)) errs.push(T('waist 40–200 cm', 'μέση 40–200 cm'));
      if (errs.length) { draft.gmsg = T('Check: ', 'Έλεγξε: ') + errs.join(', ') + '.'; return rerender(); }
      if (g.date && (!isDate(g.date) || g.date <= today())) { draft.gmsg = T('The target date must be in the future.', 'Η ημερομηνία-στόχος πρέπει να είναι στο μέλλον.'); return rerender(); }
      data.goals = { w, fat, mus, waist: num(g.waist), date: g.date || null, setOn: today() };
      draft.goals = null; draft.gmsg = T('Goals saved.', 'Οι στόχοι αποθηκεύτηκαν.');
      persist();
    } },
      h('h3', { class: 'bd-h', text: T('My goals', 'Οι στόχοι μου') }),
      h('div', { class: 'bd-grid2' },
        field(T('Target weight (kg)', 'Βάρος-στόχος (kg)'), inputs.w, now(mt.W && mt.W.v, ' kg'), 'bd-wide'),
        field(T('Body fat (%)', 'Λίπος (%)'), inputs.fat, now(mt.fat, '%')),
        field(T('Body fat (kg)', 'Λίπος (kg)'), inputs.fatKg, now(mt.fatKg, ' kg')),
        field(T('Muscle (%)', 'Μύες (%)'), inputs.mus, [now(mt.M && mt.M.v, '%'), MUS_HINT].filter(Boolean).join(' · ')),
        field(T('Muscle (kg)', 'Μύες (kg)'), inputs.musKg, now(mt.musKg, ' kg')),
        field(T('Waist (cm)', 'Μέση (cm)'), numInput(g.waist, (v) => { g.waist = v; }, { step: '0.5' }), mt.meas.waist ? now(mt.meas.waist.v, ' cm') : T('add a waist measurement in the Body tab', 'πρόσθεσε μέτρηση μέσης στην καρτέλα Σώμα'), 'bd-wide'),
        field(T('By (optional)', 'Έως (προαιρετικά)'), h('input', { type: 'date', value: g.date, min: today(), oninput: (e) => { g.date = e.target.value; } }), null, 'bd-wide')),
      h('button', { class: 'btn primary', type: 'submit', text: T('Save goals', 'Αποθήκευση στόχων') }),
      draft.gmsg ? h('p', { class: 'bd-msg', role: 'status', text: draft.gmsg }) : null);
    draft.gmsg = '';
    host.appendChild(form);

    // --- πού βρίσκεσαι
    if (gi.type) {
      const box = h('div', { class: 'bd-box' });
      box.appendChild(h('h3', { class: 'bd-h', text: (gi.inferred ? T('Suggested focus: ', 'Προτεινόμενη κατεύθυνση: ') : T('Your goal: ', 'Ο στόχος σου: ')) + TYPE[gi.type][0] }));
      box.appendChild(h('p', { class: 'bd-hint', text: TYPE[gi.type][1] + (gi.inferred ? T(' Based on your measurements, until you set goals.', ' Με βάση τις μετρήσεις σου, μέχρι να ορίσεις στόχους.') : '') }));
      const bar = (label, cur, goal, start, u) => {
        if (cur == null || goal == null) return null;
        const from = start != null ? start : cur;
        const tot = goal - from, done = cur - from;
        const pct = Math.abs(tot) < 1e-6 ? 100 : clamp((100 * done) / tot, 0, 100);
        return h('div', { class: 'bd-bar' }, h('div', { class: 'bd-bar-t' }, h('span', { text: label }), h('b', { text: `${nf(cur)} → ${nf(goal)} ${u}` })),
          h('span', { class: 'bd-track' }, h('i', { style: `width:${pct}%` })),
          h('small', { text: Math.abs(goal - cur) < 0.05 ? T('reached', 'επιτεύχθηκε') : T(`${sgn(goal - cur)} ${u} to go`, `${sgn(goal - cur)} ${u} ακόμα`) }));
      };
      const first = (k) => { const s = series(k); return s.length ? s[0].v : null; };
      [bar(T('Weight', 'Βάρος'), mt.W && mt.W.v, data.goals.w, first('w'), 'kg'),
        bar(T('Body fat', 'Λίπος'), mt.fat, data.goals.fat, first('fat'), '%'),
        bar(T('Body fat', 'Λίπος'), mt.fatKg, gi.fatKg, null, 'kg'),
        bar(T('Muscle', 'Μύες'), mt.M && mt.M.v, data.goals.mus, first('mus'), '%'),
        bar(T('Muscle', 'Μύες'), mt.musKg, gi.musKg, null, 'kg'),
        bar(T('Waist', 'Μέση'), mt.meas.waist ? mt.meas.waist.v : null, data.goals.waist, first('waist'), 'cm')].forEach((b) => b && box.appendChild(b));
      if (gi.needPerWeek != null && mt.W) {
        const pct = (100 * gi.needPerWeek) / mt.W.v;
        const tooFast = gi.needPerWeek < 0 ? pct < -1 : pct > 0.5;
        box.appendChild(h('p', { class: 'bd-hint' + (tooFast ? ' bd-warn' : ''), text: T(`To reach it by ${fmtDate(data.goals.date)}: ${sgn(gi.needPerWeek, 2)} kg a week (${sgn(pct, 2)}%).`, `Για να το πετύχεις έως ${fmtDate(data.goals.date)}: ${sgn(gi.needPerWeek, 2)} kg την εβδομάδα (${sgn(pct, 2)}%).`) + (tooFast ? T(' That is faster than is healthy; give it more time.', ' Είναι πιο γρήγορα από το υγιές· δώσε του περισσότερο χρόνο.') : '') }));
      }
      if (gi.dMkg != null && gi.dMkg > 0) {
        const months = gi.dMkg / 0.75;
        box.appendChild(h('p', { class: 'bd-hint', text: T(`+${nf(gi.dMkg)} kg of muscle takes roughly ${Math.max(1, Math.round(months))}–${Math.max(2, Math.round(months * 2))} months for most people (about 0.5–1 kg a month at best).`, `+${nf(gi.dMkg)} kg μυών θέλουν περίπου ${Math.max(1, Math.round(months))}–${Math.max(2, Math.round(months * 2))} μήνες για τους περισσότερους (έως ~0,5–1 kg τον μήνα στην καλύτερη περίπτωση).`) }));
      }
      host.appendChild(box);
    }

    // --- ταίριασμα προγράμματος
    if (f) {
      const box = h('div', { class: 'bd-box' });
      box.appendChild(h('h3', { class: 'bd-h', text: T(`Plan fit to your goal: ${nf(f.score)}/10`, `Ταίριασμα προγράμματος με τον στόχο: ${nf(f.score)}/10`) }));
      box.appendChild(h('ul', { class: 'bd-reasons' }, f.reasons.map(([s, name, why]) => h('li', {}, h('b', { class: 'bd-sc', style: `--c:${s >= 8 ? '#2fbf71' : s >= 6 ? '#e3b23c' : '#e0663a'}`, text: nf(s) }), h('span', {}, h('strong', { text: name }), ' · ' + why)))));
      box.appendChild(h('p', { class: 'bd-hint', text: T('This counts for 10% of the overall score. See the Suggestions tab for what to change.', 'Μετράει 10% στον συνολικό βαθμό. Δες τις Προτάσεις για το τι να αλλάξεις.') }));
      host.appendChild(box);
    } else if (!ctx.sessions) host.appendChild(h('p', { class: 'bd-hint', text: T('Tick a program for your week to see how well it fits your goal.', 'Τσέκαρε ένα πρόγραμμα για την εβδομάδα σου για να δεις πόσο ταιριάζει με τον στόχο.') }));
    function rerender() { mountGoals(host, ctx, f); }
  }

  const css = `
.bd-box{border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:12px;margin:12px 0}
.bd-h{margin:0 0 10px;font-size:1rem}
.bd-h2{margin:18px 0 8px;font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-2)}
.bd-grid3,.bd-grid2{display:grid;gap:8px 10px;grid-template-columns:repeat(3,minmax(0,1fr))}
.bd-grid2{grid-template-columns:repeat(2,minmax(0,1fr))}
form.bd-grid3>.bd-h{grid-column:1/-1}
@media (max-width:520px){.bd-grid3{grid-template-columns:repeat(2,minmax(0,1fr))}}
.bd-wide{grid-column:1/-1}
.bd-f label{display:block;font-size:.76rem;color:var(--ink-2);margin-bottom:3px}
.bd-f input,.bd-f select{width:100%;min-width:0;padding:8px 10px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font-size:.95rem}
.bd-f input:focus,.bd-f select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.bd-f small{display:block;font-size:.7rem;color:var(--ink-2);margin-top:2px;line-height:1.25}
.bd-box .btn{margin-top:12px;justify-content:center;width:100%}
.bd-msg{margin:8px 0 0;font-size:.85rem;font-weight:600}
.bd-hint{margin:8px 0 0;font-size:.8rem;color:var(--ink-2)}
.bd-warn{color:var(--accent);font-weight:600}
.bd-meas{margin-top:10px}
.bd-meas>summary{cursor:pointer;font-weight:600;font-size:.88rem;padding:6px 0}
.bd-meas .bd-grid3{margin-top:6px}
.bd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.bd-card{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border-radius:10px;background:var(--surface-2);border-left:3px solid var(--line)}
.bd-card .bd-l{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}
.bd-card b{font-size:1.05rem;font-variant-numeric:tabular-nums}
.bd-card small{font-size:.74rem;color:var(--ink-2)}
.bd-card.c-ok{border-left-color:#2fbf71}.bd-card.c-warn{border-left-color:#e3b23c}.bd-card.c-high{border-left-color:#e0663a}.bd-card.c-low{border-left-color:#e3b23c}
.bd-tablewrap{overflow-x:auto;margin-top:10px}
.bd-table{width:100%;border-collapse:collapse;font-size:.84rem;font-variant-numeric:tabular-nums}
.bd-table th,.bd-table td{padding:5px 6px;text-align:right;border-top:1px solid var(--line);white-space:nowrap}
.bd-table thead th{border-top:none;font-size:.7rem;color:var(--ink-2);font-weight:600}
.bd-table th[scope=row]{text-align:left;font-weight:600;white-space:normal}
.bd-table .chg{color:var(--ink-2)}
.bd-hist{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:.84rem}
.bd-hist li{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--line);padding-top:5px}
.bd-hist .d{color:var(--ink-2);min-width:92px;flex-shrink:0}
.bd-hist .v{flex:1;min-width:0}
.bd-hist button{border:none;background:none;color:var(--ink-2);padding:0 4px;font-size:1rem}
.bd-hist button:hover{color:var(--accent)}
.bd-bar{margin-top:10px}
.bd-bar-t{display:flex;justify-content:space-between;gap:8px;font-size:.86rem}
.bd-track{display:block;height:7px;border-radius:99px;background:var(--line);margin:4px 0 2px;overflow:hidden}
.bd-track i{display:block;height:100%;background:var(--accent);border-radius:99px}
.bd-bar small{font-size:.74rem;color:var(--ink-2)}
.bd-reasons{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:.86rem}
.bd-reasons li{display:flex;gap:10px;align-items:baseline}
.bd-sc{flex-shrink:0;min-width:34px;text-align:center;padding:1px 6px;border-radius:99px;background:color-mix(in srgb,var(--c) 22%,var(--surface));font-variant-numeric:tabular-nums}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // κάθε αλλαγή ξαναβαθμολογεί την αξιολόγηση
  listeners.push(() => { try { window.__mxProgram && window.__mxProgram.onPrograms && window.__mxProgram.onPrograms(); } catch (e) { /* ignore */ } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCloud); else initCloud();

  window.__mxBody = { metrics, fit, tips, coachLines, sig, goalLabel, goalType, muscleTrend, fmtCm: (v) => nf(v), mountTab, mountGoals, TYPE, onChange: (f) => listeners.push(f), data: () => JSON.parse(JSON.stringify(data)) };
})();
