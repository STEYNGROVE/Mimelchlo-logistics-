'use strict';

const cities = {
  Bethlehem: [326, 184], Bloemfontein: [280, 215], 'Cape Town': [101, 320],
  Durban: [384, 219], 'East London': [317, 279], Gqeberha: [265, 303],
  Johannesburg: [330, 135], Kimberley: [235, 202], Mbombela: [393, 113],
  Polokwane: [367, 72], Pretoria: [338, 119], Upington: [164, 190]
};

// These are planning examples. Pallet rows assume two 1 m pallets across.
const equipment = {
  tautliner: ['Tautliner', 'Side-loading for general palletised goods and weather protection.', [13.6], 2.45, 28000, 'M90 25h294v52H90z'],
  superlink: ['Superlink', 'Two decks for larger general pallet loads. Confirm coupling and site access.', [6, 12], 2.45, 32000, 'M90 25h94v52H90z M193 25h191v52H193z'],
  flatbed: ['Flatbed', 'Open deck for crane-loaded or oversized cargo. Confirm restraints, dimensions and permits.', [13.6], 2.45, 28000, 'M90 69h294v8H90z'],
  reefer: ['Refrigerated trailer', 'Temperature-controlled freight. Confirm setpoint, airflow and pre-cooling.', [13.3], 2.4, 25000, 'M90 23h294v54H90z M96 12h19v10H96z'],
  container: ['Container transport', 'Skeletal trailer for compatible ISO containers. Confirm box size and gross weight.', [], null, null, 'M98 26h270v49H98z M92 72h292v5H92z'],
  bulk: ['Dry bulk configuration', 'Loose dry cargo. Confirm density, body material and tipping clearance.', [], null, null, 'M100 28h277l-31 47H128z']
};
const typeToTrailer = {general:'tautliner', temperature:'reefer', open:'flatbed', container:'container', bulk:'bulk'};
const guidance = {
  cargo: 'List the gross weight, dimensions, pallet count, stackability, loading method and any temperature requirements. The planner can suggest equipment for review.',
  cost: 'Enter a checked road distance, a rate per kilometre, fuel surcharge and tolls. Add any waiting, handling and special equipment requirements to your brief.',
  docs: 'Prepare the collection and delivery instructions, goods description, packing list and dispatch contact. Confirm cargo-specific paperwork and proof-of-delivery requirements with dispatch.',
  quotes: 'Include both addresses, collection window, delivery deadline, cargo dimensions and weight, and the loading equipment available at each end.',
  customer: 'For shipment or document requests, have your booking reference ready and use the dispatch contact on your confirmation.'
};
const byId = id => document.getElementById(id);
const form = byId('q');
const { origin, destination, km } = form.elements;
const trailer = byId('trailer');
let lastPlan = '';
let enquiryPlan = null;
let configuration = '';

function option(select, value, name) {
  select.add(new Option(name, value));
}
for (const name of Object.keys(cities)) {
  option(origin, name, name);
  option(destination, name, name);
}
option(origin, 'other', 'Other town');
option(destination, 'other', 'Other town');
destination.value = 'Johannesburg';
for (const [key, spec] of Object.entries(equipment)) option(trailer, key, spec[0]);

