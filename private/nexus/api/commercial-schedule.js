import { sync } from '../lib/commercial-sync.js';

export const access = 'scheduler';
export const methods = ['POST'];

export default async function (_req, res) {
  try {
    const result = await sync();
    return res.json(result);
  } catch {
    return res.status(503).json({error:'Enquiry synchronization unavailable'});
  }
}
