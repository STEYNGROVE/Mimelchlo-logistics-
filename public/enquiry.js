'use strict';

const onlineEnquiry = document.getElementById('online-enquiry');
const enquiryButton = document.getElementById('send-enquiry');
const enquiryStatus = document.getElementById('brief-status');
let preparedSubmission;

function acquisitionSource() {
  const medium = new URLSearchParams(location.search).get('utm_medium')?.toLowerCase();
  if (['organic','search','cpc','ppc'].includes(medium)) return 'search';
  if (['social','social-media'].includes(medium)) return 'social';
  if (medium === 'referral') return 'referral';
  return medium ? 'campaign' : 'direct';
}

if (globalThis.crypto?.randomUUID && navigator.onLine) {
  const showOnlineEnquiry = () => {
    fetch('/api/enquiries', {cache:'no-store', signal:AbortSignal.timeout(5000)})
      .then(response => response.ok && response.json())
      .then(result => { if (result?.available) onlineEnquiry.hidden = false; })
      .catch(() => {});
  };
  if (document.readyState === 'complete') showOnlineEnquiry();
  else window.addEventListener('load', showOnlineEnquiry, {once:true});
}

enquiryButton.addEventListener('click', async () => {
  const fields = brief.elements;
  const email = fields.email;
  const consent = fields.consent;
  if (!brief.reportValidity()) return;
  if (!email.value.trim()) {
    enquiryStatus.textContent = 'Add a reply email to send this enquiry.';
    email.focus();
    return;
  }
  if (!consent.checked) {
    enquiryStatus.textContent = 'Confirm how your details may be used before sending.';
    consent.focus();
    return;
  }
  const data = new FormData(brief);
  const body = {
    kind:data.get('kind'),company:data.get('company'),email:data.get('email'),notes:data.get('notes'),
    date:data.get('date'),website:data.get('website'),consent:true,configuration,plan:enquiryPlan,source:acquisitionSource()
  };
  const fingerprint = JSON.stringify(body);
  if (preparedSubmission?.fingerprint !== fingerprint) preparedSubmission = {fingerprint,requestId:crypto.randomUUID()};
  enquiryButton.disabled = true;
  enquiryStatus.textContent = 'Sending enquiry…';
  try {
    const response = await fetch('/api/enquiries', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...body, requestId:preparedSubmission.requestId}),signal:AbortSignal.timeout(12000)
    });
    if (response.status === 429) {
      enquiryStatus.textContent = 'The enquiry limit has been reached. Please try later or download your draft.';
      return;
    }
    if (!response.ok) throw new Error('submission');
    const {reference} = await response.json();
    enquiryStatus.textContent = 'Enquiry received. Your reference is ' + reference + '.';
  } catch {
    enquiryStatus.textContent = 'Submission could not be confirmed. Retry with the same details or download your draft.';
  } finally {
    enquiryButton.disabled = false;
  }
});
