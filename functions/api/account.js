import {digest,json,parseJson} from '../lib/provider.js';

const authCookie = '__Secure-nexus-access';
const refreshCookie = '__Secure-nexus-refresh';
const documentBucket = 'nexus-customer-documents';
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function accountConfig(env) {
  if (env.CUSTOMER_PORTAL_ENABLED !== '1' || !/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF || '') ||
      !/^sb_publishable_[a-zA-Z0-9_-]{20,120}$/.test(env.SUPABASE_PUBLISHABLE_KEY || '')) return null;
  return {url:'https://'+env.SUPABASE_PROJECT_REF+'.supabase.co',key:env.SUPABASE_PUBLISHABLE_KEY};
}

function cookie(request,name) {
  return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
}
const restricted = (name,value,age) => `${name}=${value}; Max-Age=${age}; Path=/api/account; Secure; HttpOnly; SameSite=Strict`;
const token = value => typeof value==='string' && /^[A-Za-z\d_.-]{6,8192}$/.test(value);

function session(value) {
  if (!token(value.access_token) || !token(value.refresh_token)) return json(502,{error:'session'});
  const result = json(200,{signedIn:true});
  result.headers.append('Set-Cookie',restricted(authCookie,value.access_token,Math.min(3600,Number(value.expires_in)||900)));
  result.headers.append('Set-Cookie',restricted(refreshCookie,value.refresh_token,604800));
  return result;
}

function clear() {
  const result = json(200,{signedIn:false});
  result.headers.append('Set-Cookie',restricted(authCookie,'',0));
  result.headers.append('Set-Cookie',restricted(refreshCookie,'',0));
  return result;
}

function upstream(config,path,{bearer,body,method='GET',profile}={}) {
  const headers = {apikey:config.key};
  if (bearer) headers.Authorization = 'Bearer '+bearer;
  if (profile) headers[method==='GET'?'Accept-Profile':'Content-Profile'] = 'nexus_customer';
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(config.url+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(7000),...(body?{body:JSON.stringify(body)}:{})});
}
const auth = (config,path,body,method='POST',bearer) => upstream(config,'/auth/v1/'+path,{method,body,bearer});
const query = (config,path,bearer) => upstream(config,'/rest/v1/'+path,{bearer,profile:true});
const emailOK = value => typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const passwordOK = value => typeof value==='string' && value.length>=12 && value.length<=72 && new TextEncoder().encode(value).length<=72;
const codeOK = value => typeof value==='string' && /^\d{6,10}$/.test(value);

async function allow(request,env,action) {
  const client = request.headers.get('CF-Connecting-IP');
  if (!client || !env.ENQUIRIES || !env.ENQUIRY_PEPPER) return false;
  const day = new Date().toISOString().slice(0,10);
  const key = await digest(env.ENQUIRY_PEPPER+':'+day+':'+client);
  const mail = ['register','recover'].includes(action);
  const admission = await env.ENQUIRIES.prepare(`
    INSERT INTO provider_calls(service,day,client_key)
    SELECT ?1,?2,?3
    WHERE (SELECT count(*) FROM provider_calls WHERE service=?1 AND day=?2)<?4
      AND (SELECT count(*) FROM provider_calls WHERE service=?1 AND day=?2 AND client_key=?3)<?5
    RETURNING id
  `).bind(mail?'account-mail':'account-auth',day,key,mail?24:200,mail?3:20).first();
  return Boolean(admission);
}

async function accountData(config,request,bearer) {
  if (!token(bearer)) return json(401,{error:'session'});
  const ref = new URL(request.url).searchParams.get('document');
  if (ref!==null) {
    if (!uuid.test(ref)) return json(404,{error:'missing'});
    const result = await query(config,'documents?select=object_name&id=eq.'+ref+'&limit=1',bearer);
    if (!result.ok) return json(result.status===401?401:503,{error:'unavailable'});
    const [record] = await parseJson(result.body,4096);
    if (!record?.object_name || !/^[\da-f-]{36}\/[A-Za-z0-9_.\/-]{1,160}$/i.test(record.object_name) ||
        record.object_name.split('/').some(part=>part==='.' || part==='..' || !part)) return json(404,{error:'missing'});
    const objectPath = record.object_name.split('/').map(encodeURIComponent).join('/');
    const remote = await upstream(config,'/storage/v1/object/authenticated/'+documentBucket+'/'+objectPath,{bearer});
    if (!remote.ok) return json(remote.status===401?401:404,{error:'missing'});
    return new Response(remote.body,{headers:{
      'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="nexus-document"',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
    }});
  }
  const selections = {
    profiles:'display_name',
    organizations:'id,name',
    shipments:'id,organization_id,reference,status,status_at&order=status_at.desc',
    quotations:'id,organization_id,reference,amount_cents,published_at&order=published_at.desc',
    documents:'id,organization_id,title,published_at&order=published_at.desc'
  };
  const records = await Promise.all(Object.entries(selections).map(async ([table,fields])=>{
    const result = await query(config,table+'?select='+fields+'&limit=50',bearer);
    return [table,result];
  }));
  if (records.some(([,result])=>result.status===401)) return json(401,{error:'session'});
  if (records.some(([,result])=>!result.ok)) return json(503,{error:'unavailable'});
  return json(200,Object.fromEntries(await Promise.all(records.map(async ([table,result])=>[table,await parseJson(result.body,55000)]))));
}

