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
  version: 2, name: 'Dec', backupOn: '2026-09-08',
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

test('one pot, a list of what it is for, and picking one off when you get it', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.savings = { balance: 2000, monthly: 150, goals: [
    { id: 'g1', name: 'Omega Seamaster', cost: 5600, got: null, paid: null },
    { id: 'g2', name: 'Holiday', cost: 800, got: null, paid: null } ] };
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const card = async name => (await page.$$eval('#view .card', cs =>
    cs.map(c => c.textContent.replace(/\s+/g, ' ')))).find(c => c.includes(name));
  const sav = () => stored(page).then(s => s.money.savings);

  let pot = await card('Savings pot');
  assert.match(pot, /£2,000\.00/, 'one balance, not several');
  assert.match(pot, /the list comes to £6,400/);
  assert.match(pot, /Savings less short-term debt.*£150\.00/, "£2,000 against the sample's £1,850 card");

  let list = await card('Saving for');
  assert.match(list, /Everything on the list.*£6,400\.00/);
  assert.match(list, /Still to save.*£4,400\.00/);
  assert.match(list, /Holiday.*you have enough for this/, 'the £800 holiday is covered by the one pot');
  assert.match(list, /Omega Seamaster.*£3,600\.00 short/, 'and the watch is not');
  assert.match(list, /1 you can get now/);

  // add something to the list
  await page.click('[data-act="addGoal"]'); await page.waitForTimeout(300);
  await page.fill('[data-set="money.savings.goals.2.name"]', 'New bike');
  await page.dispatchEvent('[data-set="money.savings.goals.2.name"]', 'change'); await page.waitForTimeout(250);
  await page.fill('[data-set="money.savings.goals.2.cost"]', '900');
  await page.dispatchEvent('[data-set="money.savings.goals.2.cost"]', 'change'); await page.waitForTimeout(300);
  let sv = await sav();
  assert.equal(sv.goals.length, 3);
  assert.deepEqual([sv.goals[2].name, sv.goals[2].cost, sv.goals[2].got], ['New bike', 900, null]);
  await page.click('[data-act="toggle"][data-key="editGoals"]'); await page.waitForTimeout(300);
  assert.match(await card('Saving for'), /Everything on the list.*£7,300\.00/);

  // got the holiday: what you paid comes out of the one pot
  await page.click('[data-act="goalGot"][data-id="g2"]'); await page.waitForTimeout(300);
  assert.match(await page.$eval('#dlgForm', e => e.textContent), /Got Holiday\?/);
  assert.equal(await page.$eval('#dlgIn', e => e.value), '800', 'prefilled with the price');
  await page.fill('#dlgIn', '760');                               // it came in cheaper
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(400);
  sv = await sav();
  assert.equal(sv.balance, 1240, '£760 out of the pot, not the listed £800');
  assert.deepEqual([sv.goals[1].got, sv.goals[1].paid], ['2026-09-18', 760]);
  list = await card('Saving for');
  assert.doesNotMatch(list, /Holiday.*short/, 'it is off the list');
  assert.match(list, /Already got \(1\).*£760/);
  assert.match(list, /Everything on the list.*£6,500\.00/, 'and out of the total');

  await page.click('#undoBtn'); await page.waitForTimeout(400);
  sv = await sav();
  assert.equal(sv.balance, 2000, 'undo puts the money back');
  assert.equal(sv.goals[1].got, null, 'and the thing back on the list');
});

test('money moves in and out of the one pot', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.savings = { balance: 800, monthly: null, goals: [] };
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const sav = () => stored(page).then(s => s.money.savings);

  await page.click('[data-act="savMove"][data-d="1"]'); await page.waitForTimeout(300);
  assert.match(await page.$eval('#dlgForm', e => e.textContent), /Add to savings/);
  assert.match(await page.$eval('#dlgForm', e => e.textContent), /£800\.00 in the pot now/);
  await page.fill('#dlgIn', '150');
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(350);
  assert.equal((await sav()).balance, 950, 'the amount is added, not set');
  assert.match(await page.$eval('#toast', e => e.textContent), /£150\.00 into savings/);

  await page.click('[data-act="savMove"][data-d="-1"]'); await page.waitForTimeout(300);
  await page.fill('#dlgIn', '5000');
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(350);
  assert.equal((await sav()).balance, 0, 'emptied rather than sent negative');
  assert.match(await page.$eval('#toast', e => e.textContent), /£950\.00 out of savings, now empty/);

  await page.click('#undoBtn'); await page.waitForTimeout(400);
  assert.equal((await sav()).balance, 950);

  await page.click('[data-act="savMove"][data-d="1"]'); await page.waitForTimeout(300);
  await page.click('#dlgForm button[value="ok"]'); await page.waitForTimeout(300);   // nothing typed
  assert.equal((await sav()).balance, 950, 'a blank amount changes nothing');
  assert.match(await page.$eval('#toast', e => e.textContent), /Type an amount/);
});

