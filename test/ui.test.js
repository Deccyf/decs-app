/* Browser tests. Playwright is optional — install it (npm i -D playwright) and
   these run; without it they skip so `npm test` still works on a bare checkout.
   PW_CHROMIUM can point at an already-installed browser. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); } catch { /* not installed */ }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let server, browser, origin;

before(async () => {
  if (!chromium) return;
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const SAMPLE = {
  version: 2, name: 'Dec',
  money: { buffer: 300, balance: 1000, balanceOn: '2026-09-09', dueShift: 'next', bankHols: true,
    bills: [ { id: '1', name: 'Rent', category: 'Housing', amount: 780, dueDay: 1, started: '2024-01' },
             { id: '2', name: 'Council Tax', category: 'Housing', amount: 168, dueDay: 13, started: '2024-01' },
             { id: '3', name: 'Energy', category: 'Utilities', amount: 96, dueDay: 20, started: '2024-01' } ],
    months: [{ month: '2026-07', earnings: 3010, saved: 500 }, { month: '2026-08', earnings: 2755, saved: 260 }],
    debts: [{ id: 'd1', name: 'Card', type: 'Short-term', balance: 1850, repayment: 120, apr: 0.219 }] },
  house: [{ id: 'h1', job: 'Paint hallway', status: 'To do', dateDone: null, notes: '' }],
  classic: [{ set: 'Base Set', no: '4/102', card: 'Charizard', have: true, grade: '' }],
  mega: [], psm: [], games: [{ id: 'g1', game: 'DOOM 64', date: '2026-08-14', notes: '' }], goals: '',
  pay: { salary: 41200, hoursWeek: 35, weeksYear: 52.1667, sundayRate: 3.7, nextPayDay: '2026-08-28',
    periodEndDays: 6, personalAllowance: 12570, fixed: [], hours: {}, hpaHistory: {}, rises: [],
    tax: { basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45,
      niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02, taxYearStart: '2026-04-06' } }
};

/* Pins "today" so the figures are the same on every run. */
const freeze = iso => `(() => { const R = Date, F = new R('${iso}T09:00:00Z').getTime();
  class D extends R { constructor(...a){ a.length ? super(...a) : super(F); } static now(){ return F; } }
  window.Date = D; })();`;

async function open(t, { on = '2026-09-09', data = SAMPLE, tab = null, sec = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  await ctx.addInitScript(freeze(on));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/index.html');
  if (data) await page.evaluate(d => localStorage.setItem('decs-stuff-v1', JSON.stringify(d)), data);
  await page.reload();
  await page.waitForSelector('#view .card, #view .banner', { timeout: 5000 });
  if (tab) { await page.click(`.tabs button[data-tab="${tab}"]`); await page.waitForTimeout(250); }
  if (sec) { await page.click(`[data-act="moneyTab"][data-v="${sec}"]`); await page.waitForTimeout(250); }
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no console or page errors'); });
  return page;
}
const skip = { skip: chromium ? false : 'playwright not installed' };

test('every tab renders in both themes without errors', skip, async t => {
  const page = await open(t);
  for (const tab of ['home', 'pay', 'money', 'lists', 'games']) {
    await page.click(`.tabs button[data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    assert.ok(await page.$('#view .card'), `${tab} drew a card`);
  }
  await page.click('#settingsBtn'); await page.waitForTimeout(200);
  await page.click('[data-act="theme"][data-v="dark"]'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.ok(await page.$('#view .card'), 'still rendering in dark');
});

test('the app is called Dec\'s Tracker and keeps the original storage key', skip, async t => {
  const page = await open(t);
  assert.equal(await page.title(), "Dec's Tracker");
  assert.equal(await page.$eval('#title', e => e.textContent), "Dec's Tracker");
  assert.deepEqual(Object.keys(await page.evaluate(() => ({ ...localStorage }))).filter(k => k.startsWith('decs')),
    ['decs-stuff-v1'], 'renaming must not orphan saved data');
});

test('the weekend shift option moves bill dates', skip, async t => {
  const page = await open(t, { tab: 'money' });
  const dates = () => page.$$eval('.lrow .ld', es => es.map(e => e.textContent.replace(/\s+/g, '')));
  await page.click('.seg button[data-v="exact"]'); await page.waitForTimeout(200);
  assert.deepEqual(await dates(), ['Sun13', 'Sun20', 'Fri25'], 'exact keeps the Sundays');
  await page.click('.seg button[data-v="next"]'); await page.waitForTimeout(200);
  assert.deepEqual(await dates(), ['Mon14', 'Mon21', 'Fri25'], 'next working day');
  await page.click('.seg button[data-v="prev"]'); await page.waitForTimeout(200);
  assert.deepEqual(await dates(), ['Fri11', 'Fri18', 'Fri25'], 'day before');
});

test('the balance carries forward and can be corrected', skip, async t => {
  const first = await open(t, { on: '2026-09-09', tab: 'money' });
  assert.match(await first.$eval('.results .r', e => e.textContent), /Balance today.*£1,000/);
  const later = await open(t, { on: '2026-09-22', tab: 'money' });
  assert.match(await later.$eval('.results .r', e => e.textContent), /Estimated balance today.*£736/);
  // retyping restarts it from the new figure
  await later.fill('[data-set="money.balance"]', '700');
  await later.dispatchEvent('[data-set="money.balance"]', 'change');
  await later.waitForTimeout(300);
  assert.match(await later.$eval('.results .r', e => e.textContent), /Balance today.*£700/);
  assert.equal(await later.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.balanceOn), '2026-09-22');
});

test('a negative balance can be entered without a minus key', skip, async t => {
  const page = await open(t, { tab: 'money' });
  assert.equal(await page.$eval('[data-set="money.balance"]', e => e.getAttribute('inputmode')), null,
    'no inputmode="decimal" — that keypad has no minus');
  await page.click('.signed .sgn'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.balance), -1000);
  assert.ok(await page.$eval('.signed .sgn', e => e.classList.contains('on')), 'button shows the negative state');
});

test('a half-empty backup does not white-screen', skip, async t => {
  const page = await open(t, { data: { pay: {}, money: {} } });
  assert.ok((await page.$$('#view .card')).length > 0, 'home still renders');
  for (const tab of ['pay', 'money', 'lists', 'games']) {
    await page.click(`.tabs button[data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    assert.ok((await page.$$('#view .card, #view .empty')).length > 0, `${tab} survived`);
  }
});

test('the day turning over redraws the figures', skip, async t => {
  const page = await open(t, { on: '2026-09-13', tab: 'money' });   // Council due Sun 13 -> clears Mon 14
  assert.match(await page.$eval('.results .r', e => e.textContent), /Balance today.*£1,000/);
  await page.evaluate(() => {
    const F = new Date('2026-09-14T09:00:00Z').getTime(), R = Object.getPrototypeOf(Date);
    class D extends R { constructor(...a) { a.length ? super(...a) : super(F); } static now() { return F; } }
    window.Date = D;
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(400);
  assert.match(await page.$eval('.results .r', e => e.textContent), /Estimated balance today.*£832/);
});

test('changing a bill amount offers to keep the old price', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  const page = await open(t, { data, tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]');
  await page.waitForTimeout(250);
  await page.fill('[data-set="money.bills.2.amount"]', '110');            // Energy 96 -> 110
  await page.dispatchEvent('[data-set="money.bills.2.amount"]', 'change');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('dlg').open), 'it asks first');
  assert.match(await page.$eval('#dlgForm p', e => e.textContent), /£96\.00 → £110\.00.*£168 a year/);
  await page.click('#dlgForm button[value="ok"]');                        // keep the old price
  await page.waitForTimeout(350);
  const bills = await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills);
  const energy = bills.filter(b => b.name === 'Energy');
  assert.equal(energy.length, 2, 'split into two rows');
  assert.equal(energy[0].amount, 96);
  assert.equal(energy[0].ended, '2026-08', 'old row ends the month before');
  assert.equal(energy[1].amount, 110);
  assert.equal(energy[1].started, '2026-09');
  assert.ok(await page.$eval('#view', e => /Price changes/.test(e.textContent)), 'and the card appears');
});

test('declining the offer just changes the amount', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]');
  await page.waitForTimeout(250);
  await page.fill('[data-set="money.bills.2.amount"]', '99');
  await page.dispatchEvent('[data-set="money.bills.2.amount"]', 'change');
  await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="cancel"]');
  await page.waitForTimeout(300);
  const bills = await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills);
  assert.equal(bills.filter(b => b.name === 'Energy').length, 1, 'still one row');
  assert.equal(bills.find(b => b.name === 'Energy').amount, 99);
});

