import {gateway,parseJson} from '../lib/provider.js';

const topics = {
  cargo:'Cargo classification and details to collect.',
  equipment:'Vehicle selection questions and compatibility checks for a qualified dispatcher.',
  enquiry:'Prepare a freight enquiry with the information dispatch needs.',
  documents:'Explain typical freight paperwork and when to consult dispatch.',
  customer:'Explain how to ask staff about an existing consignment or quote.'
};
const cargo = ['general','temperature','open','container','bulk','special','unknown'];

export function validateConcierge(body) {
  if (!body || !['en-ZA','af-ZA'].includes(body.language) || !Object.hasOwn(topics,body.topic) || !cargo.includes(body.cargo)) return null;
  return {language:body.language,topic:body.topic,cargo:body.cargo};
}

const providers = {
  async groq(key,input) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000),
      body:JSON.stringify({model:'openai/gpt-oss-20b',max_completion_tokens:350,reasoning_effort:'low',temperature:0.2,messages:[
        {role:'system',content:'Give a short general logistics checklist in the requested language. Do not quote prices, prescribe payload limits, certify a vehicle or route, promise booking, invent contacts, or imply access to customer data. Tell users to confirm requirements with dispatch.'},
        {role:'user',content:`Language: ${input.language}. Topic: ${topics[input.topic]} Cargo category: ${input.cargo}.`}
      ]})
    });
    if (!response.ok) throw new Error('AI unavailable');
    const result = await parseJson(response.body,32000);
    return result.choices?.[0]?.message?.content;
  }
};
function configuration(env) {
  if (env.CONCIERGE_ENABLED !== '1' || !Object.hasOwn(providers,env.CONCIERGE_PROVIDER) || !env.GROQ_API_KEY) return null;
  return {provider:env.CONCIERGE_PROVIDER,key:env.GROQ_API_KEY};
}
async function describe(config,input) {
  const text = await providers[config.provider](config.key,input);
  if (typeof text!=='string' || !text.trim() || text.length>1600 || /(?:\bZAR\b|\bUSD\b|(?:\bR|[$€£])\s*\d)/iu.test(text)) throw new Error('Invalid response');
  return {guidance:text.trim(),advisory:true};
}

export const onRequest = gateway('concierge',configuration,validateConcierge,describe,{cap:24,perClient:6,cacheSeconds:86400});
