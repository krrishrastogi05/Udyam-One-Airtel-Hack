"""Agent activity trace and the notifier engine.

Agents (Advisor, KYC, Fulfilment, Win-back, Notifier) record every tool call here, so the stage timeline and the
partner console show exactly what ran, how long it took and what it returned.

The notifier renders a template in the owner's language and delivers it on a channel: WhatsApp (simulated in our
WhatsApp-style UI), SMS (simulated) or a voice call (rings the phone UI). Marketing messages respect quiet hours
(21:00 to 10:00, the stricter of TRAI's 9 AM and 10 AM windows); transactional ones (payments, orders, callbacks) always go out, as TRAI rules allow."""
from __future__ import annotations

import time
import uuid
from collections import deque
from datetime import datetime

FEED: deque = deque(maxlen=400)
OUTBOX: deque = deque(maxlen=300)


def who(j: dict | None) -> str:
    if not j:
        return ""
    p = j.get("profile") or {}
    name = p.get("business_name") or p.get("business_type") or "New business"
    return f"{name}{', ' + p['city'] if p.get('city') and not p.get('business_name') else ''}"


def trace(agent: str, act: str, res: str, j: dict | None = None, ms: int | None = None, level: str = "ok") -> dict:
    e = {"id": uuid.uuid4().hex[:8], "ts": time.time(), "t": datetime.now().strftime("%H:%M:%S"), "agent": agent, "act": act,
         "res": res, "who": who(j), "jid": j["id"] if j else None, "ms": ms, "level": level}
    FEED.appendleft(e)
    if j is not None:
        j.setdefault("trace", []).append(e)
        del j["trace"][:-40]
    return e


class timed:
    """with timed() as t: ...; t.ms"""
    def __enter__(self):
        self.t0 = time.time()
        return self

    def __exit__(self, *a):
        self.ms = int((time.time() - self.t0) * 1000)


# ---------------------------------------------------------------- notifier
# (title, body) per language. Hinglish falls back to English, Roman script being what those owners read.
T = {
    "plan_ready": {"en": ("Your plan is ready", "₹{monthly}/month with GST. Tap to review it."),
                   "hi": ("आपका प्लान तैयार है", "₹{monthly}/महीना, GST सहित। देखने के लिए टैप करें।"),
                   "mr": ("तुमचा प्लॅन तयार आहे", "₹{monthly}/महिना, GST सह. पाहण्यासाठी टॅप करा."),
                   "ta": ("உங்கள் திட்டம் தயார்", "₹{monthly}/மாதம், GST உட்பட. பார்க்க டேப் செய்யுங்கள்.")},
    "kyc_pending": {"en": ("A few photos left", "Send your {docs} to finish verification."),
                    "hi": ("कुछ फ़ोटो बाकी हैं", "वेरिफ़िकेशन पूरा करने के लिए {docs} भेजें।"),
                    "mr": ("काही फोटो बाकी", "पडताळणी पूर्ण करण्यासाठी {docs} पाठवा."),
                    "ta": ("சில புகைப்படங்கள் மீதம்", "சரிபார்ப்பை முடிக்க {docs} அனுப்புங்கள்.")},
    "signatory": {"en": ("Approval sent to {name}", "{name} got a WhatsApp link to approve with an OTP."),
                  "hi": ("{name} को अनुमति का लिंक भेजा", "{name} को OTP से अनुमति देने का WhatsApp लिंक मिला है।"),
                  "mr": ("{name} यांना मंजुरी लिंक पाठवली", "{name} यांना OTP ने मंजुरी देण्यासाठी WhatsApp लिंक मिळाली."),
                  "ta": ("{name}-க்கு ஒப்புதல் இணைப்பு", "OTP மூலம் ஒப்புதல் தர {name}-க்கு WhatsApp இணைப்பு அனுப்பப்பட்டது.")},
    "signed": {"en": ("{name} approved", "The authorised signatory signed digitally. KYC is complete."),
               "hi": ("{name} ने मंज़ूरी दी", "अधिकृत हस्ताक्षरकर्ता ने डिजिटल हस्ताक्षर किए। KYC पूरा।"),
               "mr": ("{name} यांनी मंजुरी दिली", "अधिकृत स्वाक्षरीकर्त्यांनी डिजिटल स्वाक्षरी केली. KYC पूर्ण."),
               "ta": ("{name} ஒப்புதல் தந்தார்", "அங்கீகரிக்கப்பட்டவர் டிஜிட்டல் கையொப்பமிட்டார். KYC முடிந்தது.")},
    "payment_failed": {"en": ("Payment didn’t go through", "Your UPI app timed out. Tap to retry ₹{amount}. Nothing was charged."),
                       "hi": ("पेमेंट नहीं हुआ", "UPI ऐप का समय खत्म हो गया। ₹{amount} दोबारा भरने के लिए टैप करें। पैसे नहीं कटे।"),
                       "mr": ("पेमेंट झालं नाही", "UPI अ‍ॅपची वेळ संपली. ₹{amount} पुन्हा भरण्यासाठी टॅप करा. पैसे कापले नाहीत."),
                       "ta": ("பணம் செலுத்த முடியவில்லை", "UPI செயலி நேரம் முடிந்தது. ₹{amount} மீண்டும் செலுத்த டேப் செய்யுங்கள். பணம் எடுக்கப்படவில்லை.")},
    "payment_ok": {"en": ("Payment received", "Order {oid} confirmed. You’ll be live by {eta}."),
                   "hi": ("पेमेंट मिल गया", "ऑर्डर {oid} पक्का। आप {eta} तक लाइव होंगे।"),
                   "mr": ("पेमेंट मिळालं", "ऑर्डर {oid} पक्की. तुम्ही {eta} पर्यंत सुरू व्हाल."),
                   "ta": ("பணம் கிடைத்தது", "ஆர்டர் {oid} உறுதி. {eta}-க்குள் சேவை தொடங்கும்.")},
    "order_update": {"en": ("{title}", "{detail}"), "hi": ("{title}", "{detail}"), "mr": ("{title}", "{detail}"), "ta": ("{title}", "{detail}")},
    "live": {"en": ("You’re live", "Everything is active on one bill. One support number, in your language."),
             "hi": ("आप लाइव हैं", "सब कुछ एक ही बिल पर चालू है। एक सपोर्ट नंबर, आपकी भाषा में।"),
             "mr": ("तुम्ही सुरू झालात", "सगळं एकाच बिलावर सुरू आहे. एक सपोर्ट नंबर, तुमच्या भाषेत."),
             "ta": ("சேவை தொடங்கியது", "அனைத்தும் ஒரே பில்லில் செயல்படுகிறது. ஒரே சப்போர்ட் எண், உங்கள் மொழியில்.")},
    "callback": {"en": ("Udyam One is calling", "Calling back about your plan, as you asked."),
                 "hi": ("Udyam One कॉल कर रहा है", "जैसा आपने कहा था, आपके प्लान के बारे में कॉल।"),
                 "mr": ("Udyam One कॉल करत आहे", "तुम्ही सांगितल्याप्रमाणे तुमच्या प्लॅनबद्दल कॉल."),
                 "ta": ("Udyam One அழைக்கிறது", "நீங்கள் கேட்டபடி உங்கள் திட்டம் பற்றி அழைக்கிறோம்.")},
    "winback": {"en": ("Your plan is saved", "Pick up where you left off. Reply here or ask us to call."),
                "hi": ("आपका प्लान सेव है", "जहाँ छोड़ा था वहीं से शुरू करें। यहाँ जवाब दें या कॉल माँगें।"),
                "mr": ("तुमचा प्लॅन जतन आहे", "जिथे थांबलात तिथून पुढे चला. इथे उत्तर द्या किंवा कॉल मागा."),
                "ta": ("உங்கள் திட்டம் சேமிக்கப்பட்டுள்ளது", "விட்ட இடத்திலிருந்து தொடருங்கள். இங்கே பதில் சொல்லுங்கள் அல்லது அழைக்கச் சொல்லுங்கள்.")},
    "retake": {"en": ("One photo needs a retake", "{doc}: {why}"), "hi": ("एक फ़ोटो दोबारा भेजें", "{doc}: {why}"),
               "mr": ("एक फोटो पुन्हा पाठवा", "{doc}: {why}"), "ta": ("ஒரு புகைப்படத்தை மீண்டும் அனுப்புங்கள்", "{doc}: {why}")},
}
MARKETING = {"winback"}
CHANNEL_NAME = {"wa": "WhatsApp", "sms": "SMS", "call": "Voice call"}


