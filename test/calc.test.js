const { test } = require('node:test');
const assert = require('node:assert');
const { calc } = require('./extract.js');
const C = calc();

/* A payslip's worth of settings, matching the app's own defaults. */
const pay = extra => Object.assign({
  salary: 41200, hoursWeek: 35, weeksYear: 52.1667, sundayRate: 3.7, nextPayDay: '2026-08-28',
  periodEndDays: 6, personalAllowance: 12570, fixed: [], hours: {}, hpaHistory: {}, rises: [],
  tax: { basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45,
    niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02, taxYearStart: '2026-04-06' }
}, extra);

const bills = (...b) => ({ buffer: 0, dueShift: 'next', bankHols: true, months: [], debts: [], bills: b });
const OPT = { shift: 'next', bankHols: true };
const EXACT = { shift: 'exact', bankHols: false };

/* ---------------------------------------------------------------- dates -- */
test('Easter matches the published Gregorian dates', () => {
  assert.equal(C.easter(2024), '2024-03-31');
  assert.equal(C.easter(2025), '2025-04-20');
  assert.equal(C.easter(2026), '2026-04-05');
  assert.equal(C.easter(2027), '2027-03-28');
  assert.equal(C.easter(2030), '2030-04-21');
});

test('bank holidays match gov.uk for England & Wales, substitutes included', () => {
  const set = y => [...C.bankHolidays(y)].sort();
  assert.deepEqual(set(2025),
    ['2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26','2025-08-25','2025-12-25','2025-12-26']);
  // Boxing Day 2026 is a Saturday, so it moves to Monday 28th
  assert.deepEqual(set(2026),
    ['2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28']);
  // Christmas 2027 is a Saturday and Boxing Day a Sunday: 27th and 28th
  assert.deepEqual(set(2027),
    ['2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31','2027-08-30','2027-12-27','2027-12-28']);
  assert.ok(C.bankHolidays(2022).has('2022-01-03'), 'New Year 2022 fell on a Saturday');
});

test('a bill on a non-working day shifts the way the option says', () => {
  assert.equal(C.dow('2026-09-13'), 0, '13 Sep 2026 is a Sunday');
  assert.equal(C.shiftDue('2026-09-13', 'next', true).date, '2026-09-14');
  assert.equal(C.shiftDue('2026-09-13', 'prev', true).date, '2026-09-11');
  assert.equal(C.shiftDue('2026-09-13', 'exact', true).date, '2026-09-13');
  assert.equal(C.shiftDue('2026-09-13', 'next', true).why, 'Sunday');
  assert.equal(C.shiftDue('2026-09-14', 'next', true).moved, false);
  // Christmas 2026: Fri 25th is a holiday, then a weekend, then the substitute Monday
  assert.equal(C.shiftDue('2026-12-25', 'next', true).date, '2026-12-29');
  assert.equal(C.shiftDue('2026-12-25', 'next', false).date, '2026-12-25');
});

