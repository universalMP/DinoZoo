# Dinosaures : références, erreurs des modèles actuels et invites Meshy

Sources de chaque espèce :
- la section « Description » de l'article Wikipedia en anglais ;
- 7 à 14 reconstitutions de Wikimedia Commons (licences libres) : restaurations en vue de profil, squelettes reconstitués et peintures récentes.

Les images ne servent que de référence. Elles ne sont pas envoyées à Meshy et le dépôt n'en contient aucune.

## Méthode proposée

1. **Image de concept** (Meshy text-to-image, nano-banana-2, 6 crédits) :
   - un seul animal, vu de trois quarts sur fond blanc, en pose neutre ;
   - membres bien séparés du corps, queue et cou droits, gueule fermée.

   Je vérifie chaque image par rapport aux références avant de passer à la suite. Une image ratée ne coûte que 6 crédits.
2. **Image vers 3D** (meshy-7.1, textures 2K, 30 crédits) à partir de l'image validée :
   - environ 20 000 triangles, contre 6 000 à 8 000 aujourd'hui ;
   - texture réaliste.
3. **Squelette ajusté au modèle**, côté jeu, sans coût Meshy :
   - aujourd'hui, c'est le modèle qui est plaqué sur l'ancien pantin procédural, ce qui le déforme ;
   - les os de la tête, de la mâchoire, du cou, de la queue, des pattes et des bras sont placés sur le modèle lui-même ;
   - l'animation suit ensuite ces os.

Les invites reprennent toutes la même fin :

> photorealistic scientific paleoart, single animal, full body, three-quarter side view from the left-front, head pointing right, neutral standing pose, legs straight and slightly apart with all feet visible, arms held slightly away from the body, neck and tail straight, mouth closed, plain pure white background, soft even studio lighting, no shadow, no ground, no text

## Espèces

### Compsognathus
- **Références** : très petit théropode (0,7 à 1,4 m), léger et élancé. Il a :
  - une tête étroite, longue et pointue, avec de grands yeux ;
  - un cou long et fin, des pattes longues et une queue plus longue que le corps ;
  - des bras courts à deux grands doigts griffus ;
  - un duvet de protoplumes filamenteuses, comme son proche parent *Sinosauropteryx*.
- **Modèle actuel** : correct dans l'ensemble, mais il est lisse, a l'air d'un lézard et n'a pas de duvet.
- **Invite** : `Compsognathus, tiny slender compsognathid theropod dinosaur, narrow long pointed head with large eyes, long thin S-curved neck, long slender legs with three-toed bird-like feet, short arms with two large clawed fingers, very long thin tail longer than the body, body covered in short fuzzy filament protofeathers, light tan and rusty brown with faint banding on the tail, pale cream underside`

### Dryosaurus
- **Références** : petit ornithopode bipède et coureur (3 m). Il a :
  - un cou long, des pattes longues et fines, et une queue longue et rigide ;
  - des bras courts à cinq doigts ;
  - une tête courte terminée par un bec corné, avec de grands yeux.
- **Modèle actuel** : il ressemble à un théropode (museau de prédateur) et n'a pas de bec.
- **Invite** : `Dryosaurus, small fast bipedal ornithopod dinosaur, short deep head ending in a small horny toothless beak, large eyes, long flexible neck, compact body, long slender powerful hind legs with three-toed feet, short arms with five small fingers, long stiff tail held straight, scaly skin, olive green back with pale vertical stripes, cream belly`

### Psittacosaurus
- **Références** : petit cératopsien bipède (2 m). Il a :
  - un crâne haut et arrondi avec un bec de perroquet, et des pommettes saillantes en pointe sur les côtés ;
  - pas de collerette ni de cornes ;
  - des bras courts à quatre doigts et un pied à quatre orteils ;
  - une rangée de longues soies tubulaires sur le dessus de la queue ;
  - des écailles, avec un dos foncé et un ventre clair (contre-ombrage connu par un fossile).
- **Modèle actuel** : il ressemble à un théropode. Il n'a ni bec de perroquet ni soies.
- **Invite** : `Psittacosaurus, small bipedal early ceratopsian dinosaur, short tall rounded skull with a hooked parrot-like beak, pointed cheek horns flaring sideways below the eyes, no frill, short arms with four fingers, sturdy hind legs, a row of long quill-like bristles along the top of the tail, scaly skin with countershading, dark brown back, light tan belly`

