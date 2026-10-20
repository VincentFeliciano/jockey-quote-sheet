/* Poll the published site until the new build is actually being served. */
const URL = 'https://vincentfeliciano.github.io/jockey-quote-sheet/js/schema.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 1; i <= 30; i++) {
  try {
    const res = await fetch(URL + '?cb=' + Date.now(), { cache: 'no-store' });
    const text = await res.text();
    const fresh = text.includes('PAINT_DEFAULTS');
    console.log(`try ${i}: status=${res.status} bytes=${text.length} fresh=${fresh}`);
    if (fresh) { console.log('DEPLOYED'); process.exit(0); }
  } catch (e) {
    console.log(`try ${i}: ${e.message}`);
  }
  await sleep(8000);
}
console.log('STILL OLD after 4 minutes');
process.exit(1);
