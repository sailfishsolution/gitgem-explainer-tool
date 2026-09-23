/**
 * Dynamic timeline builder: maps an AI-generated Script (chapters + sentences)
 * to a frame layout for the dynamic video composition.
 *
 * Frame convention (matches the existing hardcoded video): frames are 1-indexed,
 * inclusive. A shot with {from, to} is mounted via
 *   <Sequence from={from - 1} durationInFrames={to - from + 1}>
 *
 * Layout (top to bottom of the timeline):
 *   1. Title card            — fixed duration (3s)
 *   2. Per chapter:
 *        - Chapter card      — fixed duration (2s) for chapters 2..N
 *        - Sentences         — duration proportional to text length (min 1s)
 *   3. Ending (fade to black)— fixed duration (2s)
 *
 * The total duration is fixed (totalFrames, set by Short/Medium/Long).
 * Sentence frames are the remainder after title + cards + ending, distributed
 * proportionally to each sentence's text length.
 */

export type DynamicSentence = { id: string; text: string; from: number; to: number };
export type DynamicChapter = {
  chapter: number;
  title: string;
  card: { from: number; to: number } | null;
  sentences: DynamicSentence[];
};
export type DynamicTimeline = {
  title: { from: number; to: number };
  chapters: DynamicChapter[];
  ending: { from: number; to: number };
  totalFrames: number;
};

export type ScriptChapter = { chapter: number; chapterTitle: string; sentences: { id: string; text: string }[] };

const TITLE_DUR = 90;   // 3s
const CARD_DUR = 60;    // 2s per chapter card
const ENDING_DUR = 30;  // 1s — GitGem.org credit card
const MIN_SENTENCE_DUR = 30; // 1s minimum per sentence
const FPS = 30;
/** Breathing room after each line so the subtitle never cuts mid-breath. */
const SENTENCE_PAD_SEC = 0.2;

/** Fallback speech estimate when no measured audio duration is available (~13 chars/sec English). */
const estimateSpeechSec = (text: string): number => Math.max(0.6, text.trim().length / 13);

/**
 * Weight a sentence for timeline allocation: measured audio duration when known,
 * otherwise a text-length speech estimate. Includes a small pad so TTS never
 * outlasts its Sequence (which hard-stops audio and jumps the subtitle).
 */
const sentenceWeightSec = (s: { id: string; text: string }, audioSec?: Record<string, number>): number => {
  const measured = audioSec?.[s.id];
  const base = measured && measured > 0 ? measured : estimateSpeechSec(s.text);
  return base + SENTENCE_PAD_SEC;
};

/** Minimum total frames so every sentence can play its full audio (plus title/cards/ending). */
export function requiredFramesFor(
  chapters: ScriptChapter[],
  selectedFrames: number,
  audioSec?: Record<string, number>,
): number {
  const allSentences = chapters.flatMap((ch) => ch.sentences);
  if (allSentences.length === 0) return selectedFrames;
  const cardCount = Math.max(0, chapters.length - 1);
  const overhead = TITLE_DUR + ENDING_DUR + cardCount * CARD_DUR;
  const speechFrames = Math.ceil(
    allSentences.reduce((acc, s) => acc + sentenceWeightSec(s, audioSec), 0) * FPS * 1.1,
  );
  const withMin = overhead + Math.max(allSentences.length * MIN_SENTENCE_DUR, speechFrames);
  return Math.max(selectedFrames, withMin);
}

export function buildTimeline(
  chapters: ScriptChapter[],
  totalFrames: number,
  audioSec?: Record<string, number>,
): DynamicTimeline {
  const allSentences = chapters.flatMap((ch) => ch.sentences);
  const weights = allSentences.map((s) => sentenceWeightSec(s, audioSec));
  const totalWeightSec = weights.reduce((acc, w) => acc + w, 0) || 1;
  const cardCount = Math.max(0, chapters.length - 1); // chapter cards for chapters 2..N

  // Frames available for sentence content (title + cards + ending reserved)
  const overhead = TITLE_DUR + ENDING_DUR + cardCount * CARD_DUR;
  const available = Math.max(allSentences.length * MIN_SENTENCE_DUR, totalFrames - overhead);
  // Cap so sentences never overflow into the ending
  const sentenceTotal = Math.min(available, Math.max(allSentences.length, totalFrames - overhead));

  // Map measured/estimated speech seconds → frames, preserving relative durations
  const weightToFrames = (w: number) => Math.round((sentenceTotal * w) / totalWeightSec);

  let cur = 1;
  const title = { from: cur, to: cur + TITLE_DUR - 1 };
  cur += TITLE_DUR;

  const chaptersOut: DynamicChapter[] = [];
  let sentenceIdx = 0;
  for (const ch of chapters) {
    const entry: DynamicChapter = {
      chapter: ch.chapter,
      title: ch.chapterTitle,
      card: null,
      sentences: [],
    };
    if (ch.chapter > 1) {
      entry.card = { from: cur, to: cur + CARD_DUR - 1 };
      cur += CARD_DUR;
    }
    for (const s of ch.sentences) {
      const w = weights[sentenceIdx++] ?? sentenceWeightSec(s, audioSec);
      const dur = Math.max(MIN_SENTENCE_DUR, weightToFrames(w));
      entry.sentences.push({ id: s.id, text: s.text, from: cur, to: cur + dur - 1 });
      cur += dur;
    }
    chaptersOut.push(entry);
  }

  // Clamp last sentence so content ends before the ending card
  const endStart = totalFrames - ENDING_DUR + 1;
  for (const ch of chaptersOut) {
    for (const s of ch.sentences) {
      if (s.to >= endStart) {
        s.to = Math.max(s.from, endStart - 1);
      }
    }
  }

  const ending = { from: endStart, to: totalFrames };
  return { title, chapters: chaptersOut, ending, totalFrames };
}