test('a brand new bill does not trigger the history prompt', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills.push({ id: 'n', name: 'New', category: 'Other', amount: 10, dueDay: 5, started: '2026-09' });
  const page = await open(t, { data, tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]');
  await page.waitForTimeout(250);
  await page.fill('[data-set="money.bills.3.amount"]', '12');
  await page.dispatchEvent('[data-set="money.bills.3.amount"]', 'change');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), false, 'nothing to keep — started this month');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills[3].amount), 12);
});

test('a repeated change event cannot split the same bill twice', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]');
  await page.waitForTimeout(250);
  // fire change twice in a row, as a stray blur or a double-commit would
  await page.evaluate(() => {
    const el = document.querySelector('[data-set="money.bills.2.amount"]');
    el.value = '110';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(300);
  if (await page.evaluate(() => document.getElementById('dlg').open)) {
    await page.click('#dlgForm button[value="ok"]');   // answer the queued second prompt too
    await page.waitForTimeout(300);
  }
  const energy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills.filter(b => b.name === 'Energy'));
  assert.equal(energy.length, 2, 'still exactly two rows');
  assert.deepEqual(energy.map(b => [b.amount, b.started, b.ended]),
    [[96, '2024-01', '2026-08'], [110, '2026-09', null]]);
});

/* ---------------------------------------------------------------- PIN lock -- */
async function turnPinOn(page, pin) {
  await page.click('#settingsBtn'); await page.waitForTimeout(200);
  await page.click('[data-act="setPin"]');
  await page.waitForTimeout(200);
  await page.click('#dlgForm button[value="ok"]');          // "Download a backup"
  await page.waitForTimeout(300);
  await page.fill('#dlgIn', pin); await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(300);
  await page.fill('#dlgIn', pin); await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(900);                            // PBKDF2 takes a moment
}

test('the app is not locked and nothing is encrypted by default', skip, async t => {
  const page = await open(t);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lock')).display), 'none');
  const raw = await page.evaluate(() => localStorage.getItem('decs-stuff-v1'));
  assert.ok(JSON.parse(raw).money, 'plain JSON on disk');
});

test('setting a PIN encrypts what is stored', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, '482913');
  const raw = await page.evaluate(() => localStorage.getItem('decs-stuff-v1'));
  const blob = JSON.parse(raw);
  assert.equal(blob.decsEnc, 1);
  assert.ok(blob.salt && blob.iv && blob.ct, 'salt, iv and ciphertext are all stored');
  assert.equal(blob.iters, 310000);
  assert.equal(blob.money, undefined, 'no readable data left');
  assert.ok(!/41200|1420|Charizard|DOOM/.test(raw), 'nothing recognisable survives in the blob');
  assert.match(await page.$eval('#view', e => e.textContent), /PIN lock/);
});

test('a PIN-locked app asks before showing anything', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, '482913');
  await page.reload();
  await page.waitForSelector('#lock:not([hidden])', { timeout: 5000 });
  assert.equal(await page.$$eval('#view .card', e => e.length), 0, 'nothing rendered behind the lock');
  assert.equal(await page.evaluate(() => document.body.classList.contains('locked')), true);

  await page.fill('#pinIn', '999999');
  await page.click('#lockGo');
  await page.waitForTimeout(1200);
  assert.match(await page.$eval('#lockErr', e => e.textContent), /didn.t work/);
  assert.equal(await page.evaluate(() => document.getElementById('lock').hidden), false, 'still locked');

  await page.fill('#pinIn', '482913');
  await page.click('#lockGo');
  await page.waitForSelector('#view .card', { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.getElementById('lock').hidden), true);
  assert.match(await page.$eval('#view', e => e.textContent), /Safe to spend|Next pay day/);
});

