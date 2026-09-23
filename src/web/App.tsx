import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { DynamicVideo } from '../common/DynamicVideo';
import { requiredFramesFor } from '../common/DynamicTimeline';
import ChapterEditor from './ChapterEditor';
import ShareDialog from './ShareDialog';
import TTSSelector from './TTSSelector';
import { getScriptFromURL } from './share';
import { renderMediaOnWeb, canRenderMediaOnWeb } from '@remotion/web-renderer';

type Sentence = { id: string; text: string };
type Chapter = { chapter: number; chapterTitle: string; sentences: Sentence[] };
type Script = Chapter[];
type TTSEngine = 'browser' | 'edge-tts' | 'kokoro';
type VoiceGender = 'male' | 'female';
type OutputFormat = 'mp4' | 'webm';

const FPS = 30;
// Approximate targets only — the final video duration is grown to fit the
// actual TTS narration, so scripts are never cut short mid-sentence.
const DURATION_BY_LENGTH: Record<string, number> = {
  short: 30 * FPS,    // ~30s
  medium: 60 * FPS,   // ~60s
  long: 90 * FPS,     // ~90s
};
const getDurationFrames = (len: string) => DURATION_BY_LENGTH[len] ?? DURATION_BY_LENGTH.short;

export default function App() {
  const [topic, setTopic] = useState('');
  const [scriptLength, setScriptLength] = useState<'short' | 'medium' | 'long'>('short');
  const [script, setScript] = useState<Script | null>(null);
  const [ttsEngine, setTtsEngine] = useState<TTSEngine>('browser');
  const [ttsVoice, setTtsVoice] = useState('guy');
  const [ttsVoiceGender, setTtsVoiceGender] = useState<VoiceGender>('male');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderText, setRenderText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'about'>('create');
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    const urlData = getScriptFromURL();
    if (urlData) {
      setScript(urlData.script);
      setTopic(urlData.topic);
      setActiveTab('create');
    }
  }, []);

  const handleGenerateScript = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setGenError('');
    setScript(null);
    try {
      const workerUrl = 'https://gemscript.sailfishsolution.workers.dev';
      const response = await fetch(`${workerUrl}/api/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), length: scriptLength }),
      });
      if (!response.ok) {
        let msg = 'Failed to generate script';
        try {
          const errData = await response.json();
          if (errData?.error) msg = errData.error;
          else if (errData?.message) msg = errData.message;
        } catch { /* keep default */ }
        if (response.status === 429 && msg === 'Failed to generate script') {
          msg = 'Daily AI limit reached. Please try again after quota resets (usually within 24 hours).';
        }
        throw new Error(msg);
      }
      const data = await response.json();
      if (!data?.chapters?.length) {
        throw new Error('Script generation returned empty content. Please retry.');
      }
      setScript(data.chapters);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAudio = useCallback(async (s: Script, voice: string, gender: VoiceGender) => {
    const workerUrl = 'https://gemscript.sailfishsolution.workers.dev';
    const audioUrls: Record<string, string> = {};
    const audioSec: Record<string, number> = {};
    const allSentences = s.flatMap((ch) => ch.sentences);
    let failedCount = 0;

    const measureDuration = async (blob: Blob): Promise<number> => {
      try {
        // decodeAudioData is reliable for MP3 metadata (Audio.onloadedmetadata often returns Infinity)
        const buf = await blob.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          try {
            const decoded = await ctx.decodeAudioData(buf.slice(0));
            if (decoded && Number.isFinite(decoded.duration) && decoded.duration > 0) {
              await ctx.close?.();
              return decoded.duration;
            }
          } catch { /* fall through to Audio element */ }
          await ctx.close?.().catch(() => {});
        }
        const url = URL.createObjectURL(blob);
        const dur = await new Promise<number>((resolve) => {
          const a = new Audio();
          let settled = false;
          const done = (v: number) => {
            if (settled) return;
            settled = true;
            a.onloadedmetadata = null;
            a.onerror = null;
            a.oncanplaythrough = null;
            URL.revokeObjectURL(url);
            resolve(v);
          };
          a.preload = 'metadata';
          a.onloadedmetadata = () => {
            if (Number.isFinite(a.duration) && a.duration > 0) done(a.duration);
            // Some MP3s only fill duration after a seek/load
            else {
              a.load();
              setTimeout(() => done(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0), 1500);
            }
          };
          a.onerror = () => done(0);
          a.src = url;
          setTimeout(() => done(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0), 4000);
        });
        return dur;
      } catch {
        return 0;
      }
    };

    // Free TTS endpoint — Edge neural voices, no Cloudflare quota
    const ttsUrl = `${workerUrl}/api/tts-free`;

    for (let i = 0; i < allSentences.length; i++) {
      const sentence = allSentences[i];
      try {
        const body = { text: sentence.text, speaker: voice, voice, gender };
        const response = await fetch(ttsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (response.status === 429 || response.status === 503) {
          failedCount++;
          console.warn(`TTS ${response.status} for ${sentence.id} — continuing`);
          continue;
        }
        if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);
        // Detect single-voice fallback so UI can warn honestly
        if (response.headers.get('X-Voice-Distinct') === 'false') {
          setRenderText(`Using standard free voice — ${i + 1}/${allSentences.length}`);
        }
        const blob = await response.blob();
        if (blob.size < 100) { failedCount++; continue; }
        audioUrls[sentence.id] = URL.createObjectURL(blob);
        audioSec[sentence.id] = await measureDuration(blob);
        setRenderProgress(Math.round((i + 1) / allSentences.length * 40));
        if (response.headers.get('X-Voice-Distinct') !== 'false') {
          setRenderText(`Generating audio... ${i + 1}/${allSentences.length}`);
        }
      } catch (err) {
        console.error(`TTS failed for ${sentence.id}:`, err);
        failedCount++;
      }
    }
    // If every sentence failed, render will be muted — warn
    if (Object.keys(audioUrls).length === 0) {
      console.error(`All ${failedCount} TTS requests failed — video will be silent`);
    }
    return { audioUrls, audioSec };
  }, []);

  const handleRender = useCallback(async () => {
    if (!topic.trim() || !script) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderText('Checking browser support...');
    setVideoUrl(null);
    setShowPlayer(true);

    try {
      let container: OutputFormat = outputFormat;
      let videoCodec: 'h264' | 'vp8' = outputFormat === 'mp4' ? 'h264' : 'vp8';
      let canRender = await canRenderMediaOnWeb({ width: 1280, height: 720, container, videoCodec });

      // Fall back to WebM if preferred format is unsupported
      if (!canRender.canRender && container === 'mp4') {
        setRenderText('MP4 not supported here — falling back to WebM...');
        canRender = await canRenderMediaOnWeb({ width: 1280, height: 720, container: 'webm', videoCodec: 'vp8' });
        if (canRender.canRender) {
          container = 'webm';
          videoCodec = 'vp8';
          setOutputFormat('webm');
        }
      }

      if (!canRender.canRender) {
        throw new Error(
          `Cannot render in this browser: ${canRender.issues.map((i) => i.message).join(', ')}`,
        );
      }

      const durationFrames = getDurationFrames(scriptLength);

      // Generate TTS audio — free Edge neural voices (no quota, real male/female voices)
      const { audioUrls, audioSec } = await generateAudio(script, ttsVoice, ttsVoiceGender);
      const hasAudio = Object.keys(audioUrls).length > 0;
      if (!hasAudio) {
        setRenderText('Warning: TTS unavailable — rendering without audio...');
      }

      // Grow the timeline if narration would outlast the selected length (prevents mid-line cuts)
      const finalFrames = requiredFramesFor(script, durationFrames, hasAudio ? audioSec : undefined);

      setRenderText('Rendering video...');
      setRenderProgress(40);

      const result = await renderMediaOnWeb({
        composition: {
          component: DynamicVideo,
          id: 'explainer',
          width: 1280,
          height: 720,
          fps: FPS,
          durationInFrames: finalFrames,
          defaultProps: {
            chapters: script,
            topic: topic.trim(),
            audioUrls: {},
            audioSec: {},
            totalFrames: finalFrames,
          },
        },
        inputProps: {
          chapters: script,
          topic: topic.trim(),
          audioUrls,
          audioSec: hasAudio ? audioSec : undefined,
          totalFrames: finalFrames,
        },
        videoCodec,
        container,
        muted: !hasAudio,
        onProgress: ({ progress }) => {
          const pct = Math.round(40 + progress * 60);
          setRenderProgress(pct);
          setRenderText(`Rendering... ${pct}%`);
        },
      });

      setRenderText('Encoding complete...');
      setRenderProgress(95);
      const blob = await result.getBlob();
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setRenderProgress(100);
      setRenderText('Video ready!');
    } catch (err) {
      console.error('Render failed:', err);
      setRenderText(`Render failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRendering(false);
    }
  }, [topic, script, scriptLength, generateAudio, ttsVoice, ttsVoiceGender, ttsEngine, outputFormat]);

  const totalSentences = script?.reduce((acc, ch) => acc + ch.sentences.length, 0) ?? 0;

  // Name the downloaded file after the user's question, e.g. "how-does-ram-work"
  const videoFilename = (() => {
    const slug = topic.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '');
    return `gitgem-${slug || 'explainer'}.${outputFormat}`;
  })();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b border-gray-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="https://gitgem.org" className="flex items-center gap-3 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-200 group-hover:shadow-purple-300 transition-shadow">
              <svg viewBox="-20 -2 40 30" height="22" className="w-auto">
                <path d="M-12,0 L12,0 L0,8 Z" fill="#b3a1ff" />
                <path d="M-12,0 L0,8 L-18,8 Z" fill="#9d8bff" />
                <path d="M12,0 L18,8 L0,8 Z" fill="#8f7af5" />
                <path d="M-18,8 L0,8 L0,26 Z" fill="#7c5cfc" />
                <path d="M18,8 L0,8 L0,26 Z" fill="#6d4fd6" />
                <path d="M-12,0 L12,0 L18,8 L0,26 L-18,8 Z" fill="none" stroke="#3b0f7a" strokeWidth="0.75" strokeLinejoin="round" />
                <path d="M-6,-1.7 L-5,1.5 L-1.8,2.5 L-5,3.5 L-6,6.7 L-7,3.5 L-10.2,2.5 L-7,1.5 Z" fill="#ffffff" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold leading-tight tracking-tight">
                <span className="text-gray-900">Git</span>
                <span className="text-purple-600">Gem</span>
              </span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest leading-none hidden sm:block">Explainer Tool</span>
            </div>
          </a>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'create' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Create
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'about' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              About
            </button>
            <div className="w-px h-5 bg-gray-200 mx-0.5 sm:mx-1" />
            <a href="https://github.com/sailfishsolution/gitgem-explainer-tool" target="_blank" rel="noopener noreferrer"
               className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>
            <a href="https://x.com/GitGem" target="_blank" rel="noopener noreferrer"
               className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs sm:text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm">
              @GitGem
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16">
        {activeTab === 'about' ? (
          /* ===== ABOUT PAGE ===== */
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <div className="space-y-10">
              {/* Hero */}
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-200">
                  <svg viewBox="-20 -2 40 30" height="36" className="w-auto">
                    <path d="M-12,0 L12,0 L0,8 Z" fill="#b3a1ff" />
                    <path d="M-12,0 L0,8 L-18,8 Z" fill="#9d8bff" />
                    <path d="M12,0 L18,8 L0,8 Z" fill="#8f7af5" />
                    <path d="M-18,8 L0,8 L0,26 Z" fill="#7c5cfc" />
                    <path d="M18,8 L0,8 L0,26 Z" fill="#6d4fd6" />
                    <path d="M-12,0 L12,0 L18,8 L0,26 L-18,8 Z" fill="none" stroke="#3b0f7a" strokeWidth="0.75" strokeLinejoin="round" />
                    <path d="M-6,-1.7 L-5,1.5 L-1.8,2.5 L-5,3.5 L-6,6.7 L-7,3.5 L-10.2,2.5 L-7,1.5 Z" fill="#ffffff" />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-900">GitGem Explainer Tool</h1>
                <p className="text-lg text-gray-500 max-w-xl mx-auto">
                  Turn any topic into a narrated motion-graphics explainer video. Free, open source, no signup required.
                </p>
              </div>

              {/* About */}
              <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-bold text-gray-900">About GitGem</h2>
                <p className="text-gray-600 leading-relaxed">
                  GitGem is an open-source project that makes professional-quality explainer videos accessible to everyone.
                  Our tools use AI to generate scripts, neural text-to-speech for narration, and motion graphics for visuals
                  — all running in your browser.
                </p>
                <p className="text-gray-600 leading-relaxed">
                  We believe knowledge should be free and accessible. That's why this tool is completely free to use,
                  open source under the MIT license, and requires zero signups.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a href="https://gitgem.org" target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors">
                    Visit Gitgem.org
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                  <a href="https://github.com/sailfishsolution/gitgem-explainer-tool" target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    View on GitHub
                  </a>
                </div>
              </section>

              {/* How it works */}
              <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-bold text-gray-900">How It Works</h2>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    { step: '1', title: 'Enter a Topic', desc: 'Type any subject you want to explain. Our AI generates a structured script with chapters and narration.' },
                    { step: '2', title: 'Preview & Edit', desc: 'Review the generated script. Edit chapters, reorder sentences, or regenerate until it\'s perfect.' },
                    { step: '3', title: 'Generate Video', desc: 'Click render and watch your explainer video come to life with motion graphics, subtitles, and voiceover.' },
                  ].map((item) => (
                    <div key={item.step} className="text-center space-y-3">
                      <div className="w-10 h-10 mx-auto rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center">
                        {item.step}
                      </div>
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Tech Stack */}
              <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-bold text-gray-900">Technology</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Script Generation', value: 'Cloudflare Workers AI (Llama 4, Qwen 3)' },
                    { label: 'Text-to-Speech', value: 'Free Edge neural voices (male & female)' },
                    { label: 'Motion Graphics', value: 'Remotion (React-based video framework)' },
                    { label: 'Video Rendering', value: 'WebCodecs in-browser (MP4 / WebM)' },
                    { label: 'Hosting', value: 'Cloudflare Pages + Workers (free tier)' },
                    { label: 'Privacy', value: 'Everything renders in your browser' },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col gap-1">
                      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{item.label}</dt>
                      <dd className="text-sm text-gray-700">{item.value}</dd>
                    </div>
                  ))}
                </div>
              </section>

              {/* Terms of Service / Privacy */}
              <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-bold text-gray-900">Privacy & Terms</h2>
                <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">No Data Collection</h3>
                    <p>
                      This tool runs entirely in your browser. We do not collect, store, or transmit any personal data.
                      Your scripts, voice data, and videos never leave your device. The only server calls are to
                      Cloudflare Workers AI for script generation and text-to-speech, which are processed anonymously.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">No Cookies</h3>
                    <p>
                      This website does not use cookies, analytics trackers, or any form of user tracking.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Open Source</h3>
                    <p>
                      This project is fully open source under the MIT License. You can inspect the code,
                      self-host it, or contribute improvements on GitHub.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">AI-Generated Content</h3>
                    <p>
                      Scripts and voiceovers are generated by AI models. Content accuracy is not guaranteed.
                      Review all generated content before using it for educational or professional purposes.
                    </p>
                  </div>
                </div>
              </section>

              <button onClick={() => setActiveTab('create')}
                className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200">
                Start Creating
              </button>
            </div>
          </div>
        ) : (
          /* ===== CREATE PAGE ===== */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {/* Hero */}
            <div className="text-center mb-8 space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Create Explainer Videos with AI
              </h1>
              <p className="text-gray-500 max-w-xl mx-auto">
                Enter any topic and get a narrated motion-graphics video in minutes. Free and open source.
              </p>
            </div>

            <div className="grid lg:grid-cols-5 gap-8">
              {/* Left: Controls */}
              <div className="lg:col-span-2 space-y-4">
                {/* Topic */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    What's your video about?
                  </label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., How does quantum computing work?"
                    maxLength={500}
                    disabled={isRendering || isGenerating}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 resize-none outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  />
                  <div className="text-right text-xs text-gray-400">{topic.length}/500</div>
                </div>

                {/* Video Length */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Video Length
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'short', label: 'Short', desc: '~30s' },
                      { key: 'medium', label: 'Medium', desc: '~60s' },
                      { key: 'long', label: 'Long', desc: '~90s' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setScriptLength(opt.key)}
                        disabled={isRendering || isGenerating}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          scriptLength === opt.key
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-xs opacity-70">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Approximate targets — the final duration adapts to the narration, so no sentence is ever cut short. Longer videos are more detailed.
                  </p>
                </div>

                {/* Output Format */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Output Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'mp4', label: 'MP4', desc: 'Works everywhere' },
                      { key: 'webm', label: 'WebM', desc: 'Smaller file' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setOutputFormat(opt.key)}
                        disabled={isRendering || isGenerating}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          outputFormat === opt.key
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-xs opacity-70">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* TTS Engine */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <TTSSelector
                    selected={ttsEngine}
                    onSelect={setTtsEngine}
                    isRendering={isRendering}
                    voice={ttsVoice}
                    onVoiceChange={(voiceId, gender) => { setTtsVoice(voiceId); setTtsVoiceGender(gender); }}
                  />
                </div>

                {/* Generate Script Button */}
                {!script && (
                  <button
                    onClick={handleGenerateScript}
                    disabled={!topic.trim() || isRendering || isGenerating}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
                      topic.trim() && !isRendering && !isGenerating
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-200 hover:shadow-purple-300'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }`}
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating Script...
                      </span>
                    ) : (
                      'Generate Script'
                    )}
                  </button>
                )}

                {/* Error */}
                {genError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {genError}
                  </div>
                )}

                {/* Chapter Editor */}
                {script && (
                  <ChapterEditor
                    script={script}
                    onScriptChange={setScript}
                    isRendering={isRendering}
                  />
                )}

                {/* Generate Video */}
                {script && !isRendering && !videoUrl && (
                  <button onClick={handleRender}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-200 hover:shadow-purple-300 transition-all">
                    Generate Video
                  </button>
                )}

                {/* Share (before render) */}
                {script && !isRendering && !videoUrl && (
                  <button onClick={() => setShowShareDialog(true)}
                    className="w-full py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share Script
                  </button>
                )}

                {/* Progress */}
                {isRendering && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-2">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{renderText}</span>
                      <span className="text-purple-600 font-semibold">{renderProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${renderProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Download + Share (prominent after video ready) */}
                {videoUrl && !isRendering && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-800">Video Ready!</p>
                        <p className="text-xs text-green-600">Download or share it</p>
                      </div>
                    </div>
                    <a href={videoUrl} download={videoFilename}
                       className="block w-full text-center px-4 py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
                      Download {outputFormat.toUpperCase()}
                    </a>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I just made a free AI explainer video about "${topic}" with GitGem 🎬 Try it yourself — no signup needed:`)}&url=${encodeURIComponent('https://gitgem-explainer-tool.pages.dev')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Share on X
                      </a>
                      <button
                        onClick={() => setShowShareDialog(true)}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        Copy Link
                      </button>
                    </div>
                  </div>
                )}

                {/* Reset */}
                {videoUrl && !isRendering && (
                  <button onClick={() => { setVideoUrl(null); setShowPlayer(false); setTopic(''); setScript(null); }}
                    className="w-full py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                    Create Another Video
                  </button>
                )}
              </div>

              {/* Right: Preview */}
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden aspect-video relative shadow-lg">
                  {videoUrl && !isRendering ? (
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full"
                      autoPlay={false}
                    />
                  ) : (
                    <>
                      <Player
                        ref={playerRef}
                        component={DynamicVideo}
                        compositionWidth={1280}
                        compositionHeight={720}
                        fps={FPS}
                        inputProps={{
                          chapters: script ?? [],
                          topic: topic || 'Your Topic',
                          audioUrls: {},
                          audioSec: {},
                          totalFrames: getDurationFrames(scriptLength),
                        }}
                        durationInFrames={showPlayer ? getDurationFrames(scriptLength) : 300}
                        style={{ width: '100%', height: '100%' }}
                        controls={showPlayer && !isRendering}
                      />
                      {!showPlayer && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-gradient-to-b from-transparent to-black/20">
                          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-white/90">Video Preview</p>
                          <p className="text-xs text-white/50 mt-1">Enter a topic and generate a script to begin</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <svg viewBox="-20 -2 40 30" height="16" className="w-auto">
                  <path d="M-12,0 L12,0 L0,8 Z" fill="#b3a1ff" />
                  <path d="M-12,0 L0,8 L-18,8 Z" fill="#9d8bff" />
                  <path d="M12,0 L18,8 L0,8 Z" fill="#8f7af5" />
                  <path d="M-18,8 L0,8 L0,26 Z" fill="#7c5cfc" />
                  <path d="M18,8 L0,8 L0,26 Z" fill="#6d4fd6" />
                  <path d="M-12,0 L12,0 L18,8 L0,26 L-18,8 Z" fill="none" stroke="#3b0f7a" strokeWidth="0.75" strokeLinejoin="round" />
                  <path d="M-6,-1.7 L-5,1.5 L-1.8,2.5 L-5,3.5 L-6,6.7 L-7,3.5 L-10.2,2.5 L-7,1.5 Z" fill="#ffffff" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700">
                  <span className="text-gray-900">Git</span><span className="text-purple-600">Gem</span> Explainer Tool
                </p>
                <p className="text-[10px] text-gray-400">Free & Open Source · MIT License</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>No data collected</span>
              <span className="text-gray-200">·</span>
              <a href="https://gitgem.org" className="hover:text-purple-600 transition-colors">Gitgem.org</a>
              <a href="https://github.com/sailfishsolution/gitgem-explainer-tool" className="hover:text-gray-600 transition-colors">GitHub</a>
              <a href="https://x.com/GitGem" className="hover:text-gray-900 transition-colors">Twitter</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Share Dialog */}
      {showShareDialog && script && (
        <ShareDialog
          script={script}
          topic={topic}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
