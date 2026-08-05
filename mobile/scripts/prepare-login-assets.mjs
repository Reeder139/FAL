// Regenerates the bundled login-screen artwork from the full-resolution
// source art in <repo>/Images/Login page assets/.
//
// The source files total ~10.5MB and are sized for print-ish use (the
// background alone is 2160x3840, which decodes to ~33MB of RAM). Shipping
// them raw would bloat the bundle and risk OOM on low-end devices, so this
// downsamples each to the largest size the app can actually display —
// roughly 3x the logical pixels of the widest phone layout — and quantizes
// the transparent PNGs.
//
// Run from mobile/:  node scripts/prepare-login-assets.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — assets are committed. Re-run only when the
// source art changes.

import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images', 'Login page assets');
const OUT_DIR = path.resolve('assets', 'images', 'login');

/** width/height are the *bundled* pixel dimensions, not the source's. */
const TARGETS = [
  // Full-bleed backdrop. JPEG: it's a photographic scene with no
  // transparency, so PNG would be several times larger for no benefit.
  { src: '06_full_background_scene_2160x3840.png', out: 'background.jpg', width: 1080, format: 'jpeg' },
  // The rest keep their alpha channel (rounded corners / cutouts sitting
  // over the background), so they stay PNG — quantized to shrink them.
  { src: '01_fantasy_fishing_logo.png', out: 'logo.png', width: 512, format: 'png' },
  // "prize box 2" replaces 02_prize_box.png — the gold rework that goes with
  // the Carp Leagues mark. Same copy, 3:2 where the original was 12:7, so
  // PRIZE_BOX_RATIO in welcome.tsx tracks this.
  { src: 'prize box 2.png', out: 'prize-box.png', width: 900, format: 'png' },
  { src: '03_login_button.png', out: 'login-button.png', width: 720, format: 'png' },
  { src: '04_register_button.png', out: 'register-button.png', width: 720, format: 'png' },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const available = await readdir(SRC_DIR);
  let totalIn = 0;
  let totalOut = 0;

  for (const target of TARGETS) {
    if (!available.includes(target.src)) {
      console.error(`  MISSING  ${target.src} — skipped`);
      continue;
    }

    const srcPath = path.join(SRC_DIR, target.src);
    const outPath = path.join(OUT_DIR, target.out);

    const pipeline = sharp(srcPath).resize({ width: target.width, withoutEnlargement: true });
    if (target.format === 'jpeg') {
      pipeline.jpeg({ quality: 80, mozjpeg: true });
    } else {
      // palette quantization — these are flat-ish UI graphics, so an
      // indexed palette is visually lossless here and much smaller.
      pipeline.png({ palette: true, quality: 90, effort: 10 });
    }
    await pipeline.toFile(outPath);

    const before = (await stat(srcPath)).size;
    const after = (await stat(outPath)).size;
    totalIn += before;
    totalOut += after;
    console.log(`  ${target.out.padEnd(20)} ${kb(before).padStart(8)} -> ${kb(after).padStart(7)}`);
  }

  console.log(`  ${'TOTAL'.padEnd(20)} ${kb(totalIn).padStart(8)} -> ${kb(totalOut).padStart(7)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
