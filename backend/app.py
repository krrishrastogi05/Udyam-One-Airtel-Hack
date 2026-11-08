"""Udyam One API. One journey, two channels (web + WhatsApp), kept in sync with server-sent events."""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
_env = ROOT.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

import secrets  # noqa: E402

import advisor  # noqa: E402
import ai  # noqa: E402
import engine  # noqa: E402
import kyc  # noqa: E402
import ops  # noqa: E402
import propensity  # noqa: E402
import security  # noqa: E402
import voice  # noqa: E402
from ops import trace  # noqa: E402

app = FastAPI(title="Udyam One API", version="2.0")
# Same-origin app; CORS only for the Vite dev server.
app.add_middleware(CORSMiddleware, allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?", allow_methods=["*"], allow_headers=["*"])

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "microphone=(self), camera=(self), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
                               "script-src 'self'; connect-src 'self'; frame-ancestors 'self'",
}


@app.middleware("http")
async def guard(request: Request, call_next):
    # rate limit writes per client (voice and uploads are the expensive ones)
    if request.method == "POST" and request.url.path.startswith("/api/"):
        ip = request.client.host if request.client else "?"
        heavy = any(s in request.url.path for s in ("/voice", "/upload", "/bill", "/tts"))
        if not security.allow(f"{ip}:{'heavy' if heavy else 'write'}", 30 if heavy else 120):
            return JSONResponse({"detail": "Too many requests. Wait a minute and try again."}, status_code=429)
    resp = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        resp.headers.setdefault(k, v)
    if request.url.scheme == "https":
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp

OCR_CACHE = json.loads((ROOT / "data" / "ocr_cache.json").read_text()) if (ROOT / "data" / "ocr_cache.json").exists() else {}
JOURNEYS: dict[str, dict] = {}
SUBS: dict[str, set[asyncio.Queue]] = {}
HANDOFFS: list[dict] = []
DOC_BLOBS: dict[tuple[str, str], tuple[dict, str]] = {}  # encrypted, in memory only; gone when the server stops
ESIGN: dict[str, str] = {}  # signing token -> journey id
PARTNER_SUBS: set[asyncio.Queue] = set()


# ------------------------------------------------------------------ state helpers
def now() -> float:
    return time.time()


ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_journey(channel: str = "web", lang: str = "en") -> dict:
    jid = "".join(secrets.choice(ID_CHARS) for _ in range(8))  # unguessable: the link is the owner's key to the journey
    j = {
        "id": jid, "created_at": now(), "updated_at": now(), "origin": channel, "lang": lang, "stage": "discover",
        "profile": {"needs": [], "said": {}}, "messages": [], "pending_slot": "business_type", "reco": None,
        "cart": None, "quote": None, "kyc": {"consent": False, "docs": {}, "result": None, "esign": None},
        "order": None, "handoff": None, "ai": "online" if ai.available() else "offline", "trace": [], "call": None,
        "agent_paused": None, "payment_failed": False,
    }
    JOURNEYS[jid] = j
    first = advisor.ask("business_type", lang, j["profile"])
    first["chips"] = advisor.chips("business_type", lang, j["profile"])
    bot(j, first)
    return j


def get(jid: str) -> dict:
    j = JOURNEYS.get(jid.upper())
    if not j:
        raise HTTPException(404, "Journey not found")
    return j


def partner_auth(request: Request) -> dict:
    """Partner console session: Bearer token from /api/partner/login (or ?t= for EventSource, which can't send headers)."""
    tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("t")
    who = security.check_token(tok)
    if not who:
        raise HTTPException(401, "Sign in to the partner console")
    return who


def bot(j: dict, msg: dict, channel: str | None = None):
    j["messages"].append({"id": uuid.uuid4().hex[:8], "role": "bot", "ts": now(), "channel": channel, "kind": "text", **msg})


def user(j: dict, text: str, channel: str, voice: bool = False, kind: str = "text", payload=None):
    j["messages"].append({"id": uuid.uuid4().hex[:8], "role": "user", "ts": now(), "channel": channel, "kind": kind,
                          "text": text, "voice": voice, "payload": payload})


def public(j: dict) -> dict:
    """What the browser gets. Data minimisation: raw OCR text and unmasked ID numbers never leave the server."""
    p = dict(j)
    k = dict(j["kyc"])
    k["docs"] = {d: {kk: vv for kk, vv in v.items() if kk not in ("fields", "text")} for d, v in j["kyc"]["docs"].items()}
    if k.get("esign"):
        k["esign"] = {kk: vv for kk, vv in k["esign"].items() if kk != "token"}
    p["kyc"] = k
    p["score"] = round(propensity.model().score_profile(j["profile"], "WhatsApp campaign" if j["origin"] == "wa" else "Website form"), 3)
    return p


async def publish(j: dict):
    j["updated_at"] = now()
    data = json.dumps(public(j), default=str)
    for q in list(SUBS.get(j["id"], ())):
        q.put_nowait(data)


async def publish_partner():
    for q in list(PARTNER_SUBS):
        q.put_nowait("refresh")


def plan_by_key(j: dict, key: str) -> dict:
    for pl in (j.get("reco") or {}).get("plans", []):
        if pl["key"] == key:
            return pl
    raise HTTPException(400, "Unknown plan")


def reprice(j: dict):
    c = j["cart"]
    j["quote"] = engine.price_bundle(c["items"], j["profile"], c["term"])
    j["quote"]["addons"] = engine.addon_suggestions(j["profile"], {i["id"] for i in c["items"] if i.get("on", True)})


def set_plan(j: dict, key: str):
    pl = plan_by_key(j, key)
    j["cart"] = {"plan": key, "items": [dict(i) for i in pl["items"]], "term": pl["quote"]["term"]}
    reprice(j)


def bundle_card(j: dict) -> dict:
    q = j["quote"]
    return {
        "kind": "bundle",
        "payload": {
            "plan": j["cart"]["plan"], "title": "Complete" if j["cart"]["plan"] == "complete" else "Essential",
            "monthly": q["monthly"], "monthly_with_gst": q["monthly_with_gst"], "setup": q["setup"], "eta_days": q["eta_days"],
            "term": q["term"], "saving_vs_flex": q["saving_vs_flex"], "current_spend": j["profile"].get("current_spend") or 0,
            "items": [{"id": l["id"], "name": l["name"], "qty": l["qty"], "monthly": l["monthly"], "why": l["why"],
                       "category": l["category"]} for l in q["lines"] if l["on"]],
        },
    }


def recommend(j: dict, lang: str):
    p = j["profile"]
    if not p.get("needs"):
        seg = p.get("segment") or engine.infer_segment(p)
        p["needs"] = list(engine.DEFAULT_NEEDS[seg])
        p["needs_auto"] = True
    fibre_ok = not p.get("no_fibre") and int(p.get("city_tier") or 2) in (1, 2)
    trace("Advisor", "check_serviceability", f"Fibre available in {p.get('city') or 'your area'}" if fibre_ok
          else f"No fibre at this address, 5G broadband offered", j, 40)
    with ops.timed() as t:
        j["reco"] = engine.recommend(p)
        p["segment"] = j["reco"]["segment"]
        set_plan(j, j["reco"]["best"])
    trace("Advisor", "price_quote", f"₹{j['quote']['monthly_with_gst']:,}/mo with GST, priced by the catalogue engine", j, t.ms)
    if j["reco"]["locked"]:
        trace("Advisor", "check_eligibility", "Locked: " + ", ".join(l["name"] for l in j["reco"]["locked"][:2]), j, 2, "warn")
    j["stage"] = "bundle"
    j["pending_slot"] = None
    last = next((m for m in reversed(j["messages"]) if m["role"] == "user"), None)
    if last and last.get("channel") == "web":  # owner is on the laptop: the phone hears about it too
        ops.send(j, "plan_ready", monthly=f"{j['quote']['monthly_with_gst']:,}")
    name = p.get("business_name") or {"en": "you", "hi": "आप", "hinglish": "Aap", "mr": "तुम्ही", "ta": "உங்கள் தொழில்"}.get(lang, "you")
    bot(j, {"text": advisor.tr("reco", lang, name=name, eta=j["quote"]["eta_days"])})
    bot(j, bundle_card(j))
    spend = int(p.get("current_spend") or 0)
    if spend:
        new = j["quote"]["monthly_with_gst"]
        if new <= spend:
            bot(j, {"text": advisor.tr("saving", lang, spend=spend, new=new, diff=spend - new)})
        else:
            extras = [engine.NEED_LABELS[n].lower() for n in p["needs"] if n not in ("internet", "mobile")][:3]
            bot(j, {"text": advisor.tr("upgrade", lang, spend=spend, diff=new - spend,
                                       extras=", ".join(extras) or "faster, more reliable service")})
    locked = j["reco"]["locked"]
    gst_locked = [l["name"] for l in locked if l["code"] == "gstin"]
    if gst_locked:
        bot(j, {"text": advisor.tr("locked", lang, names=", ".join(gst_locked))})
    bot(j, {"text": advisor.tr("confirm_cta", lang),
            "chips": {"hi": ["✅ Confirm", "सस्ता विकल्प", "किसी से बात करें"],
                      "hinglish": ["✅ Confirm", "Sasta option", "Expert se baat"],
                      "mr": ["✅ Confirm", "स्वस्त पर्याय", "माणसाशी बोला"],
                      "ta": ["✅ Confirm", "மலிவான திட்டம்", "ஒருவரிடம் பேச"]}.get(lang, ["✅ Confirm", "Show a cheaper option", "Talk to an expert"])})


