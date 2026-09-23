import { useState, useCallback, useRef } from 'react';

interface TTSOptions {
  voice?: string;
  engine?: 'browser' | 'cloud';
  rate?: number;
  pitch?: number;
}

interface TTSResult {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  error: string | null;
}

export function useTTS(options: TTSOptions = {}): TTSResult {
  const { voice = 'en-US-AndrewNeural', engine = 'browser', rate = 1, pitch = 1 } = options;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (engine === 'browser' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [engine]);

  const speak = useCallback(async (text: string) => {
    setError(null);
    
    if (engine === 'browser') {
      if (!window.speechSynthesis) {
        setError('Speech synthesis not supported in this browser');
        return;
      }

      return new Promise<void>((resolve, reject) => {
        stop();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = window.speechSynthesis.getVoices().find(v => v.name === voice) || null;
        utterance.rate = rate;
        utterance.pitch = pitch;
        
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };
        utterance.onerror = (event) => {
          setIsSpeaking(false);
          setError(`Speech error: ${event.error}`);
          reject(event);
        };
        
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      });
    } else {
      // Cloud TTS - call the worker API
      try {
        const workerUrl = 'https://gitgem-explainer-worker.sailfishsolution.workers.dev';
        const response = await fetch(`${workerUrl}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, id: `tts-${Date.now()}` }),
        });
        
        if (!response.ok) {
          throw new Error('Cloud TTS request failed');
        }
        
        const data = await response.json();
        console.log('Cloud TTS request:', data);
        // For now, fall back to browser TTS
        return speak(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cloud TTS failed');
        // Fall back to browser TTS
        return speak(text);
      }
    }
  }, [voice, engine, rate, pitch, stop]);

  return { speak, stop, isSpeaking, error };
}

// Utility to speak all sentences in sequence
export async function speakScript(
  sentences: Array<{ id: string; text: string }>,
  options: TTSOptions = {},
  onSentenceStart?: (id: string, index: number) => void,
  onSentenceEnd?: (id: string, index: number) => void,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const { voice = 'en-US-AndrewNeural', engine = 'browser' } = options;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    onSentenceStart?.(sentence.id, i);
    onProgress?.(i, sentences.length);
    
    await new Promise<void>((resolve) => {
      if (engine === 'browser' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(sentence.text);
        utterance.voice = window.speechSynthesis.getVoices().find(v => v.name === voice) || null;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } else {
        // Fallback: just wait a bit
        setTimeout(resolve, 1000);
      }
    });
    
    onSentenceEnd?.(sentence.id, i);
    onProgress?.(i + 1, sentences.length);
    
    // Small pause between sentences
    await new Promise(r => setTimeout(r, 200));
  }
}