test('data still saves, and stays encrypted, after unlocking', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, '482913');
  await page.reload();
  await page.waitForSelector('#lock:not([hidden])');
  await page.fill('#pinIn', '482913'); await page.click('#lockGo');
  await page.waitForSelector('#view .card', { timeout: 8000 });
  await page.click('.tabs button[data-tab="money"]'); await page.waitForTimeout(300);
  await page.fill('[data-set="money.balance"]', '1234');
  await page.dispatchEvent('[data-set="money.balance"]', 'change');
  await page.waitForTimeout(900);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('decs-stuff-v1'))).decsEnc, 1,
    'the write went back out encrypted');
  await page.reload();
  await page.waitForSelector('#lock:not([hidden])');
  await page.fill('#pinIn', '482913'); await page.click('#lockGo');
  await page.waitForSelector('#view .card', { timeout: 8000 });
  assert.equal(await page.evaluate(() => JSON.parse(JSON.stringify(S.money.balance))), 1234, 'and it survived');
});

test('turning the PIN off puts the data back in the clear', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, '482913');
  await page.click('[data-act="clearPin"]');
  await page.waitForTimeout(250);
  await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(600);
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('decs-stuff-v1'))).money, 'plain JSON again');
  await page.reload();
  await page.waitForSelector('#view .card', { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.getElementById('lock').hidden), true, 'no lock screen');
});

test('a short PIN is refused', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await page.click('#settingsBtn'); await page.waitForTimeout(200);
  await page.click('[data-act="setPin"]');
  await page.waitForTimeout(200);
  await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(300);
  await page.fill('#dlgIn', '1234'); await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(400);
  assert.match(await page.$eval('#toast', e => e.textContent), /at least 6/);
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('decs-stuff-v1'))).money, 'nothing encrypted');
});

test('mismatched confirmation leaves the PIN off', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await page.click('#settingsBtn'); await page.waitForTimeout(200);
  await page.click('[data-act="setPin"]');
  await page.waitForTimeout(200);
  await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(300);
  await page.fill('#dlgIn', '482913'); await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(300);
  await page.fill('#dlgIn', '482914'); await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(400);
  assert.match(await page.$eval('#toast', e => e.textContent), /didn't match/);
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('decs-stuff-v1'))).money, 'nothing encrypted');
});

test('the PIN itself is never written to the device', skip, async t => {
  const PIN = '4829137';
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, PIN);

  // sweep every place a browser can persist something
  const stored = await page.evaluate(async () => {
    const dump = { local: {}, session: {}, cookie: document.cookie, idb: [] };
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); dump.local[k] = localStorage.getItem(k); }
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); dump.session[k] = sessionStorage.getItem(k); }
    if (indexedDB.databases) { try { dump.idb = (await indexedDB.databases()).map(d => d.name); } catch (e) { } }
    return dump;
  });
  const haystack = JSON.stringify(stored);
  assert.ok(!haystack.includes(PIN), 'the PIN does not appear in localStorage, sessionStorage or cookies');
  assert.deepEqual(stored.idb, [], 'nothing squirrelled away in IndexedDB');
  // the only keys the app ever writes are the data blob and (once changed) the theme
  assert.deepEqual(Object.keys(stored.local).filter(k => k !== 'decs-stuff-v1:theme'), ['decs-stuff-v1'],
    'nothing is kept beyond the encrypted data and the theme');

  // what IS kept is a random salt and ciphertext — needed to re-derive, useless alone
  const blob = JSON.parse(stored.local['decs-stuff-v1']);
  assert.deepEqual(Object.keys(blob).sort(), ['ct', 'decsEnc', 'iters', 'iv', 'salt']);
  assert.ok(blob.salt.length >= 20 && blob.iv.length >= 12, 'a real salt and iv');

  // and the derived key is non-extractable, so script cannot read it back out either
  assert.equal(await page.evaluate(async () => {
    try { await crypto.subtle.exportKey('raw', cryptoKey); return 'EXPORTED'; } catch (e) { return 'refused'; }
  }), 'refused');

  // a reload wipes the in-memory key: it has to be typed again
  await page.reload();
  await page.waitForSelector('#lock:not([hidden])', { timeout: 5000 });
  assert.equal(await page.evaluate(() => cryptoKey), null, 'no key survives a reload');
});

test('the PIN is set once, not re-configured each time', skip, async t => {
  const page = await open(t);
  page.on('download', d => d.cancel().catch(() => {}));
  await turnPinOn(page, '482913');
  for (let i = 0; i < 3; i++) {                       // open the app three times over
    await page.reload();
    await page.waitForSelector('#lock:not([hidden])', { timeout: 5000 });
    await page.fill('#pinIn', '482913');
    await page.click('#lockGo');
    await page.waitForSelector('#view .card', { timeout: 8000 });
    await page.click('#settingsBtn'); await page.waitForTimeout(200);
    assert.match(await page.$eval('#view', e => e.textContent), /PIN lock/);
  }
  // still the same PIN, never re-set
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('decs-stuff-v1'))).decsEnc, 1);
});

test('the home card totals only the payments it is not showing', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.balanceOn = '2026-09-01';
  data.money.bills = [
    { id: 'a', name: 'A', category: 'Other', amount: 10, dueDay: 11, started: '2024-01' },
    { id: 'b', name: 'B', category: 'Other', amount: 20, dueDay: 12, started: '2024-01' },
    { id: 'c', name: 'C', category: 'Other', amount: 30, dueDay: 15, started: '2024-01' },
    { id: 'd', name: 'D', category: 'Other', amount: 40, dueDay: 20, started: '2024-01' },
    { id: 'e', name: 'E', category: 'Other', amount: 50, dueDay: 22, started: '2024-01' }
  ];
  const page = await open(t, { on: '2026-09-10', data });
  const note = await page.$eval('#view .card .note', e => e.textContent.replace(/\s+/g, ' ').trim());
  // three inside the week (10 + 20 + 30), two later (40 + 50 = 90), 150 altogether
  assert.match(note, /2 more before pay day — £90\.00 of them, £150\.00 altogether/);
});