function svg(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function locationName(select) {
  return select.value === 'other' ? form.elements[select.name + 'Town'].value.trim() : select.value;
}

function updateRoute() {
  const markers = byId('markers');
  const route = byId('route');
  for (const select of [origin, destination]) {
    const custom = select.value === 'other';
    const field = form.elements[select.name + 'Town'];
    byId('custom-' + select.name).hidden = !custom;
    field.disabled = !custom;
    field.required = custom;
    field.setCustomValidity(custom && field.value && !field.value.trim() ? 'Enter a town name.' : '');
  }
  const start = locationName(origin);
  const finish = locationName(destination);
  const endpoints = Array.from(new Set([origin.value, destination.value])).filter(name => Object.hasOwn(cities, name));
  markers.replaceChildren();
  endpoints.forEach((name, index) => {
    const [x, y] = cities[name];
    const left = x > 300;
    const label = svg('text', {x: x + (left ? -9 : 9), y: y + (index ? 17 : -8), 'text-anchor': left ? 'end' : 'start'});
    label.textContent = name;
    markers.append(svg('circle', {cx:x, cy:y, r:6}), label);
  });
  const [x1, y1] = cities[origin.value] || [0, 0];
  const [x2, y2] = cities[destination.value] || [0, 0];
  route.toggleAttribute('hidden', endpoints.length < 2);
  for (const [key, value] of Object.entries({x1, y1, x2, y2})) route.setAttribute(key, value);
  const params = new URLSearchParams({api:'1', origin:start + ', South Africa', destination:finish + ', South Africa', travelmode:'driving'});
  byId('directions').href = 'https://www.google.com/maps/dir/?' + params;
  byId('directions').hidden = !start || !finish;
  destination.setCustomValidity(start && start.toLowerCase() === finish.toLowerCase() ? 'Choose a different delivery town.' : '');
}

function resetDistance() {
  km.value = '';
  updateRoute();
}
for (const select of [origin, destination]) {
  select.addEventListener('change', resetDistance);
  form.elements[select.name + 'Town'].addEventListener('input', resetDistance);
}
updateRoute();

function palletSlots(decks) {
  return decks.map(length => Math.floor(length / 1.2) * 2);
}

function recommend(cargo, mass, pallets) {
  const key = typeToTrailer[cargo];
  if (!key) return null;
  const spec = equipment[key];
  if (spec[4] === null) return key;
  if (cargo === 'general' && (mass > spec[4] || pallets > palletSlots(spec[2])[0])) return 'superlink';
  return key;
}

function drawLoad(slots, pallets) {
  const load = byId('load');
  load.replaceChildren();
  let remaining = pallets;
  for (const capacity of slots) {
    const deck = document.createElement('div');
    deck.className = 'deck';
    deck.style.setProperty('--slots', capacity / 2);
    for (let i = 0; i < capacity; i++) {
      const space = document.createElement('span');
      if (i < remaining) space.className = 'filled';
      deck.append(space);
    }
    remaining = Math.max(remaining - capacity, 0);
    load.append(deck);
  }
}

form.addEventListener('input', () => {
  byId('result-card').hidden = true;
  byId('planner-status').textContent = '';
  lastPlan = '';
  enquiryPlan = null;
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const distance = Number(data.get('km'));
  const rate = Number(data.get('rate'));
  const fuel = Number(data.get('diesel'));
  const tolls = Number(data.get('tolls'));
  const mass = Number(data.get('mass'));
  const pallets = Number(data.get('pallets'));
  const { base, subtotal, vat, total } = calculate(distance, rate, fuel, tolls);
  const rand = cents => new Intl.NumberFormat('en-ZA', {style:'currency', currency:'ZAR'}).format(cents / 100);
  const key = recommend(data.get('cargo'), mass, pallets);
  let loadNote = 'Specialist review required. Confirm vehicle, payload and loading before dispatch.';
  let slots = [];
  if (key) {
    const [name,, decks,, payload] = equipment[key];
    loadNote = name + ' for review. Confirm compatibility with dispatch.';
    slots = palletSlots(decks);
    if (payload !== null) {
      const maxPallets = slots.reduce((sum, count) => sum + count, 0);
      const margin = payload - mass;
      const limits = margin < 0 || pallets > maxPallets ? 'Example limits exceeded. Ask dispatch about an alternative.' : 'Check axle limits and securing with dispatch.';
      loadNote = `${name} for review · ${mass.toLocaleString()} kg loaded · ${Math.abs(margin).toLocaleString()} kg ${margin < 0 ? 'over' : 'under'} the example payload · ${Math.min(pallets, maxPallets)}/${maxPallets} spaces occupied · ${limits}`;
    }
  }
  const trip = [
    `${locationName(origin)} → ${locationName(destination)} · ${distance} km entered`,
    `Linehaul ${rand(base)}`,
    `Diesel surcharge ${rand(Math.round(fuel * 100))}`,
    `Tolls ${rand(Math.round(tolls * 100))}`,
    `Subtotal ${rand(subtotal)}`,
    `Illustrative VAT (15%) ${rand(vat)}`,
    `Estimated total ${rand(total)}`,
    `Drive time at 65 km/h · ${(distance / 65).toFixed(1)} hours, before breaks and loading`,
    `Illustrative tailpipe emissions · ${Math.round(distance * .35 * 2.68)} kg CO₂ at 35 L/100 km and 2.68 kg CO₂/L`
  ].join('\n');
  byId('result').textContent = trip;
  byId('load-note').textContent = loadNote;
  drawLoad(slots, pallets);
  lastPlan = trip + '\n' + loadNote;
  enquiryPlan = {from:locationName(origin),to:locationName(destination),cargo:data.get('cargo'),distance,mass,pallets};
  byId('result-card').hidden = false;
  byId('planner-status').textContent = 'Trip estimate calculated. Estimated total ' + rand(total);
});

function updateTrailer() {
  const [name, purpose, decks, width, mass, path] = equipment[trailer.value];
  byId('trailer-name').textContent = name;
  byId('trailer-purpose').textContent = purpose;
  byId('trailer-body').replaceChildren(svg('path', {d:path, fill:'#858793', stroke:'#e0dfe6', 'stroke-width':2}));
  const specs = byId('specs');
  specs.replaceChildren();
  const values = mass === null ? {'Equipment limits':'Confirm with dispatch'} : {
    'Example deck dimensions': decks.map(length => length + ' m × ' + width + ' m').join(' + '),
    'Example payload': mass.toLocaleString('en-ZA') + ' kg',
    'Example pallet spaces': palletSlots(decks).join(' + ')
  };
  for (const [label, value] of Object.entries(values)) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    specs.append(term, description);
  }
}
trailer.addEventListener('change', updateTrailer);
updateTrailer();

