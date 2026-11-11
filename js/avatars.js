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
})();
