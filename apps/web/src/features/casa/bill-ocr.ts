/**
 * Reads text from a bill image in the browser.
 * Tesseract loads only when this module is imported — keep it off the shell chunk.
 *
 * Preconditions: `file` is an image the browser can decode.
 * Postconditions: returns recognised plain text, or throws when recognition fails.
 * Data contract: the image never leaves the device; language data is fetched by the library.
 *
 * @param file - Bill photo or scan.
 * @returns Recognised text.
 */
export async function recogniseBillImage(file: File): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(file);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}
