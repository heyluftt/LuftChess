import type { Quality } from "../types";
import { qualityLabel } from "../format";

/** Zeichen im Abzeichen, kurz genug für 16 px */
export const badgeGlyph: Record<Quality, string> = {
  best: "★",
  gut: "✓",
  buch: "≡",
  ungenau: "?!",
  fehler: "?",
  verpasst: "✕",
  patzer: "??",
};

export function QualityBadge({ q, size = 16 }: { q: Quality; size?: number }) {
  return (
    <span
      className={`qbadge qb--${q}`}
      style={{ width: size, height: size, fontSize: size * (badgeGlyph[q].length > 1 ? 0.56 : 0.66) }}
      title={qualityLabel[q]}
      aria-label={qualityLabel[q]}
    >
      {badgeGlyph[q]}
    </span>
  );
}