def quiet_now(hour: int | None = None) -> bool:
    h = datetime.now().hour if hour is None else hour
    return h >= 21 or h < 10


def render(key: str, lang: str, **data) -> tuple[str, str]:
    d = T[key]
    title, body = d.get(lang) or d["en"]
    return title.format(**data), body.format(**data)


def send(j: dict | None, key: str, channel: str = "wa", to: str | None = None, lang: str | None = None, **data) -> dict:
    lang = lang or (j or {}).get("lang", "en")
    title, body = render(key, lang, **data)
    queued = key in MARKETING and quiet_now()
    e = {"id": uuid.uuid4().hex[:8], "ts": time.time(), "jid": j["id"] if j else None, "to": to or who(j),
         "channel": CHANNEL_NAME.get(channel, channel), "template": key, "lang": lang, "title": title, "body": body,
         "status": "Quiet hours, 10:00" if queued else ("Ringing" if channel == "call" else "Delivered")}
    OUTBOX.appendleft(e)
    if j is not None and not queued:
        if channel == "call":
            j["call"] = {"state": "ringing", "reason": body, "at": time.time(), "id": e["id"]}
        else:
            j["messages"].append({"id": uuid.uuid4().hex[:8], "role": "bot", "ts": time.time(), "channel": "wa", "kind": "notify",
                                  "text": f"**{title}**\n{body}", "payload": {"title": title, "body": body, "template": key,
                                                                             "via": e["channel"]}})
    trace("Notifier", f"send_{channel}", f"{e['status']}: {title}", j, 0)
    return e


if __name__ == "__main__":
    j = {"id": "T1", "lang": "mr", "profile": {"business_name": "Shah Dental"}, "messages": []}
    e = send(j, "payment_failed", amount="1,770")
    assert e["status"] == "Delivered" and "पेमेंट" in e["title"] and j["messages"][-1]["kind"] == "notify"
    assert quiet_now(22) and quiet_now(9) and not quiet_now(12)
    send(j, "callback", channel="call")
    assert j["call"]["state"] == "ringing" and len(FEED) == 2
    print("ops self-check ok")
