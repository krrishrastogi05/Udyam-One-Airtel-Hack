"""Catalogue, eligibility and pricing. Every commercial number comes from here, never from the LLM."""
from __future__ import annotations

import csv
from pathlib import Path

DATA = Path(__file__).parent / "data"
GST_RATE = 0.18


def _rows(name: str) -> list[dict]:
    with open(DATA / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


CATALOGUE: dict[str, dict] = {}
for r in _rows("product_catalogue.csv"):
    CATALOGUE[r["product_id"]] = {
        "id": r["product_id"],
        "category": r["category"],
        "name": r["product_name"],
        "description": r["description"],
        "unit": r["unit"],
        "price_min": int(r["price_min_inr_per_month"]),
        "price_max": int(r["price_max_inr_per_month"]),
        "setup": int(r["one_time_setup_inr"]),
        "min_contract": int(r["min_contract_months"]),
        "tiers": [int(x) for x in r["available_city_tiers"].split(";") if x],
        "min_employees": int(r["min_employees"]),
        "min_sites": int(r["min_sites"]),
        "requires_gstin": r["requires_gstin"] == "Y",
        "requires_one_of": [x for x in r["requires_one_of"].split("|") if x],
        "install_days": int(r["typical_install_days"]),
        "segments": r["target_segments"].split(";"),
    }

CONNECTIVITY = {"P01", "P02", "P03", "P04", "P05", "P06"}

SEGMENTS = {
    "micro": "Micro retail & services",
    "prof": "Professional offices",
    "multi": "Small multi-site businesses",
    "mfg": "Small manufacturers",
}

# What a business owner says -> which product solves it, and the plain-language "why".
NEED_LABELS = {
    "internet": "Fast, reliable internet",
    "backup": "Internet that never goes down",
    "mobile": "Business SIMs for staff",
    "whatsapp": "Sell & reply on WhatsApp",
    "sms": "SMS alerts & offers",
    "email": "Professional email & docs",
    "storage": "Cloud backup of files",
    "website": "A website for your business",
    "pos": "Billing & UPI counter",
    "security": "Protection from viruses & hacks",
    "wifi": "Wi-Fi for customers",
    "cctv": "CCTV you can watch on phone",
    "calling": "Business phone line / IVR",
    "tollfree": "Toll-free number",
    "iot": "Machine monitoring",
    "fleet": "Vehicle tracking",
    "sdwan": "All branches on one network",
}

DEFAULT_NEEDS = {
    "micro": ["internet", "mobile", "pos", "whatsapp"],
    "prof": ["internet", "backup", "email", "security"],
    "multi": ["internet", "backup", "cctv", "pos", "wifi"],
    "mfg": ["internet", "security", "iot", "mobile"],
}


def infer_segment(profile: dict) -> str:
    t = (profile.get("business_type") or "").lower()
    sites = int(profile.get("sites") or 1)
    if any(w in t for w in ["manufactur", "factory", "textile", "auto", "workshop", "unit", "plant", "fabricat"]):
        return "mfg"
    if sites >= 3:
        return "multi"
    if any(w in t for w in ["clinic", "doctor", "dental", "hospital", "ca ", "ca firm", "chartered", "coaching",
                            "tuition", "office", "lawyer", "legal", "consult", "architect", "agency", "travel"]):
        return "prof"
    if any(w in t for w in ["restaurant", "cafe", "chain", "hotel"]) and sites >= 2:
        return "multi"
    return "micro"


def _qty(pid: str, p: dict) -> int:
    emp = max(1, int(p.get("employees") or 1))
    sites = max(1, int(p.get("sites") or 1))
    unit = CATALOGUE[pid]["unit"]
    if unit == "per site":
        return sites
    if pid == "P07":
        return max(1, min(emp, 2 + emp // 3))
    if pid == "P08":
        return max(1, min(emp, 1 + emp // 5))
    if pid == "P16":
        return emp
    if pid == "P20":
        return emp
    if pid == "P12":
        return 2 if emp < 10 else 4
    if pid == "P23":
        return 4 * sites
    if pid == "P19":
        return sites
    if pid == "P24":
        return 5
    if pid == "P25":
        return 3
    return 1


def connectivity_for(seg: str, p: dict) -> str:
    emp = int(p.get("employees") or 1)
    gst = bool(p.get("gst_active"))
    tier = int(p.get("city_tier") or 2)
    if seg == "mfg":
        if emp >= 25 and gst:
            return "P06"
        if emp >= 10 and gst:
            return "P05"
        return "P02"
    if seg == "multi":
        return "P02"
    if seg == "prof":
        if emp >= 15 and gst and tier == 1:
            return "P03"
        return "P02"
    if p.get("no_fibre"):
        return "P04"
    return "P01"


def products_for_need(need: str, seg: str, p: dict) -> list[str]:
    emp = int(p.get("employees") or 1)
    return {
        "internet": [connectivity_for(seg, p)],
        "backup": ["P09"],
        "mobile": ["P08" if seg in ("multi", "mfg") and emp >= 10 else "P07"],
        "whatsapp": ["P15"],
        "sms": ["P14"],
        "email": ["P16"],
        "storage": ["P17"],
        "website": ["P18"],
        "pos": ["P19"],
        "security": ["P21"] if emp >= 10 and seg in ("mfg", "multi") else ["P20"],
        "wifi": ["P22"],
        "cctv": ["P23"],
        "calling": ["P12"],
        "tollfree": ["P13"],
        "iot": ["P24"],
        "fleet": ["P25"],
        "sdwan": ["P10"],
    }.get(need, [])


def qty_note(pid: str, p: dict, qty: int) -> str | None:
    """Plain-language reason for a quantity we picked, so the owner can confirm or change it."""
    emp = max(1, int(p.get("employees") or 1))
    sites = max(1, int(p.get("sites") or 1))
    unit = CATALOGUE[pid]["unit"]
    if pid in ("P16", "P20"):
        return f"Assumed one per team member ({emp})"
    if pid in ("P07", "P08"):
        return f"Assumed {qty} SIMs for you and key staff"
    if pid == "P23":
        return f"Assumed 4 cameras per site ({sites} site{'s' if sites > 1 else ''})"
    if pid == "P12":
        return f"Assumed {qty} phone lines for a team of {emp}"
    if pid in ("P24", "P25"):
        return f"Assumed {qty} — tell us how many {'machines' if pid == 'P24' else 'vehicles'} you have"
    if unit == "per site" and sites > 1:
        return f"One per site ({sites} sites)"
    return None


def check_item(pid: str, p: dict, ids: set[str]) -> list[dict]:
    """Return blocking issues for one product in a bundle (empty list = eligible)."""
    c = CATALOGUE[pid]
    out = []
    tier = int(p.get("city_tier") or 2)
    if tier not in c["tiers"]:
        out.append({"code": "tier", "msg": f"Not yet available in Tier {tier} cities"})
    if int(p.get("employees") or 1) < c["min_employees"]:
        out.append({"code": "employees", "msg": f"Needs at least {c['min_employees']} employees"})
    if int(p.get("sites") or 1) < c["min_sites"]:
        out.append({"code": "sites", "msg": f"Needs at least {c['min_sites']} sites"})
    if c["requires_gstin"] and not p.get("gst_active"):
        out.append({"code": "gstin", "msg": "Needs an active GSTIN"})
    if c["requires_one_of"] and not (ids & set(c["requires_one_of"])):
        names = " / ".join(CATALOGUE[x]["name"] for x in c["requires_one_of"][:3])
        out.append({"code": "dependency", "msg": f"Works with a broadband line ({names}…)"})
    return out


def unit_price(pid: str, term: int) -> int:
    """Longer commitment, lower price. At the product's minimum term you pay the top of the range;
    at 24 months or more you pay the bottom. Linear in between, rounded to a clean ₹9 ending."""
    c = CATALOGUE[pid]
    lo, hi, mn = c["price_min"], c["price_max"], c["min_contract"]
    if term >= 24 or mn >= 24:
        price = lo
    elif term <= mn:
        price = hi
    else:
        price = hi - (hi - lo) * (term - mn) / (24 - mn)
    price = int(round(price))
    if price >= 100:
        price = int(price // 10 * 10 + 9) if price % 10 != 9 else price
        price = min(max(price, lo), hi)
    return price


def price_bundle(items: list[dict], profile: dict, term: int) -> dict:
    ids = {i["id"] for i in items if i.get("on", True)}
    lines, monthly, setup, issues = [], 0, 0, []
    eta = 0
    for it in items:
        c = CATALOGUE[it["id"]]
        q = max(1, int(it.get("qty") or 1))
        on = it.get("on", True)
        eff_term = max(term, c["min_contract"])
        up = unit_price(it["id"], eff_term)
        probs = check_item(it["id"], profile, ids) if on else []
        line = {
            "id": c["id"], "name": c["name"], "category": c["category"], "unit": c["unit"],
            "qty": q, "unit_price": up, "monthly": up * q, "setup": c["setup"] * q,
            "term": eff_term, "on": on, "core": it.get("core", False), "need": it.get("need"),
            "why": it.get("why"), "issues": probs, "install_days": c["install_days"],
            "flex_price": unit_price(it["id"], c["min_contract"]),
            "assumed": None if it.get("qty_set") else qty_note(it["id"], profile, q),
        }
        lines.append(line)
        if on:
            monthly += line["monthly"]
            setup += line["setup"]
            eta = max(eta, c["install_days"])
            issues += [{"id": c["id"], "name": c["name"], **x} for x in probs]
    flex_monthly = sum(l["flex_price"] * l["qty"] for l in lines if l["on"])
    gst = round(monthly * GST_RATE)
    return {
        "lines": lines, "monthly": monthly, "gst": gst, "monthly_with_gst": monthly + gst,
        "setup": setup, "term": term, "eta_days": eta, "issues": issues, "valid": not issues and bool(ids),
        "saving_vs_flex": max(0, flex_monthly - monthly),
    }


WHY = {
    "internet": {"P01": "Unlimited 100 Mbps fibre — plenty for UPI, billing and a few phones.",
                 "P02": "300 Mbps fibre handles many devices and video calls without slowdowns.",
                 "P03": "1 Gbps with priority support for a busy office.",
                 "P04": "5G AirFiber — plug-and-play in 2 days, no digging for fibre.",
                 "P05": "Leased line with 99.5% uptime guarantee for your machines and ERP.",
                 "P06": "100 Mbps leased line with 99.9% SLA for a large unit."},
    "backup": "If the main line goes down, a 4G/5G router switches over automatically.",
    "mobile": "Business SIMs on one bill, unlimited calls, for you and your staff.",
    "whatsapp": "Official WhatsApp Business API: catalogue, order alerts, 1,000 chats a month.",
    "sms": "10,000 SMS for reminders and offers, DLT registration done for you.",
    "email": "you@yourbusiness.in email, documents and video meetings for each staff member.",
    "storage": "1 TB of automatic cloud backup so records are never lost.",
    "website": "A 5-page website with your own domain and SSL.",
    "pos": "Tablet billing with inventory and UPI/card acceptance.",
    "security": "Protects every computer from viruses, ransomware and phishing.",
    "wifi": "Separate guest Wi-Fi so customers never touch your billing network.",
    "cctv": "Cameras with cloud recording you can watch on your phone.",
    "calling": "A business number with IVR and call recording, works over internet.",
    "tollfree": "A 1800 number customers can call free.",
    "iot": "Sensors that alert you when a machine is idle or overheating.",
    "fleet": "Live location of your delivery vehicles.",
    "sdwan": "Links all branches into one managed network with app priority.",
}


def _why(need: str, pid: str) -> str:
    w = WHY.get(need)
    if isinstance(w, dict):
        return w.get(pid, "")
    return w or CATALOGUE[pid]["description"]


def build_items(needs: list[str], seg: str, p: dict) -> tuple[list[dict], list[dict]]:
    items, locked, seen = [], [], set()
    ordered = ["internet"] + [n for n in needs if n != "internet"]
    for n in ordered:
        for pid in products_for_need(n, seg, p):
            if pid in seen:
                continue
            seen.add(pid)
            items.append({"id": pid, "qty": _qty(pid, p), "on": True, "need": n,
                          "core": pid in CONNECTIVITY, "why": _why(n, pid)})
    if int(p.get("sites") or 1) >= 3 and "sdwan" not in needs and "P10" not in seen:
        items.append({"id": "P10", "qty": _qty("P10", p), "on": True, "need": "sdwan", "core": False,
                      "why": _why("sdwan", "P10")})
    ids = {i["id"] for i in items}
    keep = []
    for it in items:
        probs = check_item(it["id"], p, ids)
        if probs:
            locked.append({"id": it["id"], "name": CATALOGUE[it["id"]]["name"], "need": it["need"],
                           "reason": probs[0]["msg"], "code": probs[0]["code"]})
        else:
            keep.append(it)
    return keep, locked


def recommend(profile: dict) -> dict:
    seg = profile.get("segment") or infer_segment(profile)
    needs = profile.get("needs") or DEFAULT_NEEDS[seg]
    if "internet" not in needs:
        needs = ["internet"] + list(needs)
    items, locked = build_items(needs, seg, profile)
    term = 24 if seg in ("prof", "multi", "mfg") else 12
    full = price_bundle(items, profile, term)
    # Essential = connectivity + the first two other needs.
    others = [i["id"] for i in items if not i["core"]]
    keep_n = 2 if len(others) >= 4 else max(1, len(others) - 1) if others else 0
    ess_ids = [i["id"] for i in items if i["core"]] + others[:keep_n]
    ess_items = [dict(i, on=i["id"] in ess_ids) for i in items]
    essential = price_bundle(ess_items, profile, term)
    budget = int(profile.get("budget") or 0)
    spend = int(profile.get("current_spend") or 0)
    plans = [
        {"key": "essential", "title": "Essential", "tag": "Get started", "items": ess_items, "quote": essential},
        {"key": "complete", "title": "Complete", "tag": "Best fit for you", "items": items, "quote": full},
    ]
    best = "complete"
    if budget and full["monthly_with_gst"] > budget * 1.1 and essential["monthly_with_gst"] <= budget * 1.1:
        best = "essential"
    return {
        "segment": seg, "segment_label": SEGMENTS[seg], "needs": needs, "plans": plans, "best": best,
        "locked": locked, "budget": budget, "current_spend": spend,
    }


def addon_suggestions(profile: dict, current_ids: set[str]) -> list[dict]:
    seg = profile.get("segment") or infer_segment(profile)
    out = []
    for need in ["backup", "security", "whatsapp", "website", "cctv", "wifi", "storage", "email", "pos", "sms"]:
        for pid in products_for_need(need, seg, profile):
            if pid in current_ids or pid in {o["id"] for o in out}:
                continue
            if seg not in CATALOGUE[pid]["segments"]:
                continue
            probs = check_item(pid, profile, current_ids | {pid})
            out.append({"id": pid, "name": CATALOGUE[pid]["name"], "need": need, "label": NEED_LABELS[need],
                        "why": _why(need, pid), "qty": _qty(pid, profile),
                        "unit_price": unit_price(pid, 24), "locked": probs[0]["msg"] if probs else None})
    return out[:6]
