// Validates Instagram profile screenshots sent with /api/generate. Images are passed to Gemini
// for this one request and never stored or logged.
import { HttpError } from './http.js';

export const MAX_IMAGES = 3;
const MAX_BYTES_EACH = 1.5 * 1024 * 1024; // after base64 decoding (the browser resizes to ~1280px first)
const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
};

export function parseImages(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(422, 'Screenshots must be a list.', { fields: { screenshots: 'Upload 1 to 3 images.' } });
  if (raw.length > MAX_IMAGES) throw new HttpError(422, `Upload at most ${MAX_IMAGES} screenshots.`, { fields: { screenshots: `Upload at most ${MAX_IMAGES} screenshots.` } });
  return raw.map((img, i) => {
    const mime = String(img?.mime || '');
    const data = String(img?.data || '').replace(/^data:[^,]+,/, '');
    if (!MAGIC[mime]) throw new HttpError(422, 'Screenshots must be JPG, PNG or WebP images.', { fields: { screenshots: 'Use JPG, PNG or WebP screenshots.' } });
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(422, 'A screenshot could not be read.', { fields: { screenshots: `Screenshot ${i + 1} couldn't be read. Try another.` } });
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_BYTES_EACH) throw new HttpError(413, 'A screenshot is too large.', { fields: { screenshots: `Screenshot ${i + 1} is too large. Use a normal phone screenshot.` } });
    if (bytes.length < 100 || !MAGIC[mime](bytes)) throw new HttpError(422, 'A file is not a real image.', { fields: { screenshots: `Screenshot ${i + 1} isn't a valid image.` } });
    return { mimeType: mime, data };
  });
}
