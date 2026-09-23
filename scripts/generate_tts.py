#!/usr/bin/env python3
"""
Local TTS generator for Gitgem Explainer Tool.
Generates high-quality audio files using edge-tts or kokoro.

Usage:
  python generate_tts.py script.json --engine edge-tts --voice en-US-AndrewNeural
  python generate_tts.py script.json --engine kokoro --voice am_liam
  python generate_tts.py script.json --engine browser  (generates nothing, just validates)

Requirements:
  pip install edge-tts numpy scipy
  pip install kokoro  (optional, for kokoro engine)
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# edge-tts voices (free, Microsoft Neural)
EDGE_VOICES = {
    "en-US-AndrewNeural": "Andrew (Male, US)",
    "en-US-JennyNeural": "Jenny (Female, US)",
    "en-US-GuyNeural": "Guy (Male, US)",
    "en-GB-SoniaNeural": "Sonia (Female, UK)",
    "en-AU-WilliamNeural": "William (Male, AU)",
}

# kokoro voices
KOKORO_VOICES = {
    "am_liam": "Liam (Male, US)",
    "af_bella": "Bella (Female, US)",
    "af_nicole": "Nicole (Female, US)",
    "am_adam": "Adam (Male, US)",
}


def load_script(script_path: str) -> list[dict]:
    """Load script JSON file. Accepts either flat or chapter format."""
    with open(script_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Normalize: extract sentences from chapters or flat format
    if isinstance(data, list) and len(data) > 0:
        if "chapters" in data[0]:
            # Chapter format: [{chapter: 1, sentences: [...]}]
            sentences = []
            for ch in data:
                for s in ch.get("sentences", []):
                    sentences.append(s)
            return sentences
        elif "sentences" in data[0]:
            # Nested: [{chapter: 1, sentences: [{id, text}]}]
            sentences = []
            for ch in data:
                for s in ch.get("sentences", []):
                    sentences.append(s)
            return sentences
        elif "id" in data[0] and "text" in data[0]:
            # Flat format: [{id: "S01", text: "..."}]
            return data

    raise ValueError(f"Unrecognized script format in {script_path}")


async def generate_edge_tts(sentences: list[dict], voice: str, output_dir: Path):
    """Generate audio using edge-tts (free Microsoft Neural voices)."""
    import edge_tts

    output_dir.mkdir(parents=True, exist_ok=True)
    results = []

    for sentence in sentences:
        sid = sentence["id"]
        text = sentence["text"]
        out_path = output_dir / f"{sid}.mp3"

        print(f"  {sid}: {text[:50]}...")
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(out_path))
        results.append({"id": sid, "file": str(out_path), "engine": "edge-tts"})

    return results


def generate_kokoro(sentences: list[dict], voice: str, output_dir: Path):
    """Generate audio using kokoro (local neural TTS)."""
    try:
        from kokoro import KPipeline
    except ImportError:
        print("ERROR: kokoro not installed. Run: pip install kokoro")
        print("  kokoro also requires: pip install numpy scipy")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a")  # 'a' for American English
    results = []

    for sentence in sentences:
        sid = sentence["id"]
        text = sentence["text"]
        out_path = output_dir / f"{sid}.wav"

        print(f"  {sid}: {text[:50]}...")
        generator = pipeline(text, voice=voice)
        # kokoro returns (phonemes, audio_samples, sample_rate)
        for _, audio, sr in generator:
            import numpy as np
            from scipy.io import wavfile

            audio_np = np.array(audio, dtype=np.float32)
            # Normalize and convert to int16
            audio_int16 = (audio_np * 32767).astype(np.int16)
            wavfile.write(str(out_path), sr, audio_int16)
            break  # Take first segment

        results.append({"id": sid, "file": str(out_path), "engine": "kokoro"})

    return results


def main():
    parser = argparse.ArgumentParser(description="Generate TTS audio for explainer videos")
    parser.add_argument("script", help="Path to script JSON file")
    parser.add_argument("--engine", choices=["edge-tts", "kokoro", "browser"],
                        default="edge-tts", help="TTS engine to use")
    parser.add_argument("--voice", default=None,
                        help="Voice name (default: en-US-AndrewNeural for edge-tts, am_liam for kokoro)")
    parser.add_argument("--output", default="public/assets/audio",
                        help="Output directory for audio files")
    args = parser.parse_args()

    if args.engine == "browser":
        print("Browser TTS: No files generated. Audio plays in-browser during preview.")
        print("  For final render, use --engine edge-tts or --engine kokoro")
        sentences = load_script(args.script)
        print(f"  Script has {len(sentences)} sentences")
        return

    sentences = load_script(args.script)
    print(f"Loaded {len(sentences)} sentences from {args.script}")

    output_dir = Path(args.output)

    if args.engine == "edge-tts":
        voice = args.voice or "en-US-AndrewNeural"
        if voice not in EDGE_VOICES:
            print(f"Available edge-tts voices:")
            for k, v in EDGE_VOICES.items():
                print(f"  {k}: {v}")
            sys.exit(1)
        print(f"Generating with edge-tts voice: {voice}")
        results = asyncio.run(generate_edge_tts(sentences, voice, output_dir))

    elif args.engine == "kokoro":
        voice = args.voice or "am_liam"
        print(f"Generating with kokoro voice: {voice}")
        results = generate_kokoro(sentences, voice, output_dir)

    # Write manifest
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nDone! Generated {len(results)} audio files in {output_dir}/")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
