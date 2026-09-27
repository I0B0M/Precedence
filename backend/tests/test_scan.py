import os
from datetime import date, datetime, timezone

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.ingest import sample  # noqa: E402
from stone.signals import engine, scan  # noqa: E402

OLDER = datetime(2026, 9, 26, 10, tzinfo=timezone.utc)
LATEST = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)


@pytest.fixture
def conn():
    c = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(c)
    sample.seed(c, date(2026, 9, 26))
    c.execute("delete from signal_scans")  # cascades to signal_scan_pairs
    c.commit()
    yield c
    c.execute("delete from signal_scans")
    c.commit()
    c.close()


@pytest.fixture
def client(conn):
    return TestClient(app)


def sample_stocks(conn) -> list[str]:
    return [r["ticker"] for r in conn.execute(
        """select ticker from companies c where kind = 'stock'
           and exists (select 1 from prices_daily p where p.ticker = c.ticker) order by 1""").fetchall()]


def add_scan(conn, run_at, pairs):
    conn.execute("insert into signal_scans (run_at, stocks, tested, eligible, strong, strong_held_up, "
                 "expected_by_chance, as_of, strong_fdr10) values (%s, 4, 12, 3, 1, 0, 0.15, '2026-09-25', 1)",
                 (run_at,))
    for ticker, signal, p, keep in pairs:
        conn.execute("insert into signal_scan_pairs values (%s, %s, %s, %s, %s)", (run_at, ticker, signal, p, keep))
    conn.commit()


def test_scan_stores_every_tested_pair_with_its_own_benjamini_hochberg_verdict(conn):
    s = scan.run(conn, sample_stocks(conn), LATEST, date(2026, 9, 25))
    # recompute from the results themselves, independently of the order the scan kept them in
    tested = {k: engine.p_value(r) for k, r in s.results.items() if engine.p_value(r) is not None}
    keys = sorted(tested)
    expected = dict(zip(keys, engine.benjamini_hochberg([tested[k] for k in keys], q=0.10)))
    stored = {(r["ticker"], r["signal"]): r["fdr10"] for r in conn.execute(
        "select ticker, signal, fdr10 from signal_scan_pairs where run_at = %s", (LATEST,)).fetchall()}
    assert stored == expected
    assert True in stored.values() and False in stored.values()  # the sample data has both, so the test can tell
    row = conn.execute("select * from signal_scans where run_at = %s", (LATEST,)).fetchone()
    assert row["strong_fdr10"] == sum(1 for t, k, _ in s.strong if expected[(t, k)])
    assert row["eligible"] == len(tested)


def test_each_result_says_whether_it_survives_the_latest_scans_correction(conn, client):
    add_scan(conn, OLDER, [("HLCN", "insider_cluster", 0.9, False), ("ORCA", "gap_down", 0.001, True)])
    add_scan(conn, LATEST, [("HLCN", "insider_cluster", 0.001, True), ("MRDN", "rate_jump", 0.2, False)])
    assert client.get("/api/lab/HLCN/insider_cluster").json()["fdr10_survives"] is True  # the latest run wins
    assert client.get("/api/lab/MRDN/rate_jump").json()["fdr10_survives"] is False
    assert client.get("/api/lab/ORCA/gap_down").json()["fdr10_survives"] is None  # only in an older run
    page = client.get("/api/companies/HLCN").json()
    by_signal = {s["signal"]: s["fdr10_survives"] for s in page["signals"]}
    assert by_signal == {"insider_cluster": True, "rate_jump": None, "gap_down": None}
    board = client.post("/api/portfolio", json={"holdings": [{"symbol": "HLCN", "shares": 1}]}).json()
    firing = next(e for e in board["exposure"] if e["symbol"] == "HLCN")["firing"]
    assert next(f for f in firing if f["signal"] == "insider_cluster")["fdr10_survives"] is True


def test_no_scan_means_null_not_false(client):
    assert client.get("/api/lab/HLCN/insider_cluster").json()["fdr10_survives"] is None
    assert client.get("/api/market/rate_jump").json()["fdr10_survives"] is None  # the market card is never in a scan


def test_insider_label_says_insiders_not_executives(client):
    assert client.get("/api/lab/HLCN/insider_cluster").json()["lite"] == "Insiders sold shares"  # directors file too
