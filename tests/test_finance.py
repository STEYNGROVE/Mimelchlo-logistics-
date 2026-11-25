from datetime import date
from decimal import Decimal
import unittest

from freight.finance import Receipt, Receivable, cashflow_scenario, debtor_report, invoice_draft, statement_csv, trip_metrics


class FinanceTests(unittest.TestCase):
    def test_draft_rounding_and_positive_cents(self):
        self.assertEqual(invoice_draft([1001, 10], 1500),
                         {"net_cents": 1011, "tax_cents": 152, "gross_cents": 1163, "draft": True})
        with self.assertRaises(ValueError):
            invoice_draft([-1], 1500)

    def test_statement_aging_and_unapplied_amounts(self):
        invoice = Receivable("INV-1", "=Synthetic", date(2026, 8, 10), date(2026, 10, 1), 5000)
        receipt = Receipt("R-1", date(2026, 10, 2), 1000, "INV-1")
        unallocated = Receipt("R-2", date(2026, 11, 2), 700, "UNKNOWN")
        report = debtor_report([invoice], [receipt, unallocated], date(2026, 11, 25))
        self.assertEqual(report["customers"]["=Synthetic"]["31–60"], 4000)
        self.assertEqual(report["unapplied_receipts"], [("R-2", 700)])
        self.assertIn("'=Synthetic", statement_csv(report))
        with self.assertRaises(ValueError):
            debtor_report([invoice], [receipt, receipt], date(2026, 11, 25))

    def test_recorded_trip_contribution(self):
        metrics = trip_metrics(400, 100000, [30000, 8000])
        self.assertEqual(metrics["recorded_operating_contribution_cents"], 62000)
        self.assertEqual(metrics["revenue_per_km_zar"], Decimal("2.50"))
        self.assertNotIn("net_profit", metrics)


    def test_cashflow_scenario_does_not_invent_movements(self):
        day = date(2026, 11, 25)
        result = cashflow_scenario(20000, [("reviewed-1", day, "outflow", 23000)], day, day)
        self.assertTrue(result["scenario"])
        self.assertEqual(result["closing_cents"], -3000)
        self.assertEqual(len(result["movements"]), 1)
