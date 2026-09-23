import React, {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {BgSpec} from './types';

/**
 * Dot-field wave backdrop: a deterministic diagonal light wave sweeping over a
 * dot grid — the signature background of the explainer style.
 * - Deterministic per frame: t = frame / fps * speed; the wave crosses every ~9.3s at speed 1.5.
 * - Design space is 960x540, scaled up to cover 1280x720: 36px spacing -> 48px on screen,
 *   dot radius 1.5-2 -> 2-2.7px; base #0b0c11, dot color #cfe0ff,
 *   alpha (0.2 + 0.6k^2) * radial edge falloff, k = normalized distance to the wave front;
 *   a static grain overlay (opacity .06) prevents banding.
 * - With a BgSpec of stars:'none' in range the whole layer is skipped (pure black).
 */
const DW = 960, DH = 540;
export const DOT_STEP = 36, DOT_X0 = 24, DOT_Y0 = 18;
const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";

const drawDots = (ctx: CanvasRenderingContext2D, t: number) => {
  ctx.fillStyle = '#0b0c11';
  ctx.fillRect(-DW, -DH, DW * 3, DH * 3);
  const phase = ((t % 14) / 14) * 1700 - 300;
  for (let y = DOT_Y0; y < DH; y += DOT_STEP) {
    for (let x = DOT_X0; x < DW; x += DOT_STEP) {
      const d = Math.abs(x + y * 0.6 - phase);
      const k = Math.max(0, 1 - d / 280);
      const kk = k * k;
      const edge = Math.min(1, Math.max(0, 1.25 - Math.hypot((x - 480) / 560, (y - 270) / 360)));
      ctx.globalAlpha = (0.2 + 0.6 * kk) * edge;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + 0.5 * kk, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

const DotCanvas: React.FC<{t: number}> = ({t}) => {
  const {width, height} = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = Math.max(width / DW, height / DH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(s, 0, 0, s, (width - DW * s) / 2, (height - DH * s) / 2);
    drawDots(ctx, t);
  }, [t, width, height]);
  return <canvas ref={ref} width={width} height={height} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
};

export const DotFieldBg: React.FC<{specs: BgSpec[]; speed?: number; grain?: boolean}> = ({specs, speed = 1.5, grain = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const N = frame + 1;
  let show = true;
  for (const s of specs) {
    if (N >= s.from && N <= s.to && s.stars === 'none') show = false;
  }
  if (!show) return null;
  const t = (frame / fps) * speed;
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: '#0b0b0f'}}>
      <DotCanvas t={t} />
      {grain ? <div style={{position: 'absolute', inset: 0, backgroundImage: GRAIN_URL, backgroundSize: '160px 160px', opacity: 0.06, mixBlendMode: 'overlay', pointerEvents: 'none'}} /> : null}
    </div>
  );
};