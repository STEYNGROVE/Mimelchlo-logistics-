import {gateway,parseJson} from '../lib/provider.js';

const base = 'https://api.heigit.org';
const point = value => Array.isArray(value) && value.length===2 && value.every(Number.isFinite)
  && value[0]>=16 && value[0]<=33 && value[1]>=-35 && value[1]<=-22;
const roundedPoint = value => value.map(x=>Math.round(x*100000)/100000);

export function validateRouting(body) {
  if (body?.operation === 'search') {
    const query = typeof body.query === 'string' ? body.query.trim().replace(/\s+/g,' ') : '';
    return query.length>=4 && query.length<=120 && !/[\p{C}@]/u.test(query) ? {operation:'search',query} : null;
  }
  if (body?.operation !== 'route' || !Array.isArray(body.coordinates) ||
      body.coordinates.length<2 || body.coordinates.length>6 || !body.coordinates.every(point)) return null;
  const points = body.coordinates.map(roundedPoint);
  if (points.some((coordinates,index)=>index>0 && coordinates.toString() === points[index-1].toString())) return null;
  return {operation:'route',coordinates:points,returnTrip:body.returnTrip===true};
}

async function route(key,input) {
  const headers = {Authorization:key,Accept:'application/json, application/geo+json'};
  if (input.operation === 'search') {
    const query = new URLSearchParams({text:input.query,'boundary.country':'ZA',size:'5'});
    const response = await fetch(base+'/pelias/v1/search?'+query,{headers,redirect:'error',signal:AbortSignal.timeout(6000)});
    if (!response.ok) throw new Error('Geocoder unavailable');
    const {features} = await parseJson(response.body,200000);
    return {attribution:'openrouteservice.org · OpenStreetMap contributors',results:features.slice(0,5)
      .filter(item=>point(item.geometry?.coordinates) && typeof item.properties?.label==='string')
      .map(item=>({label:item.properties.label.slice(0,160),coordinates:roundedPoint(item.geometry.coordinates)}))};
  }
  const coordinates = input.returnTrip ? [...input.coordinates,input.coordinates[0]] : input.coordinates;
  const response = await fetch(base+'/openrouteservice/v2/directions/driving-car/geojson',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({coordinates,instructions:false,geometry_simplify:true}),
    redirect:'error',signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Routing unavailable');
  const {features} = await parseJson(response.body,450000);
  const feature = features[0];
  const segments = feature?.properties?.segments;
  const trace = feature?.geometry?.coordinates;
  if (!Array.isArray(segments) || segments.length !== coordinates.length-1 ||
    !segments.every(x=>Number.isFinite(x.distance) && x.distance>0 && Number.isFinite(x.duration) && x.duration>0) ||
    !Array.isArray(trace) || trace.length<2 || !trace.every(point)) throw new Error('Invalid route');
  const every = Math.ceil(trace.length/800);
  return {profile:'general-road',attribution:'openrouteservice.org · OpenStreetMap contributors',
    legs:segments.map(x=>({metres:Math.round(x.distance),seconds:Math.round(x.duration)})),
    geometry:trace.filter((_,index)=>index%every===0 || index===trace.length-1).map(roundedPoint)};
}

// An approved key and an explicit switch are both required. Address queries and precise routes are not persisted.
export const onRequest = gateway('routing',env=>env.ROUTING_ENABLED==='1' && env.ORS_API_KEY,validateRouting,route,{cap:120,perClient:15});
