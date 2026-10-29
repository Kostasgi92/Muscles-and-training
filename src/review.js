// Αξιολόγηση προγράμματος για υπερτροφία (μυϊκή ανάπτυξη).
//
// Κανόνες (όπως θα τους έβαζε ένας προπονητής, με βάση τη σύγχρονη έρευνα):
//  • Μετράμε «σκληρά» σετ: 6–30 επαναλήψεις, 0–3 επαναλήψεις πριν από την αποτυχία.
//  • Κλασματική μέτρηση: ο κύριος μυς μιας άσκησης παίρνει 1 σετ, ο βοηθητικός ½ σετ.
//  • Όγκος — ο «κανόνας του 10»: ≥10 σετ ανά μυ την εβδομάδα, βέλτιστο 10–20.
//    Κάτω από 10 ο βαθμός όγκου είναι ανάλογος (6 σετ → 6/10). Πάνω από 20, μικρή ποινή,
//    και πάνω από 25 προειδοποίηση. Οι μικροί βοηθητικοί μύες (στροφικό πέταλο, πήχεις,
//    κνήμη, καμπτήρες ισχίου κ.ά.) θέλουν ≥6 σετ, που συνήθως έρχονται και από έμμεση δουλειά.
//  • Συχνότητα: κάθε μυς ≥2 φορές την εβδομάδα (προπόνηση με ≥1,5 σετ για τον μυ).
//  • Κατανομή: έως ~10 σετ ανά μυ σε μία προπόνηση· τα παραπάνω αποδίδουν λιγότερο.
//  • Βαθμός μυός = 70% όγκος + 25% συχνότητα + 5% κατανομή (τα δύο τελευταία μετράνε
//    όσο ο όγκος πλησιάζει τα 10 σετ, ώστε λίγα σετ σε πολλές μέρες να μη βαθμολογούνται ψηλά).
//  • Ομάδα = σταθμισμένος μέσος όρος των μυών της (μεγάλοι ×3, μεσαίοι ×2, μικροί ×1).
//  • Συνολικός βαθμός = 85% μύες + 15% ισορροπία (ώθηση/έλξη, τετρακέφαλοι/οπίσθιοι, άνω/κάτω σώμα).

import { T, LANG } from './lang.js';

export const RULES = { min: 10, minorMin: 6, max: 20, excess: 25, sessionCap: 10, freqTarget: 2, hit: 1.5 };

export const GROUPS = [
  { id: 'chest', name: T('Chest', 'Στήθος') },
  { id: 'back', name: T('Back', 'Πλάτη') },
  { id: 'shoulders', name: T('Shoulders', 'Ώμοι') },
  { id: 'arms', name: T('Arms', 'Χέρια') },
  { id: 'core', name: T('Core', 'Κορμός') },
  { id: 'hips', name: T('Glutes & hips', 'Γλουτοί & ισχία') },
  { id: 'legs', name: T('Thighs & calves', 'Μηροί & γάμπες') },
];

