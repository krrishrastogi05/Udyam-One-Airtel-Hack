"""Conversational advisor. Gemini (if GEMINI_API_KEY is set) understands free text in any Indian language;
a deterministic multilingual fallback (English / Hindi / Hinglish) runs otherwise. Either way, the model only
proposes *facts*; bundles, prices and eligibility always come from engine.py."""
from __future__ import annotations

import json
import os
import re

import ai
import engine
import kyc

# ---------------------------------------------------------------- vocab
BUSINESS = [
    # (keywords, canonical, segment)
    (["kirana", "grocery", "general store", "किराना", "provision"], "Kirana store", "micro"),
    (["salon", "parlour", "parlor", "barber", "सैलून", "पार्लर"], "Salon", "micro"),
    (["pharmacy chain", "medical chain", "chemist chain"], "Pharmacy chain", "multi"),
    (["pharmacy", "chemist", "medical store", "medical shop", "दवाई", "दवा की दुकान", "मेडिकल"], "Pharmacy", "micro"),
    (["bakery chain"], "Bakery chain", "multi"),
    (["bakery", "bake", "बेकरी", "cake shop"], "Bakery", "micro"),
    (["sweet", "mithai", "मिठाई", "halwai"], "Sweet shop", "micro"),
    (["stationery", "stationary", "स्टेशनरी"], "Stationery shop", "micro"),
    (["boutique", "tailor", "clothing", "garment shop", "बुटीक", "कपड़े"], "Boutique", "micro"),
    (["mobile repair", "phone repair", "mobile shop", "मोबाइल रिपेयर"], "Mobile repair shop", "micro"),
    (["hardware", "हार्डवेयर"], "Hardware store", "micro"),
    (["optician", "optical", "chashma", "चश्मा"], "Optician", "micro"),
    (["restaurant", "cafe", "café", "dhaba", "रेस्टोरेंट", "ढाबा", "food joint"], "Restaurant chain", "multi"),
    (["hotel"], "Budget hotel group", "multi"),
    (["gym", "fitness", "जिम"], "Gym chain", "multi"),
    (["pre-school", "preschool", "play school", "playschool"], "Pre-school chain", "multi"),
    (["electronics"], "Electronics retail chain", "multi"),
    (["apparel", "fashion chain", "clothing chain"], "Apparel retail chain", "multi"),
    (["dental", "dentist", "दांत", "डेंटल"], "Dental clinic", "prof"),
    (["physio", "फिजियो"], "Physiotherapy clinic", "prof"),
    (["diagnostic", "pathology", "lab ", "laboratory", "लैब"], "Diagnostic lab", "prof"),
    (["clinic", "doctor", "hospital", "nursing home", "क्लिनिक", "डॉक्टर", "दवाखाना", "दवाखाना"], "Clinic", "prof"),
    (["ca firm", "chartered", "accountant", "ca office", "audit", "सीए"], "CA firm", "prof"),
    (["coaching", "tuition", "classes", "institute", "academy", "कोचिंग", "ट्यूशन"], "Coaching centre", "prof"),
    (["law", "lawyer", "advocate", "legal", "वकील"], "Law office", "prof"),
    (["travel", "tour", "ट्रैवल"], "Travel agency", "prof"),
    (["architect", "interior"], "Architecture studio", "prof"),
    (["real estate", "property", "broker", "प्रॉपर्टी"], "Real estate agency", "prof"),
    (["insurance", "बीमा"], "Insurance agency", "prof"),
    (["textile", "weaving", "कपड़ा मिल", "power loom"], "Textile unit", "mfg"),
    (["auto part", "auto-part", "auto component"], "Auto-parts unit", "mfg"),
    (["plastic", "moulding", "molding"], "Plastic moulding unit", "mfg"),
    (["packaging", "carton"], "Packaging unit", "mfg"),
    (["printing", "press", "प्रिंटिंग"], "Printing press", "mfg"),
    (["furniture", "carpentry", "फर्नीचर"], "Furniture workshop", "mfg"),
    (["food processing", "masala", "pickle", "snack unit"], "Food processing unit", "mfg"),
    (["factory", "manufactur", "workshop", "फैक्ट्री", "कारखाना", "unit"], "Manufacturing unit", "mfg"),
    (["shop", "store", "dukaan", "dukan", "दुकान"], "Retail shop", "micro"),
]

# Marathi and Tamil keywords for the offline engine (with an AI key, the model understands any language).
_EXTRA_KW = {
    "Kirana store": ["किराणा", "மளிகை"], "Salon": ["सलून", "சலூன்", "அழகு நிலையம்"],
    "Pharmacy": ["औषध", "மருந்தகம்", "மருந்து கடை", "மெடிக்கல்"], "Bakery": ["பேக்கரி"],
    "Restaurant chain": ["हॉटेल", "उपाहारगृह", "உணவகம்", "ஹோட்டல்", "ரெஸ்டாரன்ட்"], "Dental clinic": ["दंत", "பல் மருத்துவ"],
    "Clinic": ["दवाखान", "डॉक्टर", "கிளினிக்", "மருத்துவமனை", "டாக்டர்"], "CA firm": ["ஆடிட்டர்", "சிஏ"],
    "Coaching centre": ["क्लासेस", "शिकवणी", "டியூஷன்", "பயிற்சி மையம்"], "Textile unit": ["कापड", "நெசவு", "ஜவுளி"],
    "Manufacturing unit": ["कारखाना", "தொழிற்சாலை", "ஃபேக்டரி"], "Retail shop": ["दुकान", "கடை"],
    "Boutique": ["बुटीक", "துணிக்கடை"], "Hardware store": ["ஹார்டுவேர்"], "Furniture workshop": ["फर्निचर", "ஃபர்னிச்சர்"],
}
for _keys, _canon, _seg in BUSINESS:
    _keys.extend(_EXTRA_KW.get(_canon, []))

CITIES = {
    "Kochi": (2, ["kochi", "cochin", "कोच्चि"]), "Ludhiana": (2, ["ludhiana", "लुधियाना"]),
    "Chennai": (1, ["chennai", "madras", "चेन्नई"]), "Nagpur": (2, ["nagpur", "नागपुर"]),
    "Jaipur": (2, ["jaipur", "जयपुर"]), "Visakhapatnam": (2, ["visakhapatnam", "vizag", "विशाखापत्तनम"]),
    "Lucknow": (2, ["lucknow", "लखनऊ"]), "Bhopal": (2, ["bhopal", "भोपाल"]),
    "Kolkata": (1, ["kolkata", "calcutta", "कोलकाता"]), "Pune": (1, ["pune", "poona", "पुणे"]),
    "Surat": (2, ["surat", "सूरत"]), "Hyderabad": (1, ["hyderabad", "हैदराबाद"]),
    "Bengaluru": (1, ["bengaluru", "bangalore", "बेंगलुरु", "बैंगलोर"]), "Mumbai": (1, ["mumbai", "bombay", "मुंबई"]),
    "Mysuru": (2, ["mysuru", "mysore", "मैसूर"]), "Ahmedabad": (1, ["ahmedabad", "अहमदाबाद"]),
    "Coimbatore": (2, ["coimbatore", "कोयंबटूर"]), "Indore": (2, ["indore", "इंदौर"]),
    "Nashik": (2, ["nashik", "nasik", "नाशिक", "नासिक"]), "Delhi": (1, ["delhi", "new delhi", "दिल्ली", "noida", "gurgaon", "gurugram"]),
    "Vadodara": (2, ["vadodara", "baroda", "वडोदरा"]), "Patna": (2, ["patna", "पटना"]),
    "Kanpur": (2, ["kanpur", "कानपुर"]), "Agra": (2, ["agra", "आगरा"]), "Varanasi": (2, ["varanasi", "banaras", "वाराणसी"]),
    "Chandigarh": (2, ["chandigarh", "चंडीगढ़"]), "Nashik ": (2, []),
    "Madurai": (2, ["madurai", "மதுரை"]), "Kolhapur": (2, ["kolhapur", "कोल्हापूर"]),
    "Aurangabad": (2, ["aurangabad", "sambhajinagar", "औरंगाबाद"]), "Tiruchirappalli": (2, ["trichy", "tiruchirappalli", "திருச்சி"]),
}
_EXTRA_CITY = {"Chennai": ["சென்னை"],  "Coimbatore": ["கோயம்புத்தூர்", "கோவை"], "Bengaluru": ["பெங்களூரு", "बंगळूर"],
               "Nagpur": ["नागपूर"], "Mumbai": ["மும்பை", "मुंबईत"], "Hyderabad": ["ஹைதராபாத்"], "Kochi": ["கொச்சி"],
               "Pune": ["புனே", "पुण्या"], "Delhi": ["டெல்லி"]}
