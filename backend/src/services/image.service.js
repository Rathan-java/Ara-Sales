'use strict';

/**
 * Image downscaling + recompression for visit photos.
 *
 * Phone cameras produce 3-5 MB JPEGs. For verification we only need a readable
 * image, so we downscale to a max dimension and recompress to a target JPEG
 * quality. This typically shrinks a photo to ~40-120 KB — small enough to store
 * comfortably in MySQL (STORAGE_DRIVER=mysql) and cheap on any backend.
 *
 * Uses `jimp` (pure JavaScript — no native binaries) so it deploys to Azure App
 * Service / any host with zero platform-specific build steps.
 */

const Jimp = require('jimp');
const config = require('../config');

/**
 * Compress + resize an image buffer to a JPEG.
 * Falls back to the original buffer if processing fails (never blocks an upload).
 * @param {Buffer} buffer original image bytes
 * @returns {Promise<{ buffer:Buffer, width:number, height:number, bytes:number }>}
 */
async function compressImage(buffer) {
  const maxDim = config.image.maxDimension;
  const quality = config.image.jpegQuality;
  try {
    const img = await Jimp.read(buffer);
    // Scale down only if larger than maxDim (never upscale).
    if (img.bitmap.width > maxDim || img.bitmap.height > maxDim) {
      // scaleToFit keeps aspect ratio, fitting within maxDim x maxDim.
      img.scaleToFit(maxDim, maxDim);
    }
    img.quality(quality);
    const out = await img.getBufferAsync(Jimp.MIME_JPEG);
    return { buffer: out, width: img.bitmap.width, height: img.bitmap.height, bytes: out.length };
  } catch (err) {
    // Corrupt/unsupported image — keep the original rather than failing the visit.
    // eslint-disable-next-line no-console
    console.warn('[image] compression failed, storing original:', err.message);
    return { buffer, width: 0, height: 0, bytes: buffer.length };
  }
}

module.exports = { compressImage };
