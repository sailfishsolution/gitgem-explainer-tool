import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  AI: Ai;
  GROQ_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Repair truncated JSON by closing open strings/arrays/objects
function repairTruncatedJSON(s: string): string | null {
  let out = s.trim();
  // Remove trailing incomplete escape
  if (out.endsWith('\\')) out = out.slice(0, -1);
  // Close any open string
  const opens = (out.match(/"/g) || []).length;
  if (opens % 2 === 1) out += '"';
  // Count unclosed braces/brackets outside strings
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (const ch of out) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // If we were mid-string when closing, the last quote might have broken structure —
  // prefer stack-based close of containers only
  while (stack.length) out += stack.pop();
  try {
    JSON.parse(out);
    return out;
  } catch {
    return null;
  }
}

function isQuotaError(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && (e as any).quota === true) return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const low = msg.toLowerCase();
  return (
    low.includes('quota') ||
    low.includes('rate limit') ||
    low.includes('10020') ||
    low.includes('exceeded') ||
    low.includes('billing') ||
    low.includes('429') ||
    low.includes('daily limit') ||
    low.includes('daily free allocation') ||
    low.includes('used up') ||
    low.includes('neurons') ||
    low.includes('4006')
  );
}

// ---------------------------------------------------------------------------
// SCRIPT GENERATION
// ---------------------------------------------------------------------------

// Length presets — APPROXIMATE targets. The video timeline is sized from the
// actual TTS audio duration in the browser, so the script never has to be
// butchered to fit an exact number of seconds. Longer videos get more depth.
const LENGTH_SPECS: Record<string, {
  chapterCount: number;
  sentenceTarget: number;
  maxWordsPerSentence: number;
  wordBudget: number;        // soft target for the LLM
  wordBudgetHard: number;    // hard cap — drop overflow SENTENCES (never trim words)
  hardSentenceWords: number; // only sentences longer than this get clause-trimmed
  depthHint: string;
}> = {
  short: {
    chapterCount: 3,
    sentenceTarget: 7,
    maxWordsPerSentence: 14,
    wordBudget: 60,
    wordBudgetHard: 90,
    hardSentenceWords: 22,
    depthHint:
      'This is a SHORT (~30 second) video. Cover the hook and the single most important core answer. Be concise but NEVER clipped — every sentence must be complete and natural.',
  },
  medium: {
    chapterCount: 5,
    sentenceTarget: 14,
    maxWordsPerSentence: 18,
    wordBudget: 130,
    wordBudgetHard: 180,
    hardSentenceWords: 26,
    depthHint:
      'This is a MEDIUM (~60 second) video. Be substantially more detailed than a short: explain HOW it works step by step, add one concrete example or comparison.',
  },
  long: {
    chapterCount: 7,
    sentenceTarget: 22,
    maxWordsPerSentence: 20,
    wordBudget: 200,
    wordBudgetHard: 260,
    hardSentenceWords: 26,
    depthHint:
      'This is a LONG (~90 second) video. Be as detailed and thorough as possible: mechanisms, examples, common misconceptions, and practical advice. Depth is the priority.',
  },
};

const countWords = (chapters: any[]): number =>
  (Array.isArray(chapters) ? chapters : []).reduce(
    (acc, ch) => acc + (Array.isArray(ch?.sentences) ? ch.sentences : []).reduce(
      (a: number, s: any) => {
        const t = typeof s === 'string' ? s : s?.text;
        return a + (t ? String(t).trim().split(/\s+/).filter(Boolean).length : 0);
      },
      0,
    ),
    0,
  );

/**
 * Light-touch normalization: keep every sentence COMPLETE. Only sentences that
 * are absurdly long get truncated (at a clause boundary, never mid-clause),
 * and if the whole script is way over budget we drop complete sentences from
 * the tail instead of cutting words out of the middle of sentences.
 */
const shapeScript = (
  chapters: any[],
  spec: { chapterCount: number; sentenceTarget: number; wordBudgetHard: number; hardSentenceWords: number },
): any[] | null => {
  if (!Array.isArray(chapters) || chapters.length === 0) return null;

  // Cap chapters at target (keep the first N); require at least 2
  let chs = chapters.slice(0, Math.max(2, spec.chapterCount));
  if (chs.length < 2) return null;

  // Per-chapter sentence cap (generous — allow slight overflow)
  const perChapter = Math.ceil(spec.sentenceTarget / chs.length) + 2;

  // Truncate only absurdly long sentences, at a clause boundary when possible
  const fixSentence = (text: string): string | null => {
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length <= spec.hardSentenceWords) {
      return String(text).trim();
    }
    let cut = words.slice(0, spec.hardSentenceWords);
    // Prefer ending at a clause boundary (comma / dash) rather than mid-clause
    const punctIdx = cut.map((w, i) => (/[,;:—-]$/.test(w) ? i : -1)).filter((i) => i >= spec.hardSentenceWords * 0.5);
    if (punctIdx.length > 0) cut = cut.slice(0, punctIdx[punctIdx.length - 1] + 1);
    // Avoid ending on a trailing conjunction/preposition
    while (cut.length > 3 && /^(and|or|but|the|a|an|of|to|in|on|for|with|that|which|is|are)$/i.test(cut[cut.length - 1])) {
      cut.pop();
    }
    return cut.join(' ').replace(/[,;:—-]+$/, '') + '.';
  };

  chs = chs.map((ch: any, ci: number) => {
    let sents = (Array.isArray(ch.sentences) ? ch.sentences : [])
      .map((s: any) => (typeof s === 'string' ? { text: s } : s))
      .filter((s: any) => s && typeof s.text === 'string' && s.text.trim())
      .map((s: any) => ({ id: s.id, text: fixSentence(s.text) }))
      .filter((s: any) => s.text)
      .slice(0, perChapter);
    return {
      chapter: ci + 1,
      chapterTitle: String(ch.chapterTitle || ch.title || `Chapter ${ci + 1}`).slice(0, 80),
      sentences: sents,
    };
  }).filter((ch: any) => ch.sentences.length > 0);

  if (chs.length === 0) return null;

  // If the total is far over the hard budget, drop complete sentences from the
  // tail (one at a time) until roughly in range — never cut words mid-sentence.
  while (chs.length > 0 && countWords(chs) > spec.wordBudgetHard) {
    const last = chs[chs.length - 1];
    if (last.sentences.length <= 1) {
      if (chs.length === 1) break; // never drop the only chapter
      chs = chs.slice(0, -1);
    } else {
      last.sentences = last.sentences.slice(0, -1);
    }
  }

  // Re-id sentences S01.. across the whole script
  let n = 0;
  return chs.map((ch: any) => ({
    ...ch,
    sentences: (ch.sentences || []).map((s: any) => {
      n += 1;
      return { ...s, id: `S${String(n).padStart(2, '0')}` };
    }),
  }));
};

