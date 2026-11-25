"""Rules-first resume reading: pull the easy, well-structured fields with regular expressions - no AI call.

Used in two ways by ``resume_processing``:
  * as a gap-filler: any field the AI left empty is filled from here (never overwrites an AI value);
  * as a fallback: when the AI is rate-limited a candidate is still created from these fields
    (it lands in "review" because the profile is thin) instead of the import failing.
"""
from __future__ import annotations

import re
from typing import Optional

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")
_BAD_EMAIL = ("noreply", "no-reply", "donotreply", "example.com@")
_PHONE = re.compile(r"(?<![\w/])(\+?\d[\d\s().\-]{8,17}\d)(?![\w/])")
_LINKEDIN = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+", re.I)
_NOTICE = re.compile(
    r"notice(?:\s*period)?\s*(?:is|of)?\s*[:\-=]?\s*(?:serving\s*)?(immediate(?:ly)?|\d+(?:\.\d+)?\s*(?:days?|weeks?|months?))", re.I)
_IMMEDIATE = re.compile(r"\b(?:immediate(?:ly)?\s+(?:joiner|joining|available)|available\s+(?:to join\s+)?immediately|join\s+immediately)\b", re.I)
_MONEY = r"(\d+(?:\.\d+)?)\s*(lpa|lacs?|lakhs?|l\b|k\b|cr|crores?)?"
_ECTC = re.compile(r"(?:expected\s*(?:ctc|salary|package|compensation)|e\.?ctc)\s*(?:is|of)?\s*[:\-=]?\s*(?:rs\.?|inr|₹|\$)?\s*" + _MONEY, re.I)
_CTC = re.compile(r"(?:current\s*(?:ctc|salary|package|compensation)|present\s*ctc|(?<![a-z.])c\.?ctc|(?<![a-z.e])ctc)\s*(?:is|of)?\s*[:\-=]?\s*(?:rs\.?|inr|₹|\$)?\s*" + _MONEY, re.I)
_TOTAL_EXP = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:total\s*|overall\s*|professional\s*|relevant\s*)?(?:it\s*)?exp(?:erience)?\b", re.I)
_TOTAL_EXP_ALT = re.compile(r"(?:total\s*of\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s*(?:in|of)\s*(?:it|software|total))|(?:total|overall)\s*(?:it\s*)?experience\s*(?:of|is|:|-)?\s*(\d+(?:\.\d+)?)", re.I)

#: Pega certification codes (matched as whole words).
_CERTS = ("CSA", "CSSA", "CLSA", "CPDC", "CPBA", "CSBA", "PCSA", "PCSSA", "PCLSA", "PCDC", "PCBA", "PCSBA", "CPDS", "CPSA", "CPCS")
_CERT_RE = re.compile(r"\b(" + "|".join(sorted(_CERTS, key=len, reverse=True)) + r")\b")

#: Skill keywords (label, regex). Matched case-insensitively as whole words.
_SKILLS = (
    ("Pega PRPC", r"pega\s*prpc|\bprpc\b"), ("Pega CDH", r"pega\s*cdh|customer decision hub|\bcdh\b"),
    ("Pega Constellation", r"constellation"), ("Pega", r"\bpega\b"), ("Java", r"\bjava\b"),
    ("SQL", r"\bsql\b"), ("REST", r"\brest(?:ful)?\b"), ("SOAP", r"\bsoap\b"), ("Kafka", r"\bkafka\b"),
    ("Python", r"\bpython\b"), ("JavaScript", r"\bjavascript\b"), ("Spring Boot", r"spring\s*boot"),
    ("Microservices", r"microservices?"), ("AWS", r"\baws\b"), ("Azure", r"\bazure\b"), ("Docker", r"\bdocker\b"),
    ("Agile", r"\bagile\b"), ("Postman", r"\bpostman\b"), ("DX API", r"\bdx\s*api\b"),
)

_CITIES = {
    "hyderabad": "Hyderabad", "bangalore": "Bangalore", "bengaluru": "Bangalore", "chennai": "Chennai", "pune": "Pune",
    "mumbai": "Mumbai", "delhi": "Delhi", "new delhi": "Delhi", "noida": "Noida", "gurgaon": "Gurgaon", "gurugram": "Gurgaon",
    "kolkata": "Kolkata", "coimbatore": "Coimbatore", "kochi": "Kochi", "ahmedabad": "Ahmedabad", "trivandrum": "Trivandrum",
    "san jose": "San Jose", "dallas": "Dallas", "new york": "New York", "london": "London",
}
_LOCATION_LABEL = re.compile(r"(?:current\s*location|curr\.?\s*loc(?:ation)?|location|city|based\s*in|residing\s*in)\s*[:\-=]\s*([^\n|,;]{2,40})", re.I)

