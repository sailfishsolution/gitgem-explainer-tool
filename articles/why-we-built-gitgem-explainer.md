# Why We Built the GitGem Explainer Tool

*A Gitgem.org project story — discover more verified free projects at **[Gitgem.org](https://gitgem.org)***

## Every question deserves a good explanation

Think about the last time you tried to learn something new online. Maybe it was "how does RAM work" or "what is a smart contract." You found a forum thread, a 40-minute lecture, or an article written for people who already understood the topic halfway.

What you probably wanted was simpler: a two-minute video that explains it clearly.

Professional explainer videos exist — that's why every tech company has one for their product. But making one normally means scriptwriting, hiring a voice actor, motion design software, and hours of editing. That's a wall most teachers, students, indie developers, and curious people never get past.

So we asked a simple question: **what if the wall just didn't exist?**

## What the tool does

The [GitGem Explainer Tool](https://gitgem-explainer-tool.pages.dev) takes any question and gives back a finished explainer video:

1. **You type a question.** "How does RAM work?" — anything.
2. **An AI writes the script.** Chaptered, complete sentences, sized for ~30, ~60 or ~90 seconds. Longer videos get more depth: mechanisms, examples, practical tips.
3. **Neural voices narrate it.** Free Microsoft Edge neural voices, with real male and female options — no daily limits.
4. **The video renders in your browser.** Motion graphics, animated karaoke-synced subtitles, chapter cards, a progress rail — drawn frame by frame by your own GPU and exported as MP4 or WebM.

No signup. No API keys. No credits. No watermark games. Just type and render.

## The part we're proudest of: it's free — structurally, not as a marketing trick

Most "free" tools are free the way a sample is free: a teaser that ends at a paywall. This tool is free because of *how it's built*, not because we're subsidizing you until you're hooked:

- **The AI script generation** runs on free tiers of modern language models.
- **The narration** uses free neural TTS — no subscription voices.
- **The expensive part — rendering the video — happens on your machine.** There is no render farm to pay for, no storage bill, no bandwidth bill. Your browser is the render farm.

That last point changes the economics completely. We have nothing to charge you for, because we never had to buy the thing most video tools charge you for. So the price can be zero, forever, and the [source code proves it](https://github.com/sailfishsolution/gitgem-explainer-tool).

## It's early — on purpose

This is version one, and it's deliberately basic. The visuals are clean motion graphics, not cinematic animation. We think that's the honest way to build in public: ship the core loop (question → script → voice → video), make it genuinely useful, and improve it in the open.

The roadmap is clear:

- **Images and richer animation** — automatic illustrations per chapter, more shot templates, so the videos become genuinely attractive, not just informative
- **Vertical (9:16) output** for Shorts, Reels and TikTok
- **More voices and languages**
- **Background music beds**

Some of that we'll build. Some of it the community will build faster than we could alone — which is exactly why it's open source.

## Try it, break it, improve it

Everything we make lives at **[Gitgem.org](https://gitgem.org)** — our home for finding, verifying, and listing open-source projects worth starring. The tool is live at [gitgem-explainer-tool.pages.dev](https://gitgem-explainer-tool.pages.dev), and the code is [on GitHub](https://github.com/sailfishsolution/gitgem-explainer-tool) under MIT license. If you build something better on top of it — that's not competition, that's the point.

Knowledge should be easy to give and easy to get. This is our small piece of that.

**— Gitgem.org · The home of verified open-source projects — [gitgem.org](https://gitgem.org)**