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

/* ---------- pricing constants ---------- */
ok('three paint tiers', Q.PAINT_TIERS.length === 3);
ok('simple is 150', Q.paintTier('simple').price === 150);
ok('standard is 175', Q.paintTier('standard').price === 175);
ok('complex is 200', Q.paintTier('complex').price === 200);
ok('decal is 10', Q.DECAL_PRICE === 10);
ok('delivery is 25', Q.DELIVERY_FEE === 25);

/* ---------- the sheet's shape: piece only, no customer, no extras ---------- */
const first = Q.SECTIONS[0];
ok('sheet starts with the piece', first.id === 'job' && first.title === 'The piece');
ok('piece has jockey, due, rush',
  first.fields.map(f => f.k).join(',') === 'job.jockey,job.due,job.rush',
  first.fields.map(f => f.k).join(','));
ok('jockey field is labelled "Jockey name"',
  first.fields[0].label === 'Jockey name', first.fields[0].label);
ok('no size field anywhere',
  Q.SECTIONS.every(s => s.fields.every(f => f.k.indexOf('size') === -1)));
ok('no customer section', Q.SECTIONS.every(s => s.id !== 'customer'));

const q = Q.newQuote('JQ-2026-001');
ok('new quote has pricing', !!q.pricing);
ok('new quote defaults to standard', q.pricing.paintTier === 'standard');
ok('new quote has no extras list', q.items === undefined);
ok('new quote has no customer block', q.customer === undefined);
ok('new quote job is jockey/due/rush',
  Object.keys(q.job).sort().join(',') === 'due,jockey,rush',
  Object.keys(q.job).sort().join(','));
ok('new quote due date starts blank', q.job.due === '', JSON.stringify(q.job.due));

/* ---------- totals ---------- */
let t = Q.totals(q);
ok('standard alone totals 175', t.total === 175, 'got ' + t.total);

q.pricing.decals = 3;
t = Q.totals(q);
ok('3 decals add 30', t.decals === 30 && t.total === 205, 'got ' + t.total);

q.pricing.delivery = true;
t = Q.totals(q);
ok('delivery adds 25', t.delivery === 25 && t.total === 230, 'got ' + t.total);

q.pricing.paintTier = 'complex';
q.pricing.decals = 2;
t = Q.totals(q);
ok('complex+2 decals+delivery = 245', t.total === 245, 'got ' + t.total);

q.discount = 45;
t = Q.totals(q);
ok('discount off the total = 200', t.total === 200, 'got ' + t.total);

/* ---------- restoration ---------- */
ok('strip is 150', Q.RESTORE_STRIP === 150);
ok('resurface is 100', Q.RESTORE_SURFACE === 100);

const plain = Q.newQuote('JQ-2026-002');
ok('new quote has restoration', !!plain.restore);
ok('new quote charges no restoration',
  Q.totals(plain).restoreStrip === 0 && Q.totals(plain).restoreSurface === 0);
ok('new quote reports no restoration', Q.hasRestore(plain) === false);

plain.restore.strip = true;
t = Q.totals(plain);
ok('strip alone adds 150', t.restoreStrip === 150 && t.restoreSurface === 0, JSON.stringify(t));
ok('strip alone totals 325', t.total === 325, 'got ' + t.total);

plain.restore.strip = false;
plain.restore.resurface = true;
t = Q.totals(plain);
ok('resurface alone adds 100', t.restoreSurface === 100 && t.restoreStrip === 0);
ok('resurface alone totals 275', t.total === 275, 'got ' + t.total);

plain.restore.strip = true;
plain.restore.concrete = true;
plain.restore.work = 'Both';
t = Q.totals(plain);
ok('strip and resurface together add 250',
  t.restoreStrip + t.restoreSurface === 250, JSON.stringify(t));
ok('both together total 425', t.total === 425, 'got ' + t.total);
ok('restoration is reported', Q.hasRestore(plain) === true);

const legacy = Q.ensureShape({ id: 'y', job: { jockey: 'Old', due: '', rush: false } });
ok('old record gains restoration', !!legacy.restore);
ok('old record charges no restoration', Q.totals(legacy).total === 175, 'got ' + Q.totals(legacy).total);
ok('old record reports no restoration', Q.hasRestore(legacy) === false);

/* ---------- old records: extras are stripped, not counted ---------- */
const old = Q.ensureShape({
  id: 'x',
  items: [{ desc: 'a', qty: 1, unit: 10 }],
  customer: { name: 'Someone', company: 'Somewhere' },
  job: { jockey: 'Stocky', due: '2026-11-01', rush: false, size: 'M' }
});
ok('old record gains pricing', !!old.pricing);
ok('old record defaults to standard', old.pricing.paintTier === 'standard');
ok('old record loses its extras list', old.items === undefined);
ok('old record loses its customer block', old.customer === undefined);
ok('old record loses job.size', old.job.size === undefined);
ok('old record keeps the jockey', old.job.jockey === 'Stocky', old.job.jockey);
ok('old record totals 175', Q.totals(old).total === 175, 'got ' + Q.totals(old).total);

/* ---------- guards ---------- */
ok('decals floor at zero', Q.fillPricing({ decals: -5 }).decals === 0);

/* ---------- parts painted the same colour share one row ---------- */
const black = Q.groupRows([
  { label: 'Eyes', hex: '#000000', value: 'Black' },
  { label: 'Hair', hex: '#000000', value: 'Black' },
  { label: 'Boots', hex: '#000000', value: 'Black' }
]);
ok('three black parts make one row', black.length === 1, 'got ' + black.length);
ok('the row names every part', black[0].label === 'Eyes, Hair, Boots', black[0].label);
ok('the row keeps the colour', black[0].hex === '#000000', black[0].hex);
ok('the row keeps the colour name', black[0].value === 'Black', black[0].value);

const two = Q.groupRows([
  { label: 'Sleeves', hex: '#ffd60a', value: 'Yellow', design: 'checkerboard' },
  { label: 'Cuffs', hex: '#FFD60A', value: 'Yellow', design: 'plain' },
  { label: 'Base', hex: '#111111', value: 'Charcoal' }
]);
ok('colour match ignores case', two.length === 2, 'got ' + two.length);
ok('each design note names its part', two[0].design === 'Sleeves: checkerboard \u00b7 Cuffs: plain', two[0].design);
ok('a part alone keeps its bare note', Q.groupRows([
  { label: 'Base', hex: '#111111', value: 'Charcoal', design: 'matte' }
])[0].design === 'matte');

const mixed = Q.groupRows([
  { label: 'Jockey name', value: 'R. Vega' },
  { label: 'Rush job', value: 'RUSH JOB', badge: true },
  { label: 'Eyes', hex: '#000000', value: 'Black' },
  null
]);
ok('rows with no colour pass straight through', mixed.length === 3, 'got ' + mixed.length);
ok('text rows keep their order', mixed[0].label === 'Jockey name' && mixed[1].label === 'Rush job');
ok('nothing to group is nothing to change', Q.groupRows([]).length === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