def start_kyc(j: dict, lang: str, channel: str | None):
    j["stage"] = "verify"
    bot(j, {"text": advisor.tr("kyc_start", lang)})
    bot(j, {"kind": "consent", "payload": consent_notice(lang)})


def consent_notice(lang: str) -> dict:
    return {
        "purpose": "Verify that your business is registered and active, so we can activate business connections.",
        "data": ["GST certificate", "Udyam certificate (optional)", "ID of the person signing", "A recent utility bill"],
        "retention": "The KYC record is kept while your connection is active and for 3 years after it ends, as telecom rules require. Everything else is deleted 30 days after go-live. Masked everywhere on screen.",
        "rights": "You can withdraw consent or ask for deletion anytime by typing DELETE (except what telecom rules require us to keep).",
        "law": "Digital Personal Data Protection Act, 2023",
    }


def handoff(j: dict, reason: str, lang: str):
    p = j["profile"]
    score = propensity.model().score_profile(p, "WhatsApp campaign" if j["origin"] == "wa" else "Website form")
    h = {
        "id": "H" + uuid.uuid4().hex[:5].upper(), "journey": j["id"], "created_at": now(), "reason": reason,
        "business": p.get("business_name") or p.get("business_type") or "New business", "city": p.get("city"),
        "segment": engine.SEGMENTS.get(p.get("segment") or "", ""), "score": round(score, 3), "band": propensity.band(score),
        "summary": summary(j), "status": "new", "lang": lang,
        "monthly": (j.get("quote") or {}).get("monthly_with_gst"), "stage": j["stage"],
    }
    HANDOFFS.insert(0, h)
    j["handoff"] = h
    trace("Advisor", "handoff_to_partner", f"{reason}. Propensity {score:.2f}", j, 0, "warn")
    bot(j, {"text": advisor.tr("human", lang)})


def summary(j: dict) -> str:
    p = j["profile"]
    bits = [p.get("business_type"), f"{p.get('employees')} staff" if p.get("employees") else None,
            f"{p.get('sites')} site(s)" if p.get("sites") else None, p.get("city"),
            "GST active" if p.get("gst_active") else ("no GST" if p.get("has_gst") is False else None)]
    s = " · ".join(b for b in bits if b)
    if p.get("needs"):
        s += " — wants " + ", ".join(engine.NEED_LABELS.get(n, n).lower() for n in p["needs"][:5])
    if j.get("quote"):
        s += f". Quote ₹{j['quote']['monthly_with_gst']:,}/mo incl. GST"
    return s


# ------------------------------------------------------------------ conversation
def handle(j: dict, text: str, channel: str, voice: bool = False):
    p = j["profile"]
    lang = advisor.detect_lang(text, j.get("lang"))
    if len(text.split()) >= 2 or re.search(r"[ऀ-ॿ஀-௿]", text):
        j["lang"] = lang
    lang = j["lang"]
    user(j, text, channel, voice)
    if j.get("agent_paused"):  # a partner has taken over this chat; the advisor stays quiet
        trace("Advisor", "paused", f"{j['agent_paused']} is replying in person", j, 0)
        return
    slot = j.get("pending_slot")
    with ops.timed() as t:
        up, fl = advisor.extract(text, p, slot)
    if slot == "needs":
        lab = advisor.label_to_need(text)
        if lab:
            up["needs_add"] = list(dict.fromkeys((up.get("needs_add") or []) + lab))
    if slot == "gstin" and re.search(r"(skip|nahi|later|baad|छोड़|बाद में)", text.lower()):
        p["gstin_skipped"] = True

    if text.strip().upper() in ("DELETE", "DELETE MY DATA", "डिलीट"):
        if j.get("order"):
            bot(j, {"text": "Your order is placed, so telecom rules require us to keep the KYC record while your connection is active and for 3 years after it ends. Everything else is deleted 30 days after go-live. A partner can help with anything else."})
        else:
            delete_my_data(j, channel)
        return
    if fl.get("restart"):
        j.update({"profile": {"needs": []}, "stage": "discover", "reco": None, "cart": None, "quote": None,
                  "kyc": {"consent": False, "docs": {}, "result": None}, "order": None, "pending_slot": "business_type"})
        bot(j, advisor.ask("business_type", lang, j["profile"]))
        return
    if fl.get("human"):
        handoff(j, "Customer asked for a person", lang)
        return

    g = None
    if advisor.llm_available():
        g, ms = advisor.llm_turn(p, j["messages"][:-1], text, advisor.missing_slots(p) if j["stage"] == "discover" else [], j["stage"], lang)
        if g:
            gu = advisor.clean_llm_updates(g.get("updates") or {})
            for k, v in gu.items():
                if k == "needs_add":
                    up["needs_add"] = list(dict.fromkeys((up.get("needs_add") or []) + v))
                else:
                    up.setdefault(k, v)
            for k, v in (g.get("flags") or {}).items():
                if v:
                    fl[k] = True
            if g.get("language") in advisor.LANGS and not (j["lang"] in ("mr", "ta") and g["language"] in ("en", "hinglish")):
                j["lang"] = lang = g["language"]
            trace("Advisor", "understand", f"{len(gu)} facts from Udyam AI, identifiers redacted", j, ms)
        else:
            trace("Advisor", "understand", f"Udyam AI unavailable, offline rules found {len(up)} facts", j, ms, "warn")
    else:
        trace("Advisor", "understand", f"Offline rules found {len(up)} facts", j, t.ms)
    # remember the owner's own words behind each fact, so the plan can say "you said ..."
    said = p.setdefault("said", {})
    for k in up:
        key = {"employees": "people", "sites": "sites", "city": "city", "has_gst": "gst", "current_spend": "spend",
               "current_setup": "setup", "business_type": "business", "budget": "budget"}.get(k)
        if key:
            said[key] = text[:140]
    for n in up.get("needs_add") or []:
        said[f"need:{n}"] = text[:140]
    if up.get("gstin"):
        reg = kyc.lookup_gstin(up["gstin"])
        trace("Advisor", "lookup_gstin", f"{reg['status']}: {reg['trade_name']}" if reg else "Not in the GST registry", j, 3,
              "ok" if reg and reg["status"] == "Active" else "alarm")
    if fl.get("human"):
        handoff(j, "Customer asked for a person", lang)
        return

    stage = j["stage"]
    if stage == "discover":
        if slot == "needs" and fl.get("suggest") and not up.get("needs_add"):
            p["needs_auto"] = True
        extra = advisor.apply_updates(p, up, lang)
        nxt = advisor.next_slot(p)
        got_something = bool(up) or fl.get("suggest") or p.get("gstin_skipped")
        if g and g.get("reply"):
            asked = g.get("asked") or "none"
            for m in extra:
                bot(j, m)
            if nxt and asked == nxt:
                q = advisor.ask(nxt, lang, p)
                bot(j, {"text": g["reply"], "chips": q.get("chips"), "multi": q.get("multi"), "slot": nxt})
            else:
                bot(j, {"text": g["reply"]})
                if nxt:
                    bot(j, advisor.ask(nxt, lang, p))
            j["pending_slot"] = nxt
            if not nxt:
                recommend(j, lang)
            return
        for m in extra:
            bot(j, m)
        if not got_something and re.fullmatch(r"\W*(hi+|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|hii+|helo|good (morning|evening|afternoon))\W*",
                                              text.strip().lower()):
            bot(j, advisor.ask(nxt or "business_type", lang, p))
            j["pending_slot"] = nxt
            return
        if not got_something:
            faq = faq_answer(j, text, lang) if fl.get("question") else None
            if faq:
                bot(j, {"text": faq})
                if nxt:
                    bot(j, advisor.ask(nxt, lang, p))
            else:
                q = advisor.ask(nxt or "business_type", lang, p)
                bot(j, {**q, "text": advisor.tr("fallback", lang, q=q["text"])})
            j["pending_slot"] = nxt
            return
        j["pending_slot"] = nxt
        if nxt:
            bot(j, advisor.ask(nxt, lang, p))
        else:
            recommend(j, lang)
        return

    # after discovery
    if g and g.get("reply") and not (fl.get("confirm") or fl.get("cheaper") or up.get("needs_add")):
        bot(j, {"text": g["reply"]})
        return
    if stage == "bundle":
        if up.get("needs_add") and not fl.get("remove"):
            add_needs(j, up["needs_add"], lang)
            return
        if fl.get("cheaper"):
            set_plan(j, "essential")
            bot(j, {"text": advisor.tr("cheaper", lang, total=j["quote"]["monthly"])})
            bot(j, bundle_card(j))
            return
        if fl.get("confirm"):
            confirm(j, lang, channel)
            return
    if stage == "verify" and not j["kyc"]["consent"] and fl.get("confirm"):
        give_consent(j, lang, channel)
        return
    if stage == "track" and re.search(r"(status|kab|when|update|kahan|कब|स्टेटस)", text.lower()):
        o = j["order"]
        last = [e for e in o["events"] if e.get("done_at")][-1]
        nxt_e = next((e for e in o["events"] if not e.get("done_at")), None)
        bot(j, {"kind": "order_update", "payload": {"title": last["title"], "detail": last["detail"],
                                                     "next": nxt_e["title"] if nxt_e else None, "eta": o["eta_date"]}})
        return
    faq = faq_answer(j, text, lang)
    bot(j, {"text": faq or advisor.L({"en": "Got it 👍 You can also use the buttons above, or say *talk to an expert* anytime.",
                                      "hi": "ठीक है 👍 ऊपर के बटन इस्तेमाल करें, या कभी भी *expert से बात* लिखें।",
                                      "hinglish": "Theek hai 👍 Upar ke buttons use karo, ya kabhi bhi *expert se baat* likho.",
                                      "mr": "ठीक आहे 👍 वरची बटणं वापरा, किंवा कधीही *expert शी बोलायचं* लिहा.",
                                      "ta": "சரி 👍 மேலே உள்ள பொத்தான்களைப் பயன்படுத்துங்கள், அல்லது எப்போது வேண்டுமானாலும் *expert உடன் பேச* என்று எழுதுங்கள்."}, lang)})


