from dataclasses import replace
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from freight.backup import backup
from freight.backhaul import ReturnLoad, ReturnTrip, rank
from freight.discovery import migrate, run, run_incremental
from freight.etenders import normalize, page_url, read_page
from freight.profit import OperatingCosts, estimate
from freight.review import review

START = date(2026, 11, 20)
END = date(2026, 11, 22)
RELEASE = {
    "ocid": "ocds-9t57fa-test", "id": "1", "date": "2026-11-22T00:00:00Z",
    "tag": ["compiled"], "tender": {
        "title": "Coal haulage", "tenderPeriod": {"endDate": "2020-01-01T00:00:00Z"},
        "value": {"amount": 10000, "currency": "ZAR"},
    },
}


class FreightTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        migrate(self.db)

    def test_schema_and_pagination(self):
        package = {"releases": [RELEASE], "links": {"next": page_url(START, END, 2)}}
        self.assertTrue(read_page(START, END, 1, lambda _: package)[1])
        package["links"]["next"] = "https://example.org/"
        with self.assertRaises(ValueError):
            read_page(START, END, 1, lambda _: package)
        with self.assertRaises(ValueError):
            read_page(START, END, 1, lambda _: {"releases": "invalid"})

    def test_resume_dedup_expiry_and_rejected_records(self):
        def reader(start, end, page):
            return [RELEASE, None], page == 1, page_url(start, end, page)
        self.assertEqual(run(self.db, START, END, 1, reader)["outcome"], "pending")
        self.assertEqual(run(self.db, START, END, 1, reader)["rejected"], 1)
        self.assertEqual(run(self.db, START, END, 1, reader)["pages"], 0)
        self.assertEqual(self.db.execute(
            "SELECT tender_state, status FROM freight_review_queue"
        ).fetchall(), [("expired", "UNVERIFIED")])

    def test_incremental_advances_only_after_terminal_page(self):
        def reader(start, end, page):
            return [RELEASE], page == 1, page_url(start, end, page)
        today = date(2026, 11, 22)
        result = run_incremental(self.db, START, 1, today, reader)
        self.assertEqual(result["outcome"], "pending")
        self.assertEqual(self.db.execute("SELECT starts FROM freight_incremental").fetchone()[0], "2026-11-20")
        self.assertEqual(run_incremental(self.db, START, 1, today, reader)["outcome"], "complete")
        self.assertEqual(run_incremental(self.db, START, 1, today, reader)["outcome"], "caught_up")

    def test_outage_keeps_checkpoint(self):
        def outage(*_):
            raise TimeoutError
        with self.assertRaises(TimeoutError):
            run(self.db, START, END, 1, outage)
        self.assertEqual(self.db.execute("SELECT count(*) FROM freight_checkpoints").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT error FROM freight_runs").fetchone()[0], "TimeoutError")

    def test_missing_fields_remain_unknown(self):
        item = normalize(RELEASE, page_url(START, END, 1))
        self.assertIsNone(item["province"])
        self.assertNotIn("rate_zar", item)
        unrelated = {**RELEASE, "tender": {"title": "Student transportation"}}
        self.assertIsNone(normalize(unrelated, item["source_url"]))

    def test_review_rejects_stale_verification_and_audits_rejection(self):
        run(self.db, START, END, 1, lambda *_: ([RELEASE], False, page_url(START, END, 1)))
        with self.assertRaises(ValueError):
            review(self.db, RELEASE["ocid"], "VERIFIED", "Reviewed at source")
        review(self.db, RELEASE["ocid"], "REJECTED", "Past deadline")
        self.assertEqual(self.db.execute(
            "SELECT previous_status, decision FROM freight_reviews"
        ).fetchone(), ("UNVERIFIED", "REJECTED"))

    def test_backup_restores_database(self):
        with TemporaryDirectory() as directory:
            source = Path(directory) / "db"
            target = Path(directory) / "backup"
            with sqlite3.connect(source) as db:
                migrate(db)
                run(db, START, END, 1, lambda *_: ([RELEASE], False, page_url(START, END, 1)))
            backup(source, target)
            with sqlite3.connect(target) as restored:
                self.assertEqual(restored.execute("SELECT count(*) FROM opportunities").fetchone()[0], 1)
            with self.assertRaises(FileExistsError):
                backup(source, target)

    def test_backhaul_requires_verified_compatible_profitable_load(self):
        start = datetime(2026, 11, 20, 8, tzinfo=timezone.utc)
        end = start.replace(hour=18)
        trip = ReturnTrip(start, end, "reefer", 20000, 200, 10)
        load = ReturnLoad("actual", True, start, end, "reefer", 15000, 25, 200, 5000, 1000)
        candidates = [load, replace(load, reference="unverified", verified_available=False),
                      replace(load, reference="overweight", weight_kg=22000),
                      replace(load, reference="loss", revenue_excl_vat=100)]
        self.assertEqual(rank(trip, candidates), [("actual", Decimal("3750.00"))])

    def test_profit_and_unknown_revenue(self):
        inputs = dict(loaded_km=300, empty_km=200, km_per_litre=2.5, diesel_price=22,
                      costs=OperatingCosts(600, 1000, 0, 1000, 0, 600, 0, 0, 0, 400))
        self.assertIsNone(estimate(**inputs)["estimated_contribution_zar"])
        result = estimate(**inputs, revenue_excl_vat=15000, vat_rate=".15", target_margin=".2")
        self.assertEqual(result["estimated_contribution_zar"], Decimal("8000"))
        self.assertEqual(result["estimated_profit_before_tax_zar"], Decimal("7000"))
        self.assertEqual(result["minimum_quote_incl_vat_zar"], Decimal("11500"))
        with self.assertRaises(ValueError):
            estimate(**{**inputs, "diesel_price": "NaN"})


if __name__ == "__main__":
    unittest.main()
