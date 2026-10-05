// Αντιστοίχιση των δομών του Z-Anatomy (μέσω @authorod/svitylo-3d-anatomy-data)
// στις ομάδες μυών της εφαρμογής.
//
// Κάθε "part" γίνεται ένα mesh (αριστερή + δεξιά πλευρά μαζί).
//   unit   : ο μυς / η μυϊκή ομάδα που επιλέγεται με κλικ (κλειδί στο src/data/muscles.js)
//   part   : το ανατομικό τμήμα (κεφαλή, μοίρα) μέσα στην ομάδα
//   depth  : στρώση. 0 = επιφανειακός, 1 = μεσαίος, 2 = εν τω βάθει.
//            Στο επίπεδο αποκάλυψης L εμφανίζονται τα τμήματα με depth >= L.
//   s      : ονόματα δομών χωρίς το επίθημα _l/_r (το script τα βρίσκει και για τις δύο πλευρές)
//   tendon : όλο το τμήμα αποδίδεται ως τένοντας/απονεύρωση

const M = (unit, part, depth, s, extra = {}) => ({ kind: 'muscle', unit, part, depth, s, ...extra });

export const MUSCLE_PARTS = [
  // Θώρακας
  M('chest', 'clav', 0, ['clavicular_head_of_pectoralis_major_muscle']),
  M('chest', 'stern', 0, ['sternocostal_head_of_pectoralis_major_muscle']),
  M('chest', 'abd', 0, ['abdominal_part_of_pectoralis_major_muscle']),
  M('pec_minor', 'pm', 1, ['pectoralis_minor_muscle']),
  M('pec_minor', 'subcl', 1, ['subclavius_muscle']),
  M('serratus', 'sa', 1, ['serratus_anterior_muscle']),
  M('intercostals', 'ext', 2, ['external_intercostal_muscles']),
  M('intercostals', 'int', 2, ['internal_intercostal_muscles']),

  // Ώμος
  M('deltoid', 'front', 0, ['clavicular_part_of_deltoid_muscle']),
  M('deltoid', 'side', 0, ['acromial_part_of_deltoid_muscle']),
  M('deltoid', 'rear', 0, ['scapular_spinal_part_of_deltoid_muscle']),
  M('rotator_cuff', 'supra', 1, ['supraspinatus_muscle']),
  M('rotator_cuff', 'infra', 1, ['infraspinatus_muscle']),
  M('rotator_cuff', 'tminor', 1, ['teres_minor_muscle']),
  M('rotator_cuff', 'subscap', 2, ['subscapularis_muscle']),
  M('teres_major', 'tm', 1, ['teres_major_muscle']),

  // Πλάτη
  M('trapezius', 'upper', 0, ['descending_part_of_trapezius_muscle']),
  M('trapezius', 'middle', 0, ['transverse_part_of_trapezius_muscle']),
  M('trapezius', 'lower', 0, ['ascending_part_of_trapezius_muscle']),
  M('lats', 'ld', 0, ['latissimus_dorsi_muscle']),
  M('rhomboids', 'major', 1, ['rhomboid_major_muscle']),
  M('rhomboids', 'minor', 1, ['rhomboid_minor_muscle']),
  M('levator_scap', 'ls', 1, ['levator_scapulae']),
  M('erectors', 'ilio', 1, ['iliocostalis_lumborum_muscle', 'iliocostalis_thoracis_muscle', 'iliocostalis_colli_muscle']),
  M('erectors', 'long', 1, ['longissimus_thoracis_muscle', 'longissimus_colli_muscle', 'longissimus_capitis_muscle']),
  M('erectors', 'spin', 1, ['spinalis_thoracis_muscle', 'spinalis_colli_muscle', 'spinalis_capitis_muscle']),
  M('multifidus', 'mf', 2, ['multifidus_lumborum_muscle', 'multifidus_thoracis_muscle', 'multifidus_colli_muscle']),
  M('multifidus', 'semi', 2, ['semispinalis_thoracis_muscle', 'semispinalis_colli_muscle']),
  M('multifidus', 'rot', 2, ['rotatores']),
  M('quadratus_lumb', 'ql', 2, ['quadratus_lumborum_muscle']),

  // Αυχένας
  M('scm', 'scm', 0, ['sternocleidomastoid_muscle']),
  M('splenius', 'cap', 1, ['splenius_capitis_muscle']),
  M('splenius', 'col', 1, ['splenius_colli_muscle']),
  M('scalenes', 'ant', 1, ['scalenus_anterior_muscle']),
  M('scalenes', 'med', 1, ['scalenus_medius_muscle']),
  M('scalenes', 'post', 1, ['scalenus_posterior_muscle']),
  M('hyoid', 'infra', 1, ['omohyoid_muscle', 'sternohyoid_muscle', 'sternothyroid_muscle', 'thyrohyoid_muscle']),
  M('hyoid', 'supra', 1, ['anterior_belly_of_digastric_muscle', 'posterior_belly_of_digastric_muscle', 'intermediate_tendon_of_digastric_muscle', 'mylohyoid_muscle', 'stylohyoid_muscle', 'geniohyoid_muscle']),

  // Κεφαλή
  M('jaw', 'masseter', 0, ['superficial_part_of_masseter', 'deep_part_of_masseter']),
  M('jaw', 'temporalis', 0, ['temporalis_muscle']),
  M('face', 'frontalis', 0, ['frontalis_muscle']),
  M('face', 'occipitalis', 0, ['occipitalis_muscle']),
  M('face', 'temporopar', 0, ['temporoparietalis_muscle']),
  M('face', 'galea', 0, ['epicranial_aponeurosis'], { tendon: true }),
  M('face', 'orb_oculi', 0, ['orbital_part_of_orbicularis_oculi', 'palpebral_part_of_orbicularis_oculi']),
  M('face', 'corrugator', 0, ['corrugator_supercilii']),
  M('face', 'procerus', 0, ['procerus_muscle']),
  M('face', 'nasalis', 0, ['nasalis_muscle', 'depressor_septi_nasi']),
  M('face', 'lev_lab_nasi', 0, ['levator_nasolabialis']),
  M('face', 'lev_lab', 0, ['levator_labii_superioris']),
  M('face', 'zyg_minor', 0, ['zygomaticus_minor_muscle']),
  M('face', 'zyg_major', 0, ['zygomaticus_major_muscle']),
  M('face', 'lev_ang', 0, ['levator_anguli_oris']),
  M('face', 'risorius', 0, ['risorius_muscle']),
  M('face', 'buccinator', 0, ['bucinator']),
  M('face', 'orb_oris', 0, ['orbicularis_oris_muscle']),
  M('face', 'dep_ang', 0, ['depressor_anguli_oris']),
  M('face', 'dep_lab', 0, ['depressor_labii_inferioris']),
  M('face', 'mentalis', 0, ['mentalis_muscle']),

  // Βραχίονας
  M('biceps', 'long', 0, ['long_head_of_biceps_brachii']),
  M('biceps', 'short', 0, ['short_head_of_biceps_brachii']),
  M('brachialis', 'br', 1, ['brachialis_muscle']),
  M('coracobrachialis', 'cb', 1, ['coracobrachialis_muscle']),
  M('triceps', 'long', 0, ['long_head_of_triceps_brachii']),
  M('triceps', 'lat', 0, ['lateral_head_of_triceps_brachii']),
  M('triceps', 'med', 1, ['medial_head_of_triceps_brachii']),

  // Αντιβράχιο
  M('brachioradialis', 'br', 0, ['brachioradialis_muscle']),
  M('forearm_flex', 'fcr', 0, ['flexor_carpi_radialis']),
  M('forearm_flex', 'pl', 0, ['palmaris_longus_muscle']),
  M('forearm_flex', 'fcu', 0, ['humeral_head_of_flexor_carpi_ulnaris', 'ulnar_head_of_flexor_carpi_ulnaris']),
  M('forearm_flex', 'pt', 0, ['superficial_head_of_pronator_teres', 'deep_head_of_pronator_teres']),
  M('forearm_flex', 'fds', 1, ['humero_ulnar_head_of_flexor_digitorum_superficialis', 'radial_head_of_flexor_digitorum_superficialis']),
  M('forearm_flex', 'fdp', 2, ['flexor_digitorum_profundus']),
  M('forearm_flex', 'fpl', 2, ['flexor_pollicis_longus']),
  M('forearm_flex', 'pq', 2, ['pronator_quadratus']),
  M('forearm_ext', 'ecrl', 0, ['extensor_carpi_radialis_longus']),
  M('forearm_ext', 'ecrb', 0, ['extensor_carpi_radialis_brevis']),
  M('forearm_ext', 'ed', 0, ['extensor_digitorum']),
  M('forearm_ext', 'edm', 0, ['extensor_digiti_minimi']),
  M('forearm_ext', 'ecu', 0, ['humeral_head_of_extensor_carpi_ulnaris', 'ulnar_head_of_extensor_carpi_ulnaris']),
  M('forearm_ext', 'anc', 0, ['anconeus_muscle']),
  M('forearm_ext', 'apl', 1, ['abductor_pollicis_longus']),
  M('forearm_ext', 'epb', 1, ['extensor_pollicis_brevis']),
  M('forearm_ext', 'epl', 1, ['extensor_pollicis_longus']),
  M('forearm_ext', 'ei', 2, ['extensor_indicis']),
  M('forearm_ext', 'sup', 2, ['supinator']),
  M('hand', 'thenar', 1, ['abductor_pollicis_brevis', 'superficial_head_of_flexor_pollicis_brevis', 'deep_head_of_flexor_pollicis_brevis', 'opponens_pollicis_muscle', 'oblique_head_of_adductor_pollicis', 'transverse_head_of_adductor_pollicis']),
  M('hand', 'hypothenar', 1, ['abductor_digiti_minimi_of_hand', 'flexor_digiti_minimi_of_hand', 'opponens_digiti_minimi_muscle_of_hand']),
  M('hand', 'inter', 1, ['dorsal_interossei_muscles_of_hand', 'palmar_interossei_muscles', 'lumbrical_muscles_of_hand']),

  // Κοιλιακό τοίχωμα
  M('rectus_abd', 'ra', 0, ['rectus_abdominis_muscle']),
  M('rectus_abd', 'pyr', 0, ['pyramidalis_muscle']),
  M('ext_oblique', 'eo', 0, ['external_abdominal_oblique_muscle']),
  M('int_oblique', 'io', 1, ['internal_abdominal_oblique_muscle']),
  M('transversus', 'ta', 2, ['transversus_abdominis_muscle']),

  // Ισχίο και γλουτοί
  M('iliopsoas', 'psoas', 2, ['psoas_major']),
  M('iliopsoas', 'iliacus', 2, ['iliacus_muscle']),
  M('glute_max', 'gm', 0, ['gluteus_maximus_muscle']),
  M('glute_med', 'gm', 1, ['gluteus_medius_muscle']),
  M('glute_min', 'gm', 2, ['gluteus_minimus_muscle']),
  M('tfl', 'tfl', 0, ['tensor_fasciae_latae']),
  M('tfl', 'it', 0, ['iliotibial_tract'], { tendon: true }),
  M('hip_rotators', 'pir', 1, ['piriformis_muscle']),
  M('hip_rotators', 'gem', 1, ['superior_gemellus_muscle', 'inferior_gemellus_muscle']),
  M('hip_rotators', 'oi', 1, ['obturator_internus']),
  M('hip_rotators', 'oe', 2, ['obturator_externus']),
  M('hip_rotators', 'qf', 1, ['quadratus_femoris_muscle']),

  // Μηρός
  M('quads', 'rf', 0, ['rectus_femoris_muscle']),
  M('quads', 'vl', 0, ['vastus_lateralis_muscle']),
  M('quads', 'vm', 0, ['vastus_medialis_muscle']),
  M('quads', 'vi', 1, ['vastus_intermedius_muscle']),
  M('sartorius', 's', 0, ['sartorius_muscle']),
  M('adductors', 'longus', 0, ['adductor_longus']),
  M('adductors', 'magnus', 0, ['adductor_magnus', 'adductor_minimus']),
  M('adductors', 'grac', 0, ['gracilis_muscle']),
  M('adductors', 'pect', 0, ['pectineus_muscle']),
  M('adductors', 'brevis', 1, ['adductor_brevis']),
  M('hamstrings', 'bfl', 0, ['long_head_of_biceps_femoris']),
  M('hamstrings', 'st', 0, ['semitendinosus_muscle']),
  M('hamstrings', 'sm', 0, ['semimembranosus_muscle']),
  M('hamstrings', 'bfs', 1, ['short_head_of_biceps_femoris']),

  // Κνήμη
  M('calves', 'gm', 0, ['medial_head_of_gastrocnemius']),
  M('calves', 'gl', 0, ['lateral_head_of_gastrocnemius']),
  M('calves', 'achilles', 0, ['calcaneal_tendon'], { tendon: true }),
  M('calves', 'sol', 1, ['soleus_muscle']),
  M('calves', 'plant', 1, ['plantaris_muscle']),
  M('tib_ant', 'ta', 0, ['tibialis_anterior_muscle']),
  M('tib_ant', 'edl', 0, ['extensor_digitorum_longus', 'tendon_of_extensor_digitorum_longus']),
  M('tib_ant', 'ehl', 1, ['extensor_hallucis_longus']),
  M('tib_ant', 'ft', 1, ['fibularis_tertius_muscle']),
  M('fibularis', 'fl', 0, ['fibularis_longus_muscle']),
  M('fibularis', 'fb', 1, ['fibularis_brevis_muscle']),
  M('deep_calf', 'tp', 2, ['tibialis_posterior_muscle']),
  M('deep_calf', 'fdl', 2, ['flexor_digitorum_longus']),
  M('deep_calf', 'fhl', 2, ['flexor_hallucis_longus']),
  M('deep_calf', 'pop', 2, ['popliteus_muscle']),
  M('foot', 'dorsal', 1, ['extensor_digitorum_brevis', 'extensor_hallucis_brevis']),
  M('foot', 'plantar', 1, ['abductor_hallucis', 'flexor_digitorum_brevis', 'abductor_digiti_minimi_of_foot', 'quadratus_plantae_muscle', 'flexor_digiti_minimi_of_foot', 'lateral_head_of_flexor_hallucis_brevis', 'medial_head_of_flexor_hallucis_brevis', 'oblique_head_of_adductor_hallucis', 'transverse_head_of_adductor_hallucis', 'lumbrical_muscles_of_foot', 'opponens_digiti_minimi_muscle_of_foot']),
  M('foot', 'inter', 1, ['dorsal_interossei_muscles_of_foot', 'plantar_interossei_muscles']),
];