for _c, _al in _EXTRA_CITY.items():
    CITIES[_c][1].extend(_al)

NEEDS = {
    "internet": ["internet", "broadband", "wifi", "wi-fi", "fibre", "fiber", " net ", "net chahiye", "इंटरनेट", "नेट", "वाईफाई", "ब्रॉडबैंड"],
    "backup": ["backup internet", "failover", "net jaata", "net chala jata", "down", "never goes down", "uptime", "बैकअप", "नेट चला जाता"],
    "mobile": ["sim", "mobile connection", "phone connection", "postpaid", "सिम", "मोबाइल कनेक्शन"],
    "whatsapp": ["whatsapp", "व्हाट्सएप", "वॉट्सऐप", "catalogue", "catalog"],
    "sms": ["sms", "message blast", "एसएमएस", "reminder"],
    "email": ["email", "e-mail", "mail id", "office suite", "ईमेल", "मेल"],
    "storage": ["cloud storage", "data backup", "file backup", "records", "क्लाउड"],
    "website": ["website", "web site", "domain", "online presence", "वेबसाइट"],
    "pos": ["billing", "pos", "upi", "card machine", "payment machine", "invoice", "बिलिंग", "बिल"],
    "security": ["security", "virus", "antivirus", "hack", "cyber", "ransomware", "सुरक्षा", "वायरस"],
    "wifi": ["guest wifi", "customer wifi", "wifi for customers", "free wifi", "ग्राहकों के लिए वाईफाई"],
    "cctv": ["cctv", "camera", "surveillance", "कैमरा", "सीसीटीवी"],
    "calling": ["calling", "ivr", "phone line", "landline", "call recording", "telephony", "कॉलिंग", "फोन लाइन"],
    "tollfree": ["toll free", "toll-free", "1800", "टोल फ्री"],
    "iot": ["machine", "iot", "sensor", "मशीन"],
    "fleet": ["vehicle", "fleet", "delivery van", "truck", "gaadi", "गाड़ी"],
    "sdwan": ["sd-wan", "sdwan", "connect branches", "all branches", "central network"],
}

NUM_WORDS = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "chhah": 6, "che": 6,
    "saat": 7, "aath": 8, "nau": 9, "das": 10, "gyarah": 11, "barah": 12, "pandrah": 15, "bees": 20, "pachees": 25,
    "tees": 30, "chalees": 40, "pachas": 50, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12, "fifteen": 15, "twenty": 20,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9,
    "दस": 10, "बारह": 12, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30, "पचास": 50,
    # Marathi
    "दोन": 2, "पाच": 5, "सहा": 6, "नऊ": 9, "दहा": 10, "बारा": 12, "पंधरा": 15, "वीस": 20, "पंचवीस": 25, "पन्नास": 50,
    # Tamil
    "ஒன்று": 1, "ஒரு": 1, "இரண்டு": 2, "மூன்று": 3, "நான்கு": 4, "ஐந்து": 5, "ஆறு": 6, "ஏழு": 7, "எட்டு": 8,
    "ஒன்பது": 9, "பத்து": 10, "பன்னிரண்டு": 12, "பதினைந்து": 15, "இருபது": 20, "முப்பது": 30, "ஐம்பது": 50,
}
MARATHI = re.compile(r"(आहे|आहेत|माझ[ंेा]|मध्ये|करतात|नाही|पाहिजे|हवं|हवे|आम्ही|तुम्ही|आमच)")
DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
HINGLISH = {"hai", "hain", "chahiye", "mera", "meri", "mujhe", "hum", "humara", "nahi", "nahin", "kitna", "dukaan",
            "dukan", "karna", "kaam", "log", "aur", "bhi", "kya", "haan", "theek", "accha", "acha", "sasta", "wala"}


LANGS = ("en", "hi", "hinglish", "mr", "ta")


def L(d: dict, lang: str) -> str:
    """Pick a translation, falling back to English."""
    return d.get(lang) or d["en"]


def detect_lang(text: str, prev: str | None = None) -> str:
    if re.search(r"[஀-௿]", text):
        return "ta"
    if re.search(r"[ऀ-ॿ]", text):
        return "mr" if MARATHI.search(text) or (prev == "mr" and len(text.split()) <= 3) else "hi"
    if prev in ("mr", "ta") and len(text.split()) <= 4:
        return prev  # short Latin replies ("yes", "4800", a GSTIN) keep the chosen language
    words = set(re.findall(r"[a-z]+", text.lower()))
    if len(words & HINGLISH) >= 1 and len(words) <= 40:
        return "hinglish"
    if len(words) <= 2 and prev:
        return prev
    return "en"


def _num(s: str) -> int | None:
    s = s.translate(DEV_DIGITS).replace(",", "").strip().lower()
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(k|hazaar|hazar|हज़ार|हजार|thousand)?", s)
    if m:
        v = float(m.group(1))
        if m.group(2):
            v *= 1000
        return int(v)
    return NUM_WORDS.get(s)


NUM_RE = r"(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?|[a-zऀ-ॿ஀-௿]+)"