### Pachycephalosaurus
- **Références** : bipède massif (4,5 m). Il a :
  - un dôme crânien très épais, bordé à l'arrière de nodules osseux, et de courtes pointes émoussées sur le museau ;
  - de grands yeux tournés vers l'avant et un petit bec pointu ;
  - un cou court et épais, un corps trapu, des bras courts, des pattes longues et une queue lourde et rigide.
- **Modèle actuel** : erreur grave. Il porte une voile ou des plaques dorsales de stégosaure, absentes chez cet animal.
- **Invite** : `Pachycephalosaurus, bipedal dome-headed dinosaur, very thick rounded bony skull dome ringed at the back by small bony knobs, short blunt spikes on the snout, small pointed beak, large forward-facing eyes, short thick neck, bulky body, short arms, long strong hind legs, heavy stiff tail held straight, no plates and no spikes on the back, scaly skin, brown and ochre with a paler dome`

### Parasaurolophus
- **Références** : hadrosaure de 7,5 à 9,5 m. Il a :
  - une longue crête tubulaire et creuse, qui part du museau et s'étend vers l'arrière bien au-delà de la tête ;
  - un museau en bec de canard ;
  - de hautes épines vertébrales au-dessus des hanches, qui rehaussent le dos ;
  - des bras courts mais robustes.

  Il broute à quatre pattes et court sur deux. Sa peau est faite de petits tubercules uniformes.
- **Modèle actuel** : il n'a presque pas de crête, et ses proportions sont celles d'un théropode bipède.
- **Invite** : `Parasaurolophus, large hadrosaur dinosaur standing on all four legs, long hollow tubular head crest sweeping backward far behind the head, broad duck-billed snout, deep body with a raised ridge over the hips, sturdy hind legs, shorter but strong front legs with hoof-like hands, long deep tail held straight, finely pebbled scaly skin, olive green and sand with dark vertical bands, pale belly`

### Triceratops
- **Références** : cératopsien quadrupède de 8 à 9 m. Il a :
  - un crâne énorme, jusqu'au tiers du corps ;
  - une collerette osseuse pleine, bordée de petites épines triangulaires (épioccipitaux) ;
  - deux cornes frontales d'environ 1 m au-dessus des yeux et une courte corne nasale ;
  - un bec corné et un corps massif.
- **Modèle actuel** : correct dans l'ensemble, mais la tête est trop petite et la collerette manque de relief.
- **Invite** : `Triceratops, massive quadrupedal horned dinosaur, huge head nearly a third of body length, solid bony neck frill edged with small triangular hornlets, two long forward-curving brow horns above the eyes, short nose horn, parrot-like horny beak, heavy barrel body, sturdy columnar legs, short thick tail, large pebbly scales with scattered bigger scutes, earthy brown and grey with a darker patterned frill`

### Stegosaurus
- **Références** : quadrupède de 6,5 à 7 m. Il a :
  - deux rangées alternées de grandes plaques en forme de cerf-volant, dressées le long d'un dos très arqué ;
  - deux paires de longues pointes horizontales au bout de la queue (thagomizer) ;
  - une petite tête basse et étroite avec un bec ;
  - des pattes avant nettement plus courtes que les pattes arrière, et le point le plus haut au-dessus des hanches.
- **Modèle actuel** : les plaques sont trop régulières, presque en dents de scie, et le dos n'est pas assez arqué.
- **Invite** : `Stegosaurus, quadrupedal plated dinosaur, two alternating rows of large kite-shaped bony plates rising vertically along a strongly arched back, highest point over the hips, four long horizontal spikes at the end of the tail, small narrow low-held head with a beak, front legs much shorter than hind legs, heavy body, scaly skin, olive and dark brown body with reddish plates`

### Ankylosaurus
- **Références** : cuirassé de 6 à 8 m, bas et très large. Il a :
  - un crâne triangulaire, plus large que long, avec des cornes pyramidales vers l'arrière et les côtés ;
  - un dos couvert d'ostéodermes : rangées transversales de plaques ovales à quille ;
  - des pointes courtes sur les flancs ;
  - une queue rigide terminée par une massue osseuse à deux lobes ;
  - des pattes courtes et écartées.
