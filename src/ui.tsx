import React from 'react';
import {FONT_HEAVY, FONT_TECH} from './common/lib';

/**
 * Shared primitives and brand palette for the dynamic explainer composition.
 * All components are pure, absolutely positioned on a 1280x720 canvas.
 */
export const PURPLE = '#6630F8';
export const PURPLE_LIGHT = '#A175F1';
export const PURPLE_TECH = '#6530F4';
export const PURPLE_DEEP = '#5A3AD5';
export const PURPLE_PALE = '#E6DCFF';
export const ORANGE = '#F05F41';
export const GREY = '#A0A0A1';
export const GREY_MID = '#747474';
export const GREY_LIGHT = '#D4D4D4';
export const WHITE = '#FFFFFF';
export const TEXT_GLOW = '0 0 12px rgba(255,255,255,.55), 0 0 4px rgba(255,255,255,.35)';

/** Linear fade-in over `len` frames, clamped to [0,1]. */
export const fadeIn = (n: number, len = 12) => Math.min(1, Math.max(0, n / len));
/** Slide-up remaining offset (px): eased power-out curve over 22 frames. */
export const slideUp = (n: number, d = 300, N = 22) => {
  const t = Math.min(1, Math.max(0, n / N));
  return d * Math.pow(1 - t, 2.5);
};

export const abs = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({position: 'absolute', left: x, top: y, width: w, height: h});

// ---- Text ----
export type CTextProps = {
  cx: number; cy: number; size: number; weight?: number; family?: string; color?: string; letterSpacing?: number;
  dy?: number; scaleX?: number; italic?: boolean; opacity?: number; shadow?: string; style?: React.CSSProperties; children: React.ReactNode;
};
/** Single line of text centered on the ink point (cx, cy). */
export const CText: React.FC<CTextProps> = ({cx, cy, size, weight = 700, family = FONT_HEAVY, color = WHITE, letterSpacing = 0, dy = 0, scaleX = 1, italic = false, opacity = 1, shadow, style, children}) => (
  <div style={{position: 'absolute', left: cx, top: cy + dy, transform: `translate(-50%,-50%) scaleX(${scaleX})`, whiteSpace: 'nowrap', fontFamily: family, fontWeight: weight, fontSize: size, fontStyle: italic ? 'italic' : 'normal', lineHeight: 1, color, letterSpacing, opacity, textShadow: shadow, ...style}}>
    {children}
  </div>
);

/** English tech word: Exo 2 purple bold italic. */
export const TechText: React.FC<{cx: number; cy: number; text: string; fontSize?: number; color?: string; scaleX?: number; weight?: number; letterSpacing?: number; glow?: boolean; opacity?: number; style?: React.CSSProperties}> = ({cx, cy, text, fontSize = 32, color = PURPLE_TECH, scaleX = 1, weight = 600, letterSpacing = 1, glow = true, opacity = 1, style}) => (
  <CText cx={cx} cy={cy} size={fontSize} weight={weight} family={FONT_TECH} color={color} letterSpacing={letterSpacing} scaleX={scaleX} italic opacity={opacity} dy={0} shadow={glow ? '0 0 6px rgba(80,30,200,.7)' : undefined} style={style}>
    {text}
  </CText>
);

/** Muted grey sub-label used under headings and chapter cards. */
export const TechSub: React.FC<{cx: number; cy: number; text: string; size?: number; opacity?: number; color?: string}> = ({cx, cy, text, size = 22, opacity = 1, color = GREY_MID}) => (
  <TechText cx={cx} cy={cy} text={text} fontSize={size} color={color} glow={false} letterSpacing={1.5} opacity={opacity} />
);