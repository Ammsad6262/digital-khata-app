/**
 * Generate the app icon set from the approved logo.
 *
 * Source: public/brand/logo-source.png (the lime "CCC" mark on black).
 *
 * The source is not square, so this script:
 *   1. finds the green mark's bounding box,
 *   2. crops to it (with a little padding),
 *   3. centres it on a square black canvas,
 *   4. writes every icon size the app and PWA reference.
 *
 * Run: node scripts/generate-brand-assets.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "assets", "brand", "logo-source.png");
const OUT = path.join(ROOT, "public");

/** Share of the square canvas the mark's width should occupy. */
const MARK_WIDTH_RATIO = 0.56;

function isMark(r, g, b) {
  return g > 190 && g > r + 30 && g > b + 30;
}

async function markBounds(input) {
  const { data, info } = await sharp(input)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      if (isMark(data[i], data[i + 1], data[i + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error("No green mark found in the source image.");
  return { width, height, minX, minY, maxX, maxY };
}

async function renderIcon(size, cropped, cropWidth, cropHeight) {
  const targetWidth = Math.round(size * MARK_WIDTH_RATIO);
  const targetHeight = Math.max(
    1,
    Math.round((targetWidth * cropHeight) / cropWidth),
  );

  const mark = await sharp(cropped)
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      {
        input: mark,
        left: Math.round((size - targetWidth) / 2),
        top: Math.round((size - targetHeight) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(path.join(OUT, "brand"), { recursive: true });

  const bounds = await markBounds(SOURCE);
  const pad = 6;
  const left = Math.max(0, bounds.minX - pad);
  const top = Math.max(0, bounds.minY - pad);
  const cropWidth = Math.min(bounds.width - left, bounds.maxX - bounds.minX + 1 + pad * 2);
  const cropHeight = Math.min(bounds.height - top, bounds.maxY - bounds.minY + 1 + pad * 2);

  const cropped = await sharp(SOURCE)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const outputs = [
    ["icon.png", 512],
    ["icon-512.png", 512],
    ["icon-192.png", 192],
    ["apple-icon.png", 180],
    ["favicon.png", 64],
  ];

  for (const [name, size] of outputs) {
    const png = await renderIcon(size, cropped, cropWidth, cropHeight);
    await writeFile(path.join(OUT, name), png);
    console.log(`${name.padEnd(18)} ${size}x${size}  ${png.length} bytes`);
  }

  console.log(
    `\nSource mark: ${cropWidth}x${cropHeight} at (${left}, ${top}) in ${bounds.width}x${bounds.height}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
