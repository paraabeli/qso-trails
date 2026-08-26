'use strict';

const { decodePng, encodePng } = require('./png-codec');

const MIN_WIDTH = 320;
const MAX_WIDTH = 3840;
const DEFAULT_WIDTH = 640;
const LEGACY_WIDTH = 640;
const LEGACY_HEIGHT = 500;
const EARTH_ASPECT_RATIO = 2;
const MAX_OUTPUT_PIXELS = 12_000_000;

function parseStaticWidth(value, fallback = DEFAULT_WIDTH) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(Number(fallback) || DEFAULT_WIDTH)));
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(number)));
}

function staticDimensions(value, theme = 'retro') {
  const width = parseStaticWidth(value);
  const height = theme === 'earth'
    ? Math.round(width / EARTH_ASPECT_RATIO)
    : Math.round(width * LEGACY_HEIGHT / LEGACY_WIDTH);
  if (width * height > MAX_OUTPUT_PIXELS) throw new Error('Requested static image exceeds the pixel safety limit.');
  return { width, height };
}

function resizeRgba(data, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return Buffer.from(data);
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.max(0, Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / targetHeight)));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.max(0, Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / targetWidth)));
      const si = (sy * sourceWidth + sx) * 4;
      const di = (y * targetWidth + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

function resizePng(body, width, height) {
  const image = decodePng(body, { maxPixels: 2_000_000 });
  if (image.width === width && image.height === height) return body;
  return encodePng(width, height, resizeRgba(image.data, image.width, image.height, width, height));
}

module.exports = {
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
  LEGACY_WIDTH,
  LEGACY_HEIGHT,
  EARTH_ASPECT_RATIO,
  MAX_OUTPUT_PIXELS,
  parseStaticWidth,
  staticDimensions,
  resizeRgba,
  resizePng
};
