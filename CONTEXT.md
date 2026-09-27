# Stone

Stone starts from what an investor owns and tests whether a kind of news has ever mattered for that holding before it asks for their attention.

## Language

### Testing a signal

**Holding**:
A stock or fund the investor owns, with a number of shares.
_Avoid_: position (except for "biggest real position", which counts fund slices), asset

**Signal**:
A kind of event that could matter for a holding: an insider selling cluster, a rate jump, or a gap down.
_Avoid_: alert, indicator, trigger

**Case**:
One past occurrence of a signal, measured from the next market open after the public could know it.
_Avoid_: event (when counted), sample, trade

**Hit**:
A case where the holding ended lower, or did worse than the market, for a signal judged against the market.
_Avoid_: win, success

**Normal days**:
Start days whose whole horizon touches no case window; their hit rate is what the signal is compared with.
_Avoid_: baseline days, control

**Label**:
The verdict on a signal for one holding: STRONG (the range's low end beats the normal rate), NOT PROVEN, WEAK (under 10 cases) or NO DATA (the source isn't loaded, so nothing was tested).
_Avoid_: score, rating, grade

**Firing**:
A signal whose latest case is happening now, with its window still open.
_Avoid_: active, live, triggered

**State**:
WATCH when a STRONG signal is firing for the holding, otherwise CALM.
_Avoid_: status, alert level

**Hold-out**:
The same test run on each half of the history; its verdict is "held up", "did not hold" or "too few cases to check" (10+ cases in each half).
_Avoid_: backtest, validation

**Borderline**:
A STRONG label that the stricter test does not pass, because the normal days' horizons overlap into few separate periods. It never changes the label.
_Avoid_: weak (that's a label), uncertain

### The briefing

**Briefing**:
The ordered, spoken script for a portfolio or one holding: what needs a look first, what fired but hasn't mattered, then context.
_Avoid_: summary, report, digest

**Expert**:
A tested rule that reads one kind of evidence (signals, the market, risk, look-through, figures, filings, insiders) and proposes points.
_Avoid_: agent, model, bot

**Point**:
One thing an expert wants said: a short run of lines kept or dropped together, with a salience.
_Avoid_: insight, fact, item

**Line**:
One spoken sentence of at most 28 words, carrying the numbers it prints and what it cites.
_Avoid_: message, caption (the tab's rendering of a line)

**Gate**:
What picks the points a briefing speaks: highest salience first, within a line budget and a cap per expert.
_Avoid_: router, filter, ranker

**Held back**:
A point the gate didn't speak, with its reason: over the budget, the expert's cap, or a failed check.
_Avoid_: dropped, rejected

**Grounded**:
A line whose every printed number round-trips to a value in its evidence, at the places it prints.
_Avoid_: verified, fact-checked