- **Modèle actuel** : erreur grave. Il ressemble à un stégosaure, avec des plaques dressées orange et une queue de lézard enroulée sans massue.
- **Invite** : `Ankylosaurus, low very wide armored dinosaur, broad triangular head wider than long with pyramidal horns pointing backward and sideways, back fully covered by transverse rows of oval keeled bony osteoderm plates, short side spikes along the flanks, stiff straight tail ending in a large two-lobed bony tail club, short stout splayed legs, no tall plates, earthy brown and grey armor with lighter keels`

### Diplodocus
- **Références** : sauropode quadrupède de 24 à 26 m. Il a :
  - un cou très long, porté presque à l'horizontale ;
  - une queue extrêmement longue, terminée en fouet ;
  - des pattes avant un peu plus courtes que les pattes arrière, donc un dos presque horizontal ;
  - une petite tête allongée ;
  - une rangée d'épines kératineuses sur le dos (connue par des empreintes).
- **Modèle actuel** : erreur grave. Il est bipède, avec de petits membres avant.
- **Invite** : `Diplodocus, enormous quadrupedal sauropod dinosaur standing firmly on four columnar elephant-like legs, front legs slightly shorter than hind legs, nearly horizontal back, very long neck held forward almost horizontally, small elongated head, extremely long tail tapering into a thin whip, a row of small keratin spines along the back, wrinkled scaly skin, grey-brown with lighter belly`

### Brachiosaurus
- **Références** : sauropode de 18 à 22 m, avec :
  - des pattes avant plus longues que les pattes arrière, d'où un dos qui descend vers la queue ;
  - un cou très long, levé presque à la verticale ;
  - une petite tête avec une bosse nasale (arcade) au-dessus du museau ;
  - une queue relativement courte.
- **Modèle actuel** : correct dans l'ensemble. Il lui manque la bosse nasale, et il est trop lisse.
- **Invite** : `Brachiosaurus, giant quadrupedal sauropod dinosaur, front legs clearly longer than hind legs so the back slopes down toward the tail, very long neck raised steeply upward like a giraffe, small head with a high rounded nasal arch above the snout, deep chest, columnar legs, relatively short thick tail, wrinkled scaly skin, grey-green with lighter belly`

