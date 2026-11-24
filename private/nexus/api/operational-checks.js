import { db } from 'hatchable';

export const access = 'scheduler';
export const methods = ['POST'];

async function checkTreasury() {
  const now = Date.now();
  const date = days => new Date(now - days * 86400000).toISOString().slice(0,10);
  const url = new URL('https://ocds-api.etenders.gov.za/api/OCDSReleases');
  url.search = new URLSearchParams({dateFrom:date(2),dateTo:date(1),PageNumber:'1',PageSize:'1'});
  try {
    const response = await fetch(url.href,{headers:{Accept:'application/json'},redirect:'error',timeout_ms:12000});
    const type = response.headers.get('Content-Type') || '';
    if (response.body) await response.body.cancel().catch(() => {});
    return response.ok && type.includes('json') ? 'HTTP success, JSON response' : 'HTTP ' + response.status;
  } catch {
    return 'Connection unavailable';
  }
}

export default async function (_req, res) {
  const health = await checkTreasury();
  const {rows:[result]} = await db.query(`
    WITH clock AS (SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date AS today)
    INSERT INTO commercial_operational_checks(check_date,treasury_health,followups_due,fleet_alerts,driver_alerts)
    SELECT today,$1,
      (SELECT count(*) FROM commercial_leads WHERE status IN ('new','reviewing','qualified') AND follow_up<=today),
      (SELECT count(*) FROM nexus_fleet WHERE licence_expiry IS NULL OR licence_expiry<=today+14 OR odometer>=service_at),
      (SELECT count(*) FROM nexus_drivers WHERE active AND
        (licence_expiry IS NULL OR prdp_expiry IS NULL OR licence_expiry<=today+14 OR prdp_expiry<=today+14))
    FROM clock ON CONFLICT(check_date) DO UPDATE SET
      checked_at=now(), treasury_health=excluded.treasury_health,followups_due=excluded.followups_due,
      fleet_alerts=excluded.fleet_alerts,driver_alerts=excluded.driver_alerts
    RETURNING check_date,treasury_health
  `,[health]);
  return res.json(result);
}
