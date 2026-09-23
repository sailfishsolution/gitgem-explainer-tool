import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, interpolate} from 'remotion';
import {Audio} from '@remotion/media';
import {Fonts, FONT_WIDE, FONT_ORB, FONT_HEAVY} from './lib';
import {DotFieldBg} from './DotFieldBg';
import {fitSize, EM_WIDE} from './textfit';
import {GlitchIn} from './Glitch';
import {buildTimeline, type DynamicTimeline, type ScriptChapter} from './DynamicTimeline';
import {rnd} from './easing';
import {SubtitleLine} from './Subtitle';
import {
  CText, TechText, TechSub,
  PURPLE, PURPLE_TECH, GREY, GREY_MID, WHITE,
  fadeIn, slideUp,
} from '../ui';
import {VIDEO} from '../config';

/**
 * DynamicVideo — a Remotion composition driven by an AI-generated Script.
 *
 * It preserves the GitGem explainer art style (dot-field background, glitch-in
 * title, chapter cards, top progress bar, glowing subtitles, ending fade +
 * credit) but renders content from the script.
 *
 * inputProps: { chapters, topic, audioUrls, audioSec, totalFrames }
 */
export type DynamicVideoProps = {
  chapters: ScriptChapter[];
  topic: string;
  audioUrls?: Record<string, string>;
  /** Measured TTS duration per sentence id (seconds) — keeps subtitles in sync with narration. */
  audioSec?: Record<string, number>;
  totalFrames: number;
};

// ---------- Title ----------
const DynamicTitle: React.FC<{topic: string; from: number}> = ({topic, from}) => {
  const N = useCurrentFrame() + from;
  const a = from;
  const b = from + 89; // title is 90 frames
  const exitN = N - (b - 11);
  const exitOut = (n: number) => {
    if (n < 0) return {dy: 0, op: 1};
    const t = Math.min(1, n / 11);
    return {dy: t * t * 440, op: 1 - Math.pow(t, 1.6)};
  };
  const dy = -exitOut(exitN).dy;
  const op = exitOut(exitN).op;
  const glow = 0.5 + 0.5 * Math.sin((N / 30) * Math.PI);
  return (
    <div style={{position: 'absolute', inset: 0, transform: `translateY(${dy}px)`, opacity: op}}>
      <GlitchIn N={N} f0={a + 11} rgbSplit={6} slices={14} seed={3}>
        <div style={{position: 'absolute', left: 0, top: 268, width: 1280, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 26}}>
          <span style={{fontFamily: FONT_WIDE, fontSize: fitSize(topic, 1120, 118, 64, EM_WIDE, 6), color: WHITE, lineHeight: 1, letterSpacing: 6, textShadow: `0 0 ${18 + 14 * glow}px rgba(102,45,248,${0.55 + 0.3 * glow}), 6px 6px 0 ${PURPLE}`}}>{topic}</span>
        </div>
      </GlitchIn>
      <div style={{position: 'absolute', inset: 0, opacity: fadeIn(N - (a + 20), 10), transform: `translateY(${slideUp(N - (a + 20), 60, 18)}px)`}}>
        <TechText cx={640} cy={446} text="Explained" fontSize={38} scaleX={0.82} weight={700} />
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: fadeIn(N - (a + 28), 10)}}>
        <CText cx={640} cy={520} size={30} weight={500} color={GREY} letterSpacing={6}>
          {VIDEO.title.tagline}
        </CText>
        <div style={{position: 'absolute', left: 520, top: 496, width: 240, height: 2, background: 'rgba(255,255,255,0.35)', transform: `scaleX(${fadeIn(N - (a + 28), 14)})`}} />
      </div>
    </div>
  );
};

