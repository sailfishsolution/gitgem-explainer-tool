import React, { useState } from 'react';

type Sentence = { id: string; text: string };
type Chapter = { chapter: number; chapterTitle: string; sentences: Sentence[] };
type Script = Chapter[];

interface ChapterEditorProps {
  script: Script;
  onScriptChange: (script: Script) => void;
  isRendering: boolean;
}

const IconBtn = ({
  onClick, disabled, title, danger, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center justify-center w-9 h-9 rounded-lg text-base transition-colors active:scale-95 ${
      disabled
        ? 'text-gray-200 cursor-not-allowed'
        : danger
          ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

export default function ChapterEditor({ script, onScriptChange, isRendering }: ChapterEditorProps) {
  // Editor panel + first chapter expanded by default; tapping headers toggles them
  const [openChapters, setOpenChapters] = useState<Set<number>>(new Set([-1, script[0]?.chapter ?? 0]));
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [editingSentence, setEditingSentence] = useState<{ chapter: number; sentenceIndex: number } | null>(null);

  const toggleChapter = (chapterNum: number) => {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterNum)) next.delete(chapterNum);
      else next.add(chapterNum);
      return next;
    });
  };

  const handleChapterTitleChange = (chapterIndex: number, newTitle: string) => {
    const newScript = [...script];
    newScript[chapterIndex] = { ...newScript[chapterIndex], chapterTitle: newTitle };
    onScriptChange(newScript);
  };

  const handleSentenceTextChange = (chapterIndex: number, sentenceIndex: number, newText: string) => {
    const newScript = [...script];
    const newSentences = [...newScript[chapterIndex].sentences];
    newSentences[sentenceIndex] = { ...newSentences[sentenceIndex], text: newText };
    newScript[chapterIndex] = { ...newScript[chapterIndex], sentences: newSentences };
    onScriptChange(newScript);
  };

  const addSentence = (chapterIndex: number) => {
    const newScript = [...script];
    const sentences = newScript[chapterIndex].sentences;
    const newId = `S${String(script.reduce((acc, ch) => acc + ch.sentences.length, 0) + 1).padStart(2, '0')}`;
    newScript[chapterIndex] = {
      ...newScript[chapterIndex],
      sentences: [...sentences, { id: newId, text: 'New sentence text' }],
    };
    onScriptChange(newScript);
    setOpenChapters((prev) => new Set(prev).add(newScript[chapterIndex].chapter));
  };

  const removeSentence = (chapterIndex: number, sentenceIndex: number) => {
    const newScript = [...script];
    const sentences = newScript[chapterIndex].sentences.filter((_, i) => i !== sentenceIndex);
    newScript[chapterIndex] = { ...newScript[chapterIndex], sentences };
    onScriptChange(newScript);
  };

  const addChapter = () => {
    const newChapter = {
      chapter: script.length + 1,
      chapterTitle: `Chapter ${script.length + 1}`,
      sentences: [{ id: 'S01', text: 'New chapter content' }],
    };
    onScriptChange([...script, newChapter]);
    setOpenChapters((prev) => new Set(prev).add(newChapter.chapter));
  };

  const removeChapter = (chapterIndex: number) => {
    if (script.length <= 1) return;
    const newScript = script.filter((_, i) => i !== chapterIndex);
    // Re-index chapters
    const reindexed = newScript.map((ch, i) => ({ ...ch, chapter: i + 1 }));
    onScriptChange(reindexed);
  };

  const moveSentence = (chapterIndex: number, sentenceIndex: number, direction: 'up' | 'down') => {
    const newScript = [...script];
    const sentences = [...newScript[chapterIndex].sentences];
    const newIndex = direction === 'up' ? sentenceIndex - 1 : sentenceIndex + 1;

    if (newIndex < 0 || newIndex >= sentences.length) return;

    [sentences[sentenceIndex], sentences[newIndex]] = [sentences[newIndex], sentences[sentenceIndex]];
    newScript[chapterIndex] = { ...newScript[chapterIndex], sentences };
    onScriptChange(newScript);
  };

  const totalSentences = script.reduce((acc, ch) => acc + ch.sentences.length, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header (tap to collapse the whole editor on mobile) */}
      <button
        onClick={() => toggleChapter(-1)}
        className="w-full flex items-center justify-between p-4 sm:p-5 select-none"
      >
        <h3 className="text-sm font-semibold text-gray-700">Edit Script</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{script.length} chapters · {totalSentences} sentences</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${openChapters.has(-1) ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {openChapters.has(-1) && (
        <div className="px-3 sm:px-4 pb-4 space-y-2 max-h-[28rem] overflow-y-auto">
          {script.map((chapter, chapterIndex) => {
            const isOpen = openChapters.has(chapter.chapter);
            return (
              <div key={chapter.chapter} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Chapter header — tap to expand/collapse */}
                <div className="flex items-center bg-gray-50/80">
                  <button
                    onClick={() => toggleChapter(chapter.chapter)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-3 text-left"
                  >
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                      {chapter.chapter}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{chapter.chapterTitle}</span>
                      <span className="block text-[11px] text-gray-400">
                        {chapter.sentences.length} sentence{chapter.sentences.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                    <svg
                      className={`shrink-0 w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="pr-1.5 flex items-center">
                    <IconBtn
                      title="Delete chapter"
                      danger
                      disabled={isRendering || script.length <= 1}
                      onClick={() => removeChapter(chapterIndex)}
                    >
                      ×
                    </IconBtn>
                  </div>
                </div>

                {/* Expanded: sentences */}
                {isOpen && (
                  <div className="p-3 space-y-2">
                    {/* Chapter title editing */}
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Title</label>
                      <input
                        type="text"
                        value={chapter.chapterTitle}
                        onChange={(e) => handleChapterTitleChange(chapterIndex, e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-purple-500 focus:bg-white"
                        disabled={isRendering}
                        placeholder="Chapter title"
                      />
                    </div>

                    {/* Sentences */}
                    <div className="space-y-1.5 pt-1">
                      {chapter.sentences.map((sentence, sentenceIndex) => (
                        <div key={`${sentence.id}-${sentenceIndex}`} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2">
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-400 mt-2 font-mono shrink-0 w-7">{sentence.id}</span>
                            {editingSentence?.chapter === chapterIndex && editingSentence.sentenceIndex === sentenceIndex ? (
                              <textarea
                                value={sentence.text}
                                onChange={(e) => handleSentenceTextChange(chapterIndex, sentenceIndex, e.target.value)}
                                onBlur={() => setEditingSentence(null)}
                                rows={2}
                                className="flex-1 px-2.5 py-2 text-sm border border-purple-300 rounded-lg focus:outline-none focus:border-purple-500 bg-white resize-none"
                                autoFocus
                                disabled={isRendering}
                              />
                            ) : (
                              <button
                                onClick={() => setEditingSentence({ chapter: chapterIndex, sentenceIndex })}
                                className="flex-1 min-w-0 text-left text-sm text-gray-700 py-1.5 leading-snug"
                                disabled={isRendering}
                                title="Tap to edit"
                              >
                                {sentence.text}
                              </button>
                            )}
                            <div className="flex items-center shrink-0">
                              <IconBtn
                                title="Move up"
                                disabled={isRendering || sentenceIndex === 0}
                                onClick={() => moveSentence(chapterIndex, sentenceIndex, 'up')}
                              >
                                ↑
                              </IconBtn>
                              <IconBtn
                                title="Move down"
                                disabled={isRendering || sentenceIndex === chapter.sentences.length - 1}
                                onClick={() => moveSentence(chapterIndex, sentenceIndex, 'down')}
                              >
                                ↓
                              </IconBtn>
                              <IconBtn
                                title="Delete sentence"
                                danger
                                disabled={isRendering}
                                onClick={() => removeSentence(chapterIndex, sentenceIndex)}
                              >
                                ×
                              </IconBtn>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => addSentence(chapterIndex)}
                        disabled={isRendering}
                        className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-purple-500 hover:border-purple-400 hover:bg-purple-50/50 transition-colors disabled:opacity-40"
                      >
                        + Add sentence
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={addChapter}
            disabled={isRendering}
            className="w-full py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-purple-400 hover:text-purple-600 transition-colors disabled:opacity-40"
          >
            + Add Chapter
          </button>
        </div>
      )}
    </div>
  );
}