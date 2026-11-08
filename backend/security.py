"""Security building blocks: envelope encryption for documents, a tamper-evident audit log, signed partner sessions,
and a per-client rate limit. All in memory, like the rest of the prototype."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ---------------------------------------------------------------- envelope encryption
# Master key from .env (DATA_KEY, base64 32 bytes) or a fresh one per run. In production: a cloud KMS key.
_MASTER = base64.b64decode(os.getenv("DATA_KEY")) if os.getenv("DATA_KEY") else AESGCM.generate_key(bit_length=256)


def encrypt(data: bytes, context: str) -> dict:
    """Each blob gets its own data key; the data key is itself encrypted with the master key."""
    dk = AESGCM.generate_key(bit_length=256)
    n1, n2 = os.urandom(12), os.urandom(12)
    return {"wrapped": AESGCM(_MASTER).encrypt(n1, dk, context.encode()), "n1": n1,
            "blob": AESGCM(dk).encrypt(n2, data, context.encode()), "n2": n2}


def decrypt(env: dict, context: str) -> bytes:
    dk = AESGCM(_MASTER).decrypt(env["n1"], env["wrapped"], context.encode())
    return AESGCM(dk).decrypt(env["n2"], env["blob"], context.encode())


# ---------------------------------------------------------------- tamper-evident audit log
AUDIT: list[dict] = []


def audit(actor: str, action: str, journey: str | None = None, detail: str = "") -> dict:
    prev = AUDIT[-1]["hash"] if AUDIT else "0" * 64
    e = {"seq": len(AUDIT) + 1, "ts": round(time.time(), 3), "actor": actor, "action": action, "journey": journey,
         "detail": detail[:200], "prev": prev}
    e["hash"] = hashlib.sha256((prev + json.dumps({k: v for k, v in e.items() if k != "prev"}, sort_keys=True,
                                                   ensure_ascii=False)).encode()).hexdigest()
    AUDIT.append(e)
    return e


def verify_chain() -> tuple[bool, int | None]:
    prev = "0" * 64
    for e in AUDIT:
        body = {k: v for k, v in e.items() if k not in ("prev", "hash")}
        h = hashlib.sha256((prev + json.dumps(body, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
        if e["prev"] != prev or e["hash"] != h:
            return False, e["seq"]
        prev = e["hash"]
    return True, None


# ---------------------------------------------------------------- partner sessions
_SIGNING = os.getenv("SESSION_KEY", "").encode() or secrets.token_bytes(32)
PARTNER_CODE = os.getenv("PARTNER_CODE", "accel-partner")  # ponytail: one shared demo code; real build uses SSO


def issue_token(who: str, role: str = "partner", hours: int = 8) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"who": who, "role": role, "exp": int(time.time()) + hours * 3600}).encode()).decode()
    sig = hmac.new(_SIGNING, body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def check_token(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(_SIGNING, body.encode(), hashlib.sha256).hexdigest()[:32]):
        return None
    data = json.loads(base64.urlsafe_b64decode(body.encode()))
    return data if data.get("exp", 0) > time.time() else None


# ---------------------------------------------------------------- rate limit
_HITS: dict[str, deque] = defaultdict(deque)


def allow(key: str, limit: int = 60, window: float = 60.0) -> bool:
    """Sliding window. ponytail: per-process memory; move to Redis when there is more than one server."""
    q, t = _HITS[key], time.time()
    while q and q[0] < t - window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(t)
    return True


# ---------------------------------------------------------------- uploads
def sniff_image(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


if __name__ == "__main__":  # self-check
    env = encrypt(b"secret doc", "J1/gst")
    assert decrypt(env, "J1/gst") == b"secret doc"
    try:
        decrypt(env, "J2/gst")
        raise SystemExit("context binding failed")
    except Exception:
        pass
    for i in range(3):
        audit("test", f"a{i}", "J1")
    assert verify_chain() == (True, None)
    AUDIT[1]["detail"] = "edited"
    assert verify_chain() == (False, 2)
    t = issue_token("rohit")
    assert check_token(t)["who"] == "rohit" and check_token(t[:-1] + "x") is None
    assert all(allow("x", 3) for _ in range(3)) and not allow("x", 3)
    print("security self-check ok")