/* ------------------------------------------------------- chart containment -- */
test('the chart never paints outside its box', skip, async t => {
  // an all-negative run: the zero line used to be computed ~113px above the svg
  // and, with overflow:visible, drifted up the page
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.balance = -611.26;
  data.money.balanceOn = '2026-09-16';
  data.money.buffer = 0;
  data.money.bills = [
    { id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' },
    { id: '2', name: 'B', category: 'Other', amount: 100, dueDay: 23, started: '2024-01' }
  ];
  const page = await open(t, { on: '2026-09-16', data, tab: 'money' });

  const geom = await page.evaluate(() => {
    const svg = document.querySelector('.spark');
    const box = svg.viewBox.baseVal;
    const ys = [...svg.querySelectorAll('line')].flatMap(l => [+l.getAttribute('y1'), +l.getAttribute('y2')]);
    return { h: box.height, ys, overflow: getComputedStyle(svg).overflow,
             svgTop: svg.getBoundingClientRect().top, cardTop: svg.closest('.card').getBoundingClientRect().top };
  });
  for (const y of geom.ys) assert.ok(y >= 0 && y <= geom.h, `guide line at y=${y} is inside 0..${geom.h}`);
  assert.equal(geom.overflow, 'hidden', 'and clipped regardless');
  assert.ok(geom.svgTop > geom.cardTop, 'the chart sits inside its card, not above it');
});

test('the overdraft shows as a floor on the chart and changes what is free', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 0 });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-16', data, tab: 'money' });
  assert.match(await page.$eval('.flowhero .amt', e => e.textContent), /-£731\.76/);
  assert.equal(await page.$$eval('.spark line', e => e.length), 0, 'no guide lines when everything is below zero');

  await page.fill('[data-set="money.overdraft"]', '1200');
  await page.dispatchEvent('[data-set="money.overdraft"]', 'change');
  await page.waitForTimeout(400);
  assert.match(await page.$eval('.flowhero .amt', e => e.textContent), /£468\.24/, 'the overdraft is spendable room');
  assert.match(await page.$eval('.flowhero .muted', e => e.textContent), /using your £1,200 overdraft/);
  assert.match(await page.$eval('.banner', e => e.textContent.replace(/\s+/g, ' ')), /Into your overdraft.*of your £1,200 limit still spare/);
  // £1,200 is a long way below a line that only moves £120, so drawing it would
  // flatten the chart to nothing — the headroom field carries that number instead
  assert.equal(await page.$$eval('.spark line', e => e.length), 0, 'a distant limit is not drawn');
  assert.equal(await page.$eval('[data-set="money.overdraft"]', e => e.value), '1200');

  // bring the limit close and it becomes the line worth watching
  await page.fill('[data-set="money.overdraft"]', '800');
  await page.dispatchEvent('[data-set="money.overdraft"]', 'change');
  await page.waitForTimeout(400);
  assert.equal(await page.$$eval('.spark line', e => e.length), 1, 'the limit is drawn once it is in reach');
  const geom = await page.evaluate(() => {
    const svg = document.querySelector('.spark');
    return { h: svg.viewBox.baseVal.height,
      ys: [...svg.querySelectorAll('line')].flatMap(l => [+l.getAttribute('y1'), +l.getAttribute('y2')]) };
  });
  for (const y of geom.ys) assert.ok(y >= 0 && y <= geom.h, `limit line at y=${y} is inside the box`);
});

test('the AMEX tick moves when the card bites, not whether it is paid', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 1200,
    amex: null, amexBefore: false });
  data.money.bills = [
    { id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' },
    { id: '2', name: 'B', category: 'Other', amount: 100, dueDay: 23, started: '2024-01' }
  ];
  const page = await open(t, { on: '2026-09-16', data, tab: 'money' });
  const rows = () => page.$$eval('.results .r', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  const free = () => page.$eval('.flowhero .amt', e => e.textContent);
  const afterPay = async () => (await rows()).find(r => r.startsWith('Balance after pay'));

  await page.fill('[data-set="money.amex"]', '900');
  await page.dispatchEvent('[data-set="money.amex"]', 'change');
  await page.waitForTimeout(400);
  assert.match(await free(), /£368\.24/, 'unticked: what is free before pay day is untouched');
  assert.ok((await rows()).some(r => /AMEX cleared on pay day.*-£900/.test(r)), 'it is shown coming off on pay day');
  assert.match(await page.$eval('[data-set="money.amex"]', e => e.value), /900/);
  const afterUnticked = await afterPay();

  await page.click('.switch:has(input[data-set="money.amexBefore"])');
  await page.waitForTimeout(400);
  assert.match(await free(), /-£531\.76/, 'ticked: it now eats into what is free');
  assert.equal(await afterPay(), afterUnticked, 'and the card still gets paid — same figure either way');
  assert.ok((await rows()).some(r => /AMEX balance, taken off now.*-£900/.test(r)));
  assert.match(await page.$eval('.banner.bad', e => e.textContent.replace(/\s+/g, ' ')), /Past your overdraft limit/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.amexBefore), true);
});

test('after pay day it prompts, and points at the button rather than guessing', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 1200,
    amex: 900, amexBefore: false, amexUndo: null });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' }];

  const before = await open(t, { on: '2026-09-16', data, tab: 'money' });
  assert.ok((await before.$$eval('.results .r', rs => rs.map(r => r.textContent)))
    .some(r => /AMEX cleared on pay day/.test(r)), 'the projection shows it coming off');

  const after = await open(t, { on: '2026-09-26', data, tab: 'money' });
  assert.match(await after.$$eval('.banner', bs => bs.map(b => b.textContent.replace(/\s+/g, ' ')).join(' | ')),
    /Pay day has been since you typed this.*Paid the card\? Press Pay now under American Express/);
  const m = await after.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money);
  assert.equal(m.amex, 900, 'nothing applied on its own');
  assert.equal(m.balance, -611.26);
  assert.equal(await after.$$eval('[data-act="amexClear"]', e => e.length), 1, 'the button is there to press');
});

