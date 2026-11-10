/* =====================================================================
   DinoZoo — Avatars du directeur ou de la directrice du parc.
   Chaque avatar : une tenue (couleurs, chapeau, accessoire) ; le genre
   choisi change la coiffure, la silhouette et le titre.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  DZ.GENDERS = [
    { id: 'f', label: 'Femme', title: 'Directrice' },
    { id: 'h', label: 'Homme', title: 'Directeur' },
    { id: 'a', label: 'Autre', title: 'Direction' }
  ];

  DZ.AVATARS = [
    { name: { f: 'Garde forestière', h: 'Garde forestier', a: 'Garde forestier·ère' }, emoji: { f: '👩‍🌾', h: '👨‍🌾', a: '🧑‍🌾' },
      top: '#a8925a', bottom: '#5d6337', hat: 'ranger', hatCol: '#7b5b34', skin: '#e9c4a0', hair: '#4a3020', acc: 'radio', coat: false },
    { name: { f: 'Paléontologue', h: 'Paléontologue', a: 'Paléontologue' }, emoji: { f: '👩‍🔬', h: '👨‍🔬', a: '🧑‍🔬' },
      top: '#d9c79e', bottom: '#6e4b2c', hat: 'fedora', hatCol: '#5b3d24', skin: '#c99a72', hair: '#2b1d14', acc: 'bag', coat: false },
    { name: { f: 'Vétérinaire', h: 'Vétérinaire', a: 'Vétérinaire' }, emoji: { f: '👩‍⚕️', h: '👨‍⚕️', a: '🧑‍⚕️' },
      top: '#eef1ee', bottom: '#3b7c76', hat: null, hatCol: null, skin: '#8d5a3b', hair: '#1c1410', acc: 'stetho', coat: true },
    { name: { f: 'Aventurière', h: 'Aventurier', a: 'Aventurier·ère' }, emoji: { f: '🤠', h: '🤠', a: '🤠' },
      top: '#2f4a6b', bottom: '#7a7153', hat: 'cap', hatCol: '#b5402f', skin: '#f1d0b5', hair: '#c9a06a', acc: 'bandana', coat: false },
    { name: { f: 'Scientifique', h: 'Scientifique', a: 'Scientifique' }, emoji: { f: '👩‍💻', h: '👨‍💻', a: '🧑‍💻' },
      top: '#e7edf2', bottom: '#33363d', hat: null, hatCol: null, skin: '#e0b48c', hair: '#8a8580', acc: 'glasses', coat: true },
    { name: { f: 'Pilote', h: 'Pilote', a: 'Pilote' }, emoji: { f: '👩‍✈️', h: '👨‍✈️', a: '🧑‍✈️' },
      top: '#5a6540', bottom: '#5a6540', hat: 'aviator', hatCol: '#6a4a2e', skin: '#5e3b26', hair: '#120c08', acc: 'goggles', coat: false }
  ];

  DZ.avatarOf = function (player) {
    const a = DZ.AVATARS[(player && player.avatar) || 0] || DZ.AVATARS[0];
    const g = (player && player.gender) || 'h';
    return { def: a, gender: g, name: a.name[g] || a.name.h, emoji: a.emoji[g] || a.emoji.h, title: (DZ.GENDERS.find((x) => x.id === g) || DZ.GENDERS[1]).title };
  };

  /* Portrait dessiné en 2D (rendu 2D et secours sans WebGL). */
  DZ.avatarPortrait = function (i, gender, w, h) {
    const a = DZ.AVATARS[i] || DZ.AVATARS[0];
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const cx = w / 2, s = h / 100;
    // fond doux
    const bg = g.createRadialGradient(cx, h * 0.45, 4, cx, h * 0.45, h * 0.7);
    bg.addColorStop(0, 'rgba(255,240,200,0.18)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // cheveux longs derrière
    g.fillStyle = a.hair;
    if (gender === 'f') { g.beginPath(); g.ellipse(cx, 44 * s, 19 * s, 26 * s, 0, 0, Math.PI * 2); g.fill(); }
    // buste
    g.fillStyle = a.top;
    g.beginPath(); g.moveTo(cx - (gender === 'f' ? 24 : 28) * s, 100 * s); g.quadraticCurveTo(cx - 26 * s, 64 * s, cx, 62 * s); g.quadraticCurveTo(cx + 26 * s, 64 * s, cx + (gender === 'f' ? 24 : 28) * s, 100 * s); g.fill();
    if (a.coat) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(cx, 66 * s); g.lineTo(cx, 100 * s); g.stroke(); g.fillStyle = a.bottom; g.fillRect(cx - 5 * s, 64 * s, 10 * s, 14 * s); }
    if (a.acc === 'bandana') { g.fillStyle = '#c8a14a'; g.beginPath(); g.moveTo(cx - 10 * s, 63 * s); g.lineTo(cx + 10 * s, 63 * s); g.lineTo(cx, 74 * s); g.fill(); }
    if (a.acc === 'stetho') { g.strokeStyle = '#30353a'; g.lineWidth = 1.6 * s; g.beginPath(); g.arc(cx, 66 * s, 9 * s, 0.2, Math.PI - 0.2); g.stroke(); }
    // cou et tête
    g.fillStyle = a.skin;
    g.fillRect(cx - 5 * s, 52 * s, 10 * s, 12 * s);
    g.beginPath(); g.ellipse(cx, 40 * s, 14 * s, 16 * s, 0, 0, Math.PI * 2); g.fill();
    // cheveux
    g.fillStyle = a.hair;
    g.beginPath(); g.ellipse(cx, 31 * s, 15 * s, 9 * s, 0, Math.PI, Math.PI * 2); g.fill();
    if (gender === 'a') { g.fillRect(cx - 15 * s, 30 * s, 5 * s, 16 * s); g.fillRect(cx + 10 * s, 30 * s, 5 * s, 16 * s); }
    // yeux et sourire
    g.fillStyle = '#1a120c';
    g.beginPath(); g.arc(cx - 5 * s, 41 * s, 1.6 * s, 0, Math.PI * 2); g.arc(cx + 5 * s, 41 * s, 1.6 * s, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,30,20,0.7)'; g.lineWidth = 1.2 * s; g.beginPath(); g.arc(cx, 46 * s, 4 * s, 0.3, Math.PI - 0.3); g.stroke();
    if (a.acc === 'glasses') { g.strokeStyle = '#222'; g.lineWidth = 1.3 * s; g.beginPath(); g.arc(cx - 5 * s, 41 * s, 3.6 * s, 0, Math.PI * 2); g.moveTo(cx + 8.6 * s, 41 * s); g.arc(cx + 5 * s, 41 * s, 3.6 * s, 0, Math.PI * 2); g.stroke(); }
    // chapeau
    if (a.hat) {
      g.fillStyle = a.hatCol;
      if (a.hat === 'ranger' || a.hat === 'fedora') {
        g.beginPath(); g.ellipse(cx, 28 * s, a.hat === 'ranger' ? 25 * s : 21 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx, 23 * s, 13 * s, 9 * s, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(cx - 13 * s, 22 * s, 26 * s, 6 * s);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - 13 * s, 24 * s, 26 * s, 3 * s);
      } else if (a.hat === 'cap') {
        g.beginPath(); g.ellipse(cx, 28 * s, 15 * s, 10 * s, 0, Math.PI, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx + 9 * s, 28 * s, 12 * s, 3.5 * s, 0, 0, Math.PI * 2); g.fill();
      } else if (a.hat === 'aviator') {
        g.beginPath(); g.ellipse(cx, 31 * s, 16 * s, 13 * s, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(cx - 16 * s, 30 * s, 5 * s, 18 * s); g.fillRect(cx + 11 * s, 30 * s, 5 * s, 18 * s);
        g.fillStyle = '#9fb7c2'; g.strokeStyle = '#3a2a1c'; g.lineWidth = 1.5 * s;
        for (const sx of [-6, 6]) { g.beginPath(); g.arc(cx + sx * s, 27 * s, 4.5 * s, 0, Math.PI * 2); g.fill(); g.stroke(); }
      }
    }
    return c;
  };
})();
