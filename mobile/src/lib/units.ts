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

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11-13 -> "th" always. */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
