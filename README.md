# po-to-crm-deal

Wholesale purchase orders arrive as PDFs from dispensary POS systems. This turns each one into a CRM deal, but only after every number on it has been checked. It's the core of a production n8n workflow at a licensed cannabis wholesaler that has replaced hand entry of incoming orders.

## The production flow

1. A mail rule labels incoming PO emails; n8n picks them up and extracts the PDF text.
2. **Parse:** one PDF can hold several POs. Each is split out and read for PO number, date, buyer license, line items and total.
3. **Check:** every line must tie (qty × price = amount), the lines must tie to the PO total, and bulk flower must come out to a whole or half pound.
4. **Match the store** by state license first, falling back to the store name, against a store map the sales team maintains.
5. **Decide:** skip it if a deal with that PO number already exists, flag it for a human if anything didn't tie or the PO is over 30 days old, otherwise create the deal.
6. **Hand off:** create the deal on the right company, assign tasks to fulfillment (and to the CPG team for non-flower orders), email the people who act on it, and send sales one summary: created, already there, needs a human.

This repo is steps 2–5 as plain JavaScript with a synthetic PO. The CRM calls, email and n8n wiring are left out.

## Run it

```bash
npm run demo
```

```
P2026100001  WOULD_CREATE
  deal:   Mountain Leaf Main St - Flower - 2 lbs + Infused pre-roll - 100 units  $3450
P2026100002  FLAG
  why:    Flower isn't a whole or half pound: 151 g; Flower amount doesn't tie ...
```

## Design choices

- **Nothing that doesn't tie gets created.** A wrong number in the CRM costs more than a minute of a person's time, so anything off is flagged with the exact reason.
- **License is the key.** Store names drift between systems; the state license doesn't.
- **Idempotent.** The PO number is stored on the deal and checked first, so a re-sent email never makes a second deal.
- **Restate the order the way sales sells it.** The POS orders flower in grams; the deal says "2 lbs @ $1,500/lb", and anything under $1,000 is marked for a courier fee.
- **Dry run and test mode.** Production has both switches: dry run checks the CRM but creates nothing, and test mode routes every email to one person.

## Layout

```
src/parse.js     PO text -> structured order, with the tie-out checks
src/decide.js    store match + create / skip / flag
samples/po.txt   synthetic two-PO PDF text
demo.js          runs both through
```
