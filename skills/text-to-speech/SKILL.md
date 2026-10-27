---
name: text-to-speech
description: Generate WAV speech audio from text using the internal Kokoro TTS service. Use when the user requests spoken audio.
---

# Text to Speech

Generate WAV audio through the internal `https://tts.mmz.sh` service using Python 3. The service does not require authentication.

Resolve `text_to_speech_cli.py` against this skill directory and run it by absolute path from any working directory:

```bash
python3 <absolute-skill-directory>/text_to_speech_cli.py "Hello from the voice pipeline." --output /tmp/response.wav
```

Defaults: voice `af_heart`, speed `1.33`, model `kokoro`. Use `--help` for options; speed must be between `0.25` and `4.0`.

Ask before accessing the live service. Sending text to the service discloses it to that service; do not send sensitive text without explicit approval. Output may contain sensitive information: keep it outside version control and do not overwrite an existing file without permission. The text is a command-line argument and may be visible to other local processes.
