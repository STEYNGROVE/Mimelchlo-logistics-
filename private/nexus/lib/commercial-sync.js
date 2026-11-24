import { db } from 'hatchable';

const relayUrl = 'https://mimelchlo-logistics.pages.dev/api/enquiry-relay';
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export async function sync() {
  const {rows:[config]} = await db.query('SELECT token FROM commercial_relay_settings WHERE singleton=true');
  if (!config) throw new Error('relay unavailable');
  // Every batch is replayable. The relay returns rows in insertion order.
  const {rows:[cursor]} = await db.query('SELECT COALESCE(MAX(sequence),0) AS cursor FROM commercial_leads');
  const response = await fetch(relayUrl + '?after=' + cursor.cursor, {
    headers:{Authorization:'Bearer ' + config.token},
    redirect:'error',
    timeout_ms:8000
  });
  if (!response.ok) throw new Error('relay unavailable');
  const {items} = await response.json();
  if (!Array.isArray(items) || items.length > 30) throw new Error('invalid relay');
  for (const entry of items) {
    if (!uuid.test(entry.submission?.requestId) || !integer(entry.sequence,1,Number.MAX_SAFE_INTEGER) ||
      !integer(entry.receivedAt,1,9999999999)) throw new Error('invalid relay');
    await db.query(
      'INSERT INTO commercial_leads(reference,sequence,received_at,submission) VALUES($1,$2,to_timestamp($3),$4::jsonb) ON CONFLICT(reference) DO NOTHING',
      [entry.submission.requestId,entry.sequence,entry.receivedAt,JSON.stringify(entry.submission)]
    );
  }
  return {processed:items.length};
}
