/* =====================================================================
   DinoZoo — Fichier de configuration
   ---------------------------------------------------------------------
   Toutes les valeurs d'équilibrage (prix, revenus, attractivité,
   entretien, déblocages) et la palette de couleurs sont ici.
   Modifiez ce fichier pour rééquilibrer le jeu sans toucher au code.
   ===================================================================== */
window.DZ = window.DZ || {};

DZ.CONFIG = {
  /* ---------- Carte ---------- */
  map: {
    w: 192,           // largeur en cases (≈ 30 fois la surface de la première carte)
    h: 136,           // hauteur en cases
    tile: 48,         // taille d'une case en pixels (zoom 1)
    margin: 3,        // bordure de jungle dessinée autour de la carte
    entrance: { x: 94, y: 134, w: 3, h: 2, tileX: 95, tileY: 133 }
  },

  /* ---------- Temps ---------- */
  time: {
    daySeconds: 240,   // durée d'une journée (6 h → minuit) à vitesse normale
    startHour: 6,
    endHour: 24,
    openHour: 8,       // arrivée des premiers visiteurs
    lastEntryHour: 17, // plus d'arrivées après
    closeHour: 19.5,   // les visiteurs se dirigent vers la sortie
    lampsOn: 19.3,
    lampsOff: 6.8,
    speeds: [0, 1, 3, 8]  // pause, normal, rapide, très rapide
  },

  /* ---------- Économie ---------- */
  economy: {
    startMoney: 30000,
    ticketBase: 10,        // prix du billet = base + note * parEtoile
    ticketPerStar: 3,
    refundRate: 0.6,       // remboursement à la démolition
    dinoSellRate: 0.5,     // revente d'un dinosaure
    moveCost: 0,           // déplacer un bâtiment est gratuit
    grant: { threshold: 2500, amount: 8000, cooldownDays: 5 }, // aide anti-blocage
    treatRate: 0.12,       // coût des soins = prix * taux
    treatMin: 300,
    dinoUpgrades: {
      habitat: { name: 'Habitat enrichi', costRate: 0.4, attraction: 0.2, happiness: 12 },
      care:    { name: 'Soins premium',   costRate: 0.3, attraction: 0.15, happiness: 10, sicknessFactor: 0.4 }
    }
  },

  /* ---------- Visiteurs ---------- */
  visitors: {
    base: 20,            // visiteurs quotidiens d'un parc vide
    k: 6,                // visiteurs = (base + k * attractivité^p) * facteurs
    p: 0.74,
    ratingFactorMin: 0.55, // facteur à 0 étoile
    ratingFactorMax: 1.45, // facteur à 5 étoiles
    randomness: 0.08,
    groupSizes: [[1, 0.22], [2, 0.38], [3, 0.2], [4, 0.2]],
    childChance: 0.5,
    speed: 1.8,          // cases par seconde de simulation (≈ 24 cases par heure de jeu)
    stayHours: [3.5, 7],
    hungerRate: 14,      // par heure de jeu
    bladderRate: 17,
    hungerSeek: 62,
    bladderSeek: 68,
    needPenalty: 8,      // perte de satisfaction / heure si besoin non satisfait
    boredom: 1.2,        // perte de satisfaction / heure
    startSatisfaction: 55,
    leaveSatisfaction: 12,
    maxGroups: { high: 260, medium: 170, low: 100 } // au-delà, chaque groupe compte pour plusieurs visiteurs
  },

  /* ---------- Note du parc ---------- */
  rating: {
    start: 2.0,
    smoothing: 0.4,       // part de la note du jour dans la nouvelle note
    weights: { satisfaction: 0.45, cleanliness: 0.15, diversity: 0.15, quality: 0.1, welfare: 0.15 },
    diversityTarget: 10   // nombre d'espèces pour la note maximale de diversité
  },

  /* ---------- Bâtiments ---------- */
  path: { cost: 15, bridgeCost: 60, refund: 0.5 },

  enclosureLevels: {
    names: ['Palissade en bois', 'Clôture électrifiée', 'Murs de verre et passerelle'],
    capacity: [1, 1.5, 2],
    attraction: [1, 1.25, 1.55],
    happiness: [0, 10, 20]
  },

  buildings: {
    enclos_s:   { cat: 'enclos', kind: 'land',  name: 'Petit enclos',   w: 6,  h: 6,  size: 'S', space: 4,  cost: 2500,  upgrade: [3200, 7500],   upkeep: [25, 50, 85],   icon: '🌿' },
    enclos_m:   { cat: 'enclos', kind: 'land',  name: 'Enclos moyen',   w: 10, h: 8,  size: 'M', space: 10, cost: 6500,  upgrade: [7500, 17000],  upkeep: [50, 85, 140],  icon: '🌳' },
    enclos_l:   { cat: 'enclos', kind: 'land',  name: 'Grand enclos',   w: 14, h: 10, size: 'L', space: 20, cost: 15000, upgrade: [18000, 42000], upkeep: [95, 165, 260], icon: '🏞️' },
    voliere:    { cat: 'enclos', kind: 'air',   name: 'Volière',        w: 10, h: 10, size: 'L', space: 10, cost: 11000, upgrade: [12000, 28000], upkeep: [70, 120, 190], icon: '🪽' },
    lagon:      { cat: 'enclos', kind: 'water', name: 'Lagon marin',    w: 14, h: 10, size: 'L', space: 18, cost: 20000, upgrade: [22000, 48000], upkeep: [110, 180, 280], icon: '🌊' },

    boutique:   { cat: 'service', name: 'Boutique de souvenirs', w: 2, h: 2, cost: 1500, upgrade: [2500, 6000],  upkeep: [30, 50, 80],  spend: [8, 12, 18], chance: [0.5, 0.6, 0.72], attraction: [3, 5, 8], icon: '🛍️' },
    restaurant: { cat: 'service', name: 'Restaurant',            w: 3, h: 2, cost: 3500, upgrade: [5000, 11000], upkeep: [60, 90, 140], spend: [9, 14, 20], litter: [0.55, 0.4, 0.25], attraction: [4, 7, 11], icon: '🍽️' },
    toilettes:  { cat: 'service', name: 'Toilettes',             w: 2, h: 1, cost: 900,  upgrade: [1500, 3500],  upkeep: [15, 25, 40],  satisfaction: [8, 14, 22], attraction: [1, 2, 3], icon: '🚻' },

    poubelle:   { cat: 'deco', name: 'Poubelle',    w: 1, h: 1, cost: 60,   radius: 3, icon: '🗑️' },
    banc:       { cat: 'deco', name: 'Banc',        w: 1, h: 1, cost: 90,   pleasant: 2, attraction: 0.3, icon: '🪑' },
    lampadaire: { cat: 'deco', name: 'Lampadaire',  w: 1, h: 1, cost: 150,  pleasant: 1, attraction: 0.3, icon: '💡' },
    arbre:      { cat: 'deco', name: 'Araucaria',   w: 1, h: 1, cost: 120,  pleasant: 1.5, attraction: 0.6, icon: '🌲' },
    palmier:    { cat: 'deco', name: 'Palmier',     w: 1, h: 1, cost: 140,  pleasant: 1.5, attraction: 0.7, icon: '🌴' },
    fougere:    { cat: 'deco', name: 'Fougères',    w: 1, h: 1, cost: 60,   pleasant: 1, attraction: 0.3, icon: '🌱' },
    fontaine:   { cat: 'deco', name: 'Fontaine',    w: 2, h: 2, cost: 2500, pleasant: 4, attraction: 6, icon: '⛲' },

    entree:     { cat: 'fixed', name: 'Entrée du parc', w: 3, h: 2, cost: 0, icon: '🏛️' }
  },
  decorAttractionCap: 80,
  maxLevel: 3,

  /* ---------- Dinosaures : équilibrage ----------
     price: prix d'achat, attraction: attractivité, upkeep: nourriture/jour,
     space: place occupée dans l'enclos, unlockDay / unlockRating: déblocage */
  dinos: {
    compsognathus:      { price: 600,   attraction: 7,   upkeep: 15,   space: 1, unlockDay: 1,  unlockRating: 0 },
    dryosaurus:         { price: 1200,  attraction: 11,  upkeep: 25,   space: 1, unlockDay: 1,  unlockRating: 0 },
    psittacosaurus:     { price: 1800,  attraction: 15,  upkeep: 35,   space: 1, unlockDay: 2,  unlockRating: 0 },
    pachycephalosaurus: { price: 3200,  attraction: 22,  upkeep: 55,   space: 2, unlockDay: 3,  unlockRating: 2.0 },
    parasaurolophus:    { price: 5000,  attraction: 30,  upkeep: 80,   space: 3, unlockDay: 4,  unlockRating: 2.2 },
    triceratops:        { price: 9000,  attraction: 48,  upkeep: 140,  space: 4, unlockDay: 5,  unlockRating: 2.5 },
    stegosaurus:        { price: 11000, attraction: 55,  upkeep: 160,  space: 4, unlockDay: 7,  unlockRating: 2.7 },
    ankylosaurus:       { price: 13000, attraction: 60,  upkeep: 180,  space: 4, unlockDay: 9,  unlockRating: 2.9 },
    diplodocus:         { price: 38000, attraction: 85,  upkeep: 420,  space: 7, unlockDay: 12, unlockRating: 3.1 },
    brachiosaurus:      { price: 95000, attraction: 150, upkeep: 1100, space: 8, unlockDay: 17, unlockRating: 3.5 },
    velociraptor:       { price: 8000,  attraction: 45,  upkeep: 130,  space: 2, unlockDay: 6,  unlockRating: 2.5 },
    dilophosaurus:      { price: 7000,  attraction: 40,  upkeep: 120,  space: 3, unlockDay: 6,  unlockRating: 2.4 },
    allosaurus:         { price: 28000, attraction: 80,  upkeep: 330,  space: 6, unlockDay: 10, unlockRating: 3.0 },
    carnotaurus:        { price: 36000, attraction: 92,  upkeep: 420,  space: 5, unlockDay: 13, unlockRating: 3.2 },
    spinosaurus:        { price: 140000, attraction: 175, upkeep: 1500, space: 8, unlockDay: 21, unlockRating: 3.8 },
    trex:               { price: 200000, attraction: 230, upkeep: 2000, space: 8, unlockDay: 24, unlockRating: 3.9 },
    pteranodon:         { price: 7500,  attraction: 38,  upkeep: 110,  space: 2, unlockDay: 8,  unlockRating: 2.7 },
    quetzalcoatlus:     { price: 45000, attraction: 95,  upkeep: 480,  space: 4, unlockDay: 15, unlockRating: 3.3 },
    plesiosaurus:       { price: 52000, attraction: 110, upkeep: 560,  space: 5, unlockDay: 14, unlockRating: 3.3 },
    mosasaurus:         { price: 120000, attraction: 165, upkeep: 1300, space: 8, unlockDay: 19, unlockRating: 3.7 }
  },
  duplicateFactor: 0.8,     // chaque individu de plus d'une même espèce attire 20 % de moins
  diversityBonus: 6,        // attractivité par espèce différente
  familyBonus: 12,          // attractivité par famille représentée
  socialAlonePenalty: 15,   // perte de bonheur d'une espèce grégaire seule

  /* ---------- Chantiers (durées en heures de jeu ; 1 h ≈ 13 s à vitesse normale) ---------- */
  construction: {
    baseHours: 0.15,          // durée minimale d'un chantier
    hoursPer1000: 0.16,       // durée ajoutée par tranche de 1 000 € de coût
    maxHours: 4.5,
    upgradeFactor: 1.1        // une amélioration dure un peu plus qu'une construction au même prix
  },

  /* ---------- Livraison des dinosaures par hélicoptère ---------- */
  delivery: {
    prepBase: 0.3,            // préparation (capture, mise en caisse) : prepBase + prepLog × log10(prix / 500)
    prepLog: 0.45,
    flight: 0.4,              // vol d'approche
    hover: 0.32,              // vol stationnaire pendant la descente de la caisse
    leave: 0.4                // départ de l'hélicoptère
  },

  /* ---------- Reproduction ---------- */
  breeding: {
    minHappiness: 50,                 // bonheur moyen minimal du couple
    days: { S: 2, M: 3, L: 4 },       // jours de vie commune avant une naissance
    growDays: { S: 2, M: 3, L: 4 },   // jours pour qu'un bébé devienne adulte
    babyScale: 0.42,                  // taille d'un nouveau-né
    babySpace: 0.5,                   // place occupée par un bébé (fraction de l'adulte)
    babyAttraction: 1.15,             // les bébés attirent un peu plus (attendrissants)
    babyUpkeep: 0.5,
    babyValue: 0.4                    // valeur d'un bébé (fraction du prix)
  },

  /* ---------- Passerelles et enclos réunis ---------- */
  links: {
    base: 1800,               // prix fixe d'une passerelle
    perTile: 520,             // et par case franchie
    gateFactor: 0.45,         // simple porte entre deux enclos qui se touchent
    maxLen: 10,               // longueur maximale (cases)
    width: 2,                 // largeur du tablier (cases)
    clearance: 0.62,          // hauteur du tablier au-dessus du sol (les visiteurs passent dessous)
    ramp: 1.6,                // longueur des rampes, à l'intérieur des enclos
    crossChance: 0.03,        // probabilité, à chaque nouvelle activité, d'aller dans l'enclos voisin
    attraction: 14,           // dinosaures au-dessus des allées : spectacle pour les visiteurs
    happiness: 4              // plus d'espace pour se promener
  },
  merge: {
    base: 900,                // démontage de la clôture commune
    perTile: 140,             // par case de clôture commune
    minShared: 3              // longueur minimale du côté commun
  },

  /* ---------- Prédation (chasses visibles dans les enclos mixtes) ---------- */
  predation: {
    rate: 0.1,                // chasses par heure de jeu et par prédateur adulte (une toutes les ~10 h)
    meal: 1.6,                // plus souvent aux heures des repas
    success: { smaller: 0.6, same: 0.25, baby: 0.85, bigBaby: 0.3 }, // proie plus petite, de même taille, bébé
    sickBonus: 0.15,          // une proie malade ou blessée se fait plus facilement attraper
    satedHours: 6,            // repus après un repas
    missHours: 1.5,           // reprend son souffle après une chasse ratée
    duelCalm: 4,              // trêve après un combat entre deux prédateurs d'espèces différentes
    defendInjury: 0.35,       // une grande proie se défend : risque de blessure du prédateur (× rapport de taille)
    ratingPenalty: 0.35,      // étoiles perdues par victime
    watchFear: 5,             // satisfaction perdue par les visiteurs qui regardent (si la note est basse)
    noticeHours: 6            // notifications des chasses ratées : au plus une par enclos dans cet intervalle
  },

  /* ---------- Combats entre mâles adultes ---------- */
  fights: {
    rate: 0.16,               // combats par heure de jeu, pour une paire de mâles très territoriaux (× tempérament²)
    calmHours: 5,             // trêve après un combat (le vainqueur domine)
    injury: 0.35,             // risque de blessure du perdant (× tempérament)
    rivalryPenalty: 8,        // bonheur perdu par les rivaux (× tempérament)
    bruisePenalty: 12,        // bonheur perdu par le vaincu jusqu'au lendemain
    noticeHours: 8            // pas plus d'une notification par enclos dans cet intervalle
  },

  /* ---------- Directeur ou directrice du parc (avatar) ---------- */
  player: {
    walkSpeed: 2.4,           // cases par seconde de jeu ; accélère sur les longues distances
    maxTripSeconds: 7,        // un trajet ne dure jamais plus que ça (il court, puis file en quad)
    workSeconds: 5            // temps passé sur place avant la tâche suivante
  },

  /* ---------- Événements ---------- */
  events: {
    firstDay: 3,
    chance: 0.45,
    weights: { affluence: 3, storm: 3, sick: 2, critic: 2, sponsor: 1 },
    affluenceMult: 1.6,
    stormMult: 0.55,
    sponsorBase: 2000,
    sponsorPerDay: 300,
    criticMax: 0.45,
    naturalSickness: 0.02,
    sickDaysToDeath: 3,
    escapeChance: 0.15,
    escapeRepair: 2500,
    escapeRatingPenalty: 0.3,
    deathRatingPenalty: 0.2
  },

  /* ---------- Qualité graphique ---------- */
  quality: {
    high:   { cacheScale: 2.5, spriteScale: 3,   particles: 600, godRays: true,  shadows: true, waterFx: true,  maxGroups: 'high' },
    medium: { cacheScale: 2,   spriteScale: 2.2, particles: 260, godRays: false, shadows: true, waterFx: true,  maxGroups: 'medium' },
    low:    { cacheScale: 1.25, spriteScale: 1.6, particles: 80, godRays: false, shadows: false, waterFx: false, maxGroups: 'low' }
  },

  camera: { minZoom: 0.3, maxZoom: 2.6, startZoom: 1.0, zoomStep: 1.15, minDist3D: 2.2, maxDist3D: 175 },

  /* ---------- Palette (réaliste, désaturée) ---------- */
  palette: {
    grass: ['#4c6a2c', '#58783a', '#668645', '#3d5824', '#72904c'],
    grassBlade: ['#7c9b52', '#3a5422', '#8aa866', '#55762f'],
    dirt: ['#8a6a43', '#76583a', '#9c7c52', '#6a4e33'],
    sand: ['#c9b38a', '#b9a077', '#d8c6a0', '#a89070'],
    rock: ['#7d7b74', '#6b6a64', '#93908a', '#55534f'],
    paving: ['#bcae94', '#ab9d84', '#c9bea6', '#9d907a'],
    curb: '#6c6354',
    water: { shallow: '#4f8a7e', mid: '#2c6670', deep: '#17404e', foam: '#e6f0ea', sky: '#c9e4ea' },
    foliage: ['#24391a', '#2f4a1f', '#3c5b27', '#4b6d2f', '#5d8139', '#6f9545'],
    trunk: ['#5a4030', '#6b4c36', '#4a3426', '#7a5a40'],
    wood: ['#8a6240', '#a07650', '#6e4c30', '#b88c62'],
    metal: ['#8a9196', '#5c6368', '#b8bfc3', '#3f454a'],
    concrete: ['#b0aca2', '#9a968c', '#c6c2b8'],
    canvas: ['#e9dfc4', '#3f6b4a', '#b5523a', '#d7a84a'],
    jungle: '#1d2e16'
  },

  /* Lumière au fil de la journée : multiplication + teinte additive */
  light: [
    { h: 5,    mul: '#8a86a8', add: '#ff9a60', a: 0.04 },
    { h: 6.5,  mul: '#dcb89c', add: '#ff9a50', a: 0.10 },
    { h: 8,    mul: '#f3e4d0', add: '#ffc080', a: 0.06 },
    { h: 12,   mul: '#ffffff', add: '#fff6dc', a: 0.02 },
    { h: 16.5, mul: '#fbefd8', add: '#ffcf80', a: 0.05 },
    { h: 18.5, mul: '#eab98a', add: '#ff9040', a: 0.12 },
    { h: 19.8, mul: '#8f84a6', add: '#ff7040', a: 0.06 },
    { h: 21,   mul: '#56628f', add: '#203060', a: 0.05 },
    { h: 24,   mul: '#46548a', add: '#102040', a: 0.04 }
  ]
};
