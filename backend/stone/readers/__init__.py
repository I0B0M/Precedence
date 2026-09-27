"""Readers: trained models that turn unstructured text into candidate cases of a signal.

A Reader never assigns a label or a state (docs/adr/0002-readers-propose-the-engine-tests.md).
It reads a filing's text and records a reading; the signal engine then tests "bad news in a filing"
on the stock's own history exactly like insider clusters, rate jumps and gap downs. Readers run in
batch (scripts/read_filings.py) and their signal is off unless STONE_READERS=1 (stone.config).
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Tone:
    """How a text reads: the three FinBERT classes as shares that sum to 1, over `sentences` sentences."""
    negative: float
    neutral: float
    positive: float
    sentences: int


class Reader(Protocol):
    key: str
    model_name: str

    def read(self, text: str) -> Tone: ...
