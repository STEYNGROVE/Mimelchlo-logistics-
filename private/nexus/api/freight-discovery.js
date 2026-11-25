import {discover} from '../lib/treasury-discovery.js';

export const access = 'scheduler';
export const methods = ['POST'];

export default async function (_req,res) {
  const result = await discover();
  return res.status(result.outcome==='retry'?503:200).json(result);
}
