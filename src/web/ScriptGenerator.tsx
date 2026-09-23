import React, { useState } from 'react';

type Sentence = { id: string; text: string };
type Chapter = { chapter: number; chapterTitle: string; sentences: Sentence[] };
type Script = Chapter[];

interface ScriptGeneratorProps {
  onScriptGenerated: (script: Script, topic: string) => void;
  isRendering: boolean;
}

export default function ScriptGenerator({ onScriptGenerated, isRendering }: ScriptGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short');
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState('');

  const generateScript = async () => {
    if (!topic.trim()) return;
    
    setIsGenerating(true);
    setError('');
    
    try {
      const workerUrl = 'https://gemscript.sailfishsolution.workers.dev';
      const response = await fetch(`${workerUrl}/api/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), length }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate script');
      }
      
      const data = await response.json();
      setScript(data.script);
      onScriptGenerated(data.script, topic.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setIsGenerating(false);
    }
  };

  const totalSentences = script?.reduce((acc, ch) => acc + ch.sentences.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Topic Input */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          What's your video about?
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., How does quantum computing work?"
          maxLength={500}
          disabled={isRendering || isGenerating}
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 resize-none outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-colors"
        />
        <div className="text-right text-xs text-gray-400 mt-1">{topic.length}/500</div>
      </div>

      {/* Length Selection */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Video Length
        </label>
        <div className="flex gap-1">
          {([
            { key: 'short', label: 'Short', desc: '~30s' },
            { key: 'medium', label: 'Medium', desc: '~60s' },
            { key: 'long', label: 'Long', desc: '~90s' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setLength(opt.key)}
              disabled={isRendering || isGenerating}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                length === opt.key
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-xs opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      {!script && (
        <button
          onClick={generateScript}
          disabled={!topic.trim() || isRendering || isGenerating}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
            topic.trim() && !isRendering && !isGenerating
              ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200'
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
            '✨ Generate Script'
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Script Preview */}
      {script && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Generated Script</h3>
            <span className="text-xs text-gray-500">{totalSentences} sentences</span>
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {script.map((chapter) => (
              <div key={chapter.chapter} className="border-l-2 border-purple-200 pl-3">
                <h4 className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
                  Chapter {chapter.chapter}: {chapter.chapterTitle}
                </h4>
                <ul className="mt-1 space-y-1">
                  {chapter.sentences.map((sentence) => (
                    <li key={sentence.id} className="text-sm text-gray-600">
                      <span className="font-mono text-xs text-gray-400 mr-1">{sentence.id}</span>
                      {sentence.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setScript(null); setTopic(''); }}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Generate New Script
          </button>
        </div>
      )}
    </div>
  );
}
