import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { AppError } from './errors.js';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Resize a photo to a small square WebP and store it. Returns the public path (/uploads/...). */
export async function saveImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, 'Rasm juda katta (koʻpi bilan 15 MB)');
  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input, { failOn: 'error' })
      .rotate() // respect phone camera orientation
      .resize(600, 600, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AppError(400, 'Bu fayl rasm emas yoki buzilgan');
  }
  await fs.mkdir(config.uploadDir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  await fs.writeFile(path.join(config.uploadDir, name), output);
  return `/uploads/${name}`;
}

export async function removeImage(publicPath: string | null | undefined) {
  if (!publicPath?.startsWith('/uploads/')) return;
  const name = path.basename(publicPath);
  await fs.rm(path.join(config.uploadDir, name), { force: true });
}
