# DinoZoo — Notes de conception

Décisions prises pendant le développement, là où la demande était ambiguë ou muette.

## Formes organiques (fin de l'aspect « blocs »)

La grille des cases reste la règle du jeu (placement, chemins, collisions), mais elle n'est plus visible en 3D :
- **Chemins** : chaque case de chemin a un centre « lissé » (lissage laplacien des cases à deux voisins). Les escaliers deviennent des diagonales et les virages s'arrondissent. Le ruban pavé est le contour d'un champ de distance : union lissée de capsules entre ces centres, avec des congés arrondis aux carrefours et des bords légèrement irréguliers. Le contour est tracé par « marching squares » au cinquième de case. Le pavage est fait de pierres irrégulières (cellules de Voronoï dans le shader), avec un liseré sombre et une bande de terre piétinée sur les bords. Les visiteurs marchent sur ces centres lissés.
- **Enclos** : la clôture suit un contour très arrondi et légèrement ondulé, inscrit dans l'emprise (distance signée `DZ.encSDF`). Poteaux, lisses, câbles, vitres, panneaux et passerelle d'observation suivent la courbe. Le sol est aplani à l'intérieur et fondu au-delà, avec des taches de terre et d'herbe. Les angles de l'emprise restent naturels. Les dinosaures (marcheurs, volants, nageurs) restent dans cette forme.
- **Lagons** : bassin naturel aux berges en pente douce, dont la margelle, le garde-corps et les vitres suivent la courbe (rochers épars au niveau 1).
- **Rivages** : une distance signée à l'eau, calculée finement à la génération (mer, lac, rivières, mares), dessine des berges arrondies et des plages qui ne suivent plus la grille.
- **Biomes** : les frontières de couleur sont déformées par du bruit (domain warping) pour ne plus suivre la grille.
- **Rendu 2D de secours** : il garde l'ancien dessin en cases (seul le rendu 3D a été repensé).

## Son et musique