// Free Groq fallback (OpenAI-compatible free tier)
async function generateWithGroq(apiKey: string, system: string, user: string): Promise<string> {
  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
  let lastErr = 'groq_failed';
  for (const model of models) {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 4096,
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        lastErr = `groq ${model} ${resp.status}: ${text.slice(0, 200)}`;
        if (resp.status === 429) throw Object.assign(new Error(lastErr), { quota: true });
        continue;
      }
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = `groq ${model} invalid JSON envelope`;
        continue;
      }
      const raw = data?.choices?.[0]?.message?.content ?? '';
      if (!raw) {
        lastErr = `groq ${model} empty choices`;
        continue;
      }
      return raw;
    } catch (e: any) {
      if (e?.quota) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

// Generate script from topic using Cloudflare Workers AI (free: 10k neurons/day)
app.post('/api/generate-script', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'bad_request' }, 400);
  }
  const { topic, length = 'short' } = body ?? {};

  if (!topic || typeof topic !== 'string' || topic.length > 500) {
    return c.json({ error: 'Topic is required (max 500 chars)', code: 'bad_topic' }, 400);
  }

  const spec = LENGTH_SPECS[length] || LENGTH_SPECS.short;

  const systemPrompt = `You write narration scripts for explainer videos that will be read aloud by text-to-speech.
Hard rules — violate none:
1. Output ONLY a single JSON object. No markdown, no commentary.
2. Every sentence must be a COMPLETE, natural, grammatical sentence. Never clip a phrase short or end mid-thought.
3. Sentences should be ${spec.maxWordsPerSentence} words or fewer each, but completeness beats brevity.
4. Use clear, speakable language — concrete and specific, not essay prose.
5. The script must directly and thoroughly ANSWER the user's question/topic within the target length.`;

  const prompt = `Write a narrated explainer video script about: ${topic}

${spec.depthHint}

JSON only:
{"chapters":[{"chapter":1,"chapterTitle":"...","sentences":[{"id":"S01","text":"..."}]}]}

Constraints:
- About ${spec.chapterCount} chapters with ~${spec.sentenceTarget} sentences total
- TOTAL of roughly ${spec.wordBudget} words across all sentences (a little over is fine)
- ${spec.maxWordsPerSentence} words max per sentence — but every sentence must be complete
- Chapter 1: hook + direct answer. Middle chapters: how it works in detail. Final: practical takeaways
- Since TTS reads the text aloud, write for the ear: short complete sentences, no parentheses, no bullet lists`;

  try {
    const models = [
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      '@cf/qwen/qwen3-30b-a3b-fp8',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ];

    let lastError: unknown;
    let bestChapters: any[] | null = null;
    let bestScore = -1;

    const normalize = (chapters: any[]): any[] =>
      chapters
        .map((ch: any, i: number) => ({
          chapter: i + 1,
          chapterTitle: ch.chapterTitle || ch.title || `Chapter ${i + 1}`,
          sentences: (Array.isArray(ch.sentences) ? ch.sentences : [])
            .map((s: any, j: number) =>
              typeof s === 'string'
                ? { id: `S${String(j + 1).padStart(2, '0')}`, text: s }
                : { id: s.id || `S${String(j + 1).padStart(2, '0')}`, text: s.text || String(s) },
            )
            .filter((s: any) => s.text),
        }))
        .filter((ch: any) => ch.sentences.length > 0);

    const scoreOf = (shaped: any[]): number =>
      // Prefer scripts close to the sentence target and within the hard budget
      -Math.abs(shaped.reduce((a, ch) => a + ch.sentences.length, 0) - spec.sentenceTarget)
      - (countWords(shaped) > spec.wordBudgetHard ? 10 : 0);

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const attemptPrompt = attempt === 0
            ? prompt
            : `${prompt}\n\nYour previous draft had the wrong shape. Return about ${spec.chapterCount} chapters with ~${spec.sentenceTarget} complete sentences total.`;

          const response = await c.env.AI.run(model, {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: attemptPrompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4096,
          });

          const raw = response.response;
          let parsed: any;
          try {
            parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch {
            // Attempt to repair truncated JSON
            if (typeof raw === 'string') {
              const repaired = repairTruncatedJSON(raw);
              if (repaired) {
                try { parsed = JSON.parse(repaired); } catch { /* fall through */ }
              }
            }
            if (parsed === undefined) {
              lastError = new Error(`JSON parse failed: ${String(raw).slice(0, 200)}`);
              continue;
            }
          }
          const chapters = Array.isArray(parsed) ? parsed : parsed.chapters || parsed.script || [];

          if (!Array.isArray(chapters) || chapters.length === 0) {
            lastError = new Error(`Model ${model} returned empty/invalid chapters`);
            continue;
          }

          const normalized = normalize(chapters);
          if (normalized.length === 0) {
            lastError = new Error(`Model ${model} returned no usable chapters`);
            continue;
          }

          const shaped = shapeScript(normalized, spec);
          if (!shaped) {
            lastError = new Error(`Model ${model} could not shape script`);
            continue;
          }
          const finalWords = countWords(shaped);

          if (finalWords <= spec.wordBudgetHard) {
            return c.json({ chapters: shaped, topic, words: finalWords });
          }

          if (scoreOf(shaped) > bestScore) {
            bestScore = scoreOf(shaped);
            bestChapters = shaped;
          }
          lastError = new Error(`Model ${model} returned ${shaped.length} chapters / ${finalWords} words (want <=${spec.wordBudgetHard} w)`);
        } catch (e) {
          lastError = e;
          if (isQuotaError(e)) break;
        }
      }
      if (isQuotaError(lastError)) break;
    }

    // Free Groq fallback when Cloudflare is out of quota or weak
    const groqKey = c.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const raw = await generateWithGroq(groqKey, systemPrompt, prompt);
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          const repaired = repairTruncatedJSON(raw);
          if (repaired) {
            try { parsed = JSON.parse(repaired); } catch { /* fall through */ }
          }
        }
        if (parsed) {
          const chapters = Array.isArray(parsed) ? parsed : parsed.chapters || parsed.script || [];
          if (Array.isArray(chapters) && chapters.length > 0) {
            const normalized = normalize(chapters);
            if (normalized.length > 0) {
              const shaped = shapeScript(normalized, spec);
              if (shaped) {
                const finalWords = countWords(shaped);
                if (finalWords <= spec.wordBudgetHard) {
                  return c.json({ chapters: shaped, topic, source: 'groq', words: finalWords });
                }
                if (scoreOf(shaped) > bestScore) {
                  bestScore = scoreOf(shaped);
                  bestChapters = shaped;
                }
                lastError = new Error(`Groq ${shaped.length} ch / ${finalWords} words (want <=${spec.wordBudgetHard} w)`);
              }
            }
          }
        }
      } catch (e) {
        lastError = e;
      }
    }

    // All models exhausted — return best effort if we have anything (never drop a usable script)
    if (bestChapters && bestChapters.length > 0) {
      return c.json({ chapters: bestChapters, topic, source: 'best_effort', words: countWords(bestChapters) });
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown');
    console.error('All models failed:', detail);

    if (isQuotaError(lastError)) {
      return c.json({
        error: 'Daily AI limit reached. Please try again after the quota resets (usually within 24 hours).',
        code: 'quota_exceeded',
        detail,
      }, 429);
    }

    return c.json({
      error: `Script generation failed: ${detail || 'unknown error'}`,
      code: 'generation_failed',
      detail,
    }, 500);
  } catch (error) {
    console.error('Script generation failed:', error);
    const detail = error instanceof Error ? error.message : String(error);
    if (isQuotaError(error)) {
      return c.json({
        error: 'Daily AI limit reached. Please try again after the quota resets (usually within 24 hours).',
        code: 'quota_exceeded',
        detail,
      }, 429);
    }
    return c.json({ error: `Script generation failed: ${detail}`, code: 'generation_failed', detail }, 500);
  }
});

