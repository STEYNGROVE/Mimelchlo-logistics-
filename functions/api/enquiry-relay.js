import {sha256} from './enquiries.js';

function reply(status, body) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
}

export async function onRequest({request, env}) {
  if (request.method !== 'GET') return reply(405, {error:'method'});
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f\d]{64})$/)?.[1];
  if (!token || !env.ENQUIRY_RELAY_HASH) return reply(401, {error:'unauthorized'});
  const provided = await sha256(token);
  const expected = env.ENQUIRY_RELAY_HASH;
  let mismatch = provided.length ^ expected.length;
  for (let i = 0; i < provided.length; i++) mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch) return reply(401, {error:'unauthorized'});
  if (!env.ENQUIRIES) return reply(503, {error:'unavailable'});
  const after = Number(new URL(request.url).searchParams.get('after') || '0');
  if (!Number.isSafeInteger(after) || after < 0) return reply(400, {error:'invalid'});
  try {
    const {results} = await env.ENQUIRIES.prepare('SELECT sequence,payload,received_at FROM enquiries WHERE sequence > ? ORDER BY sequence LIMIT 30').bind(after).all();
    return reply(200, {items:results.map(row => ({sequence:row.sequence, receivedAt:row.received_at, submission:JSON.parse(row.payload)}))});
  } catch {
    return reply(503, {error:'unavailable'});
  }
}