def faq_answer(j: dict, text: str, lang: str) -> str | None:
    t = text.lower()
    eta = (j.get("quote") or {}).get("eta_days") or 5
    for pat, ans in advisor.FAQ:
        if re.search(pat, t):
            return (ans.get(lang) or ans["en"]).format(eta=eta)
    return None


def add_needs(j: dict, needs: list[str], lang: str):
    p = j["profile"]
    seg = p.get("segment") or "micro"
    ids = {i["id"] for i in j["cart"]["items"]}
    added = []
    for n in needs:
        for pid in engine.products_for_need(n, seg, p):
            if pid in ids:
                for it in j["cart"]["items"]:
                    if it["id"] == pid and not it.get("on", True):
                        it["on"] = True
                        added.append(engine.CATALOGUE[pid]["name"])
                continue
            j["cart"]["items"].append({"id": pid, "qty": engine._qty(pid, p), "on": True, "need": n, "core": False,
                                       "why": engine._why(n, pid)})
            added.append(engine.CATALOGUE[pid]["name"])
    p["needs"] = list(dict.fromkeys((p.get("needs") or []) + needs))
    reprice(j)
    if added:
        bot(j, {"text": advisor.tr("added", lang, names=", ".join(added), total=j["quote"]["monthly"])})
        bad = [i for i in j["quote"]["issues"]]
        if bad:
            bot(j, {"text": "⚠️ " + "; ".join(f"{b['name']}: {b['msg']}" for b in bad[:3])})
        bot(j, bundle_card(j))


def confirm(j: dict, lang: str, channel: str | None):
    if not j["quote"]["valid"]:
        bot(j, {"text": "⚠️ Some items can't be activated yet: " + "; ".join(f"{i['name']} — {i['msg']}" for i in j["quote"]["issues"][:3])})
        return
    j["quote"]["confirmed_at"] = now()
    start_kyc(j, lang, channel)


def give_consent(j: dict, lang: str, channel: str | None):
    j["kyc"]["consent"] = True
    j["kyc"]["consent_at"] = now()
    j["kyc"]["consent_channel"] = channel
    j["kyc"]["consent_purpose"] = "Verify the business to activate business connections"
    security.audit("owner", "consent_given", j["id"], f"purpose: business verification; via {channel}; retention: KYC record per DoT rules, everything else 30 days after go-live")
    trace("KYC", "record_consent", "Consent recorded with purpose and retention (DPDP Act)", j, 1)
    bot(j, {"kind": "doc_request", "payload": {"needed": doc_needs(j)},
            "text": advisor.L({"en": "Thank you 🙏 Now send clear photos of these documents, or fetch your Udyam certificate from DigiLocker and GST from the GST registry. I'll check them in seconds:",
                               "hi": "धन्यवाद 🙏 अब इन दस्तावेज़ों की साफ़ फ़ोटो भेजिए, या Udyam प्रमाणपत्र DigiLocker से और GST, GST रजिस्ट्री से लें। मैं कुछ सेकंड में जाँच लूँगा:",
                               "hinglish": "Dhanyavaad 🙏 Ab in documents ki saaf photo bhejo, ya Udyam certificate DigiLocker se aur GST, GST registry se lo. Main seconds mein check kar lunga:",
                               "mr": "धन्यवाद 🙏 आता या कागदपत्रांचे स्पष्ट फोटो पाठवा, किंवा Udyam प्रमाणपत्र DigiLocker मधून आणि GST, GST रजिस्ट्रीमधून घ्या. मी काही सेकंदांत तपासतो:",
                               "ta": "நன்றி 🙏 இந்த ஆவணங்களின் தெளிவான புகைப்படங்களை அனுப்புங்கள், அல்லது Udyam சான்றிதழை DigiLocker-இலிருந்தும் GST-ஐ GST பதிவேட்டிலிருந்தும் எடுங்கள். சில நொடிகளில் சரிபார்க்கிறேன்:"}, lang)})


def delete_my_data(j: dict, channel: str | None):
    """DPDP right to erasure: drop document images, extracted fields and identifiers. The plan stays."""
    for d in list(j["kyc"]["docs"]):
        DOC_BLOBS.pop((j["id"], d), None)
    j["kyc"] = {"consent": False, "docs": {}, "result": None, "deleted_at": now()}
    for k in ("gstin", "legal_name", "gst_status"):
        j["profile"].pop(k, None)
    for m in j["messages"]:
        if m.get("kind") in ("doc", "doc_result", "kyc_summary"):
            m["payload"] = {"deleted": True, "doc": (m.get("payload") or {}).get("doc")}
            if m.get("kind") != "doc":
                m["text"] = "🗑 (removed at your request)"
    if j["stage"] in ("verify", "pay"):
        j["stage"] = "verify" if (j.get("quote") or {}).get("confirmed_at") else j["stage"]
    lang = j.get("lang", "en")
    security.audit("owner", "delete_my_data", j["id"], "documents, photos and ID numbers erased")
    bot(j, {"text": advisor.L({"en": "🗑 Done. Your documents, photos and ID numbers are deleted from our systems. Your plan is saved — you can verify again anytime.",
                               "hi": "🗑 हो गया। आपके दस्तावेज़, फ़ोटो और ID नंबर हटा दिए गए हैं। आपका प्लान सुरक्षित है — कभी भी दोबारा वेरिफ़ाई करें।",
                               "hinglish": "🗑 Ho gaya. Aapke documents, photos aur ID numbers delete kar diye. Aapka plan save hai — kabhi bhi dobara verify karo.",
                               "mr": "🗑 झालं. तुमची कागदपत्रं, फोटो आणि ID नंबर हटवले. तुमचा प्लॅन जतन आहे, कधीही पुन्हा पडताळणी करा.",
                               "ta": "🗑 முடிந்தது. உங்கள் ஆவணங்கள், புகைப்படங்கள், ID எண்கள் நீக்கப்பட்டன. உங்கள் திட்டம் சேமிக்கப்பட்டுள்ளது."}, lang)},
        channel=None)


def doc_needs(j: dict) -> list[dict]:
    have = j["kyc"]["docs"]
    order = ["gst", "udyam", "id", "address"]
    return [{"type": d, "label": kyc.DOC_TYPES[d], "done": d in have and have[d].get("quality") == "ok",
             "optional": d == "udyam"} for d in order]


# ------------------------------------------------------------------ API models
class StartIn(BaseModel):
    channel: str = "web"
    lang: str = "en"


class MsgIn(BaseModel):
    text: str
    channel: str = "web"
    voice: bool = False


class ProfileIn(BaseModel):
    patch: dict


class PlanIn(BaseModel):
    plan: str
    channel: str = "web"


class CartIn(BaseModel):
    items: list[dict]
    term: int = 24


class ConsentIn(BaseModel):
    accepted: bool = True
    channel: str = "web"


class SpecimenIn(BaseModel):
    applicant: str
    doc: str
    channel: str = "web"


class PayIn(BaseModel):
    method: str = "upi"
    autopay: bool = True
    channel: str = "web"
    simulate_failure: bool = False  # demo: the UPI app times out, the Fulfilment agent sends a retry link


class HandoffIn(BaseModel):
    reason: str = "Needs help"
    channel: str = "web"