- **Tout est synthétisé en direct** avec la Web Audio API : aucun fichier audio, aucun accès réseau.
- **Son 3D** : l'écouteur suit la caméra ; dinosaures, foule et éclaboussures sont placés dans l'espace (HRTF). La distance atténue et assourdit les sons (filtre d'absorption de l'air), si bien que dézoomer transforme le parc en rumeur lointaine.
- **Voix des 20 espèces**, synthétisées selon un modèle source-filtre, comme une vraie voix : une source vocale riche dont la hauteur tremble au gré d'un bruit lent (et non d'une oscillation régulière, qui sonnait électronique), avec sous-harmonique et souffle, passe dans une « gorge » dont les formants suivent l'ouverture de la gueule, puis un léger grain de saturation et un râle irrégulier. Les grands carnivores inspirent avant de rugir et expirent après ; les herbivores trapus s'ébrouent avant de mugir ; le vélociraptor ronronne en crépitant, aboie et claque des mâchoires ; les reptiles marins s'accompagnent de bulles. Par famille : rugissements gutturaux avec infrabasse, râle et grognement (T-Rex, Spinosaurus, Allosaurus, Carnotaurus), aboiements et cris stridents (Velociraptor), hululements crépitants (Dilophosaurus), gazouillis (Compsognathus), couinements (Dryosaurus, Psittacosaurus), appel de trompe dans une crête creuse simulée par un filtre en peigne (Parasaurolophus), mugissements et ébrouements (Triceratops, Stegosaurus, Ankylosaurus, Pachycephalosaurus), longues plaintes graves comme des chants de baleine (sauropodes), cris perçants (ptérosaures), grondements sous l'eau et chants (reptiles marins). Les dinosaures proches lancent aussi des cris d'humeur au hasard. Pas de bruits de pas : répétés en continu, ils devenaient lassants.
- **Ambiance selon le lieu** autour de la caméra (analysée trois fois par seconde) : vent en rafales et feuillage agité **seulement pendant l'orage** (un souffle permanent devenait vite pénible), vagues qui déferlent près de la mer, glouglous de la rivière, pluie en trois couches avec gouttes individuelles, tonnerre roulant, oiseaux variés (et plus nombreux à l'aube), appels exotiques dans la jungle, mouettes sur la côte, cigales aux heures chaudes, grillons, grenouilles et hiboux la nuit.
- **Visiteurs** : brouhaha de voix synthétiques (hommes, femmes, enfants, syllabes et voyelles variées), proportionnel à la foule proche ; rires d'enfants ; « Ooooh ! » collectif aux rugissements spectaculaires ; cris de peur pendant une évasion.
- **Bruitages retravaillés** : pluie faite d'impacts variés et de gouttes qui tombent dans les flaques (petites bulles), arrivant par vagues avec les rafales ; tonnerre avec crépitement de l'arc quand l'éclair est proche, grondement roulant en deux couches, infrabasse et long écho ; oiseaux en cinq chants (phrase flûtée, gazouillis, trille, roucoulement, appel en deux notes) avec leurs harmoniques ; grenouilles à gorge pulsée, hibou feutré, mouettes rauques ; foule faite d'un murmure de fond et de voix proches qui tremblent et respirent, rires soufflés, « Ooooh ! » répartis dans l'espace ; coups de maillet modélisés sur les vibrations d'une planche, éclaboussure en trois temps (impact, gerbe, gouttes), sirène passée par un haut-parleur. Les niveaux ont été équilibrés par rendu hors ligne.
- **Mixage** : bus musique, effets, ambiance et interface ; réverbération de salle générée (premières réflexions et queue qui s'assombrit) ; compresseur final avec marge contre la saturation. Volumes réglables dans le menu ☰ et conservés.
- **Musique** : six thèmes **originaux** d'esprit « grand film d'aventure », inspirés du style orchestral des films de dinosaures mais sans reprendre aucune mélodie existante (les thèmes de John Williams sont protégés). Un orchestre de synthèse (cordes, cors, cuivres, timbales, harpe, célesta, flûte, chœur, contrebasses, cymbale) joue des partitions écrites dans `js/music.js`, orchestrées automatiquement selon le style :
  - **L'Île des Géants** : thème principal majestueux (si bémol majeur, cors et cordes, timbales) ;
  - **Matin sur le parc** : pastoral, flûte et harpe ;
  - **Expédition** : aventure, ostinato de cordes, cuivres et timbales ;
  - **Nuit tropicale** : mystérieux, célesta, chœur feutré ;
  - **Alerte !** : tension pendant les orages violents et les évasions ;
  - **Émerveillement** : court thème avec chœur à chaque nouvelle espèce ou grand dinosaure.
  Le son de l'orchestre : chaque note est jouée par un pupitre de plusieurs voix légèrement désaccordées, réparties à gauche et à droite avec chacune leur vibrato, sur des spectres d'instruments doux (ondes périodiques calculées, aucune onde carrée ni dent de scie brute). Cordes et chœur montent lentement en legato ; harpe et célesta sont des cordes pincées et des cloches dont chaque harmonique s'éteint à son rythme ; les timbales ont les harmoniques inharmoniques d'une membrane. La musique passe par sa propre salle de concert (réverbération longue de 5 s avec pré-délai) et un filtre qui adoucit les aigus. Les arrangements évitent les ostinatos et roulements trop mécaniques, qui sonnaient « jeu vidéo bon marché ».
  Le chef d'orchestre choisit le thème selon l'heure et les événements, fond les transitions et laisse des silences entre les morceaux pour que l'ambiance respire. Le titre du morceau s'affiche discrètement ; le bouton 🎵 coupe la musique.

## Grande carte (192 × 136 cases)

- **« 30 fois plus grande »** a été compris comme 30 fois la **surface** : 192 × 136 = 26 112 cases contre 864 auparavant (environ 5,5 fois plus large et plus haute). Trente fois dans chaque dimension (plus de 750 000 cases) ne serait ni jouable ni fluide dans un navigateur.
- **Une nouvelle carte à chaque partie** : chaque nouvelle partie tire une graine au hasard, et la graine décide aussi de la disposition du domaine : mer à l'est ou à l'ouest, tracé de la côte et parfois une baie, épaisseur de la chaîne de montagnes au nord, parfois un massif isolé dans les terres, un ou deux lacs, rivière qui descend des montagnes jusqu'au lac puis serpente vers la mer à une hauteur variable, nombre d'étangs, côté de la jungle et quantité de collines. Toujours : montagnes au nord, entrée au sud dans une plaine sèche et plate. Vérifié sur 300 cartes : entrée toujours dégagée, 51 à 73 % de terrain constructible, environ 0,2 s de génération. Le paysage lointain en 3D et l'ambiance sonore suivent le côté de la mer.
- **Anciennes sauvegardes** : elles retrouvent exactement leur carte (génération 1, disposition d'origine : mer à l'est, lac à l'ouest). Les nouvelles parties enregistrent `mapGen: 2`.
- **Biomes** : chaîne de montagnes (sommets enneigés, vallées), mer avec plages, lacs alimentés par une rivière descendue des montagnes, puis une rivière qui serpente jusqu'à la mer, forêts, jungle (côté humide), collines, plaines (autour de l'entrée) et quelques étangs. Le relief (élévation par case) sert au rendu 3D ; les montagnes trop raides sont inconstructibles.
- **Entrée au sud**, au milieu d'une plaine dégagée : le joueur peut s'étendre dans toutes les directions et franchir les rivières par des ponts.
- **Arbres** (environ 5 000 à 7 000) : générés de façon déterministe par case selon le biome. La sauvegarde ne contient que la liste des cases défrichées, ce qui la garde légère (environ 50 Ko).
- **Minicarte** (en haut à droite) : biomes, chemins, bâtiments, dinosaures et cadre de la vue ; un clic y déplace la caméra. Touche `N` pour la réduire. Elle se masque quand le panneau d'informations est ouvert.
- **Échelle du temps** : les distances étant beaucoup plus grandes, une journée dure désormais 4 minutes en vitesse normale, les visiteurs marchent environ 24 cases par heure de jeu, et une vitesse « très rapide » (×8) a été ajoutée.
- **Enclos environ 4 fois plus grands** : petit 6 × 6, moyen 10 × 8, grand 14 × 10, volière 10 × 10, lagon 14 × 10. Ils accueillent un peu plus d'animaux (place 4 / 10 / 20 / 10 / 18) et coûtent un peu plus cher. Les dinosaures y ont beaucoup plus d'espace pour se promener.
- **Nouvelle sauvegarde (v2)** : les parties de l'ancienne petite carte ne peuvent pas être reprises sur la nouvelle ; elles restent dans le navigateur sous l'ancienne clé, sans être effacées.
- **Rendu 3D par tronçons** de 16 × 16 cases : seuls les tronçons visibles sont dessinés et seuls les tronçons modifiés sont reconstruits. Les arbres proches sont détaillés, les arbres lointains passent à une version simplifiée. La caméra va du gros plan (2 unités) à la vue de tout le domaine (175 unités), avec un paysage prolongé au-delà des bords et la mer jusqu'à l'horizon.
- **Rendu 2D de secours** : le terrain est cuit par tronçons à la demande, avec une mémoire bornée (56 tronçons au maximum).

## Rendu 3D (WebGL 2)

- **Aucune bibliothèque** (pas de Three.js) : la contrainte initiale « sans dépendance externe ni accès réseau » est conservée. Le moteur 3D est écrit à la main dans `js/r3d/`, et le jeu s'ouvre toujours en double-cliquant sur `index.html`.
- **Logique inchangée** : `game.js` et l'interface sont les mêmes qu'en 2D. Le moteur 3D expose la même interface que le moteur 2D (conversion écran ↔ carte, déplacement de la caméra, zoom, sélection, effets) ; l'interface n'a reçu que la rotation de caméra et la sélection 3D.
- **Repère** : 1 case = 1 unité, x vers la droite, z vers le bas de la carte, y vers le haut.
- **Caméra orbitale** : glisser pour déplacer, molette pour zoomer de 2,2 à 42 unités (du gros plan sur un dinosaure à tout le parc), avec zoom fluide centré sur le curseur. L'inclinaison suit le zoom (rasante de près, plongeante de loin). Clic droit glissé ou `Ctrl` + glisser pour tourner et incliner, `[` `]` pour pivoter de 45°, `Début` pour recentrer.
- **Terrain** : maillage en relief (3 sommets par case) avec lit de rivière creusé ; le rivage est l'intersection naturelle entre le terrain et le plan d'eau. Une jungle vallonnée de 12 cases entoure le parc pour cacher les bords.
- **Matériaux procéduraux dans le shader** : écailles de la peau, herbe, dalles de pierre, bois, roche, feuillage, vitres éclairées la nuit. Les enseignes (« SOUVENIRS », « DINOZOO »…) viennent d'un atlas de textures dessiné une fois en 2D.
- **Lumière** : soleil qui se lève à l'est et se couche à l'ouest, ombres par carte d'ombre filtrée (PCF 3×3), ciel dégradé avec soleil et étoiles, brouillard, lumière ambiante ciel/sol, jusqu'à 16 lampes proches éclairant réellement la scène la nuit, plus des halos additifs.
- **Instanciation** : arbres (par espèce et variante), touffes d'herbe, visiteurs (corps et jambes animées, couleurs de vêtements, de peau et de cheveux par instance).
- **Dinosaures 3D** : les proportions, couleurs et attributs viennent des mêmes définitions que le rendu 2D (`DZ.DINO_ART`). Chaque pièce est un « loft » (sections elliptiques le long d'un axe) avec motif de peau ; tête et mâchoire séparées, yeux, dents, cornes, collerette, plaques, voile, massue, plumes. Animation : marche avec appuis alternés, rebond, queue qui ondule de côté, tête qui regarde autour, repas, repos, rugissement mâchoire ouverte, vol à battements d'ailes, nage ondulante sous l'eau.
- **Calque 2D** par-dessus la scène pour les bulles d'humeur, icônes, textes « +N € », pluie, éclairs, rayons de soleil et vignettage.
- **Vignettes du catalogue** rendues en 3D hors écran (cadrage automatique sur la boîte englobante).
- **Qualité** : élevée (ombres 2048, densité d'herbe et de jungle maximale), moyenne (ombres 1024, résolution 85 %), basse (sans ombres, résolution 70 %, moins de détails). Mesuré à 120 images/s (plafond de l'écran) sur un parc complet de 18 dinosaures et des centaines de visiteurs.
- **Secours** : sans WebGL 2, le jeu utilise automatiquement le rendu 2D. Le menu ☰ → Affichage permet de basculer entre 3D et 2D classique (rechargement de la page, partie conservée).

## Technique

- **Aucun module ES** : `type="module"` est bloqué en `file://` par la plupart des navigateurs. Les scripts sont donc chargés dans l'ordre et partagent un espace de noms global `DZ`. Le jeu s'ouvre en double-cliquant sur `index.html`.
- **Organisation** :
  - `js/config.js` : toutes les valeurs d'équilibrage (prix, revenus, attractivité, entretien, déblocages, événements) et la palette de couleurs ;
  - `js/dinos.js` : données descriptives des espèces (nom, famille, régime, habitat, description) ;
  - `js/game.js` : logique pure, sans DOM ni rendu (testable sous Node) ;
  - `js/render/*` : tout l'affichage (textures, végétation, dinosaures, visiteurs, bâtiments, terrain, moteur) ;
  - `js/ui.js`, `js/tutorial.js` : interface ; `js/audio.js` : sons ; `js/save.js` : sauvegarde ; `js/main.js` : démarrage et boucle.
- **Le rendu ne modifie jamais l'état du jeu**. Il écoute les événements du jeu (`spend`, `built`, `roar`…) pour ses effets (pièces, étincelles, tremblement).
- **Carte** : d'abord 36 × 24 cases, puis agrandie à 192 × 136 cases (voir « Grande carte »).
- **Vue de trois quarts** : la carte est vue du dessus, les objets (arbres, bâtiments, dinosaures terrestres, visiteurs) sont dessinés de profil avec leur hauteur, triés par profondeur. Les reptiles volants et marins sont dessinés vus du dessus (vol et nage), ce qui est plus lisible.
- **Mises en cache** : textures générées une fois au chargement ; terrain statique dans un canvas hors écran, redessiné seulement sur la zone modifiée ; sprites des arbres (tronc et feuillage séparés pour le vent), des bâtiments par niveau, des clôtures par enclos, des pièces de chaque dinosaure, des visiteurs (4 images de marche × 30 variantes).
- **Dinosaures articulés** : chaque espèce est un pantin (corps, cou en 1 à 3 segments, tête, mâchoire, 3 à 4 segments de queue, cuisse/jambe/pied pour chaque patte, bras). Chaque pièce est dessinée une fois (peau, écailles, motifs, lumière), puis animée : respiration, marche avec rebond, queue qui ondule, tête qui bouge, clignement des yeux, repas, repos, rugissement (mâchoire ouverte).
- **Ombres** : ellipses douces orientées par le soleil (longues le matin et le soir, presque nulles à midi, très faibles la nuit), plus une occlusion ambiante au pied des objets.
- **Cycle jour / nuit** : un calque de multiplication et une teinte additive, interpolés sur des images clés (`CONFIG.light`) ; halos lumineux additifs pour les lampadaires, fenêtres, enseignes et clôtures la nuit.
- **Qualité** (élevée / moyenne / basse) : résolution des caches et des sprites, nombre de particules, rayons de soleil, ombres, eau animée, nombre de groupes de visiteurs affichés. Choisie automatiquement au premier lancement, réduite automatiquement si le jeu passe sous ~38 images/s (sauf si le joueur l'a fixée dans le menu).
- **Visiteurs en groupes** : un « agent » est une famille de 1 à 4 personnes qui se déplace ensemble. Au-delà d'un plafond d'agents simultanés (selon la qualité), chaque groupe compte pour plusieurs visiteurs dans les recettes et le compteur : l'économie reste exacte et le jeu reste fluide avec des milliers de visiteurs par jour.
- **Déplacements** : champs de distance (BFS) sur les cases de chemin, un par destination, recalculés seulement quand le réseau change.
- **Sons** : entièrement synthétisés (Web Audio), voir « Son et musique ». Le contexte audio démarre au premier clic ou à la première touche, comme l'exigent les navigateurs.

## Gameplay

- **Temps** : une journée va de 6 h à minuit et dure 4 minutes en vitesse normale (×3 en rapide, ×8 en très rapide). Arrivées de 8 h à 17 h (pic vers midi), fermeture à 19 h 30. Le résumé s'affiche à minuit.
- **Fréquentation** : `(20 + 6 × attractivité^0,74) × facteur de note`. L'attractivité additionne les dinosaures (selon espèce, bonheur, soins, niveau de l'enclos), la diversité (bonus par espèce et par famille), les services et le décor, pondérée par la propreté. La prévision est recalculée chaque heure jusqu'à 17 h, pour qu'une nouveauté rapporte dès le jour même.
- **Rendements décroissants** : chaque individu supplémentaire d'une même espèce attire 20 % de moins que le précédent. Sans cela, entasser des Compsognathus bon marché rapportait plus que tout le reste ; la diversité est désormais récompensée.
- **Billet d'entrée** : 10 € + 3 € par étoile de note.
- **Note du parc** (0 à 5 ★) : moyenne lissée chaque soir de la satisfaction des visiteurs (45 %), de la propreté (15 %), de la diversité (15 %), du bien-être des dinosaures (15 %) et du niveau des enclos (10 %).
- **Visiteurs** : faim, envie d'aller aux toilettes, ennui ; ils choisissent les enclos selon leur attractivité et leur distance, vont au restaurant et aux toilettes quand le besoin presse, achètent des souvenirs après quelques enclos, puis repartent. Humeurs affichées : ravi, affamé, pressé, mécontent, effrayé (le simple « content » n'est pas affiché, pour ne pas encombrer l'écran).
- **Propreté** : après un repas, certains visiteurs jettent des déchets, sauf à portée d'une poubelle (3 cases). Une équipe de nuit en retire environ la moitié.
- **Tailles d'enclos** : petit (6 × 6), moyen (10 × 8), grand (14 × 10). Chaque espèce exige une taille minimale et occupe de la place ; un enclos amélioré offre ×1,5 puis ×2 de place. Les reptiles volants vont en **volière**, les marins en **lagon**.
- **Niveaux** : 3 pour chaque bâtiment améliorable. Enclos : palissade en bois → clôture électrifiée → murs de verre avec passerelle d'observation (volière : filet de corde → arches d'acier → dôme de verre ; lagon : bassin naturel → bassin bétonné → aquarium vitré).
- **Améliorations des dinosaures** : « Habitat enrichi » (+20 % d'attractivité, +12 de bonheur) et « Soins premium » (+15 %, +10 de bonheur, maladies moins fréquentes).
- **Cohabitation** : un prédateur ne cohabite qu'avec sa propre espèce. Un avertissement s'affiche à l'achat ; chaque soir, un conflit a 45 % de chances de coûter un dinosaure et de la note.
- **Compsognathus** : en réalité un petit carnivore, il est rangé ici avec les « petits herbivores » comme demandé, et considéré comme inoffensif (non prédateur).
- **Évasions** : un grand prédateur derrière une simple palissade (niveau 1) peut s'évader (15 % par jour) : alarme, visiteurs en fuite, réparation de 2 500 € et note en baisse. Améliorer la clôture supprime ce risque.
- **Événements aléatoires** (45 % de chances par jour à partir du jour 3) : forte affluence (×1,6), orage (×0,55, pluie, brume et éclairs l'après-midi), dinosaure malade (à soigner sous 3 jours sinon il meurt), visite d'un critique (la note évolue selon la satisfaction du jour), mécène (don).
- **Jamais bloqué** : l'argent peut passer en négatif à cause de l'entretien, mais les visiteurs continuent à payer. Sous 2 500 €, la « Fondation paléontologique » verse une subvention de 8 000 € (au plus tous les 5 jours).
- **Déplacer** un bâtiment est gratuit (les dinosaures le suivent). **Démolir** rembourse 60 % de l'investissement (construction + améliorations), et 50 % de la valeur des dinosaures revendus.
- **Score** : jour atteint et gains totaux (recettes cumulées). Le meilleur score est conservé dans le navigateur (menu ☰ → Score).

## Équilibrage

Vérifié par une simulation automatique sous Node (un joueur « raisonnable » qui construit, diversifie et améliore) :

- jour 1 : ~180 visiteurs, ~4 000 € de bénéfice. Les premiers dinosaures se rentabilisent en 1 à 2 jours ;
- jours 10 à 20 : 400 à 1 700 visiteurs, 10 000 à 50 000 € par jour. Les grandes espèces demandent d'épargner ;
- toutes les espèces sont débloquées vers le jour 30 (T-Rex : jour 24 et 3,9 ★) ;
- fin de partie : plus de 100 000 € par jour, pour viser le maximum d'argent.

## Sauvegarde

- Sauvegarde automatique dans le `localStorage` chaque heure de jeu, chaque soir, et quand l'onglet est masqué ou fermé. Les visiteurs présents ne sont pas sauvegardés : une partie reprise en cours de journée repart sans visiteurs, et ils reviennent dans l'heure.
- Si le navigateur bloque le `localStorage` (navigation privée stricte), le jeu fonctionne mais ne sauvegarde pas.

## Limites connues

- Les modèles 3D sont entièrement générés par code (pas de modèles sculptés ni de textures photographiques) : ils sont crédibles et animés, mais restent stylisés.
- Les bulles d'humeur sont dessinées sur le calque 2D et ne sont donc pas masquées par les objets placés devant.
- Le jeu est pensé pour la souris et le clavier. Il reste utilisable sur mobile (glisser, pincer pour zoomer), mais l'interface y est plus serrée.
