#!/usr/bin/env python3
"""Generate WAV speech with the internal Kokoro API and save it locally."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://tts.mmz.sh/v1"
DEFAULT_MODEL = "kokoro"
DEFAULT_VOICE = "af_heart"
DEFAULT_SPEED = 1.33


class TextToSpeechError(Exception):
    """Represent an API or local output failure without exposing credentials."""


def generate_speech(
    text: str,
    output_path: Path,
    *,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_MODEL,
    voice: str = DEFAULT_VOICE,
    speed: float = DEFAULT_SPEED,
    timeout: int = 600,
) -> None:
    """Synthesize text and save returned WAV bytes.

    Inputs are text, destination path, and API settings; returns nothing. Performs
    one unauthenticated HTTP request and writes its response to disk. Raises
    TextToSpeechError for network, API, or output-file failures. The API base URL
    should include its version prefix, and speed must be in the supported range.
    """
    payload = json.dumps(
        {
            "model": model,
            "input": text,
            "voice": voice,
            "speed": speed,
            "response_format": "wav",
        }
    ).encode("utf-8")
    request = Request(
        f"{base_url.rstrip('/')}/audio/speech",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            audio = response.read()
    except HTTPError as exc:
        error_body = exc.read(500).decode("utf-8", errors="replace")
        raise TextToSpeechError(f"HTTP {exc.code}: {error_body}") from exc
    except URLError as exc:
        raise TextToSpeechError(f"Connection failed: {exc.reason}") from exc

    try:
        output_path.write_bytes(audio)
    except OSError as exc:
        raise TextToSpeechError(f"Could not write {output_path}: {exc}") from exc


def build_parser() -> argparse.ArgumentParser:
    """Return the argument parser for WAV generation.

    The parser defines text, output path, and optional API settings; it returns
    an argparse.ArgumentParser and performs no I/O.
    """
    parser = argparse.ArgumentParser(
        prog="text-to-speech",
        description="Generate WAV speech with the internal Kokoro TTS service.",
    )
    parser.add_argument("text", help="Text to synthesize")
    parser.add_argument("--output", type=Path, required=True, help="Path for the generated WAV file")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model (default: {DEFAULT_MODEL})")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"Voice (default: {DEFAULT_VOICE})")
    parser.add_argument("--speed", type=float, default=DEFAULT_SPEED, help=f"Speech speed from 0.25 to 4.0 (default: {DEFAULT_SPEED})")
    parser.add_argument("--timeout", type=int, default=600, help="Request timeout in seconds (default: 600)")
    return parser


def main() -> None:
    """Parse CLI input, save generated speech, and report its destination.

    Reads command-line arguments and writes the API response to the requested
    file. Exits with a parser error for invalid arguments or status 1 for an
    API/output error; successful runs print the output path.
    """
    parser = build_parser()
    args = parser.parse_args()
    if not args.text.strip():
        parser.error("text must not be empty")
    if not 0.25 <= args.speed <= 4.0:
        parser.error("--speed must be between 0.25 and 4.0")
    try:
        generate_speech(
            args.text,
            args.output,
            base_url=args.base_url,
            model=args.model,
            voice=args.voice,
            speed=args.speed,
            timeout=args.timeout,
        )
    except TextToSpeechError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"Saved WAV audio to {args.output}")


if __name__ == "__main__":
    main()
