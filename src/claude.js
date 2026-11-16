// Σύνδεση με το Claude (δυνατότητα "sample" του artifact) για ασκήσεις που δεν υπάρχουν
// στη βάση και για επιπλέον ιδέες ασκήσεων ανά μυ. Αν δεν είναι διαθέσιμο, η εφαρμογή
// λειτουργεί κανονικά μόνο με την τοπική βάση.
import { MUSCLES } from './data/muscles.js';
import { EXERCISES } from './data/exercises.js';
import { __G, T } from './lang.js';

let samplePromise = null;
export function getSample() {
  if (!samplePromise) {
    samplePromise = (window.claude && typeof window.claude.use === 'function'
      ? window.claude.use('sample')
      : Promise.resolve(null)).catch(() => null);
  }
  return samplePromise;
}

export const ERROR_TEXT = {
  not_granted: __G('Η χρήση του Claude δεν επιτράπηκε για αυτή τη σελίδα.'),
  sampling_disabled: __G('Το Claude δεν είναι διαθέσιμο σε αυτόν τον λογαριασμό.'),
  rate_limited: __G('Πολλά αιτήματα σε λίγο χρόνο. Δοκίμασε ξανά σε λίγο.'),
  session_expired: __G('Η σύνδεση έληξε. Συνδέσου ξανά στο claude.ai και δοκίμασε πάλι.'),
  refused: __G('Το Claude δεν απάντησε σε αυτό το αίτημα. Δοκίμασε άλλη διατύπωση.'),
  invalid_json: __G('Η απάντηση δεν είχε τη σωστή μορφή. Πάτα ξανά «Ανάλυση».'),
  empty_completion: __G('Δεν ήρθε απάντηση. Δοκίμασε πιο απλή περιγραφή.'),
  upstream_error: __G('Η σύνδεση διακόπηκε. Δοκίμασε ξανά.'),
};
export const HIDE_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

function catalog() {
  return Object.entries(MUSCLES).map(([id, m]) => {
    const parts = m.parts ? ` ${__G('[τμήματα:')} ${Object.entries(m.parts).map(([k, v]) => `${id}.${k}=${v}`).join('; ')}]` : '';
    return `${id} = ${m.el} (${m.common})${parts}`;
  }).join('\n');
}

const VALID = () => {
  const set = new Set();
  for (const [id, m] of Object.entries(MUSCLES)) {
    set.add(id);
    for (const k of Object.keys(m.parts ?? {})) set.add(`${id}.${k}`);
  }
  return set;
};

function cleanIds(list, valid) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw).trim();
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
const strList = (a, n) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);
// οι ασκήσεις της βάσης, για να διαλέξει το Claude την πιο παρόμοια κίνηση (το μοντέλο τη δείχνει)
const motionList = () => EXERCISES.map((e) => `${e.id}=${e.en}`).join('; ');
const MOTION_IDS = new Set(EXERCISES.map((e) => e.id));