// ---------- Chapter card ----------
const DynamicChapterCard: React.FC<{n: number; title: string; from: number}> = ({n, title, from}) => {
  const N = useCurrentFrame() + from;
  const n0 = N - from;
  const to = from + 59; // card is 60 frames
  const exitN = N - (to - 11);
  const exitOut = (x: number) => {
    if (x < 0) return {dy: 0, op: 1};
    const t = Math.min(1, x / 11);
    return {dy: t * t * 440, op: 1 - Math.pow(t, 1.6)};
  };
  const dy = -exitOut(exitN).dy;
  const op = exitOut(exitN).op;
  const w = interpolate(n0, [0, 20], [0, 300], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', inset: 0, transform: `translateY(${dy}px)`, opacity: op}}>
      <div style={{position: 'absolute', opacity: fadeIn(n0, 8)}}>
        <CText cx={640} cy={268} size={54} weight={700} family={FONT_ORB} color={PURPLE_TECH} letterSpacing={4} shadow="0 0 14px rgba(102,45,248,.6)">{`0${n}`}</CText>
      </div>
      <GlitchIn N={N} f0={from + 3} rgbSplit={5} seed={n}>
        <CText cx={640} cy={372} size={fitSize(title, 1100, 80, 46, 1, 3)} weight={900} scaleX={1} letterSpacing={3} style={{WebkitTextStroke: '1px #000', paintOrder: 'stroke fill'}}>{title}</CText>
      </GlitchIn>
      <div style={{position: 'absolute', left: 640 - w / 2, top: 428, width: w, height: 3, background: WHITE, opacity: 0.85}} />
      <div style={{position: 'absolute', opacity: fadeIn(n0 - 10, 10)}}>
        <TechSub cx={640} cy={470} text="Section" size={26} />
      </div>
    </div>
  );
};

// ---------- Progress bar ----------
const DynamicProgressBar: React.FC<{timeline: DynamicTimeline}> = ({timeline}) => {
  const cur = useCurrentFrame() + 1;
  const {totalFrames} = timeline;
  const nch = Math.max(1, timeline.chapters.length);
  const dividers = Array.from({length: nch - 1}, (_, i) => Math.round(((i + 1) * 1280) / nch));
  const centers = Array.from({length: nch}, (_, i) => Math.round(((i + 0.5) * 1280) / nch));
  const chapters = timeline.chapters.map((c, i) => ({text: c.title, cx: centers[i] ?? 640, from: c.card ? c.card.from : c.sentences[0]?.from ?? 1}));
  const fillW = (1280 * cur) / totalFrames;
  let ch = -1;
  for (let i = 0; i < chapters.length; i++) if (cur >= chapters[i].from) ch = i;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: 1280, height: 33, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: 1280, height: 33, transform: 'translateY(0.25px)'}}>
        <div style={{position: 'absolute', left: fillW, top: 0, width: 1280 - fillW, height: 33, background: 'rgba(243, 243, 243, 0.32)'}} />
        <div style={{position: 'absolute', left: 0, top: 0, width: fillW, height: 33, background: 'rgba(124, 92, 252, 0.52)'}} />
      </div>
      {dividers.map((x) => (
        <div key={x} style={{position: 'absolute', left: x - 2, top: 693, width: 4, height: 22, background: 'rgba(255,255,255,0.9)'}} />
      ))}
      {chapters.map((c, i) => (
        <div
          key={c.text}
          style={{
            position: 'absolute', left: c.cx, top: 3.5,
            transform: `translateX(-50%) skewX(-10deg) scaleY(0.9)`, transformOrigin: '50% 50%',
            whiteSpace: 'nowrap', fontFamily: FONT_HEAVY, fontWeight: 900, fontSize: fitSize(c.text, Math.round(1280 / nch) - 30, 24, 17), lineHeight: 1,
            color: i === ch ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.55)',
          }}
        >
          {c.text}
        </div>
      ))}
    </div>
  );
};

// ---------- Subtitles ----------
const DynamicSubtitles: React.FC<{timeline: DynamicTimeline}> = ({timeline}) => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    {timeline.chapters.flatMap((ch) =>
      ch.sentences.map((s) => {
        const duration = Math.max(1, s.to - s.from + 1);
        return (
          <Sequence key={s.id} from={s.from - 1} durationInFrames={duration}>
            <SubtitleLine text={s.text} startFrame={s.from} endFrame={s.to} />
          </Sequence>
        );
      }),
    )}
  </AbsoluteFill>
);