def extract(text: str, profile: dict, slot: str | None) -> tuple[dict, dict]:
    """Return (profile updates, flags) from one message, rules only."""
    raw = text.strip()
    t = " " + raw.lower().translate(DEV_DIGITS) + " "
    up: dict = {}
    fl: dict = {}

    # GSTIN anywhere in the message -> registry lookup fills a lot at once
    m = re.search(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", raw.upper())
    if m:
        up["gstin"] = m.group(0)
        up["has_gst"] = True

    # business type
    for keys, canon, seg in BUSINESS:
        if any(k in t for k in keys):
            if canon in ("Retail shop", "Manufacturing unit") and profile.get("business_type") and slot != "business_type":
                break
            up["business_type"], up["segment_hint"] = canon, seg
            break

    # employees
    emp_words = r"(?:staff|employees?|people|workers?|log|karmachari|कर्मचारी|लोग|स्टाफ|members?|doctors?|teachers?|लोगों|लोक|जण|பேர்|ஊழியர்|பணியாளர்)"
    m = re.search(NUM_RE + r"\s*(?:ka\s+|का\s+)?" + emp_words, t)
    if not m:
        m = re.search(r"(?:staff|team|employees?)\s*(?:of|is|are|=|:)?\s*" + NUM_RE, t)
    if m and _num(m.group(1)):
        up["employees"] = _num(m.group(1))
    elif re.search(r"\b(just me|only me|akela|अकेला|अकेले|myself)\b", t):
        up["employees"] = 1

    # sites
    site_words = r"(?:branch(?:es)?|outlets?|stores?|shops?|locations?|sites?|centres?|centers?|clinics?|units?|shakha|शाखा(?:एँ|एं)?|ब्रांच|दुकानें|restaurants?|cafes?|கிளை(?:கள்)?|கடைகள்)"
    m = re.search(NUM_RE + r"\s*" + site_words, t)
    if m and _num(m.group(1)) and _num(m.group(1)) < 500:
        up["sites"] = _num(m.group(1))
    elif re.search(r"\b(single|one|ek|एक)\s+(shop|store|dukaan|location|branch|clinic|दुकान)", t) or "ek hi" in t:
        up["sites"] = 1

    # city
    for city, (tier, aliases) in CITIES.items():
        if any(re.search(r"(?<![a-z])" + re.escape(a) + r"(?![a-z])", t) for a in aliases):
            up["city"], up["city_tier"] = city.strip(), tier
            break

    # needs
    found = [k for k, words in NEEDS.items() if any(w in t for w in words)]
    if re.search(r"(?<![a-z])backup(?![a-z])|बैकअप", t) and "backup" not in found and not re.search(r"(data|file|cloud|records?) backup", t):
        found.append("backup")
    if "wifi" in found and not any(w in t for w in ["guest", "customer", "ग्राहक", "free wifi"]):
        found.remove("wifi")
        if "internet" not in found:
            found.append("internet")
    if found:
        up["needs_add"] = found
    if re.search(r"(not sure|pata nahi|पता नहीं|you suggest|suggest|aap batao|आप बताइए|आप ही सुझाइए|whatever|kuch bhi|सुचवा|माहित नाही|பரிந்துரை|தெரியாது)", t):
        fl["suggest"] = True
    if re.search(r"(no fib(re|er)|fibre nahi|fiber nahi|fibre not available)", t):
        up["no_fibre"] = True

    # GST yes/no
    if re.search(r"(no gst|gst nahi|gst nhi|without gst|don'?t have gst|not registered|gst नहीं|जीएसटी नहीं|nahi hai gst|gst नाही|जीएसटी नाही|gst இல்லை)", t):
        up["has_gst"] = False
    elif re.search(r"(have gst|gst hai|gst है|gst registered|registered under gst|हाँ जीएसटी|yes,? i have gst|gst आहे|gst உள்ளது|gst இருக்கு)", t):
        up.setdefault("has_gst", True)

    # current tools (the brief asks the advisor about them)
    for rx, name in [(r"hotspot|हॉटस्पॉट|ஹாட்ஸ்பாட்", "Mobile hotspot"), (r"leased line|लीज्ड लाइन", "Leased line"),
                     (r"home broadband|ghar ka (net|wifi)|घर का (नेट|ब्रॉडबैंड)|घरचं|வீட்டு", "Home broadband"),
                     (r"business broadband|office broadband", "Business broadband"),
                     (r"no internet|net nahi hai|इंटरनेट नहीं|इंटरनेट नाही|இணையம் இல்லை", "No internet yet")]:
        if re.search(rx, t):
            up["current_setup"] = name
            break

    # money
    m = re.search(r"(?:budget|बजट|under|upto|up to|max(?:imum)?|within|tak|तक)\s*(?:of|is|:)?\s*(?:rs\.?|₹|inr)?\s*(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?)", t)
    if not m:
        m = re.search(r"(?:rs\.?|₹|inr)?\s*(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?)\s*(?:tak|तक|budget|बजट)", t)
    if m and _num(m.group(1)) and _num(m.group(1)) >= 200:
        up["budget"] = _num(m.group(1))
    m = re.search(r"(?:pay|paying|spend|spending|bill|kharcha|खर्च|dete|देते|bharte)\D{0,25}(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?)", t)
    if not m:
        m = re.search(r"(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?)\s*(?:rs\.?|₹|rupees|रुपये)?\s*(?:ka bill|का बिल|monthly|per month|a month|mahina|महीना|kharcha)", t)
    if m and _num(m.group(1)) and _num(m.group(1)) >= 100:
        up["current_spend"] = _num(m.group(1))

    # slot-specific bare answers
    bare = raw.translate(DEV_DIGITS).strip().lower().rstrip(".!")
    if slot == "size" and "employees" not in up and _num(bare):
        up["employees"] = _num(bare)
    if slot == "city" and "city" not in up and 2 <= len(bare) <= 30 and not re.search(r"\d", bare):
        up["city"], up["city_tier"] = raw.strip().title(), 2
    if slot == "spend":
        if re.search(r"(skip|nahi pata|पता नहीं|don'?t know|later|no idea|छोड़|chhodo|rehne do)", t):
            up["current_spend"] = 0
            fl["skip"] = True
        elif "current_spend" not in up:
            m = re.search(r"(\d[\d,]*(?:\.\d+)?\s*(?:k|hazaar|hazar|हज़ार|हजार|thousand)?)", t)
            if m and _num(m.group(1)):
                up["current_spend"] = _num(m.group(1))
    if slot == "gst" and "has_gst" not in up:
        if re.search(r"^(yes|haan|han|ha|hai|हाँ|हां|हा|ji|जी|yes i do|yup|yeah|हो|होय|ஆம்|ஆமா|இருக்கு|உள்ளது)(?=$|[\s,.!?])", bare):
            up["has_gst"] = True
        elif re.search(r"^(no|nahi|nhi|नहीं|नही|ना|na|nope|नाही|இல்லை)(?=$|[\s,.!?])", bare):
            up["has_gst"] = False
    if slot == "business_type" and "business_type" not in up and 3 <= len(bare) <= 40:
        up["business_type"], up["segment_hint"] = raw.strip().capitalize(), "micro"

    # intents
    if re.search(r"(human|agent|executive|call me|talk to (a )?person|insaan|baat kar|बात कर|किसी से बात|sales ?person)", t):
        fl["human"] = True
    if re.search(r"\b(confirm|go ahead|book it|done|proceed|let'?s do it|theek hai|thik hai|chalega|haan ji|ok(ay)?|yes|ठीक है|हाँ)\b", t):
        fl["confirm"] = True
    if re.search(r"(cheaper|sasta|kam karo|less|lower price|too (much|expensive)|mehenga|महंगा|सस्ता|budget kam)", t):
        fl["cheaper"] = True
    if re.search(r"(remove|hata|हटा|don'?t need|nahi chahiye|नहीं चाहिए)", t):
        fl["remove"] = True
    if re.search(r"(start over|restart|reset|naya shuru)", t):
        fl["restart"] = True
    if "?" in raw or re.search(r"^(what|why|how|kya|kitna|kaise|kab|क्या|कितना|कैसे|कब)\b", bare):
        fl["question"] = True
    return up, fl


# ---------------------------------------------------------------- copy
SLOTS = ["business_type", "size", "city", "needs", "gst", "spend"]

Q = {
    "business_type": {
        "en": "Namaste! 👋 I'm Udyam One, your digital setup advisor. I'll get your business online in a few minutes — no visit needed.\n\nWhat kind of business do you run?",
        "hi": "नमस्ते! 👋 मैं उद्यम वन हूँ — आपका डिजिटल सलाहकार। कुछ ही मिनटों में आपका बिज़नेस ऑनलाइन, बिना किसी विज़िट के।\n\nआपका व्यवसाय क्या है?",
        "hinglish": "Namaste! 👋 Main Udyam One hoon — aapka digital advisor. Kuch hi minute mein aapka business online, bina visit ke.\n\nAapka business kya hai?",
    },
    "size": {
        "en": "A {type} — great! 🙌 How many people work with you, and how many locations do you have?",
        "hi": "{type} — बढ़िया! 🙌 आपके साथ कितने लोग काम करते हैं, और कितनी जगह (ब्रांच) हैं?",
        "hinglish": "{type} — badhiya! 🙌 Kitne log kaam karte hain, aur kitni branches hain?",
    },
    "city": {
        "en": "Got it. Which city are you in? 📍",
        "hi": "समझ गया। आप किस शहर में हैं? 📍",
        "hinglish": "Samajh gaya. Aap kis city mein ho? 📍",
    },
    "needs": {
        "en": "What should work better in your business? Tap all that apply — or just tell me in your own words.",
        "hi": "आपके बिज़नेस में क्या बेहतर होना चाहिए? जो लागू हो वो चुनें — या अपने शब्दों में बताइए।",
        "hinglish": "Business mein kya better karna hai? Jo chahiye select karo — ya apne words mein batao.",
    },
    "gst": {
        "en": "Do you have a GST number? If yes, just type it — I'll fetch your business details instantly. ⚡",
        "hi": "क्या आपके पास GST नंबर है? हो तो लिख दीजिए — मैं आपकी डिटेल्स तुरंत निकाल लूँगा। ⚡",
        "hinglish": "Aapke paas GST number hai? Ho toh type kar do — main details turant fetch kar lunga. ⚡",
    },
    "spend": {
        "en": "Last one: roughly how much do you pay for phone + internet every month today? I'll show you what you save. 💸",
        "hi": "आख़िरी सवाल: अभी हर महीने फ़ोन + इंटरनेट पर लगभग कितना खर्च होता है? मैं बचत दिखाऊँगा। 💸",
        "hinglish": "Last sawaal: abhi phone + internet pe mahine ka kitna kharcha hai? Main saving dikhaunga. 💸",
    },
}

CHIPS = {
    "business_type": ["Kirana store", "Clinic", "Salon", "Restaurant chain", "CA firm", "Manufacturing unit"],
    "size": {"en": ["Just me + 2", "6 staff, 1 location", "15 staff, 3 branches"],
             "hi": ["मैं + 2 लोग", "6 लोग, 1 दुकान", "15 लोग, 3 ब्रांच"],
             "hinglish": ["Main + 2 log", "6 log, 1 dukaan", "15 log, 3 branch"]},
    "city": ["Delhi", "Mumbai", "Pune", "Jaipur", "Lucknow", "Kochi"],
    "gst": {"en": ["No GST yet", "Yes, I have GST"], "hi": ["GST नहीं है", "हाँ, GST है"], "hinglish": ["GST nahi hai", "Haan, GST hai"]},
    "spend": {"en": ["About ₹1,500", "About ₹4,000", "About ₹10,000", "Skip"],
              "hi": ["लगभग ₹1,500", "लगभग ₹4,000", "लगभग ₹10,000", "छोड़ें"],
              "hinglish": ["Lagbhag ₹1,500", "Lagbhag ₹4,000", "Lagbhag ₹10,000", "Skip"]},
}

T = {
    "gst_found": {
        "en": "Found it ✅ **{name}** — GST {status}, registered {date} in {city}. I've filled in your details.",
        "hi": "मिल गया ✅ **{name}** — GST {status}, {date} से {city} में पंजीकृत। आपकी डिटेल्स भर दी हैं।",
        "hinglish": "Mil gaya ✅ **{name}** — GST {status}, {date} se {city} mein registered. Details fill kar di hain.",
    },
    "gst_inactive": {
        "en": "⚠️ The registry shows this GSTIN as **{status}**. I'll recommend products that don't need GST, and our partner can help you restore it.",
        "hi": "⚠️ रजिस्ट्री में यह GSTIN **{status}** है। मैं ऐसे प्रोडक्ट सुझाऊँगा जिनमें GST ज़रूरी नहीं, और हमारा पार्टनर इसे ठीक कराने में मदद करेगा।",
        "hinglish": "⚠️ Registry mein yeh GSTIN **{status}** hai. Main bina-GST wale products suggest karunga, aur partner isse theek karwane mein help karega.",
    },
    "gst_unknown": {
        "en": "Hmm, I couldn't find that GSTIN in the registry. Could you double-check it? You can also continue without it.",
        "hi": "यह GSTIN रजिस्ट्री में नहीं मिला। एक बार जाँच लीजिए — या बिना इसके आगे बढ़ें।",
        "hinglish": "Yeh GSTIN registry mein nahi mila. Ek baar check kar lo — ya bina iske aage badho.",
    },
    "gst_number": {
        "en": "Great! Type your 15-character GSTIN and I'll fetch everything (or say *skip*).",
        "hi": "बढ़िया! अपना 15 अक्षर का GSTIN लिखिए, मैं सब निकाल लूँगा (या *skip* लिखें)।",
        "hinglish": "Badhiya! Apna 15-character GSTIN type karo, main sab fetch kar lunga (ya *skip* likho).",
    },
    "reco": {
        "en": "Here's what I'd set up for {name} 👇\nOne bill, one support number, installed in about **{eta} days**.",
        "hi": "{name} के लिए मेरा सुझाव 👇\nएक बिल, एक सपोर्ट नंबर, लगभग **{eta} दिन** में इंस्टॉल।",
        "hinglish": "{name} ke liye mera suggestion 👇\nEk bill, ek support number, lagbhag **{eta} din** mein install.",
    },
    "saving": {
        "en": "💰 You pay about ₹{spend:,} today across vendors. This is ₹{new:,}/month incl. GST — **₹{diff:,} less**, on one bill.",
        "hi": "💰 अभी आप अलग-अलग जगह लगभग ₹{spend:,} देते हैं। यह ₹{new:,}/महीना (GST सहित) है — **₹{diff:,} कम**, एक ही बिल में।",
        "hinglish": "💰 Abhi aap alag-alag ₹{spend:,} dete ho. Yeh ₹{new:,}/month (GST ke saath) hai — **₹{diff:,} kam**, ek hi bill mein.",
    },
    "upgrade": {
        "en": "💡 Today you pay about ₹{spend:,}. For ₹{diff:,} more a month you add {extras} — all on one bill with one support number.",
        "hi": "💡 अभी लगभग ₹{spend:,} खर्च होते हैं। महीने के ₹{diff:,} ज़्यादा में आपको {extras} भी मिलेगा — एक बिल, एक सपोर्ट नंबर।",
        "hinglish": "💡 Abhi lagbhag ₹{spend:,} kharcha hai. Mahine ke ₹{diff:,} extra mein {extras} bhi milega — ek bill, ek support number.",
    },
    "locked": {
        "en": "🔒 {names} need an active GST number. Want help registering? It's free and takes about 7 days.",
        "hi": "🔒 {names} के लिए GST ज़रूरी है। रजिस्ट्रेशन में मदद चाहिए? मुफ़्त है, लगभग 7 दिन लगते हैं।",
        "hinglish": "🔒 {names} ke liye GST chahiye. Registration mein help chahiye? Free hai, ~7 din lagte hain.",
    },
    "confirm_cta": {
        "en": "Happy with this? Tap **Confirm** and we'll do a 2-minute KYC — no paperwork, no visit.",
        "hi": "पसंद आया? **Confirm** दबाइए — 2 मिनट का KYC, न कागज़, न विज़िट।",
        "hinglish": "Pasand aaya? **Confirm** dabao — 2 minute ka KYC, na kaagaz, na visit.",
    },
    "added": {
        "en": "Added {names} ✅ New total: **₹{total:,}/month** + GST.",
        "hi": "{names} जोड़ दिया ✅ नया कुल: **₹{total:,}/महीना** + GST।",
        "hinglish": "{names} add kar diya ✅ Naya total: **₹{total:,}/month** + GST.",
    },
    "cheaper": {
        "en": "Sure — here's the **Essential** plan at ₹{total:,}/month + GST. You can add things back anytime.",
        "hi": "ज़रूर — **Essential** प्लान ₹{total:,}/महीना + GST में। बाद में कुछ भी जोड़ सकते हैं।",
        "hinglish": "Bilkul — **Essential** plan ₹{total:,}/month + GST mein. Baad mein kuch bhi add kar sakte ho.",
    },
    "human": {
        "en": "Of course 🙏 I've passed your details to an Udyam One partner near you — they'll call within 2 working hours. You won't have to repeat anything.",
        "hi": "ज़रूर 🙏 आपकी जानकारी पास के Udyam One पार्टनर को भेज दी है — 2 घंटे में कॉल आएगी। कुछ दोहराना नहीं पड़ेगा।",
        "hinglish": "Bilkul 🙏 Aapki details paas ke Udyam One partner ko bhej di hain — 2 ghante mein call aayegi. Kuch repeat nahi karna padega.",
    },
    "fallback": {
        "en": "I didn't quite get that 🙂 {q}",
        "hi": "माफ़ कीजिए, समझ नहीं पाया 🙂 {q}",
        "hinglish": "Sorry, samjha nahi 🙂 {q}",
    },
    "kyc_start": {
        "en": "Confirmed ✅ Next, a quick KYC. I need your consent first. We use your documents only to verify your business, and keep the KYC record only as long as telecom rules require.",
        "hi": "पक्का ✅ अब छोटा सा KYC। पहले आपकी अनुमति — दस्तावेज़ सिर्फ़ बिज़नेस वेरिफ़िकेशन के लिए, और KYC रिकॉर्ड सिर्फ़ उतने समय तक जितना टेलीकॉम नियम कहते हैं।",
        "hinglish": "Confirmed ✅ Ab chhota sa KYC. Pehle aapki permission — documents sirf business verify karne ke liye, aur KYC record sirf utne time tak jitna telecom niyam kehte hain.",
    },
}

FAQ = [
    (r"(install|kab tak|kitne din|how long|when.*(start|live)|कब)", {
        "en": "Most bundles go live in {eta} days. 5G AirFiber can be up in 2 days if you're in a hurry.",
        "hi": "ज़्यादातर बंडल {eta} दिन में चालू हो जाते हैं। जल्दी हो तो 5G AirFiber 2 दिन में।",
        "hinglish": "Zyada tar bundles {eta} din mein live ho jaate hain. Jaldi ho toh 5G AirFiber 2 din mein."}),
    (r"(setup|installation (fee|charge)|one.?time)", {
        "en": "Setup fees are shown upfront in your quote — no hidden charges. Many items have zero setup.",
        "hi": "सेटअप फ़ीस कोटेशन में पहले से दिखती है — कोई छुपा चार्ज नहीं।",
        "hinglish": "Setup fee quote mein pehle se dikhti hai — koi hidden charge nahi."}),
    (r"(contract|lock|commit|cancel)", {
        "en": "Pick flexible terms or commit for 24 months to get the lowest monthly price — the quote shows both.",
        "hi": "फ्लेक्सिबल टर्म या 24 महीने का कमिटमेंट — 24 महीने पर सबसे कम दाम। कोटेशन में दोनों दिखते हैं।",
        "hinglish": "Flexible term ya 24 mahine ka commitment — 24 mahine pe sabse kam price. Quote mein dono dikhte hain."}),
    (r"(gst|tax)", {
        "en": "Prices are shown before GST, and the 18% GST is added as its own line so you always see the full amount.",
        "hi": "दाम GST से पहले दिखते हैं; 18% GST अलग लाइन में जोड़ा जाता है।",
        "hinglish": "Price GST se pehle dikhte hain; 18% GST alag line mein add hota hai."}),
    (r"(data|privacy|safe|secure|documents?)", {
        "en": "Your documents are used only to verify your business (DPDP consent) and are masked on screen. The KYC record is kept while your connection is active and for 3 years after it ends, as telecom rules require. Everything else is deleted 30 days after go-live.",
        "hi": "दस्तावेज़ सिर्फ़ वेरिफ़िकेशन के लिए (DPDP सहमति), स्क्रीन पर मास्क्ड। टेलीकॉम नियमों के अनुसार KYC रिकॉर्ड कनेक्शन चालू रहने तक और बंद होने के 3 साल बाद तक रखा जाता है; बाकी सब लाइव होने के 30 दिन बाद डिलीट।",
        "hinglish": "Documents sirf verification ke liye (DPDP consent), screen pe masked. Telecom niyam ke hisaab se KYC record connection chalu rehne tak aur band hone ke 3 saal baad tak rakha jaata hai; baaki sab live hone ke 30 din baad delete."}),
]


# The brief asks the advisor about current tools, so the last question covers setup and spend together.
Q["spend"].update({
    "en": "Last one: what do you use today (mobile hotspot, home broadband, a leased line…) and roughly how much do you pay for phone + internet each month? I'll show you what you save. 💸",
    "hi": "आख़िरी सवाल: अभी आप क्या इस्तेमाल करते हैं (मोबाइल हॉटस्पॉट, घर का ब्रॉडबैंड…) और फ़ोन + इंटरनेट पर हर महीने लगभग कितना खर्च होता है? मैं बचत दिखाऊँगा। 💸",
    "hinglish": "Last sawaal: abhi kya use karte ho (mobile hotspot, ghar ka broadband…) aur phone + internet pe mahine ka kitna kharcha hai? Main saving dikhaunga. 💸",
})

# Marathi and Tamil copy for the offline engine.
_Q_MR_TA = {
    "business_type": ("नमस्कार! 👋 मी Udyam One, तुमचा डिजिटल सल्लागार. काही मिनिटांत तुमचा व्यवसाय ऑनलाइन, कोणत्याही भेटीशिवाय.\n\nतुमचा व्यवसाय कोणता आहे?",
                      "வணக்கம்! 👋 நான் Udyam One, உங்கள் டிஜிட்டல் ஆலோசகர். சில நிமிடங்களில் உங்கள் தொழில் ஆன்லைனில், யாரும் நேரில் வர வேண்டியதில்லை.\n\nநீங்கள் என்ன தொழில் செய்கிறீர்கள்?"),
    "size": ("{type}, छान! 🙌 तुमच्यासोबत किती लोक काम करतात, आणि किती ठिकाणी (शाखा) व्यवसाय आहे?",
             "{type}, அருமை! 🙌 உங்களுடன் எத்தனை பேர் வேலை செய்கிறார்கள், எத்தனை இடங்களில் (கிளைகள்) இருக்கிறீர்கள்?"),
    "city": ("समजलं. तुम्ही कोणत्या शहरात आहात? 📍", "புரிந்தது. நீங்கள் எந்த ஊரில் இருக்கிறீர்கள்? 📍"),
    "needs": ("तुमच्या व्यवसायात काय अधिक चांगलं चालायला हवं? लागू असेल ते निवडा, किंवा तुमच्या शब्दांत सांगा.",
              "உங்கள் தொழிலில் எது சிறப்பாக வேலை செய்ய வேண்டும்? பொருந்துவதைத் தேர்ந்தெடுங்கள், அல்லது உங்கள் வார்த்தைகளில் சொல்லுங்கள்."),
    "gst": ("तुमच्याकडे GST नंबर आहे का? असल्यास टाइप करा, मी तुमची माहिती लगेच आणतो. ⚡",
            "உங்களிடம் GST எண் இருக்கிறதா? இருந்தால் டைப் செய்யுங்கள், உங்கள் விவரங்களை உடனே எடுக்கிறேன். ⚡"),
    "spend": ("शेवटचा प्रश्न: आज तुम्ही काय वापरता (मोबाइल हॉटस्पॉट, घरचं ब्रॉडबँड…) आणि फोन + इंटरनेटसाठी महिन्याला साधारण किती खर्च होतो? मी बचत दाखवतो. 💸",
              "கடைசி கேள்வி: இப்போது என்ன பயன்படுத்துகிறீர்கள் (மொபைல் ஹாட்ஸ்பாட், வீட்டு பிராட்பேண்ட்…), போன் + இணையத்துக்கு மாதம் சுமார் எவ்வளவு செலவாகிறது? எவ்வளவு சேமிக்கலாம் என்று காட்டுகிறேன். 💸"),
}
_T_MR_TA = {
    "gst_found": ("सापडलं ✅ **{name}**, GST {status}, {city} मध्ये {date} पासून नोंदणी. तुमची माहिती भरली आहे.",
                  "கிடைத்தது ✅ **{name}**, GST {status}, {date} முதல் {city}-இல் பதிவு. உங்கள் விவரங்களை நிரப்பிவிட்டேன்."),
    "gst_inactive": ("⚠️ रजिस्ट्रीमध्ये हा GSTIN **{status}** आहे. GST न लागणारी उत्पादनं सुचवतो, आणि आमचा पार्टनर तो पुन्हा सुरू करायला मदत करेल.",
                     "⚠️ பதிவேட்டில் இந்த GSTIN **{status}** என்று உள்ளது. GST தேவையில்லாத சேவைகளைப் பரிந்துரைக்கிறேன்; அதைச் சரிசெய்ய எங்கள் பார்ட்னர் உதவுவார்."),
    "gst_unknown": ("हा GSTIN रजिस्ट्रीमध्ये सापडला नाही. एकदा तपासा, किंवा त्याशिवाय पुढे चला.",
                    "இந்த GSTIN பதிவேட்டில் இல்லை. ஒருமுறை சரிபாருங்கள், அல்லது அது இல்லாமலே தொடரலாம்."),
    "gst_number": ("छान! तुमचा 15 अक्षरी GSTIN टाइप करा, मी सगळं आणतो (किंवा *skip* लिहा).",
                   "சரி! உங்கள் 15 எழுத்து GSTIN-ஐ டைப் செய்யுங்கள், மீதியை நான் எடுக்கிறேன் (அல்லது *skip*)."),
    "reco": ("{name} साठी माझी शिफारस 👇\nएक बिल, एक सपोर्ट नंबर, साधारण **{eta} दिवसांत** इन्स्टॉल.",
             "{name}-க்கு என் பரிந்துரை 👇\nஒரே பில், ஒரே சப்போர்ட் எண், சுமார் **{eta} நாட்களில்** இன்ஸ்டால்."),
    "saving": ("💰 आज तुम्ही साधारण ₹{spend:,} देता. हे ₹{new:,}/महिना (GST सह) आहे, **₹{diff:,} कमी**, एकाच बिलात.",
               "💰 இப்போது சுமார் ₹{spend:,} செலுத்துகிறீர்கள். இது ₹{new:,}/மாதம் (GST உட்பட), **₹{diff:,} குறைவு**, ஒரே பில்லில்."),
    "upgrade": ("💡 आज साधारण ₹{spend:,} खर्च होतात. महिन्याला ₹{diff:,} जास्त देऊन {extras} पण मिळेल, एकाच बिलात.",
                "💡 இப்போது சுமார் ₹{spend:,} செலவாகிறது. மாதம் ₹{diff:,} கூடுதலாக {extras} கிடைக்கும், ஒரே பில்லில்."),
    "locked": ("🔒 {names} साठी सक्रिय GST नंबर लागतो. नोंदणीसाठी मदत हवी आहे? मोफत आहे, साधारण 7 दिवस लागतात.",
               "🔒 {names}-க்கு செயலில் உள்ள GST எண் தேவை. பதிவு செய்ய உதவி வேண்டுமா? இலவசம், சுமார் 7 நாட்கள் ஆகும்."),
    "confirm_cta": ("हे पटलं? **Confirm** दाबा, मग 2 मिनिटांचं KYC: कागद नाही, भेट नाही.",
                    "பிடித்திருக்கிறதா? **Confirm** அழுத்துங்கள், பிறகு 2 நிமிட KYC: காகிதம் இல்லை, நேரில் வர வேண்டாம்."),
    "added": ("{names} जोडलं ✅ नवीन एकूण: **₹{total:,}/महिना** + GST.", "{names} சேர்த்துவிட்டேன் ✅ புதிய மொத்தம்: **₹{total:,}/மாதம்** + GST."),
    "cheaper": ("नक्की, हा **Essential** प्लॅन ₹{total:,}/महिना + GST. नंतर काहीही जोडू शकता.",
                "சரி, இதோ **Essential** திட்டம் ₹{total:,}/மாதம் + GST. பிறகு எதையும் சேர்க்கலாம்."),
    "human": ("नक्की 🙏 तुमची माहिती जवळच्या Udyam One पार्टनरला पाठवली आहे, 2 तासांत कॉल येईल. काहीही पुन्हा सांगावं लागणार नाही.",
              "நிச்சயமாக 🙏 உங்கள் விவரங்களை அருகிலுள்ள Udyam One பார்ட்னருக்கு அனுப்பிவிட்டேன், 2 மணி நேரத்தில் அழைப்பார். எதையும் மீண்டும் சொல்ல வேண்டாம்."),
    "fallback": ("माफ करा, नीट समजलं नाही 🙂 {q}", "மன்னிக்கவும், சரியாகப் புரியவில்லை 🙂 {q}"),
    "kyc_start": ("पक्कं ✅ आता छोटं KYC. आधी तुमची परवानगी: कागदपत्रं फक्त व्यवसाय पडताळणीसाठी, आणि KYC रेकॉर्ड फक्त टेलिकॉम नियमांनुसार आवश्यक तेवढाच काळ ठेवतो.",
                  "உறுதி ✅ இப்போது ஒரு சிறிய KYC. முதலில் உங்கள் அனுமதி: ஆவணங்கள் தொழில் சரிபார்ப்புக்கு மட்டும்; KYC பதிவு தொலைத்தொடர்பு விதிகள் கேட்கும் காலம் மட்டுமே வைக்கப்படும்."),
}
for _k, (_mr, _ta) in _Q_MR_TA.items():
    Q[_k].update(mr=_mr, ta=_ta)
for _k, (_mr, _ta) in _T_MR_TA.items():
    T[_k].update(mr=_mr, ta=_ta)
CHIPS["size"].update(mr=["मी + 2 लोक", "6 लोक, 1 दुकान", "15 लोक, 3 शाखा"], ta=["நான் + 2 பேர்", "6 பேர், 1 கடை", "15 பேர், 3 கிளைகள்"])
CHIPS["gst"].update(mr=["GST नाही", "हो, GST आहे"], ta=["GST இல்லை", "ஆம், GST உள்ளது"])
CHIPS["spend"].update(mr=["हॉटस्पॉट, ₹1,500", "ब्रॉडबँड, ₹4,000", "साधारण ₹10,000", "Skip"],
                      ta=["ஹாட்ஸ்பாட், ₹1,500", "பிராட்பேண்ட், ₹4,000", "சுமார் ₹10,000", "Skip"])
CHIPS["spend"].update(en=["Hotspot, about ₹1,500", "Home broadband, ₹4,000", "About ₹10,000", "Skip"],
                      hi=["हॉटस्पॉट, लगभग ₹1,500", "ब्रॉडबैंड, ₹4,000", "लगभग ₹10,000", "छोड़ें"],
                      hinglish=["Hotspot, lagbhag ₹1,500", "Home broadband, ₹4,000", "Lagbhag ₹10,000", "Skip"])
SUGGEST_CHIP = {"en": "Not sure, suggest for me", "hi": "आप ही सुझाइए", "hinglish": "Aap hi suggest karo",
                "mr": "तुम्हीच सुचवा", "ta": "நீங்களே பரிந்துரையுங்கள்"}


def tr(key: str, lang: str, **kw) -> str:
    d = T[key] if key in T else Q[key]
    s = d.get(lang) or d["en"]
    return s.format(**kw) if kw else s


def chips(slot: str, lang: str, profile: dict) -> list[str]:
    c = CHIPS.get(slot)
    if slot == "needs":
        seg = profile.get("segment") or engine.infer_segment(profile)
        order = engine.DEFAULT_NEEDS[seg] + [n for n in ["internet", "backup", "mobile", "whatsapp", "pos", "email",
                                                         "security", "cctv", "website", "wifi", "calling"]
                                             if n not in engine.DEFAULT_NEEDS[seg]]
        return [need_label(n, lang) for n in order[:8]] + [L(SUGGEST_CHIP, lang)]
    if slot == "business_type" and lang in BUSINESS_CHIPS:
        return BUSINESS_CHIPS[lang]
    if isinstance(c, dict):
        return c.get(lang) or c["en"]
    return c or []


def missing_slots(p: dict) -> list[str]:
    q = dict(p)
    out = []
    while True:
        s = next_slot(q)
        if not s or s in out:
            return out
        out.append(s)
        q[{"business_type": "business_type", "size": "employees", "city": "city", "needs": "needs_auto", "gst": "has_gst",
           "gstin": "gstin_skipped", "spend": "current_spend"}[s]] = 1


def next_slot(p: dict) -> str | None:
    if not p.get("business_type"):
        return "business_type"
    if not p.get("employees"):
        return "size"
    if not p.get("city"):
        return "city"
    if not p.get("needs") and not p.get("needs_auto"):
        return "needs"
    if p.get("has_gst") is None:
        return "gst"
    if p.get("has_gst") and not p.get("gstin") and not p.get("gstin_skipped"):
        return "gstin"
    if p.get("current_spend") is None:
        return "spend"
    return None


def apply_updates(p: dict, up: dict, lang: str) -> list[dict]:
    """Merge validated updates into profile. Returns extra bot messages (e.g. registry results)."""
    msgs = []
    for k in ["business_type", "employees", "sites", "city", "city_tier", "budget", "current_spend", "current_setup", "no_fibre", "has_gst"]:
        if k in up and up[k] is not None:
            p[k] = up[k]
    if up.get("segment_hint"):
        p["segment"] = up["segment_hint"]
        if p["segment"] == "micro" and int(p.get("sites") or 1) >= 3:
            p["segment"] = "multi"
    if p.get("employees") and not p.get("sites"):
        p["sites"] = 1 if p.get("segment") != "multi" else 3
    if up.get("needs_add"):
        p["needs"] = list(dict.fromkeys((p.get("needs") or []) + up["needs_add"]))
    g = up.get("gstin")
    if g:
        p["gstin"] = g
        reg = kyc.lookup_gstin(g)
        if reg:
            p["has_gst"] = True
            p["gst_status"] = reg["status"]
            p["gst_active"] = reg["status"] == "Active"
            p["business_name"] = reg["trade_name"]
            p["legal_name"] = reg["legal_name"]
            addr = reg["principal_place_of_business"]
            reg_city = reg["state"]
            for city, (tier, aliases) in CITIES.items():
                if any(a in addr.lower() for a in aliases):
                    reg_city = city.strip()
                    if not p.get("city"):
                        p["city"], p["city_tier"] = reg_city, tier
                    break
            msgs.append({"kind": "text", "text": tr("gst_found", lang, name=reg["trade_name"], status=reg["status"].lower(),
                                                    date=reg["registration_date"], city=reg_city)})
            if reg["status"] != "Active":
                msgs.append({"kind": "text", "text": tr("gst_inactive", lang, status=reg["status"].upper())})
        else:
            p["gst_active"] = False
            p["gstin_skipped"] = True
            msgs.append({"kind": "text", "text": tr("gst_unknown", lang)})
    if p.get("has_gst") is False:
        p["gst_active"] = False
    if p.get("business_type") and not p.get("segment"):
        p["segment"] = engine.infer_segment(p)
    if p.get("segment") in ("micro", "prof") and int(p.get("sites") or 1) >= 3:
        p["segment"] = "multi"
    return msgs


def ask(slot: str, lang: str, p: dict) -> dict:
    if slot == "gstin":
        return {"kind": "text", "text": tr("gst_number", lang), "chips": ["Skip"]}
    text = Q[slot].get(lang) or Q[slot]["en"]
    text = text.format(type=p.get("business_type", "").lower() if lang == "en" else p.get("business_type", ""))
    return {"kind": "text", "text": text, "chips": chips(slot, lang, p), "multi": slot == "needs", "slot": slot}


# Need and business choices in the owner's language (the chips are also matched back to needs).
NEED_L = {
    "hi": {"internet": "तेज़ इंटरनेट", "backup": "कभी न रुकने वाला इंटरनेट", "mobile": "स्टाफ़ के लिए बिज़नेस सिम", "whatsapp": "WhatsApp पर बिक्री",
           "sms": "SMS ऑफ़र", "email": "प्रोफ़ेशनल ईमेल", "storage": "फ़ाइलों का क्लाउड बैकअप", "website": "बिज़नेस वेबसाइट", "pos": "बिलिंग और UPI",
           "security": "वायरस से सुरक्षा", "wifi": "ग्राहकों के लिए वाई-फ़ाई", "cctv": "फ़ोन पर दिखने वाला CCTV", "calling": "बिज़नेस फ़ोन लाइन",
           "tollfree": "टोल-फ़्री नंबर", "iot": "मशीनों की निगरानी", "fleet": "गाड़ियों की ट्रैकिंग", "sdwan": "सभी ब्रांच एक नेटवर्क पर"},
    "mr": {"internet": "वेगवान इंटरनेट", "backup": "कधीही बंद न होणारं इंटरनेट", "mobile": "कर्मचाऱ्यांसाठी बिझनेस सिम", "whatsapp": "WhatsApp वर विक्री",
           "sms": "SMS ऑफर", "email": "व्यावसायिक ईमेल", "storage": "फाइल्सचा क्लाउड बॅकअप", "website": "व्यवसायाची वेबसाइट", "pos": "बिलिंग आणि UPI",
           "security": "व्हायरसपासून सुरक्षा", "wifi": "ग्राहकांसाठी वाय-फाय", "cctv": "फोनवर दिसणारा CCTV", "calling": "बिझनेस फोन लाइन",
           "tollfree": "टोल-फ्री नंबर", "iot": "मशीनवर लक्ष", "fleet": "वाहन ट्रॅकिंग", "sdwan": "सर्व शाखा एका नेटवर्कवर"},
    "ta": {"internet": "வேகமான இணையம்", "backup": "நிற்காத இணையம்", "mobile": "ஊழியர்களுக்கு பிசினஸ் சிம்", "whatsapp": "WhatsApp-இல் விற்பனை",
           "sms": "SMS சலுகைகள்", "email": "தொழில்முறை மின்னஞ்சல்", "storage": "கோப்புகளின் கிளவுட் பேக்கப்", "website": "தொழிலுக்கு இணையதளம்",
           "pos": "பில்லிங் மற்றும் UPI", "security": "வைரஸ் பாதுகாப்பு", "wifi": "வாடிக்கையாளர்களுக்கு Wi-Fi", "cctv": "போனில் பார்க்கும் CCTV",
           "calling": "பிசினஸ் போன் லைன்", "tollfree": "டோல்-ஃப்ரீ எண்", "iot": "இயந்திர கண்காணிப்பு", "fleet": "வாகன கண்காணிப்பு", "sdwan": "எல்லா கிளைகளும் ஒரே நெட்வொர்க்கில்"},
}
BUSINESS_CHIPS = {"hi": ["किराना दुकान", "क्लिनिक", "सैलून", "रेस्टोरेंट", "सीए फ़र्म", "फैक्ट्री"],
                  "mr": ["किराणा दुकान", "दवाखाना", "सलून", "हॉटेल", "सीए ऑफिस", "कारखाना"],
                  "ta": ["மளிகை கடை", "கிளினிக்", "சலூன்", "உணவகம்", "ஆடிட்டர் அலுவலகம்", "தொழிற்சாலை"]}


def need_label(n: str, lang: str) -> str:
    return NEED_L.get(lang, {}).get(n) or engine.NEED_LABELS[n]


def label_to_need(text: str) -> list[str]:
    out = []
    t = text.lower()
    for k, lab in engine.NEED_LABELS.items():
        if lab.lower() in t or any(d.get(k) and d[k].lower() in t for d in NEED_L.values()):
            out.append(k)
    return out


# ---------------------------------------------------------------- language model (any provider, see ai.py)
def llm_available() -> bool:
    return ai.available()


def _catalogue_brief() -> str:
    return "\n".join(f"{c['id']} {c['name']} ({c['category']}): ₹{c['price_min']}-{c['price_max']}/{c['unit'].replace('per ', '')}/mo, "
                     f"setup ₹{c['setup']}, min {c['min_contract']}mo, installs in {c['install_days']}d"
                     f"{', needs GSTIN' if c['requires_gstin'] else ''}" for c in engine.CATALOGUE.values())


SYSTEM = """You are Udyam One, a warm, concise onboarding advisor for small Indian businesses (kirana shops, clinics,
CA firms, salons, restaurant chains, small factories) buying business connectivity and digital services from Accel Business.
You chat on WhatsApp and web. Reply in the SAME language and script the customer uses (English, Hindi in Devanagari,
Hinglish in Roman script, Marathi, Tamil, etc). Keep replies short: max 3 short sentences, WhatsApp style, at most one emoji.

Your job each turn:
1. Extract facts the customer stated into `updates` (only what they actually said; never guess).
2. Write `reply`: acknowledge briefly, answer any question they asked using ONLY the catalogue facts given, then ask
   about the FIRST topic in MISSING that your updates do not already fill, in natural words. Topics: business_type
   (what business), size (how many staff AND how many locations), city, needs (what should work better: internet,
   billing, CCTV...), gst (do they have a GST number; if yes ask them to type it), gstin (ask for the 15-character
   GSTIN or let them skip), spend (what they use today, e.g. mobile hotspot or home broadband, AND roughly how much
   they pay for phone+internet monthly).
   Reply in CONTEXT.preferred_language unless the customer clearly switched language.
   Set `asked` to the topic you asked about, or "none". If MISSING is empty or phase is not "discover", ask nothing new.
3. Never invent prices, discounts, products, delivery promises or verification results. Never say a document is verified.

Allowed `updates` keys: business_type (short string, e.g. "Dental clinic"), segment (micro|prof|multi|mfg),
employees (int), sites (int), city (string, English name), city_tier (1 for metros: Delhi, Mumbai, Bengaluru, Chennai,
Kolkata, Hyderabad, Pune, Ahmedabad; else 2), needs (list from: internet, backup, mobile, whatsapp, sms, email, storage,
website, pos, security, wifi, cctv, calling, tollfree, iot, fleet, sdwan), has_gst (bool), gstin (15 chars),
current_spend (int INR per month on phone+internet now), current_setup (one of: Mobile hotspot, Home broadband,
Business broadband, Leased line, No internet yet), budget (int INR per month), no_fibre (bool).
`flags`: human (wants a person), confirm (agrees to proceed/buy), cheaper (wants lower price), suggest (wants you to pick needs), restart.
Return JSON only: {"updates":{...},"flags":{...},"reply":"...","asked":"<topic|none>","language":"en|hi|hinglish|mr|ta|te|kn|bn|gu|pa|ml"}"""


REDACT = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"),
    (re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)"), "[phone]"),
    (re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", re.I), "[GSTIN]"),
    (re.compile(r"\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b", re.I), "[Udyam no.]"),
    (re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)"), "[ID no.]"),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN]"),
]


