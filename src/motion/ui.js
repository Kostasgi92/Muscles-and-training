// Η κίνηση στην καρτέλα της άσκησης: αναπαραγωγή/παύση, μπάρα χρόνου, αργή ταχύτητα, τα βήματα της
// περιγραφής που φωτίζονται μαζί με την κίνηση (και πατιούνται για να πας σε αυτά) και λεζάντα πάνω στο
// 3D μοντέλο με το τρέχον βήμα.
import { MOTIONS } from './library.js';
import { T } from '../lang.js';

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg>',
  rest: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.6" r="2.1" fill="currentColor"/><path d="M12 7.6v7.2M12 14.8l-2.6 6M12 14.8l2.6 6M12 9.4 6.6 13M12 9.4l5.4 3.6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/></svg>',
};

// ποια κίνηση δείχνει μια άσκηση: η δική της, ή (για ασκήσεις του Claude) η πιο κοντινή της βάσης
export function motionIdFor(ex, guess) {
  if (!ex) return null;
  if (MOTIONS[ex.id]) return ex.id;
  if (ex.like && MOTIONS[ex.like]) return ex.like;
  const g = guess ? guess(ex) : null;
  return g && MOTIONS[g] ? g : null;
}

// HTML της μπάρας ελέγχου (μπαίνει κάτω από τον τίτλο «Πώς γίνεται»)
export function motionBar(ex, mid, likeName) {
  return `<div class="mv" data-mid="${esc(mid)}">
    <div class="mv-bar">
      <button type="button" class="mv-btn mv-play" aria-label="${T('Pause', 'Παύση')}">${ICON.pause}</button>
      <input type="range" class="mv-range" min="0" max="1000" value="0" aria-label="${T('Position in the movement', 'Σημείο της κίνησης')}">
      <button type="button" class="mv-btn mv-slow" aria-pressed="false" title="${T('Half speed', 'Μισή ταχύτητα')}">½×</button>
      <button type="button" class="mv-btn mv-rest" title="${T('Show the body at rest (to select muscles)', 'Το σώμα σε ηρεμία (για επιλογή μυών)')}" aria-label="${T('Body at rest', 'Σώμα σε ηρεμία')}">${ICON.rest}</button>
    </div>
    <p class="mv-note">${likeName
      ? T(`The model shows the closest exercise in the database, “${esc(likeName)}”.`, `Το μοντέλο δείχνει την πιο κοντινή άσκηση της βάσης, «${esc(likeName)}».`)
      : T('The model performs the movement — tap a step to see that part.', 'Το μοντέλο εκτελεί την κίνηση — πάτα ένα βήμα για να δεις εκείνο το σημείο.')}</p>
  </div>`;
}
// τα βήματα ως κουμπιά
export function motionSteps(steps) {
  return `<ol class="steps mv-steps">${steps.map((x, i) => `<li><button type="button" class="mv-step" data-step="${i}"><span class="mv-txt">${esc(x)}</span><i class="mv-prog"></i></button></li>`).join('')}</ol>`;
}

export class MotionUI {
  constructor({ stage, ensurePlayer, onRest }) {
    this.stage = stage;
    this.ensurePlayer = ensurePlayer;
    this.onRest = onRest;
    this.player = null;
    this.cur = null;
    this.off = null;
    this.cap = document.createElement('div');
    this.cap.className = 'overlay mvcap';
    this.cap.hidden = true;
    this.cap.innerHTML = `<button type="button" class="mv-btn mv-cap-play" aria-label="${T('Pause', 'Παύση')}">${ICON.pause}</button><span class="mv-cap-n"></span><span class="mv-cap-t"></span>`;
    stage.appendChild(this.cap);
    this.cap.querySelector('.mv-cap-play').addEventListener('click', () => { this.player?.toggle(); });
  }

  active() { return !!(this.cur && this.player && this.player.def); }

  // ex: η άσκηση, mid: id κίνησης, root: η καρτέλα, step: (προαιρετικά) ξεκίνημα από αυτό το βήμα
  async attach(ex, mid, root, step = null) {
    this.detach(false);
    const def = MOTIONS[mid];
    if (!def) return;
    const box = root.querySelector('.mv');
    const token = {};
    this.cur = { ex, mid, root, box, token, steps: ex.steps || [], def };
    if (box) box.classList.add('mv-loading');
    let player;
    try { player = await this.ensurePlayer(); } catch (e) { if (box) { box.classList.add('mv-off'); } return; }
    if (!this.cur || this.cur.token !== token) return;
    this.player = player;
    if (box) box.classList.remove('mv-loading');
    // αντιστοίχιση βημάτων της κίνησης στα βήματα της άσκησης (για ασκήσεις του Claude με άλλον αριθμό)
    const n = new Set(def.seq.map((e) => e[2])).size;
    const m = this.cur.steps.length;
    this.cur.map = (i) => (m === n || !m ? i : Math.round((i / Math.max(1, n - 1)) * (m - 1)));
    this.cur.unmap = (j) => (m === n || !m ? j : Math.round((j / Math.max(1, m - 1)) * (n - 1)));
    player.load(def, { autoplay: step === null && !reduceMotion() });
    this.off = player.on((type) => this.update(type));
    if (step !== null) { player.seekStep(this.cur.unmap(step)); player.play(); }
    this.bind();
    this.cap.hidden = false;
    this.update('load');
  }

