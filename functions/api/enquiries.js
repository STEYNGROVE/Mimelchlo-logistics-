const kinds = new Set(['Spot quotation', 'Repeat transport', 'Backhaul enquiry', 'Commercial contract']);
const sources = new Set(['direct', 'search', 'social', 'referral', 'campaign']);
const responseHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

function reply(status, body) {
  return Response.json(body, {status, headers:responseHeaders});
}

export async function sha256(input) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty');
  let length = 0;
  let body = '';
  const decoder = new TextDecoder('utf-8', {fatal:true});
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      length += value.byteLength;
      if (length > 8192) throw new Error('size');
      body += decoder.decode(value, {stream:true});
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}

function field(value, length) {
  return typeof value === 'string' && value.length <= length ? value.trim() : '';
}

export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const kind = field(input.kind, 32);
  const company = field(input.company, 120);
  const email = field(input.email, 254);
  const notes = field(input.notes, 2000);
  const date = field(input.date, 10);
  const configuration = field(input.configuration, 80);
  const source = sources.has(input.source) ? input.source : 'direct';
  const requestId = field(input.requestId, 36);
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(requestId) ||
    !kinds.has(kind) || !company || !notes || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    input.consent !== true || input.website !== '') return null;
  if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) return null;
  const plan = input.plan;
  let route = null;
  if (plan && typeof plan === 'object') {
    const {distance, mass, pallets} = plan;
    const from = field(plan.from, 100);
    const to = field(plan.to, 100);
    const cargo = field(plan.cargo, 32);
    if (!from || !to || !cargo || !Number.isFinite(distance) || distance < 1 || distance > 100000 ||
      !Number.isInteger(mass) || mass < 1 || mass > 1000000 ||
      !Number.isInteger(pallets) || pallets < 0 || pallets > 1000) return null;
    route = {from,to,cargo,distance,mass,pallets,distanceSource:'customer-entered'};
  }
  return {requestId, kind, company, email, notes, date, configuration, source, route};
}

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  if (request.method === 'GET') return reply(env.ENQUIRIES && env.ENQUIRY_PEPPER ? 200 : 503, {available:Boolean(env.ENQUIRIES && env.ENQUIRY_PEPPER)});
  if (request.method !== 'POST') return reply(405, {error:'method'});
  if (request.headers.get('Origin') !== url.origin) return reply(403, {error:'origin'});
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(415, {error:'type'});
  if (!env.ENQUIRIES || !env.ENQUIRY_PEPPER) return reply(503, {error:'unavailable'});
  let input;
  try { input = validate(await readBody(request)); } catch { return reply(400, {error:'invalid'}); }
  if (!input) return reply(400, {error:'invalid'});
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return reply(503, {error:'unavailable'});
  const payload = JSON.stringify(input);
  try {
    const day = new Date().toISOString().slice(0, 10);
    const [region, hash] = await Promise.all([sha256(env.ENQUIRY_PEPPER + ':' + day + ':' + ip),sha256(payload)]);
    const inserted = await env.ENQUIRIES.prepare(`
      INSERT INTO enquiries(request_id,payload,region_key,content_hash)
      SELECT ?1,?2,?3,?4
      WHERE (SELECT COUNT(*) FROM enquiries WHERE region_key=?3 AND received_at > unixepoch()-3600)<6
        AND (SELECT COUNT(*) FROM enquiries WHERE received_at > unixepoch()-86400)<150
      ON CONFLICT(request_id) DO NOTHING RETURNING request_id
    `).bind(input.requestId,payload,region,hash).first();
    if (inserted) return reply(201, {reference:inserted.request_id});
    const previous = await env.ENQUIRIES.prepare('SELECT content_hash FROM enquiries WHERE request_id=?').bind(input.requestId).first();
    if (!previous) return reply(429, {error:'limit'});
    if (previous.content_hash !== hash) return reply(409, {error:'conflict'});
    return reply(200, {reference:input.requestId});
  } catch {
    return reply(503, {error:'unavailable'});
  }
}
