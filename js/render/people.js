/* =====================================================================
   DinoZoo — Rendu des visiteurs : petits personnages variés, marche
   animée (4 images en cache par variante), bulles d'humeur.
   ===================================================================== */
(function () {
  const U = DZ.util, R = DZ.R, TAU = U.TAU;
  const SKIN = ['#f1c9a5', '#e0ac85', '#c68a62', '#9a6644', '#6e4630', '#f5d5bc'];
  const SHIRT = ['#b8483a', '#3a6ea5', '#d9a83c', '#4f8a4b', '#e6e0d2', '#74508a', '#cf7438', '#2f4858', '#ad525d', '#86aac2', '#6b7a3a', '#d8c7a0'];
  const PANTS = ['#3a4250', '#5a4a3a', '#2a2a2a', '#7a6a55', '#3f5f7a', '#c4b494', '#4a5a3a'];
  const HAIR = ['#2a1a10', '#5a3a20', '#8a6a3a', '#c9a36a', '#1a1a1a', '#9a9a9a', '#6a2a18'];
  const VARIANTS = 30;
  const FRAMES = 4;
  let cache = null;

  function person(g, o, frame, moving) {
    const h = o.child ? 10.5 : 15.5 * o.tall;
    const legL = h * 0.42, torso = h * 0.33, headR = h * (o.child ? 0.14 : 0.115);
    const sw = moving ? Math.sin(frame / FRAMES * TAU) : 0;
    const hip = -legL;
    // jambes
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      const a = sw * 0.45 * s;
      g.strokeStyle = s < 0 ? U.shade(o.pants, -0.25) : o.pants;
      g.lineWidth = o.child ? 1.5 : 1.9;
      g.beginPath(); g.moveTo(s * 0.6, hip); g.lineTo(s * 0.6 + Math.sin(a) * legL, hip + Math.cos(a) * legL - 0.6); g.stroke();
      g.fillStyle = '#2a2420';
      g.beginPath(); g.ellipse(s * 0.6 + Math.sin(a) * legL + 0.7, -0.6, 1.3, 0.7, 0, 0, TAU); g.fill();
    }
    // sac à dos
    if (o.backpack) { g.fillStyle = o.bag; g.beginPath(); g.ellipse(-2.2, hip - torso * 0.55, 1.8, torso * 0.4, 0, 0, TAU); g.fill(); }
    // bras arrière
    g.strokeStyle = U.shade(o.shirt, -0.3); g.lineWidth = o.child ? 1.2 : 1.5;
    g.beginPath(); g.moveTo(0, hip - torso * 0.85); g.lineTo(-sw * 2.2, hip - torso * 0.15); g.stroke();
    // torse
    const gr = g.createLinearGradient(-3, 0, 3, 0);
    gr.addColorStop(0, U.shade(o.shirt, 0.15)); gr.addColorStop(1, U.shade(o.shirt, -0.25));
    g.fillStyle = gr;
    const tw = o.child ? 3.4 : 4.4 * o.wide;
    g.beginPath();
    g.moveTo(-tw / 2, hip + 0.5); g.lineTo(-tw / 2 - 0.3, hip - torso + 1.2);
    g.quadraticCurveTo(0, hip - torso - 0.8, tw / 2 + 0.3, hip - torso + 1.2);
    g.lineTo(tw / 2, hip + 0.5); g.closePath(); g.fill();
    // bras avant
    g.strokeStyle = o.shirt; g.lineWidth = o.child ? 1.2 : 1.5;
    g.beginPath(); g.moveTo(0.4, hip - torso * 0.85); g.lineTo(0.4 + sw * 2.2, hip - torso * 0.15); g.stroke();
    g.fillStyle = o.skin; g.beginPath(); g.arc(0.4 + sw * 2.2, hip - torso * 0.12, 0.75, 0, TAU); g.fill();
    // tête
    const hy = hip - torso - headR * 0.9;
    const hg = g.createRadialGradient(-headR * 0.3, hy - headR * 0.3, 0, 0, hy, headR * 1.2);
    hg.addColorStop(0, U.shade(o.skin, 0.15)); hg.addColorStop(1, U.shade(o.skin, -0.2));
    g.fillStyle = hg; g.beginPath(); g.arc(0.3, hy, headR, 0, TAU); g.fill();
    // cheveux / chapeau
    g.fillStyle = o.hair;
    g.beginPath(); g.arc(0, hy - headR * 0.15, headR * 1.02, Math.PI * 0.95, Math.PI * 2.05); g.fill();
    if (o.long) { g.beginPath(); g.ellipse(-headR * 0.7, hy + headR * 0.4, headR * 0.5, headR * 0.9, 0, 0, TAU); g.fill(); }
    if (o.hat === 'safari') {
      g.fillStyle = '#c8b48a'; g.beginPath(); g.ellipse(0.2, hy - headR * 0.55, headR * 1.7, headR * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = '#d8c69e'; g.beginPath(); g.arc(0.2, hy - headR * 0.6, headR * 0.95, Math.PI, TAU); g.fill();
      g.fillStyle = '#6a5a3a'; g.fillRect(-headR * 0.9, hy - headR * 0.75, headR * 2.2, headR * 0.22);
    } else if (o.hat === 'cap') {
      g.fillStyle = o.capCol; g.beginPath(); g.arc(0.1, hy - headR * 0.35, headR * 0.98, Math.PI, TAU); g.fill();
      g.beginPath(); g.ellipse(headR * 0.9, hy - headR * 0.35, headR * 0.8, headR * 0.25, 0, 0, TAU); g.fill();
    }
    // œil
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(headR * 0.55, hy - headR * 0.05, 0.35, 0, TAU); g.fill();
  }

  function build() {
    const r = U.rng(4242);
    cache = { adult: [], child: [] };
    for (const kind of ['adult', 'child']) {
      for (let v = 0; v < VARIANTS; v++) {
        const o = {
          child: kind === 'child', skin: U.pick(r, SKIN), shirt: U.pick(r, SHIRT), pants: U.pick(r, PANTS), hair: U.pick(r, HAIR),
          tall: 0.9 + r() * 0.2, wide: 0.9 + r() * 0.25, long: r() < 0.4, backpack: r() < 0.3, bag: U.pick(r, ['#5a4a3a', '#3a5a6a', '#8a3a2a', '#4a5a3a']),
          hat: r() < 0.22 ? 'safari' : (r() < 0.18 ? 'cap' : null), capCol: U.pick(r, ['#b8483a', '#3a6ea5', '#2f4858', '#d9a83c'])
        };
        const frames = [];
        for (let f = 0; f <= FRAMES; f++) {
          const moving = f < FRAMES;
          frames.push(R.sprite(14, 22, 7, 20, (g) => person(g, o, f, moving)));
        }
        cache[kind].push(frames);
      }
    }
    // bulles d'humeur
    cache.moods = {};
    const icons = { content: '🙂', ravi: '🤩', affamé: '🍔', pressé: '🚻', mécontent: '😠', peur: '😱' };
    for (const m in icons) {
      cache.moods[m] = R.sprite(16, 18, 8, 17, (g) => {
        g.fillStyle = 'rgba(255,253,245,0.94)'; g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 0.5;
        g.beginPath(); g.ellipse(0, -9.5, 6.6, 6, 0, 0, TAU); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-1.6, -4); g.lineTo(0, -1); g.lineTo(1.6, -4); g.fill();
        g.font = '8px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(icons[m], 0, -9.2);
      }, 4);
    }
  }

  R.clearPeople = function () { cache = null; };

  R.personSprite = function (child, variant, frame) {
    if (!cache) build();
    const list = child ? cache.child : cache.adult;
    return list[variant % VARIANTS][frame];
  };
  R.moodSprite = function (m) { if (!cache) build(); return cache.moods[m] || cache.moods.content; };
  R.PEOPLE_FRAMES = FRAMES;
})();