async function mutate(config,request,env,body) {
  const action = body?.action;
  const bearer = cookie(request,authCookie);
  if (action==='logout') {
    if (token(bearer)) await auth(config,'logout?scope=local',null,'POST',bearer).catch(()=>{});
    return clear();
  }
  if (action==='refresh') {
    const refresh = cookie(request,refreshCookie);
    if (!token(refresh)) return clear();
    const result = await auth(config,'token?grant_type=refresh_token',{refresh_token:refresh});
    return result.ok ? session(await parseJson(result.body,30000)) : clear();
  }
  if (action==='profile') {
    const name = typeof body.name==='string' ? body.name.trim() : '';
    if (!name || name.length>120) return json(400,{error:'invalid'});
    if (!token(bearer)) return json(401,{error:'session'});
    const saved = await upstream(config,'/rest/v1/profiles',{method:'PATCH',body:{display_name:name},bearer,profile:true});
    if (!saved.ok) return json(saved.status===401?401:503,{error:'unavailable'});
    const existing = await query(config,'profiles?select=display_name&limit=1',bearer);
    if (!existing.ok) return json(existing.status===401?401:503,{error:'unavailable'});
    if ((await parseJson(existing.body,4096)).length) return json(200,{saved:true});
    const created = await upstream(config,'/rest/v1/profiles',{method:'POST',body:{display_name:name},bearer,profile:true});
    return created.ok ? json(200,{saved:true}) : json(503,{error:'unavailable'});
  }
  if (!['register','recover','verify','reset','login'].includes(action) || !emailOK(body.email) ||
      (['register','reset','login'].includes(action) && !passwordOK(body.password)) ||
      (['verify','reset'].includes(action) && !codeOK(body.code))) return json(400,{error:'invalid'});
  if (!(await allow(request,env,action))) return json(429,{error:'limit'});
  const email = body.email.trim();
  if (action==='register' || action==='recover') {
    const result = await auth(config,action==='register'?'signup':'recover',action==='register'?{email,password:body.password}:{email});
    // Return the same response for duplicate or unknown addresses.
    if (result.status===429) return json(429,{error:'limit'});
    if (result.status>=500) return json(503,{error:'unavailable'});
    return json(200,{checkEmail:true});
  }
  if (action==='login') {
    const result = await auth(config,'token?grant_type=password',{email,password:body.password});
    return result.ok ? session(await parseJson(result.body,30000)) : json(401,{error:'login'});
  }
  const verified = await auth(config,'verify',{email,token:body.code,type:action==='reset'?'recovery':'email'});
  if (!verified.ok) return json(401,{error:'verification'});
  const verifiedSession = await parseJson(verified.body,30000);
  if (action==='verify') return session(verifiedSession);
  if (!token(verifiedSession.access_token)) return json(502,{error:'session'});
  const updated = await auth(config,'user',{password:body.password},'PUT',verifiedSession.access_token);
  await auth(config,'logout?scope=global',null,'POST',verifiedSession.access_token).catch(()=>{});
  return updated.ok ? clear() : json(400,{error:'password'});
}

export async function onRequest({request,env}) {
  const config = accountConfig(env);
  const url = new URL(request.url);
  if (request.method==='GET' && url.searchParams.has('status')) return json(200,{available:Boolean(config && env.ENQUIRIES && env.ENQUIRY_PEPPER)});
  if (!['GET','POST'].includes(request.method)) return json(405,{error:'method'});
  if (request.method==='POST' && request.headers.get('Origin')!==url.origin) return json(403,{error:'origin'});
  if (!config || !env.ENQUIRIES || !env.ENQUIRY_PEPPER) return json(503,{error:'unavailable'});
  try {
    if (request.method==='GET') return await accountData(config,request,cookie(request,authCookie));
    if (request.headers.get('Content-Type')?.split(';')[0]!=='application/json') return json(415,{error:'type'});
    let body;
    try { body = await parseJson(request.body,2048); } catch { return json(400,{error:'invalid'}); }
    return await mutate(config,request,env,body);
  } catch {
    return json(503,{error:'unavailable'});
  }
}
