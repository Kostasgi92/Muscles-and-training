/* Body data and goals for the program review.
   profile = {sex: 'm'|'f'|'', age, ageOn: "YYYY-MM-DD", height (cm)}
   entries = [{id, date: "YYYY-MM-DD", at, w (kg), fat (%), mus (% muscle), bone (% bone), m: {neck, shoulders, chest, arm, forearm, waist, tummy, hips, thigh, calf} (cm)}]
   goals   = {type: 'cut'|'bulk'|'maintain' (primary goal, chosen by the user; none = muscle gain), w, fat, mus, bone, waist, date, setOn}
   Fat + muscle + bone make 100% of the body when the scale reports "muscle mass" (everything that is not fat or bone):
   the missing one of the three is worked out, and three typed numbers that do not total 100% are refused. With
   "skeletal muscle" (~30–50%) the three total well under 100% and are accepted as they are.
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
    // κοιλιά: μόνο για την πορεία σου· οι έλεγχοι υγείας (μέση/ύψος, US Navy) έχουν όρια ορισμένα για τη μέση
    ['tummy', T('Tummy', 'Κοιλιά'), T('at the widest point of the belly, usually a little below the navel, relaxed', 'στο φαρδύτερο σημείο της κοιλιάς, συνήθως λίγο κάτω από τον αφαλό, χαλαρά')],
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
    return { id: String(e.id || Math.random().toString(36).slice(2, 10)), date: e.date, at: +e.at || Date.now(), w: num(e.w), fat: num(e.fat), mus: num(e.mus), bone: num(e.bone), m };
  };
  const hasData = (e) => e.w || e.fat || e.mus || e.bone || Object.keys(e.m).length;
  // ο κύριος στόχος: απώλεια λίπους, μυϊκή ανάπτυξη ή διατήρηση
  const GOAL_TYPES = ['cut', 'bulk', 'maintain'];
  const cleanAll = (d) => {
    d = d || {};
    const p = d.profile || {};
    const g = d.goals || {};
    return {
      profile: { sex: p.sex === 'm' || p.sex === 'f' ? p.sex : '', age: num(p.age), ageOn: isDate(p.ageOn) ? p.ageOn : null, height: num(p.height) },
      entries: (Array.isArray(d.entries) ? d.entries : []).filter((e) => e && isDate(e.date)).map(cleanEntry).filter(hasData),
      goals: { type: GOAL_TYPES.includes(g.type) ? g.type : null, w: num(g.w), fat: num(g.fat), mus: num(g.mus), bone: num(g.bone), waist: num(g.waist), date: isDate(g.date) ? g.date : null, setOn: isDate(g.setOn) ? g.setOn : null },
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
        } else if (data.entries.length || data.profile.height || data.goals.w || data.goals.type) {
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
  const getv = (e, k) => (k === 'w' || k === 'fat' || k === 'mus' || k === 'bone' ? e[k] : e.m[k]) || null;
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

  // ------------------------------------------------------------ σύσταση: λίπος + μύες + οστά
  // Οι ζυγαριές που δείχνουν οστά μοιράζουν το βάρος σε λίπος, «μυϊκή μάζα» και οστά, άρα τα τρία ποσοστά κάνουν 100%.
  // Από δύο από τα τρία βγαίνει το τρίτο (οστά ή μύες). Με «σκελετικούς μύες» το σύνολο είναι πολύ κάτω από 100
  // (το υπόλοιπο είναι όργανα, νερό, άλλοι ιστοί) και δεν συμπληρώνεται τίποτα.
  const BONE_RANGE = [1, 20];          // όρια για ό,τι γράφει ο χρήστης (%)
  const BONE_REST = [1.5, 10];         // «ό,τι μένει» μετράει ως οστά μόνο αν είναι λογικό νούμερο
  const r1 = (x) => Math.round(x * 10) / 10;
  // → {fat, mus, bone, filled: 'bone'|'mus'|null, total, kind: 'full' (100% ± 1) | 'partial' (σκελετικοί μύες) | 'off'}
  function compose(fat, mus, bone) {
    const out = { fat: fat || null, mus: mus || null, bone: bone || null, filled: null, total: null, kind: null };
    if (out.fat && out.mus && !out.bone) {
      const r = r1(100 - out.fat - out.mus);
      if (r >= BONE_REST[0] && r <= BONE_REST[1]) { out.bone = r; out.filled = 'bone'; }
    } else if (out.fat && out.bone && !out.mus) {
      const r = r1(100 - out.fat - out.bone);
      if (r >= 10 && r <= 90) { out.mus = r; out.filled = 'mus'; }
    }
    if (out.fat && out.mus && out.bone) {
      out.total = r1(out.fat + out.mus + out.bone);
      out.kind = Math.abs(out.total - 100) <= 1 ? 'full' : out.total < 85 ? 'partial' : 'off';
    }
    return out;
  }
  // η γραμμή «σύνολο» κάτω από τα τρία πεδία (φόρμα μέτρησης και φόρμα στόχων)
  function composeLine(c) {
    const part = (k, name) => (c[k] ? `${name} ${nf(c[k])}%` : null);
    const parts = [part('fat', T('fat', 'λίπος')), part('mus', T('muscle', 'μύες')), part('bone', T('bone', 'οστά'))].filter(Boolean);
    if (parts.length < 2) return { text: T('Fat + muscle + bone make 100% of your body: type two and the third is worked out.', 'Λίπος + μύες + οστά κάνουν το 100% του σώματος: γράψε δύο και το τρίτο υπολογίζεται.'), cls: '' };
    if (c.total == null) return { text: parts.join(' + ') + T('. Add the third to see the total.', '. Πρόσθεσε το τρίτο για να δεις το σύνολο.'), cls: '' };
    const sum = parts.join(' + ') + ' = ' + nf(c.total) + '%';
    const fill = c.filled === 'bone' ? T(' (bone worked out as the rest)', ' (τα οστά υπολογίστηκαν ως το υπόλοιπο)') : c.filled === 'mus' ? T(' (muscle worked out as the rest)', ' (οι μύες υπολογίστηκαν ως το υπόλοιπο)') : '';
    if (c.kind === 'full') return { text: sum + fill, cls: 'ok' };
    if (c.kind === 'partial') return { text: sum + T('. Your scale shows skeletal muscle only, so the rest is organs, water and other tissue.', '. Η ζυγαριά σου δείχνει μόνο τους σκελετικούς μύες, οπότε το υπόλοιπο είναι όργανα, νερό και άλλοι ιστοί.'), cls: '' };
    return { text: sum + T('. The three should total 100%: check the numbers, or clear one and it is worked out.', '. Τα τρία πρέπει να κάνουν 100%: έλεγξε τα νούμερα ή σβήσε ένα και θα υπολογιστεί.'), cls: 'bad' };
  }

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
    const W = latest('w'), F = latest('fat'), M = latest('mus'), B = latest('bone');
    const meas = {};
    MKEYS.forEach((k) => { const l = latest(k); if (l) meas[k] = l; });
    const mv = Object.fromEntries(Object.entries(meas).map(([k, l]) => [k, l.v]));
    const h = p.height, hm = h ? h / 100 : null, a = age(), w = W ? W.v : null;
    const out = { W, F, M, B, meas, age: a, height: h, sex: p.sex };
    if (w && hm) {
      out.bmi = w / (hm * hm);
      out.bmiCat = out.bmi < 18.5 ? ['under', T('underweight', 'λιποβαρής')] : out.bmi < 25 ? ['normal', T('normal', 'φυσιολογικό')] : out.bmi < 30 ? ['over', T('overweight', 'υπέρβαρος')] : ['obese', T('obese', 'παχυσαρκία')];
    }
    const navy = !F ? navyFat(p.sex, h, mv) : null;
    const fat = F ? F.v : navy;
    out.fat = fat; out.fatEstimated = !F && navy != null;
    if (w && fat != null) { out.fatKg = (w * fat) / 100; out.lbm = w - out.fatKg; }
    if (w && M) out.musKg = (w * M.v) / 100;
    // οστά: η τιμή της ζυγαριάς, αλλιώς ό,τι μένει μετά το λίπος και τους μύες (boneCalc)
    const comp = compose(F ? F.v : null, M ? M.v : null, B ? B.v : null);
    out.bone = comp.bone; out.boneCalc = comp.filled === 'bone';
    if (w && comp.bone) out.boneKg = (w * comp.bone) / 100;
    out.comp = comp.total != null ? comp : null;
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
  // Ο κύριος στόχος είναι επιλογή του χρήστη (καρτέλα Στόχοι): απώλεια λίπους, μυϊκή ανάπτυξη ή διατήρηση.
  // Χωρίς επιλογή ισχύει η μυϊκή ανάπτυξη (ο σκοπός της εφαρμογής)· δεν συμπεραίνεται από τις μετρήσεις.
  const TYPE = {
    cut: [T('Fat loss', 'Απώλεια λίπους'), T('Lose fat while keeping your muscle.', 'Χάσε λίπος κρατώντας τους μύες σου.')],
    bulk: [T('Muscle gain', 'Μυϊκή ανάπτυξη'), T('Build muscle.', 'Χτίσε μύες.')],
    maintain: [T('Maintenance', 'Διατήρηση'), T('Keep the muscle and strength you have.', 'Κράτα τους μύες και τη δύναμη που έχεις.')],
  };
  // Τι σημαίνει ο στόχος για τους κανόνες της αξιολόγησης (review.js, progress.js):
  //  sets: στόχος σετ ανά μυ ως ποσοστό του κανόνα των 10 · freq: φορές την εβδομάδα ανά μυ
  //  hold: επιτυχία είναι να κρατάς τα φορτία (όχι να τα ανεβάζεις) · growth: οι περιφέρειες πρέπει να μεγαλώνουν
  // Απώλεια λίπους: ίδια σετ με την ανάπτυξη (στις μελέτες με δίαιτα, ≥10 σετ ανά μυ κράτησαν την άλιπη μάζα). Διατήρηση: ~⅓–⅔ του όγκου
  // και 1 φορά την εβδομάδα αρκούν όσο κρατιούνται τα φορτία· από τα 60 χρειάζονται περισσότερα σετ και 2 φορές.
  function rulesFor(type) {
    const older = (age() || 0) >= 60;
    return type === 'maintain' ? { sets: older ? 0.8 : 0.6, freq: older ? 2 : 1, hold: true, growth: false }
      : type === 'cut' ? { sets: 1, freq: 2, hold: true, growth: false }
        : { sets: 1, freq: 2, hold: false, growth: true };
  }
  function goalType() {
    const type = data.goals.type || 'bulk';
    return Object.assign({ type, chosen: !!data.goals.type, label: TYPE[type][0] }, rulesFor(type));
  }
  function goalInfo(mt) {
    const g = data.goals;
    const w = mt.W ? mt.W.v : null;
    const out = { set: !!(g.w || g.fat || g.mus || g.bone || g.waist), g, chosen: !!g.type, type: g.type || 'bulk' };
    const curWaist = mt.meas.waist ? mt.meas.waist.v : null;
    out.dWaist = g.waist && curWaist ? g.waist - curWaist : null;
    if (g.w && g.fat) out.fatKg = (g.w * g.fat) / 100;
    if (g.w && g.mus) out.musKg = (g.w * g.mus) / 100;
    out.dW = g.w && w ? g.w - w : null;
    out.dF = g.fat && mt.fat != null ? g.fat - mt.fat : null;
    out.dFkg = out.fatKg != null && mt.fatKg != null ? out.fatKg - mt.fatKg : null;
    out.dM = g.mus && mt.M ? g.mus - mt.M.v : null;
    out.dMkg = out.musKg != null && mt.musKg != null ? out.musKg - mt.musKg : null;
    // οστά: ο στόχος που έγραψε ο χρήστης, αλλιώς ό,τι μένει από τους στόχους λίπους και μυών
    const gc = compose(g.fat, g.mus, g.bone);
    out.bone = gc.bone; out.boneCalc = gc.filled === 'bone'; out.comp = gc.total != null ? gc : null;
    if (g.w && gc.bone) out.boneKg = (g.w * gc.bone) / 100;
    out.dBoneKg = out.boneKg != null && mt.boneKg != null ? out.boneKg - mt.boneKg : null;
    // Τα κιλά των οστών δεν αλλάζουν αισθητά με δίαιτα ή προπόνηση (στους ενήλικες η άσκηση τα κρατά ή προσθέτει λίγα
    // τοις εκατό). Αν οι στόχοι ζητούν αισθητά λιγότερα ή περισσότερα, προτείνουμε ποσοστά που κρατούν τα σημερινά κιλά.
    if (out.dBoneKg != null && Math.abs(out.dBoneKg) > Math.max(0.2, 0.05 * mt.boneKg)) {
      const keepBone = r1((100 * mt.boneKg) / g.w);
      const keepMus = gc.kind === 'full' && g.fat ? r1(100 - g.fat - keepBone) : null;
      const less = out.dBoneKg < 0;
      const fix = T(`about ${nf(keepBone)}% bone${keepMus ? ` and ${nf(keepMus)}% muscle` : ''} at ${nf(g.w)} kg`, `περίπου ${nf(keepBone)}% οστά${keepMus ? ` και ${nf(keepMus)}% μύες` : ''} στα ${nf(g.w)} kg`);
      out.boneFix = { bone: keepBone, mus: keepMus, less };
      out.boneNote = less
        ? T(`Your targets leave ${nf(out.boneKg)} kg for bone, ${nf(-out.dBoneKg)} kg less than now (${nf(mt.boneKg)} kg). Losing weight should not take bone with it: keeping your bone means ${fix}.`, `Οι στόχοι σου αφήνουν ${nf(out.boneKg)} kg για τα οστά, ${nf(-out.dBoneKg)} kg λιγότερα από σήμερα (${nf(mt.boneKg)} kg). Η απώλεια βάρους δεν πρέπει να παίρνει μαζί της οστά: για να τα κρατήσεις χρειάζεσαι ${fix}.`)
        : T(`Your targets need ${nf(out.dBoneKg)} kg more bone than you have now (${nf(mt.boneKg)} kg). In adults, training keeps bone or adds a few percent at most, so plan for the same bone mass: ${fix}.`, `Οι στόχοι σου θέλουν ${nf(out.dBoneKg)} kg περισσότερα οστά από σήμερα (${nf(mt.boneKg)} kg). Στους ενήλικες η προπόνηση κρατά τα οστά ή προσθέτει το πολύ λίγα τοις εκατό, οπότε υπολόγισε τα ίδια κιλά οστών: ${fix}.`);
    }
    // Μυϊκή ανάπτυξη: με μικρό πλεόνασμα θερμίδων ('surplus'), με σταθερό βάρος ('steady') ή χάνοντας ταυτόχρονα
    // λίπος ('lean'). Το ορίζει το βάρος-στόχος· χωρίς αυτό, το λίπος (στόχος λίπους/μέσης κάτω από το σημερινό ή
    // λίπος πάνω από το υγιές εύρος).
    if (out.type === 'bulk') {
      const fatHigh = !!(mt.fatCat && (mt.fatCat[0] === 'warn' || mt.fatCat[0] === 'high'));
      const leaner = (out.dF != null && out.dF <= -1) || (out.dWaist != null && out.dWaist <= -1);
      out.mode = out.dW != null ? (out.dW < -1 ? 'lean' : out.dW > 1 ? 'surplus' : 'steady') : leaner || fatHigh ? 'lean' : 'surplus';
      out.modeWhy = out.mode === 'lean'
        ? (out.dW != null ? T('Your target weight is below your current weight', 'Το βάρος-στόχος σου είναι κάτω από το σημερινό')
          : leaner ? T('Your fat or waist target is below where you are now', 'Ο στόχος λίπους ή μέσης είναι κάτω από το σημερινό')
            : T('Your body fat is above the healthy range', 'Το λίπος σου είναι πάνω από το υγιές εύρος'))
          + T(', so the plan is to build muscle while slowly losing fat: eat around maintenance or a little below, with plenty of protein.', ', οπότε το πλάνο είναι να χτίζεις μύες χάνοντας σιγά σιγά λίπος: τρώγε γύρω στη συντήρηση ή λίγο πιο κάτω, με αρκετή πρωτεΐνη.')
        : out.mode === 'steady'
          ? T('Your target weight is about your current weight, so the plan is to build muscle at a stable weight: eat around maintenance.', 'Το βάρος-στόχος είναι περίπου το σημερινό σου, οπότε το πλάνο είναι να χτίζεις μύες με σταθερό βάρος: τρώγε γύρω στη συντήρηση.')
          : T('The plan is to gain weight slowly, mostly as muscle: eat a little above maintenance.', 'Το πλάνο είναι να παίρνεις βάρος σιγά σιγά, κυρίως μύες: τρώγε λίγο πάνω από τη συντήρηση.');
    }
    // αριθμητικοί στόχοι που τραβούν αντίθετα από τον κύριο στόχο
    if (out.type === 'cut' && out.dW != null && out.dW > 1) out.clash = T('Your target weight is above your current weight. With fat loss as the goal, the review expects your weight to go down.', 'Το βάρος-στόχος είναι πάνω από το σημερινό σου. Με στόχο την απώλεια λίπους, η αξιολόγηση περιμένει το βάρος να κατεβαίνει.');
    if (out.type === 'maintain' && out.dW != null && Math.abs(out.dW) > 2) out.clash = T('Your target weight is not your current weight. With maintenance as the goal, the review expects a stable weight; choose fat loss or muscle gain to change it.', 'Το βάρος-στόχος δεν είναι το σημερινό σου. Με στόχο τη διατήρηση, η αξιολόγηση περιμένει σταθερό βάρος· διάλεξε απώλεια λίπους ή μυϊκή ανάπτυξη για να το αλλάξεις.');
    // ο βαθμός «Στόχοι» μετράει όταν ο χρήστης έχει ασχοληθεί: επιλογή στόχου, αριθμητικοί στόχοι ή μετρήσεις
    out.engaged = out.chosen || out.set || data.entries.length > 0;
    if (g.date && out.dW != null) {
      const wk = days(today(), g.date) / 7;
      out.weeksLeft = wk;
      if (wk > 0.5) out.needPerWeek = out.dW / wk;
    }
    return out;
  }

  // ------------------------------------------------------------ fit of the training plan to body & goals (0–10)
  // ctx (από review.js): {sessions, volume, overload, maxSession, groups: [{id, score}], bone: {sessions, target}}
  // Ο όγκος και η πρόοδος φορτίου έρχονται ήδη μετρημένα με τους κανόνες του στόχου (review.js, progress.js).
  function fit(ctx) {
    const mt = metrics(ctx.sessions);
    const gi = goalInfo(mt);
    if (!gi.engaged || !ctx.sessions) return null;
    const t = gi.type, gt = goalType();
    const S = ctx.sessions;
    const reasons = [];
    let sess, sessWhy;
    if (t === 'maintain') {
      sess = S >= 2 ? 10 : gt.freq === 1 ? 8 : 5;
      sessWhy = S >= 2 ? T('enough to keep what you have', 'αρκετές για να κρατήσεις ό,τι έχεις')
        : gt.freq === 1 ? T('one can hold your muscle if the loads stay the same; a second one makes it safer', 'μία μπορεί να κρατήσει τους μύες αν τα φορτία μείνουν ίδια· μια δεύτερη το κάνει πιο σίγουρο')
          : T('after 60, muscle needs 2 workouts a week to hold', 'μετά τα 60 οι μύες θέλουν 2 προπονήσεις την εβδομάδα για να κρατηθούν');
    } else if (t === 'cut') {
      sess = S >= 3 ? 10 : S === 2 ? 6.5 : 3.5;
      sessWhy = sess >= 9 ? T('enough for this goal', 'αρκετές για τον στόχο') : T('aim for at least 3 to keep muscle and burn more', 'στόχευσε τουλάχιστον 3, για να κρατήσεις μύες και να καις περισσότερο');
    } else {
      sess = S >= 4 ? 10 : S === 3 ? 9 : S === 2 ? 6.5 : 3.5;
      sessWhy = sess >= 9 ? T('enough for this goal', 'αρκετές για τον στόχο') : T('aim for 3–4 to grow', 'στόχευσε 3–4 για ανάπτυξη');
    }
    reasons.push([sess, T(`${S} ${S === 1 ? 'workout' : 'workouts'} a week`, `${S} ${S === 1 ? 'προπόνηση' : 'προπονήσεις'} την εβδομάδα`), sessWhy]);
    const vol = ctx.volume;
    const nSets = Math.round(10 * gt.sets);
    reasons.push([vol, T('Weekly volume', 'Εβδομαδιαίος όγκος'), t === 'cut' ? T('keep the 10+ hard sets per muscle of a growth plan: in diet studies that kept them, little or no muscle was lost', 'κράτα τα 10+ σκληρά σετ ανά μυ ενός προγράμματος ανάπτυξης: στις μελέτες με δίαιτα που τα κράτησαν χάθηκαν ελάχιστοι ή καθόλου μύες')
      : t === 'maintain' ? T(`about ${nSets} hard sets per big muscle are enough to keep it`, `περίπου ${nSets} σκληρά σετ ανά μεγάλο μυ αρκούν για να τον κρατήσεις`)
        : T('growth needs 10+ hard sets per muscle', 'η ανάπτυξη θέλει 10+ σκληρά σετ ανά μυ')]);
    const ov = ctx.overload == null ? 5 : ctx.overload;
    reasons.push([ov, gt.hold ? T('Loads held', 'Διατήρηση φορτίων') : T('Progressive overload', 'Πρόοδος φορτίου'), t === 'cut' ? T('holding your loads is what protects muscle in a deficit', 'η διατήρηση των φορτίων προστατεύει τους μύες στο έλλειμμα')
      : t === 'maintain' ? T('holding your loads is what keeps muscle on less training', 'η διατήρηση των φορτίων κρατά τους μύες με λιγότερη προπόνηση')
        : T('more load over time is what drives growth', 'η αύξηση φορτίου με τον καιρό φέρνει την ανάπτυξη')]);
    let align;
    if (t === 'cut') {
      const legs = (ctx.groups || []).filter((g) => g.id === 'legs' || g.id === 'hips' || g.id === 'back');
      const big = legs.length ? legs.reduce((a, g) => a + g.score, 0) / legs.length : vol;
      reasons.push([big, T('Big muscle groups (legs, back)', 'Μεγάλες μυϊκές ομάδες (πόδια, πλάτη)'), T('they burn the most energy', 'καίνε την περισσότερη ενέργεια')]);
      align = 0.3 * sess + 0.3 * vol + 0.2 * ov + 0.2 * big;
    } else align = 0.35 * sess + 0.4 * vol + 0.25 * ov;
    // Οστά: πόσες προπονήσεις την εβδομάδα φορτώνουν ισχίο και σπονδυλική στήλη με βαριές ασκήσεις. Η θέση του ACSM για
    // την υγεία των οστών (2004) ζητά ασκήσεις με αντίσταση 2–3 φορές την εβδομάδα· μετράει 10% στο ταίριασμα.
    if (ctx.bone) {
      const bs = ctx.bone.sessions, need = ctx.bone.target;
      const bScore = bs >= need ? 10 : bs === 1 ? 6 : 2;
      reasons.push([bScore, T('Bone loading', 'Φόρτιση οστών'), bs >= need
        ? T(`${bs} sessions a week load your hips and spine with heavy lifts (bone guidelines: 2–3)`, `${bs} προπονήσεις την εβδομάδα φορτώνουν ισχίο και σπονδυλική στήλη με βαριές ασκήσεις (οδηγίες για τα οστά: 2–3)`)
        : bs === 1 ? T('only 1 session a week loads your hips and spine with heavy lifts; bone guidelines ask for 2–3', 'μόνο 1 προπόνηση την εβδομάδα φορτώνει ισχίο και σπονδυλική στήλη με βαριές ασκήσεις· οι οδηγίες για τα οστά ζητούν 2–3')
          : T('no session has heavy leg, hip or standing lifts; bone guidelines ask for 2–3 a week', 'καμία προπόνηση δεν έχει βαριές ασκήσεις ποδιών, ισχίου ή όρθιες· οι οδηγίες για τα οστά ζητούν 2–3 την εβδομάδα')]);
      align = 0.9 * align + 0.1 * bScore;
    }
    let ageAdj = 0;
    if (mt.age >= 45 && ctx.maxSession > 25) { ageAdj = -0.8; reasons.push([5, T(`Long sessions at ${mt.age}`, `Μεγάλες προπονήσεις στα ${mt.age}`), T('over 25 hard sets in one session makes recovery harder', 'πάνω από 25 σκληρά σετ σε μία προπόνηση δυσκολεύουν την αποκατάσταση')]); }
    // πορεία του βάρους σε σχέση με τον στόχο (από τις μετρήσεις)
    let trend = null;
    const rw = rate('w'), rf = rate('fat');
    const w = mt.W ? mt.W.v : null;
    if (rw && w) {
      const pct = (100 * rw.perWeek) / w;
      const fatUp = rf && rf.perWeek > 0.12;
      if (t === 'cut') trend = pct <= -0.5 && pct >= -1 ? 10 : (pct < -0.25 && pct > -0.5) || (pct < -1 && pct >= -1.5) ? 7.5 : pct < -1.5 ? 5 : pct <= 0 ? 5 : 2;
      else if (t === 'maintain') trend = Math.abs(pct) <= 0.25 ? 10 : 6;
      else if (gi.mode === 'lean') trend = pct <= 0.1 && pct >= -0.5 ? 10 : pct < -0.5 && pct >= -0.75 ? 7.5 : pct < -0.75 ? 5 : pct <= 0.4 ? 6 : 4;
      else if (gi.mode === 'steady') trend = Math.abs(pct) <= 0.25 ? (fatUp ? 7.5 : 10) : Math.abs(pct) <= 0.5 ? 7.5 : 5;
      else trend = pct >= 0.1 && pct <= 0.5 ? (fatUp ? 7.5 : 10) : pct > 0.5 && pct <= 0.8 ? 6.5 : pct > 0.8 ? 4 : pct > -0.1 ? 6 : 2;
      reasons.push([trend, T(`Weight ${sgn(pct, 2)}% a week`, `Βάρος ${sgn(pct, 2)}% την εβδομάδα`), trendText(t, pct, gi.mode)]);
    }
    const score = clamp((trend == null ? align : 0.65 * align + 0.35 * trend) + ageAdj, 0, 10);
    return { score, type: t, chosen: gi.chosen, mode: gi.mode || null, reasons, mt, gi };
  }
  function trendText(t, pct, mode) {
    if (t === 'cut') return pct > 0 ? T('moving away from the goal: check calories', 'απομακρύνεσαι από τον στόχο: έλεγξε τις θερμίδες') : pct < -1 ? T('faster than 1% a week risks muscle loss', 'πιο γρήγορα από 1% την εβδομάδα κινδυνεύεις να χάσεις μύες') : pct > -0.5 ? T('slower than the ideal 0.5–1% a week', 'πιο αργά από το ιδανικό 0,5–1% την εβδομάδα') : T('ideal pace (0.5–1% a week)', 'ιδανικός ρυθμός (0,5–1% την εβδομάδα)');
    if (t === 'maintain') return Math.abs(pct) <= 0.25 ? T('stable, as intended', 'σταθερό, όπως θέλεις') : T('drifting from your weight', 'απομακρύνεσαι από το βάρος σου');
    if (mode === 'lean') return pct > 0.1 ? T('gaining weight while your target is lower: eat a little less', 'ανεβαίνεις ενώ ο στόχος σου είναι χαμηλότερα: φάε λίγο λιγότερο') : pct < -0.75 ? T('losing this fast leaves too little to build muscle: eat a little more', 'τόσο γρήγορη απώλεια δεν αφήνει περιθώριο για μύες: φάε λίγο περισσότερο') : pct < -0.5 ? T('a little fast for building muscle: keep it to 0.5% a week or less', 'λίγο γρήγορα για να χτίζεις μύες: κράτα το έως 0,5% την εβδομάδα') : T('right pace for building muscle while losing fat (0 to −0.5% a week)', 'σωστός ρυθμός για μύες με ταυτόχρονη απώλεια λίπους (0 έως −0,5% την εβδομάδα)');
    if (mode === 'steady') return Math.abs(pct) <= 0.25 ? T('stable weight, right for building muscle at this weight', 'σταθερό βάρος, σωστό για να χτίζεις μύες σε αυτά τα κιλά') : pct > 0 ? T('gaining: watch the fat percentage', 'ανεβαίνεις: πρόσεχε το ποσοστό λίπους') : T('losing weight: eat a bit more to build muscle', 'χάνεις βάρος: φάε λίγο περισσότερο για να χτίσεις μύες');
    return pct < 0 ? T('losing weight while trying to gain', 'χάνεις βάρος ενώ θέλεις να πάρεις') : pct > 0.5 ? T('above 0.5% a week much of the gain is fat', 'πάνω από 0,5% την εβδομάδα μεγάλο μέρος είναι λίπος') : pct < 0.1 ? T('too slow to support growth', 'πολύ αργά για να στηρίξει ανάπτυξη') : T('ideal pace (0.1–0.5% a week)', 'ιδανικός ρυθμός (0,1–0,5% την εβδομάδα)');
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
    const gi = f ? f.gi : goalInfo(mt);
    if (!gi.chosen) out.push({ kind: 'body', title: T('Choose your goal', 'Διάλεξε τον στόχο σου'), text: T('The review now assumes muscle gain. If you want fat loss or maintenance instead, choose it in the Goals tab: the set targets, the progression and the advice change with it.', 'Η αξιολόγηση θεωρεί τώρα ότι θέλεις μυϊκή ανάπτυξη. Αν θέλεις απώλεια λίπους ή διατήρηση, διάλεξέ το στην καρτέλα Στόχοι: αλλάζουν οι στόχοι σετ, η πρόοδος φορτίου και οι συμβουλές.'), actions: [{ type: 'tab', id: 'goals' }] });
    if (!data.entries.length || !data.profile.height) {
      out.push({ kind: 'body', title: T('Add your body data', 'Πρόσθεσε τα στοιχεία σώματος'), text: T('With your age, height, weight and body-fat and muscle percentages, the review also judges whether the plan fits your body and goals.', 'Με την ηλικία, το ύψος, το βάρος και τα ποσοστά λίπους και μυών, η αξιολόγηση κρίνει και αν το πρόγραμμα ταιριάζει στο σώμα και στους στόχους σου.'), actions: [{ type: 'tab', id: 'body' }] });
      return out;
    }
    if (!f) return out;
    const t = f.type, mode = gi.mode, kcal = mt.tdee;
    const w = mt.W ? mt.W.v : null;
    const r50 = (x) => Math.round(x / 50) * 50;
    const prot = (a, b) => T(`Protein ${Math.round(w * a)}–${Math.round(w * b)} g a day`, `Πρωτεΐνη ${Math.round(w * a)}–${Math.round(w * b)} g την ημέρα`);
    const sleep = T(' and 7–9 hours of sleep.', ' και 7–9 ώρες ύπνος.');
    if (t === 'cut' && w) out.push({ kind: 'body', title: T('Fat loss: how to eat and move', 'Απώλεια λίπους: διατροφή και κίνηση'), text: (kcal ? T(`About ${r50(kcal - 450)} kcal a day (≈450 below your estimated ${r50(kcal)} kcal maintenance). `, `Περίπου ${r50(kcal - 450)} kcal την ημέρα (≈450 κάτω από τις ~${r50(kcal)} kcal συντήρησης). `) : '') + prot(2, 2.4) + T(', keep lifting heavy, and add at least 150 minutes of moderate activity a week, such as brisk walking.', ', συνέχισε τα βαριά σετ και πρόσθεσε τουλάχιστον 150 λεπτά μέτριας δραστηριότητας την εβδομάδα, όπως γρήγορο περπάτημα.'), actions: [] });
    if (t === 'maintain' && w) out.push({ kind: 'body', title: T('Maintenance: how to eat', 'Διατήρηση: διατροφή'), text: (kcal ? T(`About ${r50(kcal)} kcal a day (your estimated maintenance). `, `Περίπου ${r50(kcal)} kcal την ημέρα (η εκτιμώμενη συντήρησή σου). `) : '') + prot(1.4, 2) + sleep, actions: [] });
    if (t === 'bulk' && w) {
      if (mode === 'lean') out.push({ kind: 'body', title: T('Muscle gain while losing fat: how to eat', 'Μυϊκή ανάπτυξη με απώλεια λίπους: διατροφή'), text: (kcal ? T(`About ${r50(kcal - 250)}–${r50(kcal)} kcal a day (your estimated maintenance or up to ≈250 below). `, `Περίπου ${r50(kcal - 250)}–${r50(kcal)} kcal την ημέρα (η εκτιμώμενη συντήρησή σου ή έως ≈250 κάτω). `) : '') + T(`A bigger deficit slows muscle growth: lose at most ${nf(w * 0.005)} kg a week. `, `Μεγαλύτερο έλλειμμα φρενάρει την ανάπτυξη: χάνε το πολύ ${nf(w * 0.005)} kg την εβδομάδα. `) + prot(2, 2.4) + sleep, actions: [] });
      else if (mode === 'steady') out.push({ kind: 'body', title: T('Muscle gain: how to eat', 'Μυϊκή ανάπτυξη: διατροφή'), text: (kcal ? T(`About ${r50(kcal)} kcal a day (your estimated maintenance). `, `Περίπου ${r50(kcal)} kcal την ημέρα (η εκτιμώμενη συντήρησή σου). `) : '') + prot(1.6, 2.2) + sleep, actions: [] });
      else out.push({ kind: 'body', title: T('Muscle gain: how to eat', 'Μυϊκή ανάπτυξη: διατροφή'), text: (kcal ? T(`About ${r50(kcal + 250)} kcal a day (≈250 above your estimated ${r50(kcal)} kcal maintenance). `, `Περίπου ${r50(kcal + 250)} kcal την ημέρα (≈250 πάνω από τις ~${r50(kcal)} kcal συντήρησης). `) : '') + T(`Aim to gain ${nf(w * 0.0025, 2)}–${nf(w * 0.005, 2)} kg a week: faster than that is mostly fat. `, `Στόχευσε σε +${nf(w * 0.0025, 2)}–${nf(w * 0.005, 2)} kg την εβδομάδα: πιο γρήγορα είναι κυρίως λίπος. `) + prot(1.6, 2.2) + sleep, actions: [] });
    }
    const rw = rate('w');
    if (rw && w) {
      const pct = (100 * rw.perWeek) / w;
      const off = t === 'cut' ? (pct > -0.25 || pct < -1.2) : t === 'maintain' ? Math.abs(pct) > 0.4 : mode === 'lean' ? (pct > 0.15 || pct < -0.75) : mode === 'steady' ? Math.abs(pct) > 0.4 : (pct < 0.05 || pct > 0.6);
      if (off) out.push({ kind: 'body', title: T(`Weight ${sgn(rw.perWeek, 2)} kg a week`, `Βάρος ${sgn(rw.perWeek, 2)} kg την εβδομάδα`), text: trendText(t, pct, mode).replace(/^./, (c) => c.toUpperCase()) + '.', actions: [] });
    }
    if (mt.whtrCat && mt.whtrCat[0] !== 'ok') out.push({ kind: 'body', title: T(`Waist-to-height ${nf(mt.whtr, 2)}`, `Μέση προς ύψος ${nf(mt.whtr, 2)}`), text: T('Above 0.5 means more belly fat and a higher health risk. ', 'Πάνω από 0,5 σημαίνει περισσότερο κοιλιακό λίπος και αυξημένο κίνδυνο για την υγεία. ')
      + (t === 'cut' ? T('Your goal already brings it down: stay in your calorie deficit and move more every day.', 'Ο στόχος σου ήδη το κατεβάζει: μείνε στο θερμιδικό σου έλλειμμα και κινήσου περισσότερο κάθε μέρα.')
        : mode === 'lean' ? T('Your plan already brings it down: keep the calorie deficit mild and move more every day.', 'Το πλάνο σου ήδη το κατεβάζει: κράτα μικρό το θερμιδικό έλλειμμα και κινήσου περισσότερο κάθε μέρα.')
        : mode === 'surplus' ? T('Gaining weight will push it up: consider building muscle at a stable weight, or losing some fat first.', 'Αν πάρεις βάρος θα ανέβει: σκέψου να χτίσεις μύες με σταθερό βάρος ή να χάσεις πρώτα λίγο λίπος.')
          : T('A mild calorie deficit and more daily movement bring it down.', 'Ένα μικρό θερμιδικό έλλειμμα και περισσότερη καθημερινή κίνηση το κατεβάζουν.')), actions: [] });
    // Οστά. Η απώλεια βάρους παίρνει και λίγη οστική πυκνότητα στο ισχίο (μετα-ανάλυση Zibellini 2015)· η άσκηση
    // τη μειώνει (Shah 2011). Ασβέστιο και βιταμίνη D: συνιστώμενες προσλήψεις IOM 2011.
    const older = mt.age || 0, female = data.profile.sex === 'f';
    if ((t === 'cut' || mode === 'lean') && w) {
      const ca = (female && older >= 51) || older >= 71 ? '1,200' : '1,000';
      const vd = older >= 71 ? T('20 µg (800 IU)', '20 µg (800 IU)') : T('15 µg (600 IU)', '15 µg (600 IU)');
      out.push({ kind: 'body', title: T('Bones: protect them while you lose weight', 'Οστά: προστάτεψέ τα όσο χάνεις βάρος'), text:
        T(`Losing weight also takes a little bone density, mostly at the hip (roughly 1% over 6–24 months in diet studies). Training limits it: in a trial of older adults on a diet, those who also exercised lost less than half as much hip bone. Keep the heavy leg, hip and standing lifts in your plan, lose no more than ${t === 'cut' ? '1%' : '0.5%'} of your weight a week, and get about ${ca} mg of calcium and ${vd} of vitamin D a day, from food where you can.`,
          `Η απώλεια βάρους παίρνει και λίγη οστική πυκνότητα, κυρίως στο ισχίο (περίπου 1% σε 6–24 μήνες στις μελέτες με δίαιτα). Η προπόνηση τη μειώνει: σε μελέτη με μεγαλύτερους ενήλικες σε δίαιτα, όσοι γυμνάζονταν έχασαν λιγότερο από το μισό οστό στο ισχίο. Κράτα τις βαριές ασκήσεις ποδιών, ισχίου και τις όρθιες, χάνε το πολύ ${t === 'cut' ? '1%' : '0,5%'} του βάρους σου την εβδομάδα και πάρε περίπου ${ca.replace(',', '.')} mg ασβέστιο και ${vd} βιταμίνη D την ημέρα, όσο γίνεται από το φαγητό.`), actions: [] });
    }
    if (gi.boneNote) out.push({ kind: 'body', title: gi.boneFix.less ? T('Your targets leave less room for bone', 'Οι στόχοι σου αφήνουν λιγότερο χώρο για τα οστά') : T('Your targets need more bone than you have', 'Οι στόχοι σου θέλουν περισσότερα οστά από όσα έχεις'), text: gi.boneNote, actions: [{ type: 'tab', id: 'goals' }] });
    if (female && older >= 65) out.push({ kind: 'body', title: T('Bones: a density scan is recommended at your age', 'Οστά: στην ηλικία σου συνιστάται μέτρηση οστικής πυκνότητας'), text: T('Screening for osteoporosis with a bone density scan (DXA) is recommended for women from 65. A home scale cannot show how dense your bones are.', 'Ο έλεγχος για οστεοπόρωση με μέτρηση οστικής πυκνότητας (DXA) συνιστάται για τις γυναίκες από τα 65. Η ζυγαριά του σπιτιού δεν δείχνει πόσο πυκνά είναι τα οστά σου.'), actions: [] });
    else if (female && older >= 50) out.push({ kind: 'body', title: T('Bones after menopause', 'Οστά μετά την εμμηνόπαυση'), text: T('Bone loss speeds up after menopause. If you have risk factors (a parent who broke a hip, smoking, heavy drinking, low body weight), ask your doctor whether a bone density scan (DXA) makes sense for you.', 'Η απώλεια οστού επιταχύνεται μετά την εμμηνόπαυση. Αν έχεις παράγοντες κινδύνου (γονιό με κάταγμα ισχίου, κάπνισμα, πολύ αλκοόλ, χαμηλό σωματικό βάρος), ρώτησε τον γιατρό σου αν χρειάζεσαι μέτρηση οστικής πυκνότητας (DXA).'), actions: [] });
    if (mt.age >= 40) out.push({ kind: 'body', title: T(`At ${mt.age}: recovery and joints`, `Στα ${mt.age}: αποκατάσταση και αρθρώσεις`), text: T('Warm up 5–10 minutes with lighter sets, leave ~48 hours before training the same muscle hard again, and keep loading the legs: leg strength protects bones and balance with age.', 'Ζέσταμα 5–10 λεπτά με ελαφρύτερα σετ, ~48 ώρες πριν δουλέψεις ξανά έντονα τον ίδιο μυ και συνέχισε να φορτώνεις τα πόδια: η δύναμη των ποδιών προστατεύει τα οστά και την ισορροπία με τα χρόνια.'), actions: [] });
    if (t === 'bulk') stagnant().forEach((s) => out.push({ kind: 'body', stag: s, title: T(`${s.name}: no growth in ${Math.round(days(s.from.date, s.to.date) / 7)} weeks`, `${s.name}: χωρίς αύξηση εδώ και ${Math.round(days(s.from.date, s.to.date) / 7)} εβδομάδες`), text: T(`${nf(s.from.v)} → ${nf(s.to.v)} cm.`, `${nf(s.from.v)} → ${nf(s.to.v)} cm.`), actions: [] }));
    return out;
  }

  function coachLines(ctx, f) {
    const mt = f ? f.mt : metrics(ctx.sessions);
    if (!mt.W && !data.profile.height) return [];
    const l = [T('Body data:', 'Στοιχεία σώματος:')];
    const p = data.profile;
    l.push([p.sex ? (p.sex === 'm' ? T('man', 'άνδρας') : T('woman', 'γυναίκα')) : null, mt.age ? T(`${mt.age} years`, `${mt.age} ετών`) : null, p.height ? `${p.height} cm` : null].filter(Boolean).join(', '));
    if (mt.W) l.push(T(`Weight ${nf(mt.W.v)} kg (${mt.W.date})`, `Βάρος ${nf(mt.W.v)} kg (${mt.W.date})`) + (mt.bmi ? `, BMI ${nf(mt.bmi)}` : '') + (mt.fat != null ? T(`, body fat ${nf(mt.fat)}%`, `, λίπος ${nf(mt.fat)}%`) + (mt.fatEstimated ? T(' (estimated)', ' (εκτίμηση)') : '') : '') + (mt.M ? T(`, muscle ${nf(mt.M.v)}%`, `, μύες ${nf(mt.M.v)}%`) : '') + (mt.bone ? T(`, bone ${nf(mt.bone)}%`, `, οστά ${nf(mt.bone)}%`) + (mt.boneKg ? ` (${nf(mt.boneKg)} kg, ` : ' (') + (mt.boneCalc ? T('worked out as the rest', 'υπολογισμός ως υπόλοιπο') : T('home-scale estimate', 'εκτίμηση οικιακής ζυγαριάς')) + ')' : '') + (mt.bmr ? `, BMR ${Math.round(mt.bmr)} kcal` : ''));
    const ms = MEAS.filter(([k]) => mt.meas[k]).map(([k, n]) => `${n} ${nf(mt.meas[k].v)}`);
    if (ms.length) l.push(T('Measurements (cm): ', 'Μετρήσεις (cm): ') + ms.join(', '));
    if (ctx.bone) l.push(T(`Sessions a week with heavy lifts that load the hips and spine: ${ctx.bone.sessions} (bone-health guideline: 2–3).`, `Προπονήσεις την εβδομάδα με βαριές ασκήσεις που φορτώνουν ισχίο και σπονδυλική στήλη: ${ctx.bone.sessions} (οδηγία για την υγεία των οστών: 2–3).`));
    ['w', 'fat', 'mus', 'bone', 'waist', 'tummy', 'arm'].forEach((k) => { const r = rate(k); if (r) l.push(`${k}: ${sgn(r.perWeek, 2)}/${T('week', 'εβδ.')} (${nf(r.weeks)} ${T('weeks', 'εβδ.')})`); });
    const g = data.goals;
    if (g.w || g.fat || g.mus || g.bone || g.waist) l.push(T('Targets: ', 'Αριθμητικοί στόχοι: ') + [g.w ? T(`weight ${nf(g.w)} kg`, `βάρος ${nf(g.w)} kg`) : null, g.fat ? T(`body fat ${nf(g.fat)}%`, `λίπος ${nf(g.fat)}%`) : null, g.mus ? T(`muscle ${nf(g.mus)}%`, `μύες ${nf(g.mus)}%`) : null, g.bone ? T(`bone ${nf(g.bone)}%`, `οστά ${nf(g.bone)}%`) : null, g.waist ? T(`waist ${nf(g.waist)} cm`, `μέση ${nf(g.waist)} cm`) : null, g.date ? T(`by ${g.date}`, `έως ${g.date}`) : null].filter(Boolean).join(', '));
    if (f) {
      if (f.gi.modeWhy) l.push(f.gi.modeWhy);
      if (f.gi.clash) l.push(f.gi.clash);
      if (f.gi.boneNote) l.push(f.gi.boneNote);
      l.push(T(`Fit of the plan to the goal: ${nf(f.score)}/10`, `Ταίριασμα του προγράμματος με τον στόχο: ${nf(f.score)}/10`));
    }
    return l;
  }

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
  const goalLabel = () => goalType().label;

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
  const BONE_HINT = T('if your scale shows kilos: kilos ÷ weight × 100', 'αν η ζυγαριά δείχνει κιλά: κιλά ÷ βάρος × 100');
  const card = (label, value, sub, cls) => h('div', { class: 'bd-card' + (cls ? ' ' + cls : '') }, h('span', { class: 'bd-l', text: label }), h('b', { text: value }), sub ? h('small', { text: sub }) : null);

  // τι ελέγχει η αξιολόγηση με κάθε στόχο
  function goalDesc(k) {
    const r = rulesFor(k);
    if (k === 'cut') return T('Lose fat and keep your muscle: the same 10+ sets per muscle a week as for growth, loads that hold, 3 or more workouts, weight down 0.5–1% a week.', 'Χάνεις λίπος και κρατάς τους μύες: τα ίδια 10+ σετ ανά μυ την εβδομάδα με την ανάπτυξη, φορτία που κρατιούνται, 3 ή περισσότερες προπονήσεις, βάρος −0,5–1% την εβδομάδα.');
    if (k === 'bulk') return T('Build muscle: 10–20 hard sets per muscle a week, each muscle twice a week, loads that keep going up.', 'Χτίζεις μύες: 10–20 σκληρά σετ ανά μυ την εβδομάδα, κάθε μυς 2 φορές την εβδομάδα, φορτία που ανεβαίνουν συνεχώς.');
    const n = Math.round(10 * r.sets);
    return T(`Keep what you have with less training: about ${n} sets per muscle a week, ${r.freq === 1 ? 'once a week is enough' : 'each muscle twice a week'}, loads that hold, stable weight.`, `Κρατάς ό,τι έχεις με λιγότερη προπόνηση: περίπου ${n} σετ ανά μυ την εβδομάδα, ${r.freq === 1 ? '1 φορά την εβδομάδα αρκεί' : 'κάθε μυς 2 φορές την εβδομάδα'}, φορτία που κρατιούνται, σταθερό βάρος.`);
  }

  // πρόχειρα που επιβιώνουν από τα re-render της αξιολόγησης
  const draft = { profile: null, entry: null, goals: null, msg: '', gmsg: '', pmsg: '', tmsg: '', showMeas: false };
  const blankEntry = () => ({ date: today(), w: '', fat: '', mus: '', bone: '', m: {} });

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
    if (mt.W || mt.fat != null || mt.M || mt.bone || Object.keys(mt.meas).length) {
      const cards = h('div', { class: 'bd-cards' });
      const dsub = (l) => (l ? fmtDate(l.date) : '');
      if (mt.W) cards.appendChild(card(T('Weight', 'Βάρος'), nf(mt.W.v) + ' kg', dsub(mt.W)));
      if (mt.bmi) cards.appendChild(card('BMI', nf(mt.bmi), mt.bmiCat[1] + (mt.bmiCat[0] === 'over' && mt.ffmiN >= 21 ? T(' · muscular build', ' · μυώδης σωματότυπος') : ''), 'c-' + (mt.bmiCat[0] === 'normal' ? 'ok' : mt.bmiCat[0] === 'obese' ? 'high' : 'warn')));
      if (mt.bmr) cards.appendChild(card('BMR', Math.round(mt.bmr) + ' kcal', mt.bmrFormula));
      if (mt.tdee) cards.appendChild(card(T('Maintenance', 'Συντήρηση'), '~' + Math.round(mt.tdee / 10) * 10 + ' kcal', mt.activity));
      if (mt.fat != null) cards.appendChild(card(T('Body fat', 'Λίπος'), nf(mt.fat) + '%' + (mt.fatKg ? ' · ' + nf(mt.fatKg) + ' kg' : ''), (mt.fatEstimated ? T('estimate from measurements (US Navy) · ', 'εκτίμηση από περιφέρειες (US Navy) · ') : dsub(mt.F) + ' · ') + mt.fatCat[1], 'c-' + mt.fatCat[0]));
      if (mt.M) cards.appendChild(card(T('Muscle', 'Μύες'), nf(mt.M.v) + '%' + (mt.musKg ? ' · ' + nf(mt.musKg) + ' kg' : ''), dsub(mt.M)));
      if (mt.bone) cards.appendChild(card(T('Bone', 'Οστά'), nf(mt.bone) + '%' + (mt.boneKg ? ' · ' + nf(mt.boneKg) + ' kg' : ''), mt.boneCalc ? T('worked out: the rest after fat and muscle', 'υπολογισμός: ό,τι μένει μετά το λίπος και τους μύες') : dsub(mt.B) + T(' · estimate', ' · εκτίμηση')));
      if (mt.lbm) cards.appendChild(card(T('Lean mass', 'Άλιπη μάζα'), nf(mt.lbm) + ' kg', mt.ffmiN ? 'FFMI ' + nf(mt.ffmiN) : ''));
      if (mt.whr) cards.appendChild(card(T('Waist / hips', 'Μέση / λεκάνη'), nf(mt.whr, 2), mt.whrRisk ? T('above the healthy limit', 'πάνω από το υγιές όριο') : T('healthy', 'υγιές'), mt.whrRisk ? 'c-warn' : 'c-ok'));
      if (mt.whtr) cards.appendChild(card(T('Waist / height', 'Μέση / ύψος'), nf(mt.whtr, 2), mt.whtrCat[1], 'c-' + mt.whtrCat[0]));
      host.appendChild(h('h3', { class: 'bd-h2', text: T('Now', 'Σήμερα') }));
      host.appendChild(cards);
      if (!data.profile.height || !mt.age || !data.profile.sex) host.appendChild(h('p', { class: 'bd-hint', text: T('Add your sex, age and height above for BMI, BMR and the healthy ranges.', 'Συμπλήρωσε φύλο, ηλικία και ύψος παραπάνω για BMI, BMR και τα υγιή όρια.') }));
      // σύσταση: λίπος + μύες + οστά = 100% (λεπτή μπάρα πάνω από τη λίστα με τα νούμερα)
      if (mt.comp && mt.comp.kind !== 'off') {
        const c = mt.comp, wkg = mt.W ? mt.W.v : null;
        const other = c.kind === 'partial' ? r1(100 - c.total) : 0;
        const parts = [['fat', T('Fat', 'Λίπος'), c.fat], ['mus', T('Muscle', 'Μύες'), c.mus], ['bone', T('Bone', 'Οστά'), c.bone]];
        if (other > 0) parts.push(['other', T('Other (organs, water…)', 'Άλλα (όργανα, νερό…)'), other]);
        host.appendChild(h('h3', { class: 'bd-h2', text: T('Body composition', 'Σύσταση σώματος') }));
        host.appendChild(h('div', { class: 'bd-comp' },
          h('div', { class: 'bd-seg', role: 'img', 'aria-label': parts.map(([, n, v]) => `${n} ${nf(v)}%`).join(', ') }, parts.map(([k, n, v]) => h('i', { class: 'k-' + k, style: `flex:${v} 1 0`, title: `${n} ${nf(v)}%` }))),
          h('ul', { class: 'bd-legend' }, parts.map(([k, n, v]) => h('li', {}, h('i', { class: 'k-' + k }), h('span', { text: n }), h('b', { text: nf(v) + '%' }), h('small', { text: wkg ? nf((wkg * v) / 100) + ' kg' : '' })))),
          h('p', { class: 'bd-hint', text: (c.kind === 'full' ? T('Fat + muscle + bone = 100% of your body weight.', 'Λίπος + μύες + οστά = 100% του βάρους σου.') : T('Your scale shows skeletal muscle only, so fat, muscle and bone do not reach 100%.', 'Η ζυγαριά σου δείχνει μόνο τους σκελετικούς μύες, οπότε λίπος, μύες και οστά δεν φτάνουν το 100%.'))
            + (mt.boneCalc ? T(' Bone is worked out as what is left after fat and muscle; add your scale’s number in a new measurement to replace it.', ' Τα οστά υπολογίζονται ως ό,τι μένει μετά το λίπος και τους μύες· πρόσθεσε το νούμερο της ζυγαριάς σε νέα μέτρηση για να το αντικαταστήσεις.') : '') }),
          h('p', { class: 'bd-hint', text: T('Home scales estimate bone from your weight and lean mass. They do not measure how dense or strong your bones are: only a bone density scan (DXA) does.', 'Οι οικιακές ζυγαριές εκτιμούν τα οστά από το βάρος και την άλιπη μάζα σου. Δεν μετρούν πόσο πυκνά ή γερά είναι: αυτό το δείχνει μόνο η μέτρηση οστικής πυκνότητας (DXA).') })));
      }
      // μεταβολές
      const rows = [['w', T('Weight', 'Βάρος'), 'kg'], ['fat', T('Body fat', 'Λίπος'), '%'], ['mus', T('Muscle', 'Μύες'), '%'], ['bone', T('Bone', 'Οστά'), '%']].concat(MEAS.map(([k, n]) => [k, n, 'cm']))
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
    // λίπος + μύες + οστά: ζωντανό σύνολο, και το τρίτο που λείπει φαίνεται στο πεδίο του πριν αποθηκευτεί
    const cin = {};
    const totalP = h('p', { class: 'bd-total bd-wide' });
    const showTotal = () => {
      const c = compose(num(en.fat), num(en.mus), num(en.bone));
      const l = composeLine(c);
      totalP.textContent = l.text;
      totalP.className = 'bd-total bd-wide' + (l.cls ? ' ' + l.cls : '');
      cin.bone.placeholder = c.filled === 'bone' ? shown(c.bone) : '';
      cin.mus.placeholder = c.filled === 'mus' ? shown(c.mus) : '';
    };
    cin.fat = numInput(en.fat, (v) => { en.fat = v; showTotal(); }, { step: '0.1' });
    cin.mus = numInput(en.mus, (v) => { en.mus = v; showTotal(); }, { step: '0.1' });
    cin.bone = numInput(en.bone, (v) => { en.bone = v; showTotal(); }, { step: '0.1' });
    showTotal();
    const form = h('form', { class: 'bd-box', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      if (!isDate(en.date) || en.date > today()) { draft.msg = T('Choose a date that is not in the future.', 'Διάλεξε ημερομηνία που δεν είναι στο μέλλον.'); return rerender(); }
      const c0 = compose(num(en.fat), num(en.mus), num(en.bone));
      const c = cleanEntry({ date: en.date, w: en.w, fat: en.fat, mus: c0.filled === 'mus' ? c0.mus : en.mus, bone: c0.filled === 'bone' ? c0.bone : en.bone, m: en.m });
      if (!hasData(c)) { draft.msg = T('Fill in at least one value.', 'Συμπλήρωσε τουλάχιστον μία τιμή.'); return rerender(); }
      const errs = [];
      if (badNum(en.w, 25, 300)) errs.push(T('weight 25–300 kg', 'βάρος 25–300 kg'));
      if (badNum(en.fat, 3, 70)) errs.push(T('body fat 3–70%', 'λίπος 3–70%'));
      if (badNum(en.mus, 10, 90)) errs.push(T('muscle 10–90%', 'μύες 10–90%'));
      if (badNum(en.bone, BONE_RANGE[0], BONE_RANGE[1])) errs.push(T(`bone ${BONE_RANGE[0]}–${BONE_RANGE[1]}%`, `οστά ${BONE_RANGE[0]}–${BONE_RANGE[1]}%`));
      MKEYS.forEach((k) => { if (badNum(en.m[k], 10, 250)) errs.push(MEAS.find((x) => x[0] === k)[1] + ' 10–250 cm'); });
      if (errs.length) { draft.msg = T('Check: ', 'Έλεγξε: ') + errs.join(', ') + '.'; return rerender(); }
      if (c0.kind === 'off') { draft.msg = composeLine(c0).text; return rerender(); }
      data.entries.push(c);
      draft.entry = blankEntry(); draft.msg = T('Measurement saved.', 'Η μέτρηση αποθηκεύτηκε.'); draft.showMeas = false;
      persist();
    } },
      h('h3', { class: 'bd-h', text: T('New measurement', 'Νέα μέτρηση') }),
      h('div', { class: 'bd-grid3' },
        field(T('Date', 'Ημερομηνία'), h('input', { type: 'date', value: en.date, max: today(), oninput: (e) => { en.date = e.target.value; } }), null, 'bd-wide'),
        field(T('Weight (kg)', 'Βάρος (kg)'), numInput(en.w, (v) => { en.w = v; }, { step: '0.1' }), null, 'bd-wide'),
        field(T('Body fat (%)', 'Λίπος (%)'), cin.fat),
        field(T('Muscle (%)', 'Μύες (%)'), cin.mus, MUS_HINT),
        field(T('Bone (%)', 'Οστά (%)'), cin.bone, BONE_HINT),
        totalP),
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
        const parts = [e.w ? nf(e.w) + ' kg' : null, e.fat ? T('fat ', 'λίπος ') + nf(e.fat) + '%' : null, e.mus ? T('muscle ', 'μύες ') + nf(e.mus) + '%' : null, e.bone ? T('bone ', 'οστά ') + nf(e.bone) + '%' : null]
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
    host.appendChild(h('p', { class: 'sub', text: T('Choose what you train for, then add the numbers you want to reach. The review of your plan follows your primary goal.', 'Διάλεξε για ποιον σκοπό προπονείσαι και μετά πρόσθεσε τα νούμερα που θέλεις να φτάσεις. Η αξιολόγηση του προγράμματος ακολουθεί τον κύριο στόχο σου.') }));

    // --- κύριος στόχος: αποθηκεύεται αμέσως και αλλάζει τους κανόνες της αξιολόγησης
    const gt = goalType();
    const gh = uid();
    const opts = GOAL_TYPES.map((k) => {
      const id = uid();
      const input = h('input', { type: 'radio', name: 'bdGoal', id, value: k, checked: gt.chosen && gt.type === k, 'data-key': 'goal:' + k, onchange: () => {
        data.goals = Object.assign({}, data.goals, { type: k });
        draft.tmsg = T(`Saved. The review now follows this goal: ${TYPE[k][0].toLowerCase()}.`, `Αποθηκεύτηκε. Η αξιολόγηση ακολουθεί πλέον αυτόν τον στόχο: ${TYPE[k][0].toLowerCase()}.`);
        persist();
        if (host.isConnected) rerender();
      } });
      return h('label', { class: 'bd-opt' + (gt.chosen && gt.type === k ? ' on' : ''), for: id }, input, h('span', {}, h('b', { text: TYPE[k][0] }), h('small', { text: goalDesc(k) })));
    });
    host.appendChild(h('div', { class: 'bd-box', role: 'radiogroup', 'aria-labelledby': gh },
      h('h3', { class: 'bd-h', id: gh, text: T('Primary goal', 'Κύριος στόχος') }),
      h('div', { class: 'bd-opts' }, opts),
      draft.tmsg ? h('p', { class: 'bd-msg', role: 'status', text: draft.tmsg })
        : !gt.chosen ? h('p', { class: 'bd-hint', text: T('Not chosen yet: until you choose, the review assumes muscle gain.', 'Δεν έχεις διαλέξει ακόμα: μέχρι τότε η αξιολόγηση θεωρεί ότι θέλεις μυϊκή ανάπτυξη.') }) : null));
    draft.tmsg = '';
    const g = draft.goals || (draft.goals = { w: data.goals.w ?? '', fat: data.goals.fat ?? '', mus: data.goals.mus ?? '', bone: data.goals.bone ?? '', waist: data.goals.waist ?? '', fatKg: '', musKg: '', boneKg: '', date: data.goals.date ?? '' });
    const PCT = ['fat', 'mus', 'bone'];
    const syncKg = () => {
      const w = num(g.w);
      PCT.forEach((k) => { if (w && num(g[k])) g[k + 'Kg'] = shown(Math.round(w * num(g[k])) / 100); else if (g[k] === '') g[k + 'Kg'] = ''; });
    };
    if (g.fatKg === '' && g.musKg === '' && g.boneKg === '') syncKg();
    const inputs = {};
    // λίπος + μύες + οστά = 100%: ζωντανό σύνολο· το ποσοστό που λείπει φαίνεται στο πεδίο του και αποθηκεύεται μαζί
    const gTotal = h('p', { class: 'bd-total bd-wide' });
    const upd = () => {
      ['fatKg', 'musKg', 'boneKg', 'fat', 'mus', 'bone'].forEach((k) => { if (inputs[k] && document.activeElement !== inputs[k]) inputs[k].value = g[k]; });
      const c = compose(num(g.fat), num(g.mus), num(g.bone));
      const l = composeLine(c);
      gTotal.textContent = l.text;
      gTotal.className = 'bd-total bd-wide' + (l.cls ? ' ' + l.cls : '');
      const w = num(g.w);
      [['bone', 'boneKg'], ['mus', 'musKg']].forEach(([k, kk]) => {
        const on = c.filled === k;
        if (inputs[k]) inputs[k].placeholder = on ? shown(c[k]) : '';
        if (inputs[kk]) inputs[kk].placeholder = on && w ? shown(Math.round(w * c[k]) / 100) : '';
      });
    };
    const pct = (k) => numInput(g[k], (v) => { g[k] = v; syncKg(); upd(); }, { step: '0.1' });
    const kg = (k) => numInput(g[k + 'Kg'], (v) => { g[k + 'Kg'] = v; const w = num(g.w); if (w && num(v)) g[k] = shown(Math.round((1000 * num(v)) / w) / 10); else if (v === '') g[k] = ''; upd(); }, { step: '0.1' });
    inputs.w = numInput(g.w, (v) => { g.w = v; syncKg(); upd(); }, { step: '0.1' });
    PCT.forEach((k) => { inputs[k] = pct(k); inputs[k + 'Kg'] = kg(k); });
    upd();
    const now = (v, u) => (v != null ? T('now ', 'τώρα ') + nf(v) + u : null);
    const form = h('form', { class: 'bd-box', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const w = num(g.w);
      const c0 = compose(num(g.fat), num(g.mus), num(g.bone));
      const fat = c0.fat, mus = c0.mus, bone = c0.bone;
      const errs = [];
      if (badNum(g.w, 25, 300)) errs.push(T('target weight 25–300 kg', 'βάρος-στόχος 25–300 kg'));
      if (badNum(g.fat, 3, 70)) errs.push(T('body fat 3–70%', 'λίπος 3–70%'));
      if (badNum(g.mus, 10, 90)) errs.push(T('muscle 10–90%', 'μύες 10–90%'));
      if (badNum(g.bone, BONE_RANGE[0], BONE_RANGE[1])) errs.push(T(`bone ${BONE_RANGE[0]}–${BONE_RANGE[1]}%`, `οστά ${BONE_RANGE[0]}–${BONE_RANGE[1]}%`));
      if (badNum(g.waist, 40, 200)) errs.push(T('waist 40–200 cm', 'μέση 40–200 cm'));
      if (errs.length) { draft.gmsg = T('Check: ', 'Έλεγξε: ') + errs.join(', ') + '.'; return rerender(); }
      if (c0.kind === 'off') { draft.gmsg = composeLine(c0).text; return rerender(); }
      if (g.date && (!isDate(g.date) || g.date <= today())) { draft.gmsg = T('The target date must be in the future.', 'Η ημερομηνία-στόχος πρέπει να είναι στο μέλλον.'); return rerender(); }
      data.goals = { type: data.goals.type || null, w, fat, mus, bone, waist: num(g.waist), date: g.date || null, setOn: today() };
      draft.goals = null; draft.gmsg = T('Targets saved.', 'Οι στόχοι αποθηκεύτηκαν.');
      persist();
    } },
      h('h3', { class: 'bd-h', text: T('My targets', 'Οι αριθμητικοί μου στόχοι') }),
      h('p', { class: 'bd-hint bd-lead', text: T('Optional. The kilos follow from the target weight and percentages; you can type either.', 'Προαιρετικά. Τα κιλά βγαίνουν από το βάρος-στόχο και τα ποσοστά· μπορείς να γράψεις όποιο από τα δύο.') }),
      h('div', { class: 'bd-grid2' },
        field(T('Target weight (kg)', 'Βάρος-στόχος (kg)'), inputs.w, now(mt.W && mt.W.v, ' kg'), 'bd-wide'),
        field(T('Body fat (%)', 'Λίπος (%)'), inputs.fat, now(mt.fat, '%')),
        field(T('Body fat (kg)', 'Λίπος (kg)'), inputs.fatKg, now(mt.fatKg, ' kg')),
        field(T('Muscle (%)', 'Μύες (%)'), inputs.mus, [now(mt.M && mt.M.v, '%'), MUS_HINT].filter(Boolean).join(' · ')),
        field(T('Muscle (kg)', 'Μύες (kg)'), inputs.musKg, now(mt.musKg, ' kg')),
        field(T('Bone (%)', 'Οστά (%)'), inputs.bone, now(mt.bone, '%')),
        field(T('Bone (kg)', 'Οστά (kg)'), inputs.boneKg, now(mt.boneKg, ' kg')),
        gTotal,
        field(T('Waist (cm)', 'Μέση (cm)'), numInput(g.waist, (v) => { g.waist = v; }, { step: '0.5' }), mt.meas.waist ? now(mt.meas.waist.v, ' cm') : T('add a waist measurement in the Body tab', 'πρόσθεσε μέτρηση μέσης στην καρτέλα Σώμα'), 'bd-wide'),
        field(T('By (optional)', 'Έως (προαιρετικά)'), h('input', { type: 'date', value: g.date, min: today(), oninput: (e) => { g.date = e.target.value; } }), null, 'bd-wide')),
      h('button', { class: 'btn primary', type: 'submit', 'data-key': 'savetargets', text: T('Save targets', 'Αποθήκευση στόχων') }),
      draft.gmsg ? h('p', { class: 'bd-msg', role: 'status', text: draft.gmsg }) : null);
    draft.gmsg = '';
    host.appendChild(form);

    // --- πού βρίσκεσαι
    if (gi.set || mt.W) {
      const box = h('div', { class: 'bd-box' });
      box.appendChild(h('h3', { class: 'bd-h', text: (gi.chosen ? T('Your goal: ', 'Ο στόχος σου: ') : T('Default goal: ', 'Προεπιλεγμένος στόχος: ')) + TYPE[gi.type][0] }));
      box.appendChild(h('p', { class: 'bd-hint bd-lead', text: gi.type === 'bulk' ? gi.modeWhy : TYPE[gi.type][1] }));
      if (gi.clash) box.appendChild(h('p', { class: 'bd-hint bd-warn', text: gi.clash }));
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
        bar(T('Bone', 'Οστά'), mt.bone, gi.bone, first('bone'), '%'),
        bar(T('Bone', 'Οστά'), mt.boneKg, gi.boneKg, null, 'kg'),
        bar(T('Waist', 'Μέση'), mt.meas.waist ? mt.meas.waist.v : null, data.goals.waist, first('waist'), 'cm')].forEach((b) => b && box.appendChild(b));
      if (gi.needPerWeek != null && mt.W) {
        const pct = (100 * gi.needPerWeek) / mt.W.v;
        const lean = gi.type === 'bulk' && gi.needPerWeek < 0;
        const tooFast = gi.needPerWeek < 0 ? pct < (lean ? -0.5 : -1) : pct > 0.5;
        box.appendChild(h('p', { class: 'bd-hint' + (tooFast ? ' bd-warn' : ''), text: T(`To reach it by ${fmtDate(data.goals.date)}: ${sgn(gi.needPerWeek, 2)} kg a week (${sgn(pct, 2)}%).`, `Για να το πετύχεις έως ${fmtDate(data.goals.date)}: ${sgn(gi.needPerWeek, 2)} kg την εβδομάδα (${sgn(pct, 2)}%).`)
          + (!tooFast ? '' : lean ? T(' That is too fast to build muscle at the same time (keep it to 0.5% a week or less); give it more time.', ' Είναι πολύ γρήγορα για να χτίζεις ταυτόχρονα μύες (κράτα το έως 0,5% την εβδομάδα)· δώσε του περισσότερο χρόνο.') : T(' That is faster than is healthy; give it more time.', ' Είναι πιο γρήγορα από το υγιές· δώσε του περισσότερο χρόνο.')) }));
      }
      if (gi.boneNote) {
        box.appendChild(h('p', { class: 'bd-hint bd-warn', text: gi.boneNote }));
        box.appendChild(h('button', { class: 'btn bd-fix', type: 'button', 'data-key': 'bonefix', text: T('Put these numbers in my targets', 'Βάλε αυτά τα νούμερα στους στόχους μου'), onclick: () => {
          g.bone = shown(gi.boneFix.bone);
          if (gi.boneFix.mus) g.mus = shown(gi.boneFix.mus);
          g.fatKg = ''; g.musKg = ''; g.boneKg = '';
          draft.gmsg = T('Filled in above. Press “Save targets” to keep them.', 'Συμπληρώθηκαν παραπάνω. Πάτα «Αποθήκευση στόχων» για να μείνουν.');
          rerender();
          const save = host.querySelector('[data-key="savetargets"]');
          if (save) save.focus();
        } }));
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
.bd-box .bd-fix{margin-top:8px}
.bd-msg{margin:8px 0 0;font-size:.85rem;font-weight:600}
.bd-hint{margin:8px 0 0;font-size:.8rem;color:var(--ink-2)}
.bd-warn{color:var(--accent);font-weight:600}
.bd-lead{margin:-4px 0 10px}
.bd-total{margin:2px 0 0;font-size:.8rem;color:var(--ink-2);font-variant-numeric:tabular-nums}
.bd-total.ok{color:var(--ink);font-weight:600}
.bd-total.ok::before{content:"✓ "}
.bd-total.bad{color:var(--accent);font-weight:600}
.bd-comp{--c-fat:#2a78d6;--c-mus:#eb6834;--c-bone:#1baf7a;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:12px}
.bd-seg{display:flex;gap:2px;height:8px}
.bd-seg i{display:block;min-width:3px;border-radius:99px}
.bd-comp .k-fat{background:var(--c-fat)}.bd-comp .k-mus{background:var(--c-mus)}.bd-comp .k-bone{background:var(--c-bone)}.bd-comp .k-other{background:var(--line)}
.bd-legend{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px;font-size:.86rem}
.bd-legend li{display:grid;grid-template-columns:10px minmax(0,1fr) auto 64px;align-items:baseline;gap:8px}
.bd-legend li>i{width:10px;height:10px;border-radius:3px;align-self:center}
.bd-legend b{font-variant-numeric:tabular-nums}
.bd-legend small{color:var(--ink-2);text-align:right;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .bd-comp{--c-fat:#3987e5;--c-mus:#d95926;--c-bone:#199e70}}
:root[data-theme="dark"] .bd-comp{--c-fat:#3987e5;--c-mus:#d95926;--c-bone:#199e70}
.bd-opts{display:grid;gap:8px}
.bd-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer}
.bd-opt.on{border-color:var(--accent);background:var(--accent-soft)}
.bd-opt input{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent)}
.bd-opt:focus-within{box-shadow:0 0 0 3px var(--accent-soft)}
.bd-opt span{display:grid;gap:2px;min-width:0}
.bd-opt b{font-size:.95rem}
.bd-opt small{font-size:.78rem;color:var(--ink-2);line-height:1.35}
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

  window.__mxBody = { metrics, fit, tips, coachLines, sig, goalLabel, goalType, goalInfo: (sessions) => goalInfo(metrics(sessions || 0)), muscleTrend, fmtCm: (v) => nf(v), mountTab, mountGoals, TYPE, onChange: (f) => listeners.push(f), data: () => JSON.parse(JSON.stringify(data)) };
})();