export function normalizeExercise(o, fallbackName) {
  const valid = VALID();
  const p = cleanIds(o.primary, valid);
  const s = cleanIds(o.secondary, valid).filter((x) => !p.includes(x));
  if (!p.length) return null;
  const el = String(o.name_el || fallbackName || '').trim().slice(0, 80);
  return {
    id: `ai-${el.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
    el,
    en: String(o.name_en || '').trim().slice(0, 80),
    eq: String(o.equipment || '').trim().slice(0, 60),
    aka: strList(o.aliases, 8),
    p, s,
    steps: strList(o.steps, 7),
    tips: strList(o.tips, 4),
    errs: strList(o.mistakes, 4),
    ...(MOTION_IDS.has(String(o.motion || '').trim()) ? { like: String(o.motion).trim() } : {}),
    ai: true,
  };
}

const RULES = `${__G('Είσαι έμπειρος προπονητής δύναμης με γνώσεις ανατομίας. Απαντάς στα ελληνικά.')}
${__G('Χρησιμοποίησε ΜΟΝΟ αυτά τα αναγνωριστικά μυών (ολόκληρη ομάδα, π.χ.')} "quads"${__G(', ή συγκεκριμένο τμήμα, π.χ.')} "deltoid.side"):
${'{CATALOG}'}`;

export async function analyzeExercise(text, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const prompt = `${RULES.replace('{CATALOG}', catalog())}

${__G('Ο χρήστης έγραψε την άσκηση: «')}${text.slice(0, 200)}»

${__G('Αν δεν είναι σωματική άσκηση, απάντησε {')}"recognized": false}.
${__G('Αλλιώς απάντησε ΜΟΝΟ με ένα αντικείμενο JSON:')}
{"recognized": true, "name_el": "${__G('ελληνικό όνομα')}", "name_en": "English name", "equipment": "${__G('εξοπλισμός')}", "aliases": ["${__G('άλλες ονομασίες')}"],
 "primary": ["${__G('1-4 ids κύριων μυών')}"], "secondary": ["${__G('0-6 ids βοηθητικών μυών')}"],
 "steps": ["${__G('3-6 σύντομα βήματα εκτέλεσης')}"], "tips": ["${__G('1-3 συμβουλές')}"], "mistakes": ["${__G('1-3 συχνά λάθη')}"],
 "motion": "${T('id of the most similar exercise from this list (same body position and movement): ', 'id της πιο παρόμοιας άσκησης από αυτή τη λίστα (ίδια θέση σώματος και κίνηση): ')}${motionList()}"}`;
  const res = await sample.json(prompt, { signal, onText, modelTier: 'quick', cache: { gcTime: 24 * 3600 * 1000 } });
  if (!res || res.recognized === false) return { recognized: false };
  const ex = normalizeExercise(res, text);
  if (!ex) throw { code: 'invalid_json' };
  return { recognized: true, exercise: ex };
}

export async function moreExercises(unitId, existingNames, { signal } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const m = MUSCLES[unitId];
  const prompt = `${RULES.replace('{CATALOG}', catalog())}

