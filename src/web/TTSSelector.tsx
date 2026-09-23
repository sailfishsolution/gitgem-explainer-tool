import React, { useState, useCallback, useRef } from 'react';

type TTSEngine = 'browser' | 'edge-tts' | 'kokoro';
type VoiceGender = 'male' | 'female';

interface TTSOption {
  id: TTSEngine;
  name: string;
  description: string;
  quality: 'basic' | 'good' | 'excellent';
  requiresLocal: boolean;
  free: boolean;
}

const TTS_OPTIONS: TTSOption[] = [
  {
    id: 'browser',
    name: 'Free TTS',
    description: 'Microsoft Edge neural voices. No limits, always available.',
    quality: 'excellent',
    requiresLocal: false,
    free: true,
  },
  {
    id: 'edge-tts',
    name: 'Edge TTS (Local)',
    description: 'Microsoft Neural voices. Run locally for best results.',
    quality: 'excellent',
    requiresLocal: true,
    free: true,
  },
  {
    id: 'kokoro',
    name: 'Kokoro (Local)',
    description: 'Small neural model. Run locally for offline use.',
    quality: 'excellent',
    requiresLocal: true,
    free: true,
  },
];

const WORKER_URL = 'https://gemscript.sailfishsolution.workers.dev';

// Free Edge neural voices served by the worker — REAL male/female voices,
// no quota, and identical audio in the preview and the rendered video.
const FREE_VOICES: VoiceOption[] = [
  { id: 'guy', name: 'Guy', gender: 'male', style: 'Confident, deep' },
  { id: 'andrew', name: 'Andrew', gender: 'male', style: 'Warm, natural' },
  { id: 'aria', name: 'Aria', gender: 'female', style: 'Bright, friendly' },
  { id: 'emma', name: 'Emma', gender: 'female', style: 'Calm, clear' },
];

const PREVIEW_TEXT = 'Hi! I am your GitGem narrator. This is how I will explain your topic.';

type VoiceOption = { id: string; name: string; gender: VoiceGender; style: string };

interface TTSSelectorProps {
  selected: TTSEngine;
  onSelect: (engine: TTSEngine) => void;
  isRendering: boolean;
  voice: string;
  onVoiceChange: (voice: string, gender: VoiceGender) => void;
}

export default function TTSSelector({
  selected,
  onSelect,
  isRendering,
  voice,
  onVoiceChange,
}: TTSSelectorProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [freeVoiceNote, setFreeVoiceNote] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const activeVoices: VoiceOption[] = FREE_VOICES;

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingVoice(null);
  }, []);

  // Preview through the worker so the preview voice matches the rendered video exactly
  const previewVoice = useCallback(async (voiceId: string, gender: VoiceGender) => {
    if (previewingVoice === voiceId) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewingVoice(voiceId);

    try {
      const response = await fetch(`${WORKER_URL}/api/tts-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: PREVIEW_TEXT, speaker: voiceId, voice: voiceId, gender }),
      });
      if (!response.ok) throw new Error('Preview failed');
      if (response.headers.get('X-Voice-Distinct') === 'false') {
        setFreeVoiceNote(true);
      } else {
        setFreeVoiceNote(false);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreviewingVoice(null);
      };
      audio.onerror = () => setPreviewingVoice(null);
      await audio.play();
    } catch (err) {
      console.error('Voice preview failed:', err);
      setPreviewingVoice(null);
    }
  }, [previewingVoice, stopPreview]);

  const handleSelect = (engine: TTSEngine) => {
    onSelect(engine);
    setFreeVoiceNote(false);
    // Reset voice to a sensible default for the target engine
    if (engine === 'browser') onVoiceChange('guy', 'male');
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Voice Engine
      </label>

      {/* TTS Options */}
      <div className="space-y-2">
        {TTS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            disabled={isRendering}
            className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
              selected === opt.id
                ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{opt.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  opt.quality === 'excellent' ? 'bg-green-100 text-green-700' :
                  opt.quality === 'good' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {opt.quality}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {opt.requiresLocal && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    local
                  </span>
                )}
                {selected === opt.id && (
                  <span className="w-2 h-2 bg-purple-500 rounded-full" />
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>

      {/* Voice picker (Cloud + Free TTS) */}
      {/* Voice picker (Free TTS) */}
      {selected === 'browser' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Narrator Voice
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {activeVoices.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs transition-all ${
                  voice === v.id
                    ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <button
                  onClick={() => onVoiceChange(v.id, v.gender)}
                  disabled={isRendering}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="font-medium text-gray-900 truncate">
                    {v.name}
                    <span className={`ml-1 font-normal ${v.gender === 'male' ? 'text-blue-500' : 'text-pink-500'}`}>
                      {v.gender === 'male' ? '♂' : '♀'}
                    </span>
                  </div>
                  <div className="text-gray-400 truncate">{v.style}</div>
                </button>
                <button
                  onClick={() => previewVoice(v.id, v.gender)}
                  disabled={isRendering}
                  className="shrink-0 w-7 h-7 rounded-full bg-purple-100 text-purple-600 hover:bg-purple-200 flex items-center justify-center transition-colors ml-1"
                  title={previewingVoice === v.id ? 'Stop preview' : `Preview ${v.name}`}
                >
                  {previewingVoice === v.id ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free fallback single-voice warning (only when even Edge TTS is unreachable) */}
      {freeVoiceNote && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Neural voices are temporarily unreachable — using the shared free voice for now.
        </div>
      )}

      {/* Free TTS info */}
      {selected === 'browser' && (
        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          Free Edge neural voices, no daily limits. The preview matches the rendered video exactly.
        </div>
      )}

      {/* Local generation instructions */}
      {(selected === 'edge-tts' || selected === 'kokoro') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 mb-1.5">
            Generate audio locally
          </p>
          <p className="text-xs text-amber-700 mb-2">
            Run this command to generate audio files, then reload:
          </p>
          <code className="block text-xs bg-amber-100 text-amber-900 rounded px-2 py-1.5 font-mono break-all">
            python scripts/generate_tts.py script.json --engine {selected}
          </code>
          <p className="text-xs text-amber-600 mt-1.5">
            Audio files save to <code>public/assets/audio/</code>
          </p>
        </div>
      )}
    </div>
  );
}