byId('trailer-enquiry').addEventListener('click', () => {
  configuration = equipment[trailer.value][0];
  byId('brief-status').textContent = 'Added ' + configuration + ' to this enquiry draft.';
});

const brief = byId('brief');
brief.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(brief);
  const lines = [
    'Mimelchlo Logistics freight enquiry draft',
    data.get('kind'),
    'Company · ' + data.get('company'),
    'Preferred collection · ' + (data.get('date') || 'To be arranged'),
    ...(configuration ? ['Requested configuration · ' + configuration] : []),
    '',
    data.get('notes'),
    ...(lastPlan ? ['', 'Illustrative planning assumptions', lastPlan] : []),
    '',
    'Draft only. Please confirm requirements, availability and pricing with dispatch.'
  ];
  const href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = href;
  link.download = 'mimelchlo-freight-enquiry.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
  byId('brief-status').textContent = 'Enquiry draft downloaded.';
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition && window.isSecureContext) {
  const voice = byId('voice');
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-ZA';
  voice.hidden = false;
  voice.addEventListener('click', () => {
    voice.disabled = true;
    byId('brief-status').textContent = 'Listening. Your browser may process audio through its speech service.';
    try {
      recognition.start();
    } catch {
      voice.disabled = false;
      byId('brief-status').textContent = 'Dictation is unavailable. You can type your requirements.';
    }
  });
  recognition.addEventListener('result', event => {
    const notes = brief.elements.notes;
    notes.value = [notes.value, event.results[0][0].transcript].filter(Boolean).join(' ').slice(0, notes.maxLength);
    byId('brief-status').textContent = 'Review the dictated text before downloading.';
  });
  recognition.addEventListener('error', () => {
    byId('brief-status').textContent = 'Dictation is unavailable. You can type your requirements.';
  });
  recognition.addEventListener('end', () => { voice.disabled = false; });
}

const topic = byId('topic');
function updateGuidance() {
  byId('guidance').textContent = guidance[topic.value];
}
topic.addEventListener('change', updateGuidance);
updateGuidance();

const bandwidth = byId('bandwidth');
function setLowData(enabled) {
  document.documentElement.classList.toggle('low-data', enabled);
  bandwidth.setAttribute('aria-pressed', String(enabled));
}
let savedMode;
try { savedMode = localStorage.getItem('low-data'); } catch {}
setLowData(savedMode === null || savedMode === undefined ? Boolean(navigator.connection?.saveData) : savedMode === 'true');
bandwidth.hidden = false;
bandwidth.addEventListener('click', () => {
  const enabled = bandwidth.getAttribute('aria-pressed') !== 'true';
  setLowData(enabled);
  try { localStorage.setItem('low-data', String(enabled)); } catch {}
});

for (const activeForm of [form, brief]) activeForm.querySelector('button[type=submit]').disabled = false;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
