/**
 * Text width estimation and adaptive font sizing — pure functions, no DOM
 * measurement, so rendering is deterministic (identical output on any machine).
 *
 * Per-character em widths are measured averages for the bundled fonts (weight 700-900):
 *   lowercase .566, uppercase .668, digits .590, space .227, punctuation .325
 *   accented Latin letters (e ü n ...) .49-.69 -> use .58
 *   punctuation / arrows / math symbols from U+2000 are almost always 1em
 *   (overestimating is the safe direction — it only shrinks the font a bit early)
 *   Audiowide uppercase .788 / Orbitron uppercase .815 / Exo 2 uppercase .606 -> EM_* factors
 */
export const EM_HEAVY = 1;      // body / subtitles / headings
export const EM_WIDE = 1.18;    // Audiowide (titles, uppercase acronyms)
export const EM_ORB = 1.2;      // Orbitron (numbers / chapter indexes)
export const EM_TECH = 0.92;    // Exo 2 (italic tech words)

/** Estimate the width of a string in em units (1em = fontSize px). */
export const textEm = (s: string, emScale = 1): number => {
  let em = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 32;
    if (c >= 0x2000) em += 1;                              // wide punctuation / arrows / math symbols
    else if (ch === ' ') em += 0.227;
    else if (ch >= 'A' && ch <= 'Z') em += 0.668;
    else if (ch >= '0' && ch <= '9') em += 0.59;
    else if (ch >= 'a' && ch <= 'z') em += 0.566;
    else if (c >= 0xc0 && c < 0x250) em += 0.58;           // accented Latin letters
    else em += 0.325;                                      // narrow punctuation
  }
  return em * emScale;
};

/** Character count (by code point, not UTF-16 units). */
const charCount = (s: string): number => [...s].length;

/**
 * Estimated width in px. letterSpacing is a CSS px value: Chromium adds it
 * after every character (including the last) and it does not scale with font
 * size, so large text with letterSpacing must account for it.
 */
export const textW = (s: string, size: number, emScale = 1, letterSpacing = 0): number => textEm(s, emScale) * size + letterSpacing * charCount(s);

/**
 * Shrink the font size proportionally when text is too wide, down to minSize
 * (default 78%). Returned value is rounded to 0.1px to avoid subpixel jitter.
 */
export const fitSize = (s: string, maxW: number, size: number, minSize = size * 0.78, emScale = 1, letterSpacing = 0): number => {
  const em = textEm(s, emScale);
  const extra = letterSpacing * charCount(s);
  if (em * size + extra <= maxW) return size;
  return Math.max(minSize, Math.round(((maxW - extra) / Math.max(1e-6, em)) * 10) / 10);
};