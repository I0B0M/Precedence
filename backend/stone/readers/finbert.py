"""FinBERT tone: ProsusAI/finbert, a BERT classifier trained on financial text (negative, neutral,
positive). Optional dependency: `uv pip install transformers torch` in backend/.venv. The model is
loaded on first use, so importing this module costs nothing."""

import re
from typing import Any

from stone.readers import Tone

MODEL = "ProsusAI/finbert"
MAX_SENTENCES = 120  # an 8-K's body; enough for the press release, cheap on a CPU
MIN_CHARS, MAX_CHARS = 25, 600  # skip headings, table cells and run-on boilerplate


def sentences_of(text: str, limit: int = MAX_SENTENCES) -> list[str]:
    """The sentences worth reading: plain prose, neither fragments nor tables."""
    out = []
    for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text).strip()):
        s = s.strip()
        if MIN_CHARS <= len(s) <= MAX_CHARS and sum(c.isalpha() for c in s) > len(s) / 2:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def average(scores: list[dict[str, float]]) -> Tone:
    """Mean class shares over the sentences read. Missing classes count as 0."""
    n = len(scores)
    if n == 0:
        return Tone(0.0, 1.0, 0.0, 0)
    tot = {k: sum(float(s.get(k, 0.0)) for s in scores) / n for k in ("negative", "neutral", "positive")}
    return Tone(round(tot["negative"], 4), round(tot["neutral"], 4), round(tot["positive"], 4), n)


def scores_from(output: list[Any]) -> list[dict[str, float]]:
    """transformers' text-classification output with top_k=None: one list of {label, score} per sentence."""
    return [{str(d["label"]).lower(): float(d["score"]) for d in per_sentence} for per_sentence in output]


class FinBertTone:
    key = "finbert_tone"
    model_name = MODEL

    def __init__(self, pipeline: Any = None):
        self._pipe = pipeline

    def pipe(self) -> Any:
        if self._pipe is None:
            from transformers import pipeline  # optional dependency; imported here on purpose

            self._pipe = pipeline("text-classification", model=MODEL, top_k=None, truncation=True)
        return self._pipe

    def read(self, text: str) -> Tone:
        sents = sentences_of(text)
        if not sents:
            return average([])
        return average(scores_from(self.pipe()(sents, batch_size=16)))
