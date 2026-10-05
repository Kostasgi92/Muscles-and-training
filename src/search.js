// Αναζήτηση ασκήσεων και μυών: ελληνικά με ή χωρίς τόνους, αγγλικά, greeklish
// και μικρά ορθογραφικά λάθη.

const GR = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'ks', ο: 'o',
  π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'i', φ: 'f', χ: 'h', ψ: 'ps', ω: 'o',
};
const STOP = new Set(['me', 'se', 'sto', 'stin', 'ston', 'sta', 'tou', 'tis', 'ton', 'ta', 'to', 'tin', 'i', 'o', 'oi', 'gia', 'kai', 'apo',
  'the', 'with', 'on', 'a', 'an', 'of', 'for', 'and', 'in', 'at', 'to', 'na', 'pos', 'ena', 'mia', 'askisi', 'askisis', 'exercise']);

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[^a-z0-9Ͱ-Ͽ]+/g, ' ')
    .trim();
}

// Φωνητική μορφή με λατινικούς χαρακτήρες, ώστε «καθίσματα» = «kathismata» = «kathismata»
export function canon(s) {
  let t = '';
  for (const c of norm(s)) t += GR[c] ?? c;
  return t
    .replace(/ou/g, 'u').replace(/oo/g, 'u').replace(/ee/g, 'i')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'h').replace(/ck/g, 'k')
    .replace(/[bw]/g, 'v').replace(/[yj]/g, 'i').replace(/[cq]/g, 'k').replace(/x/g, 'ks')
    .replace(/ai/g, 'e').replace(/ei|oi/g, 'i')
    .replace(/(.)\1+/g, '$1');
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function tokenSim(a, b) {
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  if (min >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.86 + 0.1 * (min / Math.max(a.length, b.length));
  // κοινή ρίζα (π.χ. «δικεφαλα» / «δικεφαλων»)
  let k = 0;
  while (k < min && a[k] === b[k]) k++;
  if (k >= 5) return 0.84;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

const tokens = (c) => c.split(' ').filter((t) => t && !STOP.has(t));

function scoreAlias(q, qt, a) {
  if (!a) return 0;
  if (q === a) return 1;
  if (q.length >= 3 && a.startsWith(q)) return 0.9 - 0.15 * (1 - q.length / a.length);
  if (a.length >= 5 && ` ${q} `.includes(` ${a} `)) return 0.8 + 0.1 * (a.length / q.length);
  const at = tokens(a);
  if (!qt.length || !at.length) return 0;
  let sum = 0;
  for (const x of qt) {
    let best = 0;
    for (const y of at) best = Math.max(best, tokenSim(x, y));
    if (best >= 0.74) sum += best;
  }
  return 0.88 * (sum / Math.max(qt.length, at.length));
}

export class SearchIndex {
  constructor() { this.items = []; }

  add(item) {
    // item: {type: 'exercise'|'muscle', id, title, sub, aliases: string[], ref}
    const seen = new Set();
    item.keys = [];
    for (const a of item.aliases) {
      const c = canon(a);
      if (c && !seen.has(c)) { seen.add(c); item.keys.push(c); }
    }
    this.items = this.items.filter((x) => !(x.type === item.type && x.id === item.id));
    this.items.push(item);
  }

  search(query, limit = 8) {
    const q = canon(query);
    if (!q) return [];
    const qt = tokens(q);
    const out = [];
    for (const it of this.items) {
      let s = 0;
      for (const k of it.keys) s = Math.max(s, scoreAlias(q, qt, k));
      if (s > 0.3) out.push({ ...it, score: s + (it.type === 'exercise' ? 0.001 : 0) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}

export const CONFIDENT = 0.62;
