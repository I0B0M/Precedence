# Backend requests (from the builder, for the data chat)

Newest first. The builder doesn't edit `backend/**`; each item says what the frontend does until it lands.

## 2026-09-27 (after judge walk #1)

4. **Clean company names, once, server-side** (judge #8). Raw SEC names show in the /signals and /paper pickers and
   fund tables: "At&T Inc.", "Us Bancorp De", "Costco Wholesale Corp /New", "Qualcomm Inc/De", "Danaher Corp /De/",
   "American Tower Corp /Ma/", "Wells Fargo & Company/Mn", "ELI LILLY & Co", "PROCTER & GAMBLE Co", "Duke Energy CORP",
   "Mcdonalds Corp", "Schwab Charles Corp", and State Street's "MICRON TECHNOLOGY INC". Please add a display name
   (e.g. `name` cleaned, the SEC name kept as `legal_name`) on /api/companies, /api/companies/{t}, portfolio rows and
   fund holdings: strip state suffixes (/De/, Inc/De, /New, /Mn, /Ma/), fix case, and use a short curated list where
   rules can't (AT&T, U.S. Bancorp, McDonald's, Charles Schwab).
   *Until then:* names show as the SEC or State Street prints them.

## 2026-09-27

1. **Hold-out halves miss a case.** `/api/lab/AMZN/insider_cluster`: n=12, hits=6, but
   `holdout.first` n=6/hits=2 and `holdout.second` n=5/hits=3, so the halves hold 11 cases and 5 hits.
   Why is one case (a hit) in neither half? If it sits on the split date, please add a field saying so,
   e.g. `holdout.excluded: {n, hits, reason}`.
   *Until then:* Pro prints only the counts ("the halves hold 11 of the 12 cases and 5 of the 6 hits"), no reason.

2. **Names for untracked fund holdings.** `/api/funds/SPY` (and VOO/IVV/SPYM) return `name: null` for GOOG and MU.
   The State Street file has a name column; please pass it through for holdings Precedence doesn't track.
   *Until then:* Lite shows the ticker alone; Pro says "Not tracked by Precedence".

3. **Summary service on/off in `/api/status`.** With no Gemini key, the only way the frontend can tell is to call
   `/api/filings/{acc}/summary` and get a 503, which is one red console line per page. A boolean such as
   `status.summaries: false` would let pages skip the call.
   *Until then:* one probe per page load; the button stays hidden on 503.
