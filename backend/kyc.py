"""Smart KYC: real OCR on uploaded documents, field extraction, registry lookups and cross-document checks."""
from __future__ import annotations

import csv
import io
import re
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

DATA = Path(__file__).parent / "data"
TODAY = date(2026, 7, 15)  # "today" fixed by the challenge README for date checks
ADDRESS_PROOF_MAX_DAYS = 90
ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

import os

try:
    import pytesseract
    from PIL import Image
    if os.getenv("TESSERACT_CMD"):  # e.g. C:\\Program Files\\Tesseract-OCR\\tesseract.exe on Windows
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]
    elif os.name == "nt" and os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
        pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    pytesseract.get_tesseract_version()
    OCR_ENGINE = "tesseract"
except Exception:  # pragma: no cover - environment without tesseract
    pytesseract = None
    OCR_ENGINE = None


def _load(name, key):
    with open(DATA / name, newline="", encoding="utf-8") as f:
        return {r[key].strip().upper(): r for r in csv.DictReader(f)}


GST_REGISTRY = _load("mock_gstin_registry.csv", "gstin")
UDYAM_REGISTRY = _load("mock_udyam_registry.csv", "udyam_number")

DOC_TYPES = {
    "gst": "GST certificate",
    "udyam": "Udyam certificate",
    "id": "Signatory ID",
    "address": "Address proof",
}


# ---------- identifiers ----------
def gstin_checksum(g: str) -> str:
    total = 0
    for i, ch in enumerate(g[:14]):
        p = ALNUM.index(ch) * (1 if i % 2 == 0 else 2)
        total += p // 36 + p % 36
    return ALNUM[(36 - total % 36) % 36]


def gstin_format(g: str) -> tuple[bool, str]:
    g = (g or "").strip().upper()
    if not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", g):
        return False, "Not a 15-character GSTIN pattern"
    if not 1 <= int(g[:2]) <= 38:
        return False, "Unknown state code"
    if g[5] not in "CPHFATBLJGX":  # X accepted: hackathon data uses it for fictional PANs
        return False, "Invalid PAN entity type"
    if gstin_checksum(g) != g[14]:
        return False, "Checksum digit does not match"
    return True, "Valid structure and checksum"


def mask(s: str | None, keep_start=4, keep_end=3) -> str:
    if not s:
        return ""
    s = str(s)
    if len(s) <= keep_start + keep_end:
        return s
    return s[:keep_start] + "•" * (len(s) - keep_start - keep_end) + s[-keep_end:]


def lookup_gstin(g: str) -> dict | None:
    r = GST_REGISTRY.get((g or "").strip().upper())
    return dict(r) if r else None


def lookup_udyam(u: str) -> dict | None:
    r = UDYAM_REGISTRY.get((u or "").strip().upper())
    return dict(r) if r else None


# ---------- OCR + parsing ----------
def skew_angle(img) -> float:
    """Projection-profile deskew: the angle whose horizontal ink profile is sharpest."""
    import numpy as np
    small = img.copy()
    small.thumbnail((600, 600))
    best, best_score = 0.0, -1.0
    for a in [x / 2 for x in range(-24, 25)]:
        r = small.rotate(a, expand=True, fillcolor=255)
        arr = np.asarray(r) < 140
        score = float(np.var(arr.sum(axis=1)))
        if score > best_score:
            best, best_score = a, score
    return best


def blur_score(img) -> float:
    """Variance of the Laplacian. Sharp scans score >1000; the blurry specimen scores ~8."""
    import numpy as np
    small = img.copy()
    small.thumbnail((900, 900))
    a = np.asarray(small, dtype=float)
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    return float(lap.var())


BLUR_THRESHOLD = 150.0

# Characters OCR confuses, used to repair a GSTIN with the help of its checksum digit.
TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "J": "1", "S": "5", "B": "8", "Z": "2", "G": "6", "T": "7"}
TO_ALPHA = {v: k for k, v in [("O", "0"), ("I", "1"), ("S", "5"), ("B", "8"), ("Z", "2"), ("G", "6")]}
LOOKALIKE = {"I": "JL1T", "J": "I1L", "L": "I1", "O": "0QD", "Q": "O0", "D": "O0", "0": "OQD", "1": "IJL",
             "5": "S", "S": "5", "8": "B", "B": "8", "2": "Z", "Z": "2", "6": "G", "G": "6", "U": "V", "V": "U"}