# ------------------------------------------------------------------ routes
@app.get("/api/health")
def health():
    m = propensity.model()
    s = ai.status()
    return {"ok": True, "ai": "online" if s["online"] else "offline", "ai_provider": s["provider"], "model": s["model"],
            "ai_last_error": s["last_error"], "voice": "sarvam" if voice.available() else "browser", "voice_last_error": voice.last_error,
            "ocr": kyc.OCR_ENGINE, "products": len(engine.CATALOGUE), "propensity_auc": round(m.auc, 3),
            "languages": list(advisor.LANGS)}


@app.get("/api/meta")
def meta():
    m = propensity.model()
    return {"funnel": m.funnel(), "leads": len(m.leads), "activated": int((m.leads["outcome"] == "Activated").sum()),
            "segments": engine.SEGMENTS, "needs": engine.NEED_LABELS, "ai": "online" if ai.available() else "offline"}


PERSONAS = [
    {"key": "micro", "title": "Kirana, salon, pharmacy", "share": 55, "who": "Micro retail & services",
     "profile": {"business_type": "Kirana store", "segment": "micro", "employees": 3, "sites": 1, "city_tier": 2,
                 "needs": ["internet", "mobile", "pos", "whatsapp"], "gst_active": True}},
    {"key": "prof", "title": "Clinic, CA firm, coaching", "share": 25, "who": "Professional offices",
     "profile": {"business_type": "Clinic", "segment": "prof", "employees": 6, "sites": 1, "city_tier": 1,
                 "needs": ["internet", "backup", "email", "security"], "gst_active": True}},
    {"key": "multi", "title": "Restaurant & retail chains", "share": 15, "who": "Small multi-site",
     "profile": {"business_type": "Restaurant chain", "segment": "multi", "employees": 25, "sites": 4, "city_tier": 1,
                 "needs": ["internet", "backup", "cctv", "pos", "wifi"], "gst_active": True}},
    {"key": "mfg", "title": "Textile, auto-parts units", "share": 5, "who": "Small manufacturers",
     "profile": {"business_type": "Textile unit", "segment": "mfg", "employees": 30, "sites": 1, "city_tier": 2,
                 "needs": ["internet", "security", "iot", "mobile"], "gst_active": True}},
]


@app.get("/api/personas")
def personas():
    out = []
    for pz in PERSONAS:
        r = engine.recommend(dict(pz["profile"]))
        want = "essential" if pz["key"] == "micro" else "complete"
        best = next(p for p in r["plans"] if p["key"] == want)
        q = best["quote"]
        out.append({"key": pz["key"], "title": pz["title"], "share": pz["share"], "who": pz["who"],
                    "monthly": q["monthly_with_gst"], "eta": q["eta_days"],
                    "items": [l["name"] for l in q["lines"] if l["on"]]})
    return out


@app.get("/api/catalogue")
def catalogue():
    return list(engine.CATALOGUE.values())


@app.post("/api/journeys")
async def start(b: StartIn):
    j = new_journey(b.channel, b.lang if b.lang in advisor.LANGS else "en")
    return public(j)


@app.get("/api/journeys/{jid}")
def read(jid: str):
    return public(get(jid))


@app.get("/api/journeys/{jid}/events")
async def events(jid: str, request: Request):
    j = get(jid)
    q: asyncio.Queue = asyncio.Queue()
    SUBS.setdefault(j["id"], set()).add(q)

    async def gen():
        try:
            yield f"data: {json.dumps(public(j), default=str)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            SUBS.get(j["id"], set()).discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/journeys/{jid}/message")
async def message(jid: str, b: MsgIn):
    j = get(jid)
    if not b.text.strip():
        raise HTTPException(400, "Empty message")
    # show the user's message on every screen immediately, then think
    await run_in_threadpool(handle, j, b.text.strip()[:800], b.channel, b.voice)
    await publish(j)
    if j.get("handoff") and j["handoff"]["created_at"] > now() - 2:
        await publish_partner()
    return public(j)


@app.post("/api/journeys/{jid}/profile")
async def profile(jid: str, b: ProfileIn):
    j = get(jid)
    p = j["profile"]
    allowed = {"business_name", "business_type", "employees", "sites", "city", "city_tier", "needs", "has_gst",
               "current_spend", "budget", "no_fibre"}
    for k, v in b.patch.items():
        if k in allowed:
            p[k] = v
    if "business_type" in b.patch or "sites" in b.patch:
        p["segment"] = engine.infer_segment(p)
    if j["stage"] != "discover" and j.get("cart"):
        old = j["cart"]["plan"]
        j["reco"] = engine.recommend(p)
        set_plan(j, old)
        bot(j, {"text": "Updated your details — prices and eligibility re-checked ✅"})
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/plan")
async def plan(jid: str, b: PlanIn):
    j = get(jid)
    set_plan(j, b.plan)
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/cart")
async def cart(jid: str, b: CartIn):
    j = get(jid)
    if not j.get("cart"):
        raise HTTPException(400, "No plan selected yet")
    items = []
    prev = {i["id"]: i for i in j["cart"]["items"]}
    for it in b.items:
        if it.get("id") in engine.CATALOGUE:
            q = max(1, min(500, int(it.get("qty") or 1)))
            old = prev.get(it["id"], {})
            qty_set = bool(old.get("qty_set")) or (bool(old) and old.get("qty") != q)
            items.append({"id": it["id"], "qty": q, "on": bool(it.get("on", True)), "qty_set": qty_set,
                          "need": it.get("need"), "core": it.get("core", False),
                          "why": it.get("why") or engine.CATALOGUE[it["id"]]["description"]})
    j["cart"]["items"] = items
    j["cart"]["term"] = 24 if b.term >= 24 else 12
    reprice(j)
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/confirm")
async def confirm_route(jid: str, b: PlanIn):
    j = get(jid)
    if j["cart"]["plan"] != b.plan and b.plan in ("essential", "complete"):
        set_plan(j, b.plan)
    user(j, {"en": "✅ Confirm"}.get("en"), b.channel, kind="action")
    confirm(j, j["lang"], b.channel)
    if b.channel == "web":
        bot(j, {"text": "Confirmed from the web app 💻 — you can continue here on WhatsApp too."}, channel="wa")
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/kyc/consent")
async def consent(jid: str, b: ConsentIn):
    j = get(jid)
    if not b.accepted:
        raise HTTPException(400, "Consent is required to verify documents")
    if j["stage"] == "bundle":
        confirm(j, j["lang"], b.channel)
    user(j, "I agree ✅", b.channel, kind="action")
    give_consent(j, j["lang"], b.channel)
    await publish(j)
    return public(j)


async def _ingest(j: dict, doc: str, data: bytes, channel: str, cached: dict | None, fname: str):
    if not j["kyc"]["consent"]:
        raise HTTPException(403, "Please give consent before sharing documents")
    if doc not in kyc.DOC_TYPES:
        raise HTTPException(400, "Unknown document type")
    mime = security.sniff_image(data)
    if not mime:
        raise HTTPException(415, "Send a photo (JPG, PNG or WebP)")
    DOC_BLOBS[(j["id"], doc)] = (security.encrypt(data, f"{j['id']}/{doc}"), mime)
    security.audit("owner", "document_received", j["id"], f"{kyc.DOC_TYPES[doc]} via {channel}, encrypted at rest")
    ver = uuid.uuid4().hex[:6]
    user(j, f"📎 {kyc.DOC_TYPES[doc]}", channel, kind="doc", payload={"doc": doc, "name": fname, "img": f"/api/journeys/{j['id']}/kyc/{doc}/image?v={ver}"})
    await publish(j)
    with ops.timed() as t:
        res = await run_in_threadpool(kyc.analyze, data, doc, cached)
    trace("KYC", "read_document", f"{kyc.DOC_TYPES[doc]}: " + ("photo too blurry, retake asked" if res["quality"] != "ok" else
          f"read{', straightened ' + str(round(abs(res.get('angle') or 0))) + '°' if abs(res.get('angle') or 0) >= 1 else ''}"),
          j, t.ms if cached is None else t.ms + 1400, "ok" if res["quality"] == "ok" else "warn")
    if res["quality"] != "ok" and channel == "web":
        ops.send(j, "retake", doc=kyc.DOC_TYPES[doc], why=res["message"])
    fields = {k: v for k, v in (res.get("fields") or {}).items() if not k.startswith("_")}
    masked = dict(fields)
    for k in ("gstin", "udyam_number", "id_number", "consumer_no"):
        if masked.get(k):
            masked[k] = kyc.mask(masked[k], 4, 3)
    j["kyc"]["docs"][doc] = {"type": res.get("type"), "fields": res.get("fields") or {}, "quality": res["quality"],
                             "img": f"/api/journeys/{j['id']}/kyc/{doc}/image?v={ver}",
                             "angle": res.get("angle"), "message": res.get("message"), "at": now(), "masked": masked}
    run_checks(j)
    if fields.get("gstin") and not j["profile"].get("gstin"):
        reg = kyc.lookup_gstin(fields["gstin"])
        if reg:
            j["profile"].update({"gstin": fields["gstin"], "has_gst": True, "gst_active": reg["status"] == "Active",
                                 "business_name": reg["trade_name"], "legal_name": reg["legal_name"]})
    mine = [c for c in j["kyc"]["result"]["checks"] if c.get("doc") == doc]
    if res["quality"] != "ok":
        txt = "📷 " + res["message"]
    elif res.get("message"):
        txt = "🤔 " + res["message"]
    else:
        bad = [c for c in mine if c["status"] == "fail"]
        txt = (f"✅ {kyc.DOC_TYPES[doc]} read" + (f" (straightened by {abs(res['angle']):.0f}°)" if abs(res.get('angle') or 0) >= 1 else "")
               + (" — but " + bad[0]["detail"] if bad else " — looks good."))
    bot(j, {"kind": "doc_result", "text": txt,
            "payload": {"doc": doc, "label": kyc.DOC_TYPES[doc], "quality": res["quality"], "fields": masked,
                        "angle": res.get("angle"), "checks": mine}})
    await finish_kyc_if_complete(j)


