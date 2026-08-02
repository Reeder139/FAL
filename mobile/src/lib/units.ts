/**
 * Display-only conversion from weight_oz (integer ounces) to "32lb 4oz".
 * Never store or compute with the output of this — weight_oz stays the
 * source of truth everywhere else. See CLAUDE.md "Weights: integer ounces,
 * always".
 */
export function formatWeightOz(weightOz: number): string {
  const lb = Math.floor(weightOz / 16);
  const oz = weightOz % 16;
  return `${lb}lb ${oz}oz`;
}

/** Inverse of formatWeightOz — the only place lb/oz form input should get
 * converted before it's stored as weight_oz. */
export function toWeightOz(lb: number, oz: number): number {
  return lb * 16 + oz;
}