// Οι «μύες» που βαθμολογούνται. ids: ποιοι μύες/τμήματα της εφαρμογής μετράνε (και χρωματίζονται).
export const SCORED = [
  { id: 'chest', name: T('Chest', 'Στήθος'), full: T('Pectoralis major', 'Μείζων θωρακικός'), group: 'chest', w: 3, ids: ['chest', 'pec_minor'] },
  { id: 'lats', name: T('Lats', 'Πλατύς ραχιαίος'), full: T('Latissimus dorsi & teres major', 'Πλατύς ραχιαίος & μείζων στρογγύλος'), group: 'back', w: 3, ids: ['lats', 'teres_major'] },
  { id: 'midback', name: T('Mid back', 'Μέση πλάτη'), full: T('Rhomboids, middle & lower trapezius', 'Ρομβοειδείς, μέσος & κάτω τραπεζοειδής'), group: 'back', w: 2, ids: ['rhomboids', 'trapezius.middle', 'trapezius.lower'] },
  { id: 'traps', name: T('Upper traps', 'Άνω τραπεζοειδής'), full: T('Upper trapezius & levator scapulae', 'Άνω τραπεζοειδής & ανελκτήρας ωμοπλάτης'), group: 'back', w: 1, ids: ['trapezius.upper', 'levator_scap'] },
  { id: 'erectors', name: T('Lower back', 'Χαμηλή πλάτη'), full: T('Spinal erectors', 'Ορθωτήρας της σπονδυλικής στήλης'), group: 'back', w: 2, ids: ['erectors', 'multifidus'] },
  { id: 'delt_front', name: T('Front delts', 'Μπροστινός ώμος'), full: T('Anterior deltoid', 'Πρόσθια μοίρα δελτοειδούς'), group: 'shoulders', w: 1, ids: ['deltoid.front'] },
  { id: 'delt_side', name: T('Side delts', 'Πλάγιος ώμος'), full: T('Lateral deltoid', 'Μέση μοίρα δελτοειδούς'), group: 'shoulders', w: 3, ids: ['deltoid.side'] },
  { id: 'delt_rear', name: T('Rear delts', 'Πίσω ώμος'), full: T('Posterior deltoid', 'Οπίσθια μοίρα δελτοειδούς'), group: 'shoulders', w: 2, ids: ['deltoid.rear'] },
  { id: 'cuff', name: T('Rotator cuff', 'Στροφικό πέταλο'), full: T('Supraspinatus, infraspinatus, teres minor, subscapularis', 'Υπερακάνθιος, υπακάνθιος, ελάσσων στρογγύλος, υποπλάτιος'), group: 'shoulders', w: 1, ids: ['rotator_cuff'] },
  { id: 'biceps', name: T('Biceps', 'Δικέφαλοι'), full: T('Biceps brachii', 'Δικέφαλος βραχιόνιος'), group: 'arms', w: 3, ids: ['biceps', 'coracobrachialis'] },
  { id: 'brachialis', name: T('Brachialis', 'Βραχιόνιος'), full: T('Brachialis & brachioradialis', 'Βραχιόνιος & βραχιονοκερκιδικός'), group: 'arms', w: 1, ids: ['brachialis', 'brachioradialis'] },
  { id: 'triceps', name: T('Triceps', 'Τρικέφαλοι'), full: T('Triceps brachii', 'Τρικέφαλος βραχιόνιος'), group: 'arms', w: 3, ids: ['triceps'] },
  { id: 'forearms', name: T('Forearms', 'Πήχεις'), full: T('Forearm flexors & extensors', 'Καμπτήρες & εκτείνοντες αντιβραχίου'), group: 'arms', w: 1, ids: ['forearm_flex', 'forearm_ext', 'hand'] },
  { id: 'abs', name: T('Abs', 'Κοιλιακοί'), full: T('Rectus abdominis', 'Ορθός κοιλιακός'), group: 'core', w: 2, ids: ['rectus_abd'] },
  { id: 'obliques', name: T('Obliques & deep core', 'Λοξοί & βαθύς κορμός'), full: T('Obliques, transversus abdominis, quadratus lumborum', 'Λοξοί, εγκάρσιος, τετράγωνος οσφυϊκός'), group: 'core', w: 1, ids: ['ext_oblique', 'int_oblique', 'transversus', 'quadratus_lumb'] },
  { id: 'glutes', name: T('Glutes', 'Γλουτοί'), full: T('Gluteus maximus', 'Μέγας γλουτιαίος'), group: 'hips', w: 3, ids: ['glute_max'] },
  { id: 'abductors', name: T('Side glutes', 'Πλάγιοι γλουτοί'), full: T('Gluteus medius & minimus, TFL, hip rotators', 'Μέσος & ελάσσων γλουτιαίος, TFL, έξω στροφείς'), group: 'hips', w: 2, ids: ['glute_med', 'glute_min', 'tfl', 'hip_rotators'] },
  { id: 'adductors', name: T('Adductors', 'Προσαγωγοί'), full: T('Thigh adductors', 'Προσαγωγοί του μηρού'), group: 'hips', w: 2, ids: ['adductors'] },
  { id: 'hipflex', name: T('Hip flexors', 'Καμπτήρες ισχίου'), full: T('Iliopsoas & sartorius', 'Λαγονοψοΐτης & ραπτικός'), group: 'hips', w: 1, ids: ['iliopsoas', 'sartorius'] },
  { id: 'quads', name: T('Quads', 'Τετρακέφαλοι'), full: T('Quadriceps femoris', 'Τετρακέφαλος μηριαίος'), group: 'legs', w: 3, ids: ['quads'] },
  { id: 'hamstrings', name: T('Hamstrings', 'Οπίσθιοι μηριαίοι'), full: T('Biceps femoris, semitendinosus, semimembranosus', 'Δικέφαλος μηριαίος, ημιτενοντώδης, ημιυμενώδης'), group: 'legs', w: 3, ids: ['hamstrings'] },
  { id: 'calves', name: T('Calves', 'Γάμπες'), full: T('Gastrocnemius & soleus', 'Γαστροκνήμιος & υποκνημίδιος'), group: 'legs', w: 2, ids: ['calves', 'deep_calf'] },
  { id: 'shins', name: T('Shins', 'Μπροστινή κνήμη'), full: T('Tibialis anterior & peroneals', 'Πρόσθιος κνημιαίος & περονιαίοι'), group: 'legs', w: 1, ids: ['tib_ant', 'fibularis'] },
];

