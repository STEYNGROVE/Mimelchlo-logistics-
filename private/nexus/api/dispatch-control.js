import {db} from 'hatchable';

export const access = 'admin';
export const methods = ['GET','POST'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const stamp = value => typeof value==='string' && value.length<=35 && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const transitions = ['dispatched','collected','delivered','closed','cancelled'];

export default async function (req,res) {
  res.setHeader?.('Cache-Control','no-store');
  if (req.method==='POST') {
    if (req.headers?.origin && (req.headers.origin!=='https://mimelchlo-nexus.hatchable.site' ||
        !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({error:'Origin rejected'});
    const body = req.body || {};
    const actor = req.member?.account_id ?? req.member?.id ?? req.member?.handle;
    if ((typeof actor!=='string' && typeof actor!=='number') || !String(actor).trim()) return res.status(403).json({error:'An attributable staff identity is required'});
    try {
      if (body.action==='reserve') {
        const {shipment,vehicle,trailer,driver,departure,expectedReturn} = body;
        if (![shipment,vehicle,trailer,driver].every(value=>typeof value==='string' && uuid.test(value)) ||
            !stamp(departure) || !stamp(expectedReturn)) return res.status(400).json({error:'Invalid reservation'});
        const {rows:[result]} = await db.query('SELECT nexus_reserve_dispatch($1,$2,$3,$4,$5,$6,$7) AS id',
          [shipment,vehicle,trailer,driver,departure,expectedReturn,String(actor).slice(0,160)]);
        return res.status(201).json(result);
      }
      if (body.action==='transition' && typeof body.job==='string' && uuid.test(body.job) &&
          transitions.includes(body.status) && Number.isInteger(body.version) && body.version>=0 && body.version<2147483647) {
        const {rows:[result]} = await db.query('SELECT nexus_transition_dispatch($1,$2,$3,$4) AS version',
          [body.job,body.status,body.version,String(actor).slice(0,160)]);
        return res.json(result);
      }
      return res.status(400).json({error:'Invalid operation'});
    } catch {
      return res.status(409).json({error:'Dispatch disabled, required evidence missing, or assignment conflicts with current records'});
    }
  }
  const [{rows:[control]},{rows:jobs}] = await Promise.all([
    db.query('SELECT enabled,policy_reference FROM nexus_dispatch_control WHERE singleton'),
    db.query('SELECT id,shipment_id,vehicle_id,trailer_id,driver_id,departure,expected_return,status,version FROM nexus_dispatch_jobs ORDER BY created_at DESC LIMIT 100')
  ]);
  return res.json({control,jobs});
}
