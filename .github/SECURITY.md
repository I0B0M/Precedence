# Security policy

## Supported versions

Only the latest `main` is supported. Precedence has no tagged releases yet.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Instead:

1. Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.
2. If that button isn't there, open an issue that asks a maintainer to contact you, without any details, and we'll
   set up a private channel.

Tell us what you found, how to reproduce it, and what it lets someone do. We're a small team: we'll acknowledge your
report as soon as we can, usually within a few days, and keep you updated until it's fixed. Please give us a
reasonable time to fix it before you disclose it.

## How Precedence handles data and keys

These are the design choices a report is most likely to touch:

- **Keys** live only in `backend/.env` (gitignored) or in the host's secret settings, never in the frontend.
  `NEXT_PUBLIC_*` variables are compiled into the browser bundle, so a key must never go in one.
- **Holdings** you enter stay in your browser (`localStorage`). The API prices them on request and doesn't store them.
- **Screenshots** you import are sent to Google's Gemini API, and its answer is cached on the server's disk under
  `data/cache/gemini/`.
- **The API has no authentication.** It's meant to run on your own machine or behind your own deploy. Endpoints that
  call Gemini spend the deployer's quota, so rate-limit them before exposing the API publicly.
- **The saved-data demo** is static files with no backend, so it holds no keys and receives no data.

## Scope

In scope: the code in this repository and its deploy configuration (`netlify.toml`, `render.yaml`, `.do/app.yaml`,
`backend/Dockerfile`). Out of scope: the outside services Precedence reads from (SEC EDGAR, Alpaca, FRED, State
Street, FHFA, the Census Geocoder, Gemini), and problems that need an already-compromised machine.
