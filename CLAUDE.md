# DiffChurch — Régie de culte

Logiciel desktop (Windows d'abord, fonctionne hors ligne) qui permet à n'importe quel membre du
service communication d'une église de gérer un culte de bout en bout :
projection locale (HDMI), diffusion en direct (Facebook, YouTube, TikTok…), Bible intégrée,
affiches/annonces, diapos type PowerPoint (avec import .pptx), une ou plusieurs caméras.

Le nom « DiffChurch » est provisoire.

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
- **Scène OBS de sortie** gérée par l'app : `DiffChurch - Sortie` = fond de secours + caméra(s) + contenu.
- **Projecteur** = projecteur plein écran OBS (`OpenVideoMixProjector`) sur l'écran HDMI.
- **Téléphone caméra « sans application » (QR code)** : le téléphone ouvre `phone.html` (HTTPS obligatoire
  pour la caméra ; certificat auto-signé dans `.cert/`, non versionné) et envoie caméra + micro en **WebRTC**
  directement à `receiver.html`, chargée dans OBS comme Browser Source (`DiffChurch - Téléphone QR <n>`,
  `reroute_audio` → le son arrive dans le mélangeur OBS). La signalisation passe par `/diffchurch/signal`
  (websocket), fournie en dev par le plugin Vite `server/phone-bridge.ts` (HTTPS sur le port 8443).
  `/diffchurch/info` donne l'adresse Wi-Fi du PC (pour le QR code) et l'état des connexions.
  TODO Tauri : réimplémenter ce pont en Rust.
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
  téléphone le 2026-11-11 : latence bien meilleure que Larix. Reste : encapsulation Tauri sur Windows.
- **Phase 1** : remplacer PowerPoint — diapos, éditeur, import .pptx, Bible complète, médiathèque, déroulé du culte.
- **Phase 2** : le direct — sources du jour, Aperçu/Direct, enregistrement, diffusion 1 plateforme, santé du direct.
- **Phase 3** : multidiffusion (relais), bandeaux sur le direct, plusieurs écrans, écran retour prédicateur.
- **Phase 4** : modèles, raccourcis, télécommande, Stream Deck, mode bénévole.

## Environnement de développement
- Le code est édité dans WSL (`/home/vedem_worker/diff-church`). L'utilisateur teste sous Windows
  (OBS Studio installé sous Windows).
- Phase 0 : `npm run dev` dans WSL → ouvrir `http://localhost:1420` dans un navigateur Windows.
  OBS (Windows) charge `http://localhost:1420/render.html` (redirection localhost WSL2 → Windows).
- Caméra téléphone en dev : le serveur tourne dans WSL → lancer une fois (et après chaque redémarrage
  de WSL) `scripts/telephone-wsl.ps1` dans PowerShell **administrateur** (redirection du port 8443 + pare-feu).
- Tauri (Rust) se compile côté Windows (Rust + Node installés sous Windows) — pas dans WSL
  (pas de webkit2gtk ni de sudo ici).
- Vérifier avec `npm run build` (tsc + vite) avant de rendre la main.
- Tests de bout en bout (serveur de dev lancé) : `npm run test:e2e` = `test:regie` (régie ↔ faux OBS
  `tests/e2e/fake-obs.mjs`) + `test:phone` (caméra téléphone WebRTC avec caméra simulée). Le faux OBS
  doit reproduire le comportement RÉEL d'OBS (ex. CustomEvent sans enveloppe `eventData`).
- Ne jamais lancer `pkill -f "<motif>"` dans une commande qui contient elle-même ce motif (elle se tue).

## Conventions
- Interface utilisateur en **français** ; identifiants de code en anglais ; commentaires en français ou anglais, courts.
- TypeScript strict. React fonctionnel. Pas de dépendance lourde sans raison.
- Noms OBS créés par l'app préfixés `DiffChurch - ` pour ne jamais toucher aux scènes de l'utilisateur.