export const BANDS = {
  none: { label: T('Not trained', 'Δεν δουλεύει'), color: '#8f9aab' },
  low: { label: T('Poor (below 4)', 'Ελλιπής (κάτω από 4)'), color: '#e5383b' },
  mid: { label: T('Fair (4–7)', 'Μέτριος (4–7)'), color: '#f28c28' },
  good: { label: T('Good (7–9)', 'Καλός (7–9)'), color: '#c3d332' },
  top: { label: T('Excellent (9–10)', 'Άριστος (9–10)'), color: '#2fbf71' },
  excess: { label: T('Too much volume (over 25 sets)', 'Υπερβολικός όγκος (πάνω από 25)'), color: '#8e6cf0' },
};

// Ταίριασμα στόχου άσκησης ("deltoid" ή "deltoid.side") με τη λίστα ενός μυός
export function matches(target, ids) {
  for (const id of ids) {
    if (target === id || target.startsWith(`${id}.`) || id.startsWith(`${target}.`)) return true;
  }
  return false;
}

// 1 = κύριος, 0.5 = βοηθητικός, 0 = δεν συμμετέχει
export function roleOf(ex, ids) {
  if (ex.p.some((t) => matches(t, ids))) return 1;
  if (ex.s.some((t) => matches(t, ids))) return 0.5;
  return 0;
}

export const minOf = (m) => m.min ?? (m.w <= 1 ? RULES.minorMin : RULES.min);
export const volScore = (V, min = RULES.min) => (V <= 0 ? 0 : V < min ? (10 * V) / min : V <= RULES.max ? 10 : Math.max(6, 10 - (V - RULES.max) * 0.25));
export const freqScore = (hits, V) => (V <= 0 ? 0 : hits >= RULES.freqTarget ? 10 : hits === 1 ? 5 : 3);
export const distScore = (maxS) => (maxS <= RULES.sessionCap ? 10 : Math.max(4, 10 - (maxS - RULES.sessionCap) * 0.75));

export function muscleScore(V, hits, maxS, min = RULES.min) {
  if (V <= 0) return 0;
  const k = Math.min(1, V / min);
  return Math.min(10, 0.7 * volScore(V, min) + k * (0.25 * freqScore(hits, V) + 0.05 * distScore(maxS)));
}

export function bandOf(V, score) {
  if (V <= 0) return 'none';
  if (V > RULES.excess) return 'excess';
  if (score >= 9) return 'top';
  if (score >= 7) return 'good';
  if (score >= 4) return 'mid';
  return 'low';
}

export const bandForScore = (s) => (s <= 0 ? 'none' : s >= 9 ? 'top' : s >= 7 ? 'good' : s >= 4 ? 'mid' : 'low');

export function verdict(score) {
  if (score >= 9) return T('Excellent program', 'Άριστο πρόγραμμα');
  if (score >= 7.5) return T('Very good program', 'Πολύ καλό πρόγραμμα');
  if (score >= 6) return T('Good, with room to improve', 'Καλό, με περιθώρια');
  if (score >= 4) return T('Fair: some areas are missing', 'Μέτριο: λείπουν περιοχές');
  if (score > 0) return T('Not enough for muscle growth', 'Ελλιπές για μυϊκή ανάπτυξη');
  return T('No exercises yet', 'Δεν υπάρχουν ακόμα ασκήσεις');
}

const wmean = (rows, key) => {
  let a = 0, w = 0;
  for (const r of rows) { a += r[key] * r.w; w += r.w; }
  return w ? a / w : 0;
};

