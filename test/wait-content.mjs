/* Wait for Pages to actually serve the new build: check a content marker,
   not just a 200. */
const root = 'https://vincentfideliciano.github.io/jockey-quote-sheet/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { cache: 'no-store' });
  return { status: res.status, text: await res.text() };
}

for (let i = 1; i <= 40; i++) {
  try {
    const schema = await get(root + 'js/schema.js');
    const html = await get(root + 'index.html');
    const lr = await fetch(root + 'icons/plymr.png?cb=' + Date.now(), { cache: 'no-store' });

    const hasTiers = /QS\.PAINT_TIERS/.test(schema.text);
    const hasMark = /plymr\.png/.test(html.text);
    const logoOk = lr.status === 200;

    console.log(`try ${i}: schema=${schema.status} tiers=${hasTiers} html=${html.status} mark=${hasMark} logo=${lr.status}`);

    if (hasTiers && hasMark && logoOk) {
      console.log('DEPLOYED');
      process.exit(0);
    }
  } catch (e) {
    console.log('try ' + i + ': ' + e.message);
  }
  await sleep(15000);
}
console.log('TIMED OUT waiting for the new build');
process.exit(1);
