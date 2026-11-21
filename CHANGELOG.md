# Nouveautés · Changelog

## 0.2.0 — après le premier culte en conditions réelles (novembre 2026)

**Mises à jour automatiques**
- Au démarrage, s'il y a Internet, Regio **propose** la nouvelle version (« Installer maintenant » / « Plus tard ») : quelques Mo à télécharger, programmes et réglages gardés. Jamais pendant un direct. *À partir de cette version : la 0.1.0 doit être remplacée une fois à la main.*

**Télé de la salle, comme EasyWorship**
- **Regio à l'écran / Masqué** (touche **T**) : un direct Facebook (ou toute page) étendu sur la télé peut passer devant Regio ; revenir dans Regio le refait passer devant. « Masqué » : plus rien de Regio sur la télé.
- La fenêtre de projection se rouvre toute seule si elle est fermée par erreur.

**Caméra du téléphone**
- **Image nette même en mouvement** : la caméra ne s'effondre plus en 320×180 quand on bouge ou zoome (débit minimum garanti sur le réseau local, résolution gardée). 720p par défaut.
- **Zoom** pendant le direct : pincer l'image, curseur, ou 1× / 2× / 3× (Android ; iPhone selon la version d'iOS).
- L'avertissement « Votre connexion n'est pas privée » du premier scan est expliqué sous le QR code.

**Premier lancement et confort**
- **Choix de la langue** (français / anglais) au premier lancement ; la langue de Windows n'est qu'une suggestion.
- Mise en place du moteur vidéo avec **progression en %** (« ne fermez pas Regio »).
- Direct : encodeurs réglés en mode qualité (même débit, image plus nette).
- Corrections d'affichage (cartes des caméras, boutons).

## 0.1.0 — première version (novembre 2026)

**La régie**
- Trois zones : le **Programme** (moments) · les **caméras en grand** et les contenus du moment · ce qui est **à l'écran** et les commandes.
- Navigation : ↑ ↓ choisissent un moment (sans rien afficher), ← → parcourent ses contenus, **espace / Suivant** avance, **Échap** revient à la caméra, touches **1 à 6** pour les caméras.
- Programmes de départ au premier lancement : culte d'église, live / émission, vide.
- Contenus : versets, textes et bandeaux (sur la caméra ou en plein écran, choisi à l'avance), images, **PowerPoint** (rendu fidèle par PowerPoint) et **PDF** ; textes et écran d'attente modifiables ; contenus réordonnables ; confirmation avant toute suppression.
- **Bible** Louis Segond 1910 complète, hors ligne : recherche, livres et chapitres, lecture suivie.

**Caméras et son**
- Téléphones comme caméras par **QR code** (WebRTC, jusqu'à 4), webcam et boîtier HDMI **optionnels**.
- **Le son suit l'image**, ou **« Garder ce son »** d'une caméra ; choix de l'entrée son (table de mixage USB…) ; vumètre.

**Fiabilité**
- Télé de la salle projetée automatiquement, **jamais d'écran noir** : bascule automatique si une caméra se déconnecte.
- **Mode répétition** : la télé garde l'écran d'attente, le direct est bloqué.
- Moteur vidéo (OBS Studio 33) **inclus et automatique** : installé hors ligne, relancé s'il s'arrête.

**Le direct**
- **Facebook Live** : assistant (clé de stream persistante, test de connexion, qualité 480p / 720p / 1080p), santé du direct, reconnexion automatique, **enregistrement au choix** dans Vidéos\Regio.

**Installation**
- Installeur Windows (10 et 11) sans droits administrateur, fonctionne hors ligne. Pas encore signé : avertissement SmartScreen à la première installation.
- Interface en **français** et en **anglais**.
