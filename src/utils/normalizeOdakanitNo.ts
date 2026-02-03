/**
 * Canonical normalization for Odakanit case numbers across the app.
 *
 * - Converts NBSP to regular spaces.
 * - Removes all whitespace characters.
 * - Trims leading/trailing spaces.
 *
 * This should be the ONLY place that defines the normalization logic
 * for odakanitNo when doing lookups / comparisons.
 */
export const normalizeOdakanitNo = (raw?: string | null): string =>
  (raw || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .trim();


