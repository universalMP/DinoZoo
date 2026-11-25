/* =====================================================================
   DinoZoo — Langue du jeu (français ou anglais).
   Le texte source est le français : DZ.L('Texte {0}', x) renvoie la
   traduction anglaise de js/lang-en.js quand le jeu est en anglais,
   sinon le texte français, avec {0}, {1}… remplacés par les arguments.
   La langue est choisie à la première partie, puis dans le menu ;
   en changer recharge la page.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  let lang = null;
  try { const s = JSON.parse(localStorage.getItem('dinozoo.settings.v1') || 'null'); lang = s && s.lang; } catch (e) { /* ignoré */ }
  // langue proposée avant le premier choix : celle du navigateur
  DZ.langChosen = lang === 'fr' || lang === 'en';
  DZ.lang = DZ.langChosen ? lang : (/^fr\b/i.test(navigator.language || 'fr') ? 'fr' : 'en');
  DZ.EN = DZ.EN || {};
  DZ.missing = new Set(); // textes sans traduction anglaise (contrôle : console, DZ.missing)
  const fill = (t, a) => (a.length ? t.replace(/\{(\d+)\}/g, (m, i) => (a[i] === undefined ? m : a[i])) : t);
  DZ.L = function (s, ...a) {
    const t = DZ.lang === 'en' ? DZ.EN[s] : null;
    if (DZ.lang === 'en' && t == null && DZ.missing) DZ.missing.add(s);
    return fill(t == null ? s : t, a);
  };
  /* Texte au masculin, au féminin ou neutre selon le genre ('h', 'f', 'a'). */
  DZ.Lg = function (gender, h, f, a, ...args) { return DZ.L(gender === 'f' ? f : gender === 'a' ? (a || h) : h, ...args); };
  /* Traduit le texte et les infobulles d'un morceau de page écrit en français (index.html). */
  DZ.translateDom = function (root) {
    if (DZ.lang !== 'en') return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) { const k = n.nodeValue.trim(); if (k && DZ.EN[k] != null) n.nodeValue = n.nodeValue.replace(k, DZ.EN[k]); }
    root.querySelectorAll('[data-tip],[title],[placeholder],[aria-label]').forEach((el) => {
      for (const at of ['data-tip', 'title', 'placeholder', 'aria-label']) { const v = el.getAttribute(at); if (v && DZ.EN[v] != null) el.setAttribute(at, DZ.EN[v]); }
    });
  };
  DZ.setLang = function (l) {
    try { const s = JSON.parse(localStorage.getItem('dinozoo.settings.v1') || '{}') || {}; s.lang = l; localStorage.setItem('dinozoo.settings.v1', JSON.stringify(s)); } catch (e) { /* ignoré */ }
  };
  if (DZ.lang === 'en') document.documentElement.lang = 'en';
})();
