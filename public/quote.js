function calculate(km, rate, diesel, tolls) {
  const base = Math.round(km * Math.round(rate * 100));
  const subtotal = base + Math.round(diesel * 100) + Math.round(tolls * 100);
  const vat = Math.round(subtotal * .15);
  return { base, subtotal, vat, total: subtotal + vat };
}

if (typeof module !== 'undefined') module.exports = calculate;