  bind() {
    const { box, root } = this.cur;
    const p = this.player;
    const o = { signal: (this.ac = new AbortController()).signal };
    if (box) {
      box.querySelector('.mv-play').addEventListener('click', () => p.toggle(), o);
      const range = box.querySelector('.mv-range');
      range.addEventListener('input', () => {
        // η τιμή διαβάζεται πριν την παύση (η παύση ενημερώνει τη μπάρα)
        const v = Number(range.value) / 1000;
        p.pause();
        p.seek(v * p.tl.total);
      }, o);
      box.querySelector('.mv-slow').addEventListener('click', (e) => {
        const on = p.speed === 1;
        p.setSpeed(on ? 0.5 : 1);
        e.currentTarget.setAttribute('aria-pressed', String(on));
      }, o);
      box.querySelector('.mv-rest').addEventListener('click', () => { this.detach(); this.onRest?.(); }, o);
    }
    root.querySelectorAll('.mv-step').forEach((b) => b.addEventListener('click', () => {
      p.seekStep(this.cur.unmap(Number(b.dataset.step)));
      p.play();
    }, o));
  }

  update(type) {
    const c = this.cur, p = this.player;
    if (!c || !p || !p.tl) return;
    const play = c.box?.querySelector('.mv-play');
    const capPlay = this.cap.querySelector('.mv-cap-play');
    if (type === 'play' || type === 'load') {
      for (const b of [play, capPlay]) {
        if (!b) continue;
        b.innerHTML = p.playing ? ICON.pause : ICON.play;
        b.setAttribute('aria-label', p.playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'));
      }
    }
    if (type === 'stop') { this.detach(false); return; }
    const s = p.sample;
    if (!s) return;
    const step = c.map(s.step);
    if (type === 'step' || type === 'load') {
      c.root.querySelectorAll('.mv-steps li').forEach((li, i) => li.classList.toggle('on', i === step));
      const txt = c.steps[step] || '';
      this.cap.querySelector('.mv-cap-n').textContent = c.steps.length ? `${step + 1}/${c.steps.length}` : '';
      this.cap.querySelector('.mv-cap-t').textContent = txt;
    }
    const range = c.box?.querySelector('.mv-range');
    if (range && document.activeElement !== range) range.value = String(Math.round((p.t / p.tl.total) * 1000));
    // πρόοδος μέσα στο βήμα
    const li = c.root.querySelector('.mv-steps li.on');
    if (li) {
      const e = s.e;
      const span = Math.max(1e-3, e.dur + e.hold);
      li.style.setProperty('--mv-p', String(Math.min(1, (p.t - e.t0) / span)));
    }
  }

  // όψη της κάμερας κατά την κίνηση (κουμπιά «Μπροστά/Πίσω/…»)
  view(name) {
    if (!this.active()) return false;
    const az = { front: 0, back: 180, left: 90, right: -90 }[name];
    this.player.frameCamera(false, az);
    return true;
  }

  detach(stopPlayer = true) {
    this.ac?.abort();
    this.ac = null;
    if (this.off) { this.off(); this.off = null; }
    const c = this.cur;
    if (stopPlayer && this.player?.def) this.player.stop();
    if (c?.root) c.root.querySelectorAll('.mv-steps li.on').forEach((li) => li.classList.remove('on'));
    this.cur = stopPlayer ? null : c;
    this.cap.hidden = true;
    // σε ηρεμία: η αναπαραγωγή και τα βήματα ξεκινούν ξανά την κίνηση
    if (stopPlayer && c?.box?.isConnected) {
      const o = { signal: (this.ac = new AbortController()).signal };
      const play = c.box.querySelector('.mv-play');
      play.innerHTML = ICON.play;
      play.setAttribute('aria-label', T('Play', 'Αναπαραγωγή'));
      play.addEventListener('click', () => this.attach(c.ex, c.mid, c.root, 0), o);
      c.root.querySelectorAll('.mv-step').forEach((b) => b.addEventListener('click', () => this.attach(c.ex, c.mid, c.root, Number(b.dataset.step)), o));
    }
  }
}