// ---------------------------------------------------------------------------
// TTS — resilient chain: Cloudflare aura-2 (best quality) → Microsoft Edge
// neural voices (free, unlimited, REAL male/female voices) → Google Translate
// (single voice, last resort). The video is never silent and the requested
// voice gender is honored whenever a distinct voice is available.
// ---------------------------------------------------------------------------

type Gender = 'male' | 'female';

// Deepgram Aura-2 speakers available on Cloudflare Workers AI
const AURA_GENDER: Record<string, Gender> = {
  apollo: 'male', arcas: 'male', orion: 'male', zeus: 'male',
  luna: 'female', athena: 'female', asteria: 'female', aura: 'female',
};

// Microsoft Edge neural voices (free via the Edge read-aloud endpoint) —
// 4 distinct voices, 2 male + 2 female
const EDGE_VOICES: Record<string, string> = {
  guy: 'en-US-GuyNeural',
  andrew: 'en-US-AndrewMultilingualNeural',
  aria: 'en-US-AriaNeural',
  emma: 'en-US-EmmaMultilingualNeural',
};
const EDGE_MALE = 'en-US-GuyNeural';
const EDGE_FEMALE = 'en-US-AriaNeural';

const genderOf = (voice?: string, gender?: string): Gender => {
  if (gender === 'male' || gender === 'female') return gender;
  const v = String(voice || '').toLowerCase();
  if (/luna|athena|female|aria|emma|ava|jenny|nova|shimmer|coral/.test(v)) return 'female';
  return 'male';
};