test('clearing the card is a button, and it undoes cleanly', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 1200,
    amex: 900, amexBefore: false, amexUndo: null });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-20', data, tab: 'money' });
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money);

  // nothing happens on its own
  let m = await stored();
  assert.equal(m.amex, 900, 'still outstanding');
  assert.equal(m.balance, -611.26, 'balance untouched');
  assert.equal(await page.$$eval('[data-act="amexUndo"]', e => e.length), 0, 'no undo offered yet');

  await page.click('[data-act="amexClear"]');
  await page.waitForTimeout(400);
  m = await stored();
  assert.equal(m.amex, 0, 'card zeroed');
  assert.equal(m.balance, -1511.26, '£900 off the balance');
  assert.equal(m.balanceOn, '2026-09-20', 're-anchored to today');
  assert.ok(m.amexUndo, 'and the snapshot is kept');
  assert.equal(await page.$$eval('[data-act="amexClear"]', e => e.length), 0, 'nothing left to clear');

  await page.click('[data-act="amexUndo"]');
  await page.waitForTimeout(400);
  m = await stored();
  assert.equal(m.amex, 900, 'card balance back');
  assert.equal(m.balance, -611.26, 'balance back');
  assert.equal(m.balanceOn, '2026-09-16', 'and the original anchor date too');
  assert.equal(m.amexUndo, null, 'snapshot spent');
  assert.equal(await page.$$eval('[data-act="amexUndo"]', e => e.length), 0);
});

test('editing a figure by hand retires the undo rather than clobbering it', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 0,
    amex: 900, amexBefore: false, amexUndo: null });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 20, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-20', data, tab: 'money' });
  await page.click('[data-act="amexClear"]');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.amexUndo));

  await page.fill('[data-set="money.balance"]', '-1450');
  await page.dispatchEvent('[data-set="money.balance"]', 'change');
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money);
  assert.equal(m.amexUndo, null, 'undo retired once you type a newer balance');
  assert.equal(m.balance, -1450, 'and your figure stands');
  assert.equal(await page.$$eval('[data-act="amexUndo"]', e => e.length), 0, 'button gone');
});

test('the Pay now button says what it is worth and what it does', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: -611.26, balanceOn: '2026-09-16', buffer: 0, overdraft: 1200,
    amex: 900, amexBefore: false, amexUndo: null });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 120.50, dueDay: 23, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-20', data, tab: 'money' });

  assert.equal(await page.$eval('[data-act="amexClear"]', e => e.textContent.trim()), 'Pay now');
  assert.match(await page.$$eval('.card .note', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ')).join(' | ')),
    /Pay now records that you have paid it — £900\.00 off your balance.*doesn't make the payment/);
  // the dead "when it bites" box is gone; the toggle already says it
  assert.equal(await page.$$eval('#view input[disabled]', es => es.filter(e => /pay day/.test(e.value)).length), 0);
  assert.equal(await page.$$eval('[data-set="money.amexBefore"]', e => e.length), 1, 'the toggle still carries the timing');
});

test('savings pots add, show progress and remove', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.pots = [
    { id: '1', name: 'Emergency fund', balance: 1200, target: 3000, monthly: 150 },
    { id: '2', name: 'Holiday', balance: 800, target: 800, monthly: 0 }
  ];
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const card = async () => (await page.$$eval('#view .card', cs =>
    cs.map(c => c.textContent.replace(/\s+/g, ' ')))).find(c => c.includes('Savings pots'));

  let c = await card();
  assert.match(c, /Put away.*£2,000\.00/, 'totals the pots');
  assert.match(c, /£150\.00 a month going in/, 'only the emergency fund has a monthly going in');
  assert.match(c, /Pots less short-term debt.*£150\.00/, "£2,000 of pots against the sample's £1,850 card");
  assert.match(c, /Emergency fund.*£1,800\.00 to go of £3,000.*there by Sep 2027/);
  assert.match(c, /Holiday.*target of £800 reached/);

  await page.click('[data-act="toggle"][data-key="editPots"]');
  await page.waitForTimeout(250);
  await page.click('[data-act="addPot"]');
  await page.waitForTimeout(300);
  await page.fill('[data-set="money.pots.2.name"]', 'New bike');
  await page.dispatchEvent('[data-set="money.pots.2.name"]', 'change');
  await page.waitForTimeout(250);
  await page.fill('[data-set="money.pots.2.balance"]', '60');
  await page.dispatchEvent('[data-set="money.pots.2.balance"]', 'change');
  await page.waitForTimeout(300);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.pots);
  assert.equal(stored.length, 3);
  assert.equal(stored[2].name, 'New bike');
  assert.equal(stored[2].balance, 60);
  assert.ok(stored[2].id, 'given an id');

  await page.click('[data-act="delPot"][data-i="2"]');
  await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]');
  await page.waitForTimeout(350);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.pots);
  assert.equal(stored.length, 2, 'removed');
  assert.deepEqual(stored.map(p => p.name), ['Emergency fund', 'Holiday']);
});

test('pots stay out of the cash flow', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: 1000, balanceOn: '2026-09-18', buffer: 0, overdraft: 0 });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 100, dueDay: 22, started: '2024-01' }];
  data.money.pots = [];
  const bare = await open(t, { on: '2026-09-18', data, tab: 'money' });
  const freeWithout = await bare.$eval('.flowhero .amt', e => e.textContent);

  data.money.pots = [{ id: '1', name: 'Emergency fund', balance: 5000, target: 6000, monthly: 200 }];
  const withPots = await open(t, { on: '2026-09-18', data, tab: 'money' });
  assert.equal(await withPots.$eval('.flowhero .amt', e => e.textContent), freeWithout,
    'money already set aside is not money to spend before pay day');
});

test('the mortgage can be toggled in and out of the net figure', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.pots = [{ id: 'p1', name: 'Omega Seamaster Watch', balance: 0, target: 5600, monthly: 100 }];
  data.money.debts = [
    { id: 'd1', name: 'Lloyds Credit', type: 'Short-term', balance: 1850, repayment: 120, apr: 0.219 },
    { id: 'd2', name: 'Sofa', type: 'Short-term', balance: 640, repayment: 55, apr: null },
    { id: 'd3', name: 'Mortgage', type: 'Long-term', balance: 197572.08, repayment: 958.41, apr: 0.041 }
  ];
  data.money.netLongTerm = false;
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const card = async () => (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Savings pots'));

  let c = await card();
  assert.match(c, /Pots less short-term debt/, 'labelled for what it actually counts');
  assert.match(c, /£197,572 of long-term debt left out of this/, 'and says what it is leaving out');
  assert.match(c, /-£2,490\.00/, 'a figure that means something');
  assert.ok(!/-£200,062/.test(c), 'the mortgage no longer swamps it');

  await page.click('.switch:has(input[data-set="money.netLongTerm"])');
  await page.waitForTimeout(400);
  c = await card();
  assert.match(c, /Pots less all debt/);
  assert.match(c, /-£200,062\.08/, 'and back again when you ask for it');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.netLongTerm), true);
});

