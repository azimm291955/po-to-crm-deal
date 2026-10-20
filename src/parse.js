// Purchase-order PDF text -> structured orders, with every number checked.
// The parser trusts nothing: each line must tie (qty x price = amount), the
// lines must tie to the PO total, and bulk flower must be a whole or half pound.
export const CONFIG = {
  ownLicense: '000R-00000',          // the seller's own license, ignored on the PO
  gramsPerLb: 453,
  courierThreshold: 1000,            // orders under this carry a courier fee
  closeDays: 30,
  products: [
    { test: /Bulk Flower/i, family: 'flower', label: 'Flower' },
    { test: /Infused Pre-Roll/i, family: 'preroll', label: 'Infused pre-roll' },
  ],
};

const money = s => Number(String(s).replace(/,/g, ''));
const qtyNum = s => Number(String(s).replace(/[\s,]/g, ''));
const round2 = n => Math.round(n * 100) / 100;
function addDays(mdY, days) {
  const [m, d, y] = mdY.split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// One PDF can hold several POs; each starts on a page that says PURCHASE ORDER.
export const splitPOs = text =>
  text.split(/Page\s+\d+\s+of\s+\d+/).map(s => s.trim()).filter(s => /PURCHASE\s+ORDER/.test(s));

const LINE_RE = /(\d{2}R\d{5})\s+(.+?)\s+(\d+\.\d{4})\s*([\d,]+\.\d{2})\s*(\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?)\s*(G|EAC)\s*(\d{1,2}\/\d{1,2}\/\d{4})/g;

export function parsePO(block, cfg = CONFIG) {
  const flags = [];
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const store = lines[0];
  const poNumber = (block.match(/\bP\d{10}\b/) || [])[0] || null;
  const poDate = (block.match(/SupplierDate\s*(\d{1,2}\/\d{1,2}\/\d{4})/) || block.match(/Date\s*(\d{1,2}\/\d{1,2}\/\d{4})/) || [])[1] || null;

  // The buyer's state license is the store's identity; normalise 403-12345 -> 403R-12345.
  const licLines = [...block.matchAll(/License #:\s*([^\n]+)/g)].map(m => m[1].trim()).filter(l => !l.includes(cfg.ownLicense));
  const licenses = licLines.length ? (licLines[0].match(/\d{3}R?-\d{5}/g) || []).map(l => l.replace(/^(\d{3})-/, '$1R-')) : [];
  const license = licenses[0] || null;

  const items = [...block.matchAll(LINE_RE)].map(([, sku, desc, price, amount, qty, unit]) => {
    const prod = cfg.products.find(p => p.test.test(desc));
    return { sku, desc: desc.trim(), price: Number(price), amount: money(amount), qty: qtyNum(qty), unit, family: prod?.family ?? null };
  });
  const poTotal = money((block.match(/Line Total:\s*(?:USD)?\s*([\d,]+\.\d{2})/) || [])[1] || NaN);

  if (!poNumber) flags.push('No PO number found');
  if (!poDate) flags.push('No PO date found');
  if (!license) flags.push('No store license on PO');
  if (!items.length) flags.push('No line items parsed');
  for (const it of items) {
    if (!it.family) flags.push(`Unknown product: ${it.sku} ${it.desc}`);
    const calc = round2(it.qty * it.price);
    if (Math.abs(calc - it.amount) > 0.011) flags.push(`Line math doesn't tie for ${it.sku}: ${it.qty} x ${it.price} = ${calc}, PO says ${it.amount}`);
  }
  const sum = round2(items.reduce((s, i) => s + i.amount, 0));
  if (!Number.isNaN(poTotal) && Math.abs(sum - poTotal) > 0.011) flags.push(`Line items (${sum}) don't sum to PO total (${poTotal})`);

  // Restate the order the way the sales team sells it.
  const parts = [];
  const flower = items.filter(i => i.family === 'flower');
  if (flower.length) {
    const grams = flower.reduce((s, i) => s + i.qty, 0);
    const lbs = Math.round((grams / cfg.gramsPerLb) * 2) / 2;
    if (lbs === 0 || Math.abs(lbs * cfg.gramsPerLb - grams) > 1.01) flags.push(`Flower isn't a whole or half pound: ${grams} g`);
    const perLb = Math.round(flower[0].price * cfg.gramsPerLb);
    const amount = lbs * perLb;
    const onPO = flower.reduce((s, i) => s + i.amount, 0);
    if (Math.abs(onPO - amount) > 0.06 * lbs + 0.02) flags.push(`Flower amount doesn't tie: ${lbs} lbs x $${perLb} = ${amount}, PO says ${onPO}`);
    parts.push({ family: 'flower', qtyText: `Flower - ${lbs} lbs`, amount, descText: `Flower - ${lbs} lbs @ $${perLb}/lb` });
  }
  for (const fam of ['preroll']) {
    const fi = items.filter(i => i.family === fam);
    if (!fi.length) continue;
    const units = fi.reduce((s, i) => s + i.qty, 0);
    const each = fi[0].price;
    if (fi.some(i => i.price !== each)) flags.push(`Mixed unit prices on ${fam} lines`);
    const label = cfg.products.find(p => p.family === fam).label;
    parts.push({ family: fam, qtyText: `${label} - ${units} units`, amount: round2(units * each), descText: `${label} - ${units} units @ $${each.toFixed(2)} each` });
  }

  const total = round2(parts.reduce((s, p) => s + p.amount, 0));
  const courier = total > 0 && total < cfg.courierThreshold;
  return {
    poNumber, poDate, closeDate: poDate ? addDays(poDate, cfg.closeDays) : null,
    store, license, extraLicenses: licenses.slice(1), items, poTotal, dealAmount: total, courier,
    nameSuffix: [...(courier ? ['Courier charge'] : []), parts.map(p => p.qtyText).join(' + ')].join(' - '),
    description: parts.map(p => p.descText).join('; ') + (courier ? ' + courier fee' : ''),
    needsCpgTeam: parts.some(p => p.family !== 'flower'),
    flags,
  };
}
