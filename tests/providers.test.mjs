import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as routing,validateRouting} from '../functions/api/routing.js';
import {onRequest as concierge,validateConcierge} from '../functions/api/concierge.js';
import {accountConfig,onRequest as account} from '../functions/api/account.js';
import {gateway} from '../functions/lib/provider.js';

const origin = 'https://example.invalid';
function post(body,from=origin) {
  return new Request(origin+'/api/routing',{method:'POST',headers:{
    Origin:from,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.9'
  },body:JSON.stringify(body)});
}
function storage() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../private/provider-usage.sql',import.meta.url),'utf8'));
  return {prepare(sql) {
    const statement = db.prepare(sql);
    return {bind(...params) {
      const explicit = Array.from(new Set(sql.match(/\?\d+/g) || []));
      const args = explicit.length ? [Object.fromEntries(explicit.map(key=>[key,params[Number(key.slice(1))-1]]))] : params;
      return {first:async()=>statement.get(...args),run:async()=>statement.run(...args)};
    }};
  }};
}

test('providers fail closed and reject cross-origin requests',async () => {
  for (const handler of [routing,concierge]) {
    const config = await handler({request:new Request(origin),env:{}});
    assert.deepEqual(await config.json(),{available:false});
    assert.equal((await handler({request:post({}),env:{}})).status,503);
    assert.equal((await handler({request:post({},'https://else.invalid'),env:{}})).status,403);
  }
});

test('routing accepts South African multi-stop input and bounds location data',() => {
  assert.deepEqual(validateRouting({operation:'route',coordinates:[[28,-26],[31,-29],[28,-33]],returnTrip:true}),
    {operation:'route',coordinates:[[28,-26],[31,-29],[28,-33]],returnTrip:true});
  assert.equal(validateRouting({operation:'route',coordinates:[[28,-26],[28,-26]]}),null);
  assert.equal(validateRouting({operation:'route',coordinates:[[0,0],[28,-26]]}),null);
  assert.equal(validateRouting({operation:'search',query:' '.repeat(121)}),null);
  assert.equal(validateRouting({operation:'search',query:'person@example.invalid'}),null);
});

test('concierge strips free text and accepts only allowlisted advisory context',() => {
  assert.deepEqual(validateConcierge({language:'af-ZA',topic:'cargo',cargo:'bulk',message:'discarded'}),
    {language:'af-ZA',topic:'cargo',cargo:'bulk'});
  assert.equal(validateConcierge({language:'af-ZA',topic:'pricing',cargo:'bulk'}),null);
});

test('gateway enforces a durable quota and reuses cached non-personal results',async () => {
  let calls = 0;
  const env = {ENQUIRIES:storage(),ENQUIRY_PEPPER:'unit-test'};
  const handler = gateway('test',()=>true,input=>input,async (_config,input)=>{
    calls++;
    return {answer:input.value};
  },{cap:1,perClient:1,cacheSeconds:30});
  const run = body => handler({request:post(body),env});
  assert.deepEqual(await (await run({value:1})).json(),{answer:1});
  assert.deepEqual(await (await run({value:1})).json(),{answer:1});
  assert.equal((await run({value:2})).status,429);
  assert.equal((await run({value:'x'.repeat(4097)})).status,400);
  assert.equal(calls,1);
});

test('account availability requires an explicit switch and a publishable key',async () => {
  const env = {CUSTOMER_PORTAL_ENABLED:'1',SUPABASE_PROJECT_REF:'a'.repeat(20),SUPABASE_PUBLISHABLE_KEY:'sb_secret_'+ 'a'.repeat(24)};
  assert.equal(accountConfig(env),null);
  env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_'+ 'a'.repeat(24);
  assert.equal(accountConfig(env).url,'https://'+'a'.repeat(20)+'.supabase.co');
  const request = new Request(origin+'/api/account?status=1');
  assert.deepEqual(await (await account({request,env})).json(),{available:false});
});
