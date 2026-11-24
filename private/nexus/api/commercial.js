import { db } from 'hatchable';

export const access = 'admin';
export const methods = ['GET','POST'];

const relayUrl = 'https://mimelchlo-logistics.pages.dev/api/enquiry-relay';
const statuses = ['new','reviewing','qualified','won','lost'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

async function sync() {
  const {rows:[config]} = await db.query('SELECT token FROM commercial_relay_settings WHERE singleton=true');
  if (!config) throw new Error('relay unavailable');
  // Every batch is replayable. The relay returns rows in insertion order.
  const {rows:[cursor]} = await db.query('SELECT COALESCE(MAX(sequence),0) AS cursor FROM commercial_leads');
  const response = await fetch(relayUrl + '?after=' + cursor.cursor, {
    headers:{Authorization:'Bearer ' + config.token},
    redirect:'error',
    timeout_ms:8000
  });
  if (!response.ok) throw new Error('relay unavailable');
  const {items} = await response.json();
  if (!Array.isArray(items) || items.length > 30) throw new Error('invalid relay');
  for (const entry of items) {
    if (!uuid.test(entry.submission?.requestId) || !integer(entry.sequence,1,Number.MAX_SAFE_INTEGER) ||
      !integer(entry.receivedAt,1,9999999999)) throw new Error('invalid relay');
    await db.query(
      'INSERT INTO commercial_leads(reference,sequence,received_at,submission) VALUES($1,$2,to_timestamp($3),$4::jsonb) ON CONFLICT(reference) DO NOTHING',
      [entry.submission.requestId,entry.sequence,entry.receivedAt,JSON.stringify(entry.submission)]
    );
  }
  return {processed:items.length};
}

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
  return {cost,total:cost + Math.round(cost * marginBps / 10000),
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
      const [leads, report] = await Promise.all([
        db.query('SELECT reference,received_at,submission,status,follow_up,revision FROM commercial_leads ORDER BY (follow_up<=CURRENT_DATE) DESC NULLS LAST,sequence DESC LIMIT 100'),
        db.query("SELECT submission->>'source' AS source,status,COUNT(*)::int AS count FROM commercial_leads GROUP BY 1,2 ORDER BY 1,2")
      ]);
      return res.json({leads:leads.rows,report:report.rows});
    }
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
      const quote = calculateQuote(body.costs,lead?.submission?.route);
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
