// Αναπαραγωγή της κίνησης μιας άσκησης πάνω στο 3D μοντέλο: χρονολόγιο → στάση σώματος → όργανα,
// κάμερα που χωράει όλη την κίνηση, σκιά στο έδαφος και «λάμψη» των κύριων μυών όσο δουλεύουν.
import * as THREE from 'three';
import { Timeline } from './timeline.js';
import { PropSet } from './props.js';

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Player {
  constructor(viewer, body) {
    this.viewer = viewer;
    this.body = body;
    this.props = new PropSet(viewer.scene);
    this.def = null;
    this.tl = null;
    this.t = 0;
    this.clock = 0;
    this.speed = 1;
    this.playing = false;
    this.step = -1;
    this.listeners = new Set();
    this.blend = null;
    this.lastNow = 0;
    this.gain = 1;
    this.box = new THREE.Box3();
    this.shadow = { x: 0, z: 0, sx: 0.75, sz: 0.42, o: 0.55 };
    viewer.onFrame = (now) => this.frame(now);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type, this); }

  // def: ορισμός κίνησης (library.js)
  load(def, { autoplay = true, frame = true } = {}) {
    const wasPosed = this.viewer.posed && this.def;
    const from = wasPosed ? this.snapshot() : null;
    this.def = def;
    this.tl = new Timeline(def);
    this.env = {};
    // ορισμένες θέσεις λύνονται με το σώμα (π.χ. ύψος λεκάνης ώστε τα χέρια να φτάνουν τη μπάρα)
    def.prepare?.(this.body, this.tl.keys, this.env);
    this.props.clear();
    def.setup?.(this.props, this.env, this.body);
    this.t = 0;
    this.clock = 0;
    this.step = -1;
    this.fol = null;
    this.playing = autoplay && !reduceMotion();
    this.apply();
    // ομαλή μετάβαση από την προηγούμενη στάση (όταν δεν αλλάζει ριζικά η θέση του σώματος)
    const to = this.snapshot();
    const fromS = from || this.restSnapshot();
    if (fromS.rq.angleTo(to.rq) < 0.9 && !reduceMotion()) this.blend = { from: fromS, t0: performance.now(), dur: 650 };
    else this.blend = null;
    if (frame) this.frameCamera();
    this.emit('load');
    this.emit('step');
  }

  stop() {
    this.playing = false;
    this.def = null;
    this.tl = null;
    this.props.clear();
    this.viewer.restPose();
    this.setGain(1);
    this.resetShadow();
    this.emit('stop');
  }

  play() { if (!this.def) return; this.playing = true; this.lastNow = 0; this.emit('play'); }
  pause() { this.playing = false; this.emit('play'); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  setSpeed(s) { this.speed = s; this.emit('speed'); }
  seek(t) { if (!this.tl) return; this.t = Math.max(0, Math.min(this.tl.total - 1e-3, t)); this.apply(); }
  // ξεκινά από το στοιχείο του χρονολογίου που αντιστοιχεί στο βήμα step
  seekStep(step) {
    if (!this.tl) return;
    const e = this.tl.seq.find((x) => x.step === step && x.i >= (step >= this.tl.seq[this.tl.loop]?.step ? this.tl.loop : 0)) || this.tl.seq.find((x) => x.step === step);
    if (e) this.seek(e.t0 + 1e-3);
  }

  frame(now) {
    if (!this.def) return;
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (this.playing) {
      this.t += dt * this.speed;
      this.clock += dt * this.speed;
      if (this.t >= this.tl.total) this.t = this.tl.loopT + ((this.t - this.tl.total) % Math.max(0.1, this.tl.total - this.tl.loopT));
      this.apply();
      this.emit('time');
    } else if (this.blend) this.apply();
  }

  apply() {
    const { body: B, tl, def } = this;
    const s = tl.sample(this.t);
    this.sample = s;
    B.reset();
    def.pose(B, s.k, { t: this.clock, tt: this.t, e: s.e, u: s.u, env: this.env });
    B.solve();
    if (this.blend) {
      const k = Math.min(1, (performance.now() - this.blend.t0) / this.blend.dur);
      const e = k * k * (3 - 2 * k);
      this.mix(this.blend.from, e);
      if (k >= 1) this.blend = null;
    }
    def.update?.(this.props, B, s.k, this.env);
    if (def.follow) this.followCamera();
    B.rig.writeDQ();
    this.viewer.showPose(B.rig);
    this.setGain(0.72 + 0.4 * s.act);
    this.updateShadow();
    if (s.step !== this.step) { this.step = s.step; this.emit('step'); }
  }

  // κάμερα που ακολουθεί το σώμα όταν η άσκηση μετακινείται (βάδισμα): στο άλμα της επανάληψης
  // μετακινείται μαζί του, ώστε να μη φαίνεται
  followCamera() {
    const r = this.body.rig.rootPos;
    const des = new THREE.Vector3(r.x, 0, r.z);
    if (!this.fol) { this.fol = { des: des.clone(), fo: des.clone(), prev: des.clone() }; return; }
    const F = this.fol;
    const jump = des.clone().sub(F.des);
    if (jump.length() > 0.35) F.fo.add(jump);
    F.des.copy(des);
    F.fo.lerp(des, 0.07);
    if (this.viewer.anim) return;
    const d = F.fo.clone().sub(F.prev);
    this.viewer.camera.position.add(d);
    this.viewer.controls.target.add(d);
    F.prev.copy(F.fo);
    this.viewer.dirty = true;
  }

  snapshot() {
    const r = this.body.rig;
    return { rp: r.rootPos.clone(), rq: r.rootQuat.clone(), l: r.local.map((q) => q.clone()) };
  }
  restSnapshot() {
    const r = this.body.rig;
    return { rp: r.bones[0].pivot.clone(), rq: new THREE.Quaternion(), l: r.local.map(() => new THREE.Quaternion()) };
  }
  // ανάμειξη της τρέχουσας στάσης με την προηγούμενη (e = 0 → προηγούμενη, 1 → τρέχουσα)
  mix(from, e) {
    const r = this.body.rig;
    r.rootPos.lerpVectors(from.rp, r.rootPos.clone(), e);
    r.rootQuat.copy(from.rq.clone().slerp(r.rootQuat, e));
    r.local.forEach((q, i) => q.copy(from.l[i].clone().slerp(q, e)));
    r.solve();
  }

  setGain(g) {
    if (Math.abs(g - this.gain) < 1e-3) return;
    this.gain = g;
    this.viewer.setHiGain?.(g);
  }

  // σκιά κάτω από το σώμα: ακολουθεί το αποτύπωμα και σβήνει όταν το σώμα είναι ψηλά
  updateShadow() {
    const b = this.body.bounds(this.box);
    const sh = this.shadow;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    const lift = Math.max(0, b.min.y - 0.03);
    // στο άλμα της επανάληψης (βάδισμα) η σκιά πάει αμέσως στη νέα θέση αντί να γλιστρά
    const k = Math.hypot(cx - sh.x, cz - sh.z) > 0.4 ? 1 : 0.25;
    sh.x += (cx - sh.x) * k; sh.z += (cz - sh.z) * k;
    sh.sx += (Math.max(0.5, (w + 0.6) / 1.5) - sh.sx) * k;
    sh.sz += (Math.max(0.35, (d + 0.45) / 1.5) - sh.sz) * k;
    sh.o += (0.55 * Math.max(0.3, 1 - lift / 1.3) - sh.o) * k;
    const g = this.viewer.ground;
    g.position.set(sh.x, 0.002, sh.z);
    g.scale.set(sh.sx, sh.sz, 1);
    g.material.opacity = sh.o;
  }
  resetShadow() {
    const g = this.viewer.ground;
    g.position.set(0, 0.002, 0);
    g.scale.set(0.75, 0.42, 1);
    g.material.opacity = 0.55;
    Object.assign(this.shadow, { x: 0, z: 0, sx: 0.75, sz: 0.42, o: 0.55 });
  }

  // κάμερα: όλη η κίνηση (σώμα + όργανα) στο κάδρο, από τη γωνία που ορίζει η άσκηση
  frameCamera(instant = false, azOverride) {
    const { body: B, tl, def, viewer } = this;
    const box = new THREE.Box3();
    const save = this.t;
    const n = 18;
    const v = def.view || {};
    let r0 = null;
    for (let i = 0; i <= n; i++) {
      this.t = (tl.total * i) / n;
      const s = tl.sample(this.t);
      B.reset();
      def.pose(B, s.k, { t: 0, tt: this.t, e: s.e, u: s.u, env: this.env });
      B.solve();
      let b;
      if (v.focus) {
        const p = B.pivot(v.focus);
        b = new THREE.Box3(p.clone().subScalar(v.fb ?? 0.16), p.clone().addScalar(v.fb ?? 0.16));
      } else b = B.bounds(new THREE.Box3());
      if (def.follow) {
        // σε μετακίνηση: το κάδρο σχετικά με τη λεκάνη, στη θέση της αρχής
        const r = B.rig.rootPos;
        if (!r0) r0 = r.clone();
        b.translate(new THREE.Vector3(r0.x - r.x, 0, r0.z - r.z));
      }
      box.union(b);
    }
    this.t = save;
    this.fol = null;
    this.apply();
    const pb = new THREE.Box3().setFromObject(this.props.group);
    if (!pb.isEmpty() && def.frameProps !== false && !v.focus && !def.follow) {
      // τα μεγάλα όργανα (μονόζυγο, πύργοι) δεν χρειάζεται να χωρούν ολόκληρα
      pb.min.y = Math.max(pb.min.y, box.min.y - 0.25);
      pb.max.y = Math.min(pb.max.y, box.max.y + 0.25);
      box.union(pb);
    }
    const az = (azOverride ?? v.az ?? 60) * Math.PI / 180, el = (v.el ?? 10) * Math.PI / 180;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // πλάτος/ύψος του κουτιού όπως φαίνεται από την κάμερα
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new THREE.Vector3().crossVectors(dir, right).normalize().negate();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).sub(c));
    const wv = Math.max(...corners.map((p) => Math.abs(p.dot(right)))) * 2;
    const hv = Math.max(...corners.map((p) => Math.abs(p.dot(up)))) * 2;
    const cam = viewer.camera;
    const vfov = cam.fov * Math.PI / 180;
    const zoom = v.zoom ?? 1;
    const dist = Math.max(hv / 2 / Math.tan(vfov / 2), wv / 2 / (Math.tan(vfov / 2) * cam.aspect)) * 1.12 / zoom + Math.max(size.x, size.z) * 0.1;
    const target = c.clone();
    if (v.ty) target.y += v.ty;
    const pos = target.clone().addScaledVector(dir, Math.min(9, Math.max(1.2, dist)));
    viewer.controls.maxDistance = Math.max(6.5, dist * 1.6);
    if (instant || reduceMotion()) {
      viewer.controls.target.copy(target);
      cam.position.copy(pos);
      viewer.controls.update();
      viewer.dirty = true;
    } else viewer.flyTo(target, pos, 900);
  }
}
