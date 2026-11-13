# Regio — la régie de vos directs (anciennement « DiffChurch »)

**Positionnement (décidé par l'utilisateur le 2026-11-13)** : outil de régie **gratuit, open source, simple, fiable et
multiplateforme** pour **tous ceux qui orchestrent un direct** sur Internet : églises (le besoin d'origine, qui reste la
priorité : Regio doit y répondre COMPLÈTEMENT), mais aussi streamers, créateurs TikTok/YouTube/Facebook, associations…
On continue à développer pour les églises ; ce qui rend Regio utile ailleurs est bienvenu tant que ça reste dans ce
cadre. Conséquences : vocabulaire NEUTRE par défaut dans l'interface (« direct », « programme », « moment ») ; le
vocabulaire d'église vit dans le programme de départ « Un culte d'église » ; la caméra du PC est optionnelle.

Logiciel desktop (Windows d'abord, fonctionne hors ligne) qui permet de gérer un direct de bout en bout
(à l'origine : le service communication d'une église et son culte) :
projection locale (HDMI), diffusion en direct (Facebook, YouTube, TikTok…), Bible intégrée,
affiches/annonces, diapos type PowerPoint (avec import .pptx), une ou plusieurs caméras.

**Nom définitif : Regio** (choisi le 2026-11-12). « Regi » écarté : trop proche de **Resi** (resi.io), entreprise
américaine de diffusion de cultes. `regio.app` pris ; `getregio.app` et `regio.church` semblent libres (à confirmer).
**Dépôt GitHub : https://github.com/ngangoula-jaures/Regio** (branche `main`, SSH). **Privé** depuis le 2026-11-12 ;
à repasser en public avant la candidature SignPath (réservée aux projets open source publics).
Renommage DiffChurch → Regio fait le 2026-11-12 ; à la connexion, l'app supprime les anciennes scènes/sources
`DiffChurch - …` d'OBS (après avoir créé les siennes).

**Plan complet (document partagé)** : https://claude.ai/artifact/QYmxdmBvA2TyWtn87FAJFi
**Open source** : licence **Apache-2.0** ; interface en **français + anglais** dès la 1re version publique
(tous les textes dans des fichiers de langue, aucune chaîne en dur dans les composants).

## Principes produit (non négociables)

1. **Simplicité type PowerPoint.** Un bénévole qui n'a jamais vu le logiciel doit pouvoir
   dérouler un culte. Pas de jargon technique dans l'interface (pas de « RTMP », « scène », « encodeur »).
2. **Une caméra d'abord.** La plupart des églises ont 1 caméra (souvent un téléphone). Le multi-caméra
   est optionnel et se configure le jour même selon ce qui est branché. La variété visuelle vient des
   *mises en page* (caméra seule, caméra + bandeau, contenu plein écran, incrustation…),
   pas des changements d'angle.
3. **Jamais d'écran noir.** Toutes les transitions sont des fondus ; la sortie projecteur reste
   ouverte en permanence. Si une caméra se déconnecte → bascule automatique vers une image de secours.
4. **Connexion faible.** L'église n'envoie qu'UN seul flux montant, redistribué par un relais
   (Restream ou relais auto-hébergé sur VPS). Qualité adaptative. Enregistrement local en pleine qualité toujours.
5. **PC modestes.** Cible : Core i3/i5 (≥ 7e gen, QuickSync), 8 Go RAM. Encodage matériel obligatoire.
6. **Hors ligne.** Tout fonctionne sans Internet sauf la diffusion vers les réseaux.

## Design (exigence forte de l'utilisateur)
- Interface **très belle, élégante, professionnelle**, adaptée au contexte du culte. Le prototype actuel
  (emojis, mise en page brute) sera entièrement redessiné : maquette validée par l'utilisateur AVANT de coder un écran.
- Régie : thème sombre calme (bleu nuit + accent or ; couleurs vives réservées aux états : rouge = direct,
  vert = prêt, orange = attention), gros boutons, police **Inter**, icônes **Lucide** (jamais d'emojis).
- Sortie (assemblée/direct) : lisible du fond de la salle (texte ≥ 5 % de la hauteur, contraste fort,
  ajustement auto de la taille), police à empattements pour les Écritures (Source Serif / Lora), sans
  empattement pour les annonces (Montserrat). Polices libres **embarquées** (hors ligne, pas de CDN).
  Modèles « Classique », « Moderne », « Sobre », personnalisables (logo, couleurs de l'église). WCAG AA.
- **Logo choisi (2026-11-12) : piste 2 « le r à l'écran »** — un écran (cadre arrondi) contenant un « r »
  minuscule dont le bras se termine par un point de lumière or. Fichiers dans `design/brand/` (générés par
  `build_brand.py` + `render_png.mjs` + `make_ico.py` : ne pas éditer les SVG/PNG à la main). Deux dessins :
  « grand » et « petit » (≤ 32 px, traits renforcés). Nom « regio » en minuscules, Sora SemiBold vectorisé.
  Pistes explorées : `design/logo-pistes.html` (artefact https://claude.ai/artifact/EinHp9otDsRbBiEzwCHM4g).
  Retours de l'utilisateur : ondes « Wi-Fi » = trop commun ; il veut du neuf, de l'original.
- **Charte graphique v1.0** : https://claude.ai/artifact/7nK1xEwZsdS7hLR7Qv88uq — source
  `design/charte-graphique.template.html`, assemblée par `design/build_charte.py`. **Jetons de design :
  `src/design/tokens.css`** (source unique des couleurs/polices/tailles/rayons ; l'interface DOIT les utiliser).
  Règles clés : l'or = un seul élément par écran ; rouge = uniquement « en direct » ; sur fond ivoire utiliser
  « or profond » #8F6210 et « ardoise foncée » #535B78 (contrastes vérifiés) ; nom en minuscules dans le logo.
- **Maquettes v1 (2026-11-13)** : https://claude.ai/artifact/QZoyQWWfoTvzNFdpw4v6QH (toile « Design », 3 écrans
  cliquables : Démarrage → Sources du jour → Régie interactive). Copie de référence : `design/maquettes/`.
  **Validées le 2026-11-13 et codées** (voir « Interface » ci-dessous).
- Identité visuelle conçue en parallèle : nom → logo (3 pistes, lisible en 16 px, monochrome possible,
  non confessionnel) → charte (palette, typos, ton) → déclinaisons. Un seul système de design (tokens).

- **Maquette v2 de la régie (2026-11-13, en attente de validation)** : https://claude.ai/artifact/XzemCVvaSXtL28etX3CfvG
  (copie `design/maquettes/v2/`). Suite aux retours de l'utilisateur sur la v1 codée : « mode Présentateur »
  (À l'écran + Ensuite côte à côte), ◀ Précédent / Suivant ▶ (← → espace), rangée de CAMÉRAS cliquables pendant
  le culte (manquait !), écrans nommés « Votre ordinateur » / « Télé / projecteur » (pas « Écran 1/2 »),
  mise en page « Sur la caméra / En plein écran » sans doublon de « Caméra seule ».
  **v3 (même lien, 2026-11-13)** d'après les retours : le déroulé = **moments du culte** (« compartiments »,
  créés par chaque église : Écran d'attente, Louange, Adoration, Prédication, Offrandes…) ; clic sur un moment →
  onglet à droite **à son nom** avec ses contenus ; images/textes/versets **rattachables à un moment**
  (« Ajouter à … ») ; **Bible** : recherche, Livres › Chapitre, chapitre entier → **lecture suivie** (Suivant /
  espace = verset suivant, bandeau « Lecture suivie »). Rangée de caméras approuvée par l'utilisateur.
  La maquette v1 est devenue PUBLIQUE (partagée par l'utilisateur) : ne plus la modifier sans son accord.

- **Maquette v5 (2026-11-13) — VALIDÉE et CODÉE le jour même** : https://claude.ai/artifact/VZqi6ZT9uSGycUEZsc2hcA (copie
  `design/maquettes/v5/`). La v4 « façon Spotify » a été REJETÉE : « un clone de Spotify, une app de musique, pas une
  régie » ; fond trop sombre ; boutons principaux pas assez visibles. Gardé de la v4 : l'espace. Leçon : s'inspirer de
  la *qualité* de Spotify (fluidité, finitions), JAMAIS de sa mise en page ni de ses codes (pochettes, ▶ au survol,
  barres animées, en-têtes teintés). v5 = couleurs de la v3 ; trois zones : CHOISIR (déroulé) · VOIR (contenus du
  moment en grand, diapos lisibles, « Ajouter : Verset / PowerPoint / Image / Texte » à la place des onglets de droite,
  ouverts au centre) · DIFFUSER (à droite, toujours au même endroit : À l'écran, Suivant or très grand, Précédent,
  Caméra seule, mise en page, Ensuite). **Caméras EN GRAND en haut du centre, toujours visibles** (retour de
  l'utilisateur : on regarde les caméras avant de choisir) ; un clic met la caméra à l'écran (un bandeau reste, un plein
  écran s'efface) ; touches 1 à 6. Jusqu'à 6 caméras visibles d'un coup : 1–3 = une rangée, nom dessous ;
  4 = une rangée de 4 ; 5–6 = deux rangées de 3, nom sur l'image.
- **Icône de l'application : « Nuit lumineuse »** (proposition C, 2026-11-13) : dégradé saphir #3A5CCC → bleu nuit + léger
  reflet (`icon()` dans `design/brand/build_brand.py`). Le bleu nuit seul paraissait noir dans la barre des tâches.
  Régénérer : build_brand.py (fonttools) → render_png.mjs → `npx tauri icon design/brand/png/regio-icon-1024.png -o src-tauri/icons`
  (supprimer android/ et ios/) → `make_ico.py src-tauri/icons/icon.ico` → copier regio-icon-32.png en 32x32.png.
  `src-tauri/build.rs` surveille `icons/` : sans ça, l'ancienne icône restait intégrée dans regio.exe.

- **Maquette du direct, Phase 2 (2026-11-13) — VALIDÉE et CODÉE** : https://claude.ai/artifact/GHd8FoYJ1VgrRpfMtUtgHH
  (copie `design/maquettes/direct/`). **Facebook d'abord** (choix de l'utilisateur) : clé de stream PERSISTANTE (configurée
  une fois), RTMPS direct depuis OBS ; Facebook exige encore un clic « Passer en direct » dans sa page Vidéo en direct
  (Regio le rappelle ; automatisation possible plus tard via l'API Facebook). En-tête : Diffuser sur Facebook →
  [Facebook · 720p] Passer en direct → ● EN DIRECT 00:12:34 + voyant santé (popover détails) + Terminer. Assistant 3
  étapes (Où ? / La clé / Test de connexion → qualité conseillée), confirmation, rappel du clic Facebook, alertes
  connexion faible (débit réduit auto) / coupée (reconnexion, l'enregistrement continue), vumètre SON, résumé de fin.
  **Enregistrement = AU CHOIX** (retour de l'utilisateur : « un direct de 2 h, c'est lourd ») : case dans la confirmation,
  décochée la 1re fois puis dernier choix retenu, taille annoncée (~1,4 Go/h en 720p) + espace libre ; l'enregistrement
  réutilise l'encodage du direct (`RecEncoder=none`) : même qualité, aucun effort en plus pour le PC.

## Le direct (codé le 2026-11-13, validé sur le vrai OBS — pas encore essayé avec une vraie clé Facebook)
- `src/app/useLive.ts` : réglages (doc `live` → `data/live.json` : target, key, quality, record), phases unset → ready →
  starting → live → stopping, santé toutes les 2 s (`GetStreamStatus` : reconnexion → coupée ; encombrement > 0,25 ou
  débit < 60 % → faible), refus de Facebook détecté après 20 s. Test de connexion : commande Rust `upload_test`
  (`src-tauri/src/live.rs`, 3 × 4 Mo vers speed.cloudflare.com, rien d'identifiant) ; 720p si ≥ 4,5 Mb/s, sinon 480p ;
  1080p seulement si ≥ 9 Mb/s. `recordings_info` = Vidéos\Regio + espace libre.
- `src/screens/LiveControls.tsx` : en-tête, assistant, confirmation, fin, alertes, vumètre (`InputVolumeMeters`, abonnement
  explicite à la connexion ; DOM mis à jour sans re-rendu de la régie). Fenêtre ouverte = raccourcis de la régie coupés ;
  « Terminer » met le focus sur « Continuer le direct » (un espace par réflexe ne coupe rien).
- **Profil OBS « Regio »** écrit par `obs.rs` (`write_live_profile`) AVANT CHAQUE lancement d'OBS : mode avancé, encodeur
  matériel selon la carte (NVIDIA `obs_nvenc_h264_tex` > Intel `obs_qsv11_v2` > AMD `h264_texture_amf` > `obs_x264` ;
  forçable par `regio-encoder.txt` à côté d'OBS), direct redimensionné (480p 1,5 / 720p 3 / 1080p 6 Mb/s, CBR, image clé 2 s),
  `DynamicBitrate`, reconnexion (60 essais), enregistrement MP4 hybride dans Vidéos\Regio ; `user.ini [Basic]` → profil Regio.
  Changer la qualité → commande `restart_engine` (redémarrage voulu, pas compté comme plantage ; Regio se reconnecte seul).
- **Son** : OBS ne crée PAS toujours ses sources audio au 1er lancement (vu sur le PC de dev : aucune entrée spéciale) →
  Regio crée `Regio - Son` (`wasapi_input_capture`, `device_id: "default"` = périphérique d'enregistrement par défaut de
  Windows) dans la scène de sortie ; elle fait partie des sources FIXES (jamais masquée au changement de caméra).
  Testé le 2026-11-13 : direct Facebook réel OK (image + son). À faire : choisir le périphérique dans Regio.
- **Le son suit l'image** (validé par l'utilisateur : le micro le plus proche de ce qu'on montre) : la caméra affichée
  donne le son — un téléphone = son micro ; une caméra du PC (webcam/HDMI) = `Regio - Son`. **« Garder ce son »**
  (cadenas sur chaque vignette, `obs.ts setKeptAudio`) : le son de cette caméra reste au direct quelle que soit l'image
  (ex. montrer l'assemblée en entendant le prédicateur) — sa source reste ACTIVE mais déplacée hors du cadre
  (positionX = 4 × largeur), les autres sont coupées (`SetInputMute`). Rappel « Son gardé : X · Libérer » ; libéré
  tout seul si la caméra disparaît. Test : `npm run test:multiphone`.
- Facebook : `SetStreamServiceSettings` rtmp_custom `rtmps://live-api-s.facebook.com:443/rtmp/` + clé (avant chaque départ).
- Test : `npm run test:live` (faux OBS : StartStream/Record, GetStreamStatus, niveaux sonores) ; vrai OBS :
  `C:\dev\regio-test\live-real.mjs` (profil + enregistrement de 4 s) et `live-wizard.mjs` (assistant dans l'app).

## Interface (régie v5 codée le 2026-11-13, d'après la maquette v5 validée)
- `src/app/App.tsx` : Démarrage → Sources du jour → Régie. Une fois le culte commencé, la Régie reste montée ;
  « Ajouter une caméra » ouvre les Sources PAR-DESSUS (`.overlay`, raccourcis de la régie désactivés).
  Mode navigateur : `ConnectScreen` d'abord.
- `src/app/useStudio.ts` = état du moteur vidéo (contenu à l'écran, projection, caméras, téléphone).
- **Déroulé = moments du culte** (`src/app/library.ts`) : `{ moments: [{ name, items: [{ label, content }] }], media }`,
  propre à chaque église (ajouter / renommer / supprimer un moment, retirer un contenu, **réordonner les contenus** : poignée à glisser, ou poignée + ↑/↓ ; le contenu à l'écran reste repéré), enregistré
  automatiquement (`src/shared/storage.ts` → commandes Rust `load_data`/`save_data`, fichier
  `%APPDATA%\org.regio.app\data\library.json`, écriture atomique ; navigateur : localStorage).
- **Trois zones** (`src/screens/RegieScreen.tsx`) : CHOISIR (déroulé) · VOIR (`CameraStrip.tsx` = caméras EN GRAND, fixes,
  un clic / touches 1–6 = caméra à l'écran, « PRÊTE · sous le plein écran » si un plein écran la cache ; puis
  `ContentArea.tsx` = le moment en grand, présentations en grille de diapos, taille Normal/Grand ; « Ajouter : Verset ·
  PowerPoint · Image · Texte » ouvre la Bible / les images / le texte AU CENTRE avec « Retour à … » — plus d'onglets)
  · DIFFUSER (`aside.output` : À l'écran, Suivant or très grand, Précédent, Caméra seule, mise en page, Ensuite).
  **Mise en page « Versets et textes » choisie À L'AVANCE** (retour de l'utilisateur) : le choix Sur la caméra / En plein
  écran est toujours actif, retenu (`localStorage regio.layout`) et s'applique à TOUT verset ou texte affiché ensuite
  (déroulé, Bible, Texte) — la mise en page enregistrée dans un contenu est ignorée ; changer le choix pendant qu'un
  verset/texte est à l'écran le bascule sans quitter le déroulé ni la lecture suivie. Aperçus et libellés suivent.
  Réordonner : SEULE la poignée se saisit (un clic tremblé sur une carte doit l'afficher, pas la déplacer).
- **Navigation** — DEUX axes séparés (exigence de l'utilisateur, précisée le 2026-11-13) :
  ↑ / ↓ (ou clic dans le Programme) = CHOISIR un moment, n'affiche RIEN ; ← / → = contenus (diapos, versets) DU moment,
  JAMAIS de passage au moment voisin. Suivant (bouton or) / espace : contenu suivant ; en fin de moment, CHOISIT le
  moment suivant non vide (bouton « Choisir le moment suivant », touches « espace ou ↓ »), l'appui d'après l'affiche ;
  si un autre moment est choisi : « Afficher « <moment> » ». Lecture biblique : ← → = versets. Échap = caméra.
- **Programme** (ex-« Déroulé », renommé : clair pour un culte comme pour un live). 1er lancement : choix du programme
  de départ (`TemplateChooser.tsx`, `templateLibrary` : culte d'église / live-émission / vide). « Créer : Verset ·
  Texte » et « Importer : PowerPoint · PDF · Image » (bien distincts). **PDF** : pdf.js (`src/app/pdf.ts`, chargé à la
  demande, hors ligne) → une page = une diapo (`slides` avec `source: "pdf"`, « PDF · n pages », « Page suivante »).
  Textes et écran d'attente MODIFIABLES (crayon → `EditItemDialog`, mis à jour à l'écran s'il y est). **Toute suppression
  demande confirmation** (`components/Modal.tsx` → `ConfirmDialog`, focus sur « Annuler »). Test : `npm run test:programme`.
- Bible / Images / Texte gardés montés (la Bible garde son chapitre). « Ajouter à <moment> » partout ; toast de confirmation.
- **Bible LSG 1910 complète** (domaine public, eBible.org) : `public/bible/lsg1910.json` (4,2 Mo, construit par
  `scripts/build_bible.py`) ; `src/bible/bible.ts` = chargement, références (« jn 3:16 », « 1jn 4 8 », « ps 23 »,
  abréviations), recherche par mots. Livres › Chapitres › chapitre entier.
- **Images importées** : réduites en JPEG puis enregistrées comme fichiers (`save_media` →
  `%APPDATA%\org.regio.app\media\`), servies à OBS par le serveur local `/media/<fichier>` (noms filtrés).
- **Import PowerPoint « fidèle »** (fait le 2026-11-13, validé dans la vraie application) : bouton « Importer un PowerPoint
  dans <moment> » (application de bureau seulement). Le fichier part en octets bruts (`invoke` + en-tête `x-file-name`)
  vers `src-tauri/src/pptx.rs`, qui lance `pptx_export.ps1` (passé en `-EncodedCommand` : Windows PowerShell 5.1 lit
  les .ps1 sans BOM en ANSI ; attention, ses variables ignorent la casse) → PowerPoint par COM, invisible, exporte
  chaque diapo en JPEG 1920 × 1080 max (diapos masquées sautées) → médias. Progression : événement `pptx-progress`.
  Abandon après 90 s sans nouvelles (mot de passe…). Erreurs : NOPOWERPOINT / FORMAT / EMPTY / TIMEOUT.
  **Une présentation = UN contenu** `{ kind: "slides", slides, index }` (choix de l'utilisateur) : Suivant / Précédent
  = diapo par diapo, puis contenu suivant ; en reculant on arrive sur la dernière diapo ; diapos en grille lisible
  (`.slide-grid` dans `ContentArea.tsx`). Diapo suivante préchargée par la page d'affichage. Test : `npm run test:slides` ; export réel :
  `scripts/win.sh cargo test --manifest-path src-tauri\Cargo.toml --lib pptx -- --include-ignored`
  (présentation de test `C:\dev\regio-test\Chants test.pptx`). Reste : mode « modifiable » (sans PowerPoint).
- **Plusieurs téléphones** (max `MAX_PHONES` = 4) : numéros « 1 », « 2 »… (salle de signalisation + source OBS
  `Regio - Téléphone QR <n>` chacun) ; il y a toujours UN numéro libre avec son QR code (« Ajouter un téléphone (n) »).
  `useStudio.preparePhones` (un seul passage à la fois), `phoneCams`, `freePhone`. Test : `npm run test:multiphone`.
  **Place attribuée par le serveur** (`phone_room` dans `signal.rs`, même règle dans `phone-bridge.ts`) : le n° du QR
  code n'est qu'une préférence ; un téléphone ne chasse JAMAIS un autre téléphone (identifiant d'appareil
  `regio.device` en localStorage) ; s'il est pris → 1re place libre prête dans OBS (message `assigned`), sinon
  fermeture 4009 et nouvel essai. Même appareil (reconnexion) → reprend sa place.
- **Caméras du PC OPTIONNELLES** (demande de l'utilisateur, 2026-11-13 : à l'église on n'utilise jamais la webcam du
  portable ; Regio sert aussi aux streamers) : éteintes par défaut (`active: false` dans OBS : voyant et processeur
  libérés), « Utiliser cette caméra » / « Ne plus utiliser cette caméra » dans Caméras du jour, choix retenu
  (`localStorage regio.cameras.on`, par nom de périphérique). La régie ne montre que `studio.activeCameras` + téléphones ;
  seule une caméra utilisée devient principale d'office. Écouter le direct AU CASQUE (rappelé dans l'encadré Facebook) :
  un haut-parleur près d'un micro crée écho + sifflement (constaté le 2026-11-13).
- Page du téléphone (`src/phone/`) : charte Regio, textes FR/EN (langue du téléphone), icônes Lucide.
- Images : `object-fit: contain` en plein cadre (agrandies si plus petites). Télé réglée hors 16:9 (ex. 1024 × 768)
  → avertissement au démarrage et dans « Télé de la salle » (régler Windows en 1920 × 1080).
  Télé de la salle : `src/screens/RoomDialog.tsx` (« Votre ordinateur » / « Télé / projecteur » / fenêtre d'essai).
- **Textes : jamais en dur** (`src/i18n/fr.ts` + `en.ts`). Styles via les jetons (`base.css`, `app.css`).
  Aperçus réduits : `src/components/MiniScreen.tsx` (même mise en page que la sortie projetée).
- Pas encore fait (ne pas l'afficher comme si ça marchait) : direct sur les
  réseaux, vumètre, « musique hors direct », bascule auto sur le logo si une caméra se débranche,
  import PowerPoint sans PowerPoint (mode « modifiable »), plusieurs déroulés / modèles de culte.

## Architecture

```
Interface (Tauri + React/TS)  ──obs-websocket v5──▶  OBS Studio (moteur vidéo caché)
        │                                                │
        └── BroadcastCustomEvent ──▶ page « render » (Browser Source dans OBS, transparente,
                                      affiche versets/affiches/textes avec fondus CSS)
```

- **Moteur vidéo = OBS** piloté via obs-websocket (intégré à OBS ≥ 28, port 4455). On n'écrit pas
  notre propre mixeur vidéo.
- **Tout le contenu (versets, affiches, textes, diapos) est rendu en HTML/CSS** dans `render.html`,
  chargé par OBS comme Browser Source au-dessus de la caméra. Les transitions sont faites en CSS.
  Le contrôle envoie le contenu via `BroadcastCustomEvent` ; la page render écoute `CustomEvent`.
- **Scène OBS de sortie** gérée par l'app : `Regio - Sortie` = fond de secours + caméra(s) + contenu.
- **Projecteur** = projecteur plein écran OBS (`OpenVideoMixProjector`) sur l'écran HDMI.
- **Téléphone caméra « sans application » (QR code)** : le téléphone ouvre `phone.html` (HTTPS obligatoire
  pour la caméra) et envoie caméra + micro en **WebRTC** directement à `receiver.html`, chargée dans OBS
  comme Browser Source (`Regio - Téléphone QR <n>`, `reroute_audio` → le son arrive dans le mélangeur OBS).
  La signalisation passe par `/regio/signal` (websocket).
- **Serveur local intégré (Rust, `src-tauri/src/server/`)** — fait le 2026-11-12 :
  - serveur LOCAL `127.0.0.1:47811` (HTTP) : pages pour OBS + signalisation rôle « récepteur » uniquement ;
  - serveur TÉLÉPHONE `0.0.0.0:47812` (HTTPS, certificat rcgen dans le dossier de données de l'app) :
    `phone.html` + signalisation rôle « téléphone » uniquement, avec **clé secrète** (`k=` dans le QR,
    renouvelée à chaque lancement). `/regio/info` n'y est PAS exposé. Refus = fermeture code 4003.
  - ports suivants pris si occupés ; l'interface obtient adresse, clé et état via la commande Tauri
    `server_info` (`src/shared/server.ts`), jamais par HTTP (pas de fuite de la clé à une page web).
  - pages lues dans l'exécutable (`asset_resolver`) ; en `tauri dev`, relayées depuis Vite (`tauri::is_dev()`).
  - Mode navigateur (`npm run dev`) : le plugin Vite `server/phone-bridge.ts` joue ce rôle (HTTPS 8443,
    certificat dans `.cert/`, sans clé) ; il est désactivé en `vite --mode tauri` (`npm run dev:tauri`).
  - Test sous Windows, application lancée : `scripts/win.sh node tests/e2e/rust-server.test.mjs`.
- **OBS embarqué et automatique (`src-tauri/src/obs.rs`)** — fait et validé le 2026-11-13 :
  - OBS **33.0.1 portable** (version figée, empreinte SHA-256 vérifiée) dans
    `%LOCALAPPDATA%\org.regio.app\obs\33.0.1\` ; téléchargé une fois au 1er lancement (224 Mo, ~30 s).
    **Installeur (2026-11-13)** : `scripts/build-installer.sh` (WSL) → `scripts/fetch-installer-deps.sh` (OBS zip,
    empreinte vérifiée ; vc_redist.x64.exe, signature Microsoft vérifiée ; dans `src-tauri/resources/`, HORS git) puis
    `tauri build --config src-tauri/tauri.installer.conf.json` → `C:\dev\regio\src-tauri\target\release\bundle\nsis\
    Regio_<v>_x64-setup.exe` (≈ 243 Mo, NSIS, par utilisateur, sans droits admin). Au 1er lancement, `obs.rs` déballe
    l'OBS livré (`resources/obs/…zip`, empreinte revérifiée) au lieu de le télécharger, puis supprime l'archive.
    `installer-hooks.nsh` (UTF-8 avec BOM !) installe le runtime Visual C++ s'il manque (registre 64 et 32 bits).
    WebView2 : bootstrapper embarqué (Internet requis seulement si WebView2 manque, rare). Pas encore signé (SignPath).
    **Testé le 2026-11-13** (simulation de 1re installation sur le PC de dev, `scripts/installer-test/` : 1 = met l'OBS
    de Regio de côté, installe en silencieux `/S`, lance, vérifie ; 2 = sauvegarde les données, désinstalle, remet
    tout) : installation 20 s, prêt en 11 s, OBS déballé DEPUIS l'installeur (aucun téléchargement), archive supprimée,
    désinstallation propre (données gardées).
    **Testé sur un AUTRE PC le 2026-11-13** (portable Dell d'un ami, Windows 11) : avertissement SmartScreen attendu
    (« Informations complémentaires › Exécuter quand même »), installation et lancement OK (écran « Préparation du
    culte » → moteur vidéo « Prêt »), PC connecté à Internet. Toujours non vérifié : PC sans Visual C++ (inconnu chez
    l'ami), installation hors ligne.
    Windows Sandbox inutilisable sur ce PC : « Exception of type System.Exception » (le port 80 était pris par un
    Apache dans WSL — désactivé par l'utilisateur — mais l'erreur persiste : bug du composant Sandbox 0.8.114).
  - Configuré AVANT lancement : `portable_mode.txt`, WebSocket sur **4466** (≠ 4455 d'un OBS installé),
    mot de passe généré une fois (`regio-obs.json`), `global.ini`/`user.ini` créés une seule fois
    (FirstRun, pas de mises à jour, pas de confirmation de fermeture, démarrage dans la zone de notification).
  - Lancé avec `--portable --minimize-to-tray --disable-shutdown-check --disable-updater --multi`.
  - Au lancement, les OBS restés ouverts depuis NOTRE dossier (Regio fermé de force) sont fermés (`kill_leftovers`).
  - Surveillé : relance auto après plantage (~5 s, testé) ; arrêt après 5 plantages en 2 min (message clair) ;
    fermé quand Regio se ferme (testé).
  - Interface : commande Tauri `obs_status` (`src/shared/engine.ts`) → écran de démarrage (`Startup.tsx`) avec
    progression, puis connexion automatique ; reconnexion auto et **réouverture de la projection** après un
    redémarrage d'OBS. Le panneau de connexion manuelle n'existe plus qu'en mode navigateur.
- **Stockage** : SQLite (Bible, médiathèque, déroulés) — à partir de la Phase 1.
- Plus tard : affichage différent projecteur / direct (scène dédiée par sortie), relais multi-plateformes.

### Décisions déjà prises
- Import PowerPoint : mode « fidèle » (pilotage de PowerPoint via COM pour exporter les diapos en images
  HD, si installé) + mode « modifiable » (parsing .pptx maison). Plus tard : mode « PowerPoint en direct »
  pour les animations.
- Multidiffusion : un seul flux → Restream (gratuit 2 plateformes, filigrane) OU relais maison VPS
  (MediaMTX/nginx-rtmp + stunnel pour le RTMPS de Facebook), script d'installation fourni.
- Bibles : uniquement libres de droits (Louis Segond 1910, Darby, Martin, Ostervald, KJV).
- Inspirations retenues (SplitCam) : moniteur de santé du direct, mode répétition, destinations
  préconfigurées, assistant « combien de caméras ? », télécommande depuis le téléphone.
- Téléphone caméra : **uniquement notre caméra QR code (WebRTC)**. Larix Broadcaster est ABANDONNÉ et
  retiré du logiciel (version gratuite : filigrane « TEST STREAM » + coupure après 30 min ; latence et
  image dégradée en SRT). Ne pas le réintroduire, même en « option avancée ». Le mode webcam USB natif
  n'existe pas sur le Samsung de l'utilisateur. Solution principale de l'église : caméscope HDMI + boîtier de capture.
- L'aperçu de la régie = captures OBS toutes les 500 ms → il paraît en retard ; la latence réelle se juge
  sur la sortie projecteur.
- Audio : sortie de table de mixage via interface audio USB ; vumètre ; option « musique hors direct »
  (coupe le son uniquement sur le direct pendant la louange, à cause des droits musicaux).

## Feuille de route
- **Phase 0 (en cours)** : prototype technique — piloter OBS, caméra (webcam/téléphone), projection HDMI,
  fondus caméra ↔ verset/affiche/texte sans écran noir. ✅ Validé sur le vrai matériel le 2026-11-11
  (webcam du PC, téléphone, versets/textes/images). Caméra téléphone QR code (WebRTC) validée sur le vrai
  téléphone le 2026-11-11 : latence bien meilleure que Larix. Application Windows + serveur intégré (2026-11-12),
  OBS embarqué automatique (2026-11-13). Reste : maquettes de la nouvelle interface, puis 1er installeur.
- **Phase 1** : remplacer PowerPoint — diapos, éditeur, import .pptx, Bible complète, médiathèque, déroulé du culte.
- **Phase 2** : le direct — sources du jour, Aperçu/Direct, enregistrement, diffusion 1 plateforme, santé du direct.
- **Phase 3** : multidiffusion (relais), bandeaux sur le direct, plusieurs écrans, écran retour prédicateur.
- **Phase 4** : modèles, raccourcis, télécommande, Stream Deck, mode bénévole.

## Environnement de développement
- Le code est édité dans WSL (`/home/vedem_worker/diff-church`, nom de dossier historique). L'utilisateur teste sous Windows
  (OBS Studio installé sous Windows).
- Navigateur : `npm run dev` dans WSL → ouvrir `http://localhost:1420` dans un navigateur Windows.
  OBS (Windows) charge `http://localhost:1420/render.html` (redirection localhost WSL2 → Windows).
- Caméra téléphone en dev : le serveur tourne dans WSL → lancer une fois (et après chaque redémarrage
  de WSL) `scripts/telephone-wsl.ps1` dans PowerShell **administrateur** (redirection du port 8443 + pare-feu).
- Tauri (Rust) se compile côté Windows (Rust + Node installés sous Windows) — pas dans WSL
  (pas de webkit2gtk ni de sudo ici).
- Vérifier avec `npm run build` (tsc + vite) avant de rendre la main.
- Tests de bout en bout (serveur de dev lancé) : `npm run test:e2e` = `test:regie` (parcours complet
  Démarrage → Sources → Régie ↔ faux OBS `tests/e2e/fake-obs.mjs`, 36 vérifications : navigation, Bible, ajouts, conservation après redémarrage…) + `test:phone` (caméra téléphone WebRTC avec caméra simulée). Le faux OBS
  doit reproduire le comportement RÉEL d'OBS (ex. CustomEvent sans enveloppe `eventData` ; nom de source déjà
  pris refusé, code 601). Les tests du téléphone fixent `locale: "fr-FR"` (la page suit la langue de l'appareil).
- **Compilation Windows (Tauri)** : le code reste dans WSL (source de vérité, git, tests). Windows ne sait
  pas compiler depuis un chemin WSL → `scripts/win.sh` synchronise le code vers `C:\dev\regio`
  (sans node_modules/target/.git) puis y lance la commande Windows : `scripts/win.sh npx.cmd tauri dev`,
  `scripts/win.sh npx.cmd tauri build`. Ne jamais modifier la copie Windows à la main (écrasée à chaque synchro).
  Le script relance `npm ci` côté Windows dès que `package-lock.json` change.
  Validé le 2026-11-12 : `regio.exe` compile (≈ 1 min 20 s en debug après le 1er build).
- Outils Windows installés : Rust 1.99 (MSVC), Node 26, Git 2.56, Build Tools VS 2022, WebView2.
- Smart App Control : DÉSACTIVÉ sur le PC de dev le 2026-11-12 (il bloquait les exécutables de compilation,
  « os error 4551 »). Les PC des églises l'ont souvent actif → **l'installeur distribué doit être signé**
  (cible : SignPath Foundation, gratuit pour l'open source, sur candidature).
- PowerShell : stratégie `RemoteSigned` (CurrentUser) en place ; depuis WSL, utiliser `npm.cmd`/`npx.cmd`.
- Fenêtre Tauri : `dragDropEnabled: false` (sinon WebView2 bloque le glisser-déposer HTML sous Windows).
- **Mise en page robuste** (2026-11-13) : aucun contenu ne doit élargir sa colonne (image 3000 px, nom de fichier à rallonge,
  champ) → `grid-template-columns: minmax(0, 1fr)` / `min-width: 0` partout (sinon la fenêtre se décale) ; fenêtre
  minimale 1100 × 680 (`tauri.conf.json`) ; en dessous de 1280 / 1200 px, la date et les indications de touches
  s'effacent. Garde-fou : `App.tsx` remet la fenêtre à 0 si elle défile. Vérifié par `npm run test:programme`.
- **Fenêtre d'application FIXE** (retour de l'utilisateur : « l'interface se déplace, s'étire ») : `html, body, #root`
  en `overflow: clip` + `overscroll-behavior: none` (ni défilement par glisser prolongé, ni rebond du pavé tactile) ;
  seuls les panneaux défilent (`.plan`, `.center-scroll`, `.output`, `.sources`, `.startup`…). Texte de l'interface non
  sélectionnable (`user-select: none`, sauf champs). WebView2 : `additionalBrowserArgs` coupe le zoom au pincement et la
  navigation par balayage (en gardant les options par défaut de Tauri).
- Piloter la VRAIE application (vérifs de mise en page, import) : lancer `regio.exe` avec
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, puis un script Node Windows
  (`playwright-core` via `createRequire("C:/dev/regio/package.json")`, `chromium.connectOverCDP`). Le navigateur
  sans interface des tests ne reproduit pas toujours les tailles réelles (fenêtre 1366 × 820, zoom 125 %).
- Ne jamais lancer `pkill -f "<motif>"` dans une commande qui contient elle-même ce motif (elle se tue).

## Conventions
- Interface utilisateur en **français** ; identifiants de code en anglais ; commentaires en français ou anglais, courts.
- TypeScript strict. React fonctionnel. Pas de dépendance lourde sans raison.
- Noms OBS créés par l'app préfixés `Regio - ` pour ne jamais toucher aux scènes de l'utilisateur.
