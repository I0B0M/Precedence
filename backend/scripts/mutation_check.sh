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
mut "normal days include windows"      "if touched[k + h] == touched[k]:"    "if True:"
mut "normal days only skip window starts" "if touched[k + h] == touched[k]:"  "if not in_window[k]:"
mut "skipped event never firing"       "            if i + h - 1 >= len(bars):
                firing = ev
            continue"                  "            continue"
mut "WATCH ignores the label"          'r.firing and r.label == STRONG'      'r.firing'
mut "held up if either half holds"     "        beats = all(h.hit_rate"          "        beats = any(h.hit_rate"
mut "hold-out ignores the case count"  "if any(h.n < MIN_CASES for h in halves):" "if False:"
mut "binomial tail leaves out k"       "for i in range(k, n + 1))"            "for i in range(k + 1, n + 1))"
mut "BH without the step-up"           "keep[i] = rank <= cutoff"             "keep[i] = pvalues[i] <= rank / m * q"
mut "BH ignores the rank"              "if pvalues[i] <= rank / m * q]"       "if pvalues[i] <= q]"
mut "hold-out never runs"                 "if r.label == STRONG else r"            "if False else r"
mut "rate jump not vs market"          "5, vs_market=True)"                  "5)"
mut "case hit ignores the market"      "own(i, last), hit(i, last)"          "own(i, last), own(i, last) < 0"
mut "normal days ignore the market"    "normal_hits += hit(k, k + h - 1)"    "normal_hits += own(k, k + h - 1) < 0"
mut "market matched by position"       "mkt = [by_day[b.day] for b in bars]" "mkt = sorted(market, key=lambda b: b.day)"
mut "no market: silently absolute"     "        if not market:
            raise"                     "        if False:
            raise"
mut "hold-out drops the market"        "e.known_at < cut], market)"          "e.known_at < cut])"
mut "hold-out names no excluded case"  "tuple(c for c in cases if c.known_at not in held))" "())"
mut "hold-out split day off by one"    "Holdout(first, second, bars[mid].day," "Holdout(first, second, bars[mid - 1].day,"
cmp -s "$BAK" "$F" && echo "engine.py restored, identical to original"
rm "$BAK" "$OUT"
