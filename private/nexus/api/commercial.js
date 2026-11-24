import { db } from 'hatchable';
import { sync } from '../lib/commercial-sync.js';

export const access = 'admin';
export const methods = ['GET','POST'];

const statuses = ['new','reviewing','qualified','won','lost'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

function calculateQuote(input, route) {
  if (!input || !route || !integer(input.km,1,100000) || !integer(input.perKmCents,0,10000000) ||
    !integer(input.fuelCents,0,1000000000) || !integer(input.tollCents,0,1000000000) ||
    !integer(input.handlingCents,0,1000000000) || !integer(input.marginBps,0,10000) ||
    !integer(input.payloadKg,1,1000000) || !integer(input.palletSlots,0,1000) ||
    !integer(route.mass,1,input.payloadKg) || !integer(route.pallets,0,input.palletSlots) ||
    !['manual','general-road','heavy-vehicle-verified'].includes(input.distanceSource) ||
    typeof input.verification !== 'string' || !input.verification.trim() || input.verification.length > 500) return null;
  const {km,perKmCents,fuelCents,tollCents,handlingCents,marginBps,payloadKg,palletSlots,distanceSource,verification} = input;
  const cost = km * perKmCents + fuelCents + tollCents + handlingCents;
  const markup = Number((BigInt(cost) * BigInt(marginBps) + 5000n) / 10000n);
  return {cost,total:cost + markup,
    terms:{km,perKmCents,fuelCents,tollCents,handlingCents,marginBps,payloadKg,palletSlots,distanceSource,verification:verification.trim(),route}};
}

export default async function (req, res) {
  res.setHeader?.('Cache-Control','no-store');
  try {
    if (req.method === 'GET') {
      const reference = req.query?.reference;
      if (reference !== undefined) {
        if (typeof reference !== 'string' || !uuid.test(reference)) return res.status(400).json({error:'Invalid reference'});
        const {rows} = await db.query('SELECT id,terms,cost_cents,total_cents,created_at,approved_at FROM commercial_quotes WHERE reference=$1 ORDER BY id DESC LIMIT 100',[reference]);
        return res.json({quotes:rows});
      }
      const [leads, report, checks] = await Promise.all([
        db.query('SELECT reference,received_at,submission,status,follow_up,revision FROM commercial_leads ORDER BY (follow_up<=CURRENT_DATE) DESC NULLS LAST,sequence DESC LIMIT 100'),
        db.query("SELECT submission->>'source' AS source,status,COUNT(*)::int AS count FROM commercial_leads GROUP BY 1,2 ORDER BY 1,2"),
        db.query("SELECT checked_at,treasury_health,followups_due,fleet_alerts,driver_alerts FROM commercial_operational_checks ORDER BY check_date DESC LIMIT 1")
      ]);
      return res.json({leads:leads.rows,report:report.rows,checks:checks.rows[0] || null});
    }
    if (req.headers?.origin && (req.headers.origin !== 'https://mimelchlo-nexus.hatchable.site' ||
        !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({error:'Origin rejected'});
    const body = req.body || {};
    if (body.action === 'sync') return res.json(await sync());
    if (typeof body.reference !== 'string' || !uuid.test(body.reference)) return res.status(400).json({error:'Invalid reference'});
    if (body.action === 'status') {
      const date = body.followUp || null;
      if (!statuses.includes(body.status) || !integer(body.revision,0,2147483646) ||
        (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date))) return res.status(400).json({error:'Invalid update'});
      const {rows} = await db.query('UPDATE commercial_leads SET status=$1, follow_up=$2,revision=revision+1 WHERE reference=$3 AND revision=$4 RETURNING revision',
        [body.status,date,body.reference,body.revision]);
      return res.status(rows.length?200:409).json(rows[0] || {error:'Reload before updating'});
    }
    if (body.action === 'draft') {
      const {rows:[lead]} = await db.query('SELECT submission FROM commercial_leads WHERE reference=$1',[body.reference]);
      const data = body.requirements;
      if (!lead || !data ||
        !['from','to','cargo'].every(key => typeof data[key] === 'string' && data[key].trim() && data[key].length <= 120) ||
        data.from.trim().toLowerCase() === data.to.trim().toLowerCase()) return res.status(400).json({error:'Confirm collection, delivery and cargo'});
      const route = {from:data.from.trim(),to:data.to.trim(),cargo:data.cargo.trim(),mass:data.mass,pallets:data.pallets};
      const quote = calculateQuote(body.costs,route);
      if (!quote) return res.status(400).json({error:'Complete verification and check that cargo fits the confirmed payload and pallet limits'});
      const {rows:[draft]} = await db.query('INSERT INTO commercial_quotes(reference,terms,cost_cents,total_cents) VALUES($1,$2::jsonb,$3,$4) RETURNING id',
        [body.reference,JSON.stringify(quote.terms),quote.cost,quote.total]);
      return res.status(201).json(draft);
    }
    if (body.action === 'approve' && integer(body.quoteId,1,Number.MAX_SAFE_INTEGER)) {
      const {rows} = await db.query('UPDATE commercial_quotes SET approved_at=now() WHERE reference=$1 AND id=$2 AND approved_at IS NULL RETURNING id,approved_at',
        [body.reference,body.quoteId]);
      return res.status(rows.length?200:409).json(rows[0] || {error:'Quote unavailable or already approved'});
    }
    return res.status(400).json({error:'Invalid action'});
  } catch {
    return res.status(503).json({error:'Commercial service unavailable. Retry later.'});
  }
}