def redact(text: str) -> str:
    """Identifiers never leave the server: GSTINs are looked up locally, the model only sees a placeholder."""
    for rx, rep in REDACT:
        text = rx.sub(rep, text)
    return text


LANG_NAMES = {"en": "English", "hi": "Hindi (Devanagari)", "hinglish": "Hinglish (Roman script)", "mr": "Marathi (Devanagari)",
              "ta": "Tamil (Tamil script)"}


def llm_turn(profile: dict, history: list[dict], text: str, missing: list[str], phase: str, lang: str) -> tuple[dict | None, int]:
    """One advisor turn through Udyam AI. Returns (parsed JSON or None, latency ms). Identifiers are redacted first."""
    ctx = {
        "phase": phase, "MISSING": missing, "preferred_language": LANG_NAMES.get(lang, lang),
        "known_profile": {k: profile.get(k) for k in ["business_type", "employees", "sites", "city", "needs", "has_gst",
                                                       "business_name", "current_spend", "current_setup", "budget"]},
    }
    hist = [("user" if m["role"] == "user" else "assistant", redact(m["text"][:600])) for m in history[-10:] if m.get("text")]
    return ai.chat_json(SYSTEM + "\n\nCATALOGUE:\n" + _catalogue_brief(), hist,
                        f"CONTEXT: {json.dumps(ctx, ensure_ascii=False)}\n\nCUSTOMER: {redact(text)}")