// programs: [{id, name, perWeek, active, items: [{ex, sets}]}] — ex: id άσκησης (null = δεν αναγνωρίστηκε, δεν μετράει)
export function analyze(programs, exById) {
  const active = programs.filter((p) => p.active && p.perWeek > 0 && p.items.some((it) => exById.has(it.ex) && it.sets > 0));
  // κάθε επανάληψη ενός προγράμματος μέσα στην εβδομάδα = μία προπόνηση
  const sessions = [];
  for (const p of active) {
    for (let k = 0; k < p.perWeek; k++) sessions.push({ program: p, sets: new Map(), total: 0 });
  }
  const muscles = SCORED.map((m) => ({ ...m, min: minOf(m), V: 0, hits: 0, maxS: 0, contrib: [] }));
  for (const s of sessions) {
    for (const it of s.program.items) {
      const ex = exById.get(it.ex);
      if (!ex || !(it.sets > 0)) continue;
      s.total += it.sets;
      for (const m of muscles) {
        const r = roleOf(ex, m.ids);
        if (r) s.sets.set(m.id, (s.sets.get(m.id) ?? 0) + r * it.sets);
      }
    }
  }
  for (const p of active) {
    for (const it of p.items) {
      const ex = exById.get(it.ex);
      if (!ex || !(it.sets > 0)) continue;
      for (const m of muscles) {
        const r = roleOf(ex, m.ids);
        if (r) m.contrib.push({ ex, program: p, role: r, sets: it.sets, perWeek: p.perWeek, weekly: r * it.sets * p.perWeek });
      }
    }
  }
  for (const m of muscles) {
    for (const s of sessions) {
      const v = s.sets.get(m.id) ?? 0;
      m.V += v;
      if (v >= RULES.hit) m.hits++;
      m.maxS = Math.max(m.maxS, v);
    }
    m.vol = volScore(m.V, m.min);
    m.freq = freqScore(m.hits, m.V);
    m.dist = distScore(m.maxS);
    m.score = muscleScore(m.V, m.hits, m.maxS, m.min);
    m.band = bandOf(m.V, m.score);
    m.contrib.sort((a, b) => b.weekly - a.weekly);
  }
  const byId = Object.fromEntries(muscles.map((m) => [m.id, m]));
  const groups = GROUPS.map((g) => {
    const rows = muscles.filter((m) => m.group === g.id);
    const score = wmean(rows, 'score');
    const V = rows.reduce((a, m) => a + m.V, 0);
    return { ...g, score, V, band: V > 0 ? bandForScore(score) : 'none', muscles: rows };
  });

  // ισορροπία
  const V = (id) => byId[id].V;
  const ratioScore = (a, b, target) => {
    if (a + b < 4) return null;
    const r = Math.min(a, b) / Math.max(a, b);
    return Math.min(10, (10 * r) / target);
  };
  const push = V('chest') + V('delt_front') + V('triceps');
  const pull = V('lats') + V('midback') + V('delt_rear') + V('biceps');
  const upperAvg = ['chest', 'lats', 'midback', 'delt_side', 'delt_rear', 'biceps', 'triceps'].reduce((a, id) => a + V(id), 0) / 7;
  const lowerAvg = ['glutes', 'quads', 'hamstrings', 'calves'].reduce((a, id) => a + V(id), 0) / 4;
  const checks = [
    { id: 'pushpull', name: T('Push / pull', 'Ώθηση / έλξη'), a: push, b: pull, la: T('push', 'ώθηση'), lb: T('pull', 'έλξη'), score: ratioScore(push, pull, 0.8) },
    { id: 'quadham', name: T('Quads / hamstrings', 'Τετρακέφαλοι / οπίσθιοι'), a: V('quads'), b: V('hamstrings'), la: T('quads', 'τετρακέφαλοι'), lb: T('hamstrings', 'οπίσθιοι'), score: ratioScore(V('quads'), V('hamstrings'), 0.7) },
    { id: 'upperlower', name: T('Upper / lower body', 'Άνω / κάτω σώμα'), a: upperAvg, b: lowerAvg, la: T('upper body', 'άνω σώμα'), lb: T('lower body', 'κάτω σώμα'), score: ratioScore(upperAvg * 4, lowerAvg * 4, 0.6) },
  ];
  const valid = checks.filter((c) => c.score !== null);
  const balance = valid.length ? valid.reduce((a, c) => a + c.score, 0) / valid.length : 0;
  const musclePart = wmean(muscles, 'score');
  // πρόοδος φορτίου (addons/progress.js): όταν υπάρχει, μετράει 12% στον συνολικό βαθμό
  const prog = typeof window !== 'undefined' ? window.__mxProg : null;
  const overload = prog ? prog.overload(active, exById) : null;
  const overall = sessions.length ? (overload ? 0.75 * musclePart + 0.13 * balance + 0.12 * overload.score : 0.85 * musclePart + 0.15 * balance) : 0;

  return {
    overload,
    sessions,
    weeklySessions: sessions.length,
    weeklySets: sessions.reduce((a, s) => a + s.total, 0),
    muscles,
    byId,
    groups,
    checks,
    sub: { volume: wmean(muscles, 'vol'), frequency: wmean(muscles, 'freq'), balance, overload: overload ? overload.score : 0 },
    overall,
    onTarget: muscles.filter((m) => m.V >= m.min && m.V <= RULES.excess).length,
  };
}

