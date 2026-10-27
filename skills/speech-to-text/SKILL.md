---
name: speech-to-text
description: Transcribe or translate local audio using the internal speech-to-text service. Use when the user requests a transcript, translation, or subtitles from an audio file.
---

# Speech to Text

Transcribe local audio through the internal `https://stt.mmz.sh` service using Python 3. It supports English, Polish, and automatic language detection; translation produces English text. Live microphone recording is not supported.

Resolve `speech_to_text_cli.py` against this skill directory and run it by absolute path from any working directory:

```bash
python3 <absolute-skill-directory>/speech_to_text_cli.py transcribe <audio-file> --language auto --text-only
```

Use `--language en` or `pl` when known. Use `--format srt` or `vtt` for subtitles, or `verbose_json` with `--timestamps segment` or `--timestamps word` for timestamps. Run the script and its subcommands with `--help` for options.

Ask before accessing the live service. Transcription uploads the audio; do not send sensitive audio without explicit approval. Keep transcripts outside version control unless requested. The service is normally unauthenticated; if configured otherwise, use `STT_API_KEY` from a secure environment, not the `--api-key` argument or a repository file. `STT_BASE_URL` optionally overrides the service URL.