// Συνδετικός ιστός που δεν επιλέγεται, αλλά δίνει ρεαλισμό (λευκές απονευρώσεις, καθεκτικοί σύνδεσμοι)
export const CONNECTIVE = [
  { id: 'linea_alba', name: 'Λευκή γραμμή', depth: 0, s: ['linea_alba'] },
  { id: 'inguinal', name: 'Βουβωνικός σύνδεσμος', depth: 0, s: ['inguinal_ligament'] },
  { id: 'tlf', name: 'Θωρακοοσφυϊκή περιτονία', depth: 0, s: ['posterior_layer_of_thoracolumbar_fascia'] },
  { id: 'patellar_ret', name: 'Καθεκτικοί σύνδεσμοι επιγονατίδας', depth: 0, s: ['lateral_patellar_retinaculum', 'medial_patellar_retinaculum'] },
  { id: 'wrist_ret', name: 'Καθεκτικοί σύνδεσμοι καρπού', depth: 0, s: ['extensor_retinaculum_of_wrist', 'flexor_retinaculum_of_wrist'] },
  { id: 'ankle_ret', name: 'Καθεκτικοί σύνδεσμοι ποδοκνημικής', depth: 0, s: ['superior_extensor_retinaculum_of_ankle', 'inferior_extensor_retinaculum_of_ankle', 'flexor_retinaculum_of_ankle', 'superior_fibular_retinaculum', 'inferior_fibular_retinaculum'] },
  { id: 'palmar_apo', name: 'Παλαμιαία απονεύρωση', depth: 0, s: ['palmar_aponeurosis'] },
  { id: 'plantar_apo', name: 'Πελματιαία απονεύρωση', depth: 0, s: ['plantar_aponeurosis'] },
];

