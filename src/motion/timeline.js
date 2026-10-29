// Χρονολόγιο μιας άσκησης: βασικές θέσεις (keys) και η σειρά τους (seq), δεμένη με τα βήματα της
// περιγραφής. Κάθε στοιχείο [key, διάρκεια, βήμα, {hold, via, ease, lag, act}] είναι η μετάβαση από την
// προηγούμενη θέση σε αυτή τη θέση· «via» = περνά από τη θέση χωρίς να σταματήσει (μία ομαλή κίνηση
// ως την επόμενη στάση). Από το loop και μετά τα στοιχεία επαναλαμβάνονται· το στοιχείο πριν από το
// loop έχει την ίδια θέση με το τελευταίο, ώστε η επανάληψη να είναι συνεχής.

const smooth = (u) => u * u * u * (10 + u * (6 * u - 15));            // ελάχιστο τράνταγμα (minimum jerk)
const EASE = {
  smooth,
  lin: (u) => u,
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  in: (u) => u * u * u * (4 - 3 * u),                                     // αργή εκκίνηση, γρήγορο τέλος
  out: (u) => 1 - (1 - u) ** 3 * (1 + 3 * u),                            // γρήγορη εκκίνηση (εκρηκτικό), ήπιο τέλος
};

function lerpVal(a, b, u) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerpVal(v, b[i] ?? v, u));
  return u < 0.5 ? a : b;
}
// Catmull–Rom ανάμεσα στο p1 και p2 (p0, p3 οι γειτονικές θέσεις)
function crVal(p0, p1, p2, p3, u) {
  if (typeof p1 === 'number' && typeof p2 === 'number') {
    const a = typeof p0 === 'number' ? p0 : p1, d = typeof p3 === 'number' ? p3 : p2;
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (-a + p2) * u + (2 * a - 5 * p1 + 4 * p2 - d) * u2 + (-a + 3 * p1 - 3 * p2 + d) * u3);
  }
  if (Array.isArray(p1) && Array.isArray(p2)) return p1.map((v, i) => crVal(Array.isArray(p0) ? p0[i] : v, v, p2[i] ?? v, Array.isArray(p3) ? p3[i] : p2[i] ?? v, u));
  return u < 0.5 ? p1 : p2;
}

export const ACT = { rest: 0.35, setup: 0.5, ecc: 0.82, con: 1, iso: 0.92, hold: 0.92 };

export class Timeline {
  constructor(def) {
    const base = def.base || {};
    this.keys = {};
    for (const [n, k] of Object.entries(def.keys)) this.keys[n] = { ...base, ...k };
    const seq = def.seq.map(([key, dur, step, o = {}]) => ({ key, dur, step, hold: o.hold || 0, via: !!o.via, ease: o.ease || 'smooth', lag: o.lag || null, act: o.act }));
    if (!this.keys[seq[0].key]) throw new Error('key ' + seq[0].key);
    this.loop = def.loop ?? 1;
    // ομάδες: διαδοχικά στοιχεία «via» μαζί με το επόμενο στοιχείο-στάση
    let t = 0;
    seq.forEach((e, i) => {
      if (!this.keys[e.key]) throw new Error('key ' + e.key);
      e.i = i;
      e.t0 = t;
      e.prev = i === 0 ? e.key : seq[i - 1].key;
      t += e.dur + e.hold;
      e.t1 = t;
    });
    this.seq = seq;
    this.total = t;
    this.loopT = seq[Math.min(this.loop, seq.length - 1)].t0;
    // τμήματα με via: η κίνηση από τη στάση πριν έως την επόμενη στάση
    for (let i = 0; i < seq.length; i++) {
      if (!seq[i].via) continue;
      let j = i;
      while (j < seq.length - 1 && seq[j].via) j++;
      const run = seq.slice(i, j + 1);
      const T0 = run[0].t0, T1 = run[run.length - 1].t0 + run[run.length - 1].dur;
      const pts = [run[0].prev, ...run.map((e) => e.key)];
      run.forEach((e, k) => { e.run = { T0, T1, pts, k, frac: [] }; });
      let acc = 0;
      const tot = run.reduce((s, e) => s + e.dur, 0);
      const fr = [0];
      for (const e of run) { acc += e.dur; fr.push(acc / tot); }
      run.forEach((e) => { e.run.frac = fr; e.run.ease = run[run.length - 1].ease; });
      i = j;
    }
    this.steps = [...new Set(seq.map((e) => e.step))];
  }

  // στοιχείο στον χρόνο t (0 … total)
  entryAt(t) {
    const s = this.seq;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].t0) return s[i];
    return s[0];
  }

  sample(t) {
    t = Math.max(0, Math.min(this.total - 1e-6, t));
    const e = this.entryAt(t);
    let k;
    let u;
    if (e.run) {
      const r = e.run;
      const g = (EASE[r.ease] || smooth)(Math.min(1, Math.max(0, (t - r.T0) / (r.T1 - r.T0))));
      // σε ποιο κομμάτι της διαδρομής βρισκόμαστε
      let j = 0;
      while (j < r.frac.length - 2 && g > r.frac[j + 1]) j++;
      const lu = (g - r.frac[j]) / Math.max(1e-6, r.frac[j + 1] - r.frac[j]);
      const P = r.pts.map((n) => this.keys[n]);
      const p0 = P[Math.max(0, j - 1)], p1 = P[j], p2 = P[j + 1], p3 = P[Math.min(P.length - 1, j + 2)];
      k = {};
      for (const n of new Set([...Object.keys(p1), ...Object.keys(p2)])) k[n] = crVal(p0[n], p1[n] ?? p2[n], p2[n] ?? p1[n], p3[n], lu);
      u = Math.min(1, (t - e.t0) / Math.max(1e-6, e.dur));
    } else {
      u = e.dur > 0 ? Math.min(1, (t - e.t0) / e.dur) : 1;
      const ease = EASE[e.ease] || smooth;
      const a = this.keys[e.prev], b = this.keys[e.key];
      k = {};
      const gu = ease(u);
      for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
        let uu = gu;
        const lag = e.lag && e.lag[n];
        if (lag) uu = lag > 0 ? ease(Math.min(1, Math.max(0, (u - lag) / (1 - lag)))) : ease(Math.min(1, u / (1 + lag)));
        k[n] = lerpVal(a[n] ?? b[n], b[n] ?? a[n], uu);
      }
    }
    return { k, e, u, step: e.step, act: this.activation(e, u) };
  }

  // πόσο δουλεύουν οι μύες σε αυτό το σημείο (για τη λάμψη των κύριων μυών)
  activation(e, u) {
    const a = e.act ?? (e.i === 0 ? 'setup' : 'iso');
    const v = typeof a === 'number' ? a : ACT[a] ?? 0.85;
    return v;
  }
}
