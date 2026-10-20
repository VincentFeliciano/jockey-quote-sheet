/* Money maths for the pricing block, checked outside the browser. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join('E:', 'claude_projects', 'jockey-quote-sheet', 'js', 'schema.js');
const src = fs.readFileSync(file, 'utf8');

const sandbox = { console };
sandbox.window = sandbox;          /* in a browser window IS the global */
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const Q = sandbox.QS;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

ok('three paint tiers', Q.PAINT_TIERS.length === 3);
ok('simple is 150', Q.paintTier('simple').price === 150);
ok('standard is 175', Q.paintTier('standard').price === 175);
ok('complex is 200', Q.paintTier('complex').price === 200);
ok('decal is 10', Q.DECAL_PRICE === 10);
ok('delivery is 50', Q.DELIVERY_FEE === 50);

const q = Q.newQuote('JQ-2026-001');
ok('new quote has pricing', !!q.pricing);
ok('new quote defaults to standard', q.pricing.paintTier === 'standard');
ok('new quote has no extras', q.items.length === 0);

let t = Q.totals(q);
ok('standard alone totals 175', t.total === 175, 'got ' + t.total);

q.pricing.decals = 3;
t = Q.totals(q);
ok('3 decals add 30', t.decals === 30 && t.total === 205, 'got ' + t.total);

q.pricing.delivery = true;
t = Q.totals(q);
ok('delivery adds 50', t.delivery === 50 && t.total === 255, 'got ' + t.total);

q.pricing.paintTier = 'complex';
q.pricing.decals = 2;
t = Q.totals(q);
ok('complex+2 decals+delivery = 270', t.total === 270, 'got ' + t.total);

q.items.push({ desc: 'Rush', qty: 1, unit: 25 });
t = Q.totals(q);
ok('extras add on top = 295', t.total === 295, 'got ' + t.total);
ok('extras reported separately', t.extras === 25, 'got ' + t.extras);

q.discount = 45;
t = Q.totals(q);
ok('discount off the total = 250', t.total === 250, 'got ' + t.total);

const old = Q.ensureShape({ id: 'x', items: [{ desc: 'a', qty: 1, unit: 10 }] });
ok('old record gains pricing', !!old.pricing);
ok('old record defaults to standard', old.pricing.paintTier === 'standard');
ok('old record totals 185', Q.totals(old).total === 185, 'got ' + Q.totals(old).total);

ok('decals floor at zero', Q.fillPricing({ decals: -5 }).decals === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
