'use strict';

const select = document.getElementById('leads');
const status = document.getElementById('status');
const detail = document.getElementById('detail');
const leadForm = document.getElementById('lead');
const quoteForm = document.getElementById('quote');
const rand = new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});
let leads = [];

async function api(data, reference) {
  const url = '/api/commercial' + (reference ? '?reference=' + encodeURIComponent(reference) : '');
  const response = await fetch(url, data ? {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  } : {cache:'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Access required');
  return result;
}

function row(text, list) {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
  return item;
}

async function showLead() {
  const lead = leads.find(item => item.reference === select.value);
  detail.hidden = !lead;
  if (!lead) return;
  const {submission} = lead;
  const route = submission.route;
  document.getElementById('details').textContent = [
    submission.company,submission.email,submission.kind,submission.configuration,submission.date,submission.notes,
    route && [route.from + ' → ' + route.to,route.distance + ' km (customer-entered)',route.cargo,route.mass + ' kg',route.pallets + ' pallets'].join(' · ')
  ].filter(Boolean).join('\n');
  leadForm.elements.status.value = lead.status;
  leadForm.elements.followUp.value = lead.follow_up?.slice(0,10) || '';
  quoteForm.reset();
  quoteForm.elements.km.value = route ? Math.ceil(route.distance) : '';
  const list = document.getElementById('quotes');
  list.replaceChildren();
  const {quotes} = await api(null,lead.reference);
  if (select.value !== lead.reference) return;
  for (const quote of quotes) {
    const label = 'Quote ' + quote.id + ' · ' + rand.format(Number(quote.total_cents)/100) + ' before tax · ' +
      (quote.approved_at ? 'Approved internally' : 'Draft') + ' · ' + quote.terms.km + ' km';
    const item = row(label,list);
    if (quote.approved_at) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Approve internally';
    button.addEventListener('click', () => perform(button, async () => {
      await api({action:'approve',reference:lead.reference,quoteId:Number(quote.id)});
      await showLead();
      return 'Quote approved for internal review. Nothing sent.';
    }));
    item.append(' ',button);
  }
  if (!quotes.length) row('No quotes for this enquiry.',list);
}

async function refresh() {
  const prior = select.value;
  const result = await api();
  leads = result.leads;
  select.replaceChildren(new Option('Choose an enquiry',''));
  for (const lead of leads) select.add(new Option(lead.submission.company + ' · ' + lead.status + ' · ' + (lead.follow_up?.slice(0,10)||'no follow-up'),lead.reference));
  select.value = leads.some(lead => lead.reference === prior) ? prior : '';
  const report = document.getElementById('report');
  report.replaceChildren();
  for (const metric of result.report) row(metric.source + ' · ' + metric.status + ' · ' + metric.count,report);
  if (!result.report.length) row('No enquiries imported.',report);
  await showLead();
}

async function perform(button, action) {
  if (button) button.disabled = true;
  try { status.textContent = (await action()) || ''; }
  catch (error) { status.textContent = error.message; }
  finally { if (button) button.disabled = false; }
}
document.getElementById('sync').addEventListener('click',event => perform(event.currentTarget,async () => {
  const result = await api({action:'sync'});
  await refresh();
  return result.processed + ' enquiries processed. Run again to check for another batch.';
}));
select.addEventListener('change',() => perform(null,showLead));
leadForm.addEventListener('submit',event => {
  event.preventDefault();
  perform(event.submitter,async () => {
    const lead = leads.find(item => item.reference === select.value);
    await api({action:'status',reference:lead.reference,revision:lead.revision,...Object.fromEntries(new FormData(leadForm))});
    await refresh();
    return 'Lead saved.';
  });
});
quoteForm.addEventListener('submit',event => {
  event.preventDefault();
  perform(event.submitter,async () => {
    const raw = Object.fromEntries(new FormData(quoteForm));
    const costs = {...raw};
    for (const key of ['km','payloadKg','palletSlots']) costs[key] = Number(raw[key]);
    for (const key of ['perKmCents','fuelCents','tollCents','handlingCents','marginBps']) costs[key] = Math.round(Number(raw[key])*100);
    await api({action:'draft',reference:select.value,costs});
    await showLead();
    return 'Internal quote draft saved.';
  });
});
perform(null,refresh);
