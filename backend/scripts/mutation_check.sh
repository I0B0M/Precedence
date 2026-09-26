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
mut "measure from close not open"      "bars[last].close / bars[i].open - 1" "bars[last].close / bars[i].close - 1"
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
cmp -s "$BAK" "$F" && echo "engine.py restored, identical to original"
rm "$BAK" "$OUT"
