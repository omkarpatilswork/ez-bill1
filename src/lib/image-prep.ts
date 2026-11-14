/**
 * Gets a file ready to be read as a bill.
 *
 * Phone photos are often 3 to 11 MB. The reader rejects anything over 7 MB,
 * and a big upload is slow on mobile data, so photos are shrunk in the
 * browser first: at most MAX_EDGE pixels on the long side, JPEG at 85%.
 * PDFs and anything the browser cannot decode are passed through untouched.
 *
 * scripts/eval/run.mjs --max-edge applies the same treatment, so the effect
 * on accuracy is measured rather than assumed.
 */

// 2400 keeps small print such as invoice numbers legible; a 12 MP photo becomes roughly 1 MB.
export const MAX_EDGE = 2400;
export const JPEG_QUALITY = 0.85;
/** Small images are already fine: do not re-encode them. */
const LEAVE_ALONE_BYTES = 900 * 1024;

export interface ReadyFile {
  /** Base64 without the data-URL prefix, as the functions expect. */
  base64: string;
  type: string;
}

/** The size that fits inside `max` on the long side, keeping the shape. Never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > max)) return { width, height };
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function typeOf(file: File): string {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
}

export async function prepareForReading(file: File): Promise<ReadyFile> {
  const type = typeOf(file);
  const untouched = async () => ({ base64: await readAsBase64(file), type });
  if (!type.startsWith('image/') || typeof createImageBitmap !== 'function') return untouched();

  try {
    // imageOrientation: a phone stores a rotated photo sideways with a note saying so; honour the note.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && file.size <= LEAVE_ALONE_BYTES) { bitmap.close(); return untouched(); }

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return untouched(); }
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    // Keep the original if shrinking somehow made it bigger.
    if (!blob || blob.size >= file.size) return untouched();
    return { base64: await readAsBase64(blob), type: 'image/jpeg' };
  } catch {
    return untouched();
  }
}

/** iPhone photos arrive as HEIC, which neither the browser nor the reader can open. Others pass through. */
export async function toJpegIfHeic(file: File): Promise<File> {
  if (!/\.hei[cf]$/i.test(file.name) && !/hei[cf]/i.test(file.type)) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY }) as Blob;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** The prepared file as bytes, to store exactly what was read. */
export function readyToBlob(ready: ReadyFile): Blob {
  const binary = atob(ready.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: ready.type });
}

/** A storage-safe name whose extension matches what the file now is. */
export function storageName(original: string, type: string): string {
  const base = (original.replace(/\.[a-z0-9]{2,5}$/i, '') || 'bill').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `${base}.${ext}`;
}