/* ------------------------------------------------------------- bill dates -- */
test('a monthly bill falls back to the last day of a short month', () => {
  const b = { name: 'Rent', dueDay: 31, amount: 100 };
  assert.deepEqual(C.billDates(b, '2027-01-01', '2027-04-30', EXACT).map(x => x.date),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(C.billDates({ ...b, dueDay: 29 }, '2028-02-01', '2028-02-29', EXACT).map(x => x.date),
    ['2028-02-29'], 'leap February');
});

test('started and ended months bound a bill', () => {
  const b = { name: 'X', dueDay: 15, amount: 10, started: '2026-03', ended: '2026-05' };
  assert.deepEqual(C.billDates(b, '2026-01-01', '2026-12-31', EXACT).map(x => x.date),
    ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('an undated bill is left out rather than guessed at', () => {
  const m = bills({ id: '1', name: 'Gym', amount: 32, dueDay: null });
  assert.deepEqual(C.billEvents(m, '2026-09-01', '2026-09-30', OPT), []);
  assert.equal(C.moneyCalc(m, '2026-09-09').undated, 1);
});

test('a bill linked to debts follows the debt repayments', () => {
  const m = { buffer: 0, months: [], bills: [{ id: 'l', name: 'Loans', link: 'Short-term', dueDay: 5 }],
    debts: [{ type: 'Short-term', repayment: 80 }, { type: 'Short-term', repayment: 45 }, { type: 'Long-term', repayment: 900 }] };
  assert.deepEqual(C.billEvents(m, '2026-09-01', '2026-09-30', EXACT).map(e => e.amount), [125]);
});

/* ----------------------------------------------------------------- runway -- */
test('runway counts what is left before pay day and what is free to spend', () => {
  const m = Object.assign(bills(
    { id: '1', name: 'Rent', category: 'Housing', amount: 600, dueDay: 1 },
    { id: '2', name: 'Netflix', category: 'Subs', amount: 12, dueDay: 13 },
    { id: '3', name: 'Council', category: 'Housing', amount: 150, dueDay: 20 }
  ), { buffer: 200, balance: 1000, balanceOn: '2026-09-10' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 1800 }] };
  const r = C.runway(m, p, OPT, '2026-09-10');
  assert.deepEqual(r.events.map(e => [e.name, e.date, e.moved]),
    [['Netflix', '2026-09-14', true], ['Council', '2026-09-21', true]], 'Sundays pushed to Monday; the 1st already gone');
  assert.equal(r.outgoings, 162);
  assert.equal(r.atPayday, 838);
  assert.equal(r.safe, 638, 'less the £200 buffer');
  assert.equal(r.days, 15);
  assert.equal(r.afterPay, 2638);
  assert.equal(r.series.length, 16, 'one point per day, inclusive');
  assert.equal(r.shortfall, false);
});

test('runway names the day the balance goes under', () => {
  const m = Object.assign(bills(
    { id: '1', name: 'Netflix', amount: 12, dueDay: 13 },
    { id: '2', name: 'Council', amount: 150, dueDay: 20 }
  ), { buffer: 200, balance: 100, balanceOn: '2026-09-10' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 1800 }] };
  const r = C.runway(m, p, OPT, '2026-09-10');
  assert.equal(r.shortfall, true);
  assert.equal(r.low.bal, -62);
  assert.equal(r.low.date, '2026-09-21');
});

/* --------------------------------------------------------- carry forward -- */
const carryMoney = (balance, balanceOn) => Object.assign(bills(
  { id: '1', name: 'Rent', amount: 780, dueDay: 1 },
  { id: '2', name: 'Council', amount: 168, dueDay: 13 },
  { id: '3', name: 'Energy', amount: 96, dueDay: 20 }
), { buffer: 300, balance, balanceOn });
const runAt = (m, d) => C.runway(m, C.payCalc(pay(), d), OPT, d);

test('the typed balance is carried forward as bills leave', () => {
  const m = carryMoney(1000, '2026-09-09');
  assert.equal(runAt(m, '2026-09-09').start, 1000);
  assert.equal(runAt(m, '2026-09-15').start, 832, 'Council gone');
  assert.equal(runAt(m, '2026-09-22').start, 736, 'Energy gone too');
});

test('a bill is counted once, on the day after it leaves', () => {
  const m = carryMoney(1000, '2026-09-09');
  const on14 = runAt(m, '2026-09-14');           // Council shifts Sun 13 -> Mon 14
  assert.deepEqual(on14.carried.map(e => e.name), [], 'not yet deducted');
  assert.deepEqual(on14.events.map(e => e.name), ['Council', 'Energy'], 'still listed as to come');
  assert.equal(on14.start, 1000);
  const on15 = runAt(m, '2026-09-15');
  assert.deepEqual(on15.carried.map(e => e.name), ['Council']);
  assert.deepEqual(on15.events.map(e => e.name), ['Energy']);
  assert.equal(on15.start, 832);
});

test('the projected pay-day balance holds steady as bills go out', () => {
  const m = carryMoney(1000, '2026-09-09');
  const at = ['2026-09-09', '2026-09-15', '2026-09-22'].map(d => runAt(m, d).atPayday);
  assert.deepEqual(at, [736, 736, 736], 'it used to climb 736 -> 904 -> 1000');
});

test('a pay day inside the carry window is added back', () => {
  const r = runAt(carryMoney(500, '2026-09-20'), '2026-09-28');
  assert.deepEqual(r.carriedPays.map(x => x.payday), ['2026-09-25']);
  assert.equal(r.carriedOut, 96);
  assert.equal(r.start, C.r2(500 - 96 + r.carriedIn));
});

test('retyping the balance restarts the running total from that figure', () => {
  const fresh = runAt(carryMoney(790, '2026-09-15'), '2026-09-15');
  assert.equal(fresh.start, 790);
  assert.equal(fresh.carried.length, 0);
  assert.equal(fresh.wasCarried, false);
  const later = runAt(carryMoney(790, '2026-09-15'), '2026-09-22');
  assert.equal(later.start, 694, '790 less the £96 energy bill, with no input');
});

test('no date recorded means no carry rather than a guess', () => {
  assert.equal(runAt(carryMoney(1000, null), '2026-09-24').wasCarried, false);
  assert.equal(runAt(carryMoney(1000, '2026-09-09'), '2026-09-24').staleDays, 15);
});

test('an overdraft is a legitimate balance', () => {
  const m = Object.assign(bills({ id: '1', name: 'Rent', amount: 780, dueDay: 20 }),
    { buffer: 300, balance: -420.5, balanceOn: '2026-09-08' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 2691.53 }] };
  const r = C.runway(m, p, OPT, '2026-09-08');
  assert.equal(r.hasBal, true);
  assert.equal(r.start, -420.5);
  assert.equal(r.atPayday, -1200.5);
  assert.equal(r.shortfall, true);
  assert.equal(C.gbp(r.safe), '-£1,500.50');
});

/* ---------------------------------------------------- disposable periods -- */
test('4-weekly pay against monthly bills: some periods carry two, some none', () => {
  const p = { nextIdx: 0, nextPayDay: '2026-09-04',
    rows: [{ payday: '2026-09-04', net: 1800 }, { payday: '2026-10-02', net: 1800 }, { payday: '2026-10-30', net: 1800 }] };
  const m = bills({ id: 'r', name: 'Rent', amount: 600, dueDay: 1 });
  const f = C.periodFlows(m, p, EXACT, 2);
  assert.deepEqual(f.map(x => [x.from, x.to, x.events.length, x.disposable]),
    [['2026-09-04', '2026-10-01', 1, 1200], ['2026-10-02', '2026-10-29', 0, 1800]]);
});

test('shifting a bill across a pay day moves it between periods', () => {
  let sun = '2026-10-01';
  while (C.dow(sun) !== 0) sun = C.addDays(sun, 1);
  const payday = C.addDays(sun, 1);
  const p = { nextIdx: 1, nextPayDay: payday, rows: [
    { payday: C.addDays(payday, -28), net: 2000 }, { payday, net: 2000 }, { payday: C.addDays(payday, 28), net: 2000 }] };
  const m = bills({ id: 'x', name: 'Big one', amount: 500, dueDay: +sun.slice(8) });
  assert.equal(C.periodFlows(m, p, { shift: 'exact', bankHols: true }, 1)[0].disposable, 2000, 'exact: sits in the period before');
  assert.equal(C.periodFlows(m, p, { shift: 'next', bankHols: true }, 1)[0].disposable, 1500, 'next: lands on pay day, so in this period');
});

/* -------------------------------------------------------------- pay maths -- */
test('basic pay, hourly rate and the rolling pay-day anchor', () => {
  const p = C.payCalc(pay({ salary: 40000 }), '2026-09-10');
  assert.equal(p.basic, 3067.09, '40000 / 52.1667 * 4');
  assert.equal(p.hourly, 21.91);
  assert.equal(p.nextPayDay, '2026-09-25', 'the stored anchor rolls forward in 28-day steps');
});

test('overtime and Sunday hours reach net pay', () => {
  const p = C.payCalc(pay({ salary: 40000, hours: { '2026-09-25': { ot: 10, sun: 4 } } }), '2026-09-10');
  const r = p.rows.find(x => x.payday === '2026-09-25');
  assert.deepEqual([r.ot, r.sun, r.otPay, r.sunPay], [10, 4, 219.1, 14.8]);
  assert.equal(r.taxable, 3300.99);
  assert.ok(r.net > 2300 && r.net < 2700, `net ${r.net} in a sane band`);
  assert.ok(r.extra > 0 && r.keep > 0.5 && r.keep < 1, 'you keep most, but not all, of the overtime');
});

test('a cleared tax rate cannot silently wipe the tax', () => {
  const base = C.payCalc(pay(), '2026-09-09');
  const good = base.rows[base.nextIdx];
  for (const k of ['basicRate', 'basicBand', 'personalAllowance', 'niMain', 'higherRate']) {
    const y = { from: '2026-04-06', personalAllowance: 12570, basicRate: .2, basicBand: 37700, higherRate: .4,
      higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 };
    y[k] = null;
    const r = C.payCalc(pay({ taxYears: [y] }), '2026-09-09');
    const row = r.rows[r.nextIdx];
    assert.deepEqual([row.paye, row.ni, row.net], [good.paye, good.ni, good.net], `${k} cleared`);
  }
});

test('a blank in a later tax year inherits the earlier one', () => {
  const r = C.payCalc(pay({ taxYears: [
    { from: '2026-04-06', personalAllowance: 13000, basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 },
    { from: '2027-04-06', personalAllowance: null, basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 }] }), '2026-09-09');
  assert.equal(r.years[1].personalAllowance, 13000);
});

test('a pay rise with a backpay date pays the shortfall on that pay day', () => {
  const r = C.payCalc(pay({ salary: 40000,
    rises: [{ from: '2026-05-01', salary: 44000, arrearsOn: '2026-10-23', otBackpay: false }] }), '2026-09-10');
  const rise = r.rises[0];
  assert.ok(rise.periods > 0, 'periods between the effective date and the pay day');
  assert.ok(rise.total > 0, 'a shortfall is owed');
  const target = r.rows.find(x => x.payday === '2026-10-23');
  assert.equal(target.backpay, rise.total, 'and lands on the nominated pay day');
  const before = r.rows.find(x => x.payday === '2026-09-25');
  assert.equal(before.backpay, 0, 'earlier pay days keep their old figures');
});

/* ------------------------------------------------------------ money maths -- */
test('a bill that ended drops out of later months', () => {
  const m = C.moneyCalc({ buffer: 1000, debts: [], bills: [
      { name: 'A', amount: 500, started: '2026-01' },
      { name: 'B', amount: 250, started: '2026-01', ended: '2026-06' }],
    months: [{ month: '2026-05', earnings: 2000, saved: 300 }, { month: '2026-08', earnings: 2000, saved: 100 }] }, '2026-09-10');
  assert.deepEqual(m.months.map(x => x.outgoings), [750, 500]);
  assert.deepEqual(m.months.map(x => x.disposable), [1250, 1500]);
  assert.deepEqual(m.months.map(x => x.potential), [250, 500], 'after the buffer');
});

test('debt payoff, with and without interest', () => {
  assert.deepEqual(C.debtPayoff({ balance: 1000, repayment: 20, apr: 0.24 }, '2026-09-09'), { never: true },
    'a repayment equal to the interest never clears');
  const withApr = C.debtPayoff({ balance: 1000, repayment: 21, apr: 0.24 }, '2026-09-09');
  assert.ok(withApr.months > 100 && !withApr.naive);
  const noApr = C.debtPayoff({ balance: 1000, repayment: 100 }, '2026-09-09');
  assert.deepEqual([noApr.months, noApr.naive], [10, true]);
});

test('formatting', () => {
  assert.equal(C.gbp(1234.5), '£1,234.50');
  assert.equal(C.gbp(-1234.5), '-£1,234.50');
  assert.equal(C.gbp(null), '–');
  assert.equal(C.gbp(1234.5, 0), '£1,235');
  assert.equal(C.pct(0.5), '50%');
  assert.equal(C.fmtD('2026-09-09'), '9 Sep 2026');
  assert.equal(C.ord(1), '1st');
  assert.equal(C.ord(2), '2nd');
  assert.equal(C.ord(3), '3rd');
  assert.equal(C.ord(11), '11th');
  assert.equal(C.ord(21), '21st');
  assert.equal(C.ord(31), '31st');
});

/* ---------------------------------------------------------- price history -- */
test('a bill kept as history chains back into a price trajectory', () => {
  const h = C.priceHistory([
    { name: 'Octopus Energy', category: 'Utilities', amount: 82, started: '2025-01', ended: '2025-09' },
    { name: 'Octopus Energy', category: 'Utilities', amount: 96, started: '2025-10', ended: '2026-02' },
    { name: 'Octopus Energy', category: 'Utilities', amount: 110, started: '2026-03' },
    { name: 'Rent', category: 'Housing', amount: 780, started: '2024-01' }
  ]);
  assert.equal(h.length, 1, 'Rent never changed, so it is not listed');
  assert.equal(h[0].name, 'Octopus Energy');
  assert.equal(h[0].first, 82);
  assert.equal(h[0].current, 110);
  assert.equal(h[0].total, 28);
  assert.deepEqual(h[0].changes.map(c => [c.month, c.diff]), [['2025-10', 14], ['2026-03', 14]]);
  assert.equal(h[0].last.month, '2026-03');
});

test('price history ignores what it cannot read a price from', () => {
  assert.deepEqual(C.priceHistory([
    { name: 'Loans', link: 'Short-term', started: '2025-01' },
    { name: 'Loans', link: 'Short-term', started: '2026-01' }
  ]), [], 'linked bills follow the debts, not a price');
  assert.deepEqual(C.priceHistory([
    { name: 'Gym', amount: 30, started: '2025-01', ended: '2025-06' },
    { name: 'Gym', amount: 30, started: '2025-07' }
  ]), [], 'same amount twice is not a change');
  assert.deepEqual(C.priceHistory([{ name: 'Rent', amount: 780, started: '2024-01' }]), [], 'one row is no history');
  assert.deepEqual(C.priceHistory([{ name: '', amount: 10, started: '2025-01' }, { name: '', amount: 12, started: '2025-02' }]), [],
    'unnamed rows are not chained together');
});

test('a price drop is reported as a drop', () => {
  const h = C.priceHistory([
    { name: 'Car insurance', amount: 74, started: '2025-01', ended: '2025-12' },
    { name: 'Car insurance', amount: 62, started: '2026-01' }
  ]);
  assert.equal(h[0].total, -12);
  assert.ok(h[0].last.pct < 0);
});