def run_checks(j: dict):
    """Evaluate every document we have. A completed e-sign stands in for the signatory ID photo."""
    docs = {k: v for k, v in j["kyc"]["docs"].items()}
    es = j["kyc"].get("esign") or {}
    if es.get("status") == "signed" and "id" not in docs:
        docs["id"] = {"quality": "ok", "fields": {"name": es["name"], "business": j["profile"].get("legal_name") or j["profile"].get("business_name"),
                                                  "valid_till": "2031-12-31"}}
    with ops.timed() as t:
        r = kyc.evaluate(docs)
    if es.get("status") == "signed":
        for c in r["checks"]:
            if c["key"] == "id_valid":
                c.update(title="Signatory e-signed", detail=f"{es['name']} signed with an Aadhaar OTP (simulated eSign).")
    j["kyc"]["result"] = r
    s = r["summary"]
    trace("KYC", "cross_check", f"{s['pass']} passed, {s['fail']} failed, {s['warn']} warnings", j, t.ms,
          "alarm" if r["status"] == "blocked" else "warn" if s["fail"] else "ok")
    for c in r["checks"]:
        if c["key"] == "gstin_registry":
            trace("KYC", "registry_check", c["detail"][:90], j, 4, "ok" if c["status"] == "pass" else "alarm")


def kyc_complete(j: dict) -> bool:
    have = j["kyc"]["docs"]
    signed = (j["kyc"].get("esign") or {}).get("status") == "signed"
    need = ["gst", "address"] + ([] if signed else ["id"])
    return all(d in have and have[d].get("quality") == "ok" for d in need)


async def finish_kyc_if_complete(j: dict):
    if kyc_complete(j) and j["stage"] in ("verify",):
        r = j["kyc"]["result"]
        bot(j, {"kind": "kyc_summary", "payload": {"status": r["status"], "summary": r["summary"],
                                                   "checks": r["checks"], "registry": r["registry"]}})
        if r["status"] == "verified":
            j["stage"] = "pay"
            bot(j, {"kind": "payment", "payload": payment_card(j)})
        elif r["status"] == "blocked":
            handoff(j, "KYC blocked: " + next(c["detail"] for c in r["checks"] if c["status"] == "fail"), j["lang"])
    await publish(j)
    if j.get("handoff") and j["handoff"]["created_at"] > now() - 2:
        await publish_partner()


@app.post("/api/journeys/{jid}/kyc/upload")
async def upload(jid: str, doc: str = Form(...), channel: str = Form("web"), file: UploadFile = File(...)):
    j = get(jid)
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 8 MB)")
    await _ingest(j, doc, data, channel, None, file.filename or "photo")
    return public(j)


@app.post("/api/journeys/{jid}/kyc/specimen")
async def specimen(jid: str, b: SpecimenIn):
    j = get(jid)
    path = kyc.specimen_path(b.applicant.upper(), b.doc)
    if not path.exists():
        raise HTTPException(404, "Specimen not found")
    cached = OCR_CACHE.get(f"{b.applicant.upper()}_{b.doc}")
    await _ingest(j, b.doc, path.read_bytes(), b.channel, cached, path.name)
    return public(j)


@app.get("/api/journeys/{jid}/kyc/{doc}/image")
def doc_image(jid: str, doc: str):
    blob = DOC_BLOBS.get((jid.upper(), doc))
    if not blob:
        raise HTTPException(404)
    from fastapi import Response
    data = security.decrypt(blob[0], f"{jid.upper()}/{doc}")
    return Response(data, media_type=blob[1], headers={"Cache-Control": "private, no-store"})


@app.get("/api/journeys/{jid}/kyc/{doc}/evidence")
def doc_evidence(jid: str, doc: str, check: str):
    """Boxes around the exact characters a failed check is about (e.g. an edited GSTIN), read from the photo."""
    j = get(jid)
    blob = DOC_BLOBS.get((j["id"], doc))
    d = j["kyc"]["docs"].get(doc)
    if not blob or not d:
        raise HTTPException(404)
    f = d.get("fields") or {}
    needle = {"gstin_format": f.get("gstin"), "gstin_registry": f.get("gstin"), "gst_name_registry": f.get("legal_name"),
              "udyam_number": f.get("udyam_number"), "udyam_name": f.get("enterprise_name"), "id_business": f.get("business"),
              "id_valid": f.get("valid_till"), "address_date": f.get("bill_date"), "address_match": (f.get("address") or "").split(",")[0],
              "address_name": f.get("billed_to")}.get(check)
    if not needle:
        return {"w": 0, "h": 0, "boxes": []}
    with ops.timed() as t:
        out = kyc.evidence_boxes(security.decrypt(blob[0], f"{j['id']}/{doc}"), needle)
    trace("KYC", "locate_evidence", f"{len(out['boxes'])} region(s) for {check.replace('_', ' ')}", j, t.ms)
    return out


@app.get("/api/kyc/specimens")
def specimens():
    out = []
    for a in kyc.specimen_applicants():
        g = OCR_CACHE.get(f"{a['id']}_gst", {}).get("fields", {})
        out.append({**a, "name": g.get("trade_name") or "Unreadable (blurry) certificate"})
    return out


@app.get("/api/kyc/specimen/{applicant}/{doc}.png")
def specimen_img(applicant: str, doc: str):
    p = kyc.specimen_path(applicant.upper(), doc)
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, headers={"Cache-Control": "max-age=3600"})


def payment_card(j: dict) -> dict:
    q = j["quote"]
    setup_gst = round(q["setup"] * engine.GST_RATE)
    return {"due_now": q["setup"] + setup_gst, "setup": q["setup"], "setup_gst": setup_gst,
            "monthly_with_gst": q["monthly_with_gst"], "first_bill": "after activation", "eta_days": q["eta_days"]}


def build_order(j: dict) -> dict:
    q = j["quote"]
    ids = {l["id"] for l in q["lines"] if l["on"]}
    eta = max(1, q["eta_days"])
    start = datetime.now()
    wired = ids & {"P01", "P02", "P03", "P05", "P06"}
    ev = [
        ("placed", "Order confirmed", "Payment received. Your order number is {oid}.", 0),
        ("kyc", "Business verified", "GST and documents verified. No further paperwork needed.", 0),
    ]
    if ids & {"P07", "P08"}:
        ev.append(("sims", "SIMs dispatched", "Business SIMs are on the way, with eSIM activation over WhatsApp.", 1))
    if wired:
        ev.append(("survey", "Site check booked", f"Technician visit on {(start + timedelta(days=1)).strftime('%a %d %b')}, 10am–1pm.", 1))
    ev.append(("install", "Installation scheduled", f"Installer assigned for {(start + timedelta(days=max(1, eta - 1))).strftime('%a %d %b')}.", max(1, eta - 1)))
    ev.append(("installed", "Installed & tested", "Speed test passed. All devices connected.", eta))
    ev.append(("live", "You're live 🎉", "All services active on one bill. Support: one number, in your language.", eta))
    oid = "UO" + uuid.uuid4().hex[:6].upper()
    return {
        "id": oid, "placed_at": now(), "eta_date": (start + timedelta(days=eta)).strftime("%a, %d %b"), "eta_days": eta,
        "events": [{"key": k, "title": t, "detail": d.format(oid=oid), "day": dd,
                    "planned": (start + timedelta(days=dd)).strftime("%d %b"), "done_at": None} for k, t, d, dd in ev],
        "status": "placed",
    }