test('with no long-term debt the toggle is not offered', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.pots = [{ id: 'p1', name: 'Holiday', balance: 500, target: 1000, monthly: 50 }];
  data.money.debts = [{ id: 'd1', name: 'Card', type: 'Short-term', balance: 300, repayment: 50, apr: null }];
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  assert.equal(await page.$$eval('[data-set="money.netLongTerm"]', e => e.length), 0, 'nothing to toggle');
  assert.match((await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Savings pots')), /Pots less short-term debt.*£200\.00/);
});

test('Money is split into sections, each a screen or two', skip, async t => {
  const page = await open(t, { tab: 'money' });
  const heads = () => page.$$eval('#view .card h2', es => es.map(e => e.firstChild.textContent.trim()));
  assert.deepEqual(await heads(), ['Left until pay day', 'Disposable by pay period'], 'Now is the default');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(tall < 874 * 4, `Now is ${(tall / 874).toFixed(1)} screens, was 7.7 with everything stacked`);

  await page.click('[data-act="moneyTab"][data-v="bills"]'); await page.waitForTimeout(250);
  assert.deepEqual(await heads(), ['Bills']);
  await page.click('[data-act="moneyTab"][data-v="saving"]'); await page.waitForTimeout(250);
  assert.deepEqual(await heads(), ['Savings pots', 'Debt']);
  await page.click('[data-act="moneyTab"][data-v="history"]'); await page.waitForTimeout(250);
  assert.deepEqual(await heads(), ['By year', 'Month by month']);
  assert.ok(await page.$('#chart'), 'the chart lives in History');

  // Home's shortcut lands on Now whatever section was last open
  await page.click('.tabs button[data-tab="home"]'); await page.waitForTimeout(250);
  await page.click('[data-act="tab"][data-tab="money"][data-sec="now"]'); await page.waitForTimeout(250);
  assert.equal((await heads())[0], 'Left until pay day');
});

test('the gear opens Settings: theme, PIN, backup and what is on the device', skip, async t => {
  const page = await open(t);
  assert.equal(await page.$$eval('#view .card h2', es => es.filter(e => /Settings & backup/.test(e.textContent)).length), 0,
    'Home no longer carries the settings card');
  await page.click('#settingsBtn'); await page.waitForTimeout(250);
  const heads = await page.$$eval('#view .card h2', es => es.map(e => e.firstChild.textContent.trim()));
  assert.deepEqual(heads, ['Appearance', 'PIN lock', 'Backup', 'About']);
  assert.ok(await page.$eval('#settingsBtn', e => e.classList.contains('on')), 'the gear shows it is open');
  assert.equal(await page.$$eval('.tabs button.on', e => e.length), 0, 'no bottom tab is lit');

  await page.click('[data-act="theme"][data-v="light"]'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('decs-stuff-v1:theme')), 'light', 'remembered');
  await page.click('[data-act="theme"][data-v="auto"]'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null, 'auto clears it');

  assert.match(await page.$eval('#view', e => e.textContent), /3 bills · 2 months · 1 debt · 1 house job · 1 card · 1 game/);
  assert.ok(await page.$('[data-act="export"]') && await page.$('[data-act="import"]') && await page.$('[data-act="setPin"]'));
});

test('tabbing between fields survives the redraw', skip, async t => {
  const page = await open(t, { tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(250);
  await page.focus('[data-set="money.bills.0.name"]');
  await page.keyboard.press('End');                       // focus() leaves the caret at 0; a tap would not
  await page.keyboard.type(' (flat)');
  await page.keyboard.press('Tab');                       // blur fires change -> full redraw
  await page.waitForTimeout(350);
  const active = await page.evaluate(() => (document.activeElement && document.activeElement.dataset.set) || document.activeElement.tagName);
  assert.equal(active, 'money.bills.0.category', 'focus carried on to the next field, not dropped on the body');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills[0].name), 'Rent (flat)', 'and the edit landed');
});

test('the chart still draws after an edit in History', skip, async t => {
  const page = await open(t, { tab: 'money', sec: 'history' });
  const drawn = () => page.evaluate(() => { const c = document.getElementById('chart'); return c && c.width > 0 && c.height > 0; });
  assert.ok(await drawn(), 'drawn on first render');
  await page.fill('[data-set="money.months.1.saved"]', '300');
  await page.dispatchEvent('[data-set="money.months.1.saved"]', 'change');
  await page.waitForTimeout(350);
  assert.ok(await drawn(), 'and again after the redraw, from the rows the view handed over');
});

