export const json = (status, value) => Response.json(value, {
  status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});

export async function parseJson(stream, limit) {
  const reader = stream?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let size = 0;
  let text = '';
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > limit) throw new Error('Body limit');
      text += decoder.decode(value,{stream:true});
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function digest(text) {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}

export function gateway(name, configuration, validate, invoke, {cap, perClient, cacheSeconds = 0}) {
  return async ({request, env}) => {
    const config = configuration(env);
    const available = Boolean(config && env.ENQUIRIES && env.ENQUIRY_PEPPER);
    if (request.method === 'GET') return json(200,{available});
    if (request.method !== 'POST') return json(405,{error:'method'});
    if (request.headers.get('Origin') !== new URL(request.url).origin) return json(403,{error:'origin'});
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json(415,{error:'type'});
    if (!available) return json(503,{error:'unavailable'});
    let input;
    try { input = validate(await parseJson(request.body,4096)); } catch { return json(400,{error:'invalid'}); }
    if (!input) return json(400,{error:'invalid'});
    const client = request.headers.get('CF-Connecting-IP');
    if (!client) return json(503,{error:'unavailable'});
    try {
      const db = env.ENQUIRIES;
      const day = new Date().toISOString().slice(0,10);
      const now = Math.floor(Date.now()/1000);
      const clientKey = await digest(env.ENQUIRY_PEPPER + ':' + day + ':' + client);
      const cacheKey = cacheSeconds ? await digest(JSON.stringify(input)) : '';
      if (cacheKey) {
        const cached = await db.prepare('SELECT payload FROM provider_cache WHERE service=? AND cache_key=? AND expires_at>?')
          .bind(name,cacheKey,now).first();
        if (cached) return json(200,JSON.parse(cached.payload));
      }
      const token = await db.prepare(`
        INSERT INTO provider_calls(service,day,client_key)
        SELECT ?1,?2,?3
        WHERE (SELECT COUNT(*) FROM provider_calls WHERE service=?1 AND day=?2)<?4
          AND (SELECT COUNT(*) FROM provider_calls WHERE service=?1 AND day=?2 AND client_key=?3)<?5
        RETURNING id
      `).bind(name,day,clientKey,cap,perClient).first();
      if (!token) return json(429,{error:'quota'});
      const result = await invoke(config,input);
      const output = JSON.stringify(result);
      if (cacheKey) {
        await db.prepare(`INSERT INTO provider_cache(service,cache_key,payload,expires_at) VALUES(?,?,?,?)
          ON CONFLICT(service,cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`)
          .bind(name,cacheKey,output,now+cacheSeconds).run();
      }
      return json(200,result);
    } catch {
      return json(502,{error:'provider'});
    }
  };
}
