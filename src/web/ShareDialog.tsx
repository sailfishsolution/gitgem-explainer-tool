import React, { useState } from 'react';
import { generateShareURL, generateEmbedCode, copyToClipboard } from './share';

type Sentence = { id: string; text: string };
type Chapter = { chapter: number; chapterTitle: string; sentences: Sentence[] };
type Script = Chapter[];

interface ShareDialogProps {
  script: Script;
  topic: string;
  onClose: () => void;
}

export default function ShareDialog({ script, topic, onClose }: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'embed'>('link');
  const [copied, setCopied] = useState(false);

  const shareURL = generateShareURL(script, topic);
  const embedCode = generateEmbedCode(script, topic);

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Share Explainer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'link'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Share Link
          </button>
          <button
            onClick={() => setActiveTab('embed')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'embed'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Embed Code
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'link' ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Share this link with anyone to let them view and customize your explainer video:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareURL}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-700"
                />
                <button
                  onClick={() => handleCopy(shareURL)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Embed this explainer in your website or blog:
              </p>
              <textarea
                value={embedCode}
                readOnly
                rows={4}
                className="w-full px-3 py-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md text-gray-700 resize-none"
              />
              <button
                onClick={() => handleCopy(embedCode)}
                className={`mt-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {copied ? 'Copied!' : 'Copy Embed Code'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-2">
          <p className="text-xs text-gray-500">
            Topic: {topic} · {script.reduce((acc, ch) => acc + ch.sentences.length, 0)} sentences
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              Made with{' '}
              <a href="https://gitgem-explainer-tool.pages.dev" target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-600 hover:text-purple-700">
                GitGem Explainer Tool
              </a>
            </p>
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I just made a free AI explainer video about "${topic}" with GitGem 🎬 Try it yourself — no signup needed:`)}&url=${encodeURIComponent('https://gitgem-explainer-tool.pages.dev')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Post on X
            </a>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Free & open source · No signups · Generate AI scripts, narrated videos & more at{' '}
            <a href="https://gitgem.org" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:text-purple-600">gitgem.org</a>
          </p>
        </div>
      </div>
    </div>
  );
}
