#!/bin/bash
# Mutation check for the signal engine: break one rule at a time, expect a red test, restore.
# Run after any change to stone/signals/engine.py. Every line must say "killed".
cd "$(dirname "$0")/.."
F=stone/signals/engine.py
BAK=$(mktemp); OUT=$(mktemp)
cp "$F" "$BAK"
mut() {
  local desc="$1" from="$2" to="$3"
  python3 - "$F" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1:]
s = open(p).read()
assert s.count(a) >= 1, f"pattern not found: {a}"
open(p, "w").write(s.replace(a, b, 1))
PY
  if uv run pytest -q tests/test_engine.py >"$OUT" 2>&1; then
    echo "SURVIVED (bad): $desc"
  else
    echo "killed: $desc  -> $(grep -c FAILED "$OUT") test(s) red"
  fi
  cp "$BAK" "$F"
}
mut "WEAK cutoff 10 -> 9"              "MIN_CASES = 10"                      "MIN_CASES = 9"
mut "STRONG uses >= not >"             "low > normal_rate"                   "low >= normal_rate"
mut "90% range -> 95%"                 "Z90 = 1.6448536269514722"            "Z90 = 1.96"
mut "enter AT the open, not after"     "bisect.bisect_right(opens, known_at)" "bisect.bisect_left(opens, known_at)"
mut "measure from close not open"      "return bars[b].close / bars[a].open - 1" "return bars[b].close / bars[a].close - 1"
mut "gap needs > 5% not >= 5%"         "if drop <= -threshold"               "if drop < -threshold"
mut "no float rounding on rate jump"   "change = round(v - obs[j][1], 4)"    "change = v - obs[j][1]"
mut "rate known same day"              "datetime.combine(next_weekday(obs_day)" "datetime.combine(obs_day"
mut "cluster needs 2 filings not 3"    "min_filings: int = 3"                "min_filings: int = 2"
mut "overlapping events both count"    "if i < busy_until:"                  "if False:"
mut "normal days include windows"      "if touched[k + h] == touched[k]]"    "if True]"
mut "normal days only skip window starts" "if touched[k + h] == touched[k]]"  "if not inside[k]]"
mut "skipped event never firing"       "            if i + h - 1 >= len(bars):
                firing = ev
            continue"                  "            continue"
mut "WATCH ignores the label"          'r.firing and r.label == STRONG'      'r.firing'
mut "held up if either half holds"     "        beats = all(h.hit_rate"          "        beats = any(h.hit_rate"
mut "hold-out ignores the case count"  "if any(h.n < MIN_CASES for h in halves):" "if False:"
mut "binomial tail leaves out k"       "for i in range(k, n + 1))"            "for i in range(k + 1, n + 1))"
mut "BH without the step-up"           "keep[i] = rank <= cutoff"             "keep[i] = pvalues[i] <= rank / m * q"
mut "BH ignores the rank"              "if pvalues[i] <= rank / m * q]"       "if pvalues[i] <= q]"
mut "normal days as independent periods" "return (len(starts) + runs * (h - 1)) / h" "return len(starts)"
mut "runs of normal days never counted" "runs = sum(1 for j, k in enumerate(starts) if j == 0 or starts[j - 1] != k - 1)" "runs = 0"
mut "strict test: normal rate exact"   "d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)" "d - (p1 - l1)"
mut "strict p ignores which side"      "Strict(normal_sf(z) if d > 0 else 1 - normal_sf(z)" "Strict(normal_sf(z)"
mut "hold-out never runs"                 "if r.label == STRONG else r"            "if False else r"
mut "rate jump not vs market"          "5, vs_market=True)"                  "5)"
mut "case hit ignores the market"      "own(i, last), hit(i, last)"          "own(i, last), own(i, last) < 0"
mut "normal days ignore the market"    "sum(hit(k, k + h - 1) for k in starts)" "sum(own(k, k + h - 1) < 0 for k in starts)"
mut "market matched by position"       "mkt = [by_day[b.day] for b in bars]" "mkt = sorted(market, key=lambda b: b.day)"
mut "no market: silently absolute"     "        if not market:
            raise"                     "        if False:
            raise"
mut "hold-out drops the market"        "e.known_at < cut], market)"          "e.known_at < cut])"
mut "hold-out names no excluded case"  "tuple(c for c in cases if c.known_at not in held))" "())"
mut "hold-out split day off by one"    "Holdout(first, second, bars[mid].day," "Holdout(first, second, bars[mid - 1].day,"
cmp -s "$BAK" "$F" && echo "engine.py restored, identical to original"

