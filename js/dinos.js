/* =====================================================================
   DinoZoo — Données des espèces (description, régime, habitat).
   Les valeurs d'équilibrage sont dans config.js (CONFIG.dinos).
   ===================================================================== */
window.DZ = window.DZ || {};

DZ.FAMILIES = {
  petits:  { name: 'Petits herbivores', short: 'Petits', icon: '🦎' },
  geants:  { name: 'Grands herbivores et géants', short: 'Géants', icon: '🦕' },
  carnivores: { name: 'Carnivores', short: 'Carnivores', icon: '🦖' },
  volants: { name: 'Reptiles volants', short: 'Volants', icon: '🪽' },
  marins:  { name: 'Reptiles marins', short: 'Marins', icon: '🌊' }
};

/* size : taille d'enclos minimale (S, M, L)
   habitat : land (enclos), air (volière), water (lagon)
   predator : ne cohabite qu'avec sa propre espèce
   speed : vitesse de marche en cases / seconde
   social : espèce grégaire, malheureuse seule
   roar : probabilité de rugir quand elle est au repos */
DZ.SPECIES = {
  compsognathus: {
    name: 'Compsognathus', family: 'petits', diet: 'Petit omnivore', predator: false,
    size: 'S', habitat: 'land', speed: 1.3, social: true, roar: 0.05, emoji: '🦎', color: '#7f8a4a',
    period: 'Jurassique supérieur', length: '1 m',
    desc: 'Minuscule et vif, il se déplace en petites bandes curieuses.'
  },
  dryosaurus: {
    name: 'Dryosaurus', family: 'petits', diet: 'Herbivore', predator: false,
    size: 'S', habitat: 'land', speed: 1.25, social: true, roar: 0.03, emoji: '🦎', color: '#8c7a4c',
    period: 'Jurassique supérieur', length: '3 m',
    desc: 'Un coureur élancé qui broute les fougères basses.'
  },
  psittacosaurus: {
    name: 'Psittacosaurus', family: 'petits', diet: 'Herbivore', predator: false,
    size: 'S', habitat: 'land', speed: 0.9, social: false, roar: 0.03, emoji: '🦜', color: '#a07a48',
    period: 'Crétacé inférieur', length: '2 m',
    desc: 'Son bec de perroquet et ses piquants sur la queue amusent les enfants.'
  },
  pachycephalosaurus: {
    name: 'Pachycephalosaurus', family: 'petits', diet: 'Herbivore', predator: false,
    size: 'M', habitat: 'land', speed: 0.95, social: false, roar: 0.06, emoji: '🪨', color: '#8a6e56',
    period: 'Crétacé supérieur', length: '4,5 m',
    desc: 'Un crâne en dôme épais de 25 cm, idéal pour les joutes.'
  },
  parasaurolophus: {
    name: 'Parasaurolophus', family: 'petits', diet: 'Herbivore', predator: false,
    size: 'M', habitat: 'land', speed: 0.85, social: true, roar: 0.08, emoji: '🎺', color: '#6f7e5a',
    period: 'Crétacé supérieur', length: '9 m',
    desc: 'Sa crête creuse lui permet de lancer des appels graves et puissants.'
  },
  triceratops: {
    name: 'Triceratops', family: 'geants', diet: 'Herbivore', predator: false,
    size: 'M', habitat: 'land', speed: 0.6, social: false, roar: 0.05, emoji: '🦏', color: '#8b6d4a',
    period: 'Crétacé supérieur', length: '9 m',
    desc: 'Trois cornes et une collerette osseuse : un classique indémodable.'
  },
  stegosaurus: {
    name: 'Stegosaurus', family: 'geants', diet: 'Herbivore', predator: false,
    size: 'M', habitat: 'land', speed: 0.5, social: false, roar: 0.03, emoji: '🦔', color: '#7d7650',
    period: 'Jurassique supérieur', length: '9 m',
    desc: 'Ses grandes plaques dorsales et sa queue à pointes impressionnent.'
  },
  ankylosaurus: {
    name: 'Ankylosaurus', family: 'geants', diet: 'Herbivore', predator: false,
    size: 'M', habitat: 'land', speed: 0.45, social: false, roar: 0.03, emoji: '🛡️', color: '#7a6c58',
    period: 'Crétacé supérieur', length: '7 m',
    desc: 'Un véritable char d\'assaut à massue caudale.'
  },
  diplodocus: {
    name: 'Diplodocus', family: 'geants', diet: 'Herbivore', predator: false,
    size: 'L', habitat: 'land', speed: 0.45, social: true, roar: 0.04, emoji: '🦕', color: '#8a8470',
    period: 'Jurassique supérieur', length: '26 m',
    desc: 'Un cou et une queue interminables, qu\'il fait claquer comme un fouet.'
  },
  brachiosaurus: {
    name: 'Brachiosaurus', family: 'geants', diet: 'Herbivore', predator: false,
    size: 'L', habitat: 'land', speed: 0.4, social: false, roar: 0.05, emoji: '🦒', color: '#7f8a7a',
    period: 'Jurassique supérieur', length: '22 m',
    desc: 'Le géant au long cou qui broute la cime des arbres. Inoubliable.'
  },
  velociraptor: {
    name: 'Velociraptor', family: 'carnivores', diet: 'Carnivore', predator: true,
    size: 'S', habitat: 'land', speed: 1.4, social: true, roar: 0.08, emoji: '🦅', color: '#9a7a4a',
    period: 'Crétacé supérieur', length: '2 m',
    desc: 'Plumé, rusé et redoutable en meute. Griffe en faucille incluse.'
  },
  dilophosaurus: {
    name: 'Dilophosaurus', family: 'carnivores', diet: 'Carnivore', predator: true,
    size: 'M', habitat: 'land', speed: 1.0, social: false, roar: 0.1, emoji: '🐍', color: '#7d8a4a',
    period: 'Jurassique inférieur', length: '7 m',
    desc: 'Deux fines crêtes jumelles ornent son crâne.'
  },
  allosaurus: {
    name: 'Allosaurus', family: 'carnivores', diet: 'Carnivore', predator: true,
    size: 'L', habitat: 'land', speed: 0.8, social: false, roar: 0.1, emoji: '🦖', color: '#8a5f45',
    period: 'Jurassique supérieur', length: '9 m',
    desc: 'Le grand prédateur du Jurassique, aux petites cornes devant les yeux.'
  },
  carnotaurus: {
    name: 'Carnotaurus', family: 'carnivores', diet: 'Carnivore', predator: true,
    size: 'M', habitat: 'land', speed: 0.95, social: false, roar: 0.11, emoji: '🐂', color: '#8e4f3e',
    period: 'Crétacé supérieur', length: '8 m',
    desc: 'Le « taureau carnivore » : deux cornes et des bras minuscules.'
  },
  spinosaurus: {
    name: 'Spinosaurus', family: 'carnivores', diet: 'Piscivore', predator: true,
    size: 'L', habitat: 'land', speed: 0.7, social: false, roar: 0.12, emoji: '⛵', color: '#6e6a52',
    period: 'Crétacé supérieur', length: '15 m',
    desc: 'Une voile dorsale géante et un museau de crocodile.'
  },
  trex: {
    name: 'Tyrannosaurus rex', short: 'T-Rex', family: 'carnivores', diet: 'Carnivore', predator: true,
    size: 'L', habitat: 'land', speed: 0.7, social: false, roar: 0.14, emoji: '🦖', color: '#6a5a44',
    period: 'Crétacé supérieur', length: '12 m',
    desc: 'Le roi des lézards tyrans. Sa morsure est la plus puissante de l\'histoire.'
  },
  pteranodon: {
    name: 'Ptéranodon', family: 'volants', diet: 'Piscivore', predator: false,
    size: 'L', habitat: 'air', speed: 2.0, social: true, roar: 0.05, emoji: '🪽', color: '#a6845c',
    period: 'Crétacé supérieur', length: '7 m d\'envergure',
    desc: 'Un planeur élégant à la longue crête effilée.'
  },
  quetzalcoatlus: {
    name: 'Quetzalcoatlus', family: 'volants', diet: 'Carnivore', predator: false,
    size: 'L', habitat: 'air', speed: 1.6, social: false, roar: 0.05, emoji: '🦩', color: '#9a6a5a',
    period: 'Crétacé supérieur', length: '11 m d\'envergure',
    desc: 'Le plus grand animal volant de tous les temps, haut comme une girafe.'
  },
  plesiosaurus: {
    name: 'Plésiosaure', family: 'marins', diet: 'Piscivore', predator: false,
    size: 'L', habitat: 'water', speed: 1.0, social: true, roar: 0.03, emoji: '🐢', color: '#4f6f72',
    period: 'Jurassique inférieur', length: '4 m',
    desc: 'Un long cou souple et quatre nageoires en forme d\'ailes.'
  },
  mosasaurus: {
    name: 'Mosasaure', family: 'marins', diet: 'Carnivore', predator: true,
    size: 'L', habitat: 'water', speed: 1.1, social: false, roar: 0.06, emoji: '🐊', color: '#3f5a64',
    period: 'Crétacé supérieur', length: '15 m',
    desc: 'Le maître des océans du Crétacé, aux mâchoires terrifiantes.'
  }
};

