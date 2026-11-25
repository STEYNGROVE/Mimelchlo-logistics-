import {db} from 'hatchable';

const base = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const keywords = /\b(freight|haulage|cartage|linehaul|bulk transport|cargo transport|container transport|transport(?:ation)? of (?:goods|coal|materials|cargo|containers|equipment|produce|fuel|water|commodities))\b/i;
const timeoutMs = 12_000;
const pageSize = 2;

function urlFor(start,end,page) {
  return base + '?' + new URLSearchParams({dateFrom:start,dateTo:end,PageNumber:String(page),PageSize:String(pageSize)});
}

function checkedNext(next,start,end,page) {
  if (!next) return false;
  const parsed = new URL(next);
  const expected = new URL(urlFor(start,end,page+1));
  const canonical = url => JSON.stringify([...url.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)));
  if (parsed.origin!==expected.origin || parsed.pathname!==expected.pathname || parsed.username || parsed.password ||
      parsed.hash || canonical(parsed)!==canonical(expected)) throw new Error('Unexpected pagination');
  return true;
}

async function readPackage(url) {
  const response = await fetch(url,{headers:{Accept:'application/json'},redirect:'error',timeout_ms:timeoutMs});
  if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
  const limit = 2_000_000;
  if (Number(response.headers.get('Content-Length'))>limit) throw new Error('Upstream response size limit');
  const text = await response.text();
  if (text.length>limit) throw new Error('Upstream response size limit');
  return JSON.parse(text);
}

const date = value=>typeof value==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;
const clean = (text,n)=>typeof text==='string' ? text.trim().slice(0,n) : '';

function candidates(releases,sourceUrl) {
  const selected = new Map();
  for (const item of releases) {
    const reference = clean(item?.ocid,180);
    const release_at = date(item?.date);
    const title = clean(item?.tender?.title,500);
    const match = keywords.exec(title + ' ' + clean(item?.tender?.description,12000));
    if (!reference || !release_at || !title || !match) continue;
    if (selected.get(reference)?.release_at > release_at) continue;
    selected.set(reference,{reference,source_url:sourceUrl,release_at,title,buyer:clean(item.buyer?.name,240)||null,
      closes_at:date(item.tender?.tenderPeriod?.endDate),source_status:clean(item.tender?.status,80)||null,match_evidence:match[0]});
  }
  return [...selected.values()];
}

export async function discover() {
  await db.query(`INSERT INTO freight_source_cursor(source,window_start) VALUES
    ('treasury-ocds',(now() AT TIME ZONE 'UTC')::date - 2) ON CONFLICT DO NOTHING`);
  const {rows:[state]} = await db.query(`
    UPDATE freight_source_cursor SET lease=gen_random_uuid(), lease_until=now()+interval '90 seconds'
    WHERE source='treasury-ocds' AND (lease_until IS NULL OR lease_until<now())
      AND (retry_after IS NULL OR retry_after<=now()) AND window_start+1 <= (now() AT TIME ZONE 'UTC')::date
    RETURNING lease::text, window_start::text AS start, (window_start+1)::text AS end, next_page
  `);
  if (!state) return {outcome:'idle'};
  const {lease,start,end,next_page:page} = state;
  const sourceUrl = urlFor(start,end,page);
  try {
    const pkg = await readPackage(sourceUrl);
    if (!Array.isArray(pkg?.releases) || pkg.releases.length>pageSize) throw new Error('Invalid release package');
    const more = checkedNext(pkg.links?.next,start,end,page);
    if (more && !pkg.releases.length) throw new Error('Empty non-terminal page');
    const items = candidates(pkg.releases,sourceUrl);
    const {rows:[result]} = await db.query(`
      WITH advanced AS (
        UPDATE freight_source_cursor SET next_page=CASE WHEN $2 THEN next_page+1 ELSE 1 END,
          window_start=CASE WHEN $2 THEN window_start ELSE window_start+1 END,
          lease=NULL,lease_until=NULL,retry_after=NULL,failures=0,last_checked=now(),last_error=NULL,pages_processed=pages_processed+1
        WHERE source='treasury-ocds' AND lease=$1::uuid RETURNING source
      ), saved AS (
        INSERT INTO freight_procurement_candidates(reference,source_url,release_at,title,buyer,closes_at,source_status,match_evidence)
        SELECT reference,source_url,release_at,title,buyer,closes_at,source_status,match_evidence
        FROM jsonb_to_recordset($3::jsonb) AS i(reference text,source_url text,release_at timestamptz,title text,buyer text,
          closes_at timestamptz,source_status text,match_evidence text)
        WHERE EXISTS(SELECT 1 FROM advanced)
        ON CONFLICT(reference) DO UPDATE SET source_url=excluded.source_url,release_at=excluded.release_at,title=excluded.title,
          buyer=excluded.buyer,closes_at=excluded.closes_at,source_status=excluded.source_status,match_evidence=excluded.match_evidence,
          review_status='pending',review_reason=NULL,reviewed_at=NULL
        WHERE excluded.release_at>freight_procurement_candidates.release_at RETURNING 1
      ) SELECT (SELECT count(*) FROM advanced)::int AS advanced,(SELECT count(*) FROM saved)::int AS candidates
    `,[lease,more,JSON.stringify(items)]);
    return {outcome:result.advanced?'processed':'lease-replaced',candidates:result.candidates};
  } catch (error) {
    const message = String(error?.message || '');
    const reason = /^(Upstream HTTP \d{3}|Upstream body unavailable|Upstream response size limit|Unexpected pagination|Invalid release package|Empty non-terminal page)$/.test(message)
      ? message : 'Treasury request or processing failed';
    await db.query(`UPDATE freight_source_cursor SET lease=NULL,lease_until=NULL,last_checked=now(),last_error=$2,
      retry_after=now()+make_interval(hours=>least(24, 1 << least(failures,4))),failures=failures+1
      WHERE source='treasury-ocds' AND lease=$1::uuid`,[lease,reason]);
    return {outcome:'retry',reason};
  }
}