// Οστά, ομαδοποιημένα σε λίγα mesh. Τα ονόματα εμφανίζονται στο hover.
const range = (pre, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${pre}${a + i}`);
const handBones = [
  'scaphoid_bone', 'lunate_bone', 'triquetrum_bone', 'pisiform_bone', 'trapezium_bone', 'trapezoid_bone', 'capitate_bone', 'hamate_bone',
  ...['first', 'second', 'third', 'fourth', 'fifth'].map((n) => `${n}_metacarpal_bone`),
  ...['first', 'second', 'third', 'fourth', 'fifth'].flatMap((n) => [`proximal_phalanx_of_${n}_finger_of_hand`, `distal_phalanx_of_${n}_finger_of_hand`]),
  ...['second', 'third', 'fourth', 'fifth'].map((n) => `middle_phalanx_of_${n}_finger_of_hand`),
];
const footBones = [
  'calcaneus', 'talus', 'navicular_bone', 'cuboid_bone', 'medial_cuneiform_bone', 'intermediate_cuneiform_bone', 'lateral_cuneiform_bone', 'sesamoid_bones_of_foot',
  ...['first', 'second', 'third', 'fourth', 'fifth'].map((n) => `${n}_metatarsal_bone`),
  ...['first', 'second', 'third', 'fourth', 'fifth'].flatMap((n) => [`proximal_phalanx_of_${n}_finger_of_foot`, `distal_phalanx_of_${n}_finger_of_foot`]),
  ...['second', 'third', 'fourth', 'fifth'].map((n) => `middle_phalanx_of_${n}_finger_of_foot`),
];
const ribs = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];

export const BONES = [
  { id: 'skull', name: 'Κρανίο', s: ['frontal_bone', 'parietal_bone', 'occipital_bone', 'temporal_bone', 'sphenoid_bone', 'ethmoid_bone', 'zygomatic_bone', 'maxilla', 'nasal_bone', 'lacrimal_bone', 'palatine_bone', 'vomer', 'inferior_nasal_concha_bone'] },
  { id: 'mandible', name: 'Κάτω γνάθος', s: ['mandible'] },
  { id: 'teeth', name: 'Δόντια', tissue: 'tooth', s: ['upper_medial_incisor', 'upper_lateral_incisor', 'upper_canine', 'upper_first_premolar', 'upper_second_premolar', 'upper_first_molar_tooth', 'upper_second_molar_tooth', 'lower_medial_incisor', 'lower_lateral_incisor', 'lower_canine', 'lower_first_premolar', 'lower_second_premolar', 'lower_first_molar_tooth', 'lower_second_molar_tooth'] },
  { id: 'nose_cart', name: 'Χόνδροι της μύτης', tissue: 'cartilage', s: ['major_alar_cartilage', 'lateral_process_of_nasal_septal_cartilage', 'nasal_septal_cartilage'] },
  { id: 'larynx', name: 'Θυρεοειδής & κρικοειδής χόνδρος', tissue: 'cartilage', s: ['thyroid_cartilage', 'cricoid_cartilage', 'hyoid_bone'] },
  { id: 'cervical', name: 'Αυχενικοί σπόνδυλοι', s: ['atlas_c1', 'axis_c2', ...range('vertebra_c', 3, 7)] },
  { id: 'thoracic', name: 'Θωρακικοί σπόνδυλοι', s: range('vertebra_t', 1, 12) },
  { id: 'lumbar', name: 'Οσφυϊκοί σπόνδυλοι', s: range('vertebra_l', 1, 5) },
  { id: 'sacrum', name: 'Ιερό οστό & κόκκυγας', s: ['sacrum', 'coccyx'] },
  { id: 'ribs', name: 'Πλευρές', s: ribs.map((r) => `${r}_rib`) },
  { id: 'costal_cart', name: 'Πλευρικοί χόνδροι', tissue: 'cartilage', s: ribs.slice(0, 10).map((r) => `costal_cartilage_of_${r}_rib`) },
  { id: 'sternum', name: 'Στέρνο', s: ['manubrium_of_sternum', 'body_of_sternum', 'xiphoid_process'] },
  { id: 'clavicle', name: 'Κλείδα', s: ['clavicle'] },
  { id: 'scapula', name: 'Ωμοπλάτη', s: ['scapula'] },
  { id: 'humerus', name: 'Βραχιόνιο οστό', s: ['humerus'] },
  { id: 'radius', name: 'Κερκίδα', s: ['radius'] },
  { id: 'ulna', name: 'Ωλένη', s: ['ulna'] },
  { id: 'hand_bones', name: 'Οστά άκρας χειρός', s: handBones },
  { id: 'pelvis', name: 'Ανώνυμο οστό (λεκάνη)', s: ['hip_bone'] },
  { id: 'femur', name: 'Μηριαίο οστό', s: ['femur'] },
  { id: 'patella', name: 'Επιγονατίδα', s: ['patella'] },
  { id: 'tibia', name: 'Κνήμη', s: ['tibia'] },
  { id: 'fibula', name: 'Περόνη', s: ['fibula'] },
  { id: 'foot_bones', name: 'Οστά άκρου ποδός', s: footBones },
];

export const EYES = [
  { id: 'sclera', name: 'Βολβός του ματιού', tissue: 'sclera', s: ['sclera'] },
  { id: 'iris', name: 'Ίριδα', tissue: 'iris', s: ['iris'] },
];