# `strict` rebuilt from saved fixtures (stone/api/views.py), checked by the API tests
V=stone/api/views.py
cp "$V" "$BAK"
mutv() {
  local desc="$1" from="$2" to="$3"
  python3 - "$V" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1:]
s = open(p).read()
assert s.count(a) >= 1, f"pattern not found: {a}"
open(p, "w").write(s.replace(a, b, 1))
PY
  if uv run pytest -q tests/test_api.py -k "strict or rebuild or fixture" >"$OUT" 2>&1; then
    echo "SURVIVED (bad): $desc"
  else
    echo "killed: $desc  -> $(grep -c FAILED "$OUT") test(s) red"
  fi
  cp "$BAK" "$V"
}
mutv "rebuild ignores the open window"   "open_starts += list(range(max(busy_until, last - h + 1, 0), min(shown, last - 1) + 1))" "open_starts += []"
mutv "rebuild tries only the event shown" "list(range(max(busy_until, last - h + 1, 0), min(shown, last - 1) + 1))" "([shown] if shown < last else [])"
mutv "rebuild skips the normal-day count" 'if len(starts) == signal["normal_n"]:' "if True:"
mutv "rebuild counts N / h periods"      "periods.add(engine.periods_spanned(starts, h))" "periods.add(len(starts) / h)"
cmp -s "$BAK" "$V" && echo "views.py restored, identical to original"

# The briefing (stone/briefing): the number check, the gate and the templates, checked by test_briefing.py
mutb() {
  local file="$1" desc="$2" from="$3" to="$4"
  cp "$file" "$BAK"
  python3 - "$file" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1:]
s = open(p).read()
assert s.count(a) >= 1, f"pattern not found: {a}"
open(p, "w").write(s.replace(a, b, 1))
PY
  if uv run pytest -q tests/test_briefing.py >"$OUT" 2>&1; then
    echo "SURVIVED (bad): $desc"
  else
    echo "killed: $desc  -> $(grep -c FAILED "$OUT") test(s) red"
  fi
  cp "$BAK" "$file"
}
L=stone/briefing/lines.py; X=stone/briefing/experts.py; P=stone/briefing/panel.py
mutb $L "check never looks at numbers"       'if not grounded(t, line.evidence)]'         'if False]'
mutb $L "rounding ignores the places shown"  'if half_up(c / scale, places) == target:'   'if round(c / scale) == round(float(digits)):'
mutb $L "percent of a fraction not allowed"  'for c in (abs(e), abs(e) * 100):'           'for c in (abs(e),):'
mutb $L "millions/billions not scaled"       'scale = _SCALE.get(m.group(3) or "", 1.0)'  'scale = 1.0'
mutb $L "no word limit"                      'if words > MAX_WORDS:'                      'if False:'
mutb $L "initials end a sentence"            'if not re.search(r"(?:^|\s)[A-Z]$", text[:m.start()]))' ')'
mutb $L "dates count as claims"              're.compile(r"\b(?:19|20)\d{2}\b"),'         ''
mutb $L "company names count as claims"      'text = text.replace(name, " ")'            'pass'
mutb $P "gate keeps a failing point"         'if problems:'                               'if False:'
mutb $P "gate has no per-expert cap"         'elif per.get(p.expert, 0) >= per_expert:'   'elif False:'
mutb $P "gate speaks lowest first"           'sorted(points, key=lambda p: -p.salience)'  'sorted(points, key=lambda p: p.salience)'
mutb $X "held_up said without a verdict"     '(signal.get("holdout") or {}).get("verdict")' '("held up" if signal.get("holdout") else None)'
mutb $X "correction verdict flipped"         'corr, good = CORRECTION_WORDS[fdr], fdr'    'corr, good = CORRECTION_WORDS[not fdr], fdr'
mutb $X "market-relative said as lower"      'if signal.get("vs_market")'                 'if False'
mutb $X "filings older than a week"          'end - timedelta(days=FILINGS_DAYS) < date.fromisoformat(filed) <= end' 'date.fromisoformat(filed) <= end'
mutb $X "Form 4s read as filings"            'form.startswith("4") or '                   ''
mutb $L "Pro captions never checked"         'if line.pro is not None:'                   'if False:'
mutb $X "the headline loses its Pro caption" 'replace(event_line(signal, co, "watch"), title=title)' 'replace(event_line(signal, co, "watch"), title=title, pro=None)'
for f in $L $X $P; do git diff --quiet -- "$f" && echo "$f restored, identical to original"; done
rm "$BAK" "$OUT"
