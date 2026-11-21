# Vidéos de présentation de Regio

Deux vidéos de 45 s, chacune en 16:9 (Facebook, YouTube) et 9:16 (TikTok, Reels, Statuts) :
**A** « Regio pour votre église » (ambiance africaine) · **B** « Regio pour tous vos directs » (neutre, mixte).
Scénario validé : `scenario.html`.

Fabrication (serveur de développement `npm run dev` lancé pour les captures) :

1. `node design/video/fetch-photos.mjs` : photos Unsplash (licence gratuite, liste et auteurs : `photos.json`).
2. `node design/video/capture.mjs a` puis `b` : captures HD de la vraie interface, contenu de démonstration.
3. `node design/video/preview.mjs a 169 1,5,10 planche.png` : planche d'aperçu d'instants choisis.
4. `node design/video/render.mjs` : les 4 MP4 dans `design/video/out/` (non versionnés).

`film.html?v=a&fmt=169&play=1` lit la vidéo en temps réel dans un navigateur (servie par `static.mjs`).
5. `python3 design/video/sound.py` (`pip install edge-tts`) : voix-off + musique → `out/*-son.mp4`. Textes, horaires,
   voix (Microsoft neuronales, via edge-tts : seul le texte est envoyé) et musiques (Mixkit, licence gratuite sans
   attribution) dans `sound.json`. La musique baisse sous la voix ; volume final -14 LUFS (réseaux sociaux).
