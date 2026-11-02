/**
 * Generazione QR leggera via `qrcode` (SVG string, zero binding nativi Node).
 * Usata per stampare / mostrare il link pubblico al runbook Livello 1.
 */
import QRCode from 'qrcode';

/**
 * Produce un markup SVG del QR per `payload`.
 * Preferiamo SVG rispetto a canvas: stampa A4 nitida e nessun asset raster.
 */
export async function generateQrSvg(
  payload: string,
  size = 160
): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
