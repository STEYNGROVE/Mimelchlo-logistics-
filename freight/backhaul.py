"""Rank verified return-load candidates using supplied route and trip data."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from .profit import amount, money


@dataclass(frozen=True)
class ReturnTrip:
    available_at: datetime
    deadline: datetime
    vehicle_type: str
    payload_kg: Decimal
    baseline_empty_km: Decimal
    variable_cost_per_km: Decimal


@dataclass(frozen=True)
class ReturnLoad:
    reference: str
    verified_available: bool
    pickup_at: datetime
    return_at: datetime
    vehicle_type: str
    weight_kg: Decimal
    empty_km: Decimal
    loaded_km: Decimal
    revenue_excl_vat: Decimal
    extra_costs_excl_vat: Decimal


def rank(trip, candidates):
    """Distances include all legs through the same final return location."""
    capacity = amount(trip.payload_kg)
    baseline = amount(trip.baseline_empty_km)
    per_km = amount(trip.variable_cost_per_km)
    if not capacity or not per_km or trip.deadline <= trip.available_at:
        raise ValueError("Invalid vehicle capacity, operating cost or return window")
    ranked = []
    for load in candidates:
        if (not load.verified_available or load.vehicle_type != trip.vehicle_type
                or not trip.available_at <= load.pickup_at < load.return_at <= trip.deadline):
            continue
        weight = amount(load.weight_kg)
        if not 0 < weight <= capacity:
            continue
        loaded = amount(load.loaded_km)
        if not loaded:
            continue
        distance = amount(load.empty_km) + loaded
        incremental_cost = (distance - baseline) * per_km + amount(load.extra_costs_excl_vat)
        advantage = amount(load.revenue_excl_vat) - incremental_cost
        if money(advantage) > 0:
            ranked.append((load.reference, money(advantage)))
    return sorted(ranked, key=lambda result: (-result[1], result[0]))
