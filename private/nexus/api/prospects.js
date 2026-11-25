import {db} from 'hatchable';

export const access = 'admin';
export const methods = ['GET','POST'];
const industries = ['agriculture','mining','industrial','container','distribution','other'];
const statuses = ['research','qualified','contacted','won','lost'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const text = (value,limit) => typeof value==='string' && value.length<=limit ? value.trim() : '';
function evidence(value) {
  const raw = text(value,1500);
  try {
    const parsed = new URL(raw);
    return parsed.protocol==='https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {return '';}
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0,10)===value;
}

export default async function (req,res) {
  res.setHeader?.('Cache-Control','no-store');
  if (req.method==='GET') {
    const [{rows:prospects},{rows:counts}] = await Promise.all([
      db.query('SELECT * FROM nexus_prospects ORDER BY follow_up ASC NULLS LAST,created_at DESC LIMIT 100'),
      db.query('SELECT industry,status,count(*)::int AS total FROM nexus_prospects GROUP BY industry,status ORDER BY industry,status')
    ]);
    return res.json({prospects,counts});
  }
  if (req.headers?.origin && (req.headers.origin!=='https://mimelchlo-nexus.hatchable.site' ||
      !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({error:'Origin rejected'});
  const body = req.body || {};
  if (body.action==='status') {
    const date = body.followUp || null;
    if (typeof body.id!=='string' || !uuid.test(body.id) || !statuses.includes(body.status) ||
        !Number.isInteger(body.revision) || body.revision<0 || body.revision>=2147483647 ||
        (date && (typeof date!=='string' || !validDate(date)))) return res.status(400).json({error:'Invalid status update'});
    const {rows} = await db.query('UPDATE nexus_prospects SET status=$2,follow_up=$3,revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING revision',
      [body.id,body.status,date,body.revision]);
    return res.status(rows.length?200:409).json(rows[0]||{error:'Reload this prospect'});
  }
  if (body.action!=='create') return res.status(400).json({error:'Invalid action'});
  const business = text(body.business,160);
  const source = evidence(body.source);
  const summary = text(body.summary,1600);
  const location = text(body.location,140);
  const requirement = text(body.requirement,1600);
  const contact = text(body.contact,200);
  const contactEvidence = body.contact ? evidence(body.contactEvidence) : null;
  const estimate = body.estimateCents ?? null;
  const valueEvidence = estimate===null ? null : evidence(body.valueEvidence);
  if (!business || !source || !summary || !location || !requirement || !industries.includes(body.industry) ||
      (body.contact && (!contact || !contactEvidence || body.contactAuthorized!==true)) ||
      (estimate!==null && (!Number.isSafeInteger(estimate) || estimate<0 || estimate>1000000000000 || !valueEvidence))) {
    return res.status(400).json({error:'Evidence and required business details must be provided'});
  }
  const {rows} = await db.query(`INSERT INTO nexus_prospects
    (business_name,evidence_url,evidence_summary,industry,location,requirement,business_contact,contact_evidence,estimate_cents,valuation_evidence)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (business_name,evidence_url) DO NOTHING RETURNING id`,
    [business,source,summary,body.industry,location,requirement,contact||null,contactEvidence,estimate,valueEvidence]);
  return res.status(rows.length?201:409).json(rows[0] || {error:'Duplicate evidence for this business'});
}
