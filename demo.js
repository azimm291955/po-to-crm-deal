import { readFileSync } from 'node:fs';
import { splitPOs, parsePO } from './src/parse.js';
import { decide } from './src/decide.js';

const storeMap = [
  { license: '402R-11111', storeName: 'Mountain Leaf Dispensary - Main St', dealPrefix: 'Mountain Leaf Main St', companyId: '1001', status: 'Ready' },
  { license: '402R-22222', storeName: 'Canyon Wellness', dealPrefix: 'Canyon Wellness', companyId: '1002', status: 'Ready' },
];
const existingDeals = [];   // in production: a CRM search by PO number

const text = readFileSync(new URL('./samples/po.txt', import.meta.url), 'utf8');
for (const po of splitPOs(text).map(b => parsePO(b))) {
  const r = decide(po, storeMap, existingDeals, { today: new Date('2026-10-15') });
  console.log(`${po.poNumber}  ${r.action.toUpperCase()}`);
  console.log(`  deal:   ${r.deal.dealname}  $${r.deal.amount}`);
  console.log(`  detail: ${r.deal.description}`);
  if (r.reasons.length) console.log(`  why:    ${r.reasons.join('; ')}`);
}
