// Εφαρμόζει τη γλώσσα στα δεδομένα (ονόματα μυών/ασκήσεων, οδηγίες), πριν χτιστεί οτιδήποτε άλλο.
// Το window.__mxApply το ορίζει το addons/i18n.js· στα ελληνικά δεν αλλάζει τίποτα.
import { MUSCLES, DEPTH_LABEL } from './muscles.js';
import { EXERCISES } from './exercises.js';

if (typeof window !== 'undefined' && window.__mxApply) window.__mxApply(MUSCLES, EXERCISES, DEPTH_LABEL);
