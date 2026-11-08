"""End-to-end smoke test. Start the server first, then: python scripts/smoke_test.py [http://localhost:8000]"""
import sys

import httpx

B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def J():
    return httpx.post(B + "/journeys", json={"channel": "wa"}).json()["id"]


def say(j, t):
    return httpx.post(f"{B}/journeys/{j}/message", json={"text": t, "channel": "wa"}, timeout=60).json()


def post(j, path, body=None):
    return httpx.post(f"{B}/journeys/{j}/{path}", json=body or {}, timeout=90).json()


h = httpx.get(B + "/health").json()
check("health", h.get("ok"), f"ai={h.get('ai')} ocr={h.get('ocr')}")
check("tesseract OCR available", h.get("ocr") == "tesseract", "install Tesseract / set TESSERACT_CMD if this fails")

j = J()
for t in ["Hi, I run a dental clinic in Kochi with 6 staff", "Internet that never goes down, professional email and billing",
          "Yes", "32TTNXB7384T1ZW", "About 3000 a month"]:
    r = say(j, t)
check("English advisor reaches a plan", r["stage"] == "bundle", f"₹{(r.get('quote') or {}).get('monthly_with_gst')}/mo")
r = post(j, "confirm", {"plan": r["cart"]["plan"], "channel": "web"})
r = post(j, "kyc/consent", {"channel": "wa"})
for d in ["gst", "udyam", "id", "address"]:
    r = post(j, "kyc/specimen", {"applicant": "K09", "doc": d, "channel": "wa"})
check("KYC K09 verified", (r["kyc"]["result"] or {}).get("status") == "verified")
r = post(j, "pay", {"method": "upi", "channel": "wa"})
for _ in range(6):
    r = post(j, "order/advance")
check("order goes live", (r.get("order") or {}).get("status") == "live")

j = J()
for t in ["Mera kirana store hai Lucknow mein, main aur 2 log kaam karte hain", "Internet, sim aur billing chahiye",
          "GST nahi hai", "1500"]:
    r = say(j, t)
check("Hinglish advisor reaches a plan", r["stage"] == "bundle", f"lang={r['lang']}")

j = J()
for t in ["मेरा रेस्टोरेंट है, 3 ब्रांच और 25 लोग काम करते हैं, जयपुर में", "कैमरा और बिलिंग चाहिए", "हाँ", "छोड़ें", "लगभग ₹10,000"]:
    r = say(j, t)
check("Hindi advisor reaches a plan", r["stage"] == "bundle")
r = post(j, "confirm", {"plan": r["cart"]["plan"], "channel": "wa"})
r = post(j, "kyc/consent", {"channel": "wa"})
for d in ["gst", "udyam", "id", "address"]:
    r = post(j, "kyc/specimen", {"applicant": "K01", "doc": d, "channel": "wa"})
check("KYC K01 blocked (cancelled GSTIN)", (r["kyc"]["result"] or {}).get("status") == "blocked")
r = say(j, "DELETE")
check("DELETE wipes documents", not r["kyc"]["docs"])

c = httpx.get(B + "/partner/cohort").json()
check("market pulse", c["leads"] == 5000 and c["drop"]["to"] == "Quote accepted")

# --- regional languages (offline engine; with an AI key the model handles any language)
j = httpx.post(B + "/journeys", json={"channel": "wa", "lang": "mr"}).json()["id"]
for t in ["माझं डेंटल क्लिनिक आहे पुण्यात, चार लोक काम करतात", "इंटरनेट आणि बिलिंग", "हो", "skip", "हॉटस्पॉट, 4800"]:
    r = say(j, t)
check("Marathi advisor reaches a plan", r["stage"] == "bundle" and r["lang"] == "mr", f"setup={r['profile'].get('current_setup')}")
j = httpx.post(B + "/journeys", json={"channel": "wa", "lang": "ta"}).json()["id"]
for t in ["என் மளிகை கடை சென்னையில், ஐந்து பேர் வேலை செய்கிறார்கள்", "internet billing", "GST இல்லை", "2000"]:
    r = say(j, t)
check("Tamil advisor reaches a plan", r["stage"] == "bundle" and r["lang"] == "ta")
check("advisor remembers the owner's words", bool(r["profile"].get("said", {}).get("people")))

# --- bill, DigiLocker, e-sign, failed payment, notifications
j = J()
for t in ["Insurance agency in Visakhapatnam, 6 staff", "internet and billing", "yes", "37LDYXK0296F1ZB", "3000"]:
    r = say(j, t)
r = post(j, "bill/sample")
check("bill photo read", r["bill"]["amount"] == 4800 and r["profile"]["current_spend"] == 4800, r["bill"].get("provider"))
r = post(j, "confirm", {"plan": r["cart"]["plan"], "channel": "web"})
r = post(j, "kyc/consent", {"channel": "web"})
r = post(j, "kyc/digilocker")
check("GST registry + DigiLocker fill GST and Udyam", r["kyc"]["docs"].get("gst", {}).get("source") == "GST registry")
check("raw document fields never reach the browser", "fields" not in r["kyc"]["docs"]["gst"])
s = post(j, "esign/request", {"name": "Prakash Shah"})
tok = s["sign_link"].rsplit("/", 1)[1]
httpx.post(f"{B}/esign/{tok}/complete", json={"otp": "123456"})
r = post(j, "kyc/specimen", {"applicant": "K09", "doc": "address", "channel": "web"})
check("e-sign + DigiLocker + one photo completes KYC", r["stage"] == "pay", (r["kyc"]["result"] or {}).get("status"))
r = post(j, "pay", {"simulate_failure": True})
check("failed payment sends a retry notification", r["payment_failed"] and any(m["kind"] == "notify" for m in r["messages"]))
r = post(j, "pay", {})
check("retry succeeds", r["stage"] == "track")
check("agents traced their work", len(r["trace"]) >= 8, ", ".join(sorted({t["agent"] for t in r["trace"]})))

# --- security
check("partner console needs sign-in", httpx.get(B + "/partner/agents").status_code == 401)
tok = httpx.post(B + "/partner/login", json={"code": "accel-partner"}).json()["token"]
a = httpx.get(B + "/partner/agents", headers={"Authorization": f"Bearer {tok}"}).json()
check("audit log hash chain intact", a["audit"]["intact"] and a["audit"]["entries"] > 0, f"{a['audit']['entries']} entries")
h = httpx.get(B.removesuffix("/api") + "/")
check("security headers", "nosniff" in h.headers.get("x-content-type-options", "") and "default-src" in h.headers.get("content-security-policy", ""))
check("no path traversal", httpx.get(B.removesuffix("/api") + "/..%2f..%2fbackend%2fapp.py").text.lstrip().startswith("<!doctype"))
print("\nALL PASSED" if ok else "\nSOME CHECKS FAILED")
sys.exit(0 if ok else 1)