def _coerce(g: str) -> str:
    pattern = "DDAAAAADDDDAXZX"  # D digit, A letter, X either, Z literal
    chars = list(g)
    for i, kind in enumerate(pattern):
        c = chars[i]
        if kind == "D" and not c.isdigit():
            chars[i] = TO_DIGIT.get(c, c)
        elif kind == "A" and not c.isalpha():
            chars[i] = TO_ALPHA.get(c, c)
        elif kind == "Z":
            chars[i] = "Z"
    return "".join(chars)


def repair_gstin(readings: list[str]) -> tuple[str, list[str]]:
    """Fix OCR noise without hiding real problems.
    1) Coerce characters to the class their position requires (an 'O' in a digit slot is a 0).
    2) If a reading has one stray character, drop it when that makes the checksum valid.
    3) Swap a visual lookalike only when the result is a GSTIN the registry confirms.
    Anything else is reported as-is, so an altered or mistyped GSTIN still fails."""
    clean = [re.sub(r"[^0-9A-Z]", "", (r or "").upper()) for r in readings if r]
    clean = [c for c in clean if len(c) >= 15]
    if not clean:
        return "", []
    for raw in clean:
        variants = [raw[:15]] if len(raw) == 15 else []
        if len(raw) == 16:
            variants += [raw[:i] + raw[i + 1:] for i in range(16)]
        for v in variants:
            fixed = _coerce(v)
            if gstin_format(fixed)[0]:
                notes = [f"{x}→{y}" for x, y in zip(v, fixed) if x != y]
                if len(raw) == 16:
                    notes.append("dropped a stray character")
                return fixed, notes
    base = _coerce(clean[0][:15])
    for i, c in enumerate(base):
        for alt in LOOKALIKE.get(c, ""):
            cand = base[:i] + alt + base[i + 1:]
            if cand in GST_REGISTRY and gstin_format(cand)[0]:
                return cand, [f"{x}→{y}" for x, y in zip(clean[0], cand) if x != y] + ["confirmed by registry"]
    return base, []


def ocr_image(data: bytes) -> tuple[str, float]:
    """Returns (text, degrees the photo was straightened by)."""
    if not pytesseract:
        raise RuntimeError("Tesseract OCR is not installed on this machine")
    img = Image.open(io.BytesIO(data)).convert("L")
    if img.width < 1000:
        img = img.resize((img.width * 2, img.height * 2))
    if blur_score(img) < BLUR_THRESHOLD:
        return "", 0.0
    angle = skew_angle(img)
    if abs(angle) >= 0.5:
        img = img.rotate(angle, expand=True, fillcolor=255, resample=Image.BICUBIC)
    return pytesseract.image_to_string(img, config="--psm 4"), angle


def detect_type(text: str) -> str | None:
    t = text.lower()
    if "gst registration" in t or "gstin" in t and "legal name" in t:
        return "gst"
    if "udyam" in t and "enterprise" in t:
        return "udyam"
    if "signatory" in t or "valid till" in t:
        return "id"
    if "bill" in t and ("supply address" in t or "consumer" in t):
        return "address"
    return None


def _join(lines: list[str]) -> str:
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if out and out[-1].isalpha() and ln[0].islower():
            out += ln
        else:
            out += (" " if out else "") + ln
    out = re.sub(r"(?<=\d)\s+(?=\d)", "", out)
    return re.sub(r"\s*-{1,2}\s*(\d{6})", r" - \1", out)


def _after(lines, label, i_from=0):
    lab = label.lower()
    for i in range(i_from, len(lines)):
        if lines[i].lower().startswith(lab):
            rest = lines[i][len(label):].strip(" :.")
            return rest, i
    return None, -1


