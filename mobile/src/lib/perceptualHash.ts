import { decode } from 'jpeg-js';

/**
 * Difference hash (dHash) over a small fixed grid. The caller is
 * responsible for resizing the source down to that grid first (see
 * catchPhoto.ts) — this function just decodes whatever it's given and
 * compares each pixel's luminance to its right neighbour, producing a
 * stable hex string. Small JPEG re-compression of the *same* underlying
 * photo produces the same (or a near-identical) hash, which is what makes
 * this usable for duplicate-submission detection.
 */
export function computePerceptualHash(bytes: ArrayBuffer): string {
  const { width, height, data } = decode(new Uint8Array(bytes), { useTArray: true });

  const luminanceAt = (x: number, y: number): number => {
    const offset = (y * width + x) * 4;
    return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  };

  let bits = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      bits += luminanceAt(x, y) < luminanceAt(x + 1, y) ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
  }
  return hex;
}