@app.post("/api/journeys/{jid}/pay")
async def pay(jid: str, b: PayIn):
    j = get(jid)
    if not j.get("kyc", {}).get("result") or j["kyc"]["result"]["status"] != "verified":
        raise HTTPException(409, "KYC must be verified before payment")
    if j.get("order"):
        return public(j)
    due = payment_card(j)["due_now"]
    if b.simulate_failure:
        j["payment_failed"] = True
        trace("Fulfilment", "collect_payment", f"UPI timed out for ₹{due:,}. Nothing charged", j, 30000, "warn")
        trace("Fulfilment", "retry_payment", "Retry link sent, attempt 2 of 3", j, 20)
        ops.send(j, "payment_failed", amount=f"{due:,}")
        await publish(j)
        return public(j)
    user(j, f"💳 Paid via {b.method.upper()}", b.channel, kind="action")
    o = build_order(j)
    o["method"], o["autopay"] = b.method, b.autopay
    o["events"][0]["done_at"] = now()
    o["events"][1]["done_at"] = now()
    j["order"] = o
    j["stage"] = "track"
    j["payment_failed"] = False
    security.audit("owner", "payment", j["id"], f"₹{due:,} by {b.method.upper()}, autopay {'on' if b.autopay else 'off'}")
    trace("Fulfilment", "collect_payment", f"₹{due:,} received by {b.method.upper()}", j, 900)
    nxt = next((e for e in o["events"] if not e["done_at"]), None)
    trace("Fulfilment", "book_install", nxt["detail"] if nxt else "Scheduled", j, 120)
    ops.send(j, "payment_ok", oid=o["id"], eta=o["eta_date"])
    bot(j, {"kind": "order", "payload": {"id": o["id"], "eta": o["eta_date"], "eta_days": o["eta_days"]},
            "text": advisor.L({"en": f"🎉 Order {o['id']} confirmed! You'll be live by **{o['eta_date']}**. I'll message you at every step — no need to call anyone.",
                               "hi": f"🎉 ऑर्डर {o['id']} पक्का! आप **{o['eta_date']}** तक लाइव होंगे। हर कदम पर मैं मैसेज करूँगा — किसी को कॉल करने की ज़रूरत नहीं।",
                               "hinglish": f"🎉 Order {o['id']} confirm! Aap **{o['eta_date']}** tak live ho jaoge. Har step pe main message karunga — kisi ko call karne ki zaroorat nahi.",
                               "mr": f"🎉 ऑर्डर {o['id']} पक्की! तुम्ही **{o['eta_date']}** पर्यंत सुरू व्हाल. प्रत्येक टप्प्यावर मी मेसेज करेन, कोणाला कॉल करायची गरज नाही.",
                               "ta": f"🎉 ஆர்டர் {o['id']} உறுதி! **{o['eta_date']}**-க்குள் சேவை தொடங்கும். ஒவ்வொரு படியிலும் செய்தி அனுப்புவேன், யாரையும் அழைக்க வேண்டாம்."}, j["lang"])})
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/order/advance")
async def advance(jid: str):
    j = get(jid)
    o = j.get("order")
    if not o:
        raise HTTPException(400, "No order yet")
    nxt = next((e for e in o["events"] if not e["done_at"]), None)
    if not nxt:
        return public(j)
    nxt["done_at"] = now()
    o["status"] = nxt["key"]
    bot(j, {"kind": "order_update", "payload": {"title": nxt["title"], "detail": nxt["detail"], "key": nxt["key"],
                                                 "eta": o["eta_date"]}})
    trace("Fulfilment", "update_order", f"{nxt['title']}", j, 60)
    if nxt["key"] == "live":
        ops.send(j, "live")
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/handoff")
async def handoff_route(jid: str, b: HandoffIn):
    j = get(jid)
    user(j, "🙋 Talk to an expert", b.channel, kind="action")
    handoff(j, b.reason, j["lang"])
    await publish(j)
    await publish_partner()
    return public(j)


@app.post("/api/journeys/{jid}/delete-data")
async def delete_data(jid: str, b: HandoffIn):
    j = get(jid)
    if j.get("order"):
        raise HTTPException(409, "Order already placed: telecom rules require us to keep the KYC record while the connection is active and for 3 years after it ends")
    user(j, "🗑 Delete my data", b.channel, kind="action")
    delete_my_data(j, b.channel)
    await publish(j)
    return public(j)


@app.post("/api/journeys/{jid}/reset")
async def reset(jid: str):
    j = get(jid)
    fresh = new_journey(j["origin"], j.get("lang", "en"))
    fresh["id"] = j["id"]
    JOURNEYS[j["id"]] = fresh
    JOURNEYS.pop(fresh["id"] + "_", None)
    await publish(fresh)
    return public(fresh)


# ------------------------------------------------------------------ partner desk
@app.get("/api/partner/queue")
def partner_queue(_=Depends(partner_auth)):
    m = propensity.model()
    return {"handoffs": HANDOFFS[:30], "winback": m.winback(30), "auc": round(m.auc, 3), "lift": round(m.lift, 2),
            "capture": round(m.capture, 2), "drivers": m.drivers(8)}


@app.get("/api/partner/insights")
def partner_insights():
    m = propensity.model()
    return {"funnel": m.funnel(), "by_source": m.by("lead_source"), "by_segment": m.by("segment"),
            "by_gstin": m.by("has_gstin"), "by_internet": m.by("current_internet")}


@app.get("/api/partner/cohort")
def partner_cohort(segment: str = "all", month: str = "all"):
    """Market pulse: the supplied lead cohort, filtered. Aggregates only, never individual leads."""
    m = propensity.model()
    L = m.leads.copy()
    L["month"] = L["created_date"].str[:7]
    if segment != "all":
        L = L[L["segment"] == engine.SEGMENTS.get(segment, segment)]
    if month != "all":
        L = L[L["month"] == month]
    order = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"]
    idx = {st: i for i, st in enumerate(order)}
    reached = L["stage_reached"].map(idx)
    funnel = [{"stage": st, "count": int((reached >= i).sum())} for i, st in enumerate(order)]
    drop = None
    for a_, b_ in zip(funnel, funnel[1:]):
        lost = a_["count"] - b_["count"]
        if a_["count"] and (drop is None or b_["count"] / a_["count"] < drop["kept"]):
            drop = {"from": a_["stage"], "to": b_["stage"], "lost": lost, "kept": round(b_["count"] / a_["count"], 3)}
    act = L[L["outcome"] == "Activated"]
    n = len(L)
    reasons = L[L["outcome"] == "Dropped"]["drop_reason"].value_counts().head(5)
    months = []
    for mo, g in m.leads.assign(month=m.leads["created_date"].str[:7]).groupby("month"):
        g = g if segment == "all" else g[g["segment"] == engine.SEGMENTS.get(segment, segment)]
        months.append({"month": mo, "leads": int(len(g)), "activated": int((g["outcome"] == "Activated").sum())})
    return {
        "filters": {"segment": segment, "month": month}, "leads": n, "activated": int(len(act)),
        "rate": round(len(act) / n, 4) if n else 0, "funnel": funnel, "drop": drop,
        "days": round(float(act["days_lead_to_activation"].mean()), 1) if len(act) else None,
        "calls": round(float(act["customer_follow_up_calls"].mean()), 1) if len(act) else None,
        "cac": int(L["acquisition_cost_inr"].sum() / len(act)) if len(act) else None,
        "churn": round(float((act["churned_within_6_months"] == "Y").mean()), 3) if len(act) else None,
        "nps": round(float(act["nps_score"].mean()), 1) if len(act) else None,
        "reasons": [{"reason": k, "count": int(v)} for k, v in reasons.items()],
        "months": months, "segments": engine.SEGMENTS,
    }


@app.get("/api/partner/events")
async def partner_events(request: Request, _=Depends(partner_auth)):
    q: asyncio.Queue = asyncio.Queue()
    PARTNER_SUBS.add(q)

    async def gen():
        try:
            yield "data: hello\n\n"
            while not await request.is_disconnected():
                try:
                    yield f"data: {await asyncio.wait_for(q.get(), timeout=15)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            PARTNER_SUBS.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


class AcceptIn(BaseModel):
    partner: str = "Rohit Verma"
    shop: str = "Shree Telecom, Accel Partner"
    slot: str = "today, 4–5 pm"


@app.post("/api/partner/handoffs/{hid}/accept")
async def accept(hid: str, b: AcceptIn, who=Depends(partner_auth)):
    h = next((x for x in HANDOFFS if x["id"] == hid), None)
    if not h:
        raise HTTPException(404)
    h["status"] = "accepted"
    h["partner"] = b.partner
    j = JOURNEYS.get(h["journey"])
    if j:
        bot(j, {"kind": "partner", "payload": {"name": b.partner, "shop": b.shop, "slot": b.slot},
                "text": advisor.L({"en": f"👋 {b.partner} from {b.shop} will call you {b.slot}. They already have your details — no need to repeat anything.",
                                   "hi": f"👋 {b.shop} से {b.partner} आपको {b.slot} कॉल करेंगे। आपकी सारी जानकारी उनके पास है।",
                                   "hinglish": f"👋 {b.shop} se {b.partner} aapko {b.slot} call karenge. Saari details unke paas hain.",
                                   "mr": f"👋 {b.shop} मधून {b.partner} तुम्हाला {b.slot} कॉल करतील. तुमची सगळी माहिती त्यांच्याकडे आहे.",
                                   "ta": f"👋 {b.shop}-இலிருந்து {b.partner} உங்களை {b.slot} அழைப்பார். உங்கள் விவரங்கள் அவரிடம் உள்ளன."}, j["lang"])})
        await publish(j)
    await publish_partner()
    return h


class LangIn(BaseModel):
    lang: str


