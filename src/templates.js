// Έτοιμα πρότυπα προπονητή για την αξιολόγηση: κάθε προπόνηση 18–22 σκληρά σετ.
// perWeek: πόσες φορές την εβδομάδα σχεδιάστηκε. Αποθηκεύονται ως κανονικά προγράμματα του χρήστη.
import { T } from './lang.js';

const I = (ex, sets = 3) => ({ ex, sets });

export const TEMPLATES = [
  { id: 'push', pack: 'ppl', name: T('Push', 'Ώθηση (Push)'), perWeek: 2, items: [I('bench_press', 4), I('incline_bench', 3), I('db_shoulder_press', 3), I('lateral_raise', 4), I('cable_pushdown', 3), I('overhead_triceps', 3)] },
  { id: 'pull', pack: 'ppl', name: T('Pull', 'Έλξη (Pull)'), perWeek: 2, items: [I('pull_up', 3), I('barbell_row', 3), I('lat_pulldown', 3), I('face_pull', 3), I('rear_delt_fly', 2), I('incline_curl', 3), I('hammer_curl', 2)] },
  { id: 'legs', pack: 'ppl', name: T('Legs', 'Πόδια (Legs)'), perWeek: 2, items: [I('squat', 4), I('rdl', 3), I('leg_press', 3), I('lying_leg_curl', 3), I('leg_extension', 2), I('calf_raise', 4), I('hanging_leg_raise', 3)] },
  { id: 'upper', pack: 'ul', name: T('Upper body', 'Άνω σώμα (Upper)'), perWeek: 2, items: [I('bench_press', 3), I('barbell_row', 3), I('incline_bench', 2), I('lat_pulldown', 3), I('lateral_raise', 3), I('rear_delt_fly', 2), I('skull_crusher', 2), I('db_curl', 2)] },
  { id: 'lower', pack: 'ul', name: T('Lower body', 'Κάτω σώμα (Lower)'), perWeek: 2, items: [I('squat', 3), I('rdl', 3), I('bulgarian_split_squat', 2), I('seated_leg_curl', 3), I('hip_abduction', 2), I('calf_raise', 3), I('hanging_leg_raise', 2)] },
  { id: 'fullA', pack: 'fb', name: T('Full body A', 'Όλο το σώμα Α'), perWeek: 1, items: [I('squat', 3), I('bench_press', 3), I('db_row', 3), I('rdl', 2), I('lateral_raise', 3), I('db_curl', 2), I('cable_pushdown', 2), I('calf_raise', 2)] },
  { id: 'fullB', pack: 'fb', name: T('Full body B', 'Όλο το σώμα Β'), perWeek: 1, items: [I('leg_press', 3), I('db_shoulder_press', 3), I('lat_pulldown', 3), I('lying_leg_curl', 3), I('incline_bench', 2), I('face_pull', 2), I('overhead_triceps', 2), I('crunch', 2)] },
];

// Ολοκληρωμένες εβδομάδες: όλα τα πρότυπα του πακέτου μαζί
export const PACKS = [
  { id: 'ppl', name: T('Push / Pull / Legs', 'Ώθηση / Έλξη / Πόδια'), note: T('3 programs, each 2× a week (6 sessions)', '3 προγράμματα, το καθένα 2× την εβδομάδα (6 προπονήσεις)') },
  { id: 'ul', name: T('Upper / Lower', 'Άνω / Κάτω σώμα'), note: T('2 programs, each 2× a week (4 sessions)', '2 προγράμματα, το καθένα 2× την εβδομάδα (4 προπονήσεις)') },
  { id: 'fb', name: T('Full body A / B', 'Όλο το σώμα Α / Β'), note: T('2 programs, each 1× a week (2 sessions)', '2 προγράμματα, το καθένα 1× την εβδομάδα (2 προπονήσεις)') },
];
