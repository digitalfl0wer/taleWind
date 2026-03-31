/**
 * Converts a hex color string to an rgba() string with the given alpha.
 *
 * @param hex - Hex string in the form #rrggbb.
 * @param alpha - Alpha value between 0 and 1.
 * @returns rgba() string for CSS usage.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const bigint = parseInt(cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
