"""Deterministic management reports over reviewed ZAR records, with no posting or payment side effects."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import csv
from io import StringIO


def money(cents):
    if isinstance(cents, bool) or not isinstance(cents, int) or not 0 <= cents <= 10**12:
        raise ValueError("Supply a nonnegative integer number of cents")
    return cents


@dataclass(frozen=True)
class Receivable:
    reference: str
    customer: str
    issued_on: date
    due_on: date
    gross_cents: int

    def __post_init__(self):
        if not self.reference or not self.customer or self.due_on < self.issued_on:
            raise ValueError("Invalid receivable evidence")
        money(self.gross_cents)


@dataclass(frozen=True)
class Receipt:
    reference: str
    received_on: date
    cents: int
    invoice_reference: str | None

    def __post_init__(self):
        if not self.reference:
            raise ValueError("A unique receipt reference is required")
        money(self.cents)


def invoice_draft(lines, vat_basis_points=0):
    """Calculate draft totals from reviewed amounts and an operator-supplied VAT setting."""
    if isinstance(vat_basis_points, bool) or not isinstance(vat_basis_points, int) or not 0 <= vat_basis_points <= 10000:
        raise ValueError("Invalid VAT basis points")
    subtotals = [money(amount) for amount in lines]
    if not subtotals:
        raise ValueError("Add at least one approved draft line")
    net = sum(subtotals)
    tax = (net * vat_basis_points + 5000) // 10000
    return {"net_cents": net, "tax_cents": tax, "gross_cents": net + tax, "draft": True}


def debtor_report(invoices, receipts, as_of):
    """Allocate unique receipts oldest-first, retaining unapplied amounts and future-dated items separately."""
    indexed = {}
    for invoice in invoices:
        if invoice.reference in indexed:
            raise ValueError("Duplicate invoice reference")
        indexed[invoice.reference] = invoice
    seen = set()
    paid = defaultdict(int)
    unapplied = []
    for receipt in sorted(receipts, key=lambda item: (item.received_on, item.reference)):
        if receipt.reference in seen:
            raise ValueError("Duplicate receipt reference")
        seen.add(receipt.reference)
        if receipt.received_on > as_of:
            continue
        invoice = indexed.get(receipt.invoice_reference)
        eligible = invoice and invoice.issued_on <= receipt.received_on
        allocation = min(receipt.cents, invoice.gross_cents - paid[invoice.reference]) if eligible else 0
        if eligible:
            paid[invoice.reference] += allocation
        if receipt.cents > allocation:
            unapplied.append((receipt.reference, receipt.cents - allocation))

    groups = defaultdict(lambda: {bucket: 0 for bucket in ("current", "1–30", "31–60", "61–90", "90+")})
    items = []
    for invoice in indexed.values():
        if invoice.issued_on > as_of:
            continue
        remaining = invoice.gross_cents - paid[invoice.reference]
        age = (as_of - invoice.due_on).days
        bucket = "current" if age <= 0 else "1–30" if age <= 30 else "31–60" if age <= 60 else "61–90" if age <= 90 else "90+"
        groups[invoice.customer][bucket] += remaining
        items.append((invoice.reference, invoice.customer, invoice.due_on.isoformat(), invoice.gross_cents, paid[invoice.reference], remaining, bucket))
    return {"customers": dict(groups), "statements": sorted(items), "unapplied_receipts": unapplied}


def trip_metrics(kilometres, actual_revenue_cents, reviewed_expense_cents):
    """Calculate recorded operating contribution. Unrecorded costs remain outside the result."""
    try:
        distance = Decimal(str(kilometres))
    except InvalidOperation as error:
        raise ValueError("Enter a verified positive trip distance") from error
    if not distance.is_finite() or distance <= 0:
        raise ValueError("Enter a verified positive trip distance")
    revenue = money(actual_revenue_cents)
    expenses = sum(money(amount) for amount in reviewed_expense_cents)
    return {
        "recorded_revenue_cents": revenue,
        "recorded_expense_cents": expenses,
        "recorded_operating_contribution_cents": revenue - expenses,
        "revenue_per_km_zar": (Decimal(revenue) / 100 / distance).quantize(Decimal(".01"), rounding=ROUND_HALF_UP),
    }


def statement_csv(report):
    """Export reviewed report rows, escaping spreadsheet formula prefixes in textual fields."""
    def text_cell(value):
        return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value

    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(("reference", "customer", "due_date", "gross_cents", "paid_cents", "outstanding_cents", "aging_bucket"))
    for reference, customer, due, gross, paid, balance, bucket in report["statements"]:
        writer.writerow((text_cell(reference), text_cell(customer), due, gross, paid, balance, bucket))
    return buffer.getvalue()


def cashflow_scenario(opening_cents, entries, start, end):
    """Project a supplied schedule of gross inflows and outflows; keep this separate from bank actuals."""
    if isinstance(opening_cents, bool) or not isinstance(opening_cents, int) or abs(opening_cents) > 10**12:
        raise ValueError("Opening balance must be supplied in integer cents")
    if end < start:
        raise ValueError("Invalid forecast window")
    seen = set()
    movements = defaultdict(lambda: [0, 0])
    for reference, day, direction, amount in entries:
        if not reference or reference in seen or direction not in ("inflow", "outflow"):
            raise ValueError("Each movement needs a distinct reference and a direction")
        seen.add(reference)
        cents = money(amount)
        if start <= day <= end:
            side = 0 if direction == "inflow" else 1
            movements[day][side] += cents
    balance = opening_cents
    points = []
    for day, (inflow, outflow) in sorted(movements.items()):
        balance += inflow - outflow
        points.append({"date": day.isoformat(), "inflow_cents": inflow, "outflow_cents": outflow, "balance_cents": balance})
    return {"scenario": True, "opening_cents": opening_cents, "closing_cents": balance, "movements": points}
