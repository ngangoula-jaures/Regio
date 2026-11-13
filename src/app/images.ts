// Réduit une image importée à 1920×1080 max (JPEG) pour l'envoyer à la page de sortie.
// Phase 0 : l'image voyage dans le message OBS (data URL), il faut donc la garder légère.

const MAX_W = 1920;
const MAX_H = 1080;

export async function loadImageAsDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}
