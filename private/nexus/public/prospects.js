'use strict';

const path = '/api/prospects';
const status = document.getElementById('prospect-status');
const form = document.getElementById('prospect-form');
const list = document.getElementById('prospect-list');
const counts = document.getElementById('prospect-counts');
const money = new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});

function el(tag,text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
async function query(body) {
  const response = await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Prospect service unavailable');
  return result;
}
async function save(button,action) {
  button.disabled = true;
  try { await action();status.textContent='Saved.'; }
  catch (error) { status.textContent=error.message; }
  finally {button.disabled=false;}
}
function followUp(prospect) {
  const update = el('form');
  const date = el('input');
  date.type = 'date';
  date.value = prospect.follow_up?.slice(0,10)||'';
  const stage = el('select');
  for (const name of ['research','qualified','contacted','won','lost']) stage.add(new Option(name,name));
  stage.value = prospect.status;
  const statusLabel = el('label','Follow-up status');
  statusLabel.append(stage);
  const dateLabel = el('label','Next follow-up date');
  dateLabel.append(date);
  const button = el('button','Update follow-up');
  update.append(statusLabel,dateLabel,button);
  update.addEventListener('submit',event=>{
    event.preventDefault();
    save(button,async ()=>{
      await query({action:'status',id:prospect.id,revision:prospect.revision,status:stage.value,followUp:date.value});
      await refresh();
    });
  });
  return update;
}
async function refresh() {
  const result = await query();
  counts.replaceChildren(...result.counts.map(item=>el('li',`${item.industry} · ${item.status} · ${item.total}`)));
  if (!result.counts.length) counts.append(el('li','No prospect outcomes recorded.'));
  list.replaceChildren();
  for (const prospect of result.prospects) {
    const section = el('section');
    const source = el('a','Original evidence');
    source.href = prospect.evidence_url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    const estimate = prospect.estimate_cents===null ? 'Value unknown' : 'Evidence-supported estimate ' + money.format(Number(prospect.estimate_cents)/100);
    section.append(el('h3',prospect.business_name),el('p',`${prospect.industry} · ${prospect.location} · ${estimate}`),
      el('p',prospect.evidence_summary),source,el('p',prospect.requirement),followUp(prospect));
    if (prospect.business_contact) section.append(el('p','Authorized business contact · '+prospect.business_contact));
    const details = el('details');
    details.append(el('summary','Prepare outreach and quote-request draft'),el('pre',
      `Draft for review\n\nHello ${prospect.business_name},\n\nMimelchlo Logistics would like to discuss the following transport requirement in ${prospect.location}: ${prospect.requirement}\n\nIf this requirement is current, could you share the collection and delivery locations, cargo dimensions and gross mass, frequency, equipment needs and timing? We can then prepare a quotation for review.\n\nKind regards,\nMimelchlo Logistics`));
    section.append(details);
    list.append(section);
  }
  if (!result.prospects.length) list.append(el('p','No evidence-backed prospects recorded.'));
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  save(event.submitter,async ()=>{
    const {estimate,contactAuthorized,...fields} = Object.fromEntries(new FormData(form));
    await query({action:'create',...fields,contactAuthorized:contactAuthorized==='yes',estimateCents:estimate?Math.round(Number(estimate)*100):null});
    form.reset();
    await refresh();
  });
});
refresh().catch(error=>{status.textContent=error.message;});
