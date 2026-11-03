/**
 * Compressione foto in-app (valvole/quadro/residente) → data URL JPEG.
 * Obiettivo: anteprima utile senza gonfiare il runbook.
 */

const DEFAULT_MAX_EDGE = 960;
const DEFAULT_QUALITY = 0.72;
const DEFAULT_MAX_BYTES = 180_000;

/**
 * Riduce un File immagine a data URL JPEG (max lato / qualità).
 * Restituisce null se il browser non supporta canvas o il file non è immagine.
 */
export async function compressImageToDataUrl(
  file: File,
  options?: {
    maxEdge?: number;
    quality?: number;
    maxBytes?: number;
  }
): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Fallback FileReader senza compress (limite soft).
    if (file.size > maxBytes) return null;
    return readFileAsDataUrl(file);
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length > maxBytes * 1.37 && q > 0.4) {
    q -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  if (dataUrl.length > maxBytes * 1.37) return null;
  return dataUrl;
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
