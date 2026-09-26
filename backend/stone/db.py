"""Postgres connection and schema. Same code for local Postgres and Tiger Data."""

from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from stone import config

SCHEMA = Path(__file__).with_name("schema.sql")


def connect(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or config.load().database_url, row_factory=dict_row)


def apply_schema(conn: psycopg.Connection) -> None:
    conn.execute(SCHEMA.read_text())
    conn.commit()