// ------------------------------------------------------------------ προτάσεις
// Ασκήσεις που θα πρότεινε ένας προπονητής για κάθε μυ, με σειρά προτίμησης
export const PREFERRED = {
  chest: ['incline_bench', 'bench_press', 'db_bench', 'cable_crossover', 'dips', 'push_up'],
  lats: ['lat_pulldown', 'pull_up', 'db_row', 'straight_arm_pulldown', 'chin_up'],
  midback: ['seated_cable_row', 'barbell_row', 'face_pull', 'band_pull_apart', 't_bar_row'],
  traps: ['shrug', 'farmers_walk', 'upright_row'],
  erectors: ['hyperextension', 'rdl', 'bird_dog', 'deadlift'],
  delt_front: ['db_shoulder_press', 'ohp', 'front_raise'],
  delt_side: ['lateral_raise', 'db_shoulder_press', 'upright_row'],
  delt_rear: ['rear_delt_fly', 'face_pull', 'band_pull_apart'],
  cuff: ['ext_rotation', 'face_pull', 'int_rotation'],
  biceps: ['incline_curl', 'db_curl', 'barbell_curl', 'preacher_curl'],
  brachialis: ['hammer_curl', 'reverse_curl'],
  triceps: ['overhead_triceps', 'cable_pushdown', 'skull_crusher', 'close_grip_bench'],
  forearms: ['wrist_curl', 'reverse_wrist_curl', 'farmers_walk'],
  abs: ['crunch', 'hanging_leg_raise', 'ab_wheel', 'reverse_crunch'],
  obliques: ['pallof_press', 'side_plank', 'woodchop', 'suitcase_carry'],
  glutes: ['hip_thrust', 'bulgarian_split_squat', 'rdl', 'cable_kickback'],
  abductors: ['hip_abduction', 'monster_walk', 'clamshell'],
  adductors: ['hip_adduction', 'lateral_lunge', 'sumo_deadlift'],
  hipflex: ['hanging_leg_raise', 'lying_leg_raise'],
  quads: ['leg_press', 'squat', 'leg_extension', 'bulgarian_split_squat', 'hack_squat'],
  hamstrings: ['lying_leg_curl', 'rdl', 'seated_leg_curl', 'nordic_curl'],
  calves: ['calf_raise', 'seated_calf_raise'],
  shins: ['tibialis_raise', 'ankle_eversion'],
};

// Ασκήσεις που καλύπτουν συγκεκριμένη «κίνηση»/περιοχή (για τον έλεγχο επιλογής ασκήσεων)
const MOVES = {
  vpull: ['pull_up', 'chin_up', 'lat_pulldown', 'straight_arm_pulldown'],
  hrow: ['barbell_row', 'db_row', 'seated_cable_row', 't_bar_row', 'inverted_row'],
  upperChest: ['incline_bench'],
  tricepsLong: ['overhead_triceps', 'skull_crusher'],
  kneeFlex: ['lying_leg_curl', 'seated_leg_curl', 'ball_leg_curl', 'nordic_curl'],
  hinge: ['rdl', 'deadlift', 'sumo_deadlift', 'good_morning', 'single_leg_rdl', 'hyperextension', 'kettlebell_swing'],
  kneeExt: ['leg_extension'],
  soleus: ['seated_calf_raise'],
  gastroc: ['calf_raise'],
};

// αριθμός με ένα δεκαδικό, στη μορφή της γλώσσας (7,5 / 7.5)
export const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString(LANG === 'en' ? 'en-US' : 'el-GR', { maximumFractionDigits: 1 });

