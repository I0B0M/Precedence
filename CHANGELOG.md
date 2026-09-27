# Changelog

Notable changes to Precedence. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- v2 scaffolding ([`docs/v2-plan.md`](docs/v2-plan.md)): the FinBERT tone Reader behind `STONE_READERS=1`, a local
  filing summarizer through Ollama behind `STONE_SUMMARY_MODEL`, the calibration and screenshot-reading checks, and
  deploy specs for the backend (`backend/Dockerfile`, `render.yaml`, `.do/app.yaml`) with a `live` Netlify context.
- Open-source project files: license, contributing guide, code of conduct, security and support policies, issue and
  pull request templates, and CI.

### Changed
- The Briefing's voice: the saved briefing plays Kokoro-82M recordings (`backend/scripts/build_voice.py`) with
  word-timed captions, instead of the browser's speech synthesis.

## [0.1.0] - 2026-09-27

The ShellHacks 2026 submission (Blackstone track).

### Added
- Real data pipeline for 103 S&P 100 stocks plus SPY and QQQ: SEC filings, XBRL financials, Form 4 insider sales,
  daily prices (Alpaca, IEX feed), the 10-year Treasury yield (FRED), and fund holdings from State Street and SEC
  N-PORT filings.
- The signal engine: insider selling cluster, rate jump (judged against SPY) and gap down; WEAK, STRONG, NOT PROVEN
  and NO DATA labels on a 90% Wilson range; a split-half hold-out, a stricter Newcombe test, and a
  Benjamini-Hochberg count across the scan.
- Portfolio with fund look-through, a home estimate (FHFA house price index), a 401(k), and Blackstone's BREIT and
  BCRED priced from their own SEC filings; a QuantStats risk card and a holdings treemap.
- Company pages, Signals ("does it matter?"), the spoken Briefing with its rule-based expert panel and number check,
  screenshot import checked against the printed total, and paper trading with pretend money.
- Lite and Pro views of every screen.
- A saved-data demo that runs on Netlify with no backend.
