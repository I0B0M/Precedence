# Readers propose cases; only the engine assigns labels

Stone will add trained models for finance text (a FinBERT-style tone classifier on 8-K text, a small summarizer checked against XBRL). We decided that such a model is a Reader: it may turn unstructured text into candidate cases of a signal, and nothing more. The label (STRONG, NOT PROVEN, WEAK), the hold-out and the state (Heads up or Calm) come only from the signal engine's test on the holding's own history, exactly as for insider clusters, rate jumps and gap downs. We considered the usual design, a model that scores or predicts and sets the alert itself, and rejected it: with 15 to 50 cases per stock a predictor fits noise, it cannot say "6 of the last 12 times", and a Blackstone judge cannot check it. A Reader's output is judged by the same calibration as every other signal (about 5% false STRONG on a placebo set), so adding a model can never make Stone less honest than it is today.

## Consequences

- A new Reader is a new signal definition in `engine.py` (source, threshold, timing, horizon, hit rule) plus the model that finds its cases; the label logic is untouched.
- Readers run in batch (a nightly job or by hand on a developer's machine) and write cases to the database or the saved data; nothing at request time depends on a model.
- Accuracy claims are about calibration, reading accuracy and grounding, never about predicting prices.
