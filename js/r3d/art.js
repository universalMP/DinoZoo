/* =====================================================================
   DinoZoo — Données graphiques partagées et petits dessins 2D.
   · Apparence de chaque espèce (proportions, couleurs, motifs) : le
     constructeur de dinosaures 3D (dino3d.js) la traduit en volumes.
   · Couleur de la lumière selon l'heure (C.light).
   · Petits dessins sur canevas pour l'interface : bulles d'humeur des
     visiteurs. Les vignettes du catalogue sont rendues en 3D (main.js).
   ===================================================================== */
window.DZ = window.DZ || {};
DZ.R = DZ.R || {};
(function () {
  const U = DZ.util, C = DZ.CONFIG, R = DZ.R, TAU = U.TAU;

  R.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  };
  /* Dessin haute résolution, origine (ox, oy) en coordonnées du dessin. */
  R.sprite = function (w, h, ox, oy, draw, scale) {
    const S = scale || 2;
    const c = R.canvas(w * S, h * S), g = c.getContext('2d');
    g.scale(S, S); g.translate(ox, oy);
    draw(g);
    return { c, w, h, ox, oy };
  };

  /* Couleur d'éclairage interpolée selon l'heure. */
  DZ.lightAt = function (hour) {
    const L = C.light;
    let a = L[0], b = L[L.length - 1];
    for (let i = 0; i < L.length - 1; i++) if (hour >= L[i].h && hour <= L[i + 1].h) { a = L[i]; b = L[i + 1]; break; }
    const t = b.h === a.h ? 0 : U.clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const s = U.smooth(t);
    return { mul: U.mixRgb(U.rgb(a.mul), U.rgb(b.mul), s), add: U.mixRgb(U.rgb(a.add), U.rgb(b.add), s), a: U.lerp(a.a, b.a, s) };
  };

  /* Bulles d'humeur des visiteurs. */
  let moods = null;
  R.moodSprite = function (m) {
    if (!moods) {
      moods = {};
      const icons = { content: '🙂', ravi: '🤩', affamé: '🍔', pressé: '🚻', mécontent: '😠', peur: '😱' };
      for (const k in icons) {
        moods[k] = R.sprite(16, 18, 8, 17, (g) => {
          g.fillStyle = 'rgba(255,253,245,0.94)'; g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 0.5;
          g.beginPath(); g.ellipse(0, -9.5, 6.6, 6, 0, 0, TAU); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(-1.6, -4); g.lineTo(0, -1); g.lineTo(1.6, -4); g.fill();
          g.font = '8px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(icons[k], 0, -9.2);
        }, 4);
      }
    }
    return moods[m] || moods.content;
  };

  /* ------------------------------------------------------------------
     Apparence des espèces (formes, couleurs, attributs)
     ------------------------------------------------------------------ */
  const SK = (base, belly, top, pattern, pcol, extra) => Object.assign({ base, belly, top, pattern, pcol, eye: '#d4a02a' }, extra || {});

  const ART = {
    compsognathus: { plan: 'thero', L: 7.5, H: 4.6, leg: 10, neck: [6, 2.6, 1.8], neckAng: -0.85, head: ['thero', 6.5, 3.6, { teeth: 6, eye: 0.13 }], headRel: 0.8, tail: [13, 2.4], tailAng: 0.05, arm: 3.5,
      skin: SK('#7d8248', '#cdc48e', '#4f5a2e', 'stripes', '#3a4222', { scale: 0.9 }) },
    dryosaurus: { plan: 'thero', L: 10.5, H: 6.6, leg: 14, neck: [7, 4, 2.8], neckAng: -0.95, head: ['beak', 7.5, 4.6], headRel: 0.95, tail: [17, 3.6], tailAng: 0.05, arm: 4,
      skin: SK('#8a7a52', '#d4c89c', '#5f5236', 'spots', '#4a3e26', { scale: 1 }) },
    psittacosaurus: { plan: 'thero', L: 11, H: 7.6, leg: 11, neck: [4.5, 5, 4], neckAng: -0.7, head: ['parrot', 7, 6], headRel: 0.75, tail: [13, 4], tailAng: 0.1, arm: 5,
      skin: SK('#9a7a4c', '#dcc8a0', '#6a5030', 'mottle', '#5a3e22', { scale: 1 }) },
    pachycephalosaurus: { plan: 'thero', L: 16, H: 11.5, leg: 18, neck: [6, 7, 5.5], neckAng: -0.75, head: ['beak', 10, 8], headRel: 0.85, dome: true, tail: [21, 6], tailAng: 0.05, arm: 6,
      skin: SK('#8a6c54', '#cfbb9c', '#5e4636', 'bands', '#4a3426', { scale: 1.3, accent: '#b8a280' }) },
    parasaurolophus: { plan: 'thero', L: 24, H: 19, leg: 26, neck: [13, 9, 6.5], neckAng: -0.95, head: ['beak', 13, 8], headRel: 1.0, crestTube: true, tail: [30, 9], tailAng: 0.05, arm: 10, herbivoreArm: true,
      skin: SK('#6f7d58', '#d2caa2', '#4a5638', 'stripes', '#3a442a', { scale: 1.6, accent: '#a8643a' }) },
    triceratops: { plan: 'quad', L: 38, H: 27, legB: 21, neck: [7, 15, 13], neckAng: 0.05, head: ['beak', 26, 17, { eye: 0.08 }], headRel: 0.12, trike: true, tail: [26, 12], tailAng: 0.02, hump: 0.1,
      skin: SK('#8d6e4c', '#c8b28c', '#5e4a34', 'mottle', '#4a3826', { scale: 2, wrinkles: true, accent: '#9a5434', acc2: '#dcb880' }) },
    stegosaurus: { plan: 'quad', L: 42, H: 26, legB: 25, legFrontShort: true, neck: [11, 9, 6], neckAng: 0.45, head: ['beak', 11, 6.5], headRel: 0.1, plates: true, tail: [36, 12], tailAng: -0.12, hump: 0.55, tilt: 0.18,
      skin: SK('#7f7850', '#cac092', '#59553a', 'bands', '#454228', { scale: 1.8, accent: '#8a5a3c', acc2: '#b08a5a' }) },
    ankylosaurus: { plan: 'quad', L: 38, H: 18, legB: 12, neck: [6, 12, 10], neckAng: 0.15, head: ['beak', 12, 9], headRel: 0.05, armor: true, tail: [28, 9], tailAng: -0.02, club: true, hump: 0.15,
      skin: SK('#7a6c58', '#bcac8c', '#534838', 'none', null, { scale: 1.6, accent: '#9a8a6c' }) },
    diplodocus: { plan: 'quad', L: 42, H: 26, legB: 30, neck: [17, 16, 7], neckSegs: 3, neckAng: -0.3, head: ['sauro', 10, 5.5, 0], headRel: 0.6, tail: [24, 13], tailSegs: 4, tailAng: -0.08, whip: true, hump: 0.2,
      skin: SK('#8a8470', '#d0c8ac', '#5f5a4a', 'stripes', '#4c473a', { scale: 2, wrinkles: true, palpha: 0.3 }) },
    brachiosaurus: { plan: 'quad', L: 46, H: 30, legB: 40, neck: [21, 19, 9], neckSegs: 3, neckAng: -1.1, head: ['sauro', 12, 7, 0.45], headRel: 1.25, tail: [16, 11], tailSegs: 3, tailAng: 0.1, hump: 0, tilt: -0.24,
      skin: SK('#7f8a7a', '#cbcdb8', '#56604f', 'mottle', '#3e4638', { scale: 2, wrinkles: true }) },
    velociraptor: { plan: 'thero', L: 11, H: 7.4, leg: 15, neck: [8, 4.5, 3], neckAng: -1.0, head: ['thero', 10, 5, { teeth: 8, eye: 0.12 }], headRel: 1.0, tail: [18, 3.4], tailAng: -0.05, arm: 7, feathers: true, sickle: true,
      skin: SK('#9a7a4a', '#d8c69c', '#5d4526', 'stripes', '#3e2c18', { scale: 0.9, accent: '#6a4a2a', acc2: '#5e4a34' }) },
    dilophosaurus: { plan: 'thero', L: 18, H: 12, leg: 23, neck: [12, 6.5, 4.5], neckAng: -0.9, head: ['thero', 16, 8, { teeth: 9 }], headRel: 0.9, crests: true, tail: [28, 6], tailAng: 0, arm: 8,
      skin: SK('#7d8a4a', '#d4cc94', '#4d5a2c', 'spots', '#3a4222', { scale: 1.3, accent: '#b8502a', acc2: '#e0b050' }) },
    allosaurus: { plan: 'thero', L: 27, H: 22, leg: 31, neck: [13, 12, 9], neckAng: -0.75, head: ['thero', 22, 12, { teeth: 11 }], headRel: 0.75, alloHorns: true, tail: [38, 11], tailAng: 0, arm: 10,
      skin: SK('#8a5f45', '#d2b28c', '#5c3c2a', 'stripes', '#3e2618', { scale: 1.6, accent: '#8a3a26' }) },
    carnotaurus: { plan: 'thero', L: 25, H: 20, leg: 31, neck: [11, 11, 8.5], neckAng: -0.75, head: ['thero', 16, 12, { teeth: 9 }], headRel: 0.78, carnoHorns: true, tail: [34, 10], tailAng: 0, arm: 4, bumps: true,
      skin: SK('#8e4f3e', '#ccA686', '#5e2e24', 'mottle', '#4a2018', { scale: 1.6, accent: '#3a2a22' }) },
    spinosaurus: { plan: 'thero', L: 34, H: 24, leg: 27, neck: [16, 12, 9], neckAng: -0.65, head: ['croc', 32, 10], headRel: 0.75, sail: true, tail: [46, 12], tailAng: 0.02, paddle: true, arm: 12,
      skin: SK('#6e6a52', '#cac0a2', '#4a4636', 'mottle', '#3a3628', { scale: 1.8, accent: '#8e5a40', acc2: '#c8a070' }) },
    trex: { plan: 'thero', L: 36, H: 31, leg: 40, neck: [14, 18, 15], neckAng: -0.7, head: ['trex', 32, 17], headRel: 0.72, tail: [42, 15], tailAng: 0.02, arm: 7, tiny: true,
      skin: SK('#6a5a44', '#c2b090', '#44382a', 'mottle', '#30261a', { scale: 2.2, wrinkles: true, eye: '#c88a1a' }) },
    pteranodon: { plan: 'ptero', span: 34, body: 12, head: 15, crest: 12,
      skin: SK('#a6845c', '#e0d0b0', '#6e5638', 'none', null, { membrane: '#8a5a40', accent: '#c0602a' }) },
    quetzalcoatlus: { plan: 'ptero', span: 54, body: 18, head: 26, crest: 8, neck: 12,
      skin: SK('#9a6a5a', '#e2c8b0', '#664036', 'none', null, { membrane: '#7a4a3a', accent: '#b8402a', beak: '#d8c070' }) },
    plesiosaurus: { plan: 'plesio', body: 26, bw: 15, neck: 30, head: 7,
      skin: SK('#4f6f72', '#c8d4c8', '#2e4a50', 'spots', '#24383c', { scale: 1.6 }) },
    mosasaurus: { plan: 'mosa', len: 110, w: 16, head: 26,
      skin: SK('#3f5a64', '#d2dad2', '#24363e', 'stripes', '#1c2a30', { scale: 1.8, palpha: 0.35 }) }
  };
  DZ.DINO_ART = ART;
})();