test('the Pay tab keeps its payslip, board, holiday pay and settings', skip, async t => {
  const page = await open(t, { tab: 'pay' });
  const heads = await page.$$eval('#view .card h2', es => es.map(e => e.firstChild.textContent.trim()));
  assert.deepEqual(heads, ['Pay days', 'EU Holiday Pay', 'Payslip settings']);
  assert.equal(await page.$$eval('.step input', e => e.length), 2, 'overtime and Sunday steppers');
  const rows = await page.$$eval('.results .r', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  for (const label of ['Basic pay', 'Overtime pay', 'Taxable pay', 'PAYE', 'National Insurance', 'Net pay', 'Extra from overtime'])
    assert.ok(rows.some(r => r.startsWith(label)), label + ' is still shown');
  assert.ok((await page.$$('.brow')).length >= 10, 'the pay-day board is there');
  assert.equal(await page.isVisible('[data-set="pay.salary"]'), false, 'settings are folded away until opened');
  await page.click('details[data-key="yourpay"] summary'); await page.waitForTimeout(150);
  assert.equal(await page.isVisible('[data-set="pay.salary"]'), true, 'and open on a tap');
  await page.click('[data-act="hstep"][data-kind="ot"][data-d="1"]'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('[data-hours="ot"]', e => e.value), '1', 'logging hours still works');
});

test('Home is a dashboard: attention items, this week, and headline tiles', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: 1000, balanceOn: '2026-09-01', overdraft: 0, amex: 900, amexBefore: false });
  data.money.bills = [
    { id: '1', name: 'Rent', category: 'Housing', amount: 780, dueDay: 1, started: '2024-01' },
    { id: '2', name: 'Council Tax', category: 'Housing', amount: 168, dueDay: 13, started: '2024-01' },
    { id: '3', name: 'Energy', category: 'Utilities', amount: 96, dueDay: 20, started: '2024-01' },
    { id: '4', name: 'Gym', category: 'Health & Fitness', amount: 32, dueDay: null, started: '2024-01' }
  ];
  data.money.pots = [{ id: 'p1', name: 'Holiday', balance: 400, target: 1000, monthly: 100 }];
  const page = await open(t, { on: '2026-09-09', data });   // 16 days to pay day, balance 8 days old
  const heads = await page.$$eval('#view .card h2', es => es.map(e => e.firstChild.textContent.trim()));
  assert.deepEqual(heads, ['Needs a look', 'This week', 'Saving', 'Everything else']);

  const attn = await page.$$eval('.attnrow', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(attn.some(x => /Balance is 8 days old/.test(x)), 'stale balance flagged');
  assert.ok(attn.some(x => /One bill has no payment date/.test(x)), 'undated bill flagged');
  assert.ok(!attn.some(x => /on the card/.test(x)), 'the card is not nagged about 16 days out');

  const week = await page.$$eval('.lrow', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(week.length, 1, 'only Council Tax (Mon 14) falls in the next seven days');
  assert.match(week[0], /Council Tax/);
  assert.match(await page.$eval('#view', e => e.textContent), /1 more before pay day/);

  const tiles = await page.$$eval('.tile .cap', es => es.map(e => e.textContent));
  assert.deepEqual(tiles, ['Safe to spend', 'Next pay day', 'Saved this year', 'Pots less short-term debt']);
  assert.match(await page.$eval('.tiles', e => e.textContent), /in 16 days · Fri 25 Sep/);

  await page.click('.attnrow'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('#title', e => e.textContent), 'Money', 'an attention row opens the section that deals with it');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(tall < 874 * 3, `Money/Now is ${(tall / 874).toFixed(1)} screens`);
});

test('Home stays quiet when nothing needs a look', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: 3000, balanceOn: '2026-09-09', overdraft: 0, amex: null });
  data.money.bills = [{ id: '1', name: 'Rent', category: 'Housing', amount: 780, dueDay: 1, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-09', data });
  const heads = await page.$$eval('#view .card h2', es => es.map(e => e.firstChild.textContent.trim()));
  assert.ok(!heads.includes('Needs a look'), 'no attention card when there is nothing to say');
  assert.match(await page.$eval('#view', e => e.textContent), /Nothing leaves in the next seven days/);
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(tall < 874 * 2.2, `Home is ${(tall / 874).toFixed(1)} screens`);
});

/* ---------- general undo ---------- */
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')));

test('removing a bill can be undone from the toast, and redone', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money', sec: 'bills' });
  assert.ok(await page.$eval('#undoBtn', e => e.hidden), 'nothing to undo at the start');

  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(250);
  await page.click('[data-act="delBill"][data-i="1"]'); await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(350);
  let s = await stored(page);
  assert.deepEqual(s.money.bills.map(b => b.name), ['Rent', 'Energy'], 'Council Tax gone');
  assert.match(await page.$eval('#toast', e => e.textContent), /Removed Council Tax/);
  assert.ok(await page.$eval('#toast', e => e.classList.contains('show') && !!e.querySelector('button[data-act="undo"]')),
    'the toast carries an Undo');
  assert.ok(await page.$eval('#undoBtn', e => !e.hidden), 'and the header shows the arrow');
  assert.equal(await page.$eval('#undoBtn', e => e.getAttribute('aria-label')), 'Undo removing Council Tax');

  await page.click('#toast button[data-act="undo"]'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.deepEqual(s.money.bills, SAMPLE.money.bills, 'the bill is back exactly as it was, in its place');
  assert.match(await page.$eval('#toast', e => e.textContent), /Undone: removing Council Tax/);
  assert.ok(await page.$('#toast button[data-act="redo"]'), 'with a Redo');
  assert.ok(await page.$eval('#undoBtn', e => e.hidden), 'nothing left to undo');
  assert.equal(await page.$$eval('#view .erow', e => e.length), 3, 'the edit list shows all three again');

  await page.click('#toast button[data-act="redo"]'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.deepEqual(s.money.bills.map(b => b.name), ['Rent', 'Energy'], 'redo removes it again');
  assert.ok(await page.$eval('#undoBtn', e => !e.hidden));
});

test('the header arrow walks back through edits, and a new change clears redo', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money' });
  await page.fill('[data-set="money.buffer"]', '450');
  await page.dispatchEvent('[data-set="money.buffer"]', 'change'); await page.waitForTimeout(250);
  await page.fill('[data-set="money.overdraft"]', '500');
  await page.dispatchEvent('[data-set="money.overdraft"]', 'change'); await page.waitForTimeout(250);
  let s = await stored(page);
  assert.equal(s.money.buffer, 450); assert.equal(s.money.overdraft, 500);
  assert.equal(await page.$eval('#undoBtn', e => e.title), 'Undo changing Overdraft limit', 'named after the field');

  await page.click('#undoBtn'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.equal(s.money.overdraft, 0, 'the last edit first');
  assert.equal(s.money.buffer, 450, 'the one before it stays');
  assert.equal(await page.$eval('[data-set="money.overdraft"]', e => e.value), '0', 'the field shows it');
  assert.equal(await page.$eval('#undoBtn', e => e.title), 'Undo changing Buffer to keep back');

  await page.click('#undoBtn'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.equal(s.money.buffer, 300, 'back to the start');
  assert.ok(await page.$eval('#undoBtn', e => e.hidden));

  // redo is there, until something new happens
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(350);
  assert.equal((await stored(page)).money.buffer, 450, 'Ctrl+Shift+Z redoes');
  await page.fill('[data-set="money.buffer"]', '475');
  await page.dispatchEvent('[data-set="money.buffer"]', 'change'); await page.waitForTimeout(250);
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(350);
  assert.equal((await stored(page)).money.buffer, 475, 'a new edit throws the old redo away');
});

test('Ctrl+Z undoes outside a field and is left to the browser inside one', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money', sec: 'saving' });
  await page.click('[data-act="toggle"][data-key="editDebts"]'); await page.waitForTimeout(250);
  await page.click('[data-act="delDebt"][data-i="0"]'); await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(350);
  assert.equal((await stored(page)).money.debts.length, 0, 'debt removed');

  await page.click('[data-act="toggle"][data-key="editPots"]'); await page.waitForTimeout(250);
  await page.click('[data-act="addPot"]'); await page.waitForTimeout(300);
  await page.focus('[data-set="money.pots.0.name"]');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  let s = await stored(page);
  assert.equal(s.money.pots.length, 1, 'inside a text field Ctrl+Z is not the app\'s');
  assert.equal(s.money.debts.length, 0);

  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.equal(s.money.pots.length, 0, 'the added pot goes first');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.equal(s.money.debts.length, 1, 'then the removed debt comes back');
  assert.equal(s.money.debts[0].name, 'Card');
});

test('a reset and a restored backup can both be undone', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)) });
  await page.click('#settingsBtn'); await page.waitForTimeout(250);
  await page.click('[data-act="reset"]'); await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(400);
  let s = await stored(page);
  assert.equal(s.money.bills.length, 0, 'cleared');
  assert.ok(await page.$('#toast button[data-act="undo"]'), 'the reset toast offers Undo');
  await page.click('#toast button[data-act="undo"]'); await page.waitForTimeout(400);
  s = await stored(page);
  assert.equal(s.money.bills.length, 3, 'everything back');
  assert.equal(s.games[0].game, 'DOOM 64');

  const other = JSON.parse(JSON.stringify(SAMPLE));
  other.money.bills = [{ id: '9', name: 'Gym', category: 'Other', amount: 30, dueDay: 5, started: '2024-01' }];
  await page.setInputFiles('#importFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) });
  await page.waitForTimeout(500);
  s = await stored(page);
  assert.deepEqual(s.money.bills.map(b => b.name), ['Gym'], 'restored over the top');
  assert.match(await page.$eval('#toast', e => e.textContent), /Backup restored/);
  await page.click('#toast button[data-act="undo"]'); await page.waitForTimeout(400);
  s = await stored(page);
  assert.deepEqual(s.money.bills.map(b => b.name), ['Rent', 'Council Tax', 'Energy'], 'and the wrong file is undone');
});

