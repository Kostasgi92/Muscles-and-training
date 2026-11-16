// Αξιολόγηση προγράμματος με βάση τον κύριο στόχο του χρήστη: μυϊκή ανάπτυξη (προεπιλογή), απώλεια λίπους ή
// διατήρηση (addons/body.js goalType). Οι κανόνες παρακάτω είναι της ανάπτυξης· ο στόχος αλλάζει:
//  • Απώλεια λίπους: ίδια σετ και συχνότητα (στις μελέτες με δίαιτα όσοι κράτησαν ≥10 σετ ανά μυ έχασαν ελάχιστη ή
//    καθόλου μυϊκή μάζα)· αντί για αύξηση φορτίων μετράει η διατήρησή τους και οι περιφέρειες δεν χρειάζεται να μεγαλώνουν.
//  • Διατήρηση: ~60% των σετ και 1 φορά την εβδομάδα ανά μυ αρκούν, όσο τα φορτία κρατιούνται.
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

// Δύο αρχές για κάθε συμβουλή (προτάσεις, κείμενα, γνώμη προπονητή):
//  1. Στηρίζεται σε αναγνωρισμένη έρευνα: θέσεις επιστημονικών φορέων, μετα-αναλύσεις, κλινικές μελέτες (evidence.js).
//     Όπου η έρευνα είναι λίγη, ο κανόνας είναι συντηρητικός, μετράει λίγο στον βαθμό και το λέμε.
//  2. Είναι προσαρμοσμένη στον κύριο στόχο του χρήστη (μυϊκή ανάπτυξη, απώλεια λίπους, διατήρηση): καμία γενική συμβουλή.
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
  // κοιλιακοί: μετράει μόνο η άμεση δουλειά (τα βαριά πολυαρθρικά τους κρατούν, δεν τους μεγαλώνουν), 8–16 σετ
  // την εβδομάδα σε 2+ προπονήσεις, έως ~8 σετ σε μία (αναρρώνουν γρήγορα· η συχνότητα μετράει λιγότερο από τον όγκο)
  { id: 'abs', name: T('Abs', 'Κοιλιακοί'), full: T('Rectus abdominis', 'Ορθός κοιλιακός'), group: 'core', w: 2, ids: ['rectus_abd'], direct: true, min: 8, max: 16, cap: 8 },
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

// Οστά. Το οστό δυναμώνει (ή κρατιέται) εκεί που φορτώνεται: πολυαρθρικές ασκήσεις ποδιών, άρσεις από το ισχίο,
// όρθιες/κατακόρυφες πιέσεις, κωπηλατικές με σκυφτό κορμό και μεταφορές με βάρος φορτώνουν ισχίο και σπονδυλική στήλη.
// Η θέση του ACSM για την υγεία των οστών (Kohrt et al. 2004) ζητά ασκήσεις με αντίσταση 2–3 φορές την εβδομάδα,
// μέτριας έως υψηλής έντασης ως προς τη φόρτιση των οστών. Δίνει συχνότητα, όχι αριθμό σετ: μια προπόνηση μετράει
// όταν έχει τουλάχιστον μία ολόκληρη τέτοια άσκηση (3 σετ).
export const BONE_LIFTS = new Set(['squat', 'front_squat', 'goblet_squat', 'bulgarian_split_squat', 'lunge', 'db_lunge', 'walking_lunge', 'lateral_lunge', 'step_up', 'leg_press', 'hack_squat',
  'deadlift', 'rdl', 'sumo_deadlift', 'single_leg_rdl', 'good_morning', 'hip_thrust', 'kettlebell_swing', 'power_clean', 'hyperextension',
  'ohp', 'db_shoulder_press', 'arnold_press', 'barbell_row', 't_bar_row', 'shrug', 'farmers_walk', 'suitcase_carry', 'calf_raise']);
export const BONE_RULE = { sessions: 2, sets: 3 };
// άσκηση «κορμού»: όλοι οι κύριοι μύες της είναι κοιλιακοί/κορμός/καμπτήρες ισχίου
const CORE_IDS = ['rectus_abd', 'ext_oblique', 'int_oblique', 'transversus', 'quadratus_lumb', 'iliopsoas'];
const isCoreEx = (ex) => ex.p.length > 0 && ex.p.every((t) => CORE_IDS.some((c) => t === c || t.startsWith(c + '.')));
// ρόλος άσκησης για έναν μυ· για «άμεση» μέτρηση (κοιλιακοί): το ½ του βοηθητικού μετράει μόνο σε ασκήσεις κορμού
export function roleFor(ex, m) {
  const r = roleOf(ex, m.ids);
  return m.direct && r === 0.5 && !isCoreEx(ex) ? 0 : r;
}
export const maxOf = (m) => m.max ?? RULES.max;
export const capOf = (m) => m.cap ?? RULES.sessionCap;
export const minOf = (m) => m.min ?? (m.w <= 1 ? RULES.minorMin : RULES.min);
export const volScore = (V, min = RULES.min, max = RULES.max) => (V <= 0 ? 0 : V < min ? (10 * V) / min : V <= max ? 10 : Math.max(6, 10 - (V - max) * 0.25));
// fq: πόσες φορές την εβδομάδα θέλει ο μυς με τον στόχο του χρήστη (ανάπτυξη/απώλεια λίπους 2, διατήρηση 1)
export const freqScore = (hits, V, fq = RULES.freqTarget) => (V <= 0 ? 0 : hits >= fq ? 10 : hits === 1 ? 5 : 3);
export const distScore = (maxS, cap = RULES.sessionCap) => (maxS <= cap ? 10 : Math.max(4, 10 - (maxS - cap) * 0.75));

