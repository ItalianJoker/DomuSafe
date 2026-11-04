/**
 * Shrinks a photo to a data address the rescue card can store.
 *
 * Preconditions: `file` is an image the browser can decode.
 * Postconditions: the result is a JPEG data address of at most 180000 characters, or null when it cannot be shrunk.
 * Data contract: the address starts with `data:image/jpeg;base64,`.
 *
 * @param file - The file chosen by the person.
 * @returns The data address, or null.
 */
export async function compressPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let url = canvas.toDataURL('image/jpeg', 0.72);
  if (url.length > 180_000) {
    url = canvas.toDataURL('image/jpeg', 0.45);
  }
  return url.length > 180_000 ? null : url;
}
