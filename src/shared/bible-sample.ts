// Échantillon Louis Segond 1910 (domaine public) pour la Phase 0.
// La Bible complète (SQLite) arrive en Phase 1.

export interface Verse {
  reference: string;
  text: string;
  version: string;
}

export const SAMPLE_VERSES: Verse[] = [
  {
    reference: "Jean 3:16",
    text: "Car Dieu a tant aimé le monde qu'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu'il ait la vie éternelle.",
    version: "LSG 1910",
  },
  {
    reference: "Psaume 23:1",
    text: "L'Éternel est mon berger : je ne manquerai de rien.",
    version: "LSG 1910",
  },
  {
    reference: "Philippiens 4:13",
    text: "Je puis tout par celui qui me fortifie.",
    version: "LSG 1910",
  },
];
