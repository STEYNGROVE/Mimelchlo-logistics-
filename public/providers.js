'use strict';

(() => {
  const af = document.documentElement.lang === 'af-ZA';
  const local = (en,afrikaans) => af ? afrikaans : en;
  const node = (tag,text) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  };
  const button = (text,parent,handler) => {
    const element = node('button',text);
    element.type = 'button';
    element.addEventListener('click',handler);
    parent.append(element);
    return element;
  };
  async function request(service,body) {
    const response = await fetch('/api/'+service,{
      headers:{'Content-Type':'application/json'},
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {}),
      cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('Unavailable');
    return response.json();
  }

  function lazy(container,service,summary,render) {
    const details = node('details');
    details.append(node('summary',summary));
    const status = node('p');
    status.className = 'quiet';
    status.setAttribute('role','status');
    details.append(status);
    container.append(details);
    let loaded = false;
    details.addEventListener('toggle',async () => {
      if (!details.open || loaded) return;
      loaded = true;
      try {
        if (!(await request(service)).available) throw new Error('Unconfigured');
        render(details,status);
      } catch {
        status.textContent = local('This service is currently unavailable. You can use the existing planning tools.','Dié diens is tans nie beskikbaar nie. Jy kan die bestaande beplanningshulpmiddels gebruik.');
      }
    });
  }

  const map = document.querySelector('.map-panel');
  const concierge = document.getElementById('guidance').closest('.panel');

  lazy(map,'routing',local('Automatic road distance','Outomatiese roeteafstand'),(panel,status) => {
    panel.append(node('p',local(
      'Search sends the address to openrouteservice. Road estimates use the passenger-car profile. Confirm restrictions for your truck separately.',
      'Adresnavrae word na openrouteservice gestuur. Roeteramings gebruik die passasiersmotorprofiel. Bevestig beperkings vir jou vragmotor apart.'
    )));
    const stops = node('div');
    panel.append(stops);
    const entries = [];
    const max = 6;
    let result;
    const trace = document.createElementNS('http://www.w3.org/2000/svg','svg');
    trace.setAttribute('viewBox','0 0 400 210');
    trace.setAttribute('role','img');
    trace.setAttribute('aria-label',local('Selected road route outline','Buitelyn van gekose padroete'));
    trace.hidden = true;

    function invalidate() {
      result = null;
      trace.hidden = true;
      trace.replaceChildren();
      useDistance.hidden = true;
      status.textContent = '';
    }
    function appendStop() {
      if (entries.length>=max) return;
      const item = node('div');
      const number = entries.length+1;
      const label = node('label',local('Address for stop ','Adres vir stop ')+number);
      const input = node('input');
      input.maxLength = 120;
      label.append(input);
      const selectLabel = node('label',local('Result for stop ','Soekresultaat vir stop ')+number);
      const select = node('select');
      selectLabel.append(select);
      selectLabel.hidden = true;
      item.append(label);
      let locations = [];
      input.addEventListener('input',() => {
        locations = [];
        selectLabel.hidden = true;
        invalidate();
      });
      select.addEventListener('change',invalidate);
      button(local('Search address','Soek adres'),item,async event => {
        const target = event.currentTarget;
        const query = input.value.trim();
        if (query.length<4) {
          status.textContent = local('Enter at least four characters.','Voer minstens vier karakters in.');
          return;
        }
        target.disabled = true;
        try {
          const response = await request('routing',{operation:'search',query});
          if (query !== input.value.trim()) return;
          locations = response.results;
          select.replaceChildren(...locations.map((entry,index)=>new Option(entry.label,String(index))));
          selectLabel.hidden = !locations.length;
          invalidate();
          status.textContent = locations.length ? '' : local('No matching address.','Geen ooreenstemmende adres nie.');
        } catch {
          status.textContent = local('Address search failed. Use manual distance or retry later.','Adressoektog het misluk. Voer die afstand in of probeer later.');
        } finally { target.disabled = false; }
      });
      item.append(selectLabel);
      stops.append(item);
      entries.push(() => locations[Number(select.value)]?.coordinates);
      addStop.disabled = entries.length>=max;
      removeStop.disabled = entries.length<=2;
      invalidate();
    }

    const addStop = button(local('Add a stop','Voeg ’n stop by'),panel,appendStop);
    const removeStop = button(local('Remove last stop','Verwyder laaste stop'),panel,() => {
      if (entries.length<=2) return;
      stops.lastElementChild.remove();
      entries.pop();
      addStop.disabled = false;
      removeStop.disabled = entries.length<=2;
      invalidate();
    });
    const returnLabel = node('label',local('Include empty return to collection','Sluit leë terugrit na die afhaalpunt in'));
    returnLabel.className = 'consent';
    const returnInput = node('input');
    returnInput.type = 'checkbox';
    returnLabel.prepend(returnInput);
    panel.append(returnLabel);
    returnInput.addEventListener('change',invalidate);
    button(local('Estimate road route','Beraam padroete'),panel,async event => {
      const coordinates = entries.map(read=>read());
      if (coordinates.some(p=>!p)) {
        status.textContent = local('Select an address result for each stop.','Kies ’n adresresultaat vir elke stop.');
        return;
      }
      const returnTrip = returnInput.checked;
      const signature = JSON.stringify(coordinates);
      const target = event.currentTarget;
      target.disabled = true;
      try {
        const route = await request('routing',{operation:'route',coordinates,returnTrip});
        if (signature!==JSON.stringify(entries.map(read=>read())) || returnTrip!==returnInput.checked) return;
        result = route.legs.reduce((total,leg)=>total+leg.metres,0)/1000;
        const hours = route.legs.reduce((total,leg)=>total+leg.seconds,0)/3600;
        const empty = returnTrip ? route.legs.at(-1).metres/1000 : 0;
        status.textContent = local('General-road estimate: ','Algemene padroeteraming: ')+
          result.toFixed(1)+' km · '+hours.toFixed(1)+local(' hours · empty return ',' uur · leë terugrit ')+empty.toFixed(1)+' km';
        const x = route.geometry.map(point=>point[0]);
        const y = route.geometry.map(point=>point[1]);
        const bounds = [Math.min(...x),Math.max(...x),Math.min(...y),Math.max(...y)];
        const scale = Math.min(370/(bounds[1]-bounds[0]||1e-5),180/(bounds[3]-bounds[2]||1e-5));
        const line = document.createElementNS(trace.namespaceURI,'polyline');
        line.setAttribute('points',route.geometry.map(([lng,lat])=>`${15+(lng-bounds[0])*scale},${195-(lat-bounds[2])*scale}`).join(' '));
        line.setAttribute('fill','none');
        line.setAttribute('stroke','currentColor');
        line.setAttribute('stroke-width','3');
        trace.replaceChildren(line);
        trace.hidden = false;
        useDistance.hidden = false;
      } catch {
        status.textContent = local('Route estimate failed. Enter a checked distance manually.','Roeteraming het misluk. Voer ’n gekontroleerde afstand in.');
      } finally { target.disabled = false; }
    });
    const useDistance = button(local('Use this distance in estimator','Gebruik dié afstand in die kosteraming'),panel,() => {
      if (result===null) return;
      const input = document.querySelector('#q [name=km]');
      input.value = result.toFixed(2);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.focus();
    });
    panel.append(trace);
    const credit = node('p','© openrouteservice.org · © OpenStreetMap contributors');
    credit.className = 'quiet';
    panel.append(credit,status);
    appendStop();
    appendStop();
  });

  lazy(concierge,'concierge',local('AI planning checklist','KI-beplanningskontrolelys'),(panel,status) => {
    panel.append(node('p',local(
      'Get general guidance for your selected topic and cargo. No enquiry details are sent. Verify operational requirements with dispatch.',
      'Kry algemene riglyne vir jou gekose onderwerp en vrag. Geen navraagbesonderhede word gestuur nie. Bevestig operasionele vereistes met die versendingspan.'
    )));
    button(local('Generate checklist','Genereer kontrolelys'),panel,async event => {
      const target = event.currentTarget;
      const topics = {cargo:'equipment',cost:'enquiry',docs:'documents',quotes:'enquiry',customer:'customer'};
      const topic = topics[document.getElementById('topic').value] || 'cargo';
      const cargo = document.querySelector('#q [name=cargo]').value;
      target.disabled = true;
      status.textContent = local('Preparing guidance…','Berei riglyne voor…');
      try {
        const response = await request('concierge',{language:document.documentElement.lang,topic,cargo});
        status.textContent = response.guidance;
      } catch {
        status.textContent = local('AI is unavailable. Use the planning guide above.','KI is nie beskikbaar nie. Gebruik die beplanningsgids hier bo.');
      } finally { target.disabled = false; }
    });
    panel.append(status);
  });
})();
