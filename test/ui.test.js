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

async function open(t, { on = '2026-09-09', data = SAMPLE, tab = null } = {}) {
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
  await page.click('#themeBtn'); await page.click('#themeBtn');   // auto -> light -> dark
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
  const page = await open(t, { data, tab: 'money' });
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
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money' });
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
  const page = await open(t, { data, tab: 'money' });
  await page.click('[data-act="toggle"][data-key="editBills"]');
  await page.waitForTimeout(250);
  await page.fill('[data-set="money.bills.3.amount"]', '12');
  await page.dispatchEvent('[data-set="money.bills.3.amount"]', 'change');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('dlg').open), false, 'nothing to keep — started this month');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('decs-stuff-v1')).money.bills[3].amount), 12);
});

test('a repeated change event cannot split the same bill twice', skip, async t => {
  const page = await open(t, { data: JSON.parse(JSON.stringify(SAMPLE)), tab: 'money' });
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
    { id: 'd', name: 'D', category: 'Other', amount: 40, dueDay: 16, started: '2024-01' },
    { id: 'e', name: 'E', category: 'Other', amount: 50, dueDay: 17, started: '2024-01' }
  ];
  const page = await open(t, { on: '2026-09-10', data });
  const note = await page.$eval('#view .card .note', e => e.textContent.replace(/\s+/g, ' ').trim());
  // three shown (10 + 20 + 30), two not (40 + 50 = 90), 150 altogether
  assert.match(note, /\+ 2 more before pay day — £90\.00 of them, £150\.00 altogether/);
});
