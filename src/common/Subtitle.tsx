import React from 'react';
import {Sequence, useCurrentFrame, interpolate} from 'remotion';
import {fitSize} from './textfit';

/**
 * Gitgem-branded subtitle styling with purple gradient, glow effects, and modern design
 */
export const SUB_STYLE = {
  fontSize: 42,
  weight: 700,
  top: 620,
  // Anchor from the BOTTOM of the frame so multi-line boxes never get cut
  bottom: 34,
  // Gradient colors for text (orange / yellow)
  gradientColors: ['#ffe566', '#ffb703', '#fb8500'], // light yellow → orange → deep orange
  stroke: 2,
  strokeColor: '#1a1200',
  // Glow effect (orange glow)
  glowColor: 'rgba(255, 183, 3, 0.65)',
  glowSize: 12,
  // Background (dark for contrast)
  bgColor: 'rgba(0, 0, 0, 0.75)',
  padding: '10px 20px',
  borderRadius: 12,
  // Border orange/yellow
  borderColor: '#ffb703',
  borderWidth: 3,
  borderGlow: '0 0 15px rgba(255, 183, 3, 0.55)',
};

export const SUB_MAX_W = 1100;

const ring = (r: number, k: number, col: string) => Array.from({length: k}, (_, i) => {
  const a = (i / k) * Math.PI * 2;
  return `${(Math.cos(a) * r).toFixed(2)}px ${(Math.sin(a) * r).toFixed(2)}px 0 ${col}`;
});

export const strokeShadow = (w = SUB_STYLE.stroke, col = SUB_STYLE.strokeColor) =>
  [...ring(w, 12, col), ...ring(w * 0.5, 6, col)].join(', ');

export const SubtitleLine: React.FC<{
  text: string;
  top?: number;
  left?: number;
  color?: string;
  stroke?: number;
  frame?: number;
  startFrame?: number;
  endFrame?: number;
}> = ({
  text,
  top = SUB_STYLE.top,
  left = 640,
  color,
  stroke = SUB_STYLE.stroke,
  frame = 0,
  startFrame = 0,
  endFrame = 100,
}) => {
  const currentFrame = useCurrentFrame();
  
  // Fade in/out animation
  const fadeIn = interpolate(currentFrame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(currentFrame, [endFrame - startFrame - 8, endFrame - startFrame], [1, 0], {extrapolateLeft: 'clamp'});
  const opacity = Math.min(fadeIn, fadeOut);
  
  // Slide up animation with bounce
  const slideY = interpolate(currentFrame, [0, 10], [20, 0], {
    extrapolateRight: 'clamp',
  });
  
  // Glow pulse animation
  const glowPulse = interpolate(currentFrame, [0, 15, 30], [0.4, 1, 0.7], {
    extrapolateRight: 'clamp',
  });
  
  const size = fitSize(text, SUB_MAX_W, SUB_STYLE.fontSize, 34);
  const lh = 1.3;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    // Bottom-anchored so the box always fits inside the frame, no matter
    // how many lines the subtitle wraps to (fixes clipped subtitle boxes)
    bottom: SUB_STYLE.bottom - slideY,
    transform: 'translateX(-50%)',
    opacity,
    zIndex: 100,
    maxWidth: SUB_MAX_W,
  };

  const textStyle: React.CSSProperties = {
    fontFamily: `'Inter', 'Segoe UI', 'Noto Sans SC', sans-serif`,
    fontWeight: SUB_STYLE.weight,
    fontSize: size,
    lineHeight: lh,
    // Gradient text using background clip
    background: `linear-gradient(135deg, ${SUB_STYLE.gradientColors.join(', ')})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    // Glow effect
    filter: `drop-shadow(0 0 ${SUB_STYLE.glowSize * glowPulse}px ${SUB_STYLE.glowColor})`,
    textAlign: 'center',
    // Always wrap — never clip long lines mid-sentence
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
  };

  const bgStyle: React.CSSProperties = {
    background: SUB_STYLE.bgColor,
    padding: SUB_STYLE.padding,
    borderRadius: SUB_STYLE.borderRadius,
    border: `${SUB_STYLE.borderWidth}px solid ${SUB_STYLE.borderColor}`,
    boxShadow: `${SUB_STYLE.borderGlow}, 0 4px 20px rgba(0, 0, 0, 0.6)`,
    display: 'inline-block',
    position: 'relative',
    // overflow visible: hidden was clipping long subtitle text mid-line
    overflow: 'visible',
    maxWidth: SUB_MAX_W,
  };

  // Animated shine effect
  const shineStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
    transform: `translateX(${interpolate(currentFrame, [0, 30], [-100, 200], {extrapolateRight: 'clamp'})}%)`,
    pointerEvents: 'none',
    borderRadius: SUB_STYLE.borderRadius,
  };

  return (
    <div style={containerStyle}>
      <div style={bgStyle}>
        <div style={textStyle}>{text}</div>
        <div style={shineStyle} />
      </div>
    </div>
  );
};