// ---------- Sentence visual (each sentence's content shot) ----------
// Graphical, animated treatment — never a plain static line:
//   • word-by-word pop-in entrance
//   • karaoke highlight: each word glows exactly while the TTS voice says it
//     (timed proportionally from the measured audio duration)
//   • at most 2 key terms get a light purple gradient (kept subtle for readability)
//   • glitch RGB-split entrance (same style as the title)
//   • animated underline sweep + decorative HUD elements
//   • two alternating layouts (corner brackets / ghost number) for variety
//   • gentle float so the frame is always in motion
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const EMPH_MIN = 7; // only genuinely long words are candidates
/** Pick at most 2 emphasized words (longest first, stable) so the sentence stays easy to read. */
const emphIndices = (words: string[]): Set<number> => {
  const cands = words
    .map((w, i) => ({i, len: w.replace(/[^0-9A-Za-z'-]/g, '').length, hasDigit: /\d/.test(w)}))
    .filter((x) => x.hasDigit || x.len >= EMPH_MIN)
    .sort((a, b) => (Number(b.hasDigit) - Number(a.hasDigit)) || (b.len - a.len))
    .slice(0, 2)
    .map((x) => x.i);
  return new Set(cands);
};

const KaraokeWord: React.FC<{
  word: string; delay: number; start: number; end: number; frame: number; emph: boolean; seed: number;
}> = ({word, delay, start, end, frame, emph, seed}) => {
  const n = frame - delay;
  if (n < 0) return <span style={{display: 'inline-block', marginRight: '0.28em', visibility: 'hidden'}}>{word}</span>;
  const p = easeOutCubic(n / 9);
  // Karaoke state from TTS timing: future (dim) -> active (bright glow) -> spoken (settled).
  // NOTE: solid colors + textShadow only — background-clip:text breaks into a
  // solid rectangle when the span is mid opacity/transform transition in Chromium.
  const active = frame >= start && frame < end;
  const future = frame < start;
  const glowPulse = 0.8 + 0.2 * Math.sin(frame / 18 + seed);
  const wordStyle: React.CSSProperties = active
    ? {
        color: '#ffffff',
        textShadow: `0 0 14px rgba(179,161,255,${(0.85 * glowPulse).toFixed(2)}), 0 0 30px rgba(124,92,252,${(0.55 * glowPulse).toFixed(2)}), 0 2px 8px rgba(0,0,0,0.8)`,
      }
    : emph
      ? {
          color: '#cfc0ff',
          textShadow: '0 0 8px rgba(124,92,252,0.35), 0 2px 8px rgba(0,0,0,0.8)',
        }
      : {};
  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: '0.28em',
        transform: `translateY(${((1 - p) * 16).toFixed(1)}px)`,
        opacity: p * (future ? 0.55 : 1),
        ...wordStyle,
      }}
    >
      {word}
    </span>
  );
};

const SentenceShot: React.FC<{
  text: string;
  audioUrl?: string;
  variant: number;
  ghost: string;
  seed: number;
  dur: number;
  /** Measured narration length for this sentence in frames (fallback: word-count estimate). */
  speechFrames: number;
}> = ({text, audioUrl, variant, ghost, seed, dur, speechFrames}) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const emphSet = emphIndices(words);
  // TTS-synced karaoke timing: weight each word by its length, lay the
  // word boundaries across the measured speech duration (slightly short of
  // the full sentence slot so the last word settles before the fade-out).
  const weights = words.map((w) => w.replace(/[^0-9A-Za-z'-]/g, '').length + 2);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const speech = Math.max(15, Math.min(dur - 10, speechFrames));
  let cum = 0;
  const wordStarts = weights.map((w) => {
    const s = (cum / totalWeight) * speech;
    cum += w;
    return s;
  });
  const wordEnds = words.map((_, i) => (i + 1 < words.length ? wordStarts[i + 1] : dur));
  const lastDelay = Math.min(words.length, 14);
  const barDelay = lastDelay + 6;
  const barP = easeOutCubic((frame - barDelay) / 14);
  // Exit fade so the sentence dissolves instead of hard-cutting into the next
  const exitP = easeOutCubic((frame - (dur - 9)) / 9);
  const exitOp = frame > dur - 9 ? 1 - exitP : 1;
  const enterOp = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  // Gentle perpetual float
  const floatY = Math.sin(frame / 44 + seed) * 6;

  // Deterministic drifting glow orbs
  const orbs = Array.from({length: 3}, (_, i) => {
    const bx = 180 + rnd(seed, i, 1) * 920;
    const by = 120 + rnd(seed, i, 2) * 460;
    const r = 110 + rnd(seed, i, 3) * 130;
    const dx = Math.sin(frame / 70 + i * 2.1 + seed) * 36;
    const dy = Math.cos(frame / 85 + i * 1.7 + seed) * 26;
    return {cx: bx + dx, cy: by + dy, r, o: 0.10 + rnd(seed, i, 4) * 0.07};
  });

  const ghostN = frame >= 0 ? interpolate(frame, [0, 16], [0, 1], {extrapolateRight: 'clamp'}) : 0;

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: enterOp * exitOp}}>
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {/* Drifting glow orbs */}
      {orbs.map((o, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: o.cx - o.r,
            top: o.cy - o.r,
            width: o.r * 2,
            height: o.r * 2,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,92,252,0.55), transparent 70%)',
            opacity: o.o,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Variant 1: huge ghost sentence number behind the text */}
      {variant === 1 && (
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, top: 150,
            textAlign: 'center',
            fontFamily: FONT_ORB, fontWeight: 900, fontSize: 300, lineHeight: 1,
            color: 'rgba(124,92,252,0.14)',
            opacity: ghostN,
            transform: `translateY(${(floatY * -0.6).toFixed(1)}px)`,
            pointerEvents: 'none',
          }}
        >
          {ghost}
        </div>
      )}

      {/* Variant 0: animated HUD corner brackets */}
      {variant === 0 && (
        <>
          {([[36, 176, 1, 1], [1244, 176, -1, 1], [36, 544, 1, -1], [1244, 544, -1, -1]] as const).map(([x, y, sx, sy], i) => {
            const p = easeOutCubic((frame - 4 - i * 2) / 10);
            const s = 26 * p;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: x - (sx < 0 ? s : 0), top: y - (sy < 0 ? s : 0),
                  width: s, height: s,
                  borderTop: `3px solid rgba(179,161,255,${0.55 * p})`,
                  borderBottom: `3px solid rgba(179,161,255,${0.55 * p})`,
                  borderLeft: `3px solid rgba(179,161,255,${0.55 * p})`,
                  borderRight: `3px solid rgba(179,161,255,${0.55 * p})`,
                  opacity: p,
                }}
              />
            );
          })}
        </>
      )}

      {/* Glitch entrance + floating text block */}
      <GlitchIn N={frame} f0={2} rgbSplit={4} slices={6} seed={seed + 7}>
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            transform: `translateY(${floatY.toFixed(1)}px)`,
          }}
        >
          <div style={{maxWidth: 1000, textAlign: 'center', position: 'relative'}}>
            <p
              style={{
                fontFamily: FONT_HEAVY,
                fontSize: fitSize(text, 1000, 44, 30),
                color: WHITE,
                lineHeight: 1.45,
                textShadow: '0 0 24px rgba(124,92,252,0.45), 0 2px 8px rgba(0,0,0,0.8)',
                margin: 0,
              }}
            >
              {words.map((w, i) => (
                <KaraokeWord
                  key={i}
                  word={w}
                  delay={Math.min(i, 14)}
                  start={wordStarts[i]}
                  end={wordEnds[i]}
                  frame={frame}
                  emph={emphSet.has(i)}
                  seed={seed + i}
                />
              ))}
            </p>
            {/* Animated underline sweep */}
            <div
              style={{
                marginTop: 18,
                marginLeft: 'auto', marginRight: 'auto',
                width: 420 * barP,
                height: 4,
                borderRadius: 2,
                background: 'linear-gradient(90deg, transparent, #8f7af5, #c9baff, #8f7af5, transparent)',
                boxShadow: '0 0 14px rgba(124,92,252,0.6)',
              }}
            />
          </div>
        </div>
      </GlitchIn>

      {/* Side progress ticks (variant 1) */}
      {variant === 1 && (
        <div style={{position: 'absolute', left: 44, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10}}>
          {Array.from({length: 5}, (_, i) => {
            const p = easeOutCubic((frame - 6 - i * 3) / 8);
            return (
              <div key={i} style={{
                width: 22 * p, height: 4, borderRadius: 2,
                background: i === seed % 5 ? '#b3a1ff' : 'rgba(179,161,255,0.3)',
                boxShadow: i === seed % 5 ? '0 0 10px rgba(143,122,245,0.8)' : 'none',
              }} />
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- Ending — final GitGem credit ----------
const DynamicEnding: React.FC<{from: number; totalFrames: number}> = ({from, totalFrames}) => {
  const N = useCurrentFrame() + from;
  const n = N - from;
  const op = fadeIn(n, 8);
  return (
    <div style={{position: 'absolute', inset: 0, background: '#000', opacity: op}}>
      <div style={{position: 'absolute', inset: 0, opacity: Math.min(fadeIn(n, 4), 1 - fadeIn(N - (totalFrames - 4), 4))}}>
        <CText cx={640} cy={384} size={26} weight={600} color={WHITE} letterSpacing={2}>
          gitgem.org
        </CText>
        <CText cx={640} cy={424} size={16} weight={400} color={GREY_MID} letterSpacing={1}>
          Free AI Explainer Videos
        </CText>
      </div>
    </div>
  );
};

// ---------- Watermark: gitgem.org bottom-right (always on) ----------
const GitGemWatermark: React.FC = () => (
  <div style={{
    position: 'absolute', right: 28, bottom: 48,
    display: 'flex', alignItems: 'center', gap: 8,
    opacity: 0.75, pointerEvents: 'none',
  }}>
    <svg viewBox="-20 -2 40 30" height={18} style={{width: 'auto'}}>
      <path d="M-12,0 L12,0 L0,8 Z" fill="#b3a1ff" />
      <path d="M-12,0 L0,8 L-18,8 Z" fill="#9d8bff" />
      <path d="M12,0 L18,8 L0,8 Z" fill="#8f7af5" />
      <path d="M-18,8 L0,8 L0,26 Z" fill="#7c5cfc" />
      <path d="M18,8 L0,8 L0,26 Z" fill="#6d4fd6" />
      <path d="M-12,0 L12,0 L18,8 L0,26 L-18,8 Z" fill="none" stroke="#3b0f7a" strokeWidth="0.75" strokeLinejoin="round" />
      <path d="M-6,-1.7 L-5,1.5 L-1.8,2.5 L-5,3.5 L-6,6.7 L-7,3.5 L-10.2,2.5 L-7,1.5 Z" fill="#ffffff" />
    </svg>
    <span style={{
      fontFamily: FONT_HEAVY, fontWeight: 700, fontSize: 15,
      color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5,
      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
    }}>
      gitgem.org
    </span>
  </div>
);

// ---------- Main composition ----------
export const DynamicVideo: React.FC<DynamicVideoProps> = ({chapters, topic, audioUrls, audioSec, totalFrames}) => {
  const timeline = useMemo(() => buildTimeline(chapters, totalFrames, audioSec), [chapters, totalFrames, audioSec]);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Fonts />
      <DotFieldBg specs={[]} />
      <Sequence from={timeline.title.from - 1} durationInFrames={timeline.title.to - timeline.title.from + 1}>
        <DynamicTitle topic={topic} from={timeline.title.from} />
      </Sequence>
      {timeline.chapters.map((ch) => (
        <React.Fragment key={ch.chapter}>
          {ch.card && (
            <Sequence from={ch.card.from - 1} durationInFrames={ch.card.to - ch.card.from + 1}>
              <DynamicChapterCard n={ch.chapter} title={ch.title} from={ch.card.from} />
            </Sequence>
          )}
          {ch.sentences.map((s, si) => (
            <Sequence key={s.id} from={s.from - 1} durationInFrames={s.to - s.from + 1}>
              <SentenceShot
                text={s.text}
                audioUrl={audioUrls?.[s.id]}
                variant={(ch.chapter + si) % 2}
                ghost={s.id.replace('S', '')}
                seed={ch.chapter * 100 + si}
                dur={s.to - s.from + 1}
                speechFrames={audioSec?.[s.id] ? Math.round(audioSec[s.id] * 30) : Math.round((s.text.split(/\s+/).length / 2.8) * 30)}
              />
            </Sequence>
          ))}
        </React.Fragment>
      ))}
      <DynamicProgressBar timeline={timeline} />
      <DynamicSubtitles timeline={timeline} />
      <GitGemWatermark />
      <Sequence from={timeline.ending.from - 1} durationInFrames={timeline.ending.to - timeline.ending.from + 1}>
        <DynamicEnding from={timeline.ending.from} totalFrames={totalFrames} />
      </Sequence>
    </AbsoluteFill>
  );
};