def _date(s):
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s or "")
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def parse(text: str, doc_type: str | None = None) -> dict:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    lines = [l for l in lines if "specimen - not a valid" not in l.lower() and "hackathon - track" not in l.lower()]
    kind = doc_type or detect_type(text)
    f: dict = {}
    if kind == "gst":
        g, _ = _after(lines, "GSTIN")
        fixed, corr = repair_gstin([g or ""])
        f["gstin"] = fixed or None
        if corr:
            f["_ocr_corrections"] = corr
        f["legal_name"] = _after(lines, "Legal name")[0]
        f["trade_name"] = _after(lines, "Trade name")[0]
        f["constitution"] = _after(lines, "Constitution")[0]
        a, i = _after(lines, "Address of principal")
        parts = [a or ""]
        if i >= 0 and i + 1 < len(lines):
            nxt = lines[i + 1]
            if nxt.lower().startswith("place of business"):
                parts.append(nxt[len("place of business"):])
        f["address"] = _join(parts) or None
        f["date_of_liability"] = _after(lines, "Date of liability")[0]
    elif kind == "udyam":
        u, _ = _after(lines, "Udyam reg. number")
        m = re.search(r"UDYAM-[A-Z]{2}-\d{2}-\d{7}", re.sub(r"\s+", "", u or "").upper())
        f["udyam_number"] = m.group(0) if m else None
        f["enterprise_name"] = _after(lines, "Enterprise name")[0]
        f["major_activity"] = _after(lines, "Major activity")[0]
        f["city"] = _after(lines, "City")[0]
        f["state"] = _after(lines, "State")[0]
        f["date_of_registration"] = _after(lines, "Date of registration")[0]
    elif kind == "id":
        def nxt(label):
            for i, l in enumerate(lines):
                if l.lower() == label.lower() and i + 1 < len(lines):
                    return lines[i + 1]
                if l.lower().startswith(label.lower() + " "):
                    return l[len(label):].strip()
            return None
        f["name"] = nxt("Name")
        f["designation"] = nxt("Designation")
        f["business"] = nxt("For business")
        f["id_number"] = nxt("ID no.")
        f["valid_till"] = nxt("Valid till")
    elif kind == "address":
        f["consumer_no"] = _after(lines, "Consumer no.")[0]
        f["billed_to"] = _after(lines, "Billed to")[0]
        a, i = _after(lines, "Supply address")
        parts = [a or ""]
        if i >= 0 and i + 1 < len(lines) and not re.match(r"(bill date|units|amount)", lines[i + 1], re.I):
            parts.append(lines[i + 1])
        f["address"] = _join(parts) or None
        f["bill_date"] = _after(lines, "Bill date")[0]
        f["amount"] = _after(lines, "Amount due (INR)")[0]
        f["bill_type"] = next((l.replace("Specimen:", "").strip() for l in lines if l.lower().startswith("specimen")), None)
    for k, v in list(f.items()):
        if isinstance(v, str) and not k.startswith("_"):
            v = v.strip()
            f[k] = v or None
    return {"type": kind, "fields": f}


# ---------- comparisons ----------
_STOP = r"\b(llp|pvt|private|ltd|limited|prop|proprietor|the|and|m/s|co)\b"