@app.post("/api/journeys/{jid}/lang")
async def set_lang(jid: str, b: LangIn):
    """Owner picks a language. If they haven't said anything yet, the greeting is re-asked in that language."""
    j = get(jid)
    if b.lang not in advisor.LANGS:
        raise HTTPException(400, "Unsupported language")
    j["lang"] = b.lang
    if not any(m["role"] == "user" for m in j["messages"]):
        j["messages"] = []
        first = advisor.ask("business_type", b.lang, j["profile"])
        bot(j, first)
    trace("Advisor", "set_language", advisor.LANG_NAMES.get(b.lang, b.lang), j, 0)
    await publish(j)
    return public(j)


@app.get("/api/journeys/{jid}/ai-view")
def ai_view(jid: str):
    """Transparency: the owner's last message as typed, and exactly what the language model received."""
    j = get(jid)
    last = next((m for m in reversed(j["messages"]) if m["role"] == "user" and m.get("kind") == "text" and m.get("text")), None)
    raw = last["text"] if last else ""
    return {"raw": raw, "sent": advisor.redact(raw), "ai": "online" if ai.available() else "offline"}


# ------------------------------------------------------------------ voice (Sarvam) and the live call
def _new_bot_text(j: dict, since: int) -> str:
    return " ".join(m["text"] for m in j["messages"][since:] if m["role"] == "bot" and m.get("text") and m.get("kind") in ("text", "doc_result", None))


@app.get("/api/voice/status")
def voice_status():
    return {"engine": "sarvam" if voice.available() else "browser", "last_error": voice.last_error}


@app.post("/api/journeys/{jid}/voice")
async def voice_turn(jid: str, file: UploadFile = File(...), channel: str = Form("wa"), mode: str = Form("note")):
    """A voice note (or one turn of a live call): speech-to-text in the owner's language, then the normal advisor."""
    j = get(jid)
    if not voice.available():
        raise HTTPException(503, "Server voice is off. The app uses the browser's speech service instead.")
    audio = await file.read()
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(413, "Voice note too long")
    try:
        with ops.timed() as t:
            heard = await run_in_threadpool(voice.stt, audio, file.filename or "note.webm", j.get("lang"))
    except Exception:
        raise HTTPException(502, "Couldn't hear that clearly. Try again, or type your message.")
    trace("Advisor", "speech_to_text", f"{(heard['lang'] or j.get('lang') or '?').upper()}: “{heard['text'][:60]}”", j, t.ms)
    if not heard["text"]:
        raise HTTPException(422, "Didn't catch anything. Try again a little closer to the phone.")
    if heard.get("lang") in advisor.LANGS and j.get("lang") != "hinglish":
        j["lang"] = heard["lang"]
    since = len(j["messages"])
    await run_in_threadpool(handle, j, heard["text"][:800], channel, True)
    await publish(j)
    if j.get("handoff") and j["handoff"]["created_at"] > now() - 2:
        await publish_partner()
    return {"heard": heard["text"], "reply": voice.speakable(_new_bot_text(j, since)), "lang": j["lang"], "journey": public(j)}


class TtsIn(BaseModel):
    text: str
    lang: str = "en"


@app.post("/api/voice/tts")
async def tts(b: TtsIn):
    if not voice.available():
        raise HTTPException(503, "Server voice is off")
    try:
        audio = await run_in_threadpool(voice.tts, b.text[:1200], b.lang)
    except Exception:
        raise HTTPException(502, "Voice service didn't answer")
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


class CallIn(BaseModel):
    action: str  # request | answer | end
    by: str = "owner"


@app.post("/api/journeys/{jid}/call")
async def call(jid: str, b: CallIn):
    j = get(jid)
    if b.action == "request":
        ops.send(j, "callback", channel="call")
        trace("Advisor", "schedule_callback", "Owner asked for a call; ringing now", j, 0)
    elif b.action == "answer" and j.get("call"):
        j["call"].update(state="live", answered_at=now())
        trace("Advisor", "voice_call", f"Live call in {advisor.LANG_NAMES.get(j['lang'], j['lang'])}", j, 0)
    elif b.action == "end" and j.get("call"):
        dur = int(now() - (j["call"].get("answered_at") or now()))
        j["call"].update(state="ended", seconds=dur)
        trace("Advisor", "voice_call", f"Call ended after {dur // 60}:{dur % 60:02d}", j, 0)
    await publish(j)
    return public(j)


# ------------------------------------------------------------------ DigiLocker, e-sign, bill
@app.post("/api/journeys/{jid}/kyc/digilocker")
async def digilocker(jid: str):
    """Paperless KYC: GST details straight from the GST registry (simulated GSTN lookup) and the Udyam certificate from
    DigiLocker, where the Ministry of MSME issues it (simulated pull). No photos are needed for these two."""
    j = get(jid)
    if not j["kyc"]["consent"]:
        raise HTTPException(403, "Please give consent first")
    g = j["profile"].get("gstin")
    reg = kyc.lookup_gstin(g) if g else None
    if not reg:
        raise HTTPException(400, "Add your GSTIN first, then we can verify it with the GST registry")
    with ops.timed() as t:
        j["kyc"]["docs"]["gst"] = {"type": "gst", "quality": "ok", "source": "GST registry", "at": now(), "angle": 0,
                                   "fields": {"gstin": reg["gstin"], "legal_name": reg["legal_name"], "trade_name": reg["trade_name"],
                                              "constitution": reg["constitution"], "address": reg["principal_place_of_business"]},
                                   "masked": {"gstin": kyc.mask(reg["gstin"], 4, 3), "legal_name": reg["legal_name"]}}
        names = {kyc.norm_name(reg["legal_name"]), kyc.norm_name(reg["trade_name"])}
        u = next((r for r in kyc.UDYAM_REGISTRY.values() if kyc.norm_name(r["enterprise_name"]) in names), None)
        if u:
            j["kyc"]["docs"]["udyam"] = {"type": "udyam", "quality": "ok", "source": "DigiLocker", "at": now(), "angle": 0,
                                         "fields": {"udyam_number": u["udyam_number"], "enterprise_name": u["enterprise_name"]},
                                         "masked": {"udyam_number": kyc.mask(u["udyam_number"], 9, 3), "enterprise_name": u["enterprise_name"]}}
    security.audit("owner", "digilocker_pull", j["id"], "GST from the registry" + (", Udyam certificate from DigiLocker" if u else ""))
    trace("KYC", "digilocker_pull", "GST details from the GST registry" + (", Udyam certificate from DigiLocker" if u else ""), j, t.ms + 600)
    run_checks(j)
    bot(j, {"kind": "doc_result", "text": "✅ " + advisor.L({"en": "GST verified with the GST registry" + (", Udyam certificate fetched from DigiLocker" if u else "") + ". No photos needed for these.",
                                                         "hi": "GST रजिस्ट्री से GST सत्यापित" + (", Udyam प्रमाणपत्र DigiLocker से" if u else "") + "। इनकी फ़ोटो की ज़रूरत नहीं।",
                                                         "mr": "GST रजिस्ट्रीमधून GST पडताळलं" + (", Udyam प्रमाणपत्र DigiLocker मधून" if u else "") + ". यांचे फोटो लागणार नाहीत.",
                                                         "ta": "GST பதிவேட்டில் GST சரிபார்க்கப்பட்டது" + (", Udyam சான்றிதழ் DigiLocker-இலிருந்து" if u else "") + ". இவற்றுக்கு புகைப்படம் தேவையில்லை."}, j["lang"]),
            "payload": {"doc": "gst", "label": "GST registry and DigiLocker", "quality": "ok", "fields": j["kyc"]["docs"]["gst"]["masked"], "checks": []}})
    await finish_kyc_if_complete(j)
    return public(j)


class EsignIn(BaseModel):
    name: str
    channel: str = "web"


@app.post("/api/journeys/{jid}/esign/request")
async def esign_request(jid: str, b: EsignIn):
    j = get(jid)
    if not j["kyc"]["consent"]:
        raise HTTPException(403, "Please give consent first")
    name = re.sub(r"[^\w .'-]", "", b.name)[:60].strip() or "Authorised signatory"
    tok = secrets.token_urlsafe(16)
    ESIGN[tok] = j["id"]
    j["kyc"]["esign"] = {"name": name, "token": tok, "status": "sent", "sent_at": now(), "link": f"/sign/{tok}"}
    ops.send(j, "signatory", name=name)
    trace("KYC", "request_esign", f"Signing link sent to {name}", j, 15)
    await publish(j)
    return {**public(j), "sign_link": f"/sign/{tok}"}


@app.get("/api/esign/{tok}")
def esign_view(tok: str):
    j = get(ESIGN.get(tok, "-"))
    q = j.get("quote") or {}
    p = j["profile"]
    return {"business": p.get("legal_name") or p.get("business_name") or p.get("business_type"), "signer": j["kyc"]["esign"]["name"],
            "status": j["kyc"]["esign"]["status"], "monthly": q.get("monthly_with_gst"), "term": q.get("term"),
            "items": [l["name"] for l in q.get("lines", []) if l["on"]], "lang": j["lang"]}