// Λίστα προτάσεων με σειρά προτεραιότητας.
// Κάθε πρόταση: {kind, muscle?, title, text, actions: [{type:'add', ex, sets} | {type:'template', id} | {type:'perweek', program, n}]}
export function suggest(result, programs, exById) {
  const used = new Set(programs.filter((p) => p.active).flatMap((p) => p.items.map((it) => it.ex)).filter(Boolean));
  const out = [];
  const sessions = result.weeklySessions;
  const pick = (mid, n = 2) => (PREFERRED[mid] ?? []).filter((id) => exById.has(id) && !used.has(id)).slice(0, n);
  const has = (list) => list.some((id) => used.has(id));
  const V = (id) => result.byId[id].V;

  if (!sessions) {
    out.push({ kind: 'start', title: T('Start with a program', 'Ξεκίνα από ένα πρόγραμμα'), text: T('Tick at least one program for your week, or add a ready-made template. A good start is Upper/Lower twice a week: it covers the whole body in 4 sessions.', 'Τσέκαρε τουλάχιστον ένα πρόγραμμα για την εβδομάδα ή πρόσθεσε ένα έτοιμο πρότυπο. Για αρχή, το Άνω/Κάτω σώμα 2 φορές την εβδομάδα καλύπτει όλο το σώμα σε 4 προπονήσεις.'), actions: [{ type: 'template', id: 'upper' }, { type: 'template', id: 'lower' }] });
    return out;
  }

  // 0. Ολόκληρες περιοχές που λείπουν: ένας προπονητής θα πρόσθετε μια προπόνηση, όχι 10 ασκήσεις
  const upper = ['chest', 'lats', 'midback', 'delt_side', 'delt_rear', 'biceps', 'triceps'];
  const lower = ['glutes', 'quads', 'hamstrings', 'calves'];
  const avg = (ids) => ids.reduce((a, id) => a + V(id), 0) / ids.length;
  if (avg(upper) < 3 && avg(lower) >= 4) {
    out.push({ kind: 'region', title: T('Almost the whole upper body is missing', 'Λείπει σχεδόν όλο το άνω σώμα'), text: T('Chest, back, shoulders and biceps get few or no sets. The most efficient fix is an upper-body session twice a week: it brings all of these muscles close to 10 sets.', 'Στήθος, πλάτη, ώμοι και δικέφαλοι έχουν ελάχιστα ή καθόλου σετ. Η πιο αποδοτική λύση είναι μια προπόνηση άνω σώματος 2 φορές την εβδομάδα: φέρνει όλους αυτούς τους μύες κοντά στα 10 σετ.'), actions: [{ type: 'template', id: 'upper' }] });
  } else if (avg(lower) < 3 && avg(upper) >= 4) {
    out.push({ kind: 'region', title: T('Almost the whole lower body is missing', 'Λείπει σχεδόν όλο το κάτω σώμα'), text: T('Quads, hamstrings, glutes and calves get very few sets. Add a leg session twice a week.', 'Τετρακέφαλοι, οπίσθιοι, γλουτοί και γάμπες έχουν ελάχιστα σετ. Πρόσθεσε μια προπόνηση ποδιών 2 φορές την εβδομάδα.'), actions: [{ type: 'template', id: 'lower' }] });
  }

  // 1. Συχνότητα: όλο το πρόγραμμα 1 φορά την εβδομάδα
  if (sessions === 1) {
    const p = programs.find((x) => x.active);
    out.push({ kind: 'frequency', title: T('Everything in one session a week', 'Όλα σε μία προπόνηση την εβδομάδα'), text: T('Each muscle is trained only once. Running the same program twice a week doubles the sets and reaches a frequency of 2 sessions per muscle, which is optimal for growth.', 'Κάθε μυς δουλεύει μόνο 1 φορά. Με το ίδιο πρόγραμμα 2 φορές την εβδομάδα διπλασιάζεις τα σετ και πετυχαίνεις τη συχνότητα των 2 φορών, που είναι το βέλτιστο για ανάπτυξη.'), actions: p ? [{ type: 'perweek', program: p.id, n: 2 }] : [] });
  }

  // 2. Μύες κάτω από τον στόχο, με σειρά σημασίας
  const under = result.muscles
    .filter((m) => m.V < m.min)
    .sort((a, b) => b.w * (10 - b.score) - a.w * (10 - a.score));
  for (const m of under) {
    const need = Math.ceil(m.min - m.V);
    const exs = pick(m.id, need >= 6 && m.w >= 2 ? 2 : 1);
    const each = Math.min(5, Math.max(2, Math.ceil(need / Math.max(1, exs.length))));
    const split = need >= 4 ? T(' Spread them over 2 different days.', ' Μοίρασέ τα σε 2 διαφορετικές μέρες.') : '';
    out.push({
      kind: 'volume', muscle: m,
      title: T(`${m.name}: ${fmt(m.V)} of ${m.min} sets`, `${m.name}: ${fmt(m.V)} από ${m.min} σετ`),
      text: (m.V === 0
        ? T(`Not trained at all. Target: at least ${m.min} sets a week.`, `Δεν δουλεύει καθόλου. Στόχος: τουλάχιστον ${m.min} σετ την εβδομάδα.`)
        : T(`About ${need} sets a week short of the ${m.min}-set target.`, `Λείπουν περίπου ${need} σετ την εβδομάδα για τον στόχο των ${m.min}.`)) + split,
      actions: exs.map((ex) => ({ type: 'add', ex, sets: each })),
    });
  }

  // 3. Επιλογή ασκήσεων: περιοχές/κινήσεις που λείπουν από μύες που ήδη δουλεύονται
  const sel = (cond, m, title, text, list, sets = 3) => {
    if (!cond) return;
    const ex = list.find((id) => exById.has(id) && !used.has(id));
    out.push({ kind: 'selection', muscle: result.byId[m], title, text, actions: ex ? [{ type: 'add', ex, sets }] : [] });
  };
  sel(V('lats') + V('midback') >= 4 && !has(MOVES.vpull), 'lats', T('Back: no vertical pulls', 'Πλάτη: λείπουν κάθετες έλξεις'), T('Pull-ups or pulldowns train the lats through their full length and complement your rows.', 'Οι έλξεις (μονόζυγο ή τροχαλία) δουλεύουν τον πλατύ ραχιαίο σε όλο το μήκος του και συμπληρώνουν τις κωπηλατικές.'), MOVES.vpull);
  sel(V('lats') + V('midback') >= 4 && !has(MOVES.hrow), 'midback', T('Back: no rows', 'Πλάτη: λείπουν κωπηλατικές'), T('Horizontal rows build mid-back thickness (rhomboids, trapezius) and balance your presses.', 'Οι οριζόντιες έλξεις χτίζουν το πάχος της μέσης πλάτης (ρομβοειδείς, τραπεζοειδής) και ισορροπούν τις πιέσεις.'), MOVES.hrow);
  sel(V('chest') >= 4 && !has(MOVES.upperChest), 'chest', T('Chest: no upper-chest work', 'Στήθος: λείπει το άνω στήθος'), T('An incline press (30–45°) emphasises the clavicular head, which flat presses train less.', 'Μια πίεση σε θετικό πάγκο (30–45°) τονίζει την κλειδική μοίρα, που οι επίπεδες πιέσεις δουλεύουν λιγότερο.'), MOVES.upperChest);
  sel(V('triceps') >= 4 && !has(MOVES.tricepsLong), 'triceps', T('Triceps: the long head is missing', 'Τρικέφαλοι: λείπει η μακρά κεφαλή'), T('The long head grows best when it is stretched, with the arm overhead.', 'Η μακρά κεφαλή αναπτύσσεται καλύτερα όταν τεντώνεται, με το χέρι πάνω από το κεφάλι.'), MOVES.tricepsLong);
  sel(V('hamstrings') >= 4 && !has(MOVES.kneeFlex), 'hamstrings', T('Hamstrings: no knee flexion', 'Οπίσθιοι: λείπει κάμψη γονάτου'), T('Leg curls train the hamstrings at the knee, which hip hinges do not cover.', 'Οι κάμψεις ποδιών δουλεύουν τους οπίσθιους στο γόνατο, κάτι που οι άρσεις από τη λεκάνη δεν καλύπτουν.'), MOVES.kneeFlex);
  sel(V('hamstrings') >= 4 && !has(MOVES.hinge), 'hamstrings', T('Hamstrings: no hip hinge', 'Οπίσθιοι: λείπει κίνηση από τη λεκάνη'), T('A Romanian deadlift loads the hamstrings at long muscle lengths, which is very effective for growth.', 'Μια ρουμανική άρση θανάτου δουλεύει τους οπίσθιους σε μεγάλο τέντωμα, που δίνει πολύ καλή υπερτροφία.'), MOVES.hinge);
  sel(V('quads') >= 6 && !has(MOVES.kneeExt), 'quads', T('Quads: the rectus femoris is lagging', 'Τετρακέφαλοι: ο ορθός μηριαίος υπολείπεται'), T('Squats and leg presses train the rectus femoris only a little. Leg extensions target it directly.', 'Τα καθίσματα και η πρέσα δουλεύουν λίγο τον ορθό μηριαίο. Οι εκτάσεις ποδιών τον στοχεύουν άμεσα.'), MOVES.kneeExt);
  sel(V('calves') >= 3 && !has(MOVES.soleus), 'calves', T('Calves: the soleus is missing', 'Γάμπες: λείπει ο υποκνημίδιος'), T('Seated calf raises, with the knee bent, for the soleus, the largest calf muscle.', 'Ανυψώσεις καθιστός, με λυγισμένο γόνατο, για τον υποκνημίδιο, τον μεγαλύτερο μυ της γάμπας.'), MOVES.soleus);
  sel(V('calves') >= 3 && !has(MOVES.gastroc), 'calves', T('Calves: the gastrocnemius is missing', 'Γάμπες: λείπει ο γαστροκνήμιος'), T('Standing calf raises, with the knee straight, for the gastrocnemius.', 'Ανυψώσεις όρθιος, με τεντωμένο γόνατο, για τον γαστροκνήμιο.'), MOVES.gastroc);

  // 4. Συχνότητα ανά μυ (όταν υπάρχουν ήδη 2+ προπονήσεις)
  const once = result.muscles.filter((m) => m.V >= 4 && m.hits < 2 && m.w >= 2).sort((a, b) => b.w - a.w);
  if (once.length && sessions >= 2) {
    out.push({
      kind: 'frequency',
      title: T(`${once.length} ${once.length === 1 ? 'muscle is' : 'muscles are'} trained once a week`, `${once.length} ${once.length === 1 ? 'μυς δουλεύει' : 'μύες δουλεύουν'} 1 φορά την εβδομάδα`),
      text: `${once.slice(0, 8).map((m) => m.name).join(', ')}${once.length > 8 ? T(' and more', ' κ.ά.') : ''}. ` + T('Move some of these sets to another session in the week, so each muscle is trained twice.', 'Μετάφερε μερικά από αυτά τα σετ σε άλλη προπόνηση της εβδομάδας, ώστε κάθε μυς να δουλεύει 2 φορές.'),
      actions: [],
    });
  }

  // 5. Ισορροπία
  for (const c of result.checks) {
    if (c.score === null || c.score >= 9) continue;
    if (c.id === 'upperlower' && out.some((x) => x.kind === 'region')) continue;
    const low = c.a < c.b ? c.la : c.lb;
    const high = c.a < c.b ? c.lb : c.la;
    const addFor = c.id === 'pushpull' ? (c.a < c.b ? ['chest', 'triceps'] : ['midback', 'delt_rear']) : c.id === 'quadham' ? (c.a < c.b ? ['quads'] : ['hamstrings']) : (c.a < c.b ? ['lats', 'chest'] : ['quads', 'hamstrings']);
    out.push({
      kind: 'balance',
      title: T(`Balance: ${c.name}`, `Ισορροπία: ${c.name}`),
      text: T(`More ${high} than ${low} (${fmt(Math.max(c.a, c.b))} vs ${fmt(Math.min(c.a, c.b))} sets). Bring up ${low} for even growth, good posture and healthy joints.`,
        `Υπερέχει το «${high}» (${fmt(Math.max(c.a, c.b))} έναντι ${fmt(Math.min(c.a, c.b))} σετ). Ενίσχυσε το «${low}» για ομοιόμορφη ανάπτυξη, σωστή στάση σώματος και υγιείς αρθρώσεις.`),
      actions: addFor.map((mid) => pick(mid, 1)[0]).filter(Boolean).map((ex) => ({ type: 'add', ex, sets: 3 })),
    });
  }

  // 6. Υπερβολικός όγκος και πολλά σετ σε μία προπόνηση
  for (const m of result.muscles.filter((x) => x.V > RULES.excess)) {
    out.push({
      kind: 'excess', muscle: m,
      title: T(`${m.name}: ${fmt(m.V)} sets a week`, `${m.name}: ${fmt(m.V)} σετ την εβδομάδα`),
      text: T(`Above 20–25 sets the extra benefit is small and recovery gets harder. Remove about ${Math.ceil(m.V - RULES.max)} sets or move them to muscles that are lagging.`,
        `Πάνω από 20–25 σετ το επιπλέον όφελος είναι μικρό και η αποκατάσταση δυσκολεύει. Αφαίρεσε περίπου ${Math.ceil(m.V - RULES.max)} σετ ή μετέφερέ τα σε μύες που υστερούν.`),
      actions: [],
    });
  }
  for (const m of result.muscles.filter((x) => x.maxS > RULES.sessionCap + 2 && x.V <= RULES.excess)) {
    out.push({
      kind: 'excess', muscle: m,
      title: T(`${m.name}: ${fmt(m.maxS)} sets in one session`, `${m.name}: ${fmt(m.maxS)} σετ σε μία προπόνηση`),
      text: T('After about 10 hard sets for the same muscle in one session, the returns drop. Split them over two days.', 'Μετά από ~10 σκληρά σετ για τον ίδιο μυ στην ίδια προπόνηση η απόδοση πέφτει. Μοίρασέ τα σε δύο μέρες.'),
      actions: [],
    });
  }

  // 7. Διάρκεια προπονήσεων
  const seen = new Set();
  for (const s of result.sessions) {
    if (s.total > 28 && !seen.has(s.program.id)) {
      seen.add(s.program.id);
      out.push({
        kind: 'session',
        title: T(`“${s.program.name}”: ${s.total} sets in one session`, `«${s.program.name}»: ${s.total} σετ σε μία προπόνηση`),
        text: T('More than 25–28 hard sets usually means a session of over 90 minutes, and quality drops toward the end. Split it into two sessions.', 'Πάνω από 25–28 σκληρά σετ η προπόνηση κρατά συνήθως πάνω από 90 λεπτά και η ποιότητα πέφτει στο τέλος. Χώρισέ την σε δύο προπονήσεις.'),
        actions: [],
      });
    }
  }
  // 8. Πρόοδος φορτίου (addons/progress.js)
  if (typeof window !== 'undefined' && window.__mxProg) {
    const tips = window.__mxProg.tips(result.overload);
    if (tips.length) out.splice(Math.min(2, out.length), 0, ...tips);
  }
  return out;
}

