// Σύνδεση με το Claude (δυνατότητα "sample" του artifact) για ασκήσεις που δεν υπάρχουν
// στη βάση και για επιπλέον ιδέες ασκήσεων ανά μυ. Αν δεν είναι διαθέσιμο, η εφαρμογή
// λειτουργεί κανονικά μόνο με την τοπική βάση.
import { MUSCLES } from './data/muscles.js';

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
  not_granted: 'Η χρήση του Claude δεν επιτράπηκε για αυτή τη σελίδα.',
  sampling_disabled: 'Το Claude δεν είναι διαθέσιμο σε αυτόν τον λογαριασμό.',
  rate_limited: 'Πολλά αιτήματα σε λίγο χρόνο. Δοκίμασε ξανά σε λίγο.',
  session_expired: 'Η σύνδεση έληξε. Συνδέσου ξανά στο claude.ai και δοκίμασε πάλι.',
  refused: 'Το Claude δεν απάντησε σε αυτό το αίτημα. Δοκίμασε άλλη διατύπωση.',
  invalid_json: 'Η απάντηση δεν είχε τη σωστή μορφή. Πάτα ξανά «Ανάλυση».',
  empty_completion: 'Δεν ήρθε απάντηση. Δοκίμασε πιο απλή περιγραφή.',
  upstream_error: 'Η σύνδεση διακόπηκε. Δοκίμασε ξανά.',
};
export const HIDE_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

function catalog() {
  return Object.entries(MUSCLES).map(([id, m]) => {
    const parts = m.parts ? ` [τμήματα: ${Object.entries(m.parts).map(([k, v]) => `${id}.${k}=${v}`).join('; ')}]` : '';
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

const RULES = `Είσαι έμπειρος προπονητής δύναμης με γνώσεις ανατομίας. Απαντάς στα ελληνικά.
Χρησιμοποίησε ΜΟΝΟ αυτά τα αναγνωριστικά μυών (ολόκληρη ομάδα, π.χ. "quads", ή συγκεκριμένο τμήμα, π.χ. "deltoid.side"):
${'{CATALOG}'}`;

export async function analyzeExercise(text, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const prompt = `${RULES.replace('{CATALOG}', catalog())}

Ο χρήστης έγραψε την άσκηση: «${text.slice(0, 200)}»

Αν δεν είναι σωματική άσκηση, απάντησε {"recognized": false}.
Αλλιώς απάντησε ΜΟΝΟ με ένα αντικείμενο JSON:
{"recognized": true, "name_el": "ελληνικό όνομα", "name_en": "English name", "equipment": "εξοπλισμός", "aliases": ["άλλες ονομασίες"],
 "primary": ["1-4 ids κύριων μυών"], "secondary": ["0-6 ids βοηθητικών μυών"],
 "steps": ["3-6 σύντομα βήματα εκτέλεσης"], "tips": ["1-3 συμβουλές"], "mistakes": ["1-3 συχνά λάθη"]}`;
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

Πρότεινε 3 ασκήσεις που δουλεύουν ως ΚΥΡΙΟ μυ τον «${m.el}» (id: ${unitId}) και δεν είναι ήδη σε αυτή τη λίστα: ${existingNames.slice(0, 30).join(', ') || '—'}.
Απάντησε ΜΟΝΟ με έναν πίνακα JSON 3 αντικειμένων, το καθένα:
{"name_el": "...", "name_en": "...", "equipment": "...", "primary": [ids], "secondary": [ids], "steps": ["3-5 βήματα"], "tips": ["1-2"], "mistakes": ["1-2"]}`;
  const res = await sample.json(prompt, { signal, modelTier: 'quick', cache: { gcTime: 24 * 3600 * 1000 } });
  const arr = Array.isArray(res) ? res : Array.isArray(res?.exercises) ? res.exercises : [];
  return arr.map((o) => normalizeExercise(o)).filter(Boolean).slice(0, 4);
}
