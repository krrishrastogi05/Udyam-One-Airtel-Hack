"""Udyam AI: one small, provider-agnostic language-model layer.

Configure in .env (first match wins):
  LLM_API_KEY + LLM_BASE_URL (+ LLM_MODEL)   any OpenAI-compatible endpoint (Gemini, Sarvam, Groq, vLLM, Ollama...)
  GEMINI_API_KEY (+ GEMINI_MODEL)             Google Gemini, native API
No key: callers fall back to the offline rules engine, so the product always works.
The model only ever proposes facts as JSON; prices and eligibility are decided by engine.py."""
from __future__ import annotations

import json
import os
import re
import time

import httpx

last_error: str | None = None


def provider() -> str | None:
    if os.getenv("LLM_API_KEY") and os.getenv("LLM_BASE_URL"):
        return "openai-compatible"
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    return None


def model() -> str | None:
    p = provider()
    if p == "openai-compatible":
        return os.getenv("LLM_MODEL", "gpt-4o-mini")
    if p == "gemini":
        return os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    return None


def available() -> bool:
    return provider() is not None


def status() -> dict:
    return {"online": available(), "provider": provider(), "model": model(), "last_error": last_error}


def _parse(txt: str) -> dict | None:
    data = json.loads(re.sub(r"^```(json)?|```$", "", txt.strip()))
    return data if isinstance(data, dict) else None


def chat_json(system: str, history: list[tuple[str, str]], user: str, timeout: float = 15) -> tuple[dict | None, int]:
    """history: [(role 'user'|'assistant', text)]. Returns (parsed JSON or None, latency ms)."""
    global last_error
    p = provider()
    t0 = time.time()
    if not p:
        return None, 0
    try:
        if p == "gemini":
            contents = [{"role": "user" if r == "user" else "model", "parts": [{"text": t}]} for r, t in history]
            contents.append({"role": "user", "parts": [{"text": user}]})
            r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model()}:generateContent",
                           headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, timeout=timeout,
                           json={"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
                                 "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json", "maxOutputTokens": 800,
                                                      # flash models can skip "thinking" for faster replies; pro models can't
                                                      **({"thinkingConfig": {"thinkingBudget": 0}} if "flash" in (model() or "") else {})}})
            r.raise_for_status()
            txt = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        else:
            msgs = [{"role": "system", "content": system}] + [{"role": r, "content": t} for r, t in history]
            msgs.append({"role": "user", "content": user})
            r = httpx.post(os.environ["LLM_BASE_URL"].rstrip("/") + "/chat/completions", timeout=timeout,
                           headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
                           json={"model": model(), "messages": msgs, "temperature": 0.3,
                                 "response_format": {"type": "json_object"}})
            r.raise_for_status()
            txt = r.json()["choices"][0]["message"]["content"]
        last_error = None
        return _parse(txt), int((time.time() - t0) * 1000)
    except Exception as e:  # network, quota, bad key, bad JSON -> caller uses the offline engine
        body = getattr(getattr(e, "response", None), "text", "")[:200]
        last_error = f"{type(e).__name__}: {str(e)[:160]} {body}".strip()
        print("AI fallback:", last_error)
        return None, int((time.time() - t0) * 1000)
