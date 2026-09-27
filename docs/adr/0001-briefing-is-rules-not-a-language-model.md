# The briefing is written by tested rules, not a language model

The narration tab speaks a briefing built by a panel of experts: rule-based specialists that each read one kind of evidence from the API's own JSON, plus a gate that keeps the most salient points within a line budget and a cap per expert. We considered a small local LLM, a hosted model (Gemini), and a trained mixture of experts. We rejected all three for the briefing. Each stock has 15 to 50 past cases, which can't train a model, only fit noise. No model key is available where the demo runs, and the live site has no backend. Most of all, a sentence that states a number must be provable: every line is checked so that each printed number round-trips to a value in its evidence, and a point that fails is never spoken.

## Consequences

- Briefings are prebuilt JSON in the saved demo data (`stone.briefing.saved`), so the tab needs no model and no network at runtime.
- A language model may later rephrase lines only if the output passes the same check (`lines.check`); the seam is the Line, not the numbers.
- Gemini stays where reading is the job (screenshots, filings), and its output is checked there too (reconcile, XBRL).
