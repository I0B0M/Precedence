-- Stone schema. Idempotent: safe to run on every start.
-- Every row carries `source` ('sec', 'alpaca-iex', 'fred', 'sample', ...) so the app
-- can always tell real data from sample data, and say so on screen.

create table if not exists companies (
    ticker  text primary key,
    cik     integer,
    name    text not null,
    sector  text,
    kind    text not null check (kind in ('stock', 'etf')),
    source  text not null
);

-- One row per SEC filing. accepted_at is the SEC acceptance time (when the
-- public could first see it), which is what the signal engine measures from.
create table if not exists filings (
    accession    text primary key,
    ticker       text not null references companies (ticker),
    form         text not null,
    filed_date   date not null,
    accepted_at  timestamptz not null,
    report_date  date,
    primary_doc  text,
    source       text not null
);
create index if not exists filings_ticker_form on filings (ticker, form, accepted_at);

-- XBRL facts from companyfacts. period_start is null for point-in-time facts
-- (balance sheet), set for duration facts (revenue for a quarter).
create table if not exists xbrl_facts (
    id            bigserial primary key,
    ticker        text not null references companies (ticker),
    taxonomy      text not null,
    concept       text not null,
    unit          text not null,
    period_start  date,
    period_end    date not null,
    value         numeric not null,
    accession     text not null,
    fiscal_year   integer,
    fiscal_period text,
    form          text,
    filed         date,
    frame         text,
    source        text not null
);
create unique index if not exists xbrl_facts_uniq on xbrl_facts (
    ticker, taxonomy, concept, unit, coalesce(period_start, '0001-01-01'::date), period_end, accession
);

-- One row per Form 4 transaction line (non-derivative table).
-- code 'S' = open-market sale, 'P' = purchase; others kept for completeness.
create table if not exists insider_trades (
    accession         text not null references filings (accession),
    seq               integer not null,
    ticker            text not null references companies (ticker),
    owner_name        text,
    owner_title       text,
    transaction_date  date,
    code              text not null,
    shares            numeric,
    price             numeric,
    acquired_disposed text,
    accepted_at       timestamptz not null,
    source            text not null,
    primary key (accession, seq)
);
create index if not exists insider_trades_ticker on insider_trades (ticker, code, accepted_at);

create table if not exists prices_daily (
    ticker  text not null references companies (ticker),
    day     date not null,
    open    numeric not null,
    high    numeric not null,
    low     numeric not null,
    close   numeric not null,
    volume  numeric,
    source  text not null,
    primary key (ticker, day)
);

create table if not exists rates (
    series  text not null,
    day     date not null,
    value   numeric not null,
    source  text not null,
    primary key (series, day)
);

-- What an ETF holds, for real exposure ("you own $2,140 of HLCN inside your index fund").
create table if not exists etf_holdings (
    etf      text not null references companies (ticker),
    holding  text not null,
    weight   numeric not null,
    as_of    date not null,
    source   text not null,
    primary key (etf, holding, as_of)
);

-- One row per full scan of every stock x signal, so "how many did you test?" has a real answer.
-- expected_by_chance = 5% of the eligible pairs: the low end of a 90% range sits above the
-- true rate about 1 time in 20 by luck alone.
create table if not exists signal_scans (
    run_at             timestamptz primary key,
    stocks             integer not null,
    tested             integer not null,
    eligible           integer not null,  -- pairs with 10+ cases (only these can be STRONG)
    strong             integer not null,
    strong_held_up     integer not null,
    expected_by_chance numeric not null,
    as_of              date not null
);
-- STRONG results that also survive Benjamini-Hochberg at a 10% false discovery rate
-- across every tested pair in that scan (null for scans run before this was added).
alter table signal_scans add column if not exists strong_fdr10 integer;

-- FHFA annual house price index (developmental, all-transactions, NSA), for home estimates.
-- area: 5-digit ZIP, county FIPS, or two-letter state. hpi: 100 in the first recorded year.
create table if not exists house_price_index (
    level  text not null check (level in ('zip5', 'county', 'state')),
    area   text not null,
    year   integer not null,
    hpi    numeric not null,
    source text not null,
    primary key (level, area, year)
);

-- Tiger Data runs TimescaleDB: make prices a hypertable there. Plain Postgres
-- (local fallback) has no extension, so this block does nothing.
do $$
begin
    if exists (select 1 from pg_available_extensions where name = 'timescaledb') then
        create extension if not exists timescaledb;
        perform create_hypertable('prices_daily', 'day', if_not_exists => true, migrate_data => true);
    end if;
end
$$;