/** Resolve a client voice id (guy/andrew/aria/emma or a Deepgram aura name) to an Edge voice. */
const edgeVoiceFor = (voice?: string, gender?: Gender): string => {
  const v = String(voice || '').toLowerCase();
  const direct = Object.keys(EDGE_VOICES).find((k) => v.includes(k));
  if (direct) return EDGE_VOICES[direct];
  return gender === 'female' ? EDGE_FEMALE : EDGE_MALE;
};

// Last edgeTTS failure reason (diagnostics, read by /api/tts-probe)
let edgeFailReason = 'not-called';

async function edgeTTS(text: string, voice: string): Promise<Response | null> {
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const GEC_VERSION = '1-143.0.3650.75';
  const WIN_EPOCH = 11644473600; // seconds between 1601-01-01 and 1970-01-01

  // Sec-MS-GEC: sha256(trustedClientToken + windowsTicks) — ticks rounded to 5 min
  const ticks = Math.floor((Date.now() / 1000 + WIN_EPOCH) * 1e7);
  const rounded = ticks - (ticks % 3_000_000_000);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${rounded}${TRUSTED_CLIENT_TOKEN}`));
  const gec = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  // Workers fetch requires https:// scheme for the WS upgrade (not wss://)
  const wsUrl = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${GEC_VERSION}`;

  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ').replace(/[*_#`~]/g, '').trim();
  if (!clean) return null;
  const ssmlText = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 2000);

  const dateToString = (d: Date): string => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = (n: number) => String(n).padStart(2, '0');
    return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
  };

  const reqId = crypto.randomUUID().replace(/-/g, '');
  const now = dateToString(new Date());
  let lastEdgeFail = 'none';

  try {
    const resp = await fetch(wsUrl, {
      headers: {
        Upgrade: 'websocket',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Cookie: `muid=${crypto.randomUUID().replace(/-/g, '').toUpperCase()};`,
      },
    });
        const ws = resp.webSocket;
    console.error(`edgeTTS handshake: status=${resp.status} hasWebSocket=${!!ws}`);
    // NOTE: a WS upgrade responds 101, which is NOT resp.ok — only check the socket
    if (!ws) { edgeFailReason = `handshake ${resp.status} hasWS=false`; return null; }
    ws.accept();

    const chunks: Uint8Array[] = [];
    let done = false;

    const result = new Promise<Response | null>((resolve) => {
      const fail = (why: string) => {
        if (!done) {
          done = true;
          lastEdgeFail = why;
          console.error(`edgeTTS fail: ${why}`);
          try { ws.close(1000); } catch { /* */ }
          resolve(null);
        }
      };
      const timer = setTimeout(() => fail('timeout'), 30000);

      ws.addEventListener('message', (event: MessageEvent) => {
        if (done) return;
        const data = event.data as ArrayBuffer | string;
        if (typeof data === 'string') {
          if (data.includes('Path:turn.end')) {
            done = true;
            clearTimeout(timer);
            try { ws.close(1000); } catch { /* */ }
            if (chunks.length === 0) { edgeFailReason = 'turn.end with 0 audio chunks'; resolve(null); return; }
            const total = chunks.reduce((a, c) => a + c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            resolve(new Response(out.buffer, {
              status: 200,
              headers: { 'Content-Type': 'audio/mpeg', 'X-Free-Voice': voice },
            }));
          }
        } else {
          // Binary frame: 2-byte big-endian header length, then header, then audio
          const buf = new Uint8Array(data);
          if (buf.length < 2) return;
          const headerLen = (buf[0] << 8) | buf[1];
          const header = new TextDecoder().decode(buf.subarray(2, 2 + Math.min(headerLen, buf.length - 2)));
          if (header.includes('Path:audio')) {
            chunks.push(buf.subarray(2 + headerLen));
          }
        }
      });
      ws.addEventListener('error', (e) => { clearTimeout(timer); fail(`error: ${String((e as ErrorEvent)?.message || e)}`); });
      ws.addEventListener('close', () => { clearTimeout(timer); if (!done) { done = true; edgeFailReason = `closed before end (lastFail=${lastEdgeFail})`; console.error('edgeTTS: closed before end'); resolve(null); } });

      // speech.config
      ws.send(
        `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      // ssml
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${ssmlText}</prosody></voice></speak>`,
      );
    });

    return await result;
  } catch (e) {
    edgeFailReason = `exception: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

// Google Translate TTS — reliable single (female-ish) voice, last resort only
async function googleTTS(text: string): Promise<Response | null> {
  const clean = text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[*_#`~]/g, '')
    .trim()
    .slice(0, 200);
  if (!clean) return null;
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(clean)}`;
    const resp = await fetch(url, {
      headers: {
        Accept: 'audio/mpeg',
        Referer: 'https://translate.google.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const type = resp.headers.get('content-type') || '';
    if (resp.ok && (type.includes('audio') || resp.headers.get('content-length'))) {
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 500) {
        return new Response(buf, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg', 'X-Free-Voice': 'google-single' },
        });
      }
    }
  } catch { /* next */ }
  return null;
}

interface FreeTTSResult {
  body: ArrayBuffer;
  contentType: string;
  voice: string;
  distinct: boolean;
}

async function freeTTS(text: string, gender: Gender, voiceHint?: string): Promise<FreeTTSResult | null> {
  const edge = await edgeTTS(text, edgeVoiceFor(voiceHint, gender));
  if (edge && edge.ok) {
    const body = await edge.arrayBuffer();
    if (body.byteLength > 500) {
      return {
        body,
        contentType: edge.headers.get('Content-Type') || 'audio/mpeg',
        voice: edge.headers.get('X-Free-Voice') || 'edge',
        distinct: true, // Edge has real male AND female voices
      };
    }
  }
  const google = await googleTTS(text);
  if (google && google.ok) {
    const body = await google.arrayBuffer();
    if (body.byteLength > 500) {
      return {
        body,
        contentType: 'audio/mpeg',
        voice: 'google-single',
        distinct: false,
      };
    }
  }
  return null;
}

function freeTTSResponse(r: FreeTTSResult): Response {
  return new Response(r.body, {
    status: 200,
    headers: {
      'Content-Type': r.contentType,
      'Access-Control-Allow-Origin': '*',
      'X-TTS-Source': 'free-fallback',
      'X-Free-Voice': r.voice,
      'X-Voice-Distinct': r.distinct ? 'true' : 'false',
    },
  });
}

// Free TTS endpoint — no quota (Edge neural voices: guy/andrew/aria/emma → Google fallback)
app.post('/api/tts-free', async (c) => {
  try {
    const { text, voice = 'guy', speaker, gender } = await c.req.json();
    const selected = String(speaker || voice || 'guy');
    const g = genderOf(selected, gender);

    if (!text || typeof text !== 'string' || text.length > 5000) {
      return c.json({ error: 'Text is required (max 5000 chars)' }, 400);
    }

    const free = await freeTTS(text, g, selected);
    if (!free) {
      return c.json({ error: 'free_tts_unavailable', message: 'Free TTS endpoint unavailable. Please retry.' }, 503);
    }
    return freeTTSResponse(free);
  } catch (error) {
    console.error('tts-free failed:', error);
    return c.json({ error: `Free TTS failed: ${error instanceof Error ? error.message : String(error)}` }, 500);
  }
});

// TTS — same free Edge neural chain (kept as an alias for backwards compatibility)
app.post('/api/tts', async (c) => {
  try {
    const { text, voice = 'guy', speaker, gender } = await c.req.json();
    const selected = String(speaker || voice || 'guy');
    const g = genderOf(selected, gender);

    if (!text || typeof text !== 'string' || text.length > 5000) {
      return c.json({ error: 'Text is required (max 5000 chars)' }, 400);
    }

    const free = await freeTTS(text, g, selected);
    if (!free) {
      return c.json({
        error: 'tts_unavailable',
        message: 'Free TTS unavailable. Please retry or use Browser TTS.',
      }, 503);
    }
    return freeTTSResponse(free);
  } catch (error) {
    console.error('TTS failed:', error);
    return c.json({ error: `TTS failed: ${error instanceof Error ? error.message : String(error)}`, message: 'Please retry or use Free TTS' }, 500);
  }
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Probe endpoint: checks each TTS source is reachable from the worker (diagnostics)
app.get('/api/tts-probe', async (c) => {
  const probeText = 'This is a probe.';
  const out: Record<string, unknown> = {};

  // Raw WS handshake diagnostic
  try {
    const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    const WIN_EPOCH = 11644473600;
    const ticks = Math.floor((Date.now() / 1000 + WIN_EPOCH) * 1e7);
    const rounded = ticks - (ticks % 3_000_000_000);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${rounded}${TRUSTED_CLIENT_TOKEN}`));
    const gec = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const wsUrl = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75`;
    const resp = await fetch(wsUrl, {
      headers: {
        Upgrade: 'websocket',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Cookie: `muid=${crypto.randomUUID().replace(/-/g, '').toUpperCase()};`,
      },
    });
    const headers: Record<string, string> = {};
    resp.headers.forEach((v, k) => { headers[k] = v; });
    out.ws_handshake = { status: resp.status, hasWebSocket: !!resp.webSocket, headers };
    try { await resp.body?.cancel(); } catch { /* */ }
  } catch (e) {
    out.ws_handshake = `error: ${e instanceof Error ? `${e.message} | ${e.cause ?? ''}` : String(e)}`;
  }

  for (const [name, voice] of Object.entries(EDGE_VOICES)) {
    try {
      const r = await edgeTTS(probeText, voice);
      out[`edge_${name}`] = r && r.ok ? 'ok' : 'failed';
      try { await r?.body?.cancel(); } catch { /* */ }
    } catch (e) { out[`edge_${name}`] = `error: ${e instanceof Error ? e.message : String(e)}`; }
  }
  try {
    const g = await googleTTS(probeText);
    out.google = g && g.ok ? 'ok' : 'failed';
  } catch (e) { out.google = `error: ${e instanceof Error ? e.message : String(e)}`; }
  try {
    const resp = await c.env.AI.run('@cf/deepgram/aura-2-en', { text: probeText, speaker: 'apollo' }, { returnRawResponse: true });
    out.cloudflare_aura = resp.ok ? 'ok' : `http ${resp.status}`;
    try { await resp.body?.cancel(); } catch { /* */ }
  } catch (e) { out.cloudflare_aura = `error: ${e instanceof Error ? e.message : String(e)}`; }
  return c.json(out);
});

export default app;