// Match the PO to a store, then decide: create, skip (already in the CRM) or
// flag for a human. Nothing is created when something doesn't tie.
const norm = s => String(s || '').toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();

// storeMap rows: { license, storeName, dealPrefix, companyId, status }
export function matchStore(po, storeMap) {
  const byLicense = new Map(storeMap.filter(r => /^\d{3}R-\d{5}$/.test(r.license)).map(r => [r.license, r]));
  const byName = new Map(storeMap.map(r => [norm(r.storeName), r]));
  if (po.license && byLicense.has(po.license)) return { row: byLicense.get(po.license), matchedBy: 'license' };
  if (byName.has(norm(po.store))) return { row: byName.get(norm(po.store)), matchedBy: 'store name' };
  return { row: null, matchedBy: null };
}

export function decide(po, storeMap, existingDeals, { dryRun = true, maxAgeDays = 30, today = new Date() } = {}) {
  const reasons = po.flags.filter(f => f !== 'No store license on PO');
  const { row, matchedBy } = matchStore(po, storeMap);
  if (!row) reasons.push(po.license ? `License ${po.license} not in store map` : 'No license on PO and store name not in store map');
  else if (row.status !== 'Ready') reasons.push(`Store map row not Ready: ${row.status}`);

  const [m, d, y] = String(po.poDate || '').split('/').map(Number);
  const age = y ? (today - Date.UTC(y, m - 1, d)) / 86400000 : Infinity;
  if (age > maxAgeDays) reasons.push(`PO is ${Number.isFinite(age) ? Math.floor(age) : '?'} days old; not auto-created`);

  const dupes = existingDeals.filter(e => e.poNumber === po.poNumber);
  const action = dupes.length ? 'skip' : reasons.length ? 'flag' : dryRun ? 'would_create' : 'create';
  return {
    action, reasons, matchedBy, existing: dupes,
    deal: {
      dealname: row ? `${row.dealPrefix} - ${po.nameSuffix}` : `(unknown store: ${po.store}) - ${po.nameSuffix}`,
      amount: String(po.dealAmount), description: po.description, closedate: po.closeDate,
      po_number: po.poNumber, companyId: row?.companyId ?? null,
    },
    tasksFor: po.needsCpgTeam ? ['fulfillment', 'cpg'] : ['fulfillment'],
  };
}
