"""Bounded, resumable discovery against a private SQLite database."""
import argparse
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
import fcntl
import json
from pathlib import Path
import sqlite3
import time

from .etenders import SOURCE, normalize, read_page


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def migrate(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS opportunities (
            id INTEGER PRIMARY KEY, source TEXT NOT NULL, reference TEXT NOT NULL,
            title TEXT NOT NULL, source_url TEXT NOT NULL, province TEXT,
            status TEXT DEFAULT 'UNVERIFIED', discovered_at TEXT NOT NULL,
            UNIQUE(source, reference)
        );
        CREATE TABLE IF NOT EXISTS freight_tender_evidence (
            opportunity_id INTEGER PRIMARY KEY REFERENCES opportunities(id),
            published_at TEXT, closes_at TEXT, source_status TEXT,
            evidence TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS freight_checkpoints (
            source TEXT NOT NULL, starts TEXT NOT NULL, ends TEXT NOT NULL,
            page INTEGER NOT NULL, done INTEGER NOT NULL,
            PRIMARY KEY(source, starts, ends)
        );
        CREATE TABLE IF NOT EXISTS freight_reviews (
            id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
            previous_status TEXT NOT NULL, decision TEXT NOT NULL,
            reason TEXT NOT NULL, reviewed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS freight_incremental (
            source TEXT PRIMARY KEY, starts TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS freight_runs (
            id INTEGER PRIMARY KEY, source TEXT NOT NULL,
            starts TEXT NOT NULL, ends TEXT NOT NULL, started_at TEXT NOT NULL,
            finished_at TEXT, outcome TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0,
            rejected INTEGER NOT NULL DEFAULT 0, error TEXT
        );
        CREATE VIEW IF NOT EXISTS freight_review_queue AS
        SELECT o.*, e.published_at, e.closes_at, e.source_status, e.evidence,
            CASE WHEN e.source_status IN ('cancelled', 'unsuccessful', 'complete',
                 'withdrawn', 'awarded') THEN 'closed_at_source'
                 WHEN julianday(e.closes_at) <= julianday('now') THEN 'expired'
                 WHEN e.closes_at IS NULL THEN 'deadline_unknown'
                 ELSE 'deadline_pending' END AS tender_state
        FROM opportunities o JOIN freight_tender_evidence e ON e.opportunity_id=o.id;
    """)


def store_tender(db, item):
    db.execute("""
        INSERT INTO opportunities(source, reference, title, source_url, province, discovered_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (source, reference) DO NOTHING
    """, (SOURCE, item["reference"], item["title"], item["source_url"], item["province"], utc_now()))
    db.execute("""
        INSERT INTO freight_tender_evidence
            (opportunity_id, published_at, closes_at, source_status, evidence)
        SELECT id, ?, ?, ?, ? FROM opportunities WHERE source=? AND reference=?
        ON CONFLICT (opportunity_id) DO UPDATE SET published_at=excluded.published_at,
            closes_at=excluded.closes_at, source_status=excluded.source_status,
            evidence=excluded.evidence
        WHERE COALESCE(excluded.published_at, '') >= COALESCE(freight_tender_evidence.published_at, '')
    """, (item["published_at"], item["closes_at"], item["source_status"],
          json.dumps(item, ensure_ascii=False), SOURCE, item["reference"]))


def run(db, start, end, max_pages, reader=read_page, pause=time.sleep):
    if not 1 <= (end - start).days <= 31 or not 1 <= max_pages <= 25:
        raise ValueError("Use a date window of 1 to 31 days and a page budget of 1 to 25")
    key = (SOURCE, start.isoformat(), end.isoformat())
    page, done = db.execute("""
        SELECT page, done FROM freight_checkpoints WHERE source=? AND starts=? AND ends=?
    """, key).fetchone() or (1, False)
    if done:
        return {"outcome": "complete", "pages": 0, "rejected": 0}
    with db:
        run_id = db.execute("""
            INSERT INTO freight_runs(source,starts,ends,started_at,outcome)
            VALUES (?,?,?,?,'running')
        """, (*key, utc_now())).lastrowid
    pages = rejected = 0
    try:
        while pages < max_pages and not done:
            releases, more, url = reader(start, end, page)
            page_rejected = 0
            with db:
                for raw in releases:
                    try:
                        item = normalize(raw, url)
                    except (ValueError, TypeError, AttributeError):
                        page_rejected += 1
                        continue
                    if item:
                        store_tender(db, item)
                db.execute("""
                    INSERT INTO freight_checkpoints(source,starts,ends,page,done)
                    VALUES (?,?,?,?,?) ON CONFLICT(source,starts,ends)
                    DO UPDATE SET page=excluded.page, done=excluded.done
                """, (*key, page + 1, not more))
                db.execute("UPDATE freight_runs SET pages=pages+1,rejected=rejected+? WHERE id=?",
                           (page_rejected, run_id))
            pages += 1
            rejected += page_rejected
            page += 1
            done = not more
            if not done and pages < max_pages:
                pause(1)
    except Exception as error:
        with db:
            db.execute("UPDATE freight_runs SET finished_at=?,outcome='failed',error=? WHERE id=?",
                       (utc_now(), str(getattr(error, "code", type(error).__name__)), run_id))
        raise
    outcome = "complete" if done else "pending"
    with db:
        db.execute("UPDATE freight_runs SET finished_at=?,outcome=? WHERE id=?",
                   (utc_now(), outcome, run_id))
    return {"outcome": outcome, "pages": pages, "rejected": rejected}


def run_incremental(db, seed, max_pages, today=None, reader=read_page, pause=time.sleep):
    today = today or datetime.now(timezone.utc).date()
    row = db.execute("SELECT starts FROM freight_incremental WHERE source=?", (SOURCE,)).fetchone()
    start = date.fromisoformat(row[0]) if row else seed
    end = start + timedelta(days=1)
    if end >= today:
        return {"outcome": "caught_up", "pages": 0, "rejected": 0}
    with db:
        db.execute("INSERT OR IGNORE INTO freight_incremental VALUES (?, ?)", (SOURCE, start.isoformat()))
    result = run(db, start, end, max_pages, reader, pause)
    if result["outcome"] == "complete":
        with db:
            db.execute("UPDATE freight_incremental SET starts=? WHERE source=?", (end.isoformat(), SOURCE))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--start", type=date.fromisoformat)
    mode.add_argument("--incremental-from", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    parser.add_argument("--max-pages", type=int, default=10)
    args = parser.parse_args()
    if (args.start is None) != (args.end is None):
        parser.error("--start and --end must be used together")
    database = args.db.resolve(strict=True)
    with database.with_suffix(database.suffix + ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.exit(1, "Another discovery run holds the database lock\n")
        with closing(sqlite3.connect(database.as_uri() + "?mode=rw", uri=True)) as db:
            db.execute("PRAGMA foreign_keys = ON")
            migrate(db)
            with db:
                db.execute("""UPDATE freight_runs SET finished_at=?,outcome='interrupted'
                              WHERE outcome='running'""", (utc_now(),))
            if args.incremental_from:
                result = run_incremental(db, args.incremental_from, args.max_pages)
            else:
                result = run(db, args.start, args.end, args.max_pages)
            print(json.dumps(result))


if __name__ == "__main__":
    main()
