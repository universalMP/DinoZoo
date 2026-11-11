# 🦖 DinoZoo

Un jeu de gestion de parc de dinosaures en 3D qui tourne dans le navigateur, en HTML, CSS et JavaScript pur (WebGL 2 écrit à la main). Il n'a besoin ni de serveur, ni d'installation, ni d'accès réseau, ni de bibliothèque externe.

## Lancer le jeu

Ouvrez `index.html` dans un navigateur récent (Chrome, Edge, Firefox ou Safari). C'est tout.

Le jeu se joue en 3D et demande un navigateur qui gère WebGL 2 (tous les navigateurs récents, avec l'accélération matérielle activée). Sans WebGL 2, l'écran de chargement l'indique.

## But du jeu

Construisez des chemins depuis l'entrée, des enclos reliés à ces chemins, puis installez-y des dinosaures. Les visiteurs paient leur billet, se promènent, admirent les enclos et dépensent dans les boutiques et restaurants. Gagnez un maximum d'argent pour agrandir et embellir le parc. Votre score, ce sont le jour atteint et l'argent gagné au total.

- **Un vaste domaine** de 192 × 136 cases : montagnes enneigées, lac, rivières, mer et plages, forêts, jungle et plaines, avec une minicarte pour s'y déplacer.
- **20 espèces** réparties en 5 familles : petits herbivores, grands herbivores et géants, carnivores, reptiles volants, reptiles marins.
- Les espèces se débloquent avec les jours et la **note du parc**.
- **Votre avatar** (nom, genre et tenue choisis à chaque partie) se rend sur chaque chantier et auprès de chaque dinosaure.
- **Des chantiers qui prennent du temps** selon le prix, et des dinosaures **livrés par hélicoptère**.
- **Des naissances** : un mâle et une femelle heureux de la même espèce ont des petits, qui grandissent.
- **Des passerelles** entre enclos (les dinosaures passent au-dessus des allées), des **enclos réunis** quand ils se touchent, et des **combats entre mâles** chez les espèces territoriales.
- **Des passerelles d'observation** pour les visiteurs, au-dessus des enclos : la meilleure vue sur les dinosaures.
- **Des aires de jeux** pour les enfants : balançoires, toboggan, dino à grimper.
- **Des transferts** : une vétérinaire endort le dinosaure, un hélicoptère l'emporte dans un filet jusqu'à son nouvel enclos.
- **3 niveaux** pour chaque enclos, boutique, restaurant, toilettes et aire de jeux.
- Événements aléatoires : affluence, orages, maladies, critiques, mécènes… et évasions si vos clôtures sont trop faibles.
- Cycle jour et nuit, météo.
- **Son 3D haut de gamme**, entièrement synthétisé : voix propres à chaque espèce, pluie, vent et tonnerre d'orage, vagues, rivière, oiseaux, insectes, foule de visiteurs.
- **Six thèmes musicaux orchestraux originaux** qui suivent le moment de la journée et les événements (🎵 pour couper la musique, volumes dans le menu ☰).

## Commandes

| Action | Commande |
| --- | --- |
| Sélectionner / construire | clic gauche |
| Annuler l'outil | clic droit ou `Échap` |
| Déplacer la vue | glisser, flèches, `ZQSD` ou `WASD` |
| Zoomer / dézoomer | molette, `+` / `-` (du gros plan à la vue d'ensemble) |
| Tourner et incliner la caméra (3D) | clic droit glissé ou `Ctrl` + glisser, `[` `]` pour pivoter, `Début` pour recentrer |
| Pause / vitesse | `Espace`, `1` normale, `2` rapide, `3` très rapide |
| Minicarte | clic pour s'y rendre, `N` pour la réduire |
| Outils | `C` chemin, `V` sélection, `M` déplacer, `X` démolir, `Suppr` démolir la sélection |

Sur tablette et téléphone :

| Action | Geste |
| --- | --- |
| Déplacer la vue | glisser un doigt |
| Zoomer, tourner la carte | deux doigts (écarter / rapprocher, pivoter) |
| Incliner la caméra (3D) | deux doigts glissés vers le haut ou le bas |
| Sélectionner | toucher ; appui long pour les informations |
| Construire | toucher pour l'aperçu, toucher l'aperçu pour confirmer |
| Remettre le nord en haut | boussole 🧭 |
| Replier la barre de construction | toucher l'onglet ouvert |

## Organisation du code

```
index.html          page du jeu
css/style.css       interface
js/config.js        équilibrage et palette (à modifier pour rééquilibrer)
js/dinos.js         données des espèces
js/util.js          outils (aléatoire, bruit, couleurs)
js/game.js          logique de jeu (sans rendu)
js/habitats.js      passerelles, enclos réunis, combats entre mâles, prédation
js/amenities.js     passerelles d'observation, aires de jeux, transferts de dinosaures
js/r3d/             rendu 3D WebGL 2 : socle (maths, shaders), maillages, terrain et eau,
                    modèles (bâtiments, arbres, visiteurs), dinosaures articulés, moteur
js/audio.js         environnement sonore 3D (Web Audio)
js/music.js         orchestre de synthèse et thèmes musicaux
js/save.js          sauvegarde locale
js/ui.js            interface
js/tutorial.js      tutoriel
js/main.js          démarrage et boucle
```

Les choix de conception sont détaillés dans [NOTES.md](NOTES.md).
