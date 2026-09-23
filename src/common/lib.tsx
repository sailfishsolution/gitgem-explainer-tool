import React from 'react';
import {AbsoluteFill, continueRender, delayRender, staticFile} from 'remotion';

// Canvas & frame conventions: 1280x720 @30fps; frame N starts at 1 (N = useCurrentFrame() + shotFrom).
export const W = 1280;
export const H = 720;
export const FPS = 30;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (t: number, t0: number, t1: number, v0: number, v1: number) => {
  if (t1 === t0) return v1;
  return v0 + (v1 - v0) * clamp((t - t0) / (t1 - t0), 0, 1);
};
/** Piecewise-linear keyframes [frame, value][]. Note: t before the first keyframe returns the first value. */
export const keyframes = (t: number, kf: Array<[number, number]>) => {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) if (t <= kf[i][0]) return lerp(t, kf[i - 1][0], kf[i][0], kf[i - 1][1], kf[i][1]);
  return kf[kf.length - 1][1];
};
export const stepHold = (t: number, kf: Array<[number, number]>) => {
  if (t < kf[0][0]) return 0;
  for (let i = kf.length - 1; i >= 0; i--) if (t >= kf[i][0]) return kf[i][1];
  return 0;
};

// ---- Fonts (bundled with the template, SIL Open Font License) ----
export const FONT_HEAVY = `'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`; // headings, labels, subtitles
export const FONT_TECH = `'Exo 2', 'Helvetica Neue', sans-serif`; // purple bold italic tech words
export const FONT_WIDE = `'Audiowide', 'Orbitron', sans-serif`; // wide display font (titles / acronyms)
export const FONT_ORB = `'Orbitron', 'Audiowide', sans-serif`; // numbers / chapter indexes / HUD counts
export const FONT_MONO = `'SF Mono', Menlo, Consolas, monospace`; // code / tabular numbers
export const FONT_SERIF = `'Times New Roman', Times, serif`; // formulas
export const FONT_EN = `'Helvetica Neue', Helvetica, Arial, sans-serif`;

/** Mount once at the top of the composition; uses delayRender to wait for fonts. */
export const Fonts: React.FC = () => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    Promise.all([
      new FontFace('Exo 2', `url(${staticFile('fonts/Exo2-Italic.ttf')})`, {weight: '100 900', style: 'italic'} as FontFaceDescriptors).load(),
      new FontFace('Audiowide', `url(${staticFile('fonts/Audiowide-Regular.ttf')})`).load(),
      new FontFace('Orbitron', `url(${staticFile('fonts/Orbitron[wght].ttf')})`, {weight: '400 900'} as FontFaceDescriptors).load(),
    ])
      .then((fs) => {
        fs.forEach((f) => (document.fonts as unknown as {add: (f: FontFace) => void}).add(f));
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
  return null;
};