'use strict';

const af = new URLSearchParams(location.search).get('lang')==='af';
const t = (en,afrikaans) => af ? afrikaans : en;
document.documentElement.lang = af ? 'af-ZA' : 'en-ZA';
document.getElementById('title').textContent = t('Customer account','Kliënterekening');
if (af) document.getElementById('home').href = '/af/';
const status = document.getElementById('account-status');
status.textContent = t('Checking account availability…','Kontroleer rekeningbeskikbaarheid…');
const actions = document.getElementById('account-actions');
const data = document.getElementById('account-data');
const endpoint = '/api/account';
const money = new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:'ZAR'});

function element(tag,text) {
  const node = document.createElement(tag);
  node.textContent = text ?? '';
  return node;
}
function labelField(name,label,type,autocomplete) {
  const wrapper = element('label',label);
  const input = element('input');
  input.name = name;
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = true;
  if (type==='password') { input.minLength = 12; input.maxLength = 72; }
  if (name==='code') { input.inputMode = 'numeric'; input.pattern = '[0-9]{6,10}'; }
  if (name==='name') input.maxLength = 120;
  wrapper.append(input);
  return wrapper;
}
async function request(body,suffix='') {
  const response = await fetch(endpoint+suffix,{
    cache:'no-store',signal:AbortSignal.timeout(14000),
    ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'unavailable');
    error.status = response.status;
    throw error;
  }
  return result;
}

const modes = {
  login:[t('Sign in','Meld aan'),['email','password']],
  register:[t('Register','Registreer'),['email','password']],
  verify:[t('Verify email','Verifieer e-pos'),['email','code']],
  recover:[t('Request recovery code','Versoek herstelkode'),['email']],
  reset:[t('Set a new password','Stel ’n nuwe wagwoord'),['email','code','password']]
};
const labels = {
  email:[t('Email','E-posadres'),'email','email'],
  password:[t('Password','Wagwoord'),'password','current-password'],
  code:[t('Email code','E-poskode'),'text','one-time-code'],
  name:[t('Display name','Vertoonnaam'),'text','name']
};

function form(fields,caption,action,mode) {
  const form = element('form');
  form.className = 'panel';
  for (const key of fields) {
    const [label,type,auto] = labels[key];
    form.append(labelField(key,label,type,key==='password' && ['register','reset'].includes(mode) ? 'new-password' : auto));
  }
  const submit = element('button',caption);
  form.append(submit);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    status.textContent = t('Working…','Besig…');
    try { await action(payload); }
    catch (error) {
      status.textContent = error.status===429 ? t('Try again later.','Probeer later weer.') :
        t('The request could not be completed. Check your details or try again.','Die versoek kon nie voltooi word nie. Kontroleer jou besonderhede of probeer weer.');
    } finally {
      const password = form.elements.namedItem('password');
      if (password) password.value='';
      submit.disabled=false;
    }
  });
  return form;
}

function renderAuth(mode='login') {
  data.hidden = true;
  data.replaceChildren();
  actions.hidden = false;
  actions.replaceChildren();
  const modesList = element('div');
  modesList.className = 'actions';
  for (const [key,[label]] of Object.entries(modes)) {
    const select = element('button',label);
    select.type = 'button';
    select.className = 'secondary';
    select.setAttribute('aria-pressed',String(mode===key));
    select.addEventListener('click',()=>{status.textContent='';renderAuth(key);actions.querySelector('form input').focus();});
    modesList.append(select);
  }
  const [caption,fields] = modes[mode];
  actions.append(modesList,form(fields,caption,async payload=>{
    const result = await request({action:mode,...payload});
    if (result.signedIn) {
      await showDashboard();
      return;
    }
    if (result.checkEmail) {
      renderAuth(mode==='register'?'verify':'reset');
      status.textContent = t('If the address is eligible, a code will arrive by email.','As die adres kwalifiseer, sal ’n kode per e-pos aankom.');
      return;
    }
    renderAuth();
    status.textContent = t('Password updated. Sign in to continue.','Wagwoord opgedateer. Meld aan om voort te gaan.');
  },mode));
}

function recordList(records,heading,render) {
  const section = element('section');
  section.className = 'panel';
  section.append(element('h2',heading));
  const list = element('ul');
  for (const record of records) {
    const item = element('li');
    item.append(render(record));
    list.append(item);
  }
  if (!records.length) list.append(element('li',t('No records are available.','Geen rekords is beskikbaar nie.')));
  section.append(list);
  return section;
}

const shipmentStates = {
  scheduled:t('Scheduled','Geskeduleer'),collected:t('Collected','Afgehaal'),
  in_transit:t('In transit','Onderweg'),delivered:t('Delivered','Afgelewer'),cancelled:t('Cancelled','Gekanselleer')
};

async function showDashboard(allowRefresh=true) {
  let dashboard;
  try { dashboard = await request(); }
  catch (error) {
    if (error.status!==401) throw error;
    if (allowRefresh && (await request({action:'refresh'})).signedIn) return showDashboard(false);
    status.textContent = '';
    renderAuth();
    return;
  }
  status.textContent = '';
  actions.hidden = true;
  actions.replaceChildren();
  data.hidden = false;
  const signOut = element('button',t('Sign out','Meld af'));
  signOut.type = 'button';
  signOut.addEventListener('click',async ()=>{
    signOut.disabled = true;
    try {
      await request({action:'logout'});
      renderAuth();
    } catch {
      status.textContent=t('Could not sign out. Try again.','Kon nie afmeld nie. Probeer weer.');
    } finally {signOut.disabled=false;}
  });
  const profile = form(['name'],t('Save profile','Stoor profiel'),async payload=>{
    await request({action:'profile',...payload});
    status.textContent = t('Profile saved.','Profiel gestoor.');
  });
  profile.elements.name.value = dashboard.profiles[0]?.display_name || '';
  data.replaceChildren(signOut,profile,
    recordList(dashboard.organizations,t('Organizations','Organisasies'),record=>record.name),
    recordList(dashboard.shipments,t('Shipments','Versendings'),record=>record.reference+' · '+(shipmentStates[record.status]||'')+' · '+new Date(record.status_at).toLocaleString(document.documentElement.lang)),
    recordList(dashboard.quotations,t('Quotation history','Kwotasiegeskiedenis'),record=>record.reference+' · '+money.format(record.amount_cents/100)),
    recordList(dashboard.documents,t('Documents','Dokumente'),record=>{
      const link = element('a',record.title);
      link.href = endpoint+'?document='+encodeURIComponent(record.id);
      link.download = '';
      return link;
    })
  );
}

request(null,'?status=1').then(result=>{
  if (!result.available) throw new Error('Disabled');
  return showDashboard();
}).catch(()=>{
  status.textContent = t('Online account access is currently unavailable. Use the contact on your booking confirmation for account or shipment questions.','Aanlyn rekeningtoegang is tans nie beskikbaar nie. Gebruik die kontak op jou besprekingsbevestiging vir rekening- of versendingsnavrae.');
});
