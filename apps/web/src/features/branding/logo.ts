import { logoDataUrlSchema } from '@domusafe/contracts';

/**
 * Shrinks a logo to a data address the host mark can store.
 *
 * Preconditions: `file` is an image the browser can decode.
 * Postconditions: the result is a JPEG data address accepted by the branding contract, or null.
 * Data contract: the address starts with `data:image/jpeg;base64,` and stays within the size limit.
 * There is no file store yet, so anything larger is refused.
 *
 * @param file - The file chosen by the person.
 * @returns The data address, or null.
 */
export async function compressLogo(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return null;
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.8, 0.6, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (logoDataUrlSchema.safeParse(url).success) {
      return url;
    }
  }
  return null;
}
