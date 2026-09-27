# Documentation

| Document | What it's for |
|---|---|
| [`../README.md`](../README.md) | What Precedence does, how to run it, how the signal test works |
| [`../CONTEXT.md`](../CONTEXT.md) | The glossary: what Holding, Signal, Case, Hit, Label, State, Briefing, Reader and the rest mean |
| [`deploy/`](deploy/README.md) | Step by step: the Netlify demo site, the full app on your machine, local models and the `live` branch, checks |
| [`adr/`](adr/) | Architecture decision records, one short file per decision |
| [`v2-plan.md`](v2-plan.md) | The accepted plan for after the hackathon: Readers, accuracy targets, deployment, milestones |
| [`research/ml-ai-baselines.md`](research/ml-ai-baselines.md) | Research notes on ML/AI baselines behind the v2 plan |
| [`issues-draft.md`](issues-draft.md) | Draft issues written during the build |
| [`../design-study/`](../design-study/) | The design study and the tokens the restyled pages are checked against |
| [`../QA/`](../QA/) | The judge-style walk-throughs and QA decisions from the event |
| [`../HANDOFF.md`](../HANDOFF.md) | The build handoff from Sep 26, 2026: data counts, signal rules, known quirks. Kept as history |

## Decisions

| ADR | Decision |
|---|---|
| [0001](adr/0001-briefing-is-rules-not-a-language-model.md) | The briefing is written by tested rules, not a language model |
| [0002](adr/0002-readers-propose-the-engine-tests.md) | Readers (trained models) propose cases; only the engine assigns labels |

To add one, copy the shape of the existing files: the decision, what was rejected and why, and the consequences.
Number it after the last one.
