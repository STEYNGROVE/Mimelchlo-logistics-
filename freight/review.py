"""Record a private tender review under the operating-system account."""
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3

from .discovery import utc_now
from .etenders import SOURCE

DECISIONS = ("VERIFIED", "REJECTED", "UNVERIFIED")


def review(db, reference, decision, reason):
    reason = reason.strip()
    if decision not in DECISIONS or not 1 <= len(reason) <= 1000:
        raise ValueError("A review requires a valid decision and a reason of 1 to 1000 characters")
    with db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("""
            SELECT id, COALESCE(status,'UNVERIFIED'), tender_state
            FROM freight_review_queue WHERE source=? AND reference=?
        """, (SOURCE, reference)).fetchone()
        if row is None:
            raise ValueError("Tender reference not found")
        opportunity_id, previous, state = row
        if decision == "VERIFIED" and state != "deadline_pending":
            raise ValueError("Verification requires a pending closing deadline")
        db.execute("UPDATE opportunities SET status=? WHERE id=?", (decision, opportunity_id))
        db.execute("""
            INSERT INTO freight_reviews(opportunity_id,previous_status,decision,reason,reviewed_at)
            VALUES (?,?,?,?,?)
        """, (opportunity_id, previous, decision, reason, utc_now()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("reference")
    parser.add_argument("decision", choices=DECISIONS)
    args = parser.parse_args()
    db_path = args.db.resolve(strict=True)
    with closing(sqlite3.connect(db_path.as_uri() + "?mode=rw", uri=True)) as db:
        db.execute("PRAGMA foreign_keys = ON")
        review(db, args.reference, args.decision, input("Review reason: "))
    print("Review recorded")