def clean_llm_updates(u: dict) -> dict:
    out: dict = {}
    if not isinstance(u, dict):
        return out
    if isinstance(u.get("business_type"), str) and len(u["business_type"]) < 60:
        out["business_type"] = u["business_type"].strip()
        for keys, canon, seg in BUSINESS:
            if any(k in out["business_type"].lower() for k in keys):
                out["segment_hint"] = seg
                break
    if u.get("segment") in engine.SEGMENTS:
        out["segment_hint"] = u["segment"]
    for k, hi in [("employees", 5000), ("sites", 500), ("current_spend", 10_000_000), ("budget", 10_000_000)]:
        v = u.get(k)
        if isinstance(v, (int, float)) and 0 <= v <= hi:
            out[k] = int(v)
    if isinstance(u.get("city"), str) and len(u["city"]) < 40:
        out["city"] = u["city"].strip()
        out["city_tier"] = 1 if u.get("city_tier") == 1 else 2
        for city, (tier, aliases) in CITIES.items():
            if out["city"].lower() in aliases or out["city"].lower() == city.lower():
                out["city"], out["city_tier"] = city.strip(), tier
    if isinstance(u.get("needs"), list):
        out["needs_add"] = [n for n in u["needs"] if n in engine.NEED_LABELS]
    if isinstance(u.get("has_gst"), bool):
        out["has_gst"] = u["has_gst"]
    if isinstance(u.get("gstin"), str) and re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", u["gstin"].upper()):
        out["gstin"] = u["gstin"].upper()
    if isinstance(u.get("no_fibre"), bool):
        out["no_fibre"] = u["no_fibre"]
    if u.get("current_setup") in ("Mobile hotspot", "Home broadband", "Business broadband", "Leased line", "No internet yet"):
        out["current_setup"] = u["current_setup"]
    return out
