'use strict';

const endpoint = '/api/freight-procurement';
const status = document.getElementById('result');
const list = document.getElementById('candidates');
const resource = (tag,text) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
};

async function showCandidates() {
  const response = await fetch(endpoint,{cache:'no-store'});
  if (!response.ok) throw new Error('Procurement access is unavailable.');
  const {cursor,candidates} = await response.json();
  document.getElementById('source').textContent = cursor
    ? `Window ${cursor.window_start} · page ${cursor.next_page} · ${cursor.pages_processed} processed` +
      (cursor.last_error ? ` · ${cursor.last_error} · retry after ${cursor.retry_after}` : '')
    : 'Awaiting the first source check.';
  list.replaceChildren();
  if (!candidates.length) list.append(resource('p','No freight candidates have been recorded.'));
  for (const candidate of candidates) {
    const section = resource('section');
    const url = new URL(candidate.source_url);
    const evidence = resource('p',`Matched phrase: ${candidate.match_evidence}`);
    section.append(resource('h2',candidate.title),
      resource('p',[candidate.buyer,candidate.state,candidate.closes_at,candidate.review_status].filter(Boolean).join(' · ')),
      evidence);
    if (url.origin==='https://ocds-api.etenders.gov.za') {
      const link = resource('a','Original Treasury release page');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      section.append(link);
    }
    if (candidate.review_status==='pending') section.append(reviewForm(candidate));
    else if (candidate.review_reason) section.append(resource('p',candidate.review_reason));
    list.append(section);
  }
}
function reviewForm(candidate) {
  const form = resource('form');
  const reason = resource('textarea');
  reason.required = true;
  reason.maxLength = 1000;
  const reasonLabel = resource('label','Review evidence and rationale');
  reasonLabel.append(reason);
  const reject = resource('button','Reject');
  reject.value = 'rejected';
  form.append(reasonLabel,reject);
  if (candidate.state==='active at source') {
    const verify = resource('button','Mark verified');
    verify.value = 'verified';
    form.append(verify);
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const button = event.submitter;
    if (!button) return;
    button.disabled = true;
    try {
      const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        reference:candidate.reference,releaseAt:candidate.release_at,decision:button.value,reason:reason.value
      })});
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Review unavailable.');
      }
      status.textContent = 'Review recorded.';
      await showCandidates();
    } catch (error) {
      status.textContent = error.message;
    } finally {button.disabled=false;}
  });
  return form;
}

showCandidates().catch(error=>{status.textContent=error.message;});
