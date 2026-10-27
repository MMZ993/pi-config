#!/usr/bin/env python3
"""OpenAI-compatible speech-to-text CLI for stt.mmz.sh."""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ENV_FILE = Path(__file__).resolve().parent / ".env"
DEFAULT_BASE_URL = "https://stt.mmz.sh"
SUPPORTED_LANGUAGES = {"auto", "en", "pl"}
SUPPORTED_FORMATS = {"json", "text", "verbose_json", "srt", "vtt"}


class SpeechToTextError(Exception):
    """Raised on configuration or API errors."""


def _load_env() -> dict[str, str]:
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    return os.environ


class SpeechToTextClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: int = 600) -> None:
        env = _load_env()
        self.base_url = (base_url or env.get("STT_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.api_key = api_key or env.get("STT_API_KEY")
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    def models(self) -> Any:
        return self._request("GET", "/v1/models")

    def transcribe(
        self,
        file_path: Path,
        *,
        language: str = "auto",
        response_format: str = "json",
        prompt: str | None = None,
        temperature: float = 0.0,
        timestamps: list[str] | None = None,
    ) -> str | dict[str, Any]:
        return self._audio_request(
            "/v1/audio/transcriptions",
            file_path,
            language=language,
            response_format=response_format,
            prompt=prompt,
            temperature=temperature,
            timestamps=timestamps,
        )

    def translate(
        self,
        file_path: Path,
        *,
        language: str = "auto",
        response_format: str = "json",
        prompt: str | None = None,
        temperature: float = 0.0,
    ) -> str | dict[str, Any]:
        return self._audio_request(
            "/v1/audio/translations",
            file_path,
            language=language,
            response_format=response_format,
            prompt=prompt,
            temperature=temperature,
        )

    def _audio_request(
        self,
        endpoint: str,
        file_path: Path,
        *,
        language: str,
        response_format: str,
        prompt: str | None,
        temperature: float,
        timestamps: list[str] | None = None,
    ) -> str | dict[str, Any]:
        if not file_path.is_file():
            raise SpeechToTextError(f"File not found: {file_path}")
        if language not in SUPPORTED_LANGUAGES:
            raise SpeechToTextError("Unsupported language. Use one of: auto, en, pl.")
        if response_format not in SUPPORTED_FORMATS:
            raise SpeechToTextError("Unsupported response format. Use one of: json, text, verbose_json, srt, vtt.")

        data: dict[str, Any] = {
            "model": "whisper-1",
            "response_format": response_format,
            "temperature": str(temperature),
        }
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt
        if timestamps:
            data["timestamp_granularities[]"] = timestamps

        body, content_type = _encode_multipart(data, file_path)
        return self._request("POST", endpoint, body=body, content_type=content_type, force_text=response_format in {"text", "srt", "vtt"})

    def _request(
        self,
        method: str,
        endpoint: str,
        *,
        body: bytes | None = None,
        content_type: str | None = None,
        force_text: bool = False,
    ) -> str | dict[str, Any]:
        headers = self._headers()
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(f"{self.base_url}{endpoint}", data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")[:500]
            raise SpeechToTextError(f"HTTP {exc.code}: {error_body}") from exc
        except URLError as exc:
            raise SpeechToTextError(f"Connection failed: {exc.reason}") from exc
        if force_text:
            return response_body
        try:
            return json.loads(response_body)
        except ValueError:
            return response_body


def _encode_multipart(data: dict[str, Any], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----agents-utils-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in data.items():
        values = value if isinstance(value, list) else [value]
        for item in values:
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
            chunks.append(str(item).encode("utf-8"))
            chunks.append(b"\r\n")
    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode("utf-8"))
    chunks.append(b"Content-Type: application/octet-stream\r\n\r\n")
    chunks.append(file_path.read_bytes())
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _print_result(result: str | dict[str, Any], *, raw_text: bool = False) -> None:
    if isinstance(result, str):
        print(result, end="" if result.endswith("\n") else "\n")
        return
    if raw_text and isinstance(result.get("text"), str):
        print(result["text"])
        return
    print(json.dumps(result, ensure_ascii=False, indent=2))


def _cmd_transcribe(client: SpeechToTextClient, args: argparse.Namespace) -> None:
    result = client.transcribe(
        Path(args.file),
        language=args.language,
        response_format=args.format,
        prompt=args.prompt,
        temperature=args.temperature,
        timestamps=args.timestamps,
    )
    _print_result(result, raw_text=args.text_only)


def _cmd_translate(client: SpeechToTextClient, args: argparse.Namespace) -> None:
    result = client.translate(
        Path(args.file),
        language=args.language,
        response_format=args.format,
        prompt=args.prompt,
        temperature=args.temperature,
    )
    _print_result(result, raw_text=args.text_only)


def _cmd_models(client: SpeechToTextClient, args: argparse.Namespace) -> None:
    _print_result(client.models())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="speech-to-text",
        description="Transcribe audio with stt.mmz.sh. Supports English, Polish, or autodetect.",
        epilog="Examples:\n"
        "  speech_to_text_cli.py transcribe meeting.wav --language en --text-only\n"
        "  speech_to_text_cli.py transcribe rozmowa.m4a --language pl --format verbose_json\n"
        "  speech_to_text_cli.py translate nagranie.mp3 --language pl --text-only\n"
        "  speech_to_text_cli.py models\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--base-url", default=None, help="API base URL (default: STT_BASE_URL or https://stt.mmz.sh)")
    parser.add_argument("--api-key", default=None, help="API key (default: STT_API_KEY from environment or sibling .env)")
    parser.add_argument("--timeout", type=int, default=600, help="Request timeout in seconds (default: 600)")

    sub = parser.add_subparsers(dest="command")

    transcribe = sub.add_parser("transcribe", help="Transcribe an audio file")
    _add_audio_args(transcribe, allow_timestamps=True)
    transcribe.set_defaults(func=_cmd_transcribe)

    translate = sub.add_parser("translate", help="Translate audio to English text")
    _add_audio_args(translate, allow_timestamps=False)
    translate.set_defaults(func=_cmd_translate)

    models = sub.add_parser("models", help="List active model metadata")
    models.set_defaults(func=_cmd_models)

    return parser


def _add_audio_args(parser: argparse.ArgumentParser, *, allow_timestamps: bool) -> None:
    parser.add_argument("file", help="Audio file: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, or flac")
    parser.add_argument("--language", choices=sorted(SUPPORTED_LANGUAGES), default="auto", help="Audio language (default: auto)")
    parser.add_argument("--format", choices=sorted(SUPPORTED_FORMATS), default="json", help="Response format (default: json)")
    parser.add_argument("--prompt", default=None, help="Optional prompt to guide transcription style")
    parser.add_argument("--temperature", type=float, default=0.0, help="Sampling temperature between 0 and 1")
    parser.add_argument("--text-only", action="store_true", help="Print only the text field when JSON response includes one")
    if allow_timestamps:
        parser.add_argument(
            "--timestamps",
            choices=["segment", "word"],
            action="append",
            help="Timestamp granularity for verbose_json; can be passed more than once",
        )


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)
    try:
        client = SpeechToTextClient(base_url=args.base_url, api_key=args.api_key, timeout=args.timeout)
        args.func(client, args)
    except SpeechToTextError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