test('old separate pots are folded into the one pot and its list', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  delete data.money.savings;
  data.money.pots = [                                             // the shape the app used to store
    { id: '1', name: 'Emergency fund', balance: 1200, target: 3000, monthly: 150 },
    { id: '2', name: 'Holiday', balance: 800, target: 800, monthly: 0 },
    { id: '3', name: 'Rainy day', balance: 430, target: null, monthly: 25 }
  ];
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const s = await stored(page);
  assert.equal(s.money.savings.balance, 2430, 'the balances add up into one pot');
  assert.equal(s.money.savings.monthly, 175, 'and so does what goes in each month');
  assert.deepEqual(s.money.savings.goals.map(g => [g.name, g.cost]),
    [['Emergency fund', 3000], ['Holiday', 800], ['Rainy day', 430]],
    'each old pot becomes a thing being saved for, priced at its target');
  assert.equal(s.money.pots, undefined, 'and the old shape is gone');
  assert.match(await page.$eval('#view', e => e.textContent), /£2,430\.00/);
});

test('savings stay out of the cash flow', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  Object.assign(data.money, { balance: 1000, balanceOn: '2026-09-18', buffer: 0, overdraft: 0 });
  data.money.bills = [{ id: '1', name: 'A', category: 'Other', amount: 100, dueDay: 22, started: '2024-01' }];
  data.money.savings = { balance: null, monthly: null, goals: [] };
  const bare = await open(t, { on: '2026-09-18', data, tab: 'money' });
  const freeWithout = await bare.$eval('.flowhero .amt', e => e.textContent);

  data.money.savings = { balance: 5000, monthly: 200, goals: [{ id: '1', name: 'Emergency fund', cost: 6000 }] };
  const withPot = await open(t, { on: '2026-09-18', data, tab: 'money' });
  assert.equal(await withPot.$eval('.flowhero .amt', e => e.textContent), freeWithout,
    'money already set aside is not money to spend before pay day');
});

test('the mortgage can be toggled in and out of the net figure', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.savings = { balance: 0, monthly: 100, goals: [{ id: 'g1', name: 'Omega Seamaster Watch', cost: 5600 }] };
  data.money.debts = [
    { id: 'd1', name: 'Lloyds Credit', type: 'Short-term', balance: 1850, repayment: 120, apr: 0.219 },
    { id: 'd2', name: 'Sofa', type: 'Short-term', balance: 640, repayment: 55, apr: null },
    { id: 'd3', name: 'Mortgage', type: 'Long-term', balance: 197572.08, repayment: 958.41, apr: 0.041 }
  ];
  data.money.netLongTerm = false;
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  const card = async () => (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Savings pot'));

  let c = await card();
  assert.match(c, /Savings less short-term debt/, 'labelled for what it actually counts');
  assert.match(c, /£197,572 of long-term debt left out of this/, 'and says what it is leaving out');
  assert.match(c, /-£2,490\.00/, 'a figure that means something');
  assert.ok(!/-£200,062/.test(c), 'the mortgage no longer swamps it');

  await page.click('.switch:has(input[data-set="money.netLongTerm"])');
  await page.waitForTimeout(400);
  c = await card();
  assert.match(c, /Savings less all debt/);
  assert.match(c, /-£200,062\.08/, 'and back again when you ask for it');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.netLongTerm), true);
});