DZ.SPECIES_ORDER = [
  'compsognathus', 'dryosaurus', 'psittacosaurus', 'pachycephalosaurus', 'parasaurolophus',
  'triceratops', 'stegosaurus', 'ankylosaurus', 'diplodocus', 'brachiosaurus',
  'velociraptor', 'dilophosaurus', 'allosaurus', 'carnotaurus', 'spinosaurus', 'trex',
  'pteranodon', 'quetzalcoatlus', 'plesiosaurus', 'mosasaurus'
];

DZ.DINO_NAMES = [
  'Bijou', 'Caramel', 'Rocky', 'Luna', 'Gaston', 'Perle', 'Titan', 'Olive', 'Brindille', 'Hector',
  'Noisette', 'Zéphyr', 'Praline', 'Sésame', 'Mistral', 'Capucine', 'Galet', 'Fougère', 'Basile',
  'Céleste', 'Pistache', 'Orage', 'Mimosa', 'Cannelle', 'Frimousse', 'Granit', 'Pépite', 'Sirocco',
  'Violette', 'Ulysse', 'Iris', 'Tonnerre', 'Cerise', 'Ambre', 'Jasper', 'Margot', 'Rubis', 'Félix',
  'Dune', 'Nougat', 'Oscar', 'Saphir', 'Tempête', 'Vanille', 'Hermès', 'Pixel', 'Jade', 'Lucky'
];
/* Noms selon le sexe (les femelles et les mâles reçoivent un nom qui leur va). */
DZ.DINO_NAMES_F = [
  'Luna', 'Perle', 'Olive', 'Brindille', 'Noisette', 'Praline', 'Capucine', 'Fougère', 'Céleste', 'Pistache',
  'Mimosa', 'Cannelle', 'Frimousse', 'Pépite', 'Violette', 'Iris', 'Cerise', 'Ambre', 'Margot', 'Dune',
  'Vanille', 'Jade', 'Bijou', 'Tempête', 'Caramel', 'Sésame', 'Rose', 'Opale', 'Gaïa', 'Myrtille'
];
DZ.DINO_NAMES_M = [
  'Rocky', 'Gaston', 'Titan', 'Hector', 'Zéphyr', 'Mistral', 'Galet', 'Basile', 'Orage', 'Granit',
  'Sirocco', 'Ulysse', 'Tonnerre', 'Jasper', 'Félix', 'Nougat', 'Oscar', 'Saphir', 'Hermès', 'Pixel',
  'Lucky', 'Rubis', 'Achille', 'Bruno', 'Cactus', 'Igor', 'Marius', 'Silex', 'Tobias', 'Volcan'
];
DZ.dinoName = function (sex, i) { const l = sex === 'F' ? DZ.DINO_NAMES_F : DZ.DINO_NAMES_M; return l[i % l.length]; };