// Σύνοψη για το Claude (γνώμη προπονητή)
export function summaryText(result, programs, exById) {
  const lines = [];
  for (const p of programs.filter((x) => x.active)) {
    const items = p.items.filter((it) => exById.has(it.ex));
    lines.push(T(`Program “${p.name}” ${p.perWeek}×/week: `, `Πρόγραμμα «${p.name}» ${p.perWeek}×/εβδ.: `) + items.map((it) => `${exById.get(it.ex).el} ${it.sets} ${T('sets', 'σετ')}`).join(', '));
  }
  lines.push('');
  lines.push(T(`Overall score ${fmt(result.overall)}/10 · volume ${fmt(result.sub.volume)} · frequency ${fmt(result.sub.frequency)} · balance ${fmt(result.sub.balance)}`,
    `Συνολικός βαθμός ${fmt(result.overall)}/10 · όγκος ${fmt(result.sub.volume)} · συχνότητα ${fmt(result.sub.frequency)} · ισορροπία ${fmt(result.sub.balance)}`));
  for (const m of result.muscles) {
    lines.push(T(`${m.name}: ${fmt(m.V)} sets/week, ${m.hits}×/week, score ${fmt(m.score)}`, `${m.name}: ${fmt(m.V)} σετ/εβδ., ${m.hits}×/εβδ., βαθμός ${fmt(m.score)}`));
  }
  if (typeof window !== 'undefined' && window.__mxProg) lines.push(...window.__mxProg.coachLines(result.overload));
  return lines.join('\n');
}
