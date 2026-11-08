// Photos are shrunk in the browser before upload: a phone photo is 3-8 MB, the server accepts 2 MB.
// Re-encoding as JPEG also removes the hidden EXIF data (which can include the photographer's GPS position).
import { MAX_IMAGE_BYTES } from './constants';

export const MAX_SIDE = 1600;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.5];

/** Scale (width, height) down so the longer side is at most `max`. Never scales up. */
export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' }); // respects the phone's rotation
    } catch {
      /* fall back to an <img> element below */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** File -> JPEG Blob (<= ~1.5 MB, longest side <= 1600 px). Throws an Error with a user-readable message. */
export async function prepareImage(file) {
  if (!file.type || !file.type.startsWith('image/')) throw new Error(`"${file.name}" is not a photo.`);
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error(`We could not read "${file.name}". Try a JPEG or PNG photo.`);
  }
  const { width, height } = fitWithin(source.naturalWidth || source.width, source.naturalHeight || source.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();

  let blob = null;
  for (const q of QUALITIES) {
    // eslint-disable-next-line no-await-in-loop
    blob = await toBlob(canvas, q);
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error(`"${file.name}" is too large even after shrinking. Choose a smaller photo.`);
  return blob;
}
