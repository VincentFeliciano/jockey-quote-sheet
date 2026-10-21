/* Poll the published copy until it serves the new brand lockup.
   Prints one line per try; exits 0 as soon as everything checks out. */
const BASE = process.env.QS_BASE || 'https://vincentfeliciano.github.io/jockey-quote-sheet/';
const TRIES = Number(process.env.QS_TRIES || 8);
const GAP = Number(process.env.QS_GAP || 20) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(path) {
  try {
    const res = await fetch(BASE + path + '?cb=' + Date.now(), { redirect: 'follow' });
    const body = await res.text();
    return { code: res.status, len: body.length, body };
  } catch (e) {
    return { code: 0, len: 0, body: '', err: String(e.message || e) };
  }
}

for (let i = 1; i <= TRIES; i++) {
  const html = await grab('index.html');
  const svg = await grab('icons/cg.svg');
  const schema = await grab('js/schema.js');
  const hasLockup = /icons\/cg\.svg/.test(html.body);
  const hasTiers = /QS\.PAINT_TIERS/.test(schema.body);
  const svgOk = svg.code === 200 && /Crafter/.test(svg.body);
  console.log(
    `try ${i}/${TRIES}  index=${html.code} (${html.len}b lockup=${hasLockup})  ` +
    `cg.svg=${svg.code} (${svg.len}b ok=${svgOk})  schema=${schema.code} (${schema.len}b tiers=${hasTiers})`
  );
  if (html.code === 200 && hasLockup && svgOk && schema.code === 200 && hasTiers) {
    console.log('LIVE');
    process.exit(0);
  }
  if (i < TRIES) await sleep(GAP);
}
console.log('STILL NOT SERVING THE NEW BUILD');
process.exit(1);
