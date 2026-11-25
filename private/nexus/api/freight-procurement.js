import {db} from 'hatchable';

export const access = 'admin';
export const methods = ['GET','POST'];

export default async function (req,res) {
  res.setHeader?.('Cache-Control','no-store');
  if (req.method==='POST') {
    if (req.headers?.origin && (req.headers.origin!=='https://mimelchlo-nexus.hatchable.site' ||
        !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({error:'Origin rejected'});
    const {reference,decision,reason,releaseAt} = req.body || {};
    if (typeof reference!=='string' || reference.length>180 || !['verified','rejected'].includes(decision) ||
        typeof reason!=='string' || !reason.trim() || reason.length>1000 || typeof releaseAt!=='string' ||
        releaseAt.length>32 || !Number.isFinite(Date.parse(releaseAt))) return res.status(400).json({error:'Invalid review'});
    const {rows} = await db.query(`UPDATE freight_procurement_candidates
      SET review_status=$2, review_reason=$3, reviewed_at=now()
      WHERE reference=$1 AND release_at=$4::timestamptz AND review_status='pending'
        AND ($2='rejected' OR (closes_at>now() AND lower(source_status)='active')) RETURNING reference`,
      [reference,decision,reason.trim(),releaseAt]);
    return res.status(rows.length?200:409).json(rows[0] || {error:'Candidate changed, expired or lacks confirmed active status'});
  }
  const [{rows:[cursor]},{rows}] = await Promise.all([
    db.query(`SELECT window_start,next_page,last_checked,last_error,retry_after,pages_processed FROM freight_source_cursor WHERE source='treasury-ocds'`),
    db.query(`SELECT reference,source_url,release_at,title,buyer,closes_at,source_status,match_evidence,review_status,review_reason,
      CASE WHEN lower(source_status) IN ('complete','cancelled','unsuccessful','withdrawn','awarded') THEN 'closed'
        WHEN closes_at<=now() THEN 'expired' WHEN closes_at IS NULL THEN 'deadline unknown'
        WHEN lower(source_status)='active' THEN 'active at source' ELSE 'status unconfirmed' END AS state
      FROM freight_procurement_candidates ORDER BY release_at DESC LIMIT 100`)
  ]);
  return res.json({cursor:cursor||null,candidates:rows});
}
