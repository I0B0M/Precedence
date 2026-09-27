"""Readers propose, the engine tests (docs/adr/0002). No model is loaded here: a fake pipeline stands in."""

from datetime import datetime, time, timedelta, date

import pytest

from stone import config
from stone.readers import Tone
from stone.readers.finbert import FinBertTone, average, scores_from, sentences_of
from stone.signals import engine, service


def test_sentences_of_keeps_prose_and_drops_fragments_and_tables():
    text = ("ITEM 2.02.  Results.   Revenue fell 12% from a year earlier as demand weakened across every segment. "
            "1,234 5,678 9,012.   Ok. " + "x" * 700 + ". The company withdrew its full-year outlook.")
    out = sentences_of(text)
    assert out == ["Revenue fell 12% from a year earlier as demand weakened across every segment.",
                   "The company withdrew its full-year outlook."]
    assert sentences_of("", limit=5) == []
    assert len(sentences_of(" ".join(["This sentence is long enough to count as prose."] * 50), limit=7)) == 7


def test_average_and_scores_from():
    raw = [[{"label": "negative", "score": 0.9}, {"label": "neutral", "score": 0.1}, {"label": "positive", "score": 0.0}],
           [{"label": "Negative", "score": 0.5}, {"label": "Neutral", "score": 0.5}]]
    tone = average(scores_from(raw))
    assert tone == Tone(0.7, 0.3, 0.0, 2)
    assert average([]) == Tone(0.0, 1.0, 0.0, 0)


def test_finbert_reader_uses_the_pipeline_it_is_given():
    seen = []

    def fake(sents, batch_size):
        seen.append((list(sents), batch_size))
        return [[{"label": "negative", "score": 0.8}, {"label": "neutral", "score": 0.2}] for _ in sents]

    r = FinBertTone(pipeline=fake)
    assert r.key == "finbert_tone" and r.model_name == "ProsusAI/finbert"
    tone = r.read("Demand weakened sharply and the company withdrew its outlook for the year. Short.")
    assert tone == Tone(0.8, 0.2, 0.0, 1)
    assert seen[0][0] == ["Demand weakened sharply and the company withdrew its outlook for the year."]
    assert FinBertTone(pipeline=fake).read("") == Tone(0.0, 1.0, 0.0, 0)


ET = engine.EASTERN


def at(d: date) -> datetime:
    return datetime.combine(d, time(16, 30), tzinfo=ET)


def test_detect_news_tone_fires_at_or_above_the_threshold_in_time_order():
    readings = [("0002", at(date(2026, 3, 3)), "8-K", 0.71), ("0001", at(date(2026, 1, 9)), "8-K", 0.70),
                ("0003", at(date(2026, 5, 5)), "8-K/A", 0.69)]
    events = engine.detect_news_tone(readings)
    assert [ev.known_at.date() for ev in events] == [date(2026, 1, 9), date(2026, 3, 3)]
    assert events[0].note == "2026-01-09: 8-K read as bad news (negative tone 70%, 0001)"
    assert engine.detect_news_tone(readings, threshold=0.72) == []


def test_news_spec_is_tested_like_any_other_signal():
    days = [date(2024, 9, 2) + timedelta(days=i) for i in range(400)]
    days = [d for d in days if d.weekday() < 5]
    bars = [engine_bar(d, 100 + i * 0.01) for i, d in enumerate(days)]
    events = engine.detect_news_tone([(str(i), at(days[i]), "8-K", 0.9) for i in range(20, 260, 20)])
    r = engine.test_signal(engine.NEWS, bars, events)
    assert r.signal == "news_tone" and r.horizon == 5 and r.n == 12
    assert r.label in (engine.STRONG, engine.NOT_PROVEN, engine.WEAK)


class engine_bar:
    def __init__(self, day: date, close: float):
        self.day, self.open, self.close = day, close, close


def test_reader_signals_run_only_with_the_flag(monkeypatch):
    monkeypatch.delenv("STONE_READERS", raising=False)
    assert config.readers_on() is False
    assert list(service.active_specs()) == ["insider_cluster", "rate_jump", "gap_down"]
    monkeypatch.setenv("STONE_READERS", "1")
    assert config.readers_on() is True
    assert list(service.active_specs()) == ["insider_cluster", "rate_jump", "gap_down", "news_tone"]
    assert engine.ALL_SPECS["news_tone"] is engine.NEWS  # views can always name it
    assert "news_tone" not in engine.SPECS  # the built-in three are unchanged


def test_no_readings_means_no_data_not_calm():
    r = service.missing_data(None, "BX", engine.NEWS, readings=[])
    assert r is not None and r.label == engine.NO_DATA and "read_filings" in (r.note or "")
    assert service.missing_data(None, "BX", engine.NEWS, readings=[("a", at(date(2026, 1, 1)), "8-K", 0.1)]) is None


def test_events_for_news_uses_the_readings():
    evs = service.events_for("news_tone", [], [], [], readings=[("a", at(date(2026, 1, 1)), "8-K", 0.95)])
    assert len(evs) == 1
    with pytest.raises(KeyError):
        service.events_for("nope", [], [], [])
