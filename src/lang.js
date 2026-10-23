// Γλώσσα: τα κείμενα της εφαρμογής είναι γραμμένα στα ελληνικά. Το i18n.js (φορτώνεται πριν από
// το app.js) ορίζει window.__mxG για τη μετάφραση στα αγγλικά και window.__mxLang ('en' | 'el').
export const __G = typeof window !== 'undefined' && window.__mxG ? window.__mxG : (s) => s;
export const LANG = typeof window !== 'undefined' && window.__mxLang === 'en' ? 'en' : 'el';
// Για νέα κείμενα: δίνουμε απευθείας και τις δύο εκδοχές
export const T = (en, el) => (LANG === 'en' ? en : el);