### Velociraptor
- **Références** : petit dromaeosaure (1,5 à 2 m, 0,5 m aux hanches). Il a :
  - un corps entièrement emplumé, avec de vraies plumes de vol sur les avant-bras (traces d'insertion sur le cubitus) ;
  - un museau long, étroit et légèrement relevé, avec un dessus concave ;
  - une grande griffe en faucille au deuxième orteil ;
  - une queue longue et rigide, avec un éventail de plumes au bout.
- **Modèle actuel** : il est écailleux et porte des « peignes » rigides sur la queue.
- **Invite** : `Velociraptor, small dromaeosaurid dinosaur fully covered in feathers, long narrow slightly upturned snout, large wing-like feathered arms with long flight feathers on the forearms and clawed fingers, enlarged sickle claw raised on the second toe of each foot, slender legs, long stiff straight tail ending in a fan of feathers, tan and dark brown plumage with barred wing and tail feathers, pale throat`

### Dilophosaurus
- **Références** : théropode élancé de 6 à 7 m. Il a :
  - deux crêtes fines, minces et parallèles le long du dessus du crâne, en arc ;
  - un museau étroit avec une encoche entre le prémaxillaire et le maxillaire (kink) ;
  - un cou assez long et une silhouette légère.

  Il n'avait ni collerette ni venin : ce sont des inventions du cinéma.
- **Modèle actuel** : une seule crête triangulaire rouge, mal placée.
- **Invite** : `Dilophosaurus, slender medium-sized theropod dinosaur, two thin parallel semicircular bony crests running along the top of the skull side by side, narrow snout with a distinct notch in the upper jaw behind the front teeth, fairly long neck, lightly built body, long legs, strong arms with clawed hands, long straight tail, no neck frill, scaly skin, tan and olive with darker stripes, crests with a red-orange edge`

### Allosaurus
- **Références** : grand théropode de 7 à 9 m. Il a :
  - un crâne massif sur un cou court ;
  - de petites cornes lacrymales au-dessus et en avant des yeux, et des crêtes basses le long du museau ;
  - des bras réduits mais forts, à trois doigts griffus ;
  - une queue longue, légèrement inclinée.
- **Modèle actuel** : correct dans l'ensemble, mais générique et peu détaillé.
- **Invite** : `Allosaurus, large theropod dinosaur, massive long skull on a short thick neck, small triangular lacrimal horns in front of the eyes and low ridges along the snout, strong arms with three large curved claws, powerful legs, long slightly sloping tail held straight, rough scaly skin, reddish brown with dark stripes on the back, pale underside`

### Carnotaurus
- **Références** : abélisauridé de 7,5 à 8 m. Il a :
  - un crâne très court et haut, avec deux cornes épaisses et coniques au-dessus des yeux ;
  - des bras minuscules, réduits à des moignons ;
  - des pattes longues et fines, et une queue puissante ;
  - une peau de petites écailles avec des rangées de gros tubercules coniques le long du flanc.
- **Modèle actuel** : correct dans l'ensemble. Les cornes sont faibles et les bras trop grands.
- **Invite** : `Carnotaurus, abelisaurid theropod dinosaur, very short deep bulldog-like skull with two thick conical bull horns above the eyes, tiny vestigial stub arms, long slender legs, deep tail base, skin of small scales with rows of large conical bumps along the flanks, dark red-brown with a lighter belly`

### Spinosaurus
- **Références** : très grand spinosauridé (14 à 15 m). Il a :
  - une haute voile dorsale, formée d'épines vertébrales très allongées ;
  - un museau long, étroit et bas, comme celui d'un crocodile, avec les narines reculées et des dents coniques droites ;
  - des pattes arrière courtes ;
  - une queue haute et aplatie comme une nageoire-pagaie (reconstitutions depuis 2020) ;
  - des bras robustes avec une grande griffe au pouce.
- **Modèle actuel** : la voile est petite et la queue fine, sans nageoire.
- **Invite** : `Spinosaurus, huge semi-aquatic spinosaurid theropod standing on two short hind legs, tall sail on its back made of elongated spines, long narrow low crocodile-like snout with straight conical teeth and nostrils set far back, robust arms with a large hooked thumb claw, deep paddle-like tail with tall fin along the top and bottom, scaly skin, grey-olive body with a red and dark banded sail`

### Tyrannosaurus (T-Rex)
- **Références** : 12 à 13 m. Il a :
  - un crâne énorme, très large à l'arrière, avec un museau plus étroit (vision binoculaire) ;
  - des yeux tournés vers l'avant et des dents en forme de banane, recouvertes de lèvres ;
  - un cou épais en S et des bras minuscules à deux doigts ;
  - des pattes puissantes, un corps profond et une longue queue musclée ;
  - une peau de petites écailles (empreintes connues).
- **Modèle actuel** : correct dans l'ensemble. La tête n'est pas assez large à l'arrière, et le modèle est générique et peu détaillé.
- **Invite** : `Tyrannosaurus rex, huge theropod dinosaur, massive deep skull very wide at the back with a narrower snout and forward-facing eyes, lipped jaws covering the teeth, thick S-curved muscular neck, tiny two-fingered arms, deep chest, very powerful legs, long heavy muscular tail held straight, finely scaled skin with scattered larger scales, dark brown and olive with lighter belly`

### Pteranodon
- **Références** : envergure de 5,6 m chez le mâle. Il a :
  - un long bec pointu sans dents, légèrement relevé ;
  - une grande crête osseuse tournée vers l'arrière, longue chez le mâle ;
  - des ailes membraneuses tendues par un très long quatrième doigt ;
  - un corps court, une queue minuscule et un pelage de pycnofibres.
- **Modèle actuel** : la crête est invisible et les ailes sont trop plates et trop régulières.
- **Invite** : `Pteranodon longiceps male pterosaur in flight seen from above at three-quarter angle, wings fully spread flat, long pointed toothless beak, long backward-pointing head crest, short furry body with fine pycnofibers, tiny tail, wing membranes stretched by a very long fourth finger, legs trailing behind, white and grey body, dark grey wing membranes, red-orange crest`

### Quetzalcoatlus
- **Références** : azhdarchidé géant (10 à 11 m d'envergure). Il a :
  - un cou extrêmement long et raide ;
  - une énorme tête au bec long, droit et pointu, avec une petite crête ;
  - des ailes larges, avec une membrane qui va jusqu'aux chevilles ;
  - un corps couvert de pycnofibres.

  Au sol, il marche à quatre pattes.
- **Modèle actuel** : les ailes sont rectangulaires et irréalistes, et le cou est trop court.
- **Invite** : `Quetzalcoatlus, giant azhdarchid pterosaur in soaring flight seen from above at three-quarter angle, broad wings fully spread with membrane reaching the ankles, extremely long stiff neck stretched forward, huge head with long straight pointed toothless beak and small crest, short body covered in fine fuzz, legs trailing, white and pale grey body, grey-brown wings, dark beak tip`

### Plesiosaurus
- **Références** : plésiosaure du Jurassique inférieur (3 à 3,5 m). Il a :
  - une petite tête étroite, avec des dents en aiguille tournées vers l'avant ;
  - un cou long et souple ;
  - un corps large et aplati, comme celui d'une tortue ;
  - quatre longues nageoires étroites en forme d'aile ;
  - une queue courte.
- **Modèle actuel** : erreur grave. Il a un corps de poisson, un cou court et une nageoire caudale.
- **Invite** : `Plesiosaurus marine reptile swimming, small narrow head with needle-like teeth, long flexible neck held straight forward, broad flattened turtle-like body, four long narrow wing-shaped flippers spread out to the sides, short pointed tail without fin, smooth skin, dark blue-grey back and pale belly, seen from above at three-quarter angle`

### Mosasaurus
- **Références** : mosasaure de 11 à 13 m. Il a :
  - une longue tête de varan aux mâchoires puissantes et aux dents coniques ;
  - un corps fuselé et 4 nageoires-pagaies ;
  - une queue terminée par une nageoire en croissant, à lobe inférieur porté par la colonne vertébrale qui s'incurve vers le bas ;
  - de petites écailles ;
  - un contre-ombrage : dos sombre et ventre clair.
- **Modèle actuel** : correct dans l'ensemble, mais il ressemble à un poisson et sa nageoire caudale est peu marquée.
- **Invite** : `Mosasaurus giant marine reptile swimming, long monitor-lizard-like head with powerful jaws and conical teeth, streamlined whale-like body, four paddle flippers, long tail ending in a crescent-shaped two-lobed tail fluke with the spine bending down into the lower lobe, fine scales, dark blue-black back with pale cream belly, seen from the side at three-quarter angle`

## Coût estimé (tarifs Meshy du 21 novembre 2026)

| Poste | Calcul | Crédits |
|---|---|---|
| Images de concept (nano-banana-2) | 20 espèces × 1,5 essai en moyenne × 6 | ≈ 180 |
| Image vers 3D (meshy-7.1, textures 2K) | 20 × 30 | 600 |
| Marge pour les reprises (environ 1 espèce sur 4) | 5 × (6 + 30) | ≈ 180 |
| **Total** | | **≈ 960 (fourchette : 720 à 1 100)** |

Solde actuel : 24 crédits. Il faut donc recharger environ 1 000 crédits.

Options :
- **Pilote d'abord** : T-Rex, Diplodocus et Pteranodon (un bipède, un quadrupède, un volant), environ 110 à 130 crédits. Ce pilote valide la chaîne et le nouveau squelette avant de lancer les 17 autres.
- **Vues multiples** : une vue de côté en plus pour chaque espèce (image-to-image, 6 crédits), puis multi-image-to-3d au même prix que l'image unique. C'est environ +120 crédits pour une meilleure épaisseur du corps.
- **Images de concept nano-banana-pro** (9 au lieu de 6) : meilleure fidélité anatomique, environ +90 crédits.

## Résultat (21 novembre 2026)

| Poste | Crédits |
|---|---|
| 24 images de concept (20 + 4 refaites : Dilophosaure, Spinosaure, Ptéranodon, Quetzalcoatlus) | 144 |
| 20 modèles image vers 3D | 600 |
| **Total dépensé** | **744** (reste 280) |

Les 20 modèles font environ 20 000 triangles, avec une texture de 1536 px. Ils sont animés par un squelette ajusté à chacun (`js/r3d/rigfit.js`, `js/r3d/skel3d.js`).
