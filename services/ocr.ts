let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng+fra");
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * OCR local via tesseract.js. Retourne le texte extrait ou null quand l'OCR
 * n'est pas disponible (pas de réseau pour les données linguistiques, etc.).
 */
export async function ocrImageToText(file: File): Promise<{ text: string; language: string } | null> {
  if (!file.type.startsWith("image/")) return null;
  const image = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(`data:${file.type};base64,${image}`);
    const text = data.text.trim();
    return text ? { text, language: "fra" } : null;
  } catch {
    return null;
  }
}