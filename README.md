<p align="center">
  <img src="design/brand/png/regio-lockup-on-light.png" alt="Regio" width="320">
</p>

<p align="center"><b>La régie du culte, simple comme PowerPoint.</b><br>
<i>Church service production, as simple as PowerPoint.</i></p>

---

## Français

**Regio** est une application de bureau gratuite et open source qui permet à n'importe quel bénévole d'une église de projeter et de diffuser un culte du début à la fin :

- **Projection dans la salle** (HDMI), sans dépendre d'Internet et sans écran noir entre deux contenus.
- **Diffusion en direct** sur Facebook, YouTube et d'autres plateformes, avec un seul flux envoyé, adapté aux connexions faibles.
- **Caméras** : une seule suffit (même un téléphone, connecté par QR code, sans application). Plusieurs si l'église en a.
- **Bible intégrée** hors ligne, versets affichés en un clic, en plein écran ou en bandeau sur la caméra.
- **Affiches, annonces, diapos** et import de fichiers PowerPoint.
- **Déroulé du culte** préparé à l'avance, puis déroulé avec « Suivant ».

Regio est pensé pour les églises qui ont peu de matériel, une connexion Internet faible et des PC modestes (Core i3/i5, 8 Go de mémoire).

### État du projet

**En développement.** Le prototype technique est validé sur du vrai matériel (webcam, téléphone, projection, versets). L'application Windows est en cours de construction. Feuille de route : prototype → remplacer PowerPoint → le direct → diffusion sur plusieurs plateformes → version 1.0.

### Technologies

[Tauri 2](https://tauri.app) (Rust) · React + TypeScript · [OBS Studio](https://obsproject.com) comme moteur vidéo, piloté en coulisses · WebRTC pour la caméra du téléphone · SQLite.

### Développer

```bash
npm install
npm run dev          # interface dans le navigateur : http://localhost:1420
npm run build        # vérification TypeScript + construction
npm run test:e2e     # tests de bout en bout (serveur de développement lancé)
npx tauri dev        # application de bureau (Windows : Rust + outils C++ requis)
```

OBS Studio (version 28 ou plus récente) doit être installé, avec son serveur WebSocket activé (Outils → Paramètres du serveur WebSocket).

---

## English

**Regio** is a free, open-source desktop app that lets any church volunteer run a whole service: projection in the room (HDMI, no internet needed, no black screens), live streaming to Facebook and YouTube with a single upload stream, cameras (even a phone joined by QR code, no app to install), an offline Bible, announcements, slides and PowerPoint import, and a service plan you step through with "Next".

It is built for churches with little equipment, weak internet and modest PCs. The interface ships in **French and English**; more languages are welcome.

**Status:** in development. The technical prototype is validated on real hardware; the Windows app is being built.

---

## Licence / License

[Apache-2.0](LICENSE). Polices sous licence SIL Open Font License · Fonts under the SIL Open Font License.
OBS Studio est un logiciel distinct, sous licence GPL-2.0 · OBS Studio is a separate program, licensed under GPL-2.0.
