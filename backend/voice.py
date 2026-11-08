"""Speech in Indian languages through Sarvam (speech-to-text saaras, text-to-speech bulbul).
Without SARVAM_API_KEY the browser's own speech service is used instead (see frontend/src/lib/voice.ts)."""
from __future__ import annotations

import base64
import hashlib
import os
import re
from collections import OrderedDict

import httpx

STT_URL = "https://api.sarvam.ai/speech-to-text"
TTS_URL = "https://api.sarvam.ai/text-to-speech"
BCP = {"en": "en-IN", "hi": "hi-IN", "hinglish": "hi-IN", "mr": "mr-IN", "ta": "ta-IN", "te": "te-IN", "kn": "kn-IN",
       "bn": "bn-IN", "gu": "gu-IN", "ml": "ml-IN", "pa": "pa-IN", "od": "od-IN"}
FROM_BCP = {"en-IN": "en", "hi-IN": "hi", "mr-IN": "mr", "ta-IN": "ta"}
last_error: str | None = None
_CACHE: OrderedDict[str, bytes] = OrderedDict()


def available() -> bool:
    return bool(os.getenv("SARVAM_API_KEY"))


def _headers() -> dict:
    return {"api-subscription-key": os.environ["SARVAM_API_KEY"]}


def stt(audio: bytes, filename: str, lang: str | None) -> dict:
    """Returns {"text", "lang"}. Raises on failure so the caller can tell the user to type instead."""
    global last_error
    try:
        r = httpx.post(STT_URL, headers=_headers(), timeout=30,
                       files={"file": (filename, audio, "audio/webm" if filename.endswith(".webm") else "application/octet-stream")},
                       data={"model": os.getenv("SARVAM_STT_MODEL", "saaras:v3"), "mode": "codemix",
                             "language_code": "unknown" if not lang or lang == "hinglish" else BCP.get(lang, "unknown")})
        r.raise_for_status()
        d = r.json()
        last_error = None
        return {"text": (d.get("transcript") or "").strip(), "lang": FROM_BCP.get(d.get("language_code") or "", None)}
    except Exception as e:
        last_error = f"{type(e).__name__}: {getattr(getattr(e, 'response', None), 'text', '')[:200] or str(e)[:200]}"
        print("Sarvam STT failed:", last_error)
        raise


def speakable(text: str) -> str:
    """Strip markdown, emoji and symbols the voice would read out literally."""
    text = re.sub(r"\*\*?([^*]+)\*\*?", r"\1", text)
    text = re.sub(r"[\U0001F000-\U0001FAFF☀-➿️]", "", text)
    return re.sub(r"\s+", " ", text.replace("👇", "")).strip()[:1200]


def tts(text: str, lang: str) -> bytes:
    """MP3 bytes. Cached, because the same confirmations are spoken again and again."""
    global last_error
    text = speakable(text)
    key = hashlib.sha1(f"{lang}|{text}".encode()).hexdigest()
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    try:
        r = httpx.post(TTS_URL, headers=_headers(), timeout=30,
                       json={"text": text, "language_code": BCP.get(lang, "en-IN"), "model": os.getenv("SARVAM_TTS_MODEL", "bulbul:v3"),
                             "speaker": os.getenv("SARVAM_SPEAKER", "priya"), "pace": 1.05, "output_audio_codec": "mp3",
                             "speech_sample_rate": 24000})
        r.raise_for_status()
        audio = base64.b64decode("".join(r.json()["audios"]))
        last_error = None
    except Exception as e:
        last_error = f"{type(e).__name__}: {getattr(getattr(e, 'response', None), 'text', '')[:200] or str(e)[:200]}"
        print("Sarvam TTS failed:", last_error)
        raise
    _CACHE[key] = audio
    if len(_CACHE) > 200:
        _CACHE.popitem(last=False)
    return audio


if __name__ == "__main__":
    assert speakable("Found it ✅ **Shah Dental** 👇") == "Found it Shah Dental"
    print("voice self-check ok", "(Sarvam key set)" if available() else "(no key: browser speech fallback)")
