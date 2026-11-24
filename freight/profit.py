"""Estimate trip economics from operator-supplied ZAR amounts."""
from dataclasses import dataclass, fields
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
CENT = Decimal(".01")


def amount(value):
    number = Decimal(str(value))
    if not number.is_finite() or number < ZERO:
        raise ValueError("Expected a finite, nonnegative amount")
    return number


def money(number):
    return number.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class OperatingCosts:
    tolls: Decimal
    wages: Decimal
    allowances: Decimal
    maintenance: Decimal
    tyres: Decimal
    insurance: Decimal
    depreciation: Decimal
    financing: Decimal
    subcontracting: Decimal
    overhead: Decimal


def estimate(*, loaded_km, empty_km, km_per_litre, diesel_price, costs,
             revenue_excl_vat=None, vat_rate=ZERO, target_margin=ZERO,
             baseline_empty_km=None):
    """All costs exclude recoverable VAT. Margin is a fraction of ex-VAT sales."""
    loaded, empty, efficiency, diesel, vat, margin = map(
        amount, (loaded_km, empty_km, km_per_litre, diesel_price, vat_rate, target_margin)
    )
    if not loaded or not efficiency or margin >= 1 or vat > 1:
        raise ValueError("Loaded kilometres and fuel efficiency must be positive and rates must be valid")
    inputs = {field.name: amount(getattr(costs, field.name)) for field in fields(costs)}
    distance = loaded + empty
    litres = distance / efficiency
    fuel = litres * diesel
    direct = fuel + sum(inputs[name] for name in (
        "tolls", "wages", "allowances", "maintenance", "tyres", "subcontracting"
    ))
    total = direct + sum(inputs[name] for name in ("insurance", "depreciation", "financing", "overhead"))
    quote = (total / (1 - margin)).quantize(CENT, rounding="ROUND_CEILING")
    result = {
        "loaded_km": loaded, "empty_km": empty, "total_km": distance,
        "estimated_litres": litres.quantize(CENT, rounding=ROUND_HALF_UP),
        "fuel_zar": money(fuel), "direct_cost_zar": money(direct),
        "total_cost_zar": money(total), "break_even_per_loaded_km_zar": money(total / loaded),
        "minimum_quote_excl_vat_zar": quote, "minimum_quote_incl_vat_zar": quote + money(quote * vat),
        "revenue_per_total_km_zar": None, "estimated_contribution_zar": None,
        "contribution_per_total_km_zar": None, "estimated_profit_before_tax_zar": None,
        "estimated_backhaul_fuel_savings_zar": None,
    }
    if baseline_empty_km is not None:
        result["estimated_backhaul_fuel_savings_zar"] = money((amount(baseline_empty_km) - empty) / efficiency * diesel)
    if revenue_excl_vat is not None:
        revenue = amount(revenue_excl_vat)
        contribution = revenue - direct
        result.update(
            revenue_per_total_km_zar=money(revenue / distance),
            estimated_contribution_zar=money(contribution),
            contribution_per_total_km_zar=money(contribution / distance),
            estimated_profit_before_tax_zar=money(revenue - total),
        )
    return result
