// Validates Instagram profile screenshots sent with /api/generate. Images are passed to Gemini
// for this one request and never stored or logged.
import { HttpError } from './http.js';

export const MAX_IMAGES = 3;
const MAX_BYTES_EACH = 1.5 * 1024 * 1024; // after base64 decoding (the browser resizes to ~1280px first)
export const MAGIC = {
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

// Profile picture / cover image uploads from the editor. The browser crops and compresses
// first (avatar 512×512, cover 1600×600 JPEG), so these caps are generous but bounded.
// product = a product's cover image (1200×675). It's stored with kind 'cover' so the existing
// store_assets check constraint needs no migration; the kind is only used for size limits.
export const ASSET_KINDS = { avatar: 400 * 1024, cover: 900 * 1024, product: 700 * 1024 };
export const DB_KIND = { avatar: 'avatar', cover: 'cover', product: 'cover' };
const LABELS = { avatar: 'profile picture', cover: 'cover image', product: 'product image' };

export function parseAssetUpload(body) {
  const kind = String(body?.kind || '');
  const mime = String(body?.mime || '');
  const data = String(body?.data || '').replace(/^data:[^,]+,/, '');
  const label = LABELS[kind] || 'image';
  if (!Object.hasOwn(ASSET_KINDS, kind)) throw new HttpError(422, 'Unknown image type.');
  if (!MAGIC[mime]) throw new HttpError(422, `Your ${label} must be a JPG, PNG or WebP image.`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(422, `We couldn't read that ${label}. Try another image.`);
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > ASSET_KINDS[kind]) throw new HttpError(413, `That ${label} is too large. Try a smaller image.`);
  if (bytes.length < 100 || !MAGIC[mime](bytes)) throw new HttpError(422, `That file isn't a valid image.`);
  return { kind, mime, bytes, source: body?.source === 'ai' ? 'ai' : 'upload' };
}