${__G('Πρότεινε 3 ασκήσεις που δουλεύουν ως ΚΥΡΙΟ μυ τον «')}${m.el}» (id: ${unitId}${__G(') και δεν είναι ήδη σε αυτή τη λίστα:')} ${existingNames.slice(0, 30).join(', ') || '—'}.
${__G('Απάντησε ΜΟΝΟ με έναν πίνακα JSON 3 αντικειμένων, το καθένα:')}
{"name_el": "...", "name_en": "...", "equipment": "...", "primary": [ids], "secondary": [ids], "steps": ["${__G('3-5 βήματα')}"], "tips": ["1-2"], "mistakes": ["1-2"], "motion": "${T('id of the most similar exercise: ', 'id της πιο παρόμοιας άσκησης: ')}${motionList()}"}`;
  const res = await sample.json(prompt, { signal, modelTier: 'quick', cache: { gcTime: 24 * 3600 * 1000 } });
  const arr = Array.isArray(res) ? res : Array.isArray(res?.exercises) ? res.exercises : [];
  return arr.map((o) => normalizeExercise(o)).filter(Boolean).slice(0, 4);
}

// Γνώμη προπονητή για όλο το πρόγραμμα, με βάση την ανάλυση της εφαρμογής (ροή κειμένου)
// again: «Ζήτα νέα γνώμη» — χωρίς την αποθηκευμένη απάντηση των 5 λεπτών
// goal: ο κύριος στόχος του χρήστη (addons/body.js goalType): {type: 'bulk'|'cut'|'maintain', sets, freq}
export async function coachReview(summary, { signal, onText, again = false, goal = null } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const type = goal?.type === 'cut' || goal?.type === 'maintain' ? goal.type : 'bulk';
  const k = goal?.sets ?? 1;
  const n = Math.round(10 * k), small = Math.max(3, Math.round(6 * k));
  const twice = (goal?.freq ?? 2) >= 2;
  const count = T('The primary muscle of an exercise counts 1 set, a secondary muscle ½.', 'Κύριος μυς άσκησης = 1 σετ, βοηθητικός = ½.');
  const [role, rules, tip] = type === 'cut' ? [
    T('You are an experienced personal trainer who specialises in losing fat without losing muscle. The user\'s primary goal is fat loss.', 'Είσαι έμπειρος personal trainer με εξειδίκευση στην απώλεια λίπους χωρίς απώλεια μυών. Ο κύριος στόχος του χρήστη είναι η απώλεια λίπους.'),
    T('Rules of the review: keep the volume of a growth plan, because in diet studies lifters who kept 10 or more weekly sets per muscle lost little or no lean mass (at least 10 hard sets per muscle group per week, optimal 10–20; small assisting muscles at least 6), each muscle trained twice a week, 3 or more sessions a week, at most about 10 sets per muscle in one session, loads that are held rather than raised, push/pull and quads/hamstrings balance. Do not suggest fewer sets or lighter weights because of the diet.', 'Κανόνες της αξιολόγησης: ο όγκος μένει όπως σε πρόγραμμα ανάπτυξης, γιατί στις μελέτες με δίαιτα όσοι κράτησαν 10 ή περισσότερα εβδομαδιαία σετ ανά μυ έχασαν ελάχιστη ή καθόλου άλιπη μάζα (≥10 σκληρά σετ την εβδομάδα ανά μυϊκή ομάδα, βέλτιστο 10–20, μικροί βοηθητικοί μύες ≥6), κάθε μυς 2 φορές την εβδομάδα, 3 ή περισσότερες προπονήσεις την εβδομάδα, έως ~10 σετ ανά μυ σε μία προπόνηση, φορτία που κρατιούνται (όχι απαραίτητα αύξηση), ισορροπία ώθησης/έλξης και τετρακέφαλων/οπίσθιων. Μην προτείνεις λιγότερα σετ ή ελαφρύτερα κιλά λόγω δίαιτας.'),
    T('One tip on holding the loads or on eating for fat loss (weight down 0.5–1% a week, protein about 2–2.4 g per kg).', 'Μία συμβουλή για τη διατήρηση των φορτίων ή για τη διατροφή στην απώλεια λίπους (βάρος −0,5–1% την εβδομάδα, πρωτεΐνη περίπου 2–2,4 g ανά κιλό).'),
  ] : type === 'maintain' ? [
    T('You are an experienced personal trainer. The user\'s primary goal is maintenance: keeping the muscle and strength they have with no more training than that needs.', 'Είσαι έμπειρος personal trainer. Ο κύριος στόχος του χρήστη είναι η διατήρηση: να κρατήσει τους μύες και τη δύναμη που έχει, χωρίς περισσότερη προπόνηση από όση χρειάζεται.'),
    T(`Rules of the review: about ${n} hard sets per muscle group per week are enough (small assisting muscles about ${small}), ${twice ? 'each muscle trained twice a week' : 'training each muscle once a week is enough'}, as long as the loads are held; at most about 10 sets per muscle in one session; push/pull and quads/hamstrings balance. Do not push for more volume than maintenance needs.`, `Κανόνες της αξιολόγησης: περίπου ${n} σκληρά σετ την εβδομάδα ανά μυϊκή ομάδα αρκούν (μικροί βοηθητικοί μύες περίπου ${small}), ${twice ? 'κάθε μυς 2 φορές την εβδομάδα' : 'αρκεί κάθε μυς 1 φορά την εβδομάδα'}, εφόσον τα φορτία κρατιούνται· έως ~10 σετ ανά μυ σε μία προπόνηση· ισορροπία ώθησης/έλξης και τετρακέφαλων/οπίσθιων. Μην ζητάς περισσότερο όγκο από όσο χρειάζεται η διατήρηση.`),
    T('One tip on holding the loads or on staying consistent.', 'Μία συμβουλή για τη διατήρηση των φορτίων ή για τη συνέπεια.'),
  ] : [
    T('You are an experienced personal trainer who specialises in muscle growth (hypertrophy). The user\'s primary goal is muscle gain.', 'Είσαι έμπειρος personal trainer με εξειδίκευση στη μυϊκή ανάπτυξη (υπερτροφία). Ο κύριος στόχος του χρήστη είναι η μυϊκή ανάπτυξη.'),
    T('Rules of the review: at least 10 hard sets per muscle group per week (optimal 10–20; small assisting muscles at least 6), each muscle trained twice a week, at most about 10 sets per muscle in one session, loads that go up over time, push/pull and quads/hamstrings balance.', 'Κανόνες της αξιολόγησης: ≥10 σκληρά σετ την εβδομάδα ανά μυϊκή ομάδα (βέλτιστο 10–20, μικροί βοηθητικοί μύες ≥6), κάθε μυς 2 φορές την εβδομάδα, έως ~10 σετ ανά μυ σε μία προπόνηση, φορτία που ανεβαίνουν με τον καιρό, ισορροπία ώθησης/έλξης και τετρακέφαλων/οπίσθιων.'),
    T('One tip on progressive overload or effort.', 'Μία συμβουλή για προοδευτική επιβάρυνση ή ένταση.'),
  ];
  const prompt = T(`${role}
${rules} ${count}

The analysis of the user's program:
${summary.slice(0, 12000)}

Judge the program for the primary goal stated in the analysis, and tailor every piece of advice to that goal. If the analysis includes body data and targets (age, weight, body fat, muscle, bone, measurements, target weight), judge it for this person too and mention them where relevant (for example calories or protein, recovery with age). Consider bone health as well: heavy lifts for the legs, hips and back 2–3 times a week protect bone, weight loss takes a little bone, and a home scale's bone figure is only an estimate. Base every statement on well-established research (position stands, meta-analyses, clinical trials); if the evidence for something is weak, say so or leave it out. No medical diagnoses.

Write in English, briefly (at most 170 words), as plain text without tables or bold:
- One sentence with your overall assessment for this goal.
- The 3 most important changes (fewer if the program already fits the goal), each with a specific exercise, number of sets and which session it goes in.
- ${tip}
Put each point on its own line starting with "- ".`,
  `${role}
${rules} ${count}

Η ανάλυση του προγράμματος του χρήστη:
${summary.slice(0, 12000)}

Κρίνε το πρόγραμμα για τον κύριο στόχο που αναφέρει η ανάλυση και προσάρμοσε κάθε συμβουλή σε αυτόν τον στόχο. Αν η ανάλυση περιλαμβάνει στοιχεία σώματος και αριθμητικούς στόχους (ηλικία, βάρος, λίπος, μύες, οστά, περιφέρειες, βάρος-στόχος), κρίνε το και για αυτό το άτομο και ανέφερέ τα όπου έχει σημασία (π.χ. θερμίδες ή πρωτεΐνη, αποκατάσταση ανάλογα με την ηλικία). Λάβε υπόψη και την υγεία των οστών: οι βαριές ασκήσεις για πόδια, ισχίο και πλάτη 2–3 φορές την εβδομάδα προστατεύουν τα οστά, η απώλεια βάρους παίρνει λίγο οστό, και το νούμερο οστών μιας οικιακής ζυγαριάς είναι μόνο εκτίμηση. Στήριξε κάθε πρόταση σε καλά τεκμηριωμένη έρευνα (θέσεις φορέων, μετα-αναλύσεις, κλινικές μελέτες)· αν τα δεδομένα για κάτι είναι αδύναμα, πες το ή παράλειψέ το. Όχι ιατρικές διαγνώσεις.

Γράψε στα ελληνικά, σύντομα (έως 170 λέξεις), σε απλό κείμενο χωρίς πίνακες και χωρίς έντονα γράμματα:
- Μία πρόταση με τη συνολική εκτίμηση για αυτόν τον στόχο.
- Τις 3 πιο σημαντικές αλλαγές (λιγότερες αν το πρόγραμμα ήδη ταιριάζει στον στόχο), η καθεμία με συγκεκριμένη άσκηση, σετ και σε ποια προπόνηση να μπει.
- ${tip}
Κάθε σημείο σε ξεχωριστή γραμμή που ξεκινά με «- ».`);
  const { text } = await sample(prompt, { signal, onText, modelTier: 'default', ...(again ? { cache: false } : {}) });
  return text;
}