class OtpIn(BaseModel):
    otp: str


@app.post("/api/esign/{tok}/complete")
async def esign_complete(tok: str, b: OtpIn):
    j = get(ESIGN.get(tok, "-"))
    if not re.fullmatch(r"\d{6}", b.otp):
        raise HTTPException(400, "Enter the 6-digit OTP")
    es = j["kyc"]["esign"]
    es.update(status="signed", signed_at=now())
    security.audit("signatory", "esign", j["id"], f"{es['name']} signed with OTP (simulated Aadhaar eSign)")
    trace("KYC", "esign", f"{es['name']} signed digitally", j, 800)
    ops.send(j, "signed", name=es["name"])
    run_checks(j)
    await finish_kyc_if_complete(j)
    return {"ok": True}


async def _bill(j: dict, data: bytes):
    if not security.sniff_image(data):
        raise HTTPException(415, "Send a photo of the bill (JPG, PNG or WebP)")
    with ops.timed() as t:
        b = await run_in_threadpool(kyc.read_bill, data)
    trace("Advisor", "read_bill", f"{b['provider'] or 'Bill'}: ₹{b['amount']:,} a month" if b["ok"] else "Couldn't find the total", j, t.ms,
          "ok" if b["ok"] else "warn")
    if b["ok"]:
        p = j["profile"]
        p.update(current_spend=b["amount"], current_provider=b["provider"])
        if b["setup"]:
            p["current_setup"] = b["setup"]
        p.setdefault("said", {})["spend"] = f"Bill from {b['provider'] or 'current provider'}: ₹{b['amount']:,}"
        if j.get("quote"):
            new = j["quote"]["monthly_with_gst"]
            key = "saving" if new <= b["amount"] else "upgrade"
            bot(j, {"text": advisor.tr(key, j["lang"], spend=b["amount"], new=new, diff=abs(b["amount"] - new),
                                       extras="one bill and one support number")})
    await publish(j)
    return {"bill": b, **public(j)}


@app.post("/api/journeys/{jid}/bill")
async def bill_upload(jid: str, file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 8 MB)")
    return await _bill(get(jid), data)


@app.post("/api/journeys/{jid}/bill/sample")
async def bill_sample(jid: str):
    return await _bill(get(jid), (ROOT / "data" / "sample_bill.png").read_bytes())


@app.get("/api/sample-bill.png")
def sample_bill_img():
    return FileResponse(ROOT / "data" / "sample_bill.png")


# ------------------------------------------------------------------ partner console: sign-in, agents, audit
class LoginIn(BaseModel):
    code: str
    name: str = "Rohit Verma"


@app.post("/api/partner/login")
def partner_login(b: LoginIn, request: Request):
    ip = request.client.host if request.client else "?"
    if not security.allow(f"{ip}:login", 10):
        raise HTTPException(429, "Too many attempts. Wait a minute.")
    if not secrets.compare_digest(b.code.strip(), security.PARTNER_CODE):
        security.audit("partner", "login_failed", None, b.name[:40])
        raise HTTPException(401, "That code isn't right")
    security.audit("partner", "login", None, b.name[:40])
    return {"token": security.issue_token(b.name[:40]), "name": b.name[:40], "shop": "Shree Telecom, Accel Partner"}


@app.get("/api/partner/agents")
def partner_agents(_=Depends(partner_auth)):
    live = [j for j in JOURNEYS.values() if j["updated_at"] > now() - 1800]
    by_stage = {s: sum(1 for j in live if j["stage"] == s) for s in ("discover", "bundle", "verify", "pay", "track")}
    ok, broken = security.verify_chain()
    return {
        "feed": list(ops.FEED)[:80], "outbox": list(ops.OUTBOX)[:50],
        "escalations": [h for h in HANDOFFS if h["status"] in ("new", "accepted")][:10],
        "agents": [{"name": "Advisor", "running": by_stage["discover"] + by_stage["bundle"], "note": "Talking to owners"},
                   {"name": "KYC", "running": by_stage["verify"], "note": "Checking documents"},
                   {"name": "Fulfilment", "running": by_stage["pay"] + by_stage["track"], "note": "Payments and installs"},
                   {"name": "Win-back", "running": 0, "note": "Runs on request, respects quiet hours"}],
        "conversations": len(live), "sent_today": len(ops.OUTBOX),
        "audit": {"entries": len(security.AUDIT), "intact": ok, "broken_at": broken, "last": security.AUDIT[-6:][::-1]},
        "ai": ai.status()["online"], "voice": voice.available(), "quiet_hours": ops.quiet_now(),
    }


@app.post("/api/partner/winback/run")
async def winback_run(who=Depends(partner_auth)):
    """Win-back agent: score dropped leads, message the most likely ones (marketing, so quiet hours apply)."""
    m = propensity.model()
    picked = m.winback(5)
    for w in picked:
        name = w.get("business_name") or w.get("business") or w.get("lead_id")
        trace("Win-back", "score_lead", f"{name}: propensity {float(w.get('score', 0)):.2f}", None, 30)
        ops.send(None, "winback", to=name, lang={"Hindi": "hi", "Marathi": "mr", "Tamil": "ta"}.get(w.get("language"), "en"))
    security.audit("partner", "winback_run", None, f"{who['who']} queued {len(picked)} nudges")
    await publish_partner()
    return {"queued": len(picked), "quiet_hours": ops.quiet_now()}


@app.post("/api/partner/handoffs/{hid}/takeover")
async def takeover(hid: str, who=Depends(partner_auth)):
    h = next((x for x in HANDOFFS if x["id"] == hid), None)
    j = JOURNEYS.get(h["journey"]) if h else None
    if not j:
        raise HTTPException(404)
    h["status"] = "accepted"
    h["partner"] = who["who"]
    j["agent_paused"] = who["who"]
    bot(j, {"kind": "partner", "text": advisor.L({"en": f"👋 {who['who']} from Shree Telecom joined the chat. I've shared everything, so you don't need to repeat anything.",
                                                  "hi": f"👋 Shree Telecom से {who['who']} चैट में जुड़े। सारी जानकारी उनके पास है।",
                                                  "mr": f"👋 Shree Telecom मधून {who['who']} चॅटमध्ये आले. सगळी माहिती त्यांच्याकडे आहे.",
                                                  "ta": f"👋 Shree Telecom-இலிருந்து {who['who']} உரையாடலில் இணைந்தார். விவரங்கள் அனைத்தும் அவரிடம் உள்ளன."}, j["lang"]),
            "payload": {"name": who["who"], "shop": "Shree Telecom"}}, channel="wa")
    security.audit("partner", "takeover", j["id"], who["who"])
    trace("Advisor", "hand_over_chat", f"{who['who']} took over; advisor paused", j, 0)
    await publish(j)
    await publish_partner()
    return {"journey": public(j), "handoff": h}


class PartnerMsgIn(BaseModel):
    text: str


@app.post("/api/partner/journeys/{jid}/message")
async def partner_message(jid: str, b: PartnerMsgIn, who=Depends(partner_auth)):
    j = get(jid)
    if not b.text.strip():
        raise HTTPException(400, "Empty message")
    bot(j, {"kind": "partner", "text": b.text.strip()[:800], "payload": {"name": who["who"], "shop": "Shree Telecom"}}, channel="wa")
    await publish(j)
    return public(j)


@app.get("/api/partner/journeys/{jid}")
def partner_journey(jid: str, _=Depends(partner_auth)):
    j = public(get(jid))
    security.audit("partner", "view_journey", j["id"], "context for a hand-off")
    return {k: j[k] for k in ("id", "lang", "stage", "profile", "messages", "quote", "handoff", "agent_paused")}


@app.get("/api/partner/metrics")
def partner_metrics():
    """The success metrics we commit to, with last quarter's baseline from smb_leads.csv. Aggregates only."""
    c = partner_cohort()
    return {"metrics": [
        {"key": "conversion", "name": "Lead to activation", "baseline": c["rate"], "target": 0.14, "unit": "pct",
         "why": "The whole funnel in one number"},
        {"key": "days", "name": "Days from lead to live", "baseline": c["days"], "target": 7, "unit": "days",
         "why": "Quote in minutes, KYC in one sitting, install booked at payment"},
        {"key": "cac", "name": "Cost to acquire a live business", "baseline": c["cac"], "target": 8000, "unit": "inr",
         "why": "Visits only where a person adds value"},
        {"key": "calls", "name": "Status chases per customer", "baseline": c["calls"], "target": 0.5, "unit": "count",
         "why": "Every step arrives on WhatsApp before they ask"},
        {"key": "churn", "name": "6-month churn", "baseline": c["churn"], "target": 0.10, "unit": "pct",
         "why": "Right-sized bundles and one support number"},
    ]}


# ------------------------------------------------------------------ frontend
DIST = ROOT.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and f.is_relative_to(DIST.resolve()):  # no ../ escapes
            return FileResponse(f)
        return FileResponse(DIST / "index.html")


@app.exception_handler(HTTPException)
async def http_exc(_, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