test('undo goes back to where the change was made', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'games' });
  await page.click('[data-act="delGame"][data-id="g1"]'); await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(350);
  assert.equal((await stored(page)).games.length, 0);
  await page.click('.tabs button[data-tab="home"]'); await page.waitForTimeout(250);
  assert.equal(await page.$eval('#title', e => e.textContent), "Dec's Tracker", 'on Home');
  await page.click('#undoBtn'); await page.waitForTimeout(350);
  assert.equal((await stored(page)).games.length, 1, 'game back');
  assert.equal(await page.$eval('#title', e => e.textContent), 'Games', 'shown where it came back');
  assert.match(await page.$eval('#view', e => e.textContent), /DOOM 64/);
});

test('the history lives in memory only', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'lists' });
  await page.click('[data-act="tick"]'); await page.waitForTimeout(300);
  assert.equal((await stored(page)).classic[0].have, false, 'unticked');
  assert.ok(await page.$eval('#undoBtn', e => !e.hidden));
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), ['decs-stuff-v1'], 'nothing else is written');
  await page.reload(); await page.waitForSelector('#view .card', { timeout: 5000 });
  assert.ok(await page.$eval('#undoBtn', e => e.hidden), 'a fresh load starts with nothing to undo');
  assert.equal((await stored(page)).classic[0].have, false, 'the change itself was saved');
});

test('a no-op change leaves nothing to undo', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money' });
  await page.fill('[data-set="money.buffer"]', '300');                 // same as before
  await page.dispatchEvent('[data-set="money.buffer"]', 'change'); await page.waitForTimeout(250);
  assert.ok(await page.$eval('#undoBtn', e => e.hidden));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
  assert.equal((await stored(page)).money.buffer, 300);
});

test('the AMEX undo and the general undo agree', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: 1000, balanceOn: '2026-09-09', amex: 250, amexBefore: false, amexUndo: null });
  const page = await open(t, { data, tab: 'money' });
  await page.click('[data-act="amexClear"]'); await page.waitForTimeout(400);
  let m = (await stored(page)).money;
  assert.equal(m.balance, 750); assert.equal(m.amex, 0); assert.ok(m.amexUndo);
  await page.click('#undoBtn'); await page.waitForTimeout(400);
  m = (await stored(page)).money;
  assert.equal(m.balance, 1000, 'general undo reverses Pay now');
  assert.equal(m.amex, 250);
  assert.equal(m.amexUndo, null, 'and the card\'s own undo is not left dangling');
  assert.equal(await page.$$eval('[data-act="amexUndo"]', e => e.length), 0);
});

test('the highlighted pay day lines up with every other row', skip, async t => {
  const page = await open(t, { tab: 'pay' });
  const rows = await page.$$eval('.board .brow', rs => rs.map(r => ({
    next: r.classList.contains('nextpd'),
    left: Math.round(r.getBoundingClientRect().left), right: Math.round(r.getBoundingClientRect().right),
    date: Math.round(r.querySelector('.bl').getBoundingClientRect().left),
    hours: Math.round(r.querySelector('.h').getBoundingClientRect().left),
    amount: Math.round(r.querySelector('.n').getBoundingClientRect().right)
  })));
  assert.ok(rows.length > 3, 'the board has rows');
  const hot = rows.filter(r => r.next);
  assert.equal(hot.length, 1, 'exactly one next pay day');
  const plain = rows.find(r => !r.next);

  // the three columns must start and end in the same place on every row
  rows.forEach(r => {
    assert.equal(r.date, plain.date, 'date column');
    assert.equal(r.hours, plain.hours, 'hours column');
    assert.equal(r.amount, plain.amount, 'amount column');
  });
  // and the highlight bleeds the same distance either side rather than sliding across
  const bleedL = plain.left - hot[0].left, bleedR = hot[0].right - plain.right;
  assert.ok(bleedL > 0, 'the highlight reaches past the row on the left');
  assert.equal(bleedL, bleedR, 'by the same amount on the right');
});