_NOT_NAME_WORDS = ("resume", "curriculum", "vitae", "profile", "summary", "objective", "contact", "email", "phone", "mobile",
                   "address", "developer", "engineer", "architect", "consultant", "analyst", "manager", "lead", "senior")


def _to_lpa(amount: str, unit: Optional[str]) -> str:
    unit = (unit or "").lower()
    if unit in ("cr", "crore", "crores"):
        return f"{float(amount) * 100:g} LPA"
    if unit in ("lpa", "lac", "lacs", "lakh", "lakhs", "l"):
        return f"{amount} LPA"
    return amount  # bare number or monthly "k": keep as written, do not guess a unit


def _phone(text: str) -> str:
    for match in _PHONE.finditer(text):
        raw = match.group(1)
        digits = re.sub(r"\D", "", raw)
        if not 10 <= len(digits) <= 13:
            continue
        if re.fullmatch(r"(?:19|20)\d{2}\D{1,3}(?:19|20)\d{2}", raw.strip()):
            continue  # a year range, not a phone number
        return ("+" if raw.strip().startswith("+") else "") + digits
    return ""


def _name_guess(text: str) -> str:
    for line in text.strip().splitlines()[:6]:
        line = line.strip()
        words = line.split()
        if not 2 <= len(words) <= 4 or any(ch.isdigit() or ch in "@:/|" for ch in line):
            continue
        if any(w.lower().strip(".,") in _NOT_NAME_WORDS for w in words):
            continue
        if all(re.fullmatch(r"[A-Za-z][A-Za-z.'\-]*", w) for w in words):
            return line.title() if line.isupper() else line
    return ""


def extract_by_rules(text: str) -> dict:
    """Return only the fields that were confidently found; absent keys mean "not found"."""
    text = text or ""
    out: dict = {}

    for match in _EMAIL.finditer(text):
        if not any(bad in match.group(0).lower() for bad in _BAD_EMAIL):
            out["email"] = match.group(0).rstrip(".")
            break
    phone = _phone(text)
    if phone:
        out["phone"] = phone
    linkedin = _LINKEDIN.search(text)
    if linkedin:
        url = linkedin.group(0)
        out["linkedin"] = url if url.lower().startswith("http") else "https://www." + re.sub(r"^[a-z]{2,3}\.", "", url, flags=re.I)

    notice = _NOTICE.search(text)
    if notice:
        value = notice.group(1).lower()
        if value.startswith("immediate"):
            out["notice_period"] = 0
        else:
            number = float(re.search(r"\d+(?:\.\d+)?", value).group())
            days = number * (30 if "month" in value else 7 if "week" in value else 1)
            out["notice_period"] = int(round(days))
    elif _IMMEDIATE.search(text):
        out["notice_period"] = 0

    expected = _ECTC.search(text)
    if expected:
        out["expected_ctc"] = _to_lpa(expected.group(1), expected.group(2))
    current = _CTC.search(re.sub(_ECTC, " ", text))
    if current:
        out["ctc"] = _to_lpa(current.group(1), current.group(2))

    total = _TOTAL_EXP.search(text) or _TOTAL_EXP_ALT.search(text)
    if total:
        out["total_experience"] = float(next(g for g in total.groups() if g))
    # Pega / CDH years are deliberately NOT read by rules: a number near the word "Pega" is too often
    # the total experience. A wrong value is worse than a blank one, so those are left to the AI.

    certs = []
    for code in _CERT_RE.findall(text):
        if code not in certs:
            certs.append(code)
    if certs:
        out["certifications"] = ", ".join(certs)

    skills = [label for label, rx in _SKILLS if re.search(rx, text, re.I)]
    if skills:
        out["skills"] = ", ".join(skills)

    location = ""
    label = _LOCATION_LABEL.search(text)
    if label:
        candidate = label.group(1).strip()
        key = re.sub(r"[^a-z ]", "", candidate.lower()).strip()
        location = _CITIES.get(key) or (candidate if len(key) >= 3 else "")
    if not location:
        head = text[:900].lower()
        for key, pretty in _CITIES.items():
            if re.search(r"\b" + re.escape(key) + r"\b", head):
                location = pretty
                break
    if location:
        out["current_location"] = location

    name = _name_guess(text)
    if name:
        out["full_name"] = name
    return out


def _empty(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def fill_gaps(data: dict, found: dict) -> list[str]:
    """Copy rule-found values into ``data`` only where it is empty. Returns the keys that were filled."""
    filled = []
    for key, value in found.items():
        if _empty(data.get(key)):
            data[key] = value
            filled.append(key)
    return filled
