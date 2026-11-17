/* The pay-only variant: the same code around another seed (variants/vince.json),
   built by `node build.js vince` into dist/vince/. It is built here, by the
   tests, so a stale copy can never be what gets tested, and it is served beside
   the main app on one address — which is how the two are published, and why
   each must keep to its own storage and its own offline cache. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const fs = require('fs');
const build = require('../build.js');

let chromium;
try { ({ chromium } = require('playwright')); } catch { /* not installed */ }

const ROOT = path.join(__dirname, '..');
const CONF = JSON.parse(fs.readFileSync(path.join(ROOT, 'variants', 'vince.json'), 'utf8'));
const KEY = CONF.seed.storageKey, TITLE = CONF.seed.title;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let built, server, browser, origin;

before(async () => {
  built = build.variant('vince');
  if (!chromium) return;
  /* /main/ is the app in the repo; /pay/ is the variant, whose page and service
     worker are its own and whose manifest and icons (which live in that app's
     own repo) are stood in for by this one's. */
  server = http.createServer((req, res) => {
    const m = decodeURIComponent(req.url.split('?')[0]).match(/^\/(main|pay)\/([\w.-]*)$/);
    const name = m && (m[2] || 'index.html');
    const file = !m ? null : m[1] === 'pay' && (name === 'index.html' || name === 'sw.js') ? path.join(built.dir, name) : path.join(ROOT, name);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

/* What the app this variant replaces had stored: written by that version
   itself, in August 2026, from made-up figures. The update has to open this. */
const AUGUST = { version: 1, generic: true, payOnly: true, storageKey: 'vince-pay-v1', name: 'Vince', title: "Vince's Pay", sundayLabel: 'Sunday pay',
  money: { buffer: 0, bills: [], months: [], debts: [] }, house: [], classic: [], mega: [], psm: [], games: [], goals: '',
  pay: { salary: 38500, hoursWeek: 37, weeksYear: 52.1667, sundayRate: null, nextPayDay: '2026-08-28', periodEndDays: 6, personalAllowance: 12570, taxCode: '1257L',
    fixed: [{ name: 'Pension', amount: 180.5, treatment: 'Sacrifice', from: '', to: '' }, { name: 'Union', amount: 22, treatment: 'After-tax', from: '', to: '' }],
    hours: { '2026-07-31': { ot: 8, sun: 7.5 }, '2026-08-28': { ot: 4, sun: 15 }, '2026-11-20': { ot: 6, sun: 7.5 } }, hpaHistory: { 2025: 310 },
    tax: { basicRate: 0.2, basicBand: 37700, higherRate: 0.4, higherBand: 125140, addRate: 0.45, niPT: 12570, niUEL: 50270, niMain: 0.08, niUpper: 0.02, taxYearStart: '2026-04-06' },
    sundayAtT: true, nonCumulative: true, rises: [{ from: '2026-04-01', salary: 39886, arrearsOn: '2026-10-23', otBackpay: true }],
    taxYears: [{ from: '2026-04-06', personalAllowance: 12570, basicRate: 0.2, basicBand: 37700, higherRate: 0.4, higherBand: 125140, addRate: 0.45, niPT: 12570, niUEL: 50270, niMain: 0.08, niUpper: 0.02 }] } };

const freeze = iso => `(() => { const R = Date, F = new R('${iso}T09:00:00Z').getTime();
  class D extends R { constructor(...a){ a.length ? super(...a) : super(F); } static now(){ return F; } }
  window.Date = D; })();`;

async function open(t, { on = '2026-11-17', data = AUGUST, app = 'pay', expect = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, acceptDownloads: true });
  await ctx.addInitScript(freeze(on));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${origin}/${app}/index.html`);
  if (data) await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [KEY, data]);
  await page.reload();
  await page.waitForSelector('#view .card, #view .banner', { timeout: 5000 });
  // `expect` is the one error a test means to cause; anything else fails it
  t.after(async () => { await ctx.close(); assert.deepEqual(errors.filter(e => !(expect && expect.test(e))), [], 'no console or page errors'); });
  return page;
}
const skip = { skip: chromium ? false : 'playwright not installed' };
const heading = page => page.$eval('#title', e => e.textContent);
const words = async page => (await page.$eval('body', b => b.innerText)).replace(/\s+/g, ' ');
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

/* ---------- the build ---------- */

test('a variant is the same page with another seed and another name, and nothing else', () => {
  const main = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const same = (html, title, initial) => html
    .replace(/<script id="seed" type="application\/json">[^]*?<\/script>/, '<seed>')
    .split(`>${title}<`).join('>TITLE<')
    .replace(`%3E${initial}%3C/text`, '%3EI%3C/text')
    .replace(`aria-hidden="true">${initial}</div>`, 'aria-hidden="true">I</div>');
  assert.equal(same(built.html, TITLE, 'V'), same(main, "Dec's Tracker", 'D'), 'the styles and the code are the very same');
  assert.match(built.html, /<title>Vince's Pay<\/title>/);
  assert.doesNotMatch(built.html, />Dec's Tracker</, 'the main app is not named on the page, the heading or the lock screen');
  const seed = JSON.parse(built.html.match(/<script id="seed" type="application\/json">([^]*?)<\/script>/)[1]);
  assert.deepEqual(seed, CONF.seed, 'the seed is the one in variants/vince.json');
  assert.equal(seed.storageKey, 'vince-pay-v1', 'the key his figures are stored under must never change');
  assert.equal(seed.payOnly, true);
});

test('a variant\'s service worker is the main one with its own cache, and each clears out only its own', () => {
  const main = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const mine = sw => new RegExp(sw.match(/^const MINE = \/(.+)\/;$/m)[1]);
  const name = sw => sw.match(/^const V = '([^']+)';$/m)[1];
  assert.equal(name(built.sw), CONF.cache);
  assert.match(name(built.sw), /^vince-pay-v\d+$/);
  assert.match(name(main), /^decs-tracker-v\d+$/);
  for (const old of ['vince-pay-v1', 'vince-pay-v6', name(built.sw)]) {
    assert.ok(mine(built.sw).test(old), `the variant owns ${old}`);
    assert.ok(!mine(main).test(old), `the main app leaves ${old} alone`);
  }
  for (const old of ['decs-stuff-v3', 'decs-tracker-v40', name(main)]) {
    assert.ok(mine(main).test(old), `the main app owns ${old}`);
    assert.ok(!mine(built.sw).test(old), `the variant leaves ${old} alone`);
  }
  const body = sw => sw.slice(sw.indexOf('const FILES'));
  assert.equal(body(built.sw), body(main), 'everything after the names is the same service worker');
  assert.doesNotMatch(built.sw, /decs-(stuff|tracker)/);
});

test('a variant has to say what it is called and where it keeps its data', () => {
  assert.throws(() => build.variant('../package'), /not a variant name/);
  assert.throws(() => build.variant('nobody'), /ENOENT/);
});

/* ---------- the update: what was stored still opens ---------- */

test('what the August app stored opens with nothing lost, under the same key', skip, async t => {
  const page = await open(t);
  assert.equal(await page.title(), TITLE);
  assert.equal(await heading(page), TITLE);
  assert.equal(await page.$eval('#sub', e => e.textContent), '£20.66/hr · 4-weekly', 'the hourly rate after his rise, on a 37-hour week');
  const s = await stored(page);
  for (const k of ['salary', 'hoursWeek', 'weeksYear', 'hours', 'hpaHistory', 'nextPayDay', 'periodEndDays', 'taxCode', 'sundayAtT', 'nonCumulative'])
    assert.deepEqual(s.pay[k], AUGUST.pay[k], `${k} is as it was`);
  assert.deepEqual(s.pay.fixed.map(f => [f.name, f.amount, f.treatment]), [['Pension', 180.5, 'Sacrifice'], ['Union', 22, 'After-tax']]);
  assert.deepEqual(s.pay.rises.map(r => [r.from, r.salary, r.arrearsOn, r.otBackpay]), [['2026-04-01', 39886, '2026-10-23', true]]);
  assert.equal(s.pay.taxYears.length, 1);
  assert.equal(s.pay.taxYears[0].personalAllowance, 12570);
  assert.equal(s.pay.sundayPct, null, 'no premium invented for someone paid plain time on a Sunday');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [KEY], 'and nothing is written under the main app\'s key');
});

test('his figures are his: plain time on a Sunday, each pay day taxed on its own', skip, async t => {
  const page = await open(t);
  const card = await page.$eval('#view .card', c => c.innerText.replace(/\s+/g, ' '));
  assert.match(card, /NEXT PAY DAY ?NEXT 20 Nov 2026/);
  assert.match(card, /Overtime pay £123\.96/, '6 hours at £20.66');
  assert.match(card, /Sunday pay £154\.95/, '7.5 hours at the same £20.66, and called what his seed calls it');
  assert.doesNotMatch(card, /Sunday premium/);
  assert.doesNotMatch(card, /Year to date/, 'a week 1 code never looks at the year so far, so the boxes for it are not offered');
  assert.match(card, /Payslip net pay/, 'the payslip figure can still be typed in');
  /* Week 1 basis: a pay day is taxed on its own four weeks. December follows
     the backpay in October and the overtime in November, and is still taxed
     exactly as January and February are. */
  const rows = await page.evaluate(() => C.payCalc(S.pay).rows.map(r => [r.payday, r.taxable, r.paye]));
  const quiet = ['2026-12-18', '2027-01-15', '2027-02-12'].map(d => rows.find(r => r[0] === d));
  assert.deepEqual(quiet.map(r => r[1]), [2877.86, 2877.86, 2877.86], 'basic pay less the pension, nothing else');
  assert.deepEqual(quiet.map(r => r[2]), [382, 382, 382], 'a fifth of the £1,910 over four weeks of free pay (£967.64)');
});

/* ---------- one screen and its settings ---------- */

test('there is no bar of tabs, and the gear goes to Settings and back', skip, async t => {
  const page = await open(t);
  assert.equal(await page.$eval('#tabs', n => getComputedStyle(n.closest('nav')).display), 'none');
  assert.equal(await page.getAttribute('#settingsBtn', 'aria-label'), 'Settings');
  await page.click('#settingsBtn');
  assert.equal(await heading(page), 'Settings');
  assert.equal(await page.getAttribute('#settingsBtn', 'aria-label'), 'Back to pay');
  assert.equal((await page.$eval('#view > :first-child', e => e.innerText)).trim(), '‹ Back to pay', 'the way back is the first thing on the page');
  await page.click('#view [data-act="tab"][data-tab="pay"]');
  assert.equal(await heading(page), TITLE);
  await page.click('#settingsBtn');
  await page.click('#settingsBtn');
  assert.equal(await heading(page), TITLE, 'the gear, pressed again, goes back as well');
  // the bar is hidden, not gone: nothing on it may lead anywhere but the pay screen
  for (const k of ['home', 'money', 'lists', 'games']) {
    await page.evaluate(k => document.querySelector(`.tabs button[data-tab="${k}"]`).click(), k);
    assert.equal(await heading(page), TITLE, `${k} is not a place in this app`);
  }
});

test('nothing on either screen belongs to the main app', skip, async t => {
  const page = await open(t);
  for (const d of await page.$$('#view details:not([open]) > summary')) await d.click();
  const pay = await words(page);
  await page.click('#settingsBtn');
  const settings = await words(page);
  for (const [where, text] of [['pay', pay], ['settings', settings]]) {
    assert.doesNotMatch(text, /Dec's|Tracker|Excel|spreadsheet/i, where);
    assert.doesNotMatch(text, /cash flow|\bbills?\b|\bdebts?\b|saving goal|house job/i, where);
  }
  assert.match(settings, /About Vince's Pay/);
  assert.match(settings, /On this device 3 pay days with hours · 2 lines every period · 1 pay rise/);
  assert.match(pay, /Sunday hours are paid at the hourly rate/);
  assert.match(pay, /Sunday pay £19\.95 → £20\.66 an hour/, 'the rise is described in his words too');
});

test('a backup is named after this app, and holds his figures', skip, async t => {
  const page = await open(t);
  await page.click('#settingsBtn');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  assert.equal(file.suggestedFilename(), 'vince-pay-2026-11-17.json');
  const back = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  assert.equal(back.pay.salary, 38500);
  assert.equal(back.backupOn, '2026-11-17');
});

test('undo brings back the screen the change was made on, never one this app does not have', skip, async t => {
  const page = await open(t);
  await page.click('[data-act="hstep"][data-kind="ot"][data-d="1"]');
  assert.equal((await stored(page)).pay.hours['2026-11-20'].ot, 7);
  await page.click('#settingsBtn');
  await page.click('#undoBtn');
  assert.equal(await heading(page), TITLE, 'back on the pay screen, where the hour was added');
  assert.equal((await stored(page)).pay.hours['2026-11-20'].ot, 6);
});

test('a screen that will not draw offers the way back to pay, not to a Home that is not there', skip, async t => {
  const page = await open(t, { expect: /will not draw this/ });
  await page.evaluate(() => { VIEWS.settings = () => { throw new Error('will not draw this'); }; });
  await page.click('#settingsBtn');
  assert.equal(await heading(page), 'Something broke');
  assert.equal(await page.$('#view [data-tab="home"]'), null);
  await page.click('#view [data-act="tab"][data-tab="pay"]');
  assert.equal(await heading(page), TITLE);
});

test('a new phone starts empty, says how to bring the figures across, and saves under its own key', skip, async t => {
  const page = await open(t, { data: null });
  assert.equal(await heading(page), TITLE);
  assert.match(await words(page), /No data loaded yet\. Tap the gear at the top, then Restore backup/);
  const s = await stored(page);
  assert.equal(s.pay.hoursWeek, 37);
  assert.equal(s.pay.sundayAtT, true);
  assert.equal(s.pay.nonCumulative, true);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [KEY]);
  // typing a salary is all it takes to get a pay day
  await page.click('#view details[data-key="yourpay"] > summary');
  await page.fill('[data-set="pay.salary"]', '38500');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  assert.match(await words(page), /Basic pay £2,952\.08/);
});

/* ---------- two apps at one address ---------- */

test('side by side on one address, each app keeps its own offline copy and clears only its own old ones', skip, async t => {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  t.after(() => ctx.close());
  const errors = [];
  const tab = async app => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(`${origin}/${app}/index.html`);
    await page.waitForSelector('#view .card, #view .banner');
    return page;
  };
  const names = sw => sw.match(/^const V = '([^']+)';$/m)[1];
  const mainCache = names(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')), payCache = CONF.cache;
  const main = await tab('main');
  // left behind by earlier versions of each app, and by something else entirely
  await main.evaluate(async () => { for (const k of ['decs-stuff-v3', 'decs-tracker-v1', 'vince-pay-v6', 'someone-elses-v1']) await (await caches.open(k)).put('./left-behind', new Response('old')); });
  const install = page => page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
  const settled = async (page, want) => {
    for (let i = 0; i < 80; i++) {
      const have = (await page.evaluate(() => caches.keys())).sort();
      if (JSON.stringify(have) === JSON.stringify(want)) return have;
      await page.waitForTimeout(250);
    }
    return (await page.evaluate(() => caches.keys())).sort();
  };
  await install(main);
  assert.deepEqual(await settled(main, [mainCache, 'someone-elses-v1', 'vince-pay-v6'].sort()), [mainCache, 'someone-elses-v1', 'vince-pay-v6'].sort(),
    'the main app clears its own old copies and leaves the rest');
  const pay = await tab('pay');
  await install(pay);
  assert.deepEqual(await settled(pay, [mainCache, payCache, 'someone-elses-v1'].sort()), [mainCache, payCache, 'someone-elses-v1'].sort(),
    'the variant clears its own old copy and leaves the main app\'s where it is');
  const held = (page, k) => page.evaluate(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname).sort(), k);
  assert.ok((await held(pay, payCache)).includes('/pay/index.html'));
  assert.ok((await held(pay, payCache)).every(p => p.startsWith('/pay/')), 'only its own files');
  assert.ok((await held(pay, mainCache)).every(p => p.startsWith('/main/')));
  // and with no signal, each one opens as itself
  await pay.reload(); await main.reload();                      // so each page is under its service worker
  await ctx.setOffline(true);
  await pay.reload(); await pay.waitForSelector('#view .card, #view .banner');
  assert.equal(await pay.title(), TITLE);
  await main.reload(); await main.waitForSelector('#view .card, #view .banner');
  assert.equal(await main.title(), "Dec's Tracker");
  await ctx.setOffline(false);
  assert.deepEqual(errors, []);
});