def norm_name(s: str | None) -> str:
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(_STOP, " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def business_names(gst_fields: dict) -> list[str]:
    names = [gst_fields.get("trade_name"), gst_fields.get("legal_name")]
    m = re.search(r"\(prop\.?\s*(.+?)\)", gst_fields.get("legal_name") or "", re.I)
    if m:
        names.append(m.group(1))
    return [n for n in names if n]


def name_match(a: str | None, candidates: list[str]) -> float:
    na = norm_name(a)
    if not na:
        return 0.0
    return max((SequenceMatcher(None, na, norm_name(c)).ratio() for c in candidates if c), default=0.0)


def proprietor(gst_fields: dict) -> str | None:
    ln = gst_fields.get("legal_name") or ""
    m = re.match(r"\s*(.+?)\s*\(prop", ln, re.I)
    return m.group(1) if m else None


def norm_addr(s: str | None) -> str:
    s = (s or "").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# ---------- the decision ----------
def evaluate(docs: dict, typed_gstin: str | None = None) -> dict:
    """docs: {"gst": {"fields":...}, "udyam": ..., "id": ..., "address": ...} (any subset).
    Returns checks with pass/warn/fail, a status and plain-language reasons."""
    checks: list[dict] = []

    def add(key, title, status, detail, doc=None):
        checks.append({"key": key, "title": title, "status": status, "detail": detail, "doc": doc})

    docs = dict(docs)
    retake = set()
    for k in list(docs):
        d = docs.get(k) or {}
        if d.get("quality") == "blurry":
            add(f"{k}_quality", f"{DOC_TYPES[k]} photo quality", "fail", d.get("message") or "Too blurry to read.", k)
            retake.add(k)
            docs[k] = None
        elif d.get("message"):
            add(f"{k}_kind", f"{DOC_TYPES[k]} uploaded", "fail", d["message"], k)
    gst = (docs.get("gst") or {}).get("fields") or {}
    udy = (docs.get("udyam") or {}).get("fields") or {}
    sid = (docs.get("id") or {}).get("fields") or {}
    adr = (docs.get("address") or {}).get("fields") or {}

    gstin = gst.get("gstin") or typed_gstin
    reg = None
    if "gst" in retake and not typed_gstin:
        pass
    elif not docs.get("gst") and not typed_gstin:
        add("gst_doc", "GST certificate", "fail", "Upload the GST registration certificate.", "gst")
    else:
        ok, why = gstin_format(gstin or "")
        corr = gst.get("_ocr_corrections")
        if ok and corr:
            why += f" (auto-corrected OCR lookalikes {', '.join(corr[:3])})"
        if not ok and gstin and gst.get("legal_name"):
            same = [g for g, r in GST_REGISTRY.items() if norm_name(r["legal_name"]) == norm_name(gst.get("legal_name"))]
            if same:
                why += f". The registry has {mask(same[0], 4, 3)} for {gst.get('legal_name')}. The certificate may be altered or mistyped"
        add("gstin_format", "GSTIN format & checksum", "pass" if ok else "fail",
            f"{mask(gstin, 4, 3)} — {why}" if gstin else "No GSTIN could be read from the certificate.", "gst")
        if ok:
            reg = lookup_gstin(gstin)
            if not reg:
                add("gstin_registry", "GST registry lookup", "fail", "This GSTIN is not in the GST registry.", "gst")
            elif reg["status"] != "Active":
                add("gstin_registry", "GST registry lookup", "fail",
                    f"Registry says this GSTIN is {reg['status'].upper()}. Products that need GST can't be activated.", "gst")
            else:
                add("gstin_registry", "GST registry lookup", "pass",
                    f"Active since {reg['registration_date']} · {reg['constitution']}", "gst")
            if reg and gst.get("legal_name"):
                s = 1.0 if norm_name(gst.get("legal_name")) == norm_name(reg["legal_name"]) else 0.0
                add("gst_name_registry", "Certificate matches registry", "pass" if s > 0.85 else "fail",
                    "Legal name on certificate matches the registry." if s > 0.85 else
                    f"Certificate says “{gst.get('legal_name')}”, registry says “{reg['legal_name']}”.", "gst")

    names = business_names(gst) + ([reg["legal_name"], reg["trade_name"]] if reg else [])

    # Udyam
    if "udyam" in retake:
        pass
    elif not docs.get("udyam"):
        add("udyam_doc", "Udyam certificate", "warn",
            "No Udyam certificate yet. Optional for most products, but it speeds up MSME benefits.", "udyam")
    else:
        un = udy.get("udyam_number")
        if not un:
            add("udyam_number", "Udyam number", "fail",
                "The Udyam registration number is blank or unreadable on the certificate.", "udyam")
        else:
            ur = lookup_udyam(un)
            if not ur:
                add("udyam_number", "Udyam registry lookup", "fail", f"{mask(un, 9, 3)} is not in the Udyam registry.", "udyam")
            else:
                s = name_match(ur["enterprise_name"], names or [udy.get("enterprise_name")])
                add("udyam_number", "Udyam registry lookup", "pass" if s > 0.8 else "fail",
                    f"Registered {ur['date_of_registration']} · {ur['enterprise_type']} · {ur['nic_description']}"
                    if s > 0.8 else f"Udyam registry lists “{ur['enterprise_name']}”, which is a different business.", "udyam")
        if names and udy.get("enterprise_name"):
            s = name_match(udy.get("enterprise_name"), names)
            add("udyam_name", "Udyam name matches GST", "pass" if s > 0.8 else "fail",
                "Same business on both certificates." if s > 0.8 else
                f"Udyam says “{udy.get('enterprise_name')}”, GST says “{names[0]}”.", "udyam")

    # Signatory ID
    if "id" in retake:
        pass
    elif not docs.get("id"):
        add("id_doc", "Signatory ID", "fail", "Upload the ID of the person signing for the business.", "id")
    else:
        vt = _date(sid.get("valid_till"))
        if not vt:
            add("id_valid", "ID validity", "warn", "Couldn't read the validity date.", "id")
        elif vt < TODAY:
            add("id_valid", "ID validity", "fail", f"This ID expired on {vt.isoformat()}.", "id")
        else:
            add("id_valid", "ID validity", "pass", f"Valid till {vt.isoformat()}", "id")
        if names and sid.get("business"):
            s = name_match(sid.get("business"), names)
            add("id_business", "ID issued for this business", "pass" if s > 0.8 else "fail",
                "Signatory belongs to the same business." if s > 0.8 else
                f"ID is for “{sid.get('business')}”, not “{names[0]}”.", "id")
        prop = proprietor(gst)
        if prop and sid.get("name") and (gst.get("constitution") or "").lower().startswith("proprietor"):
            s = name_match(sid.get("name"), [prop])
            if s < 0.85:
                add("id_person", "Signatory is the proprietor", "warn",
                    f"For a proprietorship we expect {prop} to sign; ID belongs to {sid.get('name')}"
                    f" ({sid.get('designation') or 'staff'}). An authorisation letter will be needed.", "id")
            else:
                add("id_person", "Signatory is the proprietor", "pass", f"{sid.get('name')} is the registered proprietor.", "id")

    # Address proof
    if "address" in retake:
        pass
    elif not docs.get("address"):
        add("address_doc", "Address proof", "fail", "Upload a recent electricity/phone bill for the installation address.", "address")
    else:
        bd = _date(adr.get("bill_date"))
        if not bd:
            add("address_date", "Bill is recent", "warn", "Couldn't read the bill date.", "address")
        else:
            age = (TODAY - bd).days
            add("address_date", "Bill is recent", "pass" if age <= ADDRESS_PROOF_MAX_DAYS else "fail",
                f"Dated {bd.isoformat()} ({age} days old)." if age <= ADDRESS_PROOF_MAX_DAYS else
                f"Dated {bd.isoformat()} — {age} days old. We need one from the last {ADDRESS_PROOF_MAX_DAYS} days.", "address")
        if names and adr.get("billed_to"):
            s = name_match(adr.get("billed_to"), names)
            add("address_name", "Bill is in the business name", "pass" if s > 0.8 else "warn",
                "Billed to the business." if s > 0.8 else f"Billed to “{adr.get('billed_to')}”. A rent agreement or NOC may be needed.", "address")
        ref = (reg or {}).get("principal_place_of_business") or gst.get("address")
        if ref and adr.get("address"):
            s = SequenceMatcher(None, norm_addr(ref), norm_addr(adr.get("address"))).ratio()
            pin_a = re.findall(r"\d{6}", ref or "")
            pin_b = re.findall(r"\d{6}", adr.get("address") or "")
            same_pin = bool(pin_a and pin_b and pin_a[-1] == pin_b[-1])
            good = s > 0.85 and same_pin
            add("address_match", "Address matches GST", "pass" if good else "fail",
                "Installation address matches the GST place of business." if good else
                f"Bill address “{adr.get('address')}” differs from GST address “{ref}”.", "address")

    fails = [c for c in checks if c["status"] == "fail"]
    warns = [c for c in checks if c["status"] == "warn"]
    status = "verified" if not fails else "action_needed"
    if any(c["key"] == "gstin_registry" and c["status"] == "fail" for c in checks):
        status = "blocked"
    return {
        "status": status, "checks": checks,
        "summary": {"pass": len([c for c in checks if c["status"] == "pass"]), "warn": len(warns), "fail": len(fails)},
        "gst_active": bool(reg and reg["status"] == "Active"),
        "registry": {"legal_name": reg["legal_name"], "trade_name": reg["trade_name"], "status": reg["status"],
                     "address": reg["principal_place_of_business"], "gstin_masked": mask(gstin)} if reg else None,
    }


def specimen_path(applicant: str, doc: str) -> Path:
    fname = {"gst": "gst_certificate", "udyam": "udyam_certificate", "id": "signatory_id",
             "address": "address_proof"}[doc]
    return DATA / "kyc_documents" / f"{applicant}_{fname}.png"


def specimen_applicants() -> list[dict]:
    out = []
    for i in range(1, 13):
        a = f"K{i:02d}"
        docs = [d for d in DOC_TYPES if specimen_path(a, d).exists()]
        out.append({"id": a, "docs": docs})
    return out


def analyze(data: bytes, expected: str | None = None, cached: dict | None = None) -> dict:
    """Quality gate -> deskew -> OCR -> parse. `cached` lets the demo skip re-OCR of known specimens."""
    img = Image.open(io.BytesIO(data)).convert("L") if pytesseract else None
    if cached is not None:
        text, angle = cached["text"], cached["angle"]
        blur = blur_score(img) if img is not None else 999.0
    else:
        blur = blur_score(img) if img is not None else 999.0
        text, angle = ocr_image(data) if blur >= BLUR_THRESHOLD else ("", 0.0)
    if blur < BLUR_THRESHOLD:
        return {"type": expected, "fields": {}, "quality": "blurry", "blur": round(blur, 1), "angle": 0.0, "text": "",
                "message": "This photo is too blurry to read. Please retake it in good light, holding the phone steady."}
    p = parse(text, None)
    if p["type"] is None:
        p = parse(text, expected)
    if p["type"] == "gst" and not gstin_format(p["fields"].get("gstin") or "")[0] and pytesseract and cached is None:
        # Second opinion: a different page-segmentation mode on the straightened image.
        img2 = img.rotate(angle, expand=True, fillcolor=255, resample=Image.BICUBIC) if abs(angle) >= 0.5 else img
        alt = pytesseract.image_to_string(img2, config="--psm 6")
        g2 = next((l.split("GSTIN", 1)[1] for l in alt.splitlines() if "GSTIN" in l), "")
        first = next((l.split("GSTIN", 1)[1] for l in text.splitlines() if "GSTIN" in l), "")
        fixed, corr = repair_gstin([first, g2])
        if gstin_format(fixed)[0]:
            p["fields"]["gstin"] = fixed
            p["fields"]["_ocr_corrections"] = corr + ["second OCR pass"]
            text = text + "\n# second pass GSTIN: " + g2.strip()
    msg = None
    if expected and p["type"] and p["type"] != expected:
        msg = f"This looks like a {DOC_TYPES[p['type']]}, not a {DOC_TYPES[expected]}."
    return {**p, "quality": "ok", "blur": round(blur, 1), "angle": angle, "text": text, "message": msg}


# ---------------------------------------------------------------- bills and evidence boxes
def read_bill(data: bytes) -> dict:
    """Read a competitor phone/broadband bill: provider, what they use, and the total they pay a month."""
    text, _ = ocr_image(data)
    t = text.lower()
    m = re.search(r"(?:total amount due|amount payable|total due|net payable|total payable)[^\d₹]*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d{1,2})?)", t)
    amount = int(float(m.group(1).replace(",", ""))) if m else None
    provider = next((l.strip() for l in text.splitlines() if re.search(r"(telecom|broadband|fibre|fiber|networks?)\b", l, re.I) and len(l.strip()) < 60), None)
    setup = ("Leased line" if "leased line" in t else "Business broadband" if "business broadband" in t
             else "Home broadband" if "broadband" in t or "fibre" in t or "fiber" in t
             else "Mobile hotspot" if "hotspot" in t or "data pack" in t else None)
    lines = re.findall(r"(?:postpaid|mobile|sim)[^\n]*?x\s*(\d+)", t)
    return {"amount": amount, "provider": provider, "setup": setup, "sims": int(lines[0]) if lines else None, "ok": amount is not None}


def evidence_boxes(data: bytes, needle: str) -> dict:
    """Where on the photo a value appears, so the UI can draw a box around the exact characters a check is about.
    Returns {"w", "h", "boxes": [[x, y, w, h], ...]} in image pixels."""
    if not pytesseract or not needle:
        return {"w": 0, "h": 0, "boxes": []}
    img = Image.open(io.BytesIO(data)).convert("L")
    d = pytesseract.image_to_data(img, config="--psm 4", output_type=pytesseract.Output.DICT)
    want = re.sub(r"[^A-Z0-9]", "", needle.upper())
    boxes = []
    for i, w in enumerate(d["text"]):
        tok = re.sub(r"[^A-Z0-9]", "", (w or "").upper())
        if len(tok) >= 6 and (tok in want or want in tok or SequenceMatcher(None, tok, want).ratio() > 0.8):
            boxes.append([d["left"][i], d["top"][i], d["width"][i], d["height"][i]])
    return {"w": img.width, "h": img.height, "boxes": boxes}
