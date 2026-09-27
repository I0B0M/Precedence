"""What a briefing says, and the check every line passes before it is spoken.

Pure functions, no I/O. A Line is one spoken sentence. It carries the raw numbers it was built
from (`evidence`) and where they came from (`cites`). check() rejects a line whose printed numbers
aren't in its evidence, so a wrong field or a slipped rounding can never be spoken as fact.
"""

import re
from dataclasses import dataclass, replace
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

MAX_WORDS = 28  # one breath: the narration tab speaks each line as one caption
MAX_PRO_WORDS = 40  # Pro's caption shows the working, so it may run longer; it is read, not spoken
TONES = ("watch", "calm", "note")
CITE = re.compile(r"^(signal:[a-z_]+|market:rate_jump|filing:[0-9A-Za-z-]+|price:\d{4}-\d{2}-\d{2}"
                  r"|rate:\d{4}-\d{2}-\d{2}|risk:[a-z_]+|fact:[a-z_]+|portfolio:[a-z_]+|company:[A-Z0-9.]+)$")

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@dataclass(frozen=True)
class Line:
    id: str
    tone: str  # watch | calm | note
    text: str
    evidence: tuple[float, ...]  # every number the text may print, as raw values
    cites: tuple[str, ...]
    ticker: str | None = None
    title: str | None = None  # a short label for the caption chip, e.g. "Amazon · Heads up"
    link: str | None = None  # the in-app page that shows the working
    pro: str | None = None  # Pro's caption: the same point with the working (counts, ranges, p)
    pro_evidence: tuple[float, ...] = ()  # the numbers only Pro prints; Pro may also print `evidence`


def with_pro(line: "Line | None", pro: str, *evidence: float) -> "Line | None":
    """The line with Pro's caption; every number `pro` prints must be in `evidence` or the line's own."""
    return None if line is None else replace(line, pro=pro, pro_evidence=tuple(evidence))


@dataclass(frozen=True)
class Point:
    """One thing an expert wants said: a short run of lines the gate keeps or drops as a unit."""
    key: str
    expert: str
    salience: int  # 0-100; the gate speaks the highest first
    lines: tuple[Line, ...]


# ---------- words ----------

def day_words(iso: str, as_of: str | None = None, weekday: bool = False) -> str:
    """ "2026-09-22" -> "September 22"; the year only when it isn't as_of's year."""
    d = date.fromisoformat(iso[:10])
    out = f"{MONTHS[d.month - 1]} {d.day}"
    if as_of is not None and date.fromisoformat(as_of[:10]).year != d.year:
        out += f", {d.year}"
    return f"{WEEKDAYS[d.weekday()]}, {out}" if weekday else out


def half_up(x: float, places: int) -> Decimal:
    """Round half up, the way the pages do: $4,746.50 is $4,747. Python's round() and format() go to the even
    number instead ($4,746). Starts from the float's shortest decimal form, so 4746.5 is exactly .50."""
    return Decimal(repr(x)).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def money(x: float) -> str:
    """Dollars without a sign (the sentence says gained or lost): $1,263, $5.0 billion."""
    a = abs(x)
    for scale, word in ((1e12, "trillion"), (1e9, "billion"), (1e6, "million")):
        if a >= scale:
            return f"${half_up(a / scale, 1)} {word}"
    return f"${half_up(a, 2):,}" if a < 1000 and a != int(a) else f"${half_up(a, 0):,}"


def pct(x: float, places: int = 0) -> str:
    """A fraction as a percent without a sign: 0.256 -> "26%"."""
    return f"{half_up(abs(x) * 100, places)}%"


def up_down(x: float) -> str:
    return "up" if x >= 0 else "down"


def speakable(text: str) -> str:
    """The caption as a speech engine should say it."""
    return text.replace("S&P", "S and P").replace(" vs ", " versus ")


# ---------- the check ----------

# Numbers that are names, not claims: dates, "10-year", form types, "S&P 500".
_NOT_CLAIMS = [
    re.compile(r"\b(?:" + "|".join(MONTHS) + r") \d{1,2}\b(?:, \d{4})?"),  # "April 3, 2025"; "August 2024" is a year
    re.compile(r"\b(?:19|20)\d{2}\b"),
    re.compile(r"\b\d+-(?:year|K|Q)(?:/A)?\b"),
    re.compile(r"\bForm \d\b"),
    re.compile(r"S&P 500"),
    re.compile(r"\bDGS10\b"),  # FRED's 10-year Treasury series
]
# A number glued to letters is part of a name, not a claim: "BRD500", "DGS10".
_NUMBER = re.compile(r"(?<![A-Za-z0-9])(\$?)(\d[\d,]*(?:\.\d+)?)(%| (?:million|billion|trillion)\b)?")
_SCALE = {" million": 1e6, " billion": 1e9, " trillion": 1e12}


def claims(text: str, names: tuple[str, ...] = ()) -> list[str]:
    """The numbers a sentence states, as printed. `names` are the companies and funds it may name,
    whose digits aren't claims ("Broad 500 Index Fund", "3M")."""
    for name in sorted(names, key=len, reverse=True):
        text = text.replace(name, " ")
    for pattern in _NOT_CLAIMS:
        text = pattern.sub(" ", text)
    return [m.group(0) for m in _NUMBER.finditer(text)]


def grounded(token: str, evidence: tuple[float, ...]) -> bool:
    """A printed number is grounded when some evidence value prints the same way: as itself, as a
    percent of a fraction, or scaled to millions/billions, rounded to the places the text shows."""
    m = _NUMBER.fullmatch(token)
    if not m:
        return False
    digits = m.group(2).replace(",", "")
    places = len(digits.partition(".")[2])
    scale = _SCALE.get(m.group(3) or "", 1.0)
    target = Decimal(digits)
    for e in evidence:
        for c in (abs(e), abs(e) * 100):
            if half_up(c / scale, places) == target:  # the same rounding money() and pct() print with
                return True
    return False


def sentence_ends(text: str) -> int:
    """Full stops that end a sentence: not a decimal point, not a middle initial ("Timothy S. Teter")."""
    return sum(1 for m in re.finditer(r"[.!?](?=\s|$)", text)
               if not re.search(r"(?:^|\s)[A-Z]$", text[:m.start()]))


def check(line: Line, names: tuple[str, ...] = ()) -> list[str]:
    """Everything wrong with a line; empty when it may be spoken."""
    problems = []
    words = len(line.text.split())
    if words > MAX_WORDS:
        problems.append(f"{words} words, over {MAX_WORDS}")
    if sentence_ends(line.text) != 1 or not line.text.rstrip().endswith((".", "!", "?")):
        problems.append("not exactly one sentence")
    if re.search(r"[*_#`\[\]]", line.text):
        problems.append("markdown in the text")
    if line.tone not in TONES:
        problems.append(f"unknown tone {line.tone}")
    if not line.cites:
        problems.append("cites nothing")
    problems += [f"bad cite {c}" for c in line.cites if not CITE.match(c)]
    problems += [f"{t} is not in its evidence" for t in claims(line.text, names) if not grounded(t, line.evidence)]
    if line.pro is not None:
        pro_words = len(line.pro.split())
        if pro_words > MAX_PRO_WORDS:
            problems.append(f"pro: {pro_words} words, over {MAX_PRO_WORDS}")
        if sentence_ends(line.pro) != 1 or not line.pro.rstrip().endswith((".", "!", "?")):
            problems.append("pro: not exactly one sentence")
        known = line.evidence + line.pro_evidence
        problems += [f"pro: {t} is not in its evidence" for t in claims(line.pro, names) if not grounded(t, known)]
    return problems