export function muscleScore(V, hits, maxS, min = RULES.min, max = RULES.max, cap = RULES.sessionCap, fq = RULES.freqTarget) {
  if (V <= 0) return 0;
  const k = Math.min(1, V / min);
  return Math.min(10, 0.7 * volScore(V, min, max) + k * (0.25 * freqScore(hits, V, fq) + 0.05 * distScore(maxS, cap)));
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

// goalType: 'bulk' (μυϊκή ανάπτυξη) | 'cut' (απώλεια λίπους) | 'maintain' (διατήρηση)
export function verdict(score, goalType = 'bulk') {
  if (score >= 9) return T('Excellent program', 'Άριστο πρόγραμμα');
  if (score >= 7.5) return T('Very good program', 'Πολύ καλό πρόγραμμα');
  if (score >= 6) return T('Good, with room to improve', 'Καλό, με περιθώρια');
  if (score >= 4) return T('Fair: some areas are missing', 'Μέτριο: λείπουν περιοχές');
  if (score > 0) return goalType === 'cut' ? T('Not enough to keep your muscle while losing fat', 'Ελλιπές για να κρατήσεις τους μύες χάνοντας λίπος') : goalType === 'maintain' ? T('Not enough to keep your muscle', 'Ελλιπές για να κρατήσεις τους μύες σου') : T('Not enough for muscle growth', 'Ελλιπές για μυϊκή ανάπτυξη');
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
    for (let k = 0; k < p.perWeek; k++) sessions.push({ program: p, sets: new Map(), total: 0, bone: 0 });
  }
  // καρτέλα Στόχοι (addons/body.js): ο κύριος στόχος αλλάζει τα σετ και τις φορές την εβδομάδα που χρειάζεται κάθε μυς
  const bodyApi = typeof window !== 'undefined' ? window.__mxBody : null;
  const goal = bodyApi && bodyApi.goalType ? bodyApi.goalType() : null;
  const gk = goal ? goal.sets : 1;
  const fq = goal ? goal.freq : RULES.freqTarget;
  const muscles = SCORED.map((m) => ({ ...m, min: Math.max(3, Math.round(minOf(m) * gk)), baseMin: minOf(m), freqTarget: fq, V: 0, hits: 0, maxS: 0, contrib: [] }));
  for (const s of sessions) {
    for (const it of s.program.items) {
      const ex = exById.get(it.ex);
      if (!ex || !(it.sets > 0)) continue;
      s.total += it.sets;
      if (BONE_LIFTS.has(ex.id)) s.bone += it.sets;
      for (const m of muscles) {
        const r = roleFor(ex, m);
        if (r) s.sets.set(m.id, (s.sets.get(m.id) ?? 0) + r * it.sets);
      }
    }
  }
  for (const p of active) {
    for (const it of p.items) {
      const ex = exById.get(it.ex);
      if (!ex || !(it.sets > 0)) continue;
      for (const m of muscles) {
        const r = roleFor(ex, m);
        if (r) m.contrib.push({ ex, program: p, role: r, sets: it.sets, perWeek: p.perWeek, weekly: r * it.sets * p.perWeek });
      }
    }
  }
  // καρτέλα Πρόοδος (addons/progress.js): πόσο προχωράνε τα φορτία των ασκήσεων κάθε μυός
  const prog = typeof window !== 'undefined' ? window.__mxProg : null;
  const growth = !goal || goal.growth;
  for (const m of muscles) {
    for (const s of sessions) {
      const v = s.sets.get(m.id) ?? 0;
      m.V += v;
      if (v >= RULES.hit) m.hits++;
      m.maxS = Math.max(m.maxS, v);
    }
    m.max = maxOf(m);
    m.cap = capOf(m);
    m.vol = volScore(m.V, m.min, m.max);
    m.freq = freqScore(m.hits, m.V, fq);
    m.dist = distScore(m.maxS, m.cap);
    m.base = muscleScore(m.V, m.hits, m.maxS, m.min, m.max, m.cap, fq);
    m.contrib.sort((a, b) => b.weekly - a.weekly);
    // πρόοδος φορτίου του μυός: μέσος όρος των ασκήσεών του, με βάρος τα εβδομαδιαία σετ (χωρίς καταγραφή = 0)
    m.prog = null;
    m.logged = 0;
    if (prog && prog.health && m.contrib.length) {
      let w = 0, hsum = 0;
      for (const c of m.contrib) {
        c.health = prog.health(c.program.id, c.ex.id, c.sets);
        c.level = prog.status ? prog.status({ pid: c.program.id, key: c.ex.id, ex: c.ex.id, sets: c.sets }) : null;
        w += c.weekly;
        if (c.health != null) { hsum += c.weekly * c.health; m.logged++; }
      }
      m.prog = w ? (10 * hsum) / w : 0;
    }
    // καρτέλα Σώμα: περιφέρεια που δεν μεγαλώνει ενώ ο στόχος είναι ανάπτυξη
    m.trend = bodyApi && bodyApi.muscleTrend ? bodyApi.muscleTrend(m.id) : null;
    m.trendPenalty = m.trend && m.trend.state === 'flat' && growth && m.V > 0 ? 0.5 : 0;
    m.score = m.V <= 0 ? 0 : Math.max(0, Math.min(10, (m.prog == null ? m.base : 0.85 * m.base + 0.15 * m.prog) - m.trendPenalty));
    m.band = bandOf(m.V, m.score);
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
  // πρόοδος φορτίου (addons/progress.js): μετράει μέσα στον βαθμό κάθε μυός (15%)· εδώ ο συνολικός δείκτης
  const overload = prog ? prog.overload(active, exById) : null;
  // ταίριασμα με το σώμα και τους στόχους (addons/body.js): όταν υπάρχουν στοιχεία, μετράει 10%
  // οστά: προπονήσεις της εβδομάδας με βαριές ασκήσεις που φορτώνουν ισχίο και σπονδυλική στήλη
  const bone = { sessions: sessions.filter((s) => s.bone >= BONE_RULE.sets).length, sets: sessions.reduce((a, s) => a + s.bone, 0), target: BONE_RULE.sessions };
  const bodyFit = bodyApi && sessions.length ? bodyApi.fit({
    sessions: sessions.length, volume: wmean(muscles, 'vol'), overload: overload ? overload.score : null,
    maxSession: sessions.reduce((a, s) => Math.max(a, s.total), 0), groups, bone,
  }) : null;
  let overall = sessions.length ? (overload ? 0.87 * musclePart + 0.13 * balance : 0.85 * musclePart + 0.15 * balance) : 0;
  if (bodyFit) overall = 0.9 * overall + 0.1 * bodyFit.score;

  return {
    overload,
    bodyFit,
    bone,
    goal,
    sessions,
    weeklySessions: sessions.length,
    weeklySets: sessions.reduce((a, s) => a + s.total, 0),
    muscles,
    byId,
    groups,
    checks,
    sub: { volume: wmean(muscles, 'vol'), frequency: wmean(muscles, 'freq'), balance, overload: overload ? overload.score : 0, goals: bodyFit ? bodyFit.score : null },
    overall,
    onTarget: muscles.filter((m) => m.V >= m.min && m.V <= RULES.excess).length,
  };
}

// ------------------------------------------------------------------ προτάσεις
// Ασκήσεις που θα πρότεινε ένας προπονητής για κάθε μυ, με σειρά προτίμησης
export const PREFERRED = {
  chest: ['incline_bench', 'db_incline', 'bench_press', 'db_bench', 'cable_crossover', 'dips', 'push_up'],
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
  upperChest: ['incline_bench', 'db_incline'],
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
  // ο κύριος στόχος (addons/body.js): πόσες φορές την εβδομάδα θέλει κάθε μυς και τι λέμε στις προτάσεις
  const goal = result.goal;
  const gtype = goal ? goal.type : 'bulk';
  const fq = goal ? goal.freq : RULES.freqTarget;

  if (!sessions) {
    const tick = T('Tick at least one program for your week, or add a ready-made template. ', 'Τσέκαρε τουλάχιστον ένα πρόγραμμα για την εβδομάδα ή πρόσθεσε ένα έτοιμο πρότυπο. ');
    if (gtype === 'maintain') out.push({ kind: 'start', title: T('Start with a program', 'Ξεκίνα από ένα πρόγραμμα'), text: tick + T('For maintenance, two full-body sessions a week are enough to keep your muscle and load your bones.', 'Για διατήρηση αρκούν δύο προπονήσεις όλου του σώματος την εβδομάδα, για να κρατήσεις τους μύες και να φορτώνεις τα οστά σου.'), actions: [{ type: 'template', id: 'fullA' }, { type: 'template', id: 'fullB' }] });
    else out.push({ kind: 'start', title: T('Start with a program', 'Ξεκίνα από ένα πρόγραμμα'), text: tick + (gtype === 'cut'
      ? T('For fat loss a good start is Upper/Lower twice a week: 4 sessions that keep every muscle at its 10 weekly sets while you diet.', 'Για απώλεια λίπους, καλή αρχή είναι το Άνω/Κάτω σώμα 2 φορές την εβδομάδα: 4 προπονήσεις που κρατούν κάθε μυ στα 10 εβδομαδιαία σετ όσο κάνεις δίαιτα.')
      : T('For muscle gain a good start is Upper/Lower twice a week: it trains the whole body twice in 4 sessions.', 'Για μυϊκή ανάπτυξη, καλή αρχή είναι το Άνω/Κάτω σώμα 2 φορές την εβδομάδα: γυμνάζει όλο το σώμα 2 φορές σε 4 προπονήσεις.')), actions: [{ type: 'template', id: 'upper' }, { type: 'template', id: 'lower' }] });
    return out;
  }

  // 0. Ολόκληρες περιοχές που λείπουν: ένας προπονητής θα πρόσθετε μια προπόνηση, όχι 10 ασκήσεις
  const upper = ['chest', 'lats', 'midback', 'delt_side', 'delt_rear', 'biceps', 'triceps'];
  const lower = ['glutes', 'quads', 'hamstrings', 'calves'];
  const avg = (ids) => ids.reduce((a, id) => a + V(id), 0) / ids.length;
  if (avg(upper) < 3 && avg(lower) >= 4) {
    out.push({ kind: 'region', title: T('Almost the whole upper body is missing', 'Λείπει σχεδόν όλο το άνω σώμα'), text: T(`Chest, back, shoulders and biceps get few or no sets. The most efficient fix is an upper-body session${fq >= 2 ? ' twice a week' : ''}: it brings all of these muscles close to their ${gtype === 'maintain' ? 'maintenance ' : ''}targets.`, `Στήθος, πλάτη, ώμοι και δικέφαλοι έχουν ελάχιστα ή καθόλου σετ. Η πιο αποδοτική λύση είναι μια προπόνηση άνω σώματος${fq >= 2 ? ' 2 φορές την εβδομάδα' : ''}: φέρνει όλους αυτούς τους μύες κοντά στους στόχους τους${gtype === 'maintain' ? ' για διατήρηση' : ''}.`), actions: [{ type: 'template', id: 'upper' }] });
  } else if (avg(lower) < 3 && avg(upper) >= 4) {
    out.push({ kind: 'region', title: T('Almost the whole lower body is missing', 'Λείπει σχεδόν όλο το κάτω σώμα'), text: T(`Quads, hamstrings, glutes and calves get very few sets. Add a leg session${fq >= 2 ? ' twice a week' : ''}: the legs hold your biggest muscles${gtype === 'cut' ? ', which burn the most energy,' : ''} and leg lifts are what load the bones of your hips and spine.`, `Τετρακέφαλοι, οπίσθιοι, γλουτοί και γάμπες έχουν ελάχιστα σετ. Πρόσθεσε μια προπόνηση ποδιών${fq >= 2 ? ' 2 φορές την εβδομάδα' : ''}: στα πόδια είναι οι μεγαλύτεροι μύες σου${gtype === 'cut' ? ', που καίνε την περισσότερη ενέργεια,' : ''} και οι ασκήσεις ποδιών φορτώνουν τα οστά του ισχίου και της σπονδυλικής στήλης.`), actions: [{ type: 'template', id: 'lower' }] });
  }

  // 1. Συχνότητα: όλο το πρόγραμμα 1 φορά την εβδομάδα (στη διατήρηση η 1 φορά αρκεί)
  if (sessions === 1 && fq >= 2) {
    const p = programs.find((x) => x.active);
    out.push({ kind: 'frequency', title: T('Everything in one session a week', 'Όλα σε μία προπόνηση την εβδομάδα'), text: T('Each muscle is trained only once. Running the same program twice a week doubles the sets and reaches a frequency of 2 sessions per muscle, ', 'Κάθε μυς δουλεύει μόνο 1 φορά. Με το ίδιο πρόγραμμα 2 φορές την εβδομάδα διπλασιάζεις τα σετ και πετυχαίνεις τη συχνότητα των 2 φορών, ')
      + (gtype === 'cut' ? T('which is what keeps your muscle while you lose fat.', 'που κρατά τους μύες σου όσο χάνεις λίπος.') : gtype === 'maintain' ? T('which is what your muscles need to hold.', 'που χρειάζονται οι μύες σου για να κρατηθούν.') : T('which is optimal for growth.', 'που είναι το βέλτιστο για ανάπτυξη.')), actions: p ? [{ type: 'perweek', program: p.id, n: 2 }] : [] });
  }

  // 2. Μύες κάτω από τον στόχο, με σειρά σημασίας
  const under = result.muscles
    .filter((m) => m.V < m.min)
    .sort((a, b) => b.w * (10 - b.score) - a.w * (10 - a.score));
  for (const m of under) {
    const need = Math.ceil(m.min - m.V);
    const exs = pick(m.id, need >= 6 && m.w >= 2 ? 2 : 1);
    const each = Math.min(5, Math.max(2, Math.ceil(need / Math.max(1, exs.length))));
    const split = need >= 4 && fq >= 2 ? T(' Spread them over 2 different days.', ' Μοίρασέ τα σε 2 διαφορετικές μέρες.') : '';
    out.push({
      kind: 'volume', muscle: m,
      title: T(`${m.name}: ${fmt(m.V)} of ${m.min} sets`, `${m.name}: ${fmt(m.V)} από ${m.min} σετ`),
      text: (m.V === 0
        ? T(`Not trained at all. Target: at least ${m.min} sets a week.`, `Δεν δουλεύει καθόλου. Στόχος: τουλάχιστον ${m.min} σετ την εβδομάδα.`)
        : T(`About ${need} ${need === 1 ? 'set' : 'sets'} a week short of the ${m.min}-set target.`, `Λείπουν περίπου ${need} σετ την εβδομάδα για τον στόχο των ${m.min}.`)) + split,
      actions: exs.map((ex) => ({ type: 'add', ex, sets: each })),
    });
  }

  // 3. Επιλογή ασκήσεων: περιοχές/κινήσεις που λείπουν από μύες που ήδη δουλεύονται
  // (μόνο με στόχο τη μυϊκή ανάπτυξη: αφορούν το πώς μεγαλώνει κάθε τμήμα ενός μυός, όχι το αν διατηρείται)
  const sel = (cond, m, title, text, list, sets = 3) => {
    if (!cond || gtype !== 'bulk') return;
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

  // 4. Συχνότητα ανά μυ (όταν υπάρχουν ήδη 2+ προπονήσεις και ο στόχος θέλει 2 φορές την εβδομάδα)
  const once = fq >= 2 ? result.muscles.filter((m) => m.V >= 4 && m.hits < 2 && m.w >= 2).sort((a, b) => b.w - a.w) : [];
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
      text: T(`More ${high} than ${low} (${fmt(Math.max(c.a, c.b))} vs ${fmt(Math.min(c.a, c.b))} sets). Bring up ${low} for ${gtype === 'bulk' ? 'even growth' : 'a balanced body'}, good posture and healthy joints.`,
        `Υπερέχει το «${high}» (${fmt(Math.max(c.a, c.b))} έναντι ${fmt(Math.min(c.a, c.b))} σετ). Ενίσχυσε το «${low}» για ${gtype === 'bulk' ? 'ομοιόμορφη ανάπτυξη' : 'ισορροπημένο σώμα'}, σωστή στάση σώματος και υγιείς αρθρώσεις.`),
      actions: addFor.map((mid) => pick(mid, 1)[0]).filter(Boolean).map((ex) => ({ type: 'add', ex, sets: 3 })),
    });
  }

  // 6. Υπερβολικός όγκος και πολλά σετ σε μία προπόνηση
  for (const m of result.muscles.filter((x) => x.V > RULES.excess)) {
    out.push({
      kind: 'excess', muscle: m,
      title: T(`${m.name}: ${fmt(m.V)} sets a week`, `${m.name}: ${fmt(m.V)} σετ την εβδομάδα`),
      text: gtype === 'maintain'
        ? T(`That is far more than maintenance needs (about ${m.min} sets). Remove about ${Math.ceil(m.V - RULES.max)} sets: with the same loads you keep the muscle.`, `Είναι πολύ περισσότερα από όσα θέλει η διατήρηση (περίπου ${m.min} σετ). Αφαίρεσε περίπου ${Math.ceil(m.V - RULES.max)} σετ: με τα ίδια φορτία κρατάς τον μυ.`)
        : gtype === 'cut'
          ? T(`Above 20–25 sets the extra benefit is small, and while you eat less you recover more slowly. Remove about ${Math.ceil(m.V - RULES.max)} sets or move them to muscles below their target.`, `Πάνω από 20–25 σετ το επιπλέον όφελος είναι μικρό και, όσο τρως λιγότερο, αναρρώνεις πιο αργά. Αφαίρεσε περίπου ${Math.ceil(m.V - RULES.max)} σετ ή μετέφερέ τα σε μύες κάτω από τον στόχο τους.`)
          : T(`Above 20–25 sets the extra growth is small and recovery gets harder. Remove about ${Math.ceil(m.V - RULES.max)} sets or move them to muscles that are lagging.`, `Πάνω από 20–25 σετ η επιπλέον ανάπτυξη είναι μικρή και η αποκατάσταση δυσκολεύει. Αφαίρεσε περίπου ${Math.ceil(m.V - RULES.max)} σετ ή μετέφερέ τα σε μύες που υστερούν.`),
      actions: [],
    });
  }
  for (const m of result.muscles.filter((x) => x.maxS > x.cap + 2 && x.V <= RULES.excess)) {
    out.push({
      kind: 'excess', muscle: m,
      title: T(`${m.name}: ${fmt(m.maxS)} sets in one session`, `${m.name}: ${fmt(m.maxS)} σετ σε μία προπόνηση`),
      text: T(`After about ${m.cap} hard sets for the same muscle in one session, the returns drop. `, `Μετά από ~${m.cap} σκληρά σετ για τον ίδιο μυ στην ίδια προπόνηση η απόδοση πέφτει. `)
        + (gtype === 'maintain' ? T('For maintenance you can simply drop the extra sets.', 'Για διατήρηση μπορείς απλώς να κόψεις τα επιπλέον σετ.') : T('Split them over two days.', 'Μοίρασέ τα σε δύο μέρες.')),
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
        text: T('More than 25–28 hard sets usually means a session of over 90 minutes, and quality drops toward the end. ', 'Πάνω από 25–28 σκληρά σετ η προπόνηση κρατά συνήθως πάνω από 90 λεπτά και η ποιότητα πέφτει στο τέλος. ')
          + (gtype === 'maintain' ? T('Maintenance needs far fewer: take a set off each exercise.', 'Η διατήρηση θέλει πολύ λιγότερα: βγάλε ένα σετ από κάθε άσκηση.')
            : gtype === 'cut' ? T('On a diet you have less energy for the last sets: split it into two sessions so the loads hold.', 'Στη δίαιτα έχεις λιγότερη ενέργεια για τα τελευταία σετ: χώρισέ την σε δύο προπονήσεις για να κρατιούνται τα φορτία.')
              : T('Split it into two sessions so the last sets still drive growth.', 'Χώρισέ την σε δύο προπονήσεις, ώστε και τα τελευταία σετ να δίνουν ανάπτυξη.')),
        actions: [],
      });
    }
  }
  // 7β. Διατήρηση: πολύ περισσότερα σετ από όσα χρειάζονται (δεν ρίχνει τον βαθμό· απλώς μπορείς να κερδίσεις χρόνο)
  if (gtype === 'maintain') {
    const big = result.muscles.filter((m) => m.w >= 2 && m.V > 0);
    const over = big.filter((m) => m.V >= 1.5 * m.min);
    if (big.length && over.length >= big.length / 2) {
      out.push({
        kind: 'goal',
        title: T('More training than maintenance needs', 'Περισσότερη προπόνηση από όση θέλει η διατήρηση'),
        text: T(`${over.length} of your ${big.length} bigger muscles get at least one and a half times the sets that maintenance needs. You can keep the plan as it is, or save time: with a set less on each exercise you still keep your muscle, as long as the loads stay the same. For your bones, keep the heavy leg, hip and back lifts in at least two sessions a week.`,
          `${over.length} από τους ${big.length} μεγαλύτερους μύες σου παίρνουν τουλάχιστον μιάμιση φορά τα σετ που θέλει η διατήρηση. Μπορείς να κρατήσεις το πρόγραμμα όπως είναι ή να κερδίσεις χρόνο: με ένα σετ λιγότερο σε κάθε άσκηση κρατάς πάλι τους μύες σου, εφόσον τα φορτία μείνουν ίδια. Για τα οστά σου, κράτα τις βαριές ασκήσεις ποδιών, ισχίου και πλάτης σε τουλάχιστον δύο προπονήσεις την εβδομάδα.`),
        actions: [],
      });
    }
  }
  // 8. Πρόοδος φορτίου (addons/progress.js)
  if (typeof window !== 'undefined' && window.__mxProg) {
    const tips = window.__mxProg.tips(result.overload);
    if (tips.length) out.splice(Math.min(2, out.length), 0, ...tips);
  }
  // 8β. Αρχικό φορτίο για κάθε άσκηση χωρίς καταγραφή (από σωματικό βάρος, φύλο, ηλικία και τις καταγραφές σου)
  if (typeof window !== 'undefined' && window.__mxProg && window.__mxProg.starters) {
    const st = window.__mxProg.starters(programs);
    const hasW = !!(window.__mxBody && window.__mxBody.metrics && window.__mxBody.metrics(0).W);
    if (st.length || !hasW) {
      const acts = [];
      if (st.length) acts.push({ type: 'progress', ex: st[0].ex, pid: st[0].pid });
      if (!hasW) acts.push({ type: 'tab', id: 'body' });
      out.splice(Math.min(2, out.length), 0, {
        kind: 'startw',
        title: st.length ? T(`Starting loads for ${st.length} ${st.length === 1 ? 'exercise' : 'exercises'} without a log`, `Αρχικό φορτίο για ${st.length} ${st.length === 1 ? 'άσκηση' : 'ασκήσεις'} χωρίς καταγραφή`) : T('Starting loads need your weight', 'Για αρχικά φορτία χρειάζεται το βάρος σου'),
        text: (st.length ? T('A load you can lift for the reps shown with 2–3 reps to spare, from your body weight, sex and age and calibrated on the lifts you have already logged. If the first set feels too easy or too hard, change it by 5–10%, then log it in the Progress tab.', 'Ένα φορτίο που σηκώνεις για τις επαναλήψεις που φαίνονται αφήνοντας 2–3 «στο ρεζερβουάρ», από το σωματικό σου βάρος, το φύλο και την ηλικία, προσαρμοσμένο σε ό,τι έχεις ήδη καταγράψει. Αν το πρώτο σετ είναι πολύ εύκολο ή πολύ δύσκολο, άλλαξέ το κατά 5–10% και μετά κατάγραψέ το στην καρτέλα Πρόοδος.') : '')
          + (!hasW ? (st.length ? ' ' : '') + T('Add your weight (and sex and age) in the Body tab to get kilos for the exercises with weights.', 'Πρόσθεσε το βάρος σου (και φύλο και ηλικία) στην καρτέλα Σώμα για να πάρεις κιλά και για τις ασκήσεις με βάρη.') : ''),
        items: st.map((x) => `${x.name} (${x.day}): ${x.text}`),
        actions: acts,
      });
    }
  }
  // 9. Σώμα και στόχοι (addons/body.js)
  if (typeof window !== 'undefined' && window.__mxBody) {
    const f = result.bodyFit;
    const bt = window.__mxBody.tips({ sessions, bone: result.bone }, f).map((t) => {
      if (!t.stag) return t;
      // περιφέρεια που δεν μεγαλώνει: λίγος όγκος για τους μύες της → πρόσθεσε άσκηση
      const low = t.stag.muscles.map((id) => result.byId[id]).filter((m) => m && m.V < RULES.max).sort((a, b) => a.V - b.V)[0];
      const ex = low ? pick(low.id, 1)[0] : null;
      return { ...t, muscle: low, text: t.text + ' ' + (low
        ? T(`${low.name} get ${fmt(low.V)} sets a week. Add 2–4 sets and keep raising the load; also check that you eat enough.`, `Οι ${low.name.toLowerCase()} παίρνουν ${fmt(low.V)} σετ την εβδομάδα. Πρόσθεσε 2–4 σετ και συνέχισε να ανεβάζεις φορτίο· έλεγξε επίσης αν τρως αρκετά.`)
        : T('The volume is already enough: progress the loads and eat enough.', 'Ο όγκος ήδη αρκεί: ανέβαζε φορτία και φρόντισε να τρως αρκετά.')), actions: ex ? [{ type: 'add', ex, sets: 3 }] : [] };
    });
    // λίγες προπονήσεις για τον στόχο → ίδιο πρόγραμμα περισσότερες φορές
    if (f && f.reasons[0][0] < 9 && sessions < 4 && !out.some((x) => x.kind === 'frequency' && x.actions.length)) {
      const p = programs.filter((x) => x.active).sort((a, b) => a.perWeek - b.perWeek)[0];
      if (p) bt.unshift({ kind: 'body', title: T(`${window.__mxBody.TYPE[f.type][0]}: more workouts a week`, `${window.__mxBody.TYPE[f.type][0]}: περισσότερες προπονήσεις`), text: T(`For this goal ${f.type === 'cut' ? '3 or more' : f.type === 'maintain' ? '2 or more' : '3–4'} workouts a week work best; you do ${sessions}.`, `Για αυτόν τον στόχο δουλεύουν καλύτερα ${f.type === 'cut' ? '3 ή περισσότερες' : f.type === 'maintain' ? '2 ή περισσότερες' : '3–4'} προπονήσεις την εβδομάδα· κάνεις ${sessions}.`), actions: [{ type: 'perweek', program: p.id, n: p.perWeek + 1 }] });
    }
    out.splice(Math.min(3, out.length), 0, ...bt);
  }
  // 10. Οστά: λιγότερες από 2 προπονήσεις την εβδομάδα με βαριές ασκήσεις για ισχίο και σπονδυλική στήλη
  if (result.bone && result.bone.sessions < BONE_RULE.sessions) {
    const n = result.bone.sessions;
    const ex = ['squat', 'rdl', 'leg_press', 'db_lunge', 'deadlift', 'ohp'].find((id) => exById.has(id) && !used.has(id));
    out.push({
      kind: 'bone',
      title: n ? T('Bones: only 1 session a week loads your hips and spine', 'Οστά: μόνο 1 προπόνηση την εβδομάδα φορτώνει ισχίο και σπονδυλική στήλη') : T('Bones: no session loads your hips and spine', 'Οστά: καμία προπόνηση δεν φορτώνει ισχίο και σπονδυλική στήλη'),
      text: T('Bone holds or gets stronger only where it is loaded. Guidelines for bone health ask for resistance exercise 2–3 times a week with heavy lifts for the legs, hips and back, such as squats, deadlifts, lunges and overhead presses. ', 'Το οστό κρατιέται ή δυναμώνει μόνο εκεί που φορτώνεται. Οι οδηγίες για την υγεία των οστών ζητούν ασκήσεις με αντίσταση 2–3 φορές την εβδομάδα, με βαριές ασκήσεις για πόδια, ισχίο και πλάτη, όπως καθίσματα, άρσεις θανάτου, προβολές και πιέσεις πάνω από το κεφάλι. ')
        + (gtype === 'cut' ? T('This matters more while you lose weight, because dieting takes a little bone too.', 'Μετράει περισσότερο όσο χάνεις βάρος, γιατί η δίαιτα παίρνει και λίγο οστό.')
          : gtype === 'maintain' ? T('For muscle one session a week can be enough; for bone, keep these lifts in at least two.', 'Για τους μύες μπορεί να αρκεί 1 προπόνηση την εβδομάδα· για τα οστά, κράτα αυτές τις ασκήσεις σε τουλάχιστον δύο.')
            : T('The same lifts are also the ones that build the most muscle.', 'Οι ίδιες ασκήσεις είναι και αυτές που χτίζουν τους περισσότερους μύες.')),
      actions: ex ? [{ type: 'add', ex, sets: 3 }] : [],
    });
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
  // ο κύριος στόχος του χρήστη: με αυτόν βγήκαν οι βαθμοί και με αυτόν πρέπει να κρίνει ο προπονητής
  const goal = result.goal;
  if (goal) {
    const tgt = result.byId.chest;
    lines.push(T(`Primary goal: ${goal.label}${goal.chosen ? ' (chosen by the user)' : ' (default, the user has not chosen yet)'}. Set target per big muscle: ${tgt.min}–${tgt.max} a week, ${goal.freq === 1 ? 'once' : 'twice'} a week; ${goal.hold ? 'the loads should be held' : 'the loads should go up over time'}.`,
      `Κύριος στόχος: ${goal.label}${goal.chosen ? ' (επιλογή του χρήστη)' : ' (προεπιλογή, ο χρήστης δεν έχει διαλέξει ακόμα)'}. Στόχος σετ ανά μεγάλο μυ: ${tgt.min}–${tgt.max} την εβδομάδα, ${goal.freq === 1 ? '1 φορά' : '2 φορές'} την εβδομάδα· ${goal.hold ? 'τα φορτία πρέπει να κρατιούνται' : 'τα φορτία πρέπει να ανεβαίνουν με τον καιρό'}.`));
  }
  lines.push(T(`Overall score ${fmt(result.overall)}/10 · volume ${fmt(result.sub.volume)} · frequency ${fmt(result.sub.frequency)} · balance ${fmt(result.sub.balance)}`,
    `Συνολικός βαθμός ${fmt(result.overall)}/10 · όγκος ${fmt(result.sub.volume)} · συχνότητα ${fmt(result.sub.frequency)} · ισορροπία ${fmt(result.sub.balance)}`));
  for (const m of result.muscles) {
    lines.push(T(`${m.name}: ${fmt(m.V)} sets/week, ${m.hits}×/week, score ${fmt(m.score)}`, `${m.name}: ${fmt(m.V)} σετ/εβδ., ${m.hits}×/εβδ., βαθμός ${fmt(m.score)}`));
  }
  if (typeof window !== 'undefined' && window.__mxProg) lines.push(...window.__mxProg.coachLines(result.overload));
  if (typeof window !== 'undefined' && window.__mxBody) {
    const bl = window.__mxBody.coachLines({ sessions: result.weeklySessions, bone: result.bone }, result.bodyFit);
    if (bl.length) lines.push('', ...bl);
  }
  return lines.join('\n');
}
