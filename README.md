<div align="center">

<a href="https://gitgem.org/github/sailfishsolution/gitgem-explainer-tool"><img src="https://gitgem.org/api/badge/github/sailfishsolution/gitgem-explainer-tool.svg" alt="GitGem"></a>

<img src="public/gitgem-mark.svg" alt="GitGem" width="72" />

# 💎 GitGem Explainer Tool

**Turn any question into a narrated, animated explainer video — free, in your browser.**

[![Live Demo](https://img.shields.io/badge/▶_Try_it_live-gitgem--explainer--tool.pages.dev-7c5cfc?style=for-the-badge)](https://gitgem-explainer-tool.pages.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c5cfc.svg?style=flat-square)](LICENSE)
[![Follow @GitGem](https://img.shields.io/badge/𝕏_Follow-@GitGem-black?style=flat-square)](https://x.com/GitGem)
[![GitGem.org](https://img.shields.io/badge/💎_Find_gems-Gitgem.org-9d8bff?style=flat-square)](https://gitgem.org)

*No signup · No API keys · No watermark removal fees · 100% open source*

</div>

---

## ✨ What It Does

Type a question — get a finished explainer video:

> **"How does RAM work?"** → a narrated, motion-graphics video with chapters, animated subtitles, and a progress bar, rendered entirely in your browser and downloadable as **MP4 or WebM**.

| | |
|---|---|
| 🎬 **AI script** | Structured chapters + sentences, sized for ~30s / ~60s / ~90s |
| 🗣️ **Real voices** | Free neural TTS with true male & female voices — no daily limits |
| 🎨 **Motion graphics** | Glitch-in titles, chapter cards, dot-field background, progress rail |
| 💬 **Subtitles** | Word-wrapped, glow-styled, never cut mid-sentence |
| ⏱️ **Smart duration** | Video length adapts to the narration — nothing is clipped to fit a box |
| 📱 **Mobile ready** | Accordion editor with big touch targets — works on your phone |
| 🤝 **Shareable** | Encode any script in the URL and send it to a friend |

## 🧠 How It Works

```
 Your topic ──▶ AI script (chapters + sentences)
                       │
                       ▼
              Text-to-speech per sentence   ← free Edge neural voices
                       │
                       ▼
        Video length = title + narration + chapter cards + ending
                       │
                       ▼
        Remotion renders every frame with WebCodecs (MP4/WebM)
                       │
                       ▼
                 🎉 Download your video
```

1. **Enter a topic** and pick an approximate length (Short ~30s / Medium ~60s / Long ~90s). Longer videos ask the AI for more depth — mechanisms, examples, misconceptions, practical tips.
2. **The AI writes a script** with chapters and complete sentences (never clipped mid-thought).
3. **Edit the script** if you want — the chapter editor is a tap-to-expand accordion, mobile friendly.
4. **Pick a voice** — Guy, Andrew, Aria or Emma. Previews play the *exact* audio used in the final video.
5. **Render** — each sentence is synthesized, measured, and the timeline grows to fit the narration, so a 90-second script produces a ~90-second video, not a cut-down 30-second one.

## 🚀 Use It

### Option 1 — Web app (zero install)

👉 **[gitgem-explainer-tool.pages.dev](https://gitgem-explainer-tool.pages.dev)**

Works on desktop and mobile. Everything renders client-side — your topic and script never touch a database.

### Option 2 — Run locally

```bash
git clone https://github.com/sailfishsolution/gitgem-explainer-tool.git
cd gitgem-explainer-tool
npm install
npm run dev          # dev server with hot reload
```

Then open the printed local URL (usually `http://localhost:5173`).

Production build:

```bash
npm run build        # outputs to dist/
npm run preview      # serve the production build locally
```

### Option 3 — Deploy your own copy

The frontend is static — any static host works (Cloudflare Pages, Vercel, GitHub Pages, Netlify):

```bash
npm run build
# then deploy dist/ to your host of choice
```

The only backend is a tiny Cloudflare Worker for AI script generation and TTS proxying (no secrets in this repo — it reads its key from a Worker secret at runtime). To self-host the worker:

```bash
cd worker
npm install
# set your own Groq API key as a secret — never hardcode it:
npx wrangler secret put GROQ_API_KEY
npx wrangler deploy
```

Then point the frontend at your worker (the URL is a constant at the top of `src/web/App.tsx` and `src/web/TTSSelector.tsx`).

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + Tailwind CSS 4 |
| Video engine | [Remotion](https://remotion.dev) — React components rendered frame-by-frame |
| In-browser encoding | [WebCodecs](https://developer.mozilla.org/docs/Web/API/WebCodecs_API) via `@remotion/web-renderer` (MP4 H.264 / WebM VP8) |
| Script AI | Cloudflare Workers AI (Llama 4 / Qwen 3) with Groq fallback |
| Text-to-speech | Free Microsoft Edge neural voices via the Gemini Explainer worker (Guy, Andrew, Aria, Emma) |
| Hosting | Cloudflare Pages (frontend) + Workers (API) |

## 📂 Project Structure

```
src/
  web/            React UI (App, chapter editor, TTS selector, share)
  common/         Dynamic Remotion composition (timeline, subtitles, backgrounds)
  shots/ overlay/ Demo shot components (the original quantization explainer)
worker/           Cloudflare Worker (Hono): /api/generate-script, /api/tts, /api/tts-free
public/           Fonts and static assets
scripts/          Local TTS generation helper (edge-tts / kokoro)
```

## 🔒 Privacy

- **No accounts, no cookies, no analytics, no tracking.**
- Your topic and edits live in your browser (and in the share-link URL only if you choose to share).
- Script generation and TTS calls are made anonymously to the free worker endpoints — nothing is stored.

## 🤝 Contributing

PRs are welcome! Ideas that would make great first contributions:

- More voices / languages
- Vertical (9:16) output for Shorts & TikTok
- Background music bed
- More shot templates for the dynamic composition

## 📜 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Built by [Gitgem.org](https://gitgem.org)** — find open-source projects worth starring.

[🌐 gitgem.org](https://gitgem.org) · [𝕏 @GitGem](https://x.com/GitGem) · [▶ Live demo](https://gitgem-explainer-tool.pages.dev)

*If this helped you, a ⭐ on the repo and a follow on X genuinely helps the project.*

</div>
