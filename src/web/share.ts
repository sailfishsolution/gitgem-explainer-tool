// Share and embed utilities

type Sentence = { id: string; text: string };
type Chapter = { chapter: number; chapterTitle: string; sentences: Sentence[] };
type Script = Chapter[];

// Encode script to URL-safe base64
export function encodeScriptToURL(script: Script, topic: string): string {
  const data = { script, topic };
  const json = JSON.stringify(data);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return encoded;
}

// Decode script from URL-safe base64
export function decodeScriptFromURL(encoded: string): { script: Script; topic: string } | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const data = JSON.parse(json);
    if (data.script && data.topic) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// Get script from URL parameters
export function getScriptFromURL(): { script: Script; topic: string } | null {
  const params = new URLSearchParams(window.location.search);
  const scriptParam = params.get('script');
  
  if (scriptParam) {
    return decodeScriptFromURL(scriptParam);
  }
  
  return null;
}

// Generate share URL
export function generateShareURL(script: Script, topic: string): string {
  const encoded = encodeScriptToURL(script, topic);
  const url = new URL(window.location.href);
  url.searchParams.set('script', encoded);
  return url.toString();
}

// Generate embed code
export function generateEmbedCode(script: Script, topic: string): string {
  const shareURL = generateShareURL(script, topic);
  const embedURL = new URL(shareURL);
  embedURL.searchParams.set('embed', 'true');
  
  return `<iframe 
  src="${embedURL.toString()}" 
  width="100%" 
  height="600" 
  frameborder="0" 
  allow="autoplay; fullscreen" 
  allowfullscreen
  title="GitGem Explainer - ${topic}">
</iframe>`;
}

// Generate embed URL for iframe
export function generateEmbedURL(script: Script, topic: string): string {
  const shareURL = generateShareURL(script, topic);
  const embedURL = new URL(shareURL);
  embedURL.searchParams.set('embed', 'true');
  return embedURL.toString();
}

// Copy to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
