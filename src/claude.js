// Σύνδεση με το Claude (δυνατότητα "sample" του artifact) για ασκήσεις που δεν υπάρχουν
// στη βάση και για επιπλέον ιδέες ασκήσεων ανά μυ. Αν δεν είναι διαθέσιμο, η εφαρμογή
// λειτουργεί κανονικά μόνο με την τοπική βάση.
import { MUSCLES } from './data/muscles.js';
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
 "steps": ["${__G('3-6 σύντομα βήματα εκτέλεσης')}"], "tips": ["${__G('1-3 συμβουλές')}"], "mistakes": ["${__G('1-3 συχνά λάθη')}"]}`;
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
{"name_el": "...", "name_en": "...", "equipment": "...", "primary": [ids], "secondary": [ids], "steps": ["${__G('3-5 βήματα')}"], "tips": ["1-2"], "mistakes": ["1-2"]}`;
  const res = await sample.json(prompt, { signal, modelTier: 'quick', cache: { gcTime: 24 * 3600 * 1000 } });
  const arr = Array.isArray(res) ? res : Array.isArray(res?.exercises) ? res.exercises : [];
  return arr.map((o) => normalizeExercise(o)).filter(Boolean).slice(0, 4);
}

// Γνώμη προπονητή για όλο το πρόγραμμα, με βάση την ανάλυση της εφαρμογής (ροή κειμένου)
// again: «Ζήτα νέα γνώμη» — χωρίς την αποθηκευμένη απάντηση των 5 λεπτών
export async function coachReview(summary, { signal, onText, again = false } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const prompt = T(`You are an experienced personal trainer who specialises in muscle growth (hypertrophy).
Rules of the review: at least 10 hard sets per muscle group per week (optimal 10–20; small assisting muscles at least 6), each muscle trained twice a week, at most about 10 sets per muscle in one session, push/pull and quads/hamstrings balance. The primary muscle of an exercise counts 1 set, a secondary muscle ½.

The analysis of the user's program:
${summary.slice(0, 12000)}

Write in English, briefly (at most 170 words), as plain text without tables or bold:
- One sentence with your overall assessment.
- The 3 most important changes, each with a specific exercise, number of sets and which session it goes in.
- One tip on progressive overload or effort.
Put each point on its own line starting with "- ".`,
  `Είσαι έμπειρος personal trainer με εξειδίκευση στη μυϊκή ανάπτυξη (υπερτροφία).
Κανόνες της αξιολόγησης: ≥10 σκληρά σετ την εβδομάδα ανά μυϊκή ομάδα (βέλτιστο 10–20, μικροί βοηθητικοί μύες ≥6), κάθε μυς 2 φορές την εβδομάδα, έως ~10 σετ ανά μυ σε μία προπόνηση, ισορροπία ώθησης/έλξης και τετρακέφαλων/οπίσθιων. Κύριος μυς άσκησης = 1 σετ, βοηθητικός = ½.

Η ανάλυση του προγράμματος του χρήστη:
${summary.slice(0, 12000)}

Γράψε στα ελληνικά, σύντομα (έως 170 λέξεις), σε απλό κείμενο χωρίς πίνακες και χωρίς έντονα γράμματα:
- Μία πρόταση με τη συνολική εκτίμηση.
- Τις 3 πιο σημαντικές αλλαγές, η καθεμία με συγκεκριμένη άσκηση, σετ και σε ποια προπόνηση να μπει.
- Μία συμβουλή για προοδευτική επιβάρυνση ή ένταση.
Κάθε σημείο σε ξεχωριστή γραμμή που ξεκινά με «- ».`);
  const { text } = await sample(prompt, { signal, onText, modelTier: 'default', ...(again ? { cache: false } : {}) });
  return text;
}
