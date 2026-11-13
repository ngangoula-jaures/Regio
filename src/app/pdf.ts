// Import de PDF : chaque page devient une image (comme une diapo), rendue par pdf.js (Mozilla), hors ligne.
// Chargé seulement au moment d'un import (pdf.js pèse lourd : pas au démarrage de Regio).

/** Rend chaque page en JPEG, ajustée dans 1920 × 1080. `onPage(n, total)` suit l'avancement. */
export async function pdfToImages(file: File, onPage: (done: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const images: string[] = [];
  try {
    onPage(0, doc.numPages);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1920 / base.width, 1080 / base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; // fond blanc, comme sur papier (sinon transparent → noir)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.9));
      page.cleanup();
      onPage(i, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return images;
}