test('with no long-term debt the toggle is not offered', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.savings = { balance: 500, monthly: 50, goals: [{ id: 'g1', name: 'Holiday', cost: 1000 }] };
  data.money.debts = [{ id: 'd1', name: 'Card', type: 'Short-term', balance: 300, repayment: 50, apr: null }];
  const page = await open(t, { on: '2026-09-18', data, tab: 'money', sec: 'saving' });
  assert.equal(await page.$$eval('[data-set="money.netLongTerm"]', e => e.length), 0, 'nothing to toggle');
  assert.match((await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Savings pot')), /Savings less short-term debt.*£200\.00/);
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
  assert.deepEqual(await heads(), ['Savings pot', 'Saving for', 'Debt']);
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
  data.money.savings = { balance: 400, monthly: 100, goals: [{ id: 'p1', name: 'Holiday', cost: 1000 }] };
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
  assert.deepEqual(tiles, ['Safe to spend', 'Next pay day', 'Saved this year', 'Savings less short-term debt']);
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
  const before = await stored(page).then(x => x.money.bills);      // as the app holds them, defaults filled in
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
  assert.deepEqual(s.money.bills, before, 'the bill is back exactly as it was, in its place');
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

  await page.click('[data-act="addGoal"]'); await page.waitForTimeout(300);
  await page.focus('[data-set="money.savings.goals.0.name"]');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  let s = await stored(page);
  assert.equal(s.money.savings.goals.length, 1, 'inside a text field Ctrl+Z is not the app\'s');
  assert.equal(s.money.debts.length, 0);

  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
  s = await stored(page);
  assert.equal(s.money.savings.goals.length, 0, 'the added thing goes first');
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

/* ---------- spending, backups, durable storage ---------- */
test('retyping the balance works out what was actually spent', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [];                                   // keep the arithmetic plain
  Object.assign(data.money, { balance: 1200, balanceOn: '2026-09-02', buffer: 0,
    balanceLog: [{ on: '2026-09-02', balance: 1200, adj: 0 }] });
  const page = await open(t, { on: '2026-09-09', data, tab: 'money' });
  const card = async () => (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Day-to-day spending'));
  assert.match(await card(), /retype the balance/i, 'one reading is not enough to compare');

  await page.fill('[data-set="money.balance"]', '850');
  await page.dispatchEvent('[data-set="money.balance"]', 'change');
  await page.waitForTimeout(350);
  let log = await stored(page).then(s => s.money.balanceLog);
  assert.equal(log.length, 2, 'the reading is logged');
  assert.deepEqual(log[1], { on: '2026-09-09', balance: 850, adj: 0 });
  let c = await card();
  assert.match(c, /£350\.00/, '£1,200 down to £850 with no bills in between');
  assert.match(c, /£50\.00 a day/, 'over the seven days');

  // correcting it an hour later replaces the reading rather than inventing a window
  await page.fill('[data-set="money.balance"]', '900');
  await page.dispatchEvent('[data-set="money.balance"]', 'change');
  await page.waitForTimeout(350);
  log = await stored(page).then(s => s.money.balanceLog);
  assert.equal(log.length, 2, 'still two readings');
  assert.equal(log[1].balance, 900);
  assert.match(await card(), /£300\.00/, 'and the figure follows the correction');
});

test('clearing the card is not counted as a day of spending', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [];
  Object.assign(data.money, { balance: 1200, balanceOn: '2026-09-02', buffer: 0, amex: 300, amexBefore: false,
    balanceLog: [{ on: '2026-09-02', balance: 1200, adj: 0 }] });
  const page = await open(t, { on: '2026-09-09', data, tab: 'money' });
  await page.click('[data-act="amexClear"]');
  await page.waitForTimeout(400);
  let m = await stored(page).then(s => s.money);
  assert.equal(m.balance, 900, 'the card came off the balance');
  assert.deepEqual(m.balanceLog[1], { on: '2026-09-09', balance: 900, adj: -300 }, 'logged with what the app took off');
  const card = (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Day-to-day spending'));
  assert.match(card, /£0\.00 spent/, 'the £300 is explained, so nothing reads as spending');

  await page.click('[data-act="amexUndo"]');
  await page.waitForTimeout(400);
  m = await stored(page).then(s => s.money);
  assert.equal(m.balance, 1200);
  assert.equal(m.balanceLog.length, 1, 'the undo takes the reading back out too');
});

test('Home asks for a backup, and downloading one dates it', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.backupOn = null;
  const page = await open(t, { on: '2026-09-09', data });
  page.on('download', d => d.delete().catch(() => { }));
  assert.match(await page.$eval('#view', e => e.textContent), /No backup yet/);

  await page.click('.attnrow:has-text("No backup yet")');
  await page.waitForTimeout(300);
  assert.equal(await page.$eval('#title', e => e.textContent), 'Settings', 'the row opens the place that deals with it');
  assert.match(await page.$eval('#view', e => e.textContent), /You haven't downloaded one yet/);

  await page.click('[data-act="export"]');
  await page.waitForTimeout(500);
  assert.equal(await stored(page).then(s => s.backupOn), '2026-09-09', 'dated');
  assert.match(await page.$eval('#view', e => e.textContent), /Last backup.*today/);
  assert.ok(await page.$eval('#undoBtn', e => e.hidden), 'downloading a backup is not an edit to undo');

  await page.click('.tabs button[data-tab="home"]');
  await page.waitForTimeout(250);
  assert.doesNotMatch(await page.$eval('#view', e => e.textContent), /No backup yet/, 'and the nudge goes');
});

test('a stale backup is nudged, a recent one is not', skip, async t => {
  const old = JSON.parse(JSON.stringify(SAMPLE));
  old.backupOn = '2026-07-01';
  let page = await open(t, { on: '2026-09-09', data: old });
  assert.match(await page.$eval('#view', e => e.textContent), /Last backup was 70 days ago/);

  const fresh = JSON.parse(JSON.stringify(SAMPLE));
  fresh.backupOn = '2026-08-25';
  page = await open(t, { on: '2026-09-09', data: fresh });
  assert.doesNotMatch(await page.$eval('#view', e => e.textContent), /Last backup was/, '15 days is not worth a nag');
});

test('the app asks the browser to keep the data', skip, async t => {
  const page = await open(t, { tab: null });
  const asked = await page.evaluate(() => typeof navigator.storage?.persist === 'function');
  await page.click('#settingsBtn');
  await page.waitForTimeout(400);
  const about = (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('About'));
  assert.match(about, /Storage/, 'Settings says where the data stands');
  if (asked) assert.match(about, /permanent|may clear this/, 'and what the browser said');
});




test('Home shows the next thing you are saving for, and no buttons', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.savings = { balance: 2000, monthly: 150, goals: [
    { id: 'g1', name: 'Omega Seamaster', cost: 5600, got: null, paid: null },
    { id: 'g2', name: 'Holiday', cost: 800, got: null, paid: null } ] };
  const page = await open(t, { on: '2026-09-18', data });
  const card = (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Saving'));
  assert.match(card, /£2,000 in the pot/);
  assert.match(card, /Omega Seamaster/, 'the next one out of reach, not one already covered');
  assert.doesNotMatch(card, /Holiday/);
  assert.equal(await page.$$eval('[data-act="goalGot"], [data-act="savMove"]', e => e.length), 0,
    'the dashboard is for reading');
  await page.click('[data-act="tab"][data-tab="money"][data-sec="saving"]');
  await page.waitForTimeout(300);
  assert.ok(await page.$('[data-act="goalGot"]'), 'the buttons live where the savings do');
});

test('a bill can be paused for the months it is not paid', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [{ id: '1', name: 'Council Tax', category: 'Housing', amount: 168, dueDay: 13, started: '2024-01' }];
  const page = await open(t, { on: '2026-09-09', data, tab: 'money', sec: 'bills' });
  const bill = () => stored(page).then(s => s.money.bills[0]);
  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(250);
  assert.equal(await page.$$eval('.months button', bs => bs.length), 12, 'all twelve months are offered');
  assert.equal(await page.$$eval('.months button.off', bs => bs.length), 0, 'none off to start with');

  await page.click('[data-act="billSkip"][data-i="0"][data-m="2"]'); await page.waitForTimeout(300);
  await page.click('[data-act="billSkip"][data-i="0"][data-m="3"]'); await page.waitForTimeout(300);
  assert.deepEqual((await bill()).skip, [2, 3]);
  assert.deepEqual(await page.$$eval('.months button.off', bs => bs.map(b => b.textContent)), ['Feb', 'Mar']);
  assert.equal(await page.$eval('.months button[data-m="2"]', b => b.getAttribute('aria-pressed')), 'false');

  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(300);
  const card = (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Council Tax'));
  assert.match(card, /10 months a year/);
  assert.match(card, /£1,680 a year/, 'ten payments, not twelve');

  // and it is genuinely out of the cash flow in the months it is not paid
  const year = await page.evaluate(() => {
    const b = S.money.bills[0], opt = { shift: S.money.dueShift, bankHols: !!S.money.bankHols };
    return C.MON.map((n, k) => C.billDates(b, `2027-${String(k + 1).padStart(2, '0')}-01`,
      `2027-${String(k + 1).padStart(2, '0')}-28`, opt).length);
  });
  assert.deepEqual(year, [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'no payment falls in February or March');

  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(250);
  await page.click('[data-act="billSkip"][data-i="0"][data-m="2"]'); await page.waitForTimeout(300);
  assert.deepEqual((await bill()).skip, [3], 'tapping it again turns it back on');
  await page.click('#undoBtn'); await page.waitForTimeout(350);
  assert.deepEqual((await bill()).skip, [2, 3], 'and undo covers it');
});

test('a debt balance is typed once and carries itself forward', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [{ id: 'b1', name: 'Credit cards', category: 'Debt', amount: null, dueDay: 5, started: '2024-01', link: 'Short-term' }];
  data.money.debts = [{ id: 'd1', name: 'Lloyds', type: 'Short-term', balance: 1850, repayment: 200, apr: 0.219, balanceOn: null }];
  const page = await open(t, { on: '2026-06-05', data, tab: 'money', sec: 'saving' });
  const card = async () => (await page.$$eval('#view .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' '))))
    .find(c => c.includes('Total owed'));
  assert.match(await card(), /Lloyds.*£1,850\.00/, 'no date yet, so it is taken as read');

  // retyping the balance stamps the day it was true
  await page.click('[data-act="toggle"][data-key="editDebts"]'); await page.waitForTimeout(250);
  await page.fill('[data-set="money.debts.0.balance"]', '1850');
  await page.dispatchEvent('[data-set="money.debts.0.balance"]', 'change'); await page.waitForTimeout(350);
  assert.equal(await stored(page).then(s => s.money.debts[0].balanceOn), '2026-06-05');

  // three months on, three £200 payments have gone and interest has been added
  const later = await open(t, { on: '2026-09-19', data: await stored(page), tab: 'money', sec: 'saving' });
  const c = (await later.$$eval('#view .card', cs => cs.map(x => x.textContent.replace(/\s+/g, ' '))))
    .find(x => x.includes('Total owed'));
  assert.match(c, /£1,342\.13/, '£600 paid, £92.13 of interest');
  assert.match(c, /£1,850 on 05 Jun · 3 paid/, 'with the figure you typed kept underneath');
  assert.match(c, /Total owed.*£1,342\.13/, 'and the total follows it');
  assert.equal(await later.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.debts[0].balance), 1850,
    'the typed figure itself is never quietly rewritten');
});

test('a bill that changes price once a year asks to be checked', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [{ id: '1', name: 'Council Tax', category: 'Housing', amount: 168, dueDay: 13,
    started: '2024-01', skip: [2, 3], review: 4, reviewedOn: null }];
  const page = await open(t, { on: '2027-04-02', data });
  const bill = () => stored(page).then(s => s.money.bills[0]);
  assert.match(await page.$eval('#view', e => e.textContent), /Council Tax changes in Apr/);
  assert.match(await page.$eval('#view', e => e.textContent), /still down as £168\.00/);

  await page.click('.attnrow:has-text("Council Tax changes in Apr")'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('#title', e => e.textContent), 'Money');
  assert.match(await page.$eval('#view', e => e.textContent), /Check what it has gone to/);

  // saying it has not moved settles it for the year
  await page.click('[data-act="billChecked"][data-id="1"]'); await page.waitForTimeout(350);
  assert.equal((await bill()).reviewedOn, '2027-04');
  assert.doesNotMatch(await page.$eval('#view', e => e.textContent), /Check what it has gone to/, 'and the nudge goes');
  await page.click('.tabs button[data-tab="home"]'); await page.waitForTimeout(250);
  assert.doesNotMatch(await page.$eval('#view', e => e.textContent), /changes in Apr/);

  await page.click('#undoBtn'); await page.waitForTimeout(350);
  assert.equal((await bill()).reviewedOn, null, 'undo puts the question back');
});

test('typing the new price answers the yearly check on its own', skip, async t => {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.money.bills = [{ id: '1', name: 'Council Tax', category: 'Housing', amount: 168, dueDay: 13,
    started: '2024-01', review: 4, reviewedOn: null }];
  const page = await open(t, { on: '2027-04-02', data, tab: 'money', sec: 'bills' });
  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(250);
  assert.equal(await page.$eval('[data-set="money.bills.0.review"]', e => e.value), '4', 'the month is on the bill');

  await page.fill('[data-set="money.bills.0.amount"]', '176');
  await page.dispatchEvent('[data-set="money.bills.0.amount"]', 'change'); await page.waitForTimeout(350);
  await page.click('#dlgForm button[value="ok"]');                  // keep the old price in the history
  await page.waitForTimeout(400);
  // fill() fires change and so does the dispatch, so a second prompt can queue up
  while (await page.$eval('#dlg', e => e.open)) {
    await page.click('#dlgForm button[value="cancel"]'); await page.waitForTimeout(300);
  }
  const bills = await stored(page).then(s => s.money.bills);
  assert.equal(bills[0].reviewedOn, '2027-04', 'a new price is an answer');
  assert.equal(bills[1].amount, 176, 'and the history still splits the old price off');
  await page.click('[data-act="toggle"][data-key="editBills"]'); await page.waitForTimeout(300);
  assert.doesNotMatch(await page.$eval('#view', e => e.textContent), /Check what it has gone to/);
});
